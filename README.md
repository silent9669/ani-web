# ani-desk

ani-desk is a lightweight desktop anime browser and player built with Tauri, Rust, and React.

## Features

- AniList-powered discovery for trending, seasonal, genre, and catalog browsing.
- Provider-first search for playable anime, OVAs, and films that may not exist in AniList.
- Compact Netflix-style Home with Continue Watching, Trending Now, and My List.
- English and Vietnamese provider availability in Search.
- Certified fallback providers when a source is unavailable or CAPTCHA-gated.
- Episode chooser for long-running shows with 50-episode ranges, jump, search, resume, latest, and first actions.
- Built-in HLS/DASH/MP4 playback with subtitles, quality selection, keyboard shortcuts, and saved progress.
- My List, watch history, resume position, provider health, and structured error codes.
- Signed in-app update checks for installed releases.

## Providers

- English: AllAnime, AnimeGG, MovieBox.
- Vietnamese: KKPhim, OPhim, AnimeVietSub.

AniList is used for discovery and metadata. Playable search also queries providers directly, so Vietnamese films on KKPhim/OPhim can still appear even when AniList has no matching anime record.

Current live certification:

- Working: AnimeGG, KKPhim, OPhim.
- Health-gated: AllAnime (`PROVIDER_CAPTCHA`), MovieBox (`PROVIDER_UNAVAILABLE`), AnimeVietSub (`STREAM_NOT_FOUND`/AniMapper source unavailable).

AllAnime remains visible because ani-cli also tracks it upstream, but ani-desk does not bypass CAPTCHA or access controls.

## Install

Download installers from [GitHub Releases](https://github.com/silent9669/ani-desk/releases).

- macOS 15+ Apple Silicon: DMG or `brew install --cask silent9669/ani-desk/ani-desk`
- Windows x64: NSIS setup or MSI
- Linux x64: AppImage, deb, or rpm

Unsigned macOS builds require this once after copying the app to Applications:

```bash
xattr -cr /Applications/ani-desk.app
```

## Development

```bash
npm ci
npm run tauri dev
```

Build, release, architecture, and troubleshooting notes live in [`docs/`](docs/).
