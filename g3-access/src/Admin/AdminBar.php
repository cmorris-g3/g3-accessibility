<?php

namespace G3\Access\Admin;

use G3\Access\Options;

class AdminBar
{
    public function register(): void
    {
        add_action('admin_bar_menu', [$this, 'addNode'], 100);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAssets']);
        add_action('wp_enqueue_scripts', [$this, 'enqueueAssets']);
    }

    public function addNode(\WP_Admin_Bar $bar): void
    {
        if (! is_admin_bar_showing()) {
            return;
        }
        if (is_admin()) {
            return;
        }
        if (! current_user_can('edit_posts')) {
            return;
        }

        $activation = Options::activationStatus();
        if (! $activation['activated']) {
            return;
        }

        $bar->add_node([
            'id' => 'g3-access-scan',
            'title' => '<span class="g3-ab-label">Scan this page</span><span class="g3-ab-pill" data-state="idle">⋯</span>',
            'href' => '#',
            'meta' => [
                'class' => 'g3-access-admin-bar',
                'title' => 'Run an accessibility scan on this page',
            ],
        ]);

        $bar->add_node([
            'id' => 'g3-access-highlight',
            'title' => '<span class="g3-ab-label">Show issues</span><span class="g3-ab-pill g3-hl-pill" data-state="idle">off</span>',
            'href' => '#',
            'meta' => [
                'class' => 'g3-access-admin-bar',
                'title' => 'Outline flagged elements on this page',
            ],
        ]);
    }

    public function enqueueAssets(): void
    {
        if (is_admin()) {
            return;
        }

        $activation = Options::activationStatus();
        if (! $activation['activated']) {
            return;
        }

        wp_enqueue_style('g3-access-admin', G3_ACCESS_URL.'assets/admin.css', [], G3_ACCESS_VERSION);
        wp_enqueue_style('g3-access-highlight', G3_ACCESS_URL.'assets/highlight.css', [], G3_ACCESS_VERSION);
        wp_enqueue_script(
            'g3-access-admin-bar',
            G3_ACCESS_URL.'assets/admin-bar.js',
            ['jquery'],
            G3_ACCESS_VERSION,
            true
        );
        wp_enqueue_script(
            'g3-access-highlight',
            G3_ACCESS_URL.'assets/highlight.js',
            ['jquery'],
            G3_ACCESS_VERSION,
            true
        );
        wp_localize_script('g3-access-admin-bar', 'G3Access', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('g3_access_scan'),
            'currentUrl' => $this->currentUrl(),
            'checklistUrl' => admin_url('admin.php?page=g3-access-checklist'),
        ]);
    }

    private function currentUrl(): string
    {
        $scheme = is_ssl() ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme.'://'.$host.$uri;
    }
}
