import type { Finding } from '../../types.js';
import { formatWcagCitation } from '../wcag-map.js';

interface ImageEntry {
  id: string;
  src: string;
  alt: string | null;
  alt_present: boolean;
  role: string | null;
  computed_role: string | null;
  accessible_name: string | null;
  in_link: boolean;
  link_href: string | null;
  link_text_siblings: string | null;
  caption: string | null;
  surrounding_text: string;
  is_decorative_hint: boolean;
  css_path?: string;
  outer_html?: string;
}

const SELF_DESCRIPTIVE_RE =
  /^(spinner|loader|loading|icon|image|photo|picture|graphic|chart|figure|divider|decoration|accent|ornament|spacer|decorative)([:\s\-_]|$)/i;

const SPECIFIC_CONTENT_RE = /\b(for|about|of|showing|results|search|product|user)\b/i;

export function applyAltTextRubric(images: ImageEntry[], pageUrl: string): Finding[] {
  const findings: Finding[] = [];

  for (const img of images) {
    if (!img.alt_present) {
      findings.push({
        check: 'alt-text',
        source: 'rubric',
        finding_type: 'missing-alt',
        url: pageUrl,
        target: img.css_path ?? `img#${img.id}`,
        severity: 'serious',
        wcag: formatWcagCitation({ sc: '1.1.1', level: 'A' }),
        rationale:
          'Image has no alt attribute. Screen readers typically announce the filename instead.',
        current_value: null,
        suggested_fix: 'Add a descriptive alt attribute. Use alt="" if purely decorative.',
        confidence: 'high',
        context: {
          image_id: img.id,
          src: img.src,
          in_link: img.in_link,
          link_text_siblings: img.link_text_siblings,
          outer_html: img.outer_html,
        },
      });
      continue;
    }

    const altIsEmpty =
      img.alt === '' || img.role === 'presentation' || img.role === 'none';

    if (altIsEmpty) {
      if (
        img.in_link &&
        (!img.link_text_siblings || img.link_text_siblings.trim() === '')
      ) {
        findings.push({
          check: 'alt-text',
          source: 'rubric',
          finding_type: 'miscategorized-decorative',
          url: pageUrl,
          target: img.css_path ?? `img#${img.id}`,
          severity: 'serious',
          wcag: formatWcagCitation({ sc: '1.1.1', level: 'A' }),
          rationale:
            'Image is declared decorative (empty alt) but wraps a link with no other text. The link has no accessible name.',
          current_value: img.outer_html ?? img.alt ?? '',
          suggested_fix:
            'Add descriptive alt stating the link destination, or add aria-label on the anchor.',
          confidence: 'high',
          context: {
            image_id: img.id,
            src: img.src,
            in_link: img.in_link,
            link_text_siblings: img.link_text_siblings,
            link_href: img.link_href,
            outer_html: img.outer_html,
          },
        });
      }
      continue;
    }

    if (
      img.alt &&
      SELF_DESCRIPTIVE_RE.test(img.alt) &&
      !SPECIFIC_CONTENT_RE.test(img.alt)
    ) {
      findings.push({
        check: 'alt-text',
        source: 'rubric',
        finding_type: 'alt-describes-appearance',
        url: pageUrl,
        target: img.css_path ?? `img#${img.id}`,
        severity: 'moderate',
        wcag: formatWcagCitation({ sc: '1.1.1', level: 'A' }),
        rationale:
          "Alt text describes the image's visual type/medium rather than content. Image is almost certainly decorative; use alt=\"\" or aria-hidden=\"true\".",
        current_value: img.alt,
        suggested_fix: 'Set alt="" or aria-hidden="true" on this image.',
        confidence: 'high',
        context: { image_id: img.id, src: img.src, outer_html: img.outer_html },
      });
      continue;
    }

    if (img.in_link && img.link_text_siblings && img.link_text_siblings.trim() !== '') {
      const altTrim = (img.alt ?? '').trim();
      const altLower = altTrim.toLowerCase();
      const siblingsLower = img.link_text_siblings.trim().toLowerCase();
      const altIsLanguageCode = /^[a-z]{2}(-[a-z]{2,4})?$/i.test(altTrim);
      const firstSiblingWord =
        siblingsLower.replace(/[▼▲]/g, '').trim().split(/\s+/)[0] ?? '';

      if (
        altIsLanguageCode ||
        (altLower && firstSiblingWord.startsWith(altLower))
      ) {
        findings.push({
          check: 'alt-text',
          source: 'rubric',
          finding_type: 'redundant-alt',
          url: pageUrl,
          target: img.css_path ?? `img#${img.id}`,
          severity: 'minor',
          wcag: formatWcagCitation({ sc: '1.1.1', level: 'A' }),
          rationale:
            'Image alt duplicates adjacent link text with no new information; functional-secondary images should use alt="".',
          current_value: img.alt,
          suggested_fix: 'Set alt="" on this image.',
          confidence: 'high',
          context: {
            image_id: img.id,
            src: img.src,
            link_text_siblings: img.link_text_siblings,
            outer_html: img.outer_html,
          },
        });
      }
    }
  }

  return findings;
}
