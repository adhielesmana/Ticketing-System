#!/bin/bash
set -e

#====================================================================
# NetGuard ISP Ticketing System - Debian/Ubuntu Deployment Script
# Run as root on Debian/Ubuntu with Docker already installed
# Both the app and PostgreSQL run inside Docker containers
#====================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

#====================================================================
# CONFIGURATION - Edit these or pass as environment variables
#====================================================================
DOMAIN="${DOMAIN:-tickets.yourdomain.com}"
APP_NAME="${APP_NAME:-netguard}"
APP_PORT="${APP_PORT:-3100}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-netguard_db}"
DB_USER="${DB_USER:-netguard}"
SSL_EMAIL="${SSL_EMAIL:-admin@yourdomain.com}"
INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"

if [ -f "${INSTALL_DIR}/.credentials" ]; then
    log_info "Loading existing credentials from ${INSTALL_DIR}/.credentials"
    eval "$(grep -E '^(DB_PASS|SESSION_SECRET)=' "${INSTALL_DIR}/.credentials")"
fi
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
DOCKER_NETWORK="${DOCKER_NETWORK:-netguard_net}"
APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-netguard_postgres}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-netguard_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"

echo ""
echo "=============================================="
echo "  NetGuard ISP - Deployment Script"
echo "=============================================="
echo ""
log_info "Domain:        $DOMAIN"
log_info "App Port:      $APP_PORT"
log_info "DB Port:       $DB_PORT"
log_info "Install Dir:   $INSTALL_DIR"
echo ""

#====================================================================
# 1. COLLECT ALL USED PORTS & AUTO-ASSIGN FREE PORTS
#====================================================================
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

resolve_ports() {
    log_info "Scanning all running ports (system + Docker containers)..."

    local used_ports
    used_ports=$(get_all_used_ports)
    local port_count=$(echo "$used_ports" | grep -c '[0-9]' 2>/dev/null || echo "0")
    log_info "Found ${port_count} ports currently in use"

    if command -v docker &>/dev/null; then
        local running=$(docker ps --format 'table {{.Names}}\t{{.Ports}}' 2>/dev/null | tail -n +2)
        if [ -n "$running" ]; then
            log_info "Running Docker containers:"
            echo "$running" | while read -r line; do
                echo "         $line"
            done
        fi
    fi

    local own_app_running=0
    local own_db_running=0
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qw "$POSTGRES_CONTAINER"; then
        own_db_running=1
    fi
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qw "$APP_CONTAINER"; then
        own_app_running=1
    fi

    if ! is_port_free "$APP_PORT" "$used_ports" && [ "$own_app_running" -eq 0 ]; then
        local old_port=$APP_PORT
        APP_PORT=$(find_free_port "$APP_PORT" "$used_ports")
        log_warn "Port ${old_port} is in use -> auto-assigned APP_PORT=${APP_PORT}"
        used_ports=$(printf '%s\n%s' "$used_ports" "$APP_PORT" | sort -un)
    elif ! is_port_free "$APP_PORT" "$used_ports" && [ "$own_app_running" -eq 1 ]; then
        log_ok "Port ${APP_PORT} is used by our own app container (OK)"
    else
        log_ok "APP_PORT ${APP_PORT} is free"
    fi

    if ! is_port_free "$DB_PORT" "$used_ports" && [ "$own_db_running" -eq 0 ]; then
        local old_port=$DB_PORT
        DB_PORT=$(find_free_port "$DB_PORT" "$used_ports")
        log_warn "Port ${old_port} is in use -> auto-assigned DB_PORT=${DB_PORT}"
    elif ! is_port_free "$DB_PORT" "$used_ports" && [ "$own_db_running" -eq 1 ]; then
        log_ok "Port ${DB_PORT} is used by our own DB container (OK)"
    else
        log_ok "DB_PORT ${DB_PORT} is free"
    fi

    log_ok "Final ports -> APP: ${APP_PORT}, DB: ${DB_PORT}"
}

