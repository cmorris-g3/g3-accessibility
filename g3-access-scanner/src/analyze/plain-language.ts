export const SEVERITY_INTROS: Record<string, string> = {
  critical:
    'Critical findings are barriers that **block** at least one group of users from completing a basic task. Examples: a link with no accessible name is invisible to screen-reader users; a form field with no label can\'t be understood by voice-control users. These should be fixed first.',
  serious:
    'Serious findings let users complete tasks but with **significant effort, confusion, or risk of missing information**. Common examples: text that\'s too low-contrast to read comfortably, touch targets so small they\'re hard to tap reliably, or focus indicators that don\'t show where the keyboard is on the page.',
  moderate:
    'Moderate findings are **experience degradations**. Users can still complete tasks, but the interface is harder to use than it should be — headings skip levels, animations ignore motion-reduction preferences, or alt text describes the image\'s appearance rather than its meaning.',
  minor:
    'Minor findings are **polish issues**. They don\'t block anything and don\'t meaningfully slow users down, but fixing them moves the site closer to a first-rate experience. Common examples: redundant alt text on decorative images, or extra noise in screen-reader announcements.',
};

export const HOW_TO_READ = `
This report is organized by severity, then by type of finding. You do **not** have to read all 1,000+ findings to know what to fix — most findings are site-wide patterns that repeat across pages, and fixing one template or CSS rule will resolve dozens of findings at once.

- **The × N next to each finding title** is how many instances of that issue were detected across all pages. If you see \`target-below-24px × 476\`, it means 476 interactive elements across the audit are too small — almost certainly traceable to one or two shared templates.
- **Sample instances** show up to 5 examples per finding type, with the actual CSS path and HTML snippet so your developer can locate the element immediately. The rest are in \`findings.csv\`.
- **WCAG citations** link to the W3C's Understanding documents, which explain each success criterion in more technical depth.
- **Pages affected** tells you whether the issue is isolated (1 page) or site-wide (all pages). Site-wide issues are typically cheaper to fix because one change propagates everywhere.
- **Confidence** is either \`high\`, \`medium\`, or \`low\`. Anything \`low\` means the automated check couldn't be sure — a human reviewer should verify before deciding whether it's a real issue.

Severities are not just about how bad a finding is — they signal which users are affected and how much.
`.trim();

export const WHO_IS_AFFECTED = `
Accessibility issues don't affect one "type" of user uniformly. A single page can have barriers for:

- **Blind and low-vision users** using screen readers (NVDA, JAWS, VoiceOver, TalkBack) — affected by missing alt text, empty links, bad headings, low contrast.
- **Keyboard-only users** who can't use a mouse — affected by keyboard traps, invisible focus indicators, and illogical tab order.
- **People with motor impairments** — affected by tiny touch targets, hover-only controls, and timed interactions.
- **People with color vision differences or color blindness** — affected by information conveyed only by color, or low-contrast interface elements.
- **People sensitive to motion** (migraines, vestibular disorders) — affected by animations that don't respect the \`prefers-reduced-motion\` system setting.
- **People in bright sunlight, on small screens, or on slow connections** — affected by all of the above, plus any issue that assumes ideal viewing conditions.

Most of the fixes below benefit everyone, not just disabled users. Better contrast is easier to read in sunlight. Larger touch targets work better on phones. Clearer link text helps anyone scanning a page.
`.trim();

