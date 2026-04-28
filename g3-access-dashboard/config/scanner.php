<?php

return [
    'node_path' => env('SCANNER_NODE_PATH', 'node'),

    'cli_path' => env('SCANNER_CLI_PATH'),

    'out_dir' => env('SCANNER_OUT_DIR', storage_path('scanner-runs')),

    'timeout_ms' => (int) env('SCANNER_TIMEOUT_MS', 120_000),

    'discover_timeout_ms' => (int) env('SCANNER_DISCOVER_TIMEOUT_MS', 30_000),

    'defaults' => [
        'cooldown_s' => 60,
        'daily_cap' => 100,
        'concurrency' => 2,
        'fullscan_per_day' => 1,
        'discover_max_pages' => 500,
    ],
];