resolve_ports

#====================================================================
# 2. INSTALL NGINX (if not present)
#====================================================================
install_nginx() {
    if command -v nginx &>/dev/null; then
        log_ok "Nginx is already installed ($(nginx -v 2>&1 | awk -F/ '{print $2}'))"
        return 0
    fi

    log_info "Installing Nginx..."

    apt-get update -qq
    apt-get install -y nginx

    systemctl enable nginx
    systemctl start nginx
    log_ok "Nginx installed and started"
}

install_nginx

#====================================================================
# 3. INSTALL CERTBOT FOR SSL (if not present)
#====================================================================
install_certbot() {
    if command -v certbot &>/dev/null; then
        log_ok "Certbot is already installed"
        return 0
    fi

    log_info "Installing Certbot..."

    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx

    log_ok "Certbot installed"
}

install_certbot

#====================================================================
# 4. DOCKER NETWORK
#====================================================================
setup_docker_network() {
    if docker network inspect "$DOCKER_NETWORK" &>/dev/null; then
        log_ok "Docker network '$DOCKER_NETWORK' exists"
    else
        log_info "Creating Docker network '$DOCKER_NETWORK'..."
        docker network create "$DOCKER_NETWORK"
        log_ok "Docker network created"
    fi
}

setup_docker_network

#====================================================================
# 5. POSTGRESQL IN DOCKER
#====================================================================
wait_for_pg() {
    log_info "Waiting for PostgreSQL to be ready..."
    local retries=0
    until docker exec "$POSTGRES_CONTAINER" pg_isready -U "$DB_USER" &>/dev/null; do
        retries=$((retries + 1))
        if [ "$retries" -ge 30 ]; then
            log_err "PostgreSQL failed to start within 30 seconds"
            exit 1
        fi
        sleep 1
    done
}

test_pg_auth() {
    docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
        psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
        -c "SELECT 1;" &>/dev/null
    return $?
}

destroy_pg() {
    log_warn "Removing existing PostgreSQL container and data volume..."

    docker stop "$APP_CONTAINER" 2>/dev/null || true
    docker rm -f "$APP_CONTAINER" 2>/dev/null || true

    docker stop "$POSTGRES_CONTAINER" 2>/dev/null || true
    sleep 3
    docker rm -f "$POSTGRES_CONTAINER" 2>/dev/null || true
    sleep 2

    local vol_retries=0
    while docker volume inspect "$POSTGRES_VOLUME" &>/dev/null; do
        docker volume rm -f "$POSTGRES_VOLUME" 2>/dev/null || true
        vol_retries=$((vol_retries + 1))
        if [ "$vol_retries" -ge 10 ]; then
            log_err "Cannot remove volume $POSTGRES_VOLUME after 10 attempts"
            log_err "Check: docker ps -a --filter volume=$POSTGRES_VOLUME"
            exit 1
        fi
        sleep 2
    done
    log_ok "Volume $POSTGRES_VOLUME confirmed removed"

    rm -f "${INSTALL_DIR}/.credentials" 2>/dev/null || true
    rm -f "${INSTALL_DIR}/.env" 2>/dev/null || true

    DB_PASS="$(openssl rand -hex 16)"

    log_ok "Old containers and data removed, new credentials generated"
}

create_pg_container() {
    docker volume create "$POSTGRES_VOLUME" 2>/dev/null || true

    docker run -d \
        --name "$POSTGRES_CONTAINER" \
        --network "$DOCKER_NETWORK" \
        --restart unless-stopped \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASS" \
        -p "127.0.0.1:${DB_PORT}:5432" \
        -v "${POSTGRES_VOLUME}:/var/lib/postgresql/data" \
        postgres:16-alpine

    wait_for_pg
    log_ok "PostgreSQL container created and ready"
}

