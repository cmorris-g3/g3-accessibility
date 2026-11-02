#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { crawl } from './crawler.js';
import { analyze } from './analyze/index.js';
import { discover } from './discover.js';
import { scanPage } from './scan-page.js';
import { consistencyPass } from './consistency-pass.js';
import { captureShots, type ShotTarget } from './screenshots.js';

const DEFAULT_PROBES = [
  'axe',
  'a11y-tree',
  'headings',
  'target-size',
  'images',
  'links',
  'contrast',
  'keyboard-walk',
  'text-spacing',
  'reduced-motion',
  'reflow',
  'sensory-language',
  'consistency',
];

const PAGE_PROBES = DEFAULT_PROBES.filter((p) => p !== 'consistency');

function assertConsentMode(value: string): asserts value is 'accept-all' | 'none' {
  if (value !== 'accept-all' && value !== 'none') {
    throw new Error(`--consent must be "accept-all" or "none", got "${value}"`);
  }
}

const program = new Command();

program
  .name('scanner')
  .description('G3 Accessibility scanner — audit pipeline fork for the remediation plugin')
  .version('0.1.0');

program
  .command('audit')
  .description('Audit a site and produce a run directory for the SOP judgment layer')
  .argument('<url>', 'Root URL to audit')
  .option('-o, --out-dir <path>', 'Output directory for runs', './runs')
  .option('-m, --max-pages <n>', 'Maximum pages to audit', (v) => parseInt(v, 10), 20)
  .option('-w, --viewport-width <n>', 'Viewport width in pixels', (v) => parseInt(v, 10), 1440)
  .option('-h, --viewport-height <n>', 'Viewport height in pixels', (v) => parseInt(v, 10), 900)
  .option('-t, --timeout-ms <n>', 'Per-page load timeout in ms', (v) => parseInt(v, 10), 30_000)
  .option(
    '-p, --probes <list>',
    'Comma-separated list of probes to run',
    (v) => v.split(',').map((s) => s.trim()),
    DEFAULT_PROBES,
  )
  .option(
    '-u, --url-list <path>',
    'Path to a newline-separated file of URLs to audit (bypasses sitemap/link-crawl discovery)',
  )
  .option('-r, --run-id <id>', 'Explicit run ID for the output directory (default: timestamp-based)')
  .option(
    '-c, --consent <mode>',
    'Cookie consent before probing: "accept-all" (default) makes consent-gated widgets visible; "none" leaves them hidden. Runs are only comparable when this matches.',
    'accept-all',
  )
  .action(async (url: string, options) => {
    try {
      assertConsentMode(options.consent);
      let urlList: string[] | undefined;
      if (options.urlList) {
        const raw = await readFile(options.urlList, 'utf8');
        urlList = raw
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('#'));
        if (urlList.length === 0) {
          throw new Error(`--url-list file is empty: ${options.urlList}`);
        }
      }
      await crawl({
        url,
        outDir: options.outDir,
        maxPages: options.maxPages,
        viewport: { w: options.viewportWidth, h: options.viewportHeight },
        timeoutMs: options.timeoutMs,
        probes: options.probes,
        urlList,
        runId: options.runId,
        consent: options.consent,
      });
    } catch (err) {
      console.error('[scanner] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command('analyze')
  .description('Apply the SOP judgment layer to a scanner run directory')
  .argument('<run-dir>', 'Path to a run directory produced by `scanner audit`')
  .action(async (runDir: string) => {
    try {
      await analyze(runDir);
    } catch (err) {
      console.error('[analyze] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command('discover')
  .description('Discover URLs for a site via sitemap.xml (with link-crawl fallback). Emits JSON on stdout; logs go to stderr.')
  .argument('<url>', 'Root URL to discover from')
  .option('-m, --max-pages <n>', 'Maximum URLs to return', (v) => parseInt(v, 10), 500)
  .option('-t, --timeout-ms <n>', 'Page load timeout in ms', (v) => parseInt(v, 10), 30_000)
  .action(async (url: string, options) => {
    const origLog = console.log;
    console.log = (...args: unknown[]) => console.error(...args);
    try {
      const result = await discover({
        url,
        maxPages: options.maxPages,
        timeoutMs: options.timeoutMs,
      });
      console.log = origLog;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      console.log = origLog;
      console.error('[discover] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command('scan-page')
  .description('Scan a single URL and produce findings.json (audit + analyze in one step). Skips cross-page probes.')
  .argument('<url>', 'Exact URL to scan')
  .option('-o, --out-dir <path>', 'Output directory for runs', './runs')
  .option('-r, --run-id <id>', 'Explicit run ID for the output directory (default: timestamp-based)')
  .option('-w, --viewport-width <n>', 'Viewport width in pixels', (v) => parseInt(v, 10), 1440)
  .option('-h, --viewport-height <n>', 'Viewport height in pixels', (v) => parseInt(v, 10), 900)
  .option('-t, --timeout-ms <n>', 'Page load timeout in ms', (v) => parseInt(v, 10), 30_000)
  .option(
    '-p, --probes <list>',
    'Comma-separated list of probes to run (consistency is always excluded)',
    (v) => v.split(',').map((s) => s.trim()),
    PAGE_PROBES,
  )
  .option(
    '-c, --consent <mode>',
    'Cookie consent before probing: "accept-all" (default) makes consent-gated widgets visible; "none" leaves them hidden. Runs are only comparable when this matches.',
    'accept-all',
  )
  .action(async (url: string, options) => {
    const origLog = console.log;
    console.log = (...args: unknown[]) => console.error(...args);
    try {
      assertConsentMode(options.consent);
      const probes = (options.probes as string[]).filter((p) => p !== 'consistency');
      const runDir = await scanPage({
        url,
        outDir: options.outDir,
        runId: options.runId,
        viewport: { w: options.viewportWidth, h: options.viewportHeight },
        timeoutMs: options.timeoutMs,
        probes,
        consent: options.consent,
      });
      console.log = origLog;
      process.stdout.write(JSON.stringify({ run_dir: runDir }, null, 2) + '\n');
    } catch (err) {
      console.log = origLog;
      console.error('[scan-page] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command('consistency-pass')
  .description('Run the cross-page consistency probe against a run directory whose pages/ subdir holds results from multiple page scans. Emits translated findings (missing-skip-link, inconsistent-navigation, inconsistent-help) as JSON on stdout.')
  .argument('<run-dir>', 'Directory containing a pages/{slug}/*.json tree from prior per-page scans')
  .option('-s, --site <host>', 'Site host (e.g., "example.com") used as base URL for consistency finding URLs', '')
  .action(async (runDir: string, options) => {
    const origLog = console.log;
    console.log = (...args: unknown[]) => console.error(...args);
    try {
      if (!options.site) {
        console.log = origLog;
        throw new Error('--site is required');
      }
      const result = await consistencyPass({ runDir, site: options.site });
      console.log = origLog;
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (err) {
      console.log = origLog;
      console.error('[consistency-pass] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command('shoot')
  .description('Capture annotated element screenshots for a run directory\'s shots-spec.json. Writes PNGs to <run-dir>/shots/; re-run `analyze` afterwards to embed them.')
  .argument('<run-dir>', 'Run directory produced by `scanner audit` and analysed at least once')
  .option('-t, --timeout-ms <n>', 'Page load timeout in ms', (v) => parseInt(v, 10), 30_000)
  .option('-w, --viewport-width <n>', 'Viewport width in pixels', (v) => parseInt(v, 10), 1440)
  .option('-h, --viewport-height <n>', 'Viewport height in pixels', (v) => parseInt(v, 10), 900)
  .option('-p, --padding <n>', 'Pixels of context kept around the element', (v) => parseInt(v, 10), 80)
  .option('-l, --limit <n>', 'Capture at most this many items', (v) => parseInt(v, 10), 0)
  .option(
    '-c, --consent <mode>',
    'Cookie consent before capturing: "accept-all" (default) or "none".',
    'accept-all',
  )
  .action(async (runDir: string, options) => {
    try {
      assertConsentMode(options.consent);
      const specPath = `${runDir}/shots-spec.json`;
      let targets: ShotTarget[];
      try {
        targets = JSON.parse(await readFile(specPath, 'utf8'));
      } catch {
        throw new Error(`No shots-spec.json in ${runDir} — run \`scanner analyze\` first.`);
      }
      if (options.limit > 0) targets = targets.slice(0, options.limit);
      if (targets.length === 0) {
        console.log('[shoot] Nothing to capture.');
        return;
      }

      const results = await captureShots(targets, {
        outDir: `${runDir}/shots`,
        viewport: { w: options.viewportWidth, h: options.viewportHeight },
        timeoutMs: options.timeoutMs,
        consent: options.consent,
        padding: options.padding,
      });

      const ok = results.filter((r) => r.ok).length;
      console.log(`[shoot] Captured ${ok}/${results.length} screenshots into ${runDir}/shots/`);
      for (const r of results.filter((x) => !x.ok)) {
        console.log(`[shoot]   skipped ${r.id}: ${r.reason}`);
      }
      console.log('[shoot] Re-run `scanner analyze` on this run directory to embed them.');
    } catch (err) {
      console.error('[shoot] FAILED:', (err as Error).message);
      process.exitCode = 1;
    }
  });

program.parse();
