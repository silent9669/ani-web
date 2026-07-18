# UI/UX Redesign Plan

## Goal

Redesign `ani-desk` from its current functional UI into a premium, animated Netflix-clone experience — simple layout, powerful lightweight animations, with macOS 26 Liquid Glass support.

## Status: R1-R7 Implemented, v1.0.10 Desktop Review Build

The previous agent session completed:
- [x] Codebase analysis and architecture mapping
- [x] E2E test suite design (101 collected cases in `tests/e2e/`; current local result: 100 passed, 1 expected failure)
- [x] **Core Layout & Liquid Glass foundation** — compact fixed Home/Search/detail layout plus macOS transparent titlebar foundation
- [x] **Animated Search** — restrained opacity transitions, fixed desktop workbench, contained two-step mobile results/preview flow, and independent result scrolling
- [x] **Episode Selection Page** — three-panel desktop route and single-column mobile picker with one combined episode finder, range rail, sort, resume/latest/first
- [x] **Signed updater foundation** — in-app update prompt plus signed Tauri updater metadata for v1.0.1+
- [x] **macOS DMG polish** — dark/red drag-to-Applications background and `xattr -cr /Applications/ani-desk.app` unsigned-app guidance
- [x] **AniList catalog Home/Search** — provider-independent discovery with language and availability selection in Search
- [x] **Provider health and typed errors** — cached health, retry, stable codes, redacted diagnostics, and correlation IDs
- [x] **English playback certification** — AnimeGG and MovieBox pass the multi-title live media gate; repaired AllAnime passes One Piece but remains limited for titles without a playable upstream source
- [x] **Responsive family web app** — authenticated hosted UI, provider-specific search, settings, user management, and phone/desktop navigation
- [x] **Desktop Cinema 2.0** — rotating cinematic feature stage, separated content rails, provider-first search, three-pane episode workbench, and distraction-free player controls
- [ ] **Release validation** — intentionally deferred until the local app is reviewed; no tag, push, deployment, or release workflow should run yet

---

## R1. Dashboard Refinement

**Current state**: `HomeDashboard` now has:
- Native-only cinematic feature artwork with an honest Resume or View episodes action
- A compact command surface for provider-first Search, My List, Downloads, and Settings
- Continue Watching, Trending, and seasonal/genre Explore rows
- Provider controls are intentionally absent from Home

**What changed**:
- The feature stage rotates through local Continue Watching entries first and AniList Trending entries second; AniList is not used to populate local history.
- Continue Watching is the first populated rail and is separated from the stage by a clear rule and its own content region.
- Glass is reserved for navigation and actions. Artwork and poster rails stay solid for contrast and performance.
- The essential feature content and primary action fit inside a 1280×800 first screen, and reduced-motion mode uses opacity-only feedback.
- Missing remote artwork falls back to the black-background ani-desk mark instead of browser broken-image chrome.

---

## R2. Animated Search Experience

**Current state**: `SearchStage` component (App.tsx L648-774) already has:
- Dual-pane layout: left results list + right preview panel
- Language switch and title-specific provider availability
- Auto-focus input on mount
- AnimatePresence transitions on preview panel

**Implemented**:
- Search uses opacity-only feedback instead of a large shared-layout zoom.
- The selected provider and persistent query remain the primary search context.
- Desktop results scroll inside their pane; mobile uses a contained Results → Preview flow with a reliable back control.

---

## R3. Episode Selection Page

**Current state**: `DetailPage` is a dedicated route with:
- Left range rail for 50-episode chunks
- Middle active-range episode list with one combined title/number finder and sort controls
- Right vertical poster/details panel with synopsis, provider metadata, Resume, First, Latest, and My List actions

**What to change**:
- Converted from modal to a dedicated `detail` route with contextual Back navigation.
- Episode rows support thumbnails, range paging, title filtering, numeric Enter-to-jump/highlight, first/latest sorting, resume/latest/first actions, and internal pane scrolling.
- Only the active episode range is rendered.

---

## R4. macOS 26 Liquid Glass Design

**What to implement**:
- Use Tauri's native titlebar/window appearance APIs on macOS
- Add CSS `backdrop-filter: blur()` + translucent backgrounds matching Apple's Liquid Glass guidelines
- OS detection at runtime to conditionally apply Liquid Glass styles
- Fallback to the tokenized Obsidian Cinema dark theme on Windows/Linux/older macOS

**Current foundation**:
- `titleBarStyle: "Transparent"`, hidden title, native decorations/traffic lights retained.
- Runtime platform classes enable macOS-scoped glass styling without breaking Windows/Linux fallback.
- Full transparent-window vibrancy is deferred because Tauri's macOS transparent window path requires the `macOSPrivateApi`/`macos-private-api` tradeoff.

---

## R5. CLI Launch

**Current state**: Desktop bundle release path exists for Apple Silicon macOS 15+ DMG/app, Windows NSIS/MSI, and Linux AppImage/deb/rpm. Homebrew Cask metadata exists at `packaging/homebrew/Casks/ani-desk.rb`, with tap-side files under `packaging/homebrew-tap/`. The local tap checkout for deployment validation is `/Users/phucdang/Documents/homebrew-ani-desk`.

**Provider certification**: AllAnime remains the default English source and has the current encrypted request/decryption flow plus manual Cloudflare recovery. Its One Piece flow passes real media, while the tested Kimi no Na wa entry currently has no playable upstream source. AnimeGG and MovieBox pass the English multi-title gate. KKPhim and OPhim pass Vietnamese playback certification. Retired duplicate/broken adapters remain outside the active registry.

**Verify**: Launch from Finder/Dock, Start Menu/taskbar, and Linux desktop launcher. The terminal command remains a developer fallback only.

---

## R6. Cross-Platform Stability

**Verify locally**:
```bash
npm run build
npm run check:icons
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo audit
cargo run --example provider_certification -- --require-english
pytest tests/e2e
npm run tauri -- build --debug --no-bundle
npm run tauri -- build --debug --bundles app
```

GitHub release deployment is prepared through CI/CD but must remain untouched until the local UI and app bundle are reviewed.

---

## R7. Desktop-first product split

The current repository intentionally supports two editions from the same React route tree:

- `edition-desktop`: macOS, Windows, and Linux native application. Includes downloads, local player fallback, cinematic Home, and desktop workbenches.
- `edition-web`: authenticated hosted edition. Keeps login, private per-user data, and the admin console; desktop-only download behavior remains absent.

The future homelab repository will be named `ani-web`. Do not copy the current CSS blindly. Reuse `design.md`, `tokens.css`, provider-first search semantics, authentication contracts, and server architecture as context, then redesign the hosted routes in that repository when explicitly requested.

---

## Implementation Order

1. **Polish existing Dashboard** — animations, typography, gradients
2. **Search transition** — scale-up animation from hero trigger
3. **Episode page** — convert modal to route
4. **Liquid Glass** — Tauri window config + CSS conditionals
5. **Cross-platform verification** — build on macOS, check cargo cross-compile targets
6. **Desktop launch verification** — test Finder/Dock, Start Menu, and Linux launcher icons
