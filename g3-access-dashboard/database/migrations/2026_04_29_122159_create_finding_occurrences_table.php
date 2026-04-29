<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finding_occurrences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('finding_id')->constrained()->cascadeOnDelete();
            $table->string('url');
            $table->foreignId('first_seen_scan_id')->constrained('scans')->cascadeOnDelete();
            $table->foreignId('last_seen_scan_id')->constrained('scans')->cascadeOnDelete();
            $table->timestamps();

            // One row per (finding, url) pair.
            $table->unique(['finding_id', 'url']);
            // Lookup "all findings on URL X" must be cheap.
            $table->index('url');
        });

        // Backfill: every existing Finding becomes an occurrence on its current url.
        // Pre-fix data is lossy (only the most-recent-scanned url survived per finding),
        // but this gets every finding represented. New scans will populate accurately.
        DB::statement(<<<'SQL'
            INSERT INTO finding_occurrences
                (finding_id, url, first_seen_scan_id, last_seen_scan_id, created_at, updated_at)
            SELECT id, url, first_seen_scan_id, last_seen_scan_id, created_at, updated_at
            FROM findings
        SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('finding_occurrences');
    }
};
