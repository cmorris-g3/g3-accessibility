<?php

namespace G3\Access\Admin;

use G3\Access\Api\Client;
use G3\Access\Options;
use G3\Access\Support\FindingGuidance;

class ChecklistPage
{
    public const SLUG = 'g3-access-checklist';

    public function register(): void
    {
        add_action('admin_menu', [$this, 'addMenu']);
    }

    public function addMenu(): void
    {
        add_submenu_page(
            SettingsPage::SLUG,
            'G3 Access — Findings',
            'Findings',
            'edit_posts',
            self::SLUG,
            [$this, 'render']
        );
    }

    public function render(): void
    {
        if (! current_user_can('edit_posts')) {
            return;
        }

        if (! Options::activationStatus()['activated']) {
            echo '<div class="wrap"><h1>G3 Access — Findings</h1>';
            echo '<div class="notice notice-error"><p>License not activated. ';
            echo '<a href="'.esc_url(admin_url('admin.php?page='.SettingsPage::SLUG)).'">Activate now</a>.</p></div></div>';
            return;
        }

        $filters = [
            'url' => isset($_GET['url']) ? esc_url_raw(wp_unslash((string) $_GET['url'])) : '',
            'status' => isset($_GET['status']) ? sanitize_key((string) $_GET['status']) : 'open',
            'severity' => isset($_GET['severity']) ? sanitize_key((string) $_GET['severity']) : '',
            'page' => max(1, (int) ($_GET['paged'] ?? 1)),
            'per_page' => 25,
        ];

        $client = new Client();
        $response = $client->getFindings(array_filter($filters, fn ($v) => $v !== '' && $v !== null));

        $usingSnapshot = false;
        if (is_wp_error($response)) {
            $snapshot = Options::snapshot();
            if (! empty($snapshot['findings'])) {
                $response = [
                    'findings' => $snapshot['findings'],
                    'meta' => [
                        'total' => count($snapshot['findings']),
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => 1000,
                        'summary' => $snapshot['summary'] ?? [],
                    ],
                ];
                $usingSnapshot = $snapshot['fetched_at'] ?? null;
            } else {
                echo '<div class="wrap"><h1>G3 Access — Findings</h1>';
                echo '<div class="notice notice-error"><p><strong>Could not reach the dashboard:</strong> ';
                echo esc_html($response->get_error_message()).'</p></div></div>';
                return;
            }
        } else {
            Options::setSnapshot([
                'findings' => $response['findings'] ?? [],
                'summary' => $response['meta']['summary'] ?? [],
                'fetched_at' => gmdate('c'),
            ]);
        }

        $findings = $response['findings'] ?? [];
        $meta = $response['meta'] ?? [];
        $summary = $meta['summary'] ?? [];

        ?>
        <div class="wrap g3-access-checklist">
            <h1>G3 Access — Findings</h1>

            <?php if ($usingSnapshot): ?>
                <div class="notice notice-warning">
                    <p>Showing cached findings from <?php echo esc_html($usingSnapshot); ?>. Dashboard unreachable.</p>
                </div>
            <?php endif; ?>

            <p class="g3-summary">
                <span class="g3-pill g3-pill--open"><?php echo (int) ($summary['open'] ?? 0); ?> open</span>
                <span class="g3-pill g3-pill--regressed"><?php echo (int) ($summary['regressed'] ?? 0); ?> regressed</span>
                <span class="g3-pill g3-pill--resolved"><?php echo (int) ($summary['resolved'] ?? 0); ?> resolved</span>
                <span class="g3-pill g3-pill--ignored"><?php echo (int) ($summary['ignored'] ?? 0); ?> ignored</span>
            </p>

            <form method="get" class="g3-filters">
                <input type="hidden" name="page" value="<?php echo esc_attr(self::SLUG); ?>">
                <label>
                    URL filter
                    <input type="text" name="url" value="<?php echo esc_attr($filters['url']); ?>" placeholder="https://..." size="40">
                </label>
                <label>
                    Status
                    <select name="status">
                        <?php foreach (['open', 'regressed', 'resolved', 'ignored', 'all'] as $s): ?>
                            <option value="<?php echo esc_attr($s); ?>" <?php selected($filters['status'], $s); ?>>
                                <?php echo esc_html(ucfirst($s)); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <label>
                    Severity
                    <select name="severity">
                        <option value="">Any</option>
                        <?php foreach (['critical', 'serious', 'moderate', 'minor'] as $s): ?>
                            <option value="<?php echo esc_attr($s); ?>" <?php selected($filters['severity'], $s); ?>>
                                <?php echo esc_html(ucfirst($s)); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <button type="submit" class="button">Apply</button>
            </form>

            <table class="wp-list-table widefat fixed striped g3-findings-table">
                <colgroup>
                    <col class="g3-col-issue">
                    <col class="g3-col-page">
                    <col class="g3-col-severity">
                    <col class="g3-col-status">
                    <col class="g3-col-actions">
                </colgroup>
                <thead>
                    <tr>
                        <th class="column-primary">Issue</th>
                        <th>Page</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                <?php if (empty($findings)): ?>
                    <tr><td colspan="5"><em>No findings for the selected filters.</em></td></tr>
                <?php else: foreach ($findings as $f): ?>
                    <?php
                        $ctx = is_array($f['context'] ?? null) ? $f['context'] : [];
                        $target = $f['target'] ?? null;
                        $snippet = $f['snippet'] ?? ($ctx['outer_html'] ?? null);
                        $fix = $f['suggested_fix'] ?? null;
                        $fixIsUrl = is_string($fix) && preg_match('~^https?://~', $fix);
                        $contextBits = $this->contextBits($f, $ctx);
                        $ignoredReason = $f['ignored_reason'] ?? null;

                        $guidance = FindingGuidance::lookup($f['finding_type'] ?? '');
                        if (! $guidance && ! empty($ctx['axe_rule'])) {
                            $guidance = FindingGuidance::lookup((string) $ctx['axe_rule']);
                        }
                        $docUrl = $fixIsUrl ? $fix : ($ctx['help_url'] ?? null);
                    ?>
                    <tr data-finding-id="<?php echo (int) $f['id']; ?>" class="g3-row-summary">
                        <td class="column-primary">
                            <strong><?php echo esc_html($this->humanTitle($f)); ?></strong>
                            <p class="g3-rationale"><?php echo esc_html($f['rationale'] ?? ''); ?></p>
                        </td>
                        <td><code><?php echo esc_html($f['url'] ?? ''); ?></code></td>
                        <td><span class="g3-sev g3-sev--<?php echo esc_attr($f['severity'] ?? ''); ?>">
                            <?php echo esc_html($f['severity'] ?? ''); ?></span></td>
                        <td><span class="g3-pill g3-pill--<?php echo esc_attr($f['status'] ?? ''); ?>">
                            <?php echo esc_html($f['status'] ?? ''); ?></span></td>
                        <td>
                            <?php if (($f['status'] ?? '') === 'ignored'): ?>
                                <button class="button button-small g3-unignore">Unignore</button>
                            <?php else: ?>
                                <button class="button button-small g3-ignore">Ignore</button>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr class="g3-row-details" data-finding-id="<?php echo (int) $f['id']; ?>">
                        <td colspan="5">
                            <?php if (! empty($contextBits)): ?>
                                <ul class="g3-ctx">
                                    <?php foreach ($contextBits as $label => $value): ?>
                                        <li><span class="g3-ctx-label"><?php echo esc_html($label); ?>:</span>
                                            <?php if (is_string($value) && preg_match('~^https?://~', $value)): ?>
                                                <a href="<?php echo esc_url($value); ?>" target="_blank" rel="noopener"><?php echo esc_html($value); ?></a>
                                            <?php else: ?>
                                                <code><?php echo esc_html((string) $value); ?></code>
                                            <?php endif; ?>
                                        </li>
                                    <?php endforeach; ?>
                                </ul>
                            <?php endif; ?>

                            <?php if ($target): ?>
                                <p class="g3-target"><span class="g3-ctx-label">Selector:</span> <code><?php echo esc_html($target); ?></code></p>
                            <?php endif; ?>

                            <?php if ($snippet): ?>
                                <details class="g3-snippet">
                                    <summary>Show markup</summary>
                                    <pre><?php echo esc_html(mb_strimwidth($snippet, 0, 500, '…')); ?></pre>
                                </details>
                            <?php endif; ?>

                            <?php if (! empty($ctx['conflicts']) && is_array($ctx['conflicts'])): ?>
                                <div class="g3-conflicts">
                                    <strong>Other links with the same name on this page:</strong>
                                    <ul>
                                        <?php foreach ($ctx['conflicts'] as $conflict): ?>
                                            <?php if (! is_array($conflict)) continue; ?>
                                            <li>
                                                <code class="g3-conflict-target"><?php echo esc_html((string) ($conflict['target'] ?? '')); ?></code>
                                                <span class="g3-conflict-arrow">→</span>
                                                <code class="g3-conflict-href"><?php echo esc_html((string) ($conflict['href'] ?? '')); ?></code>
                                            </li>
                                        <?php endforeach; ?>
                                    </ul>
                                </div>
                            <?php endif; ?>

                            <?php if ($guidance): ?>
                                <p class="g3-why"><strong>Why it's flagged:</strong> <?php echo esc_html($guidance['why']); ?></p>
                                <?php if (! empty($guidance['fix_steps'])): ?>
                                    <div class="g3-fix">
                                        <strong>How to fix:</strong>
                                        <ol>
                                            <?php foreach ($guidance['fix_steps'] as $step): ?>
                                                <li><?php echo esc_html($step); ?></li>
                                            <?php endforeach; ?>
                                        </ol>
                                        <?php if ($docUrl): ?>
                                            <p class="g3-doc-link"><a href="<?php echo esc_url($docUrl); ?>" target="_blank" rel="noopener">Reference documentation ↗</a></p>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>

                                <?php if (! empty($guidance['note'])): ?>
                                    <p class="g3-note"><span class="g3-note-label">Heads up:</span> <?php echo esc_html($guidance['note']); ?></p>
                                <?php endif; ?>
                            <?php elseif ($fix): ?>
                                <p class="g3-fix">
                                    <strong>How to fix:</strong>
                                    <?php if ($fixIsUrl): ?>
                                        <a href="<?php echo esc_url($fix); ?>" target="_blank" rel="noopener">Reference documentation ↗</a>
                                    <?php else: ?>
                                        <?php echo esc_html($fix); ?>
                                    <?php endif; ?>
                                </p>
                            <?php endif; ?>

                            <?php if (($f['status'] ?? '') === 'ignored' && $ignoredReason): ?>
                                <p class="g3-ignored-reason"><em>Ignored: <?php echo esc_html($ignoredReason); ?></em></p>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
                </tbody>
            </table>

            <?php if (! empty($meta['last_page']) && $meta['last_page'] > 1): ?>
                <div class="tablenav"><div class="tablenav-pages">
                    <?php echo paginate_links([
                        'base' => add_query_arg('paged', '%#%'),
                        'format' => '',
                        'current' => $filters['page'],
                        'total' => (int) $meta['last_page'],
                    ]); ?>
                </div></div>
            <?php endif; ?>
        </div>
        <?php
        $this->enqueueInlineScript();
    }

