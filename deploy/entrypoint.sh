#!/bin/bash
set -e

DB_USER="${DB_USER:-m4xnetPlus}"
DB_NAME="${DB_NAME:-netguard_db}"
DB_PASS="${DB_PASS:-m4xnetPlus2026#!}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-auto}"

export PGDATA="/var/lib/postgresql/data"

echo "=============================================="
echo "  NetGuard ISP - Container Starting"
echo "  Timezone: $(date +%Z) ($(date +%z))"
echo "=============================================="

FIRST_BOOT=false

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    FIRST_BOOT=true
    echo "[INFO] Initializing PostgreSQL database..."
    su-exec postgres initdb -D "$PGDATA" --auth=md5 --encoding=UTF8 --locale=C

    cat > "$PGDATA/pg_hba.conf" <<HBAEOF
# TYPE  DATABASE  USER  ADDRESS       METHOD
local   all       postgres              peer
local   all       all                   md5
host    all       all   127.0.0.1/32  md5
HBAEOF

    cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 5432
timezone = 'Asia/Jakarta'
log_timezone = 'Asia/Jakarta'
max_connections = 50
shared_buffers = 128MB
EOF

    echo "[OK] PostgreSQL initialized with md5 auth"
else
    echo "[OK] PostgreSQL data directory exists"
fi

mkdir -p /var/log
touch /var/log/postgresql.log
chown postgres:postgres /var/log/postgresql.log

echo "[INFO] Starting PostgreSQL..."
su-exec postgres pg_ctl -D "$PGDATA" -l /var/log/postgresql.log start -w -t 30

echo "[INFO] Configuring database user and database..."
su-exec postgres psql -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' CREATEDB; END IF; END \$\$;" 2>/dev/null || true

su-exec postgres psql -d postgres -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true

DB_EXISTS=$(su-exec postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "0")
if [ "$DB_EXISTS" != "1" ]; then
    echo "[INFO] Creating database '${DB_NAME}'..."
    su-exec postgres psql -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
fi

su-exec postgres psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null
if [ $? -eq 0 ]; then
    echo "[OK] PostgreSQL is ready — auth verified (md5)"
else
    echo "[ERROR] PostgreSQL auth failed!"
    cat /var/log/postgresql.log | tail -20
    exit 1
fi

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

if [ "$FIRST_BOOT" = true ] || [ "$RUN_MIGRATIONS" = "true" ] || [ "$RUN_MIGRATIONS" = "auto" ]; then
    if [ "$FIRST_BOOT" = true ] || [ "$RUN_MIGRATIONS" = "true" ]; then
        echo "[INFO] Pushing database schema (first boot or forced)..."
        npx drizzle-kit push --force 2>&1 | tail -10
        echo "[OK] Schema push complete"
    else
        TABLES=$(PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
        if [ "$TABLES" -lt 3 ] 2>/dev/null; then
            echo "[INFO] Pushing database schema (tables missing)..."
            npx drizzle-kit push --force 2>&1 | tail -10
            echo "[OK] Schema push complete"
        else
            echo "[OK] Schema already exists (${TABLES} tables), skipping push"
        fi
    fi
fi

TABLES=$(PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
echo "[OK] Found ${TABLES} table(s) in database"

echo "[INFO] Starting NetGuard application..."
echo "[INFO] Database: ${DB_NAME} | User: ${DB_USER} | Host: 127.0.0.1"
echo "=============================================="

trap "su-exec postgres pg_ctl -D $PGDATA stop -m fast; exit 0" SIGTERM SIGINT

exec node dist/index.cjs
