#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-time bootstrap for cricket-scoring-mern on an AWS EC2 free-tier instance.
#
# Installs Node 22 / nginx / PM2, clones the repo, builds the frontend, writes
# production .env files, configures nginx (static hosting + API proxies) and
# starts auth-service, player-service and team-service under PM2.
#
# Run as ec2-user (NOT root):  bash setup-ec2.sh
# Idempotent: safe to re-run; it pulls existing code and rewrites configs.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vamshi-1216/cricket-scoring-mern.git}"
APP_DIR="${APP_DIR:-/home/ec2-user/cricket}"
NODE_MAJOR="${NODE_MAJOR:-22}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: run this script as ec2-user, not root (PM2 must not run as root)." >&2
  exit 1
fi

ask() { # ask VAR_NAME "prompt" "default"
  local var="$1" prompt="$2" default="${3:-}" answer
  read -r -p "$prompt [$default]: " answer
  printf -v "$var" '%s' "${answer:-$default}"
}

# ---------------------------------------------------------------------------
# 1. System packages, swap, Node.js 22, PM2
# ---------------------------------------------------------------------------
log "Updating packages and installing prerequisites (this can take a few minutes)..."
if [ "${SKIP_DNF_UPDATE:-0}" != "1" ]; then
  sudo dnf update -y
fi
sudo dnf install -y git curl tar xz nginx python3 gcc-c++ make

if ! swapon --show | grep -q swapfile; then
  log "Adding a 2 GB swap file (protects the 1 GB instance during the frontend build)..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "Installing Node.js ${NODE_MAJOR}..."
NARCH="$(uname -m)"; case "$NARCH" in x86_64) NARCH=x64 ;; aarch64) NARCH=arm64 ;; esac
NODE_VERSION="${NODE_VERSION:-$(curl -fsSL https://nodejs.org/dist/index.json \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print(next(r["version"] for r in d if r["version"].startswith("v'"$NODE_MAJOR"'.")))' 2>/dev/null || true)}"
NODE_VERSION="${NODE_VERSION:-v22.14.0}"
curl -fsSL --retry 3 "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NARCH}.tar.xz" -o /tmp/node.tar.xz
sudo mkdir -p /opt/node
sudo tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
sudo ln -sf /opt/node/bin/node /usr/local/bin/node
sudo ln -sf /opt/node/bin/npm  /usr/local/bin/npm
sudo ln -sf /opt/node/bin/npx  /usr/local/bin/npx
sudo ln -sf /opt/node/bin/corepack /usr/local/bin/corepack
rm -f /tmp/node.tar.xz
node --version && npm --version

log "Installing PM2..."
npm install -g pm2@latest

# ---------------------------------------------------------------------------
# 2. Clone / update the code
# ---------------------------------------------------------------------------
log "Fetching the application code..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR" && cd "$APP_DIR"
fi

