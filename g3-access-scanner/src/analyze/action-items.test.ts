import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Finding } from '../types.js';
import { selectActionItems, renderActionItems, extractImageSrc } from './action-items.js';
import type { Manifest } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFinding(opts: {
  finding_type: string;
  url: string;
  severity?: Finding['severity'];
  target?: string;
  current_value?: string;
  suggested_fix?: string;
  fingerprint?: string;
  wcag?: string;
  context?: Record<string, unknown>;
}): Finding {
  return {
    check: opts.finding_type,
    source: 'rubric',
    finding_type: opts.finding_type,
    url: opts.url,
    target: opts.target ?? null,
    severity: opts.severity ?? 'serious',
    wcag: opts.wcag ?? 'WCAG 2.2 SC 1.0.0',
    rationale: '',
    current_value: opts.current_value ?? null,
    suggested_fix: opts.suggested_fix ?? null,
    confidence: 'high',
    fingerprint: opts.fingerprint,
    context: opts.context,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('instance findings with distinct (selector, content) emit one task each', () => {
  const findings = [
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a', target: 'main > img:nth-child(1)', current_value: '<img src="a.png">' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/b', target: 'main > img:nth-child(2)', current_value: '<img src="b.png">' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/c', target: 'main > img:nth-child(3)', current_value: '<img src="c.png">' }),
  ];

  const items = selectActionItems(findings, 3);
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(item.level, 'instance');
    assert.equal(item.covers_findings, 1);
    assert.equal(item.pages_affected, 1);
  }
  const urls = items.map((i) => i.url);
  assert.deepEqual(urls.sort(), ['https://x.test/a', 'https://x.test/b', 'https://x.test/c']);
});

test('instance findings with same (selector, content) across pages collapse to one task', () => {
  // The exact pattern that bit the user — same masthead logo (same selector,
  // same img src in current_value) showing up on every page.
  const sharedSelector = 'header > .logo > a';
  const sharedHtml = '<a href="/"><img alt="" src="https://cdn.test/logo.png"></a>';
  const findings = [
    makeFinding({ finding_type: 'miscategorized-decorative', url: 'https://x.test/', target: sharedSelector, current_value: sharedHtml }),
    makeFinding({ finding_type: 'miscategorized-decorative', url: 'https://x.test/about', target: sharedSelector, current_value: sharedHtml }),
    makeFinding({ finding_type: 'miscategorized-decorative', url: 'https://x.test/services', target: sharedSelector, current_value: sharedHtml }),
    makeFinding({ finding_type: 'miscategorized-decorative', url: 'https://x.test/contact', target: sharedSelector, current_value: sharedHtml }),
  ];

  const items = selectActionItems(findings, 4);
  assert.equal(items.length, 1, 'should collapse 4 findings to one task');
  assert.equal(items[0].level, 'instance');
  assert.equal(items[0].pages_affected, 4);
  assert.equal(items[0].covers_findings, 4);
  assert.equal(items[0].affected_urls.length, 4);
});

test('template finding type emits one task covering all instances', () => {
  // no-focus-indicator is template-level. 8 findings → 1 task.
  const findings = Array.from({ length: 8 }, (_, i) =>
    makeFinding({
      finding_type: 'no-focus-indicator',
      url: `https://x.test/${i % 4}`,
    }),
  );

  const items = selectActionItems(findings, 4);
  const focusTasks = items.filter((i) => i.finding_type === 'no-focus-indicator');
  assert.equal(focusTasks.length, 1, 'one template task for the type');
  assert.equal(focusTasks[0].level, 'template');
  assert.equal(focusTasks[0].covers_findings, 8);
  assert.equal(focusTasks[0].pages_affected, 4);
  assert.equal(focusTasks[0].url, null, 'template tasks have no single URL');
});

test('mixed instance + template tasks coexist in one selection', () => {
  const findings = [
    // 3 missing-alt findings on DIFFERENT elements → 3 instance tasks
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a', target: 'main img:nth-child(1)', current_value: '<img src="a.png">' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/b', target: 'main img:nth-child(2)', current_value: '<img src="b.png">' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/c', target: 'main img:nth-child(3)', current_value: '<img src="c.png">' }),
    // 5 no-focus-indicator findings (template) → 1 task
    makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/a' }),
    makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/b' }),
    makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/c' }),
    makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/d' }),
    makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/e' }),
  ];

  const items = selectActionItems(findings, 5);
  const instances = items.filter((i) => i.level === 'instance');
  const templates = items.filter((i) => i.level === 'template');

  assert.equal(instances.length, 3);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].covers_findings, 5);
});

