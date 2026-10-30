# Scan API — agent usage

For an automated agent that needs to run a scan and read back what that scan found.
Verified against `https://accessibility.group3solutions.com/api` on 2026-10-14.

## Auth

Two kinds of credential work. **For agent use, prefer a user token** — it is one
credential for every site.

### User API token (preferred for agents)

```
Authorization: Bearer g3u_xxxxxxxx
Accept: application/json
```

No `X-Site-Url`, no `/api/activate`, no per-site minting. Create one in the dashboard
under **Settings → API tokens** (no SSH needed), or on the host:

```bash
php artisan g3:mint-user-token --user=you@example.com --name="ADA agent"
# optional: --hosts=www.haysmed.com,www.pawneevalleyhospital.com --expires=2027-10-30
php artisan g3:mint-user-token --list
php artisan g3:mint-user-token --revoke=3
```

The token is printed once; only its sha256 is stored. `--hosts` is an exact-match
allowlist checked in the middleware against `url`, `sitemap_urls`, `site_url` and
`X-Site-Url`; a mismatch is `403 HOST_NOT_ALLOWED`. **Exact means exact**:
`www.haysmed.com` does not admit `haysmed.com`. Omit `--hosts` to allow any host.

Scans a token creates are owned by the **internal licence** — the same tenant the
dashboard's ad-hoc scanner writes to. So a token can list and rescan scans started from
the UI, and vice versa. It cannot see a client licence's scans; that boundary is
unchanged.

`GET /api/license` echoes back which token answered, under `token`, plus the live
`quotas`. Use it as the credential smoke test.

Errors specific to this path: `TOKEN_REVOKED`, `TOKEN_EXPIRED` (both `403`, and unlike a
licence they apply to reads too), `HOST_NOT_ALLOWED` (`403`).

### Licence key (what the WordPress plugin uses)

```
Authorization: Bearer <licence key>
X-Site-Url: https://www.example.com     # must match the pin EXACTLY
Accept: application/json
```

A licence is pinned to **one** site (`max_sites = 1`). Two sites need two keys.

**The `X-Site-Url` must match the pinned value character for character**, including the
`www.` prefix if the pin has one. A bare domain against a `www.` pin returns
`403 SITE_NOT_ACTIVATED`, and calling `/api/activate` to "fix" it returns
`409 LICENSE_ALREADY_ACTIVATED`. Check the pin before guessing:

```bash
php artisan tinker --execute="echo \App\Models\LicenseActivation::pluck('site_url')->implode(PHP_EOL);"
```

## Minting a licence key

```bash
php artisan g3:mint-license \
  --name="ADA agent — HaysMed" \
  --site-url="https://www.haysmed.com" \
  --activate                      # REQUIRED for agent keys
  # --expires=2027-10-14          # optional
```

The plaintext key is printed **once**; only its sha256 is stored.

`--activate` matters. Without it the pin is created with `activated_at = null` and every
scan request 403s — normally a WordPress plugin clears that by calling `POST /api/activate`
on first run, but an agent has no plugin. Either mint with `--activate`, or call
`POST /api/activate` yourself before the first scan.

### Quotas

Defaults (`config/scanner.php`): `cooldown_s 60` (same URL), `concurrency 2`,
`daily_cap 100`, `fullscan_per_day 1`. Exceeding one returns `429` with a `Retry-After`
header — honour it rather than retrying blindly.

**User tokens bill their scans to the internal licence, which is deliberately looser**
(`cooldown_s 30`, `concurrency 3`, `daily_cap 500`, `fullscan_per_day 20`) because one
token spans every site, and the stock `fullscan_per_day 1` would let one site's baseline
block all the others for a day. `GET /api/license` reports the live numbers.

One thing is *not* relaxed: `FULLSCAN_IN_PROGRESS`. Full crawls still run one at a time
per licence, so a second full scan while one is running gets `429` whichever site it is
for. Finish the first, then start the next — that is what keeps the scanner box sane.

Rescan is **not** exempt from the cooldown. For a tight fix-then-recheck loop, override
per licence:

