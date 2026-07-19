# Migration plan and acceptance gates

No deployment is authorized by this plan. Build and validation happen first; the owner reviews the redesigned application before production changes.

## Phase 1 — establish the web baseline

- Reconcile ani-web with the approved ani-desk redesign and provider fixes.
- Keep the existing Rust provider core and React transport abstraction.
- Split oversized UI/server files only where it improves ownership without changing behavior.
- Add SQLite WAL/busy timeout and a readiness check that verifies database access.
- Add structured request logging with correlation IDs and secret redaction.

Exit gate: frontend build, Rust formatting/lint/tests, provider fixtures, and browser E2E pass in CI.

## Phase 2 — complete family identity and responsive UX

- Validate login/logout/session expiry and administrator account management.
- Validate per-user isolation for favorites, history, progress, and downloads.
- Complete desktop/iPhone navigation, search, title details, episode selection, player, downloads, and appearance settings.
- Meet keyboard, focus, contrast, reduced-motion, touch-target, safe-area, and Vietnamese font requirements.

Exit gate: owner approves desktop and mobile screenshots/live flows; no blocking accessibility defects.

## Phase 3 — harden providers and discovery

- Test provider-first search with query persistence.
- Test English and Vietnamese flows separately.
- Cache AniList trending/catalog responses and keep personal-match filtering local.
- Add stable degraded states and AllAnime manual verification.
- Confirm media proxy and download tickets do not leak upstream secrets.

Exit gate: at least one certified English and one certified Vietnamese end-to-end playback path, plus clear degraded behavior for every other visible provider.

## Phase 4 — rehearse homelab operations

- Build the production image locally and run the Compose topology on a staging hostname/LAN address.
- Verify TLS/cookies/headers through Caddy.
- Verify backup, clean restore, code rollback, and CI-gated pull deployment.
- Exercise AniList outage, provider outage, full disk warning, container restart, and expired session behavior.

Exit gate: a clean VM can be recovered from repository + secrets + backup using only the runbook.

## Phase 4.5 — measure the sustainable envelope

- Run API and playback load profiles from `08-capacity-cost-evolution.md` against staging.
- Record CPU, memory, disk latency, network throughput, open files, request latency, and error rate.
- Establish a tested concurrent-stream ceiling and an alert threshold below it.
- Confirm that provider rate limits and cache behavior degrade safely rather than amplifying requests.

Exit gate: the owner has a dated capacity report, a cost baseline, and a scale action tied to each exhausted resource.

## Phase 5 — owner-approved production cutover

- Freeze the approved commit SHA.
- Take and verify a pre-cutover backup.
- Update DNS/forwarding or overlay ingress.
- Deploy the approved SHA, run smoke tests, and observe logs/resources.
- Keep the previous service/data snapshot available for rollback.

Exit gate: owner confirms sign-in, discovery, English/Vietnamese search, episode choice, playback, progress, My List, and responsive use from an external client.

## Required automated checks

```sh
npm ci
npm run build
npm run check:icons
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pytest tests/e2e
docker build -t ani-desk:verify .
```

Also validate Compose configuration with the real production variable names but placeholder secrets:

```sh
ANI_DESK_ENV_FILE=.env.example \
docker compose --env-file deploy/homelab/.env.example \
  -f deploy/homelab/compose.yml config
```

`--env-file` supplies values for Compose interpolation; `ANI_DESK_ENV_FILE=.env.example` separately ensures the application service does not load a local production `.env` while validating.

## Definition of done

- No unreviewed provider fallback or merged-provider result behavior.
- No public registration and no cross-user data access.
- AniList discovery is cached and UI filtering does not cause repeated API calls.
- At least one English and one Vietnamese provider complete search-to-playback.
- AllAnime remains visible with manual verification when blocked.
- The app is usable at 390 px mobile width and on a 16-inch Mac viewport.
- Health/readiness, logs, backups, restore, rollback, alerts, and deployment SHA are observable from the command line.
- Secrets and state are absent from Git and container layers.
- Production is not changed until owner approval.
- Capacity and cost claims are backed by a repeatable test, not an assumed audience size.
