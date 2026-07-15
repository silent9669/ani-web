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

## Catalog connectivity

The runtime image prefers IPv4-mapped addresses. This is intentional for the
homelab VM, which has working IPv4 internet access but no routed IPv6. Without
that preference, AniList may resolve to IPv6 first and catalog requests can fail
immediately even though the same build works on Railway.
