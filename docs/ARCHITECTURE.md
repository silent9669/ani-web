# ani-desk Architecture

## Overview

`ani-desk` is a Tauri v2 desktop app — a Netflix-clone for watching anime from 3 providers (AllAnime, KKPhim, OPhim). It runs locally with no server dependency.

## Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend | React + TypeScript + Vite | `web/` |
| Animations | `framer-motion` | `web/src/App.tsx` |
| Icons | `lucide-react` | `web/src/App.tsx` |
| Video | `hls.js` (HLS streams), native `<video>` (MP4) | `web/src/App.tsx` |
| Backend | Rust (Tauri v2) | `src-tauri/` |
| Core Library | `ani-desk-core` (providers, config, SQLite DB) | `src/` |
| Desktop Shell | Tauri v2 IPC bridge | `src-tauri/src/main.rs` |
| Playback Proxy | Axum localhost-only proxy | `src/player.rs` |

## Code Layout

```
web/src/
├── App.tsx          # Route shell, dashboard/search/detail/player components
├── api.ts           # Tauri IPC invoke wrappers
├── types.ts         # TypeScript types (Source, Anime, Episode, Playback, etc.)
├── updater.ts       # Tauri updater check/install/relaunch helpers
├── main.tsx         # React root
└── styles.css       # Global Netflix-style layout, motion, and glass tokens

src/                 # Rust core library (ani-desk-core)
├── lib.rs
├── config.rs        # Config loading, migration from ani-tui
├── db.rs            # SQLite: watch history, favorites
├── error.rs
├── player.rs        # Axum playback proxy, mpv fallback
├── update.rs        # Legacy version/install metadata helpers
├── providers/       # AllAnime, KKPhim, OPhim scraper implementations
├── metadata/        # Anime metadata resolution
├── image/           # Image handling
└── bin/             # CLI binary entry point

src-tauri/
├── src/main.rs      # Tauri command registry
├── tauri.conf.json  # Window config (1440x900, min 1100x720)
├── capabilities/    # Tauri v2 capability permissions
└── icons/

packaging/
├── homebrew/Casks/ani-desk.rb  # Brew cask placeholder
├── macos/install.sh
├── linux/install.sh
└── windows/install.ps1
```

## Tauri IPC Commands (api.ts ↔ main.rs)

| Command | Returns | Description |
|---------|---------|-------------|
| `list_sources()` | `Source[]` | Enabled anime providers |
| `get_continue_watching(limit)` | `WatchHistory[]` | Watch history |
| `get_my_list(limit)` | `Favorite[]` | Favorited anime |
| `search_source(source, query)` | `Anime[]` | Search a provider |
| `get_anime_details(provider, id, title)` | `AnimeDetails` | Metadata (synopsis, banner) |
| `get_episodes(provider, id)` | `Episode[]` | Episode list |
| `prepare_playback(provider, episodeId)` | `Playback` | Resolve stream, start proxy |
| `open_in_mpv(provider, episodeId, startTime)` | `void` | Fallback to mpv |
| `save_progress(progress)` | `void` | Update watch history |
| `add_to_my_list(anime)` | `void` | Favorite an anime |
| `remove_from_my_list(animeId)` | `void` | Unfavorite |
| `remove_continue_watching(animeId)` | `void` | Delete from history |

## Current UI Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `home` | `HomeDashboard` | Fixed command center + Continue Watching shelf + centered My List shelf |
| `search` | `SearchStage` | Dual-pane: left results list, right preview panel |
| `detail` | `DetailPage` | Three-panel episode chooser: range rail, active episode list, poster/details |
| `continue` | `HistoryPage` | Full history grid with filter/sort |
| `my-list` | `MyListPage` | Full favorites grid with filter/sort |

Plus overlays:
- `VideoPlayer` — HLS/MP4 playback with custom controls

## Key Design Decisions

- **Single-file route surface**: Most UI components still live in `App.tsx` so route state, playback state, and motion transitions remain easy to follow.
- **CSS variables theme**: Dark theme defined in `:root` in `styles.css`. No CSS framework.
- **framer-motion**: Used for page transitions, card hover, shared search transition, and player enter/exit.
- **Provider chips**: Users can switch between 3 providers near the search bar.
- **Episode ranges**: For long-running shows (500+ episodes), episodes are chunked into ranges of 50.
- **Playback proxy**: Axum binds to 127.0.0.1, rewrites HLS playlists so provider headers are applied safely.
- **Signed updates**: Tauri updater checks GitHub `latest.json`, prompts in-app, installs signed updater artifacts, and relaunches.

## Verification Commands

```bash
npm run build
npm run check:icons
npm run check:release-version -- v1.0.1
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo audit
pytest tests/e2e
npm run tauri -- build --debug --no-bundle
TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/ani-desk-v1.key")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run tauri -- build --bundles app,dmg
```
