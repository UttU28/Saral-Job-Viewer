#!/usr/bin/env bash
# Build and (re)deploy Saral Job Viewer frontend only (Docker saral-ui).
#
#   ./frontend/deploy.sh
#   ./deploy.sh frontend
#   ./frontend/deploy.sh --build-only
#
# Docker: repo-root docker-compose.yml + docker/Dockerfile.frontend
# Env: backend/.env (SARAL_DOMAIN / VITE_API_URL)
set -euo pipefail

FRONTEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${FRONTEND_ROOT}/.." && pwd)"
BACKEND_ROOT="${REPO_ROOT}/backend"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step()   { echo -e "${BLUE}[saral-ui]${NC} $*"; }
info()   { echo -e "${GREEN}[saral-ui]${NC} $*"; }
warn()   { echo -e "${YELLOW}[saral-ui]${NC} $*" >&2; }
err()    { echo -e "${RED}[saral-ui]${NC} $*" >&2; }
banner() {
  echo ""
  echo -e "${CYAN}================================================================================${NC}"
  echo -e "${CYAN} $*${NC}"
  echo -e "${CYAN}================================================================================${NC}"
  echo ""
}

BUILD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [--build-only]

  (default)     docker compose build + up frontend (saral-ui :9261)
  --build-only  npm ci && npm run build into frontend/dist (no Docker)

Env: backend/.env (SARAL_DOMAIN, VITE_API_URL, SARAL_API_BASE_URL)
Compose: ${REPO_ROOT}/docker-compose.yml
EOF
      exit 0
      ;;
    *)
      err "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

if [[ ! -f "${BACKEND_ROOT}/.env" ]]; then
  err "Missing ${BACKEND_ROOT}/.env — copy from backend/.env.example"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${BACKEND_ROOT}/.env"
set +a

SARAL_DOMAIN="${SARAL_DOMAIN:-saral.thatinsaneguy.com}"
export VITE_API_URL="${VITE_API_URL:-https://${SARAL_DOMAIN}}"
export SARAL_API_BASE_URL="${SARAL_API_BASE_URL:-https://${SARAL_DOMAIN}}"

if [[ ! -f "${FRONTEND_ROOT}/package.json" ]]; then
  err "Missing frontend/package.json"
  exit 1
fi

START_TS=$(date +%s)
banner "Saral frontend deploy"
info "VITE_API_URL=${VITE_API_URL}"

if [[ "$BUILD_ONLY" -eq 1 ]]; then
  banner "Local npm build"
  cd "$FRONTEND_ROOT"
  if [[ -f package-lock.json ]]; then
    step "npm ci…"
    npm ci
  else
    step "npm install…"
    npm install
  fi
  step "npm run build…"
  npm run build
  if [[ ! -d dist ]]; then
    err "Build failed — frontend/dist not found"
    exit 1
  fi
  ELAPSED=$(( $(date +%s) - START_TS ))
  banner "Frontend build done (${ELAPSED}s)"
  info "Output: ${FRONTEND_ROOT}/dist"
  info "Docker image was not rebuilt. Run without --build-only to refresh saral-ui."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is required (or use --build-only for a local npm build)."
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/docker-compose.yml" ]]; then
  err "Missing ${REPO_ROOT}/docker-compose.yml"
  exit 1
fi

cd "$REPO_ROOT"

banner "Docker frontend"
step "Building saral-ui image…"
docker compose build frontend

step "Recreating frontend container…"
docker compose up -d frontend

ELAPSED=$(( $(date +%s) - START_TS ))
banner "Frontend deploy summary (${ELAPSED}s)"
info "Container: saral-ui"
info "Loopback:  http://127.0.0.1:9261/"
info "Public:    https://${SARAL_DOMAIN}/"

cat <<EOF

Useful:
  docker compose -f ${REPO_ROOT}/docker-compose.yml ps frontend
  docker compose -f ${REPO_ROOT}/docker-compose.yml logs -f frontend
EOF
