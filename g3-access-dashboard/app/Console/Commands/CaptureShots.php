<?php

namespace App\Console\Commands;

use App\Models\Scan;
use App\Services\ReportBuilder;
use Illuminate\Console\Command;

class CaptureShots extends Command
{
    protected $signature = 'g3:capture-shots
        {scan : Scan id}
        {--limit=0 : Capture at most this many action items (0 = all capturable)}';

    protected $description = 'Capture annotated element screenshots for a scan and cache them for its reports.';

    public function handle(ReportBuilder $reports): int
    {
        $scan = Scan::find((int) $this->argument('scan'));
        if (! $scan) {
            $this->error('No such scan.');

            return self::FAILURE;
        }
        if (! in_array($scan->status, ['complete', 'failed'], true)) {
            $this->error("Scan #{$scan->id} is {$scan->status}; wait for it to finish.");

            return self::FAILURE;
        }

        $limit = (int) $this->option('limit');
        $this->info("Capturing screenshots for scan #{$scan->id} ({$scan->url})...");
        $this->line('This loads the live site, so it is deliberately not part of a report download.');

        $result = $reports->captureShotsForScan($scan, $limit > 0 ? $limit : null);

        $this->newLine();
        $this->info("Captured {$result['captured']} screenshot(s).");
        $this->line('Cached at: '.$result['cache']);
        $this->line('They are embedded automatically the next time the report is built.');

        return self::SUCCESS;
    }
}