save_credentials() {
    mkdir -p "$INSTALL_DIR"
    cat > "${INSTALL_DIR}/.credentials" <<CREDS
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
SESSION_SECRET=${SESSION_SECRET}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${POSTGRES_CONTAINER}:5432/${DB_NAME}
CREDS
    chmod 600 "${INSTALL_DIR}/.credentials"
    log_ok "Credentials saved to ${INSTALL_DIR}/.credentials (chmod 600)"
}

setup_postgres() {
    local need_create=0

    if docker ps --format '{{.Names}}' | grep -qw "$POSTGRES_CONTAINER"; then
        log_info "PostgreSQL container '$POSTGRES_CONTAINER' is running, testing auth..."
        wait_for_pg
        if test_pg_auth; then
            log_ok "PostgreSQL auth and database OK"
        else
            log_warn "Auth or database check failed — will recreate"
            destroy_pg
            need_create=1
        fi
    elif docker ps -a --format '{{.Names}}' | grep -qw "$POSTGRES_CONTAINER"; then
        log_info "Starting existing PostgreSQL container..."
        docker start "$POSTGRES_CONTAINER"
        wait_for_pg
        if test_pg_auth; then
            log_ok "PostgreSQL auth and database OK"
        else
            log_warn "Auth or database check failed — will recreate"
            destroy_pg
            need_create=1
        fi
    else
        need_create=1
    fi

    if [ "$need_create" -eq 1 ]; then
        if docker volume inspect "$POSTGRES_VOLUME" &>/dev/null; then
            log_warn "Stale volume found, force-removing..."
            local stale_containers
            stale_containers=$(docker ps -a --filter "volume=$POSTGRES_VOLUME" --format '{{.Names}}' 2>/dev/null || true)
            if [ -n "$stale_containers" ]; then
                log_warn "Removing containers holding the volume: $stale_containers"
                echo "$stale_containers" | xargs -r docker rm -f 2>/dev/null || true
                sleep 2
            fi
            docker volume rm -f "$POSTGRES_VOLUME" 2>/dev/null || true
            if docker volume inspect "$POSTGRES_VOLUME" &>/dev/null; then
                log_err "Cannot remove stale volume $POSTGRES_VOLUME"
                exit 1
            fi
        fi

        log_info "Creating fresh PostgreSQL container..."
        create_pg_container

        wait_for_pg
        if ! test_pg_auth; then
            log_err "PostgreSQL auth still failing after fresh create."
            log_err "DB_USER=$DB_USER DB_NAME=$DB_NAME"
            docker logs "$POSTGRES_CONTAINER" --tail 10
            exit 1
        fi
        log_ok "Fresh PostgreSQL verified — auth and database OK"
    fi

    save_credentials
}

setup_postgres

#====================================================================
# 6. COPY SOURCE & BUILD APP DOCKER IMAGE
#====================================================================
build_app() {
    log_info "Copying project files to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"

    cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
    rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"

    cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"

    cd "$INSTALL_DIR"

    cat > .dockerignore <<DOCKERIGNORE
node_modules
.git
dist
deploy
uploads
.env
*.log
DOCKERIGNORE

    log_info "Building Docker image '${APP_NAME}'..."
    docker build -t "$APP_NAME" . 2>&1 | tail -20

    log_ok "Docker image built"
}

build_app

