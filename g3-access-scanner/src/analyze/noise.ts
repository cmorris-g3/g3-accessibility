import type { Finding } from '../types.js';

interface NoiseFilter {
  id: string;
  matches: (f: Finding) => boolean;
  reason: string;
}

const FILTERS: NoiseFilter[] = [
  {
    id: 'usercentrics-consent-banner-tablist',
    reason:
      'Third-party Usercentrics consent banner shadow-DOM tablist fails axe but is AT-operable.',
    matches: (f) => {
      if (f.finding_type !== 'aria-required-children') return false;
      const t = (f.target ?? '').toLowerCase();
      return (
        t.includes('usercentrics') ||
        t.includes('uc-cmp') ||
        t.includes('usercentrics-root')
      );
    },
  },
];

export function applyNoiseFilters(findings: Finding[]): {
  kept: Finding[];
  filtered: Array<{ finding: Finding; filter_id: string }>;
} {
  const kept: Finding[] = [];
  const filtered: Array<{ finding: Finding; filter_id: string }> = [];
  for (const f of findings) {
    if (f.severity === 'critical') {
      kept.push(f);
      continue;
    }
    const match = FILTERS.find((flt) => flt.matches(f));
    if (match) {
      filtered.push({ finding: f, filter_id: match.id });
    } else {
      kept.push(f);
    }
  }
  return { kept, filtered };
}
