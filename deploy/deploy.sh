#!/bin/bash
set -euo pipefail

#====================================================================
# NetGuard ISP Ticketing System - Debian/Ubuntu Deployment Script
# Version: 8
# Single container (App + PostgreSQL) with host Nginx reverse proxy
#====================================================================

DEPLOY_VERSION="8"

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

TOTAL_STEPS=9
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

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_err "Please run as root (or sudo)."
    exit 1
  fi
}

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    key="${key// /}"
    value="${value%$'\r'}"
    case "$key" in
      DOMAIN|APP_NAME|APP_PORT|APP_CONTAINER|DB_NAME|DB_USER|PGDATA_VOLUME|UPLOADS_VOLUME|INSTALL_DIR|SESSION_SECRET)
        eval "$key=\"$value\""
        ;;
    esac
  done < "$file"
}

get_all_used_ports() {
  local sys_ports docker_ports
  sys_ports=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un || true)
  docker_ports=$(docker ps --format '{{.Ports}}' 2>/dev/null | tr ',' '\n' | grep -oE ':[0-9]+->' | tr -d ':->' | sort -un || true)
  printf '%s\n%s\n' "$sys_ports" "$docker_ports" | awk 'NF' | sort -un
}

find_free_port() {
  local port="$1"
  local used_ports="$2"
  while echo "$used_ports" | grep -qx "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

is_placeholder_domain() {
  echo "$1" | grep -qE '(yourdomain\.com|localhost|\.local$)'
}

MISSING_PACKAGES=()

queue_package_install() {
  local pkg="$1"
  for existing in "${MISSING_PACKAGES[@]}"; do
    if [ "$existing" = "$pkg" ]; then
      return
    fi
  done
  MISSING_PACKAGES+=("$pkg")
}

ensure_package() {
  local pkg="$1"
  dpkg -s "$pkg" >/dev/null 2>&1 || queue_package_install "$pkg"
}

ensure_cmd_or_pkg() {
  local cmd="$1"
  local pkg="$2"
  command -v "$cmd" >/dev/null 2>&1 || ensure_package "$pkg"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
CLI_DOMAIN=""
DOMAIN=""
APP_NAME="${APP_NAME:-netguard}"
APP_PORT="${APP_PORT:-3100}"
DB_NAME="m4xnetPlus"
DB_USER="m4xnetPlus"
DB_PASS='m4xnetPlus2026!'
SSL_EMAIL="${SSL_EMAIL:-admin@yourdomain.com}"
INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"
APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
PGDATA_VOLUME="${PGDATA_VOLUME:-netguard_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"
HOST_LOCALTIME_FILE="${HOST_LOCALTIME_FILE:-/etc/localtime}"
HOST_TIMEZONE_FILE="${HOST_TIMEZONE_FILE:-/etc/timezone}"

SKIP_HOST_DEPS="${SKIP_HOST_DEPS:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      CLI_DOMAIN="${2:-}"; shift 2 ;;
    --ssl-email)
      SSL_EMAIL="${2:-}"; shift 2 ;;
    --app-port)
      APP_PORT="${2:-}"; shift 2 ;;
    --skip-host-deps)
      SKIP_HOST_DEPS="1"; shift ;;
    *)
      log_err "Unknown argument: $1"
      exit 1
      ;;
  esac
done

DEPLOY_INFO="${INSTALL_DIR}/.deploy-info"
CREDENTIALS_FILE="${INSTALL_DIR}/.credentials"

load_env_file "$DEPLOY_INFO"
load_env_file "$CREDENTIALS_FILE"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

if [ -n "$CLI_DOMAIN" ]; then
  DOMAIN="$CLI_DOMAIN"
elif [ -n "${DOMAIN:-}" ]; then
  DOMAIN="$DOMAIN"
elif [ -t 0 ]; then
  read -rp "Enter primary domain (example: tickets.example.com): " DOMAIN
else
  log_err "DOMAIN not set. Re-run with --domain your.domain.com"
  exit 1
fi

if [ -z "${DOMAIN:-}" ]; then
  log_err "Domain cannot be empty."
  exit 1
fi

require_root

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

# STEP 1: host dependencies
step_start 1 "Install/verify host dependencies"
if [ "$SKIP_HOST_DEPS" = "1" ]; then
  log_warn "Skipping host dependency bootstrap (--skip-host-deps)"
else
  MISSING_PACKAGES=()
  ensure_package ca-certificates
  ensure_package curl
  ensure_package openssl
  ensure_cmd_or_pkg docker docker.io
  ensure_cmd_or_pkg nginx nginx
  ensure_cmd_or_pkg certbot certbot
  ensure_package python3-certbot-nginx

  if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    export DEBIAN_FRONTEND=noninteractive
    log_info "Installing missing packages: ${MISSING_PACKAGES[*]}"
    apt-get update -y
    apt-get install -y "${MISSING_PACKAGES[@]}"
  else
    log_info "All host dependencies already installed."
  fi

  if command -v docker >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi
  if command -v nginx >/dev/null 2>&1; then
    systemctl enable --now nginx >/dev/null 2>&1 || true
  fi
fi
step_done 1 "Install/verify host dependencies"

# STEP 2: stop existing containers
step_start 2 "Stop existing NetGuard containers"
if docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
  docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
