import type { Page, ElementHandle } from 'playwright';
import { writeJson, ensureDir } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface ImageEntry {
  id: string;
  src: string;
  alt: string | null;
  alt_present: boolean;
  role: string | null;
  width: number;
  height: number;
  computed_role: string | null;
  accessible_name: string | null;
  in_link: boolean;
  link_href: string | null;
  link_text_siblings: string | null;
  caption: string | null;
  surrounding_text: string;
  crop_path: string | null;
  is_decorative_hint: boolean;
  css_path: string;
  outer_html: string;
}

export async function runImages(page: Page, ctx: PageContext): Promise<{ count: number }> {
  const handles: ElementHandle<HTMLImageElement>[] = (await page.$$('img')) as ElementHandle<HTMLImageElement>[];

  await ensureDir(`${ctx.outDir}/screenshots/images`);
  const images: ImageEntry[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    const id = `img-${String(i + 1).padStart(3, '0')}`;

    const data = await handle.evaluate((img: HTMLImageElement) => {
      const alt = img.getAttribute('alt');
      const role = img.getAttribute('role');
      const ariaLabel = img.getAttribute('aria-label');

      const linkAncestor = img.closest('a') as HTMLAnchorElement | null;
      const figureAncestor = img.closest('figure');
      const figcaption = figureAncestor?.querySelector('figcaption');

      const linkTextSiblings = linkAncestor
        ? stripText(linkAncestor.textContent ?? '', alt ?? '')
        : null;

      const rect = img.getBoundingClientRect();

      const outerElement = linkAncestor ?? img;
      return {
        src: img.currentSrc || img.src,
        alt,
        alt_present: img.hasAttribute('alt'),
        role,
        width: Math.round(rect.width) || img.naturalWidth,
        height: Math.round(rect.height) || img.naturalHeight,
        computed_role: role ?? 'img',
        accessible_name: ariaLabel ?? alt,
        in_link: linkAncestor !== null,
        link_href: linkAncestor?.getAttribute('href') ?? null,
        link_text_siblings: linkTextSiblings,
        caption: figcaption ? (figcaption.textContent ?? '').trim() : null,
        surrounding_text: getSurroundingText(img),
        is_decorative_hint: isDecorativeHint(img, alt, role, rect),
        css_path: buildCssPath(outerElement),
        outer_html: (outerElement.outerHTML ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
      };

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

      function stripText(full: string, toRemove: string): string {
        const f = full.trim().replace(/\s+/g, ' ');
        const r = toRemove.trim().replace(/\s+/g, ' ');
        if (!r) return f;
        return f.replace(r, '').trim();
      }

      function getSurroundingText(el: Element): string {
        const container = el.closest('p, li, figure, section, article, div');
        if (!container) return '';
        const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 400);
      }

      function isDecorativeHint(
        img: HTMLImageElement,
        alt: string | null,
        role: string | null,
        rect: DOMRect,
      ): boolean {
        if (alt === '' || role === 'presentation' || role === 'none') return true;
        if (Math.max(rect.width, rect.height) < 48 && !img.closest('a, figure')) return true;
        return false;
      }
    });

    let cropPath: string | null = null;
    try {
      const box = await handle.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        await handle.scrollIntoViewIfNeeded({ timeout: 2000 });
        const path = `screenshots/images/${id}.png`;
        await handle.screenshot({ path: `${ctx.outDir}/${path}`, timeout: 3000 });
        cropPath = path;
      }
    } catch {
      // Lazy-load not triggered, cross-origin, or element detached — leave crop null
    }

    images.push({ id, ...data, crop_path: cropPath });
    await handle.dispose();
  }

  await writeJson(`${ctx.outDir}/images.json`, images);
  return { count: images.length };
}
