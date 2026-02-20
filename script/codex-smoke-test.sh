#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-5000}"
PG_PORT="${PG_PORT:-5432}"
PG_CONTAINER="${PG_CONTAINER:-ticketing-pg-smoke}"
DB_USER="${DB_USER:-m4xnetPlus}"
DB_PASS="${DB_PASS:-m4xnetPlus2026!}"
DB_NAME="${DB_NAME:-m4xnetPlus}"
DB_HOST="${DB_HOST:-127.0.0.1}"

cleanup() {
  if [[ -n "${APP_PID:-}" ]]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/6] Checking required tools..."
if ! command -v docker >/dev/null; then
  echo 'Docker is required for this smoke script but is not installed in this environment.'
  exit 1
fi
if ! command -v npm >/dev/null; then
  echo 'npm is required but not installed in this environment.'
  exit 1
fi
if ! command -v curl >/dev/null; then
  echo 'curl is required but not installed in this environment.'
  exit 1
fi

echo "[2/6] Installing dependencies (npm ci)..."
npm ci >/dev/null

echo "[3/6] Starting PostgreSQL container..."
docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$PG_CONTAINER" \
  -e POSTGRES_USER="${DB_USER}" \
  -e POSTGRES_PASSWORD="${DB_PASS}" \
  -e POSTGRES_DB="${DB_NAME}" \
  -p "${PG_PORT}:5432" \
  postgres:16 >/dev/null

for i in {1..30}; do
  if docker exec "$PG_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "PostgreSQL did not become ready in time"
    exit 1
  fi
done

DB_PASS_URLENCODED="${DB_PASS_URLENCODED:-m4xnetPlus2026%21}"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS_URLENCODED}@${DB_HOST}:${PG_PORT}/${DB_NAME}"
export SESSION_SECRET="dev-session-secret"
export PORT="$APP_PORT"

echo "[4/6] Applying schema..."
npm run db:push >/dev/null

echo "[5/6] Starting app..."
npm run dev >/tmp/codex-app.log 2>&1 &
APP_PID=$!

for i in {1..45}; do
  if curl -sf "http://127.0.0.1:${APP_PORT}/" >/dev/null; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 45 ]]; then
    echo "App did not become ready in time"
    tail -n 80 /tmp/codex-app.log || true
    exit 1
  fi
done

echo "[6/6] Smoke checks..."
ROOT_CODE="$(curl -s -o /tmp/codex-root.out -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/")"
AUTH_CODE="$(curl -s -o /tmp/codex-auth.out -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/auth/me")"

echo "GET / => HTTP ${ROOT_CODE}"
echo "GET /api/auth/me => HTTP ${AUTH_CODE} (401 is expected when not logged in)"

echo "Smoke test completed successfully."
