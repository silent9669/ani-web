# Target homelab architecture

## Recommendation

Keep the existing stack and turn it into a well-bounded modular monolith:

- React + TypeScript + Vite for the responsive browser client.
- One Rust/Axum process for authentication, catalog coordination, provider adapters, playback proxying, and static delivery.
- SQLite in WAL mode for family accounts, sessions, favorites, history, and cached metadata.
- Docker Compose for the application and Caddy.
- Caddy for TLS, HTTP/2/3, reverse proxying, access logs, and edge security headers.
- systemd timers for CI-gated updates, DDNS, and scheduled backup verification.

This preserves the working native/web transport abstraction and provider code. A rewrite to Next.js, Node, Go, or separate frontend/backend repositories is not the starting recommendation because it would duplicate the hardest asset—the provider core—without resolving the likely bottlenecks of upstream reliability and media bandwidth. The decision is evidence-based, not permanent; measurable rewrite triggers live in `08-capacity-cost-evolution.md`.

## Internal modules

Keep one deployable process, but separate code ownership by module:

```text
HTTP shell
├── identity: login, sessions, admin users
├── library: favorites and watch history
├── discovery: AniList queries, cache, personal-match calculation
├── providers: explicit provider registry and adapters
├── playback: stream resolution, media sessions, manifest/resource proxy
├── downloads: short-lived authorized download tickets
└── operations: health, readiness, diagnostics, structured logging
```

Modules communicate through typed Rust interfaces, not HTTP calls to localhost. Provider adapters remain behind the existing `AnimeProvider` contract.

## Network shape

Recommended public shape:

```text
Internet or trusted overlay
  -> router 80/443 (or overlay ingress only)
  -> Debian VM
  -> Caddy container
  -> ani-desk container on private Compose network
  -> outbound HTTPS to AniList/providers
```

Choose one exposure mode:

- **Private overlay preferred:** Tailscale/WireGuard access only. Lowest exposure and simplest family security.
- **Public HTTPS acceptable:** Caddy on 80/443, strong accounts, automatic TLS, DDNS, router port-forwarding, and monitoring. Never expose port 3000.
- **Outbound tunnel alternative:** a managed tunnel avoids inbound router ports but adds an external dependency. Confirm that its terms and bandwidth support media proxy traffic.

## Storage

Stay on SQLite while there is one application replica and low write contention. Configure WAL, foreign keys, and a busy timeout on every connection. Keep database and download storage on persistent local disks, not the container filesystem.

Move to PostgreSQL only if one of these becomes true:

- Multiple application replicas need concurrent writes.
- Lock contention remains measurable after WAL and short transactions.
- The database must live on another host.
- Operational requirements demand point-in-time recovery.

Do not add Redis while sessions and rate limits fit one process. If horizontal scaling becomes necessary, Redis can hold rate-limit counters and ephemeral playback sessions, while PostgreSQL holds durable data.

## Discovery and personalization

- Query AniList for trending/discovery pages only when the cache is stale.
- Cache normalized AniList responses with a timestamp and serve stale data during temporary upstream failure.
- Calculate personal-match scores locally from cached genres/tags plus per-user favorites/history.
- Changing sort/filter on already-loaded results must not call AniList again.
- Use explicit refresh or a conservative TTL; coalesce concurrent refreshes.

## Reliability boundaries

- Sign-in, My List, and Continue Watching should continue working when AniList or providers are down.
- AniList failure degrades discovery, not account/library routes.
- One provider failure must not mark every provider unhealthy.
- Playback resolution and media proxy errors need provider name, stable error code, correlation ID, and retryability without logging secrets or stream URLs.
- Deployment success requires readiness plus a smoke test, not only process liveness.

## Resource starting point

Start with 2 vCPU, 2–4 GB RAM, 20 GB system disk, and separate persistent space for databases/backups/downloads. Measure bandwidth and disk use before resizing. The application itself is small; concurrent proxied media determines network capacity. Never promise a user-count limit from these numbers alone—publish a tested concurrent-stream envelope for the actual connection and hardware.
