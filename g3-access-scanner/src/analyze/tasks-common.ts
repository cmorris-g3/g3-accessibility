import type { Finding, Manifest } from '../types.js';
import type { WorkItem } from './roadmap.js';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export const PRIORITY_NAMES: Record<Priority, string> = {
  P0: 'Critical blockers — fix first',
  P1: 'High impact — next sprint',
  P2: 'Experience improvements — backlog',
  P3: 'Polish',
};

export const PRIORITY_ORDER: Priority[] = ['P0', 'P1', 'P2', 'P3'];

export function groupByPriority(items: WorkItem[]): Map<Priority, WorkItem[]> {
  const m = new Map<Priority, WorkItem[]>();
  for (const p of PRIORITY_ORDER) m.set(p, []);
  for (const item of items) {
    const p = item.priority as Priority;
    m.get(p)!.push(item);
  }
  return m;
}

export function scopeSentence(item: WorkItem, totalAuditedPages: number): string {
  const pages = Math.min(item.pages_affected, totalAuditedPages);
  const findings = item.covers_findings;
  const findingsWord = findings === 1 ? 'finding' : 'findings';

  if (pages === 1) return `${findings} ${findingsWord} on 1 page.`;
  if (pages >= totalAuditedPages) {
    return `${findings} ${findingsWord} across all ${totalAuditedPages} audited pages (site-wide pattern).`;
  }
  return `${findings} ${findingsWord} across ${pages} of ${totalAuditedPages} audited pages.`;
}

