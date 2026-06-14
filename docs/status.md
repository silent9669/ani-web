# ani-desk Status

Local workspace: `/Users/phucdang/Documents/ani-desk`
Remote target: `https://github.com/silent9669/ani-desk`

## Current Phase: v1.0.1 Updater, Installer, And Chooser Polish (2026-06-14)

### Latest Changes (UI/UX Refinement Pass)

1. **App Icon Regeneration** — All platform icons regenerate from the current `logo.png`; the icon pipeline also refreshes `web/public/logo.png` for in-app branding.

2. **Command Center Home** — The old featured anime hero was removed. Home now uses a compact logo + `ani-desk` wordmark + animated search command bar + provider controls, followed by fixed Continue Watching and My List shelves.

3. **Stable Shelves** — Continue Watching and My List always render on Home. Empty shelves use compact logo placeholders, and the Continue Watching progress bar now lives inside the thumbnail/banner area instead of overlapping episode text.

4. **Search & Episode UI/UX Polish** — Search keeps the fixed one-window layout with stronger command bar styling. Detail episodes now use a three-panel chooser: 50-episode range rail, active episode list, and vertical poster/details panel.

5. **Release Validation Prep** — The release workflow and Homebrew Cask packaging target Apple Silicon macOS 15+, Windows x64, and Linux x64 artifacts; the local tap checkout is expected at `/Users/phucdang/Documents/homebrew-ani-desk` when deployment validation begins.

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
- E2E mocks were updated to current providers: AllAnime, KKPhim, and OPhim.

## What Works Now (v1.0 baseline)

- Tauri v2 + React + TypeScript frontend builds and runs
- Rust core/provider/database code builds and tests pass
- Built-in HLS/MP4 playback proxy works
- 3 providers: AllAnime, KKPhim, OPhim
- Dashboard command center with logo/search/provider controls, vertical Continue Watching cards, and always-visible centered My List shelf
- Dual-pane animated search with fixed viewport layout and red accent borders
- Detail route with scalable three-panel range rail + active episode list + poster/details panel
- Signed Tauri updater metadata and in-app update prompt for v1.0.1+
- Homebrew Cask metadata, real Tauri bundle release workflow, and platform install helpers exist for Apple Silicon macOS 15+, Windows, and Linux

## Verification

```bash
npm run build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run check:icons
npm run check:release-version -- v1.0.1
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
