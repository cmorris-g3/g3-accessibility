<?php

namespace Tests\Feature\Api;

use App\Models\Scan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\LicenseHelpers;
use Tests\TestCase;

class ScanTest extends TestCase
{
    use RefreshDatabase;
    use LicenseHelpers;

    public function test_page_scan_dispatch_creates_row(): void
    {
        Queue::fake();
        ['key' => $key, 'site_url' => $site] = $this->mintLicense();

        $response = $this->postJson('/api/scans', [
            'type' => 'page',
            'url' => 'https://example.com/about',
        ], $this->authHeaders($key, $site));

        $response->assertStatus(202);
        $response->assertJsonPath('scan.type', 'page');
        $response->assertJsonPath('scan.status', 'queued');
        $response->assertJsonPath('scan.url', 'https://example.com/about');
    }

    public function test_site_mismatch_returns_403(): void
    {
        ['key' => $key] = $this->mintLicense(siteUrl: 'https://example.com');

        $response = $this->postJson('/api/scans', [
            'type' => 'page',
            'url' => 'https://different.com/',
        ], [
            'Authorization' => 'Bearer '.$key,
            'X-Site-Url' => 'https://different.com',
        ]);

        $response->assertStatus(403);
        $response->assertJsonPath('error.code', 'SITE_NOT_ACTIVATED');
    }

    public function test_cooldown_rejects_rapid_rescan(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        Scan::create([
            'license_id' => $license->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://example.com/',
            'created_at' => now()->subSeconds(10),
        ]);

        $response = $this->postJson('/api/scans', [
            'type' => 'page',
            'url' => 'https://example.com/',
        ], $this->authHeaders($key, $site));

        $response->assertStatus(429);
        $response->assertJsonPath('error.code', 'COOLDOWN');
        $this->assertNotEmpty($response->headers->get('Retry-After'));
    }

    public function test_concurrency_limit_rejects_third_scan(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'running', 'url' => 'https://example.com/a']);
        Scan::create(['license_id' => $license->id, 'type' => 'page', 'status' => 'queued', 'url' => 'https://example.com/b']);

        $response = $this->postJson('/api/scans', [
            'type' => 'page',
            'url' => 'https://example.com/c',
        ], $this->authHeaders($key, $site));

        $response->assertStatus(429);
        $response->assertJsonPath('error.code', 'CONCURRENCY_LIMIT');
    }

    public function test_fullscan_limit_rejects_second_same_day(): void
    {
        Queue::fake();
        ['key' => $key, 'license' => $license, 'site_url' => $site] = $this->mintLicense();

        Scan::create([
            'license_id' => $license->id,
            'type' => 'full',
            'status' => 'complete',
            'created_at' => now()->subHours(1),
            'completed_at' => now()->subMinutes(50),
        ]);

        $response = $this->postJson('/api/scans', [
            'type' => 'full',
        ], $this->authHeaders($key, $site));

        $response->assertStatus(429);
        $response->assertJsonPath('error.code', 'FULLSCAN_LIMIT');
    }

    public function test_scan_show_scoped_to_license(): void
    {
        ['key' => $keyA, 'license' => $licenseA, 'site_url' => $siteA] = $this->mintLicense('https://a.com');
        ['license' => $licenseB] = $this->mintLicense('https://b.com');

        $scanOfB = Scan::create(['license_id' => $licenseB->id, 'type' => 'page', 'status' => 'complete', 'url' => 'https://b.com/']);

        $response = $this->getJson("/api/scans/{$scanOfB->id}", $this->authHeaders($keyA, $siteA));

        $response->assertStatus(404);
    }
}
