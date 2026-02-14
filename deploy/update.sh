#!/bin/bash
set -e

#====================================================================
# NetGuard ISP - Update Script (Docker-based)
# Rebuilds Docker image and restarts app container
#====================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"

DEPLOY_INFO="${INSTALL_DIR}/.deploy-info"
if [ -f "$DEPLOY_INFO" ]; then
    source "$DEPLOY_INFO"
elif [ -f /etc/netguard-deploy-info ]; then
    source /etc/netguard-deploy-info
    if [ -f "${INSTALL_DIR}/.deploy-info" ]; then
        source "${INSTALL_DIR}/.deploy-info"
    fi
else
    APP_NAME="${APP_NAME:-netguard}"
    APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
    POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-netguard_postgres}"
    DOCKER_NETWORK="${DOCKER_NETWORK:-netguard_net}"
    UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"
    APP_PORT="${APP_PORT:-3100}"
fi

echo ""
echo "=============================================="
echo "  NetGuard ISP - Update"
echo "=============================================="
echo ""

log_info "Copying updated files to ${INSTALL_DIR}..."
cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"

cd "$INSTALL_DIR"

log_info "Rebuilding Docker image '${APP_NAME}'..."
docker build -t "$APP_NAME" . 2>&1 | tail -5

log_info "Stopping old app container..."
docker stop "$APP_CONTAINER" 2>/dev/null || true
docker rm "$APP_CONTAINER" 2>/dev/null || true

log_info "Starting updated app container..."
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
    log_ok "App container restarted"
else
    log_err "App container failed to start."
    docker logs "$APP_CONTAINER" --tail 20
    exit 1
fi

log_info "Updating database schema..."
docker exec "$APP_CONTAINER" npx drizzle-kit push --force 2>&1 | tail -5
log_ok "Database schema updated"

echo ""
echo -e "${GREEN}Update deployed successfully!${NC}"
echo ""
echo "  App logs:  docker logs ${APP_CONTAINER} -f"
echo "  Restart:   docker restart ${APP_CONTAINER}"
echo ""
