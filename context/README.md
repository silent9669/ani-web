# ani-web build context

This folder is the handoff contract for building and operating the hosted ani-desk service on a small private homelab. It records product intent, current implementation facts, target architecture, security boundaries, deployment commands, and acceptance criteria without duplicating the entire repository.

## Read order

1. [01-product-brief.md](01-product-brief.md) — users, goals, non-goals, and immutable behavior.
2. [02-current-system.md](02-current-system.md) — what already exists and where its source of truth lives.
3. [03-target-architecture.md](03-target-architecture.md) — recommended stack and boundaries.
4. [04-api-data-provider-contracts.md](04-api-data-provider-contracts.md) — contracts future work must preserve.
5. [05-network-security.md](05-network-security.md) — exposure model, identity, secrets, and hardening.
6. [06-deploy-operate-monitor.md](06-deploy-operate-monitor.md) — command-line deployment and operations runbook.
7. [07-migration-acceptance.md](07-migration-acceptance.md) — delivery phases and release gates.
8. [08-capacity-cost-evolution.md](08-capacity-cost-evolution.md) — sustainable growth, cost controls, load gates, and rewrite triggers.
9. [09-build-handoff.md](09-build-handoff.md) — practical implementation order and evidence expected from a future builder.
10. [decisions/README.md](decisions/README.md) — architecture decisions and reconsideration triggers.

## Source-of-truth order

When documents disagree, prefer:

1. Executable code and configuration in the current checkout.
2. This context pack for product intent and target-state decisions.
3. Existing project documentation such as `README.md`, `docs/ARCHITECTURE.md`, and `deploy/homelab/README.md`.
4. Historical plans and status files.

Before implementation, inspect the actual versions in `Cargo.lock` and `package-lock.json`; do not select dependency versions from this documentation.

## Guardrails for a future builder

- Preserve ani-desk branding and the provider-first search model.
- AniList supplies discovery metadata; playback providers supply search results, episodes, and streams.
- Keep English and Vietnamese provider behavior independently testable.
- Do not silently merge provider results or silently fall back to a different provider.
- Keep AllAnime visible when blocked and offer a clear manual-verification path.
- Never expose provider stream URLs or required provider headers directly to the browser.
- Do not deploy automatically while redesign or provider behavior is still awaiting owner validation.
- Treat the first family cohort as a starting load, not an architectural ceiling; scale from measured bottlenecks.
- Do not commit `.env`, databases, certificates, download files, or backup archives.

## Existing references

- `docs/ARCHITECTURE.md` — desktop-oriented code map and IPC surface.
- `deploy/homelab/README.md` — existing Compose and CI-gated pull deployment.
- `deploy/homelab/compose.yml` — current production topology.
- `server/src/main.rs` and `server/src/db.rs` — hosted API and identity/data implementation.
- `web/src/api.ts` and `web/src/types.ts` — browser/native transport abstraction and shared DTOs.
- `src/providers/mod.rs` — provider adapter interface and registry.
