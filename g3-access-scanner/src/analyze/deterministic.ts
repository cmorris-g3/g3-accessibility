import type { Finding } from '../types.js';
import { AXE_RULE_TO_WCAG, formatWcagCitation } from './wcag-map.js';
import { resolveSeverityForAxe } from './severity.js';

export interface AxeNode {
  target: string[];
  html?: string;
  failureSummary?: string;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface AxeResults {
  violations: AxeViolation[];
  incomplete: AxeViolation[];
  passes: unknown[];
}

export interface HeadingsJson {
  headings: Array<{ level: number; text: string; selector: string; empty: boolean; hidden: boolean }>;
  issues: Array<{
    type: 'no-h1' | 'multiple-h1' | 'skipped-heading-level' | 'empty-heading';
    from?: number;
    to?: number;
    at_selector?: string;
  }>;
}

export interface TargetSizeEntry {
  selector: string;
  css_path?: string;
  outer_html?: string;
  tag_name?: string;
  accessible_name?: string | null;
  width: number;
  height: number;
  passes_aa: boolean;
  passes_aaa: boolean;
  exception: string | null;
}

export interface ContrastEntry {
  selector: string;
  css_path?: string;
  outer_html?: string;
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

export interface ReflowResult {
  viewport: { w: number; h: number };
  html_scroll_width: number;
  horizontal_scroll_required: boolean;
  regions_overflowing: Array<{
    selector: string;
    scroll_width: number;
    client_width: number;
    overflow_by: number;
    is_allowed_content: boolean;
  }>;
  allowed_content_overflows: number;
  screenshot: string;
}

export interface TextSpacingResult {
  baseline_body_height: number;
  post_override_body_height: number;
  clipped_regions: Array<{
    selector: string;
    overflow_kind: 'horizontal' | 'vertical' | 'both';
    scroll_vs_client: { w: [number, number]; h: [number, number] };
    overflow_style: string;
  }>;
}

export interface ReducedMotionResult {
  evaluated_elements: number;
  violations: Array<{
    selector: string;
    reason: string;
    animation_name: string;
    animation_duration_s: number;
    animation_iteration_count: string;
    transition_duration_s: number;
  }>;
}

export interface SensoryLanguageResult {
  candidates: Array<{
    selector: string;
    pattern: 'color-only' | 'shape-only' | 'position-only' | 'visual-verb';
    matched: string;
    surrounding: string;
  }>;
}

export interface ConsistencyResult {
  pages_compared: number;
  skip_link: { present_on: string[]; missing_on: string[] };
  nav_consistency: {
    pages_compared: number;
    deviations: Array<{
      pages: [string, string];
      diff_type: 'element-added' | 'element-removed' | 'order-change';
      elements_changed: number;
      diff: string;
    }>;
  };
  help_consistency: {
    pages_compared: number;
    deviations: Array<{
      pages: [string, string];
      diff_type: 'element-added' | 'element-removed' | 'order-change';
      elements_changed: number;
      diff: string;
    }>;
  };
}

export interface KeyboardWalkResult {
  total_focusable: number;
  max_steps: number;
  actual_steps: number;
  steps: Array<{
    step: number;
    selector: string;
    tag_name: string;
    role: string | null;
    accessible_name: string | null;
    bbox: { x: number; y: number; w: number; h: number };
    in_viewport: boolean;
    in_modal: boolean;
    focus_visible: boolean;
    matches_focus_visible?: boolean;
    outer_html?: string;
    focus_indicator: Record<string, string>;
  }>;
  traps: Array<{ step: number; selector: string; reason: string }>;
  invisible_focus: Array<{ step: number; selector: string }>;
  off_screen_focus: Array<{ step: number; selector: string }>;
  reached_body: boolean;
  hit_step_cap: boolean;
}

export function translateAxe(axe: AxeResults, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  for (const v of axe.violations) {
    const ref = AXE_RULE_TO_WCAG[v.id] ?? { sc: '4.1.2', level: 'A' as const };
    for (const node of v.nodes) {
      findings.push({
        check: 'axe',
        source: 'scanner',
        finding_type: v.id,
        url: pageUrl,
        target: node.target.join(' '),
        severity: resolveSeverityForAxe(v.impact),
        wcag: formatWcagCitation(ref),
        rationale: v.help,
        current_value: node.html?.slice(0, 200) ?? null,
        suggested_fix: v.helpUrl,
        confidence: 'high',
        context: { axe_rule: v.id, axe_impact: v.impact, help_url: v.helpUrl },
      });
    }
  }
  return findings;
}

export function translateHeadings(headings: HeadingsJson, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  for (const issue of headings.issues) {
    switch (issue.type) {
      case 'no-h1':
        findings.push({
          check: 'heading-structure',
          source: 'scanner',
          finding_type: 'no-h1',
          url: pageUrl,
          severity: 'serious',
          wcag: formatWcagCitation({ sc: '1.3.1', level: 'A' }),
          rationale:
            'Page has no visible h1. Screen-reader users lose the top-level document identifier.',
          suggested_fix: 'Add a single h1 that describes the page content.',
          confidence: 'high',
        });
        break;
      case 'multiple-h1':
        findings.push({
          check: 'heading-structure',
          source: 'scanner',
          finding_type: 'multiple-h1',
          url: pageUrl,
          severity: 'minor',
          wcag: formatWcagCitation({ sc: '1.3.1', level: 'A' }),
          rationale:
            'Page has more than one visible h1. HTML5 allows this but it weakens the document outline.',
          suggested_fix: 'Keep one h1; demote the others to h2.',
          confidence: 'high',
        });
        break;
      case 'skipped-heading-level':
        findings.push({
          check: 'heading-structure',
          source: 'scanner',
          finding_type: 'skipped-heading-level',
          url: pageUrl,
          target: issue.at_selector ?? null,
          severity: 'moderate',
          wcag: formatWcagCitation({ sc: '1.3.1', level: 'A' }),
          rationale: `Heading level jumps from h${issue.from} to h${issue.to}, skipping intermediate levels.`,
          suggested_fix: `Use h${(issue.from ?? 1) + 1} instead of h${issue.to}, or fill the missing level.`,
          confidence: 'high',
          context: { from: issue.from, to: issue.to },
        });
        break;
      case 'empty-heading':
        findings.push({
          check: 'heading-structure',
          source: 'scanner',
          finding_type: 'empty-heading',
          url: pageUrl,
          target: issue.at_selector ?? null,
          severity: 'moderate',
          wcag: formatWcagCitation({ sc: '1.3.1', level: 'A' }),
          rationale: 'Heading element has no text content.',
          suggested_fix: 'Add heading text or remove the empty element.',
          confidence: 'high',
        });
        break;
    }
  }
  return findings;
}

export function translateContrast(
  entries: ContrastEntry[],
  pageUrl: string,
): { findings: Finding[]; unable_count: number } {
  const findings: Finding[] = [];
  let unableCount = 0;
  for (const c of entries) {
    if (c.passes === null) {
      unableCount++;
      continue;
    }
    if (c.passes) continue;
    const findingType: string =
      c.size_class === 'large' ? 'contrast-below-aa-large' : 'contrast-below-aa-normal';
    findings.push({
      check: 'contrast',
      source: 'scanner',
      finding_type: findingType,
      url: pageUrl,
      target: c.css_path ?? c.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '1.4.3', level: 'AA' }),
      rationale: `Text with ${c.foreground_hex} on ${c.background_hex} has contrast ratio ${c.ratio}:1 (required ${c.required}:1 for ${c.size_class} text). Measured via ${c.method}. Text sample: "${c.text_sample}"`,
      current_value: c.outer_html ?? `"${c.text_sample}"`,
      suggested_fix:
        'Darken the foreground or lighten the background until the ratio meets the required threshold.',
      confidence: c.method === 'pixel-sampled' ? 'medium' : 'high',
      context: {
        foreground_hex: c.foreground_hex,
        background_hex: c.background_hex,
        ratio: c.ratio,
        required: c.required,
        size_class: c.size_class,
        method: c.method,
        background_has_image: c.background_has_image,
      },
    });
  }
  return { findings, unable_count: unableCount };
}

