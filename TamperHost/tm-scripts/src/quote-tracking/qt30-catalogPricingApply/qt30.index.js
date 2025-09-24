// tm-scripts/src/qt30-catalogPricingApply/qt30.index.js

const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(async function () {
    // ---------- Config ----------
    const CONFIG = {
        DS_CatalogKeyByQuoteKey: 3156,
        DS_BreakpointsByPart: 4809,
        GRID_SEL: '.plex-grid',
        toastMs: 3500,
        settingsKey: 'qt30_settings_v1',
        // Legacy text matcher (kept for fallback only)
        SHOW_ON_PAGES_RE: /^part\s*summary$/i,
        // New: zero-based index of the Part Summary step in the wizard list
        PART_SUMMARY_STEP_INDEX: 1, // 0=Quote, 1=Part Summary, 2=Notes (based on your HTML)
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

    // ===== SPA wiring (qt35 pattern) =====
    let booted = false; let offUrl = null;

    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    async function init() {
        if (booted) return;
        booted = true;

        await lt.core.qt.ensureHubButton({
            id: HUB_BTN_ID,
            label: 'Apply Pricing',
            title: 'Apply customer catalog pricing',
            side: 'left',
            weight: 120,
            onClick: () => runApplyPricing(),
            // Only show when the active wizard step <li> is the configured index.
            // Completely ignores any "Part Summary" text elsewhere on the page.
            showWhen: () => {
                try {
                    // Strongest signal: the Part Summary form/actions exist in DOM
                    if (document.querySelector('#QuotePartSummaryForm,[id^="QuotePartSummaryForm_"]')) {
                        return true;
                    }
                    // Secondary: active wizard step’s visible label is exactly "Part Summary"
                    const active = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active');
                    return !!(active && active.textContent && active.textContent.trim().toLowerCase() === 'part summary');
                } catch {
                    return false;
                }
            },
            mount: 'nav'
        });

        // Safety fuse (no top-level await): defer via promise
        lt.core.qt.getHub({ mount: 'nav' }).then((hub) => {
            const list = Array.isArray(hub?.list?.()) ? hub.list() : [];
            const ids = list.map(x => (x && typeof x === 'object') ? x.id : x).filter(Boolean);
            const present = (typeof hub?.has === 'function') ? !!hub.has(HUB_BTN_ID) : ids.includes(HUB_BTN_ID);

            if (!present && typeof hub?.registerButton === 'function') {
                const def = { id: HUB_BTN_ID, label: 'Apply Pricing', title: 'Apply customer catalog pricing', weight: 120, onClick: () => runApplyPricing() };
                try { hub.registerButton('left', def); } catch { }

            }
        }).catch(() => { });
    }


    function teardown() {
        booted = false;
        offUrl?.(); offUrl = null;
    }

    // initialize for current route + wire route changes
    init();
    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });


    async function runApplyPricing() {
        const task = lt.core.hub.beginTask('Applying catalog pricing…', 'info');
        try {
            // auth
            try { if (!(await lt.core.auth.getKey())) { lt.core.hub.notify('Sign-in required', 'warn', { ms: 4000 }); task.error('No session'); return; } } catch { }

            const { quoteKey: qk } = getCtx() || {};
            if (!qk) { task.error('Quote_Key missing'); return; }

            // Ensure we’re operating on the correct quote scope
            await ensureRepoForQuote(qk);

            // 1) Ask lt-core to promote draft → quote (centralized path, one-shot first)
            try {
                // Prefer the single public entrypoint in lt-core
                await lt.core.qt.promoteDraftToQuote?.({ qk, strategy: 'once' });
            } catch { /* non-fatal; we’ll verify by reading header next */ }

            // 2) Re-read live quote header after promotion
            let header = await quoteRepo.getHeader?.() || {};
            let catalogKey =
                TMUtils.getObsValue?.(header, ['Catalog_Key', 'CatalogKey'], { first: true }) ?? null;

            // 3) If KO was still binding (very fast click), try a short retry window via lt-core
            if (catalogKey == null) {
                try {
                    await lt.core.qt.promoteDraftToQuote?.({ qk, strategy: 'retry' }); // short, internal retry
                    header = await quoteRepo.getHeader?.() || {};
                    catalogKey =
                        TMUtils.getObsValue?.(header, ['Catalog_Key', 'CatalogKey'], { first: true }) ?? null;
                } catch { /* still non-fatal; we’ll fall back to DS */ }
            }

            if (catalogKey == null) {
                task.update('Fetching Catalog Key…');
                const rows1 = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: qk }));
                catalogKey = rows1?.[0]?.Catalog_Key || null;
                if (catalogKey) await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: Number(catalogKey) });
            }
            if (catalogKey == null) { task.error('No Catalog Key'); lt.core.hub.notify('No catalog found for this quote', 'warn', { ms: 4000 }); return; }

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
            try {
                // handled by lt.core.qt.ensureHubButton() 
            } catch { }
        }
    }

    // ---------- Helpers ----------
    // Always read fresh context (SPA can change QuoteKey/Page)
    const getCtx = () => lt?.core?.qt?.getQuoteContext();


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
