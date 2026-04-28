import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

type Exception =
  | 'inline-text-link'
  | 'user-agent-control'
  | 'visually-hidden'
  | 'zero-dimension'
  | null;

interface TargetSizeEntry {
  selector: string;
  css_path: string;
  outer_html: string;
  tag_name: string;
  accessible_name: string | null;
  width: number;
  height: number;
  passes_aa: boolean;
  passes_aaa: boolean;
  exception: Exception;
}

const AA_MIN = 24;
const AAA_MIN = 44;

export async function runTargetSize(page: Page, ctx: PageContext): Promise<{ failures: number }> {
  const entries: TargetSizeEntry[] = await page.evaluate(
    ({ AA_MIN, AAA_MIN }) => {
      const selector = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const out: TargetSizeEntry[] = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();

        const tag = el.tagName.toLowerCase();
        let exception: Exception = null;

        if (rect.width === 0 || rect.height === 0) {
          exception = 'zero-dimension';
        } else if (isVisuallyHidden(el, rect)) {
          exception = 'visually-hidden';
        } else if (tag === 'a' && isInlineTextLink(el)) {
          exception = 'inline-text-link';
        } else if (tag === 'input' && isUserAgentControl(el as HTMLInputElement)) {
          exception = 'user-agent-control';
        }

        const minDim = Math.min(rect.width, rect.height);
        const accessibleName =
          el.getAttribute('aria-label') ??
          (el.textContent ?? '').trim().slice(0, 80) ??
          null;
        out.push({
          selector: buildSelector(el),
          css_path: buildCssPath(el),
          outer_html: (el.outerHTML ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
          tag_name: el.tagName.toLowerCase(),
          accessible_name: accessibleName || null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          passes_aa: minDim >= AA_MIN || exception !== null,
          passes_aaa: minDim >= AAA_MIN || exception !== null,
          exception,
        });
      }

      function isVisuallyHidden(el: HTMLElement, rect: DOMRect): boolean {
        if (el.getAttribute('aria-hidden') === 'true') return true;

        const className = (el.className ?? '').toString();
        if (/\b(sr-only|screen-reader-only|visually-hidden|av-screen-reader-only|g3-skip-link|acsb-sr-only|acsb-skip)\b/i.test(className)) {
          return true;
        }

        if (rect.width <= 4 && rect.height <= 4) return true;
        if (rect.width <= 2 || rect.height <= 2) return true;

        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        const clip = cs.clip;
        const clipPath = cs.clipPath;
        const overflow = cs.overflow;
        const pos = cs.position;
        if (
          (pos === 'absolute' || pos === 'fixed') &&
          overflow === 'hidden' &&
          (rect.width <= 4 || rect.height <= 4)
        ) {
          return true;
        }
        if (clip === 'rect(0px, 0px, 0px, 0px)' || clip === 'rect(1px, 1px, 1px, 1px)') return true;
        if (clipPath === 'inset(50%)' || clipPath === 'inset(100%)') return true;
        return false;
      }

      function isInlineTextLink(a: HTMLElement): boolean {
        const parent = a.parentElement;
        if (!parent) return false;
        const parentTag = parent.tagName.toLowerCase();
        const flowingParents = ['p', 'li', 'td', 'span', 'dd', 'blockquote'];
        if (!flowingParents.includes(parentTag)) return false;
        const parentText = (parent.textContent ?? '').trim();
        const linkText = (a.textContent ?? '').trim();
        return parentText.length > linkText.length * 1.5;
      }

      function isUserAgentControl(input: HTMLInputElement): boolean {
        const uaTypes = ['checkbox', 'radio', 'range', 'color', 'file'];
        return uaTypes.includes(input.type);
      }

      function buildSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const classList = Array.from(el.classList).filter((c) => !c.match(/^[0-9]/));
        if (classList.length > 0) return `${tag}.${classList[0]}`;
        return tag;
      }

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

      return out;
    },
    { AA_MIN, AAA_MIN },
  );

  await writeJson(`${ctx.outDir}/target-size.json`, entries);
  const failures = entries.filter((e) => !e.passes_aa && e.exception === null).length;
  return { failures };
}
