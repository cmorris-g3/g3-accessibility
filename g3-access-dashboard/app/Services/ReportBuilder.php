<?php

namespace App\Services;

use App\Models\Scan;
use RuntimeException;
use Symfony\Component\Process\Process;
use ZipArchive;

/**
 * Builds a downloadable zip of the analyzer's report artifacts for a scan.
 *
 * Deliverables in the zip: the 8 markdown docs converted to .docx, plus
 * findings.csv and work-items.csv. Everything else (pages/ subdirs,
 * manifest/summary/consistency JSON, original .md files) is excluded.
 *
 * Full-site scans consolidate every child page's probe output into a
 * synthetic run-dir and re-run the analyzer before assembling deliverables;
 * page scans use the analyzer output already on disk.
 */
class ReportBuilder
{
    /** Artifact files to carry into the zip (before the .md files become .docx). */
    private const KEEP_ARTIFACTS = [
        'top-10.md',
        'executive-summary.md',
        'editor-tasks.md',
        'developer-tasks.md',
        'designer-tasks.md',
        'vendor-tasks.md',
        'reviewer-tasks.md',
        'roadmap.md',
        'report.md',
        'findings.csv',
        'work-items.csv',
    ];

    /** When a doc references another doc by filename, swap .md for .docx. */
    private const MD_TO_DOCX_REPLACEMENTS = [
        'top-10.md' => 'top-10.docx',
        'editor-tasks.md' => 'editor-tasks.docx',
        'developer-tasks.md' => 'developer-tasks.docx',
        'designer-tasks.md' => 'designer-tasks.docx',
        'vendor-tasks.md' => 'vendor-tasks.docx',
        'reviewer-tasks.md' => 'reviewer-tasks.docx',
        'executive-summary.md' => 'executive-summary.docx',
        'roadmap.md' => 'roadmap.docx',
        'report.md' => 'report.docx',
    ];

    public function __construct(private ScannerRunner $scanner) {}

    /**
     * Returns an absolute path to a zip file of deliverables for this scan.
     * Caller is responsible for streaming + deleting the zip.
     */
    public function buildForScan(Scan $scan): string
    {
        $tempDirsToCleanup = [];

        try {
            if ($scan->type === 'page') {
                $analyzedDir = $this->findScanRunDir($scan);
                if (! $analyzedDir) {
                    throw new RuntimeException("Scanner output directory not found for scan #{$scan->id}");
                }
            } else {
                $analyzedDir = $this->buildFullScanArtifacts($scan);
                $tempDirsToCleanup[] = $analyzedDir;
            }

            $workingDir = $this->assembleDeliverables($analyzedDir);
            $tempDirsToCleanup[] = $workingDir;

            return $this->zipDirectory($workingDir, $this->filenameFor($scan));
        } finally {
            foreach ($tempDirsToCleanup as $dir) {
                $this->rrmdir($dir);
            }
        }
    }

    /**
     * Consolidates all child page probe outputs into a synthetic run-dir,
     * regenerates consistency.json, and runs the analyzer. Returns the
     * path to the analyzed dir (caller cleans up).
     */
    private function buildFullScanArtifacts(Scan $scan): string
    {
        $children = Scan::where('parent_scan_id', $scan->id)
            ->where('status', 'complete')
            ->get();

        if ($children->count() < 1) {
            throw new RuntimeException("No completed child scans for full scan #{$scan->id}");
        }

        $siteHost = parse_url($scan->url ?? '', PHP_URL_HOST);
        if (! $siteHost) {
            $firstUrl = $children->first()->url ?? '';
            $siteHost = parse_url($firstUrl, PHP_URL_HOST) ?: 'unknown';
        }

        $dir = sys_get_temp_dir().'/g3-report-src-'.$scan->id.'-'.bin2hex(random_bytes(4));
        @mkdir($dir.'/pages', 0775, true);

        $outDirRoot = rtrim((string) config('scanner.out_dir'), '/');
        $urls = [];
        $linkedAny = false;
        foreach ($children as $child) {
            $childRunDir = $this->findScanRunDir($child, $outDirRoot);
            if (! $childRunDir || ! is_dir($childRunDir.'/pages')) {
                continue;
            }
            foreach (scandir($childRunDir.'/pages') as $slug) {
                if ($slug === '.' || $slug === '..') {
                    continue;
                }
                $src = realpath($childRunDir.'/pages/'.$slug);
                $dst = $dir.'/pages/'.$slug;
                if ($src && ! file_exists($dst)) {
                    @symlink($src, $dst);
                    $linkedAny = true;
                }
            }
            if ($child->url) {
                $urls[] = $child->url;
            }
        }

        if (! $linkedAny) {
            $this->rrmdir($dir);
            throw new RuntimeException("No per-page scanner output on disk for scan #{$scan->id}");
        }

        $urls = array_values(array_unique($urls));
        $this->writeManifest($dir, $scan, $siteHost, $urls);
        $this->writeSummary($dir, $urls);

        if (count($urls) >= 2) {
            try {
                $this->scanner->consistencyPass($dir, $siteHost);
            } catch (\Throwable $e) {
                // Consistency optional; analyzer skips it if the file is missing.
            }
        }

        $this->scanner->analyze($dir);

        return $dir;
    }

