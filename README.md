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

The responsive hosted edition is available at [ani.dangphuc.me](https://ani.dangphuc.me). Sign in with an account created by the ani-desk administrator. My List and watch progress are private to each account; browser downloads are saved through the browser's normal Downloads flow.

The native app keeps its own Apple-style offline library under `Downloads/ani-desk`, with play, reveal, missing-file detection, storage totals, and guarded deletion.

### Private homelab

For a private family deployment, keep the desktop and hosted targets in this
repository and use the loopback-bound Compose service behind Tailscale Serve or
a TLS reverse proxy. The command-line deployment, monitoring, backup, restore,
update, rollback, and incident procedures are in
[`docs/HOMELAB_OPERATIONS.md`](docs/HOMELAB_OPERATIONS.md).

## Local macOS trial

On macOS, the Codex Run action and this command use the same repeatable flow:

```bash
./script/build_and_run.sh
```

It stops an older ani-desk process, builds a debug `.app` bundle without release
updater signing, and opens the fresh bundle. Use `--verify` to additionally
confirm that the launched process remains alive:

```bash
./script/build_and_run.sh --verify
```
