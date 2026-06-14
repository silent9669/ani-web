# ani-desk

<p align="center">
  <img src="logo.png" alt="ani-desk Logo" width="128" height="128">
</p>

`ani-desk` is a simple, modern Tauri desktop application designed for searching, saving, and watching anime from multiple providers.

---

## 🚀 Installation & Download

`ani-desk` is available for macOS, Windows, and Linux. Choose the installation method that fits your operating system.

### 🍏 macOS Installation (Recommended)

#### Option 1: Via Homebrew Cask (Easiest & Safest)
The recommended way to install and manage updates for `ani-desk` on macOS is via Homebrew:

```bash
brew install --cask silent9669/ani-desk/ani-desk
```

*Installing via Homebrew automatically registers the application and avoids Gatekeeper blocking issues.*

#### Option 2: Direct DMG Download
You can download the `.dmg` installer directly from the [GitHub Releases](https://github.com/silent9669/ani-desk/releases) page:
- **Apple Silicon (M1/M2/M3)**: `ani-desk_1.0.0_aarch64.dmg`
- **Intel**: `ani-desk_1.0.0_x64.dmg`

⚠️ **Apple Gatekeeper Bypass Instructions**  
Because direct DMG downloads are unsigned, macOS Gatekeeper will block the application on first launch and show a warning such as **"developer cannot be verified"** or **"app is damaged and cannot be opened"**. 

To bypass this and open the application, use one of the following methods:
1. **Manual Override**:
   - Locate `ani-desk.app` in your `/Applications` directory.
   - Right-click (or Control-click) the application icon and select **Open**.
   - A dialog will appear asking you to confirm; click **Open**.
2. **Terminal Command**:
   - Alternatively, open Terminal and run the following command to remove the quarantine attribute:
     ```bash
     xattr -cr /Applications/ani-desk.app
     ```

---

### 🪟 Windows Installation

Download the installers from the [GitHub Releases](https://github.com/silent9669/ani-desk/releases) page:
- **Standard Installer**: `ani-desk_1.0.0_x64-setup.exe`
- **MSI Package**: `ani-desk_1.0.0_x64.msi`

*Note: Windows SmartScreen may show a warning on first launch since the installer is unsigned. Click "More info" and then "Run anyway" to proceed.*

---

### 🐧 Linux Installation

Download the package for your distribution from the [GitHub Releases](https://github.com/silent9669/ani-desk/releases) page:
- **AppImage**: `ani-desk_1.0.0_amd64.AppImage`
- **Debian/Ubuntu**: `ani-desk_1.0.0_amd64.deb`
- **Fedora/RHEL**: `ani-desk_1.0.0_x86_64.rpm`

---

## 📺 Demo & Screenshots

Explore the user interface and key features of `ani-desk`:

### 1. Dashboard / Home Screen
![Dashboard](docs/images/Screenshot%202026-06-13%20at%2023.01.49.png)
*The Home screen features a clean dashboard centered around a compact logo and a search command bar. It includes source provider tabs, a "Continue Watching" progress shelf, and a framed card layout showcasing the empty state of "My List".*

### 2. Continue Watching Shelf / History Grid
![Continue Watching Grid](docs/images/Screenshot%202026-06-13%20at%2023.02.05.png)
*The full "Continue Watching" view offers an organized grid layout of all in-progress titles, allowing users to filter and sort titles by recency to quickly resume where they left off.*

### 3. Dual-Pane Search
![Dual-Pane Search](docs/images/Screenshot%202026-06-13%20at%2023.02.17.png)
*The responsive search interface splits into a list of results on the left pane and a rich detail preview on the right pane. The preview includes high-resolution poster artwork, metadata tags, a full synopsis, and options to play or add the title to "My List".*

### 4. Custom Playback & mpv Fallback
![Custom Playback UI](docs/images/Screenshot%202026-06-13%20at%2023.03.05.png)
*The native player overlay supports full-featured HLS/MP4 playback. It includes customized seek and volume controls, provider quality adjustments, subtitles, and a dedicated integration to open the stream externally in the high-performance `mpv` player.*

---

## ✨ Features

- **Logo-led desktop UI**: Animated loading, dashboard shelves, and full history/My List pages.
- **Single-provider search**: Fast source switching with instant previews.
- **Anime detail sheet**: Episode ranges, search, jump, and latest/first controls for long-running shows.
- **Continue Watching**: Local progress and My List favorites stored securely.
- **Built-in HLS/MP4 player**: Localhost-only proxy for seamless streaming.
- **Custom playback overlay**: Keyboard seeking, quality controls, subtitles, and mpv fallback.
- **Local migration**: Automatically imports existing `ani-tui` config and database paths.

---

## 🛠️ Tech Stack

- **Rust core**: providers, SQLite storage, config migration, and mpv fallback.
- **Tauri v2**: desktop shell and native command bridge.
- **React + TypeScript + Vite**: frontend interface.
- **hls.js**: in-app HLS playback.
- **Axum**: localhost playback proxy.

---

## 💻 Local Development

### Prerequisites
- Rust stable
- Node.js and npm
- Platform Tauri dependencies
- Optional: `mpv` for fallback playback

### Setup & Run
1. Install frontend dependencies:
   ```bash
   npm install
   ```
2. Run the desktop app in development mode:
   ```bash
   npm run tauri -- dev
   ```
3. Build the frontend:
   ```bash
   npm run build
   ```
4. Build the Tauri app without creating installers:
   ```bash
   npm run tauri -- build --debug --no-bundle
   ```
   *The debug app binary is written to `target/debug/ani-desk`.*

5. Regenerate app icons from the canonical logo:
   ```bash
   npm run icons
   ```
6. Build a local macOS app/DMG:
   ```bash
   npm run tauri -- build --bundles app,dmg
   ```

---

## 🔍 Verification & Testing

Verify your environment and changes using the following suite:
```bash
npm run build
npm run check:icons
npm run check:release-version -- v1.0.0
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run tauri -- build --debug --no-bundle
```

---

## 📦 Data Migration & Playback Notes

- **Data Migration**: On first launch, `ani-desk` copies existing `ani-tui` local data if the new `ani-desk` paths do not exist yet. Migration copies files instead of deleting the old `ani-tui` data.
- **Playback Proxy**: The in-app player uses a localhost-only proxy bound to `127.0.0.1`. The proxy creates opaque playback sessions and rewrites HLS playlists so provider-required headers can be applied safely by the Rust backend.
- **mpv Fallback**: For fallback playback, `ani-desk` checks `ANI_DESK_PLAYER`, legacy `ANI_TUI_PLAYER`, `mpv` / `mpv.exe` on PATH, or packaged Windows portable mpv locations.

---

## 🚢 CI/CD & Releases

CI runs on the `master` branch. A pushed tag such as `v1.0.0` builds cross-platform Tauri bundles through GitHub Actions, uploads SHA256 files, and publishes the Homebrew cask to `silent9669/homebrew-ani-desk`.

- **Cask template location**: `packaging/homebrew/Casks/ani-desk.rb.template`
- **Cask output location**: `packaging/homebrew/Casks/ani-desk.rb`
- **Homebrew tap checkout**: `/Users/phucdang/Documents/homebrew-ani-desk`
- Release publishing requires repository secret `HOMEBREW_TAP_TOKEN` with write access to `silent9669/homebrew-ani-desk`.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