    /**
     * Copies only the keep-list artifacts out of the analyzer's source dir,
     * rewrites cross-references from .md to .docx, converts each .md to .docx
     * via pandoc, and returns the path to the deliverables directory.
     */
    private function assembleDeliverables(string $sourceDir): string
    {
        $dir = sys_get_temp_dir().'/g3-report-dlv-'.bin2hex(random_bytes(4));
        @mkdir($dir, 0775, true);

        foreach (self::KEEP_ARTIFACTS as $name) {
            $src = $sourceDir.'/'.$name;
            if (! is_file($src)) {
                continue;
            }
            $dst = $dir.'/'.$name;
            copy($src, $dst);
        }

        $this->rewriteMdReferences($dir);
        $this->convertMarkdownToDocx($dir);

        return $dir;
    }

    /**
     * Rewrite references like `developer-tasks.md` → `developer-tasks.docx`
     * in every markdown file so the zipped docs cross-link correctly.
     */
    private function rewriteMdReferences(string $dir): void
    {
        foreach (glob($dir.'/*.md') ?: [] as $path) {
            $content = file_get_contents($path);
            if ($content === false) {
                continue;
            }
            $content = strtr($content, self::MD_TO_DOCX_REPLACEMENTS);
            file_put_contents($path, $content);
        }
    }

    /**
     * Convert each .md file in the dir to .docx via pandoc, then delete the .md.
     * Uses GFM input so tables and task lists render correctly.
     */
    private function convertMarkdownToDocx(string $dir): void
    {
        foreach (glob($dir.'/*.md') ?: [] as $mdPath) {
            $docxPath = preg_replace('/\.md$/', '.docx', $mdPath);

            $process = new Process([
                'pandoc',
                $mdPath,
                '--from=gfm',
                '--to=docx',
                '--output=' . $docxPath,
            ]);
            $process->setTimeout(30);
            $process->run();

            if ($process->getExitCode() !== 0) {
                throw new RuntimeException(
                    'pandoc failed to convert '.basename($mdPath).': '.trim($process->getErrorOutput())
                );
            }

            @unlink($mdPath);
        }
    }

    private function findScanRunDir(Scan $scan, ?string $outDirRoot = null): ?string
    {
        $outDirRoot = $outDirRoot ?? rtrim((string) config('scanner.out_dir'), '/');
        $pattern = $outDirRoot.'/'.$scan->license_id.'/*/scan-'.$scan->id;
        $matches = glob($pattern);
        return $matches[0] ?? null;
    }

    private function writeManifest(string $dir, Scan $scan, string $siteHost, array $urls): void
    {
        $manifest = [
            'contract_version' => '0.1',
            'site' => $siteHost,
            'site_slug' => str_replace('.', '-', $siteHost),
            'run_id' => 'scan-'.$scan->id,
            'started_at' => $scan->started_at?->toIso8601String() ?? $scan->created_at->toIso8601String(),
            'ended_at' => $scan->completed_at?->toIso8601String() ?? now()->toIso8601String(),
            'urls' => $urls,
            'tools' => [
                'scanner' => '0.1.0',
                'axe_core' => 'bundled',
                'playwright' => 'bundled',
                'node' => PHP_OS,
            ],
            'viewport' => ['w' => 1440, 'h' => 900],
            'user_agent' => 'G3 Access scanner',
            'wcag_version' => '2.2',
            'wcag_levels' => ['A', 'AA'],
        ];
        file_put_contents($dir.'/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    private function writeSummary(string $dir, array $urls): void
    {
        $summary = [
            'contract_version' => '0.1',
            'total_urls' => count($urls),
            'probes_run' => 13,
            'probes_enabled' => [
                'axe', 'a11y-tree', 'headings', 'target-size', 'images', 'links',
                'contrast', 'keyboard-walk', 'text-spacing', 'reduced-motion',
                'reflow', 'sensory-language', 'consistency',
            ],
            'artifacts' => [
                'total_images' => 0,
                'total_links' => 0,
                'total_headings' => 0,
                'total_interactive_elements' => 0,
                'axe_violations' => 0,
                'target_size_failures' => 0,
                'heading_issues' => 0,
            ],
        ];
        file_put_contents($dir.'/summary.json', json_encode($summary, JSON_PRETTY_PRINT));
    }

    private function zipDirectory(string $sourceDir, string $filenameBase): string
    {
        $zipPath = sys_get_temp_dir().'/'.$filenameBase.'-'.bin2hex(random_bytes(3)).'.zip';

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException("Could not create zip at {$zipPath}");
        }

        foreach (scandir($sourceDir) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $full = $sourceDir.'/'.$entry;
            if (is_file($full)) {
                $zip->addFile($full, $entry);
            }
        }
        $zip->close();

        return $zipPath;
    }

    public function filenameFor(Scan $scan): string
    {
        $host = 'scan';
        if ($scan->url) {
            $host = parse_url($scan->url, PHP_URL_HOST) ?: 'scan';
        }
        $slug = preg_replace('~[^a-z0-9\-]~', '-', strtolower($host));
        $date = ($scan->completed_at ?? $scan->created_at)->format('Y-m-d');
        return "{$slug}-scan-{$scan->id}-{$date}";
    }

    private function rrmdir(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir.'/'.$entry;
            if (is_link($path)) {
                @unlink($path);
            } elseif (is_dir($path)) {
                $this->rrmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }
}
