<?php

use App\Models\License;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->boolean('is_internal')->default(false)->after('status');
        });

        // Seed the sentinel "Internal / Ad-hoc Scans" license used as the owner
        // for ad-hoc scans of arbitrary URLs run from the dashboard. It has no
        // activations, no API access; the hash value below is only here so the
        // unique index is satisfied.
        if (License::where('is_internal', true)->doesntExist()) {
            License::create([
                'key_hash' => hash('sha256', 'internal-'.Str::random(32)),
                'name' => 'Internal / Ad-hoc Scans',
                'status' => 'active',
                'is_internal' => true,
                'max_sites' => 0,
                'monthly_scan_day' => 1,
                'notes' => 'Owner of ad-hoc scans run from the dashboard. Not reachable via API.',
            ]);
        }
    }

    public function down(): void
    {
        License::where('is_internal', true)->delete();

        Schema::table('licenses', function (Blueprint $table) {
            $table->dropColumn('is_internal');
        });
    }
};
