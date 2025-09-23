// tm-scripts/src/quote-tracking/qt35-attachmentsGet/qt35.index.js

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
    const FORCE_SHOW_BTN = false; // set to true during testing
    if (!ROUTES.some(rx => rx.test(location.pathname))) return;

    // Mount hub into the NAV bar like QT10
    // NOTE: Do not await at top-level. init() performs the awaited mount.
    ROOT.__LT_HUB_MOUNT = "nav";

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const raf = () => new Promise(r => requestAnimationFrame(r));

    const CFG = {
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        //SHOW_ON_PAGES_RE: /\bsummary\b/i,
        SHOW_ON_PAGES_RE: /^part\s*summary$/i,
        DS_ATTACHMENTS_BY_QUOTE: 11713,
        ATTACHMENT_GROUP_KEY: 11,
        DS_QUOTE_HEADER_GET: 3156,
        POLL_MS: 200,
        TIMEOUT_MS: 12000
    };

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

    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
        return viewModel;
    }

    const QT_CTX = lt?.core?.qt?.getQuoteContext();

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
    function schedulePromoteDraftToQuote(qk) {
        return lt?.core?.qt?.promoteDraftToQuote({ qk: Number(qk), strategy: 'retry' });
    }

    function stopPromote() {
        return lt?.core?.qt?.stopRetry?.();
    }

    async function mergeDraftIntoQuoteOnce(qk) {
        return lt?.core?.qt?.promoteDraftToQuote({ qk: Number(qk), strategy: 'once' });
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

    async function setBadgeCount(n) {
        const count = Number(n ?? 0);
        const hub = await lt.core.qt.getHub({ mount: "nav" });
        if (!hub?.registerButton) return;

        // If hub supports updateButton, use it; otherwise minimal churn
        if (typeof hub.updateButton === 'function') {
            hub.updateButton(HUB_BTN_ID, { label: `Attachments ${count}` });
            return;
        }

        // Fallback: only re-register if not present (avoid remove/re-add churn)
        const list = hub.list?.();
        const already = Array.isArray(list) && list.includes(HUB_BTN_ID);
        if (!already) {
            hub.registerButton('left', {
                id: HUB_BTN_ID,
                label: `Attachments ${count}`,
                title: 'Refresh attachments (manual)',
                weight: 120,
                onClick: () => runOneRefresh(true)
            });
        } else {
            // No update API; do a gentle replace
            hub.remove?.(HUB_BTN_ID);
            hub.registerButton('left', {
                id: HUB_BTN_ID,
                label: `Attachments ${count}`,
                title: 'Refresh attachments (manual)',
                weight: 120,
                onClick: () => runOneRefresh(true)
            });
        }
    }

    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
        await lt.core.qt.ensureHubButton({
            id: HUB_BTN_ID,
            label: 'Attachments 0',
            title: 'Refresh attachments (manual)',
            side: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true),
            showWhen: (ctx) =>
                (typeof FORCE_SHOW_BTN !== 'undefined' && FORCE_SHOW_BTN) ||
                CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) ||
                ctx.isOnPartSummary,
            mount: 'nav'
        });

        if (refreshInFlight) return;
        refreshInFlight = true;
        const t = lt.core.hub.beginTask("Fetching Attachments…", "info");


        try {
            await ensureWizardVM();
            const qk = (QT_CTX?.quoteKey);
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
                    ok ? `✅ ${count} attachment(s)` : '⚠️ No attachments',
                    ok ? 'success' : 'warn',
                    { timeout: 2000, toast: true }
                );
            }
            dlog('refresh', { qk, count });

        } catch (err) {
            derr('refresh failed', err);
            t.error(`❌ Attachments refresh failed: ${err?.message || err}`, 4000);
            lt.core.hub.notify(
                `❌ Attachments refresh failed: ${err?.message || err}`,
                'error',
                { timeout: 4000, toast: true }
            );
        } finally {
            refreshInFlight = false;
        }
    }

    // Listen for modal-close refresh requests from QT20
    let __qt35_autoRefreshTimer = null;
    function onAttachmentRefreshRequested(ev) {
        try {
            // Only refresh on Part Summary
            const ctx = lt?.core?.qt?.getQuoteContext?.();
            const onPartSummary = !!(ctx && (ctx.isOnPartSummary || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName || '')));
            if (!onPartSummary) return;

            // Debounce rapid duplicate fires
            clearTimeout(__qt35_autoRefreshTimer);
            __qt35_autoRefreshTimer = setTimeout(() => { runOneRefresh(false); }, 200);
        } catch { /* no-op */ }
    }

    // ===== SPA wiring =====

    let booted = false; let offUrl = null;
    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    async function init() {
        if (booted) return;
        booted = true;

        // Auto-refresh when QT20’s modal closes
        try { window.addEventListener('LT:AttachmentRefreshRequested', onAttachmentRefreshRequested, false); } catch { }

        await lt.core.qt.ensureHubButton({
            id: 'qt35-attachments-btn',
            label: 'Attachments 0',
            title: 'Refresh attachments (manual)',
            side: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true),
            showWhen: (ctx) => (typeof FORCE_SHOW_BTN !== 'undefined' && FORCE_SHOW_BTN) || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) || ctx.isOnPartSummary,
            mount: 'nav'
        });
    }
    function teardown() {
        booted = false;
        offUrl?.();
        offUrl = null;
        stopPromote(); // ensure background timer is cleared
        try { window.removeEventListener('LT:AttachmentRefreshRequested', onAttachmentRefreshRequested, false); } catch { }
        // Hub visibility is handled centrally via ensureHubButton()
    }

    init();

    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });
})();
