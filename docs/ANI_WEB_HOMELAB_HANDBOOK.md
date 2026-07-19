---
title: "ani-web Homelab Handbook"
subtitle: "Deploy, monitor, update, recover, and maintain the service"
author: "silent9669 / ani-web"
date: "19 July 2026"
lang: en-US
geometry: margin=22mm
fontsize: 10.5pt
mainfont: "Avenir Next"
monofont: "Menlo"
colorlinks: true
linkcolor: "blue"
urlcolor: "blue"
toc: true
toc-depth: 3
numbersections: true
header-includes:
  - |
    \usepackage{fancyhdr}
    \pagestyle{fancy}
    \fancyhf{}
    \fancyhead[L]{ani-web Homelab Handbook}
    \fancyhead[R]{Operations Guide}
    \fancyfoot[C]{\thepage}
    \setlength{\headheight}{14pt}
---

# Purpose and safety boundary

This is the owner's operating handbook for the hosted web edition of ani-desk,
named **ani-web** at the repository and deployment level. It covers the service
from the first local test through deployment, routine monitoring, automatic
redeployment, rollback, backup, restore, provider certification, and incident
response.

The commands assume:

- repository: `https://github.com/silent9669/ani-web.git`;
- production branch: `master`;
- Linux deployment checkout: `/srv/ani-desk/app`;
- persistent data: `/srv/ani-desk/data`;
- public domain: the value of `ANI_DESK_DOMAIN`;
- Docker Compose file: `deploy/homelab/compose.yml`.

Never paste a real password, cookie, DDNS token, provider token, database, or
`.env` file into Git. The repository's `.env.example` files are templates only.
Keep the real homelab environment file outside the checkout at
`/srv/ani-desk/config/ani-desk.env` with owner/group access only.

# What the service contains

```text
Desktop/mobile browser
        |
        | HTTPS :443
        v
      Caddy                 automatic TLS, compression, security headers
        |
        | private Docker network
        v
 Rust/Axum ani-desk-server  authentication, users, library, provider proxy
        |           |
        |           +---- AniList metadata and enabled streaming providers
        |
        +---- /data/web.db and /data/catalog.db
```

Only Caddy publishes host ports. The application container is not directly
reachable from the internet. Browser calls stay same-origin under `/api`, and
the server resolves and proxies media so provider headers and internal URLs do
not need to be trusted to browser JavaScript.

The main runtime pieces are:

| Piece | Responsibility | Persistent? |
|---|---|---|
| Caddy | TLS, HTTP/3, reverse proxy, access logs | certificate volumes |
| ani-desk-server | Web/API server and provider integration | no |
| `web.db` | users, roles, sessions, history, My List | yes |
| `catalog.db` | AniList metadata/cache | yes, but rebuildable |
| provider adapters | search, episodes, streams, health | external upstream |
| cron or systemd deploy timer | deploy only a CI-approved commit | state files |
| Namecheap DDNS timer | keep the public hostname on the current IP | secret file |

# Quick command card

Run local release checks from the repository root:

```sh
npm ci
npm run build
npm run check:icons
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo run --example provider_certification -- --require-english
bash scripts/smoke-web-server.sh
```

Build the exact container image from the repository root:

```sh
docker build --file Dockerfile --tag ani-desk-homelab:test .
```

Validate and build Compose without displaying resolved secret values:

```sh
docker compose --env-file deploy/homelab/.env \
  --file deploy/homelab/compose.yml config --quiet

docker compose --env-file deploy/homelab/.env \
  --file deploy/homelab/compose.yml build ani-desk
```

Production status:

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml ps

curl -fsS https://YOUR_DOMAIN/api/health
```

Production logs:

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  logs --tail=150 ani-desk

docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  logs --tail=150 caddy
```

# Before the first deployment

## Workstation checks

Confirm the checkout and make sure nothing private is staged:

```sh
git status --short
git branch --show-current
git remote -v
git diff --check
```

The intended push target is `silent9669/ani-web`, not the original desktop
repository. Before the first push, verify the URL explicitly:

```sh
git remote set-url origin https://github.com/silent9669/ani-web.git
git remote -v
```

