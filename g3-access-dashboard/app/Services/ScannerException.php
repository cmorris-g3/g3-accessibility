<?php

namespace App\Services;

use RuntimeException;

class ScannerException extends RuntimeException
{
    public function __construct(
        public readonly string $subcommand,
        public readonly int $exitCode,
        public readonly string $stderr,
        public readonly string $stdout,
    ) {
        parent::__construct("Scanner '{$subcommand}' exited with code {$exitCode}: ".trim($stderr));
    }
}
