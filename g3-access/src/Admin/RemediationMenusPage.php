<?php

namespace G3\Access\Admin;

class RemediationMenusPage
{
    public const SLUG = 'g3-access-menus';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'addMenu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAssets']);
    }

    public function addMenu(): void
    {
        add_submenu_page(
            SettingsPage::SLUG,
            'G3 Access — Menu items',
            'Menus',
            'edit_theme_options',
            self::SLUG,
            [$this, 'render']
        );
    }

    public function enqueueAssets(string $hookSuffix): void
    {
        if (! str_contains($hookSuffix, self::SLUG)) {
            return;
        }

        wp_enqueue_style('g3-access-admin', G3_ACCESS_URL.'assets/admin.css', [], G3_ACCESS_VERSION);
        wp_enqueue_style('g3-access-remediation-images', G3_ACCESS_URL.'assets/remediation-images.css', [], G3_ACCESS_VERSION);
        wp_enqueue_style('g3-access-remediation-menus', G3_ACCESS_URL.'assets/remediation-menus.css', [], G3_ACCESS_VERSION);
        wp_enqueue_script(
            'g3-access-remediation-menus',
            G3_ACCESS_URL.'assets/remediation-menus.js',
            ['jquery'],
            G3_ACCESS_VERSION,
            true
        );
        wp_localize_script('g3-access-remediation-menus', 'G3AccessRemediation', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('g3_access_remediation'),
        ]);
    }

    public function render(): void
    {
        if (! current_user_can('edit_theme_options')) {
            return;
        }
        ?>
        <div class="wrap g3-remediation-menus">
            <h1>Navigation menu labels</h1>
            <p class="description">
                Menu items with labels that make bad link text — empty, generic (like "Read more"), or
                duplicates that point to different destinations. Because menus appear on every page, fixing a
                label here resolves the same finding across every scanned page at once.
            </p>

            <div class="g3-rem-tabs" role="tablist">
                <button class="g3-rem-tab is-active" data-filter="flagged" type="button">Needs attention</button>
                <button class="g3-rem-tab" data-filter="all" type="button">All menu items</button>
            </div>

            <div class="g3-rem-controls">
                <div>
                    <label>
                        <input type="search" class="g3-rem-search regular-text" placeholder="Search label or URL…">
                    </label>
                </div>
                <div>
                    <label>
                        <input type="checkbox" class="g3-rem-include-ignored"> Show ignored
                    </label>
                </div>
                <div>
                    <a class="button" href="<?php echo esc_url(admin_url('nav-menus.php')); ?>" target="_blank" rel="noopener">
                        Open nav menu editor ↗
                    </a>
                </div>
            </div>

            <div class="g3-rem-meta" aria-live="polite"></div>
            <div class="g3-rem-list" aria-live="polite"><p class="g3-rem-empty">Loading…</p></div>
            <div class="g3-rem-toast" role="status" aria-live="polite"></div>
        </div>
        <?php
    }
}
