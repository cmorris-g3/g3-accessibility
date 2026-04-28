import type { Finding, Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { detectThirdParty } from './tasks-common.js';

interface Section {
  id: string;
  title: string;
  findingTypes: string[];
}

const SECTIONS: Section[] = [
  {
    id: 'alt-text',
    title: 'Add alt text to images',
    findingTypes: [
      'missing-alt',
      'poor-alt',
      'redundant-alt',
      'miscategorized-decorative',
      'alt-describes-appearance',
    ],
  },
  {
    id: 'link-text',
    title: 'Rewrite vague or duplicate link text',
    findingTypes: ['generic-link-text', 'poor-link-text', 'redundant-link-text'],
  },
  {
    id: 'heading-structure',
    title: 'Fix heading structure',
    findingTypes: ['skipped-heading-level', 'no-h1', 'multiple-h1'],
  },
  {
    id: 'empty-headings',
    title: 'Remove empty or placeholder headings',
    findingTypes: ['empty-heading', 'poor-heading-text'],
  },
  {
    id: 'sensory-language',
    title: 'Review language that relies on color, shape, or position',
    findingTypes: ['sensory-language-candidate'],
  },
];

const EDITOR_OWNED = new Set<string>(['content-editor']);
const TEMPLATE_THRESHOLD_PAGES = 3;
const COVERED_TYPES = new Set<string>(SECTIONS.flatMap((s) => s.findingTypes));
const CONTENT_TYPES_ALWAYS_PAGE_LEVEL = new Set<string>([
  'skipped-heading-level',
  'no-h1',
  'multiple-h1',
  'empty-heading',
  'poor-heading-text',
  'sensory-language-candidate',
]);

export function renderEditorTasks(
  workItems: WorkItem[],
  manifest: Manifest,
): { markdown: string; warnings: string[] } {
  const date = manifest.ended_at.substring(0, 10);

  const editorFindings: Finding[] = [];
  const footerItems: string[] = [];

  for (const item of workItems) {
    if (EDITOR_OWNED.has(item.owner)) {
      for (const f of item.findings) {
        if (detectThirdParty(f)) continue;
        if (COVERED_TYPES.has(f.finding_type)) editorFindings.push(f);
      }
      continue;
    }
    if (item.owner === 'mixed') {
      const nonThirdParty = item.findings.filter((f) => !detectThirdParty(f));
      const splits = splitMixedByImage(nonThirdParty);
      for (const f of splits.editor) {
        if (COVERED_TYPES.has(f.finding_type)) editorFindings.push(f);
      }
      if (splits.developer.length > 0) {
        footerItems.push(
          `${item.title} (${splits.developer.length} instance${splits.developer.length === 1 ? '' : 's'}): ${summarizeDeveloperSplit(item, splits.developer)}`,
        );
      }
    }
  }

  const templateItems = extractTemplateLevel(editorFindings);
  for (const entry of templateItems.footerEntries) footerItems.push(entry);

  const pageLevelFindings = templateItems.pageLevel;

  const lines: string[] = [];
  lines.push(`# Your Accessibility To-Do List`);
  lines.push('');
  lines.push(`**Site:** ${manifest.site}  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages audited:** ${manifest.urls.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push(
    'This is the list of accessibility fixes that live in the content management system. Developer work is in `developer-tasks.md`; designer work is in `designer-tasks.md`; the full technical plan is in `roadmap.md`.',
  );
  lines.push('');

  const pagesTouched = new Set(pageLevelFindings.map((f) => f.url)).size;
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- ${pageLevelFindings.length} item${pageLevelFindings.length === 1 ? '' : 's'} across ${pagesTouched} page${pagesTouched === 1 ? '' : 's'}.`);
  if (footerItems.length > 0) {
    lines.push(`- ${footerItems.length} additional site-wide issue${footerItems.length === 1 ? '' : 's'} require a developer first — listed at the end so you know what to hand off.`);
  }
  lines.push('');

  for (const section of SECTIONS) {
    const inSection = pageLevelFindings.filter((f) => section.findingTypes.includes(f.finding_type));
    if (inSection.length === 0) continue;

    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(`${inSection.length} item${inSection.length === 1 ? '' : 's'}.`);
    lines.push('');

    const byPage = groupByPage(inSection);
    for (const [url, pageFindings] of byPage) {
      for (const f of pageFindings) {
        lines.push(renderChecklistItem(f, url));
        lines.push('');
      }
    }
  }

  if (footerItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push(`## Items for your developer`);
    lines.push('');
    lines.push(
      'These fixes repeat across many pages because they come from shared page framing, not from content you type into a page. A developer can fix each one in one place and it will propagate everywhere.',
    );
    lines.push('');
    for (const entry of footerItems) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  const markdown = lines.join('\n');
  const warnings = lintForBannedTokens(markdown);
  return { markdown, warnings };
}

function splitMixedByImage(findings: Finding[]): { editor: Finding[]; developer: Finding[] } {
  const developer: Finding[] = [];
  for (const f of findings) {
    developer.push(f);
  }
  return { editor: [], developer };
}

function summarizeDeveloperSplit(item: WorkItem, devFindings: Finding[]): string {
  const pagesAffected = new Set(devFindings.map((f) => f.url)).size;
  return `site-wide fix needed on ${pagesAffected} page${pagesAffected === 1 ? '' : 's'}.`;
}

interface LocalGroup {
  rep: Finding;
  findings: Finding[];
  pages: Set<string>;
}

function extractTemplateLevel(findings: Finding[]): {
  pageLevel: Finding[];
  footerEntries: string[];
} {
  const byKey = new Map<string, LocalGroup>();
  for (const f of findings) {
    const key = identityKey(f);
    let group = byKey.get(key);
    if (!group) {
      group = { rep: f, findings: [], pages: new Set() };
      byKey.set(key, group);
    }
    group.findings.push(f);
    group.pages.add(f.url);
  }

  const pageLevel: Finding[] = [];
  const byDescriptor = new Map<string, { rep: Finding; pages: Set<string>; findings: number }>();

  for (const group of byKey.values()) {
    const type = group.rep.finding_type;
    const isContent = CONTENT_TYPES_ALWAYS_PAGE_LEVEL.has(type);
    if (!isContent && group.pages.size > TEMPLATE_THRESHOLD_PAGES) {
      const descriptor = describeRepForFooter(type, group.rep);
      const existing = byDescriptor.get(descriptor);
      if (existing) {
        for (const url of group.pages) existing.pages.add(url);
        existing.findings += group.findings.length;
      } else {
        byDescriptor.set(descriptor, {
          rep: group.rep,
          pages: new Set(group.pages),
          findings: group.findings.length,
        });
      }
    } else {
      pageLevel.push(...group.findings);
    }
  }

  const footerEntries = Array.from(byDescriptor.entries()).map(([descriptor, data]) => {
    const action = pageFooterAction(data.rep.finding_type);
    return `${descriptor} appears on ${data.pages.size} page${data.pages.size === 1 ? '' : 's'} (${data.findings} instance${data.findings === 1 ? '' : 's'}). ${action}`;
  });

  return { pageLevel, footerEntries };
}

function identityKey(f: Finding): string {
  const ctx = f.context ?? {};
  const outer =
    typeof ctx.outer_html === 'string' && ctx.outer_html.length > 0
      ? (ctx.outer_html as string)
      : typeof f.current_value === 'string' && f.current_value.includes('<')
        ? f.current_value
        : '';
  const target = f.target ?? '';
  return `${f.finding_type}|${target}|${outer}`;
}

function describeRepForFooter(type: string, f: Finding): string {
  const ctx = f.context ?? {};
  if (type === 'missing-alt' || type === 'image-alt' || type === 'alt-describes-appearance' || type === 'redundant-alt' || type === 'poor-alt' || type === 'miscategorized-decorative') {
    const filename = typeof ctx.src === 'string' ? filenameOf(ctx.src as string) : '';
    return filename ? `The image \`${filename}\`` : 'An image';
  }
  if (type === 'generic-link-text' || type === 'poor-link-text' || type === 'redundant-link-text' || type === 'empty-link') {
    const href = typeof ctx.href === 'string' ? (ctx.href as string) : '';
    const visible = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    if (visible && href) return `The link "${truncate(visible, 40)}" pointing to ${shortLink(href)}`;
    if (href) return `The link pointing to ${shortLink(href)}`;
    return 'A link';
  }
  if (type === 'skipped-heading-level') {
    const from = ctx.from;
    const to = ctx.to;
    if (typeof from === 'number' && typeof to === 'number') {
      return `A heading jump from level ${from} to level ${to}`;
    }
    return 'A heading that skips a level';
  }
  if (type === 'empty-heading') return 'An empty heading';
  if (type === 'no-h1') return 'A page with no main heading';
  if (type === 'multiple-h1') return 'A page with more than one main heading';
  if (type === 'poor-heading-text') return 'A heading with placeholder or unclear text';

  if (type === 'sensory-language-candidate') return 'A phrase that references color, shape, or position';

  return `A ${type.replace(/-/g, ' ')} issue`;
}

function pageFooterAction(type: string): string {
  if (type === 'empty-link' || type === 'generic-link-text' || type === 'redundant-link-text') {
    return 'A developer needs to fix this in the shared page framing.';
  }
  return 'A developer needs to address this site-wide.';
}

function groupByPage(findings: Finding[]): Map<string, Finding[]> {
  const m = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!m.has(f.url)) m.set(f.url, []);
    m.get(f.url)!.push(f);
  }
  return m;
}

