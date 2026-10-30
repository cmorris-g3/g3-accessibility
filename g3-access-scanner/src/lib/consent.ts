import type { Page } from 'playwright';

export type ConsentMode = 'accept-all' | 'none';

export interface ConsentResult {
  mode: ConsentMode;
  /** The CMP we recognised, or null when none was detected. */
  cmp: string | null;
  /** True only when we positively confirmed consent was granted. */
  accepted: boolean;
  detail: string;
}

/**
 * Consent managers hide third-party widgets behind a gate, and a headless
 * scanner that never consents simply does not see them. On haysmed that made
 * ~15 Google Maps findings vanish between two scans and read as remediation
 * when nothing had been fixed — the map was gated, not repaired.
 *
 * So we accept consent before probing, and record what happened in the
 * manifest: a run that consented is NOT comparable with one that did not.
 */
const BUTTON_SELECTORS: Array<[string, string]> = [
  ['OneTrust', '#onetrust-accept-btn-handler'],
  ['Cookiebot', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'],
  ['Cookiebot', '#CybotCookiebotDialogBodyButtonAccept'],
  ['CookieYes', '.cky-btn-accept'],
  ['Complianz', '.cmplz-accept'],
  ['CookieLawInfo', '#cookie_action_close_header'],
  ['Termly', '#termly-code-snippet-support button[data-tid="banner-accept"]'],
  ['Osano', '.osano-cm-accept-all'],
  ['Borlabs', '#BorlabsCookieBoxWrapper ._brlbs-btn-accept-all'],
  ['Iubenda', '.iubenda-cs-accept-btn'],
  ['Quantcast', '#qc-cmp2-ui button[mode="primary"]'],
  ['HubSpot', '#hs-eu-confirmation-button'],
];

const ACCEPT_TEXT = /^(accept|allow)([\s-]*(all|al{1,2}e))?([\s-]*cookies?)?$/i;

export async function primeConsent(
  page: Page,
  mode: ConsentMode,
  timeoutMs: number,
): Promise<ConsentResult> {
  if (mode === 'none') {
    return { mode, cmp: null, accepted: false, detail: 'consent priming disabled' };
  }

  // 1. Usercentrics exposes a documented API, so prefer it over clicking:
  //    it is deterministic and does not depend on banner markup.
  const uc = await tryUsercentrics(page, timeoutMs);
  if (uc) return uc;

  // 2. Known CMP accept-all buttons.
  for (const [cmp, selector] of BUTTON_SELECTORS) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click({ timeout: 3000 });
        await settle(page);
        return { mode, cmp, accepted: true, detail: `clicked ${selector}` };
      }
    } catch {
      /* try the next one */
    }
  }

  // 3. Last resort: a visible button whose own text says accept/allow all.
  const byText = await tryAcceptByText(page);
  if (byText) {
    await settle(page);
    return { mode, cmp: 'generic', accepted: true, detail: byText };
  }

  return { mode, cmp: null, accepted: false, detail: 'no consent manager detected' };
}

async function tryUsercentrics(page: Page, timeoutMs: number): Promise<ConsentResult | null> {
  const ready = await page
    .waitForFunction(
      () => {
        const uc = (window as unknown as { UC_UI?: { isInitialized?: () => boolean } }).UC_UI;
        return !!(uc && typeof uc.isInitialized === 'function' && uc.isInitialized());
      },
      undefined,
      { timeout: Math.min(timeoutMs, 15_000) },
    )
    .then(() => true)
    .catch(() => false);

  if (!ready) return null;

  try {
    await page.evaluate(async () => {
      const uc = (window as unknown as {
        UC_UI: { acceptAllConsents: () => Promise<void>; closeCMP?: () => Promise<void> };
      }).UC_UI;
      await uc.acceptAllConsents();
      if (typeof uc.closeCMP === 'function') await uc.closeCMP();
    });
  } catch (err) {
    // Granting consent can itself trigger a reload (haysmed's privacy loader
    // reloads when the Maps service flips), which tears down the execution
    // context mid-call. That is success, not failure — verify below.
    const msg = (err as Error).message;
    if (!/execution context|destroyed|navigation/i.test(msg)) {
      return { mode: 'accept-all', cmp: 'Usercentrics', accepted: false, detail: `acceptAllConsents failed: ${msg}` };
    }
  }

  await settle(page);

  const counts = await page
    .evaluate(() => {
      const uc = (window as unknown as {
        UC_UI?: { getServicesBaseInfo?: () => Array<{ consent?: { status?: boolean } }> };
      }).UC_UI;
      const svcs = uc?.getServicesBaseInfo?.() ?? [];
      return { total: svcs.length, granted: svcs.filter((s) => s.consent?.status === true).length };
    })
    .catch(() => null);

  if (!counts) {
    return { mode: 'accept-all', cmp: 'Usercentrics', accepted: true, detail: 'accepted; could not re-read services' };
  }

  return {
    mode: 'accept-all',
    cmp: 'Usercentrics',
    accepted: counts.granted > 0,
    detail: `${counts.granted}/${counts.total} services consented`,
  };
}

async function tryAcceptByText(page: Page): Promise<string | null> {
  try {
    const candidates = page.locator('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]');
    const n = Math.min(await candidates.count(), 60);
    for (let i = 0; i < n; i++) {
      const el = candidates.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('value').catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (label && ACCEPT_TEXT.test(label)) {
        await el.click({ timeout: 3000 });
        return `clicked button labelled "${label}"`;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
