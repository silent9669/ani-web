#!/bin/sh
set -eu

DEPLOY_SCRIPT="${ANI_DESK_DEPLOY_SCRIPT:-/srv/ani-desk/deployer/pull-deploy.sh}"
STATE_DIR="${ANI_DESK_STATE_DIR:-/srv/ani-desk/state}"
LOG_FILE="${ANI_DESK_DEPLOY_LOG:-$STATE_DIR/deploy.log}"
MAX_LOG_BYTES="${ANI_DESK_DEPLOY_LOG_MAX_BYTES:-5242880}"

mkdir -p "$STATE_DIR"

if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE")" -gt "$MAX_LOG_BYTES" ]; then
  tail -n 2000 "$LOG_FILE" >"$LOG_FILE.tmp"
  mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

"$DEPLOY_SCRIPT" >>"$LOG_FILE" 2>&1
