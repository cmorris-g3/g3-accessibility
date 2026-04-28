<div class="flex h-full w-full flex-1 flex-col gap-6 p-6"
    @if ($hasPending) wire:poll.3s @endif>
    <div>
        <flux:heading size="xl">Ad-hoc Scans</flux:heading>
        <flux:subheading>
            Scan any site. No license required — runs only while you're signed into the dashboard.
            @if ($hasPending)
                <span class="ml-2 inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                    <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
                    scan in progress — refreshing…
                </span>
            @endif
        </flux:subheading>
    </div>

    <form wire:submit="scan" class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
        <div class="grid gap-4 md:grid-cols-[1fr_200px_180px_auto]">
            <flux:input wire:model="url" type="url" label="URL" placeholder="https://prospect.example.com" required />
            <flux:input wire:model="label" label="Label (optional)" placeholder="Prospect: Acme Co" />
            <flux:select wire:model.live="type" label="Type">
                <flux:select.option value="page">Single page</flux:select.option>
                <flux:select.option value="full">Full site (auto-discover)</flux:select.option>
                <flux:select.option value="selected">Selected pages</flux:select.option>
            </flux:select>
            <div class="flex items-end">
                <flux:button type="submit" variant="primary" class="w-full md:w-auto">Scan</flux:button>
            </div>
        </div>

        @if ($type === 'selected')
            <div class="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
                <div class="mb-2 flex items-center justify-between gap-2">
                    <label for="urlList" class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        URLs to scan (one per line)
                    </label>
                    <div class="flex items-center gap-3">
                        <span wire:loading wire:target="fetchSitemap" class="text-xs text-blue-700 dark:text-blue-400">
                            fetching…
                        </span>
                        <flux:button size="xs" variant="subtle" wire:click="fetchSitemap" wire:loading.attr="disabled" type="button">
                            Pull from sitemap
                        </flux:button>
                    </div>
                </div>
                <textarea id="urlList" wire:model="urlList" rows="8"
                    placeholder="https://example.com/&#10;https://example.com/about&#10;# lines starting with # are ignored&#10;https://example.com/services"
                    class="w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-900"></textarea>
                @error('urlList') <p class="mt-1 text-xs text-red-600">{{ $message }}</p> @enderror
                @if ($sitemapNotice)
                    <p class="mt-2 text-xs text-neutral-500">{{ $sitemapNotice }}</p>
                @endif
                <p class="mt-1 text-xs text-neutral-500">
                    One URL per line. Blank lines and lines starting with <code>#</code> are ignored.
                </p>
            </div>
        @endif

        @if ($latestScanId)
            <p class="mt-3 text-sm text-green-700 dark:text-green-400">
                Scan #{{ $latestScanId }} queued.
                <a href="{{ route('scans.show', $latestScanId) }}"
                   class="underline hover:no-underline">View scan →</a>
            </p>
        @endif
    </form>

    <div class="grid gap-6 lg:grid-cols-2">
        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:heading size="lg">Scanned URLs</flux:heading>
            <flux:subheading>Unique URLs scanned ad-hoc. Click to view findings.</flux:subheading>

            @if ($byUrl->isEmpty())
                <p class="mt-3 text-sm text-neutral-500">No ad-hoc scans yet.</p>
            @else
                <table class="mt-3 w-full text-sm">
                    <thead class="text-xs uppercase tracking-wide text-neutral-500">
                        <tr class="text-left">
                            <th class="py-1.5">URL</th>
                            <th class="py-1.5">Latest</th>
                            <th class="py-1.5 text-right">Scans</th>
                            <th class="py-1.5 text-right">Last</th>
                            <th class="py-1.5"></th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($byUrl as $row)
                            <tr class="border-t border-neutral-100 dark:border-neutral-800">
                                <td class="py-2">
                                    <a href="{{ route('scans.show', $row->latest_scan->id) }}"
                                       class="font-mono text-xs hover:underline">{{ $row->url }}</a>
                                </td>
                                <td class="py-2 text-neutral-500">
                                    {{ $row->latest_scan->type === 'full' ? 'full site' : 'page' }}
                                </td>
                                <td class="py-2 text-right">{{ $row->scan_count }}</td>
                                <td class="py-2 text-right text-neutral-500">
                                    {{ \Carbon\Carbon::parse($row->last_scanned_at)->diffForHumans() }}
                                </td>
                                <td class="py-2 text-right">
                                    <flux:button size="xs" variant="subtle"
                                                 wire:click="rescan('{{ addslashes($row->url) }}', '{{ $row->latest_scan->type }}')">
                                        Rescan
                                    </flux:button>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            @endif
        </div>

        <div class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <flux:heading size="lg">Recent scans</flux:heading>
            <flux:subheading>Last 25 ad-hoc scan runs, newest first.</flux:subheading>

            @if ($recentScans->isEmpty())
                <p class="mt-3 text-sm text-neutral-500">No scans yet.</p>
            @else
                <table class="mt-3 w-full text-sm">
                    <thead class="text-xs uppercase tracking-wide text-neutral-500">
                        <tr class="text-left">
                            <th class="py-1.5">URL</th>
                            <th class="py-1.5">Type</th>
                            <th class="py-1.5">Status</th>
                            <th class="py-1.5 text-right">Findings</th>
                            <th class="py-1.5 text-right">When</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($recentScans as $scan)
                            <tr class="border-t border-neutral-100 dark:border-neutral-800">
                                <td class="py-2">
                                    <a href="{{ route('scans.show', $scan->id) }}"
                                       class="font-mono text-xs hover:underline" title="{{ $scan->url }}">
                                        {{ \Illuminate\Support\Str::limit($scan->url, 40) }}
                                    </a>
                                </td>
                                <td class="py-2">{{ $scan->type === 'full' ? 'full site' : 'page' }}</td>
                                <td class="py-2">
                                    @if ($scan->status === 'complete')
                                        <flux:badge color="green" size="sm">complete</flux:badge>
                                    @elseif ($scan->status === 'failed')
                                        <flux:badge color="red" size="sm">failed</flux:badge>
                                    @elseif ($scan->status === 'running')
                                        <flux:badge color="blue" size="sm">running…</flux:badge>
                                    @else
                                        <flux:badge color="zinc" size="sm">queued</flux:badge>
                                    @endif
                                </td>
                                <td class="py-2 text-right">{{ $scan->findings_total }}</td>
                                <td class="py-2 text-right text-neutral-500">{{ $scan->created_at->diffForHumans() }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            @endif
        </div>
    </div>
</div>
