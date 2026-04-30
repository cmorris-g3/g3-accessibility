import type { Finding, Manifest, Severity } from '../types.js';

// ---------------------------------------------------------------------------
// Action Items selection — produces a discrete, page-and-element-specific
// task list sized for a 3-hour engagement window.
//
// Key idea: each task is one concrete thing a developer can do in minutes,
// not a site-wide rollup. There are two task shapes:
//
//   1. Instance tasks — one per element on one page.
//      "On {URL}, give the empty link at {selector} an accessible name."
//      Time is small (3–15 min) and one task fixes one finding.
//
//   2. Template tasks — one per finding-type for site-wide CSS / template work.
//      "Site-wide: increase contrast on .btn-primary text. One CSS edit, fixes
//      24 findings across 6 pages."
//      Time is moderate (10–60 min) but one task covers many findings.
//
// Each finding-type is classified into FIX_LEVEL = 'instance' | 'template'.
// Instance types emit one candidate per finding. Template types emit one
// candidate per finding-type, covering all instances of that type at once.
//
//   score = (impact × visibility) / time_minutes
//
//   impact     = severity numeric × reach multiplier × task-blocking bonus
//                (template tasks get reach × covers_findings since one fix
//                cascades across all instances)
//   visibility = 1 (invisible to non-AT) → 3 (visually obvious)
//   time       = INSTANCE_TIME for instance tasks, TEMPLATE_TIME for template
//
// Selection is greedy-fill against a 180-minute budget, soft cap 50 items
// for readability. No item count cap from the spec.
// ---------------------------------------------------------------------------

const SEVERITY_IMPACT: Record<Severity, number> = {
  critical: 10,
  serious: 7,
  moderate: 4,
  minor: 2,
};

type FixLevel = 'instance' | 'template';

// 'template' = a single CSS/template change cascades to fix every instance.
// 'instance' = each occurrence is its own discrete edit (different alt text per
//              image, different aria-label per button, etc.).
const FIX_LEVEL: Record<string, FixLevel> = {
  // Template-level: single CSS/code change covers all instances
  'contrast-below-aa-normal': 'template',
  'contrast-below-aa-large': 'template',
  'contrast-below-aaa': 'template',
  'non-text-contrast-below-aa': 'template',
  'target-below-24px': 'template',
  'target-below-44px': 'template',
  'text-spacing-not-responsive': 'template',
  'text-spacing-content-loss': 'template',
  'motion-ignores-reduce-preference': 'template',
  'content-lost-in-forced-colors': 'template',
  'horizontal-scroll-at-400-zoom': 'template',
  'content-clipped-at-400-zoom': 'template',
  'no-focus-indicator': 'template',
  'invisible-focus-indicator': 'template',
  'focus-obscured': 'template',
  'inconsistent-navigation': 'template',
  'inconsistent-identification': 'template',
  'inconsistent-help': 'template',
  'missing-skip-link': 'template',

  // Instance-level: each occurrence is its own edit
  'missing-alt': 'instance',
  'poor-alt': 'instance',
  'redundant-alt': 'instance',
  'miscategorized-decorative': 'instance',
  'alt-describes-appearance': 'instance',
  'empty-link': 'instance',
  'generic-link-text': 'instance',
  'poor-link-text': 'instance',
  'redundant-link-text': 'instance',
  'label-in-name-mismatch': 'instance',
  'skipped-heading-level': 'instance',
  'empty-heading': 'instance',
  'no-h1': 'instance',
  'multiple-h1': 'instance',
  'missing-form-label': 'instance',
  'label-not-associated': 'instance',
  'required-field-not-announced': 'instance',
  'missing-error-announcement': 'instance',
  'vague-error-message': 'instance',
  'error-not-associated-with-field': 'instance',
  'keyboard-trap': 'instance',
  'illogical-focus-order': 'instance',
  'sensory-language-candidate': 'instance',
};

