<?php

namespace App\Livewire\Findings;

use App\Models\Finding;
use App\Models\License;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('Findings')]
class Index extends Component
{
    use WithPagination;

    #[Url]
    public string $license = '';

    #[Url]
    public string $status = 'open';

    #[Url]
    public string $severity = '';

    #[Url]
    public string $url = '';

    #[Url(as: 'q')]
    public string $search = '';

    public function updating($property): void
    {
        if (in_array($property, ['license', 'status', 'severity', 'url', 'search'], true)) {
            $this->resetPage();
        }
    }

    public function clearUrlFilter(): void
    {
        $this->url = '';
        $this->resetPage();
    }

    public function render(): View
    {
        $findings = Finding::query()
            ->when($this->license !== '', fn ($q) => $q->where('license_id', (int) $this->license))
            ->when($this->status !== '' && $this->status !== 'all', fn ($q) => $q->where('status', $this->status))
            ->when($this->severity !== '', fn ($q) => $q->where('severity', $this->severity))
            ->when($this->url !== '', fn ($q) => $q->where('url', $this->url))
            ->when($this->search !== '', fn ($q) => $q->where(function ($q) {
                $q->where('url', 'like', '%'.$this->search.'%')
                  ->orWhere('finding_type', 'like', '%'.$this->search.'%')
                  ->orWhere('rationale', 'like', '%'.$this->search.'%');
            }))
            ->with('license:id,name')
            ->orderByDesc('updated_at')
            ->paginate(50);

        $licenses = License::client()->orderBy('name')->get(['id', 'name']);

        return view('livewire.findings.index', compact('findings', 'licenses'));
    }
}