Review every untracked file before staging. In particular, do not stage:

- `deploy/homelab/.env`;
- any other `.env` file containing real values;
- `*.db`, backup archives, provider cookies, browser profiles, or Caddy data;
- local screenshots or logs that contain usernames, tokens, or signed URLs.

Run a changed-line secret review before pushing:

```sh
git diff --cached -- . ':!package-lock.json' ':!Cargo.lock'
```

## Homelab prerequisites

Use a supported Debian/Ubuntu VM or host with:

- a static LAN address or DHCP reservation;
- inbound TCP 80 and TCP/UDP 443 forwarded to the host if public access is
  required;
- a DNS record or DDNS host pointing to the public address;
- enough persistent storage for databases and backups;
- correct time synchronization, because TLS and session expiry depend on it.

Review `deploy/homelab/bootstrap-host.sh` before running it. The script changes
packages, Docker installation, firewall rules, hostname, and group membership.
Its default LAN subnet is site-specific.

```sh
sudo ADMIN_USER=dangphuc sh deploy/homelab/bootstrap-host.sh
sudo reboot
```

After reboot:

```sh
docker version
docker compose version
id
sudo ufw status verbose
timedatectl status
```

## Production directories

```sh
sudo install -d -o dangphuc -g docker -m 0750 \
  /srv/ani-desk/{app,data,backups,state,deployer}
sudo install -d -o root -g docker -m 0750 /srv/ani-desk/config
```

Clone the web repository:

```sh
git clone --branch master https://github.com/silent9669/ani-web.git \
  /srv/ani-desk/app
```

Install a protected environment file:

```sh
sudo install -o root -g docker -m 0640 \
  /srv/ani-desk/app/deploy/homelab/.env.example \
  /srv/ani-desk/config/ani-desk.env
sudoedit /srv/ani-desk/config/ani-desk.env
```

Required production values include:

| Variable | Meaning |
|---|---|
| `ANI_DESK_DOMAIN` | public hostname, without `https://` |
| `ANI_DESK_ADMIN_USERNAME` | protected built-in administrator |
| `ANI_DESK_ADMIN_PASSWORD` | long unique password |
| `ANI_DESK_DATA_PATH` | `/srv/ani-desk/data` |

Do not reuse the testing password in production. Existing local test accounts
may remain for local validation; production credentials belong only in the
protected host environment file.

# First manual deployment

Change to the repository root and use the protected environment file:

```sh
cd /srv/ani-desk/app

ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml config --quiet

ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml build ani-desk

ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml up -d
```

Verify all layers:

```sh
docker compose -p homelab -f deploy/homelab/compose.yml ps
docker compose -p homelab -f deploy/homelab/compose.yml \
  logs --tail=100 ani-desk
docker compose -p homelab -f deploy/homelab/compose.yml \
  logs --tail=100 caddy
curl -fsS https://YOUR_DOMAIN/api/health
```

Then test in a private browser window:

1. Open the HTTPS URL and confirm a valid certificate.
2. Sign in as the protected administrator.
3. Create or inspect a regular user.
4. Sign in as the regular user.
5. Search an English provider and a Vietnamese provider separately.
6. Open a title, load episodes, and test playback.
7. Add and remove My List items.
8. Confirm history is private between users.

# The Docker error in the screenshot

The message was:

```text
failed to read dockerfile: open Dockerfile: no such file or directory
```

This is a build-context/path error, not a Rust, provider, browser, or database
failure. All preceding tests in the screenshot passed.

The repository has `Dockerfile` at its root. It does **not** have
`deploy/homelab/Dockerfile`. These commands are wrong:

```sh
docker build deploy/homelab
docker build -f deploy/homelab/Dockerfile .
```

Use either:

```sh
docker build --file Dockerfile --tag ani-desk-homelab:test .
```

or:

```sh
docker compose --env-file deploy/homelab/.env \
  --file deploy/homelab/compose.yml build ani-desk
```

The image also needs root `tokens.css`, because the web stylesheet imports it.
The current Dockerfile copies that design-token file before running the Vite
build.

# Monitoring

## Health and uptime

The public liveness endpoint is:

```text
GET https://YOUR_DOMAIN/api/health
```

