#!/bin/bash
set -e

#====================================================================
# NetGuard ISP Ticketing System - Debian/Ubuntu Deployment Script
# Version: 7 (Single Container - App + PostgreSQL in one Docker)
# Run as root on Debian/Ubuntu with Docker already installed
#====================================================================

DEPLOY_VERSION="7"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE_BOLD='\033[1;37m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

TOTAL_STEPS=8
CHECKLIST_RESULTS=()

step_start() {
    local step_num=$1
    local step_name=$2
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE_BOLD}  STEP ${step_num}/${TOTAL_STEPS}: ${step_name}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

step_done() {
    local step_num=$1
    local step_name=$2
    CHECKLIST_RESULTS+=("${GREEN}[PASS]${NC} Step ${step_num}: ${step_name}")
    echo -e "${GREEN}>>> STEP ${step_num} COMPLETE: ${step_name}${NC}"
}

step_fail() {
    local step_num=$1
    local step_name=$2
    CHECKLIST_RESULTS+=("${RED}[FAIL]${NC} Step ${step_num}: ${step_name}")
    echo -e "${RED}>>> STEP ${step_num} FAILED: ${step_name}${NC}"
}

print_checklist() {
    echo ""
    echo -e "${WHITE_BOLD}=============================================="
    echo -e "  DEPLOYMENT CHECKLIST SUMMARY (v${DEPLOY_VERSION})"
    echo -e "==============================================${NC}"
    for result in "${CHECKLIST_RESULTS[@]}"; do
        echo -e "  $result"
    done
    echo -e "${WHITE_BOLD}==============================================${NC}"
    echo ""
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

#====================================================================
# CONFIGURATION
#====================================================================
DOMAIN="${DOMAIN:-tickets.yourdomain.com}"
APP_NAME="${APP_NAME:-netguard}"
APP_PORT="${APP_PORT:-3100}"
DB_NAME="netguard_db"
DB_USER="m4xnetPlus"
DB_PASS='m4xnetPlus2026#!'
SSL_EMAIL="${SSL_EMAIL:-admin@yourdomain.com}"
INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"

if [ -f "${INSTALL_DIR}/.credentials" ]; then
    log_info "Loading existing session secret from ${INSTALL_DIR}/.credentials"
    eval "$(grep -E '^SESSION_SECRET=' "${INSTALL_DIR}/.credentials")"
fi
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
PGDATA_VOLUME="${PGDATA_VOLUME:-netguard_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"

echo ""
echo "=============================================="
echo "  NetGuard ISP - Deployment Script"
echo "  Version: ${DEPLOY_VERSION} (Single Container)"
echo "=============================================="
echo ""
log_info "Domain:        $DOMAIN"
log_info "App Port:      $APP_PORT"
log_info "DB User:       $DB_USER"
log_info "Install Dir:   $INSTALL_DIR"
echo ""

#====================================================================
# STEP 1: Stop existing containers
#====================================================================
step_start 1 "Stop existing NetGuard containers"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qw "$APP_CONTAINER"; then
    log_info "Stopping container '${APP_CONTAINER}'..."
    docker stop "$APP_CONTAINER" 2>/dev/null || true
    docker rm -f "$APP_CONTAINER" 2>/dev/null || true
    log_ok "Container stopped and removed"
elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qw "$APP_CONTAINER"; then
    log_info "Removing stopped container '${APP_CONTAINER}'..."
    docker rm -f "$APP_CONTAINER" 2>/dev/null || true
    log_ok "Container removed"
else
    log_ok "No existing container found — fresh install"
fi

# Also clean up old separate postgres container if it exists from previous deploy versions
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qw "netguard_postgres"; then
    log_info "Removing old separate PostgreSQL container (no longer needed)..."
    docker stop "netguard_postgres" 2>/dev/null || true
    docker rm -f "netguard_postgres" 2>/dev/null || true
    log_ok "Old PostgreSQL container removed"
fi

step_done 1 "Stop existing NetGuard containers"

#====================================================================
# STEP 2: Port scanning
#====================================================================
step_start 2 "Port scanning & auto-assignment"

get_all_used_ports() {
    local used_ports=""
    local sys_ports=$(ss -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -oP ':\K[0-9]+$' | sort -un)
    if [ -n "$sys_ports" ]; then
        used_ports="$sys_ports"
    fi
    if command -v docker &>/dev/null; then
        local docker_ports=$(docker ps --format '{{.Ports}}' 2>/dev/null \
            | tr ',' '\n' \
            | grep -oP ':\K[0-9]+(?=->)' \
            | sort -un)
        if [ -n "$docker_ports" ]; then
            used_ports=$(printf '%s\n%s' "$used_ports" "$docker_ports" | sort -un)
        fi
    fi
    echo "$used_ports"
}

is_port_free() {
    local port=$1
    local used_ports="$2"
    if echo "$used_ports" | grep -qw "$port"; then
        return 1
    fi
    return 0
}

find_free_port() {
    local start=$1
    local used_ports="$2"
    local port=$start
    while ! is_port_free "$port" "$used_ports"; do
        port=$((port + 1))
        if [ "$port" -gt 65535 ]; then
            log_err "No free port found starting from $start"
            exit 1
        fi
    done
    echo "$port"
}

used_ports=$(get_all_used_ports)
if ! is_port_free "$APP_PORT" "$used_ports"; then
    old_port=$APP_PORT
    APP_PORT=$(find_free_port "$APP_PORT" "$used_ports")
    log_warn "Port ${old_port} is in use -> auto-assigned APP_PORT=${APP_PORT}"
else
    log_ok "APP_PORT ${APP_PORT} is free"
fi

log_ok "Final port -> APP: ${APP_PORT}"

step_done 2 "Port scanning & auto-assignment"

#====================================================================
# STEP 3: Install Nginx
#====================================================================
step_start 3 "Install Nginx"

if command -v nginx &>/dev/null; then
    log_ok "Nginx is already installed ($(nginx -v 2>&1 | awk -F/ '{print $2}'))"
else
    log_info "Installing Nginx..."
    apt-get update -qq
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    log_ok "Nginx installed and started"
fi

step_done 3 "Install Nginx"

#====================================================================
# STEP 4: Install Certbot
#====================================================================
step_start 4 "Install Certbot"

if command -v certbot &>/dev/null; then
    log_ok "Certbot is already installed"
else
    log_info "Installing Certbot..."
    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx
    log_ok "Certbot installed"
fi

step_done 4 "Install Certbot"

#====================================================================
# STEP 5: Build Docker image (single container: app + PostgreSQL)
#====================================================================
step_start 5 "Build Docker image (app + database)"

log_info "Copying project files to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"
cp "$SCRIPT_DIR/entrypoint.sh" "$INSTALL_DIR/deploy/entrypoint.sh"

cd "$INSTALL_DIR"

cat > .dockerignore <<DOCKERIGNORE
node_modules
.git
dist
uploads
.env
*.log
DOCKERIGNORE

log_info "Building Docker image '${APP_NAME}' (includes PostgreSQL + app)..."
docker build -t "$APP_NAME" . 2>&1 | tail -20

log_ok "Docker image built"
step_done 5 "Build Docker image (app + database)"

#====================================================================
# STEP 6: Start container
#====================================================================
step_start 6 "Start NetGuard container"

if ! docker volume inspect "$PGDATA_VOLUME" &>/dev/null; then
    docker volume create "$PGDATA_VOLUME"
    log_ok "Created PostgreSQL data volume"
fi

if ! docker volume inspect "$UPLOADS_VOLUME" &>/dev/null; then
    docker volume create "$UPLOADS_VOLUME"
    log_ok "Created uploads volume"
fi

log_info "Saving credentials..."
mkdir -p "$INSTALL_DIR"
cat > "${INSTALL_DIR}/.credentials" <<CREDS
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
SESSION_SECRET=${SESSION_SECRET}
CREDS
chmod 600 "${INSTALL_DIR}/.credentials"
log_ok "Credentials saved to ${INSTALL_DIR}/.credentials"

log_info "Starting container..."

docker run -d \
    --name "$APP_CONTAINER" \
    --restart unless-stopped \
    -e DB_USER="$DB_USER" \
    -e DB_NAME="$DB_NAME" \
    -e DB_PASS="$DB_PASS" \
    -e SESSION_SECRET="$SESSION_SECRET" \
    -e NODE_ENV=production \
    -e TZ=Asia/Jakarta \
    -p "127.0.0.1:${APP_PORT}:3000" \
    -v "${PGDATA_VOLUME}:/var/lib/postgresql/data" \
    -v "${UPLOADS_VOLUME}:/app/uploads" \
    "$APP_NAME"

log_info "Waiting for container to start..."
sleep 5

if docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
    log_ok "Container is running"
else
    log_err "Container failed to start!"
    docker logs "$APP_CONTAINER" --tail 30
    exit 1
fi

# Wait for PostgreSQL + schema + app to be ready
log_info "Waiting for database initialization and app startup..."
retries=0
while [ $retries -lt 60 ]; do
    if docker logs "$APP_CONTAINER" 2>&1 | grep -q "Schema push complete\|listening on\|server started"; then
        break
    fi
    retries=$((retries + 1))
    sleep 2
done

if [ $retries -ge 60 ]; then
    log_warn "App may still be starting. Check logs: docker logs ${APP_CONTAINER}"
else
    log_ok "App is ready"
fi

# Show database status from container logs
echo ""
log_info "Container startup log:"
docker logs "$APP_CONTAINER" 2>&1 | grep -E "^\[" | head -20
echo ""

step_done 6 "Start NetGuard container"

#====================================================================
# STEP 7: Nginx configuration
#====================================================================
step_start 7 "Nginx configuration"

avail_file="/etc/nginx/sites-available/${APP_NAME}"
enabled_link="/etc/nginx/sites-enabled/${APP_NAME}"

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

if [ -f "$avail_file" ]; then
    log_ok "Nginx config for '${APP_NAME}' already exists"
    log_info "Updating proxy port to ${APP_PORT}..."
    sed -i "s|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:${APP_PORT};|g" "$avail_file"
else
    log_info "Creating Nginx configuration..."

    mkdir -p /etc/nginx/ssl
    if [ ! -f "/etc/nginx/ssl/${APP_NAME}_self.crt" ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "/etc/nginx/ssl/${APP_NAME}_self.key" \
            -out "/etc/nginx/ssl/${APP_NAME}_self.crt" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
        log_ok "Self-signed SSL certificate created"
    fi

    cat > "$avail_file" <<NGINX_CONF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
        allow all;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/nginx/ssl/${APP_NAME}_self.crt;
    ssl_certificate_key /etc/nginx/ssl/${APP_NAME}_self.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINX_CONF

    log_ok "Nginx config created"
fi

if [ ! -L "$enabled_link" ]; then
    ln -sf "$avail_file" "$enabled_link"
fi

rm -f /etc/nginx/sites-enabled/default

nginx -t 2>&1
systemctl reload nginx
log_ok "Nginx configured and reloaded"

step_done 7 "Nginx configuration"

#====================================================================
# STEP 8: SSL + Firewall
#====================================================================
step_start 8 "SSL certificate & firewall"

# SSL
if echo "$DOMAIN" | grep -qE '(yourdomain\.com|localhost|\.local$)'; then
    log_warn "Domain '${DOMAIN}' looks like a placeholder — skipping Let's Encrypt"
    log_info "Using self-signed certificate instead"
    if [ ! -f "/etc/nginx/ssl/${APP_NAME}_self.crt" ]; then
        mkdir -p /etc/nginx/ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "/etc/nginx/ssl/${APP_NAME}_self.key" \
            -out "/etc/nginx/ssl/${APP_NAME}_self.crt" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
    fi
else
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect || {
        log_warn "SSL certificate request failed. Using self-signed cert."
        log_warn "Fix DNS and run: certbot --nginx -d ${DOMAIN}"
    }

    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
        log_ok "Auto-renewal cron job added"
    fi
fi

# Firewall
if command -v ufw &>/dev/null; then
    ufw_status=$(ufw status 2>/dev/null | head -1)
    if echo "$ufw_status" | grep -qi "active"; then
        log_info "Configuring UFW firewall..."
        ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
        log_ok "UFW firewall configured for HTTP/HTTPS"
    else
        log_info "UFW is installed but inactive, skipping"
    fi
elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
    log_info "Configuring firewalld..."
    firewall-cmd --permanent --add-service=http 2>/dev/null || true
    firewall-cmd --permanent --add-service=https 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    log_ok "Firewall configured"
else
    log_info "No active firewall detected, skipping"
fi

step_done 8 "SSL certificate & firewall"

#====================================================================
# DONE
#====================================================================

print_checklist

echo "=============================================="
echo -e "  ${GREEN}Deployment Complete! (v${DEPLOY_VERSION})${NC}"
echo "=============================================="
echo ""
echo "  App URL:      https://${DOMAIN}"
echo "  App Port:     ${APP_PORT} (internal)"
echo "  Install Dir:  ${INSTALL_DIR}"
echo "  DB User:      ${DB_USER}"
echo "  DB Name:      ${DB_NAME}"
echo ""
echo "  Single container: ${APP_CONTAINER}"
echo "    (includes both PostgreSQL and the app)"
echo ""
echo "  Useful commands:"
echo "    App logs:   docker logs ${APP_CONTAINER} -f"
echo "    App shell:  docker exec -it ${APP_CONTAINER} sh"
echo "    Restart:    docker restart ${APP_CONTAINER}"
echo "    DB Shell:   docker exec -it ${APP_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"
echo "    Nginx:      nginx -t && systemctl reload nginx"
echo ""
echo "  Credentials: ${INSTALL_DIR}/.credentials (root-only, chmod 600)"
echo ""
echo "  To update the app later, run:"
echo "    cd ${PROJECT_DIR} && ./deploy/update.sh"
echo ""

cat > "${INSTALL_DIR}/.deploy-info" <<INFO
DEPLOY_VERSION=${DEPLOY_VERSION}
DOMAIN=${DOMAIN}
APP_NAME=${APP_NAME}
APP_PORT=${APP_PORT}
APP_CONTAINER=${APP_CONTAINER}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
PGDATA_VOLUME=${PGDATA_VOLUME}
UPLOADS_VOLUME=${UPLOADS_VOLUME}
INSTALL_DIR=${INSTALL_DIR}
DEPLOYED_AT="$(date +'%Y-%m-%d %H:%M:%S %Z')"
INFO
chmod 600 "${INSTALL_DIR}/.deploy-info"
