<?php

namespace App\Livewire\Sites;

use App\Services\LicenseMinter;
use Illuminate\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Validate;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('Mint License')]
class Mint extends Component
{
    #[Validate('required|string|max:255')]
    public string $name = '';

    #[Validate('required|url')]
    public string $siteUrl = '';

    #[Validate('nullable|date|after:today')]
    public ?string $expires = null;

    public ?string $plaintextKey = null;

    public ?int $mintedLicenseId = null;

    public function mint(LicenseMinter $minter): void
    {
        $this->validate();

        try {
            ['license' => $license, 'plaintext_key' => $key] = $minter->mint($this->name, $this->siteUrl, $this->expires);
        } catch (\InvalidArgumentException $e) {
            $this->addError('siteUrl', $e->getMessage());
            return;
        }

        $this->plaintextKey = $key;
        $this->mintedLicenseId = $license->id;
    }

    public function render(): View
    {
        return view('livewire.sites.mint');
    }
}
