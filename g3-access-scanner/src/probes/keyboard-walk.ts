import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface FocusStep {
  step: number;
  selector: string;
  tag_name: string;
  role: string | null;
  accessible_name: string | null;
  bbox: { x: number; y: number; w: number; h: number };
  in_viewport: boolean;
  in_modal: boolean;
  focus_visible: boolean;
  matches_focus_visible: boolean;
  outer_html: string;
  focus_indicator: {
    outline_width: string;
    outline_style: string;
    outline_color: string;
    box_shadow: string;
    border_width: string;
    border_style: string;
    border_color: string;
    background_color: string;
    color: string;
  };
}

interface TrapEntry {
  step: number;
  selector: string;
  reason: string;
}

interface KeyboardWalkResult {
  total_focusable: number;
  max_steps: number;
  actual_steps: number;
  steps: FocusStep[];
  traps: TrapEntry[];
  invisible_focus: Array<{ step: number; selector: string }>;
  off_screen_focus: Array<{ step: number; selector: string }>;
  reached_body: boolean;
  hit_step_cap: boolean;
}

const KW_ID_ATTR = 'data-g3-kw-id';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]:not([disabled])',
  '[role="link"]',
  '[contenteditable="true"]',
].join(',');

export async function runKeyboardWalk(
  page: Page,
  ctx: PageContext,
): Promise<{ total_focusable: number; traps: number; invisible: number; off_screen: number }> {
  const focusableCount = await page.evaluate((sel) => {
    return document.querySelectorAll(sel).length;
  }, FOCUSABLE_SELECTOR);

  const maxSteps = Math.min(focusableCount * 3 + 50, 600);

  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    (document.body as HTMLElement).focus();
  });

  // Reset scroll to top before tabbing — earlier probes (images, contrast) leave the
  // page scrolled deep down via CDP-level scrollIntoViewIfNeeded, which window.scrollTo
  // cannot undo on sites where <body> has its own overflow context. Scrolling a known
  // top-of-document element into view via Playwright uses the same CDP path and works.
  try {
    const topHandle = await page.$('body > *:first-child');
    if (topHandle) {
      await topHandle.scrollIntoViewIfNeeded({ timeout: 1000 });
      await topHandle.dispose();
    }
  } catch {
    // Best-effort; if it fails, the keyboard walk still runs.
  }

  const steps: FocusStep[] = [];
  const traps: TrapEntry[] = [];
  const invisibleFocus: Array<{ step: number; selector: string }> = [];
  const offScreenFocus: Array<{ step: number; selector: string }> = [];

  const seenIds = new Map<string, number>();
  let lastId: string | null = null;
  let consecutiveSame = 0;
  let reachedBody = false;
  let trapped = false;

  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('Tab');

    // Mimic native browser behavior: scroll the focused element into view.
    // JS el.scrollIntoView() can't escape overflow:hidden ancestors on some sites,
    // so use Playwright's CDP-based scrollIntoViewIfNeeded via a kw_id selector.
    await ensureFocusInView(page);

    const info = await gatherFocusInfo(page);

    if (!info) {
      reachedBody = true;
      if (seenIds.size > 0) break;
      continue;
    }

    steps.push({
      step: i + 1,
      selector: info.selector,
      tag_name: info.tag_name,
      role: info.role,
      accessible_name: info.accessible_name,
      bbox: info.bbox,
      in_viewport: info.in_viewport,
      in_modal: info.in_modal,
      focus_visible: info.focus_visible,
      matches_focus_visible: info.matches_focus_visible,
      outer_html: info.outer_html,
      focus_indicator: info.focus_indicator,
    });

    if (!info.focus_visible && !info.is_sr_only) {
      invisibleFocus.push({ step: i + 1, selector: info.selector });
    }
    if (!info.in_viewport && !info.is_sr_only) {
      offScreenFocus.push({ step: i + 1, selector: info.selector });
    }

    if (info.kw_id === lastId) {
      consecutiveSame++;
      if (consecutiveSame >= 2 && !info.in_modal) {
        traps.push({
          step: i + 1,
          selector: info.selector,
          reason: 'Tab did not move focus — same element focused 3 consecutive times.',
        });
        trapped = true;
        break;
      }
    } else {
      consecutiveSame = 0;
    }
    lastId = info.kw_id;

    const previousStep = seenIds.get(info.kw_id);
    if (previousStep !== undefined && !info.in_modal) {
      const isExpectedCycle = i >= focusableCount - 2;
      if (!isExpectedCycle) {
        traps.push({
          step: i + 1,
          selector: info.selector,
          reason: `Focus cycled back to step ${previousStep} before completing one full Tab sequence (expected ~${focusableCount} steps).`,
        });
        trapped = true;
        break;
      }
      break;
    }
    seenIds.set(info.kw_id, i + 1);
  }

  await cleanupKwTags(page);

  const hitStepCap = steps.length >= maxSteps && !trapped && !reachedBody;

  const result: KeyboardWalkResult = {
    total_focusable: focusableCount,
    max_steps: maxSteps,
    actual_steps: steps.length,
    steps,
    traps,
    invisible_focus: invisibleFocus,
    off_screen_focus: offScreenFocus,
    reached_body: reachedBody && !trapped,
    hit_step_cap: hitStepCap,
  };

  await writeJson(`${ctx.outDir}/keyboard-walk.json`, result);

  return {
    total_focusable: focusableCount,
    traps: traps.length,
    invisible: invisibleFocus.length,
    off_screen: offScreenFocus.length,
  };
}

