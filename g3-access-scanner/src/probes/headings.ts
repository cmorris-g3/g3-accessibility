import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface Heading {
  level: number;
  text: string;
  selector: string;
  empty: boolean;
  hidden: boolean;
}

interface HeadingIssue {
  type: 'no-h1' | 'skipped-heading-level' | 'multiple-h1' | 'empty-heading';
  from?: number;
  to?: number;
  at_selector?: string;
  text?: string;
}

export async function runHeadings(page: Page, ctx: PageContext): Promise<{ issues: number }> {
  const headings: Heading[] = await page.evaluate(() => {
    const collected: Heading[] = [];
    const nodes = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]');

    nodes.forEach((el, idx) => {
      const tag = el.tagName.toLowerCase();
      let level: number;
      if (tag.match(/^h[1-6]$/)) {
        level = parseInt(tag.substring(1), 10);
      } else {
        level = parseInt(el.getAttribute('aria-level') ?? '0', 10);
      }

      const text = (el.textContent ?? '').trim();
      collected.push({
        level,
        text,
        selector: buildSelector(el, idx),
        empty: text.length === 0,
        hidden: isHiddenFromAT(el as HTMLElement),
      });
    });

    function buildSelector(el: Element, idx: number): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      return `${tag}:nth-of-type(${idx + 1})`;
    }

    function isHiddenFromAT(el: HTMLElement): boolean {
      if (el.closest('[aria-hidden="true"]')) return true;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        const offsetParent = el.offsetParent;
        const cs = getComputedStyle(el);
        if (offsetParent === null && cs.position !== 'fixed' && cs.position !== 'sticky') {
          return true;
        }
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      return false;
    }

    return collected;
  });

  const issues = detectIssues(headings);

  await writeJson(`${ctx.outDir}/headings.json`, { headings, issues });
  return { issues: issues.length };
}

function detectIssues(headings: Heading[]): HeadingIssue[] {
  const issues: HeadingIssue[] = [];
  const visible = headings.filter((h) => !h.hidden);

  const h1s = visible.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    issues.push({ type: 'no-h1' });
  } else if (h1s.length > 1) {
    issues.push({ type: 'multiple-h1' });
  }

  for (const h of visible) {
    if (h.empty) {
      issues.push({ type: 'empty-heading', at_selector: h.selector });
    }
  }

  for (let i = 1; i < visible.length; i++) {
    const prev = visible[i - 1];
    const curr = visible[i];
    if (curr.level > prev.level + 1) {
      issues.push({
        type: 'skipped-heading-level',
        from: prev.level,
        to: curr.level,
        at_selector: curr.selector,
      });
    }
  }

  return issues;
}
