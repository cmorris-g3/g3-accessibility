export const CONTRACT_VERSION = '0.1';

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  check: string;
  source: 'scanner' | 'rubric';
  finding_type: string;
  url: string;
  target?: string | null;
  severity: Severity;
  wcag: string;
  rationale: string;
  current_value?: string | null;
  suggested_fix?: string | null;
  confidence: Confidence;
  context?: Record<string, unknown>;
  fingerprint?: string;
}

export interface FindingsFile {
  run_id: string;
  site: string;
  generated_at: string;
  sop_version: string;
  model: string;
  findings: Finding[];
}

export interface Manifest {
  contract_version: string;
  site: string;
  site_slug: string;
  run_id: string;
  started_at: string;
  ended_at: string;
  urls: string[];
  tools: {
    scanner: string;
    axe_core: string;
    playwright: string;
    node: string;
  };
  viewport: { w: number; h: number };
  user_agent: string;
  wcag_version: string;
  wcag_levels: string[];
}

export interface Summary {
  contract_version: string;
  total_urls: number;
  probes_run: number;
  probes_enabled: string[];
  artifacts: {
    total_images: number;
    total_links: number;
    total_headings: number;
    total_interactive_elements: number;
    axe_violations: number;
    target_size_failures: number;
    heading_issues: number;
  };
}

export interface ScanOptions {
  url: string;
  outDir: string;
  maxPages: number;
  viewport: { w: number; h: number };
  timeoutMs: number;
  probes: string[];
  urlList?: string[];
  runId?: string;
}

export interface PageContext {
  url: string;
  urlSlug: string;
  outDir: string;
}