export function translateSensoryLanguage(
  s: SensoryLanguageResult,
  pageUrl: string,
): Finding[] {
  return s.candidates.map((c) => ({
    check: 'sensory-language',
    source: 'scanner',
    finding_type: 'sensory-language-candidate',
    url: pageUrl,
    target: c.selector,
    severity: 'minor',
    wcag: formatWcagCitation({ sc: '1.3.3', level: 'A' }),
    rationale: `Text matches a sensory-only pattern (${c.pattern}): "${c.matched}". Candidate for human review — may or may not violate 1.3.3 depending on whether the described element is ALSO identifiable by non-sensory means.`,
    current_value: c.surrounding,
    suggested_fix:
      'If this instruction refers to an element that can ONLY be identified by this sensory characteristic, add a non-sensory label (e.g., a text label, numeric identifier, or role).',
    confidence: 'low',
    context: { pattern: c.pattern, matched: c.matched },
  }));
}

export function translateConsistency(c: ConsistencyResult, site: string): Finding[] {
  const findings: Finding[] = [];

  for (const missingOn of c.skip_link.missing_on) {
    findings.push({
      check: 'consistency',
      source: 'scanner',
      finding_type: 'missing-skip-link',
      url: `${site}/${missingOn === 'home' ? '' : missingOn}`,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '2.4.1', level: 'A' }),
      rationale:
        'No skip link detected on this page. Keyboard users must tab through header navigation on every page.',
      suggested_fix:
        'Add a skip link (`<a href="#main">Skip to main content</a>`) as the first focusable element on every page.',
      confidence: 'medium',
      context: { page: missingOn },
    });
  }

  for (const dev of c.nav_consistency.deviations) {
    findings.push({
      check: 'consistency',
      source: 'scanner',
      finding_type: 'inconsistent-navigation',
      url: `${site}/${dev.pages[1] === 'home' ? '' : dev.pages[1]}`,
      severity: 'minor',
      wcag: formatWcagCitation({ sc: '3.2.3', level: 'AA' }),
      rationale: `Navigation differs from reference page ${dev.pages[0]}: ${dev.diff}`,
      suggested_fix:
        'Keep navigation identical across pages. If a page needs contextual nav additions (e.g., sub-nav), present them separately from the primary site navigation.',
      confidence: 'medium',
      context: { diff_type: dev.diff_type, elements_changed: dev.elements_changed },
    });
  }

  for (const dev of c.help_consistency.deviations) {
    findings.push({
      check: 'consistency',
      source: 'scanner',
      finding_type: 'inconsistent-help',
      url: `${site}/${dev.pages[1] === 'home' ? '' : dev.pages[1]}`,
      severity: 'minor',
      wcag: formatWcagCitation({ sc: '3.2.6', level: 'A' }),
      rationale: `Help mechanism differs from reference page ${dev.pages[0]}: ${dev.diff}`,
      suggested_fix:
        'If a help mechanism (contact, chat, FAQ) exists on any page, include it in the same relative order on every page where it appears.',
      confidence: 'medium',
      context: { diff_type: dev.diff_type, elements_changed: dev.elements_changed },
    });
  }

  return findings;
}

