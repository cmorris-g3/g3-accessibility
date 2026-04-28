import { createHash } from 'node:crypto';
import type { Finding } from '../types.js';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    parsed.search = '';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}`;
  } catch {
    return u;
  }
}

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSelector(sel: string | null | undefined): string {
  if (!sel) return '';
  return sel.replace(/\s+/g, ' ').trim();
}

function ctxStr(ctx: Record<string, unknown> | undefined, key: string): string {
  if (!ctx) return '';
  const v = ctx[key];
  if (v === null || v === undefined) return '';
  return String(v);
}

export function computeFingerprint(f: Finding): string {
  const url = normalizeUrl(f.url);
  const type = f.finding_type;
  const ctx = f.context;
  let parts: string[];

  switch (type) {
    case 'missing-alt':
    case 'miscategorized-decorative':
    case 'alt-describes-appearance':
    case 'redundant-alt':
      parts = [type, url, ctxStr(ctx, 'src')];
      break;

    case 'empty-link':
    case 'generic-link-text':
    case 'redundant-link-text':
    case 'label-in-name-mismatch':
      parts = [type, url, ctxStr(ctx, 'href')];
      break;

    case 'no-h1':
    case 'multiple-h1':
    case 'horizontal-scroll-at-400-zoom':
    case 'text-spacing-not-responsive':
    case 'keyboard-walk-inconclusive':
    case 'missing-skip-link':
      parts = [type, url];
      break;

    case 'skipped-heading-level':
      parts = [type, url, ctxStr(ctx, 'from'), ctxStr(ctx, 'to'), normalizeSelector(f.target)];
      break;

    case 'empty-heading':
      parts = [type, url, normalizeSelector(f.target)];
      break;

    case 'contrast-below-aa-large':
    case 'contrast-below-aa-normal':
      parts = [type, url, normalizeSelector(f.target), normalizeText(ctxStr(ctx, 'text_sample'))];
      break;

    case 'target-below-24px': {
      const accName = normalizeText(ctxStr(ctx, 'accessible_name'));
      parts = [type, url, normalizeSelector(f.target), accName];
      break;
    }

    case 'sensory-language-candidate':
      parts = [type, url, ctxStr(ctx, 'pattern'), normalizeText(ctxStr(ctx, 'matched'))];
      break;

    case 'inconsistent-navigation':
    case 'inconsistent-help':
      parts = [type, url, ctxStr(ctx, 'diff_type')];
      break;

    case 'keyboard-trap':
    case 'invisible-focus-indicator':
    case 'focus-obscured':
    case 'content-clipped-at-400-zoom':
    case 'text-spacing-content-loss':
    case 'motion-ignores-reduce-preference':
      parts = [type, url, normalizeSelector(f.target)];
      break;

    default:
      parts = [type, url, normalizeSelector(f.target)];
      break;
  }

  return sha256(parts.join('|'));
}

export function attachFingerprints(findings: Finding[]): void {
  for (const f of findings) {
    f.fingerprint = computeFingerprint(f);
  }
}
