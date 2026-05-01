import type { Finding, Severity } from '../types.js';

type Owner = 'developer' | 'content-editor' | 'designer' | 'vendor' | 'qa-review' | 'mixed';
type Effort = 'XS' | 'S' | 'M' | 'L';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface WorkItem {
  id: string;
  finding_types: string[];
  title: string;
  owner: Owner;
  owner_label: string;
  priority: Priority;
  effort: Effort;
  effort_label: string;
  covers_findings: number;
  pages_affected: number;
  what_to_do: string;
  done_when: string;
  technical_detail: string;
  findings: Finding[];
}

interface WorkItemTemplate {
  owner: Owner;
  effort_base: Effort;
  title: string;
  what_to_do: string;
  done_when: string;
  technical_detail: string;
}

const OWNER_LABELS: Record<Owner, string> = {
  developer: 'Developer',
  'content-editor': 'Editor',
  designer: 'Designer + Developer',
  vendor: 'Third-party vendor',
  'qa-review': 'Manual reviewer',
  mixed: 'Editor OR Developer (varies per instance)',
};

const EFFORT_LABELS: Record<Effort, string> = {
  XS: 'Under an hour',
  S: 'Half a day or less',
  M: '1–3 days',
  L: '1–2 weeks',
};

const TEMPLATES: Record<string, WorkItemTemplate> = {
  'target-below-24px': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Enforce minimum 24×24 pixel touch targets site-wide',
    what_to_do:
      'Add a site-wide CSS rule that gives text links and small buttons a minimum 24×24 CSS pixel hit area with appropriate padding. This is usually a single block added to the main stylesheet. Test afterward to confirm layout is not broken.',
    done_when: 'No new target-size failures appear in a re-run of the audit.',
    technical_detail:
      'WCAG 2.2 SC 2.5.8 requires interactive targets to be at least 24×24 CSS pixels. Exempt inline links in flowing text and user-agent controls (native checkboxes/radios). A typical fix is `min-height: 24px; padding: 4px 8px` on the anchor selector in content regions.',
  },
  'redundant-link-text': {
    owner: 'developer',
    effort_base: 'M',
    title: 'Differentiate link text in card/listing templates',
    what_to_do:
      'In card templates (service listings, provider listings, blog teasers) where multiple "Read More" or "Learn More" links share the same visible text but point to different destinations, add destination-specific context. The simplest fix: append a visually-hidden suffix like `<span class="sr-only"> about {card heading}</span>` inside each link.',
    done_when:
      'No two links on the same page share the same accessible name while pointing to different destinations.',
    technical_detail:
      'WCAG 2.4.4 Link Purpose (In Context) requires that each link\'s purpose be distinguishable. Screen-reader users often navigate by link list — identical names make that list unusable.',
  },
  'contrast-below-aa-normal': {
    owner: 'designer',
    effort_base: 'M',
    title: 'Increase contrast on brand/accent colors used for text',
    what_to_do:
      'Review the site\'s color palette with a designer. Identify every color pair flagged for insufficient contrast (each finding includes exact hex values). Decide whether to darken the foreground, lighten the background, or restrict that color pair to large-text-only uses. Update the CSS variables / theme tokens accordingly.',
    done_when:
      'Every text/background color combination on audited pages meets a 4.5:1 contrast ratio for normal text (3:1 for large text).',
    technical_detail:
      'WCAG 1.4.3. The audit measures actual rendered pixels, including text over images. Some failures may be fixable via a single color-variable swap if the brand palette is centralized.',
  },
  'contrast-below-aa-large': {
    owner: 'designer',
    effort_base: 'S',
    title: 'Fix low-contrast large text (headings, hero copy)',
    what_to_do:
      'Same process as normal-text contrast, but the threshold is 3:1 instead of 4.5:1. Large text is typically headings and hero copy — fixing these is often visible and visually significant.',
    done_when: 'All large-text instances meet 3:1 contrast against their background.',
    technical_detail: 'WCAG 1.4.3. Large text = 18pt+ or 14pt+ bold.',
  },
  'motion-ignores-reduce-preference': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Honor users\' reduced-motion preference site-wide',
    what_to_do:
      'Add a single CSS block to the main stylesheet that suppresses long transitions and animations when the user has set `prefers-reduced-motion: reduce` at the OS level. This is a one-line fix that cascades across the entire site.',
    done_when:
      'With reduced motion enabled in OS settings, no site animations over ~0.3s run.',
    technical_detail:
      'WCAG 2.2.2. Recommended CSS: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }`',
  },
  'empty-link': {
    owner: 'mixed',
    effort_base: 'S',
    title: 'Give every link an accessible name',
    what_to_do:
      'Each link flagged has no visible text, no aria-label, and no image with alt text — so assistive tech users hear only "link" with no destination. For each instance, add descriptive visible text, add `aria-label` on the anchor, or add `alt` to a contained image that describes the link\'s destination.',
    done_when: 'No links remain with empty accessible names.',
    technical_detail:
      'WCAG 2.4.4. Check the HTML snippet in each finding; the most common cause is image-wrapping links (e.g., video thumbnails, social icons) where the image has no alt text.',
  },
  'miscategorized-decorative': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Add descriptive alt text to image links marked decorative',
    what_to_do:
      'Certain images are inside links but marked as decorative (empty alt). That means the link has no accessible name at all — screen-reader users hear "link" with no destination. In the CMS, edit each affected image and replace its empty alt with a description of where the link goes (e.g., "Watch the 2026 anniversary video").',
    done_when: 'Every image-as-link on the site has alt text describing the link destination.',
    technical_detail:
      'WCAG 1.1.1 + 2.4.4. These are often WordPress image blocks inside link wrappers. The alt field is in the image settings sidebar.',
  },
  'generic-link-text': {
    owner: 'content-editor',
    effort_base: 'M',
    title: 'Replace generic "Read More" / "Learn More" link text',
    what_to_do:
      'Find every instance of generic link text ("Read more", "Learn more", "Click here") and edit the visible text to describe the link\'s destination (e.g., "Read more about Family Medicine"). For cards and listings where design calls for short link text, ask your developer to add a visually-hidden suffix.',
    done_when: 'No link on any page has text that\'s unclear out of context.',
    technical_detail:
      'WCAG 2.4.4. The CMS usually surfaces this as "Button Text" or link text fields in block settings. For hard-coded template links, a developer will need to touch the template.',
  },
  'skipped-heading-level': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Fix heading-level jumps in post/page content',
    what_to_do:
      'In the CMS, open each affected post/page. The audit found headings that jump from H1 straight to H3 (or H2 to H4) — skipping a level. Edit the content to use consecutive heading levels (H1 → H2 → H3) so the document outline makes sense.',
    done_when: 'Every audited page has a consecutive heading hierarchy.',
    technical_detail:
      'WCAG 1.3.1. Screen-reader users often navigate by heading level. Skipping levels breaks their mental map of the page.',
  },
  'no-h1': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Ensure every page has a visible H1',
    what_to_do:
      'Some pages have no H1 element. In the CMS, add an H1 to each affected page that describes the page content (usually the page title). If the theme is supposed to auto-render the title as H1, a developer may need to check the theme template.',
    done_when: 'Every page has exactly one visible H1.',
    technical_detail:
      'WCAG 1.3.1. Sometimes the theme renders a hidden H1 and the author added another in the body content — resulting in hidden+visible h1s. A template check may be needed.',
  },
  'multiple-h1': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Remove duplicate H1 elements from page content',
    what_to_do:
      'Some pages have more than one H1. Usually this happens when a content author retyped the page title as an H1 at the top of the post body. Edit the affected posts and remove the duplicate — the theme should already render the title as H1 automatically.',
    done_when: 'Every page has exactly one H1.',
    technical_detail: 'WCAG 1.3.1 (informational).',
  },
  'invisible-focus-indicator': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Add visible keyboard focus indicators site-wide',
    what_to_do:
      'Some interactive elements show no visible outline or ring when a keyboard user tabs to them. Add `:focus-visible` styles site-wide (typically a 2px solid outline in a brand color). This benefits keyboard users, users with low vision, and people recovering from surgery who temporarily can\'t use a mouse.',
    done_when: 'Every focusable element has a clearly visible focus indicator when tabbed to.',
    technical_detail:
      'WCAG 2.4.7. Basic CSS: `:focus-visible { outline: 2px solid #0066cc; outline-offset: 2px; }`',
  },
  'keyboard-trap': {
    owner: 'developer',
    effort_base: 'M',
    title: 'Remove keyboard traps (URGENT)',
    what_to_do:
      'A keyboard trap means a user tabbing through the page gets stuck and can\'t escape. This is critical — keyboard-only users (including screen-reader users) must reload the page to recover. Investigate each flagged trap and fix the JS or ARIA pattern causing the loop.',
    done_when: 'A full Tab cycle completes without getting stuck.',
    technical_detail:
      'WCAG 2.1.2. Modal dialogs SHOULD trap focus while open — set `aria-modal="true"` and ensure focus returns correctly on close.',
  },
  'keyboard-walk-inconclusive': {
    owner: 'qa-review',
    effort_base: 'S',
    title: 'Manually verify keyboard navigation on key pages',
    what_to_do:
      'The automated keyboard test could not complete a full Tab cycle (usually because mega-menus or pop-outs keep injecting new focusable elements on focus). A human should manually Tab through each critical page from top to bottom, confirming focus moves logically, no elements trap focus, and every focused element is visible.',
    done_when:
      'A human has verified keyboard navigation on home, primary service, location, and form pages and documented any real issues found.',
    technical_detail:
      'WCAG 2.1.1 / 2.1.2. Start the manual walk with the page loaded, press Tab repeatedly, watch where focus goes. Tab+Shift to go backward.',
  },
  'horizontal-scroll-at-400-zoom': {
    owner: 'developer',
    effort_base: 'M',
    title: 'Make page layout work at 400% browser zoom',
    what_to_do:
      'When users zoom the browser to 400% (a common setting for low-vision users), the page requires horizontal scrolling. Adjust the layout so content reflows to a single column at narrow viewports — remove fixed widths, use responsive breakpoints.',
    done_when:
      'At 400% zoom on a 1280px-wide screen (equivalent to 320 CSS pixels), content can be read by scrolling vertically only.',
    technical_detail: 'WCAG 1.4.10.',
  },
  'content-clipped-at-400-zoom': {
    owner: 'developer',
    effort_base: 'M',
    title: 'Fix content that gets cut off at high zoom',
    what_to_do:
      'At 400% zoom, certain page regions overflow their containers and content gets clipped. Remove fixed heights and widths on text-bearing containers; replace `overflow: hidden` with `overflow: auto` or `overflow: visible` where appropriate.',
    done_when: 'No content is hidden at 400% zoom on audited pages.',
    technical_detail: 'WCAG 1.4.10.',
  },
  'text-spacing-content-loss': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Allow user-agent text-spacing overrides without losing content',
    what_to_do:
      'When users apply WCAG-recommended text spacing (wider lines, letter spacing, paragraph gaps — common for readers with dyslexia), content in some regions overflows and gets clipped. Remove fixed heights on text containers and avoid `overflow: hidden` on elements that hold flowing text.',
    done_when:
      'When WCAG text-spacing is applied via browser extension or dev tools, no content is clipped.',
    technical_detail: 'WCAG 1.4.12.',
  },
  'definition-list': {
    owner: 'vendor',
    effort_base: 'S',
    title: 'Fix invalid `<dl>` markup in event calendar widget',
    what_to_do:
      'The events calendar uses invalid definition-list markup (`<dl>` elements containing unexpected children). This is inside a third-party widget (Modern Events Calendar or similar). Either update the widget to a version that fixes this, replace the widget, or document as an accepted exception.',
    done_when:
      'The events calendar no longer produces definition-list axe findings — OR a documented decision is made to accept this as a vendor limitation.',
    technical_detail:
      'WCAG 1.3.1. The plugin author needs to fix this; filing an upstream issue is usually the right path.',
  },
  'link-in-text-block': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Underline links inside paragraphs',
    what_to_do:
      'Inline links in paragraph text are currently distinguishable only by color. Add `text-decoration: underline` on content anchors so color-blind and low-vision users can identify them.',
    done_when:
      'Every inline link in content regions has an underline (or equivalent non-color cue) by default.',
    technical_detail: 'WCAG 1.4.1. Usually a single CSS rule on `.entry-content a`, `article a`, etc.',
  },
  'link-name': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Fix links with no accessible name',
    what_to_do:
      'Axe detected links where the anchor has no determinable accessible name. These are usually icon-only links without aria-labels, or JavaScript-driven links. For each, add an `aria-label` describing the destination, or add visible text.',
    done_when: 'Every link on the page has a non-empty accessible name.',
    technical_detail: 'WCAG 4.1.2 / 2.4.4.',
  },
  'aria-valid-attr': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Fix typos in ARIA attribute names',
    what_to_do:
      'Axe detected ARIA attributes with misspelled names (e.g., `aria-contols` instead of `aria-controls`). Browsers silently ignore misspelled ARIA attributes, so the affected interactive elements behave incorrectly for assistive tech. Search and replace the typo in the source.',
    done_when: 'No misspelled ARIA attribute names remain.',
    technical_detail: 'WCAG 4.1.2.',
  },
  'label': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Add labels to form input fields',
    what_to_do:
      'A form input has no associated label. Add a `<label>` element linked via `for`/`id`, or wrap the input in a `<label>`, or add an `aria-label` to the input. Screen-reader and voice-control users cannot use an unlabeled field.',
    done_when: 'Every form input has an associated label.',
    technical_detail: 'WCAG 3.3.2 / 4.1.2.',
  },
  'alt-describes-appearance': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Fix self-describing alt text',
    what_to_do:
      'Some images have alt text like "Spinner" or "Icon" that describes what the image *is* rather than what it *means*. In the CMS, edit each image\'s alt to either describe the content meaningfully or set it to empty (if the image is decorative).',
    done_when: 'No image alt text remains that merely names the image type.',
    technical_detail: 'WCAG 1.1.1.',
  },
  'redundant-alt': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Remove alt text that duplicates nearby visible text',
    what_to_do:
      'Some images have alt text that repeats the adjacent visible text word-for-word. For functional-secondary images (images inside links that already have text), set the alt to empty (`alt=""`) to avoid duplicate announcements.',
    done_when: 'No image alt duplicates its adjacent link text or caption.',
    technical_detail: 'WCAG 1.1.1.',
  },
  'inconsistent-help': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Keep help mechanisms consistent across pages',
    what_to_do:
      'Some pages have different help/contact links than the reference home page. Ensure contact, help, FAQ, and chat mechanisms appear on every page where they\'re relevant, in consistent positions.',
    done_when: 'Every page includes the same primary help mechanisms in the same location.',
    technical_detail: 'WCAG 3.2.6.',
  },
  'sensory-language-candidate': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Review sensory-language candidates',
    what_to_do:
      'Text references like "click the red button" or "the icon in the top right" can exclude users who cannot perceive color, shape, or position. Review each flagged instance — if the referenced element can be identified in another way (by text label, position within a numbered list, etc.), it\'s acceptable. If the sensory cue is the only way to identify it, rewrite.',
    done_when: 'Every sensory-language candidate has been reviewed and either corrected or confirmed as having a non-sensory alternative identifier.',
    technical_detail: 'WCAG 1.3.3.',
  },
  'label-in-name-mismatch': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Align visible button/link text with aria-label',
    what_to_do:
      'A button or link has an `aria-label` that doesn\'t contain its visible text. Voice-control users saying the visible word won\'t match. Either remove the aria-label (let the visible text speak for itself) or extend the aria-label to include the visible text.',
    done_when:
      'Every element with both visible text and an aria-label has visible text as a substring of the aria-label.',
    technical_detail: 'WCAG 2.5.3.',
  },
  'missing-alt': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Add alt text to images missing the alt attribute',
    what_to_do:
      'Each image flagged has no `alt` attribute at all. Screen-reader users hear the filename (e.g., "IMG_4381.jpg") instead of useful context. In the CMS, edit each affected image and set an alt that describes its content meaningfully, or set alt="" if the image is purely decorative.',
    done_when: 'No image on any page is missing its alt attribute.',
    technical_detail: 'WCAG 1.1.1.',
  },
  'empty-heading': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Remove or fill empty heading elements',
    what_to_do:
      'Some heading elements have no text content — they\'re announced to screen-reader users as "heading" with no topic. In the CMS, either add meaningful heading text or delete the empty heading element.',
    done_when: 'No empty heading elements remain on audited pages.',
    technical_detail: 'WCAG 1.3.1.',
  },
  'focus-obscured': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Ensure focused elements stay in the viewport',
    what_to_do:
      'When keyboard users tab to certain elements, the focused element is outside the visible viewport (commonly hidden behind a sticky header or below the fold). Adjust CSS `scroll-margin-top` on focusable elements to clear sticky headers, or ensure `scrollIntoView` fires on focus.',
    done_when:
      'Every focused element is visible in the viewport when focus lands on it.',
    technical_detail: 'WCAG 2.4.11 Focus Not Obscured (Minimum).',
  },
  'missing-skip-link': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Add a Skip to Main Content link',
    what_to_do:
      'Some pages lack a skip link, forcing keyboard users to tab through the entire header on every page. Add a hidden-until-focused `<a href="#main-content">Skip to main content</a>` as the first focusable element, targeting the main content region\'s id.',
    done_when: 'Every page exposes a skip link as the first Tab target.',
    technical_detail: 'WCAG 2.4.1 Bypass Blocks.',
  },
  'inconsistent-navigation': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Keep primary navigation consistent across pages',
    what_to_do:
      'Primary navigation differs between pages (different links, different order). Users — especially screen-reader and cognitive-impaired users — rely on stable navigation. Review the template(s) producing the primary nav and ensure the same links appear in the same order on every page.',
    done_when: 'Primary navigation is identical (in visible text and order) across all pages.',
    technical_detail: 'WCAG 3.2.3 Consistent Navigation.',
  },
  'text-spacing-not-responsive': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Remove !important overrides on text-spacing properties',
    what_to_do:
      'When WCAG-recommended text spacing was applied (wider lines, letter/word spacing, paragraph gaps — common for dyslexic readers), the page layout didn\'t change at all. This usually means CSS uses `!important` on `line-height`, `letter-spacing`, or `word-spacing`, which blocks user overrides. Audit the stylesheet and remove `!important` declarations on those properties. (If the page already meets the spec without reflowing, this is a false positive — confirm manually.)',
    done_when:
      'With WCAG 1.4.12 text-spacing applied via browser extension, page layout reflows to accommodate the wider spacing.',
    technical_detail: 'WCAG 1.4.12 Text Spacing. Confidence is low on this finding — human review recommended.',
  },
  'nested-interactive': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Remove nested interactive controls',
    what_to_do:
      'An interactive element (button, link) is nested inside another interactive element — e.g., a button inside a link. Screen readers cannot reliably announce both, and keyboard focus may behave erratically. Flatten the markup: split into sibling elements, or make the outer a non-interactive wrapper.',
    done_when: 'No interactive element contains another interactive element.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value.',
  },
  'color-contrast': {
    owner: 'designer',
    effort_base: 'M',
    title: 'Fix low-contrast text',
    what_to_do:
      'Axe detected text with insufficient contrast that the pixel-level contrast probe did not also catch (rare — likely a page where the contrast probe did not run, or a very specific fallback case). Review the designated color pairs with a designer and update the palette.',
    done_when: 'Axe reports no color-contrast violations.',
    technical_detail: 'WCAG 1.4.3. On pages where our `contrast` probe ran, axe color-contrast findings are suppressed in favor of the probe\'s richer data.',
  },
  'target-size': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Enlarge touch targets',
    what_to_do:
      'Axe detected a touch target below the 24×24 minimum. Our `target-size` probe emits separate findings with exact measurements and CSS selectors — those are the authoritative ones to act on. This axe finding is a duplicate signal; fixing the corresponding `target-below-24px` findings will also resolve this.',
    done_when: 'No target-size violations from axe or our probe remain.',
    technical_detail: 'WCAG 2.5.8 Target Size (Minimum).',
  },
  'select-name': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Add accessible name to `<select>` dropdowns',
    what_to_do:
      'Each flagged `<select>` has no accessible name. Screen-reader and voice-control users can\'t tell what the dropdown is for. Either add a `<label for="...">` tied to the select\'s id, wrap the select inside a `<label>`, or add an `aria-label` describing the control.',
    done_when: 'Every `<select>` on the site has an associated label or aria-label.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value / 3.3.2 Labels or Instructions.',
  },
  'button-name': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Add accessible name to unlabeled `<button>` elements',
    what_to_do:
      'Each flagged `<button>` has no visible text, no `aria-label`, and no `aria-labelledby`. Screen-reader users hear "button" with no purpose. Usually these are icon-only buttons (close, menu, search). Add `aria-label="{action}"` on the button describing what it does.',
    done_when: 'Every button on the site has a non-empty accessible name.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value.',
  },
  'image-alt': {
    owner: 'content-editor',
    effort_base: 'S',
    title: 'Add alt attribute to images missing one',
    what_to_do:
      'Axe detected `<img>` elements with no `alt` attribute at all. In the CMS, edit each affected image and set an alt that describes the image content, or set `alt=""` if purely decorative. Our `missing-alt` finding type covers the same territory — this axe version may cover images our rubric missed.',
    done_when: 'Every `<img>` on the site has an `alt` attribute (empty or descriptive).',
    technical_detail: 'WCAG 1.1.1 Non-text Content.',
  },
  'html-has-lang': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Declare page language on the `<html>` element',
    what_to_do:
      'The page\'s `<html>` element is missing the `lang` attribute. Screen readers need this to switch pronunciation profiles (English vs. Spanish, etc.). Add `lang="en"` (or the appropriate BCP 47 code) to the `<html>` tag in your site template.',
    done_when: 'Every page\'s `<html>` element declares a valid `lang` attribute.',
    technical_detail: 'WCAG 3.1.1 Language of Page.',
  },
  'frame-title': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Add titles to `<iframe>` elements',
    what_to_do:
      'Each flagged `<iframe>` has no `title` attribute. Screen-reader users navigating frames hear "frame" with no purpose. Add `title="{description}"` to the iframe (e.g., `title="Embedded YouTube video: Our Hospital Tour"`).',
    done_when: 'Every `<iframe>` on the site has a descriptive `title` attribute.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value.',
  },
  'aria-prohibited-attr': {
    owner: 'developer',
    effort_base: 'XS',
    title: 'Remove ARIA attributes that aren\'t allowed on the element',
    what_to_do:
      'Each flagged element has an ARIA attribute that isn\'t valid for its role. Common example: `aria-label` on a `<div>` without an interactive role. Remove the prohibited attribute, or change the element\'s role to one that supports the attribute.',
    done_when: 'No elements have ARIA attributes outside the spec-allowed set for their role.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value.',
  },
  'aria-hidden-focus': {
    owner: 'developer',
    effort_base: 'S',
    title: 'Remove `aria-hidden="true"` from focusable ancestors',
    what_to_do:
      'An element that\'s focusable (or has focusable descendants) is inside an `aria-hidden="true"` subtree. Screen-reader users can\'t reach it even though keyboard focus can. Either remove the `aria-hidden`, OR also make the element unfocusable (`tabindex="-1"` or `disabled`).',
    done_when: 'No focusable element is inside an `aria-hidden="true"` subtree.',
    technical_detail: 'WCAG 4.1.2 Name, Role, Value.',
  },
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function generateWorkItems(findings: Finding[]): WorkItem[] {
  const byType = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byType.has(f.finding_type)) byType.set(f.finding_type, []);
    byType.get(f.finding_type)!.push(f);
  }

  const items: WorkItem[] = [];
  let autoIdx = 0;

  for (const [type, group] of byType) {
    const template = TEMPLATES[type] ?? inferTemplate(type, group);
    const maxSeverity = group.reduce<Severity>(
      (worst, f) => (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[worst] ? f.severity : worst),
      'minor',
    );
    const pagesAffected = new Set(group.map((f) => f.url)).size;
    const priority = priorityFor(maxSeverity, group.length, pagesAffected);
    const effort = scaleEffort(template.effort_base, group.length);

    items.push({
      id: `${priority}-${++autoIdx}`,
      finding_types: [type],
      title: template.title,
      owner: template.owner,
      owner_label: OWNER_LABELS[template.owner],
      priority,
      effort,
      effort_label: EFFORT_LABELS[effort],
      covers_findings: group.length,
      pages_affected: pagesAffected,
      what_to_do: template.what_to_do,
      done_when: template.done_when,
      technical_detail: template.technical_detail,
      findings: group,
    });
  }

  items.sort((a, b) => {
    const p = a.priority.localeCompare(b.priority);
    if (p !== 0) return p;
    return b.covers_findings - a.covers_findings;
  });

  items.forEach((item, i) => {
    const idx = i + 1;
    item.id = `${item.priority}-${String(idx).padStart(2, '0')}`;
  });

  return items;
}