function renderChecklistItem(f: Finding, url: string): string {
  const path = pathOf(url);
  const lines: string[] = [];
  lines.push(`- [ ] **Page:** \`${path}\` — [open page](${url})`);
  lines.push(`    - **Where:** ${describeWhere(f)}`);
  const current = describeCurrent(f);
  if (current) lines.push(`    - **Current:** ${current}`);
  lines.push(`    - **Do:** ${describeAction(f)}`);
  return lines.join('\n');
}

function describeWhere(f: Finding): string {
  const ctx = f.context ?? {};
  const type = f.finding_type;

  if (['missing-alt', 'poor-alt', 'redundant-alt', 'miscategorized-decorative', 'alt-describes-appearance', 'image-alt'].includes(type)) {
    const filename = typeof ctx.src === 'string' ? filenameOf(ctx.src as string) : '';
    const inLink = ctx.in_link === true;
    const linkHref = typeof ctx.link_href === 'string' ? (ctx.link_href as string) : '';
    const base = filename ? `the image \`${filename}\`` : 'an image on this page';
    if (inLink && linkHref) return `${base}, used as a link to ${shortLink(linkHref)}`;
    if (inLink) return `${base}, used as a link`;
    return base;
  }

  if (['generic-link-text', 'poor-link-text', 'redundant-link-text'].includes(type)) {
    const href = typeof ctx.href === 'string' ? (ctx.href as string) : '';
    const visible = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    const anchor = visible ? `the link "${truncate(visible, 50)}"` : 'a link';
    if (href) return `${anchor} pointing to ${shortLink(href)}`;
    return anchor;
  }

  if (type === 'skipped-heading-level') {
    const from = ctx.from;
    const to = ctx.to;
    if (typeof from === 'number' && typeof to === 'number') {
      return `a heading on this page jumps from level ${from} to level ${to} with no level ${from + 1} in between`;
    }
    return 'a heading on this page skips a level';
  }
  if (type === 'no-h1') return 'this page has no main heading (no level-1 heading at all)';
  if (type === 'multiple-h1') return 'this page has more than one main heading (more than one level-1 heading)';
  if (type === 'empty-heading') return 'a heading on this page is empty — it has no text at all';
  if (type === 'poor-heading-text') return 'a heading on this page has placeholder or unclear text';

  if (type === 'sensory-language-candidate') {
    const matched = typeof ctx.matched === 'string' ? (ctx.matched as string) : '';
    const snippet = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    if (matched && snippet) return `text reading "${truncate(snippet, 90)}" (phrase "${matched}")`;
    if (snippet) return `text reading "${truncate(snippet, 90)}"`;
    return 'text on this page that references color, shape, or position';
  }

  return 'see the matching entry in findings.csv';
}

