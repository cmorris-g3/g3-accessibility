<?php

namespace App\Services;

use JsonException;
use Symfony\Component\Process\Process;

class ScannerRunner
{
    public function discover(string $url, ?int $maxPages = null, ?int $timeoutMs = null): array
    {
        $maxPages = $maxPages ?? (int) config('scanner.defaults.discover_max_pages');
        $timeoutMs = $timeoutMs ?? (int) config('scanner.discover_timeout_ms');

        $args = [
            'discover',
            $url,
            '--max-pages', (string) $maxPages,
            '--timeout-ms', (string) $timeoutMs,
        ];

        [$stdout, $stderr, $exitCode] = $this->run($args, $timeoutMs);

        if ($exitCode !== 0) {
            throw new ScannerException('discover', $exitCode, $stderr, $stdout);
        }

        return $this->decodeJson('discover', $stdout, $stderr, $exitCode);
    }

    public function scanPage(string $url, string $outDir, string $runId, ?int $processTimeoutMs = null): array
    {
        $processTimeoutMs = $processTimeoutMs ?? (int) config('scanner.timeout_ms');

        if (! is_dir($outDir) && ! @mkdir($outDir, 0775, true) && ! is_dir($outDir)) {
            throw new \RuntimeException("Cannot create scanner out dir: {$outDir}");
        }

        $args = [
            'scan-page',
            $url,
            '--out-dir', $outDir,
            '--run-id', $runId,
        ];

        [$stdout, $stderr, $exitCode] = $this->run($args, $processTimeoutMs);

        if ($exitCode !== 0) {
            throw new ScannerException('scan-page', $exitCode, $stderr, $stdout);
        }

        return $this->decodeJson('scan-page', $stdout, $stderr, $exitCode);
    }

    public function analyze(string $runDir, ?int $processTimeoutMs = null): void
    {
        $processTimeoutMs = $processTimeoutMs ?? (int) config('scanner.timeout_ms');

        [$stdout, $stderr, $exitCode] = $this->run(['analyze', $runDir], $processTimeoutMs);

        if ($exitCode !== 0) {
            throw new ScannerException('analyze', $exitCode, $stderr, $stdout);
        }
    }

    public function consistencyPass(string $runDir, string $siteHost, ?int $processTimeoutMs = null): array
    {
        $processTimeoutMs = $processTimeoutMs ?? (int) config('scanner.timeout_ms');

        $args = [
            'consistency-pass',
            $runDir,
            '--site', $siteHost,
        ];

        [$stdout, $stderr, $exitCode] = $this->run($args, $processTimeoutMs);

        if ($exitCode !== 0) {
            throw new ScannerException('consistency-pass', $exitCode, $stderr, $stdout);
        }

        return $this->decodeJson('consistency-pass', $stdout, $stderr, $exitCode);
    }

    /**
     * @return array{0: string, 1: string, 2: int}
     */
    private function run(array $subcommandArgs, int $timeoutMs): array
    {
        $cliPath = config('scanner.cli_path');
        if (! $cliPath) {
            throw new \RuntimeException('SCANNER_CLI_PATH is not configured.');
        }

        $nodePath = config('scanner.node_path', 'node');

        $cmd = array_merge([$nodePath, $cliPath], $subcommandArgs);

        $process = new Process($cmd);
        $process->setTimeout(max(10.0, ($timeoutMs / 1000) + 30));
        $process->run();

        return [$process->getOutput(), $process->getErrorOutput(), $process->getExitCode() ?? 1];
    }

    private function decodeJson(string $subcommand, string $stdout, string $stderr, int $exitCode): array
    {
        try {
            $decoded = json_decode($stdout, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new ScannerException($subcommand, $exitCode, "invalid JSON on stdout: ".$e->getMessage()."\n\n".$stderr, $stdout);
        }
        if (! is_array($decoded)) {
            throw new ScannerException($subcommand, $exitCode, 'scanner did not return a JSON object', $stdout);
        }
        return $decoded;
    }
}
