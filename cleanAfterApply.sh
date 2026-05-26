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
venvPython="${repoRoot}/venv/bin/python"
validationPy="${repoRoot}/validation.py"

mkdir -p "${repoRoot}/zata/cron"
logFile="${repoRoot}/zata/cron/cleanAfterApply-$(date +%Y-%m-%d).log"
echo "======== $(date -Is) cleanAfterApply start pid=$$ repo=${repoRoot} ========" >>"${logFile}"
exec >>"${logFile}" 2>&1

if [[ ! -x "${venvPython}" ]]; then
  echo "error: expected venv python at ${venvPython}" >&2
  exit 1
fi

if [[ ! -f "${validationPy}" ]]; then
  echo "error: validation.py not found at ${validationPy}" >&2
  exit 1
fi

echo "[step 1/2] apply jobs via validation mode -2"
"${venvPython}" "${validationPy}" -2

echo "[step 2/2] cleanup via validation mode -3 (delete unwanted + NULL, trim pastData >48h)"
"${venvPython}" "${validationPy}" -3

echo "cleanAfterApply completed successfully at $(date -Is)"
