<div class="flex h-full w-full flex-1 flex-col gap-6 p-6">
    <div>
        <flux:heading size="xl">G3 Access — Overview</flux:heading>
        <flux:subheading>Cross-client accessibility findings, scans, and license health.</flux:subheading>
    </div>

    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Active sites</flux:subheading>
            <div class="mt-1 text-3xl font-semibold">{{ $stats['activeLicenses'] }}</div>
            <div class="text-xs text-neutral-500">of {{ $stats['totalLicenses'] }} total · {{ $stats['suspendedLicenses'] }} suspended</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Open findings</flux:subheading>
            <div class="mt-1 text-3xl font-semibold text-amber-700 dark:text-amber-400">{{ $stats['openFindings'] }}</div>
            <div class="text-xs text-neutral-500">across all clients</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Regressions</flux:subheading>
            <div class="mt-1 text-3xl font-semibold text-red-700 dark:text-red-400">{{ $stats['regressedFindings'] }}</div>
            <div class="text-xs text-neutral-500">resolved items that came back</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Scans (24h)</flux:subheading>
            <div class="mt-1 text-3xl font-semibold">{{ $stats['scansLast24h'] }}</div>
            <div class="text-xs text-neutral-500">{{ $stats['failedScansLast24h'] }} failed</div>
        </div>
    </div>

    <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
        <div class="mb-3 flex items-center justify-between">
            <flux:heading size="lg">Needs attention</flux:heading>
            <flux:link href="{{ route('sites.index') }}" variant="subtle">All sites →</flux:link>
        </div>

        @if ($needsAttention->isEmpty())
            <p class="text-sm text-neutral-500">No sites with open findings.</p>
        @else
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                        <th class="py-2">Client</th>
                        <th class="py-2 text-right">Regressed</th>
                        <th class="py-2 text-right">Open</th>
                        <th class="py-2 text-right">Last full scan</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($needsAttention as $license)
                        <tr class="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                            <td class="py-2">
                                <a href="{{ route('sites.show', $license) }}" class="font-medium hover:underline">
                                    {{ $license->name }}
                                </a>
                            </td>
                            <td class="py-2 text-right {{ $license->regressed_count > 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-neutral-400' }}">
                                {{ $license->regressed_count }}
                            </td>
                            <td class="py-2 text-right">{{ $license->open_count }}</td>
                            <td class="py-2 text-right text-neutral-500">
                                {{ $license->last_full_scan_at ? $license->last_full_scan_at->diffForHumans() : '—' }}
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        @endif
    </div>
</div>
