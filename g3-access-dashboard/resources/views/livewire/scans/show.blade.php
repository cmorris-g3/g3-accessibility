<div class="flex h-full w-full flex-1 flex-col gap-6 p-6"
    @if ($hasPending) wire:poll.3s @endif>
    <div>
        <flux:breadcrumbs>
            <flux:breadcrumbs.item :href="$backHref" wire:navigate>{{ $backLabel }}</flux:breadcrumbs.item>
            <flux:breadcrumbs.item>Scan #{{ $scan->id }}</flux:breadcrumbs.item>
        </flux:breadcrumbs>

        <flux:heading size="xl" class="mt-2">
            {{ $scan->type === 'full' ? 'Full-site scan' : 'Page scan' }}
            @if ($scan->url)
                <span class="text-neutral-500">—</span>
                <code class="font-mono text-base text-neutral-700 dark:text-neutral-300">{{ $scan->url }}</code>
            @endif
        </flux:heading>

        <div class="mt-2 flex items-center gap-2 text-sm text-neutral-500">
            @if ($scan->status === 'complete')
                <flux:badge color="green" size="sm">complete</flux:badge>
            @elseif ($scan->status === 'failed')
                <flux:badge color="red" size="sm">failed</flux:badge>
            @elseif ($scan->status === 'running')
                <flux:badge color="blue" size="sm">running</flux:badge>
            @else
                <flux:badge color="zinc" size="sm">{{ $scan->status }}</flux:badge>
            @endif

            @if ($scan->started_at)
                · started {{ $scan->started_at->diffForHumans() }}
            @endif
            @if ($scan->completed_at)
                · completed {{ $scan->completed_at->diffForHumans() }}
            @endif
            @if ($scan->type === 'full')
                · {{ $scan->pages_done }}/{{ $scan->pages_total }} pages
            @endif
            · {{ $scan->findings_total }} raw findings emitted
            @if ($hasPending)
                <span class="ml-2 inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                    <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
                    scan running — refreshing…
                </span>
            @endif
        </div>

        @if (in_array($scan->status, ['complete', 'failed'], true))
            <div class="mt-3">
                <flux:button :href="route('scans.report', $scan->id)" icon="arrow-down-tray" variant="primary" size="sm">
                    Download report (.zip)
                </flux:button>
                <span class="ml-2 text-xs text-neutral-500">
                    Executive summary, per-role task docs, roadmap (.docx), plus findings.csv and work-items.csv
                </span>
            </div>
        @endif
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Open</flux:subheading>
            <div class="text-2xl font-semibold text-amber-700 dark:text-amber-400">{{ (int) ($summary['open'] ?? 0) }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Regressed</flux:subheading>
            <div class="text-2xl font-semibold text-red-700 dark:text-red-400">{{ (int) ($summary['regressed'] ?? 0) }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Resolved</flux:subheading>
            <div class="text-2xl font-semibold text-green-700 dark:text-green-400">{{ (int) ($summary['resolved'] ?? 0) }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Ignored</flux:subheading>
            <div class="text-2xl font-semibold text-neutral-600 dark:text-neutral-400">{{ (int) ($summary['ignored'] ?? 0) }}</div>
        </div>
    </div>

    @if ($pages !== null && $pages->isNotEmpty())
        <div class="rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div class="border-b border-neutral-200 p-4 dark:border-neutral-700">
                <flux:heading size="lg">Pages scanned ({{ $pages->count() }} unique URL{{ $pages->count() === 1 ? '' : 's' }})</flux:heading>
                <flux:subheading>Click a page name to filter findings below. Click Rescan to re-run just that URL — the counts update in place.</flux:subheading>
            </div>
            <table class="w-full text-sm">
                <thead class="bg-neutral-50 dark:bg-neutral-800">
                    <tr class="text-left text-xs uppercase tracking-wide text-neutral-500">
                        <th class="px-4 py-2">URL</th>
                        <th class="px-4 py-2">Status</th>
                        <th class="px-4 py-2 text-right">Critical</th>
                        <th class="px-4 py-2 text-right">Serious</th>
                        <th class="px-4 py-2 text-right">Moderate</th>
                        <th class="px-4 py-2 text-right">Minor</th>
                        <th class="px-4 py-2 text-right">Open</th>
                        <th class="px-4 py-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($pages as $row)
                        <tr class="border-t border-neutral-100 dark:border-neutral-800">
                            <td class="px-4 py-2">
                                <button type="button"
                                        wire:click="$set('url', @js($row->scan->url))"
                                        class="text-left font-mono text-xs hover:underline">
                                    {{ $row->scan->url }}
                                </button>
                                @if ($row->scan_count > 1)
                                    <div class="mt-0.5 text-xs text-neutral-500">scanned {{ $row->scan_count }}×</div>
                                @endif
                            </td>
                            <td class="px-4 py-2">
                                @if ($row->scan->status === 'complete')
                                    <flux:badge color="green" size="sm">complete</flux:badge>
                                @elseif ($row->scan->status === 'failed')
                                    <flux:badge color="red" size="sm">failed</flux:badge>
                                @elseif ($row->scan->status === 'running')
                                    <flux:badge color="blue" size="sm">running</flux:badge>
                                @else
                                    <flux:badge color="zinc" size="sm">{{ $row->scan->status }}</flux:badge>
                                @endif
                            </td>
                            <td class="px-4 py-2 text-right {{ $row->critical > 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-neutral-400' }}">{{ $row->critical }}</td>
                            <td class="px-4 py-2 text-right {{ $row->serious > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-neutral-400' }}">{{ $row->serious }}</td>
                            <td class="px-4 py-2 text-right {{ $row->moderate > 0 ? 'text-yellow-700 dark:text-yellow-400' : 'text-neutral-400' }}">{{ $row->moderate }}</td>
                            <td class="px-4 py-2 text-right text-neutral-500">{{ $row->minor }}</td>
                            <td class="px-4 py-2 text-right">{{ $row->open }}</td>
                            <td class="px-4 py-2 text-right">
                                @if (in_array($row->scan->status, ['queued', 'running'], true))
                                    <span class="text-xs text-neutral-400">{{ $row->scan->status }}</span>
                                @else
                                    <button type="button"
                                            wire:click="rescanPage(@js($row->scan->url))"
                                            wire:loading.attr="disabled"
                                            wire:target="rescanPage(@js($row->scan->url))"
                                            class="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed">
                                        Rescan
                                    </button>
                                @endif
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @endif

    <div class="rounded-xl border border-neutral-200 dark:border-neutral-700">
        <div class="border-b border-neutral-200 p-4 dark:border-neutral-700">
            <flux:heading size="lg">Findings ({{ $findings->total() }})</flux:heading>
            <flux:subheading>Every finding across all {{ count($scopeUrls) }} scanned URL{{ count($scopeUrls) === 1 ? '' : 's' }}.</flux:subheading>
        </div>

        @if ($url !== '')
            <div class="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
                <span class="text-neutral-500">URL:</span>
                <code class="truncate">{{ $url }}</code>
                <flux:button size="xs" variant="subtle" wire:click="clearUrlFilter">Clear</flux:button>
            </div>
        @endif

        <div class="flex flex-wrap gap-3 border-b border-neutral-200 p-4 dark:border-neutral-700">
            <flux:select wire:model.live="status" class="max-w-xs">
                <flux:select.option value="open">Open</flux:select.option>
                <flux:select.option value="regressed">Regressed</flux:select.option>
                <flux:select.option value="resolved">Resolved</flux:select.option>
                <flux:select.option value="ignored">Ignored</flux:select.option>
                <flux:select.option value="all">All</flux:select.option>
            </flux:select>
            <flux:select wire:model.live="severity" placeholder="Any severity" class="max-w-xs">
                <flux:select.option value="">Any severity</flux:select.option>
                <flux:select.option value="critical">Critical</flux:select.option>
                <flux:select.option value="serious">Serious</flux:select.option>
                <flux:select.option value="moderate">Moderate</flux:select.option>
                <flux:select.option value="minor">Minor</flux:select.option>
            </flux:select>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-neutral-50 dark:bg-neutral-800">
                    <tr class="text-left text-xs uppercase tracking-wide text-neutral-500">
                        <th class="px-4 py-2">Issue</th>
                        <th class="px-4 py-2">URL</th>
                        <th class="px-4 py-2">Severity</th>
                        <th class="px-4 py-2">Status</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($findings as $f)
                        <tr class="border-t border-neutral-100 dark:border-neutral-800">
                            <td class="px-4 py-2">
                                <div class="font-medium">{{ $f->finding_type }}</div>
                                <div class="max-w-md truncate text-xs text-neutral-500">{{ $f->rationale }}</div>
                            </td>
                            <td class="px-4 py-2">
                                <code class="block max-w-xs truncate text-xs text-neutral-500">{{ $f->url }}</code>
                            </td>
                            <td class="px-4 py-2 text-xs font-semibold uppercase tracking-wide">{{ $f->severity }}</td>
                            <td class="px-4 py-2">
                                @if ($f->status === 'open')
                                    <flux:badge color="amber" size="sm">open</flux:badge>
                                @elseif ($f->status === 'regressed')
                                    <flux:badge color="red" size="sm">regressed</flux:badge>
                                @elseif ($f->status === 'resolved')
                                    <flux:badge color="green" size="sm">resolved</flux:badge>
                                @elseif ($f->status === 'ignored')
                                    <flux:badge color="zinc" size="sm">ignored</flux:badge>
                                @endif
                            </td>
                        </tr>
                    @empty
                        <tr><td colspan="4" class="px-4 py-6 text-center text-sm text-neutral-500">No findings match the filters.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        @if ($findings->hasPages())
            <div class="border-t border-neutral-200 p-3 dark:border-neutral-700">{{ $findings->links() }}</div>
        @endif
    </div>
</div>
