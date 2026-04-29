@props([
    'sidebar' => false,
])

@if($sidebar)
    <flux:sidebar.brand name="G3 Access" {{ $attributes }}>
        <x-slot name="logo" class="flex aspect-square size-8 items-center justify-center rounded-md overflow-hidden">
            <img src="/logo.png" alt="G3" class="size-8 object-contain" />
        </x-slot>
    </flux:sidebar.brand>
@else
    <flux:brand name="G3 Access" {{ $attributes }}>
        <x-slot name="logo" class="flex aspect-square size-8 items-center justify-center rounded-md overflow-hidden">
            <img src="/logo.png" alt="G3" class="size-8 object-contain" />
        </x-slot>
    </flux:brand>
@endif
