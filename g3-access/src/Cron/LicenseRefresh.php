<?php

namespace G3\Access\Cron;

use G3\Access\Api\Client;
use G3\Access\Options;

class LicenseRefresh
{
    public const HOOK = 'g3_access_refresh_license';

    public function register(): void
    {
        add_action(self::HOOK, [$this, 'refresh']);
    }

    public static function scheduleIfNeeded(): void
    {
        if (! wp_next_scheduled(self::HOOK)) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'hourly', self::HOOK);
        }
    }

    public static function unschedule(): void
    {
        $ts = wp_next_scheduled(self::HOOK);
        if ($ts) {
            wp_unschedule_event($ts, self::HOOK);
        }
        wp_clear_scheduled_hook(self::HOOK);
    }

    public function refresh(): void
    {
        if (! Options::hasCredentials()) {
            return;
        }

        $client = new Client();
        $response = $client->license();

        if (is_wp_error($response)) {
            $code = $response->get_error_code();
            $status = Options::activationStatus();
            Options::setActivationStatus([
                'activated' => $status['activated'],
                'error' => $response->get_error_message(),
                'license' => $status['license'],
                'last_checked_at' => gmdate('c'),
            ]);

            if (in_array($code, ['g3_access_api_LICENSE_SUSPENDED', 'g3_access_api_LICENSE_EXPIRED', 'g3_access_api_INVALID_KEY'], true)) {
                Options::setActivationStatus([
                    'activated' => false,
                    'error' => $response->get_error_message(),
                    'license' => $status['license'],
                    'last_checked_at' => gmdate('c'),
                ]);
            }
            return;
        }

        Options::setActivationStatus([
            'activated' => ($response['license']['status'] ?? '') === 'active',
            'error' => null,
            'license' => $response['license'] ?? null,
            'last_checked_at' => gmdate('c'),
        ]);
    }
}
