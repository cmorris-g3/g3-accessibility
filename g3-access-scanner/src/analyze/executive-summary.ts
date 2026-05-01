import type { Finding, FindingsFile, Manifest, Severity } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { groupIdenticalFindings } from './roadmap.js';
import { AFFECTED_USER_GROUPS, type AffectedUserGroup } from './plain-language.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'moderate', 'minor'];

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

export function renderExecutiveSummary(
  findingsFile: FindingsFile,
  manifest: Manifest,
  workItems: WorkItem[],
): string {
  const findings = findingsFile.findings;
  const pageCount = manifest.urls.length;
  const maxPages = pageCount;
  const [y, m, d] = manifest.ended_at.substring(0, 10).split('-');
  const date = `${m}/${d}/${y}`;

  const lines: string[] = [];

  lines.push(`# Accessibility Audit — Executive Summary`);
  lines.push('');
  lines.push(`**Site:** ${manifest.site}  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages audited:** ${pageCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push(`## What was checked`);
  lines.push('');
  lines.push(
    `This audit tested ${pageCount} page${pageCount === 1 ? '' : 's'} against WCAG 2.2 Level A and AA.`,
  );
  lines.push('');

  if (manifest.urls.length < 10) {
    lines.push(`## Pages scanned`);
    lines.push('');
    for (const u of manifest.urls) lines.push(`- ${u}`);
    lines.push('');
  }

  lines.push(`## Findings at a glance`);
  lines.push('');
  lines.push(renderSeverityTable(findings, maxPages));
  lines.push('');

  lines.push(`## How concentrated the problems are`);
  lines.push('');
  lines.push(renderConcentration(findings));
  lines.push('');

  const affectedBullets = renderAffectedBullets(findings, maxPages);
  if (affectedBullets.length > 0) {
    lines.push(`## Who is affected`);
    lines.push('');
    for (const b of affectedBullets) lines.push(b);
    lines.push('');
  }

  lines.push(`## Highest-reach findings`);
  lines.push('');
  lines.push(renderTopReach(workItems, maxPages));
  lines.push('');

  lines.push(`## WCAG-Level distribution`);
  lines.push('');
  lines.push(renderWcagLevels(findings));
  lines.push('');

  return lines.join('\n');
}

function renderSeverityTable(findings: Finding[], maxPages: number): string {
  const rows: string[] = ['| Severity | Count | Pages affected |', '|---|---|---|'];
  for (const sev of SEVERITY_ORDER) {
    const inTier = findings.filter((f) => f.severity === sev);
    if (inTier.length === 0) continue;
    const pages = Math.min(new Set(inTier.map((f) => f.url)).size, maxPages);
    rows.push(`| ${SEVERITY_LABELS[sev]} | ${inTier.length} | ${pages} |`);
  }
  return rows.join('\n');
}

function renderConcentration(findings: Finding[]): string {
  const byType = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byType.has(f.finding_type)) byType.set(f.finding_type, []);
    byType.get(f.finding_type)!.push(f);
  }

  let templateLevelInstances = 0;
  let templateGroupCount = 0;
  let pageSpecificInstances = 0;

  for (const [, group] of byType) {
    const dedup = groupIdenticalFindings(group);
    for (const g of dedup) {
      if (g.pages.size > 1) {
        templateGroupCount++;
        templateLevelInstances += g.count;
      } else {
        pageSpecificInstances += g.count;
      }
    }
  }

  const total = findings.length;
  return `Of the ${total} findings, ${templateLevelInstances} are instances of ${templateGroupCount} site-wide pattern${templateGroupCount === 1 ? '' : 's'} repeating across multiple pages; the remaining ${pageSpecificInstances} are page-specific.`;
}

interface AffectedFact {
  noun: string;
  count: number;
}

