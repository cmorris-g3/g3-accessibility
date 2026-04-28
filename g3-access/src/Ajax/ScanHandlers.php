<?php

namespace G3\Access\Ajax;

use G3\Access\Api\Client;
use G3\Access\Options;

class ScanHandlers
{
    public function register(): void
    {
        add_action('wp_ajax_g3_access_scan', [$this, 'startScan']);
        add_action('wp_ajax_g3_access_poll_scan', [$this, 'pollScan']);
        add_action('wp_ajax_g3_access_ignore_finding', [$this, 'ignoreFinding']);
        add_action('wp_ajax_g3_access_unignore_finding', [$this, 'unignoreFinding']);
        add_action('wp_ajax_g3_access_full_scan', [$this, 'startFullScan']);
        add_action('wp_ajax_g3_access_findings_for_url', [$this, 'findingsForUrl']);
    }

    public function startScan(): void
    {
        $this->authorize('g3_access_scan');

        $url = isset($_POST['url']) ? esc_url_raw(wp_unslash((string) $_POST['url'])) : '';
        if ($url === '') {
            wp_send_json_error(['code' => 'INVALID_URL', 'message' => 'URL is required.'], 422);
        }

        $client = new Client();
        $response = $client->createPageScan($url);

        if (is_wp_error($response)) {
            $data = $response->get_error_data();
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
                'retry_after_s' => $data['retry_after_s'] ?? null,
            ], $data['status'] ?? 500);
        }

        wp_send_json_success($response);
    }

    public function startFullScan(): void
    {
        $this->authorize('g3_access_scan');

        $client = new Client();
        $response = $client->createFullScan([]);

        if (is_wp_error($response)) {
            $data = $response->get_error_data();
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
                'retry_after_s' => $data['retry_after_s'] ?? null,
            ], $data['status'] ?? 500);
        }

        wp_send_json_success($response);
    }

    public function pollScan(): void
    {
        $this->authorize('g3_access_scan');

        $scanId = isset($_GET['scan_id']) ? (int) $_GET['scan_id'] : 0;
        if ($scanId <= 0) {
            wp_send_json_error(['code' => 'INVALID_SCAN_ID'], 422);
        }

        $client = new Client();
        $response = $client->getScan($scanId);

        if (is_wp_error($response)) {
            $data = $response->get_error_data();
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
            ], $data['status'] ?? 500);
        }

        wp_send_json_success($response);
    }

    public function ignoreFinding(): void
    {
        $this->authorize('g3_access_scan');

        $findingId = isset($_POST['finding_id']) ? (int) $_POST['finding_id'] : 0;
        $reason = isset($_POST['reason']) ? sanitize_textarea_field(wp_unslash((string) $_POST['reason'])) : null;

        if ($findingId <= 0) {
            wp_send_json_error(['code' => 'INVALID_FINDING_ID'], 422);
        }

        $client = new Client();
        $response = $client->ignoreFinding($findingId, $reason);

        if (is_wp_error($response)) {
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
            ], 500);
        }

        wp_send_json_success($response);
    }

    public function unignoreFinding(): void
    {
        $this->authorize('g3_access_scan');

        $findingId = isset($_POST['finding_id']) ? (int) $_POST['finding_id'] : 0;
        if ($findingId <= 0) {
            wp_send_json_error(['code' => 'INVALID_FINDING_ID'], 422);
        }

        $client = new Client();
        $response = $client->unignoreFinding($findingId);

        if (is_wp_error($response)) {
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
            ], 500);
        }

        wp_send_json_success($response);
    }

    public function findingsForUrl(): void
    {
        $this->authorize('g3_access_scan');

        $url = isset($_GET['url']) ? esc_url_raw(wp_unslash((string) $_GET['url'])) : '';
        if ($url === '') {
            wp_send_json_error(['code' => 'INVALID_URL'], 422);
        }

        $client = new Client();
        $response = $client->getFindings([
            'url' => $url,
            'status' => 'open',
            'per_page' => 200,
        ]);

        if (is_wp_error($response)) {
            wp_send_json_error([
                'code' => $response->get_error_code(),
                'message' => $response->get_error_message(),
            ], 500);
        }

        wp_send_json_success($response);
    }

    private function authorize(string $nonceAction): void
    {
        if (! current_user_can('edit_posts')) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        check_ajax_referer($nonceAction, 'nonce');
        if (! Options::hasCredentials() || ! Options::activationStatus()['activated']) {
            wp_send_json_error(['code' => 'NOT_ACTIVATED'], 409);
        }
    }
}
