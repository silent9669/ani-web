# ani-desk Architecture

## Overview

`ani-desk` is a private anime client with two delivery targets that share one
React interface and one Rust core: a Tauri v2 desktop application and an
authenticated hosted web service for a small family. Both use AniList for
discovery and query each playback provider as a separate catalog.

## Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend | React + TypeScript + Vite | `web/` |
| Animations | `framer-motion` | `web/src/App.tsx` |
| Icons | `lucide-react` | `web/src/App.tsx` |
| Video | `hls.js` (HLS), `dashjs` (DASH), native `<video>` (MP4) | `web/src/App.tsx` |
| Backend | Rust (Tauri v2) | `src-tauri/` |
| Hosted Backend | Axum HTTP server, cookie sessions, admin-managed users | `server/` |
| Core Library | `ani-desk-core` (providers, config, SQLite DB) | `src/` |
| Desktop Shell | Tauri v2 IPC bridge | `src-tauri/src/main.rs` |
| Playback Proxy | Axum media proxy for desktop and authenticated hosted routes | `src/player.rs`, `server/` |

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
├── providers/       # AllAnime, AnimeGG, MovieBox, KKPhim, OPhim, AnimeVietSub, and gated adapters
├── metadata/        # Anime metadata resolution
├── image/           # Image handling
└── bin/             # CLI binary entry point

src-tauri/
├── src/main.rs      # Tauri command registry
├── tauri.conf.json  # Window config (1440x900, min 1100x720)
├── capabilities/    # Tauri v2 capability permissions
└── icons/

server/
└── src/main.rs      # Hosted HTTP API, auth/session boundary, static web delivery

compose.yaml         # Loopback-only homelab container service
Dockerfile           # Reproducible web + Rust server image
tokens.css           # Shared Hallmark design tokens and theme variants

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
| `get_discovery()` | `DiscoveryCatalog` | AniList trending and seasonal rails |
| `get_genre_catalog(genre)` | `CatalogAnime[]` | AniList genre rail |
| `search_catalog(query)` | `CatalogAnime[]` | Provider-independent AniList catalog search |
| `resolve_availability(catalogId, title, language?)` | `ProviderAvailability[]` | Match a catalog title to enabled providers |
| `list_provider_health()` | `Source[]` | Cached provider capabilities and health |
| `retry_provider_health()` | `Source[]` | Refresh provider health checks |
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
| `settings` | `SettingsPage` | Provider defaults, health recovery, themes, and family access |
| `admin` | `AdminPage` | Hosted admin-only family account management |

Plus overlays:
- `VideoPlayer` — HLS/MP4 playback with custom controls

## Key Design Decisions

- **Single-file route surface**: Most UI components still live in `App.tsx` so route state, playback state, and motion transitions remain easy to follow.
- **CSS variables theme**: The locked Obsidian Cinema system lives in root `tokens.css`; `styles.css` consumes semantic tokens. No CSS framework.
- **framer-motion**: Used for page transitions, card hover, shared search transition, and player enter/exit.
- **Availability controls**: Search separates English and Vietnamese choices, shows direct provider results before AniList catalog matches, and enables only providers that can play the selected title.
- **Episode ranges**: For long-running shows (500+ episodes), episodes are chunked into ranges of 50.
- **Playback proxy**: Desktop playback binds locally. Hosted playback rewrites HLS/DASH manifests to opaque, user-bound proxy routes so provider headers and upstream media URLs stay server-side.
- **Provider certification**: AllAnime remains visible/default and supports manual recovery when changing request crypto or Cloudflare blocks direct access. AnimeGG and MovieBox are certified English fallbacks; KKPhim and OPhim are certified Vietnamese providers. Retired duplicate/broken adapters are excluded from the active registry.
- **Private hosted boundary**: The web server requires a signed HttpOnly session for application APIs, keeps provider requests server-side, and is intended to sit behind HTTPS on a reverse proxy or private overlay network.
- **One-repository delivery**: Desktop bundles and the homelab container are independent build targets in this repository so provider, UI, and database behavior do not drift.
- **Signed updates**: Tauri updater checks GitHub `latest.json`, prompts in-app, installs signed updater artifacts, and relaunches.

## Verification Commands

```bash
npm run build
npm run check:icons
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo audit
cargo run --example provider_certification -- --require-english
pytest tests/e2e
docker compose config --quiet
docker compose build
./script/build_and_run.sh --verify
```

Release signing and deployment are deliberately separate from this local
verification list. See `HOMELAB_OPERATIONS.md` for deployment, networking,
monitoring, backup, update, and rollback procedures.
