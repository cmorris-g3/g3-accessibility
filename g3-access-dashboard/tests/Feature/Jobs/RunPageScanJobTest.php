<?php

namespace Tests\Feature\Jobs;

use App\Jobs\RunPageScanJob;
use App\Models\Finding;
use App\Models\Scan;
use App\Services\ScannerRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakeScannerRunner;
use Tests\Support\LicenseHelpers;
use Tests\TestCase;

class RunPageScanJobTest extends TestCase
{
    use RefreshDatabase;
    use LicenseHelpers;

    private FakeScannerRunner $fake;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fake = new FakeScannerRunner();
        $this->app->instance(ScannerRunner::class, $this->fake);

        config(['scanner.out_dir' => storage_path('framework/testing/scanner-runs')]);
    }

    protected function tearDown(): void
    {
        $dir = storage_path('framework/testing/scanner-runs');
        if (is_dir($dir)) {
            $this->rrmdir($dir);
        }
        parent::tearDown();
    }

    public function test_first_scan_inserts_findings_as_open(): void
    {
        ['license' => $license] = $this->mintLicense('https://example.com');
        $scan = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'queued',
            'url' => 'https://example.com/',
        ]);

        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');

        (new RunPageScanJob($scan->id))->handle($this->fake);

        $scan->refresh();
        $this->assertSame('complete', $scan->status);
        $this->assertSame(3, $scan->findings_total);

        $findings = Finding::where('license_id', $license->id)->get();
        $this->assertCount(3, $findings);
        $this->assertTrue($findings->every(fn ($f) => $f->status === 'open'));
        $this->assertTrue($findings->every(fn ($f) => $f->first_seen_scan_id === $scan->id));
        $this->assertTrue($findings->every(fn ($f) => $f->last_seen_scan_id === $scan->id));
    }

    public function test_second_scan_with_missing_finding_resolves_it(): void
    {
        ['license' => $license] = $this->mintLicense('https://example.com');

        $scan1 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');
        (new RunPageScanJob($scan1->id))->handle($this->fake);

        $this->assertSame(3, Finding::where('status', 'open')->count());

        $scan2 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-B.json');
        (new RunPageScanJob($scan2->id))->handle($this->fake);

        $this->assertSame(2, Finding::where('status', 'open')->count());
        $this->assertSame(1, Finding::where('status', 'resolved')->count());

        $resolved = Finding::where('status', 'resolved')->first();
        $this->assertSame('generic-link-text', $resolved->finding_type);
        $this->assertNotNull($resolved->resolved_at);

        $stillOpen = Finding::where('status', 'open')->get();
        $this->assertTrue($stillOpen->every(fn ($f) => $f->last_seen_scan_id === $scan2->id));
        $this->assertTrue($stillOpen->every(fn ($f) => $f->first_seen_scan_id === $scan1->id));
    }

    public function test_previously_resolved_finding_returning_marks_regressed(): void
    {
        ['license' => $license] = $this->mintLicense('https://example.com');

        $scan1 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');
        (new RunPageScanJob($scan1->id))->handle($this->fake);

        $scan2 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-B.json');
        (new RunPageScanJob($scan2->id))->handle($this->fake);

        $this->assertSame(1, Finding::where('status', 'resolved')->count());

        $scan3 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');
        (new RunPageScanJob($scan3->id))->handle($this->fake);

        $regressed = Finding::where('status', 'regressed')->first();
        $this->assertNotNull($regressed);
        $this->assertSame('generic-link-text', $regressed->finding_type);
        $this->assertNull($regressed->resolved_at);
        $this->assertSame($scan3->id, $regressed->last_seen_scan_id);
        $this->assertSame($scan1->id, $regressed->first_seen_scan_id);
    }

    public function test_ignored_finding_stays_ignored_on_rescan(): void
    {
        ['license' => $license] = $this->mintLicense('https://example.com');

        $scan1 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');
        (new RunPageScanJob($scan1->id))->handle($this->fake);

        $toIgnore = Finding::where('finding_type', 'missing-alt')->first();
        $toIgnore->update(['status' => 'ignored', 'ignored_at' => now(), 'ignored_reason' => 'designer approved']);

        $scan2 = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/']);
        $this->fake->pageFixtures['https://example.com/'] = base_path('tests/Fixtures/findings-fixture-A.json');
        (new RunPageScanJob($scan2->id))->handle($this->fake);

        $toIgnore->refresh();
        $this->assertSame('ignored', $toIgnore->status);
        $this->assertSame($scan2->id, $toIgnore->last_seen_scan_id);
    }

    private function rrmdir(string $dir): void
    {
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir.'/'.$entry;
            is_dir($path) ? $this->rrmdir($path) : unlink($path);
        }
        rmdir($dir);
    }
}
