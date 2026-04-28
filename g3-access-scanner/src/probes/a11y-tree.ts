import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

export async function runA11yTree(page: Page, ctx: PageContext): Promise<void> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Accessibility.enable');
    const result = await client.send('Accessibility.getFullAXTree');
    await writeJson(`${ctx.outDir}/a11y-tree.json`, result);
  } finally {
    await client.detach();
  }
}
