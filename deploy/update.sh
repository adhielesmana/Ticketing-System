#!/bin/bash
set -e

#====================================================================
# NetGuard ISP - Update Script (Single Container)
# Version: 5
# Rebuilds Docker image and restarts the single container
#====================================================================

UPDATE_VERSION="5"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE_BOLD='\033[1;37m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

TOTAL_STEPS=4
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
    echo -e "  UPDATE CHECKLIST SUMMARY (v${UPDATE_VERSION})"
    echo -e "==============================================${NC}"
    for result in "${CHECKLIST_RESULTS[@]}"; do
        echo -e "  $result"
    done
    echo -e "${WHITE_BOLD}==============================================${NC}"
    echo ""
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"

DEPLOY_INFO="${INSTALL_DIR}/.deploy-info"
if [ -f "$DEPLOY_INFO" ]; then
    eval "$(grep -v 'DEPLOYED_AT' "$DEPLOY_INFO")"
fi

APP_NAME="${APP_NAME:-netguard}"
APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
APP_PORT="${APP_PORT:-3100}"
PGDATA_VOLUME="${PGDATA_VOLUME:-netguard_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"

DB_NAME="m4xnetPlus"
DB_USER="m4xnetPlus"
DB_PASS='m4xnetPlus2026!'

if [ -f "${INSTALL_DIR}/.credentials" ]; then
    eval "$(grep -E '^SESSION_SECRET=' "${INSTALL_DIR}/.credentials")"
fi
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

echo ""
echo "=============================================="
echo "  NetGuard ISP - Update"
echo "  Version: ${UPDATE_VERSION} (Single Container)"
if [ -n "$DEPLOY_VERSION" ]; then
    echo "  Last deploy: v${DEPLOY_VERSION}"
fi
echo "=============================================="
echo ""

#====================================================================
# STEP 1: Copy updated source files
#====================================================================
step_start 1 "Copy updated source files"
log_info "Copying updated files to ${INSTALL_DIR}..."
cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"
cp "$SCRIPT_DIR/entrypoint.sh" "$INSTALL_DIR/deploy/entrypoint.sh"
log_ok "Source files copied"
step_done 1 "Copy updated source files"

#====================================================================
# STEP 2: Build Docker image
#====================================================================
step_start 2 "Build Docker image"
cd "$INSTALL_DIR"
log_info "Rebuilding Docker image '${APP_NAME}'..."
docker build -t "$APP_NAME" . 2>&1 | tail -20
log_ok "Docker image rebuilt"
step_done 2 "Build Docker image"

#====================================================================
# STEP 3: Restart container
#====================================================================
step_start 3 "Restart container"
log_info "Stopping old container..."
docker stop "$APP_CONTAINER" 2>/dev/null || true
docker rm "$APP_CONTAINER" 2>/dev/null || true

log_info "Starting updated container..."
docker run -d \
    --name "$APP_CONTAINER" \
    --restart unless-stopped \
    -e DB_USER="$DB_USER" \
    -e DB_NAME="$DB_NAME" \
    -e DB_PASS="$DB_PASS" \
    -e SESSION_SECRET="$SESSION_SECRET" \
    -e RUN_MIGRATIONS=auto \
    -e NODE_ENV=production \
    -e TZ=Asia/Jakarta \
    -p "127.0.0.1:${APP_PORT}:3000" \
    -v "${PGDATA_VOLUME}:/var/lib/postgresql/data" \
    -v "${UPLOADS_VOLUME}:/app/uploads" \
    "$APP_NAME"

sleep 5
if docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER"; then
    log_ok "Container started"
else
    log_err "Container failed to start."
    docker logs "$APP_CONTAINER" --tail 30
    exit 1
fi
step_done 3 "Restart container"

#====================================================================
# STEP 4: Verify app is running
#====================================================================
step_start 4 "Verify app is running"

log_info "Waiting for app to be ready..."
retries=0
while [ $retries -lt 30 ]; do
    if docker logs "$APP_CONTAINER" 2>&1 | grep -q "Schema push complete\|listening on\|server started"; then
        break
    fi
    retries=$((retries + 1))
    sleep 2
done

if [ $retries -ge 30 ]; then
    log_warn "App may still be starting. Check: docker logs ${APP_CONTAINER}"
else
    log_ok "App is ready"
fi

echo ""
log_info "Container startup log:"
docker logs "$APP_CONTAINER" 2>&1 | grep -E "^\[" | head -15
echo ""

step_done 4 "Verify app is running"

print_checklist

echo -e "${GREEN}Update deployed successfully! (v${UPDATE_VERSION})${NC}"
echo ""
echo "  App logs:  docker logs ${APP_CONTAINER} -f"
echo "  Restart:   docker restart ${APP_CONTAINER}"
echo "  DB Shell:  docker exec -it ${APP_CONTAINER} psql -h 127.0.0.1 -U ${DB_USER} -d ${DB_NAME}"
echo ""
