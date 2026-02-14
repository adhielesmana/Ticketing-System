#!/bin/bash
set -e

#====================================================================
# NetGuard ISP - Update Script (Docker-based)
# Version: 4
# Rebuilds Docker image and restarts app container
#====================================================================

UPDATE_VERSION="4"

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

TOTAL_STEPS=5
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
elif [ -f /etc/netguard-deploy-info ]; then
    eval "$(grep -v 'DEPLOYED_AT' /etc/netguard-deploy-info)"
    if [ -f "${INSTALL_DIR}/.deploy-info" ]; then
        eval "$(grep -v 'DEPLOYED_AT' "${INSTALL_DIR}/.deploy-info")"
    fi
else
    APP_NAME="${APP_NAME:-netguard}"
    APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
    POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-netguard_postgres}"
    DOCKER_NETWORK="${DOCKER_NETWORK:-netguard_net}"
    UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"
    APP_PORT="${APP_PORT:-3100}"
fi

DB_NAME="${DB_NAME:-netguard_db}"
DB_USER="${DB_USER:-netguard}"

if [ -f "${INSTALL_DIR}/.credentials" ]; then
    eval "$(grep -E '^(DB_PASS|SESSION_SECRET)=' "${INSTALL_DIR}/.credentials")"
fi

echo ""
echo "=============================================="
echo "  NetGuard ISP - Update"
echo "  Version: ${UPDATE_VERSION}"
if [ -n "$DEPLOY_VERSION" ]; then
    echo "  Last deploy: v${DEPLOY_VERSION}"
fi
echo "=============================================="
echo ""

step_start 1 "Copy updated source files"
log_info "Copying updated files to ${INSTALL_DIR}..."
cp -a "$PROJECT_DIR/." "$INSTALL_DIR/" 2>/dev/null || true
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"
log_ok "Source files copied"
step_done 1 "Copy updated source files"

step_start 2 "Build Docker image"
cd "$INSTALL_DIR"
log_info "Rebuilding Docker image '${APP_NAME}'..."
docker build -t "$APP_NAME" . 2>&1 | tail -20
log_ok "Docker image rebuilt"
step_done 2 "Build Docker image"

step_start 3 "Verify database credentials"
if [ -n "$DB_PASS" ]; then
    log_info "Testing PostgreSQL auth before restarting app..."
    if docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
        psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
        -c "SELECT 1;" &>/dev/null; then
        log_ok "PostgreSQL auth verified"
    else
        log_warn "Auth failed with stored credentials, attempting fix via Unix socket..."
        docker exec "$POSTGRES_CONTAINER" \
            psql -U "$DB_USER" -d postgres \
            -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" &>/dev/null || \
        docker exec "$POSTGRES_CONTAINER" \
            psql -U postgres -d postgres \
            -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" &>/dev/null || true

        if docker exec -e PGPASSWORD="$DB_PASS" "$POSTGRES_CONTAINER" \
            psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
            -c "SELECT 1;" &>/dev/null; then
            log_ok "PostgreSQL auth fixed and verified"
        else
            log_err "Cannot verify PostgreSQL auth. App may fail to connect."
            log_err "Consider running a full deploy instead: ./deploy/deploy.sh"
        fi
    fi

    log_info "Refreshing .env with current credentials..."
    cat > "${INSTALL_DIR}/.env" <<ENVFILE
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${POSTGRES_CONTAINER}:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=3000
ENVFILE
    chmod 600 "${INSTALL_DIR}/.env"
    log_ok "Environment file refreshed"
else
    log_warn "No DB_PASS found in credentials file, using existing .env"
fi
step_done 3 "Verify database credentials"

step_start 4 "Restart app container"
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
    log_ok "App container started"
else
    log_err "App container failed to start."
    docker logs "$APP_CONTAINER" --tail 20
    exit 1
fi
step_done 4 "Restart app container"

step_start 5 "Push database schema"
log_info "Updating database schema..."
docker exec "$APP_CONTAINER" npx drizzle-kit push --force 2>&1 | tail -5
log_ok "Database schema updated"
step_done 5 "Push database schema"

print_checklist

echo -e "${GREEN}Update deployed successfully! (v${UPDATE_VERSION})${NC}"
echo ""
echo "  App logs:  docker logs ${APP_CONTAINER} -f"
echo "  Restart:   docker restart ${APP_CONTAINER}"
echo ""
