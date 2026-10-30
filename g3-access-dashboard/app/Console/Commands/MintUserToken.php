<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\UserApiToken;
use App\Services\UserApiTokenMinter;
use Illuminate\Console\Command;

class MintUserToken extends Command
{
    protected $signature = 'g3:mint-user-token
        {--user= : Email of the dashboard user this token belongs to}
        {--name= : Human label for this token}
        {--hosts= : Comma-separated hosts this token may scan (default: any)}
        {--expires= : Optional expiry (YYYY-MM-DD)}
        {--revoke= : Revoke the token with this id instead of minting}
        {--list : List existing tokens instead of minting}';

    protected $description = 'Mint a user-level API token. One token covers every site — no per-site license needed.';

    public function handle(UserApiTokenMinter $minter): int
    {
        if ($this->option('list')) {
            return $this->listTokens();
        }

        if ($revokeId = $this->option('revoke')) {
            return $this->revoke((int) $revokeId);
        }

        $email = (string) $this->option('user');
        $name = (string) $this->option('name');

        if ($email === '' || $name === '') {
            $this->error('--user and --name are required.');

            return self::FAILURE;
        }

        $user = User::where('email', $email)->first();
        if (! $user) {
            $this->error("No dashboard user with email {$email}.");

            return self::FAILURE;
        }

        $hosts = UserApiTokenMinter::normalizeHosts(
            array_filter(explode(',', (string) $this->option('hosts')))
        );

        ['token' => $token, 'plaintext_key' => $plaintext] = $minter->mint(
            $user,
            $name,
            $hosts,
            $this->option('expires') ? (string) $this->option('expires') : null
        );

        $this->newLine();
        $this->info("API token minted for {$user->email}");
        $this->line('  Token ID:      '.$token->id);
        $this->line('  Name:          '.$token->name);
        $this->line('  Allowed hosts: '.($token->allowed_hosts ? implode(', ', $token->allowed_hosts) : 'any'));
        $this->line('  Expires:       '.($token->expires_at?->toDateString() ?? 'never'));
        $this->newLine();
        $this->warn('Plaintext token (shown ONCE — copy now):');
        $this->line('  '.$plaintext);
        $this->newLine();
        $this->line('Use it with no X-Site-Url and no activation step:');
        $this->line('  curl -H "Authorization: Bearer <token>" -H "Accept: application/json" \\');
        $this->line('    https://accessibility.group3solutions.com/api/license');

        return self::SUCCESS;
    }

    private function listTokens(): int
    {
        $tokens = UserApiToken::with('user')->orderBy('id')->get();

        if ($tokens->isEmpty()) {
            $this->line('No user API tokens exist.');

            return self::SUCCESS;
        }

        $this->table(
            ['ID', 'User', 'Name', 'Hosts', 'Last used', 'Expires', 'Revoked'],
            $tokens->map(fn (UserApiToken $t) => [
                $t->id,
                $t->user?->email ?? '(deleted)',
                $t->name,
                $t->allowed_hosts ? implode(', ', $t->allowed_hosts) : 'any',
                $t->last_used_at?->toDateTimeString() ?? 'never',
                $t->expires_at?->toDateString() ?? 'never',
                $t->revoked_at?->toDateTimeString() ?? '-',
            ])->all()
        );

        return self::SUCCESS;
    }

    private function revoke(int $id): int
    {
        $token = UserApiToken::find($id);
        if (! $token) {
            $this->error("No token with id {$id}.");

            return self::FAILURE;
        }
        if ($token->isRevoked()) {
            $this->line("Token {$id} was already revoked at {$token->revoked_at}.");

            return self::SUCCESS;
        }

        $token->update(['revoked_at' => now()]);
        $this->info("Token {$id} ({$token->name}) revoked.");

        return self::SUCCESS;
    }
}
