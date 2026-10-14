# Scan API — agent usage

For an automated agent that needs to run a scan and read back what that scan found.
Verified against `https://accessibility.group3solutions.com/api` on 2026-10-14.

## Auth

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

## Minting a key

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
