import type { Finding, Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { WHY_IT_MATTERS } from './plain-language.js';
import {
  PRIORITY_NAMES,
  type Priority,
  detectThirdParty,
  emptyStateDoc,
  pathOf,
  priorityDistribution,
  truncate,
} from './tasks-common.js';

const VENDOR_OWNED = new Set<string>(['vendor']);

interface ThirdPartyByVendor {
  vendor: string;
  findings: Finding[];
}

export function renderVendorTasks(workItems: WorkItem[], manifest: Manifest): string {
  const items = workItems.filter((i) => VENDOR_OWNED.has(i.owner));
  const embeds = collectThirdPartyEmbeds(workItems);
  const date = manifest.ended_at.substring(0, 10);
  const totalPages = manifest.urls.length;

  if (items.length === 0 && embeds.length === 0) {
    return emptyStateDoc(`Vendor Tasks — ${manifest.site}`, 'third-party vendor', manifest);
  }

  const lines: string[] = [];
  lines.push(`# Vendor Tasks — ${manifest.site}`);
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
    'This is the vendor coordinator handoff. Every item is owned by a third-party product — a plugin, widget, embed, or overlay your team did not build. No in-house developer, editor, or designer work is mixed in.',
  );
  lines.push('');
  lines.push('The doc has two kinds of items:');
  lines.push('');
  lines.push(
    '- **Vendor fixes to request** — the vendor controls the product, has a support channel, and can ship a fix. Each item includes a ready-to-paste issue description.',
  );
  lines.push(
    '- **Third-party embeds (mitigation only)** — embedded players, widgets, and overlays whose markup you cannot change directly. Your options are to replace the embed, wrap it in a labeled region, or reconsider using it. Filing upstream is optional and usually low-yield.',
  );
  lines.push('');

  const totalFindings =
    items.reduce((sum, i) => sum + i.covers_findings, 0) +
    embeds.reduce((sum, e) => sum + e.findings.length, 0);

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **${items.length} vendor fix${items.length === 1 ? '' : 'es'} to request** + **${embeds.length} third-party embed${embeds.length === 1 ? '' : 's'}** (mitigation only) covering ${totalFindings} finding${totalFindings === 1 ? '' : 's'} total.`);
  if (items.length > 0) {
    lines.push(`- **Priorities of vendor fixes:** ${priorityDistribution(items)}.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  if (items.length > 0) {
    lines.push('## Vendor fixes to request');
    lines.push('');
    for (const item of items) {
      lines.push(renderVendorTask(item, totalPages));
      lines.push('---');
      lines.push('');
    }
  }

  if (embeds.length > 0) {
    lines.push('## Third-party embeds (mitigation only)');
    lines.push('');
    lines.push(
      'These findings are inside third-party products embedded on your site (video players, widgets, accessibility overlays, analytics, social embeds). The markup belongs to the vendor — you cannot add aria-labels, alt text, or other fixes to it directly. Your options as the site owner:',
    );
    lines.push('');
    lines.push('- **Replace the embed** with an alternative product that has better accessibility.');
    lines.push('- **Wrap the embed** in a labeled region on your page so a screen-reader user knows what the embed is before entering it.');
    lines.push('- **Reconsider whether the embed is needed** on this page at all.');
    lines.push('- **Report upstream** — if the vendor has a public issue tracker, file the finding there. Fixes may or may not land.');
    lines.push('');

    for (const e of embeds) {
      lines.push(renderEmbedSection(e, totalPages));
    }
  }

  return lines.join('\n');
}

function collectThirdPartyEmbeds(workItems: WorkItem[]): ThirdPartyByVendor[] {
  const byVendor = new Map<string, Finding[]>();
  for (const item of workItems) {
    for (const f of item.findings) {
      const match = detectThirdParty(f);
      if (!match) continue;
      if (!byVendor.has(match.vendor)) byVendor.set(match.vendor, []);
      byVendor.get(match.vendor)!.push(f);
    }
  }
  return Array.from(byVendor.entries())
    .map(([vendor, findings]) => ({ vendor, findings }))
    .sort((a, b) => b.findings.length - a.findings.length);
}

