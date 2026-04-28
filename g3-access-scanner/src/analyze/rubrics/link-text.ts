import type { Finding } from '../../types.js';
import { formatWcagCitation } from '../wcag-map.js';

interface LinkEntry {
  id: string;
  href: string;
  accessible_name: string;
  visible_text: string;
  aria_label: string | null;
  aria_labelledby_text: string | null;
  in_nav: boolean;
  surrounding_text: string;
  opens_new_tab: boolean;
  css_path?: string;
  outer_html?: string;
  parent_text?: string;
}

const GENERIC = new Set([
  'click here',
  'here',
  'click',
  'read more',
  'more',
  'learn more',
  'learn',
  'details',
  'info',
  'information',
  'link',
  'this link',
  'this',
  'go',
  'continue',
  'next',
  'see more',
  'view more',
  'view',
  'find out more',
  'find out',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[→↗»›…]+/g, '')
    .trim();
}

export function applyLinkTextRubric(links: LinkEntry[], pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  const pageBase = derivePageBase(pageUrl);

  const linksByNormalizedName = new Map<string, LinkEntry[]>();
  for (const l of links) {
    const key = normalize(l.accessible_name || l.visible_text);
    if (!key) continue;
    if (!linksByNormalizedName.has(key)) linksByNormalizedName.set(key, []);
    linksByNormalizedName.get(key)!.push(l);
  }

  for (const l of links) {
    const accessibleName = (l.accessible_name || l.visible_text || '').trim();

    if (!accessibleName) {
      const wrapsImage = /<img[\s>]/i.test(l.outer_html ?? '');
      if (wrapsImage) {
        continue;
      }
      findings.push({
        check: 'link-text',
        source: 'rubric',
        finding_type: 'empty-link',
        url: pageUrl,
        target: l.css_path || `a[href="${l.href}"]`,
        severity: 'critical',
        wcag: formatWcagCitation({ sc: '2.4.4', level: 'A' }),
        rationale: 'Link has no accessible name. Screen readers announce only the URL or "link".',
        current_value: l.outer_html ?? l.visible_text,
        suggested_fix: 'Add visible link text or an aria-label describing the destination.',
        confidence: 'high',
        context: {
          link_id: l.id,
          href: l.href,
          in_nav: l.in_nav,
          parent_text: l.parent_text,
          outer_html: l.outer_html,
        },
      });
      continue;
    }

    const normalized = normalize(accessibleName);

    if (GENERIC.has(normalized)) {
      findings.push({
        check: 'link-text',
        source: 'rubric',
        finding_type: 'generic-link-text',
        url: pageUrl,
        target: l.css_path || `a[href="${l.href}"]`,
        severity: 'serious',
        wcag: formatWcagCitation({ sc: '2.4.4', level: 'A' }),
        rationale:
          'Link text is generic and cannot be distinguished when read out of context (e.g., in a screen-reader links list).',
        current_value: l.visible_text,
        suggested_fix: `Make the link text describe its destination (e.g., "${accessibleName} about ${deriveContext(l.href)}").`,
        confidence: 'high',
        context: { link_id: l.id, href: l.href, in_nav: l.in_nav },
      });
      continue;
    }

    const sameNameLinks = linksByNormalizedName.get(normalized) ?? [];
    const thisHref = normalizeHref(l.href, pageBase);
    const otherEntries = sameNameLinks
      .filter((o) => o.id !== l.id)
      .map((o) => ({ entry: o, normalized: normalizeHref(o.href, pageBase) }));
    const otherHrefs = new Set(otherEntries.map((x) => x.normalized));
    if (otherHrefs.size > 0 && !otherHrefs.has(thisHref)) {
      const conflicts = otherEntries
        .filter((x) => x.normalized !== thisHref)
        .map((x) => ({
          target: x.entry.css_path || `a[href="${x.entry.href}"]`,
          href: x.entry.href,
        }))
        .slice(0, 5);
      findings.push({
        check: 'link-text',
        source: 'rubric',
        finding_type: 'redundant-link-text',
        url: pageUrl,
        target: l.css_path || `a[href="${l.href}"]`,
        severity: 'minor',
        wcag: formatWcagCitation({ sc: '2.4.4', level: 'A' }),
        rationale:
          'Multiple links on this page share the same accessible name but point to different destinations — users cannot tell them apart.',
        current_value: l.visible_text,
        suggested_fix: 'Differentiate the link text by adding destination-specific context.',
        confidence: 'high',
        context: {
          link_id: l.id,
          href: l.href,
          different_destinations: true,
          same_name_count: sameNameLinks.length,
          conflicts,
        },
      });
      continue;
    }

    if (l.aria_label && !containsVisibleText(l.aria_label, l.visible_text)) {
      findings.push({
        check: 'link-text',
        source: 'rubric',
        finding_type: 'label-in-name-mismatch',
        url: pageUrl,
        target: l.css_path || `a[href="${l.href}"]`,
        severity: 'serious',
        wcag: formatWcagCitation({ sc: '2.5.3', level: 'A' }),
        rationale:
          'aria-label does not contain the visible text. Voice-control users speaking the visible text cannot activate this link.',
        current_value: `visible="${l.visible_text}" aria-label="${l.aria_label}"`,
        suggested_fix:
          'Ensure aria-label contains the visible text as a substring, or remove the aria-label override.',
        confidence: 'high',
        context: { link_id: l.id, href: l.href },
      });
    }
  }

  return findings;
}

function derivePageBase(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return 'https://x/';
  }
}

function normalizeHref(href: string, pageBase: string = 'https://x/'): string {
  try {
    const u = new URL(href, pageBase);
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return href;
  }
}

function containsVisibleText(accessibleName: string, visibleText: string): boolean {
  const a = accessibleName.trim().toLowerCase();
  const v = collapseDuplicateWords(visibleText.trim().toLowerCase());
  if (!v) return true;
  if (a.includes(v)) return true;
  const aWords = new Set(a.split(/\s+/).filter(Boolean));
  const vWords = v.split(/\s+/).filter(Boolean);
  if (vWords.every((w) => aWords.has(w))) return true;
  return false;
}

function collapseDuplicateWords(text: string): string {
  return text.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
}

function deriveContext(href: string): string {
  try {
    const u = new URL(href, 'https://x/');
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    return seg.replace(/[-_]/g, ' ') || 'destination';
  } catch {
    return 'destination';
  }
}
