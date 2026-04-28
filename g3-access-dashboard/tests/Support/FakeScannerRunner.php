<?php

namespace Tests\Support;

use App\Services\ScannerRunner;

class FakeScannerRunner extends ScannerRunner
{
    /** @var array<string, string> site_url => fixture path mapping per call, evaluated per scanPage invocation */
    public array $pageFixtures = [];

    /** @var array<string, array> */
    public array $discoverResults = [];

    public int $scanPageCalls = 0;

    public int $discoverCalls = 0;

    public function discover(string $url, ?int $maxPages = null, ?int $timeoutMs = null): array
    {
        $this->discoverCalls++;
        return $this->discoverResults[$url] ?? [
            'root' => $url,
            'source' => 'root-only',
            'urls' => [$url],
        ];
    }

    public function scanPage(string $url, string $outDir, string $runId, ?int $processTimeoutMs = null): array
    {
        $this->scanPageCalls++;

        $fixturePath = $this->pageFixtures[$url] ?? null;
        if (! $fixturePath || ! is_file($fixturePath)) {
            throw new \RuntimeException("FakeScannerRunner: no fixture registered for URL {$url}");
        }

        $site = parse_url($url, PHP_URL_HOST) ?? 'unknown';
        $siteSlug = str_replace('.', '-', $site);
        $runDir = rtrim($outDir, '/')."/{$siteSlug}/{$runId}";

        if (! is_dir($runDir) && ! @mkdir($runDir, 0775, true)) {
            throw new \RuntimeException("Cannot create {$runDir}");
        }

        copy($fixturePath, $runDir.'/findings.json');

        return ['run_dir' => $runDir];
    }
}
