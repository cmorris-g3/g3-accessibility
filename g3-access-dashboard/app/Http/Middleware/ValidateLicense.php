<?php

namespace App\Http\Middleware;

use App\Models\License;
use App\Models\LicenseActivation;
use App\Models\UserApiToken;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The API gate. It accepts two kinds of bearer credential:
 *
 *  - a License key, pinned to one client site, used by the WordPress plugin;
 *  - a user API token (prefix g3u_), one per operator, no site pin at all.
 *
 * Both end up setting the `license` request attribute, so controllers stay
 * unaware of which kind arrived. A user token resolves to the internal
 * licence, which is also what the dashboard's ad-hoc scanner writes to.
 */
class ValidateLicense
{
    public function handle(Request $request, Closure $next, string $mode = 'full'): Response
    {
        $bearer = $request->bearerToken();
        if (! $bearer) {
            return $this->error('MISSING_KEY', 'Authorization header is required.', 401);
        }

        if (str_starts_with($bearer, UserApiToken::PREFIX)) {
            return $this->handleUserToken($request, $next, $bearer);
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

    /**
     * A user token needs no X-Site-Url and no activation, which is the whole
     * point: one credential covers every site rather than one per site.
     */
    private function handleUserToken(Request $request, Closure $next, string $bearer): Response
    {
        $token = UserApiToken::where('token_hash', hash('sha256', $bearer))->first();
        if (! $token) {
            return $this->error('INVALID_KEY', 'API token is invalid.', 401);
        }
        if ($token->isRevoked()) {
            return $this->error('TOKEN_REVOKED', 'This API token has been revoked.', 403);
        }
        if ($token->isExpired()) {
            return $this->error('TOKEN_EXPIRED', 'This API token has expired.', 403);
        }

        if ($denied = $this->disallowedHost($request, $token)) {
            return $this->error(
                'HOST_NOT_ALLOWED',
                "This token is not allowed to scan {$denied}.",
                403
            );
        }

        $license = License::where('is_internal', true)->first();
        if (! $license) {
            return $this->error('INTERNAL_LICENSE_MISSING', 'Server is not configured for user tokens.', 500);
        }

        $token->forceFill(['last_used_at' => now()])->saveQuietly();

        $request->attributes->set('license', $license);
        $request->attributes->set('user_token', $token);

        return $next($request);
    }

    /**
     * Returns the first host in the request the token may not touch, or null.
     *
     * Checked here rather than in the controllers so no endpoint can be added
     * later that quietly skips it.
     */
    private function disallowedHost(Request $request, UserApiToken $token): ?string
    {
        if ($token->allowed_hosts === null || $token->allowed_hosts === []) {
            return null;
        }

        $candidates = array_merge(
            [$request->header('X-Site-Url'), $request->input('site_url'), $request->input('url')],
            is_array($request->input('sitemap_urls')) ? $request->input('sitemap_urls') : []
        );

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) || $candidate === '') {
                continue;
            }
            $host = parse_url($candidate, PHP_URL_HOST);
            if (! $host) {
                continue;
            }
            if (! $token->allowsHost($host)) {
                return $host;
            }
        }

        return null;
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