export function emptyStateDoc(title: string, role: string, manifest: Manifest): string {
  const date = manifest.ended_at.substring(0, 10);
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Site:** ${manifest.site}  `);
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages audited:** ${manifest.urls.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    `No ${role} items in this audit. This file is generated on every run so team workflows stay consistent.`,
  );
  lines.push('');
  return lines.join('\n');
}

export function priorityDistribution(items: WorkItem[]): string {
  const counts: Record<Priority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const item of items) counts[item.priority as Priority]++;
  const parts: string[] = [];
  for (const p of PRIORITY_ORDER) {
    if (counts[p] > 0) parts.push(`${p}: ${counts[p]}`);
  }
  return parts.join(', ');
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

export function shortLink(href: string): string {
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

export function filenameOf(src: string): string {
  try {
    const u = new URL(src);
    return u.pathname.split('/').pop() ?? src;
  } catch {
    return src.split('/').pop() ?? src;
  }
}

export function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderPagesCell(pages: string[], totalAuditedPages: number): string {
  if (pages.length === 1) {
    return '`' + pathOf(pages[0]) + '`';
  }
  const isAll = pages.length >= totalAuditedPages;
  const label = isAll
    ? `**${pages.length} pages (all audited)**`
    : `**${pages.length} pages**`;
  const shown = pages.slice(0, 3).map((u) => '`' + pathOf(u) + '`').join(', ');
  const more = pages.length > 3 ? `, +${pages.length - 3} more` : '';
  return `${label}: ${shown}${more}`;
}

export function findingsPerPage(findings: Finding[]): Map<string, Finding[]> {
  const m = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!m.has(f.url)) m.set(f.url, []);
    m.get(f.url)!.push(f);
  }
  return m;
}

export function uniquePages(findings: Finding[]): string[] {
  return Array.from(new Set(findings.map((f) => f.url)));
}

export interface ThirdPartyMatch {
  vendor: string;
}

// Patterns are intentionally strict: we match element-owned signatures (iframe src,
// class names on the element itself, widget ids, data-* attributes on the element,
// asset URLs in src), NOT outbound link hrefs. A link whose href points to
// youtube.com is a first-party link the site owner can fix; only markup that
// belongs to an embedded third-party product is routed here.
const VENDOR_PATTERNS: Array<{ vendor: string; test: RegExp }> = [
  {
    vendor: 'YouTube',
    test: /<iframe[^>]*src=["'][^"']*youtube\.com\/embed\/|title=["']YouTube video player["']|class=["'][^"']*\b(ytm[a-zA-Z-]+|ytp-[a-z0-9-]+|ytCore[a-zA-Z-]+|html5-video-player)/i,
  },
  {
    vendor: 'Vimeo',
    test: /<iframe[^>]*src=["'][^"']*(vimeo\.com\/video\/|player\.vimeo\.com)/i,
  },
  {
    vendor: 'UserWay accessibility widget',
    test: /\bid=["']userway[a-zA-Z]*["']|\bclass=["'][^"']*userway-/i,
  },
  {
    vendor: 'Usercentrics consent banner',
    test: /\bclass=["'][^"']*usercentrics|\bid=["']usercentrics[a-zA-Z-]*["']/i,
  },
  {
    vendor: 'Facebook embed',
    test: /<iframe[^>]*src=["'][^"']*facebook\.com\/plugins|\bid=["']fb-root["']|\bclass=["'][^"']*\bfb-(like|share|iframe)|<div[^>]*data-href=["'][^"']*facebook\.com/i,
  },
  {
    vendor: 'Twitter / X embed',
    test: /<iframe[^>]*src=["'][^"']*platform\.twitter\.com|\bclass=["'][^"']*twitter-(tweet|widget)/i,
  },
  {
    vendor: 'Instagram embed',
    test: /<iframe[^>]*src=["'][^"']*instagram\.com\/embed|\bclass=["'][^"']*instagram-media/i,
  },
  {
    vendor: 'LinkedIn embed',
    test: /<iframe[^>]*src=["'][^"']*linkedin\.com\/embed/i,
  },
  {
    vendor: 'TikTok embed',
    test: /<iframe[^>]*src=["'][^"']*tiktok\.com\/embed|\bclass=["'][^"']*tiktok-embed/i,
  },
  {
    vendor: 'Google Maps embed',
    test: /<iframe[^>]*src=["'][^"']*google\.com\/maps\/embed/i,
  },
];

// Vendor-specific asset host matches — when context.src of an image or iframe points
// to a CDN owned by the vendor, the element is vendor-owned regardless of its surrounding HTML.
const VENDOR_SRC_HOSTS: Array<{ vendor: string; test: RegExp }> = [
  { vendor: 'UserWay accessibility widget', test: /^https?:\/\/[^\/]*userway\.(org|com)\//i },
  { vendor: 'YouTube', test: /^https?:\/\/[^\/]*(youtube\.com|ytimg\.com|ggpht\.com)\// },
  { vendor: 'Vimeo', test: /^https?:\/\/[^\/]*(vimeo\.com|vimeocdn\.com)\// },
];

export function detectThirdParty(f: Finding): ThirdPartyMatch | null {
  const ctx = f.context ?? {};
  const outer = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
  const cv = typeof f.current_value === 'string' ? f.current_value : '';
  const target = f.target ?? '';
  const src = typeof ctx.src === 'string' ? (ctx.src as string) : '';

  // Document-root elements belong to the site even if a third-party runtime
  // decorates them with data-* attributes or classes at load time.
  const targetTrim = target.trim().toLowerCase();
  if (targetTrim === 'html' || targetTrim === 'body' || targetTrim === 'head') return null;

  if (src) {
    for (const hostPattern of VENDOR_SRC_HOSTS) {
      if (hostPattern.test.test(src)) return { vendor: hostPattern.vendor };
    }
  }

  const haystack = `${target}\n${outer}\n${cv}`;
  for (const pattern of VENDOR_PATTERNS) {
    if (pattern.test.test(haystack)) return { vendor: pattern.vendor };
  }

  // Axe's frame-descent syntax in target — the finding is DOM inside an iframe
  // even when we didn't identify the specific vendor.
  if (/\siframe\s*\[/i.test(target)) return { vendor: 'Third-party iframe' };

  return null;
}
