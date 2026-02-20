# Run & Test on Codex Platform

This guide is for running the app inside a Codex workspace terminal.

## Prerequisites
- Node.js + npm available.
- Docker available (recommended for quick PostgreSQL setup).

## Option A (Recommended): Run with PostgreSQL in Docker

### 1) Install dependencies
```bash
npm ci
```

### 2) Start PostgreSQL container
```bash
docker rm -f ticketing-pg 2>/dev/null || true

docker run -d \
  --name ticketing-pg \
  -e POSTGRES_USER=m4xnetPlus \
  -e POSTGRES_PASSWORD='m4xnetPlus2026!' \
  -e POSTGRES_DB=m4xnetPlus \
  -p 5432:5432 \
  postgres:16
```

### 3) Set environment variables
```bash
export DATABASE_URL='postgresql://m4xnetPlus:m4xnetPlus2026%21@127.0.0.1:5432/m4xnetPlus'
export SESSION_SECRET='dev-session-secret'
export PORT=5000
```

### 4) Push schema and start app
```bash
npm run db:push
npm run dev
```

### 5) Smoke test from another terminal
```bash
curl -i http://127.0.0.1:5000/
curl -i http://127.0.0.1:5000/api/auth/me
```

Expected:
- `/` returns HTML page.
- `/api/auth/me` returns `401` when not logged in (this still confirms API is running).

## Option B: Use existing PostgreSQL (without Docker)
If you already have Postgres, set only these:

```bash
export DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<db>'
export SESSION_SECRET='dev-session-secret'
export PORT=5000
npm run db:push
npm run dev
```



### Host/Container URL mapping
Use `DATABASE_URL` based on where the app runs:

- **App running on host machine** (outside container):
  - `postgresql://m4xnetPlus:m4xnetPlus2026%21@127.0.0.1:5432/m4xnetPlus`
- **App running in the same container as PostgreSQL**:
  - `postgresql://m4xnetPlus:m4xnetPlus2026%21@localhost:5432/m4xnetPlus`

`localhost` works when app and Postgres are in the same container/process namespace.

## One-command smoke helper
A helper script is provided:

```bash
bash script/codex-smoke-test.sh
```

It will:
1. Verify dependencies
2. Start local PostgreSQL container
3. Set `DATABASE_URL` and `SESSION_SECRET`
4. Run `npm run db:push`
5. Start server and probe `/` and `/api/auth/me`
6. Print logs and clean up the DB container

## Troubleshooting
- Error `DATABASE_URL must be set`: export `DATABASE_URL` first.
- Port 5432 busy: map Postgres to another host port and update `DATABASE_URL`.
- Port 5000 busy: set `PORT=5001` (or another free port) before `npm run dev`.


## Browser testing access (Codex)
You can test the UI in two ways:

1. **Manual browser access**
   - If your Codex workspace exposes preview URLs/ports, open the forwarded app port (default `5000`) in that browser preview.
   - Example target URL: `http://127.0.0.1:5000`.

2. **Automated browser check with Codex browser tool**
   - Start the app first (`npm run dev`) so it listens on `PORT`.
   - Run a browser-tool script that forwards the same port and navigates to `/`.
   - Typical flow: open page, wait for load, assert title or UI text, capture screenshot artifact.

If the app is not running yet, browser tests will fail with connection errors.
