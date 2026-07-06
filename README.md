<div align="center">
  <img src="logo_curved.png" alt="ani-desk logo" width="128" style="border-radius: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <h1>ani-desk</h1>
  <p><strong>A modern, lightweight desktop anime browser and player.</strong></p>
</div>

<br />

<div align="center">
  <img src="docs/demo.png" alt="ani-desk Demo" width="100%" style="border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
</div>

<br />

## 🚀 Download & Installation

### macOS 

The easiest and recommended way to install on macOS is via **Homebrew**. Because of Apple's Gatekeeper, downloading the DMG directly from your browser will result in an "app is damaged" error since it's an ad-hoc signed app. 

```bash
brew install --cask silent9669/ani-desk/ani-desk
```

> **Note:** If you manually download the DMG and face the "app is damaged" error, run this in your terminal:
> `xattr -cr /Applications/ani-desk.app`

### Windows & Linux

Download the latest installer from the [GitHub Releases](https://github.com/silent9669/ani-desk/releases) page.
- **Windows**: Download the `.msi` or `.exe` installer.
- **Linux**: Download the `.AppImage`, `.deb`, or `.rpm`.

---

## ✨ Features

- **Provider-First Search**: Fast and accurate search directly querying your favorite providers, improved by your watch history.
- **Compact UI**: Modern, glass-morphism inspired home page with Trending, Continue Watching, and My List sections.
- **Built-in Player**: HLS/DASH/MP4 playback with subtitles, quality selection, and saved progress.
- **Cross-Platform**: Available on macOS, Windows, and Linux via Tauri.