// Visibility: how obvious the before/after is.
//   3 = visually obvious to anyone (contrast, layout, focus rings)
//   2 = noticeable to most users (link text, headings, motion)
//   1 = invisible to non-AT users (alt text, ARIA, semantic markup)
const VISIBILITY: Record<string, number> = {
  'contrast-below-aa-normal': 3,
  'contrast-below-aa-large': 3,
  'no-focus-indicator': 3,
  'invisible-focus-indicator': 3,
  'horizontal-scroll-at-400-zoom': 3,
  'content-clipped-at-400-zoom': 3,
  'target-below-24px': 3,
  'motion-ignores-reduce-preference': 3,
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
  'text-spacing-not-responsive': 1,
  'content-lost-in-forced-colors': 1,
  'inconsistent-navigation': 1,
  'inconsistent-identification': 1,
  'inconsistent-help': 1,
  'missing-skip-link': 1,
};

// Per-instance time (instance fixes): minutes to fix ONE element.
const INSTANCE_TIME: Record<string, number> = {
  'redundant-alt': 3,
  'empty-heading': 3,
  'missing-alt': 5,
  'poor-alt': 5,
  'miscategorized-decorative': 5,
  'alt-describes-appearance': 5,
  'label-in-name-mismatch': 5,
  'skipped-heading-level': 5,
  'no-h1': 5,
  'multiple-h1': 5,
  'missing-form-label': 5,
  'label-not-associated': 5,
  'required-field-not-announced': 5,
  'vague-error-message': 5,
  'error-not-associated-with-field': 5,
  'sensory-language-candidate': 5,
  'empty-link': 10,
  'generic-link-text': 10,
  'poor-link-text': 10,
  'redundant-link-text': 10,
  'missing-error-announcement': 10,
  'keyboard-trap': 30,
  'illogical-focus-order': 30,
};

// Per-template time (template fixes): minutes for ONE site-wide change.
const TEMPLATE_TIME: Record<string, number> = {
  'motion-ignores-reduce-preference': 10,
  'target-below-24px': 15,
  'target-below-44px': 15,
  'text-spacing-not-responsive': 15,
  'contrast-below-aaa': 15,
  'contrast-below-aa-large': 20,
  'no-focus-indicator': 20,
  'invisible-focus-indicator': 20,
  'non-text-contrast-below-aa': 20,
  'contrast-below-aa-normal': 30,
  'missing-skip-link': 30,
  'inconsistent-identification': 30,
  'inconsistent-help': 30,
  'focus-obscured': 30,
  'horizontal-scroll-at-400-zoom': 60,
  'content-clipped-at-400-zoom': 60,
  'text-spacing-content-loss': 60,
  'content-lost-in-forced-colors': 60,
  'inconsistent-navigation': 60,
};

// Finding types that are out of scope for the 3-hour agency engagement.
// Reported in the audit but excluded from the action items list. Each
// exclusion needs an explicit rationale below.
const EXCLUDED_FROM_ACTION_ITEMS: ReadonlySet<string> = new Set([
  // Text contrast: requires brand/design decisions the client has to make.
  // Keep `non-text-contrast-below-aa` (UI borders/icons) since those tend
  // to be developer-driven CSS tweaks.
  'contrast-below-aa-normal',
  'contrast-below-aa-large',
  'contrast-below-aaa',
]);

// Finding types where the flagged element IS an image. For these, action-items
// surfaces the image URL as a clickable link so the dev can open it in a
// browser to see what they're addressing — guessing from a CSS selector
// alone is too abstract. We don't embed the image inline because pandoc's
// network fetch isn't reliable across all hosting environments.
const IMAGE_FINDING_TYPES: ReadonlySet<string> = new Set([
  'missing-alt',
  'poor-alt',
  'redundant-alt',
  'miscategorized-decorative',
  'alt-describes-appearance',
]);

