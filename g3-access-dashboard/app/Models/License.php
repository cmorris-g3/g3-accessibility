<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class License extends Model
{
    use HasFactory;

    protected $fillable = [
        'key_hash',
        'name',
        'status',
        'is_internal',
        'expires_at',
        'max_sites',
        'scan_quotas',
        'monthly_scan_day',
        'notes',
        'last_full_scan_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'last_full_scan_at' => 'datetime',
        'scan_quotas' => 'array',
        'max_sites' => 'integer',
        'monthly_scan_day' => 'integer',
        'is_internal' => 'boolean',
    ];

    public static function internal(): self
    {
        return self::where('is_internal', true)->firstOrFail();
    }

    public function scopeClient($query)
    {
        return $query->where('is_internal', false);
    }

    public function activations(): HasMany
    {
        return $this->hasMany(LicenseActivation::class);
    }

    public function scans(): HasMany
    {
        return $this->hasMany(Scan::class);
    }

    public function findings(): HasMany
    {
        return $this->hasMany(Finding::class);
    }

    public function isActive(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }
        if ($this->expires_at !== null && $this->expires_at->isPast()) {
            return false;
        }
        return true;
    }

    public function quota(string $key): int
    {
        $overrides = $this->scan_quotas ?? [];
        return (int) ($overrides[$key] ?? config("scanner.defaults.{$key}"));
    }
}
