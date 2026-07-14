<div align="center">
  <img src="logo_curved.png" alt="ani-desk logo" width="128" style="border-radius: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</div>

## Installation

### macOS

Install with Homebrew:

```bash
brew install --cask silent9669/ani-desk/ani-desk
```

Or download the `.dmg` from [GitHub Releases](https://github.com/silent9669/ani-desk/releases/latest). If macOS says the app is damaged, run:

```bash
xattr -cr /Applications/ani-desk.app
```

### Windows

Download the `.msi` or `.exe` installer from [GitHub Releases](https://github.com/silent9669/ani-desk/releases/latest), then open it and follow the installer.

### Linux

Download the `.AppImage`, `.deb`, or `.rpm` package from [GitHub Releases](https://github.com/silent9669/ani-desk/releases/latest), then install it with your system's package manager.

## Web app

The responsive hosted edition is available at [ani-desk-web-production.up.railway.app](https://ani-desk-web-production.up.railway.app). Sign in with an account created by the ani-desk administrator. My List and watch progress are private to each account; browser downloads are saved through the browser's normal Downloads flow.

The native app keeps its own Apple-style offline library under `Downloads/ani-desk`, with play, reveal, missing-file detection, storage totals, and guarded deletion.

## Self-host on Railway

The repository includes a production `Dockerfile`, `railway.toml`, and `/api/health` check. Configure these service variables:

```text
ANI_DESK_ADMIN_USERNAME=root
ANI_DESK_ADMIN_PASSWORD=<a long unique password>
```

Mount a persistent volume at `/data` so accounts, sessions, My List, and watch history survive deployments. Railway automatically supplies `PORT`; do not override it.

For local hosted-mode testing:

```bash
npm ci
npm run build
ANI_DESK_ADMIN_PASSWORD='local-development-password' npm run serve:web
```
