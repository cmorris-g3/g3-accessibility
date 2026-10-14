<?php

namespace App\Console\Commands;

use App\Services\LicenseMinter;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class MintLicense extends Command
{
    protected $signature = 'g3:mint-license
        {--name= : Human label for this license}
        {--site-url= : The one site URL this license is pinned to}
        {--expires= : Optional expiry (YYYY-MM-DD)}
        {--activate : Mark the site pin active immediately (for API/agent keys with no plugin to call /api/activate)}';

    protected $description = 'Mint a new license and pin it to a client site. Prints the plaintext key once.';

    public function handle(LicenseMinter $minter): int
    {
        $name = (string) $this->option('name');
        $siteUrl = (string) $this->option('site-url');
        $expires = $this->option('expires');

        if ($name === '' || $siteUrl === '') {
            $this->error('--name and --site-url are required.');
            return self::FAILURE;
        }

        try {
            ['license' => $license, 'plaintext_key' => $plaintextKey] = $minter->mint($name, $siteUrl, $expires);
        } catch (\InvalidArgumentException $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $activation = $license->activations()->first();

        // A key minted for an agent has no WordPress plugin to call
        // POST /api/activate on its behalf, so the pin would sit at
        // activated_at=null and every scan request would 403.
        if ($this->option('activate') && $activation && ! $activation->activated_at) {
            $activation->forceFill([
                'activated_at' => now(),
                'last_seen_at' => now(),
            ])->save();
            $activation->refresh();
        }

        $this->newLine();
        $this->info("License minted for: {$name}");
        $this->line("  Site URL:          {$activation->site_url}");
        $this->line('  License ID:        '.$license->id);
        $this->line('  Monthly scan day:  '.$license->monthly_scan_day);
        if ($expires) {
            $this->line('  Expires:           '.Carbon::parse($expires)->toDateString());
        }
        $this->newLine();
        $this->warn('Plaintext key (shown ONCE — copy now):');
        $this->line('  '.$plaintextKey);
        $this->newLine();
        if ($activation->activated_at) {
            $this->line('Site pin is ACTIVE — the key can call the API immediately.');
            $this->line('  X-Site-Url must be exactly: '.$activation->site_url);
        } else {
            $this->line('Plugin install: paste the key into the G3 Access settings page and save.');
            $this->line('API/agent use: POST /api/activate first, or re-mint with --activate.');
        }

        return self::SUCCESS;
    }
}