#====================================================================
# 7. RUN APP CONTAINER
#====================================================================
run_app_container() {
    if docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
        log_info "Stopping existing app container..."
        docker stop "$APP_CONTAINER" 2>/dev/null || true
        docker rm "$APP_CONTAINER" 2>/dev/null || true
    elif docker ps -a --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
        docker rm "$APP_CONTAINER" 2>/dev/null || true
    fi

    log_info "Final pre-flight: verifying PostgreSQL credentials before starting app..."
    if ! test_pg_auth; then
        log_err "FATAL: DB credentials do not match the running PostgreSQL."
        log_err "DB_USER=$DB_USER DB_NAME=$DB_NAME"
        log_err "This should not happen. The deploy script has a bug."
        exit 1
    fi
    log_ok "Pre-flight auth check passed"

    log_info "Writing environment file with verified credentials..."
    cat > "${INSTALL_DIR}/.env" <<ENVFILE
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${POSTGRES_CONTAINER}:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=3000
ENVFILE
    chmod 600 "${INSTALL_DIR}/.env"
    log_ok "Environment file written (chmod 600)"

    if ! docker volume inspect "$UPLOADS_VOLUME" &>/dev/null; then
        docker volume create "$UPLOADS_VOLUME"
    fi

    log_info "Starting app container..."

    docker run -d \
        --name "$APP_CONTAINER" \
        --network "$DOCKER_NETWORK" \
        --restart unless-stopped \
        --env-file "${INSTALL_DIR}/.env" \
        -p "127.0.0.1:${APP_PORT}:3000" \
        -v "${UPLOADS_VOLUME}:/app/uploads" \
        "$APP_NAME"

    sleep 3
    if docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
        log_ok "App container started on port ${APP_PORT}"
    else
        log_err "App container failed to start. Check: docker logs ${APP_CONTAINER}"
        docker logs "$APP_CONTAINER" --tail 20
        exit 1
    fi

    log_info "Pushing database schema..."
    docker exec "$APP_CONTAINER" npx drizzle-kit push --force 2>&1 | tail -5
    log_ok "Database schema updated"
}

run_app_container

#====================================================================
# 8. NGINX CONFIGURATION
#====================================================================
configure_nginx() {
    local avail_file="/etc/nginx/sites-available/${APP_NAME}"
    local enabled_link="/etc/nginx/sites-enabled/${APP_NAME}"

    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

    if [ -f "$avail_file" ]; then
        log_ok "Nginx config for '${APP_NAME}' already exists"
        log_info "Updating proxy port to ${APP_PORT}..."
        sed -i "s|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:${APP_PORT};|g" "$avail_file"
    else
        log_info "Creating Nginx configuration..."

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
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    client_max_body_size 20M;

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

        log_ok "Nginx config created at $avail_file"
    fi

    if [ ! -L "$enabled_link" ]; then
        ln -sf "$avail_file" "$enabled_link"
        log_ok "Symlinked to sites-enabled"
    fi

    if [ -f /etc/nginx/sites-enabled/default ]; then
        rm -f /etc/nginx/sites-enabled/default
        log_info "Removed default nginx site"
    fi

    mkdir -p /var/lib/letsencrypt

    nginx -t 2>&1 || {
        log_warn "Nginx config test failed, generating temporary self-signed cert..."
        mkdir -p /etc/nginx/ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "/etc/nginx/ssl/${APP_NAME}_self.key" \
            -out "/etc/nginx/ssl/${APP_NAME}_self.crt" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
        nginx -t 2>&1 || { log_err "Nginx config still invalid"; exit 1; }
    }

    systemctl reload nginx
    log_ok "Nginx configured and reloaded"
}

configure_nginx