async function ensureFocusInView(page: Page): Promise<void> {
  try {
    const kwId = await page.evaluate((attr) => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body || a === document.documentElement) return null;
      let id = a.getAttribute(attr);
      if (!id) {
        id = `kw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        a.setAttribute(attr, id);
      }
      return id;
    }, KW_ID_ATTR);
    if (!kwId) return;
    const handle = await page.$(`[${KW_ID_ATTR}="${kwId}"]`);
    if (!handle) return;
    try {
      await handle.scrollIntoViewIfNeeded({ timeout: 500 });
    } catch {
      // Element may be unreachable, fixed-positioned, or in an overflow:hidden
      // container with no scrollable ancestor. Ignore — gather will still record.
    } finally {
      await handle.dispose();
    }
  } catch {
    // Best-effort
  }
}

async function cleanupKwTags(page: Page): Promise<void> {
  try {
    await page.evaluate((attr) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }, KW_ID_ATTR);
  } catch {
    // Page closed/navigated — safe to ignore
  }
}

async function gatherFocusInfo(page: Page): Promise<
  | {
      kw_id: string;
      selector: string;
      tag_name: string;
      role: string | null;
      accessible_name: string | null;
      bbox: { x: number; y: number; w: number; h: number };
      in_viewport: boolean;
      in_modal: boolean;
      is_sr_only: boolean;
      focus_visible: boolean;
      matches_focus_visible: boolean;
      outer_html: string;
      focus_indicator: FocusStep['focus_indicator'];
    }
  | null
> {
  return page.evaluate((KW_ID_ATTR) => {
    let active: Element | null = document.activeElement;
    while (
      active &&
      'shadowRoot' in active &&
      (active as Element & { shadowRoot: ShadowRoot | null }).shadowRoot &&
      (active as Element & { shadowRoot: ShadowRoot }).shadowRoot.activeElement
    ) {
      active = (active as Element & { shadowRoot: ShadowRoot }).shadowRoot.activeElement;
    }
    if (!active || active === document.body || active === document.documentElement) {
      return null;
    }

    const el = active as HTMLElement;

    let kwId = el.getAttribute(KW_ID_ATTR);
    if (!kwId) {
      kwId = `kw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      el.setAttribute(KW_ID_ATTR, kwId);
    }
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const inViewport =
      rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;

    const outlineWidth = cs.outlineWidth;
    const outlineStyle = cs.outlineStyle;
    const outlineColor = cs.outlineColor;
    const boxShadow = cs.boxShadow;
    const borderWidth = cs.borderWidth;
    const borderStyle = cs.borderStyle;
    const borderColor = cs.borderColor;
    const backgroundColor = cs.backgroundColor;
    const color = cs.color;

    const isTransparent = (c: string) =>
      c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || /rgba\([^,]+,[^,]+,[^,]+,\s*0\)/.test(c);

    const outlinePx = parseFloat(outlineWidth);
    const hasOutline =
      !isNaN(outlinePx) &&
      outlinePx > 0 &&
      outlineStyle !== 'none' &&
      !isTransparent(outlineColor);
    const hasBoxShadow = boxShadow !== 'none' && boxShadow.trim().length > 0;
    const borderPx = parseFloat(borderWidth);
    const hasBorder =
      !isNaN(borderPx) && borderPx > 0 && borderStyle !== 'none' && !isTransparent(borderColor);

    let matchesFocusVisible = false;
    try {
      matchesFocusVisible = el.matches(':focus-visible');
    } catch {
      matchesFocusVisible = false;
    }

    const focusVisible = hasOutline || hasBoxShadow || hasBorder || matchesFocusVisible;

    const modal = el.closest('[aria-modal="true"], [role="dialog"][aria-modal="true"]');
    const inModal = modal !== null;

    const isSrOnly =
      (rect.width <= 4 && rect.height <= 4) ||
      /(^|\s)(sr-only|screen-reader-only|visually-hidden|av-screen-reader-only|g3-skip-link)(\s|$)/.test(
        el.className || '',
      );

    let selector: string;
    if (el.id) {
      selector = `#${CSS.escape(el.id)}`;
    } else {
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList)
        .filter((c) => !/^[0-9]/.test(c))
        .slice(0, 2)
        .map((c) => CSS.escape(c));
      selector = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
    }

    const ariaLabel = el.getAttribute('aria-label');
    const textContent = (el.textContent ?? '').trim().slice(0, 80);
    const accessibleName = ariaLabel ?? (textContent.length > 0 ? textContent : null);

    return {
      kw_id: kwId,
      selector,
      tag_name: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      accessible_name: accessibleName,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      in_viewport: inViewport,
      in_modal: inModal,
      is_sr_only: isSrOnly,
      focus_visible: focusVisible,
      matches_focus_visible: matchesFocusVisible,
      outer_html: (el.outerHTML ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
      focus_indicator: {
        outline_width: outlineWidth,
        outline_style: outlineStyle,
        outline_color: outlineColor,
        box_shadow: boxShadow,
        border_width: borderWidth,
        border_style: borderStyle,
        border_color: borderColor,
        background_color: backgroundColor,
        color: color,
      },
    };
  }, KW_ID_ATTR);
}
