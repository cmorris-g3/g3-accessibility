<?php

namespace G3\Access\Ajax;

use WP_Post;
use WP_Query;

class RemediationHandlers
{
    public const IGNORED_META_KEY = '_g3_access_ignored';

    /** Generic link texts that should never describe a destination, mirrored from the scanner's rubric. */
    private const GENERIC_LINK_TEXTS = [
        'click here', 'here', 'click', 'read more', 'more', 'learn more',
        'learn', 'details', 'info', 'information', 'link', 'this link', 'this',
        'go', 'continue', 'next', 'see more', 'view more', 'view',
        'find out more', 'find out',
    ];

    /** Regex matching alt text that describes the image's appearance rather than content. */
    private const PLACEHOLDER_ALT_REGEX = '^(spinner|loader|loading|icon|image|photo|picture|graphic|chart|figure|divider|decoration|accent|ornament|spacer|decorative)([[:space:]:_\-]|$)';

    public function register(): void
    {
        add_action('wp_ajax_g3_access_remediation_list_images', [$this, 'listImages']);
        add_action('wp_ajax_g3_access_remediation_save_alt', [$this, 'saveAlt']);
        add_action('wp_ajax_g3_access_remediation_mark_decorative', [$this, 'markDecorative']);
        add_action('wp_ajax_g3_access_remediation_skip', [$this, 'skip']);
        add_action('wp_ajax_g3_access_remediation_unskip', [$this, 'unskip']);

        add_action('wp_ajax_g3_access_remediation_list_menu_items', [$this, 'listMenuItems']);
        add_action('wp_ajax_g3_access_remediation_save_menu_label', [$this, 'saveMenuLabel']);
        add_action('wp_ajax_g3_access_remediation_skip_menu_item', [$this, 'skipMenuItem']);
        add_action('wp_ajax_g3_access_remediation_unskip_menu_item', [$this, 'unskipMenuItem']);
    }

