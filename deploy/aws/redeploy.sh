#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Redeploy after code changes: pull, reinstall, rebuild, restart, reload nginx.
# Run on the server:  bash redeploy.sh
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/cricket}"
cd "$APP_DIR"

echo "==> Pulling latest code..."
git pull --ff-only

echo "==> Installing backend dependencies..."
for svc in auth-service player-service team-service; do
  (
    cd "$APP_DIR/services/$svc"
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
  )
done

echo "==> Rebuilding frontend..."
(
  cd "$APP_DIR/frontend"
  export NODE_OPTIONS="--max-old-space-size=1536"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

echo "==> Restarting services and reloading nginx..."
pm2 restart all
sudo nginx -t && sudo systemctl reload nginx

pm2 status
echo "Done. Verify at your public URL."
