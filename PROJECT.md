# Project: ani-desk DMG Installer & Homebrew CD Automation

## Architecture
- React Frontend: Web application using React, TypeScript, Vite, Lucide-React, and Framer Motion.
- Tauri / Rust Backend: Multi-platform wrapper using Tauri v2.
- GitHub Actions CI/CD: Workflows to automate release compilation for macOS, Windows, and Linux, and automatically update the homebrew-ani-desk cask.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Installer Aesthetics & DMG Config | Generate a custom DMG background image incorporating the app's logo, place it in packaging/macos/, and configure tauri.conf.json. | None | DONE |
| 2 | Modern README & Demo Images | Redesign README.md, move screenshots to docs/images/, update screenshot links, and add Homebrew cask installation instructions. | None | DONE |
| 3 | Homebrew Tap CD Automation | Update release workflow to fix macOS Intel runner label to macos-13, download artifacts, and run generate-homebrew-cask.rb with local hashing support to update Casks/ani-desk.rb. Use gh CLI to set up repository secrets. | None | DONE |
| 4 | Cross-Platform Build & Verification | Verify Tauri build matrix outputs (macOS DMG, Windows MSI/EXE, Linux AppImage/DEB) and run local checks/tests. | M1, M2, M3 | DONE |

## Interface Contracts
- Tauri Configuration: bundle.macOS.dmg.background pointing to the custom DMG background.
- Homebrew Cask format: Casks/ani-desk.rb template in packaging/homebrew/Casks/ani-desk.rb.template.

## Code Layout
- Frontend code: web/src/
- Rust code: src-tauri/
- Workflows: .github/workflows/
- Packaging config: packaging/
- Scripts: scripts/
