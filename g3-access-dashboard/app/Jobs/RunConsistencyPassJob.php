<?php

namespace App\Jobs;

use App\Models\Finding;
use App\Models\Scan;
use App\Services\ScannerException;
use App\Services\ScannerRunner;
use App\Support\UrlNormalizer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable as QueueableTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Runs the cross-page consistency probe after all children of a full-site scan
 * have completed. Produces findings like missing-skip-link, inconsistent-navigation,
 * inconsistent-help — which are intrinsically cross-page and can't be emitted by
 * individual RunPageScanJob runs.
 */
class RunConsistencyPassJob implements ShouldQueue
{
    use QueueableTrait;

    public int $tries = 1;

    private const CONSISTENCY_TYPES = [
        'missing-skip-link',
        'inconsistent-navigation',
        'inconsistent-help',
    ];

    public function __construct(public int $parentScanId) {}

    public function handle(ScannerRunner $scanner): void
    {
        $parent = Scan::find($this->parentScanId);
        if (! $parent || $parent->type !== 'full') {
            return;
        }

        $children = Scan::where('parent_scan_id', $parent->id)
            ->where('status', 'complete')
            ->get();

        if ($children->count() < 2) {
            Log::info('Consistency pass skipped — needs ≥2 completed child pages', [
                'parent_scan_id' => $parent->id,
                'complete_children' => $children->count(),
            ]);
            return;
        }

        $outDirRoot = rtrim((string) config('scanner.out_dir'), '/');
        $consolidatedDir = sys_get_temp_dir().'/g3-consistency-'.$parent->id.'-'.bin2hex(random_bytes(4));
        if (! @mkdir($consolidatedDir.'/pages', 0775, true) && ! is_dir($consolidatedDir.'/pages')) {
            Log::error('Consistency pass could not create consolidated dir', ['dir' => $consolidatedDir]);
            return;
        }

        $siteHost = null;
        $linkedCount = 0;

        try {
            foreach ($children as $child) {
                $childRunDir = $this->findChildRunDir($outDirRoot, $parent->license_id, $child->id);
                if (! $childRunDir) {
                    continue;
                }
                $childPagesDir = $childRunDir.'/pages';
                if (! is_dir($childPagesDir)) {
                    continue;
                }

                foreach (scandir($childPagesDir) as $slug) {
                    if ($slug === '.' || $slug === '..') {
                        continue;
                    }
                    $src = realpath($childPagesDir.'/'.$slug);
                    $dst = $consolidatedDir.'/pages/'.$slug;
                    if ($src && ! file_exists($dst)) {
                        @symlink($src, $dst);
                        $linkedCount++;
                    }
                }

                if (! $siteHost && $child->url) {
                    $siteHost = parse_url($child->url, PHP_URL_HOST);
                }
            }

            if ($linkedCount < 2 || ! $siteHost) {
                Log::info('Consistency pass skipped — insufficient page probe data', [
                    'parent_scan_id' => $parent->id,
                    'linked' => $linkedCount,
                    'site_host' => $siteHost,
                ]);
                return;
            }

            $result = $scanner->consistencyPass($consolidatedDir, $siteHost);
            $findings = $result['findings'] ?? [];

            $this->upsertAndReconcile($parent, $children, $findings);

            Log::info('Consistency pass complete', [
                'parent_scan_id' => $parent->id,
                'pages_compared' => $linkedCount,
                'findings_emitted' => count($findings),
            ]);
        } catch (ScannerException|Throwable $e) {
            Log::error('Consistency pass failed', [
                'parent_scan_id' => $parent->id,
                'error' => $e->getMessage(),
            ]);
            // Don't fail the parent scan — consistency is additive
        } finally {
            $this->rrmdir($consolidatedDir);
        }
    }

    private function findChildRunDir(string $outDirRoot, int $licenseId, int $childScanId): ?string
    {
        $pattern = $outDirRoot.'/'.$licenseId.'/*/scan-'.$childScanId;
        $matches = glob($pattern);
        return $matches[0] ?? null;
    }

    private function upsertAndReconcile(Scan $parent, $children, array $findings): void
    {
        $licenseId = $parent->license_id;
        $seenByUrl = [];

        DB::transaction(function () use ($parent, $licenseId, $findings, &$seenByUrl) {
            foreach ($findings as $f) {
                $fp = $f['fingerprint'] ?? null;
                if (! $fp) {
                    continue;
                }
                $url = UrlNormalizer::normalize($f['url'] ?? '') ?? ($f['url'] ?? '');
                $seenByUrl[$url][] = $fp;

                $common = [
                    'url' => $url,
                    'wcag_rule' => $f['wcag'] ?? '',
                    'finding_type' => $f['finding_type'] ?? 'unknown',
                    'severity' => $f['severity'] ?? 'moderate',
                    'rationale' => $f['rationale'] ?? '',
                    'snippet' => $f['current_value'] ?? null,
                    'suggested_fix' => $f['suggested_fix'] ?? null,
                    'target' => $f['target'] ?? null,
                    'context' => $f['context'] ?? null,
                    'last_seen_scan_id' => $parent->id,
                ];

                $existing = Finding::where('license_id', $licenseId)
                    ->where('fingerprint', $fp)
                    ->first();

                if (! $existing) {
                    Finding::create(array_merge($common, [
                        'license_id' => $licenseId,
                        'fingerprint' => $fp,
                        'first_seen_scan_id' => $parent->id,
                        'status' => 'open',
                    ]));
                } elseif ($existing->status === 'resolved') {
                    $existing->fill($common);
                    $existing->status = 'regressed';
                    $existing->resolved_at = null;
                    $existing->save();
                } else {
                    $existing->fill($common)->save();
                }
            }
        });

        // Reconcile: for every URL included in this full scan, any open/regressed
        // consistency finding not present in the new set is marked resolved.
        $scopeUrls = $children
            ->pluck('url')
            ->map(fn ($u) => UrlNormalizer::normalize($u) ?? $u)
            ->filter()
            ->unique()
            ->all();

        foreach ($scopeUrls as $url) {
            $fpsSeen = $seenByUrl[$url] ?? [];
            $query = Finding::where('license_id', $licenseId)
                ->where('url', $url)
                ->whereIn('finding_type', self::CONSISTENCY_TYPES)
                ->whereIn('status', ['open', 'regressed']);
            if (count($fpsSeen) > 0) {
                $query->whereNotIn('fingerprint', $fpsSeen);
            }
            $query->update(['status' => 'resolved', 'resolved_at' => now()]);
        }

        // Fold consistency findings into the parent's total.
        $parent->increment('findings_total', count($findings));
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