export function translateReflow(r: ReflowResult, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  if (r.horizontal_scroll_required) {
    findings.push({
      check: 'reflow',
      source: 'scanner',
      finding_type: 'horizontal-scroll-at-400-zoom',
      url: pageUrl,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '1.4.10', level: 'AA' }),
      rationale: `At 320 CSS px viewport (equivalent to 400% zoom at 1280 px), the page requires horizontal scrolling (document scrollWidth ${r.html_scroll_width} > ${r.viewport.w}).`,
      suggested_fix:
        'Ensure layout reflows to single-column at narrow viewports — remove fixed widths on containers, use responsive breakpoints at 320 px.',
      confidence: 'high',
      context: { scroll_width: r.html_scroll_width, viewport_w: r.viewport.w },
    });
  }
  for (const region of r.regions_overflowing) {
    findings.push({
      check: 'reflow',
      source: 'scanner',
      finding_type: 'content-clipped-at-400-zoom',
      url: pageUrl,
      target: region.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '1.4.10', level: 'AA' }),
      rationale: `Region "${region.selector}" overflows at 320 CSS px viewport (scrollWidth ${region.scroll_width} > clientWidth ${region.client_width}).`,
      suggested_fix: 'Make this region responsive — remove fixed widths or use overflow:auto only if the content is naturally wide (tables, code).',
      confidence: 'high',
      context: region,
    });
  }
  return findings;
}

