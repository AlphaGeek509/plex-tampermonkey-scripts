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
        // Prefer navbar mount globally
        window.__LT_HUB_MOUNT = 'body';
        // Let lt-core mount the hub (defaults to 'nav'); don't pre-mount here.
        lt.core.hub.setStatus("Ready", "info");
    })();




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

    // Flat repo factory (no polling required now that lt-data-core installs at doc-start)
    const QTF = lt.core?.data?.makeFlatScopedRepo
        ? lt.core.data.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" })
        : null;


    let repoDraft = null;
    async function ensureDraftRepo() {
        if (!QTF) return null;
        if (repoDraft) return repoDraft;
        const { repo } = QTF.use(getTabScopeId("QT"));
        repoDraft = repo;
        await repoDraft.ensureFromLegacyIfMissing?.();
        return repoDraft;
    }

    // Safe delegating wrapper: use lt.core.auth.withFreshAuth when available,
    // otherwise just run the callback once (best-effort fallback).
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return typeof impl === 'function' ? impl(fn) : fn();
    };


    async function ensureAuthOrToast() {
        try { if (await lt.core.auth.getKey()) return true; } catch { }
        lt.core.hub.notify('Auth looks stale. Retrying…', 'warn', { toast: true });
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

        const task = lt.core.hub.beginTask('Linking catalog…', 'info');

        try {
            // 1) Customer → CatalogKey
            const rows1 = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_BY_CUSTOMER, { Customer_No: customerNo })
            );
            const row1 = Array.isArray(rows1) ? rows1[0] : null;
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) { task.error('No catalog found for this customer.'); return; }

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

            // Build a clean display value that falls back correctly
            const codeTrimmed = (typeof catalogCode === 'string') ? catalogCode.trim() : '';
            const display = codeTrimmed || String(catalogKey ?? '');  // fall back to key if code is blank

            // If you’d like to show both when available:
            const msg = codeTrimmed
                ? `Linked: ${codeTrimmed} (key ${catalogKey})`
                : `Linked: key ${catalogKey}`;

            // Flash the success for ~3s
            task.success(msg, 3000);

        } catch (err) {
            task.error('No catalog found for this customer.');
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

    W.QT10_checkDC = () => !!(lt?.core?.data?.makeFlatScopedRepo);
    W.QT10_dcStatus = () => {
        const hasFactory = !!(lt?.core?.data?.makeFlatScopedRepo);
        return { hasCore: hasFactory, hasFactory };
    };

})();