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
        wizardTargetPage: 'Part Summary',
        settingsKey: 'qt30_settings_v1',
        defaults: { deleteZeroQtyRows: true, unitPriceDecimals: 3, enableHoverAffordance: true },
    };

    // ---------- Bootstrap ----------
    const IS_TEST = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST);
    const L = TMUtils.getLogger?.('QT30');
    const log = (...a) => { if (DEV || IS_TEST) L?.log?.(...a); };
    const warn = (...a) => { if (DEV || IS_TEST) L?.warn?.(...a); };
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
            quoteRepo = repo; lastScope = qk;
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
        const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
        const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        const vm = activeEl ? KO?.dataFor?.(activeEl) : null;
        const name = vm ? (KO?.unwrap?.(vm.name) ?? (typeof vm.name === 'function' ? vm.name() : vm.name)) : '';
        if (name) return String(name);
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
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
            onClick: () => runApplyPricing()
        });

        // initial enable/disable by page
        refreshHubButtonEnablement();
    }

    function refreshHubButtonEnablement() {
        const hub = window.ltUIHub;
        if (!hub?.updateButton) return;
        const onTarget = getActiveWizardPageName().toLowerCase() === 'part summary';
        hub.updateButton(HUB_BTN_ID, { disabled: !onTarget, title: onTarget ? 'Apply customer catalog pricing' : 'Switch to Part Summary' });
    }

    TMUtils.onUrlChange?.(refreshHubButtonEnablement);
    new MutationObserver(refreshHubButtonEnablement)
        .observe(document.documentElement, { subtree: true, childList: true, attributes: true });

    // call once at bootstrap
    ensureHubButton();

    async function runApplyPricing() {
        const task = lt.core.hub.beginTask('Applying catalog pricing…', 'info');
        try {
            // auth
            try { if (!(await lt.core.auth.getKey())) { lt.core.hub.notify('Sign-in required', 'warn', { ms: 4000 }); task.error('No session'); return; } } catch { }

            const qk = getQuoteKeyDeterministic();
            if (!qk) { task.error('Quote_Key missing'); return; }

            await ensureRepoForQuote(qk);
            const header = await quoteRepo.getHeader?.() || {};
            let catalogKey = TMUtils.getObsValue?.(header, ['Catalog_Key', 'CatalogKey'], { first: true }) ?? null;

            if (!catalogKey) {
                task.update('Fetching Catalog Key…');
                const rows1 = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: qk }));
                catalogKey = rows1?.[0]?.Catalog_Key || null;
                if (catalogKey) await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: Number(catalogKey) });
            }
            if (!catalogKey) { task.error('No Catalog Key'); lt.core.hub.notify('No catalog found for this quote', 'warn', { ms: 4000 }); return; }

            // Collect parts from KO grid now
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

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
            // optional: refresh enablement if page changed due to SPA nav
            try { refreshHubButtonEnablement(); } catch { }
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
                const v = raw0 ? TMUtils.getObsValue?.(raw0, 'QuoteKey') : null;
                if (v != null) return Number(v);
            }
        } catch { }
        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const v = rootVM && (TMUtils.getObsValue?.(rootVM, 'QuoteKey') || TMUtils.getObsValue?.(rootVM, 'Quote.QuoteKey'));
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
