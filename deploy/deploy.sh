#!/bin/bash
set -e

#====================================================================
# NetGuard ISP Ticketing System - CentOS Deployment Script
# Run as root on CentOS 7/8/9 with Docker already installed
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
# CONFIGURATION - Edit these before running
#====================================================================
DOMAIN="${DOMAIN:-tickets.yourdomain.com}"
APP_NAME="${APP_NAME:-netguard}"
APP_PORT="${APP_PORT:-3100}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-netguard_db}"
DB_USER="${DB_USER:-netguard}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
SSL_EMAIL="${SSL_EMAIL:-admin@yourdomain.com}"
INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"
DOCKER_NETWORK="${DOCKER_NETWORK:-netguard_net}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-netguard_postgres}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-netguard_pgdata}"

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
# 1. PORT CONFLICT DETECTION
#====================================================================
detect_port_conflicts() {
    log_info "Checking for port conflicts..."

    local conflict=0

    if ss -tlnp 2>/dev/null | grep -q ":${APP_PORT} " ; then
        local pid_info=$(ss -tlnp | grep ":${APP_PORT} " | awk '{print $NF}')
        log_err "Port ${APP_PORT} is already in use by: ${pid_info}"
        conflict=1
    fi

    if ss -tlnp 2>/dev/null | grep -q ":${DB_PORT} " ; then
        local pid_info=$(ss -tlnp | grep ":${DB_PORT} " | awk '{print $NF}')
        log_err "Port ${DB_PORT} is already in use by: ${pid_info}"
        conflict=1
    fi

    local docker_ports=""
    if command -v docker &>/dev/null; then
        docker_ports=$(docker ps --format '{{.Ports}}' 2>/dev/null | tr ',' '\n' | grep -oP '0\.0\.0\.0:\K[0-9]+' | sort -u)
        if echo "$docker_ports" | grep -qw "$APP_PORT"; then
            local container=$(docker ps --filter "publish=${APP_PORT}" --format '{{.Names}}' 2>/dev/null)
            if [ "$container" != "$APP_NAME" ]; then
                log_err "Port ${APP_PORT} is used by Docker container: ${container}"
                conflict=1
            fi
        fi
        if echo "$docker_ports" | grep -qw "$DB_PORT"; then
            local container=$(docker ps --filter "publish=${DB_PORT}" --format '{{.Names}}' 2>/dev/null)
            if [ "$container" != "$POSTGRES_CONTAINER" ]; then
                log_err "Port ${DB_PORT} is used by Docker container: ${container}"
                conflict=1
            fi
        fi
    fi

    if [ "$conflict" -eq 1 ]; then
        echo ""
        log_err "Port conflicts detected. Options:"
        log_err "  1. Stop the conflicting service/container"
        log_err "  2. Change ports: APP_PORT=3200 DB_PORT=5434 ./deploy.sh"
        echo ""
        if [ -n "$docker_ports" ]; then
            log_info "Currently used Docker ports:"
            docker ps --format 'table {{.Names}}\t{{.Ports}}' 2>/dev/null
        fi
        exit 1
    fi

    log_ok "No port conflicts detected"
}

detect_port_conflicts

#====================================================================
# 2. INSTALL NGINX (if not present)
#====================================================================
install_nginx() {
    if command -v nginx &>/dev/null; then
        log_ok "Nginx is already installed ($(nginx -v 2>&1 | awk -F/ '{print $2}'))"
        return 0
    fi

    log_info "Installing Nginx..."

    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            centos|rhel|rocky|alma)
                if [ "${VERSION_ID%%.*}" -ge 8 ]; then
                    dnf install -y epel-release
                    dnf install -y nginx
                else
                    yum install -y epel-release
                    yum install -y nginx
                fi
                ;;
            *)
                log_err "Unsupported OS: $ID. This script supports CentOS/RHEL/Rocky/Alma."
                exit 1
                ;;
        esac
    else
        yum install -y epel-release
        yum install -y nginx
    fi

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

    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [ "${VERSION_ID%%.*}" -ge 8 ]; then
            dnf install -y certbot python3-certbot-nginx
        else
            yum install -y certbot python2-certbot-nginx 2>/dev/null || yum install -y certbot python-certbot-nginx 2>/dev/null
        fi
    else
        yum install -y certbot python2-certbot-nginx 2>/dev/null || true
    fi

    log_ok "Certbot installed"
}

install_certbot

#====================================================================
# 4. INSTALL NODE.JS (if not present)
#====================================================================
install_node() {
    if command -v node &>/dev/null; then
        local node_ver=$(node --version)
        log_ok "Node.js is already installed ($node_ver)"
        return 0
    fi

    log_info "Installing Node.js 20 LTS..."

    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs

    log_ok "Node.js $(node --version) installed"
}

install_node

