import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { slugifyUrl } from './fs.js';

test('slugifyUrl — root URL becomes "home"', () => {
  assert.equal(slugifyUrl('https://example.com/'), 'home');
  assert.equal(slugifyUrl('https://example.com'), 'home');
});

test('slugifyUrl — path-only URLs use the path', () => {
  assert.equal(slugifyUrl('https://example.com/about'), 'about');
  assert.equal(slugifyUrl('https://example.com/about/team'), 'about-team');
  assert.equal(slugifyUrl('https://example.com/staff/bio.php'), 'staff-bio-php');
});

test('slugifyUrl — same path with different query strings produces DIFFERENT slugs', () => {
  // The bug this prevents: getpage.php?name=admit and getpage.php?name=contact
  // collapsing to the same slug, which causes ReportBuilder to drop all but
  // one of them at synthesis time and breaks pages_affected counts.
  const a = slugifyUrl('https://www.example.com/getpage.php?name=admit');
  const b = slugifyUrl('https://www.example.com/getpage.php?name=contact&sub=About%20Us');
  const c = slugifyUrl('https://www.example.com/getpage.php?name=cardiac&sub=Our%20Services');
  const d = slugifyUrl('https://www.example.com/getpage.php?name=patientinfo&sub=Patient%2FVisitors');

  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.notEqual(c, d);
  assert.notEqual(a, d);

  // All start with the same base slug, with a hash suffix.
  for (const slug of [a, b, c, d]) {
    assert.match(slug, /^getpage-php--[0-9a-f]{8}$/);
  }
});

test('slugifyUrl — same URL slugifies the same way (deterministic)', () => {
  const url = 'https://www.example.com/getpage.php?name=admit';
  assert.equal(slugifyUrl(url), slugifyUrl(url));
});

test('slugifyUrl — path-only URLs are unchanged from previous behavior', () => {
  // No regression for sites that don't use query routing.
  assert.equal(slugifyUrl('https://example.com/'), 'home');
  assert.equal(slugifyUrl('https://example.com/about'), 'about');
  assert.equal(slugifyUrl('https://example.com/staff/bio.php'), 'staff-bio-php');
});

test('slugifyUrl — different fragments do NOT change the slug', () => {
  // Fragments are client-side anchors, not separate pages.
  assert.equal(
    slugifyUrl('https://example.com/page#section1'),
    slugifyUrl('https://example.com/page#section2'),
  );
});

test('slugifyUrl — invalid URLs fall back to a safe slug', () => {
  assert.equal(typeof slugifyUrl('not a url'), 'string');
  assert.ok(slugifyUrl('not a url').length > 0);
});
