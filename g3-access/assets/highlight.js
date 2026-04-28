(function ($) {
    'use strict';

    if (typeof G3Access === 'undefined') {
        return;
    }

    var STATE_KEY = 'g3AccessHighlight:' + window.location.pathname;
    var isOn = sessionStorage.getItem(STATE_KEY) === '1';
    var marks = [];
    var $pill = $('#wp-admin-bar-g3-access-highlight .g3-hl-pill');

    function setPill(state, text) {
        $pill.attr('data-state', state).text(text);
    }

    function severityRank(s) {
        return { critical: 0, serious: 1, moderate: 2, minor: 3 }[s] != null
            ? { critical: 0, serious: 1, moderate: 2, minor: 3 }[s]
            : 4;
    }

    function worstSeverity(findings) {
        var best = 'minor';
        var bestRank = severityRank('minor');
        findings.forEach(function (f) {
            var r = severityRank(f.severity);
            if (r < bestRank) {
                bestRank = r;
                best = f.severity;
            }
        });
        return best;
    }

    function fetchFindings(cb, errCb) {
        $.ajax({
            url: G3Access.ajaxUrl,
            method: 'GET',
            data: {
                action: 'g3_access_findings_for_url',
                nonce: G3Access.nonce,
                url: G3Access.currentUrl
            },
            dataType: 'json'
        })
            .done(function (r) {
                if (r.success && r.data && Array.isArray(r.data.findings)) {
                    cb(r.data.findings);
                } else {
                    errCb(r.data && r.data.message ? r.data.message : 'fetch failed');
                }
            })
            .fail(function () {
                errCb('unreachable');
            });
    }

    function applyHighlights(findings) {
        removeHighlights();

        var byElement = new Map();
        findings.forEach(function (f) {
            if (!f.target) return;
            var elements;
            try {
                elements = document.querySelectorAll(f.target);
            } catch (e) {
                return;
            }
            elements.forEach(function (el) {
                if (!byElement.has(el)) byElement.set(el, []);
                byElement.get(el).push(f);
            });
        });

        byElement.forEach(function (fs, el) {
            // Avoid recursing into WP admin bar / our own marks
            if (el.closest('#wpadminbar') || el.closest('.g3-mark-badge')) {
                return;
            }

            var sev = worstSeverity(fs);
            var priorPosition = el.style.position || '';
            if (getComputedStyle(el).position === 'static') {
                el.style.position = 'relative';
            }
            el.classList.add('g3-mark-root', 'g3-mark--' + sev);

            var badge = document.createElement('div');
            badge.className = 'g3-mark-badge g3-mark--' + sev;
            badge.textContent =
                fs.length + ' ' + (fs.length === 1 ? 'issue' : 'issues');
            badge.title = fs
                .map(function (f) {
                    return '[' + (f.severity || '?') + '] ' + (f.finding_type || '') +
                           (f.rationale ? ' — ' + f.rationale : '');
                })
                .join('\n');
            el.appendChild(badge);

            marks.push({ el: el, badge: badge, sev: sev, priorPosition: priorPosition });
        });

        var locatable = byElement.size;
        var total = findings.length;
        var missing = total - Array.from(byElement.values()).reduce(function (n, fs) {
            return n + fs.length;
        }, 0);

        if (missing > 0) {
            setPill('on', locatable + ' el · ' + missing + '?');
        } else {
            setPill('on', locatable + ' highlighted');
        }
    }

    function removeHighlights() {
        marks.forEach(function (m) {
            m.el.classList.remove(
                'g3-mark-root',
                'g3-mark--critical',
                'g3-mark--serious',
                'g3-mark--moderate',
                'g3-mark--minor'
            );
            if (m.priorPosition) {
                m.el.style.position = m.priorPosition;
            } else {
                m.el.style.removeProperty('position');
            }
            if (m.badge && m.badge.parentNode) {
                m.badge.parentNode.removeChild(m.badge);
            }
        });
        marks = [];
    }

    function setOff() {
        isOn = false;
        sessionStorage.setItem(STATE_KEY, '0');
        removeHighlights();
        setPill('idle', 'off');
        $('#wp-admin-bar-g3-access-highlight').removeClass('g3-hl-active');
    }

    function setOn() {
        isOn = true;
        sessionStorage.setItem(STATE_KEY, '1');
        $('#wp-admin-bar-g3-access-highlight').addClass('g3-hl-active');
        setPill('running', '…');
        fetchFindings(
            function (findings) {
                applyHighlights(findings);
            },
            function (msg) {
                setPill('fail', '⚠');
                $('#wp-admin-bar-g3-access-highlight > a').attr('title', 'G3 Access: ' + msg);
            }
        );
    }

    $(document).on('click', '#wp-admin-bar-g3-access-highlight > a', function (e) {
        e.preventDefault();
        isOn ? setOff() : setOn();
    });

    // Auto-apply if the toggle was on in this session
    if (isOn) {
        setOn();
    }
})(jQuery);