function describeCurrent(f: Finding): string | null {
  const ctx = f.context ?? {};
  const type = f.finding_type;

  if (['missing-alt', 'image-alt'].includes(type)) {
    return '(no alt text)';
  }

  if (['poor-alt', 'redundant-alt', 'alt-describes-appearance'].includes(type)) {
    const outer = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
    const alt = outer ? extractAlt(outer) : null;
    if (alt !== null) return `alt text is "${alt}"`;
    return null;
  }

  if (type === 'miscategorized-decorative') {
    return 'alt text is empty, so the link has no accessible name';
  }

  if (['generic-link-text', 'poor-link-text', 'redundant-link-text'].includes(type)) {
    const visible = stripTags(typeof f.current_value === 'string' ? f.current_value : '');
    return visible ? `link text is "${truncate(visible, 80)}"` : null;
  }

  if (['skipped-heading-level', 'no-h1', 'multiple-h1', 'empty-heading', 'poor-heading-text', 'sensory-language-candidate'].includes(type)) {
    return null;
  }

  const raw = typeof f.current_value === 'string' ? f.current_value : '';
  return raw ? `"${truncate(stripTags(raw), 120)}"` : null;
}

function describeAction(f: Finding): string {
  const type = f.finding_type;

  if (type === 'missing-alt' || type === 'image-alt') {
    return 'In the image settings in your CMS, set alt text that describes what the image shows in this context. If the image is purely decorative, set the alt text to empty.';
  }
  if (type === 'poor-alt') {
    return 'Replace the alt text with a description of what the image actually shows and why it is on this page.';
  }
  if (type === 'redundant-alt') {
    return 'The alt text duplicates nearby visible text. Either remove the duplicate phrasing or set the alt text to empty if the image sits next to a caption or link that already names it.';
  }
  if (type === 'miscategorized-decorative') {
    return 'The image is inside a link and has no alt text. Set alt text that describes where the link goes.';
  }
  if (type === 'alt-describes-appearance') {
    return 'The alt text describes what the image looks like rather than what it means. Either write alt text describing the content or set the alt text to empty if the image is decorative.';
  }

  if (type === 'generic-link-text') {
    return 'Change the link text so it describes where the link goes. For card layouts where the short wording matters visually, ask your developer to add hidden context for screen readers.';
  }
  if (type === 'poor-link-text') {
    return 'Rewrite the link text to clearly describe the destination.';
  }
  if (type === 'redundant-link-text') {
    return 'Two or more links with this same visible text point to different destinations. Change the link text on each so they read differently.';
  }

  if (type === 'skipped-heading-level') {
    return 'In the CMS, edit the heading and change it to the next level down from the heading above it. Heading levels should go 1, 2, 3 in order — not 1, 3.';
  }
  if (type === 'no-h1') {
    return 'Add a main heading to this page. If your theme is supposed to show the page title as the main heading automatically, ask your developer.';
  }
  if (type === 'multiple-h1') {
    return 'Demote the extra main heading to the next level down. Usually this happens when someone retypes the page title as a heading at the top of the content — just delete the duplicate.';
  }
  if (type === 'empty-heading') {
    return 'Either add heading text or remove the empty heading from the page.';
  }
  if (type === 'poor-heading-text') {
    return 'Replace the heading text with something that describes what the section is about.';
  }

  if (type === 'sensory-language-candidate') {
    return 'Read the sentence in context. If the thing it refers to can only be found by its color, shape, or position, rewrite so someone who cannot see it can still find it. If the sentence has another way to identify what it means, no change needed.';
  }

  return typeof f.suggested_fix === 'string' ? f.suggested_fix : 'See the matching entry in findings.csv.';
}

