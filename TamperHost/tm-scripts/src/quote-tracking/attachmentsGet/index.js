// tm-scripts/src/qt35/index.js
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(async function () {
    'use strict';

    // ---------- Bootstrap ----------
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.('QT35');
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // ---------- Config ----------
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) return;

    const CFG = {
        DS_ATTACHMENTS_BY_QUOTE: 11713,
        ATTACHMENT_GROUP_KEY: 11,
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        SHOW_ON_PAGES_RE: /review|summary|submit/i,
        POLL_MS: 200,
        TIMEOUT_MS: 12_000
    };

    // ---------- IDs ----------
    const LABEL_LI_ID = 'lt-attachments-badge';
    const LABEL_PILL_ID = 'lt-attach-pill';
    const QT30_BTN_ID = 'lt-apply-catalog-pricing';
    const QT30_BTN_ID_LEGACY = 'lt-catalog-pricing-button';

    // ---------- Persistent injection ----------
    const injectOnce = (ul) => injectBadge(ul);
    const stopObserve =
        TMUtils.observeInsertMany?.(CFG.ACTION_BAR_SEL, injectOnce) ||
        TMUtils.observeInsert?.(CFG.ACTION_BAR_SEL, injectOnce);
    document.querySelectorAll(CFG.ACTION_BAR_SEL).forEach(injectOnce);

    TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(ROUTES)) return;
        document.querySelectorAll(CFG.ACTION_BAR_SEL).forEach(injectOnce);
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
            a.title = 'Click to refresh attachments';
            a.style.cursor = 'pointer';
            a.innerHTML = `
        <span id="${LABEL_PILL_ID}"
              style="display:inline-block; padding:2px 8px; border-radius:999px; background:#999; color:#fff; font-weight:600; transition:filter .15s;">
          Attachments: …
        </span>
      `;
            a.addEventListener('click', () => refreshBadge(li, { forceToast: true }));

            a.addEventListener('mouseenter', () => {
                const pill = a.querySelector('#' + CSS.escape(LABEL_PILL_ID));
                if (pill) pill.style.filter = 'brightness(1.08)';
            });
            a.addEventListener('mouseleave', () => {
                const pill = a.querySelector('#' + CSS.escape(LABEL_PILL_ID));
                if (pill) pill.style.filter = '';
            });

            li.appendChild(a);

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
        // Prefer visible page
        const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        if (activeEl) {
            // Use KO if available, but avoid KO.unwrap—use TMUtils.getObsValue on the vm if possible
            try {
                const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
                const vm = KO?.dataFor?.(activeEl);
                const name = vm ? TMUtils.getObsValue(vm, 'name', { first: true, trim: true }) : '';
                if (name) return name;
            } catch { /* fall through */ }
        }
        // Fallback: nav text
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
    }

    function isOnTargetWizardPage() {
        const nm = getActiveWizardPageName();
        return CFG.SHOW_ON_PAGES_RE.test(String(nm || ''));
    }

    // ---------- Data helpers (new-style) ----------
    async function ensureWizardVM() {
        // Anchor on the grid or action bar—both are present on wizard pages
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await TMUtils.waitForModelAsync(anchor, {
            pollMs: CFG.POLL_MS,
            timeoutMs: CFG.TIMEOUT_MS,
            requireKo: true
        });
        return viewModel;
    }

    function resolveQuoteKeySync() {
        // Try grid datasource first (via KO.dataFor), then root VM fields, then URL
        try {
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
            const grid = document.querySelector(CFG.GRID_SEL);
            const gridVM = grid ? KO?.dataFor?.(grid) : null;
            const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
            const fromGrid = raw0 ? TMUtils.getObsValue(raw0, 'QuoteKey') : null;
            if (fromGrid) return fromGrid;
        } catch { /* ignore */ }

        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const fromRoot =
                (rootVM && (TMUtils.getObsValue(rootVM, 'QuoteKey') ||
                    TMUtils.getObsValue(rootVM, 'Quote.QuoteKey')));
            if (fromRoot) return fromRoot;
        } catch { /* ignore */ }

        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    async function fetchAttachmentCount(quoteKey) {
        const rows = await TMUtils.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
            Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
            Record_Key_Value: String(quoteKey)
        });
        return Array.isArray(rows) ? rows.length : 0;
    }

    function setBadge(countOrText) {
        const pill = document.getElementById(LABEL_PILL_ID);
        if (!pill) return;
        if (typeof countOrText === 'number') {
            pill.textContent = `Attachments: ${countOrText}`;
            pill.style.background = countOrText > 0 ? '#27ae60' : '#c0392b';
        } else {
            pill.textContent = String(countOrText);
            pill.style.background = '#999';
        }
    }

    let lastQuoteKey = null;

    async function refreshBadge(li, { forceToast = false, ignoreVisibility = false } = {}) {
        try {
            if (!ignoreVisibility && !isOnTargetWizardPage()) return;

            setBadge('Attachments: …');

            // Ensure VM is bound (prevents “grid exists but not bound yet” races)
            await ensureWizardVM();

            const qk = resolveQuoteKeySync();
            if (!qk) {
                setBadge('Attachments: ?');
                if (forceToast) TMUtils.toast('⚠️ Quote Key not found on this page', 'warn', 2500);
                return;
            }

            const count = await fetchAttachmentCount(qk);
            setBadge(count);
            lastQuoteKey = qk;

            if (forceToast) {
                TMUtils.toast(count > 0 ? `✅ ${count} attachment(s)` : '⚠️ No attachments',
                    count > 0 ? 'success' : 'warn', 2200);
            }
            dlog('QT35: attachments', { qk, count });
        } catch (e) {
            TMUtils.toast(`❌ Attachments refresh failed: ${e.message}`, 'error', 5000);
            derror('refreshBadge:', e);
        }
    }
})();
