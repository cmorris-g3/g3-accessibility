import type { Finding, Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { WHY_IT_MATTERS } from './plain-language.js';
import {
  PRIORITY_NAMES,
  type Priority,
  emptyStateDoc,
  pathOf,
  priorityDistribution,
  stripTags,
  truncate,
} from './tasks-common.js';

const DESIGNER_OWNED = new Set<string>(['designer']);

const CONTRAST_TYPES = new Set<string>([
  'contrast-below-aa-normal',
  'contrast-below-aa-large',
  'non-text-contrast-below-aa',
]);
const TARGET_TYPES = new Set<string>(['target-below-24px', 'target-below-44px', 'target-size']);

export function renderDesignerTasks(workItems: WorkItem[], manifest: Manifest): string {
  const items = workItems.filter((i) => DESIGNER_OWNED.has(i.owner));
  const date = manifest.ended_at.substring(0, 10);
  const totalPages = manifest.urls.length;

  if (items.length === 0) {
    return emptyStateDoc(`Designer Tasks — ${manifest.site}`, 'designer', manifest);
  }

  const lines: string[] = [];
  lines.push(`# Designer Tasks — ${manifest.site}`);
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
    'This is the designer handoff. Every item is owned by the design function — color palette decisions and sizing of interactive elements. No editor or developer work is mixed in. A project manager can send this directly to a designer.',
  );
  lines.push('');
  lines.push(
    'Each task is framed in plain language for the person making the handoff; the specific color pairs or elements to fix are listed as checkboxes with the exact pages where each one appears.',
  );
  lines.push('');

  const totalFindings = items.reduce((sum, i) => sum + i.covers_findings, 0);
  const pagesAffected = Math.min(
    new Set(items.flatMap((i) => i.findings.map((f) => f.url))).size,
    totalPages,
  );

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **${items.length} work item${items.length === 1 ? '' : 's'}** covering ${totalFindings} finding${totalFindings === 1 ? '' : 's'} across ${pagesAffected} page${pagesAffected === 1 ? '' : 's'}.`);
  lines.push(`- **Priorities:** ${priorityDistribution(items)}.`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const contrastItems = items.filter((i) => i.finding_types.some((t) => CONTRAST_TYPES.has(t)));
  const targetItems = items.filter((i) => i.finding_types.some((t) => TARGET_TYPES.has(t)));
  const otherItems = items.filter(
    (i) => !contrastItems.includes(i) && !targetItems.includes(i),
  );

  if (contrastItems.length > 0) {
    lines.push('## Color contrast');
    lines.push('');
    for (const item of contrastItems) {
      lines.push(renderColorTask(item, totalPages));
    }
  }

  if (targetItems.length > 0) {
    lines.push('## Touch-target size');
    lines.push('');
    for (const item of targetItems) {
      lines.push(renderTargetTask(item, totalPages));
    }
  }

  if (otherItems.length > 0) {
    lines.push('## Other design items');
    lines.push('');
    for (const item of otherItems) {
      lines.push(renderGenericTask(item, totalPages));
    }
  }

  return lines.join('\n');
}

function renderTaskHeader(item: WorkItem, totalPages: number): string[] {
  const lines: string[] = [];
  lines.push(`### ${item.id}. ${item.title}`);
  lines.push('');

  const primaryType = item.finding_types[0];
  const plain = WHY_IT_MATTERS[primaryType];
  if (plain) {
    lines.push(`**What this fixes:** ${plain}`);
    lines.push('');
  }

  const pagesAffected = Math.min(item.pages_affected, totalPages);
  const pagesPhrase =
    pagesAffected >= totalPages
      ? `all ${totalPages} audited pages`
      : `${pagesAffected} of ${totalPages} audited pages`;
  lines.push(`**Scope:** ${item.covers_findings} finding${item.covers_findings === 1 ? '' : 's'} across ${pagesPhrase}.`);
  lines.push('');

  lines.push(`**Priority:** ${item.priority} — ${PRIORITY_NAMES[item.priority as Priority]}  `);
  lines.push(`**Effort estimate:** ${item.effort} (${item.effort_label})`);
  lines.push('');
  lines.push(`**What to do:** ${item.what_to_do}`);
  lines.push('');
  lines.push(`**Done when:** ${item.done_when}`);
  lines.push('');
  return lines;
}

interface ColorInstance {
  url: string;
  sample: string;
}

interface ColorGroup {
  fg: string;
  bg: string;
  ratio: number | null;
  required: number | null;
  instances: ColorInstance[];
}

