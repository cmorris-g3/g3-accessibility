<?php

namespace G3\Access;

class Options
{
    private const OPTION_KEY = 'g3_access_options';

    private const ACTIVATION_KEY = 'g3_access_activation_status';

    private const SNAPSHOT_KEY = 'g3_access_findings_snapshot';

    public static function ensureDefaults(): void
    {
        if (get_option(self::OPTION_KEY) === false) {
            update_option(self::OPTION_KEY, [
                'license_key' => '',
                'api_base_url' => '',
            ]);
        }
    }

    public static function licenseKey(): string
    {
        return (string) (self::all()['license_key'] ?? '');
    }

    public static function apiBaseUrl(): string
    {
        $url = (string) (self::all()['api_base_url'] ?? '');
        return rtrim($url, '/');
    }

    public static function siteUrl(): string
    {
        $home = home_url('/');
        $parts = parse_url($home);
        if (! $parts || ! isset($parts['scheme'], $parts['host'])) {
            return '';
        }
        return $parts['scheme'].'://'.$parts['host'];
    }

    public static function updateCredentials(string $licenseKey, string $apiBaseUrl): void
    {
        update_option(self::OPTION_KEY, [
            'license_key' => trim($licenseKey),
            'api_base_url' => rtrim(trim($apiBaseUrl), '/'),
        ]);
    }

    public static function all(): array
    {
        $value = get_option(self::OPTION_KEY);
        return is_array($value) ? $value : [];
    }

    public static function activationStatus(): array
    {
        $value = get_option(self::ACTIVATION_KEY);
        return is_array($value) ? $value : [
            'activated' => false,
            'error' => null,
            'license' => null,
            'last_checked_at' => null,
        ];
    }

    public static function setActivationStatus(array $status): void
    {
        $normalized = array_merge([
            'activated' => false,
            'error' => null,
            'license' => null,
            'last_checked_at' => null,
        ], $status);
        update_option(self::ACTIVATION_KEY, $normalized);
    }

    public static function snapshot(): array
    {
        $value = get_option(self::SNAPSHOT_KEY);
        return is_array($value) ? $value : [
            'findings' => [],
            'summary' => ['open' => 0, 'resolved' => 0, 'ignored' => 0, 'regressed' => 0],
            'fetched_at' => null,
        ];
    }

    public static function setSnapshot(array $snapshot): void
    {
        update_option(self::SNAPSHOT_KEY, $snapshot);
    }

    public static function hasCredentials(): bool
    {
        return self::licenseKey() !== '' && self::apiBaseUrl() !== '';
    }
}
