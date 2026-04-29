import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Finding, FindingsFile, Manifest, Summary } from '../types.js';
import { CONTRACT_VERSION } from '../types.js';
import {
  translateAxe,
  translateHeadings,
  translateTargetSize,
  translateContrast,
  translateKeyboardWalk,
  translateReflow,
  translateTextSpacing,
  translateReducedMotion,
  translateSensoryLanguage,
  translateConsistency,
} from './deterministic.js';
import { applyAltTextRubric } from './rubrics/alt-text.js';
import { applyLinkTextRubric } from './rubrics/link-text.js';
import { resolveSeverity } from './severity.js';
import { applyNoiseFilters } from './noise.js';
import { renderReport } from './report.js';
import { generateWorkItems, renderRoadmap } from './roadmap.js';
import { renderWorkItemsCsv, renderFindingsCsv } from './csv.js';
import { renderExecutiveSummary } from './executive-summary.js';
import { renderEditorTasks } from './editor-tasks.js';
import { renderDeveloperTasks } from './developer-tasks.js';
import { renderDesignerTasks } from './designer-tasks.js';
import { renderVendorTasks } from './vendor-tasks.js';
import { renderReviewerTasks } from './reviewer-tasks.js';
import { attachFingerprints } from './fingerprint.js';
import { selectTopTen, renderTopTen } from './top-ten.js';

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

async function tryReadJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

function slugifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? 'home' : u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
    return path.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'home';
  } catch {
    return 'unknown';
  }
}

