<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('license_activations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('license_id')->constrained()->cascadeOnDelete();
            $table->string('site_url');
            $table->string('plugin_version')->nullable();
            $table->string('site_title')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['license_id', 'site_url']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('license_activations');
    }
};
