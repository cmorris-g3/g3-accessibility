import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeJson, ensureDir, slugifyUrl, slugifySite, runIdNow } from './lib/fs.js';
import { discoverUrls } from './lib/sitemap.js';
import { extractInternalLinks } from './lib/crawl-links.js';
import { runAxe } from './probes/axe.js';
import { runA11yTree } from './probes/a11y-tree.js';
import { runHeadings } from './probes/headings.js';
import { runTargetSize } from './probes/target-size.js';
import { runImages } from './probes/images.js';
import { runLinks } from './probes/links.js';
import { runContrast } from './probes/contrast.js';
import { runKeyboardWalk } from './probes/keyboard-walk.js';
import { runReflow } from './probes/reflow.js';
import { runTextSpacing } from './probes/text-spacing.js';
import { runReducedMotion } from './probes/reduced-motion.js';
import { runSensoryLanguage } from './probes/sensory-language.js';
import { runConsistency } from './probes/consistency.js';
import type { Manifest, ScanOptions, Summary, PageContext } from './types.js';
import { CONTRACT_VERSION } from './types.js';

async function readDepVersion(pkgName: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, '..', 'node_modules', pkgName, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  return JSON.parse(raw).version ?? 'unknown';
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    parsed.search = '';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}`;
  } catch {
    return u;
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = normalizeUrl(u);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(u);
    }
  }
  return out;
}

export async function crawl(opts: ScanOptions): Promise<string> {
  const startedAt = new Date().toISOString();
  const runId = opts.runId ?? runIdNow();
  const siteSlug = slugifySite(opts.url);
  const runDir = `${opts.outDir}/${siteSlug}/${runId}`;

  await ensureDir(runDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: opts.viewport.w, height: opts.viewport.h },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: process.env.SCANNER_STRICT_TLS !== '1',
  });

  let urls: string[] = [opts.url];

  if (opts.urlList && opts.urlList.length > 0) {
    console.log(`[scanner] Warming session (visiting root)...`);
    const warmupPage = await context.newPage();
    try {
      await warmupPage.goto(opts.url, { waitUntil: 'load', timeout: opts.timeoutMs });
      await warmupPage.waitForTimeout(1000);
    } catch (err) {
      console.error(`[scanner] Warmup failed (continuing): ${(err as Error).message}`);
    } finally {
      await warmupPage.close();
    }
    urls = dedupeUrls(opts.urlList).slice(0, opts.maxPages);
    console.log(`[scanner] Using explicit URL list (${urls.length} URL(s)).`);
  } else {
    console.log(`[scanner] Warming session (visiting root)...`);
    const warmupPage = await context.newPage();
    try {
      await warmupPage.goto(opts.url, { waitUntil: 'load', timeout: opts.timeoutMs });
      await warmupPage.waitForTimeout(1000);
      console.log(`[scanner] Discovering URLs from ${opts.url}...`);
      urls = await discoverUrls(warmupPage, opts.url, opts.maxPages);
    } catch (err) {
      console.error(`[scanner] Warmup/discovery failed (continuing with root only): ${(err as Error).message}`);
    } finally {
      await warmupPage.close();
    }
    urls = dedupeUrls(urls);
  }
  if (urls.length <= 1 && opts.maxPages > 1) {
    console.log(`[scanner] Sitemap unavailable or blocked; will fall back to link-crawl from root.`);
  } else if (urls.length > 1) {
    console.log(`[scanner] Sitemap discovered ${urls.length} URL(s).`);
  }
  console.log(`[scanner] Auditing up to ${opts.maxPages} URL(s) starting with ${urls.length} seed.`);

  const aggregates = {
    total_images: 0,
    total_links: 0,
    total_headings: 0,
    total_interactive_elements: 0,
    axe_violations: 0,
    target_size_failures: 0,
    heading_issues: 0,
  };

  try {
    let idx = 0;
    while (idx < urls.length && idx < opts.maxPages) {
      const url = urls[idx];
      console.log(`[scanner] [${idx + 1}/${Math.min(urls.length, opts.maxPages)}] ${url}`);
      const urlSlug = slugifyUrl(url);
      const pageDir = `${runDir}/pages/${urlSlug}`;
      await ensureDir(pageDir);

      const pageCtx: PageContext = { url, urlSlug, outDir: pageDir };
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        await runProbes(page, pageCtx, opts, aggregates);
        await defaultScreenshot(page, pageDir);

        if (idx === 0 && urls.length < opts.maxPages && !opts.urlList) {
          const discovered = await extractInternalLinks(page, opts.url, opts.maxPages * 2);
          const seen = new Set(urls.map(normalizeUrl));
          for (const u of discovered) {
            const key = normalizeUrl(u);
            if (!seen.has(key) && urls.length < opts.maxPages) {
              urls.push(u);
              seen.add(key);
            }
          }
          if (urls.length > 1) {
            console.log(`[scanner] Discovered ${urls.length - 1} additional URL(s) via link crawl.`);
          }
        }
      } catch (err) {
        console.error(`[scanner] [${idx + 1}] ERROR: ${(err as Error).message}`);
        await writeJson(`${pageDir}/error.json`, { error: (err as Error).message, url });
      } finally {
        await page.close();
      }
      idx++;
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (opts.probes.includes('consistency') && urls.length > 1) {
    try {
      await runConsistency(runDir);
      console.log(`[scanner] Ran cross-page consistency probe.`);
    } catch (err) {
      console.error(`[scanner] Consistency probe failed: ${(err as Error).message}`);
    }
  }

  const endedAt = new Date().toISOString();
  const playwrightVersion = await readDepVersion('playwright').catch(() => 'unknown');
  const axeVersion = await readDepVersion('@axe-core/playwright').catch(() => 'unknown');

  const manifest: Manifest = {
    contract_version: CONTRACT_VERSION,
    site: new URL(opts.url).hostname,
    site_slug: siteSlug,
    run_id: runId,
    started_at: startedAt,
    ended_at: endedAt,
    urls,
    tools: {
      scanner: '0.1.0',
      axe_core: axeVersion,
      playwright: playwrightVersion,
      node: process.versions.node,
    },
    viewport: opts.viewport,
    user_agent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    wcag_version: '2.2',
    wcag_levels: ['A', 'AA'],
  };

  await writeJson(`${runDir}/manifest.json`, manifest);

  const summary: Summary = {
    contract_version: CONTRACT_VERSION,
    total_urls: urls.length,
    probes_run: opts.probes.length,
    probes_enabled: opts.probes,
    artifacts: aggregates,
  };
  await writeJson(`${runDir}/summary.json`, summary);

  console.log(`[scanner] Done. Run directory: ${runDir}`);
  return runDir;
}

async function runProbes(
  page: Page,
  ctx: PageContext,
  opts: ScanOptions,
  agg: Summary['artifacts'],
): Promise<void> {
  const enabled = new Set(opts.probes);

  if (enabled.has('axe')) {
    const { violations } = await runAxe(page, ctx);
    agg.axe_violations += violations;
  }
  if (enabled.has('a11y-tree')) {
    await runA11yTree(page, ctx);
  }
  if (enabled.has('headings')) {
    const { issues } = await runHeadings(page, ctx);
    agg.heading_issues += issues;
  }
  if (enabled.has('target-size')) {
    const { failures } = await runTargetSize(page, ctx);
    agg.target_size_failures += failures;
  }
  if (enabled.has('images')) {
    const { count } = await runImages(page, ctx);
    agg.total_images += count;
  }
  if (enabled.has('links')) {
    const { count } = await runLinks(page, ctx);
    agg.total_links += count;
  }
  if (enabled.has('contrast')) {
    await runContrast(page, ctx);
  }
  if (enabled.has('keyboard-walk')) {
    await runKeyboardWalk(page, ctx);
  }
  if (enabled.has('text-spacing')) {
    await runTextSpacing(page, ctx);
  }
  if (enabled.has('reduced-motion')) {
    await runReducedMotion(page, ctx);
  }
  if (enabled.has('reflow')) {
    await runReflow(page, ctx);
  }
  if (enabled.has('sensory-language')) {
    await runSensoryLanguage(page, ctx);
  }
}

async function defaultScreenshot(page: Page, pageDir: string): Promise<void> {
  await ensureDir(`${pageDir}/screenshots`);
  await page.screenshot({ path: `${pageDir}/screenshots/default.png`, fullPage: true });
}
