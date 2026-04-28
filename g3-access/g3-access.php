<?php
/**
 * Plugin Name: G3 Access
 * Description: Accessibility issue tracker + remediation workbench. Scans pages, catalogs WCAG findings, tracks resolution across scans.
 * Version: 0.1.0
 * Requires at least: 6.2
 * Requires PHP: 8.1
 * Author: Group 3
 * License: Proprietary
 */

if (! defined('ABSPATH')) {
    exit;
}

define('G3_ACCESS_VERSION', '0.1.0');
define('G3_ACCESS_FILE', __FILE__);
define('G3_ACCESS_DIR', plugin_dir_path(__FILE__));
define('G3_ACCESS_URL', plugin_dir_url(__FILE__));

spl_autoload_register(function (string $class): void {
    $prefix = 'G3\\Access\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path = G3_ACCESS_DIR.'src/'.str_replace('\\', '/', $relative).'.php';
    if (is_file($path)) {
        require_once $path;
    }
});

add_action('plugins_loaded', function (): void {
    (new \G3\Access\Plugin())->boot();
});

register_activation_hook(__FILE__, function (): void {
    \G3\Access\Options::ensureDefaults();
    \G3\Access\Cron\LicenseRefresh::scheduleIfNeeded();
});

register_deactivation_hook(__FILE__, function (): void {
    \G3\Access\Cron\LicenseRefresh::unschedule();
});

register_uninstall_hook(__FILE__, 'g3_access_uninstall');

function g3_access_uninstall(): void
{
    delete_option('g3_access_options');
    delete_option('g3_access_findings_snapshot');
    delete_option('g3_access_activation_status');

    // Clear our "ignored for alt-text remediation" markers from attachments.
    global $wpdb;
    $wpdb->delete($wpdb->postmeta, ['meta_key' => '_g3_access_ignored']);
}
