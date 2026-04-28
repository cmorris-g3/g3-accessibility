<div class="flex h-full w-full flex-1 flex-col gap-4 p-6">
    <div>
        <flux:heading size="xl">Mint a new license</flux:heading>
        <flux:subheading>Creates a license pinned to one client site. Key is shown once.</flux:subheading>
    </div>

    @if ($plaintextKey)
        <div class="rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
            <flux:heading size="lg">License minted</flux:heading>
            <flux:subheading>Copy the key now — it will not be shown again.</flux:subheading>

            <div class="mt-4 rounded-lg bg-white p-3 font-mono text-sm dark:bg-neutral-900">
                <button type="button"
                    x-data="{ copied: false }"
                    x-on:click="navigator.clipboard.writeText('{{ $plaintextKey }}'); copied = true; setTimeout(() => copied = false, 1500)"
                    class="flex w-full items-center justify-between gap-4 text-left">
                    <span>{{ $plaintextKey }}</span>
                    <span class="text-xs text-neutral-500" x-text="copied ? 'copied ✓' : 'copy'"></span>
                </button>
            </div>

            <div class="mt-4 flex gap-2">
                <flux:button :href="route('sites.show', $mintedLicenseId)" variant="primary" wire:navigate>View site</flux:button>
                <flux:button :href="route('sites.index')" variant="subtle" wire:navigate>Back to sites</flux:button>
            </div>
        </div>
    @else
        <form wire:submit="mint" class="max-w-xl space-y-4 rounded-xl border border-neutral-200 p-6 dark:border-neutral-700">
            <flux:input wire:model="name" label="Client name" placeholder="Acme Co — Main Site" required />
            <flux:input wire:model="siteUrl" label="Site URL" type="url" placeholder="https://client.com" required />
            <flux:input wire:model="expires" label="Expires (optional)" type="date" />

            <div class="flex gap-2 pt-2">
                <flux:button type="submit" variant="primary">Mint license</flux:button>
                <flux:button :href="route('sites.index')" variant="subtle" wire:navigate>Cancel</flux:button>
            </div>
        </form>
    @endif
</div>
