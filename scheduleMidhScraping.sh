#!/usr/bin/env bash
# ----------- POE PRE-COMMENTS FOR CRON/SCHEDULING -----------
# The following are useful system commands for managing cron jobs:
#
#   sudo systemctl restart cron      # Restart the cron service
#   sudo systemctl status cron       # Check status of the cron service
#   crontab -l                      # List current user's cron jobs
#   crontab -e                      # Edit current user's crontab
#
# Remember to give this script execute permissions if you haven't already:
#   chmod +x /home/midhtechadmin/Desktop/Saral-Job-Viewer/scheduleMidhScraping.sh
#
# Example cron (logs go to zata/cron/scrapingCron-YYYY-MM-DD.log inside this script):
#   0 6 * * * /home/midhtechadmin/Desktop/Saral-Job-Viewer/scheduleMidhScraping.sh
# ------------------------------------------------------------
# Run midhScraping.py with the repo venv. Intended for cron/systemd (no interactive shell).
set -euo pipefail

export DISPLAY=:0

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venvPython="${repoRoot}/venv/bin/python"

if [[ ! -x "${venvPython}" ]]; then
  echo "error: expected venv at ${repoRoot}/venv (run: python3 -m venv venv && ./venv/bin/pip install -r requirements.txt)" >&2
  exit 1
fi

mkdir -p "${repoRoot}/zata/cron"
logFile="${repoRoot}/zata/cron/scrapingCron-$(date +%Y-%m-%d).log"
echo "======== $(date -Is) scheduleMidhScraping start pid=$$ repo=${repoRoot} ========" >>"${logFile}"
exec >>"${logFile}" 2>&1
exec "${venvPython}" "${repoRoot}/midhScraping.py" "${@:-0}"

