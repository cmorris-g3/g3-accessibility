<?php

namespace G3\Access\Support;

/**
 * Curated plain-language guidance per finding rule.
 *
 * Each entry provides:
 *   - why:       1–3 sentences explaining WHY this typically fires, with common causes woven in.
 *   - fix_steps: ordered, actionable steps to resolve it.
 *
 * Keyed by both internal finding_type names and axe-core rule IDs. Unknown rules fall back to
 * the axe helpUrl (if any) + the one-liner rationale the scanner emitted.
 */
class FindingGuidance
{
    public static function lookup(string $rule): ?array
    {
        return self::MAP[$rule] ?? null;
    }

    private const MAP = [
        // ─────────────────────────────────────────────────────────────
        // Alt text / images
        // ─────────────────────────────────────────────────────────────
        'missing-alt' => [
            'why' => 'The image has no alt attribute at all. Screen readers typically announce the filename instead, which is usually meaningless noise. Every <img> needs an alt — use alt="" (empty) for purely decorative images so screen readers skip them.',
            'fix_steps' => [
                'Decide: does this image convey meaning, or is it purely decorative?',
                'If meaningful: add alt="..." describing what the image shows or its purpose in the page.',
                'If decorative (icons, separators, backgrounds): add alt="" (empty, not missing).',
                'In the WP Media Library, the "Alternative Text" field writes this attribute.',
            ],
        ],
        'image-alt' => [
            'why' => 'Axe could not find an accessible name for this image. That usually means the alt attribute is missing entirely. If the image is decorative, it still needs alt="" explicitly — a missing alt is different from an empty alt.',
            'fix_steps' => [
                'Add an alt attribute. Use alt="" for decorative images, alt="description" for meaningful ones.',
                'For SVGs used as images, add role="img" and an accessible name (aria-label or <title> inside the SVG).',
                'If the image is inside a link with no other text, the alt must describe the link destination, not the image.',
            ],
        ],
        'alt-describes-appearance' => [
            'why' => 'The alt text describes what the image looks like ("icon", "photo", "graphic") rather than what it means. If the image is functional, the alt should convey its purpose; if it is decorative, it should be alt="".',
            'fix_steps' => [
                'If the image is purely decorative, change alt to "" (empty).',
                'If the image is meaningful, rewrite the alt to describe content or purpose, not appearance.',
            ],
        ],
        'redundant-alt' => [
            'why' => 'The alt text repeats adjacent link text verbatim, so screen readers announce the same information twice. Functional icons next to their own text labels should use alt="" so the label is read once.',
            'fix_steps' => [
                'Set alt="" on the image — the adjacent link/button text already provides the accessible name.',
            ],
        ],
        'miscategorized-decorative' => [
            'why' => 'The image has alt="" (marked decorative) but it is the only content inside a link — so the link has no accessible name at all. A decorative image cannot be the sole content of an interactive element.',
            'fix_steps' => [
                'Give the image a real alt describing the link destination, OR',
                'Keep the image decorative and add aria-label on the <a> describing the destination.',
            ],
            'note' => 'You may also see empty-link or link-name findings on the wrapping <a>. Giving the image/link a name resolves all of them together.',
        ],
        'role-img-alt' => [
            'why' => 'An element with role="img" has no accessible name. The role tells assistive tech "this is an image", but there is nothing for it to announce.',
            'fix_steps' => [
                'Add aria-label or aria-labelledby to the element, OR replace the custom role with an appropriate semantic element (<img>, <svg> with <title>).',
            ],
        ],
        'svg-img-alt' => [
            'why' => 'An SVG used as an image has no accessible name. Decorative SVGs should be hidden; meaningful SVGs need a label.',
            'fix_steps' => [
                'If decorative: add aria-hidden="true" or focusable="false" and role="presentation".',
                'If meaningful: add role="img" plus aria-label="description" OR a <title> element as the first child of the <svg>.',
            ],
        ],
        'area-alt' => [
            'why' => 'An <area> inside an image map has no alt text. Each clickable region of an image map must describe where it leads.',
            'fix_steps' => ['Add alt="..." to every <area> inside the map, describing the destination.'],
        ],
        'object-alt' => [
            'why' => 'An <object> element has no alternative text. Screen readers cannot announce what it contains.',
            'fix_steps' => ['Add fallback text inside the <object> tag, or an aria-label attribute.'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Links & buttons
        // ─────────────────────────────────────────────────────────────
        'empty-link' => [
            'why' => 'The link has no visible text, no aria-label, and no image with alt text inside it. Screen readers will announce the raw URL or just "link", which is not useful.',
            'fix_steps' => [
                'Add visible text inside the <a>, OR',
                'Add aria-label="Describe the destination" on the <a>, OR',
                'If the link wraps an icon, give the icon meaningful alt text or aria-label the link.',
            ],
            'note' => 'If the link wraps an image with alt="", you may also see a miscategorized-decorative finding. Giving the image or link an accessible name resolves both.',
        ],
        'link-name' => [
            'why' => 'Axe could not find an accessible name for this link. Common causes: the <a> wraps only an image with empty alt; the only text is hidden; or the link is visually styled from CSS ::before/::after which screen readers do not read.',
            'fix_steps' => [
                'Add visible text inside the <a>.',
                'If the link uses an icon-only design, add aria-label="Destination" on the <a>.',
                'Avoid putting link text only in CSS pseudo-elements — they are not announced by screen readers.',
            ],
            'note' => 'If the link contains a decorative image, you may also see miscategorized-decorative or empty-link findings. One fix resolves all related findings.',
        ],
        'generic-link-text' => [
            'why' => 'The link text ("click here", "read more", "learn more", etc.) does not describe the destination. Screen-reader users often pull up a links list; generic text gives them no way to choose.',
            'fix_steps' => [
                'Rewrite the link text to describe the destination ("Read our pricing guide", "Contact support").',
                'If visual design requires short text, add aria-label on the <a> with the descriptive version and keep the short visible text.',
            ],
        ],
        'redundant-link-text' => [
            'why' => 'Two or more links on the page share the same accessible name but point to different URLs. A user hearing "Read more" five times in a links list cannot tell them apart.',
            'fix_steps' => [
                'Give each link distinct text that identifies what it links to.',
                'If visible text must repeat, add aria-label on each link with destination-specific context.',
            ],
        ],
        'label-in-name-mismatch' => [
            'why' => 'The aria-label does not contain the visible text. Voice-control users speak what they see ("click Submit"); if aria-label is "Send message", the command does not match and fails.',
            'fix_steps' => [
                'Make sure the aria-label contains the visible text as a substring. Example: if the button shows "Submit", aria-label should be "Submit" or "Submit form" — not "Send".',
                'If you do not need to override the name, remove the aria-label entirely.',
            ],
        ],
        'button-name' => [
            'why' => 'The button has no accessible name. If it contains only an icon or image with no alt text, screen readers announce "button" with no context.',
            'fix_steps' => [
                'Add visible text inside the <button>, OR',
                'Add aria-label="Action name" on the <button> if the button is icon-only.',
            ],
        ],
        'input-button-name' => [
            'why' => 'An <input type="button|submit|reset"> has no value and no accessible name.',
            'fix_steps' => [
                'Add a value attribute: <input type="submit" value="Submit">',
                'Or add aria-label on the input.',
            ],
        ],
        'link-in-text-block' => [
            'why' => 'Links inside a paragraph are not visually distinguishable from surrounding text — no underline, and the color contrast with adjacent text is too low. Users who do not see color can miss that text is clickable.',
            'fix_steps' => [
                'Add text-decoration: underline on in-text links, OR',
                'Ensure link color has at least 3:1 contrast against adjacent non-link text AND the link has a non-color indicator on :hover and :focus.',
            ],
        ],
        'nested-interactive' => [
            'why' => 'One interactive element is nested inside another — for example a <button> inside an <a>, or a <a> inside a <button>. Keyboard and screen-reader behavior becomes unpredictable.',
            'fix_steps' => [
                'Pick one interactive element and flatten the markup — do not nest <a> inside <button> or vice versa.',
                'If you need both behaviors, render them as siblings, not parent/child.',
            ],
            'note' => 'This rule fires on the outer element, but the inner element may also show up in link-name or button-name findings. Flattening the nesting typically resolves all of them.',
        ],

        // ─────────────────────────────────────────────────────────────
        // Headings / structure
        // ─────────────────────────────────────────────────────────────
        'no-h1' => [
            'why' => 'The page has no visible <h1>. Screen-reader users rely on the h1 as the top-level identifier of page content. WordPress themes sometimes render the post title as an h1 in a way that gets hidden; check both.',
            'fix_steps' => [
                'Add exactly one <h1> describing the page content. Usually this is the post/page title.',
                'If the theme hides the title, either unhide it or add a visible <h1> in the page content.',
            ],
        ],
        'page-has-heading-one' => [
            'why' => 'Same as no-h1 — axe could not find an <h1> on the page.',
            'fix_steps' => ['Add a single <h1> that names the page.'],
        ],
        'multiple-h1' => [
            'why' => 'The page has more than one <h1>. HTML5 technically allows this, but screen readers and heading navigation tools work best when there is exactly one top-level heading per page.',
            'fix_steps' => [
                'Keep one <h1> (usually the page/post title).',
                'Demote the others to <h2> or lower.',
            ],
        ],
        'skipped-heading-level' => [
            'why' => 'Heading levels jump by more than one (e.g., <h2> directly to <h4>). Users navigating by headings cannot tell whether the <h4> is meant to be a subheading of the <h2> or whether they missed content.',
            'fix_steps' => [
                'Renumber the heading so levels descend by one at most (h2 → h3, not h2 → h4).',
                'If the lower-level heading is only styled that way, use CSS — do not change the semantic level.',
            ],
        ],
        'heading-order' => [
            'why' => 'Heading levels do not descend in order somewhere on the page. Same concern as skipped-heading-level.',
            'fix_steps' => ['Ensure every heading is at most one level deeper than the previous heading.'],
        ],
        'empty-heading' => [
            'why' => 'A heading element exists in the DOM but has no text content. Screen readers announce "heading" with nothing after, which is confusing.',
            'fix_steps' => [
                'Add text to the heading, OR',
                'Remove the empty heading element entirely.',
                'If the heading contains an icon/image, give the icon alt text so the heading has a name.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Forms
        // ─────────────────────────────────────────────────────────────
        'label' => [
            'why' => 'A form field has no associated <label>. Screen-reader users cannot tell what to enter. A placeholder is not a label — it disappears when the user starts typing.',
            'fix_steps' => [
                'Wrap a <label> around the input, OR use <label for="input-id"> pointing at the input.',
                'If a visible label is not desired by design, use aria-label or aria-labelledby on the input — but prefer a real label.',
                'Do not rely on placeholder text alone.',
            ],
        ],
        'label-title-only' => [
            'why' => 'The only label for this input comes from the title attribute. Title attributes are not announced by most screen readers and only appear as desktop tooltips, so they are not an accessible label.',
            'fix_steps' => ['Add a real <label>, aria-label, or aria-labelledby for the input.'],
        ],
        'form-field-multiple-labels' => [
            'why' => 'The input has more than one label associated with it. Screen readers may read only one, or read them in unpredictable order.',
            'fix_steps' => ['Remove extra labels so each input has exactly one.'],
        ],
        'select-name' => [
            'why' => 'A <select> element has no accessible name.',
            'fix_steps' => ['Add a <label> for the select, or an aria-label / aria-labelledby attribute.'],
        ],
        'autocomplete-valid' => [
            'why' => 'The autocomplete attribute value is not from the HTML spec\'s allowed list. Browsers and password managers rely on valid values to auto-fill correctly.',
            'fix_steps' => ['Use a spec-valid value (e.g., "email", "given-name", "postal-code") — full list in the HTML Living Standard.'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Landmarks / structure
        // ─────────────────────────────────────────────────────────────
        'landmark-one-main' => [
            'why' => 'The page either has no <main> landmark or has more than one. Screen-reader users use the main landmark to skip past header/nav and jump to content.',
            'fix_steps' => [
                'Wrap the page\'s primary content in <main>. Every page should have exactly one.',
                'If multiple <main> elements exist, keep one and change the rest to <section>, <article>, or <div>.',
            ],
        ],
        'region' => [
            'why' => 'Content on the page is not contained inside a landmark (<header>, <nav>, <main>, <footer>, <aside>, or an element with role="region"). Screen-reader users navigating by landmark will miss this content.',
            'fix_steps' => [
                'Wrap the stray content in an appropriate landmark element.',
                'If no standard landmark fits, use role="region" with an aria-label describing its purpose.',
            ],
        ],
        'bypass' => [
            'why' => 'The page has no way to skip past repeated blocks like navigation. Keyboard users have to Tab through the entire header on every page load.',
            'fix_steps' => [
                'Add a skip link as the first focusable element: <a class="skip-link" href="#main">Skip to main content</a>.',
                'Make sure the skip link becomes visible on focus and that #main is a valid target on the page.',
            ],
        ],
        'missing-skip-link' => [
            'why' => 'No skip link detected on this page. Keyboard users have to tab through header navigation on every page load.',
            'fix_steps' => [
                'Add <a href="#main">Skip to main content</a> as the first focusable element in the <body>.',
                'Style it so it becomes visible on :focus.',
                'Ensure there is an element with id="main" (or matching target) for it to jump to.',
            ],
        ],
        'skip-link' => [
            'why' => 'The skip link exists but its target does not — clicking it does nothing useful.',
            'fix_steps' => ['Ensure the element with the matching id exists on every page, typically the <main> landmark.'],
        ],
        'list' => [
            'why' => 'A <ul> or <ol> contains children that are not <li>. The list structure is broken for screen readers.',
            'fix_steps' => [
                'Move non-<li> children out of the list (usually into wrapping elements around the list).',
                'WordPress plugins that inject tracking scripts or style tags directly into menus are a common culprit.',
            ],
            'note' => 'This may appear together with listitem findings on the stray children. Fixing the list structure resolves both.',
        ],
        'listitem' => [
            'why' => 'An <li> is not inside a functioning list. This can fire even when the <li> IS inside a <ul>/<ol> — if the parent has role="menu", role="presentation", or role="none", the list semantics are removed. When a parent has role="menu", every child must have a menu role (menuitem, menuitemcheckbox, menuitemradio).',
            'fix_steps' => [
                'Check the direct parent. Is it a <ul> or <ol> with no role override?',
                'If parent has role="menu": add role="menuitem" to the flagged <li> to match its siblings. (WP site navigation usually does NOT need role="menu" — consider removing it instead.)',
                'If parent has role="presentation": remove the role, or restructure so the <li> is inside a real list.',
                'If the <li> is outside any list: wrap it in a <ul>/<ol>, or change the element to a <div>.',
            ],
            'note' => 'This often appears together with aria-required-children on the parent <ul>. Both findings share the same root cause — fixing one typically resolves the other.',
        ],
        'dlitem' => [
            'why' => 'A <dt> or <dd> is not inside a <dl>. Description list semantics only work when the terms and definitions are inside a <dl>.',
            'fix_steps' => ['Wrap <dt>/<dd> pairs in a <dl>, or change them to non-definition-list elements.'],
            'note' => 'May appear together with definition-list on the surrounding element. Fixing the wrapping structure resolves both.',
        ],
        'definition-list' => [
            'why' => 'A <dl> contains children other than <dt>/<dd>. The description list is malformed.',
            'fix_steps' => ['Move non-<dt>/<dd> elements outside the <dl>.'],
            'note' => 'May appear together with dlitem findings on the children. Both describe the same broken structure.',
        ],

        // ─────────────────────────────────────────────────────────────
        // Tables
        // ─────────────────────────────────────────────────────────────
        'td-headers-attr' => [
            'why' => 'A <td>\'s headers attribute references an id that does not exist, or points to something that is not a <th>. Screen readers cannot associate the cell with its header.',
            'fix_steps' => [
                'Verify every id in the headers attribute exists and is on a <th>.',
                'Or remove the headers attribute and use scope="col"/"row" on the <th> cells instead — simpler for most tables.',
            ],
        ],
        'th-has-data-cells' => [
            'why' => 'A <th> has no data cells that reference it. Either the table structure is wrong, or the header is an orphan from edited content.',
            'fix_steps' => [
                'Ensure every column/row with a <th> actually has <td> cells underneath or beside it.',
                'If the <th> is not a header for any data, change it to a <td>.',
            ],
        ],
        'scope-attr-valid' => [
            'why' => 'A scope attribute has a value other than col, row, colgroup, or rowgroup.',
            'fix_steps' => ['Use one of: scope="col", scope="row", scope="colgroup", or scope="rowgroup". Remove the attribute if none apply.'],
        ],
        'table-fake-caption' => [
            'why' => 'The table uses a <th> or styled row as a caption instead of a proper <caption> element.',
            'fix_steps' => ['Replace the fake caption with <caption>Table name</caption> as the first child of <table>.'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Language
        // ─────────────────────────────────────────────────────────────
        'html-has-lang' => [
            'why' => 'The <html> tag has no lang attribute. Screen readers need this to choose the right voice and pronunciation rules.',
            'fix_steps' => [
                'Add lang to the <html> tag, e.g., <html lang="en">.',
                'In WordPress, the site language set in Settings → General is written into the <html lang> attribute via language_attributes() — verify the theme uses it.',
            ],
        ],
        'html-lang-valid' => [
            'why' => 'The <html lang> attribute is set but the value is not a valid BCP-47 language tag.',
            'fix_steps' => ['Use a valid tag like "en", "en-US", "fr", "es-MX" — see the IANA language subtag registry.'],
        ],
        'html-xml-lang-mismatch' => [
            'why' => 'The <html> tag has both lang and xml:lang but they do not match.',
            'fix_steps' => ['Make them identical, or drop xml:lang (it is rarely needed for HTML5).'],
        ],
        'valid-lang' => [
            'why' => 'A lang attribute somewhere on the page has an invalid value.',
            'fix_steps' => ['Use a BCP-47 language tag (e.g., "fr", "es-MX").'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Document
        // ─────────────────────────────────────────────────────────────
        'document-title' => [
            'why' => 'The page has no <title> element, or it is empty. Browser tabs, bookmarks, and screen-reader page announcements all depend on it.',
            'fix_steps' => ['Ensure the theme outputs <title>...</title> in the <head>. WordPress does this automatically if the theme calls wp_head().'],
        ],
        'meta-refresh' => [
            'why' => 'The page uses <meta http-equiv="refresh"> to redirect or reload. This can disorient users, especially those using screen readers or zoom.',
            'fix_steps' => ['Use a server-side redirect (301/302) instead, or a user-initiated action.'],
        ],
        'meta-viewport' => [
            'why' => 'The viewport meta tag prevents users from zooming (user-scalable=no or maximum-scale=1). Users with low vision may need to zoom to 200%+ to read.',
            'fix_steps' => ['Remove user-scalable=no and any maximum-scale below 5 from the meta viewport tag.'],
        ],
        'frame-title' => [
            'why' => 'An <iframe> has no title. Screen-reader users cannot tell what the frame contains.',
            'fix_steps' => [
                'Add title="Description of frame content" to each <iframe>.',
                'For YouTube/Vimeo embeds, describe the video (e.g., title="Video: How to register").',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // ARIA
        // ─────────────────────────────────────────────────────────────
        'aria-allowed-attr' => [
            'why' => 'An element has an ARIA attribute that is not allowed on its role. For example, aria-checked on a role="button" is invalid (it is valid on role="checkbox").',
            'fix_steps' => [
                'Check the ARIA spec for which attributes are valid on the element\'s role.',
                'Remove the invalid attribute, or change the role to one that supports it.',
            ],
        ],
        'aria-allowed-role' => [
            'why' => 'An element has a role that is not allowed on this HTML element. For example, role="button" on an <a> with href is allowed, but role="heading" on a <nav> is not.',
            'fix_steps' => [
                'Remove the role, and use a semantic element that has the role natively (e.g., real <button> instead of role="button" on a <div>).',
                'Or change the element to one that supports the role.',
            ],
        ],
        'aria-hidden-body' => [
            'why' => 'aria-hidden="true" is applied to the <body> element. That hides the entire page from assistive tech — almost always a mistake, usually caused by a modal library that forgets to remove it.',
            'fix_steps' => [
                'Remove aria-hidden from <body>.',
                'If a modal requires hiding the rest of the page, use inert on the background instead.',
            ],
        ],
        'aria-hidden-focus' => [
            'why' => 'An element with aria-hidden="true" contains focusable content. Keyboard users can still tab to it even though screen readers ignore it — a silent dead-end.',
            'fix_steps' => [
                'Make the focusable children non-focusable (tabindex="-1" or add inert on the parent).',
                'Or remove aria-hidden if the content should be available.',
            ],
        ],
        'aria-required-attr' => [
            'why' => 'An element has a role that requires certain ARIA attributes, and one or more are missing. For example, role="slider" requires aria-valuemin, aria-valuemax, and aria-valuenow.',
            'fix_steps' => [
                'Check the ARIA spec for the role to see required attributes.',
                'Add the missing attributes, or remove the role and use a native element.',
            ],
        ],
        'aria-required-children' => [
            'why' => 'The role requires specific child roles, and at least one direct child does not satisfy the contract. Example: role="menubar" requires role="menuitem" children. A <ul role="menu"> with even one <li> that has no role falls afoul of this.',
            'fix_steps' => [
                'Add the required child role to every direct child that is missing it.',
                'Or remove the role from the parent — often the simplest fix is to drop role="menu" from site navigation, since plain <ul> works better there anyway.',
            ],
            'note' => 'This often appears together with listitem or aria-required-parent findings on the children. All three describe the same broken parent/child contract — fixing one typically resolves the others.',
        ],
        'aria-required-parent' => [
            'why' => 'The role requires a specific parent role. Example: role="menuitem" must be inside role="menu" or role="menubar". The element has declared a role whose parent contract is not satisfied.',
            'fix_steps' => [
                'Add the required role to the parent.',
                'Or change the role on this element to one that fits the actual parent.',
            ],
            'note' => 'This often appears together with aria-required-children on the parent. Fixing the parent\'s role typically resolves both.',
        ],
        'aria-roles' => [
            'why' => 'The role attribute contains a value that is not a valid ARIA role.',
            'fix_steps' => [
                'Check for typos (role="buton" → "button"), or remove the role entirely if the native element already provides the right semantics.',
            ],
        ],
        'aria-valid-attr' => [
            'why' => 'An attribute starting with aria- is not a valid ARIA attribute (typo, deprecated, or made up).',
            'fix_steps' => ['Check the attribute name against the ARIA spec, fix typos, or remove the attribute if it has no standard meaning.'],
        ],
        'aria-valid-attr-value' => [
            'why' => 'An ARIA attribute has a value outside its allowed set. Example: aria-checked="yes" (valid values are "true"/"false"/"mixed").',
            'fix_steps' => ['Check the ARIA spec for the attribute\'s allowed values and correct the value.'],
        ],
        'aria-input-field-name' => [
            'why' => 'An element with role="textbox" or a similar input role has no accessible name.',
            'fix_steps' => ['Add aria-label, aria-labelledby, or an associated <label>.'],
        ],
        'aria-toggle-field-name' => [
            'why' => 'A toggle control (role="checkbox", "switch", "menuitemcheckbox", etc.) has no accessible name.',
            'fix_steps' => ['Add visible text inside the control or an aria-label / aria-labelledby.'],
        ],
        'presentation-role-conflict' => [
            'why' => 'An element has role="presentation" or role="none" but also has focusable children, other ARIA attributes, or is itself focusable. Those conflict — presentation means "ignore this element\'s semantics", but the element is still actively interactive.',
            'fix_steps' => [
                'Remove role="presentation"/"none" if the element needs semantics.',
                'Or remove the focusable children / other ARIA attributes if the element should truly be ignored.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Duplicate IDs
        // ─────────────────────────────────────────────────────────────
        'duplicate-id' => [
            'why' => 'Two or more elements share the same id attribute. HTML requires ids to be unique.',
            'fix_steps' => ['Find the duplicates and make each id unique, or remove the id from elements that do not need one.'],
        ],
        'duplicate-id-active' => [
            'why' => 'Two or more ACTIVE (focusable/interactive) elements share the same id. label associations and aria-labelledby break silently.',
            'fix_steps' => ['Make each id unique.'],
        ],
        'duplicate-id-aria' => [
            'why' => 'Two or more elements that are referenced by ARIA (via aria-labelledby, aria-describedby, aria-controls) share the same id. The ARIA reference becomes ambiguous.',
            'fix_steps' => ['Make each id unique so ARIA references point to exactly one element.'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Keyboard / focus (our internal types)
        // ─────────────────────────────────────────────────────────────
        'keyboard-trap' => [
            'why' => 'The keyboard walker got stuck — Tab did not move focus out of an element or modal. Users without a mouse cannot proceed past this point.',
            'fix_steps' => [
                'Ensure every focusable element can be left with Tab/Shift-Tab and (for modals) Esc.',
                'If this is a modal, use aria-modal="true" and implement a focus trap that releases on close — not one that blocks Tab entirely.',
                'If this is a scroller/slider, add keyboard handlers that move focus past it.',
            ],
        ],
        'invisible-focus-indicator' => [
            'why' => 'When the element is focused, there is no visible indicator (no outline, box-shadow, or border change). Keyboard users cannot tell which element has focus.',
            'fix_steps' => [
                'Add a :focus or :focus-visible style: outline, box-shadow, or a strong background change.',
                'Do not use outline: none without a replacement indicator.',
                'Third-party widgets (cookie banners, chat) are common culprits — verify the vendor provides a focus indicator before ignoring.',
            ],
        ],
        'focus-obscured' => [
            'why' => 'The focused element is outside the viewport and the page did not scroll it into view. Keyboard users cannot see what has focus.',
            'fix_steps' => [
                'Ensure focused elements scroll into view.',
                'Check that sticky headers/footers do not hide the focused element (use scroll-margin or CSS scroll-padding).',
            ],
        ],
        'keyboard-walk-inconclusive' => [
            'why' => 'The scanner hit its step cap walking through focusable elements. This usually means menus inject new focusable items on focus, preventing the walker from finishing. Manual keyboard testing is needed to be sure.',
            'fix_steps' => [
                'Manually Tab through the page end-to-end. Can you reach everything?',
                'Check whether hover/focus-triggered menus keep adding focusable items — dropdowns that do this confuse both the scanner AND real users.',
            ],
        ],
        'tabindex' => [
            'why' => 'An element has tabindex greater than 0 (e.g., tabindex="5"). Positive tabindex overrides natural DOM order, causing focus to jump around unpredictably.',
            'fix_steps' => [
                'Change the tabindex to 0 (keeps it focusable in DOM order) or -1 (focusable only via script).',
                'Rearrange the DOM if focus order needs to change — never use positive tabindex for that.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Contrast (ours + axe)
        // ─────────────────────────────────────────────────────────────
        'contrast-below-aa-normal' => [
            'why' => 'The text has insufficient contrast against its background. WCAG 1.4.3 requires at least 4.5:1 for normal-size text.',
            'fix_steps' => [
                'Darken the foreground or lighten the background until the ratio meets 4.5:1.',
                'Use a contrast checker (WebAIM, Stark) to pick accessible color pairs.',
                'If the background is an image or gradient, add a solid overlay or text-shadow to stabilize contrast.',
            ],
        ],
        'contrast-below-aa-large' => [
            'why' => 'Large text (18pt+ or 14pt+ bold) has insufficient contrast. WCAG 1.4.3 requires at least 3:1 for large text.',
            'fix_steps' => ['Adjust foreground or background colors to reach 3:1.'],
        ],
        'color-contrast' => [
            'why' => 'Text does not have enough contrast against its background. Usually fires on low-contrast links, placeholder text, or light-on-light buttons.',
            'fix_steps' => [
                'Required ratios: 4.5:1 for normal text, 3:1 for text 18pt+ or 14pt+ bold.',
                'Use a contrast checker to find accessible color pairs.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Target size
        // ─────────────────────────────────────────────────────────────
        'target-below-24px' => [
            'why' => 'The clickable target is smaller than 24×24 CSS pixels. Users with motor difficulties, on touch devices, or using a mouse with a tremor often miss targets this small.',
            'fix_steps' => [
                'Increase padding or min-width/min-height on the target to reach 24×24 CSS px.',
                'If the target size cannot change (e.g., inline link in a paragraph), ensure surrounding whitespace of at least 24 CSS px so the target is isolated — or add an aria-label to a nearby larger hit area.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Motion / zoom / spacing
        // ─────────────────────────────────────────────────────────────
        'motion-ignores-reduce-preference' => [
            'why' => 'The element continues to animate even when the user has set prefers-reduced-motion: reduce at the OS level. Users sensitive to motion (vestibular disorders, migraines) have opted out, but the page ignores them.',
            'fix_steps' => [
                'Wrap non-essential animations in @media (prefers-reduced-motion: reduce) and disable them. A catch-all: * { animation: none !important; transition: none !important; }',
                'For carousels/sliders, pause auto-advance when reduce is set.',
                'This is a theme-wide fix — one CSS rule usually addresses all findings of this type.',
            ],
        ],
        'horizontal-scroll-at-400-zoom' => [
            'why' => 'At 320 CSS-pixel viewport (equivalent to zooming to 400% on a 1280-px screen), the page requires horizontal scrolling. WCAG 1.4.10 requires content to reflow without loss.',
            'fix_steps' => [
                'Remove fixed widths on containers. Use max-width and percentage/viewport units.',
                'Add a responsive breakpoint at 320 px if not already present.',
                'Watch for wide images or tables that push layout wider than the viewport.',
            ],
        ],
        'content-clipped-at-400-zoom' => [
            'why' => 'A specific region of the page overflows its container and gets clipped when zoomed to 400%. Content is hidden behind other elements or outside the viewport.',
            'fix_steps' => [
                'Remove fixed widths on the region.',
                'Replace overflow: hidden with overflow: auto or visible if the content may legitimately expand.',
                'For data tables, allow horizontal scroll within the table — that is an allowed exception.',
            ],
        ],
        'text-spacing-content-loss' => [
            'why' => 'Applying WCAG 1.4.12 text-spacing overrides (line-height 1.5, letter-spacing 0.12em, etc.) causes content in this element to clip. Users who need more spacing for readability lose content.',
            'fix_steps' => [
                'Remove fixed heights on text containers — let them grow.',
                'Replace overflow: hidden with overflow: visible or overflow: auto on text-bearing elements.',
            ],
        ],
        'text-spacing-not-responsive' => [
            'why' => 'The page did not reflow at all when text-spacing overrides were applied. Either the page already meets the spacing (fine), or stylesheets use !important to block user overrides (problem).',
            'fix_steps' => [
                'Check your theme/plugin CSS for !important on line-height, letter-spacing, or word-spacing.',
                'Remove the !important unless there is a compelling reason — it blocks user accessibility preferences.',
            ],
        ],

        // ─────────────────────────────────────────────────────────────
        // Sensory / consistency (ours)
        // ─────────────────────────────────────────────────────────────
        'sensory-language-candidate' => [
            'why' => 'The text contains an instruction that relies on a sensory characteristic ("click the red button", "see the icon on the right", "as shown below"). Users who cannot perceive that characteristic — color-blind users, screen-reader users, users of reflowed content — cannot follow. This is a candidate for human review; whether it actually fails WCAG 1.3.3 depends on whether the target has an alternative identifier.',
            'fix_steps' => [
                'Read the instruction in context. Can a user who cannot see the color/shape/position still identify the target?',
                'If not, add a non-sensory identifier: "click the red Submit button" instead of just "click the red button".',
                'If yes, this is a false positive — mark it ignored.',
            ],
        ],
        'inconsistent-navigation' => [
            'why' => 'The primary navigation differs between pages. WCAG 3.2.3 requires that navigation components appearing on multiple pages do so in the same relative order.',
            'fix_steps' => [
                'Review the differences. If a page genuinely needs different nav items, move them out of the primary nav into a page-specific section.',
                'If the inconsistency is a bug (missing/extra item on one page), fix the nav config.',
            ],
        ],
        'inconsistent-help' => [
            'why' => 'A help mechanism (contact link, chat widget, FAQ link) is present on some pages but not others, or appears in different positions. WCAG 3.2.6 requires consistent placement across pages.',
            'fix_steps' => ['Add the help mechanism to every page in the same relative position, or remove it from pages where it does not belong.'],
        ],

        // ─────────────────────────────────────────────────────────────
        // Media
        // ─────────────────────────────────────────────────────────────
        'video-caption' => [
            'why' => 'A <video> element has no caption track. Deaf and hard-of-hearing users cannot follow the audio.',
            'fix_steps' => [
                'Add a <track kind="captions" srclang="en" src="..."> inside the <video>.',
                'For YouTube/Vimeo embeds, enable captions and use a player that surfaces them.',
            ],
        ],
        'audio-caption' => [
            'why' => 'An <audio> element has no caption/transcript. Deaf users cannot consume the content.',
            'fix_steps' => [
                'Provide a visible transcript below the audio player, OR',
                'Add a <track kind="captions"> if the audio is time-synchronized with captions.',
            ],
        ],
    ];
}