Configure Uptime Kuma or another monitor for one request every 60 seconds. Alert
after two or three consecutive failures to avoid noise from a brief restart.
Monitor from outside the VM when public availability matters; an internal-only
probe cannot detect DNS, router, or certificate failures.

Do not run full playback probes every minute. Provider searches and stream URLs
are external, rate-limited, and volatile. Schedule an authenticated provider
smoke check once or twice daily instead.

## Containers and resources

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml ps
docker stats --no-stream
docker system df
df -h /srv/ani-desk
du -sh /srv/ani-desk/{data,backups}
```

Alert thresholds suitable for a small homelab start at:

| Signal | Warning | Critical |
|---|---:|---:|
| disk usage | 75% | 85% |
| health failures | 2 consecutive | 3 consecutive |
| container restarts | any unexpected restart | repeated restart loop |
| TLS lifetime | under 21 days | under 7 days |
| memory | sustained 75% | sustained 90% or OOM |

## Logs

Application and provider errors:

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  logs --since=1h ani-desk
```

Caddy, TLS, routing, and client errors:

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  logs --since=1h caddy
```

Deployment activity:

```sh
tail -n 150 /srv/ani-desk/state/deploy.log
cat /srv/ani-desk/state/deployed.sha
cat /srv/ani-desk/state/approved-run.url
cat /srv/ani-desk/state/data-before.json
cat /srv/ani-desk/state/data-after.json
```

DDNS activity:

```sh
systemctl status ani-desk-ddns.timer --no-pager
journalctl -u ani-desk-ddns.service -n 100 --no-pager
```

Logs must not contain passwords, cookies, authorization headers, DDNS tokens,
provider tokens, or complete signed media URLs. Treat a leak as a credential
rotation incident, not only a logging bug.

## Provider health

The signed-in application exposes provider status under the Sources screen and
through `/api/providers/health`. Interpret states separately:

| State | Meaning | Action |
|---|---|---|
| healthy | search and provider health flow succeeded | no action |
| unavailable | upstream/network/server error | retry later, check provider |
| verification required | anti-bot challenge | use manual verification flow |
| not certified | adapter is intentionally disabled | do not enable in production |

The current certified default set is:

- English: AllAnime, MovieBox, and AnimeGG;
- Vietnamese: KKPhim, OPhim, and Niniyo.

HiAnime remains disabled because direct playback is not certified. AllAnime stays visible with
its user-controlled verification path when anti-bot checks block direct access.

Provider health is a snapshot rather than a permanent disable flag. The web app
still attempts an explicit user-selected search when a source advertises search
capability; a successful request clears a stale unavailable status. This is
important for OPhim and other upstreams that may recover between the scheduled
health probe and a user search.

OPhim uses its versioned API at `https://ophim1.com/v1/api`, permits a 20-second
upstream response window, and rejects non-success HTTP status before parsing a
response. Live release certification should confirm search, episode mapping,
stream resolution, and a real media byte range.

MovieBox signs and authenticates independently against its `api4`, `api5`, and
`api6` mirrors. The adapter tries them in that order, so one regionally
unreachable mirror does not take the source offline.

# Manual update and redeployment

First create a consistent backup. Then update to an exact reviewed commit:

```sh
cd /srv/ani-desk/app
git fetch origin master
git log --oneline --decorate -5 origin/master
git checkout --detach REVIEWED_40_CHARACTER_SHA
```

Build while the old container is still serving:

```sh
ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml build ani-desk
```

Recreate and verify:

```sh
ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml up -d ani-desk caddy

curl -fsS https://YOUR_DOMAIN/api/health
```

Record the known-good commit in the incident/change log. Do not use `git pull`
blindly on production; deploy an exact SHA whose CI result you reviewed.

# CI-gated automatic redeployment

The pull-deployment agent:

1. queries GitHub for the latest completed `CI` push run on `master`;
2. requires conclusion `success`;
3. requires the CI commit SHA to equal current `origin/master`;
4. builds the candidate before interrupting the old app;
5. stops the app briefly and archives persistent data;
6. recreates containers and checks the public health endpoint;
7. records deployed SHA and CI run URL;
8. preserves failed state and restores the pre-deploy code and data if startup,
   health, or data checks fail. A candidate build failure never stops the old
   container.

