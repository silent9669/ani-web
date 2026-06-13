# Project: ani-desk Red-Black & Liquid Glass Redesign

## Architecture
- **React Frontend**: Web application using React, TypeScript, Vite, Lucide-React, and Framer Motion (`web/src/App.tsx`, `web/src/styles.css`).
- **Tauri / Rust Backend**: Multi-platform wrapper using Tauri v2 (`src-tauri/src/main.rs`, `src/db.rs`, `Cargo.toml`).
- **Data Store**: SQLite database managed via Rust (`src/db.rs`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | App Icon & Branding | Fix casing in `prepare-icon-source.mjs`, run icon generation, verify via `npm run check:icons`, update UI header with film icon and red-black theme. | None | DONE |
| 2 | My List (R2) | Replace `Plus`/`Check` with solid/outline `Star` icons in DetailPage/SearchStage, add star overlay buttons on card hover, verify MyListPage deletions. | M1 | DONE |
| 3 | Continue Watching (R3) | Transition HistoryCard to wide landscape banners, add hover play overlay, hover delete and hover star button actions. | M2 | DONE |
| 4 | Search & Episode Polish (R4) | Spacing, typography, alignment fixes, and smooth layout/hover transitions in search/episode grids. | M3 | DONE |
| 5 | Liquid Glass Design (R6) | Apply translucent backgrounds and blur filters universally, utilize macOS vibrancy detection, polish borders and shadows. | M4 | DONE |
| 6 | E2E Testing & Final Verification | Verification via `npm run build`, `cargo test`, `cargo clippy`, and Playwright E2E tests (`pytest`). | M5 | PLANNED |

## Interface Contracts
- **Tauri Commands**:
  - `add_to_my_list(anime_id, provider, title, cover_url)`
  - `remove_from_my_list(anime_id)`
  - `get_my_list()`
  - `remove_continue_watching(anime_id)`
  - `get_continue_watching()`
- **Local Database**: Favorites (`favorites` table) and watch history (`watch_history` table) tables persist across launches.

## Code Layout
- Frontend code: `web/src/App.tsx` (state and page views), `web/src/styles.css` (animations, layout, typography).
- Rust code: `src-tauri/src/main.rs` (Tauri commands), `src/db.rs` (SQLite operations).
- Scripts: `scripts/prepare-icon-source.mjs` (icon preparation), `scripts/check-generated-icons.mjs` (icon checker).
