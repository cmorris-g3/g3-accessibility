<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\License;
use App\Models\UserApiToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LicenseController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        $payload = [
            'license' => [
                'name' => $license->name,
                'status' => $license->status,
                'expires_at' => $license->expires_at?->toIso8601String(),
                'monthly_scan_day' => $license->monthly_scan_day,
                'last_full_scan_at' => $license->last_full_scan_at?->toIso8601String(),
            ],
            'quotas' => [
                'cooldown_s' => $license->quota('cooldown_s'),
                'concurrency' => $license->quota('concurrency'),
                'daily_cap' => $license->quota('daily_cap'),
                'fullscan_per_day' => $license->quota('fullscan_per_day'),
            ],
        ];

        // Present only when the caller authenticated with a user API token;
        // it is how an agent confirms which credential it is actually using.
        /** @var UserApiToken|null $token */
        $token = $request->attributes->get('user_token');
        if ($token) {
            $payload['token'] = [
                'name' => $token->name,
                'user' => $token->user?->email,
                'allowed_hosts' => $token->allowed_hosts,
                'expires_at' => $token->expires_at?->toIso8601String(),
            ];
        }

        return response()->json($payload);
    }
}
