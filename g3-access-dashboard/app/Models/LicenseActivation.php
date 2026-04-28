<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LicenseActivation extends Model
{
    use HasFactory;

    protected $fillable = [
        'license_id',
        'site_url',
        'plugin_version',
        'site_title',
        'activated_at',
        'last_seen_at',
    ];

    protected $casts = [
        'activated_at' => 'datetime',
        'last_seen_at' => 'datetime',
    ];

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }
}
