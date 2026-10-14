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
        'source_scan_id',
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

    /**
     * The scan this one repeats, if it was created via rescan.
     */
    public function sourceScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'source_scan_id');
    }

    /**
     * Scan ids whose findings belong to this scan.
     *
     * RunPageScanJob writes findings against the *page* scan, so for a
     * full-site scan the findings hang off its children, not off the parent
     * row. Callers asking "what did scan N report" need both.
     *
     * @return array<int, int>
     */
    public function findingScanIds(): array
    {
        if ($this->type !== 'full') {
            return [$this->id];
        }

        return array_merge(
            [$this->id],
            static::where('parent_scan_id', $this->id)->pluck('id')->all()
        );
    }

    public function scanPages(): HasMany
    {
        return $this->hasMany(ScanPage::class);
    }
}
