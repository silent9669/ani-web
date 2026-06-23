# ani-desk Status

Local workspace: `/Users/phucdang/Documents/ani-desk`
Remote target: `https://github.com/silent9669/ani-desk`

## Current Phase: v1.0.2 Release Validation (2026-06-23)

v1.0.2 is implemented locally and provider certification now has working English and Vietnamese playback paths. AllAnime still reports `NEED_CAPTCHA` from the upstream AllAnime/AllManga API and remains visible as the default English source, but it is health-gated with `PROVIDER_CAPTCHA` instead of being offered as playable while blocked. AnimeGG and MovieBox pass English playback certification. KKPhim and OPhim pass Vietnamese playback certification. AnimeVietSub is integrated but currently intermittent in live certification because AniMapper stream requests can time out. HiAnime, AnimeTVN, and Niniyo remain disabled by default until they pass the same live certification gate.

### Latest Changes (UI/UX Refinement Pass)

1. **App Icon Regeneration** — All platform icons regenerate from the current `logo.png`; the icon pipeline also refreshes `web/public/logo.png` for in-app branding.

2. **Catalog Home** — Home now contains exactly Continue Watching, Trending Now, and My List beneath the compact logo/search command row. Provider controls appear only in Search.

3. **Provider-Independent Discovery** — AniList IDs back catalog records, discovery, and favorites while legacy provider-keyed history remains compatible.

4. **Availability Search** — Search queries AniList once, separates English and Vietnamese choices, resolves providers concurrently with bounded timeouts and stale-response protection, and keeps unavailable titles browsable and saveable.

5. **Typed Diagnostics** — Provider and player failures use stable error codes, retryability, correlation IDs, redacted diagnostics, Copy, and Retry actions.

6. **Release Certification** — Release CI probes provider search, episodes, stream resolution, and playlist/media retrieval. Publishing is allowed only when at least one English provider passes; the current local gate passes AnimeGG and MovieBox.

6. **v1.0.1 Enhancements**:
   - **Signed Tauri Updater**: The desktop app checks signed GitHub release metadata, prompts users, downloads the updater artifact, installs it, and relaunches.
   - **Installer Polish**: macOS DMG config and docs now use the direct Applications flow with `xattr -cr /Applications/ani-desk.app` for unsigned builds.
   - **Vertical Dashboard Cards**: Continue Watching uses poster-oriented cards on Home, with hidden shelf scrollbars and watch progress pinned inside the image area.
   - **Three-Panel Episode Chooser**: Detail no longer uses a top hero banner; it keeps ranges, episodes, and vertical anime artwork visible in separate panels.
   - **Centered Single Watermark Background**: Replaced repeating/tiled backgrounds with a single centered watermark background logo to maintain a professional, minimalist aesthetic.
   - **Search UI Margin Adjustment**: Adjusted margins across the search layout to ensure a balanced, spacious, and pixel-perfect presentation.
   - **Framed Empty State for My List**: Nested the empty state message for the My List shelf in a clean, framed card container to match other grid modules and dashboard aesthetics.
   - **Navigation-First Continue Watching Click**: Clicking on Continue Watching items now navigates users to the respective Anime Detail page rather than immediately launching playback. This allows users to review the episode list, provider sources, and series description.
   - **Scroll to Last-Watched Episode**: The detail page automatically scrolls to and highlights the last-watched episode in the list, providing a seamless resume experience.
   - **Truncation Fix**: Applied CSS line-clamping and text-overflow truncation fixes to anime titles, metadata strings, and synopses to prevent layout breakage on long texts.

### Previous Phase: UI/UX Redesign (R1-R3 Implemented)

The 2026-06-13 UI/UX pass implemented the compact Netflix-style Home/Search/detail experience:
- Home and Search are fixed-height app surfaces with no page-level scroll.
- Search uses an animated shared search-shell transition, one active provider, independent result scrolling, and enriched preview metadata.
- Anime detail/episode browsing is now a dedicated `detail` route with Back navigation, internal episode scrolling, a range rail, search, sort, jump/highlight, resume/latest/first actions, and thumbnail-aware dense episode rows.
- macOS keeps native traffic-light controls with a transparent titlebar foundation and platform-scoped glass CSS; full private-API transparent-window vibrancy remains deferred.
- E2E mocks cover the current catalog/search/provider flow, including disabled AllAnime, certified English fallbacks, and Vietnamese providers.

## What Works Now (v1.0.2 candidate)

- Tauri v2 + React + TypeScript frontend builds and runs
- Rust core/provider/database code builds and tests pass
- Built-in HLS/MP4 playback proxy works
- AniList catalog discovery and search
- English playback through certified AnimeGG and MovieBox adapters
- Vietnamese playback through certified KKPhim and OPhim adapters, with AnimeVietSub available as an intermittent AniMapper-backed source
- AllAnime CAPTCHA detection and explicit unavailable status; uncertified HiAnime remains disabled
- Dashboard command center with exactly Continue Watching, Trending Now, and My List shelves
- Paginated catalog browser with genre, season/year, format, status, and sort controls
- Local personal-match scoring from My List and watch-progress genre affinity
- Dual-pane search with language selection and title-specific provider availability
- Structured compact diagnostics with stable error codes
- Detail route with scalable three-panel range rail + active episode list + poster/details panel
- Signed Tauri updater metadata and in-app update prompt for v1.0.1+
- Homebrew Cask metadata, real Tauri bundle release workflow, and platform install helpers exist for Apple Silicon macOS 15+, Windows, and Linux

## Verification

```bash
npm run build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo audit
npm audit --audit-level=high
npm run check:icons
npm run check:release-version -- v1.0.2
cargo run --example provider_certification -- --require-english
npm run tauri -- build --debug --no-bundle
TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/ani-desk-v1.key")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run tauri -- build --bundles app,dmg
```

## Run Locally

```bash
cd /Users/phucdang/Documents/ani-desk
npm run tauri -- dev
```

## Docs Index

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | Full codebase architecture, stack, IPC commands, code layout |
| `docs/REDESIGN_PLAN.md` | UI/UX redesign requirements R1-R6 with implementation order |
| `docs/CHANGELOG.md` | Release history |
| `docs/status.md` | This file — current project state |
