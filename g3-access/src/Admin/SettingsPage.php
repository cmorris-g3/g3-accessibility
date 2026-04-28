<?php

namespace G3\Access\Admin;

use G3\Access\Api\Client;
use G3\Access\Options;

class SettingsPage
{
    public const SLUG = 'g3-access';

    private const NONCE_ACTION = 'g3_access_save_settings';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'addMenu']);
        add_action('admin_post_g3_access_save_settings', [$this, 'handleSave']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAssets']);
    }

    public function addMenu(): void
    {
        add_menu_page(
            'G3 Access',
            'G3 Access',
            'manage_options',
            self::SLUG,
            [$this, 'render'],
            'dashicons-universal-access-alt',
            80
        );

        add_submenu_page(
            self::SLUG,
            'G3 Access — Settings',
            'Settings',
            'manage_options',
            self::SLUG,
            [$this, 'render']
        );
    }

    public function enqueueAssets(string $hookSuffix): void
    {
        if (! str_contains($hookSuffix, 'g3-access')) {
            return;
        }
        wp_enqueue_style('g3-access-admin', G3_ACCESS_URL.'assets/admin.css', [], G3_ACCESS_VERSION);
    }

    public function render(): void
    {
        if (! current_user_can('manage_options')) {
            return;
        }

        $options = Options::all();
        $activation = Options::activationStatus();
        $siteUrl = Options::siteUrl();
        $notice = isset($_GET['g3_notice']) ? sanitize_key((string) $_GET['g3_notice']) : '';

        ?>
        <div class="wrap g3-access-settings">
            <h1>G3 Access — Settings</h1>

            <?php if ($notice === 'saved'): ?>
                <div class="notice notice-success"><p>Settings saved and license activated.</p></div>
            <?php elseif ($notice === 'activation_failed'): ?>
                <div class="notice notice-error">
                    <p><strong>License activation failed:</strong>
                        <?php echo esc_html($activation['error'] ?? 'Unknown error'); ?></p>
                </div>
            <?php elseif ($notice === 'saved_no_remote'): ?>
                <div class="notice notice-warning"><p>Settings saved. Activation attempt failed — check API base URL is reachable.</p></div>
            <?php endif; ?>

            <div class="g3-access-status">
                <h2>Status</h2>
                <table class="form-table">
                    <tr>
                        <th>Site URL</th>
                        <td><code><?php echo esc_html($siteUrl); ?></code></td>
                    </tr>
                    <tr>
                        <th>License</th>
                        <td>
                            <?php if ($activation['activated']): ?>
                                <span class="g3-pill g3-pill--ok">Active</span>
                                <?php if (! empty($activation['license']['name'])): ?>
                                    — <?php echo esc_html($activation['license']['name']); ?>
                                <?php endif; ?>
                            <?php else: ?>
                                <span class="g3-pill g3-pill--off">Not activated</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php if (! empty($activation['last_checked_at'])): ?>
                        <tr>
                            <th>Last checked</th>
                            <td><?php echo esc_html($activation['last_checked_at']); ?></td>
                        </tr>
                    <?php endif; ?>
                </table>
            </div>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field(self::NONCE_ACTION); ?>
                <input type="hidden" name="action" value="g3_access_save_settings">

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="g3_access_api_base_url">API Base URL</label></th>
                        <td>
                            <input type="url" class="regular-text code" id="g3_access_api_base_url"
                                name="api_base_url"
                                value="<?php echo esc_attr($options['api_base_url'] ?? ''); ?>"
                                placeholder="https://dashboard.example.com" required>
                            <p class="description">Base URL of the G3 Access dashboard (no trailing slash, no /api).</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="g3_access_license_key">License Key</label></th>
                        <td>
                            <input type="password" class="regular-text code" id="g3_access_license_key"
                                name="license_key"
                                value="<?php echo esc_attr($options['license_key'] ?? ''); ?>"
                                autocomplete="new-password" required>
                            <p class="description">Shown once in the dashboard at mint time. Paste it here.</p>
                        </td>
                    </tr>
                </table>

                <?php submit_button('Save & Activate'); ?>
            </form>
        </div>
        <?php
    }

    public function handleSave(): void
    {
        if (! current_user_can('manage_options')) {
            wp_die('Insufficient permissions.');
        }
        check_admin_referer(self::NONCE_ACTION);

        $licenseKey = isset($_POST['license_key']) ? sanitize_text_field(wp_unslash((string) $_POST['license_key'])) : '';
        $apiBaseUrl = isset($_POST['api_base_url']) ? esc_url_raw(wp_unslash((string) $_POST['api_base_url'])) : '';

        Options::updateCredentials($licenseKey, $apiBaseUrl);

        $client = new Client();
        $response = $client->activate(G3_ACCESS_VERSION, get_bloginfo('name'));

        if (is_wp_error($response)) {
            Options::setActivationStatus([
                'activated' => false,
                'error' => $response->get_error_message(),
                'license' => null,
                'last_checked_at' => gmdate('c'),
            ]);
            $notice = str_contains($response->get_error_code(), 'g3_access_api_') ? 'activation_failed' : 'saved_no_remote';
            wp_safe_redirect(add_query_arg(['page' => self::SLUG, 'g3_notice' => $notice], admin_url('admin.php')));
            exit;
        }

        Options::setActivationStatus([
            'activated' => (bool) ($response['activated'] ?? false),
            'error' => null,
            'license' => $response['license'] ?? null,
            'last_checked_at' => gmdate('c'),
        ]);

        wp_safe_redirect(add_query_arg(['page' => self::SLUG, 'g3_notice' => 'saved'], admin_url('admin.php')));
        exit;
    }
}
