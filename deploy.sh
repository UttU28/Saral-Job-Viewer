#!/usr/bin/env bash
# Saral Job Viewer — root deploy entrypoint.
#
#   ./deploy.sh                 # full stack (backend + UI + redis) via backend/deploy.sh
#   ./deploy.sh backend         # same as above
#   ./deploy.sh frontend        # UI image only via frontend/deploy.sh
#   ./deploy.sh frontend --build-only
#   ./deploy.sh all             # full stack (alias of backend)
#
# Scrapers are local-only — no deploy target.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-backend}"

case "$TARGET" in
  -h|--help)
    cat <<EOF
Usage: ./deploy.sh [backend|frontend|all] [extra args…]

  backend | all   Full Docker stack (default) → backend/deploy.sh
  frontend        Frontend container only     → frontend/deploy.sh

Examples:
  ./deploy.sh
  ./deploy.sh backend
  ./deploy.sh frontend
  ./deploy.sh frontend --build-only
EOF
    exit 0
    ;;
  backend|all|stack)
    shift || true
    exec bash "${ROOT}/backend/deploy.sh" "$@"
    ;;
  frontend|ui|front)
    shift
    exec bash "${ROOT}/frontend/deploy.sh" "$@"
    ;;
  *)
    # Unknown first arg — pass everything through to full-stack deploy
    # (preserves older "sudo ./deploy.sh" with no subcommand).
    exec bash "${ROOT}/backend/deploy.sh" "$@"
    ;;
esac
