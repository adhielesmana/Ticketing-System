#!/bin/bash

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
    if ! su-exec postgres initdb -D "$PGDATA" --encoding=UTF8 --locale=C; then
        echo "[ERROR] initdb failed!"
        exit 1
    fi
    echo "[OK] PostgreSQL initialized"
fi

echo "[INFO] Updating pg_hba.conf..."
cat > "$PGDATA/pg_hba.conf" <<HBAEOF
# TYPE  DATABASE  USER  ADDRESS       METHOD
local   all       postgres              peer
local   all       all                   md5
host    all       all   127.0.0.1/32  md5
host    all       all   ::1/128       md5
HBAEOF

if ! grep -q "^listen_addresses" "$PGDATA/postgresql.conf" 2>/dev/null; then
    cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 5432
timezone = 'Asia/Jakarta'
log_timezone = 'Asia/Jakarta'
max_connections = 50
shared_buffers = 128MB
EOF
fi

echo "[OK] PostgreSQL config ready"

mkdir -p /var/log
touch /var/log/postgresql.log
chown postgres:postgres /var/log/postgresql.log

if [ -f "$PGDATA/postmaster.pid" ]; then
    echo "[WARN] Stale postmaster.pid found, cleaning up..."
    PG_PID=$(head -1 "$PGDATA/postmaster.pid" 2>/dev/null || echo "")
    if [ -n "$PG_PID" ] && kill -0 "$PG_PID" 2>/dev/null; then
        echo "[INFO] PostgreSQL process $PG_PID still running, stopping it..."
        su-exec postgres pg_ctl -D "$PGDATA" stop -m fast -w -t 10 2>/dev/null || true
        sleep 2
    fi
    rm -f "$PGDATA/postmaster.pid"
    echo "[OK] Stale PID cleaned"
fi

echo "[INFO] Starting PostgreSQL..."
if ! su-exec postgres pg_ctl -D "$PGDATA" -l /var/log/postgresql.log start -w -t 30; then
    echo "[ERROR] PostgreSQL failed to start!"
    cat /var/log/postgresql.log | tail -30
    exit 1
fi
echo "[OK] PostgreSQL started"

echo "[INFO] Configuring database user and database..."
su-exec postgres psql -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' CREATEDB; END IF; END \$\$;" 2>/dev/null || true

su-exec postgres psql -d postgres -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true

DB_EXISTS=$(su-exec postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "0")
if [ "$DB_EXISTS" != "1" ]; then
    echo "[INFO] Creating database '${DB_NAME}'..."
    su-exec postgres psql -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || true
else
    echo "[OK] Database '${DB_NAME}' already exists"
fi

su-exec postgres psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true
su-exec postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" 2>/dev/null || true

echo "[INFO] Verifying database auth..."
if PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null; then
    echo "[OK] PostgreSQL is ready — auth verified (md5)"
else
    echo "[WARN] md5 auth check failed, checking via peer..."
    if su-exec postgres psql -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null; then
        echo "[OK] PostgreSQL is ready via peer auth"
    else
        echo "[ERROR] Cannot connect to database at all!"
        cat /var/log/postgresql.log | tail -20
        exit 1
    fi
fi

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

if [ "$FIRST_BOOT" = true ] || [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "[INFO] Pushing database schema (first boot or forced)..."
    if npx drizzle-kit push --force 2>&1 | tail -10; then
        echo "[OK] Schema push complete"
    else
        echo "[WARN] Schema push had warnings, continuing..."
    fi
elif [ "$RUN_MIGRATIONS" = "auto" ]; then
    TABLES=$(PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
    TABLES=$(echo "$TABLES" | tr -d ' ')
    if [ "$TABLES" -lt 3 ] 2>/dev/null; then
        echo "[INFO] Pushing database schema (only ${TABLES} tables found)..."
        if npx drizzle-kit push --force 2>&1 | tail -10; then
            echo "[OK] Schema push complete"
        else
            echo "[WARN] Schema push had warnings, continuing..."
        fi
    else
        echo "[OK] Schema already exists (${TABLES} tables), skipping push"
    fi
fi

TABLES=$(PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
echo "[OK] Found $(echo $TABLES | tr -d ' ') table(s) in database"

echo "[INFO] Starting NetGuard application..."
echo "[INFO] Database: ${DB_NAME} | User: ${DB_USER} | Host: 127.0.0.1"
echo "=============================================="

shutdown_handler() {
    echo "[INFO] Shutting down gracefully..."
    su-exec postgres pg_ctl -D "$PGDATA" stop -m fast -w -t 10 2>/dev/null || true
    exit 0
}
trap shutdown_handler SIGTERM SIGINT

exec node dist/index.cjs
