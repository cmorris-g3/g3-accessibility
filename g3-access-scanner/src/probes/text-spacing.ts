import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

const OVERRIDE_STYLE_ID = 'g3-text-spacing-probe';

interface ClippedRegion {
  selector: string;
  overflow_kind: 'horizontal' | 'vertical' | 'both';
  scroll_vs_client: { w: [number, number]; h: [number, number] };
  overflow_style: string;
}

interface TextSpacingResult {
  baseline_body_height: number;
  post_override_body_height: number;
  clipped_regions: ClippedRegion[];
}

export async function runTextSpacing(
  page: Page,
  ctx: PageContext,
): Promise<{ clipped: number }> {
  try {
    const baseline = await page.evaluate(() => document.body.scrollHeight);

    await page.addStyleTag({
      content: `
        #${OVERRIDE_STYLE_ID}-marker { display: none; }
        *:not(input):not(textarea):not(select):not(button) {
          line-height: 1.5 !important;
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
        }
        p, li, dd, dt, blockquote {
          margin-bottom: 2em !important;
        }
      `,
    });
    await page.evaluate(() => {
      const marker = document.createElement('div');
      marker.id = 'g3-text-spacing-probe-marker';
      document.body.appendChild(marker);
    });
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      const postHeight = document.body.scrollHeight;

      const clipped: ClippedRegion[] = [];
      const all = document.querySelectorAll<HTMLElement>(
        'p, li, td, th, h1, h2, h3, h4, h5, h6, div, section, article, blockquote, figcaption',
      );
      for (const el of all) {
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;

        const horizOverflow = el.scrollWidth > el.clientWidth + 2;
        const vertOverflow = el.scrollHeight > el.clientHeight + 2;
        if (!horizOverflow && !vertOverflow) continue;

        const hides =
          cs.overflow === 'hidden' ||
          cs.overflowX === 'hidden' ||
          cs.overflowY === 'hidden' ||
          cs.overflow === 'clip';
        if (!hides) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 12) continue;

        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        const hasText = directText.length > 0 || el.querySelector('p, span, li, a, h1, h2, h3, h4, h5, h6') !== null;
        if (!hasText) continue;

        clipped.push({
          selector: buildSelector(el),
          overflow_kind: horizOverflow && vertOverflow ? 'both' : horizOverflow ? 'horizontal' : 'vertical',
          scroll_vs_client: {
            w: [el.scrollWidth, el.clientWidth],
            h: [el.scrollHeight, el.clientHeight],
          },
          overflow_style: `${cs.overflow}/${cs.overflowX}/${cs.overflowY}`,
        });
      }

      function buildSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList)
          .filter((c) => !/^[0-9]/.test(c))
          .slice(0, 2)
          .map((c) => CSS.escape(c));
        return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
      }

      return { post_height: postHeight, clipped: clipped.slice(0, 50) };
    });

    const result: TextSpacingResult = {
      baseline_body_height: baseline,
      post_override_body_height: data.post_height,
      clipped_regions: data.clipped,
    };

    await writeJson(`${ctx.outDir}/text-spacing.json`, result);

    return { clipped: result.clipped_regions.length };
  } finally {
    await page
      .evaluate(() => {
        document.getElementById('g3-text-spacing-probe-marker')?.remove();
        document
          .querySelectorAll('style')
          .forEach((s) => {
            if (s.textContent?.includes('g3-text-spacing-probe-marker')) s.remove();
          });
      })
      .catch(() => {});
  }
}