# ---------------------------------------------------------------------------
# 3. Collect configuration and write .env files
# ---------------------------------------------------------------------------
log "Collecting configuration (see docs/AWS-FREE-TIER-DEPLOYMENT.md, steps 1-2)."
ask PUBLIC_URL        "Public URL of the site (http(s)://host, no path, no trailing slash)" ""
while [[ ! "$PUBLIC_URL" =~ ^https?://[^/]+$ ]]; do
  echo "  That is not a valid origin (need http:// or https://, host only, no path)."
  ask PUBLIC_URL "Public URL of the site" ""
done
ask MONGODB_URI       "MongoDB connection string (Atlas M0, no database name at the end)" ""
ask GOOGLE_CLIENT_ID  "Google OAuth Client ID" ""
ask MSG91_AUTH_KEY    "MSG91 auth key" ""
ask MSG91_WIDGET_ID   "MSG91 widget id (frontend)" ""
ask MSG91_TOKEN_AUTH  "MSG91 token auth (frontend)" ""
ask EMAIL_USER        "SMTP user (leave blank to disable email)" ""
ask EMAIL_PASSWORD    "SMTP app password (blank to disable)" ""
ask EMAIL_FROM        "SMTP from address (blank to disable)" ""
ask JWT_SECRET        "JWT secret (blank = generate a random one)" ""
ask INTERNAL_SECRET   "Internal service secret (blank = generate a random one)" ""

[ -n "$JWT_SECRET" ]  || JWT_SECRET="$(openssl rand -hex 32)"
[ -n "$INTERNAL_SECRET" ] || INTERNAL_SECRET="$(openssl rand -hex 32)"

if [ -n "$EMAIL_USER" ] || [ -n "$EMAIL_PASSWORD" ] || [ -n "$EMAIL_FROM" ]; then
  if [ -z "$EMAIL_USER" ] || [ -z "$EMAIL_PASSWORD" ] || [ -z "$EMAIL_FROM" ]; then
    warn "Email is only partially configured. auth-service requires EMAIL_USER,"
    warn "EMAIL_PASSWORD and EMAIL_FROM together, or none at all. Leaving email OFF."
    EMAIL_USER=""; EMAIL_PASSWORD=""; EMAIL_FROM=""
  fi
fi

log "Writing service .env files..."
cat > "$APP_DIR/services/auth-service/.env" <<EOF
# Production configuration for auth-service (generated by setup-ec2.sh)
NODE_ENV=production
PORT=4001
FRONTEND_ORIGIN=$PUBLIC_URL
MONGODB_URI=$MONGODB_URI
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=15m
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
MSG91_AUTH_KEY=$MSG91_AUTH_KEY
INTERNAL_SERVICE_SECRET=$INTERNAL_SECRET
# Email (all three required, or leave all blank):
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=$EMAIL_USER
EMAIL_PASSWORD=$EMAIL_PASSWORD
EMAIL_FROM=$EMAIL_FROM
EOF

cat > "$APP_DIR/services/player-service/.env" <<EOF
# Production configuration for player-service (generated by setup-ec2.sh)
NODE_ENV=production
PORT=4002
FRONTEND_ORIGIN=$PUBLIC_URL
MONGODB_URI=$MONGODB_URI
EOF

cat > "$APP_DIR/services/team-service/.env" <<EOF
# Production configuration for team-service (generated by setup-ec2.sh)
NODE_ENV=production
PORT=4004
FRONTEND_ORIGIN=$PUBLIC_URL
MONGODB_URI=$MONGODB_URI
PLAYER_SERVICE_URL=http://127.0.0.1:4002
EOF

chmod 600 "$APP_DIR/services/auth-service/.env" \
          "$APP_DIR/services/player-service/.env" \
          "$APP_DIR/services/team-service/.env"

log "Writing frontend/.env.production..."
cat > "$APP_DIR/frontend/.env.production" <<EOF
# Baked into the build by Vite. Same-origin URLs go through nginx.
VITE_API_URL=$PUBLIC_URL/api/v1/auth
VITE_PLAYER_API_URL=$PUBLIC_URL/api/v1/players
VITE_TEAM_API_URL=$PUBLIC_URL/api/v1/teams
# Uncomment when match-service / scoring-service are deployed:
# VITE_MATCH_API_URL=$PUBLIC_URL/api/v1/matches
# VITE_SCORING_API_URL=$PUBLIC_URL
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
VITE_MSG91_WIDGET_ID=$MSG91_WIDGET_ID
VITE_MSG91_TOKEN_AUTH=$MSG91_TOKEN_AUTH
EOF
chmod 600 "$APP_DIR/frontend/.env.production"

# ---------------------------------------------------------------------------
# 4. Install dependencies and build the frontend
# ---------------------------------------------------------------------------
log "Installing backend dependencies..."
for svc in auth-service player-service team-service; do
  (
    cd "$APP_DIR/services/$svc"
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
  )
done

log "Building the frontend (vite build)..."
(
  cd "$APP_DIR/frontend"
  export NODE_OPTIONS="--max-old-space-size=1536"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

# ---------------------------------------------------------------------------
# 5. nginx: static hosting + API reverse proxies
# ---------------------------------------------------------------------------
log "Configuring nginx..."
NGINX_SRC="$APP_DIR/deploy/aws/nginx-cricket.conf"
[ -f "$NGINX_SRC" ] || NGINX_SRC="$(dirname "$0")/nginx-cricket.conf"
sudo cp "$NGINX_SRC" /etc/nginx/conf.d/cricket.conf
sudo rm -f /etc/nginx/conf.d/default.conf
sudo nginx -t
sudo systemctl enable --now nginx

if command -v firewall-cmd >/dev/null 2>&1 && sudo systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
fi

# ---------------------------------------------------------------------------
# 6. Start the services with PM2
# ---------------------------------------------------------------------------
log "Starting services with PM2..."
cd "$APP_DIR"
pm2 delete all >/dev/null 2>&1 || true
pm2 start deploy/aws/ecosystem.config.js
pm2 save
if sudo env PATH="$PATH:/usr/local/bin:/opt/node/bin" pm2 startup systemd -u "$USER" --hp "/home/$USER"; then
  pm2 save
fi

# ---------------------------------------------------------------------------
# 7. Health checks
# ---------------------------------------------------------------------------
log "Health checks (401/404 also means the service answered, which is good):"
for path in /api/v1/auth /api/v1/players /api/v1/teams /; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost$path")"
  printf '  GET %-18s -> %s\n' "$path" "$code"
done

log "PM2 status:"
pm2 status

cat <<EOF

  DONE. Open $PUBLIC_URL in your browser.
  If you plan to log in via browser sessions, finish the HTTPS step (guide step 7)
  - production cookies are Secure and will not be sent over plain HTTP.
EOF
