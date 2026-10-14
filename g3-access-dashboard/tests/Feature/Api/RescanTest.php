<?php

namespace Tests\Feature\Api;

use App\Jobs\DiscoverSiteUrlsJob;
use App\Jobs\RunPageScanJob;
use App\Models\Finding;
use App\Models\Scan;
use App\Models\ScanPage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\LicenseHelpers;
use Tests\TestCase;

class RescanTest extends TestCase
{
    use RefreshDatabase;
    use LicenseHelpers;

    public function test_page_rescan_repeats_the_same_url_and_records_lineage(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $source = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/about',
        ]);
        $this->backdate($source, now()->subDay());

        $response = $this->postJson("/api/scans/{$source->id}/rescan", [], $this->authHeaders($key, $site));

        $response->assertStatus(202);
        $response->assertJsonPath('scan.type', 'page');
        $response->assertJsonPath('scan.status', 'queued');
        $response->assertJsonPath('scan.url', 'https://example.com/about');
        $response->assertJsonPath('scan.source_scan_id', $source->id);

        Queue::assertPushed(RunPageScanJob::class);
    }

    public function test_full_rescan_replays_the_exact_page_set_without_rediscovery(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $source = Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'complete',
            'url' => 'https://example.com',
        ]);
        $this->backdate($source, now()->subDays(2));

        foreach (['https://example.com/', 'https://example.com/about', 'https://example.com/contact'] as $url) {
            ScanPage::create(['scan_id' => $source->id, 'url' => $url, 'status' => 'complete']);
        }

        $response = $this->postJson("/api/scans/{$source->id}/rescan", [], $this->authHeaders($key, $site));

        $response->assertStatus(202);
        $response->assertJsonPath('scan.type', 'full');
        $response->assertJsonPath('scan.source_scan_id', $source->id);

        // The exact original page set must be handed to the job, so discovery
        // is skipped and the comparison stays like-for-like.
        Queue::assertPushed(DiscoverSiteUrlsJob::class, function (DiscoverSiteUrlsJob $job) {
            return $job->suppliedUrls === [
                'https://example.com/',
                'https://example.com/about',
                'https://example.com/contact',
            ];
        });
    }

    public function test_full_rescan_rejects_a_source_scan_with_no_pages(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $source = Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'failed',
            'url' => 'https://example.com',
        ]);
        $this->backdate($source, now()->subDay());

        $response = $this->postJson("/api/scans/{$source->id}/rescan", [], $this->authHeaders($key, $site));

        $response->assertStatus(422);
        $response->assertJsonPath('error.code', 'NO_PAGES_TO_RESCAN');
        Queue::assertNotPushed(DiscoverSiteUrlsJob::class);
    }

    public function test_rescan_of_another_licenses_scan_is_not_found(): void
    {
        Queue::fake();
        ['key' => $key, 'site_url' => $site] = $this->mintLicense();
        ['license' => $other] = $this->mintLicense(siteUrl: 'https://other.test');

        $foreign = Scan::create([
            'license_id' => $other->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://other.test/',
        ]);

        $this->postJson("/api/scans/{$foreign->id}/rescan", [], $this->authHeaders($key, $site))
            ->assertStatus(404);
    }

    public function test_page_rescan_still_honours_the_cooldown(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $source = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/',
        ]);
        $this->backdate($source, now()->subSeconds(5));

        $response = $this->postJson("/api/scans/{$source->id}/rescan", [], $this->authHeaders($key, $site));

        $response->assertStatus(429);
        $response->assertJsonPath('error.code', 'COOLDOWN');
        $response->assertHeader('Retry-After');
    }

    public function test_findings_can_be_filtered_to_one_scan(): void
    {
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $scanA = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'complete', 'url' => 'https://example.com/a']);
        $scanB = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'complete', 'url' => 'https://example.com/b']);

        $this->makeFinding($license->id, $scanA, 'fp-a', 'https://example.com/a');
        $this->makeFinding($license->id, $scanB, 'fp-b', 'https://example.com/b');

        $byQuery = $this->getJson("/api/findings?scan_id={$scanA->id}", $this->authHeaders($key, $site));
        $byQuery->assertOk();
        $byQuery->assertJsonCount(1, 'findings');
        $byQuery->assertJsonPath('findings.0.url', 'https://example.com/a');

        $byRoute = $this->getJson("/api/scans/{$scanB->id}/findings", $this->authHeaders($key, $site));
        $byRoute->assertOk();
        $byRoute->assertJsonCount(1, 'findings');
        $byRoute->assertJsonPath('findings.0.url', 'https://example.com/b');
    }

    public function test_full_scan_findings_include_those_recorded_against_child_page_scans(): void
    {
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $full = Scan::create(['license_id' => $license->id, 'type' => 'full', 'status' => 'complete', 'url' => 'https://example.com']);
        $child = Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/about',
            'parent_scan_id' => $full->id,
        ]);

        // RunPageScanJob attributes findings to the page scan, not the parent.
        $this->makeFinding($license->id, $child, 'fp-child', 'https://example.com/about');

        $response = $this->getJson("/api/scans/{$full->id}/findings", $this->authHeaders($key, $site));

        $response->assertOk();
        $response->assertJsonCount(1, 'findings');
        $response->assertJsonPath('findings.0.url', 'https://example.com/about');
    }

    public function test_unknown_scan_id_filter_is_rejected(): void
    {
        ['key' => $key, 'site_url' => $site] = $this->mintLicense();

        $this->getJson('/api/findings?scan_id=999999', $this->authHeaders($key, $site))
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'SCAN_NOT_FOUND');
    }

    public function test_scans_can_be_listed_newest_first_and_hide_child_page_scans(): void
    {
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        $full = Scan::create(['license_id' => $license->id, 'type' => 'full', 'status' => 'complete', 'url' => 'https://example.com']);
        Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/about',
            'parent_scan_id' => $full->id,
        ]);
        $standalone = Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'complete', 'url' => 'https://example.com/solo']);

        $response = $this->getJson('/api/scans', $this->authHeaders($key, $site));

        $response->assertOk();
        // child page scan is hidden by default
        $response->assertJsonCount(2, 'scans');
        $response->assertJsonPath('scans.0.id', $standalone->id);
        $response->assertJsonPath('scans.1.id', $full->id);

        $withChildren = $this->getJson('/api/scans?top_level=0', $this->authHeaders($key, $site));
        $withChildren->assertOk();
        $withChildren->assertJsonCount(3, 'scans');
    }

    public function test_scan_list_does_not_leak_another_licenses_scans(): void
    {
        ['key' => $key, 'site_url' => $site] = $this->mintLicense();
        ['license' => $other] = $this->mintLicense(siteUrl: 'https://other.test');

        Scan::create(['license_id' => $other->id, 'type' => 'page', 'status' => 'complete', 'url' => 'https://other.test/']);

        $this->getJson('/api/scans', $this->authHeaders($key, $site))
            ->assertOk()
            ->assertJsonCount(0, 'scans');
    }

    /** Scan::$fillable excludes created_at, so set it directly. */
    private function backdate(Scan $scan, \DateTimeInterface $when): void
    {
        $scan->forceFill(['created_at' => $when])->saveQuietly();
    }

    private function makeFinding(int $licenseId, Scan $scan, string $fingerprint, string $url): Finding
    {
        return Finding::create([
            'license_id' => $licenseId,
            'url' => $url,
            'fingerprint' => $fingerprint,
            'wcag_rule' => '1.4.3',
            'finding_type' => 'color-contrast',
            'severity' => 'serious',
            'rationale' => 'Contrast below threshold.',
            'first_seen_scan_id' => $scan->id,
            'last_seen_scan_id' => $scan->id,
            'status' => 'open',
        ]);
    }
}