export async function analyze(runDir: string): Promise<void> {
  console.log(`[analyze] Reading run directory: ${runDir}`);

  const manifest = await readJson<Manifest>(join(runDir, 'manifest.json'));
  if (manifest.contract_version !== CONTRACT_VERSION) {
    throw new Error(
      `Contract version mismatch: manifest=${manifest.contract_version}, analyzer=${CONTRACT_VERSION}.`,
    );
  }

  const pagesDir = join(runDir, 'pages');
  const pageSlugs = await readdir(pagesDir);
  const slugToUrl = new Map<string, string>(manifest.urls.map((u) => [slugifyUrl(u), u]));

  const rawFindings: Finding[] = [];
  const probeExceptionCounts: Record<string, number> = {};
  const pagesWithContrastProbe = new Set<string>();

  for (const slug of pageSlugs) {
    const pageDir = join(pagesDir, slug);
    const url = slugToUrl.get(slug) ?? manifest.urls[0];

    const axe = await tryReadJson<import('./deterministic.js').AxeResults>(join(pageDir, 'axe.json'));
    const headings = await tryReadJson<import('./deterministic.js').HeadingsJson>(join(pageDir, 'headings.json'));
    const targetSize = await tryReadJson<import('./deterministic.js').TargetSizeEntry[]>(join(pageDir, 'target-size.json'));
    const contrast = await tryReadJson<import('./deterministic.js').ContrastEntry[]>(join(pageDir, 'contrast.json'));
    const images = await tryReadJson<Parameters<typeof applyAltTextRubric>[0]>(join(pageDir, 'images.json'));
    const links = await tryReadJson<Parameters<typeof applyLinkTextRubric>[0]>(join(pageDir, 'links.json'));

    if (axe) rawFindings.push(...translateAxe(axe, url));
    if (headings) rawFindings.push(...translateHeadings(headings, url));
    if (targetSize) {
      const { findings, exceptions_filtered } = translateTargetSize(targetSize, url);
      rawFindings.push(...findings);
      probeExceptionCounts[`target-size-exceptions`] =
        (probeExceptionCounts[`target-size-exceptions`] ?? 0) + exceptions_filtered;
    }
    if (contrast) {
      pagesWithContrastProbe.add(url);
      const { findings, unable_count } = translateContrast(contrast, url);
      rawFindings.push(...findings);
      probeExceptionCounts[`contrast-unable-to-measure`] =
        (probeExceptionCounts[`contrast-unable-to-measure`] ?? 0) + unable_count;
    }
    const keyboardWalk = await tryReadJson<import('./deterministic.js').KeyboardWalkResult>(
      join(pageDir, 'keyboard-walk.json'),
    );
    if (keyboardWalk) {
      rawFindings.push(...translateKeyboardWalk(keyboardWalk, url));
    }
    const reflow = await tryReadJson<import('./deterministic.js').ReflowResult>(
      join(pageDir, 'reflow.json'),
    );
    if (reflow) rawFindings.push(...translateReflow(reflow, url));
    const textSpacing = await tryReadJson<import('./deterministic.js').TextSpacingResult>(
      join(pageDir, 'text-spacing.json'),
    );
    if (textSpacing) rawFindings.push(...translateTextSpacing(textSpacing, url));
    const reducedMotion = await tryReadJson<import('./deterministic.js').ReducedMotionResult>(
      join(pageDir, 'reduced-motion.json'),
    );
    if (reducedMotion) rawFindings.push(...translateReducedMotion(reducedMotion, url));
    const sensoryLanguage = await tryReadJson<import('./deterministic.js').SensoryLanguageResult>(
      join(pageDir, 'sensory-language.json'),
    );
    if (sensoryLanguage) rawFindings.push(...translateSensoryLanguage(sensoryLanguage, url));
    if (images) rawFindings.push(...applyAltTextRubric(images, url));
    if (links) rawFindings.push(...applyLinkTextRubric(links, url));
  }

  const consistency = await tryReadJson<import('./deterministic.js').ConsistencyResult>(
    join(runDir, 'consistency.json'),
  );
  if (consistency) {
    rawFindings.push(...translateConsistency(consistency, `https://${manifest.site}`));
  }

  const severityResolved: Finding[] = [];
  let unknownTypes = 0;
  let axeContrastSuppressed = 0;
  for (const f of rawFindings) {
    if (
      f.source === 'scanner' &&
      f.check === 'axe' &&
      f.finding_type === 'color-contrast' &&
      pagesWithContrastProbe.has(f.url)
    ) {
      axeContrastSuppressed++;
      continue;
    }
    if (f.source === 'scanner' && f.check === 'axe') {
      severityResolved.push(f);
      continue;
    }
    const { severity, unknown } = resolveSeverity(f);
    if (unknown) {
      unknownTypes++;
      console.warn(`[analyze] Unknown finding_type "${f.finding_type}" — emitting with default severity ${severity}`);
    }
    severityResolved.push({ ...f, severity });
  }

  const { kept, filtered } = applyNoiseFilters(severityResolved);

  attachFingerprints(kept);

  const findingsFile: FindingsFile = {
    run_id: manifest.run_id,
    site: manifest.site,
    generated_at: new Date().toISOString(),
    sop_version: '0.2',
    model: 'claude-opus-4-7',
    findings: kept,
  };

  await writeFile(
    join(runDir, 'findings.json'),
    JSON.stringify(findingsFile, null, 2),
    'utf8',
  );
  console.log(`[analyze] Wrote findings.json (${kept.length} findings, ${filtered.length} filtered).`);

  const summary = await tryReadJson<Summary>(join(runDir, 'summary.json'));
  const probesRun = summary?.probes_enabled ?? [];
  const report = renderReport(findingsFile, manifest, filtered, probeExceptionCounts, probesRun);
  await writeFile(join(runDir, 'report.md'), report, 'utf8');
  console.log(`[analyze] Wrote report.md`);

  const workItems = generateWorkItems(kept);
  const roadmap = renderRoadmap(
    workItems,
    manifest.site,
    manifest.run_id,
    manifest.ended_at.substring(0, 10),
    manifest.urls.length,
  );
  await writeFile(join(runDir, 'roadmap.md'), roadmap, 'utf8');
  console.log(`[analyze] Wrote roadmap.md (${workItems.length} work items)`);

  await writeFile(join(runDir, 'work-items.csv'), renderWorkItemsCsv(workItems), 'utf8');
  console.log(`[analyze] Wrote work-items.csv (${workItems.length} rows)`);

  await writeFile(join(runDir, 'findings.csv'), renderFindingsCsv(workItems), 'utf8');
  console.log(`[analyze] Wrote findings.csv (${kept.length} rows)`);

  const execSummary = renderExecutiveSummary(findingsFile, manifest, summary, workItems);
  await writeFile(join(runDir, 'executive-summary.md'), execSummary, 'utf8');
  console.log(`[analyze] Wrote executive-summary.md`);

  const topTenItems = selectTopTen(workItems, manifest.urls.length);
  const topTen = renderTopTen(topTenItems, manifest);
  await writeFile(join(runDir, 'top-10.md'), topTen, 'utf8');
  console.log(`[analyze] Wrote top-10.md (${topTenItems.length} items)`);

  const editor = renderEditorTasks(workItems, manifest);
  await writeFile(join(runDir, 'editor-tasks.md'), editor.markdown, 'utf8');
  console.log(`[analyze] Wrote editor-tasks.md`);
  for (const w of editor.warnings) {
    console.warn(`[analyze] ${w}`);
  }

  await writeFile(join(runDir, 'developer-tasks.md'), renderDeveloperTasks(workItems, manifest), 'utf8');
  console.log(`[analyze] Wrote developer-tasks.md`);

  await writeFile(join(runDir, 'designer-tasks.md'), renderDesignerTasks(workItems, manifest), 'utf8');
  console.log(`[analyze] Wrote designer-tasks.md`);

  await writeFile(join(runDir, 'vendor-tasks.md'), renderVendorTasks(workItems, manifest), 'utf8');
  console.log(`[analyze] Wrote vendor-tasks.md`);

  await writeFile(join(runDir, 'reviewer-tasks.md'), renderReviewerTasks(workItems, manifest), 'utf8');
  console.log(`[analyze] Wrote reviewer-tasks.md`);

  const bySev = kept.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[analyze] Severity breakdown:`, bySev);
  if (unknownTypes > 0) {
    console.warn(`[analyze] ${unknownTypes} finding(s) had unmapped types — add them to severity.ts.`);
  }
  if (axeContrastSuppressed > 0) {
    console.log(
      `[analyze] Suppressed ${axeContrastSuppressed} axe color-contrast finding(s) — our pixel-level contrast probe is authoritative.`,
    );
  }
}
