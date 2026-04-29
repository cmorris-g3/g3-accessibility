import type { Finding, Manifest, Severity } from '../types.js';
import type { WorkItem } from './roadmap.js';

// ---------------------------------------------------------------------------
// Top 10 selection — implements the formula in client-onboarding.md:
//
//   score = (impact × visibility) / time_minutes
//
//   impact     = WCAG severity numeric × reach multiplier × task-blocking bonus
//   visibility = 1 (invisible to non-AT) → 3 (visually obvious)
//   time       = minutes to complete the work item, sized for the
//                3-hour agency remediation budget (5–60 min per item)
//
// Selection is greedy-fill against a 180-minute budget, max 10 items, with
// tie-breaks (when scores are equal) for legal-risk-four membership and
// category diversity. Items are excluded when:
//   - owner is 'vendor' (theme/vendor-upstream — out of scope per spec)
//   - finding type has no time estimate (can't budget — manual review only)
// ---------------------------------------------------------------------------

const SEVERITY_IMPACT: Record<Severity, number> = {
  critical: 10,
  serious: 7,
  moderate: 4,
  minor: 2,
};

// Visibility: how obvious the before/after is.
//   3 = visually obvious to anyone (contrast, layout, focus rings)
//   2 = noticeable to most users (link text, headings, motion)
//   1 = invisible to non-AT users (alt text, ARIA, semantic markup)
const VISIBILITY: Record<string, number> = {
  // 3
  'contrast-below-aa-normal': 3,
  'contrast-below-aa-large': 3,
  'no-focus-indicator': 3,
  'invisible-focus-indicator': 3,
  'horizontal-scroll-at-400-zoom': 3,
  'content-clipped-at-400-zoom': 3,
  'target-below-24px': 3,
  'motion-ignores-reduce-preference': 3,
  // 2
  'non-text-contrast-below-aa': 2,
  'contrast-below-aaa': 2,
  'target-below-44px': 2,
  'no-h1': 2,
  'multiple-h1': 2,
  'redundant-link-text': 2,
  'generic-link-text': 2,
  'poor-link-text': 2,
  'sensory-language-candidate': 2,
  'text-spacing-content-loss': 2,
  'keyboard-trap': 2,
  // 1
  'missing-alt': 1,
  'poor-alt': 1,
  'redundant-alt': 1,
  'miscategorized-decorative': 1,
  'alt-describes-appearance': 1,
  'empty-link': 1,
  'label-in-name-mismatch': 1,
  'skipped-heading-level': 1,
  'empty-heading': 1,
  'missing-form-label': 1,
  'label-not-associated': 1,
  'required-field-not-announced': 1,
  'missing-error-announcement': 1,
  'vague-error-message': 1,
  'error-not-associated-with-field': 1,
  'illogical-focus-order': 1,
  'focus-obscured': 1,
  'keyboard-walk-inconclusive': 1,
  'text-spacing-not-responsive': 1,
  'content-lost-in-forced-colors': 1,
  'inconsistent-navigation': 1,
  'inconsistent-identification': 1,
  'inconsistent-help': 1,
  'missing-skip-link': 1,
};

// Time in minutes to complete the work item. Sized for a competent dev who
// already has the audit findings + suggested fix in front of them. These are
// distinct from the analyzer's effort_base (XS/S/M/L), which scopes the broader
// roadmap engagement, not the agency's 3-hour hands-on remediation window.
const TIME_MINUTES: Record<string, number> = {
  // 5–15 min: setting toggles, single-rule CSS additions
  'motion-ignores-reduce-preference': 10,
  'target-below-24px': 15,
  'target-below-44px': 15,
  'text-spacing-not-responsive': 15,
  'redundant-alt': 15,
  'no-h1': 15,
  'multiple-h1': 15,
  'sensory-language-candidate': 15,
  'contrast-below-aaa': 15,
  'empty-heading': 15,
  // 20–30 min: per-template tweaks, color variable swaps, single missing element
  'contrast-below-aa-large': 20,
  'no-focus-indicator': 20,
  'invisible-focus-indicator': 20,
  'non-text-contrast-below-aa': 20,
  'contrast-below-aa-normal': 30,
  'missing-skip-link': 30,
  'missing-alt': 30,
  'poor-alt': 30,
  'miscategorized-decorative': 30,
  'alt-describes-appearance': 30,
  'empty-link': 30,
  'label-in-name-mismatch': 30,
  'skipped-heading-level': 30,
  'empty-link-name': 30,
  'missing-form-label': 30,
  'label-not-associated': 30,
  'required-field-not-announced': 30,
  'vague-error-message': 30,
  'inconsistent-identification': 30,
  'inconsistent-help': 30,
  // 45–60 min: code spanning multiple templates or coordinated changes
  'generic-link-text': 45,
  'poor-link-text': 45,
  'missing-error-announcement': 45,
  'error-not-associated-with-field': 45,
  'focus-obscured': 45,
  'redundant-link-text': 60,
  'horizontal-scroll-at-400-zoom': 60,
  'content-clipped-at-400-zoom': 60,
  'text-spacing-content-loss': 60,
  'content-lost-in-forced-colors': 60,
  'illogical-focus-order': 60,
  'keyboard-trap': 60,
  'inconsistent-navigation': 60,
  // 0 = exclude (no automated fix path; manual reviewer territory)
  'keyboard-walk-inconclusive': 0,
};

