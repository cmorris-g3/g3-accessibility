<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FindingOccurrence extends Model
{
    protected $fillable = [
        'finding_id',
        'url',
        'first_seen_scan_id',
        'last_seen_scan_id',
    ];

    public function finding(): BelongsTo
    {
        return $this->belongsTo(Finding::class);
    }

    public function firstSeenScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'first_seen_scan_id');
    }

    public function lastSeenScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'last_seen_scan_id');
    }
}
