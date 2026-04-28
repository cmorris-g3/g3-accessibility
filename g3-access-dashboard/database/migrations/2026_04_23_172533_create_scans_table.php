<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('license_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['page', 'full']);
            $table->enum('status', ['queued', 'running', 'complete', 'failed'])->default('queued');
            $table->string('url')->nullable();
            $table->foreignId('parent_scan_id')->nullable()->constrained('scans')->nullOnDelete();
            $table->unsignedInteger('pages_total')->default(0);
            $table->unsignedInteger('pages_done')->default(0);
            $table->unsignedInteger('findings_total')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['license_id', 'type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scans');
    }
};
