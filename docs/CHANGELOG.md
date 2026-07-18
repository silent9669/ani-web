# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Added MovieBox as a certified English provider with provider-first catalog search.
- Added an Obsidian Cinema interface with split family login, responsive side/bottom navigation, provider settings, appearance variants, and bundled fonts.
- Added a loopback-only homelab Compose target and command-line deployment, monitoring, backup, restore, update, rollback, and incident documentation.
- Added one repeatable macOS build, launch, log, debug, and process-verification entrypoint, wired to the Codex Run action.
- Added a desktop-only cinematic feature stage, live provider-health rail, and Netflix/Apple TV content rhythm while preserving the hosted edition for the later `ani-web` redesign.
- Added desktop layout checks at 1280×800 and an explicit reduced-motion path that keeps route feedback while removing spatial animation.
- Added an eight-second Home feature rotation that starts with local Continue Watching entries, then uses AniList only for Trending discovery, with pause, previous/next, hover/focus pause, and reduced-motion safeguards.
- Added compact/comfortable/large interface sizing and Manrope, Noto Sans, and system reading-font preferences with Vietnamese glyph coverage.

### Fixed
- Repaired the current AllAnime encrypted request and response flow while retaining manual Cloudflare recovery.
- Restored the black favicon background across generated web icon sizes.
- Replaced upstream media addresses in hosted playback responses and rewritten manifests with opaque, user-bound proxy tokens.
- Deferred HLS and DASH player engines until playback starts, reducing the initial web JavaScript payload from about 862 KB to 353 KB.
- Kept macOS release proc-macro libraries loadable by disabling Cargo's release-time stripping.
- Filtered empty OPhim trailer records from episode counts and removed provider HTML from synopsis text.
- Removed provider HTML from KKPhim synopsis text, added broken-artwork fallback to the black ani-desk mark, and kept the detail workbench clear of the floating desktop navigation rail.
- Separated Continue Watching from the feature stage, removed the provider health card from navigation, and contained the mobile Search results/preview steps so hidden panes cannot intercept taps.
- Consolidated episode filtering and numeric navigation into one finder, and added compact `−10 seconds` / `+10 seconds` playback feedback without enlarging the timeline.

### Security
- Kept hosted provider headers and media addresses server-side, with authenticated six-hour playback sessions and opaque resource lookup.
- Invalidated every existing family-account session when an administrator resets that account's password.

## [1.0.9] - 2026-07-14
### Added
- Added a persistent Apple-style desktop download library with play, reveal, missing-file detection, storage totals, and guarded deletion.
- Added a responsive hosted web edition with secure accounts, admin user management, per-user My List and watch history, authenticated playback proxying, and browser downloads.
- Added Railway container deployment with persistent data storage and production health checks.

### Changed
- Extended the red-and-black Apple design across the dashboard, search, account, admin, download, episode, and player surfaces, including mobile layouts.
- Kept player metadata compact at the lower-left and removed repeated generic episode labels so titles do not cover subtitles.
- Split CI into focused quality, responsive browser, cross-platform desktop, production container, and dependency-audit jobs for faster diagnosis.

## [1.0.8] - 2026-07-13
### Added
- Added episode downloads from search previews and the episode chooser, with visible progress and completed-file feedback.
- Added native direct-media downloads and HLS segment assembly into the user's `Downloads/ani-desk` folder.

### Changed
- Rebuilt the video player around an Apple-inspired full-window layout with floating glass controls, centered transport, persistent volume, picture-in-picture, and a bottom metadata timeline.
- Refined search, detail, and player transitions with spring-based shared-layout motion and smoother open/close states.
- Modernized search and episode surfaces with layered glass panels, softer depth, and responsive controls.

## [1.0.3] - Unreleased
### Changed
- Search is provider-first again: choose language/provider first, keep the same query while switching providers, and show only the selected provider's results to reduce source confusion.
- AniList catalog search remains available for discovery/enrichment but no longer mixes catalog titles into the primary provider result list.

## [1.0.2] - 2026-06-23
### Added
- Added AniList-backed Trending, seasonal, genre, and catalog search experiences.
- Added cached provider health, manual retry, availability resolution, structured error codes, and correlation IDs.
- Added AnimeGG and MovieBox English adapters plus AniMapper-backed AnimeVietSub for Vietnamese playback.
- Added AniMapper adapters for its documented AnimeTVN and Niniyo identifiers behind disabled config flags until they pass certification.
- Added a release-blocking live provider certification probe for search, episode listing, stream resolution, and playlist/media retrieval.
- Added non-destructive catalog IDs to history and favorites for cross-provider matching.
- Added a paginated catalog browser with genre, season/year, format, status, and personal-match sorting.
- Added local personal-match scoring from saved-title and watch-progress genre affinity.

