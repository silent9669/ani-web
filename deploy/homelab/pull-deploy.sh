#!/usr/bin/env bash
set -Eeuo pipefail

REPO_SLUG="${ANI_DESK_REPO_SLUG:-silent9669/ani-web}"
REPO_URL="${ANI_DESK_REPO_URL:-https://github.com/silent9669/ani-web.git}"
BRANCH="${ANI_DESK_DEPLOY_BRANCH:-master}"
WORKFLOW="${ANI_DESK_CI_WORKFLOW:-ci.yml}"
SOURCE_DIR="${ANI_DESK_SOURCE_DIR:-/srv/ani-desk/app}"
CONFIG_FILE="${ANI_DESK_CONFIG_FILE:-/srv/ani-desk/config/ani-desk.env}"
STATE_DIR="${ANI_DESK_STATE_DIR:-/srv/ani-desk/state}"
DATA_DIR="${ANI_DESK_DATA_DIR_HOST:-/srv/ani-desk/data}"
BACKUP_DIR="${ANI_DESK_BACKUP_DIR:-/srv/ani-desk/backups}"
HEALTH_URL="${ANI_DESK_HEALTH_URL:-https://ani.dangphuc.me/api/health}"
COMPOSE_PROJECT="${ANI_DESK_COMPOSE_PROJECT:-homelab}"
DATA_GUARD="${ANI_DESK_DATA_GUARD:-/srv/ani-desk/deployer/data-guard.py}"

log() {
  printf '%s ani-desk-deploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    log "missing required command: $1"
    exit 1
  }
}

for command in curl docker flock git jq python3 tar; do
  require_command "$command"
done

[[ -r "$CONFIG_FILE" ]] || {
  log "Compose environment file is not readable: $CONFIG_FILE"
  exit 1
}

[[ -r "$DATA_GUARD" ]] || {
  log "database guard is not readable: $DATA_GUARD"
  exit 1
}

mkdir -p "$(dirname "$SOURCE_DIR")" "$STATE_DIR" "$BACKUP_DIR"

exec 9>"$STATE_DIR/deploy.lock"
if ! flock -n 9; then
  log "another deployment check is already running"
  exit 0
fi

database_snapshot() {
  python3 "$DATA_GUARD" snapshot "$DATA_DIR/web.db"
}

verify_database_snapshot() {
  python3 "$DATA_GUARD" verify "$1" "$2"
}

api_url="https://api.github.com/repos/${REPO_SLUG}/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&event=push&status=completed&per_page=1"
run_json="$(curl --fail --silent --show-error --location \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  "$api_url")"

approved_sha="$(jq -er '.workflow_runs[0].head_sha' <<<"$run_json")"
conclusion="$(jq -er '.workflow_runs[0].conclusion' <<<"$run_json")"
run_url="$(jq -er '.workflow_runs[0].html_url' <<<"$run_json")"

if [[ "$conclusion" != "success" ]]; then
  log "latest completed CI run is not successful: $conclusion ($run_url)"
  exit 0
fi

if [[ ! "$approved_sha" =~ ^[0-9a-f]{40}$ ]]; then
  log "GitHub returned an invalid commit SHA"
  exit 1
fi

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  log "creating isolated deployment checkout"
  git clone --filter=blob:none --no-checkout "$REPO_URL" "$SOURCE_DIR"
fi

git -C "$SOURCE_DIR" fetch --quiet --prune origin "refs/heads/${BRANCH}"
remote_sha="$(git -C "$SOURCE_DIR" rev-parse FETCH_HEAD)"
if [[ "$remote_sha" != "$approved_sha" ]]; then
  log "CI-approved SHA does not match origin/${BRANCH}; waiting for CI on $remote_sha"
  exit 0
fi

deployed_sha=""
if [[ -r "$STATE_DIR/deployed.sha" ]]; then
  deployed_sha="$(tr -d '[:space:]' <"$STATE_DIR/deployed.sha")"
fi

if [[ "$deployed_sha" == "$approved_sha" ]] && curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
  log "already running CI-approved commit $approved_sha"
  exit 0
fi

previous_sha="$deployed_sha"
if [[ -z "$previous_sha" ]] && git -C "$SOURCE_DIR" rev-parse --verify HEAD >/dev/null 2>&1; then
  previous_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
fi

compose() {
  ANI_DESK_ENV_FILE="$CONFIG_FILE" docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --env-file "$CONFIG_FILE" \
    --file "$SOURCE_DIR/deploy/homelab/compose.yml" \
    "$@"
}

wait_for_health() {
  local _
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

deployment_started=0
backup_path=""
failed_data_path=""
rollback() {
  local failed_status="$?"
  trap - ERR
  if [[ "$deployment_started" == "1" && "$previous_sha" =~ ^[0-9a-f]{40}$ ]] && \
     git -C "$SOURCE_DIR" cat-file -e "${previous_sha}^{commit}" 2>/dev/null; then
    log "deployment failed; rolling back to $previous_sha"
    compose stop ani-desk || true
    if [[ -n "$backup_path" && -f "$backup_path" && -d "$DATA_DIR" ]]; then
      failed_data_path="$BACKUP_DIR/failed-data-$(date -u +%Y%m%dT%H%M%SZ)"
      log "preserving failed data at $failed_data_path and restoring pre-deploy backup"
      mv "$DATA_DIR" "$failed_data_path"
      tar -C "$(dirname "$DATA_DIR")" -xzf "$backup_path"
    fi
    git -C "$SOURCE_DIR" checkout --quiet --detach "$previous_sha"
    compose build ani-desk
    compose up -d ani-desk caddy
    if wait_for_health; then
      printf '%s\n' "$previous_sha" >"$STATE_DIR/deployed.sha"
      log "rollback health check passed"
    else
      log "rollback completed but health check still fails"
    fi
  fi
  exit "$failed_status"
}
trap rollback ERR

log "deploying CI-approved commit $approved_sha ($run_url)"
git -C "$SOURCE_DIR" checkout --quiet --detach "$approved_sha"
compose build ani-desk

deployment_started=1
compose stop ani-desk
before_snapshot="$(database_snapshot)"
if [[ "$(jq -r '.integrity // "ok"' <<<"$before_snapshot")" != "ok" ]]; then
  log "database integrity check failed before deployment"
  false
fi
backup_name="data-${approved_sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
if [[ -d "$DATA_DIR" ]]; then
  backup_path="$BACKUP_DIR/$backup_name"
  log "backing up stopped application data to $backup_path"
  tar -C "$(dirname "$DATA_DIR")" -czf "$backup_path" "$(basename "$DATA_DIR")"
fi
compose up -d ani-desk caddy
wait_for_health
after_snapshot="$(database_snapshot)"
verify_database_snapshot "$before_snapshot" "$after_snapshot"
printf '%s\n' "$before_snapshot" >"$STATE_DIR/data-before.json"
printf '%s\n' "$after_snapshot" >"$STATE_DIR/data-after.json"

printf '%s\n' "$approved_sha" >"$STATE_DIR/deployed.sha"
printf '%s\n' "$run_url" >"$STATE_DIR/approved-run.url"
deployment_started=0
trap - ERR

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'data-*.tar.gz' -print0 \
  | xargs -0 -r ls -1t 2>/dev/null \
  | tail -n +8 \
  | xargs -r rm -f

log "deployment and public health verification succeeded"
