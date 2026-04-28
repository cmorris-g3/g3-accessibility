<?php

namespace App\Jobs;

use App\Models\Scan;
use App\Models\ScanPage;
use App\Services\ScannerException;
use App\Services\ScannerRunner;
use App\Support\UrlNormalizer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable as QueueableTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class DiscoverSiteUrlsJob implements ShouldQueue
{
    use QueueableTrait;

    public int $tries = 1;

    public function __construct(public int $scanId, public array $suppliedUrls = []) {}

    public function handle(ScannerRunner $scanner): void
    {
        $scan = Scan::find($this->scanId);
        if (! $scan || $scan->status !== 'queued' || $scan->type !== 'full') {
            return;
        }

        $scan->update(['status' => 'running', 'started_at' => now()]);

        try {
            $urls = $this->resolveUrls($scan, $scanner);
            if (count($urls) === 0) {
                throw new \RuntimeException('No URLs discovered for site.');
            }

            DB::transaction(function () use ($scan, $urls, &$childIds) {
                foreach ($urls as $url) {
                    ScanPage::create([
                        'scan_id' => $scan->id,
                        'url' => $url,
                        'status' => 'queued',
                    ]);
                }
                $scan->update(['pages_total' => count($urls)]);
            });

            foreach ($urls as $url) {
                $child = Scan::create([
                    'license_id' => $scan->license_id,
                    'type' => 'page',
                    'status' => 'queued',
                    'url' => $url,
                    'parent_scan_id' => $scan->id,
                ]);
                RunPageScanJob::dispatch($child->id);
            }

            $scan->license()->update(['last_full_scan_at' => now()]);

            Log::info('Full-site scan dispatched', [
                'scan_id' => $scan->id,
                'pages' => count($urls),
            ]);
        } catch (ScannerException|Throwable $e) {
            $scan->update([
                'status' => 'failed',
                'completed_at' => now(),
                'error' => substr((string) $e->getMessage(), 0, 2000),
            ]);
            Log::error('DiscoverSiteUrlsJob failed', [
                'scan_id' => $scan->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function resolveUrls(Scan $scan, ScannerRunner $scanner): array
    {
        if (count($this->suppliedUrls) > 0) {
            return collect($this->suppliedUrls)
                ->map(fn ($u) => UrlNormalizer::normalize($u))
                ->filter()
                ->unique()
                ->values()
                ->all();
        }

        // Prefer an explicit root URL on the scan (used by ad-hoc scans that
        // don't go through an activation) over looking up the license activation.
        $root = null;
        if ($scan->url) {
            $root = $scan->url;
        } else {
            $activation = $scan->license->activations()->first();
            if ($activation) {
                $root = $activation->site_url;
            }
        }

        if (! $root) {
            throw new \RuntimeException('No root URL available for discovery (no scan.url and no activation).');
        }

        $result = $scanner->discover($root);
        $raw = $result['urls'] ?? [];
        return collect($raw)
            ->map(fn ($u) => UrlNormalizer::normalize($u))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
