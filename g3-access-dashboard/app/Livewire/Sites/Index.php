<?php

namespace App\Livewire\Sites;

use App\Models\License;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('Sites')]
class Index extends Component
{
    use WithPagination;

    #[Url(as: 'q')]
    public string $search = '';

    #[Url(as: 'status')]
    public string $statusFilter = '';

    public function updating($property): void
    {
        if (in_array($property, ['search', 'statusFilter'], true)) {
            $this->resetPage();
        }
    }

    public function suspend(int $licenseId): void
    {
        License::where('id', $licenseId)->update(['status' => 'suspended']);
    }

    public function unsuspend(int $licenseId): void
    {
        License::where('id', $licenseId)->update(['status' => 'active']);
    }

    public function render(): View
    {
        $licenses = License::query()
            ->client()
            ->when($this->search !== '', fn ($q) => $q->where('name', 'like', '%'.$this->search.'%'))
            ->when($this->statusFilter !== '', fn ($q) => $q->where('status', $this->statusFilter))
            ->withCount([
                'findings as open_count' => fn ($q) => $q->where('status', 'open'),
                'findings as regressed_count' => fn ($q) => $q->where('status', 'regressed'),
                'findings as resolved_count' => fn ($q) => $q->where('status', 'resolved'),
            ])
            ->with(['activations' => fn ($q) => $q->orderBy('id')])
            ->orderBy('name')
            ->paginate(25);

        return view('livewire.sites.index', compact('licenses'));
    }
}
