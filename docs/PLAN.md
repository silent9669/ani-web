# Implementation Plan: ani-desk UI/UX Redesign & Upgrade

This plan maps the steps to implement several UI/UX and feature improvements for the `ani-desk` Tauri/React desktop app.

## Milestones Summary

| Milestone | Target | Description | Status |
|-----------|--------|-------------|--------|
| **Milestone 1** | App Icon & Branding | Fix case sensitivity in `prepare-icon-source.mjs`, run Tauri icon generator, verify icons, and update in-app header to red-black film icon styling. | DONE |
| **Milestone 2** | My List Functionality | Star toggle buttons inside DetailPage/SearchStage, hover star buttons/overlays on card components, and star/trash button functionality in My List view. | DONE |
| **Milestone 3** | Continue Watching | Widescreen landscape banners for HistoryCard items, hover play/delete/star button overlay. | DONE |
| **Milestone 4** | Search & Episode Selection | Spacing, alignment, typography polish, and smooth animations/transitions. | DONE |
| **Milestone 5** | Liquid Glass Design | Translucent backgrounds and blur filters universally, utilize macOS vibrancy detection, border/shadow styling. | DONE |
| **Milestone 6** | E2E Verification | Ensure all tests (cargo, check:icons, pytest E2E) and build succeed. | PLANNED |

---

## Detailed Task Breakdown

### Milestone 1: App Icon and Branding (R1)
1. **File Casing Fix**: Edit `scripts/prepare-icon-source.mjs` to open `logo.png` (lowercase) since that matches the actual file in the repository root.
2. **App Icon Generation**: Run `npm run icons` to generate the multi-resolution desktop app icons in `src-tauri/icons`.
3. **App Icon Verification**: Verify generated files are correctly populated via `npm run check:icons`.
4. **In-App Branding**: Update `HomeDashboard` in `web/src/App.tsx` (lines 526-529). Replace the img element using `LOGO_SRC` with a Lucide `Film` icon (`<Film size={20} className="text-red-500" />`) and the text "ani-desk". Maintain red-black theme.

### Milestone 2: My List Functionality (R2)
1. **Star Buttons replacement**:
   - In `DetailPage` (lines 1129-1132), replace `Plus` and `Check` icons with Lucide `Star` icons. Solid/filled star if the anime is in My List, outlined star if not.
   - In `SearchStage` preview pane, similarly replace `Plus` and `Check` with `Star` icons.
2. **Card Hover Overlay Star**:
   - In `AnimeCard` and `HistoryCard`, render a star overlay button at the top-right (out of standard flow) when hovered or permanently visible on small touch screens. Allow toggling favorited state from the card.
3. **My List View (MyListPage)**:
   - Ensure the trash button deletes items from history/favorites.
   - Ensure the star button removes items from favorites.

### Milestone 3: Continue Watching Improvements (R3)
1. **Landscape Banners**:
   - Update `HistoryCard` CSS styling in `web/src/styles.css`. Change the card height, width, and aspect ratio to 16:9 landscape aspect ratio.
   - Set cover image to use `object-fit: cover` to prevent distortion of vertical poster images when cropped to landscape.
2. **Hover Actions**:
   - Add hover overlays on `HistoryCard` landscape banner.
   - On hover, reveal a delete button (calling `remove_continue_watching`) and a star button (toggling favorite state).
   - Ensure a play icon is displayed in the center on hover to indicate resumes.

### Milestone 4: Search and Episode Selection UI/UX Polish (R4)
1. **Layout & Spacing Improvements**:
   - Polish padding, margins, and gaps in `.search-layout`, `.search-results-pane`, `.search-preview`, `.detail-page-shell`, and `.episode-grid`.
   - Improve alignment and typography scales.
2. **Smooth Animations**:
   - Refine Framer Motion transition properties on search and episode filters.
   - Add subtle hover transformations (e.g., slight scaling and vertical translation).

### Milestone 5: Liquid Glass Design (R6)
1. **Translucent Backgrounds & Blurs**:
   - Apply `--glass-panel` background and `--glass-blur` backdrop filter universally to sidebar, search preview, search results, detail pages, and player bars.
   - Match Apple's Liquid Glass guidelines (macos 26 design language).
2. **Conditional Styling**:
   - Ensure `platform-macos` class is loaded correctly and applies enhanced translucent border overlays.

### Milestone 6: Final Verification
1. **Frontend Compilation**: Run `npm run build`.
2. **Rust Compilation**: Run `cargo clippy --workspace --all-targets -- -D warnings`.
3. **Tests**: Run `cargo test --workspace` and the pytest suite `pytest tests/e2e`.
