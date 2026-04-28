<div class="flex h-full w-full flex-1 flex-col gap-4 p-6">
    <div class="flex items-start justify-between gap-4">
        <div>
            <flux:heading size="xl">Sites</flux:heading>
            <flux:subheading>All licenses and the sites they're pinned to.</flux:subheading>
        </div>
        <flux:button :href="route('sites.mint')" variant="primary" icon="plus" wire:navigate>Mint license</flux:button>
    </div>

    <div class="flex flex-wrap gap-3">
        <flux:input wire:model.live.debounce.300ms="search" placeholder="Search by name…" icon="magnifying-glass" class="max-w-sm" />
        <flux:select wire:model.live="statusFilter" placeholder="Any status" class="max-w-xs">
            <flux:select.option value="">Any status</flux:select.option>
            <flux:select.option value="active">Active</flux:select.option>
            <flux:select.option value="suspended">Suspended</flux:select.option>
            <flux:select.option value="expired">Expired</flux:select.option>
        </flux:select>
    </div>

    <div class="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table class="w-full text-sm">
            <thead class="bg-neutral-50 dark:bg-neutral-800">
                <tr class="text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th class="px-4 py-3">Client</th>
                    <th class="px-4 py-3">Site URL</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 text-right">Open</th>
                    <th class="px-4 py-3 text-right">Regressed</th>
                    <th class="px-4 py-3">Last contact</th>
                    <th class="px-4 py-3"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($licenses as $license)
                    @php($activation = $license->activations->first())
                    <tr class="border-t border-neutral-100 dark:border-neutral-800">
                        <td class="px-4 py-3">
                            <a href="{{ route('sites.show', $license) }}" class="font-medium hover:underline" wire:navigate>
                                {{ $license->name }}
                            </a>
                        </td>
                        <td class="px-4 py-3 text-neutral-500">
                            @if ($activation)
                                <code class="text-xs">{{ $activation->site_url }}</code>
                            @else
                                <span class="text-neutral-400">—</span>
                            @endif
                        </td>
                        <td class="px-4 py-3">
                            @if ($license->status === 'active')
                                <flux:badge color="green" size="sm">Active</flux:badge>
                            @elseif ($license->status === 'suspended')
                                <flux:badge color="red" size="sm">Suspended</flux:badge>
                            @else
                                <flux:badge color="zinc" size="sm">{{ $license->status }}</flux:badge>
                            @endif
                        </td>
                        <td class="px-4 py-3 text-right">{{ $license->open_count }}</td>
                        <td class="px-4 py-3 text-right {{ $license->regressed_count > 0 ? 'font-semibold text-red-700 dark:text-red-400' : '' }}">
                            {{ $license->regressed_count }}
                        </td>
                        <td class="px-4 py-3 text-neutral-500">
                            @if ($activation && $activation->last_seen_at)
                                {{ $activation->last_seen_at->diffForHumans() }}
                            @elseif ($activation && $activation->activated_at)
                                Activated {{ $activation->activated_at->diffForHumans() }}
                            @else
                                <span class="text-amber-600">Not activated</span>
                            @endif
                        </td>
                        <td class="px-4 py-3 text-right">
                            @if ($license->status === 'active')
                                <flux:button size="xs" variant="subtle" wire:click="suspend({{ $license->id }})" wire:confirm="Suspend this license? POSTs from the plugin will immediately return 403.">Suspend</flux:button>
                            @elseif ($license->status === 'suspended')
                                <flux:button size="xs" variant="subtle" wire:click="unsuspend({{ $license->id }})">Unsuspend</flux:button>
                            @endif
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7" class="px-4 py-6 text-center text-sm text-neutral-500">
                            No licenses yet. <flux:link :href="route('sites.mint')" wire:navigate>Mint your first license →</flux:link>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div>{{ $licenses->links() }}</div>
</div>
