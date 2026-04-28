<?php

namespace G3\Access\Api;

use G3\Access\Options;
use WP_Error;

class Client
{
    public function activate(string $pluginVersion, ?string $siteTitle = null): array|WP_Error
    {
        return $this->post('/activate', [
            'site_url' => Options::siteUrl(),
            'plugin_version' => $pluginVersion,
            'site_title' => $siteTitle,
        ], includeSiteHeader: false);
    }

    public function license(): array|WP_Error
    {
        return $this->get('/license', includeSiteHeader: false);
    }

    public function createPageScan(string $url): array|WP_Error
    {
        return $this->post('/scans', [
            'type' => 'page',
            'url' => $url,
        ]);
    }

    public function createFullScan(array $sitemapUrls = []): array|WP_Error
    {
        return $this->post('/scans', [
            'type' => 'full',
            'sitemap_urls' => $sitemapUrls,
        ]);
    }

    public function getScan(int $scanId): array|WP_Error
    {
        return $this->get('/scans/'.$scanId);
    }

    public function getFindings(array $params = []): array|WP_Error
    {
        $query = http_build_query(array_filter($params, fn ($v) => $v !== null && $v !== ''));
        $path = '/findings'.($query ? '?'.$query : '');
        return $this->get($path);
    }

    public function ignoreFinding(int $findingId, ?string $reason = null): array|WP_Error
    {
        return $this->post('/findings/'.$findingId.'/ignore', [
            'reason' => $reason,
        ]);
    }

    public function unignoreFinding(int $findingId): array|WP_Error
    {
        return $this->post('/findings/'.$findingId.'/unignore', []);
    }

    private function get(string $path, bool $includeSiteHeader = true): array|WP_Error
    {
        return $this->request('GET', $path, null, $includeSiteHeader);
    }

    private function post(string $path, array $body, bool $includeSiteHeader = true): array|WP_Error
    {
        return $this->request('POST', $path, $body, $includeSiteHeader);
    }

    private function request(string $method, string $path, ?array $body, bool $includeSiteHeader): array|WP_Error
    {
        if (! Options::hasCredentials()) {
            return new WP_Error('g3_access_missing_credentials', 'Plugin credentials are not configured.');
        }

        $url = Options::apiBaseUrl().'/api'.$path;
        $headers = [
            'Authorization' => 'Bearer '.Options::licenseKey(),
            'Accept' => 'application/json',
        ];
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
        }
        if ($includeSiteHeader) {
            $headers['X-Site-Url'] = Options::siteUrl();
        }

        $args = [
            'method' => $method,
            'headers' => $headers,
            'timeout' => 15,
            'redirection' => 2,
        ];
        if ($body !== null) {
            $args['body'] = wp_json_encode($body);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            return $response;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $raw = (string) wp_remote_retrieve_body($response);
        $decoded = json_decode($raw, true);

        if ($status >= 400) {
            $code = $decoded['error']['code'] ?? 'HTTP_'.$status;
            $message = $decoded['error']['message'] ?? ('Upstream returned HTTP '.$status);
            $err = new WP_Error('g3_access_api_'.$code, $message, [
                'status' => $status,
                'response' => $decoded,
                'retry_after_s' => $decoded['error']['retry_after_s'] ?? null,
            ]);
            return $err;
        }

        if (! is_array($decoded)) {
            return new WP_Error('g3_access_invalid_response', 'Server returned unparseable JSON.', ['raw' => $raw]);
        }

        return $decoded;
    }
}
