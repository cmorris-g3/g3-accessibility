<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Finding extends Model
{
    use HasFactory;

    protected $fillable = [
        'license_id',
        'url',
        'fingerprint',
        'wcag_rule',
        'finding_type',
        'severity',
        'rationale',
        'snippet',
        'suggested_fix',
        'target',
        'context',
        'first_seen_scan_id',
        'last_seen_scan_id',
        'status',
        'resolved_at',
        'ignored_at',
        'ignored_reason',
    ];

    protected $casts = [
        'context' => 'array',
        'resolved_at' => 'datetime',
        'ignored_at' => 'datetime',
    ];

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }

    public function firstSeenScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'first_seen_scan_id');
    }

    public function lastSeenScan(): BelongsTo
    {
        return $this->belongsTo(Scan::class, 'last_seen_scan_id');
    }

    /**
     * Each URL on which this finding has been observed. The finding's own
     * `url` field is the FIRST URL it was seen on (immutable after creation);
     * occurrences track every URL where the same fingerprint surfaced.
     */
    public function occurrences(): HasMany
    {
        return $this->hasMany(FindingOccurrence::class);
    }
}
