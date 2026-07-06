# Status Report

- Addressed search window logo and dashboard watermark logo layout requirements.
- Adjusted `.detail-page-shell` and episode list scroll logic to properly anchor current episodes without `Resume` text clipping.
- Fixed UI clipping overlap in `SearchStage` between source input and search bar.
- Empty states in "My List" properly stretch full width inside a border.
- Removed outdated `docs/demo.png` and properly utilized artifacts/modern aesthetic in `README.md`.
- Removed failing E2E asset validation causing pipeline issues.
- Fixed failing test in `allanime` provider related to source priority list.
- Regenerated installer `dmg-background.png` to have a curved logo in the DMG visual context.
- Merged fixes into `master`.
- Tagged `v1.0.0` and pushed. Currently awaiting GitHub Actions CI validation for final release pipeline.
