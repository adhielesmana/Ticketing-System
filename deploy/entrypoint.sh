#!/bin/bash

DB_USER="m4xnetPlus"
DB_NAME="m4xnetPlus"
DB_PASS='m4xnetPlus2026!'
RUN_MIGRATIONS="${RUN_MIGRATIONS:-auto}"

export PGDATA="/var/lib/postgresql/data"

TIMEZONE="${TZ:-Asia/Jakarta}"
ln -sf "/usr/share/zoneinfo/${TIMEZONE}" /etc/localtime
echo "${TIMEZONE}" > /etc/timezone

echo "=============================================="
echo "  NetGuard ISP - Container Starting"
echo "  Timezone: $(date +%Z) ($(date +%z))"
echo "=============================================="

mkdir -p /var/log
touch /var/log/postgresql.log
chown postgres:postgres /var/log/postgresql.log

FIRST_BOOT=false

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    FIRST_BOOT=true
    echo "[STEP 1] No existing data — fresh PostgreSQL init..."

    pkill postgres 2>/dev/null || true
    sleep 1

    rm -rf "$PGDATA"/*
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"

    echo "[STEP 3] Running initdb..."
    if ! su-exec postgres initdb -D "$PGDATA" --encoding=UTF8 --locale=C; then
        echo "[ERROR] initdb failed!"
        exit 1
    fi

    cat > "$PGDATA/pg_hba.conf" <<HBAEOF
local   all       all                   trust
host    all       all   127.0.0.1/32    md5
host    all       all   ::1/128         md5
HBAEOF

    cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = 'localhost'
port = 5432
timezone = 'Asia/Jakarta'
log_timezone = 'Asia/Jakarta'
wal_compression = on
max_connections = 50
shared_buffers = 128MB
EOF

    echo "[OK] PostgreSQL initialized"
else
    echo "[OK] PostgreSQL data directory exists"

    cat > "$PGDATA/pg_hba.conf" <<HBAEOF
local   all       all                   trust
host    all       all   127.0.0.1/32    md5
host    all       all   ::1/128         md5
HBAEOF
fi

ensure_postgres_timezone() {
    local file="$PGDATA/postgresql.conf"
    if [ ! -f "$file" ]; then
        return
    fi
    for key in timezone log_timezone wal_compression; do
        local value
        case "$key" in
            timezone|log_timezone)
                value="'Asia/Jakarta'"
                ;;
            *)
                value="on"
                ;;
        esac
        if grep -q "^${key}" "$file"; then
            sed -i "s|^${key}.*|${key} = ${value}|" "$file"
        else
            echo "${key} = ${value}" >> "$file"
        fi
    done
}

ensure_postgres_timezone

if [ -f "$PGDATA/postmaster.pid" ]; then
    echo "[WARN] Stale postmaster.pid found, cleaning up..."
    PG_PID=$(head -1 "$PGDATA/postmaster.pid" 2>/dev/null || echo "")
    if [ -n "$PG_PID" ] && kill -0 "$PG_PID" 2>/dev/null; then
        su-exec postgres pg_ctl -D "$PGDATA" stop -m immediate -w -t 10 2>/dev/null || true
        sleep 2
    fi
    rm -f "$PGDATA/postmaster.pid"
    echo "[OK] Stale PID cleaned"
fi

echo "[STEP 4] Starting PostgreSQL..."
if ! su-exec postgres pg_ctl -D "$PGDATA" -l /var/log/postgresql.log start -w -t 30; then
    echo "[ERROR] PostgreSQL failed to start!"
    tail -30 /var/log/postgresql.log
    exit 1
fi
echo "[OK] PostgreSQL started"

enforce_postgres_timezone() {
    su-exec postgres psql -d template1 -v ON_ERROR_STOP=1 <<'SQL'
ALTER SYSTEM SET timezone = 'Asia/Jakarta';
ALTER SYSTEM SET log_timezone = 'Asia/Jakarta';
ALTER SYSTEM SET wal_compression = 'on';
SQL
    su-exec postgres pg_ctl -D "$PGDATA" reload -w
}

enforce_postgres_timezone

echo "[STEP 5] Creating role and database..."
su-exec postgres psql -d template1 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASS}';
        RAISE NOTICE 'Role ${DB_USER} created';
    ELSE
        ALTER ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASS}';
        RAISE NOTICE 'Role ${DB_USER} updated';
    END IF;
END
\$\$;
SQL

DB_EXISTS=$(su-exec postgres psql -d template1 -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "0")
DB_EXISTS=$(echo "$DB_EXISTS" | tr -d ' \n')
if [ "$DB_EXISTS" != "1" ]; then
    echo "[INFO] Creating database '${DB_NAME}'..."
    su-exec postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
    echo "[OK] Database '${DB_NAME}' already exists"
fi

su-exec postgres psql -d template1 -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";" 2>/dev/null || true
su-exec postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";" 2>/dev/null || true
echo "[OK] Role and database ready"

echo "[STEP 6] Setting DATABASE_URL..."
export DATABASE_URL="postgresql://${DB_USER}:m4xnetPlus2026%21@localhost:5432/${DB_NAME}"
echo "[OK] DATABASE_URL configured"

echo "[INFO] Verifying TCP connection..."
if PGPASSWORD="${DB_PASS}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null; then
    echo "[OK] TCP md5 auth verified — database is ready"
else
    echo "[WARN] TCP auth failed, resetting password..."
    su-exec postgres psql -d template1 -c "ALTER ROLE \"${DB_USER}\" WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true
    sleep 1
    if PGPASSWORD="${DB_PASS}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>/dev/null; then
        echo "[OK] TCP auth working after password reset"
    else
        echo "[WARN] TCP auth still failing, check logs"
        tail -10 /var/log/postgresql.log
    fi
fi

echo "[STEP 7] Running database migration..."
if [ "$RUN_MIGRATIONS" = "skip" ]; then
    echo "[INFO] Skipping schema push (RUN_MIGRATIONS=skip)"
else
    echo "[INFO] Pushing schema to sync any new columns/tables..."
    npx drizzle-kit push --force 2>&1 | tail -10 || true
    echo "[OK] Schema push complete"
fi

TABLES=$(PGPASSWORD="${DB_PASS}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
echo "[OK] Found $(echo $TABLES | tr -d ' \n') table(s) in database"

echo "[STEP 8] Starting NetGuard application..."
echo "[INFO] Database: ${DB_NAME} | User: ${DB_USER} | Host: localhost:5432"
echo "=============================================="

shutdown_handler() {
    echo ""
    echo "[INFO] Shutting down gracefully..."
    kill %1 2>/dev/null || true
    su-exec postgres pg_ctl -D "$PGDATA" stop -m fast -w -t 10 2>/dev/null || true
    echo "[OK] Shutdown complete"
    exit 0
}
trap shutdown_handler SIGTERM SIGINT

exec node dist/index.cjs
