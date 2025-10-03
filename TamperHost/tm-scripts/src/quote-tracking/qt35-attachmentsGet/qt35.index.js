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

    // --- Active wizard page helpers ---
    function getActiveWizardPageName() {
        const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]');
        return (li?.textContent || '').trim().replace(/\s+/g, ' ');
    }
    function isOnPartSummary() {
        return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }


    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
        return viewModel;
    }

    let quoteRepo = null, lastScope = null;
    let __QT__ = null;

    async function ensureRepoForQuote(quoteKey) {
        try {
            const repo = await lt?.core?.qt?.useQuoteRepo?.(Number(quoteKey));
            quoteRepo = repo;
            lastScope = Number(quoteKey);
            return repo;
        } catch {
            return null;
        }
    }

    // --- BOUNDED CONTEXT WARM-UP (no infinite polling) ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function ensureRepoReady(qk, attempts = 6, delayMs = 250) {
        // Try a few short times to allow DC/Repo to come up after modal close/promote
        for (let i = 0; i < attempts; i++) {
            await ensureRepoForQuote(qk);
            if (quoteRepo) return quoteRepo;
            await sleep(delayMs);
        }
        return null;
    }


    // Background promotion (per-tab draft -> per-quote) with gentle retries
    function stopPromote() {
        return lt?.core?.qt?.stopRetry?.();
    }

    // Promote the tab-scope draft into the per-quote repo only if a real draft exists.
    // Also guard so we don't even attempt more than once per quote in this tab.
    function __guardKeyForPromote(qk) { return `qt35:promoted:${Number(qk) || 0}`; }

    async function promoteDraftIfPresentOnce(qk) {
        const key = __guardKeyForPromote(qk);
        try { if (sessionStorage.getItem(key) === '1') return 'guarded'; } catch { /* ignore */ }

        // Only call into core if a draft actually exists
        const draftRepo = await lt?.core?.qt?.useDraftRepo?.();
        const draft = draftRepo && ((await draftRepo.getHeader?.()) || (await draftRepo.get?.()));
        const hasDraft = !!(draft && Object.keys(draft).length);
        if (!hasDraft) return 'no-draft';

        const res = await lt?.core?.qt?.promoteDraftToQuote?.({ qk: Number(qk), strategy: 'once' }) || 'noop';

        // Core clears the draft on 'merged'; either way, we avoid re-attempts for this tab/quote
        try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
        return res;
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

    // ===== Hub button =====
    const HUB_BTN_ID = 'qt35-attachments-btn';

    async function setBadgeCount(n) {
        const count = Number(n ?? 0);
        const hub = await lt.core.qt.getHub({ mount: "nav" });
        if (!hub?.registerButton) return;

        // If hub supports updateButton, use it; otherwise minimal churn
        const label = `Attachments (${count})`;
        if (typeof hub.updateButton === 'function') {
            hub.updateButton(HUB_BTN_ID, { label });
            return;
        }

        // Fallback: only re-register if not present (avoid remove/re-add churn)
        const list = hub.list?.();
        const already = Array.isArray(list) && list.includes(HUB_BTN_ID);
        if (!already) {
            hub.registerButton('left', {
                id: HUB_BTN_ID,
                label,
                title: 'Refresh attachments (manual)',
                weight: 120,
                onClick: () => runOneRefresh(true)
            });
        } else {
            // No update API; do a gentle replace
            hub.remove?.(HUB_BTN_ID);
            hub.registerButton('left', {
                id: HUB_BTN_ID,
                label: `Attachments (${count})`,
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
            label: 'Attachments (0)',
            title: 'Refresh attachments (manual)',
            side: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true),
            showWhen: () => true,
            //showWhen: (ctx) =>
            //    (typeof FORCE_SHOW_BTN !== 'undefined' && FORCE_SHOW_BTN) ||
            //    CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) ||
            //    ctx.isOnPartSummary,
            mount: 'nav'
        });

        if (refreshInFlight) return;
        refreshInFlight = true;
        const t = lt.core.hub.beginTask("Fetching Attachments…", "info");


        try {
            await ensureWizardVM();
            const ctx = lt?.core?.qt?.getQuoteContext?.();
            const qk = Number(ctx?.quoteKey);

            if (!qk || !Number.isFinite(qk) || qk <= 0) {
                setBadgeCount(0);
                t.error(`⚠️ Quote Key not found`, 5000);
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

            // Promote only if a real draft exists; otherwise skip fast
            await promoteDraftIfPresentOnce(qk);

            // After promotion, (re)ensure the per-quote repo with bounded retries
            await ensureRepoReady(qk, 6, 250);

            if (!quoteRepo) {
                // No endless spinner; fail fast, user can click again or it will work next fire
                t.error('Data context warming — try again in a moment', 500);
                return;
            }

            const count = await fetchAttachmentCount(qk);
            setBadgeCount(count);
            await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });

            // Always resolve the task
            const ok = count > 0;
            t.success(ok ? `${count} attachment(s)` : 'No attachments', 5000);

            // Optional toast when user clicked manually
            if (manual) {
                lt.core.hub.notify(
                    ok ? `${count} attachment(s)` : 'No attachments',
                    ok ? 'success' : 'warn',
                    { toast: true }
                );
            }
            dlog('refresh', { qk, count });

        } catch (err) {
            derr('refresh failed', err);
            t.error(`Attachments refresh failed: ${err?.message || err}`, 5000);
            lt.core.hub.notify(
                `Attachments refresh failed: ${err?.message || err}`,
                'error',
                { toast: true }
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
            __qt35_autoRefreshTimer = setTimeout(() => { runOneRefresh(false); }, 350);
        } catch { /* no-op */ }
    }

    // ===== SPA wiring =====

    let booted = false; let offUrl = null;
    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    // Track whether we were previously on Part Summary to detect transitions
    let wasOnPartSummary = false;
    let __qt35_pageActivateTimer = null;
    let __qt35_navObserver = null;

    function scheduleRefreshOnActive(delay = 250) {
        clearTimeout(__qt35_pageActivateTimer);
        __qt35_pageActivateTimer = setTimeout(() => {
            try {
                // Only refresh if we truly are on Part Summary
                if (isOnPartSummary()) runOneRefresh(false);
            } catch { /* no-op */ }
        }, delay);
    }

    function onWizardPageMutation() {
        const nowOn = isOnPartSummary();
        if (nowOn && !wasOnPartSummary) {
            // Page just became active -> refresh attachments
            scheduleRefreshOnActive(250);
        }
        wasOnPartSummary = nowOn;
    }

    async function init() {

        if (booted) return;
        booted = true;

        // Auto-refresh when QT20’s modal closes
        try { window.addEventListener('LT:AttachmentRefreshRequested', onAttachmentRefreshRequested, false); } catch { }

        await lt.core.qt.ensureHubButton({
            id: 'qt35-attachments-btn',
            label: 'Attachments (0)',
            title: 'Refresh attachments (manual)',
            side: 'left',
            weight: 120,
            onClick: () => runOneRefresh(true),
            showWhen: (ctx) => (typeof FORCE_SHOW_BTN !== 'undefined' && FORCE_SHOW_BTN) || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) || ctx.isOnPartSummary,
            mount: 'nav'
        });

        // Observe wizard page changes to detect when Part Summary becomes active
        try {
            const nav = document.querySelector('.plex-wizard-page-list');
            if (nav && !__qt35_navObserver) {
                __qt35_navObserver = new MutationObserver(onWizardPageMutation);
                __qt35_navObserver.observe(nav, { subtree: true, attributes: true, childList: true });
            }
        } catch { /* ignore */ }

        // Also react to hash changes (some SPA routes use hash navigation)
        try { window.addEventListener('hashchange', onWizardPageMutation); } catch { /* ignore */ }

        // Seed prior state & trigger initial refresh if we already landed on the target page
        wasOnPartSummary = isOnPartSummary();
        if (wasOnPartSummary) scheduleRefreshOnActive(150);
    }
    function teardown() {
        booted = false;
        offUrl?.();
        offUrl = null;
        stopPromote(); // ensure background timer is cleared
        try { window.removeEventListener('LT:AttachmentRefreshRequested', onAttachmentRefreshRequested, false); } catch { }

        // Disconnect page activation observers/listeners
        try { window.removeEventListener('hashchange', onWizardPageMutation); } catch { }
        try { __qt35_navObserver?.disconnect?.(); } catch { }
        __qt35_navObserver = null;
        clearTimeout(__qt35_pageActivateTimer);
        __qt35_pageActivateTimer = null;

        // Hub visibility is handled centrally via ensureHubButton()
    }

    init();

    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });
})();
