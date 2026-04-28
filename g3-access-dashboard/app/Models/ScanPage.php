<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScanPage extends Model
{
    use HasFactory;

    protected $fillable = [
        'scan_id',
        'url',
        'status',
        'duration_ms',
        'error',
    ];

    protected $casts = [
        'duration_ms' => 'integer',
    ];

    public function scan(): BelongsTo
    {
        return $this->belongsTo(Scan::class);
    }
}
