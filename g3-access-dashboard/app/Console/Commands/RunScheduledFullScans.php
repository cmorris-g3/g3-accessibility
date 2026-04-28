<?php

namespace App\Console\Commands;

use App\Jobs\DiscoverSiteUrlsJob;
use App\Models\License;
use App\Models\Scan;
use Illuminate\Console\Command;

class RunScheduledFullScans extends Command
{
    protected $signature = 'g3:run-scheduled-full-scans
        {--dry-run : Show licenses that would be scanned without dispatching}';

    protected $description = 'Dispatch full-site scans for licenses whose monthly_scan_day matches today and have not been fully scanned in 28+ days.';

    public function handle(): int
    {
        $today = (int) now()->day;
        $cutoff = now()->subDays(28);

        $licenses = License::where('status', 'active')
            ->where('monthly_scan_day', $today)
            ->where(function ($q) use ($cutoff) {
                $q->whereNull('last_full_scan_at')->orWhere('last_full_scan_at', '<', $cutoff);
            })
            ->get();

        if ($licenses->isEmpty()) {
            $this->info("No licenses due for full scan on day {$today}.");
            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        foreach ($licenses as $license) {
            $activation = $license->activations()->first();
            if (! $activation || $activation->activated_at === null) {
                $this->warn("License #{$license->id} ({$license->name}) has no active activation — skipped.");
                continue;
            }

            if ($dryRun) {
                $this->line("[dry-run] would dispatch full scan: license #{$license->id} — {$license->name} — {$activation->site_url}");
                continue;
            }

            $scan = Scan::create([
                'license_id' => $license->id,
                'type' => 'full',
                'status' => 'queued',
            ]);
            DiscoverSiteUrlsJob::dispatch($scan->id, []);

            $this->info("Dispatched full scan #{$scan->id} for license #{$license->id} — {$license->name}");
        }

        return self::SUCCESS;
    }
}