    /**
     * Extract the most actionable context fields per finding type, as a label => value map.
     * Kept small and editor-friendly; raw technical context is in the snippet/selector sections.
     */
    private function contextBits(array $f, array $ctx): array
    {
        $bits = [];
        $type = $f['finding_type'] ?? '';

        // Image findings — show the image URL
        if (isset($ctx['src']) && in_array($type, ['missing-alt', 'miscategorized-decorative', 'alt-describes-appearance', 'redundant-alt'], true)) {
            $bits['Image'] = (string) $ctx['src'];
        }

        // Link findings — show the destination
        if (isset($ctx['href']) && in_array($type, ['empty-link', 'generic-link-text', 'redundant-link-text', 'label-in-name-mismatch'], true)) {
            $bits['Links to'] = (string) $ctx['href'];
        }

        // Target-size — show the measured size and name
        if ($type === 'target-below-24px') {
            if (isset($ctx['width'], $ctx['height'])) {
                $bits['Size'] = $ctx['width'].'×'.$ctx['height'].' px (need 24×24)';
            }
            if (! empty($ctx['accessible_name'])) {
                $bits['Button name'] = (string) $ctx['accessible_name'];
            }
        }

        // Contrast — foreground/background/ratio
        if (in_array($type, ['contrast-below-aa-normal', 'contrast-below-aa-large'], true)) {
            if (isset($ctx['foreground_hex'], $ctx['background_hex'])) {
                $bits['Colors'] = $ctx['foreground_hex'].' on '.($ctx['background_hex'] ?? '(unknown bg)');
            }
            if (isset($ctx['ratio'], $ctx['required'])) {
                $bits['Contrast'] = $ctx['ratio'].':1 (need '.$ctx['required'].':1)';
            }
        }

        // Heading skipped — level jump
        if ($type === 'skipped-heading-level' && isset($ctx['from'], $ctx['to'])) {
            $bits['Heading jump'] = 'h'.$ctx['from'].' → h'.$ctx['to'];
        }

        // Reduced motion — durations
        if ($type === 'motion-ignores-reduce-preference') {
            if (! empty($ctx['animation_name'])) {
                $bits['Animation'] = (string) $ctx['animation_name'];
            }
            if (! empty($ctx['animation_duration_s'])) {
                $bits['Duration'] = $ctx['animation_duration_s'].'s';
            }
        }

        // Sensory language — the phrase
        if ($type === 'sensory-language-candidate' && ! empty($ctx['matched'])) {
            $bits['Matched phrase'] = '"'.$ctx['matched'].'"';
        }

        // axe findings — rule ID + help URL
        if (! empty($ctx['axe_rule'])) {
            $bits['axe rule'] = (string) $ctx['axe_rule'];
        }

        return $bits;
    }

