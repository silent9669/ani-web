# ani-desk homelab deployment

This deployment runs ani-desk behind Caddy with automatic HTTPS. Only Caddy
binds host ports; the application is reachable only on the private Docker
network.

## First deployment

1. Copy this repository to `/srv/ani-desk/app` on the VM.
2. Copy `.env.example` to `.env`, set a long unique admin password, and protect
   the file with mode `0600`.
3. Create `/srv/ani-desk/data` and keep it on the persistent data disk.
4. From the repository root run the explicit commands below. The build context
   must be the repository root because that is where `Dockerfile` and
   `tokens.css` live.

   ```sh
   docker compose --env-file deploy/homelab/.env \
     -f deploy/homelab/compose.yml build ani-desk
   docker compose --env-file deploy/homelab/.env \
     -f deploy/homelab/compose.yml up -d
   ```
5. Check `docker compose ps`, `docker compose logs --tail=100`, and
   `curl -fsS https://ani.dangphuc.me/api/health`.

## Update and rollback

Before each update, archive `/srv/ani-desk/data`. Pull the intended Git commit,
run `docker compose build`, and recreate the services. To roll back, check out
the previous known-good commit and rebuild. Restore the data archive only when
the new version changed or damaged persistent state.

Never commit `.env`, database files, Caddy certificates, or backup archives.

### User-data preservation contract

The Compose service bind-mounts `${ANI_DESK_DATA_PATH:-/srv/ani-desk/data}` at
`/data`. Accounts, password hashes, favorites, watch history, and sessions live
in that mounted directory rather than in the replaceable container image.

- Keep `ANI_DESK_DATA_PATH` pointed at the same persistent host directory for
  every deploy and rollback.
- Use `docker compose up -d`; do not add `-v` to `docker compose down` and do
  not delete the data directory during an application update.
- Changing the configured administrator username or password migrates the one
  protected administrator row in place. Its stable user ID keeps favorites and
  watch history attached; existing sessions are revoked only when credentials
  change.
- The pull-deploy service stops the application only after a new image builds,
  archives the data directory before replacement, and retains seven backups.

Before a manual update, record the database health and row counts:

```sh
python3 - <<'PY'
import sqlite3
with sqlite3.connect("file:/srv/ani-desk/data/web.db?mode=ro", uri=True) as db:
    print("integrity", db.execute("PRAGMA integrity_check").fetchone()[0])
    for table in ("users", "user_favorites", "user_history"):
        print(table, db.execute("SELECT count(*) FROM " + table).fetchone()[0])
PY
```

Run the same commands after the container is healthy. The integrity result must
be `ok`, and the counts must not decrease unless an administrator deliberately
removed those records.

## CI-gated pull deployment

The production VM uses a pull-based deployment agent. GitHub never receives an
SSH key for the homelab and no management port is exposed to the internet.

1. A pull request must pass every job in `.github/workflows/ci.yml` before it
   can merge into `master` in `silent9669/ani-web`.
2. The three-minute cron wrapper or `ani-desk-deploy.timer` asks the public
   GitHub Actions API for the latest completed `CI` push run on `master`.
3. The VM deploys only when that run concluded `success` and its `head_sha`
   exactly matches the current remote `master` commit.
4. The agent checks out that exact commit and builds while the old container is
   still serving. It then briefly stops ani-desk for a consistent data backup,
   recreates the services, and verifies the public health endpoint.
5. If startup, health, or data verification fails, the agent preserves the
   failed data directory, restores the stopped-app backup, and rebuilds the
   previously deployed commit. A build failure leaves the running app alone.

The deploy checkout is `/srv/ani-desk/app`, the secret Compose environment
file is `/srv/ani-desk/config/ani-desk.env`, and state is stored in
`/srv/ani-desk/state`. The current non-root installation uses this cron entry:

Install all three deployment helpers before enabling the trigger:

```sh
install -m 0755 deploy/homelab/pull-deploy.sh \
  /srv/ani-desk/deployer/pull-deploy.sh
install -m 0755 deploy/homelab/run-pull-deploy.sh \
  /srv/ani-desk/deployer/run-pull-deploy.sh
install -m 0755 deploy/homelab/data-guard.py \
  /srv/ani-desk/deployer/data-guard.py
```

```cron
*/3 * * * * /srv/ani-desk/deployer/run-pull-deploy.sh
```

Install it with `(crontab -l 2>/dev/null; echo '...') | crontab -`, replacing
the ellipsis with the complete line above. The wrapper rotates its own log and
the deployer uses `flock`, so overlapping checks cannot rebuild concurrently.
Check deployment activity with:

```sh
tail -n 150 /srv/ani-desk/state/deploy.log
cat /srv/ani-desk/state/deployed.sha
cat /srv/ani-desk/state/data-before.json
cat /srv/ani-desk/state/data-after.json
```

On hosts where an administrator enables the supplied systemd timer, remove the
cron entry first and use `systemctl status` plus `journalctl` instead.

## Dockerfile not found

`open Dockerfile: no such file or directory` means Docker received the wrong
build context or an incorrect `-f` path. Do not run
`docker build deploy/homelab` or use `deploy/homelab/Dockerfile` because that
file does not exist. From the repository root, either run the Compose command
above or build the application image directly with:

```sh
docker build --file Dockerfile --tag ani-desk-homelab:test .
```

To pause automatic deployment without stopping the running application:

```sh
crontab -l | grep -v '/srv/ani-desk/deployer/run-pull-deploy.sh' | crontab -
```

## Catalog connectivity

The runtime image prefers IPv4-mapped addresses. This is intentional for the
homelab VM, which has working IPv4 internet access but no routed IPv6. Without
that preference, AniList may resolve to IPv6 first and catalog requests can fail
immediately even though the same build works on Railway.

## Browser login and stale UI

The hosted shell sends `Cache-Control: private, no-cache`, so Safari revalidates
the current build instead of keeping an old login or layout bundle. If one
browser still rejects a known-good account:

1. use one exact origin (for example, do not alternate between an IP address,
   hostname, and public domain because their cookies are separate);
2. reload without content blockers and reveal the password field to verify what
   Safari Passwords actually filled;
3. check recent application logs for `INVALID_CREDENTIALS` or rate limiting;
4. verify the API directly without placing the password in shell history:

   ```sh
   read -r ANI_USER
   read -rs ANI_PASSWORD
   curl -i -c /tmp/ani-desk-cookie.txt \
     -H 'Content-Type: application/json' \
     -H 'X-Ani-Desk-Request: 1' \
     --data "$(jq -nc --arg username "$ANI_USER" --arg password "$ANI_PASSWORD" '{username:$username,password:$password}')" \
     https://YOUR_DOMAIN/api/login
   unset ANI_USER ANI_PASSWORD
   ```

Do not reset or replace `web.db` to repair a browser-only login problem. The
configured protected administrator is migrated in place, and the persistent
data directory must remain mounted during every redeploy.

## Provider monitoring

Provider health is a snapshot, not a permanent disable switch. A later explicit
search is allowed to recover a source and clear a stale unavailable badge. OPhim
uses `https://ophim1.com/v1/api`, allows a 20-second upstream response window,
and validates HTTP status before parsing results. MovieBox signs the request
separately for each of its API mirrors and fails over between `api4`, `api5`,
and `api6` when a regional endpoint is unreachable.

Run full provider certification only before a release or during a focused
incident; it performs real upstream searches and media byte-range checks:

```sh
cargo run --example provider_certification -- --require-english
```

For continuous monitoring, probe `/api/health` every minute and run provider
certification at most once or twice daily to avoid noisy or rate-limited traffic.
