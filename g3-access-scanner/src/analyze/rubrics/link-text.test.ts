import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeHref } from './link-text.js';

const BASE = 'https://sabethahospital.com/';

test('normalizeHref — relative resolves against page base', () => {
  const a = normalizeHref('/getpage.php?name=Foo', BASE);
  const b = normalizeHref('https://sabethahospital.com/getpage.php?name=Foo', BASE);
  assert.equal(a, b, 'relative and absolute should normalize to the same string');
});

test('normalizeHref — www. and no-www. are the same destination', () => {
  // The exact bug pattern that bit the user — same hospital page written with
  // and without www, surfacing as a false redundant-link-text finding.
  const noWww = normalizeHref('https://sabethahospital.com/getpage.php?name=Building_a_Healthy_Future', BASE);
  const withWww = normalizeHref('https://www.sabethahospital.com/getpage.php?name=Building_a_Healthy_Future', BASE);
  assert.equal(noWww, withWww);
});

test('normalizeHref — relative + www-host absolute are all the same destination', () => {
  // Triple-collapse case: relative, no-www absolute, www-prefixed absolute.
  const rel = normalizeHref('/getpage.php?name=Building_a_Healthy_Future&sub=About', BASE);
  const noWww = normalizeHref('https://sabethahospital.com/getpage.php?name=Building_a_Healthy_Future&sub=About', BASE);
  const withWww = normalizeHref('https://www.sabethahospital.com/getpage.php?name=Building_a_Healthy_Future&sub=About', BASE);
  assert.equal(rel, noWww);
  assert.equal(noWww, withWww);
});

test('normalizeHref — different query values are different destinations (PHP-routed sites)', () => {
  // We must NOT collapse these: `?name=A` and `?name=B` are genuinely
  // different pages on a PHP-routed site, and conflating them as "same
  // destination" would suppress legitimate redundant-link-text findings.
  const a = normalizeHref('/getpage.php?name=Wound_Clinic_services', BASE);
  const b = normalizeHref('/getpage.php?name=Wound_Clinic_providers', BASE);
  assert.notEqual(a, b);
});

test('normalizeHref — reordered query params normalize to the same string', () => {
  const a = normalizeHref('/getpage.php?name=Foo&sub=Bar', BASE);
  const b = normalizeHref('/getpage.php?sub=Bar&name=Foo', BASE);
  assert.equal(a, b);
});

test('normalizeHref — fragment is dropped', () => {
  const a = normalizeHref('/getpage.php?name=Foo#section1', BASE);
  const b = normalizeHref('/getpage.php?name=Foo#section2', BASE);
  assert.equal(a, b);
});

test('normalizeHref — host case differences canonicalize', () => {
  const a = normalizeHref('https://Sabethahospital.COM/foo', BASE);
  const b = normalizeHref('https://sabethahospital.com/foo', BASE);
  assert.equal(a, b);
});
