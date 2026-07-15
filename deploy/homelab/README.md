# ani-desk homelab deployment

This deployment runs ani-desk behind Caddy with automatic HTTPS. Only Caddy
binds host ports; the application is reachable only on the private Docker
network.

## First deployment

1. Copy this repository to `/srv/ani-desk/app` on the VM.
2. Copy `.env.example` to `.env`, set a long unique admin password, and protect
   the file with mode `0600`.
3. Create `/srv/ani-desk/data` and keep it on the persistent data disk.
4. From this directory run `docker compose build` and then
   `docker compose up -d`.
5. Check `docker compose ps`, `docker compose logs --tail=100`, and
   `curl -fsS https://ani.dangphuc.me/api/health`.

## Update and rollback

Before each update, archive `/srv/ani-desk/data`. Pull the intended Git commit,
run `docker compose build`, and recreate the services. To roll back, check out
the previous known-good commit and rebuild. Restore the data archive only when
the new version changed or damaged persistent state.

Never commit `.env`, database files, Caddy certificates, or backup archives.

## CI-gated pull deployment

The production VM uses a pull-based deployment agent. GitHub never receives an
SSH key for the homelab and no management port is exposed to the internet.

1. A pull request must pass every job in `.github/workflows/ci.yml` before it
   can merge into `master`.
2. `ani-desk-deploy.timer` asks the public GitHub Actions API for the latest
   completed `CI` push run on `master`.
3. The VM deploys only when that run concluded `success` and its `head_sha`
   exactly matches the current remote `master` commit.
4. The agent checks out that exact commit and builds while the old container is
   still serving. It then briefly stops ani-desk for a consistent data backup,
   recreates the services, and verifies the public health endpoint.
5. If build, startup, or health verification fails, the agent rebuilds and
   restores the previously deployed commit.

The deploy checkout is `/srv/ani-desk/source`, the secret Compose environment
file is `/srv/ani-desk/config/ani-desk.env`, and state is stored in
`/srv/ani-desk/state`. Check deployment activity with:

```sh
systemctl status ani-desk-deploy.timer
journalctl -u ani-desk-deploy.service -n 150 --no-pager
cat /srv/ani-desk/state/deployed.sha
```

To pause automatic deployment without stopping the running application:

```sh
sudo systemctl disable --now ani-desk-deploy.timer
```

## Catalog connectivity

The runtime image prefers IPv4-mapped addresses. This is intentional for the
homelab VM, which has working IPv4 internet access but no routed IPv6. Without
that preference, AniList may resolve to IPv6 first and catalog requests can fail
immediately even though the same build works on Railway.
