/* Build-time dev flag (esbuild sets __BUILD_DEV__), with a runtime fallback for tests */
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(function () {
    'use strict';

    // ===== Config =====
    const CFG = {
        NAME: 'QT10',
        ROUTES: [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],
        ANCHOR: '[data-val-property-name="CustomerNo"]',
        DS_CATALOG_BY_CUSTOMER: 319,
        DS_CATALOG_CODE_BY_KEY: 22696,
        GATE_USER_EDIT: true,
        TOAST_SUCCESS: true,
    };

    // ===== Debug / Logger / DEV toast =====
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);

    const L = TMUtils.getLogger?.(CFG.NAME);
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // ===== Data via lt.core.data (your lt-data-core) =====
    const hasDataCore = !!(lt?.core?.data?.createDataContext && lt?.core?.data?.RepoBase?.value);
    const SCOPE_DRAFT = 'draft';
    const scopeForQuote = (qk) => (qk ? String(qk) : SCOPE_DRAFT);

    let ctx = null, quoteRepo = null, lastScope = null;
    async function ensureRepoScope(scopeKey) {
        if (!scopeKey || !hasDataCore) return null;
        if (!ctx || lastScope !== scopeKey) {
            ctx = lt.core.data.createDataContext({ ns: 'QT', scopeKey, persist: 'session', ttlMs: 3000 });
            class QuoteRepo extends lt.core.data.RepoBase.value {
                constructor(base) { super({ ...base, entity: 'quote' }); }
                async get() { return this.read('current'); }
                async set(m) { return this.write('current', m); }
                async update(patch) {
                    const prev = (await this.get()) ?? {};
                    return this.write('current', { ...prev, ...patch, Updated_At: Date.now() });
                }
                async clear() { return this.remove('current'); }
            }
            quoteRepo = ctx.makeRepo(QuoteRepo);
            lastScope = scopeKey;
        }
        return quoteRepo;
    }

    // ===== Route allowlist =====
    if (!TMUtils.matchRoute?.(CFG.ROUTES)) return;

    async function withFreshAuth(run) {
        try { return await run(); }
        catch (err) {
            const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || '') || [])[1];
            if (+status === 419) {
                await lt.core.auth.getKey();
                return await run();
            }
            throw err;
        }
    }
    async function ensureAuthOrToast() {
        try { if (await lt.core.auth.getKey()) return true; } catch { }
        TMUtils.toast?.('Sign-in required. Please log in, then retry.', 'warn');
        return false;
    }

    async function anchorAppears(sel, { timeoutMs = 10000, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(sel)) return true;
            await TMUtils.sleep(pollMs);
        }
        return !!document.querySelector(sel);
    }

    // ===== Bootstrap (re-entrancy safe) =====
    let booted = false, booting = false, disposeWatcher = null, unsubscribeUrl = null;

    async function maybeBoot() {
        if (booted || booting) return;
        booting = true;
        try {
            if (!TMUtils.matchRoute?.(CFG.ROUTES)) return;
            if (!(await anchorAppears(CFG.ANCHOR))) return;
            if (!(await ensureAuthOrToast())) return;

            const { controller, viewModel } = await TMUtils.waitForModelAsync(CFG.ANCHOR, {
                pollMs: 200, timeoutMs: 8000, logger: IS_TEST_ENV ? L : null
            });
            if (!controller || !viewModel) return;

            // IMPORTANT: QT10 is CATALOG-ONLY; do NOT store Quote_Key/Quote_No here.

            // Watch CustomerNo → look up catalog → write to DRAFT scope
            let lastCustomerNo = null;
            disposeWatcher = TMUtils.watchBySelector({
                selector: CFG.ANCHOR,
                initial: true,
                fireOn: 'blur',
                settleMs: 350,
                logger: IS_TEST_ENV ? L : null,
                onChange: async () => {
                    const customerNo = TMUtils.getObsValue(viewModel, "CustomerNo", { first: true, trim: true });
                    if (!customerNo || customerNo === lastCustomerNo) return;
                    lastCustomerNo = customerNo;

                    const scope = scopeForQuote(null); // 'draft'
                    await ensureRepoScope(scope);
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

    async function applyCatalogFor(customerNo, vm) {
        if (!customerNo) return;
        try {
            // 1) Customer → CatalogKey
            const [row1] = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_BY_CUSTOMER, { Customer_No: customerNo })
            );
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) { TMUtils.toast?.(`⚠️ No catalog for ${customerNo}`, 'warn'); return; }

            // 2) CatalogKey → CatalogCode
            const rows2 = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_CODE_BY_KEY, { Catalog_Key: catalogKey })
            );
            const catalogCode = rows2.map(r => r.Catalog_Code).find(Boolean) || '';

            // 3) Reflect in KO
            TMUtils.setObsValue(vm, 'CatalogKey', catalogKey);
            TMUtils.setObsValue(vm, 'CatalogCode', catalogCode);

            // 4) Write to DRAFT scope (per-tab)
            const repo = await ensureRepoScope(SCOPE_DRAFT);
            await repo?.update({
                Customer_No: customerNo,
                Catalog_Key: catalogKey,
                Catalog_Code: catalogCode,
                Catalog_Fetched_At: Date.now(),
            });

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

    // React to SPA navigation
    unsubscribeUrl = TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(CFG.ROUTES)) {
            try { disposeWatcher?.(); } catch { }
            disposeWatcher = null; booted = false; booting = false;
            return;
        }
        setTimeout(maybeBoot, 0);
    });

    setTimeout(maybeBoot, 0);

    // Optional tiny debug
    window.QT10_debugDraft = async () => {
        const repo = await ensureRepoScope(SCOPE_DRAFT);
        console.debug('QT10 draft →', await repo?.get());
    };
})();