// Items that block users from completing tasks get a 1.5× impact bonus.
const TASK_BLOCKING: ReadonlySet<string> = new Set([
  'empty-link',
  'keyboard-trap',
  'missing-form-label',
  'label-not-associated',
  'no-focus-indicator',
  'invisible-focus-indicator',
  'focus-obscured',
  'illogical-focus-order',
  'horizontal-scroll-at-400-zoom',
  'content-clipped-at-400-zoom',
  'missing-error-announcement',
  'error-not-associated-with-field',
]);

export type Category =
  | 'alt'
  | 'contrast'
  | 'keyboard'
  | 'labels'
  | 'headings'
  | 'links'
  | 'targets'
  | 'reflow'
  | 'motion'
  | 'consistency'
  | 'other';

const CATEGORY_OF: Record<string, Category> = {
  'missing-alt': 'alt',
  'poor-alt': 'alt',
  'redundant-alt': 'alt',
  'miscategorized-decorative': 'alt',
  'alt-describes-appearance': 'alt',
  'contrast-below-aa-normal': 'contrast',
  'contrast-below-aa-large': 'contrast',
  'contrast-below-aaa': 'contrast',
  'non-text-contrast-below-aa': 'contrast',
  'keyboard-trap': 'keyboard',
  'no-focus-indicator': 'keyboard',
  'invisible-focus-indicator': 'keyboard',
  'focus-obscured': 'keyboard',
  'illogical-focus-order': 'keyboard',
  'keyboard-walk-inconclusive': 'keyboard',
  'missing-skip-link': 'keyboard',
  'missing-form-label': 'labels',
  'label-not-associated': 'labels',
  'required-field-not-announced': 'labels',
  'missing-error-announcement': 'labels',
  'vague-error-message': 'labels',
  'error-not-associated-with-field': 'labels',
  'label-in-name-mismatch': 'labels',
  'no-h1': 'headings',
  'multiple-h1': 'headings',
  'empty-heading': 'headings',
  'skipped-heading-level': 'headings',
  'empty-link': 'links',
  'generic-link-text': 'links',
  'poor-link-text': 'links',
  'redundant-link-text': 'links',
  'sensory-language-candidate': 'links',
  'target-below-24px': 'targets',
  'target-below-44px': 'targets',
  'horizontal-scroll-at-400-zoom': 'reflow',
  'content-clipped-at-400-zoom': 'reflow',
  'text-spacing-content-loss': 'reflow',
  'text-spacing-not-responsive': 'reflow',
  'motion-ignores-reduce-preference': 'motion',
  'content-lost-in-forced-colors': 'motion',
  'inconsistent-navigation': 'consistency',
  'inconsistent-identification': 'consistency',
  'inconsistent-help': 'consistency',
};

const LEGAL_RISK_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['alt', 'contrast', 'keyboard', 'labels']);

const TIME_BUDGET_MINUTES = 180;
const MAX_ITEMS = 10;

export interface TopTenItem {
  rank: number;
  workItem: WorkItem;
  category: Category;
  timeMinutes: number;
}

interface ScoredItem {
  workItem: WorkItem;
  score: number;
  timeMinutes: number;
  category: Category;
  legalRisk: boolean;
}