### Changed
- Removed provider controls from Home; language and provider selection now live in Search.
- Reworked Search so provider-direct results are shown before AniList catalog matches, allowing provider-only films to remain searchable.
- Made provider availability concurrent, cached, timeout-bounded, and protected from stale title/language responses.
- Simplified the player chrome into unframed floating controls, bottom-edge progress, vertical volume, and compact quality/subtitle menus.
- Changed Home to exactly Continue Watching, Trending Now, and My List; catalog posters now prefill Search.
- Kept AllAnime visible as the default English source but unavailable when it reports `NEED_CAPTCHA`; HiAnime remains disabled until it passes live stream certification.
- Tightened provider title matching so availability and certification reject unrelated playable search results.

### Release Gate
- v1.0.2 requires at least one certified English provider. Current local certification passes AnimeGG for English and KKPhim/OPhim for Vietnamese, reports MovieBox as `PROVIDER_UNAVAILABLE` (`miss token`), reports AnimeVietSub as unavailable when AniMapper stream source resolution fails, and reports AllAnime as `PROVIDER_CAPTCHA`.

## [1.0.1] - 2026-06-14
### Added
- Added signed Tauri updater support with in-app update prompt, download progress, install, and relaunch.
- Added release generation for `latest.json` updater metadata and signed updater artifacts.

### Changed
- Redesigned Home shelves around vertical poster cards, hidden scrollbars, and centered empty My List state.
- Replaced the episode detail hero with a three-panel chooser for 50-episode ranges, active episode list, and poster/details.
- Refined macOS DMG artwork and first-launch guidance around `xattr -cr /Applications/ani-desk.app`.

## [3.8.4] - 2026-06-06
### Fixed
- Hardened Windows playback by adding mpv TLS compatibility flags, detached process launch, and fallback player discovery through `ANI_TUI_PLAYER` and portable mpv paths.
- Updated AllAnime stream resolution to match latest upstream ani-cli provider behavior, including mp4upload referrer handling and stale source deprioritization.

### Changed
- Consolidated Windows installation around one PowerShell installer that verifies mpv, configures `ANI_TUI_PLAYER`, and keeps legacy installer entrypoints as wrappers.
- Added Windows installer syntax checks to CI and published only the supported Windows installer in release assets.

## [3.8.2] - 2026-04-27
- **AllAnime Decryption Fix**: Implemented a GraphQL GET request bypass using persisted queries to circumvent Cloudflare TLS fingerprinting issues.
- **Homebrew Detection Refinement**: Improved `is_homebrew_install` logic to provide more accurate installation detection on macOS and avoid false positives in development environments.
- **Project Configuration**: Cleaned up `.gitignore` and consolidated build settings.

## [3.8.1] - 2026-04-23
### Fixed
- Updated AllAnime `tobeparsed` decryption key and byte offsets for `_m: b7`.
- Mapped KKPhim and OPhim movie entries named `Full` to episode 1.

## [3.8.0] - 2026-04-19
### Added
- Global `Shift+R` shortcut to access activity logs for easier debugging.

### Improved
- **Flicker-Free Image Rendering**: Optimized iTerm2/Warp protocol with hash-based change detection.
- Unified provider registry with stable English and Vietnamese sources.

### Removed
- AniWatch source.
- Unstable NguonC (VN) source.

## [3.7.9] - 2026-04-18

### Added
- **Real-time Log Tailing**: Optimized the Report screen to efficiently display the last 500 lines of system and player activity.
- **AES Decryption for AllAnime**: Restored AllAnime playback by implementing AES-256-CTR decryption for `tobeparsed` GraphQL responses.
- **Smart Windows Installer**: New Rust-based installer for automated environment setup on Windows.

### Fixed
- **Vietnamese Source Stability**: Fixed 403 "hmmm!" errors on KKPhim and OPhim by optimizing Referer and User-Agent headers.
- **Player Log Flushing**: Ensured `mpv` logs are correctly appended and flushed with high verbosity for the Report screen.
- **UI Performance**: Implemented 150ms selection debouncing and non-blocking asynchronous background searches.
- **Image Performance**: Optimized line-caching for Halfblock rendering on Windows and macOS Terminal.app.
- **Search Pagination**: Implemented 10 items per page with Left/Right or PgUp/PgDn navigation.

### Changed
- **Default Source Configuration**: Enabled AllAnime, KKPhim, and OPhim by default.
- **UI Aesthetics**: Standardized language flags (🇺🇸/🇻🇳); removed brackets and text labels for a cleaner, modern look.
- **Config Refactor**: Simplified `Config::load` and centralized source management.

## [3.7.8] - 2026-04-07

### Fixed
- Fixed AllAnime API by updating referrer URL to allmanga.to (matching ani-cli)

### Changed
- Improved search responsiveness by reducing debounce from 500ms to 200ms

## [3.7.7] - 2026-03-15

### Fixed
- Fixed partial image corruption on first dashboard load by detecting first render and forcing cache clear
- Fixed `is_first_render` detection in ImageRenderer to ensure clean terminal state on initial render

## [3.7.6] - 2026-03-15

### Fixed
- Fixed image rendering on first dashboard load - images now display correctly immediately on app startup
- Fixed state inconsistency between `current_image_data` and `current_anime_id` during initialization
