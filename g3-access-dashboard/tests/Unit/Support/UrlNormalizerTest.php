<?php

namespace Tests\Unit\Support;

use App\Support\UrlNormalizer;
use PHPUnit\Framework\TestCase;

class UrlNormalizerTest extends TestCase
{
    public function test_preserves_query_string(): void
    {
        $this->assertSame(
            'https://www.example.com/getpage.php?name=contact&sub=About%20Us',
            UrlNormalizer::normalize('https://www.example.com/getpage.php?name=contact&sub=About%20Us'),
        );
    }

    public function test_query_string_difference_is_preserved_for_dedup(): void
    {
        $a = UrlNormalizer::normalize('https://example.com/getpage.php?name=contact');
        $b = UrlNormalizer::normalize('https://example.com/getpage.php?name=services');

        $this->assertNotSame($a, $b);
    }

    public function test_drops_fragment(): void
    {
        $this->assertSame(
            'https://example.com/foo',
            UrlNormalizer::normalize('https://example.com/foo#anchor'),
        );
    }

    public function test_strips_trailing_slash(): void
    {
        $this->assertSame(
            'https://example.com/foo',
            UrlNormalizer::normalize('https://example.com/foo/'),
        );
    }

    public function test_root_path_normalizes_to_slash(): void
    {
        $this->assertSame('https://example.com/', UrlNormalizer::normalize('https://example.com'));
        $this->assertSame('https://example.com/', UrlNormalizer::normalize('https://example.com/'));
    }

    public function test_lowercases_scheme_and_host(): void
    {
        $this->assertSame(
            'https://example.com/foo',
            UrlNormalizer::normalize('HTTPS://EXAMPLE.COM/foo'),
        );
    }

    public function test_drops_default_ports(): void
    {
        $this->assertSame('https://example.com/x', UrlNormalizer::normalize('https://example.com:443/x'));
        $this->assertSame('http://example.com/x', UrlNormalizer::normalize('http://example.com:80/x'));
    }

    public function test_preserves_non_default_ports(): void
    {
        $this->assertSame(
            'https://example.com:8443/x',
            UrlNormalizer::normalize('https://example.com:8443/x'),
        );
    }

    public function test_rejects_non_http_schemes(): void
    {
        $this->assertNull(UrlNormalizer::normalize('ftp://example.com/'));
        $this->assertNull(UrlNormalizer::normalize('javascript:alert(1)'));
    }

    public function test_rejects_unparsable_input(): void
    {
        $this->assertNull(UrlNormalizer::normalize(''));
        $this->assertNull(UrlNormalizer::normalize('not-a-url'));
    }
}
