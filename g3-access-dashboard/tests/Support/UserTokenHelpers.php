<?php

namespace Tests\Support;

use App\Models\User;
use App\Models\UserApiToken;
use App\Services\UserApiTokenMinter;

trait UserTokenHelpers
{
    /**
     * @return array{token: UserApiToken, key: string, user: User}
     */
    protected function mintUserToken(array $hosts = [], ?string $expires = null): array
    {
        $user = User::factory()->create();

        ['token' => $token, 'plaintext_key' => $key] = app(UserApiTokenMinter::class)
            ->mint($user, 'Test agent token', $hosts, $expires);

        return ['token' => $token, 'key' => $key, 'user' => $user];
    }

    protected function tokenHeaders(string $key): array
    {
        return [
            'Authorization' => 'Bearer '.$key,
            'Accept' => 'application/json',
        ];
    }
}
