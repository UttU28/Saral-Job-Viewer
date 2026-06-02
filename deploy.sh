#!/usr/bin/env bash
# Build and deploy Saral Job Viewer.
#
#   https://saral.thatinsaneguy.com       → frontend
#   https://saral.thatinsaneguy.com/api/* → backend
#
# Requires SARAL_DOMAIN + SARAL_SSL_EMAIL in .env.
# DNS A record must point at this host before first SSL issuance.
#
# If host port 80 is already in use (e.g. system nginx for other sites), deploy
# installs a host vhost and uses certbot --nginx instead of Docker standalone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and fill in values."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

SARAL_DOMAIN="${SARAL_DOMAIN:-}"
SARAL_SSL_EMAIL="${SARAL_SSL_EMAIL:-}"
GENERATED_DIR="$ROOT/docker/generated"
NGINX_OUT="$GENERATED_DIR/nginx.saral.conf"
NGINX_TEMPLATE="$ROOT/docker/nginx.saral.conf.template"
HOST_NGINX_TEMPLATE="$ROOT/docker/nginx.saral.host.conf.template"
CERT_PATH="/etc/letsencrypt/live/${SARAL_DOMAIN}/fullchain.pem"
HOST_NGINX_SITE="/etc/nginx/sites-available/${SARAL_DOMAIN}"

if [[ -z "$SARAL_DOMAIN" ]]; then
  echo "SARAL_DOMAIN is required in .env (e.g. saral.thatinsaneguy.com)."
  exit 1
fi

mkdir -p "$GENERATED_DIR"

export VITE_API_URL="${VITE_API_URL:-https://${SARAL_DOMAIN}}"
export SARAL_API_BASE_URL="${SARAL_API_BASE_URL:-https://${SARAL_DOMAIN}}"

port_80_in_use() {
  ss -tln 2>/dev/null | grep -q ':80 '
}

host_cert_exists() {
  [[ -f "$CERT_PATH" ]]
}

docker_cert_exists() {
  docker compose run --rm --entrypoint test certbot -f "$CERT_PATH" 2>/dev/null
}

render_nginx_config() {
  if [[ ! -f "$NGINX_TEMPLATE" ]]; then
    echo "Missing nginx template: $NGINX_TEMPLATE"
    exit 1
  fi
  if ! command -v envsubst >/dev/null 2>&1; then
    echo "envsubst not found. Install gettext (e.g. pacman -S gettext)."
    exit 1
  fi
  export SARAL_DOMAIN
  envsubst '${SARAL_DOMAIN}' < "$NGINX_TEMPLATE" > "$NGINX_OUT"
}

require_root_for_host_nginx() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Port 80 is in use by host nginx. Re-run with sudo so deploy can install the vhost and run certbot:"
    echo "  sudo ./deploy.sh"
    exit 1
  fi
}

install_host_nginx_vhost() {
  if [[ ! -f "$HOST_NGINX_TEMPLATE" ]]; then
    echo "Missing host nginx template: $HOST_NGINX_TEMPLATE"
    exit 1
  fi
  if [[ -f "$HOST_NGINX_SITE" ]] && grep -q 'ssl_certificate' "$HOST_NGINX_SITE" 2>/dev/null; then
    echo "==> Host nginx vhost already has TLS: ${HOST_NGINX_SITE}"
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  export SARAL_DOMAIN
  envsubst '${SARAL_DOMAIN}' < "$HOST_NGINX_TEMPLATE" > "$tmp"

  if [[ -d /etc/nginx/sites-available ]]; then
    cp "$tmp" "$HOST_NGINX_SITE"
    mkdir -p /etc/nginx/sites-enabled
    ln -sf "$HOST_NGINX_SITE" "/etc/nginx/sites-enabled/${SARAL_DOMAIN}"
  elif [[ -d /etc/nginx/conf.d ]]; then
    cp "$tmp" "/etc/nginx/conf.d/${SARAL_DOMAIN}.conf"
  else
    rm -f "$tmp"
    echo "Could not find /etc/nginx/sites-available or /etc/nginx/conf.d"
    exit 1
  fi
  rm -f "$tmp"

  echo "==> Installed host nginx vhost for ${SARAL_DOMAIN}"
  nginx -t
  systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload
}

