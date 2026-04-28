import type { Finding, Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { WHY_IT_MATTERS } from './plain-language.js';
import {
  PRIORITY_NAMES,
  PRIORITY_ORDER,
  type Priority,
  detectThirdParty,
  groupByPriority,
  pathOf,
  priorityDistribution,
  scopeSentence,
  shortLink,
  stripTags,
  truncate,
} from './tasks-common.js';

const DEVELOPER_OWNED = new Set<string>(['developer', 'mixed']);

export function renderDeveloperTasks(workItems: WorkItem[], manifest: Manifest): string {
  const items = workItems
    .filter((i) => DEVELOPER_OWNED.has(i.owner))
    .map((i) => ({ ...i, findings: i.findings.filter((f) => !detectThirdParty(f)) }))
    .filter((i) => i.findings.length > 0)
    .map((i) => ({
      ...i,
      covers_findings: i.findings.length,
      pages_affected: new Set(i.findings.map((f) => f.url)).size,
    }));
  const date = manifest.ended_at.substring(0, 10);
  const totalPages = manifest.urls.length;

  const lines: string[] = [];
  lines.push(`# Developer Tasks — ${manifest.site}`);
  lines.push('');
  lines.push(`**Site:** ${manifest.site}  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages audited:** ${totalPages}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## What this document is');
  lines.push('');
  lines.push(
    'This is the developer handoff. Every item in this doc is owned by a developer — no editor, designer, or vendor work is mixed in. A project manager reviewing this file can send it directly to a developer without curating or translating first.',
  );
  lines.push('');
  lines.push(
    'Each task is framed in plain language for the person making the handoff. Distinct issues are listed as checkboxes showing the selector, markup, and the exact pages each issue appears on.',
  );
  lines.push('');

  if (items.length === 0) {
    lines.push('---');
    lines.push('');
    lines.push('No developer items in this audit.');
    lines.push('');
    return lines.join('\n');
  }

  const totalFindings = items.reduce((sum, i) => sum + i.covers_findings, 0);
  const pagesAffected = Math.min(
    new Set(items.flatMap((i) => i.findings.map((f) => f.url))).size,
    totalPages,
  );

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **${items.length} work items** covering ${totalFindings} individual findings across ${pagesAffected} page${pagesAffected === 1 ? '' : 's'}.`);
  lines.push(`- **Priorities:** ${priorityDistribution(items)}.`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const byPriority = groupByPriority(items);
  for (const p of PRIORITY_ORDER) {
    const group = byPriority.get(p) ?? [];
    if (group.length === 0) continue;
    lines.push(`## ${p} — ${PRIORITY_NAMES[p]}`);
    lines.push('');
    for (const item of group) {
      lines.push(renderDeveloperTask(item, totalPages));
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function renderDeveloperTask(item: WorkItem, totalPages: number): string {
  const lines: string[] = [];
  lines.push(`### ${item.id}. ${item.title}`);
  lines.push('');

  const primaryType = item.finding_types[0];
  const plain = WHY_IT_MATTERS[primaryType];
  if (plain) {
    lines.push(`**What this fixes:** ${plain}`);
    lines.push('');
  }

  lines.push(`**Scope:** ${scopeSentence(item, totalPages)}`);
  lines.push('');
  lines.push(`**Priority:** ${item.priority} — ${PRIORITY_NAMES[item.priority as Priority]}  `);
  lines.push(`**Effort estimate:** ${item.effort} (${item.effort_label})`);
  lines.push('');
  lines.push(`**What to do:** ${item.what_to_do}`);
  lines.push('');
  lines.push(`**Done when:** ${item.done_when}`);
  lines.push('');

  const groups = groupByIdentity(item.findings);
  const templateLevel = groups.filter((g) => g.pages.size > 1).length;
  const pageSpecific = groups.filter((g) => g.pages.size === 1).length;

  if (templateLevel > 0) {
    lines.push(
      `**Distinct issues to fix (${item.findings.length} findings → ${groups.length} distinct issue${groups.length === 1 ? '' : 's'}):** ${templateLevel} template-level (same markup repeated across pages), ${pageSpecific} page-specific.`,
    );
  } else {
    lines.push(`**Distinct issues to fix (${item.findings.length}):**`);
  }
  lines.push('');

  for (const g of groups) {
    for (const line of renderDistinctIssue(g, totalPages)) {
      lines.push(line);
    }
    lines.push('');
  }

  lines.push(`**WCAG reference:** ${item.findings[0]?.wcag ?? '—'}. ${item.technical_detail}`);
  lines.push('');

  return lines.join('\n');
}

interface InstanceGroup {
  rep: Finding;
  pages: Set<string>;
  count: number;
}

function groupByIdentity(findings: Finding[]): InstanceGroup[] {
  const map = new Map<string, InstanceGroup>();
  for (const f of findings) {
    const key = identityKey(f);
    let g = map.get(key);
    if (!g) {
      g = { rep: f, pages: new Set(), count: 0 };
      map.set(key, g);
    }
    g.pages.add(f.url);
    g.count++;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function identityKey(f: Finding): string {
  const ctx = f.context ?? {};
  const outer =
    typeof ctx.outer_html === 'string' && ctx.outer_html.length > 0
      ? (ctx.outer_html as string)
      : typeof f.current_value === 'string' && f.current_value.includes('<')
        ? f.current_value
        : '';
  return `${f.finding_type}|${f.target ?? ''}|${outer}`;
}

function renderDistinctIssue(g: InstanceGroup, totalPages: number): string[] {
  const lines: string[] = [];
  const rep = g.rep;
  const type = rep.finding_type;
  const ctx = rep.context ?? {};

  lines.push(`- [ ] ${issueTitle(rep)}`);

  const measurement = issueMeasurement(rep);
  if (measurement) lines.push(`    - **${measurement.label}:** ${measurement.value}`);

  if (!SKIP_HTML_FOR.has(type)) {
    const html = outerHtmlOf(rep);
    if (html) lines.push(`    - **HTML:** \`${truncate(html, 200)}\``);
  }

  if (!SKIP_SELECTOR_IN_DETAILS.has(type) && rep.target && !issueTitleUsesSelector(type)) {
    lines.push(`    - **Selector:** \`${truncate(rep.target, 140)}\``);
  }

  const pages = Array.from(g.pages);
  const pagesClamped = Math.min(pages.length, totalPages);
  const isAll = pagesClamped >= totalPages;
  const summary = isAll
    ? `${g.count} instance${g.count === 1 ? '' : 's'} across all ${totalPages} audited pages`
    : `${g.count} instance${g.count === 1 ? '' : 's'} across ${pagesClamped} page${pagesClamped === 1 ? '' : 's'}`;
  lines.push(`    - **Where:** ${summary}.`);

  if (!isAll || pages.length <= 10) {
    const visible = pages.slice(0, 10);
    for (const url of visible) {
      lines.push(`        - [\`${pathOf(url)}\`](${url})`);
    }
    if (pages.length > 10) {
      lines.push(
        `        - _…plus ${pages.length - 10} more page${pages.length - 10 === 1 ? '' : 's'} — see \`findings.csv\`._`,
      );
    }
  }

  return lines;
}

const SKIP_HTML_FOR = new Set([
  'html-has-lang',
  'missing-skip-link',
  'no-h1',
  'multiple-h1',
  'empty-heading',
  'skipped-heading-level',
  'poor-heading-text',
  'keyboard-trap',
  'keyboard-walk-inconclusive',
  'invisible-focus-indicator',
  'focus-obscured',
  'illogical-focus-order',
  'horizontal-scroll-at-400-zoom',
  'content-clipped-at-400-zoom',
  'text-spacing-content-loss',
  'text-spacing-not-responsive',
  'inconsistent-navigation',
  'inconsistent-identification',
  'inconsistent-help',
]);

const SKIP_SELECTOR_IN_DETAILS = new Set(['html-has-lang', 'missing-skip-link']);

function issueTitle(f: Finding): string {
  const type = f.finding_type;
  const ctx = f.context ?? {};

  if (type === 'empty-link' || type === 'link-name') {
    const href = hrefOf(f);
    return href ? `**Link** pointing to ${shortLink(href)}` : `**Link** with no href`;
  }

  if (type === 'generic-link-text' || type === 'poor-link-text' || type === 'redundant-link-text') {
    const href = hrefOf(f);
    const visible = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    const text = visible ? `"${truncate(visible, 40)}"` : 'unnamed link';
    return href ? `**Link** ${text} → ${shortLink(href)}` : `**Link** ${text}`;
  }

  if (
    type === 'missing-alt' ||
    type === 'image-alt' ||
    type === 'poor-alt' ||
    type === 'redundant-alt' ||
    type === 'miscategorized-decorative' ||
    type === 'alt-describes-appearance'
  ) {
    const src = typeof ctx.src === 'string' ? (ctx.src as string) : '';
    const filename = src ? filenameOf(src) : '';
    return filename ? `**Image** \`${filename}\`` : `**Image** at \`${truncate(f.target ?? '—', 100)}\``;
  }

  if (type === 'button-name') return `**Button** \`${truncate(f.target ?? '—', 120)}\``;
  if (type === 'select-name') return `**Dropdown** \`${truncate(f.target ?? '—', 120)}\``;
  if (type === 'frame-title') return `**iframe** \`${truncate(f.target ?? '—', 120)}\``;
  if (type === 'label') return `**Form input** \`${truncate(f.target ?? '—', 120)}\``;

  if (type === 'skipped-heading-level') {
    const from = typeof ctx.from === 'number' ? (ctx.from as number) : '?';
    const to = typeof ctx.to === 'number' ? (ctx.to as number) : '?';
    return `**Heading** jumps from h${from} to h${to} — \`${truncate(f.target ?? '—', 100)}\``;
  }
  if (type === 'no-h1') return `**Page with no h1**`;
  if (type === 'multiple-h1') return `**Page with more than one h1**`;
  if (type === 'empty-heading') return `**Empty heading** at \`${truncate(f.target ?? '—', 100)}\``;

  if (type === 'target-below-24px' || type === 'target-below-44px' || type === 'target-size') {
    const w = typeof ctx.width === 'number' ? ctx.width : '?';
    const h = typeof ctx.height === 'number' ? ctx.height : '?';
    return `**Element** \`${truncate(f.target ?? '—', 100)}\` — ${w}×${h} px`;
  }

  if (type === 'motion-ignores-reduce-preference') {
    const name = typeof ctx.animation_name === 'string' ? (ctx.animation_name as string) : '—';
    const dur = typeof ctx.animation_duration_s === 'number' ? ` (${ctx.animation_duration_s}s)` : '';
    return `**Animation** \`${name}\`${dur}`;
  }

  if (type === 'html-has-lang') return `**\`<html>\` element** is missing the \`lang\` attribute`;
  if (type === 'missing-skip-link') return `**No "skip to main content" link** as first Tab target`;

  if (type === 'aria-valid-attr') return `**Misspelled ARIA attribute** on \`${truncate(f.target ?? '—', 100)}\``;
  if (type === 'aria-prohibited-attr') return `**Prohibited ARIA attribute** on \`${truncate(f.target ?? '—', 100)}\``;
  if (type === 'aria-hidden-focus') return `**Focusable element** inside an \`aria-hidden="true"\` subtree at \`${truncate(f.target ?? '—', 100)}\``;
  if (type === 'nested-interactive') return `**Nested interactive element** at \`${truncate(f.target ?? '—', 100)}\``;

  if (type === 'link-in-text-block') return `**Inline link** at \`${truncate(f.target ?? '—', 100)}\` — distinguishable only by color`;

  if (type === 'inconsistent-navigation') return `**Inconsistent primary navigation**`;
  if (type === 'inconsistent-identification') return `**Inconsistent component labeling**`;
  if (type === 'inconsistent-help') return `**Inconsistent help mechanism**`;

  if (type === 'definition-list') return `**Invalid \`<dl>\` markup** at \`${truncate(f.target ?? '—', 100)}\``;

  return `**Element** \`${truncate(f.target ?? '—', 120)}\``;
}

function issueTitleUsesSelector(type: string): boolean {
  return new Set([
    'button-name',
    'select-name',
    'frame-title',
    'label',
    'skipped-heading-level',
    'empty-heading',
    'target-below-24px',
    'target-below-44px',
    'target-size',
    'aria-valid-attr',
    'aria-prohibited-attr',
    'aria-hidden-focus',
    'nested-interactive',
    'link-in-text-block',
    'definition-list',
  ]).has(type);
}

function issueMeasurement(f: Finding): { label: string; value: string } | null {
  const ctx = f.context ?? {};
  const type = f.finding_type;

  if (type === 'contrast-below-aa-normal' || type === 'contrast-below-aa-large' || type === 'non-text-contrast-below-aa') {
    const fg = typeof ctx.foreground_hex === 'string' ? (ctx.foreground_hex as string) : '?';
    const bg = typeof ctx.background_hex === 'string' ? (ctx.background_hex as string) : '?';
    const ratio = typeof ctx.ratio === 'number' ? (ctx.ratio as number).toFixed(2) : '?';
    const required = typeof ctx.required === 'number' ? (ctx.required as number).toFixed(1) : '?';
    return { label: 'Contrast', value: `fg \`${fg}\` / bg \`${bg}\` — ${ratio}:1 (needs ${required}:1)` };
  }

  return null;
}

function hrefOf(f: Finding): string {
  const ctx = f.context ?? {};
  if (typeof ctx.href === 'string' && ctx.href) return ctx.href as string;
  const outer = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
  const m = outer.match(/href=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function outerHtmlOf(f: Finding): string {
  const ctx = f.context ?? {};
  const outer = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
  const cv = typeof f.current_value === 'string' && f.current_value.includes('<') ? f.current_value : '';
  return outer || cv;
}

function filenameOf(src: string): string {
  try {
    const u = new URL(src);
    return decodeURIComponent(u.pathname.split('/').pop() ?? src);
  } catch {
    return decodeURIComponent(src.split('/').pop() ?? src);
  }
}
