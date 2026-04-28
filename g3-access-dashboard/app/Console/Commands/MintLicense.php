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
        {--expires= : Optional expiry (YYYY-MM-DD)}';

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
        $this->line('Plugin install: paste the key into the G3 Access settings page and save.');

        return self::SUCCESS;
    }
}
