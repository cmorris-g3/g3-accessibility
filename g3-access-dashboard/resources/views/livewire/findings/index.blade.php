<div class="flex h-full w-full flex-1 flex-col gap-4 p-6">
    <div>
        <flux:heading size="xl">Findings</flux:heading>
        <flux:subheading>All findings across every client, filterable.</flux:subheading>
    </div>

    @if ($url !== '')
        <div class="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
            <span class="text-neutral-500">URL:</span>
            <code class="truncate">{{ $url }}</code>
            <flux:button size="xs" variant="subtle" wire:click="clearUrlFilter">Clear</flux:button>
        </div>
    @endif

    <div class="flex flex-wrap gap-3">
        <flux:input wire:model.live.debounce.300ms="search" placeholder="Search URL, type, rationale…" icon="magnifying-glass" class="max-w-sm" />
        <flux:select wire:model.live="license" placeholder="All clients" class="max-w-xs">
            <flux:select.option value="">All clients</flux:select.option>
            @foreach ($licenses as $l)
                <flux:select.option value="{{ $l->id }}">{{ $l->name }}</flux:select.option>
            @endforeach
        </flux:select>
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

    <div class="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table class="w-full text-sm">
            <thead class="bg-neutral-50 dark:bg-neutral-800">
                <tr class="text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th class="px-4 py-3">Issue</th>
                    <th class="px-4 py-3">Client</th>
                    <th class="px-4 py-3">URL</th>
                    <th class="px-4 py-3">Severity</th>
                    <th class="px-4 py-3">Status</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($findings as $finding)
                    <tr class="border-t border-neutral-100 dark:border-neutral-800">
                        <td class="px-4 py-3">
                            <div class="font-medium">{{ $finding->finding_type }}</div>
                            <div class="max-w-md truncate text-xs text-neutral-500">{{ $finding->rationale }}</div>
                        </td>
                        <td class="px-4 py-3">
                            <a href="{{ route('sites.show', $finding->license_id) }}" class="hover:underline" wire:navigate>
                                {{ $finding->license?->name ?? '—' }}
                            </a>
                        </td>
                        <td class="px-4 py-3">
                            <code class="block max-w-xs truncate text-xs text-neutral-500">{{ $finding->url }}</code>
                        </td>
                        <td class="px-4 py-3">
                            <span class="text-xs font-semibold uppercase tracking-wide">{{ $finding->severity }}</span>
                        </td>
                        <td class="px-4 py-3">
                            @if ($finding->status === 'open')
                                <flux:badge color="amber" size="sm">open</flux:badge>
                            @elseif ($finding->status === 'regressed')
                                <flux:badge color="red" size="sm">regressed</flux:badge>
                            @elseif ($finding->status === 'resolved')
                                <flux:badge color="green" size="sm">resolved</flux:badge>
                            @elseif ($finding->status === 'ignored')
                                <flux:badge color="zinc" size="sm">ignored</flux:badge>
                            @endif
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="5" class="px-4 py-6 text-center text-sm text-neutral-500">No findings match the filters.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div>{{ $findings->links() }}</div>
</div>
