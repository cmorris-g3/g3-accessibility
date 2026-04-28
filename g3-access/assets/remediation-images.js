(function ($) {
    'use strict';

    if (typeof G3AccessRemediation === 'undefined') {
        return;
    }

    var state = {
        filter: 'missing',
        page: 1,
        perPage: 25,
        search: '',
        includeIgnored: false,
        total: 0,
        lastPage: 1,
        counts: { missing: 0, placeholder: 0 },
        loading: false
    };

    var $list = $('.g3-rem-list');
    var $meta = $('.g3-rem-meta');
    var $pagination = $('.g3-rem-pagination');
    var $toast = $('.g3-rem-toast');
    var $search = $('.g3-rem-search');
    var $includeIgnored = $('.g3-rem-include-ignored');
    var $perPage = $('.g3-rem-per-page');
    var $tabs = $('.g3-rem-tabs .g3-rem-tab');

    var searchDebounce = null;

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function renderRow(item) {
        var thumbHtml = '';
        if (item.thumbnail) {
            thumbHtml = '<a href="' + escapeAttr(item.full || item.thumbnail) + '" target="_blank" rel="noopener">' +
                '<img src="' + escapeAttr(item.thumbnail) + '" alt="" loading="lazy">' +
                '</a>';
        } else {
            thumbHtml = '<span style="color:#8c8f94;font-size:11px;">(no preview)</span>';
        }

        var usedHtml = '';
        if (item.used_on) {
            usedHtml = '<strong title="' + escapeAttr(item.used_on.type || '') + '">' + escapeHtml(item.used_on.title) + '</strong>';
            var links = [];
            if (item.used_on.edit_url) {
                links.push('<a href="' + escapeAttr(item.used_on.edit_url) + '" target="_blank" rel="noopener">Edit</a>');
            }
            if (item.used_on.view_url) {
                links.push('<a href="' + escapeAttr(item.used_on.view_url) + '" target="_blank" rel="noopener">View</a>');
            }
            if (links.length) {
                usedHtml += '<div>' + links.join(' · ') + '</div>';
            }
        } else {
            usedHtml = '<span class="g3-rem-used-none">not attached to a post</span>';
        }

        var actionButtons = item.ignored
            ? '<button type="button" class="button g3-rem-unskip">Show in list again</button>'
            : ('<button type="button" class="button button-primary g3-rem-save">Save alt</button>' +
               '<button type="button" class="button g3-rem-decorative">Mark decorative</button>' +
               '<button type="button" class="button-link g3-rem-skip">Skip for now</button>');

        var html =
            '<div class="g3-rem-row' + (item.ignored ? ' g3-rem-row--ignored' : '') + '" data-id="' + item.id + '">' +
                '<div class="g3-rem-thumb">' + thumbHtml + '</div>' +
                '<div class="g3-rem-info">' +
                    '<div class="g3-rem-filename">' + escapeHtml(item.filename) + '</div>' +
                    '<div class="g3-rem-meta-line">' +
                        (item.dimensions ? escapeHtml(item.dimensions) + ' · ' : '') +
                        'uploaded ' + escapeHtml(item.uploaded_human) +
                    '</div>' +
                    (item.media_edit_url
                        ? '<a class="g3-rem-media-edit" href="' + escapeAttr(item.media_edit_url) + '" target="_blank" rel="noopener">Open in Media Library ↗</a>'
                        : '') +
                '</div>' +
                '<div class="g3-rem-alt">' +
                    '<label for="g3-rem-alt-' + item.id + '">Alt text</label>' +
                    '<input type="text" id="g3-rem-alt-' + item.id + '" class="g3-rem-alt-input" value="' + escapeAttr(item.alt) + '" placeholder="Describe what this image shows or its purpose">' +
                    '<div class="g3-rem-row-status"></div>' +
                '</div>' +
                '<div class="g3-rem-used">' + usedHtml + '</div>' +
                '<div class="g3-rem-actions">' + actionButtons + '</div>' +
            '</div>';

        return html;
    }

    function renderList(items) {
        if (!items.length) {
            $list.html('<p class="g3-rem-empty">No images match the current filters.</p>');
            return;
        }
        $list.html(items.map(renderRow).join(''));
    }

    function renderPagination() {
        if (state.lastPage <= 1) {
            $pagination.empty();
            return;
        }
        var html =
            '<button class="button g3-rem-prev" ' + (state.page <= 1 ? 'disabled' : '') + '>← Prev</button>' +
            '<span>Page ' + state.page + ' of ' + state.lastPage + '</span>' +
            '<button class="button g3-rem-next" ' + (state.page >= state.lastPage ? 'disabled' : '') + '>Next →</button>';
        $pagination.html(html);
    }

    function renderMeta() {
        var ignoredSuffix = state.includeIgnored ? ' (including ignored)' : '';
        var scope = state.filter === 'placeholder' ? 'with placeholder alt text' : 'missing alt text';
        $meta.text(state.total + ' image' + (state.total === 1 ? '' : 's') + ' ' + scope + ignoredSuffix);
    }

    function renderTabs() {
        $tabs.each(function () {
            var f = $(this).data('filter');
            $(this).toggleClass('is-active', f === state.filter);
            var count = state.counts[f];
            var label = f === 'placeholder' ? 'Placeholder alt' : 'Missing alt';
            $(this).text(label + (count != null ? ' (' + count + ')' : ''));
        });
    }

    function fetchList() {
        if (state.loading) return;
        state.loading = true;
        $list.addClass('is-loading');

        $.ajax({
            url: G3AccessRemediation.ajaxUrl,
            method: 'GET',
            data: {
                action: 'g3_access_remediation_list_images',
                nonce: G3AccessRemediation.nonce,
                filter: state.filter,
                page: state.page,
                per_page: state.perPage,
                search: state.search,
                include_ignored: state.includeIgnored ? '1' : '0'
            },
            dataType: 'json'
        }).done(function (resp) {
            if (!resp.success) {
                $list.html('<p class="g3-rem-empty">Failed to load images.</p>');
                return;
            }
            state.total = resp.data.meta.total;
            state.lastPage = resp.data.meta.last_page;
            state.counts = resp.data.meta.counts || state.counts;
            renderList(resp.data.items);
            renderMeta();
            renderTabs();
            renderPagination();
        }).fail(function () {
            $list.html('<p class="g3-rem-empty">Request failed. Please reload.</p>');
        }).always(function () {
            state.loading = false;
            $list.removeClass('is-loading');
        });
    }

    function toast(message, isError) {
        $toast.text(message).toggleClass('is-error', !!isError).addClass('is-visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function () {
            $toast.removeClass('is-visible');
        }, 2400);
    }

    function setRowStatus($row, text, kind) {
        var $status = $row.find('.g3-rem-row-status');
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
            if ($list.children().length === 0) {
                // Reload to fetch the next page's items (or show the empty state).
                fetchList();
            }
        }, 300);
        if (message) toast(message);
    }

    // --- Event handlers ---

    $(document).on('click', '.g3-rem-save', function () {
        var $row = $(this).closest('.g3-rem-row');
        var id = $row.data('id');
        var alt = $row.find('.g3-rem-alt-input').val().trim();

        if (alt === '') {
            setRowStatus($row, 'Alt text is empty. Use Mark decorative if that’s intentional.', 'is-error');
            return;
        }

        $row.addClass('g3-rem-row--saving');
        setRowStatus($row, 'Saving…');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_save_alt',
            nonce: G3AccessRemediation.nonce,
            attachment_id: id,
            alt: alt
        }).done(function (resp) {
            if (!resp.success) {
                setRowStatus($row, (resp.data && resp.data.message) || 'Save failed.', 'is-error');
                $row.removeClass('g3-rem-row--saving');
                return;
            }
            removeRow($row, 'Alt saved');
        }).fail(function () {
            setRowStatus($row, 'Request failed.', 'is-error');
            $row.removeClass('g3-rem-row--saving');
        });
    });

    $(document).on('keypress', '.g3-rem-alt-input', function (e) {
        if (e.which === 13) {
            e.preventDefault();
            $(this).closest('.g3-rem-row').find('.g3-rem-save').trigger('click');
        }
    });

    $(document).on('click', '.g3-rem-decorative', function () {
        var $row = $(this).closest('.g3-rem-row');
        var id = $row.data('id');
        $row.addClass('g3-rem-row--saving');
        setRowStatus($row, 'Marking decorative…');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_mark_decorative',
            nonce: G3AccessRemediation.nonce,
            attachment_id: id
        }).done(function (resp) {
            if (!resp.success) {
                setRowStatus($row, 'Failed.', 'is-error');
                $row.removeClass('g3-rem-row--saving');
                return;
            }
            removeRow($row, 'Marked decorative (alt="")');
        }).fail(function () {
            setRowStatus($row, 'Request failed.', 'is-error');
            $row.removeClass('g3-rem-row--saving');
        });
    });

    $(document).on('click', '.g3-rem-skip', function () {
        var $row = $(this).closest('.g3-rem-row');
        var id = $row.data('id');
        setRowStatus($row, 'Skipping…');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_skip',
            nonce: G3AccessRemediation.nonce,
            attachment_id: id
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

    $(document).on('click', '.g3-rem-unskip', function () {
        var $row = $(this).closest('.g3-rem-row');
        var id = $row.data('id');
        $.post(G3AccessRemediation.ajaxUrl, {
            action: 'g3_access_remediation_unskip',
            nonce: G3AccessRemediation.nonce,
            attachment_id: id
        }).done(function (resp) {
            if (resp.success) {
                fetchList();
                toast('Restored to list');
            }
        });
    });

    $(document).on('click', '.g3-rem-prev', function () {
        if (state.page > 1) {
            state.page -= 1;
            fetchList();
        }
    });
    $(document).on('click', '.g3-rem-next', function () {
        if (state.page < state.lastPage) {
            state.page += 1;
            fetchList();
        }
    });

    $search.on('input', function () {
        var val = $(this).val();
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function () {
            state.search = val;
            state.page = 1;
            fetchList();
        }, 300);
    });

    $includeIgnored.on('change', function () {
        state.includeIgnored = $(this).is(':checked');
        state.page = 1;
        fetchList();
    });

    $perPage.on('change', function () {
        state.perPage = parseInt($(this).val(), 10) || 25;
        state.page = 1;
        fetchList();
    });

    $tabs.on('click', function () {
        var f = $(this).data('filter');
        if (f === state.filter) return;
        state.filter = f;
        state.page = 1;
        fetchList();
    });

    // Initial load
    fetchList();
})(jQuery);
