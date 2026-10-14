<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lineage for rescans.
 *
 * parent_scan_id already means "the full-site scan that spawned this page
 * scan" and is relied on for roll-up completion and for filtering top-level
 * scans in the dashboard, so it cannot double as "the scan this one repeats".
 * source_scan_id records that separately: a rescan is still a top-level scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scans', function (Blueprint $table) {
            $table->foreignId('source_scan_id')
                ->nullable()
                ->after('parent_scan_id')
                ->constrained('scans')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('scans', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_scan_id');
        });
    }
};
