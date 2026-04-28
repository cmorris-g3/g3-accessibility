<?php

namespace Tests\Support;

use App\Models\License;
use App\Models\LicenseActivation;

trait LicenseHelpers
{
    protected function mintLicense(string $siteUrl = 'https://example.com', bool $activated = true): array
    {
        $plaintext = 'g3_test_'.bin2hex(random_bytes(8));
        $license = License::create([
            'key_hash' => hash('sha256', $plaintext),
            'name' => 'Test License',
            'status' => 'active',
            'max_sites' => 1,
            'monthly_scan_day' => 1,
        ]);

        LicenseActivation::create([
            'license_id' => $license->id,
            'site_url' => $siteUrl,
            'activated_at' => $activated ? now() : null,
            'last_seen_at' => $activated ? now() : null,
        ]);

        return ['license' => $license, 'key' => $plaintext, 'site_url' => $siteUrl];
    }

    protected function authHeaders(string $key, string $siteUrl): array
    {
        return [
            'Authorization' => 'Bearer '.$key,
            'X-Site-Url' => $siteUrl,
            'Accept' => 'application/json',
        ];
    }
}
