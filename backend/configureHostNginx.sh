#!/usr/bin/env bash
# Deprecated — routing/TLS moved to homeLabOps (Ingress + cert-manager).
# Use: sudo ~/Desktop/homeLabOps/scripts/configureEdgeNginx.sh
set -euo pipefail

homeLabOpsRoot="${homeLabOpsRoot:-${HOME}/Desktop/homeLabOps}"
echo "Saral nginx config now lives in homeLabOps (org-style GitOps)."
exec "${homeLabOpsRoot}/scripts/configureEdgeNginx.sh" "$@"