    private function humanTitle(array $f): string
    {
        $type = $f['finding_type'] ?? 'unknown';
        $map = [
            // Rubric findings
            'missing-alt' => 'Image missing alt text',
            'alt-describes-appearance' => 'Alt text describes appearance (likely decorative)',
            'redundant-alt' => 'Redundant alt text',
            'miscategorized-decorative' => 'Decorative image wraps a link without other text',
            'empty-link' => 'Link has no accessible name',
            'generic-link-text' => 'Generic link text',
            'redundant-link-text' => 'Duplicate link text points to different destinations',
            'label-in-name-mismatch' => 'aria-label does not contain visible text',

            // Heading / structure
            'no-h1' => 'Page has no h1',
            'multiple-h1' => 'Page has multiple h1s',
            'skipped-heading-level' => 'Heading level skipped',
            'empty-heading' => 'Empty heading',

            // Contrast / layout
            'contrast-below-aa-normal' => 'Low contrast (normal text)',
            'contrast-below-aa-large' => 'Low contrast (large text)',
            'target-below-24px' => 'Touch target below 24×24px',
            'horizontal-scroll-at-400-zoom' => 'Horizontal scroll at 400% zoom',
            'content-clipped-at-400-zoom' => 'Content clipped at narrow viewport',
            'text-spacing-content-loss' => 'Text-spacing override causes clipping',
            'text-spacing-not-responsive' => 'Page does not respond to text-spacing overrides',
            'motion-ignores-reduce-preference' => 'Animation ignores prefers-reduced-motion',

            // Keyboard / focus
            'keyboard-trap' => 'Keyboard trap',
            'invisible-focus-indicator' => 'Invisible focus indicator',
            'focus-obscured' => 'Focus lands off-screen',
            'keyboard-walk-inconclusive' => 'Keyboard walk inconclusive',

            // Content / consistency
            'sensory-language-candidate' => 'Sensory-only instruction detected',
            'missing-skip-link' => 'Missing skip link',
            'inconsistent-navigation' => 'Inconsistent navigation across pages',
            'inconsistent-help' => 'Inconsistent help mechanism across pages',

            // axe-core rule IDs (emitted verbatim by the scanner's axe probe)
            'image-alt' => 'Image missing alt text',
            'image-redundant-alt' => 'Image alt text redundant with adjacent text',
            'link-name' => 'Link has no accessible name',
            'button-name' => 'Button has no accessible name',
            'input-button-name' => 'Input button has no accessible name',
            'label' => 'Form control has no label',
            'label-title-only' => 'Form control labelled only by title attribute',
            'form-field-multiple-labels' => 'Form control has multiple labels',
            'select-name' => 'Select element has no accessible name',
            'html-has-lang' => 'Page missing html lang attribute',
            'html-lang-valid' => 'html lang attribute is invalid',
            'html-xml-lang-mismatch' => 'html lang and xml:lang do not match',
            'valid-lang' => 'lang attribute value is invalid',
            'document-title' => 'Document has no title',
            'bypass' => 'No mechanism to bypass blocks of content',
            'heading-order' => 'Heading levels are out of order',
            'page-has-heading-one' => 'Page has no level-one heading',
            'empty-heading' => 'Heading has no text content',
            'landmark-one-main' => 'Page has no or multiple main landmarks',
            'landmark-unique' => 'Landmarks are not uniquely identifiable',
            'region' => 'Content not contained by a landmark',
            'skip-link' => 'Skip link target does not exist',
            'list' => 'List structure is invalid',
            'listitem' => 'List item is not contained in a list',
            'dlitem' => 'Definition list item is not inside a dl',
            'definition-list' => 'Definition list structure is invalid',
            'table-fake-caption' => 'Data table has fake caption',
            'td-headers-attr' => 'Data cell headers attribute is invalid',
            'th-has-data-cells' => 'Table header has no associated data cells',
            'scope-attr-valid' => 'scope attribute value is invalid',
            'duplicate-id' => 'Element has duplicate id',
            'duplicate-id-active' => 'Active element has duplicate id',
            'duplicate-id-aria' => 'Element referenced by ARIA has duplicate id',
            'frame-title' => 'iframe has no title',
            'frame-title-unique' => 'iframe title is not unique',
            'iframe-no-src' => 'iframe has no src attribute',
            'meta-refresh' => 'Page uses meta refresh',
            'meta-viewport' => 'Viewport meta prevents zoom',
            'aria-allowed-attr' => 'ARIA attribute not allowed on this role',
            'aria-allowed-role' => 'ARIA role not allowed on this element',
            'aria-hidden-body' => 'aria-hidden applied to body',
            'aria-hidden-focus' => 'aria-hidden element contains focusable content',
            'aria-input-field-name' => 'ARIA input has no accessible name',
            'aria-required-attr' => 'ARIA role missing required attribute',
            'aria-required-children' => 'ARIA role missing required children',
            'aria-required-parent' => 'ARIA role missing required parent',
            'aria-roles' => 'ARIA role is invalid',
            'aria-toggle-field-name' => 'ARIA toggle has no accessible name',
            'aria-tooltip-name' => 'ARIA tooltip has no accessible name',
            'aria-valid-attr' => 'ARIA attribute is invalid',
            'aria-valid-attr-value' => 'ARIA attribute value is invalid',
            'aria-command-name' => 'ARIA command has no accessible name',
            'aria-dialog-name' => 'ARIA dialog has no accessible name',
            'aria-meter-name' => 'ARIA meter has no accessible name',
            'aria-progressbar-name' => 'ARIA progressbar has no accessible name',
            'aria-treeitem-name' => 'ARIA treeitem has no accessible name',
            'aria-text' => 'Element with aria-text has improper structure',
            'nested-interactive' => 'Interactive controls are nested',
            'color-contrast' => 'Low contrast text',
            'color-contrast-enhanced' => 'Low contrast (AAA)',
            'link-in-text-block' => 'Link not distinguishable from surrounding text',
            'autocomplete-valid' => 'autocomplete value is invalid',
            'presentation-role-conflict' => 'Element with role="presentation" has focusable children or ARIA',
            'role-img-alt' => 'Element with role="img" has no accessible name',
            'svg-img-alt' => 'SVG treated as image has no accessible name',
            'server-side-image-map' => 'Server-side image map used',
            'object-alt' => 'object element has no alternative text',
            'area-alt' => 'area element has no alt text',
            'video-caption' => 'Video has no caption track',
            'audio-caption' => 'Audio has no caption track',
            'blink' => 'blink element is used',
            'marquee' => 'marquee element is used',
        ];
        return $map[$type] ?? ucwords(str_replace(['-', '_'], ' ', $type));
    }