function renderAffectedBullets(findings: Finding[], maxPages: number): string[] {
  const counts = countByType(findings);

  const screenReader: AffectedFact[] = [
    { noun: 'links with no accessible name', count: (counts.get('empty-link') ?? 0) + (counts.get('link-name') ?? 0) + (counts.get('miscategorized-decorative') ?? 0) },
    { noun: 'images with no alt text', count: (counts.get('missing-alt') ?? 0) + (counts.get('image-alt') ?? 0) },
    { noun: 'images with unclear or redundant alt text', count: (counts.get('poor-alt') ?? 0) + (counts.get('redundant-alt') ?? 0) + (counts.get('alt-describes-appearance') ?? 0) },
    { noun: 'form controls with no label', count: (counts.get('label') ?? 0) + (counts.get('select-name') ?? 0) + (counts.get('missing-form-label') ?? 0) + (counts.get('label-not-associated') ?? 0) },
    { noun: 'generic or duplicate link text instances', count: (counts.get('generic-link-text') ?? 0) + (counts.get('redundant-link-text') ?? 0) + (counts.get('poor-link-text') ?? 0) },
    { noun: 'heading-structure issues', count: (counts.get('skipped-heading-level') ?? 0) + (counts.get('no-h1') ?? 0) + (counts.get('empty-heading') ?? 0) + (counts.get('multiple-h1') ?? 0) },
  ];

  const keyboardOnly: AffectedFact[] = [
    { noun: 'pages with no skip-to-content link', count: clampPages(countPagesWith(findings, 'missing-skip-link'), maxPages) },
    { noun: 'keyboard trap flags', count: counts.get('keyboard-trap') ?? 0 },
    { noun: 'focused elements with no visible focus indicator', count: counts.get('invisible-focus-indicator') ?? 0 },
    { noun: 'focused elements that scroll outside the viewport', count: counts.get('focus-obscured') ?? 0 },
    { noun: 'pages where a full keyboard walk could not complete', count: clampPages(countPagesWith(findings, 'keyboard-walk-inconclusive'), maxPages) },
  ];

  const lowVision: AffectedFact[] = [
    { noun: 'text/background color pairs below WCAG AA contrast', count: (counts.get('contrast-below-aa-normal') ?? 0) + (counts.get('contrast-below-aa-large') ?? 0) },
    { noun: 'UI components below non-text contrast', count: counts.get('non-text-contrast-below-aa') ?? 0 },
    { noun: 'pages with layout problems at 400% zoom', count: clampPages(countPagesWith(findings, 'horizontal-scroll-at-400-zoom') + countPagesWith(findings, 'content-clipped-at-400-zoom'), maxPages) },
    { noun: 'text-spacing issues that clip content', count: counts.get('text-spacing-content-loss') ?? 0 },
  ];

  const motionSensitive: AffectedFact[] = [
    { noun: 'animations that ignore the reduced-motion preference', count: counts.get('motion-ignores-reduce-preference') ?? 0 },
  ];

  const colorBlind: AffectedFact[] = [
    { noun: 'inline links distinguishable only by color', count: counts.get('link-in-text-block') ?? 0 },
    { noun: 'text references that rely on color, shape, or position', count: counts.get('sensory-language-candidate') ?? 0 },
  ];

  const bullets: string[] = [];
  const add = (label: string, facts: AffectedFact[]) => {
    const live = facts.filter((f) => f.count > 0);
    if (live.length === 0) return;
    const parts = live.map((f) => `${f.count} ${f.noun}`);
    bullets.push(`- **${label}:** ${parts.join('; ')}.`);
  };

  add('Screen-reader users', screenReader);
  add('Keyboard-only users', keyboardOnly);
  add('Low-vision users', lowVision);
  add('Users with motion sensitivity', motionSensitive);
  add('Color-blind users', colorBlind);

  return bullets;
}

function countByType(findings: Finding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) {
    m.set(f.finding_type, (m.get(f.finding_type) ?? 0) + 1);
  }
  return m;
}

function countPagesWith(findings: Finding[], findingType: string): number {
  const pages = new Set<string>();
  for (const f of findings) {
    if (f.finding_type === findingType) pages.add(f.url);
  }
  return pages.size;
}

function clampPages(value: number, maxPages: number): number {
  return Math.min(value, maxPages);
}

function renderTopReach(items: WorkItem[], maxPages: number): string {
  const top = [...items].sort((a, b) => b.covers_findings - a.covers_findings).slice(0, 5);
  if (top.length === 0) return '_No findings._';
  const rows: string[] = ['| # | Work item | Findings covered | Pages affected |', '|---|---|---|---|'];
  top.forEach((item, i) => {
    const pages = Math.min(item.pages_affected, maxPages);
    rows.push(`| ${i + 1} | ${escapeCell(item.title)} | ${item.covers_findings} | ${pages} |`);
  });
  return rows.join('\n');
}

function renderWcagLevels(findings: Finding[]): string {
  const counts: Record<string, number> = { A: 0, AA: 0, AAA: 0, unknown: 0 };
  for (const f of findings) {
    const m = /\(Level (AAA|AA|A)\)/.exec(f.wcag);
    if (m) counts[m[1]]++;
    else counts.unknown++;
  }
  const rows: string[] = ['| WCAG level | Findings |', '|---|---|'];
  if (counts.A > 0) rows.push(`| Level A | ${counts.A} |`);
  if (counts.AA > 0) rows.push(`| Level AA | ${counts.AA} |`);
  if (counts.AAA > 0) rows.push(`| Level AAA | ${counts.AAA} |`);
  if (counts.unknown > 0) rows.push(`| Unclassified | ${counts.unknown} |`);
  return rows.join('\n');
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
