<?php

namespace App\Livewire\Adhoc;

use App\Jobs\DiscoverSiteUrlsJob;
use App\Jobs\RunPageScanJob;
use App\Models\License;
use App\Models\Scan;
use App\Services\ScannerException;
use App\Services\ScannerRunner;
use App\Support\UrlNormalizer;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Validate;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('Ad-hoc Scans')]
class Index extends Component
{
    #[Validate('required|url')]
    public string $url = '';

    #[Validate('nullable|string|max:255')]
    public ?string $label = null;

    #[Validate('required|in:page,full,selected')]
    public string $type = 'page';

    public string $urlList = '';

    public ?int $latestScanId = null;

    public ?string $sitemapNotice = null;

    public function scan(): void
    {
        $this->validate();

        $normalized = UrlNormalizer::normalize($this->url);
        if (! $normalized) {
            $this->addError('url', 'URL must be a valid http(s) URL.');
            return;
        }

        $license = License::internal();

        if ($this->type === 'selected') {
            $urls = $this->parseUrlList($this->urlList);
            if (count($urls) === 0) {
                $this->addError('urlList', 'Paste at least one valid URL (one per line).');
                return;
            }

            $scan = Scan::create([
                'license_id' => $license->id,
                'type' => 'full',
                'status' => 'queued',
                'url' => $normalized,
                'error' => $this->label ? "label: {$this->label}" : null,
            ]);
            DiscoverSiteUrlsJob::dispatch($scan->id, $urls);
        } else {
            $scan = Scan::create([
                'license_id' => $license->id,
                'type' => $this->type,
                'status' => 'queued',
                'url' => $normalized,
                'error' => $this->label ? "label: {$this->label}" : null,
            ]);

            if ($this->type === 'page') {
                RunPageScanJob::dispatch($scan->id);
            } else {
                DiscoverSiteUrlsJob::dispatch($scan->id, []);
            }
        }

        $this->latestScanId = $scan->id;
        $this->reset(['url', 'label', 'urlList', 'sitemapNotice']);
        $this->type = 'page';
    }

    public function fetchSitemap(ScannerRunner $scanner): void
    {
        $normalized = UrlNormalizer::normalize($this->url);
        if (! $normalized) {
            $this->addError('url', 'Enter a valid URL first.');
            return;
        }

        try {
            $result = $scanner->discover($normalized, maxPages: 500);
        } catch (ScannerException|\Throwable $e) {
            $this->sitemapNotice = 'Could not fetch sitemap: '.$e->getMessage();
            return;
        }

        $urls = collect($result['urls'] ?? [])
            ->map(fn ($u) => UrlNormalizer::normalize($u))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $existing = $this->parseUrlList($this->urlList);
        $merged = array_values(array_unique(array_merge($existing, $urls)));

        $source = $result['source'] ?? 'unknown';
        $this->urlList = implode("\n", $merged);
        $this->sitemapNotice = sprintf(
            '%d URL%s loaded from %s. Edit the list below — remove anything you don\'t want to scan.',
            count($urls),
            count($urls) === 1 ? '' : 's',
            $source === 'sitemap' ? 'sitemap' : 'link crawl'
        );
    }

    private function parseUrlList(string $raw): array
    {
        return collect(preg_split('/\r\n|\r|\n/', $raw))
            ->map(fn ($l) => trim($l))
            ->filter(fn ($l) => $l !== '' && ! str_starts_with($l, '#'))
            ->map(fn ($l) => UrlNormalizer::normalize($l))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    public function rescan(string $url, string $type): void
    {
        $normalized = UrlNormalizer::normalize($url);
        if (! $normalized) {
            return;
        }

        $license = License::internal();
        $scan = Scan::create([
            'license_id' => $license->id,
            'type' => $type,
            'status' => 'queued',
            'url' => $normalized,
        ]);

        if ($type === 'page') {
            RunPageScanJob::dispatch($scan->id);
        } else {
            DiscoverSiteUrlsJob::dispatch($scan->id, []);
        }

        $this->latestScanId = $scan->id;
    }

    public function render(): View
    {
        $internalId = License::internal()->id;

        $recentScans = Scan::where('license_id', $internalId)
            ->whereNull('parent_scan_id')
            ->orderByDesc('created_at')
            ->take(25)
            ->get();

        // One row per URL, favoring the most recent top-level scan as the
        // "entry point" for that URL (so clicking it opens the latest scan).
        $byUrl = Scan::where('license_id', $internalId)
            ->whereNull('parent_scan_id')
            ->orderBy('url')
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('url')
            ->map(function ($group) {
                $latest = $group->first();
                return (object) [
                    'url' => $latest->url,
                    'latest_scan' => $latest,
                    'scan_count' => $group->count(),
                    'last_scanned_at' => $group->max('created_at'),
                ];
            })
            ->sortByDesc('last_scanned_at')
            ->take(25)
            ->values();

        $hasPending = Scan::where('license_id', $internalId)
            ->whereIn('status', ['queued', 'running'])
            ->exists();

        return view('livewire.adhoc.index', [
            'recentScans' => $recentScans,
            'byUrl' => $byUrl,
            'internalLicenseId' => $internalId,
            'hasPending' => $hasPending,
        ]);
    }
}
