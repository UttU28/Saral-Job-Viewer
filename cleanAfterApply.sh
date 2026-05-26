#!/usr/bin/env bash
# ----------- CRON/SCHEDULING QUICK GUIDE -----------
# Useful cron commands:
#   sudo systemctl restart cron
#   sudo systemctl status cron
#   crontab -l
#   crontab -e
#
# Give execute permission:
#   chmod +x /home/midhtechadmin/Desktop/Saral-Job-Viewer/cleanAfterApply.sh
#
# Nightly at 10:00 PM (server local timezone):
#   0 22 * * * /home/midhtechadmin/Desktop/Saral-Job-Viewer/cleanAfterApply.sh
#
# If your server is not on your timezone, pin timezone in crontab (example: Eastern):
#   CRON_TZ=America/New_York
#   0 22 * * * /home/midhtechadmin/Desktop/Saral-Job-Viewer/cleanAfterApply.sh
# ---------------------------------------------------
set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
composeFile="${repoRoot}/docker-compose.yml"

mkdir -p "${repoRoot}/zata/cron"
logFile="${repoRoot}/zata/cron/cleanAfterApply-$(date +%Y-%m-%d).log"
echo "======== $(date -Is) cleanAfterApply start pid=$$ repo=${repoRoot} ========" >>"${logFile}"
exec >>"${logFile}" 2>&1

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found on PATH" >&2
  exit 1
fi

if [[ ! -f "${composeFile}" ]]; then
  echo "error: docker-compose.yml not found at ${composeFile}" >&2
  exit 1
fi

echo "[step 1/2] apply jobs via validation mode -2"
docker compose -f "${composeFile}" run --rm --no-deps dvalidate -2

echo "[step 2/2] cleanup via validation mode -3 (delete unwanted + NULL, trim pastData >48h)"
docker compose -f "${composeFile}" run --rm --no-deps dvalidate -3

echo "cleanAfterApply completed successfully at $(date -Is)"
