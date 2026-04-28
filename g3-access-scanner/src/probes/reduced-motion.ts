import type { Page } from 'playwright';
import { writeJson } from '../lib/fs.js';
import type { PageContext } from '../types.js';

interface MotionViolation {
  selector: string;
  reason: string;
  animation_name: string;
  animation_duration_s: number;
  animation_iteration_count: string;
  transition_duration_s: number;
}

interface ReducedMotionResult {
  evaluated_elements: number;
  violations: MotionViolation[];
}

export async function runReducedMotion(
  page: Page,
  ctx: PageContext,
): Promise<{ violations: number }> {
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);

    const data = await page.evaluate(() => {
      const violations: MotionViolation[] = [];
      let evaluated = 0;

      const candidates = document.querySelectorAll<HTMLElement>('*');
      for (const el of candidates) {
        const cs = getComputedStyle(el);
        const animationName = cs.animationName;
        const hasAnimation = animationName && animationName !== 'none';
        const hasTransition = parseFloat(cs.transitionDuration) > 0;

        if (!hasAnimation && !hasTransition) continue;
        evaluated++;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;

        const animDuration = parseFloat(cs.animationDuration) || 0;
        const animIter = cs.animationIterationCount;
        const transDuration = parseFloat(cs.transitionDuration) || 0;

        const role = el.getAttribute('role');
        const essentialPattern = /progressbar|status|alert|spinner/i.test(
          `${role} ${el.className}`,
        );
        if (essentialPattern) continue;

        let reason: string | null = null;
        if (hasAnimation && animDuration > 0.2) {
          if (animIter === 'infinite') {
            reason = `Infinite animation (${animationName}) still runs under reduced-motion.`;
          } else if (animDuration > 1) {
            reason = `Animation ${animationName} duration ${animDuration}s exceeds 1s under reduced-motion.`;
          }
        }
        if (!reason && hasTransition && transDuration > 0.3) {
          reason = `Transition duration ${transDuration}s exceeds 0.3s under reduced-motion.`;
        }
        if (!reason) continue;

        violations.push({
          selector: buildSelector(el),
          reason,
          animation_name: animationName,
          animation_duration_s: animDuration,
          animation_iteration_count: animIter,
          transition_duration_s: transDuration,
        });
        if (violations.length >= 50) break;
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

      return { evaluated, violations };
    });

    const result: ReducedMotionResult = {
      evaluated_elements: data.evaluated,
      violations: data.violations,
    };

    await writeJson(`${ctx.outDir}/reduced-motion.json`, result);
    return { violations: result.violations.length };
  } finally {
    await page.emulateMedia({ reducedMotion: null }).catch(() => {});
  }
}
