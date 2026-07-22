# ani-desk maintenance page operations

The `maintenance/` directory is a static, independently deployable fallback for
the private family theatre. It has no dependency on the ani-web API and contains
no credentials, provider URLs, internal hostnames, or account data.

## Local preview and validation

From the repository root:

```bash
npm ci
npm run maintenance:validate
npm run maintenance:preview
```

Open `http://127.0.0.1:4174`. In another terminal, run the responsive behavior
suite with `npm run maintenance:test`. Stop the preview with `Ctrl-C`.

## Artifact structure

- `maintenance/index.html`: semantic one-viewport poster wall.
- `maintenance/styles.css`: bundled fonts, CSS brick fallback, poster artwork,
  marquee, lighting, motion, reduced-motion, and responsive composition.
- `maintenance/app.js`: bounded status parsing and the five Check again states.
- `maintenance/status.json`: the only operational content file.
- `maintenance/assets/`: local logo, fonts, and original wall artwork.

All files needed by GitHub Pages live below `maintenance/`; deployment uploads
only that directory.

## `status.json`

| Field | Allowed content |
| --- | --- |
| `mode` | `maintenance` or `online` |
| `headline` | Public maintenance headline, up to 90 characters in the browser |
| `message` | Public explanation, up to 320 characters |
| `statusLabel` | Human-readable current state |
| `expectedReturn` | Public estimate such as `Shortly` or `22:30 ICT` |
| `lastUpdated` | Public display timestamp |
| `privacy` | Short home-server reassurance |

The page fetches this file with `cache: "no-store"`. The HTML contains safe
defaults, so initial layout is stable and remains useful if JSON, fonts, the
wall image, or the home server fails.

Never place origin URLs, IP addresses, tokens, cookies, provider URLs, raw HTTP
errors, or infrastructure details in `status.json`.

## GitHub workflow

`.github/workflows/maintenance.yml` supports `workflow_dispatch` and an optional
five-minute health schedule. A manual run accepts:

- mode: `maintenance` or `online`;
- headline, message, and expected return overrides;
- `deploy_pages`: validation-only by default, or explicit Pages deployment.

The validation job always runs first. The deployment job uploads only a staged
copy of `maintenance/`, uses GitHub Pages OIDC, and is protected by one
concurrency group. This task intentionally does not run that workflow.

Repository configuration:

- Variable `AUTO_MAINTENANCE_ENABLED`: set to `true` to allow scheduled checks.
- Secret `ANI_DESK_HEALTHCHECK_URL`: public HTTPS health endpoint queried only
  by Actions. It is never copied to the page.
- GitHub Pages source: GitHub Actions.

CLI examples after the workflow is reviewed and merged:

```bash
gh workflow run maintenance.yml -f mode=maintenance -f deploy_pages=false
gh workflow run maintenance.yml -f mode=maintenance -f expected_return='22:30 ICT' -f deploy_pages=true
gh workflow run maintenance.yml -f mode=online -f deploy_pages=true
gh run list --workflow maintenance.yml --limit 5
```

The first command validates without publishing. Any command with
`deploy_pages=true` changes the public Pages artifact and should be run only in
an approved maintenance window.

## Automatic monitoring behavior

When `AUTO_MAINTENANCE_ENABLED=true`, a scheduled run probes the configured
health endpoint with a short timeout. Two consecutive failures select
maintenance mode; two consecutive successes select online mode. Scheduled mode
is disabled by default and still only controls the Pages artifact—it cannot
replace the primary application origin by itself.

## Required same-domain front door

GitHub Pages cannot transparently answer for the ani-web hostname when the
homelab origin is unreachable. Put an always-on public front door in front of
both targets, such as a Cloudflare Worker, Cloudflare Load Balancer, Caddy on an
independent host, or another reverse proxy:

1. Proxy normal requests to ani-web with a short origin connect/read timeout.
2. Count failures per origin; switch only after at least two consecutive failed
   checks, not one transient response.
3. Serve the static maintenance artifact on the same public hostname, or issue
   a temporary redirect to the Pages URL when same-host serving is unavailable.
4. Continue probing in the background and return to ani-web only after at least
   two consecutive successful checks.
5. Exclude user-specific URLs, cookies, request bodies, and authorization data
   from health probes and maintenance logs.
6. Keep DNS stable. DNS failover is slow, resolver-dependent, and unsuitable as
   the primary switch.

For Cloudflare Worker integration, store the origin and Pages endpoints as
encrypted Worker configuration, use an unauthenticated minimal `/healthz`
response, cap origin timeouts, and keep hysteresis state in Durable Objects or
another consistent store. Do not embed the private origin in browser JavaScript.

## Verify active mode

Check the static artifact:

```bash
curl --fail --silent --show-error --no-cache \
  https://YOUR-PAGES-HOST/status.json | jq -r '.mode, .lastUpdated'
```

Check the public front door separately:

```bash
curl --fail --silent --show-error -D - -o /dev/null \
  https://YOUR-ANI-DESK-HOST/
```

Configure the front door to add a non-sensitive response header such as
`X-Ani-Desk-Mode: app` or `X-Ani-Desk-Mode: maintenance`; do not reveal origin
addresses or health-check internals.

## Rollback

1. Disable `AUTO_MAINTENANCE_ENABLED` if scheduled decisions are suspect.
2. Manually dispatch `mode=online` only after the origin passes consecutive
   checks, or restore the previous known-good Pages deployment in GitHub.
3. Set the front door to the last known-good route configuration.
4. Verify both the JSON mode and the front-door header from two networks.
5. Do not change DNS unless the established front-door recovery plan requires it.

## Security limitations and troubleshooting

- This page is public by design; it must contain no private family information.
- Pages availability is independent from homelab availability, but a front door
  remains a separate operational dependency.
- Client-side status is informational, not an authenticated infrastructure signal.
- Browser and CDN caches may briefly retain assets; `status.json` must always be
  served with revalidation/no-store behavior at the front door.
- If the wall image fails, the CSS brick pattern remains. If fonts fail, system
  fallbacks keep all content visible. If refresh fails, the button reports a
  plain-language failure without exposing the cause.
- If the wrong mode appears, compare the deployed `status.json`, the Pages run,
  the front-door hysteresis state, and the non-sensitive mode response header in
  that order.
