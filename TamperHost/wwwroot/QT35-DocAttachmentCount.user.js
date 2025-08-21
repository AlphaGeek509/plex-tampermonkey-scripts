// ==UserScript==
// @name         QT35 › Doc Attachment Count
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.164
// @description  Displays read-only “Attachment (N)” in the Quote Wizard action bar (DS 11713). Independent of pricing/button presence.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Bootstrap ----------
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.('QT35');
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

    // ---------- Config ----------
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) return;

    const CONFIG = {
        DS_ATTACHMENTS_BY_QUOTE: 11713,       // your DS 11713
        ATTACHMENT_GROUP_KEY: 11,             // Attachment group key
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        SHOW_ON_PAGES_RE: /review|summary|submit/i
    };

    // ---------- IDs ----------
    const LABEL_LI_ID = 'lt-attachments-badge';
    const LABEL_PILL_ID = 'lt-attach-pill';
    const QT30_BTN_ID = 'lt-apply-catalog-pricing';
    const QT30_BTN_ID_LEGACY = 'lt-catalog-pricing-button';

    // ---------- Dev menu ----------
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔄 QT35: Refresh now', () => {
            const li = document.getElementById(LABEL_LI_ID);
            if (li) refreshBadge(li, { forceToast: true, ignoreVisibility: true });
        });
    }

    // ---------- Persistent injection ----------
    const injectOnce = (ul) => injectBadge(ul);
    const stopObserve = TMUtils.observeInsertMany?.(CONFIG.ACTION_BAR_SEL, injectOnce)
        || TMUtils.observeInsert(CONFIG.ACTION_BAR_SEL, injectOnce);
    document.querySelectorAll(CONFIG.ACTION_BAR_SEL).forEach(injectOnce);

    TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(ROUTES)) return;
        document.querySelectorAll(CONFIG.ACTION_BAR_SEL).forEach(injectOnce);
    });

    // Re-check when QT20 closes its modal and broadcasts a refresh request
    window.addEventListener('LT:AttachmentRefreshRequested', () => {
        const li = document.getElementById(LABEL_LI_ID);
        if (li) refreshBadge(li, { forceToast: false, ignoreVisibility: false });
    });

    // ---------- UI injection ----------
    function injectBadge(actionBarUl) {
        try {
            if (!actionBarUl || actionBarUl.nodeName !== 'UL') return;
            if (document.getElementById(LABEL_LI_ID)) return; // already injected

            const li = document.createElement('li');
            li.id = LABEL_LI_ID;
            li.style.display = 'none';

            const a = document.createElement('a');
            a.href = 'javascript:void(0)';
            a.title = 'Refresh attachments';
            a.style.cursor = 'pointer';
            a.innerHTML = `
        <span id="${LABEL_PILL_ID}"
              style="display:inline-block; padding:2px 8px; border-radius:999px; background:#999; color:#fff; font-weight:600">
          Attachments: …
        </span>
      `;
            a.addEventListener('click', () => refreshBadge(li, { forceToast: true }));

            li.appendChild(a);

            // Prefer placing after QT30 button if present
            const afterNode = document.getElementById(QT30_BTN_ID) || document.getElementById(QT30_BTN_ID_LEGACY);
            if (afterNode && afterNode.parentNode === actionBarUl) {
                afterNode.parentNode.insertBefore(li, afterNode.nextSibling);
            } else {
                actionBarUl.appendChild(li);
            }

            watchWizardPage(li);
            dlog('QT35: badge injected');
        } catch (e) {
            derror('injectBadge:', e);
        }
    }

    // ---------- Page visibility ----------
    function watchWizardPage(li) {
        const toggle = () => {
            const show = isOnTargetWizardPage();
            li.style.display = show ? '' : 'none';
            if (show) refreshBadge(li);
        };

        const list = document.querySelector('.plex-wizard-page-list');
        if (list) {
            const mo = new MutationObserver(toggle);
            mo.observe(list, { childList: true, subtree: true, attributes: true });
            toggle();
        } else {
            toggle();
        }
    }

    function getActiveWizardPageName() {
        const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        const vm = activeEl ? KO?.dataFor?.(activeEl) : null;
        const name = vm ? (KO?.unwrap?.(vm.name) ?? (typeof vm.name === 'function' ? vm.name() : vm.name)) : '';
        if (name) return String(name);
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
    }

    function isOnTargetWizardPage() {
        const nm = getActiveWizardPageName();
        return CONFIG.SHOW_ON_PAGES_RE.test(String(nm || ''));
    }

    // ---------- Fetching ----------
    let lastQuoteKey = null;

    function unwrap(v) { return KO?.unwrap ? KO.unwrap(v) : (typeof v === 'function' ? v() : v); }

    function resolveQuoteKey() {
        // Try grid datasource first
        const grid = document.querySelector('.plex-grid');
        const gridVM = grid ? KO?.dataFor?.(grid) : null;
        const raw = gridVM?.datasource?.raw;
        const fromGrid = raw?.length ? unwrap(raw[0]?.QuoteKey) : null;
        if (fromGrid) return fromGrid;

        // Try root VM
        const rootEl = document.querySelector('.plex-wizard, .plex-page');
        const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
        const fromRoot = rootVM ? (unwrap(rootVM?.QuoteKey) || unwrap(rootVM?.Quote?.QuoteKey)) : null;
        if (fromRoot) return fromRoot;

        // Fallback: URL
        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    async function fetchAttachmentCount(quoteKey) {
        const rows = await TMUtils.dsRows(CONFIG.DS_ATTACHMENTS_BY_QUOTE, {
            Attachment_Group_Key: CONFIG.ATTACHMENT_GROUP_KEY,
            Record_Key_Value: String(quoteKey)
        });
        return Array.isArray(rows) ? rows.length : 0;
    }

    function setBadge(countOrText) {
        const pill = document.getElementById(LABEL_PILL_ID);
        if (!pill) return;
        if (typeof countOrText === 'number') {
            pill.textContent = `Attachments: ${countOrText}`;
            pill.style.background = countOrText > 0 ? '#27ae60' : '#c0392b'; // green if present, red if none
        } else {
            pill.textContent = String(countOrText);
            pill.style.background = '#999';
        }
    }

    async function refreshBadge(li, { forceToast = false, ignoreVisibility = false } = {}) {
        try {
            if (!ignoreVisibility && !isOnTargetWizardPage()) return;

            setBadge('Attachments: …');

            const qk = resolveQuoteKey();
            if (!qk) {
                setBadge('Attachments: ?');
                if (forceToast) TMUtils.toast('⚠️ Quote Key not found on this page', 'warn', 2500);
                return;
            }

            // If the QuoteKey changed since last, always refresh
            const count = await fetchAttachmentCount(qk);
            setBadge(count);
            lastQuoteKey = qk;

            if (forceToast) {
                TMUtils.toast(count > 0 ? `✅ ${count} attachment(s)` : '⚠️ No attachments', count > 0 ? 'success' : 'warn', 2200);
            }
            dlog('QT35: attachments', { qk, count });
        } catch (e) {
            TMUtils.toast(`❌ Attachments refresh failed: ${e.message}`, 'error', 5000);
            derror('refreshBadge:', e);
        }
    }
})();
