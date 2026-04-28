import type { Finding, FindingsFile, Severity } from '../types.js';
import { wcagUrl } from './wcag-map.js';
import { SEVERITY_INTROS, HOW_TO_READ, WHO_IS_AFFECTED, getWhyItMatters } from './plain-language.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'moderate', 'minor'];
const CONSOLIDATE_THRESHOLD = 5;

const ALL_PROBES = [
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
  'forced-colors',
  'form-error',
];

export function renderReport(
  findingsFile: FindingsFile,
  manifest: { site: string; run_id: string; urls: string[]; tools: Record<string, string>; wcag_version: string; wcag_levels: string[]; ended_at: string },
  filtered: Array<{ finding: Finding; filter_id: string }>,
  probeExceptions: Record<string, number>,
  probesRun: string[] = [],
): string {
  const { findings } = findingsFile;
  const lines: string[] = [];
  const bySev = countBySeverity(findings);

  lines.push(`# Accessibility Audit — ${manifest.site}`);
  lines.push('');
  lines.push(`**Run ID:** ${manifest.run_id}`);
  lines.push(`**Date:** ${manifest.ended_at.substring(0, 10)}`);
  lines.push(`**WCAG version:** ${manifest.wcag_version} (Levels ${manifest.wcag_levels.join(', ')})`);
  lines.push(`**Pages audited:** ${manifest.urls.length}`);
  lines.push(`**Tools:** axe-core ${manifest.tools.axe_core}, Playwright ${manifest.tools.playwright}, Claude Opus 4.7`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(renderExecutiveSummary(findings, manifest));
  lines.push('');
  lines.push('**Findings at a glance:**');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const sev of SEVERITY_ORDER) {
    lines.push(`| ${capitalize(sev)} | ${bySev[sev] ?? 0} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## How to Read This Report');
  lines.push('');
  lines.push(HOW_TO_READ);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Who Is Affected');
  lines.push('');
  lines.push(WHO_IS_AFFECTED);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const sev of (['critical', 'serious'] as Severity[])) {
    lines.push(`## ${capitalize(sev)} Findings`);
    lines.push('');
    if (SEVERITY_INTROS[sev]) {
      lines.push(SEVERITY_INTROS[sev]);
      lines.push('');
    }
    const sevFindings = findings.filter((f) => f.severity === sev);
    if (sevFindings.length === 0) {
      lines.push(`No ${sev} findings in this run.`);
      lines.push('');
    } else {
      lines.push(renderConsolidated(sevFindings));
    }
    lines.push('---');
    lines.push('');
  }

  for (const sev of (['moderate', 'minor'] as Severity[])) {
    lines.push(`## ${capitalize(sev)} Findings`);
    lines.push('');
    if (SEVERITY_INTROS[sev]) {
      lines.push(SEVERITY_INTROS[sev]);
      lines.push('');
    }
    const sevFindings = findings.filter((f) => f.severity === sev);
    if (sevFindings.length === 0) {
      lines.push(`No ${sev} findings in this run.`);
    } else {
      lines.push(renderSummaryTable(sevFindings));
    }
    lines.push('');
    lines.push('Full findings in `findings.csv`.');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Findings by WCAG Success Criterion');
  lines.push('');
  lines.push(renderByWcag(findings));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Per-Page Summary');
  lines.push('');
  lines.push(renderPerPage(findings, manifest.urls));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Low-Confidence Findings — Human Review Recommended');
  lines.push('');
  const lowConf = findings.filter((f) => f.confidence === 'low');
  if (lowConf.length === 0) {
    lines.push('No low-confidence findings in this run.');
  } else {
    lines.push('| URL | Finding | Reason |');
    lines.push('|-----|---------|--------|');
    for (const f of lowConf) {
      lines.push(`| ${f.url} | ${f.finding_type} | ${f.rationale} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Methodology');
  lines.push('');
  lines.push(
    `This audit was produced by an automated pipeline using Playwright ${manifest.tools.playwright} + axe-core ${manifest.tools.axe_core} to collect per-page data, then deterministic rubrics and severity mapping to translate that data into the findings listed in this report.`,
  );
  lines.push('');
  const ranSet = new Set(probesRun);
  const skipped = ALL_PROBES.filter((p) => !ranSet.has(p));
  lines.push(
    `**Probes run this audit:** ${probesRun.length} of ${ALL_PROBES.length} specified probes — ${probesRun.map((p) => '`' + p + '`').join(', ') || '(unknown — summary.json missing)'}.`,
  );
  lines.push('');
  if (skipped.length > 0) {
    lines.push(
      `**Probes NOT run this audit:** ${skipped.map((p) => '`' + p + '`').join(', ')}. Success criteria that depend exclusively on these probes are not evaluated in this report.`,
    );
    lines.push('');
  }
  lines.push(
    '**Always-manual criteria** (out of scope for automation): video caption accuracy, cognitive-load assessment, and direct assistive-technology user testing require a human auditor regardless of how many probes run.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Appendix: Known Noise Filtered');
  lines.push('');
  if (Object.keys(probeExceptions).length === 0 && filtered.length === 0) {
    lines.push('No noise filters applied in this run.');
  } else {
    lines.push('| Source | Filter | Count | Reason |');
    lines.push('|--------|--------|-------|--------|');
    for (const [name, count] of Object.entries(probeExceptions)) {
      if (count === 0) continue;
      lines.push(`| Probe | \`${name}\` | ${count} | Probe-side exception class (see scanner-spec.md). |`);
    }
    const byFilter = filtered.reduce((acc, f) => {
      acc[f.filter_id] = (acc[f.filter_id] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    for (const [id, count] of Object.entries(byFilter)) {
      lines.push(`| SOP | \`${id}\` | ${count} | See \`audit-sop/known-noise.md\`. |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function renderExecutiveSummary(findings: Finding[], manifest: { urls: string[] }): string {
  const bySev = countBySeverity(findings);
  const byType = countBy(findings, (f) => f.finding_type);
  const topTypes = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, c]) => `\`${t}\` × ${c}`)
    .join(', ');
  const total = findings.length;
  if (total === 0) {
    return `No findings were emitted across ${manifest.urls.length} audited page(s).`;
  }
  return `A ${manifest.urls.length}-page audit identified ${total} finding${total === 1 ? '' : 's'}: ${bySev.critical ?? 0} critical, ${bySev.serious ?? 0} serious, ${bySev.moderate ?? 0} moderate, ${bySev.minor ?? 0} minor. Top finding types: ${topTypes}.`;
}

function renderConsolidated(findings: Finding[]): string {
  const groups = groupFindings(findings);
  const out: string[] = [];
  for (const group of groups) {
    if (group.items.length >= CONSOLIDATE_THRESHOLD) {
      out.push(renderConsolidatedBlock(group));
    } else {
      for (const f of group.items) {
        out.push(renderSingleBlock(f));
      }
    }
  }
  return out.join('\n');
}

interface Group {
  finding_type: string;
  wcag: string;
  items: Finding[];
}

function groupFindings(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    const key = `${f.finding_type}|${f.wcag}`;
    if (!map.has(key)) {
      map.set(key, { finding_type: f.finding_type, wcag: f.wcag, items: [] });
    }
    map.get(key)!.items.push(f);
  }
  return Array.from(map.values()).sort((a, b) => a.wcag.localeCompare(b.wcag));
}

function renderConsolidatedBlock(group: Group): string {
  const count = group.items.length;
  const first = group.items[0];
  const pages = Array.from(new Set(group.items.map((f) => f.url))).length;
  const sampleTargets = group.items.slice(0, 5);
  const lines: string[] = [];
  lines.push(`### ${group.finding_type} — ${formatWcagLink(group.wcag)} × ${count}`);
  lines.push('');
  const whyItMatters = getWhyItMatters(group.finding_type);
  if (whyItMatters) {
    lines.push(`**Why it matters:** ${whyItMatters}`);
    lines.push('');
  }
  lines.push(`**Pages affected:** ${pages}`);
  lines.push('');
  lines.push('**Sample instances:**');
  lines.push('');
  for (let i = 0; i < sampleTargets.length; i++) {
    const f = sampleTargets[i];
    lines.push(`**${i + 1}.** \`${shortUrl(f.url)}\``);
    if (f.target) lines.push(`   - Selector: \`${truncate(f.target, 140)}\``);
    const snippet = extractOuterHtml(f);
    if (snippet) {
      lines.push(`   - HTML:`);
      lines.push('     ```html');
      lines.push(`     ${truncate(snippet, 250)}`);
      lines.push('     ```');
    }
    lines.push('');
  }
  if (group.items.length > 5) {
    lines.push(`_…and ${group.items.length - 5} more instances — see \`findings.csv\`_`);
    lines.push('');
  }
  lines.push(`**Issue:** ${escapeProse(first.rationale)}`);
  lines.push('');
  if (first.suggested_fix) {
    lines.push(`**Fix:** ${escapeProse(first.suggested_fix)}`);
    lines.push('');
  }
  const lowConfCount = group.items.filter((i) => i.confidence === 'low').length;
  if (lowConfCount > 0) {
    lines.push(`**Confidence note:** ${lowConfCount} of ${count} items flagged as low confidence — see review appendix.`);
    lines.push('');
  }
  return lines.join('\n');
}

function extractOuterHtml(f: Finding): string | null {
  if (f.current_value && typeof f.current_value === 'string' && f.current_value.includes('<')) {
    return f.current_value;
  }
  const ctx = f.context;
  if (ctx && typeof ctx === 'object' && 'outer_html' in ctx && typeof ctx.outer_html === 'string') {
    return ctx.outer_html;
  }
  return null;
}

function renderSingleBlock(f: Finding): string {
  const lines: string[] = [];
  lines.push(`### ${f.finding_type} — ${formatWcagLink(f.wcag)}`);
  lines.push('');
  const whyItMatters = getWhyItMatters(f.finding_type);
  if (whyItMatters) {
    lines.push(`**Why it matters:** ${whyItMatters}`);
    lines.push('');
  }
  lines.push(`**Page:** ${f.url}`);
  lines.push('');
  if (f.target) {
    lines.push(`**Element:** \`${truncate(f.target, 160)}\``);
    lines.push('');
  }
  if (f.current_value !== undefined && f.current_value !== null) {
    lines.push(`**Current value:**`);
    lines.push('');
    lines.push('```html');
    lines.push(truncate(String(f.current_value), 300));
    lines.push('```');
    lines.push('');
  }
  lines.push(`**Issue:** ${escapeProse(f.rationale)}`);
  lines.push('');
  if (f.suggested_fix) {
    lines.push(`**Fix:** ${escapeProse(f.suggested_fix)}`);
    lines.push('');
  }
  lines.push(`**Confidence:** ${f.confidence}`);
  lines.push('');
  return lines.join('\n');
}

function escapeProse(text: string): string {
  return text.replace(/<([a-zA-Z][a-zA-Z0-9-]*)>/g, '`<$1>`');
}

function renderSummaryTable(findings: Finding[]): string {
  const groups = groupFindings(findings);
  const out: string[] = [];
  out.push('| WCAG SC | Finding Type | Count | Pages |');
  out.push('|---------|--------------|-------|-------|');
  for (const g of groups) {
    const pages = new Set(g.items.map((f) => f.url)).size;
    out.push(`| ${extractSc(g.wcag)} | \`${g.finding_type}\` | ${g.items.length} | ${pages} |`);
  }
  return out.join('\n');
}

function renderByWcag(findings: Finding[]): string {
  const byWcag = new Map<string, { count: number; pages: Set<string>; level: string }>();
  for (const f of findings) {
    const sc = extractSc(f.wcag);
    const level = extractLevel(f.wcag);
    if (!byWcag.has(sc)) byWcag.set(sc, { count: 0, pages: new Set(), level });
    const entry = byWcag.get(sc)!;
    entry.count++;
    entry.pages.add(f.url);
  }
  const sorted = Array.from(byWcag.entries()).sort((a, b) => compareSc(a[0], b[0]));
  const out: string[] = [];
  out.push('| WCAG SC | Level | Findings | Pages |');
  out.push('|---------|-------|----------|-------|');
  for (const [sc, info] of sorted) {
    out.push(`| ${sc} | ${info.level} | ${info.count} | ${info.pages.size} |`);
  }
  return out.join('\n');
}

function renderPerPage(findings: Finding[], urls: string[]): string {
  const byPage = new Map<string, Record<Severity, number>>();
  for (const url of urls) {
    byPage.set(url, { critical: 0, serious: 0, moderate: 0, minor: 0 });
  }
  for (const f of findings) {
    const entry = byPage.get(f.url);
    if (entry) entry[f.severity]++;
  }
  const out: string[] = [];
  out.push('| URL | Critical | Serious | Moderate | Minor |');
  out.push('|-----|----------|---------|----------|-------|');
  for (const [url, sev] of byPage) {
    out.push(`| ${shortUrl(url)} | ${sev.critical} | ${sev.serious} | ${sev.moderate} | ${sev.minor} |`);
  }
  return out.join('\n');
}

function countBySeverity(findings: Finding[]): Partial<Record<Severity, number>> {
  return countBy(findings, (f) => f.severity);
}

function countBy<T>(items: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function extractSc(wcag: string): string {
  const m = wcag.match(/SC\s+([\d.]+)/);
  return m?.[1] ?? wcag;
}

function extractLevel(wcag: string): string {
  const m = wcag.match(/Level\s+(A{1,3})/);
  return m?.[1] ?? 'A';
}

function compareSc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function formatWcagLink(wcag: string): string {
  const sc = extractSc(wcag);
  const url = wcagUrl(sc);
  return url ? `[${wcag}](${url})` : wcag;
}
