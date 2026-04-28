<?php

namespace Tests\Feature\Api;

use App\Models\License;
use App\Models\LicenseActivation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\LicenseHelpers;
use Tests\TestCase;

class ActivateTest extends TestCase
{
    use RefreshDatabase;
    use LicenseHelpers;

    public function test_activate_happy_path(): void
    {
        $license = License::create([
            'key_hash' => hash('sha256', 'g3_test_abc123'),
            'name' => 'Test',
            'status' => 'active',
            'monthly_scan_day' => 1,
        ]);
        LicenseActivation::create([
            'license_id' => $license->id,
            'site_url' => 'https://example.com',
        ]);

        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://example.com',
            'plugin_version' => '0.1.0',
        ], ['Authorization' => 'Bearer g3_test_abc123']);

        $response->assertOk();
        $response->assertJsonPath('activated', true);

        $activation = LicenseActivation::where('license_id', $license->id)->first();
        $this->assertNotNull($activation->activated_at);
        $this->assertSame('0.1.0', $activation->plugin_version);
    }

    public function test_activate_normalizes_trailing_slash(): void
    {
        ['key' => $key] = $this->mintLicense(siteUrl: 'https://example.com', activated: false);

        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://example.com/',
        ], ['Authorization' => 'Bearer '.$key]);

        $response->assertOk();
    }

    public function test_activate_mismatched_site_returns_409(): void
    {
        ['key' => $key] = $this->mintLicense(siteUrl: 'https://example.com', activated: false);

        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://different.com',
        ], ['Authorization' => 'Bearer '.$key]);

        $response->assertStatus(409);
        $response->assertJsonPath('error.code', 'LICENSE_ALREADY_ACTIVATED');
        $response->assertJsonPath('error.active_site', 'https://example.com');
    }

    public function test_invalid_key_returns_401(): void
    {
        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://example.com',
        ], ['Authorization' => 'Bearer g3_not_a_real_key']);

        $response->assertStatus(401);
        $response->assertJsonPath('error.code', 'INVALID_KEY');
    }

    public function test_suspended_license_returns_403(): void
    {
        ['key' => $key, 'license' => $license] = $this->mintLicense();
        $license->update(['status' => 'suspended']);

        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://example.com',
        ], ['Authorization' => 'Bearer '.$key]);

        $response->assertStatus(403);
        $response->assertJsonPath('error.code', 'LICENSE_SUSPENDED');
    }

    public function test_missing_key_returns_401(): void
    {
        $response = $this->postJson('/api/activate', [
            'site_url' => 'https://example.com',
        ]);

        $response->assertStatus(401);
        $response->assertJsonPath('error.code', 'MISSING_KEY');
    }
}