// Finding types where the SAME (selector, current_value) on multiple pages
// is almost certainly a shared chrome/template element — masthead logo,
// nav social icons, footer links — and a single CMS or template edit fixes
// every occurrence. Group those into one task.
//
// Other instance types (h1 hierarchy, page headings, form fields, body
// content) are page-specific even when the selector and text happen to
// match across pages. Coincidence is not "shared template." Each page
// stays as its own task for these.
const CROSS_PAGE_GROUPABLE: ReadonlySet<string> = new Set([
  'missing-alt',
  'poor-alt',
  'redundant-alt',
  'miscategorized-decorative',
  'alt-describes-appearance',
  'empty-link',
  'generic-link-text',
  'poor-link-text',
  'redundant-link-text',
  'label-in-name-mismatch',
]);

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

// Per-finding-type guidance, instance flavor (talking about one element).
const INSTANCE_GUIDANCE: Record<string, string> = {
  'missing-alt': 'Add an `alt` attribute that describes what the image conveys to a sighted reader. If decorative, use `alt=""` and confirm the image isn\'t inside a link.',
  'poor-alt': 'Rewrite the alt text to describe the image\'s meaning or purpose, not its visual appearance.',
  'redundant-alt': 'Remove the redundant alt text or replace with `alt=""` if the image is decorative.',
  'miscategorized-decorative': 'This image is inside a link with no other text — alt cannot be empty. Add alt text that describes the link\'s destination.',
  'alt-describes-appearance': 'Rewrite the alt text to describe the meaning rather than what the image looks like (e.g., "Sabetha Hospital staff" not "blue background with people").',
  'empty-link': 'Add visible text inside the link, OR an `aria-label` describing the destination, OR `alt` text on the contained image describing where the link goes.',
  'generic-link-text': 'Replace the generic phrase ("click here", "read more", "learn more") with text describing what the link goes to.',
  'poor-link-text': 'Rewrite the link text so it makes sense out of context — screen-reader users navigate by link list.',
  'redundant-link-text': 'Differentiate this link from others with the same visible text but different destinations. Add a hidden span (`<span class="sr-only">about [topic]</span>`) or use aria-label.',
  'label-in-name-mismatch': 'The accessible name (aria-label or computed label) doesn\'t match the visible text. Voice-control users say what they see; align them.',
  'skipped-heading-level': 'Adjust the heading level so the document outline is sequential (h1 → h2 → h3, no jumping from h2 to h4).',
  'empty-heading': 'Either add text content to the heading or remove the heading element entirely.',
  'no-h1': 'Add an `<h1>` to this page. Every page needs one and only one.',
  'multiple-h1': 'Demote the additional `<h1>` to `<h2>` so there is exactly one h1 per page.',
  'missing-form-label': 'Associate this form field with a `<label>` element (matching `for`/`id`) or wrap the input inside the label.',
  'label-not-associated': 'The label exists but isn\'t programmatically linked to the input. Add `for="<input-id>"` to the label.',
  'required-field-not-announced': 'Mark this required field with `required` attribute AND a visible indicator. Either add `aria-required="true"` or use the native `required`.',
  'missing-error-announcement': 'When this form errors, announce it to assistive tech. Use `role="alert"` on the error message or move focus to it.',
  'vague-error-message': 'Rewrite the error message to be specific ("Email must contain @" not "Invalid input").',
  'error-not-associated-with-field': 'Use `aria-describedby` on the input pointing to the error message\'s ID so screen readers announce them together.',
  'keyboard-trap': 'Users cannot tab past this element. Identify the trap (commonly an iframe, dialog, or third-party widget) and ensure focus can escape via Tab/Esc.',
  'illogical-focus-order': 'Tab order doesn\'t match visual reading order. Adjust DOM order or `tabindex` so focus moves left-to-right, top-to-bottom.',
  'sensory-language-candidate': 'Replace sensory-only references ("click the green button", "see below") with descriptive text ("submit form", "read more after this paragraph").',
};