test('text contrast is INCLUDED, collapsed to one template item per type', () => {
  // Previously excluded as "a brand decision". That hid the single
  // highest-impact change on a site: on wmmc.com one grey drove 456 of 643
  // findings and never appeared in the action items. Contrast is a template
  // fix, so volume cannot flood the document.
  const findings = [
    ...Array.from({ length: 40 }, (_, i) =>
      makeFinding({
        finding_type: 'contrast-below-aa-normal',
        url: `https://x.test/p${i % 4}`,
        context: { foreground_hex: '#7f7f7f', background_hex: '#ffffff', ratio: 4, required: 4.5 },
      }),
    ),
    makeFinding({
      finding_type: 'contrast-below-aa-normal',
      url: 'https://x.test/p0',
      context: { foreground_hex: '#949797', background_hex: '#ffffff', ratio: 2.94, required: 4.5 },
    }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/p0' }),
  ];

  const items = selectActionItems(findings, 4);
  const contrast = items.filter((i) => i.finding_type === 'contrast-below-aa-normal');

  assert.equal(contrast.length, 1, '41 contrast findings collapse to ONE item');
  assert.equal(contrast[0].level, 'template');
  assert.equal(contrast[0].covers_findings, 41);
  assert.ok(items.some((i) => i.finding_type === 'missing-alt'), 'other types unaffected');
});

test('contrast item names the distinct pairs and calls out the dominant one', () => {
  const findings = [
    ...Array.from({ length: 9 }, () =>
      makeFinding({
        finding_type: 'contrast-below-aa-normal',
        url: 'https://x.test/a',
        context: { foreground_hex: '#7f7f7f', background_hex: '#ffffff', ratio: 4, required: 4.5 },
      }),
    ),
    makeFinding({
      finding_type: 'contrast-below-aa-normal',
      url: 'https://x.test/a',
      context: { foreground_hex: '#949797', background_hex: '#ffffff', ratio: 2.94, required: 4.5 },
    }),
  ];

  const item = selectActionItems(findings, 1).find((i) => i.finding_type === 'contrast-below-aa-normal')!;

  assert.ok(item.guidance.includes('#7f7f7f on #ffffff'), 'names the dominant pair');
  assert.ok(item.guidance.includes('#949797 on #ffffff'), 'names the secondary pair');
  assert.ok(item.guidance.includes('90%'), 'states the dominant pair\'s share');
  assert.ok(/needs 4.5:1/.test(item.guidance), 'states the required ratio');
});

test('a repeated component collapses to one task even with per-instance selectors', () => {
  // Provider cards give every instance its own nth-of-type selector. Keying
  // on the selector produced 11 identical "View Practice Page" tasks on
  // wmmc.com, each claiming to be a discrete fix.
  const findings = Array.from({ length: 11 }, (_, i) =>
    makeFinding({
      finding_type: 'redundant-link-text',
      url: 'https://x.test/provider-finder',
      target: `.card:nth-of-type(${i + 1}) > a`,
      current_value: 'View Practice Page',
    }),
  );

  const items = selectActionItems(findings, 1).filter((i) => i.finding_type === 'redundant-link-text');

  assert.equal(items.length, 1, 'one task, not eleven');
  assert.equal(items[0].covers_findings, 11, 'but it still reports all 11 occurrences');
});

test('genuinely different values stay as separate tasks', () => {
  const findings = [
    makeFinding({ finding_type: 'redundant-link-text', url: 'https://x.test/a', target: 'a.one', current_value: 'Read more' }),
    makeFinding({ finding_type: 'redundant-link-text', url: 'https://x.test/a', target: 'a.two', current_value: 'Click here' }),
  ];

  const items = selectActionItems(findings, 1).filter((i) => i.finding_type === 'redundant-link-text');
  assert.equal(items.length, 2, 'different link text is a different fix');
});

test('non-text contrast (UI elements) is NOT excluded', () => {
  // non-text-contrast-below-aa covers borders/icons — agency dev can fix.
  const findings = [
    makeFinding({ finding_type: 'non-text-contrast-below-aa', url: 'https://x.test/a' }),
  ];
  const items = selectActionItems(findings, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].finding_type, 'non-text-contrast-below-aa');
});

