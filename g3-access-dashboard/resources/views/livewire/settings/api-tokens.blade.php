<section class="w-full">
    @include('partials.settings-heading')

    <flux:heading class="sr-only">{{ __('API tokens') }}</flux:heading>

    <x-settings.layout :heading="__('API tokens')" :subheading="__('One token covers every site. No site pin, no activation step.')">
        @if ($plaintextKey)
            <div class="mb-6 rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <flux:heading size="lg">{{ __('Token created') }}</flux:heading>
                <flux:subheading>{{ __('Copy it now — it will not be shown again.') }}</flux:subheading>

                <div class="mt-4 rounded-lg bg-white p-3 font-mono text-xs break-all dark:bg-neutral-900">
                    <button type="button"
                        x-data="{ copied: false }"
                        x-on:click="navigator.clipboard.writeText('{{ $plaintextKey }}'); copied = true; setTimeout(() => copied = false, 1500)"
                        class="flex w-full items-center justify-between gap-4 text-left">
                        <span>{{ $plaintextKey }}</span>
                        <span class="shrink-0 text-xs text-neutral-500" x-text="copied ? 'copied ✓' : 'copy'"></span>
                    </button>
                </div>

                <div class="mt-4">
                    <flux:button wire:click="dismissKey" variant="subtle" size="sm">{{ __('Done') }}</flux:button>
                </div>
            </div>
        @endif

        <form wire:submit="mint" class="space-y-4">
            <flux:input wire:model="name" :label="__('Label')" placeholder="ADA agent — laptop" required />
            <flux:input wire:model="hosts" :label="__('Restrict to hosts (optional)')"
                placeholder="www.haysmed.com, www.pawneevalleyhospital.com" />
            <flux:text size="sm" class="!mt-1">
                {{ __('Comma separated. Leave blank to allow any host. Matching is exact — www.example.com does not cover example.com.') }}
            </flux:text>
            <flux:input wire:model="expires" :label="__('Expires (optional)')" type="date" />

            <flux:button type="submit" variant="primary">{{ __('Create token') }}</flux:button>
        </form>

        <flux:separator class="my-8" />

        <flux:heading size="lg">{{ __('Your tokens') }}</flux:heading>

        @if ($tokens->isEmpty())
            <flux:text class="mt-3">{{ __('No tokens yet.') }}</flux:text>
        @else
            <div class="mt-3 divide-y divide-neutral-200 dark:divide-neutral-700">
                @foreach ($tokens as $token)
                    <div class="flex items-start justify-between gap-4 py-3">
                        <div class="min-w-0">
                            <div class="font-medium">
                                {{ $token->name }}
                                @if ($token->revoked_at)
                                    <flux:badge color="red" size="sm">{{ __('revoked') }}</flux:badge>
                                @elseif ($token->isExpired())
                                    <flux:badge color="amber" size="sm">{{ __('expired') }}</flux:badge>
                                @endif
                            </div>
                            <flux:text size="sm">
                                {{ $token->allowed_hosts ? implode(', ', $token->allowed_hosts) : __('any host') }}
                                &middot;
                                {{ $token->last_used_at ? __('last used').' '.$token->last_used_at->diffForHumans() : __('never used') }}
                                @if ($token->expires_at)
                                    &middot; {{ __('expires').' '.$token->expires_at->toDateString() }}
                                @endif
                            </flux:text>
                        </div>

                        @unless ($token->revoked_at)
                            <flux:button wire:click="revoke({{ $token->id }})" variant="subtle" size="sm">
                                {{ __('Revoke') }}
                            </flux:button>
                        @endunless
                    </div>
                @endforeach
            </div>
        @endif
    </x-settings.layout>
</section>
