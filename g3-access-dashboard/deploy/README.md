# Deployment — G3 Access (EC2 / Ubuntu 22.04+)

The dashboard and scanner are siblings in a single git repo
(`cmorris-g3/g3-accessibility`):

```
g3-accessibility/
  g3-access/                 # WordPress plugin (deployed to client sites, not the server)
  g3-access-dashboard/       # Laravel app — this README lives here
  g3-access-scanner/         # Node + Playwright scanner CLI
```

The dashboard shells out to the scanner CLI from queue workers. Both apps live
on the same EC2 box.

## Assumptions

This README assumes the server is already provisioned with:

* PHP 8.3 + FPM, Composer
* Node 20+
* MySQL (local or RDS) — schema `g3_access` and a user with full privs on it
* Nginx, Supervisor, cron
* A deploy user with read access to the github-g3 SSH key (or a deploy key on the repo)

`deploy/setup-ec2.sh` is a reference for fresh provisioning. Skip it if the box
is already set up. `deploy/{nginx,supervisor,cron}/` contain reference
templates — feel free to use them, adapt them, or ignore them in favor of your
own configs (paths, log destinations, worker count, server_name/TLS).

## Layout on server

```
/var/www/
  g3-accessibility/                   # single git checkout
    g3-access-dashboard/              # Laravel app
    g3-access-scanner/                # scanner CLI
  g3-access-scans/                    # scanner artifact output (chown www-data)
```

Both app dirs share one repo, so `git pull` happens once at `/var/www/g3-accessibility`.

## First-time deploy

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone git@github-g3:cmorris-g3/g3-accessibility.git
sudo chown -R www-data:www-data g3-accessibility
sudo mkdir -p /var/www/g3-access-scans
sudo chown www-data:www-data /var/www/g3-access-scans
```

### Dashboard

```bash
cd /var/www/g3-accessibility/g3-access-dashboard
sudo -u www-data composer install --no-dev --optimize-autoloader
sudo -u www-data cp .env.example .env
sudo -u www-data nano .env                       # see .env essentials below
sudo -u www-data php artisan key:generate
sudo -u www-data php artisan migrate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan config:cache route:cache view:cache
```

### Scanner

```bash
cd /var/www/g3-accessibility/g3-access-scanner
sudo -u www-data npm ci
sudo -u www-data npm run build
# One-time (and after major Playwright bumps):
sudo npx playwright install chromium --with-deps
```

The dashboard finds the scanner via `SCANNER_CLI_PATH` in its `.env`. Point it
at the absolute path of the built CLI:

```
SCANNER_CLI_PATH=/var/www/g3-accessibility/g3-access-scanner/dist/cli.js
```

### Process configs

`deploy/supervisor/g3-access-worker.conf`, `deploy/cron/g3-access-scheduler`,
and `deploy/nginx/g3-access.conf` are reference templates. Drop them in or
substitute your own. Minimum requirements:

* **Nginx vhost** serving `/var/www/g3-accessibility/g3-access-dashboard/public` over PHP-FPM 8.3.
* **Supervisor** running `php artisan queue:work` against the `default` queue.
  4 procs is the documented baseline; tune for your box.
  Workers run `--tries=1` by design (failed scans don't auto-retry; see Rollback).
* **cron** firing `php artisan schedule:run` every minute as the app user.
  This drives the daily 03:15 `g3:run-scheduled-full-scans` job.

After installing/changing supervisor or cron configs:

```bash
sudo supervisorctl reread && sudo supervisorctl update
sudo systemctl restart cron
```

### First user

Public registration is disabled. Create users via artisan:

```bash
cd /var/www/g3-accessibility/g3-access-dashboard
sudo -u www-data php artisan g3:make-user
# or non-interactive:
sudo -u www-data php artisan g3:make-user --name="Chris Morris" --email=chris@example.com
# omit --password to auto-generate (printed once); pass --password=... to set explicitly.
```

Users are created with `email_verified_at` set, so they can log in immediately.
Email verification is disabled app-wide.

## .env essentials

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://dashboard.example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=g3_access
DB_USERNAME=...
DB_PASSWORD=...

QUEUE_CONNECTION=database

SCANNER_NODE_PATH=node
SCANNER_CLI_PATH=/var/www/g3-accessibility/g3-access-scanner/dist/cli.js
SCANNER_OUT_DIR=/var/www/g3-access-scans
SCANNER_TIMEOUT_MS=120000
SCANNER_DISCOVER_TIMEOUT_MS=30000
```

