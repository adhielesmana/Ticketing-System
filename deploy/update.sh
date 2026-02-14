#!/bin/bash
set -e

#====================================================================
# NetGuard ISP - Update Script
# Pulls latest code, rebuilds, migrates DB, restarts service
#====================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"

DEPLOY_INFO="${INSTALL_DIR}/.deploy-info"
if [ -f "$DEPLOY_INFO" ]; then
    source "$DEPLOY_INFO"
elif [ -f /etc/netguard-deploy-info ]; then
    source /etc/netguard-deploy-info
else
    APP_NAME="${APP_NAME:-netguard}"
fi

echo ""
echo "=============================================="
echo "  NetGuard ISP - Update"
echo "=============================================="
echo ""

log_info "Syncing files to ${INSTALL_DIR}..."
rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
    --exclude='uploads' --exclude='.env' --exclude='.deploy-info' \
    "$PROJECT_DIR/" "$INSTALL_DIR/"

cd "$INSTALL_DIR"

log_info "Installing dependencies..."
npm ci --production=false 2>&1 | tail -1

log_info "Building application..."
npm run build 2>&1 | tail -3

log_info "Updating database schema..."
npm run db:push 2>&1 | tail -3

log_info "Restarting service..."
systemctl restart "$APP_NAME"

sleep 2
if systemctl is-active --quiet "$APP_NAME"; then
    log_ok "Update complete! Service is running."
else
    log_err "Service failed to start after update."
    log_err "Check logs: journalctl -u ${APP_NAME} -n 50"
    exit 1
fi

echo ""
echo -e "${GREEN}Update deployed successfully!${NC}"
echo ""