    public function listImages(): void
    {
        $this->authorize();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($_GET['per_page'] ?? 25)));
        $search = isset($_GET['search']) ? sanitize_text_field(wp_unslash((string) $_GET['search'])) : '';
        $includeIgnored = isset($_GET['include_ignored']) && $_GET['include_ignored'] === '1';

        $filter = isset($_GET['filter']) ? sanitize_key((string) $_GET['filter']) : 'missing';

        if ($filter === 'placeholder') {
            $metaQuery = [
                'relation' => 'AND',
                [
                    'key' => '_wp_attachment_image_alt',
                    'value' => self::PLACEHOLDER_ALT_REGEX,
                    'compare' => 'REGEXP',
                ],
            ];
        } else {
            $filter = 'missing';
            $metaQuery = [
                'relation' => 'AND',
                [
                    'relation' => 'OR',
                    ['key' => '_wp_attachment_image_alt', 'compare' => 'NOT EXISTS'],
                    ['key' => '_wp_attachment_image_alt', 'value' => '', 'compare' => '='],
                ],
            ];
        }

        if (! $includeIgnored) {
            $metaQuery[] = ['key' => self::IGNORED_META_KEY, 'compare' => 'NOT EXISTS'];
        }

        $args = [
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => $perPage,
            'paged' => $page,
            'orderby' => 'date',
            'order' => 'DESC',
            'meta_query' => $metaQuery,
        ];
        if ($search !== '') {
            $args['s'] = $search;
        }

        $q = new WP_Query($args);

        $items = [];
        foreach ($q->posts as $att) {
            $items[] = $this->serializeAttachment($att);
        }

        wp_send_json_success([
            'items' => $items,
            'meta' => [
                'total' => (int) $q->found_posts,
                'page' => $page,
                'last_page' => max(1, (int) $q->max_num_pages),
                'per_page' => $perPage,
                'include_ignored' => $includeIgnored,
                'search' => $search,
                'filter' => $filter,
                'counts' => $this->imageFilterCounts($includeIgnored),
            ],
        ]);
    }

    /** Compute counts for each image filter so the UI can show "Missing (263) / Placeholder (12)". */
    private function imageFilterCounts(bool $includeIgnored): array
    {
        $baseMetaQueryWithoutAlt = $includeIgnored
            ? []
            : [['key' => self::IGNORED_META_KEY, 'compare' => 'NOT EXISTS']];

        $missingQ = new WP_Query([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => 1,
            'fields' => 'ids',
            'no_found_rows' => false,
            'meta_query' => array_merge([
                'relation' => 'AND',
                [
                    'relation' => 'OR',
                    ['key' => '_wp_attachment_image_alt', 'compare' => 'NOT EXISTS'],
                    ['key' => '_wp_attachment_image_alt', 'value' => '', 'compare' => '='],
                ],
            ], $baseMetaQueryWithoutAlt),
        ]);

        $placeholderQ = new WP_Query([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => 1,
            'fields' => 'ids',
            'no_found_rows' => false,
            'meta_query' => array_merge([
                'relation' => 'AND',
                [
                    'key' => '_wp_attachment_image_alt',
                    'value' => self::PLACEHOLDER_ALT_REGEX,
                    'compare' => 'REGEXP',
                ],
            ], $baseMetaQueryWithoutAlt),
        ]);

        return [
            'missing' => (int) $missingQ->found_posts,
            'placeholder' => (int) $placeholderQ->found_posts,
        ];
    }

    // ──────────────────────────────────────────────────────────────
    // Nav menu item remediation
    // ──────────────────────────────────────────────────────────────

    public function listMenuItems(): void
    {
        $this->authorize();

        $filter = isset($_GET['filter']) ? sanitize_key((string) $_GET['filter']) : 'flagged';
        $includeIgnored = isset($_GET['include_ignored']) && $_GET['include_ignored'] === '1';
        $search = isset($_GET['search']) ? sanitize_text_field(wp_unslash((string) $_GET['search'])) : '';

        $menus = wp_get_nav_menus();
        $usageByMenu = $this->buildMenuUsageMap($menus);
        $all = [];
        foreach ($menus as $menu) {
            $items = wp_get_nav_menu_items($menu->term_id) ?: [];
            $usage = $usageByMenu[$menu->term_id] ?? [];
            foreach ($items as $item) {
                $all[] = $this->serializeMenuItem($item, $menu, $usage);
            }
        }

        // Flag duplicates: same normalized label → different normalized URL
        $byLabel = [];
        foreach ($all as &$row) {
            $key = strtolower(trim((string) ($row['label'] ?? '')));
            if ($key === '') {
                continue;
            }
            $byLabel[$key][] = $row['id'];
        }
        unset($row);

        foreach ($all as &$row) {
            $labelKey = strtolower(trim((string) $row['label']));
            $peerIds = $byLabel[$labelKey] ?? [];
            $peers = array_values(array_filter($all, fn ($p) => in_array($p['id'], $peerIds, true) && $p['id'] !== $row['id']));
            $thisHref = $this->normalizeHref((string) $row['url']);
            $conflicts = [];
            foreach ($peers as $peer) {
                $peerHref = $this->normalizeHref((string) $peer['url']);
                if ($peerHref !== $thisHref) {
                    $conflicts[] = [
                        'id' => $peer['id'],
                        'label' => $peer['label'],
                        'url' => $peer['url'],
                        'menu_name' => $peer['menu_name'],
                    ];
                }
            }
            if (count($conflicts) > 0) {
                $row['flags'][] = 'duplicate';
                $row['conflicts'] = array_slice($conflicts, 0, 3);
            }
        }
        unset($row);

        // Filter + search + ignore
        $filtered = array_values(array_filter($all, function ($row) use ($filter, $includeIgnored, $search) {
            if (! $includeIgnored && $row['ignored']) {
                return false;
            }
            if ($filter === 'flagged' && count($row['flags']) === 0 && ! $row['ignored']) {
                return false;
            }
            if ($search !== '') {
                $needle = strtolower($search);
                $haystack = strtolower(($row['label'] ?? '') . ' ' . ($row['url'] ?? ''));
                if (strpos($haystack, $needle) === false) {
                    return false;
                }
            }
            return true;
        }));

        // Counts
        $counts = [
            'flagged' => count(array_filter($all, fn ($r) => count($r['flags']) > 0 && ! $r['ignored'])),
            'all' => count(array_filter($all, fn ($r) => ! $r['ignored'])),
        ];

        wp_send_json_success([
            'items' => $filtered,
            'meta' => [
                'total' => count($filtered),
                'filter' => $filter,
                'include_ignored' => $includeIgnored,
                'search' => $search,
                'counts' => $counts,
            ],
        ]);
    }

    public function saveMenuLabel(): void
    {
        $this->authorize();
        $id = (int) ($_POST['menu_item_id'] ?? 0);
        $label = isset($_POST['label']) ? sanitize_text_field(wp_unslash((string) $_POST['label'])) : '';

        if ($id <= 0 || ! current_user_can('edit_theme_options')) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        $post = get_post($id);
        if (! $post || $post->post_type !== 'nav_menu_item') {
            wp_send_json_error(['code' => 'NOT_FOUND'], 404);
        }
        if ($label === '') {
            wp_send_json_error(['code' => 'EMPTY_LABEL', 'message' => 'Label cannot be empty.'], 422);
        }

        wp_update_post([
            'ID' => $id,
            'post_title' => $label,
        ]);
        delete_post_meta($id, self::IGNORED_META_KEY);

        wp_send_json_success(['id' => $id, 'label' => $label]);
    }

    public function skipMenuItem(): void
    {
        $this->authorize();
        $id = (int) ($_POST['menu_item_id'] ?? 0);
        if ($id <= 0 || ! current_user_can('edit_theme_options')) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        $post = get_post($id);
        if (! $post || $post->post_type !== 'nav_menu_item') {
            wp_send_json_error(['code' => 'NOT_FOUND'], 404);
        }

        update_post_meta($id, self::IGNORED_META_KEY, 1);

        wp_send_json_success(['id' => $id]);
    }

    public function unskipMenuItem(): void
    {
        $this->authorize();
        $id = (int) ($_POST['menu_item_id'] ?? 0);
        if ($id <= 0 || ! current_user_can('edit_theme_options')) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        $post = get_post($id);
        if (! $post || $post->post_type !== 'nav_menu_item') {
            wp_send_json_error(['code' => 'NOT_FOUND'], 404);
        }

        delete_post_meta($id, self::IGNORED_META_KEY);

        wp_send_json_success(['id' => $id]);
    }

    /**
     * Build a map of term_id → list of places each menu is rendered (theme locations + widget sidebars).
     * Returned shape: [term_id => [['type' => 'location'|'widget', 'label' => '...', 'key' => '...'], ...]]
     */
    private function buildMenuUsageMap(array $menus): array
    {
        $map = [];
        foreach ($menus as $menu) {
            $map[(int) $menu->term_id] = [];
        }

        // Theme locations: get_nav_menu_locations() → [location_slug => term_id]
        $locations = get_nav_menu_locations();
        $registered = function_exists('get_registered_nav_menus') ? get_registered_nav_menus() : [];
        foreach ($locations as $slug => $termId) {
            $termId = (int) $termId;
            if (! isset($map[$termId])) {
                continue;
            }
            $label = (string) ($registered[$slug] ?? $slug);
            $map[$termId][] = ['type' => 'location', 'label' => $label, 'key' => (string) $slug];
        }

        // Widget sidebars: walk registered sidebars + sidebars_widgets + widget_nav_menu option.
        $sidebarsWidgets = get_option('sidebars_widgets');
        $widgetNavMenu = get_option('widget_nav_menu');
        if (is_array($sidebarsWidgets) && is_array($widgetNavMenu)) {
            global $wp_registered_sidebars;
            foreach ($sidebarsWidgets as $sidebarId => $widgetIds) {
                if ($sidebarId === 'wp_inactive_widgets' || ! is_array($widgetIds)) {
                    continue;
                }
                foreach ($widgetIds as $widgetId) {
                    if (! is_string($widgetId) || strpos($widgetId, 'nav_menu-') !== 0) {
                        continue;
                    }
                    $instanceId = (int) substr($widgetId, strlen('nav_menu-'));
                    $navMenuId = (int) ($widgetNavMenu[$instanceId]['nav_menu'] ?? 0);
                    if ($navMenuId <= 0 || ! isset($map[$navMenuId])) {
                        continue;
                    }
                    $label = isset($wp_registered_sidebars[$sidebarId]['name'])
                        ? (string) $wp_registered_sidebars[$sidebarId]['name']
                        : (string) $sidebarId;
                    $map[$navMenuId][] = ['type' => 'widget', 'label' => $label, 'key' => (string) $sidebarId];
                }
            }
        }

        return $map;
    }

    private function serializeMenuItem($item, $menu, array $usage = []): array
    {
        $label = (string) ($item->title ?? '');
        $url = (string) ($item->url ?? '');
        $normalizedLabel = strtolower(trim($label));

        $flags = [];
        if (trim($label) === '') {
            $flags[] = 'empty';
        }
        if ($normalizedLabel !== '' && in_array($normalizedLabel, self::GENERIC_LINK_TEXTS, true)) {
            $flags[] = 'generic';
        }

        return [
            'id' => (int) $item->ID,
            'label' => $label,
            'stored_title' => (string) get_post_field('post_title', $item->ID),
            'url' => $url,
            'type' => (string) ($item->type ?? ''),
            'type_label' => (string) ($item->type_label ?? ''),
            'menu_id' => (int) $menu->term_id,
            'menu_name' => wp_specialchars_decode((string) $menu->name, ENT_QUOTES),
            'edit_url' => admin_url('nav-menus.php?action=edit&menu=' . (int) $menu->term_id),
            'menu_usage' => $usage,
            'flags' => $flags,
            'conflicts' => [],
            'ignored' => (bool) get_post_meta($item->ID, self::IGNORED_META_KEY, true),
        ];
    }

    private function normalizeHref(string $href): string
    {
        if ($href === '') {
            return '';
        }
        $parts = parse_url($href);
        if (! $parts) {
            return $href;
        }
        $host = isset($parts['host']) ? preg_replace('~^www\.~i', '', strtolower($parts['host'])) : '';
        $path = $parts['path'] ?? '/';
        $path = rtrim($path, '/');
        if ($path === '') {
            $path = '/';
        }
        return $host.$path;
    }

    public function saveAlt(): void
    {
        $this->authorize();
        $id = (int) ($_POST['attachment_id'] ?? 0);
        if (! $this->canEditAttachment($id)) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        $alt = isset($_POST['alt']) ? sanitize_text_field(wp_unslash((string) $_POST['alt'])) : '';

        update_post_meta($id, '_wp_attachment_image_alt', $alt);
        delete_post_meta($id, self::IGNORED_META_KEY);

        wp_send_json_success(['id' => $id, 'alt' => $alt]);
    }

    public function markDecorative(): void
    {
        $this->authorize();
        $id = (int) ($_POST['attachment_id'] ?? 0);
        if (! $this->canEditAttachment($id)) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }

        update_post_meta($id, '_wp_attachment_image_alt', '');
        update_post_meta($id, self::IGNORED_META_KEY, 1);

        wp_send_json_success(['id' => $id]);
    }

    public function skip(): void
    {
        $this->authorize();
        $id = (int) ($_POST['attachment_id'] ?? 0);
        if (! $this->canEditAttachment($id)) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }

        update_post_meta($id, self::IGNORED_META_KEY, 1);

        wp_send_json_success(['id' => $id]);
    }

    public function unskip(): void
    {
        $this->authorize();
        $id = (int) ($_POST['attachment_id'] ?? 0);
        if (! $this->canEditAttachment($id)) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }

        delete_post_meta($id, self::IGNORED_META_KEY);

        wp_send_json_success(['id' => $id]);
    }

    private function serializeAttachment(WP_Post $att): array
    {
        $thumb = wp_get_attachment_image_src($att->ID, 'thumbnail');
        $full = wp_get_attachment_image_src($att->ID, 'full');
        $meta = wp_get_attachment_metadata($att->ID) ?: [];
        $alt = (string) get_post_meta($att->ID, '_wp_attachment_image_alt', true);
        $ignored = (bool) get_post_meta($att->ID, self::IGNORED_META_KEY, true);

        $usedOn = null;
        if ($att->post_parent > 0) {
            $parent = get_post($att->post_parent);
            if ($parent && $parent->post_status !== 'trash') {
                $usedOn = [
                    'id' => $parent->ID,
                    'title' => $parent->post_title ?: '(no title)',
                    'type' => get_post_type($parent),
                    'edit_url' => get_edit_post_link($parent->ID, 'raw'),
                    'view_url' => $parent->post_status === 'publish' ? get_permalink($parent->ID) : null,
                ];
            }
        }

        $url = wp_get_attachment_url($att->ID);

        return [
            'id' => $att->ID,
            'thumbnail' => $thumb[0] ?? null,
            'full' => $full[0] ?? null,
            'filename' => $url ? basename($url) : ($att->post_title ?: 'image'),
            'dimensions' => isset($meta['width'], $meta['height']) ? "{$meta['width']}×{$meta['height']}" : null,
            'uploaded_human' => human_time_diff(strtotime($att->post_date), current_time('timestamp')).' ago',
            'alt' => $alt,
            'used_on' => $usedOn,
            'ignored' => $ignored,
            'media_edit_url' => get_edit_post_link($att->ID, 'raw'),
        ];
    }

    private function authorize(): void
    {
        if (! current_user_can('upload_files')) {
            wp_send_json_error(['code' => 'FORBIDDEN'], 403);
        }
        check_ajax_referer('g3_access_remediation', 'nonce');
    }

    private function canEditAttachment(int $id): bool
    {
        if ($id <= 0) {
            return false;
        }
        $post = get_post($id);
        if (! $post || $post->post_type !== 'attachment') {
            return false;
        }
        return current_user_can('edit_post', $id);
    }
}
