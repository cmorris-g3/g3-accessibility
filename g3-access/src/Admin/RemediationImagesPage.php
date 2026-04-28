<?php

namespace G3\Access\Admin;

class RemediationImagesPage
{
    public const SLUG = 'g3-access-images';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'addMenu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAssets']);
    }

    public function addMenu(): void
    {
        add_submenu_page(
            SettingsPage::SLUG,
            'G3 Access — Images missing alt text',
            'Images',
            'upload_files',
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
        wp_enqueue_script(
            'g3-access-remediation-images',
            G3_ACCESS_URL.'assets/remediation-images.js',
            ['jquery'],
            G3_ACCESS_VERSION,
            true
        );
        wp_localize_script('g3-access-remediation-images', 'G3AccessRemediation', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('g3_access_remediation'),
        ]);
    }

    public function render(): void
    {
        if (! current_user_can('upload_files')) {
            return;
        }
        ?>
        <div class="wrap g3-remediation-images">
            <h1>Images missing alt text</h1>
            <p class="description">
                Media Library images that have no <code>alt</code> attribute set.
                Saving writes the alt to the attachment — affects future insertions and any theme/block
                that pulls alt from the library. <strong>Alts hardcoded directly in post content are not
                affected</strong> — those require editing the post itself.
            </p>

            <div class="g3-rem-tabs" role="tablist">
                <button class="g3-rem-tab is-active" data-filter="missing" type="button">Missing alt</button>
                <button class="g3-rem-tab" data-filter="placeholder" type="button">Placeholder alt</button>
            </div>

            <div class="g3-rem-controls">
                <div>
                    <label>
                        <input type="search" class="g3-rem-search regular-text" placeholder="Search filename…">
                    </label>
                </div>
                <div>
                    <label>
                        <input type="checkbox" class="g3-rem-include-ignored"> Show ignored
                    </label>
                </div>
                <div>
                    <label>
                        Per page:
                        <select class="g3-rem-per-page">
                            <option value="25" selected>25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </label>
                </div>
            </div>

            <div class="g3-rem-meta" aria-live="polite"></div>
            <div class="g3-rem-list" aria-live="polite"><p class="g3-rem-empty">Loading…</p></div>
            <div class="g3-rem-pagination"></div>
            <div class="g3-rem-toast" role="status" aria-live="polite"></div>
        </div>
        <?php
    }
}
