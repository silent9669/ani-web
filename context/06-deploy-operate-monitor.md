# Deploy, operate, and monitor from the command line

This runbook describes the existing Docker Compose pull-deployment model. The current host runs the deploy check from the non-root user's cron; the supplied systemd timer is an equivalent option when administrator access is available. Replace the example domain and paths only through the documented environment variables.

## Host layout

```text
/srv/ani-desk/app        isolated deployment checkout
/srv/ani-desk/config     Compose environment file
/srv/ani-desk/data       web.db and catalog.db
/srv/ani-desk/backups    deployment backups
/srv/ani-desk/state      deployed SHA and approved CI run
/srv/ani-desk/deployer   installed pull-deploy script
```

## First host preparation

Review `deploy/homelab/bootstrap-host.sh` before running it because its administrator, hostname, LAN subnet, and firewall rules are site-specific.

```sh
sudo ADMIN_USER=dangphuc sh deploy/homelab/bootstrap-host.sh
sudo reboot
```

Create and protect the production directories and environment file:

```sh
sudo install -d -o dangphuc -g docker -m 0750 /srv/ani-desk/{app,data,backups,state,deployer}
sudo install -d -o root -g docker -m 0750 /srv/ani-desk/config
sudo install -o root -g docker -m 0640 deploy/homelab/.env.example /srv/ani-desk/config/ani-desk.env
sudoedit /srv/ani-desk/config/ani-desk.env
```

Set at least `ANI_DESK_DOMAIN`, a unique admin username/password, and `ANI_DESK_DATA_PATH=/srv/ani-desk/data`.

## Manual build and start

From a reviewed checkout:

```sh
cd /srv/ani-desk/app
ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml build ani-desk
ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml up -d
```

## Routine status and logs

```sh
docker compose -p homelab -f /srv/ani-desk/app/deploy/homelab/compose.yml ps
docker compose -p homelab -f /srv/ani-desk/app/deploy/homelab/compose.yml logs --tail=150 ani-desk
docker compose -p homelab -f /srv/ani-desk/app/deploy/homelab/compose.yml logs --tail=150 caddy
curl -fsS https://YOUR_DOMAIN/api/health
tail -n 150 /srv/ani-desk/state/deploy.log
cat /srv/ani-desk/state/deployed.sha
cat /srv/ani-desk/state/approved-run.url
```

Use `docker stats --no-stream` for an immediate resource view and `df -h /srv/ani-desk` plus `du -sh /srv/ani-desk/{data,backups}` for storage.

## CI-gated automatic updates

Install reviewed copies of `pull-deploy.sh`, `run-pull-deploy.sh`, and
`data-guard.py` in `/srv/ani-desk/deployer`, then install the non-root cron
trigger:

```sh
(crontab -l 2>/dev/null; printf '%s\n' \
  '*/3 * * * * /srv/ani-desk/deployer/run-pull-deploy.sh') | crontab -
crontab -l
```

The wrapper keeps a bounded log at `/srv/ani-desk/state/deploy.log`. The core
script uses `flock`, so cron and a manual check cannot deploy concurrently.

Alternatively, an administrator can install `ani-desk-deploy.service` and
`ani-desk-deploy.timer`, remove the cron entry, and enable the timer:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ani-desk-deploy.timer
systemctl list-timers ani-desk-deploy.timer
sudo systemctl start ani-desk-deploy.service
```

The agent deploys only when the latest completed GitHub `CI` push run on the configured `master` branch in `silent9669/ani-web` succeeded and its SHA equals the remote branch head. It builds before interruption, stops the app for a consistent backup, starts the new version, verifies public health and protected row counts, and rolls back code and data on failure.

Pause cron-driven updates without stopping the app:

```sh
crontab -l | grep -v '/srv/ani-desk/deployer/run-pull-deploy.sh' | crontab -
```

## Backup and restore

Create an on-demand consistent archive:

```sh
cd /srv/ani-desk/app
docker compose -p homelab -f deploy/homelab/compose.yml stop ani-desk
sudo tar -C /srv/ani-desk -czf /srv/ani-desk/backups/manual-$(date -u +%Y%m%dT%H%M%SZ).tar.gz data
docker compose -p homelab -f deploy/homelab/compose.yml up -d ani-desk
```

Restore only after preserving the failed state for diagnosis:

```sh
docker compose -p homelab -f /srv/ani-desk/app/deploy/homelab/compose.yml stop ani-desk
sudo mv /srv/ani-desk/data /srv/ani-desk/data.failed.$(date -u +%s)
sudo tar -C /srv/ani-desk -xzf /srv/ani-desk/backups/SELECTED_BACKUP.tar.gz
docker compose -p homelab -f /srv/ani-desk/app/deploy/homelab/compose.yml up -d ani-desk caddy
curl -fsS https://YOUR_DOMAIN/api/health
```

Test a restore on a separate directory/VM before relying on a backup.

## Rollback application code

Automatic rollback is built into `pull-deploy.sh`. For a manual rollback, check out the last known-good SHA in the isolated deployment checkout, rebuild the same Compose service, recreate containers, and re-run health/smoke checks. Restore data only when a schema/data change requires it.

## Monitoring baseline

For this scale, start small:

- External or LAN Uptime Kuma probe: `/api/health`, every 60 seconds, alert after 2–3 failures.
- systemd timer failure alert for `ani-desk-deploy.service` and DDNS.
- Disk alert at 75% warning and 85% critical.
- TLS expiry, container restart count, CPU, memory, and network throughput.
- A scheduled authenticated smoke test for sign-in, discovery cache response, one English provider search, and one Vietnamese provider search. Do not use playback streams for frequent probes.

Prometheus/Grafana/cAdvisor and Loki are optional. Add them only if the homelab already operates that stack; otherwise Uptime Kuma, journald, Docker logs, and disk alerts are sufficient.

## Incident triage order

1. Confirm DNS and TLS from outside the VM.
2. Check Caddy and application container state/logs.
3. Check disk space, memory, and host networking.
4. Test `/api/health` from Caddy's network and directly inside the app container.
5. Distinguish local service failure from AniList/provider failure.
6. Inspect deployed SHA and latest approved CI run.
7. Roll back code if the failure began after deployment; restore data only with evidence of data/schema damage.
