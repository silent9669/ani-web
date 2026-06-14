#!/usr/bin/env bash
# macOS GUI installer for ani-desk.

set -euo pipefail

status() {
    printf '[ani-desk] %s\n' "$1"
}

if ! command -v brew >/dev/null 2>&1; then
    printf 'Homebrew is required for the supported macOS install path.\n' >&2
    printf 'Install Homebrew first: https://brew.sh\n' >&2
    exit 1
fi

ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
    printf 'ani-desk v1.0.1 supports Apple Silicon Macs only. Detected architecture: %s\n' "$ARCH" >&2
    exit 1
fi

status "Installing ani-desk.app with Homebrew Cask"
brew install --cask silent9669/ani-desk/ani-desk

if ! command -v mpv >/dev/null 2>&1; then
    status "mpv is optional for fallback playback. Recommended: brew install mpv"
fi

status "Installation complete. Launch ani-desk from Applications, Spotlight, or Launchpad."
status "Artifacts are unsigned. If macOS blocks first launch, run: xattr -cr /Applications/ani-desk.app"
