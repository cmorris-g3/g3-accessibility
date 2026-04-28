import type { Page, ElementHandle } from 'playwright';
import { PNG } from 'pngjs';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

const PROBE_ATTR = 'data-g3-contrast-probe';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface DomTextElement {
  index: number;
  selector: string;
  css_path: string;
  outer_html: string;
  text_sample: string;
  bbox: { x: number; y: number; w: number; h: number };
  font_size_px: number;
  font_weight: number;
  size_class: 'normal' | 'large';
  declared_color: Rgba;
  declared_background: Rgba | null;
  background_has_image: boolean;
}

interface ContrastEntry {
  selector: string;
  css_path: string;
  outer_html: string;
  text_sample: string;
  font_size_px: number;
  font_weight: number;
  size_class: 'normal' | 'large';
  foreground_hex: string;
  background_hex: string | null;
  ratio: number | null;
  required: number;
  passes: boolean | null;
  method: 'declared' | 'pixel-sampled' | 'unable';
  background_has_image: boolean;
  bbox: { x: number; y: number; w: number; h: number };
}

const MAX_PIXEL_SAMPLES = 40;

export async function runContrast(
  page: Page,
  ctx: PageContext,
): Promise<{ failures: number; evaluated: number }> {
  const elements = await collectTextElements(page);
  const entries: ContrastEntry[] = [];

  for (const el of elements) {
    const required = el.size_class === 'large' ? 3.0 : 4.5;
    const fgHex = hexFromRgba(el.declared_color);

    if (el.declared_background && !el.background_has_image) {
      const ratio = contrastRatio(el.declared_color, el.declared_background);
      entries.push(
        buildEntry(el, fgHex, hexFromRgba(el.declared_background), roundTo(ratio, 2), required, ratio + 0.005 >= required, 'declared'),
      );
      continue;
    }

    const pixelRatio = await samplePixelsViaHandle(page, el);
    if (pixelRatio) {
      entries.push(
        buildEntry(el, fgHex, hexFromRgba(pixelRatio.background), roundTo(pixelRatio.ratio, 2), required, pixelRatio.ratio + 0.005 >= required, 'pixel-sampled'),
      );
    } else {
      entries.push(buildEntry(el, fgHex, null, null, required, null, 'unable'));
    }
  }

  await cleanupProbeTags(page);
  await writeJson(`${ctx.outDir}/contrast.json`, entries);
  const failures = entries.filter((e) => e.passes === false).length;
  return { failures, evaluated: entries.length };
}

function buildEntry(
  el: DomTextElement,
  fgHex: string,
  bgHex: string | null,
  ratio: number | null,
  required: number,
  passes: boolean | null,
  method: 'declared' | 'pixel-sampled' | 'unable',
): ContrastEntry {
  return {
    selector: el.selector,
    css_path: el.css_path,
    outer_html: el.outer_html,
    text_sample: el.text_sample,
    font_size_px: el.font_size_px,
    font_weight: el.font_weight,
    size_class: el.size_class,
    foreground_hex: fgHex,
    background_hex: bgHex,
    ratio,
    required,
    passes,
    method,
    background_has_image: el.background_has_image,
    bbox: el.bbox,
  };
}