function renderColorTask(item: WorkItem, totalPages: number): string {
  const lines = renderTaskHeader(item, totalPages);

  const byColor = new Map<string, ColorGroup>();
  for (const f of item.findings) {
    const ctx = f.context ?? {};
    const fg = typeof ctx.foreground_hex === 'string' ? ctx.foreground_hex : '?';
    const bg = typeof ctx.background_hex === 'string' ? ctx.background_hex : '?';
    const key = `${fg}|${bg}`;
    let g = byColor.get(key);
    if (!g) {
      g = {
        fg,
        bg,
        ratio: typeof ctx.ratio === 'number' ? ctx.ratio : null,
        required: typeof ctx.required === 'number' ? ctx.required : null,
        instances: [],
      };
      byColor.set(key, g);
    }
    const sample = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    g.instances.push({ url: f.url, sample });
  }

  lines.push('**Color pairs to fix:**');
  lines.push('');

  const sorted = Array.from(byColor.values()).sort((a, b) => b.instances.length - a.instances.length);
  for (const g of sorted) {
    const ratioStr = g.ratio !== null ? `${g.ratio.toFixed(2)}:1` : '?:1';
    const reqStr = g.required !== null ? `${g.required.toFixed(1)}:1` : '?:1';
    lines.push(`- [ ] **Color pair:** fg \`${g.fg}\` / bg \`${g.bg}\` — contrast ratio ${ratioStr} (needs ${reqStr})`);

    const pages = groupInstancesByPage(g.instances);
    const pagesClamped = Math.min(pages.size, totalPages);
    const isAll = pagesClamped >= totalPages;
    const summary = isAll
      ? `${g.instances.length} instance${g.instances.length === 1 ? '' : 's'} across all ${totalPages} audited pages`
      : `${g.instances.length} instance${g.instances.length === 1 ? '' : 's'} across ${pagesClamped} page${pagesClamped === 1 ? '' : 's'}`;
    lines.push(`    - **Where:** ${summary}.`);
    lines.push(renderPageList(pages, 10));
    lines.push('');
  }

  lines.push(`**WCAG reference:** ${item.findings[0]?.wcag ?? '—'}. ${item.technical_detail}`);
  lines.push('');
  return lines.join('\n');
}

interface TargetInstance {
  url: string;
  width: number | null;
  height: number | null;
}

interface TargetGroup {
  selector: string;
  width: number | null;
  height: number | null;
  instances: TargetInstance[];
}

function renderTargetTask(item: WorkItem, totalPages: number): string {
  const lines = renderTaskHeader(item, totalPages);

  const byElement = new Map<string, TargetGroup>();
  for (const f of item.findings) {
    const ctx = f.context ?? {};
    const w = typeof ctx.width === 'number' ? ctx.width : null;
    const h = typeof ctx.height === 'number' ? ctx.height : null;
    const selector = f.target ?? '—';
    const key = `${selector}|${w}×${h}`;
    let g = byElement.get(key);
    if (!g) {
      g = { selector, width: w, height: h, instances: [] };
      byElement.set(key, g);
    }
    g.instances.push({ url: f.url, width: w, height: h });
  }

  lines.push('**Elements to enlarge:**');
  lines.push('');

  const sorted = Array.from(byElement.values()).sort((a, b) => b.instances.length - a.instances.length);
  const visible = sorted.slice(0, 30);
  for (const g of visible) {
    const size = g.width !== null && g.height !== null ? `${g.width}×${g.height} px` : 'size unknown';
    lines.push(`- [ ] **Element:** \`${truncate(g.selector, 140)}\` — ${size}`);

    const pages = groupInstancesByPage(g.instances.map((i) => ({ url: i.url, sample: '' })));
    const pagesClamped = Math.min(pages.size, totalPages);
    const isAll = pagesClamped >= totalPages;
    const summary = isAll
      ? `${g.instances.length} instance${g.instances.length === 1 ? '' : 's'} across all ${totalPages} audited pages`
      : `${g.instances.length} instance${g.instances.length === 1 ? '' : 's'} across ${pagesClamped} page${pagesClamped === 1 ? '' : 's'}`;
    lines.push(`    - **Where:** ${summary}.`);
    lines.push(renderPageList(pages, 10));
    lines.push('');
  }

  if (sorted.length > 30) {
    lines.push(`_…plus ${sorted.length - 30} more distinct elements — see \`findings.csv\`._`);
    lines.push('');
  }

  lines.push(`**WCAG reference:** ${item.findings[0]?.wcag ?? '—'}. ${item.technical_detail}`);
  lines.push('');
  return lines.join('\n');
}

function renderGenericTask(item: WorkItem, totalPages: number): string {
  const lines = renderTaskHeader(item, totalPages);
  lines.push('**Findings:**');
  lines.push('');
  for (const f of item.findings.slice(0, 20)) {
    const cv = typeof f.current_value === 'string' ? stripTags(f.current_value) : '';
    lines.push(`- [ ] [\`${pathOf(f.url)}\`](${f.url})${f.target ? ` — \`${truncate(f.target, 100)}\`` : ''}${cv ? ` — "${truncate(cv, 80)}"` : ''}`);
  }
  if (item.findings.length > 20) {
    lines.push('');
    lines.push(`_…plus ${item.findings.length - 20} more — see \`findings.csv\`._`);
  }
  lines.push('');
  lines.push(`**WCAG reference:** ${item.findings[0]?.wcag ?? '—'}. ${item.technical_detail}`);
  lines.push('');
  return lines.join('\n');
}

function groupInstancesByPage(
  instances: { url: string; sample: string }[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const i of instances) {
    if (!m.has(i.url)) m.set(i.url, []);
    if (i.sample) m.get(i.url)!.push(i.sample);
  }
  return m;
}

function renderPageList(pagesMap: Map<string, string[]>, max: number): string {
  const entries = Array.from(pagesMap.entries());
  const visible = entries.slice(0, max);
  const lines: string[] = [];

  for (const [url, samples] of visible) {
    const uniqueSamples = Array.from(new Set(samples.filter(Boolean).map((s) => truncate(s, 60))));
    const sampleText = uniqueSamples.length > 0 ? ` — sample text: "${uniqueSamples.join('", "')}"` : '';
    lines.push(`        - [\`${pathOf(url)}\`](${url})${sampleText}`);
  }
  if (entries.length > max) {
    lines.push(`        - _…plus ${entries.length - max} more page${entries.length - max === 1 ? '' : 's'} — see \`findings.csv\`._`);
  }
  return lines.join('\n');
}
