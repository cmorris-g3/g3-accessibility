<?php

namespace App\Services;

use App\Models\License;
use App\Models\LicenseActivation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LicenseMinter
{
    public function mint(string $name, string $siteUrl, ?string $expires = null): array
    {
        $normalizedSiteUrl = self::normalizeSiteUrl($siteUrl);
        if ($normalizedSiteUrl === null) {
            throw new \InvalidArgumentException("Invalid site URL: {$siteUrl}");
        }

        $plaintext = 'g3_'.Str::random(32);
        $keyHash = hash('sha256', $plaintext);
        $monthlyScanDay = (crc32($keyHash) % 28) + 1;

        $license = null;
        DB::transaction(function () use ($name, $keyHash, $monthlyScanDay, $expires, $normalizedSiteUrl, &$license) {
            $license = License::create([
                'key_hash' => $keyHash,
                'name' => $name,
                'status' => 'active',
                'expires_at' => $expires ? Carbon::parse($expires) : null,
                'max_sites' => 1,
                'monthly_scan_day' => $monthlyScanDay,
            ]);

            LicenseActivation::create([
                'license_id' => $license->id,
                'site_url' => $normalizedSiteUrl,
                'activated_at' => null,
                'last_seen_at' => null,
            ]);
        });

        return ['license' => $license->refresh(), 'plaintext_key' => $plaintext];
    }

    public static function normalizeSiteUrl(string $url): ?string
    {
        $parsed = parse_url($url);
        if (! $parsed || ! isset($parsed['scheme'], $parsed['host'])) {
            return null;
        }
        if (! in_array($parsed['scheme'], ['http', 'https'], true)) {
            return null;
        }
        return $parsed['scheme'].'://'.$parsed['host'];
    }
}
