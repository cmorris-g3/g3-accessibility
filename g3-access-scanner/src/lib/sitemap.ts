import type { Page } from 'playwright';

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',
  '/sitemaps.xml',
];

/**
 * Discover URLs on a site via sitemap.xml (with link-crawl fallback handled upstream).
 *
 * Strategy (in order):
 *   1. Read robots.txt and collect every `Sitemap:` directive.
 *   2. Add the common sitemap paths as fallback candidates.
 *   3. BFS through all candidate URLs, following sub-sitemap indexes to any depth.
 *   4. Deduplicate, cap at maxPages.
 *
 * Host comparison is tolerant of `www.` — a sitemap listed under `www.example.com`
 * is accepted when the user typed `example.com`, and vice versa.
 */
export async function discoverUrls(
  warmedPage: Page,
  rootUrl: string,
  maxPages: number,
): Promise<string[]> {
  const rootParsed = new URL(rootUrl);
  const collected = new Set<string>();

  // Build candidate list: robots.txt + common paths.
  const candidates = new Set<string>();
  for (const u of await fetchRobotsSitemaps(warmedPage, rootUrl)) {
    candidates.add(u);
  }
  for (const path of COMMON_SITEMAP_PATHS) {
    candidates.add(new URL(path, rootParsed).toString());
  }

  // BFS through sitemaps and sub-sitemap indexes.
  const visited = new Set<string>();
  const queue: string[] = Array.from(candidates);

  while (queue.length > 0 && collected.size < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const xml = await fetchInPage(warmedPage, url);
    if (!xml) continue;

    const parsed = parseSitemapXml(xml, rootUrl);
    for (const p of parsed.pages) {
      collected.add(p);
      if (collected.size >= maxPages) break;
    }
    for (const s of parsed.subSitemaps) {
      if (!visited.has(s)) queue.push(s);
    }
  }

  if (collected.size === 0) return [rootUrl];

  const urls = Array.from(collected).slice(0, maxPages);
  if (!urls.some((u) => normalize(u) === normalize(rootUrl))) {
    urls.unshift(rootUrl);
    if (urls.length > maxPages) urls.length = maxPages;
  }
  return urls;
}

async function fetchRobotsSitemaps(page: Page, rootUrl: string): Promise<string[]> {
  const robotsUrl = new URL('/robots.txt', rootUrl).toString();
  const body = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }, robotsUrl);
  if (!body) return [];
  return [...body.matchAll(/^[\t ]*Sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
}

async function fetchInPage(page: Page, url: string): Promise<string | null> {
  try {
    const result = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, {
          headers: { Accept: 'application/xml,text/xml,*/*' },
          credentials: 'include',
        });
        if (!res.ok) return { ok: false, status: res.status, body: '' };
        const body = await res.text();
        return { ok: true, status: res.status, body };
      } catch (err) {
        return { ok: false, status: 0, body: '', error: (err as Error).message };
      }
    }, url);

    if (!result.ok) return null;
    const raw = result.body;
    if (!raw.includes('<urlset') && !raw.includes('<sitemapindex')) return null;
    return raw;
  } catch {
    return null;
  }
}

interface SitemapParseResult {
  pages: string[];
  subSitemaps: string[];
  isIndex: boolean;
}

function parseSitemapXml(xml: string, rootUrl: string): SitemapParseResult {
  const expectedHost = new URL(rootUrl).hostname;
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
    m[1].trim().replace(/&amp;/g, '&'),
  );

  const sameHost = locs.filter((u) => {
    try {
      return hostMatches(new URL(u).hostname, expectedHost);
    } catch {
      return false;
    }
  });

  if (isIndex) {
    return { pages: [], subSitemaps: sameHost, isIndex: true };
  }
  return { pages: sameHost, subSitemaps: [], isIndex: false };
}

/**
 * Hostnames are equivalent if they match after stripping a leading `www.`.
 * Lets us accept `www.example.com` URLs from a sitemap when the user entered `example.com`.
 */
function hostMatches(a: string, b: string): boolean {
  const strip = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  return strip(a) === strip(b);
}

function normalize(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}
