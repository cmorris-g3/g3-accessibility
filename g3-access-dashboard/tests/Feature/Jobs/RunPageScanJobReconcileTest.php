<?php

namespace Tests\Feature\Jobs;

use App\Jobs\RunPageScanJob;
use App\Models\Finding;
use App\Models\FindingOccurrence;
use App\Models\License;
use App\Models\Scan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionClass;
use Tests\TestCase;

class RunPageScanJobReconcileTest extends TestCase
{
    use RefreshDatabase;

    private function internalLicense(): License
    {
        return License::where('is_internal', true)->firstOrFail();
    }

    private function makeScan(int $licenseId, string $url): Scan
    {
        return Scan::create([
            'license_id' => $licenseId,
            'type' => 'page',
            'status' => 'running',
            'url' => $url,
        ]);
    }

    private function findingPayload(string $type, string $fingerprint, string $url, string $severity = 'serious'): array
    {
        return [
            'fingerprint' => $fingerprint,
            'finding_type' => $type,
            'wcag' => 'WCAG 2.2 SC 1.0.0',
            'severity' => $severity,
            'rationale' => 'test',
            'current_value' => null,
            'suggested_fix' => null,
            'target' => null,
            'context' => null,
            'url' => $url,
        ];
    }

    /**
     * Invokes the private reconcile() so tests don't have to spin up a real
     * scanner subprocess. Mirrors the path RunPageScanJob::handle takes after
     * loading findings.json from disk.
     */
    private function reconcile(Scan $scan, array $findings): void
    {
        $job = new RunPageScanJob($scan->id);
        $reflect = new ReflectionClass($job);
        $method = $reflect->getMethod('reconcile');
        $method->setAccessible(true);
        $method->invoke($job, $scan, $findings);
    }

    public function test_same_fingerprint_on_two_urls_creates_one_finding_with_two_occurrences(): void
    {
        $license = $this->internalLicense();
        $urlA = 'https://www.example.com/getpage.php?name=foo';
        $urlB = 'https://www.example.com/getpage.php?name=bar';

        $scanA = $this->makeScan($license->id, $urlA);
        $scanB = $this->makeScan($license->id, $urlB);

        // Same fingerprint on both URLs (template-level issue surfacing on both pages).
        $shared = $this->findingPayload('redundant-link-text', 'fp-shared', $urlA);

        $this->reconcile($scanA, [$shared]);
        $this->reconcile($scanB, [array_merge($shared, ['url' => $urlB])]);

        $this->assertSame(1, Finding::count(), 'one Finding row for the shared fingerprint');

        $finding = Finding::first();
        // Finding.url stays at the FIRST-seen URL — not overwritten by scan B.
        $this->assertSame($urlA, $finding->url);

        $this->assertSame(2, $finding->occurrences()->count(), 'two occurrences (one per URL)');
        $this->assertEqualsCanonicalizing(
            [$urlA, $urlB],
            $finding->occurrences->pluck('url')->all(),
        );
    }

    public function test_per_url_query_via_occurrences_returns_finding_under_both_urls(): void
    {
        $license = $this->internalLicense();
        $urlA = 'https://www.example.com/a';
        $urlB = 'https://www.example.com/b';

        $scanA = $this->makeScan($license->id, $urlA);
        $scanB = $this->makeScan($license->id, $urlB);

        $this->reconcile($scanA, [$this->findingPayload('missing-alt', 'fp1', $urlA)]);
        $this->reconcile($scanB, [$this->findingPayload('missing-alt', 'fp1', $urlB)]);

        $foundUnderA = Finding::whereHas('occurrences', fn ($q) => $q->where('url', $urlA))->count();
        $foundUnderB = Finding::whereHas('occurrences', fn ($q) => $q->where('url', $urlB))->count();

        $this->assertSame(1, $foundUnderA, 'finding should query under URL A');
        $this->assertSame(1, $foundUnderB, 'finding should query under URL B');
    }

