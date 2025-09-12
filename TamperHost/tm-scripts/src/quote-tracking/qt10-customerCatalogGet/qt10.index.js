// src/quote-tracking/qt10-customerCatalogGet/qt10.index.js
// Drop-in module (bundled by build-plus/esbuild). No TM header here; your build injects it.
// Restores business logic from qt10.backup.js and fixes RepoBase class invocation.

(function () {
    'use strict';

    // ===== Dev flag (build-time with runtime fallback) =====
    const DEV = (typeof __BUILD_DEV__ !== 'undefined')
        ? __BUILD_DEV__
        : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

    // ===== Config =====
    const CFG = {
        NAME: 'QT10',
        ROUTES: [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],
        // KO-bound anchor we wait for to ensure VM is ready
        ANCHOR: '[data-val-property-name="CustomerNo"]',
        // Data sources
        DS_CATALOG_BY_CUSTOMER: 319,
        DS_CATALOG_CODE_BY_KEY: 22696,
        // If true, don’t pre-fire on page load; wait for a real user edit
        GATE_USER_EDIT: true,
        // Toast happy path
        TOAST_SUCCESS: true,
    };

    // ===== Debug / Logger / DEV toast =====
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    try { TMUtils.setDebug?.(IS_TEST_ENV); } catch { }
    const L = TMUtils.getLogger?.(CFG.NAME);
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // ===== Route allowlist =====
    // avoid depending on TMUtils timing; use regex on pathname
    if (!CFG.ROUTES.some(rx => rx.test(location.pathname))) return;

    (async () => {
        const hub = await ensureLTHub({
            theme: {
                name: "OneMonroe",
                primary: "#8B0902",
                primaryHi: "#890F10",
                surface: "#ffffff"
            },
            mount: 'beforePage',
            pageRootSelectors: ['#plexSidetabsMenuPage', '.plex-sidetabs-menu-page'],
            stick: false,
            gap: 8
        });

        hub.setStatus('Quote Wizard', 'info');
        hub.registerButton({ id: 'qt10-open', label: 'Open', weight: 110 });
        hub.registerButton({ id: 'sep', type: 'separator', weight: 120 });
        hub.registerButton({ id: 'qt10-refresh', label: 'Refresh', weight: 130 });
    })();





    // === Add this helper near the top (once) ===
    // Find lt.core.data in any same-origin frame
    function findDC(win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window)) {
        try { if (win.lt?.core?.data) return win.lt.core.data; } catch { }
        for (let i = 0; i < win.frames.length; i++) {
            try { const dc = findDC(win.frames[i]); if (dc) return dc; } catch { }
        }
        return null;
    }


    function getTabScopeId(ns = 'QT') {
        try {
            const k = `lt:${ns}:scopeId`;
            let v = sessionStorage.getItem(k);
            if (!v) {
                v = String(Math.floor(Math.random() * 2_147_483_647));
                sessionStorage.setItem(k, v);
            }
            return Number(v);
        } catch {
            // Fallback if sessionStorage is blocked
            return Math.floor(Math.random() * 2_147_483_647);
        }
    }

    // ===== Data via lt.core.data (flat {header, lines}) =====
    const SCOPE_DRAFT = 'draft';
    let QT = null;
    async function waitForDC(timeoutMs = 20000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const LT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.lt : window.lt);
            if (LT?.core?.data?.createDataContext) {
                // if our factory is already installed, we’re done
                if (LT.core.data.makeFlatScopedRepo) return LT.core.data;
            }
            // small sleep
            await (TMUtils.sleep?.(50) || new Promise(r => setTimeout(r, 50)));
        }
        throw new Error('DataCore not ready');
    }
    async function getQT() {
        if (QT) return QT;
        const DC = await waitForDC();
        // lt-data-core will install the factory soon after DC is ready; if still missing, retry once
        if (!DC.makeFlatScopedRepo) {
            await (TMUtils.sleep?.(50) || new Promise(r => setTimeout(r, 50)));
        }
        QT = DC.makeFlatScopedRepo({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' });
        return QT;
    }

    let repoDraft = null;
    async function ensureDraftRepo() {
        try {
            if (repoDraft) return repoDraft;

            // Non-blocking peek — do NOT wait 20s here
            const DC = findDC();
            if (!DC?.makeFlatScopedRepo) return null;
            const { use } = DC.makeFlatScopedRepo({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' });

            const { repo } = use(getTabScopeId('QT')); // <-- numeric, per-tab scope
            repoDraft = repo;
            await repoDraft.ensureFromLegacyIfMissing?.();
            return repoDraft;
        } catch (e) {
            console.debug('QT10: repo not available yet; skipping persistence this cycle', e);
            return null;
        }
    }


    // ===== Auth helpers =====
    async function withFreshAuth(run) {
        try { return await run(); }
        catch (err) {
            const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || '') || [])[1];
            if (+status === 419) { await lt.core.auth.getKey(); return await run(); }
            throw err;
        }
    }
    async function ensureAuthOrToast() {
        try { if (await lt.core.auth.getKey()) return true; } catch { }
        TMUtils.toast?.('Sign-in required. Please log in, then retry.', 'warn');
        return false;
    }

    // ===== DOM/KO readiness =====
    async function anchorAppears(sel, { timeoutMs = 10000, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(sel)) return true;
            await (TMUtils.sleep?.(pollMs) || new Promise(r => setTimeout(r, pollMs)));
        }
        return !!document.querySelector(sel);
    }

    // ===== Bootstrap (SPA-safe) =====
    let booted = false, booting = false, disposeWatcher = null, unsubscribeUrl = null;

    async function maybeBoot() {
        if (booted || booting) return;
        booting = true;
        try {
            if (!CFG.ROUTES.some(rx => rx.test(location.pathname))) return;
            if (!(await anchorAppears(CFG.ANCHOR))) return;
            if (!(await ensureAuthOrToast())) return;

            const { viewModel } = await TMUtils.waitForModelAsync(CFG.ANCHOR, {
                pollMs: 200, timeoutMs: 8000, logger: IS_TEST_ENV ? L : null
            });
            if (!viewModel) return;


            // IMPORTANT: QT10 is CATALOG-ONLY; do NOT store Quote_Key/Quote_No here.

            // Watch CustomerNo → look up catalog → write to DRAFT scope
            let lastCustomerNo = null;
            disposeWatcher = TMUtils.watchBySelector({
                selector: CFG.ANCHOR,
                // If user-gated, don’t fire an initial read; wait for real input
                initial: !CFG.GATE_USER_EDIT ? true : false,
                fireOn: 'blur',
                settleMs: 350,
                logger: IS_TEST_ENV ? L : null,
                onChange: async () => {
                    const customerNo = TMUtils.getObsValue(viewModel, 'CustomerNo', { first: true, trim: true });
                    if (!customerNo || customerNo === lastCustomerNo) return;
                    lastCustomerNo = customerNo;

                    await applyCatalogFor(customerNo, viewModel);
                }
            });

            booted = true;
        } catch (e) {
            booted = false;
            derror(`${CFG.NAME} init failed:`, e);
        } finally {
            booting = false;
        }
    }

    // ===== Core business logic: Customer → CatalogKey → CatalogCode =====
    async function applyCatalogFor(customerNo, vm) {
        if (!customerNo) return;
        try {
            // 1) Customer → CatalogKey
            const rows1 = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_BY_CUSTOMER, { Customer_No: customerNo })
            );
            const row1 = Array.isArray(rows1) ? rows1[0] : null;
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) { TMUtils.toast?.(`⚠️ No catalog for ${customerNo}`, 'warn'); return; }

            // 2) CatalogKey → CatalogCode
            const rows2 = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_CODE_BY_KEY, { Catalog_Key: catalogKey })
            );
            const catalogCode = (Array.isArray(rows2) ? rows2.map(r => r?.Catalog_Code).find(Boolean) : null) || '';

            // 3) Reflect in KO
            TMUtils.setObsValue(vm, 'CatalogKey', catalogKey);
            TMUtils.setObsValue(vm, 'CatalogCode', catalogCode);

            // 4) Stash into DRAFT scope (per-tab)
            // after you've computed catalogKey, catalogCode, etc.
            const repo = await ensureDraftRepo();
            if (repo) {
                // new (non-blocking, auto-retries until DC is ready)
                persistDraftHeaderWithRetry({
                    Customer_No: String(customerNo),
                    Catalog_Key: Number(catalogKey),
                    Catalog_Code: String(catalogCode || ''),
                    Catalog_Fetched_At: Date.now(),
                    Updated_At: Date.now(),
                });

            }

            if (CFG.TOAST_SUCCESS) {
                TMUtils.toast?.(
                    `✅ Customer: ${customerNo}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                    'success'
                );
            }
        } catch (err) {
            TMUtils.toast?.(`❌ Lookup failed: ${err?.message || err}`, 'error');
            derror(err);
        }
    }

    // ---- Best-effort persistence with retry (draft header) ----
    const __QT10_PERSIST = { queue: null, timer: null };
    async function persistDraftHeaderWithRetry(patch, maxTries = 120, intervalMs = 250) {
        try {
            const repo = await ensureDraftRepo(); // best-effort, may return null
            if (repo) {
                await repo.patchHeader(patch);
                return true;
            }
        } catch (e) {
            console.debug('QT10: repo not ready now, will retry', e);
        }

        // buffer patch and schedule retries
        __QT10_PERSIST.queue = { ...(__QT10_PERSIST.queue || {}), ...patch };
        if (__QT10_PERSIST.timer) return false;

        let triesLeft = maxTries;
        __QT10_PERSIST.timer = setInterval(async () => {
            try {
                const repoLater = await ensureDraftRepo();
                if (!repoLater) {
                    if (--triesLeft <= 0) {
                        clearInterval(__QT10_PERSIST.timer);
                        __QT10_PERSIST.timer = null;
                        console.debug('QT10: gave up persisting draft after retries');
                    }
                    return;
                }
                const payload = __QT10_PERSIST.queue;
                __QT10_PERSIST.queue = null;
                clearInterval(__QT10_PERSIST.timer);
                __QT10_PERSIST.timer = null;
                await repoLater.patchHeader(payload);
                console.debug('QT10: draft persisted after retry', payload);
            } catch (err) {
                console.warn('QT10: retry persist error', err);
            }
        }, intervalMs);

        return false;
    }


    // ===== SPA nav handling =====
    unsubscribeUrl = TMUtils.onUrlChange?.(() => {
        if (!CFG.ROUTES.some(rx => rx.test(location.pathname))) {
            try { disposeWatcher?.(); } catch { }
            disposeWatcher = null; booted = false; booting = false;
            return;
        }
        setTimeout(maybeBoot, 0);
    });

    setTimeout(maybeBoot, 0);

    // Expose helpers to the page context (so DevTools console can call them)
    const W = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

    W.QT10_debugDraft = async () => {
        const repo = await ensureDraftRepo();
        const snap = await repo?.get();
        console.debug('QT10 draft →', snap);
        return snap;
    };

    W.QT10_forceDraft = async (patch = {}) => {
        const repo = await ensureDraftRepo();
        if (!repo) { console.warn('QT10: repo not ready'); return null; }
        await repo.patchHeader({
            Customer_No: 'TEST',
            Catalog_Key: 99999,
            Catalog_Code: 'TestCatalog',
            Updated_At: Date.now(),
            ...patch
        });
        return await repo.get();
    };

    W.QT10_checkDC = () => !!(findDC()?.makeFlatScopedRepo);
    W.QT10_dcStatus = () => {
        const dc = findDC();
        return { hasCore: !!dc, hasFactory: !!dc?.makeFlatScopedRepo };
    };
})();