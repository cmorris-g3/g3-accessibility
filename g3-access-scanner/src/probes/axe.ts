import type { Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

// Best-practice rules we deliberately exclude. Either too FP-prone for typical
// WP themes (aria-allowed-role, presentation-role-conflict), narrower than
// our own deterministic probes (heading-order, page-has-heading-one,
// image-redundant-alt, skip-link), or too niche to add value.
const DISABLED_BEST_PRACTICE = [
  'accesskeys',
  'aria-allowed-role',
  'aria-conditional-attr',
  'aria-deprecated-role',
  'aria-text',
  'aria-treeitem-name',
  'empty-table-header',
  'frame-tested',
  'frame-title-unique',
  'heading-order',
  'image-redundant-alt',
  'label-title-only',
  'meta-viewport-large',
  'no-autoplay-audio',
  'page-has-heading-one',
  'presentation-role-conflict',
  'scope-attr-valid',
  'skip-link',
  'table-fake-caption',
  'td-has-header',
];

export async function runAxe(page: Page, ctx: PageContext): Promise<{ violations: number }> {
  // 'best-practice' is included to pull in the landmark-* family (region,
  // landmark-one-main, landmark-no-duplicate-*, landmark-*-is-top-level,
  // landmark-unique). Without it, axe-core won't run them — they're tagged
  // best-practice in axe rather than wcag, even though they map cleanly
  // to WCAG 1.3.1.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .disableRules(DISABLED_BEST_PRACTICE)
    .analyze();

  await writeJson(`${ctx.outDir}/axe.json`, results);

  return { violations: results.violations.length };
}
