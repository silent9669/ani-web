# UI/UX Redesign Plan

## Goal

Redesign `ani-desk` from its current functional UI into a premium, animated Netflix-clone experience — simple layout, powerful lightweight animations, with macOS 26 Liquid Glass support.

## Status: R1-R4 Implemented, v1.0.1 Release Polish Added

The previous agent session completed:
- [x] Codebase analysis and architecture mapping
- [x] E2E test suite design (74 test cases in `tests/e2e/`)
- [x] **Core Layout & Liquid Glass foundation** — compact fixed Home/Search/detail layout plus macOS transparent titlebar foundation
- [x] **Animated Search** — shared search-shell zoom, fixed search surface, independent result scrolling
- [x] **Episode Selection Page** — three-panel detail route with range rail, active episode list, poster/details, search, sort, jump, resume/latest/first
- [x] **Signed updater foundation** — in-app update prompt plus signed Tauri updater metadata for v1.0.1+
- [x] **macOS DMG polish** — dark/red drag-to-Applications background and `xattr -cr /Applications/ani-desk.app` unsigned-app guidance
- [ ] **Cross-platform release validation** — Windows/Linux bundles and tap brewbot run in GitHub release workflow

---

## R1. Dashboard Refinement

**Current state**: `HomeDashboard` component (App.tsx L445-555) already has:
- Compact command center with `logo.png`, wordmark, animated search trigger, and provider controls
- Provider chips
- Continue Watching row + always-visible My List row

**What to improve**:
- Implemented smooth entrance animations, shelf fade-ins, glass-backed controls, card hover effects, and shimmer loading.
- Home is fixed to the app viewport with a command/search surface plus Continue Watching and My List shelves.
- The previous large featured anime hero has been removed; artwork remains in cards, search preview, and detail pages.

---

## R2. Animated Search Experience

**Current state**: `SearchStage` component (App.tsx L648-774) already has:
- Dual-pane layout: left results list + right preview panel
- Provider chips for switching sources
- Auto-focus input on mount
- AnimatePresence transitions on preview panel

**What to improve**:
- Implemented shared `layoutId` zoom from the Home search trigger to the Search input shell.
- Search results now reveal with staggered motion and the preview panel has smoother scale/slide transitions.
- Search remains fixed to the viewport; only the left result pane scrolls.

---

## R3. Episode Selection Page

**Current state**: `DetailPage` is a dedicated route with:
- Left range rail for 50-episode chunks
- Middle active-range episode list with search, sort, and jump-to-episode
- Right vertical poster/details panel with synopsis, provider metadata, Resume, First, Latest, and My List actions

**What to change**:
- Converted from modal to a dedicated `detail` route with contextual Back navigation.
- Episode rows support thumbnails, range paging, search, first/latest sorting, exact jump/highlight, resume/latest/first actions, and internal pane scrolling.
- Only the active episode range is rendered.

---

## R4. macOS 26 Liquid Glass Design

**What to implement**:
- Use Tauri's native titlebar/window appearance APIs on macOS
- Add CSS `backdrop-filter: blur()` + translucent backgrounds matching Apple's Liquid Glass guidelines
- OS detection at runtime to conditionally apply Liquid Glass styles
- Fallback to solid dark theme (current `--bg: #050608`, `--panel: rgba(17,19,24,0.82)`) on Windows/Linux/older macOS

**Current foundation**:
- `titleBarStyle: "Transparent"`, hidden title, native decorations/traffic lights retained.
- Runtime platform classes enable macOS-scoped glass styling without breaking Windows/Linux fallback.
- Full transparent-window vibrancy is deferred because Tauri's macOS transparent window path requires the `macOSPrivateApi`/`macos-private-api` tradeoff.

---

## R5. CLI Launch

**Current state**: Desktop bundle release path exists for Apple Silicon macOS 15+ DMG/app, Windows NSIS/MSI, and Linux AppImage/deb/rpm. Homebrew Cask metadata exists at `packaging/homebrew/Casks/ani-desk.rb`, with tap-side files under `packaging/homebrew-tap/`. The local tap checkout for deployment validation is `/Users/phucdang/Documents/homebrew-ani-desk`.

**Verify**: Launch from Finder/Dock, Start Menu/taskbar, and Linux desktop launcher. The terminal command remains a developer fallback only.

---

## R6. Cross-Platform Stability

**Verify locally**:
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

GitHub release deployment is prepared through CI/CD but should run only after local UI and bundle smoke tests pass.

---

## Implementation Order

1. **Polish existing Dashboard** — animations, typography, gradients
2. **Search transition** — scale-up animation from hero trigger
3. **Episode page** — convert modal to route
4. **Liquid Glass** — Tauri window config + CSS conditionals
5. **Cross-platform verification** — build on macOS, check cargo cross-compile targets
6. **Desktop launch verification** — test Finder/Dock, Start Menu, and Linux launcher icons