async function collectTextElements(page: Page): Promise<DomTextElement[]> {
  return page.evaluate((PROBE_ATTR) => {
    const TAGS = 'p,h1,h2,h3,h4,h5,h6,a,button,span,li,td,th,label,dd,dt,blockquote,figcaption,caption,summary,legend';
    const result: DomTextElement[] = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(TAGS));

    let idx = 0;
    for (const el of nodes) {
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (directText.length < 2) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;

      const colorRgba = parseColorString(cs.color);
      if (!colorRgba || colorRgba.a === 0) continue;

      const fontSizePx = parseFloat(cs.fontSize);
      const fontWeight = parseInt(cs.fontWeight, 10) || 400;
      const isLarge =
        fontSizePx >= 24 ||
        (fontSizePx >= 18.66 && fontWeight >= 700);

      const bg = resolveEffectiveBackground(el);

      const capturedHtml = (el.outerHTML ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
      el.setAttribute(PROBE_ATTR, String(idx));

      result.push({
        index: idx++,
        selector: buildSelector(el),
        css_path: buildCssPath(el),
        outer_html: capturedHtml,
        text_sample: directText.slice(0, 80),
        bbox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        font_size_px: fontSizePx,
        font_weight: fontWeight,
        size_class: isLarge ? 'large' : 'normal',
        declared_color: colorRgba,
        declared_background: bg.color,
        background_has_image: bg.hasImage,
      });
    }

    return result;

    function parseColorString(raw: string): Rgba | null {
      const m = raw.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.length < 3) return null;
      return {
        r: Math.round(parts[0]),
        g: Math.round(parts[1]),
        b: Math.round(parts[2]),
        a: parts.length >= 4 ? parts[3] : 1,
      };
    }

    function resolveEffectiveBackground(el: HTMLElement): { color: Rgba | null; hasImage: boolean } {
      let cur: HTMLElement | null = el;
      let hasImage = false;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          hasImage = true;
        }
        const bg = parseColorString(cs.backgroundColor);
        if (bg && bg.a > 0) {
          if (bg.a < 1) {
            cur = cur.parentElement;
            continue;
          }
          return { color: bg, hasImage };
        }
        cur = cur.parentElement;
      }
      return { color: { r: 255, g: 255, b: 255, a: 1 }, hasImage };
    }

    function buildSelector(el: Element): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).filter((c) => !/^[0-9]/.test(c)).slice(0, 2);
      if (classes.length > 0) return `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`;
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
  }, PROBE_ATTR);
}

async function cleanupProbeTags(page: Page): Promise<void> {
  try {
    await page.evaluate((attr) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }, PROBE_ATTR);
  } catch {
    // Page may have navigated or closed; harmless
  }
}

async function samplePixelsViaHandle(
  page: Page,
  el: DomTextElement,
): Promise<{ ratio: number; background: Rgba } | null> {
  let handle: ElementHandle<Element> | null = null;
  try {
    handle = await page.$(`[${PROBE_ATTR}="${el.index}"]`);
    if (!handle) return null;
    await handle.scrollIntoViewIfNeeded({ timeout: 2000 });
    const buf = await handle.screenshot({ type: 'png', timeout: 3000 });
    const png = PNG.sync.read(buf);
    return analyzePixels(png, el.declared_color);
  } catch {
    return null;
  } finally {
    if (handle) await handle.dispose();
  }
}

function analyzePixels(png: PNG, fg: Rgba): { ratio: number; background: Rgba } | null {
  const data = png.data;
  const width = png.width;
  const height = png.height;

  const samples: Array<{ r: number; g: number; b: number; distanceToFg: number }> = [];
  const stepX = Math.max(1, Math.floor(width / 30));
  const stepY = Math.max(1, Math.floor(height / 10));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const dist = colorDistance({ r, g, b }, fg);
      samples.push({ r, g, b, distanceToFg: dist });
    }
  }
  if (samples.length < 20) return null;

  samples.sort((a, b) => a.distanceToFg - b.distanceToFg);
  const fgSamples = samples.slice(0, Math.min(MAX_PIXEL_SAMPLES, Math.floor(samples.length * 0.2)));
  const bgSamples = samples.slice(-Math.min(MAX_PIXEL_SAMPLES, Math.floor(samples.length * 0.5)));

  if (bgSamples.length < 5) return null;

  const bgMean = meanColor(bgSamples);
  const ratio = contrastRatio(fg, bgMean);
  return { ratio, background: { ...bgMean, a: 1 } };
}

function meanColor(samples: Array<{ r: number; g: number; b: number }>): {
  r: number;
  g: number;
  b: number;
} {
  const n = samples.length;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const s of samples) {
    r += s.r;
    g += s.g;
    b += s.b;
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexFromRgba(c: Rgba): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
