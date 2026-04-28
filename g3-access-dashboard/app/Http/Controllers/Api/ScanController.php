<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\DiscoverSiteUrlsJob;
use App\Jobs\RunPageScanJob;
use App\Models\License;
use App\Models\Scan;
use App\Support\UrlNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:page,full'],
            'url' => ['required_if:type,page', 'nullable', 'url'],
            'sitemap_urls' => ['nullable', 'array'],
            'sitemap_urls.*' => ['string', 'url'],
        ]);

        /** @var License $license */
        $license = $request->attributes->get('license');

        if ($validated['type'] === 'page') {
            $normalized = UrlNormalizer::normalize($validated['url']);
            if (! $normalized) {
                return response()->json([
                    'error' => ['code' => 'INVALID_URL', 'message' => 'url must be a valid http(s) URL.'],
                ], 422);
            }

            if ($rate = $this->pageScanRateError($license, $normalized)) {
                return $rate;
            }

            $scan = Scan::create([
                'license_id' => $license->id,
                'type' => 'page',
                'status' => 'queued',
                'url' => $normalized,
            ]);

            RunPageScanJob::dispatch($scan->id);

            return response()->json(['scan' => $this->publicScan($scan)], 202);
        }

        if ($rate = $this->fullScanRateError($license)) {
            return $rate;
        }

        $scan = Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'queued',
        ]);

        $sitemapUrls = collect($validated['sitemap_urls'] ?? [])
            ->map(fn ($u) => UrlNormalizer::normalize($u))
            ->filter()
            ->unique()
            ->values()
            ->all();

        DiscoverSiteUrlsJob::dispatch($scan->id, $sitemapUrls);

        return response()->json(['scan' => $this->publicScan($scan)], 202);
    }

    private function pageScanRateError(License $license, string $normalizedUrl): ?JsonResponse
    {
        $cooldownS = $license->quota('cooldown_s');
        $concurrencyLimit = $license->quota('concurrency');
        $dailyCap = $license->quota('daily_cap');

        $recent = Scan::where('license_id', $license->id)
            ->where('type', 'page')
            ->where('url', $normalizedUrl)
            ->where('created_at', '>=', now()->subSeconds($cooldownS))
            ->orderByDesc('created_at')
            ->first();
        if ($recent) {
            $elapsed = (int) now()->diffInSeconds($recent->created_at, true);
            $retryAfter = max(1, $cooldownS - $elapsed);
            return $this->rate('COOLDOWN', "Same URL scanned {$elapsed}s ago. Wait {$retryAfter}s.", $retryAfter);
        }

        $running = Scan::where('license_id', $license->id)
            ->where('type', 'page')
            ->whereIn('status', ['queued', 'running'])
            ->count();
        if ($running >= $concurrencyLimit) {
            return $this->rate('CONCURRENCY_LIMIT', "Already {$running} page scans in flight (limit {$concurrencyLimit}).", 30);
        }

        $todayCount = Scan::where('license_id', $license->id)
            ->where('type', 'page')
            ->where('created_at', '>=', now()->subDay())
            ->count();
        if ($todayCount >= $dailyCap) {
            return $this->rate('DAILY_CAP', "Daily cap of {$dailyCap} page scans reached.", 3600);
        }

        return null;
    }

    private function fullScanRateError(License $license): ?JsonResponse
    {
        $perDay = $license->quota('fullscan_per_day');

        $todayFullScans = Scan::where('license_id', $license->id)
            ->where('type', 'full')
            ->where('created_at', '>=', now()->subDay())
            ->count();
        if ($todayFullScans >= $perDay) {
            return $this->rate('FULLSCAN_LIMIT', "Already {$todayFullScans} full-site scan(s) in the last 24h (limit {$perDay}).", 3600);
        }

        $runningFull = Scan::where('license_id', $license->id)
            ->where('type', 'full')
            ->whereIn('status', ['queued', 'running'])
            ->exists();
        if ($runningFull) {
            return $this->rate('FULLSCAN_IN_PROGRESS', 'A full-site scan is already in progress.', 300);
        }

        return null;
    }

    private function rate(string $code, string $message, int $retryAfterS): JsonResponse
    {
        return response()
            ->json([
                'error' => [
                    'code' => $code,
                    'message' => $message,
                    'retry_after_s' => $retryAfterS,
                ],
            ], 429)
            ->header('Retry-After', (string) $retryAfterS);
    }

    public function show(Request $request, int $scan): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        $model = Scan::where('id', $scan)->where('license_id', $license->id)->first();
        if (! $model) {
            return response()->json(['error' => ['code' => 'NOT_FOUND']], 404);
        }

        return response()->json(['scan' => $this->publicScan($model)]);
    }

    private function publicScan(Scan $scan): array
    {
        return [
            'id' => $scan->id,
            'type' => $scan->type,
            'status' => $scan->status,
            'url' => $scan->url,
            'parent_scan_id' => $scan->parent_scan_id,
            'pages_total' => $scan->pages_total,
            'pages_done' => $scan->pages_done,
            'findings_total' => $scan->findings_total,
            'error' => $scan->error,
            'started_at' => $scan->started_at?->toIso8601String(),
            'completed_at' => $scan->completed_at?->toIso8601String(),
            'created_at' => $scan->created_at?->toIso8601String(),
        ];
    }
}