export function selectTopTen(workItems: WorkItem[], totalPages: number): TopTenItem[] {
  const scored: ScoredItem[] = [];

  for (const wi of workItems) {
    if (wi.owner === 'vendor') continue;

    const sampleType = wi.finding_types[0];
    if (!sampleType) continue;

    const time = TIME_MINUTES[sampleType];
    if (time === undefined || time === 0) continue;

    const sampleFinding: Finding | undefined = wi.findings[0];
    const severity = sampleFinding?.severity ?? 'minor';
    const sevImpact = SEVERITY_IMPACT[severity];

    const reachRatio = totalPages > 0 ? Math.min(1, wi.pages_affected / totalPages) : 0;
    const reachMultiplier = 1 + reachRatio;
    const taskBlockingMultiplier = TASK_BLOCKING.has(sampleType) ? 1.5 : 1;
    const impact = sevImpact * reachMultiplier * taskBlockingMultiplier;

    const visibility = VISIBILITY[sampleType] ?? 1;
    const score = (impact * visibility) / time;

    const category = CATEGORY_OF[sampleType] ?? 'other';
    const legalRisk = LEGAL_RISK_CATEGORIES.has(category);

    scored.push({ workItem: wi, score, timeMinutes: time, category, legalRisk });
  }

  // Sort by score desc, then legal-risk first, then category alpha (stable).
  // Tie-breaks fire only when scores are equal — true ties are rare with
  // continuous scoring but happen on identical-severity, identical-reach items.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.legalRisk !== b.legalRisk) return a.legalRisk ? -1 : 1;
    return a.category.localeCompare(b.category);
  });

  // Greedy fill against the 180-minute budget. If an item won't fit, skip
  // and try the next-best item (per the user's confirmed spec interpretation).
  const selected: ScoredItem[] = [];
  let budgetLeft = TIME_BUDGET_MINUTES;

  for (const candidate of scored) {
    if (selected.length >= MAX_ITEMS) break;
    if (candidate.timeMinutes > budgetLeft) continue;

    selected.push(candidate);
    budgetLeft -= candidate.timeMinutes;
  }

  return selected.map((s, i) => ({
    rank: i + 1,
    workItem: s.workItem,
    category: s.category,
    timeMinutes: s.timeMinutes,
  }));
}

// ---------------------------------------------------------------------------
// Markdown rendering. Facts-only: no scores, no time estimates, no
// fear-mongering, no emojis. Each item answers "what to fix" + "where" + "why
// this matters in WCAG terms" — that's it.
// ---------------------------------------------------------------------------

export function renderTopTen(items: TopTenItem[], manifest: Manifest): string {
  const lines: string[] = [];
  const date = manifest.ended_at.substring(0, 10);
  const totalPages = manifest.urls.length;

  lines.push(`# Top 10 Items to Address — ${manifest.site}`);
  lines.push('');
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages reviewed:** ${totalPages}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (items.length === 0) {
    lines.push('No items met the selection criteria. This usually means findings were either out of scope (vendor-owned templates) or too small in number to budget against the engagement window.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('The items below are the highest-leverage fixes for this site, drawn from the full audit. Each one is sized to be completed within the engagement window. They are listed in order of impact — fix from the top down.');
  lines.push('');

  for (const item of items) {
    const wi = item.workItem;
    const wcagRefs = collectWcagRefs(wi);
    const reach = describeReach(wi.pages_affected, totalPages);

    lines.push(`## ${item.rank}. ${wi.title}`);
    lines.push('');
    lines.push(wi.what_to_do);
    lines.push('');
    lines.push(`**Done when:** ${wi.done_when}`);
    lines.push('');
    lines.push(`**Where it appears:** ${reach}`);
    if (wcagRefs.length > 0) {
      lines.push('');
      lines.push(`**WCAG:** ${wcagRefs.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function collectWcagRefs(wi: WorkItem): string[] {
  const set = new Set<string>();
  for (const f of wi.findings) {
    if (f.wcag) set.add(f.wcag);
  }
  return [...set].sort();
}

function describeReach(pagesAffected: number, totalPages: number): string {
  if (totalPages === 0) return `${pagesAffected} page${pagesAffected === 1 ? '' : 's'}`;
  if (pagesAffected === totalPages && totalPages > 1) {
    return `every page reviewed (${totalPages}) — this is template-level, fixing it once propagates everywhere`;
  }
  if (pagesAffected === 1) {
    return `1 of ${totalPages} pages reviewed`;
  }
  return `${pagesAffected} of ${totalPages} pages reviewed`;
}
