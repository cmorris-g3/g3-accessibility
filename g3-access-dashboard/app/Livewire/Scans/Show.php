<?php

namespace App\Livewire\Scans;

use App\Jobs\RunPageScanJob;
use App\Models\Finding;
use App\Models\License;
use App\Models\Scan;
use App\Support\UrlNormalizer;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('Scan detail')]
class Show extends Component
{
    use WithPagination;

    public Scan $scan;

    #[Url]
    public string $status = 'open';

    #[Url]
    public string $severity = '';

    #[Url]
    public string $url = '';

    public function mount(Scan $scan): void
    {
        $this->scan = $scan->load('license');
    }

    public function updating($property): void
    {
        if (in_array($property, ['status', 'severity', 'url'], true)) {
            $this->resetPage();
        }
    }

    public function clearUrlFilter(): void
    {
        $this->url = '';
        $this->resetPage();
    }

    public function rescanPage(string $url): void
    {
        if ($this->scan->type !== 'full') {
            return;
        }

        $normalized = UrlNormalizer::normalize($url) ?? $url;

        $child = Scan::create([
            'license_id' => $this->scan->license_id,
            'type' => 'page',
            'status' => 'queued',
            'url' => $normalized,
            'parent_scan_id' => $this->scan->id,
        ]);

        // Keep pages_total honest so the parent's pages_done can catch up naturally.
        $this->scan->increment('pages_total');
        $this->scan->refresh();

        RunPageScanJob::dispatch($child->id);
    }

    private function scopeUrls(): array
    {
        if ($this->scan->type === 'full') {
            return Scan::where('parent_scan_id', $this->scan->id)
                ->pluck('url')
                ->filter()
                ->unique()
                ->values()
                ->all();
        }
        return $this->scan->url ? [$this->scan->url] : [];
    }

    public function render(): View
    {
        $scopeUrls = $this->scopeUrls();
        $licenseId = $this->scan->license_id;

        $pages = null;
        $hasPending = false;
        if ($this->scan->type === 'full') {
            // One row per URL — show the LATEST scan for that URL (handles rescans).
            $pages = Scan::where('parent_scan_id', $this->scan->id)
                ->orderBy('url')
                ->orderByDesc('created_at')
                ->get()
                ->groupBy('url')
                ->map(function ($group) use ($licenseId) {
                    $latest = $group->first();
                    $openCounts = Finding::where('license_id', $licenseId)
                        ->whereHas('occurrences', fn ($q) => $q->where('url', $latest->url))
                        ->where('status', 'open')
                        ->selectRaw('severity, count(*) as c')
                        ->groupBy('severity')
                        ->pluck('c', 'severity');
                    $openTotal = (int) array_sum($openCounts->toArray());
                    return (object) [
                        'scan' => $latest,
                        'scan_count' => $group->count(),
                        'critical' => (int) ($openCounts['critical'] ?? 0),
                        'serious' => (int) ($openCounts['serious'] ?? 0),
                        'moderate' => (int) ($openCounts['moderate'] ?? 0),
                        'minor' => (int) ($openCounts['minor'] ?? 0),
                        'open' => $openTotal,
                    ];
                })
                ->values();

            $hasPending = Scan::where('parent_scan_id', $this->scan->id)
                ->whereIn('status', ['queued', 'running'])
                ->exists();
        } elseif (in_array($this->scan->status, ['queued', 'running'], true)) {
            $hasPending = true;
        }

        /** @var LengthAwarePaginator $findings */
        $findings = Finding::query()
            ->where('license_id', $licenseId)
            ->when(count($scopeUrls) > 0, fn ($q) => $q->whereHas('occurrences', fn ($qq) => $qq->whereIn('url', $scopeUrls)))
            ->when($this->status !== '' && $this->status !== 'all', fn ($q) => $q->where('status', $this->status))
            ->when($this->severity !== '', fn ($q) => $q->where('severity', $this->severity))
            ->when($this->url !== '', fn ($q) => $q->whereHas('occurrences', fn ($qq) => $qq->where('url', $this->url)))
            ->orderByDesc('updated_at')
            ->paginate(50);

        $summary = Finding::where('license_id', $licenseId)
            ->when(count($scopeUrls) > 0, fn ($q) => $q->whereHas('occurrences', fn ($qq) => $qq->whereIn('url', $scopeUrls)))
            ->selectRaw('status, count(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $isInternal = $this->scan->license && $this->scan->license->is_internal;
        $backHref = $isInternal ? route('adhoc.index') : route('sites.show', $this->scan->license_id);
        $backLabel = $isInternal ? 'Ad-hoc Scans' : ($this->scan->license->name ?? 'Sites');

        return view('livewire.scans.show', [
            'pages' => $pages,
            'findings' => $findings,
            'summary' => $summary,
            'scopeUrls' => $scopeUrls,
            'backHref' => $backHref,
            'backLabel' => $backLabel,
            'isInternal' => $isInternal,
            'hasPending' => $hasPending,
        ]);
    }
}
