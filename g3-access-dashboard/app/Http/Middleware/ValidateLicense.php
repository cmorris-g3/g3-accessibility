<?php

namespace App\Http\Middleware;

use App\Models\License;
use App\Models\LicenseActivation;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateLicense
{
    public function handle(Request $request, Closure $next, string $mode = 'full'): Response
    {
        $bearer = $request->bearerToken();
        if (! $bearer) {
            return $this->error('MISSING_KEY', 'Authorization header is required.', 401);
        }

        $license = License::where('key_hash', hash('sha256', $bearer))->first();
        if (! $license) {
            return $this->error('INVALID_KEY', 'License key is invalid.', 401);
        }

        // Internal sentinel license is dashboard-only; it must never be
        // accepted via the API even if its hash somehow leaked.
        if ($license->is_internal) {
            return $this->error('INVALID_KEY', 'License key is invalid.', 401);
        }

        $isSuspended = $license->status === 'suspended';
        $isExpired = $license->status === 'expired' || ($license->expires_at && $license->expires_at->isPast());
        $isWrite = ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true);

        if ($isWrite && $isSuspended) {
            return $this->error('LICENSE_SUSPENDED', 'This license has been suspended.', 403);
        }
        if ($isWrite && $isExpired) {
            return $this->error('LICENSE_EXPIRED', 'This license has expired.', 403);
        }
        if ($isWrite && $license->status !== 'active') {
            return $this->error('LICENSE_INACTIVE', 'This license is not active.', 403);
        }

        $request->attributes->set('license', $license);

        if ($mode === 'full') {
            $siteUrl = $this->extractSiteUrl($request);
            if (! $siteUrl) {
                return $this->error('MISSING_SITE_URL', 'X-Site-Url header or site_url body field is required.', 400);
            }

            $activation = LicenseActivation::where('license_id', $license->id)
                ->where('site_url', $siteUrl)
                ->first();

            if (! $activation) {
                return $this->error('SITE_NOT_ACTIVATED', 'This site is not activated for this license.', 403);
            }
            if ($activation->activated_at === null) {
                return $this->error('SITE_NOT_ACTIVATED', 'Run /api/activate before calling this endpoint.', 403);
            }

            $activation->forceFill(['last_seen_at' => now()])->saveQuietly();

            $request->attributes->set('activation', $activation);
        }

        return $next($request);
    }

    public static function normalizeSiteUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        $parsed = parse_url($url);
        if (! $parsed || ! isset($parsed['scheme'], $parsed['host'])) {
            return null;
        }
        if (! in_array($parsed['scheme'], ['http', 'https'], true)) {
            return null;
        }
        return $parsed['scheme'].'://'.$parsed['host'];
    }

    private function extractSiteUrl(Request $request): ?string
    {
        $raw = $request->header('X-Site-Url') ?? $request->input('site_url');
        return self::normalizeSiteUrl($raw);
    }

    private function error(string $code, string $message, int $status): JsonResponse
    {
        return new JsonResponse([
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ], $status);
    }
}
