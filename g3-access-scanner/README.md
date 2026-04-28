# G3 Accessibility Scanner

Deterministic scanner that produces raw audit data for the G3 Accessibility audit pipeline. Output conforms to `audit-sop/00-input-contract.md` and is consumed by Claude Code following the SOP.

## Status

**13 of 15 probes** from `audit-sop/scanner-spec.md` implemented:

- `axe` — axe-core ruleset
- `a11y-tree` — Playwright accessibility tree snapshot via CDP
- `headings` — heading hierarchy + structural issues (visibility-aware)
- `target-size` — interactive element bounding-box measurement (WCAG 2.5.8), with `visually-hidden`, `zero-dimension`, `inline-text-link`, and `user-agent-control` exceptions
- `images` — image extraction with context + screenshot crops (feeds alt-text rubric)
- `links` — link extraction with context (feeds link-text rubric)
- `contrast` — pixel-level contrast (WCAG 1.4.3). Declared-color fast path for solid backgrounds, falls back to element-handle screenshot + pngjs pixel sampling for text over images/gradients/transparency.
- `keyboard-walk` — tab through every focusable element, record focus order, detect keyboard traps, invisible focus indicators, and off-viewport focus. Respects `aria-modal` (modals trap by design). Excludes sr-only elements. Unlocks WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11.
- `reflow` — sets viewport to 320×256 (equivalent to 400% zoom at 1280 px), checks document + region-level horizontal overflow. Allows tables/code/iframes to overflow per WCAG exception. WCAG 1.4.10.
- `text-spacing` — injects WCAG 1.4.12 spacing override (line-height 1.5, letter-spacing 0.12em, word-spacing 0.16em, paragraph-spacing 2em), measures layout change, flags text-bearing elements with `overflow: hidden` that now clip content. WCAG 1.4.12.
- `reduced-motion` — `emulateMedia({reducedMotion: 'reduce'})`, walks computed animation-name / transition-duration, flags elements that continue to animate >0.2s or transition >0.3s under the reduced preference. Skips essential motion (role=progressbar/status/alert). WCAG 2.2.2.
- `sensory-language` — regex scans visible text for color/shape/position-only references ("click the red button", "round icon", "click top right") and visual-verb phrasing ("as you can see"). Produces review candidates, not findings. WCAG 1.3.3.
- `consistency` — cross-page probe; runs after per-page scans. Checks skip-link presence, compares primary-nav visible-text order across pages, and dedupes help-mechanism destinations by href. Classifies nav regions by kind (primary / breadcrumb / pagination / footer) so breadcrumb-per-page differences don't produce false positives. WCAG 2.4.1, 3.2.3, 3.2.6.

Remaining (forced-colors, form errors) are specified but not yet implemented.

## Commands

```
scanner audit <url>        # run scanner, produce run directory
scanner analyze <run-dir>  # apply SOP, produce findings.json + report.md
```

## Install

```bash
cd scanner
npm install
npx playwright install chromium
npm run build
```

## Run

```bash
node dist/cli.js audit https://example.com
```

Options:

```
-o, --out-dir <path>           Output directory (default: ./runs)
-m, --max-pages <n>            Maximum pages to audit (default: 20)
-w, --viewport-width <n>       Viewport width (default: 1440)
-h, --viewport-height <n>      Viewport height (default: 900)
-t, --timeout-ms <n>           Per-page load timeout (default: 30000)
-p, --probes <list>            Comma-separated probe list (default: all)
```

## Output

Produces a run directory per `audit-sop/00-input-contract.md`:

```
runs/<site-slug>/<run-id>/
├── manifest.json
├── summary.json
└── pages/<url-slug>/
    ├── axe.json
    ├── a11y-tree.json
    ├── headings.json
    ├── target-size.json
    ├── images.json
    ├── links.json
    └── screenshots/
        ├── default.png
        └── images/*.png
```

## Next steps

1. Implement remaining 8 probes (keyboard walker is the next highest-value — unlocks 5 SCs at once).
2. Run against more Group 3 sites to surface more patterns for the noise filter.
3. Add PDF rendering to the analyze step (`page.pdf()` from headless Chromium).
4. Build test fixtures (a Playwright-hosted site with seeded violations) for probe acceptance tests.