// Per-finding-type guidance, template flavor (one site-wide change).
const TEMPLATE_GUIDANCE: Record<string, string> = {
  'contrast-below-aa-normal': 'Update text/background color pairs in your stylesheet to meet 4.5:1 contrast minimum for normal text. Findings list exact hex pairs.',
  'contrast-below-aa-large': 'Update text/background color pairs for large text (18pt+ or 14pt+ bold) to meet 3:1 minimum.',
  'contrast-below-aaa': 'Optional: tighten contrast pairs to AAA threshold (7:1 normal, 4.5:1 large).',
  'non-text-contrast-below-aa': 'Update borders/icons/UI components to meet 3:1 contrast against adjacent colors.',
  'target-below-24px': 'Scope the rule to the site header and footer only — avoid blanket changes that could affect inline content links elsewhere on the site. Add: `header a, header button, footer a, footer button { min-width: 24px; min-height: 24px; padding: 4px 8px; }` (adjust selectors to match your theme\'s actual header/footer markup).',
  'target-below-44px': 'Optional: scale header/footer targets to 44×44 for AAA touch-friendliness. Same scoping principle — keep the rule out of inline content areas.',
  'text-spacing-not-responsive': 'Confirm content reflows correctly when users override line-height/letter-spacing. Usually resolved by removing fixed heights on text containers.',
  'text-spacing-content-loss': 'Content disappears or overlaps when text spacing is increased. Replace fixed heights with min-height or use overflow:visible on text containers.',
  'motion-ignores-reduce-preference': 'Add a global CSS rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`',
  'content-lost-in-forced-colors': 'Test in Windows High Contrast mode. Use `forced-colors: active` media query to swap problem styles.',
  'horizontal-scroll-at-400-zoom': 'Resolve fixed-width containers that cause horizontal scrolling at 400% zoom. Usually a max-width or display:flex fix on the affected layout.',
  'content-clipped-at-400-zoom': 'Content gets clipped (cut off) at 400% zoom. Audit fixed heights and overflow:hidden on the flagged containers.',
  'no-focus-indicator': 'Ensure every focusable element has a visible focus ring. Add `:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }` globally.',
  'invisible-focus-indicator': 'Existing focus rings have insufficient contrast against the background. Increase to ≥3:1 (often by using `outline-color: currentColor` with sufficient text contrast).',
  'focus-obscured': 'Focused elements get hidden behind sticky headers. Add `scroll-margin-top` equal to your sticky header height on focusable elements.',
  'inconsistent-navigation': 'Same nav items appear in different orders across pages. Make navigation order consistent.',
  'inconsistent-identification': 'Same UI control labeled differently across pages. Standardize labels (e.g., always "Search" not "Find" on some pages).',
  'inconsistent-help': 'Help/contact mechanisms appear in different locations across pages. Place help links/buttons in a consistent spot.',
  'missing-skip-link': 'Add a "Skip to main content" link as the first focusable element on every page. Visually hidden until focused.',
};

const TIME_BUDGET_MINUTES = 180;
const SOFT_CAP = 50;

export interface ActionItem {
  rank: number;
  level: FixLevel;
  finding_type: string;
  severity: Severity;
  url: string | null;       // present for instance items, null for template
  selector: string | null;  // present for instance items
  current_value: string | null;
  guidance: string;         // what to do
  wcag_refs: string[];
  pages_affected: number;   // 1 for instance items; N for template items
  covers_findings: number;  // 1 for instance items; N for template items
  time_minutes: number;
  affected_urls: string[];  // for template items, the URLs the fix benefits
  context: Record<string, unknown> | null;  // sample finding's context for finding-type-specific rendering
}

interface Candidate extends ActionItem {
  score: number;
}

