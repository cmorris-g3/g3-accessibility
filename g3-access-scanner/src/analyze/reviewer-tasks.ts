import type { Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { WHY_IT_MATTERS } from './plain-language.js';
import {
  PRIORITY_NAMES,
  type Priority,
  emptyStateDoc,
  pathOf,
  priorityDistribution,
  uniquePages,
} from './tasks-common.js';

const REVIEWER_OWNED = new Set<string>(['qa-review']);

export function renderReviewerTasks(workItems: WorkItem[], manifest: Manifest): string {
  const items = workItems.filter((i) => REVIEWER_OWNED.has(i.owner));
  const date = manifest.ended_at.substring(0, 10);
  const totalPages = manifest.urls.length;

  if (items.length === 0) {
    return emptyStateDoc(`Manual Reviewer Tasks — ${manifest.site}`, 'manual-review', manifest);
  }

  const lines: string[] = [];
  lines.push(`# Manual Reviewer Tasks — ${manifest.site}`);
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
    'This is the manual-reviewer handoff. Every item here is something the automated audit could not conclude on its own — a human needs to sit at a browser and verify specific behavior. No developer, editor, or designer work is in this file.',
  );
  lines.push('');
  lines.push(
    'Each task is framed in plain language for the person making the handoff, with the exact pages to visit and the specific checks to perform.',
  );
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **${items.length} review task${items.length === 1 ? '' : 's'}** across ${uniquePagesAcross(items)} page${uniquePagesAcross(items) === 1 ? '' : 's'}.`);
  lines.push(`- **Priorities:** ${priorityDistribution(items)}.`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const item of items) {
    lines.push(renderReviewerTask(item, totalPages));
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function uniquePagesAcross(items: WorkItem[]): number {
  const pages = new Set<string>();
  for (const item of items) {
    for (const f of item.findings) pages.add(f.url);
  }
  return pages.size;
}

function renderReviewerTask(item: WorkItem, totalPages: number): string {
  const lines: string[] = [];
  lines.push(`## ${item.id}. ${item.title}`);
  lines.push('');

  const primaryType = item.finding_types[0];
  const plain = WHY_IT_MATTERS[primaryType];
  if (plain) {
    lines.push(`**What this fixes:** ${plain}`);
    lines.push('');
  }

  const pages = uniquePages(item.findings);
  const pagesClamped = Math.min(pages.length, totalPages);
  lines.push(`**Scope:** ${pagesClamped} page${pagesClamped === 1 ? '' : 's'} need${pagesClamped === 1 ? 's' : ''} a manual pass.`);
  lines.push('');
  lines.push(`**Priority:** ${item.priority} — ${PRIORITY_NAMES[item.priority as Priority]}  `);
  lines.push(`**Effort estimate:** ${item.effort} (${item.effort_label})`);
  lines.push('');
  lines.push(`**What to do:** ${item.what_to_do}`);
  lines.push('');
  lines.push(`**Done when:** ${item.done_when}`);
  lines.push('');

  lines.push('### Pages to visit');
  lines.push('');
  for (const url of pages.slice(0, 20)) {
    lines.push(`- [ ] [\`${pathOf(url)}\`](${url})`);
  }
  if (pages.length > 20) {
    lines.push('');
    lines.push(`_…plus ${pages.length - 20} more pages — see \`findings.csv\`._`);
  }
  lines.push('');

  lines.push(renderChecksSection(primaryType));
  lines.push('');

  lines.push('<details><summary>Internal technical detail</summary>');
  lines.push('');
  lines.push(`**WCAG reference:** ${item.findings[0]?.wcag ?? '—'}. ${item.technical_detail}`);
  lines.push('');
  lines.push('</details>');
  lines.push('');
  return lines.join('\n');
}

function renderChecksSection(findingType: string): string {
  const lines: string[] = [];
  lines.push('### What to do on each page');
  lines.push('');

  if (findingType === 'keyboard-walk-inconclusive') {
    lines.push('1. Load the page with keyboard only (no mouse/trackpad touch).');
    lines.push('2. Press `Tab` repeatedly. Watch where the focus ring goes.');
    lines.push('3. Verify focus lands on every interactive element (links, buttons, form fields, custom widgets) in a sensible reading order.');
    lines.push('4. Verify focus never gets stuck in a region (keyboard trap). If it does, note which element and which page.');
    lines.push('5. Verify every focused element is visible on-screen (not hidden behind a sticky header or below the fold).');
    lines.push('6. Verify you can reach the main content without tabbing through the entire header on every page — a skip link should be the first Tab target.');
    lines.push('7. Press `Shift+Tab` from the footer back to the top and confirm the reverse order is sane.');
    lines.push('');
    lines.push('Record any real problems found with: page URL, element description, and what went wrong.');
  } else if (findingType === 'text-spacing-not-responsive') {
    lines.push('1. Install a WCAG text-spacing browser extension (or apply the required CSS via DevTools).');
    lines.push('2. Load each page and verify the layout reflows — no clipped content, no overlapping text.');
    lines.push('3. If the page looks identical, it may already satisfy the spec; confirm by inspecting computed styles for `!important` on line-height / letter-spacing / word-spacing.');
  } else {
    lines.push('Follow the "What to do" instruction above on each page listed. Record any real problems with: page URL, element description, and what went wrong.');
  }

  return lines.join('\n');
}