export function translateTextSpacing(t: TextSpacingResult, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  const noReflow =
    Math.abs(t.post_override_body_height - t.baseline_body_height) < 4 &&
    t.clipped_regions.length === 0;
  if (noReflow) {
    findings.push({
      check: 'text-spacing',
      source: 'scanner',
      finding_type: 'text-spacing-not-responsive',
      url: pageUrl,
      severity: 'minor',
      wcag: formatWcagCitation({ sc: '1.4.12', level: 'AA' }),
      rationale: `Page body did not reflow when WCAG 1.4.12 text-spacing overrides were applied (baseline ${t.baseline_body_height}, post ${t.post_override_body_height}). Either the page already meets the spacing (fine), or stylesheets use !important to prevent override (problem).`,
      suggested_fix:
        'Review CSS for !important declarations on line-height, letter-spacing, or word-spacing that would prevent user stylesheet overrides.',
      confidence: 'low',
    });
  }
  for (const region of t.clipped_regions) {
    findings.push({
      check: 'text-spacing',
      source: 'scanner',
      finding_type: 'text-spacing-content-loss',
      url: pageUrl,
      target: region.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '1.4.12', level: 'AA' }),
      rationale: `Applying WCAG 1.4.12 text-spacing overrides causes content to overflow and clip in this element (overflow:${region.overflow_style}, scrollWidth ${region.scroll_vs_client.w[0]}>clientWidth ${region.scroll_vs_client.w[1]}).`,
      suggested_fix:
        'Remove fixed heights/widths on text containers, or replace `overflow: hidden` with `overflow: auto` / `overflow: visible` where content may legitimately expand.',
      confidence: 'medium',
      context: region,
    });
  }
  return findings;
}

export function translateReducedMotion(r: ReducedMotionResult, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  for (const v of r.violations) {
    findings.push({
      check: 'reduced-motion',
      source: 'scanner',
      finding_type: 'motion-ignores-reduce-preference',
      url: pageUrl,
      target: v.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '2.2.2', level: 'A' }),
      rationale: v.reason,
      suggested_fix:
        'Respect `prefers-reduced-motion: reduce` — suppress non-essential animations and long transitions via `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` or equivalent.',
      confidence: 'medium',
      context: v,
    });
  }
  return findings;
}