#====================================================================
# 9. SSL CERTIFICATE (Let's Encrypt)
#====================================================================
setup_ssl() {
    if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
        log_ok "SSL certificate for '${DOMAIN}' already exists"
        log_info "Checking certificate renewal..."
        certbot renew --dry-run 2>/dev/null && log_ok "Certificate renewal check passed" || log_warn "Renewal dry-run had issues"
        return 0
    fi

    log_info "Obtaining SSL certificate for ${DOMAIN}..."

    if ! host "$DOMAIN" &>/dev/null && ! dig +short "$DOMAIN" 2>/dev/null | grep -q '.'; then
        log_warn "Domain '${DOMAIN}' does not resolve to this server."
        log_warn "SSL certificate request may fail. Make sure DNS is pointed to this server first."
        log_warn "Using self-signed certificate for now. Run this script again after DNS is configured."

        mkdir -p /etc/nginx/ssl
        if [ ! -f "/etc/nginx/ssl/${APP_NAME}_self.crt" ]; then
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "/etc/nginx/ssl/${APP_NAME}_self.key" \
                -out "/etc/nginx/ssl/${APP_NAME}_self.crt" \
                -subj "/CN=${DOMAIN}" 2>/dev/null
        fi
        return 0
    fi

    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect

    if [ $? -eq 0 ]; then
        log_ok "SSL certificate obtained and configured"

        if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
            (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
            log_ok "Auto-renewal cron job added"
        fi
    else
        log_warn "SSL certificate request failed. The app will work with self-signed cert."
        log_warn "Fix DNS and run: certbot --nginx -d ${DOMAIN}"
    fi
}

setup_ssl

#====================================================================
# 10. FIREWALL
#====================================================================
configure_firewall() {
    if command -v ufw &>/dev/null; then
        local ufw_status=$(ufw status 2>/dev/null | head -1)
        if echo "$ufw_status" | grep -qi "active"; then
            log_info "Configuring UFW firewall..."
            ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
            log_ok "UFW firewall configured for HTTP/HTTPS"
        else
            log_info "UFW is installed but inactive, skipping firewall config"
        fi
    elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
        log_info "Configuring firewalld..."
        firewall-cmd --permanent --add-service=http 2>/dev/null || true
        firewall-cmd --permanent --add-service=https 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        log_ok "Firewall configured for HTTP/HTTPS"
    else
        log_info "No active firewall detected, skipping firewall config"
    fi
}

configure_firewall

#====================================================================
# DONE
#====================================================================
echo ""
echo "=============================================="
echo -e "  ${GREEN}Deployment Complete!${NC}"
echo "=============================================="
echo ""
echo "  App URL:      https://${DOMAIN}"
echo "  App Port:     ${APP_PORT} (internal)"
echo "  DB Port:      ${DB_PORT} (localhost only)"
echo "  Install Dir:  ${INSTALL_DIR}"
echo ""
echo "  Docker containers:"
echo "    App:  ${APP_CONTAINER}"
echo "    DB:   ${POSTGRES_CONTAINER}"
echo ""
echo "  Useful commands:"
echo "    App logs:   docker logs ${APP_CONTAINER} -f"
echo "    App shell:  docker exec -it ${APP_CONTAINER} sh"
echo "    Restart:    docker restart ${APP_CONTAINER}"
echo "    DB Shell:   docker exec -it ${POSTGRES_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"
echo "    Nginx:      nginx -t && systemctl reload nginx"
echo ""
echo "  Credentials saved to: ${INSTALL_DIR}/.credentials (root-only, chmod 600)"
echo "  Environment file:     ${INSTALL_DIR}/.env (root-only, chmod 600)"
echo ""
echo "  To update the app later, run:"
echo "    cd ${PROJECT_DIR} && ./deploy/update.sh"
echo ""

cat > "/etc/netguard-deploy-info" <<INFO2
INSTALL_DIR=${INSTALL_DIR}
APP_NAME=${APP_NAME}
APP_CONTAINER=${APP_CONTAINER}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER}
DOCKER_NETWORK=${DOCKER_NETWORK}
UPLOADS_VOLUME=${UPLOADS_VOLUME}
APP_PORT=${APP_PORT}
DB_PORT=${DB_PORT}
INFO2
chmod 600 /etc/netguard-deploy-info

cat > "${INSTALL_DIR}/.deploy-info" <<INFO
DOMAIN=${DOMAIN}
APP_NAME=${APP_NAME}
APP_PORT=${APP_PORT}
APP_CONTAINER=${APP_CONTAINER}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER}
DOCKER_NETWORK=${DOCKER_NETWORK}
UPLOADS_VOLUME=${UPLOADS_VOLUME}
INSTALL_DIR=${INSTALL_DIR}
DEPLOYED_AT="$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
INFO
chmod 600 "${INSTALL_DIR}/.deploy-info"