export const WHY_IT_MATTERS: Record<string, string> = {
  // alt-text
  'missing-alt':
    'Screen readers announce the image filename when `alt` is missing. Users hear gibberish like "IMG_4381" instead of "CEO Jane Chen at the 2026 board meeting." This can block understanding of articles, products, or profiles entirely.',
  'poor-alt':
    'The alt text exists but doesn\'t describe what the image actually shows or means in context. Screen-reader users get words that don\'t help them understand the page.',
  'redundant-alt':
    'The alt text repeats nearby visible text verbatim, so screen-reader users hear the same information twice in a row. It\'s not blocking, but it adds unnecessary noise.',
  'miscategorized-decorative':
    'An image is marked as "decorative" (empty alt) but is actually the only content of a link or conveys important meaning. Screen-reader users hear "link" with no destination — the link is effectively invisible to them.',
  'alt-describes-appearance':
    'Alt text like "Spinner" or "Icon" describes what the image *is*, not what it *conveys*. Either the image is truly decorative (in which case the alt should be empty) or it\'s meaningful (in which case the alt should describe the meaning, not the medium).',
  // link-text
  'empty-link':
    'A link exists in the page but has no accessible name at all. Screen-reader users hear "link" with no destination; keyboard users reach it but can\'t tell where it goes without activating it. Many users skip such links rather than guess.',
  'generic-link-text':
    'Links labeled "Read more", "Learn more", or "Click here" give no information about their destination. When screen-reader users call up a list of links on the page (a common navigation pattern), they just see "Read more, Read more, Read more" with no way to distinguish.',
  'poor-link-text':
    'The link text is too vague or doesn\'t describe the destination clearly enough to be usable out of context.',
  'redundant-link-text':
    'Two or more links on the same page have identical visible text but go to different destinations. Users can\'t tell them apart without hovering or clicking.',
  'label-in-name-mismatch':
    'The visible text on a button (e.g., "Submit") is different from the accessible name (e.g., "Send application"). Voice-control users who say "click Submit" don\'t get a match because the voice-control system reads the accessible name, not the visible label.',
  // heading structure
  'no-h1':
    'Screen-reader users often navigate by heading structure. A page with no h1 has no identifiable top-level heading, forcing them to guess the page\'s purpose from the URL or other cues.',
  'skipped-heading-level':
    'Screen readers announce heading levels; when a page jumps from h1 to h3 with no h2, users may think they\'ve missed a section. Skipped levels break the mental map of the page.',
  'multiple-h1':
    'More than one h1 weakens the document outline. HTML5 technically permits it, but screen readers and search engines both work better with a single h1 per page.',
  'empty-heading':
    'An empty heading element is announced as "heading" with no content. Screen-reader users hear a meaningless landmark.',
  'poor-heading-text':
    'Headings labeled "More", "Welcome", or generic placeholders don\'t tell screen-reader users what each section contains, defeating the purpose of headings as navigation landmarks.',
  // keyboard
  'keyboard-trap':
    'Tab-key navigation gets stuck on an element or region and cannot move forward. Keyboard-only users (including screen-reader users) become unable to reach the rest of the page and may have to reload to escape.',
  'invisible-focus-indicator':
    'When keyboard users tab through the page, there\'s no visual indicator of which element is currently focused. They lose track of where they are — imagine typing on a form where you can\'t see which field you\'re in.',
  'focus-obscured':
    'The focused element is positioned outside the visible viewport (or hidden behind a sticky header). Keyboard users can\'t see what they\'re interacting with.',
  'illogical-focus-order':
    'Tab order moves through elements in a sequence that doesn\'t match their visual or logical layout. Users get jumped around the page unpredictably.',
  'keyboard-walk-inconclusive':
    'The automated keyboard test couldn\'t complete a full tab cycle because the page keeps injecting new focusable elements on focus (typical of mega-menus). A human reviewer needs to manually tab through the page to confirm no real traps exist.',
  // contrast
  'contrast-below-aa-normal':
    'The text is too low-contrast to read comfortably for people with low vision, color blindness, or anyone viewing the site in bright light. Users with 20/40 vision (a common level correctable with glasses) may struggle; older users commonly report eye strain.',
  'contrast-below-aa-large':
    'Large text benefits from slightly lower contrast thresholds, but even then this text doesn\'t meet the minimum. Low-vision readers can\'t read it reliably.',
  'non-text-contrast-below-aa':
    'A non-text UI component (button border, icon, form field outline) doesn\'t have enough contrast against its background. Users with low vision may not see the component at all.',
  // reflow / zoom / spacing
  'horizontal-scroll-at-400-zoom':
    'At 400% zoom (the WCAG-required zoom level for people with low vision), the page requires horizontal scrolling in addition to vertical. This breaks the reading flow for anyone who enlarges text to read.',
  'content-clipped-at-400-zoom':
    'At 400% zoom, some content is hidden or cut off. Low-vision users who zoom to read end up missing parts of the page.',
  'text-spacing-content-loss':
    'When users apply WCAG-recommended text spacing (wider line-height, letter-spacing, paragraph gaps — common for readers with dyslexia or low vision), text overflows and gets cut off. The site forces its default spacing; users who need more breathing room can\'t have it.',
  'text-spacing-not-responsive':
    'The page didn\'t reflow when text-spacing overrides were applied — either it already meets the spec (good) or its CSS uses `!important` to prevent any user overrides (bad). A human reviewer should verify which.',
  // target size
  'target-below-24px':
    'Small touch targets are hard to hit reliably, especially for people with tremors, arthritis, large fingers, or anyone using a phone. WCAG requires a 24×24 CSS pixel minimum; tiny targets lead to mis-taps and user frustration.',
  'target-below-44px':
    'WCAG AAA recommends 44×44 pixel targets. AA is satisfied at 24×24, but larger is easier for everyone.',
  // forms
  'missing-form-label':
    'A form field has no label, so screen-reader and voice-control users don\'t know what to type. Many simply skip the form entirely.',
  'label-not-associated':
    'A visible label exists near the field but isn\'t programmatically associated with it (no `for`/`id` or nesting). Screen-reader users don\'t hear the label when they reach the field.',
  'required-field-not-announced':
    'A field is marked required in styling (often with an asterisk) but lacks `required` or `aria-required` attributes. Screen-reader users don\'t know the field is required until form submission fails.',
  'missing-error-announcement':
    'When form submission fails, no error is announced via aria-live. Screen-reader users don\'t know what went wrong and may think the form is broken.',
  'vague-error-message':
    'Errors like "Invalid input" don\'t tell the user what\'s wrong or how to fix it. Users guess, make another mistake, and give up.',
  'error-not-associated-with-field':
    'The error message is on the page but not connected to the specific field via `aria-describedby`. Screen-reader users hear the general error but can\'t tell which field caused it.',
  // motion
  'motion-ignores-reduce-preference':
    'Users with vestibular disorders, migraines, or motion sensitivity can set a system preference to reduce animations. This site\'s animations ignore that preference and keep moving. Some users become physically ill.',
  'content-lost-in-forced-colors':
    'In Windows High Contrast mode (used by many low-vision users), some page content disappears because the site\'s styling relies on colors or background images that get overridden. Affected users see blank areas.',
  // consistency
  'inconsistent-navigation':
    'The site navigation differs between pages. Users who memorize where links are (especially screen-reader users and users with cognitive impairments) lose their bearings when the menu changes.',
  'inconsistent-identification':
    'The same UI component is labeled differently on different pages ("Contact" here, "Get in Touch" there). Users can\'t recognize repeated elements.',
  'inconsistent-help':
    'A help mechanism (contact link, chat widget) appears on some pages but not others, or in different positions. Users who need help can\'t reliably find it.',
  'missing-skip-link':
    'No "Skip to main content" link is available at the top of the page. Keyboard-only users have to tab through the entire header navigation on every page before reaching the main content.',
  // sensory
  'sensory-language-candidate':
    'Text refers to a visual element by its color, shape, or position only ("click the red button", "the icon in the top right"). Blind users and screen-reader users can\'t perceive color, shape, or position. Whether this is a real WCAG violation depends on whether the element can also be identified in another way.',
  // axe-detected duplicates and additional types
  'image-alt':
    'An image has no alt attribute at all. Screen-reader users hear the filename (e.g., "IMG_4381.jpg") instead of useful context. Same impact as `missing-alt`; this is the parallel finding from the axe automated check.',
  'link-name':
    'A link has no accessible name that assistive tech can determine. Screen-reader users hear "link" with no destination; keyboard users reach it but cannot tell where it goes. Same impact as `empty-link`; this is the parallel finding from the axe automated check.',
  'button-name':
    'A button has no visible text and no aria-label. Screen-reader users hear "button" with no purpose. Usually these are icon-only buttons (close, menu, search).',
  'select-name':
    'A dropdown has no associated label. Screen-reader and voice-control users cannot tell what the dropdown is for.',
  'html-has-lang':
    'The page does not declare its language. Screen readers use the language attribute to switch pronunciation profiles (English vs. Spanish, etc.); without it, announcement can be wrong or unintelligible.',
  'frame-title':
    'An embedded frame (iframe) has no title. Screen-reader users navigating frames hear only "frame" with no purpose, so they cannot tell what content the frame holds.',
  'label':
    'A form input has no associated label. Screen-reader and voice-control users cannot tell what to type in the field.',
  'aria-hidden-focus':
    'An element marked hidden from assistive tech contains something the keyboard can focus on. Screen-reader users cannot reach it even though keyboard focus lands there, which is confusing and may hide functionality.',
  'aria-prohibited-attr':
    'An ARIA attribute is being used on an element type that the spec does not allow. Screen readers may ignore the attribute, behave inconsistently, or announce garbled information.',
  'aria-valid-attr':
    'An ARIA attribute is misspelled. Browsers silently ignore misspelled ARIA attributes, so the affected interactive elements behave incorrectly for assistive tech users.',
  'nested-interactive':
    'An interactive element is inside another interactive element (a button inside a link, for example). Screen readers cannot reliably announce both; keyboard focus may behave erratically.',
  'definition-list':
    'A definition-list element contains children the HTML spec does not allow. Screen readers may announce the list incorrectly or skip content entirely.',
  'target-size':
    'A touch target is below the WCAG 2.5.8 minimum of 24×24 CSS pixels. Same impact as `target-below-24px`; this is the parallel finding from the axe automated check.',
  'link-in-text-block':
    'An inline link in a paragraph is distinguishable only by color. Color-blind and low-vision users cannot tell a link apart from surrounding text. An underline or other non-color cue is required.',
  'color-contrast':
    'Text contrast is below the WCAG AA minimum. Low-vision and color-blind users cannot read it reliably. This finding comes from the axe automated check; where our pixel-level contrast probe also ran, it is suppressed because our probe gives richer data on the same issue.',
};

