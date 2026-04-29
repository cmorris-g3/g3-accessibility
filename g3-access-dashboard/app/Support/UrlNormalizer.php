<?php

namespace App\Support;

class UrlNormalizer
{
    public static function normalize(string $url): ?string
    {
        $parts = parse_url($url);
        if (! $parts || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);
        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        $host = strtolower($parts['host']);

        $port = '';
        if (isset($parts['port'])) {
            $defaultPort = $scheme === 'http' ? 80 : 443;
            if ((int) $parts['port'] !== $defaultPort) {
                $port = ':'.$parts['port'];
            }
        }

        $path = $parts['path'] ?? '/';
        $path = rtrim($path, '/');
        if ($path === '') {
            $path = '/';
        }

        $query = isset($parts['query']) ? '?'.$parts['query'] : '';

        return $scheme.'://'.$host.$port.$path.$query;
    }
}
