#!/bin/bash
#
# Saral Job Viewer — full stack deploy (Docker FastAPI backend + PM2 Vite frontend + nginx + SSL).
# Run from repo root: sudo ./deploy.sh
#
# Backend: Docker image from docker/Dockerfile.api (app.py + utils/), listens on 8000 inside the container.
# Frontend: ./frontend via PM2 (vite preview behind nginx).
#
# Uses fixed ports by default (no auto-random/scan):
#   backend: 37211
#   frontend: 37213
# Override only if needed: SARAL_BACKEND_PORT / SARAL_FRONTEND_PORT.

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_header() { echo -e "${BLUE}$1${NC}"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DOMAIN="${SARAL_DOMAIN:-saral.thatinsaneguy.com}"
NGINX_TEMPLATE="$SCRIPT_DIR/nginx-saral.conf"
NGINX_STAGED="/tmp/nginx-saral.${DOMAIN}.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
SARAL_API_IMAGE="${SARAL_API_IMAGE:-saral-job-viewer-api:latest}"
SARAL_API_CONTAINER="${SARAL_API_CONTAINER:-saral-job-viewer-api}"
GCP_SA_HOST_PATH="${SARAL_GCP_SA_PATH:-$SCRIPT_DIR/gcp-sa.json}"
GCP_SA_CONTAINER_PATH="/app/secrets/gcp-sa.json"

# --- port helpers: prefer odd ports, avoid collisions ---
port_in_use() {
    local p="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tlnH 2>/dev/null | grep -qE ":${p}\b" && return 0
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -tln 2>/dev/null | grep -qE ":${p}\s" && return 0
    fi
    return 1
}

DEFAULT_BACKEND_PORT="8004"
DEFAULT_FRONTEND_PORT="8005"
BACKEND_PORT="${SARAL_BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
FRONTEND_PORT="${SARAL_FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"

print_header "🧹 Cleaning existing Saral services..."
# Stop/remove previous Saral API container first so fixed backend port can be reused.
if command -v docker >/dev/null 2>&1; then
    docker rm -f "$SARAL_API_CONTAINER" >/dev/null 2>&1 || true
fi
# Remove previous Saral frontend PM2 app so fixed frontend port can be reused.
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete saral-frontend >/dev/null 2>&1 || true
    pm2 delete saral-backend >/dev/null 2>&1 || true
fi

if port_in_use "$BACKEND_PORT"; then
    print_error "Backend port $BACKEND_PORT is already in use. Stop conflicting service or set SARAL_BACKEND_PORT."
    exit 1
fi
if port_in_use "$FRONTEND_PORT"; then
    print_error "Frontend port $FRONTEND_PORT is already in use. Stop conflicting service or set SARAL_FRONTEND_PORT."
    exit 1
fi

print_header "🔢 Ports: host $BACKEND_PORT → API container :8000 | frontend PM2 $FRONTEND_PORT"

# --- Docker (backend) ---
if ! command -v docker &>/dev/null; then
    print_error "Docker is not installed. Install Docker and retry."
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    print_error "Docker daemon not reachable. Start Docker or add your user to the docker group."
    exit 1
fi

print_header "🐳 Backend: build & run Docker ($SARAL_API_CONTAINER)..."
if [[ ! -f "$SCRIPT_DIR/docker/Dockerfile.api" ]]; then
    print_error "Missing docker/Dockerfile.api"
    exit 1
fi

docker build -f "$SCRIPT_DIR/docker/Dockerfile.api" -t "$SARAL_API_IMAGE" "$SCRIPT_DIR"

docker rm -f "$SARAL_API_CONTAINER" >/dev/null 2>&1 || true

DOCKER_RUN=(docker run -d
    --name "$SARAL_API_CONTAINER"
    --restart unless-stopped
    -p "${BACKEND_PORT}:8000"
)
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    DOCKER_RUN+=(--env-file "$SCRIPT_DIR/.env")
else
    print_warn "No .env in repo root — API needs MONGODB_URI etc. Pass envs or add .env before deploy."
fi
DOCKER_RUN+=(-e "GOOGLE_APPLICATION_CREDENTIALS=${GCP_SA_CONTAINER_PATH}")
if [[ -f "$GCP_SA_HOST_PATH" ]]; then
    print_status "Mounting GCP service account key: $GCP_SA_HOST_PATH -> $GCP_SA_CONTAINER_PATH"
    DOCKER_RUN+=(-v "$GCP_SA_HOST_PATH:$GCP_SA_CONTAINER_PATH:ro")
else
    print_warn "Service account key not found at $GCP_SA_HOST_PATH. Cloud Run triggers will fail until this file exists."
fi
DOCKER_RUN+=("$SARAL_API_IMAGE")

"${DOCKER_RUN[@]}"

# --- PM2 (frontend only) ---
if ! command -v pm2 &>/dev/null; then
    print_error "PM2 is not installed. Install: npm install -g pm2"
    exit 1
fi

print_header "🧹 PM2 cleanup (saral-frontend; remove old saral-backend if any)..."
pm2 delete saral-backend >/dev/null 2>&1 || true
pm2 delete saral-frontend >/dev/null 2>&1 || true

FRONTEND_DIR="$SCRIPT_DIR/frontend"
if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    print_error "frontend/package.json missing"
    exit 1
fi

print_header "📦 Frontend: npm install..."
cd "$FRONTEND_DIR"
npm install --silent 2>/dev/null || npm install

# Production: leave VITE_API_URL unset so requests use relative /api/...
export VITE_API_URL=""
print_header "🏗️  Frontend: npm run build..."
npm run build

cd "$SCRIPT_DIR"

ECOSYSTEM="$SCRIPT_DIR/ecosystem.saral.config.cjs"
ESC_FE="${FRONTEND_DIR//\\/\\\\}"

cat >"$ECOSYSTEM" <<EOF
/** Generated by deploy.sh — frontend only; API runs in Docker */
module.exports = {
  apps: [
    {
      name: "saral-frontend",
      cwd: "${ESC_FE}",
      script: "npm",
      args: "run preview -- --host 0.0.0.0 --port ${FRONTEND_PORT}",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
    },
  ],
};
EOF

print_header "🚀 PM2: starting saral-frontend..."
pm2 start "$ECOSYSTEM"
pm2 save >/dev/null 2>&1 || true

# --- nginx from template ---
echo ""
print_header "🌐 Nginx ($DOMAIN)"

if [[ ! -f "$NGINX_TEMPLATE" ]]; then
    print_error "Missing $NGINX_TEMPLATE"
    exit 1
fi

sed -e "s/__BACKEND_PORT__/${BACKEND_PORT}/g" -e "s/__FRONTEND_PORT__/${FRONTEND_PORT}/g" \
    "$NGINX_TEMPLATE" >"$NGINX_STAGED"

if ! command -v nginx &>/dev/null; then
    print_warn "nginx not installed. PM2 apps are running; configure nginx manually:"
    echo "  sudo cp $NGINX_STAGED $NGINX_AVAILABLE"
    echo "  sudo ln -sf $NGINX_AVAILABLE $NGINX_ENABLED"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
    echo "  printf '\\nA\\n1\\n' | sudo certbot --nginx -d $DOMAIN"
else
    if [[ "$EUID" -ne 0 ]] && [[ -z "${SUDO_USER:-}" ]]; then
        print_warn "Not root — copy nginx config manually:"
        echo "  sudo cp $NGINX_STAGED $NGINX_AVAILABLE"
        echo "  sudo ln -sf $NGINX_AVAILABLE $NGINX_ENABLED"
        echo "  sudo rm -f /etc/nginx/sites-enabled/default"
        echo "  sudo nginx -t && sudo systemctl reload nginx"
        echo "  printf '\\nA\\n1\\n' | sudo certbot --nginx -d $DOMAIN"
    else
        print_status "Installing nginx site..."
        cp "$NGINX_STAGED" "$NGINX_AVAILABLE"
        ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

        print_status "nginx -t"
        if nginx -t >/dev/null 2>&1; then
            systemctl reload nginx >/dev/null 2>&1 || service nginx reload >/dev/null 2>&1 || true
            print_status "nginx reloaded"
        else
            print_error "nginx -t failed — fix config at $NGINX_AVAILABLE"
            exit 1
        fi

        echo ""
        print_header "🔒 SSL (certbot)"
        if ! command -v certbot &>/dev/null; then
            print_warn "certbot missing; install (e.g. apt install certbot python3-certbot-nginx) then:"
            echo "  printf '\\nA\\n1\\n' | sudo certbot --nginx -d $DOMAIN"
        else
            CERTBOT_EMAIL_ARGS=()
            if [[ -n "${SARAL_CERTBOT_EMAIL:-}" ]]; then
                CERTBOT_EMAIL_ARGS=(--email "$SARAL_CERTBOT_EMAIL")
            fi
            if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --keep-until-expiring "${CERTBOT_EMAIL_ARGS[@]}" 2>/dev/null; then
                print_status "SSL OK (non-interactive)"
            else
                print_status "Trying certbot with piped prompts..."
                printf '\nA\n1\n' | certbot --nginx -d "${DOMAIN}" 2>/dev/null || \
                    print_warn "certbot may need manual run for $DOMAIN"
            fi
            nginx -t >/dev/null 2>&1 && (systemctl reload nginx >/dev/null 2>&1 || service nginx reload >/dev/null 2>&1 || true)
        fi
    fi
fi

# Persist chosen ports for operators
PORTS_FILE="$SCRIPT_DIR/.deploy-ports.env"
umask 077
cat >"$PORTS_FILE" <<EOF
# Written by deploy.sh — source or re-export for debugging
SARAL_DOMAIN=$DOMAIN
SARAL_BACKEND_PORT=$BACKEND_PORT
SARAL_FRONTEND_PORT=$FRONTEND_PORT
EOF
chmod 600 "$PORTS_FILE" 2>/dev/null || true

echo ""
print_header "✅ Deploy finished"
print_status "Local:  http://127.0.0.1:${FRONTEND_PORT} (UI)  http://127.0.0.1:${BACKEND_PORT}/api/health (API via Docker)"
print_status "Public: https://${DOMAIN}/  and  https://${DOMAIN}/api/"
print_status "Ports saved: $PORTS_FILE"
print_status "pm2 status | pm2 logs saral-frontend"
print_status "docker ps | docker logs -f ${SARAL_API_CONTAINER}"