It also compares read-only SQLite integrity and the users, favorites, and
history row counts before and after recreation. A decrease fails deployment.

The verified non-root installation uses cron and the bounded-log wrapper:

```sh
install -m 0755 deploy/homelab/pull-deploy.sh \
  /srv/ani-desk/deployer/pull-deploy.sh
install -m 0755 deploy/homelab/run-pull-deploy.sh \
  /srv/ani-desk/deployer/run-pull-deploy.sh
install -m 0755 deploy/homelab/data-guard.py \
  /srv/ani-desk/deployer/data-guard.py
(crontab -l 2>/dev/null; printf '%s\n' \
  '*/3 * * * * /srv/ani-desk/deployer/run-pull-deploy.sh') | crontab -
```

The core script uses `flock`, so overlapping cron and manual runs exit safely.
Inspect `/srv/ani-desk/state/deploy.log` for activity.

If administrator access is available, remove that cron line, install the
reviewed service/timer units, and enable the systemd timer instead:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ani-desk-deploy.timer
systemctl list-timers ani-desk-deploy.timer
sudo systemctl start ani-desk-deploy.service
```

Pause cron-driven updates without stopping the app:

```sh
crontab -l | grep -v '/srv/ani-desk/deployer/run-pull-deploy.sh' | crontab -
```

Resume cron-driven updates:

```sh
(crontab -l 2>/dev/null; printf '%s\n' \
  '*/3 * * * * /srv/ani-desk/deployer/run-pull-deploy.sh') | crontab -
```

The homelab pulls public GitHub state. GitHub never needs the homelab SSH key,
and no administrative port should be exposed to the internet.

# Backup and restore

## Consistent manual backup

Stopping the application briefly avoids copying SQLite files mid-write:

```sh
cd /srv/ani-desk/app
docker compose -p homelab -f deploy/homelab/compose.yml stop ani-desk
sudo tar -C /srv/ani-desk -czf \
  /srv/ani-desk/backups/manual-$(date -u +%Y%m%dT%H%M%SZ).tar.gz data
docker compose -p homelab -f deploy/homelab/compose.yml up -d ani-desk
curl -fsS https://YOUR_DOMAIN/api/health
```

Verify the archive, not only its existence:

```sh
tar -tzf /srv/ani-desk/backups/SELECTED_BACKUP.tar.gz | head
sha256sum /srv/ani-desk/backups/SELECTED_BACKUP.tar.gz
```

Copy at least one encrypted backup away from the VM. A backup stored only on the
same disk is not disaster recovery.

## Restore

Preserve the failed state for later diagnosis, then restore:

```sh
docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml stop ani-desk

sudo mv /srv/ani-desk/data \
  /srv/ani-desk/data.failed.$(date -u +%s)

sudo tar -C /srv/ani-desk -xzf \
  /srv/ani-desk/backups/SELECTED_BACKUP.tar.gz

docker compose -p homelab \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  up -d ani-desk caddy

curl -fsS https://YOUR_DOMAIN/api/health
```

Test sign-in, My List, history, and provider search after restore. Rehearse a
restore on a separate VM or data directory at least quarterly.

# Rollback

Application rollback and data restore are different operations.

- Roll back code when a new image introduced a runtime or UI regression.
- Restore data only when a migration or write damaged persistent state.
- A previous container image does not automatically reverse a database schema.

Manual code rollback:

```sh
cd /srv/ani-desk/app
git checkout --detach LAST_KNOWN_GOOD_SHA

ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml build ani-desk

ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f deploy/homelab/compose.yml up -d ani-desk caddy