function inferTemplate(finding_type: string, group: Finding[]): WorkItemTemplate {
  const sample = group[0];
  return {
    owner: 'mixed',
    effort_base: 'S',
    title: `Address ${finding_type} findings (${group.length} instance${group.length === 1 ? '' : 's'})`,
    what_to_do: sample.suggested_fix || 'Review each flagged instance and remediate according to the technical rationale.',
    done_when: `All ${finding_type} findings resolved.`,
    technical_detail: sample.rationale,
  };
}

function priorityFor(maxSeverity: Severity, count: number, pagesAffected: number): Priority {
  if (maxSeverity === 'critical') return 'P0';
  if (maxSeverity === 'serious') {
    if (count > 50 || pagesAffected >= 10) return 'P1';
    return 'P1';
  }
  if (maxSeverity === 'moderate') {
    if (count > 20) return 'P2';
    return 'P2';
  }
  return 'P3';
}

function scaleEffort(base: Effort, count: number): Effort {
  const order: Effort[] = ['XS', 'S', 'M', 'L'];
  const baseIdx = order.indexOf(base);
  let adjusted = baseIdx;
  if (count > 100) adjusted++;
  if (count > 300) adjusted++;
  return order[Math.min(adjusted, order.length - 1)];
}

export function renderRoadmap(
  items: WorkItem[],
  site: string,
  runId: string,
  date: string,
  urlsAudited: number,
): string {
  const byPriority = new Map<Priority, WorkItem[]>();
  for (const item of items) {
    if (!byPriority.has(item.priority)) byPriority.set(item.priority, []);
    byPriority.get(item.priority)!.push(item);
  }

  const totalCovered = items.reduce((sum, i) => sum + i.covers_findings, 0);
  const byOwner = new Map<Owner, number>();
  for (const item of items) {
    byOwner.set(item.owner, (byOwner.get(item.owner) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# Accessibility Remediation Plan — ${site}`);
  lines.push('');
  lines.push(`**Run:** ${runId}`);
  lines.push(`**Date:** ${date}`);
  lines.push(`**Pages audited:** ${urlsAudited}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## What This Document Is');
  lines.push('');
  lines.push(
    'This is the **action plan** for remediating every accessibility finding detected in the audit. It contains all the technical detail a developer needs (CSS selectors, HTML snippets, measurements) and is written so that non-technical stakeholders — project managers, content editors, designers, vendor coordinators — can navigate, prioritize, and assign the work without parsing raw data.',
  );
  lines.push('');
  lines.push(
    'Every individual finding is listed below, grouped into **work items**. A work item shares a single remediation action, a single owner (developer / editor / designer / vendor / reviewer), a single priority, and a single done-when check. Each work item contains a full table of every instance so nothing is hidden behind a link to another file.',
  );
  lines.push('');
  lines.push(
    'Companion files: `executive-summary.md` is the one-page overview for budget signers. Per-owner handoff docs are isolated queues for each role — `editor-tasks.md`, `developer-tasks.md`, `designer-tasks.md`, `vendor-tasks.md`, `reviewer-tasks.md` — each framed in plain language so the person making the handoff fully understands what they are sending. `report.md` groups the same findings by WCAG severity for accessibility-review audiences. `work-items.csv` and `findings.csv` are the spreadsheet-ready versions of this plan.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- **${items.length} work items** covering ${totalCovered} individual findings across ${urlsAudited} pages`,
  );
  lines.push(`- **Priority distribution:**`);
  for (const p of ['P0', 'P1', 'P2', 'P3'] as Priority[]) {
    const count = byPriority.get(p)?.length ?? 0;
    if (count === 0) continue;
    const tier = priorityName(p);
    lines.push(`   - **${p} (${tier}):** ${count} work item${count === 1 ? '' : 's'}`);
  }
  lines.push(`- **Ownership distribution:**`);
  for (const [owner, count] of byOwner) {
    lines.push(`   - ${OWNER_LABELS[owner]}: ${count} work item${count === 1 ? '' : 's'}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## How to Use This Plan');
  lines.push('');
  lines.push(
    '- **Start with P0.** Those are critical accessibility barriers blocking some users from using the site at all.',
  );
  lines.push(
    '- **Then P1** — serious issues that affect many users across many pages. These are usually the biggest wins per unit of effort because they\'re site-wide patterns.',
  );
  lines.push(
    '- **Group work by owner.** Your content team can be working on editorial items in parallel with your developer tackling CSS/template changes.',
  );
  lines.push(
    '- **Effort estimates are rough** — "Under an hour" vs "1-2 weeks". Use them for sequencing, not for binding estimates.',
  );
  lines.push(
    '- **After each sprint, re-run the audit** to confirm fixes landed and no regressions crept in.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const p of ['P0', 'P1', 'P2', 'P3'] as Priority[]) {
    const priorityItems = byPriority.get(p) ?? [];
    if (priorityItems.length === 0) continue;
    lines.push(`## ${p} — ${priorityName(p)}`);
    lines.push('');
    lines.push(priorityDescription(p));
    lines.push('');
    for (const item of priorityItems) {
      lines.push(renderWorkItem(item));
    }
    lines.push('---');
    lines.push('');
  }

  lines.push('## By Owner');
  lines.push('');
  lines.push(
    'If you\'re assigning work by role, here\'s each team\'s queue. Within each team, items are sorted by priority.',
  );
  lines.push('');
  const ownerOrder: Owner[] = ['developer', 'content-editor', 'designer', 'qa-review', 'vendor', 'mixed'];
  for (const owner of ownerOrder) {
    const ownerItems = items.filter((i) => i.owner === owner);
    if (ownerItems.length === 0) continue;
    lines.push(`### ${OWNER_LABELS[owner]}`);
    lines.push('');
    lines.push('| # | Priority | Effort | Work Item |');
    lines.push('|---|----------|--------|-----------|');
    for (const item of ownerItems) {
      lines.push(`| ${item.id} | ${item.priority} | ${item.effort} | ${item.title} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderWorkItem(item: WorkItem): string {
  const lines: string[] = [];
  lines.push(`### ${item.id}. ${item.title}`);
  lines.push('');
  lines.push(`**Owner:** ${item.owner_label}  `);
  lines.push(`**Effort:** ${item.effort} — ${item.effort_label}  `);
  lines.push(
    `**Impact:** closes ${item.covers_findings} finding${item.covers_findings === 1 ? '' : 's'} across ${item.pages_affected} page${item.pages_affected === 1 ? '' : 's'}`,
  );
  lines.push('');
  lines.push(`**What to do:** ${item.what_to_do}`);
  lines.push('');
  lines.push(`**Done when:** ${item.done_when}`);
  lines.push('');

  const groups = groupIdenticalFindings(item.findings);
  const templateLevel = groups.filter((g) => g.pages.size > 1).length;
  const uniquePerPage = groups.filter((g) => g.pages.size === 1).length;

  if (templateLevel > 0) {
    lines.push(
      `**Instances (${item.findings.length} findings → ${groups.length} distinct issue${groups.length === 1 ? '' : 's'}):**`,
    );
    lines.push('');
    lines.push(
      `${templateLevel} template-level issue${templateLevel === 1 ? '' : 's'} (same markup repeated across pages); ${uniquePerPage} page-specific. Fix the template-level rows once and the finding count collapses accordingly.`,
    );
  } else {
    lines.push(`**Instances to fix (${item.findings.length}):**`);
  }
  lines.push('');
  lines.push(renderInstancesTable(item, groups));
  lines.push('');
  lines.push('<details><summary>Technical reference</summary>');
  lines.push('');
  lines.push(item.technical_detail);
  lines.push('</details>');
  lines.push('');
  return lines.join('\n');
}

export interface InstanceGroup {
  rep: Finding;
  pages: Set<string>;
  count: number;
}

export function groupIdenticalFindings(findings: Finding[]): InstanceGroup[] {
  const map = new Map<string, InstanceGroup>();
  for (const f of findings) {
    const key = findingKey(f);
    let group = map.get(key);
    if (!group) {
      group = { rep: f, pages: new Set(), count: 0 };
      map.set(key, group);
    }
    group.pages.add(f.url);
    group.count++;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function findingKey(f: Finding): string {
  const ctx = f.context ?? {};
  const outerHtml =
    typeof ctx.outer_html === 'string' && ctx.outer_html.length > 0
      ? (ctx.outer_html as string)
      : typeof f.current_value === 'string' && f.current_value.includes('<')
        ? f.current_value
        : '';
  const target = f.target ?? '';

  if (f.finding_type === 'missing-skip-link' || f.finding_type === 'no-h1') {
    return `${f.finding_type}|template`;
  }
  if (
    f.finding_type === 'contrast-below-aa-normal' ||
    f.finding_type === 'contrast-below-aa-large'
  ) {
    const fg = typeof ctx.foreground_hex === 'string' ? ctx.foreground_hex : '';
    const bg = typeof ctx.background_hex === 'string' ? ctx.background_hex : '';
    return `${f.finding_type}|${target}|${fg}|${bg}`;
  }
  if (!target && !outerHtml) {
    return `${f.finding_type}|${JSON.stringify(f.context ?? {})}`;
  }
  return `${f.finding_type}|${target}|${outerHtml}`;
}

function renderInstancesTable(item: WorkItem, groups: InstanceGroup[]): string {
  const lines: string[] = [];
  const type = item.finding_types[0];
  const schema = tableSchemaFor(type, item.owner);

  const headers = ['#', 'Pages', ...schema.columns.filter((c) => c.header !== 'Page').map((c) => c.header)];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('|' + headers.map(() => '---').join('|') + '|');

  groups.forEach((g, i) => {
    const pagesCell = renderPagesCell(g.pages, item.pages_affected);
    const cells = schema.columns
      .filter((c) => c.header !== 'Page')
      .map((c) => escapeCell(c.extract(g.rep)));
    lines.push(`| ${i + 1} | ${pagesCell} | ${cells.join(' | ')} |`);
  });

  return lines.join('\n');
}

function renderPagesCell(pages: Set<string>, totalPagesInWorkItem: number): string {
  const arr = Array.from(pages);
  if (arr.length === 1) {
    return '`' + shortUrl(arr[0]) + '`';
  }
  const isAll = arr.length === totalPagesInWorkItem;
  const label = isAll
    ? `**${arr.length} pages (all audited pages)**`
    : `**${arr.length} pages**`;
  const shown = arr.slice(0, 3).map((u) => '`' + shortUrl(u) + '`').join(', ');
  const more = arr.length > 3 ? `, +${arr.length - 3} more` : '';
  return `${label}: ${shown}${more}`;
}

interface ColumnSpec {
  header: string;
  extract: (f: Finding) => string;
}

interface TableSchema {
  columns: ColumnSpec[];
}

function tableSchemaFor(findingType: string, owner: Owner): TableSchema {
  const page: ColumnSpec = {
    header: 'Page',
    extract: (f) => `\`${shortUrl(f.url)}\``,
  };

  const editorStyle: TableSchema = {
    columns: [
      page,
      {
        header: 'Where on the page',
        extract: (f) => describeForEditor(f),
      },
      {
        header: 'Current value',
        extract: (f) => {
          const raw =
            (typeof f.current_value === 'string' ? f.current_value : '') ||
            (f.context && typeof f.context.outer_html === 'string' ? f.context.outer_html : '') ||
            '(see page)';
          return '`' + truncate(raw, 120) + '`';
        },
      },
      {
        header: 'Action',
        extract: (f) =>
          typeof f.suggested_fix === 'string' ? truncate(f.suggested_fix, 120) : 'See work item.',
      },
    ],
  };

  const devStyle: TableSchema = {
    columns: [
      page,
      { header: 'CSS selector', extract: (f) => '`' + (f.target ?? '—') + '`' },
      {
        header: 'HTML snippet',
        extract: (f) => {
          const html =
            (typeof f.current_value === 'string' && f.current_value.includes('<') ? f.current_value : '') ||
            (f.context && typeof f.context.outer_html === 'string' ? f.context.outer_html : '') ||
            '';
          return html ? '`' + truncate(html, 120) + '`' : '—';
        },
      },
      {
        header: 'Measurement / detail',
        extract: (f) => measurementFor(f),
      },
    ],
  };

  const contrastStyle: TableSchema = {
    columns: [
      page,
      { header: 'CSS selector', extract: (f) => '`' + (f.target ?? '—') + '`' },
      {
        header: 'Text sample',
        extract: (f) => {
          const html =
            typeof f.current_value === 'string' && f.current_value.includes('<')
              ? stripTags(f.current_value)
              : typeof f.current_value === 'string'
                ? f.current_value
                : '';
          return truncate(html.replace(/^"|"$/g, ''), 70);
        },
      },
      {
        header: 'Colors',
        extract: (f) => {
          const fg = (f.context && typeof f.context.foreground_hex === 'string' ? f.context.foreground_hex : '') || '?';
          const bg = (f.context && typeof f.context.background_hex === 'string' ? f.context.background_hex : '') || '?';
          return `fg \`${fg}\` / bg \`${bg}\``;
        },
      },
      {
        header: 'Ratio',
        extract: (f) => {
          const r = f.context && typeof f.context.ratio === 'number' ? f.context.ratio : '?';
          const req = f.context && typeof f.context.required === 'number' ? f.context.required : '?';
          return `${r}:1 (need ${req}:1)`;
        },
      },
    ],
  };

  const linkStyle: TableSchema = {
    columns: [
      page,
      {
        header: 'Where to find it',
        extract: (f) => {
          const ctx = f.context ?? {};
          const parent = typeof ctx.parent_text === 'string' ? ctx.parent_text : '';
          const href = typeof ctx.href === 'string' ? ctx.href : '';
          const visible = typeof f.current_value === 'string' ? stripTags(f.current_value) : '';
          return `Link "${truncate(visible, 40)}" near "${truncate(parent, 40)}" → \`${href}\``;
        },
      },
      {
        header: 'Current link text',
        extract: (f) =>
          typeof f.current_value === 'string' ? '`' + truncate(stripTags(f.current_value), 70) + '`' : '—',
      },
      {
        header: 'Action',
        extract: (f) =>
          typeof f.suggested_fix === 'string' ? truncate(f.suggested_fix, 100) : 'See work item.',
      },
    ],
  };

  const imageStyle: TableSchema = {
    columns: [
      page,
      {
        header: 'Where to find it',
        extract: (f) => {
          const ctx = f.context ?? {};
          const src = typeof ctx.src === 'string' ? (ctx.src as string).split('/').pop() ?? '' : '';
          const linkHref = typeof ctx.link_href === 'string' ? ` → ${ctx.link_href}` : '';
          return `Image "${truncate(src, 50)}"${linkHref}`;
        },
      },
      {
        header: 'Current alt',
        extract: (f) => {
          const ctx = f.context ?? {};
          const html = typeof ctx.outer_html === 'string' ? (ctx.outer_html as string) : '';
          if (html) {
            const extracted = extractAlt(html);
            return extracted === null ? '`(no alt attribute)`' : `\`"${extracted}"\``;
          }
          const raw = typeof f.current_value === 'string' ? f.current_value : '';
          return raw ? '`' + truncate(raw, 80) + '`' : '`(see page)`';
        },
      },
      {
        header: 'Action',
        extract: (f) =>
          typeof f.suggested_fix === 'string' ? truncate(f.suggested_fix, 100) : 'See work item.',
      },
    ],
  };

  const genericStyle: TableSchema = {
    columns: [
      page,
      { header: 'Location', extract: (f) => '`' + (f.target ?? '—') + '`' },
      {
        header: 'Detail',
        extract: (f) => {
          const raw = typeof f.current_value === 'string' ? f.current_value : '';
          return raw ? '`' + truncate(raw, 100) + '`' : truncate(f.rationale, 120);
        },
      },
    ],
  };

  if (
    findingType === 'contrast-below-aa-normal' ||
    findingType === 'contrast-below-aa-large' ||
    findingType === 'non-text-contrast-below-aa'
  ) {
    return contrastStyle;
  }

  if (
    findingType === 'empty-link' ||
    findingType === 'generic-link-text' ||
    findingType === 'redundant-link-text' ||
    findingType === 'label-in-name-mismatch' ||
    findingType === 'poor-link-text'
  ) {
    return linkStyle;
  }

  if (
    findingType === 'missing-alt' ||
    findingType === 'poor-alt' ||
    findingType === 'redundant-alt' ||
    findingType === 'miscategorized-decorative' ||
    findingType === 'alt-describes-appearance'
  ) {
    return imageStyle;
  }

  if (owner === 'content-editor') {
    return editorStyle;
  }

  if (owner === 'developer' || owner === 'vendor' || owner === 'designer') {
    return devStyle;
  }

  return genericStyle;
}

function describeForEditor(f: Finding): string {
  const ctx = f.context ?? {};
  const parts: string[] = [];
  if (typeof ctx.parent_text === 'string' && ctx.parent_text) {
    parts.push(`near "${truncate(ctx.parent_text as string, 60)}"`);
  }
  if (typeof ctx.accessible_name === 'string' && ctx.accessible_name) {
    parts.push(`label: "${truncate(ctx.accessible_name as string, 50)}"`);
  }
  if (parts.length === 0) {
    if (f.target) parts.push('`' + truncate(f.target, 60) + '`');
  }
  return parts.join('; ') || '(see page)';
}

function measurementFor(f: Finding): string {
  const ctx = f.context ?? {};
  if (typeof ctx.width === 'number' && typeof ctx.height === 'number') {
    return `${ctx.width}×${ctx.height} px`;
  }
  if (typeof ctx.ratio === 'number') {
    return `${ctx.ratio}:1`;
  }
  if (typeof ctx.from === 'number' && typeof ctx.to === 'number') {
    return `h${ctx.from} → h${ctx.to}`;
  }
  if (typeof ctx.animation_name === 'string') {
    return `anim: ${ctx.animation_name}, ${ctx.animation_duration_s ?? '?'}s`;
  }
  return '—';
}

function extractAlt(outerHtml: string): string | null {
  const m = outerHtml.match(/alt=["']([^"']*)["']/i);
  if (!m) return null;
  return m[1];
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function priorityName(p: Priority): string {
  return {
    P0: 'Critical blockers — fix first',
    P1: 'High impact — next sprint',
    P2: 'Experience improvements — backlog',
    P3: 'Polish',
  }[p];
}

function priorityDescription(p: Priority): string {
  return {
    P0: 'These are barriers that block at least one group of users from completing basic tasks. They also carry legal risk (ADA / accessibility lawsuits often start with these). Do these before anything else.',
    P1: 'Serious issues that affect many users. They don\'t block tasks outright but cause real difficulty and frustration. Most are site-wide patterns resolvable in a single template or CSS change.',
    P2: 'Moderate improvements that polish the experience. Important for compliance and quality but not urgent.',
    P3: 'Minor polish items. Worth doing when convenient but no user is blocked.',
  }[p];
}
