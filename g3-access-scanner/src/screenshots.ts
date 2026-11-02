import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { primeConsent, type ConsentMode } from './lib/consent.js';

export interface ShotTarget {
  /** Stable id — becomes the filename and the markdown reference. */
  id: string;
  url: string;
  /** CSS selector of the element to highlight. */
  selector: string | null;
  /** Shown under the image in the document. */
  caption?: string;
}

export interface ShotResult {
  id: string;
  file: string | null;
  ok: boolean;
  reason: string;
}

export interface CaptureOptions {
  outDir: string;
  viewport?: { w: number; h: number };
  timeoutMs?: number;
  consent?: ConsentMode;
  /** Pixels of context kept around the element. */
  padding?: number;
}

/**
 * Annotated element screenshots for the audit documents.
 *
 * The SOW for these engagements requires findings to be documented "with
 * screenshots and plain-English explanations", and a CSS selector is not a
 * screenshot — an editor cannot act on `div:nth-of-type(4) > span > a`.
 *
 * Images are written as local PNGs inside the run directory. The markdown
 * references them relatively, so pandoc embeds them when building the .docx;
 * only *network* image fetches were ever unreliable, not local files.
 */
export async function captureShots(targets: ShotTarget[], opts: CaptureOptions): Promise<ShotResult[]> {
  const viewport = opts.viewport ?? { w: 1440, h: 900 };
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const padding = opts.padding ?? 80;

  await mkdir(opts.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: process.env.SCANNER_STRICT_TLS !== '1',
  });

  const results: ShotResult[] = [];

  // One page per URL: most targets on a site share a handful of pages, and
  // re-navigating per target would multiply load on the client's site.
  const byUrl = new Map<string, ShotTarget[]>();
  for (const t of targets) {
    if (!byUrl.has(t.url)) byUrl.set(t.url, []);
    byUrl.get(t.url)!.push(t);
  }

  let consentPrimed = false;

  try {
    for (const [url, group] of byUrl) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});

        // Consent once per context; the grant persists for later pages.
        if (!consentPrimed) {
          const consent = await primeConsent(page, opts.consent ?? 'accept-all', timeoutMs);
          consentPrimed = true;
          if (consent.accepted) {
            console.error(`[shoot] Consent accepted via ${consent.cmp} (${consent.detail}).`);
            await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
            await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
          }
        }
        await page.waitForTimeout(1500);

        for (const t of group) {
          results.push(await shootOne(page, t, opts.outDir, padding));
        }
      } catch (err) {
        for (const t of group) {
          results.push({ id: t.id, file: null, ok: false, reason: `page load failed: ${(err as Error).message}` });
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  await writeFile(`${opts.outDir}/shots.json`, JSON.stringify(results, null, 2) + '\n', 'utf8');
  return results;
}

async function shootOne(
  page: import('playwright').Page,
  target: ShotTarget,
  outDir: string,
  padding: number,
): Promise<ShotResult> {
  const file = `${target.id}.png`;
  const path = `${outDir}/${file}`;

  if (!target.selector) {
    return { id: target.id, file: null, ok: false, reason: 'no selector' };
  }

  try {
    const el = page.locator(target.selector).first();
    if ((await el.count()) === 0) {
      return { id: target.id, file: null, ok: false, reason: 'selector matched nothing' };
    }
    await el.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(350);

    const box = await el.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      return { id: target.id, file: null, ok: false, reason: 'element has no visible box' };
    }

    // Outline the element so the reader can see WHICH thing is being
    // discussed; a bare crop of a card looks like an ordinary screenshot.
    const cleanup = await el.evaluate((node) => {
      const e = node as HTMLElement;
      const prev = { outline: e.style.outline, offset: e.style.outlineOffset, radius: e.style.borderRadius };
      e.style.outline = '3px solid #d93025';
      e.style.outlineOffset = '2px';
      e.style.borderRadius = e.style.borderRadius || '2px';
      return prev;
    });

    const vp = page.viewportSize() ?? { width: 1440, height: 900 };
    const clip = {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: Math.min(vp.width, box.width + padding * 2),
      height: Math.min(vp.height, box.height + padding * 2),
    };

    await page.screenshot({ path, clip, type: 'png' });

    await el.evaluate((node, prev) => {
      const e = node as HTMLElement;
      e.style.outline = prev.outline;
      e.style.outlineOffset = prev.offset;
      e.style.borderRadius = prev.radius;
    }, cleanup);

    return { id: target.id, file, ok: true, reason: 'captured' };
  } catch (err) {
    return { id: target.id, file: null, ok: false, reason: (err as Error).message };
  }
}
