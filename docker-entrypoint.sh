#!/bin/sh
set -e

echo "[Entrypoint] Running database migrations..."
node dist/migrate.js && echo "[Entrypoint] Migrations complete" || echo "[Entrypoint] Migration failed (may be ok if tables exist)"

echo "[Entrypoint] Starting server..."
exec node dist/index.js