export function selectActionItems(findings: Finding[], totalPages: number): ActionItem[] {
  const candidates: Candidate[] = [];

  // Group findings by type for the template branch.
  const byType = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byType.has(f.finding_type)) byType.set(f.finding_type, []);
    byType.get(f.finding_type)!.push(f);
  }

  for (const [type, group] of byType) {
    if (EXCLUDED_FROM_ACTION_ITEMS.has(type)) continue;
    const level = FIX_LEVEL[type];
    if (!level) continue; // unmapped type — skip
    const visibility = VISIBILITY[type] ?? 1;

    if (level === 'template') {
      const time = TEMPLATE_TIME[type];
      if (time === undefined || time === 0) continue;

      // One candidate covering all instances of this type.
      const pagesAffected = new Set(group.map((f) => f.url)).size;
      const reachRatio = totalPages > 0 ? Math.min(1, pagesAffected / totalPages) : 0;
      const reachMultiplier = 1 + reachRatio;
      const taskBlocking = TASK_BLOCKING.has(type) ? 1.5 : 1;
      const sevImpact = SEVERITY_IMPACT[worstSeverity(group)];
      // Template fixes get a "covers many findings" bonus capped to keep time-fairness.
      const coverageBonus = Math.min(3, 1 + Math.log10(group.length + 1));
      const impact = sevImpact * reachMultiplier * taskBlocking * coverageBonus;
      const score = (impact * visibility) / time;

      candidates.push({
        rank: 0,
        level: 'template',
        finding_type: type,
        severity: worstSeverity(group),
        url: null,
        selector: null,
        current_value: sampleCurrentValue(group),
        guidance: TEMPLATE_GUIDANCE[type] ?? group[0].suggested_fix ?? '',
        wcag_refs: collectWcag(group),
        pages_affected: pagesAffected,
        covers_findings: group.length,
        time_minutes: time,
        affected_urls: [...new Set(group.map((f) => f.url))].sort(),
        context: group[0].context ?? null,
        score,
      });
    } else {
      // Instance level — group by (selector + current_value) ONLY for
      // finding types where matching elements across pages plausibly mean
      // shared chrome (logos, nav, footer). For page-specific types (h1
      // structure, body content), keep each finding as its own task even
      // when content happens to match — they're separate concerns on
      // separate pages.
      const time = INSTANCE_TIME[type];
      if (time === undefined || time === 0) continue;

      const byElement = new Map<string, Finding[]>();
      const groupable = CROSS_PAGE_GROUPABLE.has(type);
      for (const f of group) {
        const key = groupable
          ? `${f.target ?? ''}|${f.current_value ?? ''}`
          : `__nogroup__${candidates.length}__${f.url}__${f.target ?? ''}`;
        if (!byElement.has(key)) byElement.set(key, []);
        byElement.get(key)!.push(f);
      }

      for (const fpGroup of byElement.values()) {
        const sample = fpGroup[0];
        const uniqueUrls = [...new Set(fpGroup.map((f) => f.url))].sort();
        const pagesAffected = uniqueUrls.length;
        const sevImpact = SEVERITY_IMPACT[sample.severity];
        const taskBlocking = TASK_BLOCKING.has(type) ? 1.5 : 1;
        // When the same instance surfaces on many pages, reach matters even
        // though the fix is still typically one CMS/template edit.
        const reachRatio = totalPages > 0 ? Math.min(1, pagesAffected / totalPages) : 0;
        const reachMultiplier = 1 + reachRatio;
        const impact = sevImpact * taskBlocking * reachMultiplier;
        const score = (impact * visibility) / time;

        candidates.push({
          rank: 0,
          level: 'instance',
          finding_type: type,
          severity: sample.severity,
          // For single-URL groups, url is the page; for multi-URL groups,
          // we keep the first URL as a "primary" and surface the rest via
          // affected_urls in rendering.
          url: sample.url,
          selector: sample.target ?? null,
          current_value: sample.current_value ?? null,
          guidance: sample.suggested_fix?.trim() || INSTANCE_GUIDANCE[type] || 'Review the flagged element and apply the WCAG-aligned fix.',
          wcag_refs: [...new Set(fpGroup.map((f) => f.wcag).filter(Boolean))].sort(),
          pages_affected: pagesAffected,
          covers_findings: fpGroup.length,
          time_minutes: time,
          affected_urls: uniqueUrls,
          context: sample.context ?? null,
          score,
        });
      }
    }
  }

  // Highest score first. Stable tie-break by severity, then time (cheaper wins
  // when score-tied so the budget stretches further).
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sevOrder: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return a.time_minutes - b.time_minutes;
  });

  // Greedy fill 180-minute budget, soft cap at SOFT_CAP for output readability.
  const selected: Candidate[] = [];
  let budgetLeft = TIME_BUDGET_MINUTES;
  for (const c of candidates) {
    if (selected.length >= SOFT_CAP) break;
    if (c.time_minutes > budgetLeft) continue;
    selected.push(c);
    budgetLeft -= c.time_minutes;
  }

  return selected.map((s, i) => {
    const { score, ...item } = s;
    return { ...item, rank: i + 1 };
  });
}

