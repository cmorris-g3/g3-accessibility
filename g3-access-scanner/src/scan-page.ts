import { crawl } from './crawler.js';
import { analyze } from './analyze/index.js';

export interface ScanPageOptions {
  url: string;
  outDir: string;
  runId?: string;
  viewport: { w: number; h: number };
  timeoutMs: number;
  probes: string[];
}

export async function scanPage(opts: ScanPageOptions): Promise<string> {
  const runDir = await crawl({
    url: opts.url,
    outDir: opts.outDir,
    maxPages: 1,
    viewport: opts.viewport,
    timeoutMs: opts.timeoutMs,
    probes: opts.probes,
    urlList: [opts.url],
    runId: opts.runId,
  });

  await analyze(runDir);
  return runDir;
}