#====================================================================
# 5. DOCKER NETWORK
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
# 6. POSTGRESQL IN DOCKER
#====================================================================
setup_postgres() {
    if docker ps --format '{{.Names}}' | grep -qw "$POSTGRES_CONTAINER"; then
        log_ok "PostgreSQL container '$POSTGRES_CONTAINER' is already running"
    elif docker ps -a --format '{{.Names}}' | grep -qw "$POSTGRES_CONTAINER"; then
        log_info "Starting existing PostgreSQL container..."
        docker start "$POSTGRES_CONTAINER"
        log_ok "PostgreSQL container started"
    else
        log_info "Creating PostgreSQL container..."

        if ! docker volume inspect "$POSTGRES_VOLUME" &>/dev/null; then
            docker volume create "$POSTGRES_VOLUME"
        fi

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
        log_ok "PostgreSQL container created and ready"
    fi

    export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}"
}

setup_postgres

#====================================================================
# 7. DEPLOY APPLICATION
#====================================================================
deploy_app() {
    log_info "Deploying application to $INSTALL_DIR..."

    mkdir -p "$INSTALL_DIR"

    rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
        --exclude='uploads' --exclude='.env' \
        "$PROJECT_DIR/" "$INSTALL_DIR/"

    cd "$INSTALL_DIR"

    cat > .env <<ENVFILE
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=${APP_PORT}
ENVFILE

    log_info "Installing dependencies..."
    npm ci --production=false 2>&1 | tail -1

    log_info "Building application..."
    npm run build 2>&1 | tail -3

    log_info "Pushing database schema..."
    npm run db:push 2>&1 | tail -3

    mkdir -p "$INSTALL_DIR/uploads"

    log_ok "Application built and database updated"
}

deploy_app

#====================================================================
# 8. SYSTEMD SERVICE
#====================================================================
setup_systemd() {
    local service_file="/etc/systemd/system/${APP_NAME}.service"

    log_info "Creating systemd service..."

    cat > "$service_file" <<SERVICE
[Unit]
Description=NetGuard ISP Ticketing System
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/dist/index.cjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

[Install]
WantedBy=multi-user.target
SERVICE

    systemctl daemon-reload
    systemctl enable "$APP_NAME"
    systemctl restart "$APP_NAME"

    sleep 2
    if systemctl is-active --quiet "$APP_NAME"; then
        log_ok "Application service started on port ${APP_PORT}"
    else
        log_err "Service failed to start. Check: journalctl -u ${APP_NAME} -n 50"
        exit 1
    fi
}

setup_systemd

#====================================================================
# 9. NGINX CONFIGURATION
#====================================================================
configure_nginx() {
    local conf_file="/etc/nginx/conf.d/${APP_NAME}.conf"

    if [ -f "$conf_file" ]; then
        log_ok "Nginx config for '${APP_NAME}' already exists"
        log_info "Updating proxy port to ${APP_PORT}..."
        sed -i "s|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:${APP_PORT};|g" "$conf_file"
    else
        log_info "Creating Nginx configuration..."

        cat > "$conf_file" <<NGINX_CONF
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

    # SSL will be configured by certbot
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

    location /uploads/ {
        alias ${INSTALL_DIR}/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_CONF

        log_ok "Nginx config created at $conf_file"
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
# 10. SSL CERTIFICATE (Let's Encrypt)
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
# 11. FIREWALL
#====================================================================
configure_firewall() {
    if command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
        log_info "Configuring firewall..."
        firewall-cmd --permanent --add-service=http 2>/dev/null || true
        firewall-cmd --permanent --add-service=https 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        log_ok "Firewall configured for HTTP/HTTPS"
    else
        log_info "Firewall not active, skipping firewall config"
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
echo "  Useful commands:"
echo "    Status:     systemctl status ${APP_NAME}"
echo "    Logs:       journalctl -u ${APP_NAME} -f"
echo "    Restart:    systemctl restart ${APP_NAME}"
echo "    DB Shell:   docker exec -it ${POSTGRES_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"
echo "    Nginx:      nginx -t && systemctl reload nginx"
echo ""
echo "  Database URL (save this):"
echo "    ${DATABASE_URL}"
echo ""
echo "  To update the app later, run:"
echo "    cd ${PROJECT_DIR} && ./deploy/update.sh"
echo ""

cat > "/etc/netguard-deploy-info" <<INFO2
INSTALL_DIR=${INSTALL_DIR}
APP_NAME=${APP_NAME}
INFO2

cat > "${INSTALL_DIR}/.deploy-info" <<INFO
DOMAIN=${DOMAIN}
APP_NAME=${APP_NAME}
APP_PORT=${APP_PORT}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER}
DOCKER_NETWORK=${DOCKER_NETWORK}
INSTALL_DIR=${INSTALL_DIR}
DEPLOYED_AT=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
INFO