    private function enqueueInlineScript(): void
    {
        $nonce = wp_create_nonce('g3_access_scan');
        $ajaxUrl = admin_url('admin-ajax.php');
        ?>
        <script>
        (function ($) {
            $(document).on('click', '.g3-ignore', function () {
                var row = $(this).closest('tr');
                var id = row.data('findingId');
                var reason = window.prompt('Reason (optional):', '');
                $.post(<?php echo wp_json_encode($ajaxUrl); ?>, {
                    action: 'g3_access_ignore_finding',
                    nonce: <?php echo wp_json_encode($nonce); ?>,
                    finding_id: id,
                    reason: reason || ''
                }).done(function (r) {
                    if (r.success) window.location.reload();
                    else window.alert(r.data && r.data.message ? r.data.message : 'Ignore failed');
                });
            });
            $(document).on('click', '.g3-unignore', function () {
                var row = $(this).closest('tr');
                var id = row.data('findingId');
                $.post(<?php echo wp_json_encode($ajaxUrl); ?>, {
                    action: 'g3_access_unignore_finding',
                    nonce: <?php echo wp_json_encode($nonce); ?>,
                    finding_id: id
                }).done(function (r) {
                    if (r.success) window.location.reload();
                    else window.alert(r.data && r.data.message ? r.data.message : 'Unignore failed');
                });
            });
        })(jQuery);
        </script>
        <?php
    }
}