function renderEmbedSection(entry: ThirdPartyByVendor, totalPages: number): string {
  const lines: string[] = [];
  const pages = new Set(entry.findings.map((f) => f.url));
  const pagesClamped = Math.min(pages.size, totalPages);

  lines.push(`### ${entry.vendor}`);
  lines.push('');
  lines.push(
    `${entry.findings.length} finding${entry.findings.length === 1 ? '' : 's'} on ${pagesClamped} page${pagesClamped === 1 ? '' : 's'}.`,
  );
  lines.push('');

  const byIssue = groupEmbedByIssue(entry.findings);

  for (const g of byIssue) {
    lines.push(`- [ ] **${g.title}** — ${g.findingType} (${g.wcag})`);
    if (g.htmlSnippet) lines.push(`    - **HTML:** \`${truncate(g.htmlSnippet, 200)}\``);
    const gpages = Array.from(g.pages);
    const gClamped = Math.min(gpages.length, totalPages);
    const isAll = gClamped >= totalPages;
    const summary = isAll
      ? `${g.count} instance${g.count === 1 ? '' : 's'} across all ${totalPages} audited pages`
      : `${g.count} instance${g.count === 1 ? '' : 's'} across ${gClamped} page${gClamped === 1 ? '' : 's'}`;
    lines.push(`    - **Where:** ${summary}.`);

    if (!isAll || gpages.length <= 10) {
      const visible = gpages.slice(0, 10);
      for (const url of visible) {
        lines.push(`        - [\`${pathOf(url)}\`](${url})`);
      }
      if (gpages.length > 10) {
        lines.push(
          `        - _…plus ${gpages.length - 10} more page${gpages.length - 10 === 1 ? '' : 's'} — see \`findings.csv\`._`,
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

interface EmbedIssueGroup {
  title: string;
  findingType: string;
  wcag: string;
  htmlSnippet: string;
  pages: Set<string>;
  count: number;
}

function groupEmbedByIssue(findings: Finding[]): EmbedIssueGroup[] {
  const map = new Map<string, EmbedIssueGroup>();
  for (const f of findings) {
    const ctx = f.context ?? {};
    const outer = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
    const cv = typeof f.current_value === 'string' && f.current_value.includes('<') ? f.current_value : '';
    const html = outer || cv;
    // Key drops the target so two userway spinner instances at different DOM
    // positions with identical HTML collapse to one entry.
    const key = `${f.finding_type}|${html}`;
    let g = map.get(key);
    if (!g) {
      g = {
        title: embedIssueTitle(f),
        findingType: f.finding_type,
        wcag: f.wcag,
        htmlSnippet: html,
        pages: new Set(),
        count: 0,
      };
      map.set(key, g);
    }
    g.pages.add(f.url);
    g.count++;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function embedIssueTitle(f: Finding): string {
  const type = f.finding_type;
  const ctx = f.context ?? {};

  if (type === 'button-name') return `Button with no accessible name`;
  if (type === 'link-name' || type === 'empty-link') return `Link with no accessible name`;
  if (type === 'select-name') return `Dropdown with no accessible name`;
  if (type === 'frame-title') return `iframe with no title attribute`;
  if (type === 'label') return `Form input with no associated label`;
  if (type === 'missing-alt' || type === 'image-alt') return `Image with no alt attribute`;
  if (type === 'poor-alt' || type === 'redundant-alt' || type === 'alt-describes-appearance') {
    const alt = extractAlt(typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '');
    return alt !== null ? `Image with weak alt text ("${truncate(alt, 40)}")` : `Image with weak alt text`;
  }
  if (type === 'miscategorized-decorative') return `Image marked decorative but used as link`;
  if (type === 'aria-hidden-focus') return `Focusable element hidden from assistive tech`;
  if (type === 'aria-prohibited-attr') return `ARIA attribute not allowed on this element`;
  if (type === 'aria-valid-attr') return `Misspelled ARIA attribute`;
  if (type === 'nested-interactive') return `Nested interactive control`;
  if (type === 'color-contrast' || type === 'contrast-below-aa-normal' || type === 'contrast-below-aa-large') return `Text below minimum contrast`;
  if (type === 'non-text-contrast-below-aa') return `UI component below minimum contrast`;
  if (type === 'target-size' || type === 'target-below-24px' || type === 'target-below-44px') return `Touch target below 24×24 px minimum`;
  if (type === 'motion-ignores-reduce-preference') return `Animation ignores reduced-motion preference`;
  if (type === 'invisible-focus-indicator') return `No visible focus indicator on keyboard focus`;
  if (type === 'focus-obscured') return `Focused element positioned outside the viewport`;
  if (type === 'keyboard-trap') return `Keyboard trap`;
  if (type === 'illogical-focus-order') return `Illogical tab order`;
  if (type === 'definition-list') return `Invalid <dl> markup`;
  if (type === 'link-in-text-block') return `Inline link distinguishable only by color`;
  if (type === 'html-has-lang') return `<html> element missing lang attribute`;
  if (type === 'nested-interactive') return `Nested interactive element`;

  return type.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function extractAlt(outer: string): string | null {
  const m = outer.match(/\balt=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

function renderVendorTask(item: WorkItem, totalPages: number): string {
  const lines: string[] = [];
  lines.push(`## ${item.id}. ${item.title}`);
  lines.push('');

  const primaryType = item.finding_types[0];
  const plain = WHY_IT_MATTERS[primaryType];
  if (plain) {
    lines.push(`**What this fixes:** ${plain}`);
    lines.push('');
  }

  const pagesAffected = Math.min(item.pages_affected, totalPages);
  lines.push(
    `**Scope:** ${item.covers_findings} finding${item.covers_findings === 1 ? '' : 's'} across ${pagesAffected} page${pagesAffected === 1 ? '' : 's'}.`,
  );
  lines.push('');
  lines.push(`**Priority:** ${item.priority} — ${PRIORITY_NAMES[item.priority as Priority]}  `);
  lines.push(`**Effort estimate:** ${item.effort} (${item.effort_label})`);
  lines.push('');
  lines.push(`**What to do:** ${item.what_to_do}`);
  lines.push('');
  lines.push(`**Done when:** ${item.done_when}`);
  lines.push('');

  const sampleFindings = item.findings.slice(0, 5);
  const sampleSelectors = sampleFindings.map((f) => f.target).filter((t): t is string => !!t);
  const wcag = item.findings[0]?.wcag ?? '—';

  lines.push('### Ready-to-paste issue description for the vendor');
  lines.push('');
  lines.push('```');
  lines.push(`Subject: Accessibility defect — ${item.title}`);
  lines.push('');
  lines.push(
    `Your product is generating markup that fails ${wcag}. This affects assistive-technology users who rely on correct semantics.`,
  );
  lines.push('');
  lines.push('Detail:');
  lines.push(`- Finding type: ${primaryType}`);
  lines.push(`- Observed on ${pagesAffected} audited page${pagesAffected === 1 ? '' : 's'}.`);
  if (sampleSelectors.length > 0) {
    lines.push('- Example selectors where the defect appears:');
    sampleSelectors.forEach((s) => lines.push(`    - ${truncate(s, 120)}`));
  }
  lines.push('');
  lines.push(
    'We are asking: fix in an upcoming release, or confirm a workaround we can apply at our end. We will re-audit once a fix ships.',
  );
  lines.push('');
  lines.push('Additional context available on request.');
  lines.push('```');
  lines.push('');

  lines.push('<details><summary>Internal technical detail</summary>');
  lines.push('');
  lines.push(`**WCAG reference:** ${wcag}. ${item.technical_detail}`);
  lines.push('');
  lines.push(`**Sample findings:**`);
  lines.push('');
  lines.push('| # | Page | Selector |');
  lines.push('|---|---|---|');
  sampleFindings.forEach((f, i) => {
    lines.push(`| ${i + 1} | \`${pathOf(f.url)}\` | \`${f.target ?? '—'}\` |`);
  });
  if (item.findings.length > 5) {
    lines.push('');
    lines.push(`_…plus ${item.findings.length - 5} more — see \`findings.csv\`._`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  return lines.join('\n');
}
