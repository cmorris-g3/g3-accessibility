import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runConsistency } from './probes/consistency.js';
import { translateConsistency } from './analyze/deterministic.js';
import { attachFingerprints } from './analyze/fingerprint.js';
import type { Finding } from './types.js';

export interface ConsistencyPassOptions {
  runDir: string;
  site: string;
}

export interface ConsistencyPassResult {
  findings: Finding[];
}

export async function consistencyPass(opts: ConsistencyPassOptions): Promise<ConsistencyPassResult> {
  await runConsistency(opts.runDir);

  const raw = await readFile(join(opts.runDir, 'consistency.json'), 'utf8');
  const result = JSON.parse(raw);

  const siteBase = opts.site.startsWith('http') ? opts.site : `https://${opts.site}`;
  const findings = translateConsistency(result, siteBase);
  attachFingerprints(findings);

  return { findings };
}
