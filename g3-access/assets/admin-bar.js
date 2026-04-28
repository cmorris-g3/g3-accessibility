(function ($) {
    'use strict';

    if (typeof G3Access === 'undefined') {
        return;
    }

    var $pill = $('#wp-admin-bar-g3-access-scan .g3-ab-pill');
    var $node = $('#wp-admin-bar-g3-access-scan > a');
    var pollTimer = null;

    function setState(state, text) {
        $pill.attr('data-state', state).text(text);
    }

    function fail(message) {
        setState('fail', '⚠');
        $node.attr('title', 'G3 Access: ' + message);
    }

    function pollScan(scanId) {
        $.ajax({
            url: G3Access.ajaxUrl,
            method: 'GET',
            data: { action: 'g3_access_poll_scan', nonce: G3Access.nonce, scan_id: scanId },
            dataType: 'json'
        }).done(function (resp) {
            if (!resp.success) {
                fail(resp.data && resp.data.message ? resp.data.message : 'poll failed');
                return;
            }
            var scan = resp.data.scan;
            if (scan.status === 'complete') {
                var count = scan.findings_total;
                if (count === 0) {
                    setState('ok', '✓ 0');
                } else {
                    setState('findings', count + ' issues');
                }
                $node.attr('href', G3Access.checklistUrl + '&url=' + encodeURIComponent(G3Access.currentUrl));
            } else if (scan.status === 'failed') {
                fail(scan.error || 'scan failed');
            } else {
                pollTimer = window.setTimeout(function () { pollScan(scanId); }, 3000);
            }
        }).fail(function () {
            fail('unreachable');
        });
    }

    $(document).on('click', '#wp-admin-bar-g3-access-scan > a', function (e) {
        e.preventDefault();
        if ($pill.attr('data-state') === 'running') {
            return;
        }

        setState('running', '…');
        $.ajax({
            url: G3Access.ajaxUrl,
            method: 'POST',
            data: { action: 'g3_access_scan', nonce: G3Access.nonce, url: G3Access.currentUrl },
            dataType: 'json'
        }).done(function (resp) {
            if (!resp.success) {
                var msg = resp.data && resp.data.message ? resp.data.message : 'scan failed';
                if (resp.data && resp.data.retry_after_s) {
                    msg += ' (retry in ' + resp.data.retry_after_s + 's)';
                }
                fail(msg);
                return;
            }
            var scanId = resp.data.scan.id;
            pollScan(scanId);
        }).fail(function () {
            fail('unreachable');
        });
    });
})(jQuery);