elif docker ps -a --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
fi
if docker ps -a --format '{{.Names}}' | grep -qw "netguard_postgres"; then
  docker stop "netguard_postgres" >/dev/null 2>&1 || true
  docker rm -f "netguard_postgres" >/dev/null 2>&1 || true
fi
step_done 2 "Stop existing NetGuard containers"

# STEP 3: port scan
step_start 3 "Port scanning & auto-assignment"
USED_PORTS=$(get_all_used_ports)
ORIGINAL_PORT="$APP_PORT"
APP_PORT=$(find_free_port "$APP_PORT" "$USED_PORTS")
if [ "$APP_PORT" != "$ORIGINAL_PORT" ]; then
  log_warn "Port ${ORIGINAL_PORT} is occupied. Using ${APP_PORT}."
else
  log_ok "Port ${APP_PORT} is available."
fi
step_done 3 "Port scanning & auto-assignment"

# STEP 4: copy source
step_start 4 "Copy source files"
mkdir -p "$INSTALL_DIR"
cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"
cp "$SCRIPT_DIR/entrypoint.sh" "$INSTALL_DIR/deploy/entrypoint.sh"
step_done 4 "Copy source files"

# STEP 5: build docker image
step_start 5 "Build Docker image"
cd "$INSTALL_DIR"
docker build -t "$APP_NAME" . 2>&1 | tail -20
step_done 5 "Build Docker image"

# STEP 6: start container
step_start 6 "Start NetGuard container"
if docker volume inspect "$PGDATA_VOLUME" >/dev/null 2>&1; then
  docker volume rm "$PGDATA_VOLUME" >/dev/null 2>&1 || true
fi
docker volume create "$PGDATA_VOLUME" >/dev/null
if ! docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1; then
  docker volume create "$UPLOADS_VOLUME" >/dev/null
fi

cat > "$CREDENTIALS_FILE" <<CREDS
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
SESSION_SECRET=${SESSION_SECRET}
CREDS
chmod 600 "$CREDENTIALS_FILE"

  docker run -d \
    --name "$APP_CONTAINER" \
  --restart unless-stopped \
  -e DB_USER="$DB_USER" \
  -e DB_NAME="$DB_NAME" \
  -e DB_PASS="$DB_PASS" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e RUN_MIGRATIONS=true \
  -e NODE_ENV=production \
  -e TZ=Asia/Jakarta \
  -p "127.0.0.1:${APP_PORT}:3000" \
    -v "${PGDATA_VOLUME}:/var/lib/postgresql/data" \
    -v "${UPLOADS_VOLUME}:/app/uploads" \
    $( [ -f "$HOST_LOCALTIME_FILE" ] && printf '%s' "-v ${HOST_LOCALTIME_FILE}:/etc/localtime:ro" || printf '' ) \
    $( [ -f "$HOST_TIMEZONE_FILE" ] && printf '%s' "-v ${HOST_TIMEZONE_FILE}:/etc/timezone:ro" || printf '' ) \
    "$APP_NAME" >/dev/null

sleep 5
docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER" || { log_err "Container failed to start"; docker logs "$APP_CONTAINER" --tail 30; exit 1; }
step_done 6 "Start NetGuard container"

# STEP 7: readiness check
step_start 7 "Verify app is running"
retries=0
while [ $retries -lt 60 ]; do
  if docker logs "$APP_CONTAINER" 2>&1 | grep -q "Schema push complete\|listening on\|server started\|serving on port"; then
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
step_done 7 "Verify app is running"

# STEP 8: nginx + ssl
step_start 8 "Configure Nginx and SSL"
avail_file="/etc/nginx/sites-available/${APP_NAME}"
enabled_link="/etc/nginx/sites-enabled/${APP_NAME}"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/ssl /var/lib/letsencrypt

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
    }
}
NGINX_CONF

ln -sf "$avail_file" "$enabled_link"
rm -f /etc/nginx/sites-enabled/default

if [ ! -f "/etc/nginx/ssl/${APP_NAME}_self.crt" ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "/etc/nginx/ssl/${APP_NAME}_self.key" \
    -out "/etc/nginx/ssl/${APP_NAME}_self.crt" \
    -subj "/CN=${DOMAIN}" >/dev/null 2>&1
fi

nginx -t
systemctl reload nginx

if is_placeholder_domain "$DOMAIN"; then
  log_warn "Placeholder/local domain detected. Keeping self-signed certificate."
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect || \
    log_warn "Certbot failed. Keeping self-signed cert for now."
  if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
  fi
fi
step_done 8 "Configure Nginx and SSL"

# STEP 9: persist metadata
step_start 9 "Persist deployment metadata"
cat > "$DEPLOY_INFO" <<INFO
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
chmod 600 "$DEPLOY_INFO"
step_done 9 "Persist deployment metadata"

print_checklist

echo "=============================================="
echo -e "  ${GREEN}Deployment Complete! (v${DEPLOY_VERSION})${NC}"
echo "=============================================="
echo ""
echo "  App URL:      https://${DOMAIN}"
echo "  App Port:     ${APP_PORT} (internal)"
echo "  Install Dir:  ${INSTALL_DIR}"
echo ""
echo "  Useful commands:"
echo "    App logs:   docker logs ${APP_CONTAINER} -f"
echo "    Restart:    docker restart ${APP_CONTAINER}"
echo "    Update:     cd ${PROJECT_DIR} && ./deploy/update.sh"
echo ""
