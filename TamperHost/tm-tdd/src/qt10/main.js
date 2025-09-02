// tm-tdd/src/qt10/main.js
/* Build-time dev flag (esbuild sets __BUILD_DEV__), with a runtime fallback for tests */
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(function () {
    'use strict';

    // ===== Config (QT20-style) =====
    const CFG = {
        NAME: 'QT10',
        ROUTES: [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],
        ANCHOR: '[data-val-property-name="CustomerNo"]',
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

    // ===== Route allowlist =====
    if (!TMUtils.matchRoute?.(CFG.ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    // ===== Small utils =====
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    // KO observables: **bind this** and keep spies intact (QT20-compatible)
    function getObs(vm, prop) {
        if (unsafeWindow?.plex?.data?.getObservableOrValue) {
            return unsafeWindow.plex.data.getObservableOrValue(vm, prop);
        }
        const cur = vm?.[prop];
        return typeof cur === 'function' ? cur.call(vm) : cur;
    }
    function setObs(vm, prop, value) {
        if (unsafeWindow?.plex?.data?.getObservableOrValue) {
            const setter = unsafeWindow.plex.data.getObservableOrValue(vm, prop);
            return (typeof setter === 'function') ? setter(value) : (vm[prop] = value);
        }
        const cur = vm?.[prop];
        if (typeof cur === 'function') return cur.call(vm, value);
        if (Array.isArray(cur)) { cur.length = 0; cur.push(value); return; }
        vm[prop] = value;
    }

    // Gate until the *first* genuine user edit (prevents early programmatic triggers)
    function createGate() {
        let started = false;
        return { isStarted: () => started, start: () => { started = true; } };
    }
    function startGateOnFirstUserEdit({ gate, inputEl }) {
        const start = () => gate.start();
        inputEl?.addEventListener('input', start, { once: true });
        inputEl?.addEventListener('change', start, { once: true });
    }

    // Auth helpers (QT20-style)
    async function withFreshAuth(run) {
        try {
            return await run();
        } catch (err) {
            const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || '') || [])[1];
            if (+status === 419) {
                await TMUtils.getApiKey({ force: true });
                return await run(); // retry once
            }
            throw err;
        }
    }
    async function ensureAuthOrToast() {
        try {
            const key = await TMUtils.getApiKey();
            if (key) return true;
        } catch { /*noop*/ }
        TMUtils.toast?.('Sign-in required. Please log in, then retry.', 'warn');
        return false;
    }

    async function anchorAppears(sel, { timeoutMs = 5000, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(sel)) return true;
            await delay(pollMs);
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
            if (!(await anchorAppears(CFG.ANCHOR, { timeoutMs: 2000 }))) { booting = false; return; }

            // mark booted early to discourage overlaps
            booted = true;

            if (!(await ensureAuthOrToast())) { booting = false; return; }

            const { controller, viewModel } = await TMUtils.waitForModelAsync(CFG.ANCHOR, {
                pollMs: 200, timeoutMs: 8000, logger: IS_TEST_ENV ? L : null
            });
            if (!controller || !viewModel) { booted = false; booting = false; return; }

            // DEV: arm gate on first *user* edit of CustomerNo
            if (DEV && CFG.GATE_USER_EDIT) {
                const inputEl =
                    document.querySelector(`${CFG.ANCHOR} input`) ||
                    document.querySelector('input[name="CustomerNo"]') ||
                    document.querySelector(CFG.ANCHOR);

                if (inputEl && KO) {
                    gate = createGate();
                    startGateOnFirstUserEdit({ gate, inputEl });
                    toastDev('Gate armed: waiting for first user edit…');
                } else {
                    toastDev('Gate not armed (missing KO or input).', 'warn');
                }
            }

            // watch CustomerNo changes
            let lastCustomerNo = null;
            disposeWatcher = TMUtils.watchBySelector({
                selector: CFG.ANCHOR,
                initial: true,            // fire once on init
                fireOn: 'blur',           // then on blur (tweak to taste)
                settleMs: 350,
                logger: IS_TEST_ENV ? L : null,
                onChange: () => {
                    if (DEV && gate && !gate.isStarted()) {
                        dlog(`${CFG.NAME}] change ignored until first user edit`);
                        return;
                    }

                    const customerNo = TMUtils.getObsValue(viewModel, "CustomerNo", { first: true, trim: true });

                    if (!customerNo || customerNo === lastCustomerNo) return;

                    lastCustomerNo = customerNo;
                    dlog(`${CFG.NAME}: CustomerNo →`, customerNo);
                    applyCatalogFor(customerNo, viewModel);
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
            const [row1] = await withFreshAuth(() => TMUtils.dsRows(319, { Customer_No: customerNo }));
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) {
                TMUtils.toast?.(`⚠️ No catalog for ${customerNo}`, 'warn');
                return;
            }

            // 2) CatalogKey → CatalogCode
            const rows2 = await withFreshAuth(() => TMUtils.dsRows(22696, { Catalog_Key: catalogKey }));
            const catalogCode = rows2.map(r => r.Catalog_Code).find(Boolean) || '';

            // 3) Write back (KO or arrays)
            TMUtils.setObsValue(vm, 'CatalogKey', catalogKey);
            TMUtils.setObsValue(vm, 'CatalogCode', catalogCode);

            setObs(vm, 'CatalogKey', catalogKey);
            setObs(vm, 'CatalogCode', catalogCode);

            if (CFG.TOAST_SUCCESS) {
                TMUtils.toast?.(
                    `✅ Customer: ${customerNo}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                    'success'
                );
            }
            dlog(`${CFG.NAME} done`, { customerNo, catalogKey, catalogCode });
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

})();
