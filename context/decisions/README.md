# Architecture decisions

## ADR-001 — modular monolith over microservices

**Status:** Accepted.

Use one Rust/Axum deployment with internal identity, library, discovery, provider, playback, download, and operations modules. This minimizes homelab failure modes and preserves direct typed calls to provider adapters.

Reconsider only when independent scaling/deployment is measured as necessary or separate teams own modules. File organization alone is not a reason to introduce network services.

## ADR-002 — evolve the existing React/Rust stack

**Status:** Accepted.

Retain React/Vite and the Rust core/server rather than rewrite in a fashionable full-stack framework. The current code already shares provider logic with the Tauri app and has a browser/native API abstraction.

Reconsider only if the native app no longer shares the core, maintenance becomes impossible, or a concrete requirement cannot be met safely in the existing stack.

## ADR-003 — SQLite first

**Status:** Accepted with hardening.

Use SQLite with WAL, foreign keys, busy timeout, short transactions, consistent backups, and one application replica. It keeps the initial system cheap and recovery simple without encoding a user-count ceiling.

Move to PostgreSQL for multiple writers/replicas, remote database hosting, persistent lock contention, or point-in-time recovery requirements.

## ADR-004 — Docker Compose and Caddy

**Status:** Accepted.

Use Compose for the application and Caddy, with systemd supervising scheduled deployment/DDNS jobs. Only Caddy publishes ports. This is understandable, reproducible, and sufficient for one node.

Reconsider orchestration only when the service must span nodes or the homelab already has a mature shared orchestrator with backups, ingress, secrets, and observability.

## ADR-005 — CI-approved pull deployment

**Status:** Accepted.

The host polls GitHub for a successful CI run whose SHA exactly matches the deployment branch, then pulls that immutable commit. GitHub receives no homelab SSH key and no management port is exposed.

Reconsider if the repository becomes private and unauthenticated API polling no longer works; add a narrowly scoped read token stored only on the host, or use an authenticated artifact registry.

## ADR-006 — AniList metadata, providers for playback

**Status:** Accepted.

AniList owns discovery metadata and cached ranking inputs. Explicitly selected providers own catalog results, episodes, and streams. Personal-match sorting operates locally over cached data.

This boundary prevents misleading availability, hidden provider switching, and unnecessary AniList calls.

## ADR-007 — scale by measured resource, not account count

**Status:** Accepted.

Publish a tested concurrency envelope for the deployed hardware and connection. Scale bandwidth delivery, compute, database, and topology independently according to the first measured saturation point. Account count alone is not a capacity metric.

Reconsider the modular monolith or repository layout only when profiling shows that independent scaling or ownership would remove a real constraint.
