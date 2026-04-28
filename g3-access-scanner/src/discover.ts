import { chromium } from 'playwright';
import { discoverUrls } from './lib/sitemap.js';
import { extractInternalLinks } from './lib/crawl-links.js';

export interface DiscoverOptions {
  url: string;
  maxPages: number;
  timeoutMs: number;
}

export interface DiscoverResult {
  root: string;
  source: 'sitemap' | 'link-crawl' | 'root-only';
  urls: string[];
}

export async function discover(opts: DiscoverOptions): Promise<DiscoverResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: process.env.SCANNER_STRICT_TLS !== '1',
  });

  try {
    const page = await context.newPage();
    await page.goto(opts.url, { waitUntil: 'load', timeout: opts.timeoutMs });
    await page.waitForTimeout(500);

    // Use the post-redirect URL as the base. If the user typed
    // `example.com` but the server redirects to `www.example.com`,
    // we must use the effective host for sitemap path resolution and
    // for accepting URLs listed in those sitemaps.
    const effectiveUrl = page.url();

    const fromSitemap = await discoverUrls(page, effectiveUrl, opts.maxPages);
    if (fromSitemap.length > 1) {
      return { root: effectiveUrl, source: 'sitemap', urls: fromSitemap };
    }

    const fromLinks = await extractInternalLinks(page, effectiveUrl, opts.maxPages);
    const merged = Array.from(new Set<string>([effectiveUrl, ...fromLinks])).slice(0, opts.maxPages);
    if (merged.length > 1) {
      return { root: effectiveUrl, source: 'link-crawl', urls: merged };
    }

    return { root: effectiveUrl, source: 'root-only', urls: [effectiveUrl] };
  } finally {
    await context.close();
    await browser.close();
  }
}
