<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserApiToken;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class UserApiTokenMinter
{
    /**
     * @param  list<string>  $allowedHosts  empty = any host
     * @return array{token: UserApiToken, plaintext_key: string}
     */
    public function mint(User $user, string $name, array $allowedHosts = [], ?string $expires = null): array
    {
        $plaintext = UserApiToken::PREFIX.Str::random(40);

        $token = UserApiToken::create([
            'user_id' => $user->id,
            'name' => $name,
            'token_hash' => hash('sha256', $plaintext),
            'allowed_hosts' => $allowedHosts === [] ? null : array_values($allowedHosts),
            'expires_at' => $expires ? Carbon::parse($expires) : null,
        ]);

        return ['token' => $token, 'plaintext_key' => $plaintext];
    }

    /**
     * Accepts bare hosts or full URLs and returns bare lowercase hosts.
     *
     * @return list<string>
     */
    public static function normalizeHosts(array $raw): array
    {
        return collect($raw)
            ->map(fn ($h) => trim((string) $h))
            ->filter()
            ->map(function (string $h) {
                $host = str_contains($h, '//') ? (parse_url($h, PHP_URL_HOST) ?: '') : $h;

                return strtolower(ltrim($host, '.'));
            })
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