    public function test_rescan_without_fingerprint_removes_only_that_urls_occurrence(): void
    {
        $license = $this->internalLicense();
        $urlA = 'https://www.example.com/a';
        $urlB = 'https://www.example.com/b';

        // Initial: same fingerprint surfaces on both URLs.
        $scan1 = $this->makeScan($license->id, $urlA);
        $scan2 = $this->makeScan($license->id, $urlB);
        $this->reconcile($scan1, [$this->findingPayload('missing-alt', 'fp-template', $urlA)]);
        $this->reconcile($scan2, [$this->findingPayload('missing-alt', 'fp-template', $urlB)]);

        $this->assertSame(2, FindingOccurrence::count());

        // URL A is rescanned but the fingerprint no longer appears there
        // (e.g., the page-specific fix was applied).
        $rescanA = $this->makeScan($license->id, $urlA);
        $this->reconcile($rescanA, []); // no findings on this scan

        $finding = Finding::first();
        $this->assertSame('open', $finding->status, 'finding still active because URL B still has it');
        $occurrenceUrls = $finding->occurrences()->pluck('url')->all();
        $this->assertSame([$urlB], $occurrenceUrls, 'only URL B occurrence should remain');
    }

    public function test_rescan_clears_all_occurrences_marks_finding_resolved(): void
    {
        $license = $this->internalLicense();
        $urlA = 'https://www.example.com/a';
        $urlB = 'https://www.example.com/b';

        $scan1 = $this->makeScan($license->id, $urlA);
        $scan2 = $this->makeScan($license->id, $urlB);
        $this->reconcile($scan1, [$this->findingPayload('missing-alt', 'fp1', $urlA)]);
        $this->reconcile($scan2, [$this->findingPayload('missing-alt', 'fp1', $urlB)]);

        // Site-wide fix lands; rescan both URLs with no findings.
        $rescanA = $this->makeScan($license->id, $urlA);
        $this->reconcile($rescanA, []);
        $rescanB = $this->makeScan($license->id, $urlB);
        $this->reconcile($rescanB, []);

        $finding = Finding::first();
        $this->assertSame('resolved', $finding->status);
        $this->assertNotNull($finding->resolved_at);
        $this->assertSame(0, $finding->occurrences()->count(), 'all occurrences should be cleared');
    }

    public function test_finding_with_unique_fingerprints_per_url_creates_separate_findings(): void
    {
        $license = $this->internalLicense();
        $urlA = 'https://www.example.com/a';
        $urlB = 'https://www.example.com/b';

        $scanA = $this->makeScan($license->id, $urlA);
        $scanB = $this->makeScan($license->id, $urlB);

        // Different fingerprints — really different page-specific issues.
        $this->reconcile($scanA, [$this->findingPayload('empty-link', 'fp-A', $urlA)]);
        $this->reconcile($scanB, [$this->findingPayload('empty-link', 'fp-B', $urlB)]);

        $this->assertSame(2, Finding::count());
        $this->assertSame(2, FindingOccurrence::count());
        $this->assertSame(1, Finding::whereHas('occurrences', fn ($q) => $q->where('url', $urlA))->count());
        $this->assertSame(1, Finding::whereHas('occurrences', fn ($q) => $q->where('url', $urlB))->count());
    }

    public function test_resolved_finding_re_seen_is_marked_regressed(): void
    {
        $license = $this->internalLicense();
        $url = 'https://www.example.com/foo';

        $scan1 = $this->makeScan($license->id, $url);
        $this->reconcile($scan1, [$this->findingPayload('missing-alt', 'fp1', $url)]);

        // Fix it
        $scan2 = $this->makeScan($license->id, $url);
        $this->reconcile($scan2, []);

        $finding = Finding::first();
        $this->assertSame('resolved', $finding->status);

        // Issue comes back
        $scan3 = $this->makeScan($license->id, $url);
        $this->reconcile($scan3, [$this->findingPayload('missing-alt', 'fp1', $url)]);

        $finding->refresh();
        $this->assertSame('regressed', $finding->status);
        $this->assertNull($finding->resolved_at);
        $this->assertSame(1, $finding->occurrences()->count());
    }
}
