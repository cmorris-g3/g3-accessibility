import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Finding } from '../types.js';
import { selectActionItems } from './action-items.js';

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
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('instance findings emit one task per finding', () => {
  const findings = [
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/b' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/c' }),
  ];

  const items = selectActionItems(findings, 3);
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(item.level, 'instance');
    assert.equal(item.covers_findings, 1);
    assert.equal(item.pages_affected, 1);
  }
  // Each must reference its specific URL.
  const urls = items.map((i) => i.url);
  assert.deepEqual(urls.sort(), ['https://x.test/a', 'https://x.test/b', 'https://x.test/c']);
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
    // 3 missing-alt findings (instance) → 3 tasks
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/a' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/b' }),
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/c' }),
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

test('text contrast types are excluded — out of scope for the agency engagement', () => {
  // All three text-contrast levels should be filtered out entirely.
  const findings = [
    makeFinding({ finding_type: 'contrast-below-aa-normal', url: 'https://x.test/a' }),
    makeFinding({ finding_type: 'contrast-below-aa-large', url: 'https://x.test/b' }),
    makeFinding({ finding_type: 'contrast-below-aaa', url: 'https://x.test/c' }),
    // Sanity: a non-excluded item gets through so we know selection isn't broken.
    makeFinding({ finding_type: 'missing-alt', url: 'https://x.test/d' }),
  ];

  const items = selectActionItems(findings, 4);
  const types = items.map((i) => i.finding_type);

  assert.ok(!types.includes('contrast-below-aa-normal'));
  assert.ok(!types.includes('contrast-below-aa-large'));
  assert.ok(!types.includes('contrast-below-aaa'));
  assert.ok(types.includes('missing-alt'), 'non-excluded types still selected');
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
  // 30 different missing-alt tasks, each 5 min = 150 min total → all should fit.
  const findings = Array.from({ length: 30 }, (_, i) =>
    makeFinding({
      finding_type: 'missing-alt',
      url: `https://x.test/${i}`,
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

test('template items list affected URLs for traceability', () => {
  const urls = ['https://x.test/a', 'https://x.test/b', 'https://x.test/c'];
  const findings = urls.map((u) => makeFinding({ finding_type: 'no-focus-indicator', url: u }));

  const items = selectActionItems(findings, 3);
  const tpl = items.find((i) => i.level === 'template');
  assert.ok(tpl, 'expected a template task');
  assert.deepEqual([...tpl!.affected_urls].sort(), urls);
});
