import type { Page } from 'playwright';
import { writeJson, ensureDir } from '../lib/fs.js';
import type { PageContext } from '../types.js';

const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 256;
const OVERFLOW_TOLERANCE = 2;

interface ReflowRegion {
  selector: string;
  scroll_width: number;
  client_width: number;
  overflow_by: number;
  is_allowed_content: boolean;
}

interface ReflowResult {
  viewport: { w: number; h: number };
  html_scroll_width: number;
  horizontal_scroll_required: boolean;
  regions_overflowing: ReflowRegion[];
  allowed_content_overflows: number;
  screenshot: string;
}

export async function runReflow(
  page: Page,
  ctx: PageContext,
): Promise<{ horizontal_scroll: boolean; region_count: number }> {
  const originalViewport = page.viewportSize();

  try {
    await page.setViewportSize({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT });
    await page.waitForTimeout(500);

    const data = await page.evaluate(
      ({ REFLOW_WIDTH, OVERFLOW_TOLERANCE }) => {
        const htmlScrollWidth = document.documentElement.scrollWidth;

        const regionSelectors = [
          'main',
          '[role="main"]',
          'article',
          'section',
          '.content',
          '#main',
          '#content',
          'header',
          'nav',
          'footer',
        ];
        const allowedPatterns = ['table', 'pre', 'code', 'iframe', '[role="img"]'];

        const seen = new Set<Element>();
        const overflowing: Array<{
          selector: string;
          scroll_width: number;
          client_width: number;
          overflow_by: number;
          is_allowed_content: boolean;
        }> = [];

        for (const sel of regionSelectors) {
          document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
            if (seen.has(el)) return;
            seen.add(el);
            const scrollW = el.scrollWidth;
            const clientW = el.clientWidth;
            if (scrollW > clientW + OVERFLOW_TOLERANCE && scrollW > REFLOW_WIDTH) {
              const isAllowed = allowedPatterns.some((p) => el.matches(p) || el.querySelector(p));
              overflowing.push({
                selector: buildSelector(el),
                scroll_width: scrollW,
                client_width: clientW,
                overflow_by: scrollW - clientW,
                is_allowed_content: isAllowed,
              });
            }
          });
        }

        return {
          html_scroll_width: htmlScrollWidth,
          horizontal_scroll_required: htmlScrollWidth > REFLOW_WIDTH + OVERFLOW_TOLERANCE,
          overflowing,
        };

        function buildSelector(el: Element): string {
          if (el.id) return `#${CSS.escape(el.id)}`;
          const tag = el.tagName.toLowerCase();
          const classes = Array.from(el.classList)
            .filter((c) => !/^[0-9]/.test(c))
            .slice(0, 2)
            .map((c) => CSS.escape(c));
          return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
        }
      },
      { REFLOW_WIDTH, OVERFLOW_TOLERANCE },
    );

    const screenshotPath = 'screenshots/zoom-400.png';
    await ensureDir(`${ctx.outDir}/screenshots`);
    await page.screenshot({
      path: `${ctx.outDir}/${screenshotPath}`,
      fullPage: false,
    });

    const result: ReflowResult = {
      viewport: { w: REFLOW_WIDTH, h: REFLOW_HEIGHT },
      html_scroll_width: data.html_scroll_width,
      horizontal_scroll_required: data.horizontal_scroll_required,
      regions_overflowing: data.overflowing.filter((r) => !r.is_allowed_content),
      allowed_content_overflows: data.overflowing.filter((r) => r.is_allowed_content).length,
      screenshot: screenshotPath,
    };

    await writeJson(`${ctx.outDir}/reflow.json`, result);

    return {
      horizontal_scroll: result.horizontal_scroll_required,
      region_count: result.regions_overflowing.length,
    };
  } finally {
    if (originalViewport) {
      await page.setViewportSize(originalViewport);
      await page.waitForTimeout(300);
    }
  }
}
