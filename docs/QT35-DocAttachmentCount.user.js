// ==UserScript==
// @name         QT35 › Doc Attachment Count
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.109
// @description  Displays read-only “Attachment (N)” in the Quote Wizard action bar (DS 11713). Independent of pricing/button presence.
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// ==/UserScript==

(function (window) {
    'use strict';

    // ========= Config / Routing / Standard bootstraping =========
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);

    // Only enable verbose logs on test; keep prod quiet
    TMUtils.setDebug?.(IS_TEST_ENV);

    // Namespaced logger + gated wrappers (match this label to the script)
    const L = TMUtils.getLogger?.('QT35');
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };  // gate errors too if you want

    // Route allowlist (same across QT files)
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) return;

    // Datasource + params
    const DS_ATTACH_COUNT = 11713;
    const ATTACHMENT_GROUP_KEY = 11;

    // Limit visibility to these wizard page names (empty [] = show on all)
    const SHOW_ON_PAGES = ['Part Summary'];

    // Our element IDs
    const ACTION_BAR_SEL = '#QuoteWizardSharedActionBar';       // <ul class="plex-actions" id="QuoteWizardSharedActionBar">
    const BTN_QT30_ID = 'lt-apply-catalog-pricing';          // preferred anchor (if present)
    const LEGACY_BTN_ID = 'lt-catalog-pricing-button';         // legacy anchor (if present)
    const LABEL_LI_ID = 'lt-attachment-count-item';
    const LABEL_SPAN_ID = 'lt-attachment-count';

    if (!TMUtils.matchRoute(ROUTES)) return;

    // ---------- State ----------
    let lastQuoteKey = null;
    let pollTimer = null;

    // ---------- Dev Menu ----------
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔄 QT35: Refresh now', forceFetch);
        GM_registerMenuCommand('🔎 QT35: Diagnostics', () => {
            TMUtils.toast('QT35: see console', 'info');
            if (IS_TEST_ENV) console.table({
                route: location.pathname,
                lastQuoteKey,
                onTargetPage: isOnTargetWizardPage(),
                actionBar: !!document.querySelector(ACTION_BAR_SEL)
            });
        });
    }

    // ---------- Mount ----------
    TMUtils.observeInsert(ACTION_BAR_SEL, (ul) => {
        ensureLabelInjected(ul);
        startWatchingWizardPage();
        startPolling();
    });

    // also try immediately if already present
    const maybeUl = document.querySelector(ACTION_BAR_SEL);
    if (maybeUl) {
        ensureLabelInjected(maybeUl);
        startWatchingWizardPage();
        startPolling();
    }

    // SPA safety
    TMUtils.onRouteChange(() => {
        if (!TMUtils.matchRoute(ROUTES)) return;
        const ul = document.querySelector(ACTION_BAR_SEL);
        if (ul) {
            ensureLabelInjected(ul);
            startWatchingWizardPage();
            startPolling();
        }
    });

    // ---------- UI injection ----------
    function ensureLabelInjected(ul) {
        if (!ul || ul.nodeName !== 'UL') return;

        if (document.getElementById(LABEL_LI_ID)) return; // already there

        // Build: <li><span>Attachment (0)</span></li>
        const li = document.createElement('li');
        li.id = LABEL_LI_ID;

        const span = document.createElement('span');
        span.id = LABEL_SPAN_ID;
        span.textContent = 'Attachment (0)';
        span.style.paddingLeft = '0.5em';

        li.appendChild(span);

        // Place after QT30 button if present; else append at end
        const qt30Li = document.getElementById(BTN_QT30_ID) || document.getElementById(LEGACY_BTN_ID);
        if (qt30Li && qt30Li.parentNode === ul) {
            qt30Li.parentNode.insertBefore(li, qt30Li.nextSibling);
        } else {
            ul.appendChild(li);
        }
    }

    // ---------- Wizard page visibility ----------
    function startWatchingWizardPage() {
        let __qt35Shown = null;
        const toggle = () => {
            const li = document.getElementById(LABEL_LI_ID);
            if (!li) return;
            const show = isOnTargetWizardPage();
            li.style.display = show ? '' : 'none';

            if (show !== __qt35Shown) {
                __qt35Shown = show;
                dlog(`QT35: page="${getActiveWizardPageName()}", label ${show ? 'shown' : 'hidden'}`);
            }
        };

        const list = document.querySelector('.plex-wizard-page-list');
        if (!list) return;

        new MutationObserver(toggle).observe(list, { childList: true, subtree: true });
        toggle(); // run once now

        dlog('QT35: label injected');
    }

    function getActiveWizardPageName() {
        const active = document.querySelector('.plex-wizard-page.active');
        const vm = active ? ko.dataFor(active) : null;
        return vm ? ko.unwrap(vm.name) : '';
    }

    function isOnTargetWizardPage() {
        if (!SHOW_ON_PAGES.length) return true;
        return SHOW_ON_PAGES.includes(getActiveWizardPageName());
    }

    // ---------- Fetching ----------
    async function fetchAttachmentCount(qk) {
        try {
            const rows = await TMUtils.dsRows(DS_ATTACH_COUNT, {
                Attachment_Group_Key: ATTACHMENT_GROUP_KEY,
                Record_Key_Value: String(qk)
            });
            return Array.isArray(rows) ? rows.length : 0;
        } catch (err) {
            derror('QT35: fetchAttachmentCount error:', err);
            return null;
        }
    }

    function setLabel(value) {
        const span = document.getElementById(LABEL_SPAN_ID);
        if (!span) return;
        if (typeof value === 'number') span.textContent = `Attachment (${value})`;
        else span.textContent = String(value);
    }

    async function checkAndFetch() {
        // respect page visibility (if configured)
        if (!isOnTargetWizardPage()) return;

        const grid = document.querySelector('.plex-grid');
        const raw = grid && ko.dataFor(grid)?.datasource?.raw;
        const qk = raw?.length ? ko.unwrap(raw[0].QuoteKey) : null;
        if (!qk) return;

        // Fetch once per Quote_Key
        if (qk !== lastQuoteKey) {
            lastQuoteKey = qk;
            setLabel('Attachment (...)');
            const count = await fetchAttachmentCount(qk);
            if (typeof count === 'number') setLabel(count);
            stopPolling(); // stop after successful fetch for this key
            dlog('QT35: fetched count and stopped polling', { qk, count });
        }
    }

    function startPolling(immediate = false) {
        if (!pollTimer) {
            pollTimer = setInterval(checkAndFetch, 1200);
            dlog('QT35: polling started');
        }
        if (immediate) checkAndFetch();
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function forceFetch() {
        lastQuoteKey = null; // force next run to fetch
        startPolling(true);
    }

})(window);
