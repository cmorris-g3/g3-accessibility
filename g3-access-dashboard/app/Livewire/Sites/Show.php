<?php

namespace App\Livewire\Sites;

use App\Models\Finding;
use App\Models\License;
use App\Models\Scan;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('Site detail')]
class Show extends Component
{
    public License $license;

    public function mount(License $license): void
    {
        $this->license = $license->load(['activations']);
    }

    public function suspend(): void
    {
        $this->license->update(['status' => 'suspended']);
        $this->license->refresh();
    }

    public function unsuspend(): void
    {
        $this->license->update(['status' => 'active']);
        $this->license->refresh();
    }

    public function render(): View
    {
        $activation = $this->license->activations->first();

        $findingCounts = [
            'open' => Finding::where('license_id', $this->license->id)->where('status', 'open')->count(),
            'regressed' => Finding::where('license_id', $this->license->id)->where('status', 'regressed')->count(),
            'resolved' => Finding::where('license_id', $this->license->id)->where('status', 'resolved')->count(),
            'ignored' => Finding::where('license_id', $this->license->id)->where('status', 'ignored')->count(),
        ];

        $recentScans = Scan::where('license_id', $this->license->id)
            ->whereNull('parent_scan_id')
            ->orderByDesc('created_at')
            ->take(15)
            ->get();

        $topFindings = Finding::where('license_id', $this->license->id)
            ->whereIn('status', ['regressed', 'open'])
            ->orderByRaw("CASE severity WHEN 'critical' THEN 0 WHEN 'serious' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')
            ->take(20)
            ->get();

        return view('livewire.sites.show', compact('activation', 'findingCounts', 'recentScans', 'topFindings'));
    }
}
