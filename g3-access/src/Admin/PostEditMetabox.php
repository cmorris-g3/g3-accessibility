<?php

namespace G3\Access\Admin;

use G3\Access\Api\Client;
use G3\Access\Options;

class PostEditMetabox
{
    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'addMetaBox']);
    }

    public function addMetaBox(): void
    {
        if (! Options::activationStatus()['activated']) {
            return;
        }
        $screens = get_post_types(['public' => true]);
        foreach ($screens as $screen) {
            add_meta_box(
                'g3-access-metabox',
                'Accessibility (G3 Access)',
                [$this, 'render'],
                $screen,
                'side',
                'default'
            );
        }
    }

    public function render(\WP_Post $post): void
    {
        $permalink = get_permalink($post);
        if (! $permalink) {
            echo '<p><em>Publish the post to enable scanning.</em></p>';
            return;
        }

        echo '<p><strong>Page:</strong><br><code style="word-break:break-all;">'.esc_html($permalink).'</code></p>';

        $client = new Client();
        $response = $client->getFindings(['url' => $permalink, 'status' => 'all', 'per_page' => 100]);

        if (is_wp_error($response)) {
            echo '<p><em>Dashboard unreachable. Try later or refresh.</em></p>';
            return;
        }

        $findings = $response['findings'] ?? [];
        $byStatus = ['open' => 0, 'regressed' => 0, 'resolved' => 0, 'ignored' => 0];
        foreach ($findings as $f) {
            $s = $f['status'] ?? 'open';
            if (isset($byStatus[$s])) {
                $byStatus[$s]++;
            }
        }

        $checklistUrl = admin_url('admin.php?page='.ChecklistPage::SLUG.'&url='.urlencode($permalink));

        ?>
        <ul class="g3-mb-counts">
            <li><span class="g3-pill g3-pill--open"><?php echo $byStatus['open']; ?></span> open</li>
            <li><span class="g3-pill g3-pill--regressed"><?php echo $byStatus['regressed']; ?></span> regressed</li>
            <li><span class="g3-pill g3-pill--resolved"><?php echo $byStatus['resolved']; ?></span> resolved</li>
            <li><span class="g3-pill g3-pill--ignored"><?php echo $byStatus['ignored']; ?></span> ignored</li>
        </ul>

        <p>
            <button type="button" class="button g3-mb-rescan"
                data-url="<?php echo esc_attr($permalink); ?>"
                data-nonce="<?php echo esc_attr(wp_create_nonce('g3_access_scan')); ?>"
                data-ajax="<?php echo esc_attr(admin_url('admin-ajax.php')); ?>">
                Rescan this page
            </button>
            <span class="g3-mb-rescan-status" aria-live="polite"></span>
        </p>
        <p>
            <a href="<?php echo esc_url($checklistUrl); ?>">View in checklist →</a>
        </p>
        <script>
        (function ($) {
            $(document).on('click', '.g3-mb-rescan', function () {
                var btn = $(this);
                var status = btn.siblings('.g3-mb-rescan-status');
                btn.prop('disabled', true);
                status.text(' scanning…');

                $.post(btn.data('ajax'), {
                    action: 'g3_access_scan',
                    nonce: btn.data('nonce'),
                    url: btn.data('url')
                }).done(function (r) {
                    if (!r.success) {
                        btn.prop('disabled', false);
                        status.text(' ' + (r.data && r.data.message ? r.data.message : 'failed'));
                        return;
                    }
                    var scanId = r.data.scan.id;
                    var poll = function () {
                        $.get(btn.data('ajax'), {
                            action: 'g3_access_poll_scan',
                            nonce: btn.data('nonce'),
                            scan_id: scanId
                        }).done(function (p) {
                            if (!p.success) {
                                btn.prop('disabled', false);
                                status.text(' poll error');
                                return;
                            }
                            var scan = p.data.scan;
                            if (scan.status === 'complete') {
                                status.text(' complete — ' + scan.findings_total + ' findings');
                                setTimeout(function () { window.location.reload(); }, 800);
                            } else if (scan.status === 'failed') {
                                btn.prop('disabled', false);
                                status.text(' scan failed');
                            } else {
                                setTimeout(poll, 3000);
                            }
                        }).fail(function () {
                            btn.prop('disabled', false);
                            status.text(' unreachable');
                        });
                    };
                    setTimeout(poll, 2000);
                }).fail(function () {
                    btn.prop('disabled', false);
                    status.text(' unreachable');
                });
            });
        })(jQuery);
        </script>
        <?php
    }
}
