import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJson } from '../lib/fs.js';

interface LinkEntry {
  id: string;
  href: string;
  accessible_name: string;
  visible_text: string;
  in_nav: boolean;
  nav_kind?: 'primary' | 'breadcrumb' | 'pagination' | 'footer' | 'other' | null;
  surrounding_text: string;
}

interface KeyboardStep {
  step: number;
  selector: string;
  tag_name: string;
  accessible_name: string | null;
  role: string | null;
}

interface KeyboardWalk {
  steps: KeyboardStep[];
}

interface NavDeviation {
  pages: [string, string];
  diff_type: 'element-added' | 'element-removed' | 'order-change';
  elements_changed: number;
  diff: string;
}

interface ConsistencyResult {
  pages_compared: number;
  skip_link: {
    present_on: string[];
    missing_on: string[];
  };
  nav_consistency: {
    pages_compared: number;
    deviations: NavDeviation[];
  };
  help_consistency: {
    pages_compared: number;
    deviations: NavDeviation[];
  };
}

const SKIP_LINK_HINTS = /skip[\s-]?(to|link)|skip[\s-]?navigation|skip[\s-]?content|g3-skip-link|av-screen-reader-only|sr-only/i;
const HELP_LINK_HINTS = /\b(help|contact|support|chat|faq)\b/i;

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function runConsistency(runDir: string): Promise<void> {
  const pagesDir = join(runDir, 'pages');
  const pageSlugs = await readdir(pagesDir);

  const pageData: Array<{
    slug: string;
    links: LinkEntry[];
    firstFocused: KeyboardStep | null;
  }> = [];

  for (const slug of pageSlugs) {
    const links = await readJson<LinkEntry[]>(join(pagesDir, slug, 'links.json'));
    const kw = await readJson<KeyboardWalk>(join(pagesDir, slug, 'keyboard-walk.json'));
    pageData.push({
      slug,
      links: links ?? [],
      firstFocused: kw?.steps?.[0] ?? null,
    });
  }

  const result: ConsistencyResult = {
    pages_compared: pageData.length,
    skip_link: computeSkipLinkStatus(pageData),
    nav_consistency: computeNavConsistency(pageData),
    help_consistency: computeHelpConsistency(pageData),
  };

  await writeJson(join(runDir, 'consistency.json'), result);
}

function computeSkipLinkStatus(
  pageData: Array<{ slug: string; links: LinkEntry[]; firstFocused: KeyboardStep | null }>,
): ConsistencyResult['skip_link'] {
  const present: string[] = [];
  const missing: string[] = [];

  for (const p of pageData) {
    const first = p.firstFocused;
    const isFirstASkipLink =
      first &&
      first.tag_name === 'a' &&
      (SKIP_LINK_HINTS.test(first.selector ?? '') ||
        SKIP_LINK_HINTS.test(first.accessible_name ?? ''));

    const hasSkipLinkInLinks = p.links.some(
      (l) => SKIP_LINK_HINTS.test(l.accessible_name) || SKIP_LINK_HINTS.test(l.visible_text),
    );

    if (isFirstASkipLink || hasSkipLinkInLinks) {
      present.push(p.slug);
    } else {
      missing.push(p.slug);
    }
  }

  return { present_on: present, missing_on: missing };
}

function computeNavConsistency(
  pageData: Array<{ slug: string; links: LinkEntry[] }>,
): ConsistencyResult['nav_consistency'] {
  const navPerPage = pageData.map((p) => ({
    slug: p.slug,
    nav: normalizedNav(p.links),
  }));

  const deviations: NavDeviation[] = [];
  if (navPerPage.length < 2) {
    return { pages_compared: navPerPage.length, deviations };
  }

  const reference = navPerPage[0];
  for (let i = 1; i < navPerPage.length; i++) {
    const other = navPerPage[i];
    const dev = diffNav(reference.nav, other.nav, reference.slug, other.slug);
    if (dev) deviations.push(dev);
  }

  return { pages_compared: navPerPage.length, deviations };
}

function computeHelpConsistency(
  pageData: Array<{ slug: string; links: LinkEntry[] }>,
): ConsistencyResult['help_consistency'] {
  const helpDestinationsPerPage = pageData.map((p) => ({
    slug: p.slug,
    destinations: new Set(
      p.links
        .filter((l) => HELP_LINK_HINTS.test(l.visible_text || l.accessible_name))
        .map((l) => normalizeHref(l.href))
        .filter((h) => h.length > 0),
    ),
  }));

  const deviations: NavDeviation[] = [];
  if (helpDestinationsPerPage.length < 2) {
    return { pages_compared: helpDestinationsPerPage.length, deviations };
  }

  const reference = helpDestinationsPerPage[0];
  for (let i = 1; i < helpDestinationsPerPage.length; i++) {
    const other = helpDestinationsPerPage[i];
    const missing = Array.from(reference.destinations).filter((d) => !other.destinations.has(d));
    const added = Array.from(other.destinations).filter((d) => !reference.destinations.has(d));
    if (missing.length === 0 && added.length === 0) continue;
    deviations.push({
      pages: [reference.slug, other.slug],
      diff_type: missing.length > 0 ? 'element-removed' : 'element-added',
      elements_changed: missing.length + added.length,
      diff: [
        missing.length > 0 ? `help destinations missing on ${other.slug}: ${missing.join(', ')}` : '',
        added.length > 0 ? `help destinations added on ${other.slug}: ${added.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    });
  }

  return { pages_compared: helpDestinationsPerPage.length, deviations };
}

function normalizeHref(href: string): string {
  if (!href) return '';
  try {
    const u = new URL(href, 'https://x/');
    u.hash = '';
    u.search = '';
    return u.pathname.replace(/\/$/, '');
  } catch {
    return href.replace(/\/$/, '');
  }
}

function normalizedNav(links: LinkEntry[]): string[] {
  return links
    .filter((l) => l.in_nav && (l.nav_kind === 'primary' || l.nav_kind === undefined))
    .map((l) => normalizeLabel(l.visible_text || l.accessible_name))
    .filter((s) => s.length > 0);
}

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[▼▲→↗»›…]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function diffNav(a: string[], b: string[], slugA: string, slugB: string): NavDeviation | null {
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((x) => !setA.has(x));
  const removed = a.filter((x) => !setB.has(x));

  if (added.length === 0 && removed.length === 0) {
    const sameSet = a.length === b.length && a.every((v, i) => v === b[i]);
    if (!sameSet) {
      return {
        pages: [slugA, slugB],
        diff_type: 'order-change',
        elements_changed: 2,
        diff: `Same nav items but in different order between ${slugA} and ${slugB}`,
      };
    }
    return null;
  }

  return {
    pages: [slugA, slugB],
    diff_type: added.length >= removed.length ? 'element-added' : 'element-removed',
    elements_changed: added.length + removed.length,
    diff: [
      added.length > 0 ? `added on ${slugB}: ${added.slice(0, 5).join(', ')}${added.length > 5 ? '…' : ''}` : '',
      removed.length > 0 ? `removed on ${slugB}: ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? '…' : ''}` : '',
    ]
      .filter(Boolean)
      .join('; '),
  };
}
