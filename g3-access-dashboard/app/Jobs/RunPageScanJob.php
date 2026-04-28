<?php

namespace App\Jobs;

use App\Models\Finding;
use App\Models\License;
use App\Models\Scan;
use App\Services\ScannerException;
use App\Services\ScannerRunner;
use App\Support\UrlNormalizer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable as QueueableTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class RunPageScanJob implements ShouldQueue
{
    use QueueableTrait;

    public int $tries = 1;

    public function __construct(public int $scanId) {}

    public function handle(ScannerRunner $scanner): void
    {
        $scan = Scan::find($this->scanId);
        if (! $scan) {
            return;
        }
        if ($scan->status !== 'queued') {
            return;
        }

        $license = License::find($scan->license_id);
        if (! $license || ! $license->isActive()) {
            $scan->update([
                'status' => 'failed',
                'error' => 'License is not active at run time',
                'completed_at' => now(),
            ]);
            $this->bumpParent($scan);
            return;
        }

        $concurrencyLimit = $license->quota('concurrency');
        $running = Scan::where('license_id', $scan->license_id)
            ->where('type', 'page')
            ->where('status', 'running')
            ->count();
        if ($running >= $concurrencyLimit) {
            $this->release(30);
            return;
        }

        $scan->update(['status' => 'running', 'started_at' => now()]);
        $t0 = microtime(true);

        try {
            $outDir = rtrim((string) config('scanner.out_dir'), '/').'/'.$scan->license_id;
            $runId = 'scan-'.$scan->id;

            $result = $scanner->scanPage($scan->url, $outDir, $runId);

            $runDir = $result['run_dir'] ?? null;
            if (! $runDir || ! is_dir($runDir)) {
                throw new \RuntimeException("Scanner returned missing run_dir: ".json_encode($result));
            }

            $findingsPath = $runDir.'/findings.json';
            if (! is_file($findingsPath)) {
                throw new \RuntimeException("findings.json not found at {$findingsPath}");
            }

            $payload = json_decode((string) file_get_contents($findingsPath), true, flags: JSON_THROW_ON_ERROR);
            $findings = $payload['findings'] ?? [];

            $this->reconcile($scan, $findings);

            $duration = (int) round((microtime(true) - $t0) * 1000);
            $scan->update([
                'status' => 'complete',
                'completed_at' => now(),
                'findings_total' => count($findings),
            ]);

            Log::info('Page scan complete', [
                'scan_id' => $scan->id,
                'url' => $scan->url,
                'findings' => count($findings),
                'duration_ms' => $duration,
            ]);

            $this->bumpParent($scan, successful: true);
        } catch (ScannerException|Throwable $e) {
            $scan->update([
                'status' => 'failed',
                'completed_at' => now(),
                'error' => substr((string) $e->getMessage(), 0, 2000),
            ]);
            Log::error('Page scan failed', [
                'scan_id' => $scan->id,
                'url' => $scan->url,
                'error' => $e->getMessage(),
            ]);
            $this->bumpParent($scan, successful: false);
        }
    }

    private function reconcile(Scan $scan, array $findings): void
    {
        $normalizedUrl = UrlNormalizer::normalize($scan->url) ?? $scan->url;
        $seenFingerprints = [];

        DB::transaction(function () use ($scan, $findings, $normalizedUrl, &$seenFingerprints) {
            foreach ($findings as $f) {
                $fp = $f['fingerprint'] ?? null;
                if (! $fp) {
                    continue;
                }
                $seenFingerprints[] = $fp;

                $existing = Finding::where('license_id', $scan->license_id)
                    ->where('fingerprint', $fp)
                    ->first();

                $common = [
                    'url' => $normalizedUrl,
                    'wcag_rule' => $f['wcag'] ?? '',
                    'finding_type' => $f['finding_type'] ?? 'unknown',
                    'severity' => $f['severity'] ?? 'moderate',
                    'rationale' => $f['rationale'] ?? '',
                    'snippet' => $f['current_value'] ?? null,
                    'suggested_fix' => $f['suggested_fix'] ?? null,
                    'target' => $f['target'] ?? null,
                    'context' => $f['context'] ?? null,
                    'last_seen_scan_id' => $scan->id,
                ];

                if (! $existing) {
                    Finding::create(array_merge($common, [
                        'license_id' => $scan->license_id,
                        'fingerprint' => $fp,
                        'first_seen_scan_id' => $scan->id,
                        'status' => 'open',
                    ]));
                    continue;
                }

                if ($existing->status === 'resolved') {
                    $existing->fill($common);
                    $existing->status = 'regressed';
                    $existing->resolved_at = null;
                    $existing->save();
                } else {
                    $existing->fill($common)->save();
                }
            }

            Finding::where('license_id', $scan->license_id)
                ->where('url', $normalizedUrl)
                ->whereIn('status', ['open', 'regressed'])
                ->when(count($seenFingerprints) > 0, fn ($q) => $q->whereNotIn('fingerprint', $seenFingerprints))
                ->update([
                    'status' => 'resolved',
                    'resolved_at' => now(),
                ]);
        });
    }

    private function bumpParent(Scan $scan, bool $successful = false): void
    {
        if (! $scan->parent_scan_id) {
            return;
        }

        $parent = Scan::find($scan->parent_scan_id);
        if (! $parent) {
            return;
        }

        $justCompleted = false;

        DB::transaction(function () use ($parent, &$justCompleted) {
            $parent->increment('pages_done');
            $parent->refresh();

            if ($parent->pages_done >= $parent->pages_total && $parent->status === 'running') {
                $findingsTotal = (int) Scan::where('parent_scan_id', $parent->id)
                    ->where('status', 'complete')
                    ->sum('findings_total');
                $anyFailed = Scan::where('parent_scan_id', $parent->id)
                    ->where('status', 'failed')
                    ->exists();
                $parent->update([
                    'status' => $anyFailed && $findingsTotal === 0 ? 'failed' : 'complete',
                    'completed_at' => now(),
                    'findings_total' => $findingsTotal,
                ]);
                $justCompleted = true;
            }
        });

        // Once the parent full-site scan has all its children in, dispatch the
        // consistency probe pass. It reads every child's per-page probe data
        // and emits cross-page findings (skip-link / nav / help consistency).
        if ($justCompleted) {
            \App\Jobs\RunConsistencyPassJob::dispatch($parent->id);
        }
    }
}
