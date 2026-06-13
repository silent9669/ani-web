#!/usr/bin/env bash
# Linux GUI installer for ani-desk.

set -euo pipefail

REPO="silent9669/ani-desk"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

status() {
    printf '[ani-desk] %s\n' "$1"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$1" >&2
        exit 1
    fi
}

download() {
    local url="$1"
    local output="$2"
    status "Downloading $(basename "$output")"
    curl --fail --location --progress-bar --output "$output" "$url"
}

latest_release() {
    curl --fail --silent --location "https://api.github.com/repos/${REPO}/releases/latest" |
        grep '"tag_name":' |
        sed -E 's/.*"([^"]+)".*/\1/'
}

install_appimage() {
    local tag="$1"
    local version="${tag#v}"
    local app_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
    local icon_dir="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
    local desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
    local appimage_path="${app_dir}/ani-desk.AppImage"
    local asset="ani-desk_${version}_amd64.AppImage"

    mkdir -p "$app_dir" "$icon_dir" "$desktop_dir"
    download "https://github.com/${REPO}/releases/download/${tag}/${asset}" "$appimage_path"
    chmod +x "$appimage_path"

    download "https://raw.githubusercontent.com/${REPO}/master/logo.png" "${icon_dir}/ani-desk.png"
    cat >"${desktop_dir}/ani-desk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ani-desk
Comment=Anime streaming desktop app
Exec=${appimage_path}
Icon=ani-desk
Terminal=false
Categories=AudioVideo;Video;Entertainment;
EOF

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$desktop_dir" || true
    fi

    status "Installed AppImage launcher. Open ani-desk from your app menu or run: ${appimage_path}"
}

require_command curl

ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ]; then
    printf 'Unsupported Linux architecture for prebuilt ani-desk artifacts: %s\n' "$ARCH" >&2
    exit 1
fi

TAG="$(latest_release)"
if [ -z "$TAG" ]; then
    printf 'Could not resolve latest ani-desk release.\n' >&2
    exit 1
fi

VERSION="${TAG#v}"

if ! command -v mpv >/dev/null 2>&1; then
    status "mpv is optional for fallback playback. Install it with your package manager."
fi

if command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1; then
    ASSET="ani-desk_${VERSION}_amd64.deb"
    PACKAGE_PATH="${TEMP_DIR}/${ASSET}"
    download "https://github.com/${REPO}/releases/download/${TAG}/${ASSET}" "$PACKAGE_PATH"
    status "Installing deb package"
    sudo apt-get install -y "$PACKAGE_PATH"
    status "Installation complete. Open ani-desk from your app menu."
elif command -v rpm >/dev/null 2>&1; then
    ASSET="ani-desk_${VERSION}_x86_64.rpm"
    PACKAGE_PATH="${TEMP_DIR}/${ASSET}"
    download "https://github.com/${REPO}/releases/download/${TAG}/${ASSET}" "$PACKAGE_PATH"
    status "Installing rpm package"
    sudo rpm -Uvh --replacepkgs "$PACKAGE_PATH"
    status "Installation complete. Open ani-desk from your app menu."
else
    status "No deb/rpm package manager found; installing AppImage launcher."
    install_appimage "$TAG"
fi
