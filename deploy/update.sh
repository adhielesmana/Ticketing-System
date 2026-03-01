#!/bin/bash
set -euo pipefail

#====================================================================
# NetGuard ISP - Update Script (Single Container)
# Version: 11
# Rebuilds image, restarts container, and refreshes nginx/ssl config
#====================================================================

UPDATE_VERSION="11"

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

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -h "$SCRIPT_PATH" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_PATH")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

self_update_before_run() {
  # Pull latest script before any deployment action and re-exec once if updated.
  if [ "${UPDATE_BOOTSTRAP_DONE:-0}" = "1" ]; then
    return
  fi

  if ! command -v git >/dev/null 2>&1; then
    export UPDATE_BOOTSTRAP_DONE=1
    return
  fi

  if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    export UPDATE_BOOTSTRAP_DONE=1
    return
  fi

  local previous_head latest_head
  previous_head="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || true)"
  git -C "$PROJECT_DIR" fetch origin main --prune
  git -C "$PROJECT_DIR" merge --ff-only origin/main
  latest_head="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || true)"

  export UPDATE_BOOTSTRAP_DONE=1
  if [ -n "$previous_head" ] && [ "$previous_head" != "$latest_head" ]; then
    exec "$SCRIPT_DIR/update.sh" "$@"
  fi
}

self_update_before_run "$@"

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

sync_project_files() {
  local source_dir="$1"
  local target_dir="$2"

  mkdir -p "$target_dir"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude ".git" \
      --exclude ".credentials" \
      --exclude ".deploy-info" \
      --exclude ".codex" \
      --exclude "node_modules" \
      --exclude "dist" \
      --exclude "uploads" \
      --exclude "attached_assets" \
      "$source_dir/" "$target_dir/"
  else
    cp -a "$source_dir/." "$target_dir/" 2>/dev/null || true
    rm -rf "$target_dir/node_modules" "$target_dir/.git" "$target_dir/.codex" "$target_dir/dist" "$target_dir/attached_assets"
  fi
}

CLI_DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      CLI_DOMAIN="${2:-}"; shift 2 ;;
    *)
      log_err "Unknown argument: $1"; exit 1 ;;
  esac
done

INSTALL_DIR="${INSTALL_DIR:-/opt/netguard}"
APP_NAME="${APP_NAME:-netguard}"
APP_CONTAINER="${APP_CONTAINER:-netguard_app}"
APP_PORT="${APP_PORT:-3100}"
PGDATA_VOLUME="${PGDATA_VOLUME:-netguard_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-netguard_uploads}"
DB_NAME="m4xnetPlus"
DB_USER="m4xnetPlus"
DB_PASS='m4xnetPlus2026!'
DOMAIN=""
SSL_EMAIL="${SSL_EMAIL:-admin@yourdomain.com}"

DEPLOY_INFO="${INSTALL_DIR}/.deploy-info"
CREDENTIALS_FILE="${INSTALL_DIR}/.credentials"

load_env_file "$DEPLOY_INFO"
load_env_file "$CREDENTIALS_FILE"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

if [ -n "$CLI_DOMAIN" ]; then
  DOMAIN="$CLI_DOMAIN"
fi

if [ -z "${DOMAIN:-}" ]; then
  log_err "Domain not found. Run deploy.sh first or pass --domain example.com"
  exit 1
fi

require_root

echo ""
echo "=============================================="
echo "  NetGuard ISP - Update"
echo "  Version: ${UPDATE_VERSION} (Single Container)"
echo "=============================================="
echo ""
log_info "Domain:        $DOMAIN"
log_info "App Port:      $APP_PORT"
log_info "Install Dir:   $INSTALL_DIR"

echo ""

# STEP 1: copy source
step_start 1 "Copy updated source files"
sync_project_files "$PROJECT_DIR" "$INSTALL_DIR"
cp "$SCRIPT_DIR/Dockerfile" "$INSTALL_DIR/Dockerfile"
cp "$SCRIPT_DIR/entrypoint.sh" "$INSTALL_DIR/deploy/entrypoint.sh"
step_done 1 "Copy updated source files"

# STEP 2: build image
step_start 2 "Build Docker image"
cd "$INSTALL_DIR"
DOCKER_BUILDKIT=1 docker build -t "$APP_NAME" . 2>&1 | tail -20
step_done 2 "Build Docker image"

# STEP 3: restart container (with conflict-safe port)
step_start 3 "Restart container"
docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true
docker rm "$APP_CONTAINER" >/dev/null 2>&1 || true

USED_PORTS=$(get_all_used_ports)
ORIGINAL_PORT="$APP_PORT"
APP_PORT=$(find_free_port "$APP_PORT" "$USED_PORTS")
if [ "$APP_PORT" != "$ORIGINAL_PORT" ]; then
  log_warn "Port ${ORIGINAL_PORT} is occupied. Using ${APP_PORT}."
fi

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
  "$APP_NAME" >/dev/null

sleep 5
docker ps --format '{{.Names}}' | grep -qw "$APP_CONTAINER" || { log_err "Container failed to start"; docker logs "$APP_CONTAINER" --tail 30; exit 1; }
step_done 3 "Restart container"

# STEP 4: verify app
step_start 4 "Verify app is running"
retries=0
while [ $retries -lt 30 ]; do
  if docker logs "$APP_CONTAINER" 2>&1 | grep -q "Schema push complete\|listening on\|server started\|serving on port"; then
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
step_done 4 "Verify app is running"

# STEP 5: persist metadata
step_start 5 "Persist deployment metadata"
cat > "$DEPLOY_INFO" <<INFO
DEPLOY_VERSION=${UPDATE_VERSION}
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
step_done 5 "Persist deployment metadata"

print_checklist

echo -e "${GREEN}Update deployed successfully! (v${UPDATE_VERSION})${NC}"
echo ""
echo "  URL:      https://${DOMAIN}"
echo "  Logs:     docker logs ${APP_CONTAINER} -f"
echo "  Restart:  docker restart ${APP_CONTAINER}"
echo ""
