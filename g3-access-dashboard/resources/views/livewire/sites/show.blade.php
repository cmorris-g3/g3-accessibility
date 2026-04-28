<div class="flex h-full w-full flex-1 flex-col gap-6 p-6">
    <div class="flex items-start justify-between gap-4">
        <div>
            <flux:breadcrumbs>
                <flux:breadcrumbs.item :href="route('sites.index')" wire:navigate>Sites</flux:breadcrumbs.item>
                <flux:breadcrumbs.item>{{ $license->name }}</flux:breadcrumbs.item>
            </flux:breadcrumbs>
            <flux:heading size="xl" class="mt-2">{{ $license->name }}</flux:heading>
            <div class="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                @if ($license->status === 'active')
                    <flux:badge color="green" size="sm">Active</flux:badge>
                @elseif ($license->status === 'suspended')
                    <flux:badge color="red" size="sm">Suspended</flux:badge>
                @else
                    <flux:badge color="zinc" size="sm">{{ $license->status }}</flux:badge>
                @endif
                @if ($activation)
                    · <code class="text-xs">{{ $activation->site_url }}</code>
                @endif
                @if ($license->expires_at)
                    · expires {{ $license->expires_at->toDateString() }}
                @endif
            </div>
        </div>

        <div class="flex gap-2">
            @if ($license->status === 'active')
                <flux:button variant="danger" wire:click="suspend" wire:confirm="Suspend this license? The plugin's POST requests will immediately return 403.">
                    Suspend
                </flux:button>
            @else
                <flux:button variant="primary" wire:click="unsuspend">Unsuspend</flux:button>
            @endif
        </div>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Open</flux:subheading>
            <div class="text-2xl font-semibold text-amber-700 dark:text-amber-400">{{ $findingCounts['open'] }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Regressed</flux:subheading>
            <div class="text-2xl font-semibold text-red-700 dark:text-red-400">{{ $findingCounts['regressed'] }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Resolved</flux:subheading>
            <div class="text-2xl font-semibold text-green-700 dark:text-green-400">{{ $findingCounts['resolved'] }}</div>
        </div>
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:subheading>Ignored</flux:subheading>
            <div class="text-2xl font-semibold text-neutral-600 dark:text-neutral-400">{{ $findingCounts['ignored'] }}</div>
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:heading size="lg">Recent scans</flux:heading>
            @if ($recentScans->isEmpty())
                <p class="mt-2 text-sm text-neutral-500">No scans yet.</p>
            @else
                <table class="mt-3 w-full text-sm">
                    <thead class="text-xs uppercase tracking-wide text-neutral-500">
                        <tr class="text-left">
                            <th class="py-1.5">Page</th>
                            <th class="py-1.5">Status</th>
                            <th class="py-1.5 text-right">Findings</th>
                            <th class="py-1.5 text-right">When</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($recentScans as $scan)
                            @php
                                if ($scan->type === 'full') {
                                    $label = "Full site ({$scan->pages_done}/{$scan->pages_total} pages)";
                                    $title = 'Full-site scan';
                                    $findingsUrl = route('findings.index', ['license' => $license->id, 'status' => 'all']);
                                } else {
                                    $path = parse_url($scan->url ?? '', PHP_URL_PATH) ?: '/';
                                    $label = $path === '/' ? 'Home' : $path;
                                    $title = $scan->url;
                                    $findingsUrl = route('findings.index', ['license' => $license->id, 'url' => $scan->url, 'status' => 'all']);
                                }
                            @endphp
                            <tr class="border-t border-neutral-100 dark:border-neutral-800">
                                <td class="py-1.5">
                                    <a href="{{ route('scans.show', $scan->id) }}" class="font-mono text-xs hover:underline" title="{{ $title }}">{{ $label }}</a>
                                </td>
                                <td class="py-1.5">
                                    @if ($scan->status === 'complete')
                                        <flux:badge color="green" size="sm">complete</flux:badge>
                                    @elseif ($scan->status === 'failed')
                                        <flux:badge color="red" size="sm">failed</flux:badge>
                                    @else
                                        <flux:badge color="zinc" size="sm">{{ $scan->status }}</flux:badge>
                                    @endif
                                </td>
                                <td class="py-1.5 text-right">{{ $scan->findings_total }}</td>
                                <td class="py-1.5 text-right text-neutral-500">{{ $scan->created_at->diffForHumans() }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            @endif
        </div>

        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <div class="flex items-center justify-between">
                <flux:heading size="lg">Top issues</flux:heading>
                <flux:link :href="route('findings.index', ['license' => $license->id])" variant="subtle" wire:navigate>All findings →</flux:link>
            </div>
            @if ($topFindings->isEmpty())
                <p class="mt-2 text-sm text-neutral-500">No open or regressed findings. 🎉</p>
            @else
                <ul class="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
                    @foreach ($topFindings as $finding)
                        <li class="flex items-start justify-between gap-3 py-2">
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-semibold uppercase tracking-wide text-neutral-500">{{ $finding->severity }}</span>
                                    @if ($finding->status === 'regressed')
                                        <flux:badge color="red" size="sm">regressed</flux:badge>
                                    @endif
                                </div>
                                <div class="truncate text-sm font-medium">{{ $finding->finding_type }}</div>
                                <div class="truncate text-xs text-neutral-500">{{ $finding->url }}</div>
                            </div>
                        </li>
                    @endforeach
                </ul>
            @endif
        </div>
    </div>
</div>