```bash
php artisan tinker --execute="\App\Models\License::find(<id>)->update(['scan_quotas' => ['cooldown_s' => 5]]);"
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/scans` | List this licence's scans, newest first |
| `POST` | `/api/scans` | Start a scan |
| `GET` | `/api/scans/{id}` | Status and progress |
| `POST` | `/api/scans/{id}/rescan` | Repeat a scan's **exact** inputs |
| `GET` | `/api/scans/{id}/findings` | That scan's findings |
| `GET` | `/api/findings?scan_id=N` | Same, as a filter |
| `GET` | `/api/findings` | All findings for the licence, across scans |

`GET /api/scans` takes `type=page|full`, `status=queued|running|complete|failed`,
`per_page`, and `top_level` (default `1` — child page scans of a full-site scan are hidden;
pass `top_level=0` to include them).

`POST /api/scans` takes `{"type":"page","url":"…"}` or `{"type":"full","sitemap_urls":[…]}`
(`sitemap_urls` optional — omit it to let the crawler discover). Returns `202` with the
scan object.

## The loop

```
POST /api/scans            -> 202, note scan.id
GET  /api/scans/{id}       -> poll until status is "complete" or "failed"
GET  /api/scans/{id}/findings
```

There is no webhook. Use `pages_done` / `pages_total` to back off sensibly.

## Things that will catch you out

**Use rescan for before/after, not a new full scan.** `POST /api/scans/{id}/rescan` replays
the original's exact page list and skips discovery. A fresh full scan re-crawls and can come
back with a different page set, which silently invalidates any delta. This happened comparing
the September 2026 scans — page sets had to be verified by hand before the numbers meant
anything.

**Findings attach to the page scan, not the parent full scan.** `GET /api/scans/{id}/findings`
expands a full scan to its children for you (`Scan::findingScanIds()`). A hand-rolled query
filtering on the parent id alone returns zero rows.

**Scans are scoped to the licence that created them.** This is the tenant boundary and is
deliberate. An agent key cannot `GET` or rescan a scan created under a different licence —
including scans run from the dashboard — and will get `404 NOT_FOUND`. To reproduce an older
baseline from another licence, start a `full` scan with `sitemap_urls` set to that scan's exact
page list; from then on the agent can rescan its own scan.

**`GET /api/findings` without `scan_id` is stateful**, not a scan result: findings carry
`open` / `resolved` / `ignored` / `regressed` across scans. For "what did this run report",
always scope by scan.

## Operational

`QUEUE_CONNECTION=database` — a worker must be running (`php artisan queue:work`) or scans sit
at `queued` forever. That is the first thing to check if a scan never starts.

## Deployment

Live: `https://accessibility.group3solutions.com`
Host: `ssh -i ~/.ssh/group3.pem ubuntu@plugins.group3solutions.com`
Path: `/var/www/g3-accessibility` (git checkout, tracks `origin/main`)
Stack: `APP_ENV=production`, MySQL (`g3_accessibility`), `QUEUE_CONNECTION=database`,
php-fpm as `www-data`, files owned `ubuntu`.

```bash
cd /var/www/g3-accessibility && git pull --ff-only
cd g3-access-dashboard
php artisan migrate --force
php artisan route:clear && php artisan route:cache
php artisan config:clear && php artisan config:cache
php artisan route:list | grep api/scans        # verify AFTER caching
```

**The route cache will bite you.** This host caches routes
(`bootstrap/cache/routes-v7.php`). A deploy that copies files without clearing it leaves
new *controller* code live — classes autoload fresh — while new *routes* 404, because
`routes/api.php` is only read when the cache is built. That exact split happened on
2026-10-14: `?scan_id=` filtering worked while `/api/scans/{id}/findings` 404'd, and the
cache was five months stale. It looks like a partial deploy and isn't.

Always re-run `route:list` **after** `route:cache`, not just after `route:clear` — caching
is the step that can silently undo the fix.

Smoke test without credentials (each should be `401 MISSING_KEY`, not 404/405):

```bash
for p in /api/scans /api/scans/1 /api/scans/1/findings /api/findings; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" -H 'Accept: application/json' \
    https://accessibility.group3solutions.com$p
done
```