function worstSeverity(findings: Finding[]): Severity {
  const order: Severity[] = ['critical', 'serious', 'moderate', 'minor'];
  let worst: Severity = 'minor';
  let worstIdx = order.indexOf(worst);
  for (const f of findings) {
    const idx = order.indexOf(f.severity);
    if (idx < worstIdx) {
      worst = f.severity;
      worstIdx = idx;
    }
  }
  return worst;
}

function sampleCurrentValue(findings: Finding[]): string | null {
  for (const f of findings) {
    if (f.current_value) return f.current_value;
  }
  return null;
}

function collectWcag(findings: Finding[]): string[] {
  const set = new Set<string>();
  for (const f of findings) {
    if (f.wcag) set.add(f.wcag);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderActionItems(items: ActionItem[], manifest: Manifest): string {
  const lines: string[] = [];
  const date = manifest.ended_at.substring(0, 10);

  lines.push(`# Action Items — ${manifest.site}`);
  lines.push('');
  lines.push(`**Date:** ${date}  `);
  lines.push(`**Pages reviewed:** ${manifest.urls.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (items.length === 0) {
    lines.push('No items met the selection criteria within the available engagement window.');
    lines.push('');
    return lines.join('\n');
  }

  const totalTime = items.reduce((s, i) => s + i.time_minutes, 0);
  lines.push(`Each item below is a discrete fix that can be completed in the time noted. Items are ordered by impact — work top to bottom. The full list fits within ${totalTime} minutes of focused work.`);
  lines.push('');

  for (const item of items) {
    lines.push(`## ${item.rank}. ${headlineFor(item)}`);
    lines.push('');
    lines.push(item.guidance);
    lines.push('');

    // The body is a sequence of chunks — each is either a metadata line
    // (rendered as `text  ` with a two-space hard break so consecutive
    // **Field:** lines stack tight) or a bullet block (heading line +
    // bullets, sandwiched in blank lines so the next chunk isn't absorbed
    // by GFM list-continuation rules).
    type Chunk = { kind: 'meta'; text: string } | { kind: 'bullets'; heading: string; items: string[] };
    const chunks: Chunk[] = [];
    const meta = (text: string) => chunks.push({ kind: 'meta', text });
    const bulletList = (heading: string, items: string[]) => chunks.push({ kind: 'bullets', heading, items });

    if (item.level === 'instance') {
      const isMultiPage = item.affected_urls.length > 1;
      if (isMultiPage) {
        meta(`**Pages affected:** ${item.affected_urls.length} of ${manifest.urls.length} (shared element — fix once in the template/CMS).`);
      } else {
        meta(`**Page:** ${item.url}`);
      }
      if (item.current_value) {
        meta(`**Currently:** \`${truncate(item.current_value, 200)}\``);
      }
      const href = stringField(item.context, 'href');
      if (href && LINK_TEXT_TYPES.has(item.finding_type)) {
        meta(`**Destination:** \`${truncate(href, 150)}\``);
      }
      if (IMAGE_FINDING_TYPES.has(item.finding_type) && item.current_value) {
        const src = extractImageSrc(item.current_value, item.url ?? '');
        if (src) {
          meta(`**Image URL:** [${src}](${src})`);
        }
      }
      // Conflicts list (redundant-link-text only) and the affected-pages list
      // are independent — both can render. Conflicts come first because they
      // describe the issue itself (which other links share the text);
      // affected pages describe where the dev needs to look.
      if (item.finding_type === 'redundant-link-text' && Array.isArray(item.context?.conflicts)) {
        const conflicts = item.context!.conflicts as Array<{ target?: string; href?: string }>;
        const dests = conflicts
          .map((c) => (typeof c.href === 'string' ? c.href : null))
          .filter((h): h is string => !!h);
        if (dests.length > 0) {
          bulletList(
            `**Conflicts with ${dests.length} other link${dests.length === 1 ? '' : 's'} on this page sharing the same text — destinations:**`,
            capUrlList(dests),
          );
        }
      }
      if (isMultiPage) {
        bulletList('**Appears on:**', capUrlList(item.affected_urls));
      }
    } else {
      meta(`**Scope:** site-wide CSS / template change.`);
      meta(`**Affects:** ${item.covers_findings} finding${item.covers_findings === 1 ? '' : 's'} across ${item.pages_affected} of ${manifest.urls.length} page${manifest.urls.length === 1 ? '' : 's'} reviewed.`);
      if (item.affected_urls.length > 0) {
        bulletList('**On these pages:**', capUrlList(item.affected_urls));
      }
    }

    if (item.wcag_refs.length > 0) {
      meta(`**WCAG:** ${item.wcag_refs.join(', ')}`);
    }
    meta(`**Severity:** ${capitalize(item.severity)}`);

    // Render chunks. Meta-to-meta uses two-space hard breaks so consecutive
    // **Field:** lines stack as one paragraph. Bullet blocks are always
    // sandwiched in blank lines — both above (so the heading isn't folded
    // into the previous meta paragraph) and below (so the next chunk isn't
    // absorbed by GFM list-continuation).
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const next = chunks[i + 1];
      if (chunk.kind === 'meta') {
        const useHardBreak = next && next.kind === 'meta';
        lines.push(chunk.text + (useHardBreak ? '  ' : ''));
      } else {
        lines.push('');
        lines.push(chunk.heading);
        lines.push('');
        for (const b of chunk.items) lines.push(b);
        lines.push('');
      }
    }

    // Horizontal rule between items for visual breathing room. Skipped after
    // the last item so the doc doesn't end on a stray rule.
    lines.push('');
    if (item.rank < items.length) {
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function headlineFor(item: ActionItem): string {
  if (item.level === 'template') {
    return `Site-wide: ${humanType(item.finding_type)}`;
  }
  // For text-bearing finding types, quote the visible text so the headline
  // disambiguates (e.g., five "Click here" findings each get their own row,
  // and the dev can scan the list without opening every entry).
  const textHint = item.current_value && QUOTED_HINT_TYPES.has(item.finding_type)
    ? ` — "${truncate(item.current_value, 40)}"`
    : '';
  if (item.affected_urls.length > 1) {
    return `${humanType(item.finding_type)}${textHint} (shared across ${item.affected_urls.length} pages)`;
  }
  return `${humanType(item.finding_type)}${textHint}`;
}

// Finding types whose headline benefits from a quoted snippet of the visible
// text. For these, current_value is a clean text string (not HTML markup), so
// it reads well as a quote.
const QUOTED_HINT_TYPES: ReadonlySet<string> = new Set([
  'generic-link-text',
  'poor-link-text',
  'redundant-link-text',
  'sensory-language-candidate',
  'label-in-name-mismatch',
  'no-h1',
  'multiple-h1',
  'empty-heading',
  'skipped-heading-level',
]);

function humanType(type: string): string {
  const dictionary: Record<string, string> = {
    'missing-alt': 'add alt text to image',
    'poor-alt': 'rewrite vague alt text',
    'redundant-alt': 'remove redundant alt text',
    'miscategorized-decorative': 'add alt text to image-as-link',
    'alt-describes-appearance': 'rewrite alt to describe meaning',
    'empty-link': 'give empty link an accessible name',
    'generic-link-text': 'replace generic link text',
    'poor-link-text': 'rewrite ambiguous link text',
    'redundant-link-text': 'differentiate duplicate link text',
    'label-in-name-mismatch': 'align accessible name with visible text',
    'skipped-heading-level': 'fix heading level skip',
    'empty-heading': 'remove or fill empty heading',
    'no-h1': 'add an h1 to the page',
    'multiple-h1': 'reduce to a single h1',
    'missing-form-label': 'label the form field',
    'label-not-associated': 'associate label with input',
    'required-field-not-announced': 'mark required field for assistive tech',
    'missing-error-announcement': 'announce form errors to AT',
    'vague-error-message': 'make error message specific',
    'error-not-associated-with-field': 'link error message to its input',
    'keyboard-trap': 'release keyboard trap',
    'illogical-focus-order': 'fix tab order',
    'sensory-language-candidate': 'replace sensory-only language',
    'contrast-below-aa-normal': 'improve text contrast (AA)',
    'contrast-below-aa-large': 'improve large-text contrast (AA)',
    'contrast-below-aaa': 'improve text contrast (AAA)',
    'non-text-contrast-below-aa': 'improve UI element contrast',
    'target-below-24px': 'enforce 24×24 minimum touch targets',
    'target-below-44px': 'enforce 44×44 touch targets',
    'text-spacing-not-responsive': 'support user text-spacing overrides',
    'text-spacing-content-loss': 'fix content loss with custom text spacing',
    'motion-ignores-reduce-preference': 'honor reduce-motion preference',
    'content-lost-in-forced-colors': 'support forced-colors mode',
    'horizontal-scroll-at-400-zoom': 'remove horizontal scroll at 400% zoom',
    'content-clipped-at-400-zoom': 'fix content clipping at 400% zoom',
    'no-focus-indicator': 'add visible focus indicators',
    'invisible-focus-indicator': 'increase focus indicator contrast',
    'focus-obscured': 'fix focus hidden behind sticky header',
    'inconsistent-navigation': 'consistent navigation order',
    'inconsistent-identification': 'consistent control labels',
    'inconsistent-help': 'consistent help mechanism placement',
    'missing-skip-link': 'add skip-to-main-content link',
  };
  return dictionary[type] ?? type.replace(/-/g, ' ');
}

function friendlyPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return path === '/' ? `${u.host} (home)` : `${u.host}${path}`;
  } catch {
    return url;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Link-text findings whose context.href reveals where the link points to.
// Surfacing the destination tells the dev what to write the accessible name
// about — guessing from a CSS selector is too abstract.
const LINK_TEXT_TYPES: ReadonlySet<string> = new Set([
  'empty-link',
  'generic-link-text',
  'poor-link-text',
  'redundant-link-text',
  'label-in-name-mismatch',
]);

function stringField(ctx: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!ctx) return null;
  const v = ctx[key];
  return typeof v === 'string' ? v : null;
}

// Cap displayed URL/destination lists at 5 for readability — agency devs
// only need a handful to spot-check, and longer lists turn the doc into a
// wall. When more than 5 exist, suffix with an "and N more" hint so the
// reader knows the total count.
const URL_BULLET_CAP = 5;

function capUrlList(urls: string[]): string[] {
  const shown = urls.slice(0, URL_BULLET_CAP).map((u) => `- ${u}`);
  const remaining = urls.length - URL_BULLET_CAP;
  if (remaining > 0) {
    shown.push(`- _…and ${remaining} more_`);
  }
  return shown;
}

/**
 * Pull the first <img src="..."> URL out of an HTML snippet and resolve it
 * against the page URL so relative/protocol-relative paths become absolute.
 * Returns null if no usable image URL is found (e.g., data: URIs, missing src).
 */
export function extractImageSrc(html: string, pageUrl: string): string | null {
  const match = html.match(/<img[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  // data:/blob: are embeddable inline by some renderers but not by pandoc-fetch.
  // Skip them — the docx would just break.
  if (/^(data|blob):/i.test(raw)) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}
