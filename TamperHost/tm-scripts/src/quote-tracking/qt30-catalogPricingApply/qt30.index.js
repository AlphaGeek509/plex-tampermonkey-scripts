// tm-scripts/src/qt30-catalogPricingApply/qt30.index.js

const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(() => {
    // ---------- Config ----------
    const CONFIG = {
        DS_CatalogKeyByQuoteKey: 3156,
        DS_BreakpointsByPart: 4809,
        GRID_SEL: '.plex-grid',
        toastMs: 3500,
        settingsKey: 'qt30_settings_v1',
        SHOW_ON_PAGES_RE: /^part\s*summary$/i,
        FORCE_SHOW_BTN: false,
        defaults: { deleteZeroQtyRows: true, unitPriceDecimals: 3, enableHoverAffordance: true },
    };

    // ---------- Bootstrap ----------
    const IS_TEST = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST);
    const L = TMUtils.getLogger?.('QT30');
    const log = (...a) => { if (DEV || IS_TEST) L?.log?.(...a); };
    const err = (...a) => { if (DEV || IS_TEST) L?.error?.(...a); };
    const KO = (typeof unsafeWindow !== 'undefined' && unsafeWindow.ko) ? unsafeWindow.ko : window.ko;
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some(rx => rx.test(location.pathname))) { log('QT30: wrong route, skipping'); return; }

    // Hub-first mount (nav variant) — align with qt10/qt20/qt35
    window.__LT_HUB_MOUNT = "nav";
    (async () => {
        try { await window.ensureLTHub?.({ mount: "nav" }); } catch { }
        lt.core.hub.notify("Ready", "info", { sticky: true });
    })();


    // ===== QuoteRepo via lt-data-core flat {header, lines} =====
    let QT = null, quoteRepo = null, lastScope = null;

    // Session-scoped id so draft survives page updates in this tab
    function getTabScopeId(ns = "QT") {
        try {
            const k = `lt:${ns}:scopeId`;
            let v = sessionStorage.getItem(k);
            if (!v) { v = String(Math.floor(Math.random() * 2147483647)); sessionStorage.setItem(k, v); }
            return Number(v);
        } catch {
            return Math.floor(Math.random() * 2147483647);
        }
    }



    async function getQT() {
        if (QT) return QT;
        const DC = lt.core?.data;
        if (!DC?.makeFlatScopedRepo) throw new Error('DataCore not ready');
        QT = DC.makeFlatScopedRepo({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' });
        return QT;
    }

    async function ensureRepoForQuote(qk) {
        if (!qk) return null;
        if (!quoteRepo || lastScope !== qk) {
            const { repo } = (await getQT()).use(Number(qk));
            await repo.ensureFromLegacyIfMissing?.();
            quoteRepo = repo;
            lastScope = qk;
        }
        return quoteRepo;
    }

    // Try current tab-scoped draft first; fall back to legacy "draft" scope
    async function getDraftHeaderFlex() {
        try {
            const QTF = await getQT();
            // Tab-scoped draft
            let { repo: r1 } = QTF.use(getTabScopeId("QT"));
            let d1 = await (r1.getHeader?.() || r1.get?.());
            if (d1 && Object.keys(d1).length) return d1;

            // Legacy "draft" scope (hashed string scope)
            let { repo: r2 } = QTF.use("draft");
            let d2 = await (r2.getHeader?.() || r2.get?.());
            if (d2 && Object.keys(d2).length) return d2;

            return null;
        } catch {
            return null;
        }
    }


    // Draft → Quote promotion (single-shot), mirrors qt35
    async function mergeDraftIntoQuoteOnce(qk) {
        try {
            if (!qk || !Number.isFinite(qk) || qk <= 0) return;
            const QTF = await getQT();
            const { repo: draftRepo } = QTF.use(window.getTabScopeId ? window.getTabScopeId("QT") : (window.__LT_QT_SCOPE_ID__ ||= Math.floor(Math.random() * 2147483647)));
            const draft = (await draftRepo.getHeader?.()) || (await draftRepo.get?.());
            if (!draft || !Object.keys(draft).length) return;

            await ensureRepoForQuote(qk);
            const current = (await quoteRepo.getHeader?.()) || {};
            const curCust = String(current.Customer_No ?? "");
            const newCust = String(draft.Customer_No ?? "");
            const needsMerge =
                Number((await draftRepo.get())?.Updated_At || 0) > Number(current.Promoted_At || 0) ||
                curCust !== newCust ||
                current.Catalog_Key !== draft.Catalog_Key ||
                current.Catalog_Code !== draft.Catalog_Code;

            if (!needsMerge) return;

            await quoteRepo.patchHeader({
                Quote_Key: Number(qk),
                Customer_No: draft.Customer_No ?? null,
                Catalog_Key: draft.Catalog_Key ?? null,
                Catalog_Code: draft.Catalog_Code ?? null,
                Promoted_From: "draft",
                Promoted_At: Date.now(),
                // Force hydration later if you add it to qt30
                Quote_Header_Fetched_At: null
            });

            await draftRepo.clear?.();
            try {
                const { repo: legacy } = QTF.use("draft");
                await legacy.clear?.();
            } catch { }
        } catch (e) {
            // silent: keep qt30 resilient
        }
    }


    // ---------- Settings (GM tolerant) ----------
    const loadSettings = () => {
        try {
            const v = GM_getValue(CONFIG.settingsKey, CONFIG.defaults);
            return typeof v === 'string' ? { ...CONFIG.defaults, ...JSON.parse(v) } : { ...CONFIG.defaults, ...v };
        } catch { return { ...CONFIG.defaults }; }
    };
    const saveSettings = (next) => {
        try { GM_setValue(CONFIG.settingsKey, next); }
        catch { GM_setValue(CONFIG.settingsKey, JSON.stringify(next)); }
    };


    // Delegate to lt.core.auth wrapper (qt20/qt35 pattern)
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return (typeof impl === 'function') ? impl(fn) : fn();
    };

    // Hub button registration (qt35 pattern)
    const HUB_BTN_ID = 'qt30-apply-pricing';

    async function getHub(opts = { mount: "nav" }) {
        for (let i = 0; i < 50; i++) {
            const ensure = (window.ensureLTHub || unsafeWindow?.ensureLTHub);
            if (typeof ensure === 'function') {
                try { const hub = await ensure(opts); if (hub) return hub; } catch { }
            }
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    }

    function getActiveWizardPageName() {
        // Active LI renders the page name as a direct text node (qt35 logic)
        const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active');
        if (!li) return '';
        return (li.textContent || '').trim().replace(/\s+/g, ' ');
    }
    function isOnTargetWizardPage() {
        return CONFIG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }


    async function ensureHubButton() {
        const hub = await getHub({ mount: "nav" });
        if (!hub?.registerButton) return;

        const already = hub.list?.()?.includes(HUB_BTN_ID);
        if (already) return;

        hub.registerButton('left', {
            id: HUB_BTN_ID,
            label: 'Apply Pricing',
            title: 'Apply customer catalog pricing',
            weight: 120,
            onClick: () => runApplyPricing()
        });
    }

    // ===== SPA wiring (qt35 pattern) =====
    let booted = false; let offUrl = null;

    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    async function reconcileHubButtonVisibility() {
        // Show only on target page (unless forced)
        if (CONFIG.FORCE_SHOW_BTN || isOnTargetWizardPage()) {
            await ensureHubButton();
        } else {
            const hub = await getHub();
            hub?.remove?.(HUB_BTN_ID);
        }
    }

    let pageObserver = null;
    function startWizardPageObserver() {
        const root = document.querySelector('.plex-wizard-page-list');
        if (!root) return;
        pageObserver = new MutationObserver((mut) => {
            if (mut.some(m => m.type === 'attributes' || m.type === 'childList')) {
                reconcileHubButtonVisibility();
            }
        });
        pageObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
        window.addEventListener('hashchange', reconcileHubButtonVisibility);
    }
    function stopWizardPageObserver() {
        try { window.removeEventListener('hashchange', reconcileHubButtonVisibility); } catch { }
        try { pageObserver?.disconnect(); } catch { }
        pageObserver = null;
    }

    async function init() {
        if (booted) return;
        booted = true;

        try { await getHub({ mount: "nav" }); } catch { }
        await reconcileHubButtonVisibility();
        startWizardPageObserver();
    }
    function teardown() {
        booted = false;
        offUrl?.(); offUrl = null;
        stopWizardPageObserver();
    }

    // initialize for current route + wire route changes
    init();
    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });


    async function runApplyPricing() {
        const task = lt.core.hub.beginTask('Applying catalog pricing…', 'info');
        try {
            // auth
            try { if (!(await lt.core.auth.getKey())) { lt.core.hub.notify('Sign-in required', 'warn', { ms: 4000 }); task.error('No session'); return; } } catch { }

            const qk = getQuoteKeyDeterministic();
            if (!qk) { task.error('Quote_Key missing'); return; }

            await ensureRepoForQuote(qk);

            // Promote draft to quote header (one-shot), then read header
            try {
                const draft = await getDraftHeaderFlex();
                if (draft && Object.keys(draft).length) {
                    await quoteRepo.patchHeader?.({
                        Quote_Key: Number(qk),
                        Customer_No: draft.Customer_No ?? null,
                        Catalog_Key: draft.Catalog_Key ?? null,
                        Catalog_Code: draft.Catalog_Code ?? null,
                        Promoted_From: "draft",
                        Promoted_At: Date.now(),
                        Quote_Header_Fetched_At: null
                    });
                }
            } catch { /* keep resilient */ }

            let header = await quoteRepo.getHeader?.() || {};
            let catalogKey = TMUtils.getObsValue?.(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;

            if (!catalogKey) {
                try {
                    const KO = (typeof unsafeWindow !== "undefined") ? unsafeWindow.ko : window.ko;
                    const grid = document.querySelector(CONFIG.GRID_SEL);
                    const gridVM = grid && KO?.dataFor ? KO.dataFor(grid) : null;
                    const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
                    const ck = raw0 ? TMUtils.getObsValue?.(raw0, ["CatalogKey", "Catalog_Key"], { first: true }) : null;

                    if (ck != null) {
                        catalogKey = Number(ck);
                        await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: catalogKey });
                        header = await quoteRepo.getHeader?.() || {};
                    }
                } catch { /* non-fatal */ }
            }


            if (!catalogKey) {
                task.update('Fetching Catalog Key…');
                const rows1 = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: qk }));
                catalogKey = rows1?.[0]?.Catalog_Key || null;
                if (catalogKey) await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: Number(catalogKey) });
            }
            if (!catalogKey) { task.error('No Catalog Key'); lt.core.hub.notify('No catalog found for this quote', 'warn', { ms: 4000 }); return; }

            // Collect parts from KO grid now (reuse top-level KO)
            const grid = document.querySelector(CONFIG.GRID_SEL);

            const raw = (grid && KO?.dataFor && Array.isArray(KO.dataFor(grid)?.datasource?.raw))
                ? KO.dataFor(grid).datasource.raw : [];

            const partNos = [...new Set(raw.map(r => TMUtils.getObsValue?.(r, "PartNo", { first: true, trim: true })).filter(Boolean))];
            if (!partNos.length) { task.error('No PartNo values'); lt.core.hub.notify('No PartNo values found', 'warn', { ms: 4000 }); return; }

            task.update(`Loading ${partNos.length} part(s)…`);
            const now = new Date();
            const priceMap = {};
            await Promise.all(partNos.map(async (p) => {
                const rows = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_BreakpointsByPart, { Catalog_Key: catalogKey, Catalog_Part_No: p })) || [];
                priceMap[p] = rows
                    .filter(r => r.Catalog_Part_No === p && new Date(r.Effective_Date) <= now && now <= new Date(r.Expiration_Date))
                    .sort((a, b) => a.Breakpoint_Quantity - b.Breakpoint_Quantity);
            }));

            // 3) Apply or delete per row (qt-standard loop)
            const S = loadSettings();
            const round = (n) => +(+n).toFixed(S.unitPriceDecimals);

            // Reuse grid/raw resolved above (avoid redeclaration)

            for (let i = 0; i < raw.length; i++) {
                const row = raw[i];
                const qty = +(TMUtils.getObsValue(row, 'Quantity', { first: true, trim: true }) || 0);

                // Delete zero-qty rows (standard behavior)
                if (qty <= 0 && S.deleteZeroQtyRows) {
                    const qkRow = TMUtils.getObsValue(row, ['QuoteKey', 'Quote_Key'], { first: true, trim: true });
                    const qpk = TMUtils.getObsValue(row, ['QuotePartKey', 'Quote_Part_Key'], { first: true, trim: true });
                    const qpr = TMUtils.getObsValue(row, ['QuotePriceKey', 'Quote_Price_Key'], { first: true, trim: true });

                    if (qkRow && qpk && qpr) {
                        try {
                            // Build x-www-form-urlencoded payload so it works whether TMUtils.fetchData or native fetch is used
                            const form = new URLSearchParams();
                            form.set('QuoteKey', String(Number(qkRow)));
                            form.set('QuotePartKey', String(Number(qpk)));
                            form.set('QuotePriceKey', String(Number(qpr)));

                            // Anti-forgery token (if present on page)
                            const rvt = document.querySelector('input[name="__RequestVerificationToken"]')?.value
                                || document.querySelector('meta[name="__RequestVerificationToken"]')?.content;
                            if (rvt) form.set('__RequestVerificationToken', rvt);

                            await withFreshAuth(() => lt.core.http.post(
                                '/SalesAndCRM/QuotePart/DeleteQuotePrice',
                                form.toString(),
                                { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }
                            ));

                            lt.core.hub.notify(`Deleted row[${i}]`, 'success', { ms: 2500 });

                        } catch (e) {
                            err('QT30 delete error', e);
                            lt.core.hub.notify(`Delete failed row[${i}]`, 'error', { ms: 3000 });
                        }
                    } else {
                        lt.core.hub.notify(`Skip delete row[${i}] — missing keys`, 'warn', { ms: 2500 });
                    }

                    continue;
                }

                // Apply price to non-zero rows
                if (qty > 0) {
                    const partNo = TMUtils.getObsValue(row, 'PartNo', { first: true, trim: true });
                    const bp = pickPrice(priceMap[partNo], qty);
                    if (bp == null) continue;
                    applyPriceToRow(row, round(bp));
                    log(`QT30: row[${i}] qty=${qty} price=${round(bp)}`);
                }
            }

            task.update('Refreshing grid…');
            const mode = await refreshQuoteGrid();

            task.success('Pricing applied');
            lt.core.hub.notify(
                mode ? 'Pricing applied and grid refreshed' : 'Pricing applied (reload may be needed)',
                'success',
                { ms: 3000 }
            );

        } catch (e) {
            task.error('Failed');
            lt.core.hub.notify(`Apply failed: ${e?.message || e}`, 'error', { ms: 4000 });
        } finally {
            // reconcile presence if SPA navigation changed the page
            try { await reconcileHubButtonVisibility(); } catch { }
        }
    }


    // ---------- Helpers ----------
    // Deterministic QuoteKey (qt35 pattern)
    function getQuoteKeyDeterministic() {
        try {
            const grid = document.querySelector(CONFIG.GRID_SEL);
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
            if (grid && KO?.dataFor) {
                const gridVM = KO.dataFor(grid);
                const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
                const v = raw0 ? TMUtils.getObsValue?.(raw0, ['QuoteKey', 'Quote_Key']) : null;
                if (v != null) return Number(v);
            }
        } catch { }
        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const v = rootVM && (
                TMUtils.getObsValue?.(rootVM, ['QuoteKey', 'Quote_Key']) ||
                TMUtils.getObsValue?.(rootVM, ['Quote.QuoteKey', 'Quote.Quote_Key'])
            );

            if (v != null) return Number(v);
        } catch { }
        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    function pickPrice(bps, qty) {
        if (!bps?.length) return null;
        if (qty < bps[0].Breakpoint_Quantity) return bps[0].Breakpoint_Price;
        const last = bps[bps.length - 1];
        if (qty >= last.Breakpoint_Quantity) return last.Breakpoint_Price;
        for (let i = 0; i < bps.length - 1; i++) {
            if (qty >= bps[i].Breakpoint_Quantity && qty < bps[i + 1].Breakpoint_Quantity) return bps[i].Breakpoint_Price;
        }
        return null;
    }
    function applyPriceToRow(row, price) {
        TMUtils.setObsValue(row, 'RvCustomizedUnitPrice', price);
    }

    /**
     * Try to refresh the Quote grid visuals after apply/delete ops.
     * Order of attempts:
     *  1) KO grid VM datasource.read() (async)
     *  2) grid VM .refresh() (sync)
     *  3) Wizard nav to current page (rebinds page)
     * Returns a string describing which path succeeded, or null.
     */
    async function refreshQuoteGrid() {
        // Prefer a KO-level refresh if available
        try {
            const gridEl = document.querySelector(CONFIG.GRID_SEL);
            const gridVM = gridEl && KO?.dataFor?.(gridEl);

            if (typeof gridVM?.datasource?.read === 'function') {
                await gridVM.datasource.read();   // async re-query/rebind
                return 'ds.read';
            }
            if (typeof gridVM?.refresh === 'function') {
                gridVM.refresh();                  // sync visual refresh
                return 'vm.refresh';
            }
        } catch { }

        // Fallback: wizard navigate to the same active page to force rebind
        try {
            const wiz = unsafeWindow.plex?.currentPage?.QuoteWizard;
            if (wiz?.navigatePage) {
                const active = (typeof wiz.activePage === 'function') ? wiz.activePage() : wiz.activePage;
                wiz.navigatePage(active);
                return 'wiz.navigatePage';
            }
        } catch { }

        return null;
    }

    // ---------- Tiny DEV test seam ----------
    if (DEV && typeof window !== 'undefined') {
        window.__QT30__ = { pickPrice, applyPriceToRow, runApplyPricing };
    }
})();
