import type { Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

export async function runAxe(page: Page, ctx: PageContext): Promise<{ violations: number }> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  await writeJson(`${ctx.outDir}/axe.json`, results);

  return { violations: results.violations.length };
}
