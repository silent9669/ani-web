#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="ani-desk"
BUNDLE_ID="com.silent9669.ani-desk"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/target/debug/bundle/macos/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This entrypoint builds and launches the macOS app and must run on macOS." >&2
  exit 1
fi

case "$MODE" in
  run|--debug|debug|--logs|logs|--telemetry|telemetry|--verify|verify)
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

cd "$ROOT_DIR"
npm run tauri -- build --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'

if [[ ! -x "$APP_BINARY" ]]; then
  echo "The expected app binary was not created at $APP_BINARY" >&2
  exit 1
fi

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    for _ in {1..20}; do
      if pgrep -x "$APP_NAME" >/dev/null; then
        echo "$APP_NAME launched successfully from $APP_BUNDLE"
        exit 0
      fi
      sleep 1
    done
    echo "$APP_NAME did not remain running after launch." >&2
    exit 1
    ;;
esac
