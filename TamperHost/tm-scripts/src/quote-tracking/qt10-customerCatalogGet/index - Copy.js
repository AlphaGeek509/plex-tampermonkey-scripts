// tm-scripts/src/qt10-customerCatalogGet/index.js
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
        GATE_USER_EDIT: true,      // wait for first *real* user edit before reacting
        TOAST_SUCCESS: true,       // show green toast when writes succeed
    };

    // ===== Debug / Logger / DEV toast =====
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);

    const L = TMUtils.getLogger?.(CFG.NAME);
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    const toastDev = (msg, level = 'info') => {
        const prefix = `[${CFG.NAME} DEV]`;
        if (TMUtils.toast) TMUtils.toast(`${prefix} ${msg}`, level);
        else (level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug)(prefix, msg);
    };

    // ===== QuoteRepo via lt-data-core (scoped per tab + quote) =====
    const hasDataCore = !!(lt?.core?.data?.createDataContext && lt?.core?.data?.RepoBase?.value);
    const SCOPE_DRAFT = 'draft';
    function scopeForQuote(qk) {
        // Canonical: final scopes are plain QuoteKey strings, drafts use "draft"
        return qk ? String(qk) : SCOPE_DRAFT;
    }

    class QuoteRepo extends (hasDataCore ? lt.core.data.RepoBase.value : class { }) {
        constructor(base) { super({ ...base, entity: 'quote' }); }
        async get() { return hasDataCore ? this.read('current') : null; }
        async set(m) { return hasDataCore ? this.write('current', m) : m; }
        async update(patch) {
            if (!hasDataCore) return patch;
            const prev = (await this.get()) ?? {};
            const next = { ...prev, ...patch, Updated_At: Date.now() };
            return this.write('current', next);
        }
        async clear() { return this.remove('current'); }
    }

    // If you use lt.core.data (lt-data-core), use this ensure:
    let ctx = null, quoteRepo = null, lastScope = null;
    async function ensureRepoScope(scopeKey) {
        if (!scopeKey) return null;
        if (!lt?.core?.data?.createDataContext || !lt?.core?.data?.RepoBase?.value) return null;

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
    if (!TMUtils.matchRoute?.(CFG.ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    // Auth helpers
    async function withFreshAuth(run) {
        try {
            return await run();
        } catch (err) {
            const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || '') || [])[1];
            if (+status === 419) {
                await lt.core.auth.getKey(); // force path handled in your auth lib
                return await run(); // retry once
            }
            throw err;
        }
    }
    async function ensureAuthOrToast() {
        try {
            const key = await lt.core.auth.getKey();
            if (key) return true;
        } catch { /* noop */ }

        TMUtils.toast?.('Sign-in required. Please log in, then retry.', 'warn');
        return false;
    }

    async function anchorAppears(sel, { timeoutMs = 5000, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(sel)) return true;
            await TMUtils.sleep(pollMs)   // ← was: await delay(pollMs)
        }
        return !!document.querySelector(sel);
    }


    // ===== Bootstrap (re-entrancy safe) =====
    let booted = false;
    let booting = false;
    let disposeWatcher = null;
    let unsubscribeUrl = null;
    let gate = null;

    async function maybeBoot() {
        if (booted || booting) return;
        booting = true;

        try {
            if (!TMUtils.matchRoute?.(CFG.ROUTES)) { booting = false; return; }
            if (!(await anchorAppears(CFG.ANCHOR, { timeoutMs: 10000 }))) { booting = false; return; }

            if (!(await ensureAuthOrToast())) { booting = false; return; }

            const { controller, viewModel } = await TMUtils.waitForModelAsync(CFG.ANCHOR, {
                pollMs: 200, timeoutMs: 8000, logger: IS_TEST_ENV ? L : null
            });

            // When QuoteKey becomes available, promote the draft snapshot
            TMUtils.watchKO?.(viewModel, 'QuoteKey', async (newVal) => {
                const qk = Number(TMUtils.unwrap?.(newVal) ?? newVal) || null;
                if (!qk) return;
                await promoteDraftToQuoteScope(qk);
            });

            if (!controller || !viewModel) { booted = false; booting = false; return; }

            // After waitForModelAsync resolves and you have `viewModel`
            const initialQuoteNo = TMUtils.getObsValue?.(viewModel, 'QuoteNo', { first: true, trim: true });

            // Try to get QuoteKey from the VM so our repo scope matches QT35
            const initialQuoteKey = TMUtils.getObsValue?.(viewModel, 'QuoteKey', { first: true });
            const scope = scopeForQuote(initialQuoteKey || null);      // -> 'draft' if no QuoteKey yet
            const repo = await ensureRepoScope(scope);
            await repo?.update({
                // On first visit we usually don't have QuoteKey yet—it's fine.
                Quote_Key: initialQuoteKey ?? null,
                Quote_No: initialQuoteNo ?? null,
                Customer_No: TMUtils.getObsValue?.(viewModel, 'CustomerNo', { first: true, trim: true }) ?? null,
            });

            booted = true;

            // watch CustomerNo changes
            let lastCustomerNo = null;
            disposeWatcher = TMUtils.watchBySelector({
                selector: CFG.ANCHOR,
                initial: true,            // fire once on init
                fireOn: 'blur',           // then on blur (tweak to taste)
                settleMs: 350,
                logger: IS_TEST_ENV ? L : null,
                onChange: async () => {
                    if (DEV && gate && !gate.isStarted()) {
                        dlog(`${CFG.NAME}] change ignored until first user edit`);
                        return;
                    }

                    const customerNo = TMUtils.getObsValue(viewModel, "CustomerNo", { first: true, trim: true });

                    if (!customerNo || customerNo === lastCustomerNo) return;

                    lastCustomerNo = customerNo;
                    dlog(`${CFG.NAME}: CustomerNo →`, customerNo);

                    const scope = scopeForQuote(TMUtils.getObsValue(viewModel, 'QuoteKey', { first: true }) || null);
                    await ensureRepoScope(scope);
                    await applyCatalogFor(customerNo, viewModel)
                }
            });
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
            if (!catalogKey) {
                TMUtils.toast?.(`⚠️ No catalog for ${customerNo}`, 'warn');
                return;
            }

            // 2) CatalogKey → CatalogCode
            const rows2 = await withFreshAuth(() =>
                lt.core.plex.dsRows(CFG.DS_CATALOG_CODE_BY_KEY, { Catalog_Key: catalogKey })
            );
            const catalogCode = rows2.map(r => r.Catalog_Code).find(Boolean) || '';

            // 3) Write back (KO or arrays)
            TMUtils.setObsValue(vm, 'CatalogKey', catalogKey);
            TMUtils.setObsValue(vm, 'CatalogCode', catalogCode);

            if (CFG.TOAST_SUCCESS) {
                TMUtils.toast?.(
                    `✅ Customer: ${customerNo}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                    'success'
                );
            }
            dlog(`${CFG.NAME} done`, { customerNo, catalogKey, catalogCode });

            //OLD
            //const qk = TMUtils.getObsValue?.(vm, 'QuoteKey', { first: true });
            //await ensureRepoForQuote(qk);
            //await quoteRepo?.update({Quote_Key: qk ?? null,Customer_No: customerNo ?? null,Catalog_Key: catalogKey || null,Catalog_Code: catalogCode || null,});

            // NEW: write to DRAFT scope (per tab) so we don't depend on QuoteKey yet
            const scope = scopeForQuote(null); // 'draft'
            const repo = await ensureRepoScope(scope);
            await repo?.update({
                Customer_No: customerNo,
                Catalog_Key: catalogKey,
                Catalog_Code: catalogCode,
                Catalog_Fetched_At: Date.now(),
            });
        } catch (err) {
            TMUtils.toast?.(`❌ Lookup failed: ${err?.message || err}`, 'error');
            derror(err);
        }
    }

    // React to SPA navigation
    unsubscribeUrl = TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(CFG.ROUTES)) {
            // leaving wizard → clean up
            try { disposeWatcher?.(); } catch { /*noop*/ }
            disposeWatcher = null;
            gate = null;
            booted = false;
            booting = false;
            return;
        }
        // still in wizard — attempt a boot (guarded)
        setTimeout(maybeBoot, 0);
    });

    // kick once
    setTimeout(maybeBoot, 0);

    async function readDraftSnapshot() {
        const draftRepo = await ensureRepoScope(SCOPE_DRAFT);
        return (await draftRepo?.get()) || null;
    }

    async function clearDraftSnapshot() {
        const draftRepo = await ensureRepoScope(SCOPE_DRAFT);
        await draftRepo?.clear?.(); // remove('current')
    }

    async function promoteDraftToQuoteScope(qk) {
        if (!qk) return;

        const finalRepo = await ensureRepoScope(scopeForQuote(qk)); // final
        const draftRepo = await ensureRepoScope(SCOPE_DRAFT);       // draft

        // read draft
        const draft = await readDraftSnapshot();
        if (!draft) return;

        // if there's nothing interesting, skip
        const hasCatalog = draft.Catalog_Key || draft.Catalog_Code;
        const hasCustomer = draft.Customer_No;
        if (!hasCatalog && !hasCustomer) {
            await draftRepo?.clear?.();
            return;
        }

        // write to final scope
        const existing = await finalRepo?.get();
        const alreadyHasCatalog = existing?.Catalog_Key || existing?.Catalog_Code;

        await finalRepo?.update({
            Quote_Key: qk,
            Customer_No: draft.Customer_No ?? existing?.Customer_No ?? null,
            Catalog_Key: draft.Catalog_Key ?? existing?.Catalog_Key ?? null,
            Catalog_Code: draft.Catalog_Code ?? existing?.Catalog_Code ?? null,
            Promoted_From: SCOPE_DRAFT,
            Promoted_At: Date.now(),
        });

        // IMPORTANT: purge the draft so only one object remains
        await draftRepo?.clear?.();

        // (optional) only clear draft if we successfully promoted something new
        if (!alreadyHasCatalog && hasCatalog) await clearDraftSnapshot();
    }


})();
