<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A personal API token: one credential per operator, not per client site.
 *
 * Unlike a License key it carries no site pin, so it needs no /api/activate
 * round trip and can scan any URL. Scans it creates are owned by the internal
 * licence, which is the same tenant the dashboard's ad-hoc scanner writes to —
 * so a token can list and rescan what was started from the UI.
 */
class UserApiToken extends Model
{
    public const PREFIX = 'g3u_';

    protected $fillable = [
        'user_id',
        'name',
        'token_hash',
        'allowed_hosts',
        'last_used_at',
        'expires_at',
        'revoked_at',
    ];

    protected $casts = [
        'allowed_hosts' => 'array',
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeUsable(Builder $query): Builder
    {
        return $query->whereNull('revoked_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * Host matching is exact, so an allowlisted example.com does not admit
     * www.example.com. Both spellings reach different page sets and the pair
     * has already caused a mismatched pin on Pawnee; guessing which one was
     * meant is worse than a clear 403.
     */
    public function allowsHost(string $host): bool
    {
        if ($this->allowed_hosts === null || $this->allowed_hosts === []) {
            return true;
        }

        return in_array(strtolower($host), array_map('strtolower', $this->allowed_hosts), true);
    }
}