test('budget invariant — total time never exceeds 180 minutes', () => {
  // 50 instance findings of varying types, mixed times.
  const findings: Finding[] = [];
  for (let i = 0; i < 50; i++) {
    findings.push(makeFinding({
      finding_type: i % 2 === 0 ? 'missing-alt' : 'empty-link',
      url: `https://x.test/${i}`,
    }));
  }

  const items = selectActionItems(findings, 10);
  const total = items.reduce((s, i) => s + i.time_minutes, 0);
  assert.ok(total <= 180, `selected total ${total} min must not exceed 180`);
});

test('soft cap — does not select more than 50 items even with budget left', () => {
  // 100 redundant-alt findings (3 min each — well within 180 budget).
  const findings = Array.from({ length: 100 }, (_, i) =>
    makeFinding({
      finding_type: 'redundant-alt',
      url: `https://x.test/${i}`,
      severity: 'minor',
    }),
  );

  const items = selectActionItems(findings, 10);
  assert.ok(items.length <= 50, `soft cap should keep selection ≤ 50, got ${items.length}`);
});

test('no item count cap below 50 — drops the previous max-10 limit', () => {
  // 30 distinct missing-alt tasks (different elements + content per page),
  // each 5 min = 150 min total → all should fit, none dedup.
  const findings = Array.from({ length: 30 }, (_, i) =>
    makeFinding({
      finding_type: 'missing-alt',
      url: `https://x.test/${i}`,
      target: `main > img:nth-child(${i + 1})`,
      current_value: `<img src="img-${i}.png">`,
    }),
  );

  const items = selectActionItems(findings, 30);
  assert.ok(items.length > 10, `should select more than 10 when budget allows, got ${items.length}`);
  assert.ok(items.length <= 30);
});

