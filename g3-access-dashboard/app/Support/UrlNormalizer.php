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
        if (! in_array($parts['scheme'], ['http', 'https'], true)) {
            return null;
        }

        $path = $parts['path'] ?? '/';
        $path = rtrim($path, '/');
        if ($path === '') {
            $path = '/';
        }

        return $parts['scheme'].'://'.$parts['host'].$path;
    }
}