function lintForBannedTokens(markdown: string): string[] {
  const warnings: string[] = [];
  const bodyMatch = markdown.match(/## Summary[\s\S]*?(?=\n## Items for your developer|$)/);
  const body = bodyMatch ? bodyMatch[0] : markdown;

  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\baria-[a-z]+\b/i, label: 'ARIA attribute name' },
    { re: /\bCSS\b/, label: 'the word "CSS"' },
    { re: /\bHTML\b/, label: 'the word "HTML"' },
    { re: /\bselector\b/i, label: 'the word "selector"' },
    { re: /\bDOM\b/, label: 'the word "DOM"' },
    { re: /<[a-z!][^>]*>/, label: 'an HTML tag' },
  ];

  for (const { re, label } of patterns) {
    const m = body.match(re);
    if (m) warnings.push(`editor-tasks.md contains ${label}: "${m[0]}"`);
  }
  return warnings;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

function filenameOf(src: string): string {
  try {
    const u = new URL(src);
    return u.pathname.split('/').pop() ?? src;
  } catch {
    return src.split('/').pop() ?? src;
  }
}

function shortLink(href: string): string {
  if (/^(mailto|tel):/i.test(href)) return `\`${href}\``;
  try {
    const u = new URL(href, 'https://placeholder.local');
    const host = u.host === 'placeholder.local' ? '' : u.host;
    const path = u.pathname + (u.search || '');
    return host ? `\`${host}${path}\`` : `\`${path}\``;
  } catch {
    return `\`${href}\``;
  }
}

function extractAlt(outer: string): string | null {
  const m = outer.match(/\balt=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
