<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scan_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('scan_id')->constrained()->cascadeOnDelete();
            $table->string('url');
            $table->enum('status', ['queued', 'running', 'complete', 'failed'])->default('queued');
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['scan_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scan_pages');
    }
};
