<?php

use App\Models\License;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * The default quotas assume one licence per client site. A user API token
     * spans every site the agency works on but still bills its scans to the
     * single internal licence, so the stock fullscan_per_day of 1 would let
     * one site's baseline block every other site for 24 hours.
     *
     * FULLSCAN_IN_PROGRESS is deliberately left alone: full crawls still run
     * one at a time, which is what keeps the scanner box from thrashing.
     */
    public function up(): void
    {
        $internal = License::where('is_internal', true)->first();
        if (! $internal) {
            return;
        }

        $internal->update([
            'scan_quotas' => array_merge($internal->scan_quotas ?? [], [
                'cooldown_s' => 30,
                'concurrency' => 3,
                'daily_cap' => 500,
                'fullscan_per_day' => 20,
            ]),
        ]);
    }

    public function down(): void
    {
        License::where('is_internal', true)->update(['scan_quotas' => null]);
    }
};
