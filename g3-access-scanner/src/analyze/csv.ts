import type { Finding } from '../types.js';
import type { WorkItem } from './roadmap.js';
import { WHY_IT_MATTERS } from './plain-language.js';

const PRIORITY_LABELS: Record<string, string> = {
  P0: 'Critical blockers — fix first',
  P1: 'High impact — next sprint',
  P2: 'Experience improvements — backlog',
  P3: 'Polish',
};

export function renderWorkItemsCsv(items: WorkItem[]): string {
  const headers = [
    'work_item_id',
    'priority',
    'priority_label',
    'owner',
    'title',
    'effort_code',
    'effort_label',
    'findings_count',
    'pages_affected',
    'finding_types',
    'what_to_do',
    'done_when',
    'status',
    'assigned_to',
    'notes',
  ];

  const rows: string[][] = [headers];
  for (const item of items) {
    rows.push([
      item.id,
      item.priority,
      PRIORITY_LABELS[item.priority] ?? '',
      item.owner_label,
      item.title,
      item.effort,
      item.effort_label,
      String(item.covers_findings),
      String(item.pages_affected),
      item.finding_types.join(', '),
      item.what_to_do,
      item.done_when,
      '',
      '',
      '',
    ]);
  }

  return toCsv(rows);
}

export function renderFindingsCsv(items: WorkItem[]): string {
  const headers = [
    'finding_id',
    'work_item_id',
    'priority',
    'owner',
    'work_item_title',
    'finding_type',
    'what_it_means',
    'severity',
    'confidence',
    'wcag',
    'page_url',
    'page_path',
    'css_selector',
    'html_snippet',
    'suggested_fix',
    'status',
    'assigned_to',
    'notes',
  ];

  const rows: string[][] = [headers];
  for (const item of items) {
    item.findings.forEach((f, idx) => {
      rows.push([
        `${item.id}-${String(idx + 1).padStart(3, '0')}`,
        item.id,
        item.priority,
        item.owner_label,
        item.title,
        f.finding_type,
        WHY_IT_MATTERS[f.finding_type] ?? '',
        f.severity,
        f.confidence,
        f.wcag,
        f.url,
        pageOf(f.url),
        f.target ?? '',
        htmlSnippetOf(f),
        typeof f.suggested_fix === 'string' ? f.suggested_fix : '',
        '',
        '',
        '',
      ]);
    });
  }

  return toCsv(rows);
}

function htmlSnippetOf(f: Finding): string {
  const ctx = f.context ?? {};
  const outer = typeof ctx.outer_html === 'string' ? ctx.outer_html : '';
  if (outer) return clip(outer, 500);
  const cv = typeof f.current_value === 'string' ? f.current_value : '';
  return clip(cv, 500);
}

function pageOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

function clip(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function csvField(value: string): string {
  const s = (value ?? '').toString();
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