export function getWhyItMatters(findingType: string): string | null {
  return WHY_IT_MATTERS[findingType] ?? null;
}

export type AffectedUserGroup =
  | 'screen-reader'
  | 'keyboard-only'
  | 'low-vision'
  | 'motion-sensitive'
  | 'color-blind';

export const AFFECTED_USER_GROUPS: Record<string, AffectedUserGroup[]> = {
  'missing-alt': ['screen-reader'],
  'poor-alt': ['screen-reader'],
  'redundant-alt': ['screen-reader'],
  'miscategorized-decorative': ['screen-reader'],
  'alt-describes-appearance': ['screen-reader'],
  'image-alt': ['screen-reader'],
  'empty-link': ['screen-reader', 'keyboard-only'],
  'link-name': ['screen-reader', 'keyboard-only'],
  'generic-link-text': ['screen-reader'],
  'poor-link-text': ['screen-reader'],
  'redundant-link-text': ['screen-reader'],
  'label-in-name-mismatch': ['screen-reader'],
  'no-h1': ['screen-reader'],
  'skipped-heading-level': ['screen-reader'],
  'multiple-h1': ['screen-reader'],
  'empty-heading': ['screen-reader'],
  'poor-heading-text': ['screen-reader'],
  'button-name': ['screen-reader'],
  'select-name': ['screen-reader'],
  'html-has-lang': ['screen-reader'],
  'frame-title': ['screen-reader'],
  'label': ['screen-reader'],
  'missing-form-label': ['screen-reader'],
  'label-not-associated': ['screen-reader'],
  'required-field-not-announced': ['screen-reader'],
  'missing-error-announcement': ['screen-reader'],
  'vague-error-message': ['screen-reader'],
  'error-not-associated-with-field': ['screen-reader'],
  'aria-hidden-focus': ['screen-reader', 'keyboard-only'],
  'aria-prohibited-attr': ['screen-reader'],
  'aria-valid-attr': ['screen-reader'],
  'nested-interactive': ['screen-reader', 'keyboard-only'],
  'definition-list': ['screen-reader'],
  'keyboard-trap': ['keyboard-only'],
  'invisible-focus-indicator': ['keyboard-only', 'low-vision'],
  'focus-obscured': ['keyboard-only'],
  'illogical-focus-order': ['keyboard-only'],
  'keyboard-walk-inconclusive': ['keyboard-only'],
  'missing-skip-link': ['keyboard-only'],
  'contrast-below-aa-normal': ['low-vision', 'color-blind'],
  'contrast-below-aa-large': ['low-vision', 'color-blind'],
  'non-text-contrast-below-aa': ['low-vision', 'color-blind'],
  'horizontal-scroll-at-400-zoom': ['low-vision'],
  'content-clipped-at-400-zoom': ['low-vision'],
  'text-spacing-content-loss': ['low-vision'],
  'text-spacing-not-responsive': ['low-vision'],
  'target-below-24px': [],
  'target-below-44px': [],
  'target-size': [],
  'motion-ignores-reduce-preference': ['motion-sensitive'],
  'content-lost-in-forced-colors': ['low-vision'],
  'link-in-text-block': ['color-blind', 'low-vision'],
  'sensory-language-candidate': ['screen-reader', 'color-blind'],
  'inconsistent-navigation': ['screen-reader'],
  'inconsistent-identification': ['screen-reader'],
  'inconsistent-help': ['screen-reader'],
  'color-contrast': ['low-vision', 'color-blind'],
};
