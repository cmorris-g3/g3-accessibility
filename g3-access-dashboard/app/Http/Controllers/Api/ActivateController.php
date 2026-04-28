<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\ValidateLicense;
use App\Models\License;
use App\Models\LicenseActivation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivateController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'site_url' => ['required', 'string', 'url'],
            'plugin_version' => ['nullable', 'string', 'max:64'],
            'site_title' => ['nullable', 'string', 'max:255'],
        ]);

        $normalizedUrl = ValidateLicense::normalizeSiteUrl($validated['site_url']);
        if (! $normalizedUrl) {
            return response()->json([
                'error' => ['code' => 'INVALID_SITE_URL', 'message' => 'site_url must be a valid http(s) URL.'],
            ], 422);
        }

        /** @var License $license */
        $license = $request->attributes->get('license');

        $pinned = $license->activations()->first();
        if ($pinned && $pinned->site_url !== $normalizedUrl) {
            return response()->json([
                'error' => [
                    'code' => 'LICENSE_ALREADY_ACTIVATED',
                    'message' => 'This license is pinned to a different site.',
                    'active_site' => $pinned->site_url,
                ],
            ], 409);
        }

        $activation = $pinned ?? new LicenseActivation(['license_id' => $license->id, 'site_url' => $normalizedUrl]);
        $activation->fill([
            'plugin_version' => $validated['plugin_version'] ?? null,
            'site_title' => $validated['site_title'] ?? null,
            'last_seen_at' => now(),
        ]);
        if ($activation->activated_at === null) {
            $activation->activated_at = now();
        }
        $activation->save();

        return response()->json([
            'activated' => true,
            'license' => $this->publicLicense($license),
            'activation' => [
                'site_url' => $activation->site_url,
                'activated_at' => $activation->activated_at?->toIso8601String(),
                'last_seen_at' => $activation->last_seen_at?->toIso8601String(),
            ],
        ]);
    }

    private function publicLicense(License $license): array
    {
        return [
            'name' => $license->name,
            'status' => $license->status,
            'expires_at' => $license->expires_at?->toIso8601String(),
            'monthly_scan_day' => $license->monthly_scan_day,
        ];
    }
}
