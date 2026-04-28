import type { Page } from 'playwright';

export async function extractInternalLinks(
  page: Page,
  rootUrl: string,
  maxCount: number,
): Promise<string[]> {
  const rootHost = new URL(rootUrl).hostname;

  const urls: string[] = await page.evaluate(
    ({ rootHost, maxCount }) => {
      const stripWww = (h: string) => h.replace(/^www\./i, '').toLowerCase();
      const expected = stripWww(rootHost);
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const seen = new Set<string>();
      const excludeExt = /\.(pdf|zip|png|jpe?g|gif|svg|ico|mp4|mov|mp3|doc|docx|xls|xlsx)(\?|$)/i;

      for (const a of anchors) {
        const href = a.href;
        if (!href) continue;
        let u: URL;
        try {
          u = new URL(href);
        } catch {
          continue;
        }
        if (stripWww(u.hostname) !== expected) continue;
        if (!['http:', 'https:'].includes(u.protocol)) continue;
        if (excludeExt.test(u.pathname)) continue;
        u.hash = '';
        u.search = '';
        const normalized = u.toString().replace(/\/$/, '');
        seen.add(normalized);
        if (seen.size >= maxCount) break;
      }

      return Array.from(seen);
    },
    { rootHost, maxCount },
  );

  return urls;
}
