<?php

namespace App\Livewire\Settings;

use App\Models\UserApiToken;
use App\Services\UserApiTokenMinter;
use Illuminate\Support\Collection;
use Illuminate\View\View;
use Livewire\Attributes\Title;
use Livewire\Attributes\Validate;
use Livewire\Component;

#[Title('API tokens')]
class ApiTokens extends Component
{
    #[Validate('required|string|max:255')]
    public string $name = '';

    #[Validate('nullable|string|max:1000')]
    public string $hosts = '';

    #[Validate('nullable|date|after:today')]
    public ?string $expires = null;

    public ?string $plaintextKey = null;

    public function mint(UserApiTokenMinter $minter): void
    {
        $this->validate();

        ['plaintext_key' => $key] = $minter->mint(
            auth()->user(),
            $this->name,
            UserApiTokenMinter::normalizeHosts(preg_split('/[\s,]+/', $this->hosts) ?: []),
            $this->expires
        );

        $this->plaintextKey = $key;
        $this->reset(['name', 'hosts', 'expires']);
    }

    public function revoke(int $id): void
    {
        UserApiToken::where('id', $id)
            ->where('user_id', auth()->id())
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function dismissKey(): void
    {
        $this->plaintextKey = null;
    }

    public function render(): View
    {
        return view('livewire.settings.api-tokens', [
            'tokens' => $this->tokens(),
        ]);
    }

    private function tokens(): Collection
    {
        return UserApiToken::where('user_id', auth()->id())
            ->orderByDesc('id')
            ->get();
    }
}
