<?php

namespace App\Livewire;

use App\Models\Finding;
use App\Models\License;
use App\Models\Scan;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('Dashboard')]
class Overview extends Component
{
    public function render(): View
    {
        $totalLicenses = License::client()->count();
        $activeLicenses = License::client()->where('status', 'active')->count();
        $suspendedLicenses = License::client()->where('status', 'suspended')->count();

        $internalLicenseId = License::where('is_internal', true)->value('id');

        $openFindings = Finding::where('status', 'open')
            ->when($internalLicenseId, fn ($q) => $q->where('license_id', '!=', $internalLicenseId))
            ->count();
        $regressedFindings = Finding::where('status', 'regressed')
            ->when($internalLicenseId, fn ($q) => $q->where('license_id', '!=', $internalLicenseId))
            ->count();
        $resolvedFindings = Finding::where('status', 'resolved')
            ->when($internalLicenseId, fn ($q) => $q->where('license_id', '!=', $internalLicenseId))
            ->count();

        $scansLast24h = Scan::where('created_at', '>=', now()->subDay())
            ->when($internalLicenseId, fn ($q) => $q->where('license_id', '!=', $internalLicenseId))
            ->count();
        $failedScansLast24h = Scan::where('status', 'failed')
            ->where('created_at', '>=', now()->subDay())
            ->when($internalLicenseId, fn ($q) => $q->where('license_id', '!=', $internalLicenseId))
            ->count();

        $needsAttention = License::client()
            ->where('status', 'active')
            ->withCount([
                'findings as open_count' => fn ($q) => $q->where('status', 'open'),
                'findings as regressed_count' => fn ($q) => $q->where('status', 'regressed'),
            ])
            ->orderByDesc('regressed_count')
            ->orderByDesc('open_count')
            ->take(10)
            ->get();

        return view('livewire.overview', [
            'stats' => [
                'totalLicenses' => $totalLicenses,
                'activeLicenses' => $activeLicenses,
                'suspendedLicenses' => $suspendedLicenses,
                'openFindings' => $openFindings,
                'regressedFindings' => $regressedFindings,
                'resolvedFindings' => $resolvedFindings,
                'scansLast24h' => $scansLast24h,
                'failedScansLast24h' => $failedScansLast24h,
            ],
            'needsAttention' => $needsAttention,
        ]);
    }
}
