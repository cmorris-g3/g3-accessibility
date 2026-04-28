<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('licenses', function (Blueprint $table) {
            $table->id();
            $table->string('key_hash', 64)->unique();
            $table->string('name');
            $table->enum('status', ['active', 'suspended', 'expired'])->default('active');
            $table->timestamp('expires_at')->nullable();
            $table->unsignedTinyInteger('max_sites')->default(1);
            $table->json('scan_quotas')->nullable();
            $table->unsignedTinyInteger('monthly_scan_day');
            $table->text('notes')->nullable();
            $table->timestamp('last_full_scan_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
