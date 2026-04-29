<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Finding;
use App\Models\License;
use App\Support\UrlNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FindingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        $validated = $request->validate([
            'url' => ['nullable', 'string'],
            'status' => ['nullable', 'in:open,resolved,ignored,regressed,all'],
            'severity' => ['nullable', 'in:critical,serious,moderate,minor'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $query = Finding::where('license_id', $license->id);

        if (! empty($validated['url'])) {
            $normalized = UrlNormalizer::normalize($validated['url']) ?? $validated['url'];
            $query->whereHas('occurrences', fn ($q) => $q->where('url', $normalized));
        }

        $status = $validated['status'] ?? 'open';
        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if (! empty($validated['severity'])) {
            $query->where('severity', $validated['severity']);
        }

        $perPage = (int) ($validated['per_page'] ?? 50);
        $paginated = $query->orderByDesc('updated_at')->paginate($perPage);

        $summary = Finding::where('license_id', $license->id)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();

        return response()->json([
            'findings' => $paginated->getCollection()->map(fn ($f) => $this->publicFinding($f))->values(),
            'meta' => [
                'total' => $paginated->total(),
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'summary' => [
                    'open' => (int) ($summary['open'] ?? 0),
                    'resolved' => (int) ($summary['resolved'] ?? 0),
                    'ignored' => (int) ($summary['ignored'] ?? 0),
                    'regressed' => (int) ($summary['regressed'] ?? 0),
                ],
            ],
        ]);
    }

    public function ignore(Request $request, int $finding): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        $model = Finding::where('id', $finding)->where('license_id', $license->id)->first();
        if (! $model) {
            return response()->json(['error' => ['code' => 'NOT_FOUND']], 404);
        }

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $model->update([
            'status' => 'ignored',
            'ignored_at' => now(),
            'ignored_reason' => $validated['reason'] ?? null,
        ]);

        return response()->json(['finding' => $this->publicFinding($model)]);
    }

    public function unignore(Request $request, int $finding): JsonResponse
    {
        /** @var License $license */
        $license = $request->attributes->get('license');

        $model = Finding::where('id', $finding)->where('license_id', $license->id)->first();
        if (! $model) {
            return response()->json(['error' => ['code' => 'NOT_FOUND']], 404);
        }

        $model->update([
            'status' => 'open',
            'ignored_at' => null,
            'ignored_reason' => null,
        ]);

        return response()->json(['finding' => $this->publicFinding($model)]);
    }

    private function publicFinding(Finding $f): array
    {
        return [
            'id' => $f->id,
            'url' => $f->url,
            'fingerprint' => $f->fingerprint,
            'wcag_rule' => $f->wcag_rule,
            'finding_type' => $f->finding_type,
            'severity' => $f->severity,
            'rationale' => $f->rationale,
            'snippet' => $f->snippet,
            'suggested_fix' => $f->suggested_fix,
            'target' => $f->target,
            'context' => $f->context,
            'status' => $f->status,
            'first_seen_scan_id' => $f->first_seen_scan_id,
            'last_seen_scan_id' => $f->last_seen_scan_id,
            'resolved_at' => $f->resolved_at?->toIso8601String(),
            'ignored_at' => $f->ignored_at?->toIso8601String(),
            'ignored_reason' => $f->ignored_reason,
            'created_at' => $f->created_at?->toIso8601String(),
            'updated_at' => $f->updated_at?->toIso8601String(),
        ];
    }
}
