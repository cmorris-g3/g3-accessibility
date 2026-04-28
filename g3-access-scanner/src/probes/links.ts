import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface LinkEntry {
  id: string;
  href: string;
  accessible_name: string;
  visible_text: string;
  aria_label: string | null;
  aria_labelledby_text: string | null;
  in_nav: boolean;
  nav_kind: 'primary' | 'breadcrumb' | 'pagination' | 'footer' | 'other' | null;
  surrounding_text: string;
  opens_new_tab: boolean;
  truncated: boolean;
  css_path: string;
  outer_html: string;
  parent_text: string;
}

export async function runLinks(page: Page, ctx: PageContext): Promise<{ count: number }> {
  const links: LinkEntry[] = await page.evaluate(() => {
    const results: LinkEntry[] = [];
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href], [role="link"][href]'),
    );

    anchors.forEach((a, idx) => {
      const href = a.getAttribute('href') ?? '';
      const ariaLabel = a.getAttribute('aria-label');
      const ariaLabelledby = a.getAttribute('aria-labelledby');

      let ariaLabelledbyText: string | null = null;
      if (ariaLabelledby) {
        const parts = ariaLabelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .filter(Boolean);
        ariaLabelledbyText = parts.join(' ').trim() || null;
      }

      let visibleText = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
      let truncated = false;
      if (visibleText.length > 500) {
        visibleText = visibleText.slice(0, 500);
        truncated = true;
      }

      const containedImgAlt = Array.from(a.querySelectorAll('img[alt]'))
        .map((img) => (img.getAttribute('alt') ?? '').trim())
        .filter((alt) => alt.length > 0)
        .join(' ')
        .trim();

      const accessibleName =
        ariaLabelledbyText ?? ariaLabel ?? (visibleText || containedImgAlt);

      const navAncestor = a.closest('nav, [role="navigation"]');
      const target = a.getAttribute('target');
      const navKind = classifyNav(navAncestor, a);

      results.push({
        id: `link-${String(idx + 1).padStart(3, '0')}`,
        href,
        accessible_name: accessibleName,
        visible_text: visibleText,
        aria_label: ariaLabel,
        aria_labelledby_text: ariaLabelledbyText,
        in_nav: navAncestor !== null,
        nav_kind: navKind,
        surrounding_text: getSurroundingText(a),
        opens_new_tab: target === '_blank',
        truncated,
        css_path: buildCssPath(a),
        outer_html: (a.outerHTML ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
        parent_text: getParentText(a),
      });
    });

    function buildCssPath(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      const body = document.body;
      while (current && current !== body && parts.length < 6) {
        const node: Element = current;
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += `#${CSS.escape(node.id)}`;
          parts.unshift(part);
          break;
        }
        const parent: Element | null = node.parentElement;
        if (parent) {
          const siblings: Element[] = Array.from(parent.children).filter(
            (c: Element) => c.tagName === node.tagName,
          );
          if (siblings.length > 1) {
            const i = siblings.indexOf(node);
            if (i >= 0) part += `:nth-of-type(${i + 1})`;
          }
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    }

    function getParentText(el: Element): string {
      const parent = el.parentElement;
      if (!parent) return '';
      const clone = parent.cloneNode(true) as Element;
      const children = clone.querySelectorAll(el.tagName);
      children.forEach((c) => {
        if (c.outerHTML === el.outerHTML) c.remove();
      });
      const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      return text.slice(0, 120);
    }

    function classifyNav(nav: Element | null, link: Element): LinkEntry['nav_kind'] {
      if (!nav) return null;
      const label = (nav.getAttribute('aria-label') ?? '').toLowerCase();
      const className = (nav.className ?? '').toString().toLowerCase();
      const role = nav.getAttribute('role') ?? '';
      if (/breadcrumb/.test(label) || /breadcrumb/.test(className)) return 'breadcrumb';
      if (/pagination|pager|page-numbers/.test(className) || /pagination/.test(label)) return 'pagination';
      if (nav.closest('footer')) return 'footer';
      if (/primary|main|site/.test(label) || /primary|main|site|menu/.test(className)) return 'primary';
      return 'other';
    }

    function getSurroundingText(el: Element): string {
      const container = el.closest('p, li, section, article, div');
      if (!container) return '';
      const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
      return text.slice(0, 200);
    }

    return results;
  });

  await writeJson(`${ctx.outDir}/links.json`, links);
  return { count: links.length };
}
