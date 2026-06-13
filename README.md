# ani-desk

ani-desk is a Tauri desktop app for searching, saving, and watching anime from multiple providers.

## v1.0 Desktop

- Logo-led desktop UI with animated loading, dashboard shelves, and full history/My List pages
- Single-provider search with quick source switching
- Anime detail sheet with episode ranges, search, jump, and latest/first controls for long-running shows
- Continue Watching with local progress and My List favorites
- Built-in HLS/MP4 player through a localhost-only proxy
- Custom playback overlay with keyboard seeking, quality controls, subtitles, and mpv fallback
- Local migration from existing ani-tui config/database paths when ani-desk data is not present

## Demo

Check out the user interface and key features of `ani-desk` below:

### 1. Dashboard / Home Screen
![Dashboard](Screenshot%202026-06-13%20at%2023.01.49.png)
*The Home screen features a clean dashboard centered around a compact logo and a search command bar. It includes source provider tabs, a "Continue Watching" progress shelf, and a framed card layout showcasing the empty state of "My List".*

### 2. Continue Watching Shelf / History Grid
![Continue Watching Grid](Screenshot%202026-06-13%20at%2023.02.05.png)
*The full "Continue Watching" view offers an organized grid layout of all in-progress titles, allowing users to filter and sort titles by recency to quickly resume where they left off.*

### 3. Dual-Pane Search
![Dual-Pane Search](Screenshot%202026-06-13%20at%2023.02.17.png)
*The responsive search interface splits into a list of results on the left pane and a rich detail preview on the right pane. The preview includes high-resolution poster artwork, metadata tags, a full synopsis, and options to play or add the title to "My List".*

### 4. Custom Playback & mpv Fallback
![Custom Playback UI](Screenshot%202026-06-13%20at%2023.03.05.png)
*The native player overlay supports full-featured HLS/MP4 playback. It includes customized seek and volume controls, provider quality adjustments, subtitles, and a dedicated integration to open the stream externally in the high-performance `mpv` player.*

## Tech Stack

- Rust core: providers, SQLite storage, config migration, and mpv fallback
- Tauri v2: desktop shell and native command bridge
- React + TypeScript + Vite: frontend
- hls.js: in-app HLS playback
- Axum: localhost playback proxy

## Local Development

Prerequisites:

- Rust stable
- Node.js and npm
- Platform Tauri dependencies
- Optional: `mpv` for fallback playback

Install frontend dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm run tauri -- dev
```

Build the frontend:

```bash
npm run build
```

Build the Tauri app without creating installers:

```bash
npm run tauri -- build --debug --no-bundle
```

The debug app binary is written to:

```bash
target/debug/ani-desk
```

Regenerate app icons from the canonical logo:

```bash
npm run icons
```

Build a local macOS app/DMG:

```bash
npm run tauri -- build --bundles app,dmg
```

## Verification

```bash
npm run build
npm run check:icons
npm run check:release-version -- v1.0.0
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run tauri -- build --debug --no-bundle
```

## Install

You can download and install `ani-desk` using one of the following methods:

### 1. Direct Download (GitHub Releases)
You can download the pre-built, platform-specific binaries directly from the [GitHub Releases page](https://github.com/silent9669/ani-desk/releases):
- **macOS**: `ani-desk_1.0.0_aarch64.dmg` (Apple Silicon) or `ani-desk_1.0.0_x64.dmg` (Intel)
- **Windows**: `ani-desk_1.0.0_x64-setup.exe` or `ani-desk_1.0.0_x64.msi`
- **Linux**: `ani-desk_1.0.0_amd64.AppImage`, `ani-desk_1.0.0_amd64.deb`, or `ani-desk_1.0.0_x86_64.rpm`

*Note: Artifacts are unsigned for v1.0. macOS Gatekeeper and Windows SmartScreen may ask you to approve the first launch.*

### 2. Via Homebrew (macOS)
Install `ani-desk` as a native `.app` through Homebrew Cask:

```bash
brew install --cask silent9669/ani-desk/ani-desk
```

The cask template and generated placeholder live under:

```bash
packaging/homebrew/Casks/ani-desk.rb.template
packaging/homebrew/Casks/ani-desk.rb
```

For local release validation, keep the tap checkout at:

```bash
/Users/phucdang/Documents/homebrew-ani-desk
```

### 3. Direct Platform Install Helpers
Scripts are also available to assist with quick installation:
- **macOS**: `packaging/macos/install.sh`
- **Linux**: `packaging/linux/install.sh`
- **Windows (PowerShell)**: `packaging/windows/install.ps1`

## Data Migration

On first launch, ani-desk copies existing ani-tui local data if the new ani-desk paths do not exist yet. Migration copies files instead of deleting the old ani-tui data.

## Playback Notes

The in-app player uses a localhost-only proxy bound to `127.0.0.1`. The proxy creates opaque playback sessions and rewrites HLS playlists so provider-required headers can be applied safely by the Rust backend.

For fallback playback, ani-desk checks:

- `ANI_DESK_PLAYER`
- legacy `ANI_TUI_PLAYER`
- `mpv` / `mpv.exe` on PATH
- packaged Windows portable mpv locations

## Release

CI runs on the `master` branch. A pushed tag such as `v1.0.0` builds cross-platform Tauri bundles through GitHub Actions, uploads SHA256 files, and publishes the Homebrew cask to `silent9669/homebrew-ani-desk`.

Release publishing requires repository secret `HOMEBREW_TAP_TOKEN` with write access to `silent9669/homebrew-ani-desk`.

## Manual Smoke Test

After a local macOS bundle build:

1. Open the generated `.dmg` from `target/**/bundle/dmg/`.
2. Drag `ani-desk.app` to Applications.
3. Confirm Finder, Dock, and app switcher show the `logo.png` icon.
4. Launch ani-desk from Applications or Spotlight.
5. Smoke test source switching, search, anime detail, episode ranges, playback, history, My List, and mpv fallback if installed.

## License

MIT License