export function translateKeyboardWalk(kw: KeyboardWalkResult, pageUrl: string): Finding[] {
  const findings: Finding[] = [];

  if (kw.hit_step_cap) {
    findings.push({
      check: 'keyboard-walk',
      source: 'scanner',
      finding_type: 'keyboard-walk-inconclusive',
      url: pageUrl,
      severity: 'moderate',
      wcag: formatWcagCitation({ sc: '2.1.1', level: 'A' }),
      rationale: `Keyboard walk hit the ${kw.max_steps}-step cap without completing a full focus cycle. This usually means dynamic menus expand new focusable elements on focus, preventing reliable trap detection.`,
      suggested_fix:
        'Manually verify keyboard navigation through the full page. Consider reducing hover/focus-triggered menu expansion that continually injects new focusable nodes.',
      confidence: 'low',
      context: {
        total_focusable: kw.total_focusable,
        max_steps: kw.max_steps,
        actual_steps: kw.actual_steps,
      },
    });
  }

  for (const trap of kw.traps) {
    findings.push({
      check: 'keyboard-walk',
      source: 'scanner',
      finding_type: 'keyboard-trap',
      url: pageUrl,
      target: trap.selector,
      severity: 'critical',
      wcag: formatWcagCitation({ sc: '2.1.2', level: 'A' }),
      rationale: trap.reason,
      suggested_fix:
        'Ensure Tab moves focus through each interactive element exactly once per cycle. If this is a modal, set aria-modal="true" and implement a proper focus-trap that releases on close.',
      confidence: 'high',
      context: { step: trap.step },
    });
  }

  for (const inv of kw.invisible_focus) {
    const step = kw.steps.find((s) => s.step === inv.step);
    findings.push({
      check: 'keyboard-walk',
      source: 'scanner',
      finding_type: 'invisible-focus-indicator',
      url: pageUrl,
      target: inv.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '2.4.7', level: 'AA' }),
      rationale:
        'Focused element has no detectable focus indicator (no outline, no box-shadow, no border change, and does NOT match :focus-visible). Keyboard users cannot tell which element has focus. Note: this is a heuristic; indicators provided only via background-color or pseudo-elements (::before/::after) may not be detected — verify manually.',
      current_value: step?.outer_html ?? null,
      suggested_fix:
        'Add a visible focus indicator via CSS :focus or :focus-visible (outline, box-shadow, border, or strong background change). If this element is from a third-party widget (UserWay, cookie banner, chat), consider a known-noise filter after confirming the widget provides its own focus indicator.',
      confidence: 'medium',
      context: { step: inv.step, focus_indicator: step?.focus_indicator ?? {}, outer_html: step?.outer_html },
    });
  }

  for (const off of kw.off_screen_focus) {
    findings.push({
      check: 'keyboard-walk',
      source: 'scanner',
      finding_type: 'focus-obscured',
      url: pageUrl,
      target: off.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '2.4.11', level: 'AA' }),
      rationale:
        'Focused element is outside the viewport and not scrolled into view. Keyboard users cannot see what is focused.',
      suggested_fix:
        'Ensure focused elements scroll into view, and that sticky headers/footers do not obscure the focused element.',
      confidence: 'medium',
      context: { step: off.step },
    });
  }

  return findings;
}

export function translateTargetSize(
  entries: TargetSizeEntry[],
  pageUrl: string,
): { findings: Finding[]; exceptions_filtered: number } {
  const findings: Finding[] = [];
  let exceptionsFiltered = 0;
  for (const t of entries) {
    if (t.exception !== null) {
      exceptionsFiltered++;
      continue;
    }
    if (t.passes_aa) continue;
    const nameHint = t.accessible_name ? ` — "${t.accessible_name.slice(0, 60)}"` : '';
    findings.push({
      check: 'target-size',
      source: 'scanner',
      finding_type: 'target-below-24px',
      url: pageUrl,
      target: t.css_path ?? t.selector,
      severity: 'serious',
      wcag: formatWcagCitation({ sc: '2.5.8', level: 'AA' }),
      rationale: `Target size ${t.width}×${t.height} CSS px is below the WCAG 2.5.8 minimum of 24×24${nameHint}.`,
      current_value: t.outer_html ?? null,
      suggested_fix: 'Increase padding or min-width/min-height to reach 24×24 CSS px.',
      confidence: 'high',
      context: {
        width: t.width,
        height: t.height,
        required_min: 24,
        tag: t.tag_name,
        accessible_name: t.accessible_name,
        outer_html: t.outer_html,
      },
    });
  }
  return { findings, exceptions_filtered: exceptionsFiltered };
}
