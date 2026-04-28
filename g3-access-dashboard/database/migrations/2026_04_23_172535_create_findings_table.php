<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('findings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('license_id')->constrained()->cascadeOnDelete();
            $table->string('url');
            $table->string('fingerprint', 64);
            $table->string('wcag_rule');
            $table->string('finding_type');
            $table->enum('severity', ['critical', 'serious', 'moderate', 'minor']);
            $table->text('rationale');
            $table->text('snippet')->nullable();
            $table->text('suggested_fix')->nullable();
            $table->text('target')->nullable();
            $table->json('context')->nullable();
            $table->foreignId('first_seen_scan_id')->constrained('scans')->cascadeOnDelete();
            $table->foreignId('last_seen_scan_id')->constrained('scans')->cascadeOnDelete();
            $table->enum('status', ['open', 'resolved', 'ignored', 'regressed'])->default('open');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('ignored_at')->nullable();
            $table->text('ignored_reason')->nullable();
            $table->timestamps();

            $table->unique(['license_id', 'fingerprint']);
            $table->index(['license_id', 'status']);
            $table->index(['license_id', 'url']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('findings');
    }
};
