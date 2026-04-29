import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Filesystem-safe slug for a URL. The slug is used as a directory name
 * under the run dir's pages/ subdir AND as the key the analyzer uses to
 * map back to the URL (via manifest.urls).
 *
 * MUST be unique per URL: the analyzer iterates pages/<slug>/ subdirs and
 * looks each slug up in a slug→URL map. Two URLs that map to the same slug
 * cause one to overwrite the other in the map, so all findings at that slug
 * get attributed to a single URL — pages_affected counts and per-page
 * reports go wrong.
 *
 * Path-only sites (most marketing sites) keep the same path-derived slug.
 * Query-string-routed sites (PHP `getpage.php?name=X`-style) also need the
 * search portion baked in, otherwise four `?name=*` URLs collapse to one
 * "getpage-php" slug. The hash suffix disambiguates without bloating the
 * filename.
 */
export function slugifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? 'home' : u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
    const baseSlug = path.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'home';
    if (!u.search) return baseSlug;
    const hash = createHash('sha256').update(u.search).digest('hex').slice(0, 8);
    return `${baseSlug}--${hash}`;
  } catch {
    return url.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }
}

export function slugifySite(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/\./g, '-');
  } catch {
    return url.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }
}

export function runIdNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
}
