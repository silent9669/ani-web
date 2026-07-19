# API, data, and provider contracts

## HTTP contract

The browser calls same-origin `/api`; it must not know the application container address. Keep JSON fields camelCase because `web/src/api.ts` and `web/src/types.ts` depend on that shape.

Route groups in the current server:

| Group | Routes | Authentication |
| --- | --- | --- |
| Operations | `GET /api/health` | Public, minimal response |
| Session | login, logout, current session | Login public; others session-aware |
| Administration | `/api/admin/users` | Admin only |
| Discovery | discovery, catalog search/genre/filter | Signed-in user |
| Providers | sources, health, access, source search | Signed-in user |
| Titles | details, availability, episodes | Signed-in user |
| Playback | playback, media manifests/resources | Signed-in or signed media session |
| Library | history and My List | Signed-in user, per-user rows |
| Downloads | ticket and download stream | Signed-in, short-lived ticket |

Every error should keep the current structured form: stable `code`, safe `message`, `operation`, `retryable`, and `correlationId`. Logs may contain the correlation ID and internal error, but not passwords, cookies, provider authorization headers, signed media URLs, or full query strings containing tokens.

## Browser mutation protection

Continue requiring a custom application header on state-changing requests. Also validate `Origin`/`Host` for unsafe methods at the server or edge. Keep cookies `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to `/`, and same-origin; do not store session tokens in local storage.

## Durable data ownership

| Data | Owner | Notes |
| --- | --- | --- |
| Users/password hashes/roles | `web.db` | Admin-created only; protected config admin |
| Session token hashes | `web.db` | Expiring and revocable |
| Favorites/history | `web.db` | Always keyed by user |
| AniList metadata/cache | `catalog.db` | Rebuildable; preserve for rate-limit efficiency |
| Provider cookies/tokens | Runtime/config only | Secrets; never return to browser or logs |
| Downloads | Persistent download path | Authorize per user; exclude from database backup if large |

Schema changes require an idempotent forward migration and a documented rollback consequence. Back up both databases before applying a release that changes schema. Do not rely on container rollback to reverse an incompatible database migration.

## Provider contract

Each adapter must implement or explicitly disable:

- identity and language group;
- website/manual-verification URL where applicable;
- health check and stable failure classification;
- search;
- details;
- episodes;
- stream resolution;
- subtitle and quality metadata;
- required upstream headers.

Provider results retain provider-specific IDs. Never assume AniList IDs, titles, and provider IDs are interchangeable. Availability resolution is a mapping attempt and must expose uncertainty.

## Adding or repairing a provider

1. Add an adapter under `src/providers/` and register it explicitly.
2. Add fixtures/parser tests that do not depend entirely on live upstream state.
3. Validate live search, details, episodes, playback, and subtitles separately.
4. Run English and Vietnamese coverage independently.
5. Confirm browser playback through the server proxy, not only direct URL resolution.
6. Confirm unavailable/CAPTCHA/manual-verification behavior is visible and non-destructive.
7. Confirm no credentials, upstream headers, or raw signed URLs appear in browser responses or logs.

AllAnime must remain selectable when direct access is blocked. Report `verification required` and offer the manual verification flow rather than silently removing it or switching providers.

## Personal-match contract

Personal match is local and deterministic for a given cached catalog plus user library. Store or derive only compact preference weights. The UI may re-sort/filter this cached set without an AniList call. Tests should freeze metadata and user history so ranking changes are reviewable.