curl -fsS https://YOUR_DOMAIN/api/health
```

If health still fails, inspect DNS, Caddy, disk, memory, and provider state before
restoring a database backup.

# Provider maintenance and certification

Every enabled provider must support its declared capabilities and must be
tested as its own source. A provider is not considered fixed because search
alone works.

Required evidence:

1. deterministic parser/fixture tests;
2. live search returns the intended title;
3. details and episode lists map to the same title;
4. recent episode resolution returns direct playable media;
5. HLS/DASH media or at least a media byte range is retrievable;
6. required headers survive the server proxy;
7. failure classifications are safe and user-visible;
8. English and Vietnamese coverage are reported separately.

Run the default release certification:

```sh
cargo run --example provider_certification -- --require-english
```

Run a provider's ignored live tests explicitly:

```sh
cargo test --test providers_live test_niniyo_live_ \
  -- --ignored --nocapture
```

Niniyo is integrated through AniMapper's mapped Niniyo API. Its live acceptance
uses two independent titles (`Solo Leveling` and `Attack on Titan`) and requires
the returned URL to serve actual HLS media. AniMapper documents a 60-request per
minute limit, so do not run certification in a tight monitoring loop.

When a provider breaks:

1. confirm local DNS and internet access;
2. inspect provider health and the stable error classification;
3. run its live test once;
4. test a second known title to separate mapping from provider failure;
5. repair parser/domain/decryption logic with a fixture;
6. leave the provider disabled if playback cannot be certified;
7. keep AllAnime's manual verification path instead of deleting it.

# Security and credential operations

## File protections

```sh
sudo chown root:docker /srv/ani-desk/config/ani-desk.env
sudo chmod 0640 /srv/ani-desk/config/ani-desk.env
sudo find /srv/ani-desk/backups -type f -exec chmod 0640 {} \;
```

Check that no private file is tracked:

```sh
git ls-files | grep -E '(^|/)\.env$|\.db$|backup|credential|secret'
```

Any result must be reviewed; filenames alone are not proof of a secret, but a
real `.env` or database must not be pushed.

## Credential rotation

Rotate immediately after suspected disclosure:

1. change the production admin password in the protected environment file;
2. rotate the DDNS password/token in its systemd environment file;
3. rotate provider cookies/tokens if configured;
4. recreate the application container;
5. revoke active sessions or remove the session database rows through supported
   administration tooling;
6. inspect Git history and logs to determine whether secret removal from history
   is required.

Recreate after environment changes:

```sh
ANI_DESK_ENV_FILE=/srv/ani-desk/config/ani-desk.env \
docker compose --env-file /srv/ani-desk/config/ani-desk.env \
  -f /srv/ani-desk/app/deploy/homelab/compose.yml \
  up -d --force-recreate ani-desk
