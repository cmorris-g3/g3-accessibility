<?php

namespace Tests\Feature\Livewire;

use App\Jobs\RunPageScanJob;
use App\Livewire\Scans\Show as ScansShow;
use App\Models\License;
use App\Models\Scan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Livewire\Livewire;
use Tests\TestCase;

class ScansShowTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsUser(): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->actingAs($user);
        return $user;
    }

    private function internalLicense(): License
    {
        return License::where('is_internal', true)->firstOrFail();
    }

    public function test_rescan_page_creates_a_child_scan_record_and_dispatches_job(): void
    {
        Bus::fake();
        $this->actingAsUser();
        $license = $this->internalLicense();

        $parent = Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'running',
            'url' => 'https://example.com/',
            'pages_total' => 1,
        ]);

        $existingChild = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/page',
            'parent_scan_id' => $parent->id,
        ]);

        $childCountBefore = Scan::where('parent_scan_id', $parent->id)->count();

        Livewire::test(ScansShow::class, ['scan' => $parent])
            ->call('rescanPage', 'https://example.com/page')
            ->assertHasNoErrors();

        $this->assertSame(
            $childCountBefore + 1,
            Scan::where('parent_scan_id', $parent->id)->count(),
            'rescanPage should create a new child scan record',
        );

        $newChild = Scan::where('parent_scan_id', $parent->id)
            ->where('id', '!=', $existingChild->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($newChild, 'a new child scan should exist');
        $this->assertSame('queued', $newChild->status);
        $this->assertSame('https://example.com/page', $newChild->url);

        Bus::assertDispatched(RunPageScanJob::class, function ($job) use ($newChild) {
            return $job->scanId === $newChild->id;
        });
    }

    public function test_rescan_page_increments_parents_pages_total(): void
    {
        Bus::fake();
        $this->actingAsUser();
        $license = $this->internalLicense();

        $parent = Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'running',
            'url' => 'https://example.com/',
            'pages_total' => 3,
        ]);

        Livewire::test(ScansShow::class, ['scan' => $parent])
            ->call('rescanPage', 'https://example.com/foo');

        $parent->refresh();
        $this->assertSame(4, $parent->pages_total);
    }

    public function test_rescan_page_no_op_for_non_full_parents(): void
    {
        Bus::fake();
        $this->actingAsUser();
        $license = $this->internalLicense();

        $pageScan = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/foo',
        ]);

        Livewire::test(ScansShow::class, ['scan' => $pageScan])
            ->call('rescanPage', 'https://example.com/foo');

        Bus::assertNotDispatched(RunPageScanJob::class);
    }
}
