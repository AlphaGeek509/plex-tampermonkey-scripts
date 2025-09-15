// src/quote-tracking/qt35-attachmentsGet/qt35.index.js

(() => {
    'use strict';

    const DEV = (typeof __BUILD_DEV__ !== 'undefined') ? __BUILD_DEV__ : true;
    const dlog = (...a) => DEV && console.debug('QT35', ...a);
    const derr = (...a) => console.error("QT35 ✖️", ...a);
    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

    // Safe delegating wrapper: use lt.core.auth.withFreshAuth when available,
    // otherwise just run the callback once (best-effort fallback).
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return (typeof impl === 'function') ? impl(fn) : fn();
    };


    // Flat repo factory (no polling required now that lt-data-core installs at doc-start)
    const QTF = lt.core?.data?.makeFlatScopedRepo
        ? lt.core.data.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" })
        : null;

    (async () => {
        // ensureLTDock is provided by @require’d lt-ui-dock.js
        const dock = await window.ensureLTDock?.();
        dock?.register({
            id: 'qt35-attachments',
            label: 'Attachments',
            title: 'Open QT35 Attachments',
            weight: 120,
            onClick: () => (typeof openAttachmentsModal === 'function'
                ? openAttachmentsModal()
                : lt.core.hub.notify('Attachments UI not available', 'warn', { toast: true }))
        });
    })();


    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some(rx => rx.test(location.pathname))) return;

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const raf = () => new Promise(r => requestAnimationFrame(r));

    const CFG = {
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        SHOW_ON_PAGES_RE: /^part\s*summary$/i,
        DS_ATTACHMENTS_BY_QUOTE: 11713,
        ATTACHMENT_GROUP_KEY: 11,
        DS_QUOTE_HEADER_GET: 3156,
        POLL_MS: 200,
        TIMEOUT_MS: 12000
    };

    // === Per-tab scope id (same as QT10) ===


    function getTabScopeId(ns = 'QT') {
        try {
            const k = `lt:${ns}:scopeId`;
            let v = sessionStorage.getItem(k);
            if (!v) {
                v = String(Math.floor(Math.random() * 2147483647));
                sessionStorage.setItem(k, v);
            }
            return Number(v);
        } catch {
            return Math.floor(Math.random() * 2147483647);
        }
    }

    function getActiveWizardPageName() {
        // Active LI renders the page name as a direct text node
        const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active');
        if (!li) return '';
        return (li.textContent || '').trim().replace(/\s+/g, ' ');
    }

    function isOnTargetWizardPage() {
        return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }


    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
        return viewModel;
    }

    function getQuoteKeyDeterministic() {
        try {
            const grid = document.querySelector(CFG.GRID_SEL);
            if (grid && KO?.dataFor) {
                const gridVM = KO.dataFor(grid);
                const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
                const v = raw0 ? window.TMUtils?.getObsValue?.(raw0, 'QuoteKey') : null;
                if (v != null) return Number(v);
            }
        } catch { }
        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const v = rootVM && (window.TMUtils?.getObsValue?.(rootVM, 'QuoteKey') || window.TMUtils?.getObsValue?.(rootVM, 'Quote.QuoteKey'));
            if (v != null) return Number(v);
        } catch { }
        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    let quoteRepo = null, lastScope = null;
    let __QT__ = null;

    async function ensureRepoForQuote(quoteKey) {
        if (!QTF) return null;
        const { repo } = QTF.use(Number(quoteKey));
        quoteRepo = repo;                 // <-- bind the module-level handle
        lastScope = Number(quoteKey);     // <-- track scope we’re bound to
        await repo.ensureFromLegacyIfMissing?.();
        return repo;
    }




    // Background promotion (per-tab draft -> per-quote) with gentle retries
    const __PROMOTE = { timer: null, tries: 0, max: 120, intervalMs: 250 };

    function schedulePromoteDraftToQuote(quoteKey) {
        if (__PROMOTE.timer) return;
        __PROMOTE.timer = setInterval(async () => {
            try {
                const repoQ = await ensureRepoForQuote(quoteKey);
                if (!QTF || !repoQ) { if (++__PROMOTE.tries >= __PROMOTE.max) stopPromote(); return; }

                // Read the SAME per-tab draft scope QT10 writes to
                const { repo: draftRepo } = QTF.use(getTabScopeId('QT'));
                const draft = await (draftRepo.getHeader?.() || draftRepo.get());
                if (draft && Object.keys(draft).length) {
                    await repoQ.patchHeader({
                        Quote_Key: Number(quoteKey),
                        Customer_No: draft.Customer_No ?? null,
                        Catalog_Key: draft.Catalog_Key ?? null,
                        Catalog_Code: draft.Catalog_Code ?? null,
                        Promoted_From: 'draft',
                        Promoted_At: Date.now(),
                        Quote_Header_Fetched_At: null,
                        Updated_At: draft.Updated_At || Date.now(),
                    });
                    await draftRepo.clear?.();
                    try { const { repo: legacy } = QTF.use('draft'); await legacy.clear?.(); } catch { }

                }
                stopPromote();
            } catch {
                // keep retrying
            }
        }, __PROMOTE.intervalMs);
    }

    function stopPromote() {
        clearInterval(__PROMOTE.timer);
        __PROMOTE.timer = null;
        __PROMOTE.tries = 0;
    }


    // ===== Merge QT10 draft → per-quote (once) =====
    async function mergeDraftIntoQuoteOnce(qk) {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return;

        if (!QTF) { schedulePromoteDraftToQuote(qk); return; }

        // Read per-tab draft (same scope QT10 writes to)
        const { repo: draftRepo } = QTF.use(getTabScopeId('QT'));
        const draft = await draftRepo.getHeader?.() || await draftRepo.get(); // tolerate legacy
        if (!draft) return;

        await ensureRepoForQuote(qk);
        if (!quoteRepo) return; // DC not ready yet

        const currentHeader = (await quoteRepo.getHeader()) || {};
        const curCust = String(currentHeader.Customer_No ?? '');
        const newCust = String(draft.Customer_No ?? '');

        const needsMerge =
            (Number((await draftRepo.get())?.Updated_At || 0) > Number(currentHeader.Promoted_At || 0)) ||
            (curCust !== newCust) ||
            (currentHeader.Catalog_Key !== draft.Catalog_Key) ||
            (currentHeader.Catalog_Code !== draft.Catalog_Code);

        if (!needsMerge) return;

        await quoteRepo.patchHeader({
            Quote_Key: Number(qk),
            Customer_No: draft.Customer_No ?? null,
            Catalog_Key: draft.Catalog_Key ?? null,
            Catalog_Code: draft.Catalog_Code ?? null,
            Promoted_From: 'draft',
            Promoted_At: Date.now(),
            // force re-hydration next time
            Quote_Header_Fetched_At: null
        });

        // clear per-tab draft and legacy if present
        await draftRepo.clear?.();
        try { const { repo: legacy } = QTF.use('draft'); await legacy.clear?.(); } catch { }


        dlog('Draft merged (flat repo header updated)', { qk });
    }



    // ===== Data sources =====
    async function fetchAttachmentCount(quoteKey) {
        const plex = (typeof getPlexFacade === "function") ? await getPlexFacade() : (ROOT.lt?.core?.plex);
        if (!plex?.dsRows) return 0;
        const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
            Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
            Record_Key_Value: String(quoteKey)
        }));
        return Array.isArray(rows) ? rows.length : 0;
    }

    function quoteHeaderGet(row) {
        return {
            Customer_Code: row?.Customer_Code ?? null,
            Customer_Name: row?.Customer_Name ?? null,
            Customer_No: row?.Customer_No ?? null,
            Quote_No: row?.Quote_No ?? null
        };
    }
    async function hydratePartSummaryOnce(qk) {
        await ensureRepoForQuote(qk);
        if (!quoteRepo) return;
        const headerSnap = (await quoteRepo.getHeader()) || {};
        if (headerSnap.Quote_Header_Fetched_At) return;

        const plex = (typeof getPlexFacade === "function" ? await getPlexFacade() : ROOT.lt?.core?.plex);
        if (!plex?.dsRows) return;
        const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));

        const first = (Array.isArray(rows) && rows.length) ? quoteHeaderGet(rows[0]) : null;
        if (!first) return;

        await quoteRepo.patchHeader({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
    }

    // ===== Hub button =====
    const HUB_BTN_ID = 'qt35-attachments-btn';

    function ensureHubButton() {
        try { await(window.ensureLTHub?.()); } catch { }

        // Registers (or updates) a button in our hub. Section: left.
        lt.core.hub.registerButton({
            id: HUB_BTN_ID,
            label: 'Attachments 0',
            title: 'Refresh attachments (manual)',
            section: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true)
        });
    }

    function setBadgeCount(n) {
        const count = Number(n ?? 0);
        try { await(window.ensureLTHub?.()); } catch { }

        lt.core.hub.registerButton({
            id: HUB_BTN_ID,
            label: `Attachments ${count}`,
            title: 'Refresh attachments (manual)',
            section: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true)
        });
    }

    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
        ensureHubButton(); // guarantees the button is present
        if (refreshInFlight) return;
        refreshInFlight = true;
        const t = lt.core.hub.beginTask("Fetching Attachments…", "info");


        try {
            await ensureWizardVM();
            const qk = getQuoteKeyDeterministic();
            if (!qk || !Number.isFinite(qk) || qk <= 0) {
                setBadgeCount(0);
                t.error(`⚠️ Quote Key not found`, 4000);
                return;
            }

            // If scope changed, paint any existing snapshot before fetching
            if (!quoteRepo || lastScope !== qk) {
                await ensureRepoForQuote(qk);
                try {
                    const head = await quoteRepo?.getHeader?.();
                    if (head?.Attachment_Count != null) setBadgeCount(Number(head.Attachment_Count));
                } catch { }
            }

            // Promote & clear draft BEFORE per-quote updates
            await mergeDraftIntoQuoteOnce(qk);

            // If DC isn't ready yet, resolve the task so the pill doesn’t spin forever
            if (!quoteRepo) {
                t.error('Data context not ready yet', 2000);
                return;
            }

            const count = await fetchAttachmentCount(qk);
            setBadgeCount(count);
            await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });

            // Always resolve the task
            const ok = count > 0;
            t.success(ok ? `✅ ${count} attachment(s)` : '⚠️ No attachments', 2000);

            // Optional toast when user clicked manually
            if (manual) {
                lt.core.hub.notify(
                    ok ? 'success' : 'warn',
                    ok ? `✅ ${count} attachment(s)` : '⚠️ No attachments',
                    { timeout: 2000, toast: true }
                );
            }
            dlog('refresh', { qk, count });

        } catch (err) {
            derr('refresh failed', err);
            t.error(`❌ Attachments refresh failed: ${err?.message || err}`, 4000);
            lt.core.hub.notify(
                'error',
                `❌ Attachments refresh failed: ${err?.message || err}`,
                { timeout: 4000, toast: true }
            );
        } finally {
            refreshInFlight = false;
        }
    }


    // ===== SPA wiring =====
    let booted = false; let offUrl = null;
    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    async function init() {
        if (booted) return;
        booted = true;
        await raf();

        try { await (window.ensureLTHub?.()); } catch { }
        ensureHubButton();

        startWizardPageObserver();
        reconcileHubButtonVisibility();

        const show = isOnTargetWizardPage();
        if (show) {
            await ensureWizardVM();

            const qk = getQuoteKeyDeterministic();
            schedulePromoteDraftToQuote(qk);

            if (qk && Number.isFinite(qk) && qk > 0) {
                quoteRepo = await ensureRepoForQuote(qk);
                await mergeDraftIntoQuoteOnce(qk);
                await runOneRefresh(false);
                try { await hydratePartSummaryOnce(qk); } catch (e) { console.error('QT35 hydrate failed', e); }
            } else {
                // Ensure the hub button exists with zero when we can’t detect a quote yet
                setBadgeCount(0);
            }
        } else {
            // Not on a target page: show a benign default
            setBadgeCount(0);
            // Off target page: make sure the button is gone
            lt.core.hub.remove?.(HUB_BTN_ID);
        }

        dlog('initialized');
    }
    function teardown() {
        booted = false;
        offUrl?.();
        offUrl = null;
        stopWizardPageObserver();
    }

    init();

    // Place near other module-level lets
    let lastWizardPage = null;
    let pageObserver = null;

    function startWizardPageObserver() {
        const root = document.querySelector('.plex-wizard-page-list');
        if (!root) return;
        const obs = new MutationObserver((mut) => {
            // class flips or child changes indicate page change
            if (mut.some(m => m.type === 'attributes' || m.type === 'childList')) {
                reconcileHubButtonVisibility();
            }
        });
        obs.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
        window.addEventListener('hashchange', reconcileHubButtonVisibility);
    }

    async function reconcileHubButtonVisibility() {
        if (isOnTargetWizardPage()) {
            await ensureHubButton();
        } else {
            lt.core.hub.remove?.(HUB_BTN_ID);
        }
    }

    //function startWizardPageObserver() {
    //    const root = document.querySelector('.plex-wizard') || document.body;
    //    lastWizardPage = getActiveWizardPageName();
    //    pageObserver?.disconnect();
    //    pageObserver = new MutationObserver(() => {
    //        const name = getActiveWizardPageName();
    //        if (name !== lastWizardPage) {
    //            lastWizardPage = name;
    //            if (isOnTargetWizardPage()) {
    //                queueMicrotask(async () => {
    //                    const qk = getQuoteKeyDeterministic();
    //                    if (qk && Number.isFinite(qk) && qk > 0) {
    //                        await ensureRepoForQuote(qk);
    //                        await mergeDraftIntoQuoteOnce(qk);
    //                        await runOneRefresh(false);
    //                        try { await hydratePartSummaryOnce(qk); } catch { }
    //                    }
    //                });
    //            }
    //        }
    //    });
    //    pageObserver.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'aria-current'] });
    //}

    function stopWizardPageObserver() {
        pageObserver?.disconnect();
        pageObserver = null;
    }

    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });

})();
