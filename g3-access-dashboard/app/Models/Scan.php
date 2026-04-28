<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Scan extends Model
{
    use HasFactory;

    protected $fillable = [
        'license_id',
        'type',
        'status',
        'url',
        'parent_scan_id',
        'pages_total',
        'pages_done',
        'findings_total',
        'error',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'pages_total' => 'integer',
        'pages_done' => 'integer',
        'findings_total' => 'integer',
    ];

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }

    public function parentScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'parent_scan_id');
    }

    public function childScans(): HasMany
    {
        return $this->hasMany(Scan::class, 'parent_scan_id');
    }

    public function scanPages(): HasMany
    {
        return $this->hasMany(ScanPage::class);
    }
}
