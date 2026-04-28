(function ($) {
    'use strict';

    if (typeof G3AccessRemediation === 'undefined') {
        return;
    }

    var state = {
        filter: 'flagged',
        search: '',
        includeIgnored: false,
        total: 0,
        counts: { flagged: 0, all: 0 },
        loading: false
    };

    var $list = $('.g3-rem-list');
    var $meta = $('.g3-rem-meta');
    var $toast = $('.g3-rem-toast');
    var $search = $('.g3-rem-search');
    var $includeIgnored = $('.g3-rem-include-ignored');
    var $tabs = $('.g3-rem-tabs .g3-rem-tab');

    var searchDebounce = null;

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function flagBadge(flag) {
        var label = { generic: 'Generic', duplicate: 'Duplicate', empty: 'Empty' }[flag] || flag;
        return '<span class="g3-rem-flag g3-rem-flag--' + escapeHtml(flag) + '">' + escapeHtml(label) + '</span>';
    }

    function renderConflicts(conflicts) {
        if (!conflicts || !conflicts.length) return '';
        var items = conflicts.map(function (c) {
            return '<li>"<strong>' + escapeHtml(c.label) + '</strong>" in <em>' + escapeHtml(c.menu_name) + '</em> → <code>' + escapeHtml(c.url) + '</code></li>';
        }).join('');
        var hint =
            '<p class="g3-rem-menu-conflict-hint">' +
                '<strong>Two ways to fix this:</strong> ' +
                '(1) Rename one of the labels to describe its destination (e.g., "Latest news" vs "News archive"), or ' +
                '(2) If both should go to the same page, update the URLs so every "' + escapeHtml(conflicts[0].label || '') + '" link points to the same destination.' +
            '</p>';
        return '<div class="g3-rem-menu-conflicts">Other menu items share this label but link elsewhere:<ul>' + items + '</ul>' + hint + '</div>';
    }

    function renderMenuUsage(usage) {
        if (!usage || !usage.length) {
            return '<span class="g3-rem-menu-usage-none">not currently displayed anywhere</span>';
        }
        var chips = usage.map(function (u) {
            var typeClass = u.type === 'widget' ? 'g3-rem-menu-usage--widget' : 'g3-rem-menu-usage--location';
            var prefix = u.type === 'widget' ? 'Widget · ' : 'Location · ';
            return '<span class="g3-rem-menu-usage ' + typeClass + '">' + escapeHtml(prefix) + escapeHtml(u.label) + '</span>';
        }).join('');
        return '<div class="g3-rem-menu-usage-list">' + chips + '</div>';
    }

    function renderRow(item) {
        var actions = item.ignored
            ? '<button type="button" class="button g3-rem-menu-unskip">Show again</button>'
            : (
                '<button type="button" class="button button-primary g3-rem-menu-save">Save label</button>' +
                '<button type="button" class="button-link g3-rem-menu-skip">Skip for now</button>'
              );

        var typeLabel = item.type_label || item.type || '';

        var flagsHtml = (item.flags || []).map(flagBadge).join('');
        if (!flagsHtml) {
            flagsHtml = '<span style="font-size:11px;color:#8c8f94;">no issues</span>';
        }

        return (
            '<div class="g3-rem-menu-row' + (item.ignored ? ' g3-rem-row--ignored' : '') + '" data-id="' + item.id + '">' +
                '<div class="g3-rem-menu-label">' +
                    '<label for="g3-rem-menu-label-' + item.id + '">Label</label>' +
                    '<input type="text" id="g3-rem-menu-label-' + item.id + '" class="g3-rem-menu-label-input" value="' + escapeHtml(item.stored_title || item.label) + '" placeholder="Describe the destination">' +
                '</div>' +
                '<div class="g3-rem-menu-url">' +
                    (item.url ? '<span class="g3-rem-menu-url-value">' + escapeHtml(item.url) + '</span>' : '<em>no url</em>') +
                    (typeLabel ? '<span class="g3-rem-menu-url-type">' + escapeHtml(typeLabel) + '</span>' : '') +
                '</div>' +
                '<div class="g3-rem-menu-meta">' +
                    '<strong>' + escapeHtml(item.menu_name) + '</strong>' +
                    renderMenuUsage(item.menu_usage) +
                    '<a class="g3-rem-menu-edit-link" href="' + escapeHtml(item.edit_url) + '" target="_blank" rel="noopener">Open in nav menu editor ↗</a>' +
                '</div>' +
                '<div class="g3-rem-menu-flags">' + flagsHtml + '</div>' +
                '<div class="g3-rem-menu-actions">' + actions + '</div>' +
                renderConflicts(item.conflicts) +
                '<div class="g3-rem-menu-status"></div>' +
            '</div>'
        );
    }

    function renderList(items) {
        if (!items.length) {
            if (state.filter === 'flagged') {
                $list.html('<p class="g3-rem-empty">No menu items need attention — everything looks good.</p>');
            } else {
                $list.html('<p class="g3-rem-empty">No menu items match the current filters.</p>');
            }
            return;
        }
        $list.html(items.map(renderRow).join(''));
    }

    function renderTabs() {
        $tabs.each(function () {
            var f = $(this).data('filter');
            $(this).toggleClass('is-active', f === state.filter);
            var count = state.counts[f];
            var label = f === 'flagged' ? 'Needs attention' : 'All menu items';
            $(this).text(label + (count != null ? ' (' + count + ')' : ''));
        });
    }

    function renderMeta() {
        var ignoredSuffix = state.includeIgnored ? ' (including ignored)' : '';
        var scope = state.filter === 'flagged' ? 'flagged' : 'total';
        $meta.text(state.total + ' menu item' + (state.total === 1 ? '' : 's') + ' ' + scope + ignoredSuffix);
    }

    function fetchList() {
        if (state.loading) return;
        state.loading = true;

        $.ajax({
            url: G3AccessRemediation.ajaxUrl,
            method: 'GET',
            data: {
                action: 'g3_access_remediation_list_menu_items',
                nonce: G3AccessRemediation.nonce,
                filter: state.filter,
                search: state.search,
                include_ignored: state.includeIgnored ? '1' : '0'
            },
            dataType: 'json'
        }).done(function (resp) {
            if (!resp.success) {
                $list.html('<p class="g3-rem-empty">Failed to load menu items.</p>');
                return;
            }
            state.total = resp.data.meta.total;
            state.counts = resp.data.meta.counts || { flagged: 0, all: 0 };
            renderList(resp.data.items);
            renderMeta();
            renderTabs();
        }).fail(function () {
            $list.html('<p class="g3-rem-empty">Request failed. Please reload.</p>');
        }).always(function () {
            state.loading = false;
        });
    }

    function toast(message, isError) {
        $toast.text(message).toggleClass('is-error', !!isError).addClass('is-visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function () { $toast.removeClass('is-visible'); }, 2400);
    }

    function setRowStatus($row, text, kind) {
        var $status = $row.find('.g3-rem-menu-status');
        $status.removeClass('is-ok is-error');
        if (kind) $status.addClass(kind);
        $status.text(text || '');
    }

    function removeRow($row, message) {
        $row.addClass('g3-rem-row--removing');
        setTimeout(function () {
            $row.remove();
            state.total = Math.max(0, state.total - 1);
            renderMeta();
            if ($list.children('.g3-rem-menu-row').length === 0) {
                fetchList();
            }
        }, 300);
        if (message) toast(message);
    }

    $(document).on('click', '.g3-rem-menu-save', function () {
        var $row = $(this).closest('.g3-rem-menu-row');
        var id = $row.data('id');
        var label = $row.find('.g3-rem-menu-label-input').val().trim();

        if (label === '') {
            setRowStatus($row, 'Label cannot be empty.', 'is-error');
            return;
        }

        $row.addClass('g3-rem-row--saving');
        setRowStatus($row, 'Saving…');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_save_menu_label',
            nonce: G3AccessRemediation.nonce,
            menu_item_id: id,
            label: label
        }).done(function (resp) {
            if (!resp.success) {
                setRowStatus($row, (resp.data && resp.data.message) || 'Save failed.', 'is-error');
                $row.removeClass('g3-rem-row--saving');
                return;
            }
            removeRow($row, 'Label saved');
        }).fail(function () {
            setRowStatus($row, 'Request failed.', 'is-error');
            $row.removeClass('g3-rem-row--saving');
        });
    });

    $(document).on('keypress', '.g3-rem-menu-label-input', function (e) {
        if (e.which === 13) {
            e.preventDefault();
            $(this).closest('.g3-rem-menu-row').find('.g3-rem-menu-save').trigger('click');
        }
    });

    $(document).on('click', '.g3-rem-menu-skip', function () {
        var $row = $(this).closest('.g3-rem-menu-row');
        var id = $row.data('id');
        setRowStatus($row, 'Skipping…');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_skip_menu_item',
            nonce: G3AccessRemediation.nonce,
            menu_item_id: id
        }).done(function (resp) {
            if (!resp.success) {
                setRowStatus($row, 'Failed.', 'is-error');
                return;
            }
            removeRow($row, 'Skipped');
        }).fail(function () {
            setRowStatus($row, 'Request failed.', 'is-error');
        });
    });

    $(document).on('click', '.g3-rem-menu-unskip', function () {
        var $row = $(this).closest('.g3-rem-menu-row');
        var id = $row.data('id');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_unskip_menu_item',
            nonce: G3AccessRemediation.nonce,
            menu_item_id: id
        }).done(function (resp) {
            if (resp.success) {
                fetchList();
                toast('Restored to list');
            }
        });
    });

    $tabs.on('click', function () {
        state.filter = $(this).data('filter');
        fetchList();
    });

    $search.on('input', function () {
        var val = $(this).val();
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function () {
            state.search = val;
            fetchList();
        }, 300);
    });

    $includeIgnored.on('change', function () {
        state.includeIgnored = $(this).is(':checked');
        fetchList();
    });

    fetchList();
})(jQuery);
