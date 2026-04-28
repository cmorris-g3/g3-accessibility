<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\License;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LicenseController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        return response()->json([
            'license' => [
                'name' => $license->name,
                'status' => $license->status,
                'expires_at' => $license->expires_at?->toIso8601String(),
                'monthly_scan_day' => $license->monthly_scan_day,
                'last_full_scan_at' => $license->last_full_scan_at?->toIso8601String(),
            ],
        ]);
    }
}