ensure_host_ssl_cert() {
  if host_cert_exists; then
    echo "==> SSL certificate already present on host for ${SARAL_DOMAIN}"
    return 0
  fi

  if [[ -z "$SARAL_SSL_EMAIL" ]]; then
    echo "SARAL_SSL_EMAIL is required in .env to obtain a Let's Encrypt certificate."
    exit 1
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    echo "certbot not found. Install it (e.g. pacman -S certbot certbot-nginx) and re-run deploy."
    exit 1
  fi

  echo "==> Obtaining Let's Encrypt certificate via host certbot (nginx plugin)..."
  echo "    (DNS must resolve to this server; host nginx serves ${SARAL_DOMAIN} on port 80.)"

  if certbot --nginx -d "$SARAL_DOMAIN" \
    --email "$SARAL_SSL_EMAIL" \
    --agree-tos --no-eff-email \
    --non-interactive --redirect 2>/dev/null; then
    :
  else
    printf '\nA\n1\n' | certbot --nginx -d "$SARAL_DOMAIN" --redirect || {
      echo "certbot failed — ensure DNS for ${SARAL_DOMAIN} points here and port 80 is reachable."
      exit 1
    }
  fi

  echo "==> Certificate issued for ${SARAL_DOMAIN}"
}

ensure_docker_ssl_cert() {
  if docker_cert_exists; then
    echo "==> SSL certificate already present for ${SARAL_DOMAIN}"
    return 0
  fi

  if [[ -z "$SARAL_SSL_EMAIL" ]]; then
    echo "SARAL_SSL_EMAIL is required in .env to obtain a Let's Encrypt certificate."
    exit 1
  fi

  echo "==> Obtaining Let's Encrypt certificate for ${SARAL_DOMAIN}..."
  echo "    (DNS must resolve to this server; port 80 must be free for certbot standalone.)"

  docker compose run --rm \
    -p 80:80 \
    --entrypoint certbot \
    certbot certonly \
    --standalone \
    -d "$SARAL_DOMAIN" \
    --email "$SARAL_SSL_EMAIL" \
    --agree-tos --no-eff-email \
    --non-interactive

  echo "==> Certificate issued for ${SARAL_DOMAIN}"
}

USE_HOST_NGINX=0
if port_80_in_use; then
  USE_HOST_NGINX=1
fi

echo "==> Deploying https://${SARAL_DOMAIN}"
if [[ "$USE_HOST_NGINX" -eq 1 ]]; then
  echo "==> Host port 80 in use — using system nginx + certbot (not Docker nginx on :80)"
  require_root_for_host_nginx
fi

echo "==> Building images..."
docker compose build
docker build -f docker/Dockerfile.validation -t saral-dvalidate:latest .

echo "==> Starting Redis, API, and frontend..."
docker compose up -d sjv-redis api frontend

if [[ "$USE_HOST_NGINX" -eq 1 ]]; then
  install_host_nginx_vhost
  ensure_host_ssl_cert
  nginx -t
  systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload
else
  if ! docker_cert_exists; then
    ensure_docker_ssl_cert
  fi
  render_nginx_config
  docker compose up -d nginx certbot
fi

echo ""
echo "Stack is up:"
echo "  Site:       https://${SARAL_DOMAIN}"
echo "  API:        https://${SARAL_DOMAIN}/api/"
if [[ "$USE_HOST_NGINX" -eq 1 ]]; then
  echo "  TLS:        host certbot (system timer renews certs)"
else
  echo "  Cert renew: saral-certbot container (checks every 12h)"
fi
echo ""
echo "Validation image ready (not started): saral-dvalidate:latest"
echo "  Trigger from Admin UI, or manually:"
echo "  docker run --rm --network saral-job-viewer_sjv-net --env-file .env saral-dvalidate:latest -1"