```

# Troubleshooting matrix

| Symptom | Likely cause | First checks | Corrective action |
|---|---|---|---|
| `open Dockerfile: no such file` | wrong context or `-f` path | `pwd`, `ls Dockerfile` | build from repository root |
| `tokens.css` not found | old Dockerfile/image layer | inspect Dockerfile copy steps | pull fixed commit and rebuild |
| health fails, Caddy works | app crash/startup/config | app logs, data permissions | correct env/volume, recreate app |
| TLS/domain fails | DNS, NAT, ports, clock | DNS lookup, Caddy logs, router | fix record/forwarding/time |
| login loop | secure cookie/domain/proxy mismatch | browser storage, app logs | use HTTPS and correct domain |
| valid login works in one browser only | stale shell or password-manager autofill | reveal password, exact origin, direct API test | reload, correct saved password, keep existing DB |
| too many login attempts | rate limiter after repeated failures | app logs and attempt timing | stop retries, verify password, wait for window |
| provider search empty | upstream or mapping issue | provider health, second title | retry, repair adapter, disable |
| OPhim badge is red but API recovered | health snapshot is stale | explicitly search OPhim, then retry health | let successful search clear status |
| AllAnime verification required | anti-bot challenge | source status | use manual verify workflow |
| Niniyo title has no episodes | AniMapper mapping absent | metadata provider mapping | use another provider/title |
| playback resolves but fails | media host/header/expiry | proxy logs, live media probe | refresh source, repair headers |
| deployment timer does nothing | no successful matching CI SHA | journal and state files | fix branch/repo/CI, rerun timer |
| disk fills | backups, Docker layers, logs | `du`, `docker system df` | prune reviewed artifacts safely |
| rollback still unhealthy | infrastructure/data issue | DNS, disk, Caddy, DB logs | restore only with evidence |

Do not run destructive Docker pruning blindly on a host with unrelated services.
List exact objects first. Database or backup deletion should always be a separate,
reviewed action.

## Safari login diagnostic

The hosted shell sends `Cache-Control: private, no-cache`. Safari therefore
revalidates the current HTML and hashed assets instead of indefinitely keeping a
stale login or layout build. When only Safari rejects a known-good account:

1. stay on one exact origin; `127.0.0.1`, a LAN hostname, and the public domain
   have different cookie jars;
2. reload the page and temporarily disable a content blocker for the site;
3. reveal the password field and verify the value Safari Passwords inserted;
4. inspect application logs for invalid-credential or rate-limit responses;
5. test the API without recording the password in shell history:

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

An HTTP 200 from that request proves the account and password hash are valid;
repair the browser state rather than replacing `web.db`. Repeated failed login
attempts are deliberately limited, so stop guessing and wait for the limiter
window after confirming the configured credential.

# Incident response order

1. Record the start time, visible symptom, and last known-good deployment SHA.
2. Test DNS and TLS from outside the VM.
3. Test `/api/health`.
4. Check Compose state and restart counts.
5. Read Caddy and application logs around the incident time.
6. Check disk, memory, load, clock, and host networking.
7. Distinguish the service from AniList/provider failure.
8. If the incident began after deployment, roll back code.
9. Restore data only with evidence of migration or database damage.
10. Rotate credentials if any secret may have appeared in Git or logs.
11. Record root cause, repair, validation, and prevention.

# Maintenance schedule

## Daily or automated

- public health and TLS probe;
- container restart and host disk alerts;
- deployment/DDNS timer failure alert;
- one lightweight English and Vietnamese provider smoke check.

## Weekly

- review application, Caddy, deployment, and DDNS errors;
- inspect disk growth and backup creation;
- confirm the deployed SHA is CI-approved;
- review dependency and base-image security alerts.

## Monthly

- apply reviewed host security updates and reboot if required;
- run the complete local test and provider certification suite;
- test administrator and regular-user flows;
- verify an off-host encrypted backup and its checksum;
- review enabled providers and disable uncertified sources.

## Quarterly

- restore a backup to staging and record duration/result;
- rehearse a code rollback;
- rotate sensitive credentials according to policy;
- review firewall, router forwarding, DNS, and user access;
- confirm the handbook commands still match repository scripts.

# Pre-push and pre-production checklist

Before pushing to `silent9669/ani-web`:

- [ ] `git status --short` reviewed file by file;
- [ ] remote URL is the ani-web repository;
- [ ] no real `.env`, database, backup, cookie, token, or signed URL is staged;
- [ ] frontend build, icons, format, clippy, Rust tests, and smoke test pass;
- [ ] Docker image builds from the repository root;
- [ ] Compose configuration validates using a protected/local env file;
- [ ] English and Vietnamese provider certification results are recorded;
- [ ] Niniyo live tests retrieve real HLS media;
- [ ] desktop and mobile browser flows pass;
- [ ] CI targets `master`.

Before production recreation:

- [ ] exact commit SHA reviewed and CI successful;
- [ ] consistent backup created and archive listing verified;
- [ ] current deployed SHA recorded;
- [ ] rollback SHA known;
- [ ] health, logs, and browser acceptance commands ready;
- [ ] maintenance window communicated if other users rely on the service.

# References in this repository

- `deploy/homelab/README.md` -- concise deployment notes;
- `deploy/homelab/compose.yml` -- Caddy and application services;
- `deploy/homelab/pull-deploy.sh` -- CI-gated update and rollback;
- `deploy/homelab/bootstrap-host.sh` -- host preparation;
- `context/06-deploy-operate-monitor.md` -- canonical runbook context;
- `context/04-api-data-provider-contracts.md` -- API/provider rules;
- `examples/provider_certification.rs` -- live release gate;
- `tests/providers_live.rs` -- provider media probes;
- `.github/workflows/ci.yml` -- push and pull-request checks.

Keep this PDF with the source Markdown. When commands or deployment paths
change, update the Markdown, rebuild the PDF, and perform at least one staging
deployment before relying on the revision in production.