## Subsequent deploys

```bash
cd /var/www/g3-accessibility
sudo -u www-data git pull

# Dashboard
cd g3-access-dashboard
sudo -u www-data composer install --no-dev --optimize-autoloader
sudo -u www-data php artisan migrate --force
sudo -u www-data php artisan config:cache route:cache view:cache
sudo supervisorctl restart g3-access-worker:*

# Scanner (only when scanner code or deps changed)
cd ../g3-access-scanner
sudo -u www-data npm ci
sudo -u www-data npm run build
```

No worker restart is needed for scanner-only changes — workers shell out to
`SCANNER_CLI_PATH` per scan, so the next job picks up the new build.

## What runs where

| Process | Controlled by | What it does |
|---|---|---|
| Nginx + PHP-FPM | systemd | serves API + dashboard web UI |
| Queue workers (4 procs) | Supervisor | pick up `RunPageScanJob`, `DiscoverSiteUrlsJob` |
| Laravel scheduler | cron (every minute) | dispatches `g3:run-scheduled-full-scans` at 03:15 daily |
| Chromium | spawned per-scan by scanner CLI | headless browser for probes |

## Operational commands

```bash
# Worker health
sudo supervisorctl status g3-access-worker:*
sudo tail -f /var/log/supervisor/g3-access-worker.log

# Force-run the scheduler (testing)
php artisan g3:run-scheduled-full-scans --dry-run

# Mint a license for a client site
php artisan g3:mint-license --name="Client Name" --site-url="https://clientsite.com"

# Add a dashboard user
php artisan g3:make-user --name="..." --email=...

# Inspect the queue
php artisan queue:monitor database:default --max=100
php artisan queue:failed
php artisan queue:retry all
```

## Sizing notes

* **Web + API**: tiny. 1 vCPU / 1–2 GB RAM is plenty for agency-scale traffic.
* **Workers**: Chromium is the heavy tenant. Each concurrent scan ≈ 300 MB RAM. With 4 worker procs and per-license concurrency capped at 2, peak RAM is ~1.5–2 GB just for browsers. 4 GB / 2 vCPU box is comfortable to start; scale horizontally if scan backlog grows.
* **DB**: MySQL on the same box or a small RDS instance. Findings grow linearly with clients × pages × findings/page; indexes cover the hot queries (see migrations for `(license_id, fingerprint)` and `(license_id, status)` indexes).
* **Storage**: `SCANNER_OUT_DIR` accumulates run artifacts (screenshots, per-probe JSONs). For MVP it's fine to let them pile up on local disk and `find -mtime +30 -delete` monthly. When you outgrow the EC2 disk, move to S3.

## Amazon Linux 2023 gotchas

The reference `setup-ec2.sh` targets Ubuntu 22.04. On AL2023:

* Replace `apt-get install` with `dnf install`.
* Playwright system deps are named differently (`libXcomposite`, `libXcursor`, etc. — run `npx playwright install chromium` once, it will print missing libraries).
* PHP 8.3 comes from `amazon-linux-extras` or `remi` repos, not `ppa:ondrej/php`.

Easier path for first deploy: pick Ubuntu AMI, debug there, port to AL2023 later if needed.

## Rollback

```bash
cd /var/www/g3-accessibility
sudo -u www-data git reset --hard <previous-sha>

cd g3-access-dashboard
sudo -u www-data composer install --no-dev --optimize-autoloader
sudo -u www-data php artisan migrate:rollback   # only if rollback crosses schema changes
sudo -u www-data php artisan config:cache
sudo supervisorctl restart g3-access-worker:*

# Rebuild scanner if it changed
cd ../g3-access-scanner
sudo -u www-data npm ci && sudo -u www-data npm run build
```

Worker jobs are `tries=1` — failed scans stay failed rather than retrying
during a bad deploy. Re-run them manually after a fix via
`php artisan queue:retry all`.