test('unmapped finding types are excluded', () => {
  const findings = [
    makeFinding({ finding_type: 'made-up-type', url: 'https://x.test/' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a' }),
  ];

  const items = selectActionItems(findings, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].finding_type, 'missing-alt');
});

test('rank is 1..N in selection order', () => {
  const findings = [
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a' }),
    makeFinding({ finding_type: 'empty-link', url: 'https://x.test/b' }),
    makeFinding({ finding_type: 'redundant-alt', url: 'https://x.test/c' }),
  ];

  const items = selectActionItems(findings, 1);
  assert.deepEqual(
    items.map((i) => i.rank),
    Array.from({ length: items.length }, (_, i) => i + 1),
  );
});

test('per-instance items carry URL + selector + current value for actionability', () => {
  const findings = [
    makeFinding({
      finding_type: 'empty-link',
      url: 'https://example.com/admit',
      target: 'header > nav.utility > a:nth-child(3)',
      current_value: '<a href="/login"></a>',
    }),
  ];

  const items = selectActionItems(findings, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 'instance');
  assert.equal(items[0].url, 'https://example.com/admit');
  assert.equal(items[0].selector, 'header > nav.utility > a:nth-child(3)');
  assert.equal(items[0].current_value, '<a href="/login"></a>');
  assert.ok(items[0].guidance.length > 0, 'guidance text must be present');
});

test('extractImageSrc — pulls absolute URL from img tag', () => {
  const html = '<a href="/"><img alt="" src="https://example.com/logo.png" /></a>';
  assert.equal(
    extractImageSrc(html, 'https://example.com/page'),
    'https://example.com/logo.png',
  );
});

test('extractImageSrc — resolves relative URL against the page URL', () => {
  const html = '<img src="/assets/hero.jpg" alt="">';
  assert.equal(
    extractImageSrc(html, 'https://example.com/about'),
    'https://example.com/assets/hero.jpg',
  );
});

test('extractImageSrc — resolves protocol-relative URL', () => {
  const html = '<img src="//cdn.example.com/x.png" alt="">';
  assert.equal(
    extractImageSrc(html, 'https://example.com/page'),
    'https://cdn.example.com/x.png',
  );
});

test('extractImageSrc — handles real fasthealth-style URL from sabetha', () => {
  const html = '<a href="/"><img alt="" decoding="async" loading="lazy" src="https://pictures.fasthealth.com/client_images/3543/2e53b7d.png" style="width: 293px; height: 98px;"></a>';
  assert.equal(
    extractImageSrc(html, 'https://www.sabethahospital.com/getpage.php?name=contact'),
    'https://pictures.fasthealth.com/client_images/3543/2e53b7d.png',
  );
});

test('extractImageSrc — skips data: and blob: URIs', () => {
  assert.equal(extractImageSrc('<img src="data:image/png;base64,iVBORw0..." alt="">', 'https://x.test/'), null);
  assert.equal(extractImageSrc('<img src="blob:https://x.test/abc" alt="">', 'https://x.test/'), null);
});

test('extractImageSrc — returns null when no img tag', () => {
  assert.equal(extractImageSrc('<a>just a link</a>', 'https://x.test/'), null);
});

test('renderActionItems — emits image URL as clickable link for image-finding types', () => {
  const findings = [
    makeFinding({
      finding_type: 'missing-alt',
      url: 'https://x.test/page',
      target: 'main > img',
      current_value: '<img src="https://cdn.test/logo.png" alt="">',
    }),
  ];
  const items = selectActionItems(findings, 1);
  const manifest: Manifest = {
    contract_version: '0.1',
    site: 'x.test',
    site_slug: 'x-test',
    run_id: 'r',
    started_at: '',
    ended_at: '2026-04-29T00:00:00Z',
    urls: ['https://x.test/page'],
    tools: { scanner: '', axe_core: '', playwright: '', node: '' },
    viewport: { w: 0, h: 0 },
    user_agent: '',
    wcag_version: '2.2',
    wcag_levels: ['A', 'AA'],
  };

  const md = renderActionItems(items, manifest);
  assert.match(
    md,
    /\*\*Image URL:\*\* \[https:\/\/cdn\.test\/logo\.png\]\(https:\/\/cdn\.test\/logo\.png\)/,
    'image URL should be present as a markdown link',
  );
});

test('renderActionItems — does NOT emit Image URL for non-image finding types', () => {
  const findings = [
    makeFinding({
      finding_type: 'empty-link',
      url: 'https://x.test/',
      target: 'a.btn',
      current_value: '<a href="/login"></a>',
    }),
  ];
  const items = selectActionItems(findings, 1);
  const manifest: Manifest = {
    contract_version: '0.1',
    site: 'x.test',
    site_slug: 'x-test',
    run_id: 'r',
    started_at: '',
    ended_at: '2026-04-29T00:00:00Z',
    urls: ['https://x.test/'],
    tools: { scanner: '', axe_core: '', playwright: '', node: '' },
    viewport: { w: 0, h: 0 },
    user_agent: '',
    wcag_version: '2.2',
    wcag_levels: ['A', 'AA'],
  };

  const md = renderActionItems(items, manifest);
  assert.doesNotMatch(md, /\*\*Image URL:\*\*/);
});

test('template items list affected URLs for traceability', () => {
  const urls = ['https://x.test/a', 'https://x.test/b', 'https://x.test/c'];
  const findings = urls.map((u) => makeFinding({ finding_type: 'no-focus-indicator', url: u }));

  const items = selectActionItems(findings, 3);
  const tpl = items.find((i) => i.level === 'template');
  assert.ok(tpl, 'expected a template task');
  assert.deepEqual([...tpl!.affected_urls].sort(), urls);
});

test('headlines identify which item they are', () => {
  const manifest: Manifest = {
    contract_version: '0.1',
    site: 'x.test',
    site_slug: 'x-test',
    run_id: 'r',
    started_at: '',
    ended_at: '2026-11-02T00:00:00Z',
    urls: ['https://x.test/a', 'https://x.test/services', 'https://x.test/'],
    tools: { scanner: '', axe_core: '', playwright: '', node: '' },
    viewport: { w: 0, h: 0 },
    user_agent: '',
    wcag_version: '2.2',
    wcag_levels: ['A', 'AA'],
  };

  const md = renderActionItems(
    selectActionItems(
      [
        // two different images, both shared chrome → must not read identically
        makeFinding({
          finding_type: 'miscategorized-decorative',
          url: 'https://x.test/a',
          target: 'a.logo',
          current_value: '<a href="https://x.test"><img src="/wp-content/uploads/logo-white.png" alt=""></a>',
        }),
        makeFinding({
          finding_type: 'miscategorized-decorative',
          url: 'https://x.test/a',
          target: 'a.award',
          current_value: '<a href="https://x.test/awards"><img src="/wp-content/uploads/award-2026.png" alt=""></a>',
        }),
        // page-specific structural work on two different pages
        makeFinding({ finding_type: 'multiple-h1', url: 'https://x.test/services' }),
        makeFinding({ finding_type: 'multiple-h1', url: 'https://x.test/' }),
      ],
      4,
    ),
    manifest,
  );

  assert.ok(md.includes('logo-white.png'), 'image item names its file');
  assert.ok(md.includes('award-2026.png'), 'the other image item names its file');
  assert.ok(md.includes('/services'), 'page-specific item names its page');
  assert.ok(md.includes('home page'), 'the root page is named readably');
});

test('a contrast template item gets one screenshot target per colour pair', () => {
  const pair = (fg: string, bg: string, ratio: number, n: number, sel: string) =>
    Array.from({ length: n }, (_, i) =>
      makeFinding({
        finding_type: 'contrast-below-aa-normal',
        url: 'https://x.test/a',
        target: `${sel}:nth-child(${i + 1})`,
        context: { foreground_hex: fg, background_hex: bg, ratio, required: 4.5 },
      }),
    );

  const items = selectActionItems(
    [...pair('#7f7f7f', '#ffffff', 4, 9, 'p.body'), ...pair('#949797', '#ffffff', 2.94, 2, 'span.meta')],
    1,
  );
  const contrast = items.find((i) => i.finding_type === 'contrast-below-aa-normal')!;

  assert.equal(contrast.shot_samples.length, 2, 'one representative per distinct pair');
  assert.ok(contrast.shot_samples[0].label.includes('#7f7f7f on #ffffff'), 'dominant pair first');
  assert.ok(contrast.shot_samples[0].label.includes('9 elements'));
  assert.ok(contrast.shot_samples[1].label.includes('#949797 on #ffffff'));
  assert.ok(contrast.shot_samples.every((s) => s.url && s.selector), 'each is a real element');
});

test('template items that are not contrast still get one representative', () => {
  const items = selectActionItems(
    [
      makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/a', target: 'a.nav' }),
      makeFinding({ finding_type: 'no-focus-indicator', url: 'https://x.test/b', target: 'a.nav' }),
    ],
    2,
  );
  const item = items.find((i) => i.finding_type === 'no-focus-indicator')!;
  assert.equal(item.shot_samples.length, 1);
  assert.equal(item.shot_samples[0].selector, 'a.nav');
});
