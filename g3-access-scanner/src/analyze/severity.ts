import type { Finding, Severity } from '../types.js';

type SeverityResolver = (f: Finding) => Severity;

const BASE: Record<string, Severity> = {
  // alt-text
  'missing-alt': 'serious',
  'poor-alt': 'moderate',
  'redundant-alt': 'minor',
  'miscategorized-decorative': 'serious',
  'alt-describes-appearance': 'moderate',
  // link-text
  'empty-link': 'critical',
  'generic-link-text': 'serious',
  'poor-link-text': 'moderate',
  'redundant-link-text': 'minor',
  'label-in-name-mismatch': 'serious',
  // heading structure
  'no-h1': 'serious',
  'skipped-heading-level': 'moderate',
  'multiple-h1': 'minor',
  'empty-heading': 'moderate',
  // keyboard
  'keyboard-trap': 'critical',
  'no-focus-indicator': 'serious',
  'invisible-focus-indicator': 'serious',
  'focus-obscured': 'serious',
  'illogical-focus-order': 'moderate',
  'keyboard-walk-inconclusive': 'moderate',
  // contrast
  'contrast-below-aa-normal': 'serious',
  'contrast-below-aa-large': 'serious',
  'contrast-below-aaa': 'minor',
  'non-text-contrast-below-aa': 'moderate',
  // reflow / zoom
  'horizontal-scroll-at-400-zoom': 'serious',
  'content-clipped-at-400-zoom': 'serious',
  // text spacing
  'text-spacing-content-loss': 'serious',
  'text-spacing-not-responsive': 'minor',
  // target size
  'target-below-24px': 'serious',
  'target-below-44px': 'minor',
  // forms
  'missing-form-label': 'critical',
  'label-not-associated': 'serious',
  'required-field-not-announced': 'moderate',
  'missing-error-announcement': 'serious',
  'vague-error-message': 'moderate',
  'error-not-associated-with-field': 'serious',
  // motion / colors
  'motion-ignores-reduce-preference': 'serious',
  'content-lost-in-forced-colors': 'serious',
  // consistency
  'inconsistent-navigation': 'minor',
  'inconsistent-identification': 'minor',
  'inconsistent-help': 'minor',
  'missing-skip-link': 'serious',
  // sensory language
  'sensory-language-candidate': 'minor',
};

const AXE_IMPACT_TO_SEV: Record<string, Severity> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

const MODIFIERS: SeverityResolver[] = [
  // missing-alt in a link with no text siblings → critical
  (f) => {
    if (f.finding_type === 'missing-alt' && f.context?.in_link && !f.context?.link_text_siblings) {
      return 'critical';
    }
    return f.severity;
  },
  // miscategorized-decorative in a link with no text siblings → critical
  (f) => {
    if (
      f.finding_type === 'miscategorized-decorative' &&
      f.context?.in_link &&
      !f.context?.link_text_siblings
    ) {
      return 'critical';
    }
    return f.severity;
  },
  // generic-link-text in nav → moderate
  (f) => {
    if (f.finding_type === 'generic-link-text' && f.context?.in_nav) {
      return 'moderate';
    }
    return f.severity;
  },
  // redundant-link-text pointing to different destinations → moderate
  (f) => {
    if (f.finding_type === 'redundant-link-text' && f.context?.different_destinations) {
      return 'moderate';
    }
    return f.severity;
  },
  // inconsistent-navigation with >1 element changed OR order change → moderate
  (f) => {
    const elementsChanged = typeof f.context?.elements_changed === 'number' ? f.context.elements_changed : 0;
    if (
      (f.finding_type === 'inconsistent-navigation' ||
        f.finding_type === 'inconsistent-identification') &&
      elementsChanged > 1
    ) {
      return 'moderate';
    }
    if (f.finding_type === 'inconsistent-navigation' && f.context?.diff_type === 'order-change') {
      return 'moderate';
    }
    return f.severity;
  },
];

export function resolveSeverityForAxe(impact: string | null): Severity {
  return AXE_IMPACT_TO_SEV[impact ?? ''] ?? 'moderate';
}

export function resolveSeverity(f: Finding): { severity: Severity; unknown: boolean } {
  const base = BASE[f.finding_type];
  if (!base) {
    return { severity: 'moderate', unknown: true };
  }
  let severity: Severity = base;
  for (const mod of MODIFIERS) {
    const candidate = mod({ ...f, severity });
    if (candidate !== severity) {
      severity = candidate;
      break;
    }
  }
  return { severity, unknown: false };
}
