import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface SensoryCandidate {
  selector: string;
  pattern: 'color-only' | 'shape-only' | 'position-only' | 'visual-verb';
  matched: string;
  surrounding: string;
}

interface SensoryLanguageResult {
  candidates: SensoryCandidate[];
}

export async function runSensoryLanguage(
  page: Page,
  ctx: PageContext,
): Promise<{ candidates: number }> {
  const candidates = await page.evaluate(() => {
    const results: SensoryCandidate[] = [];

    const colorPattern =
      /\b(red|blue|green|yellow|orange|purple|pink|black|white|gr[ae]y|brown)\s+(button|link|icon|box|area|section|label|tab|arrow|indicator|marker|dot|square|circle)\b/gi;
    const shapePattern =
      /\b(round|square|circular|triangular|star[- ]shaped|hexagonal|diamond[- ]shaped)\s+(button|icon|marker|indicator|tab)\b/gi;
    const positionPattern =
      /\b(click|tap|press|select|choose)\s+(on\s+)?(the\s+)?(top|bottom|left|right|upper|lower)\s+(of|corner|side|portion|area|part)/gi;
    const visualVerbPattern = /\b(as\s+you\s+can\s+see|see\s+below|see\s+above|as\s+shown\s+below|look\s+at|see\s+the\s+image)\b/gi;

    function scanContainer(el: HTMLElement) {
      const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
      if (text.length < 5) return;

      const seen = new Set<string>();
      const scan = (pattern: RegExp, label: SensoryCandidate['pattern']) => {
        let match: RegExpExecArray | null;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text))) {
          const key = `${label}:${match[0]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const start = Math.max(0, match.index - 40);
          const end = Math.min(text.length, match.index + match[0].length + 40);
          results.push({
            selector: buildSelector(el),
            pattern: label,
            matched: match[0],
            surrounding: text.slice(start, end).trim(),
          });
          if (results.length >= 60) return;
        }
      };

      scan(colorPattern, 'color-only');
      scan(shapePattern, 'shape-only');
      scan(positionPattern, 'position-only');
      scan(visualVerbPattern, 'visual-verb');
    }

    const containers = document.querySelectorAll<HTMLElement>(
      'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt',
    );
    for (const c of containers) {
      scanContainer(c);
      if (results.length >= 60) break;
    }

    function buildSelector(el: Element): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList)
        .filter((c) => !/^[0-9]/.test(c))
        .slice(0, 2)
        .map((c) => CSS.escape(c));
      return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
    }

    return results;
  });

  const result: SensoryLanguageResult = { candidates };
  await writeJson(`${ctx.outDir}/sensory-language.json`, result);
  return { candidates: candidates.length };
}
