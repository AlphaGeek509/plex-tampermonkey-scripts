// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.164
// @description  Lookup CatalogKey/Code for CustomerNo and write to VM (no dropdown sync)
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Standard bootstrap ----------
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);

    const L = TMUtils.getLogger?.('QT10'); // rename per file: QT20, QT30, QT35
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // Route allowlist (CASE-INSENSITIVE)
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    // ✅ Anchor to the actual Customer field on this step
    const ANCHOR = '[data-val-property-name="CustomerNo"]';
    let booted = false;
    let booting = false;     // 👈 re-entrancy guard
    let disposeWatcher = null;
    let unsubscribeUrl = null;

    async function anchorAppears(sel, { timeoutMs = 5000, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(sel)) return true;
            await new Promise(r => setTimeout(r, pollMs));
        }
        return !!document.querySelector(sel);
    }

    function readCustomerNoFromVM(viewModel) {
        const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
        try {
            const raw = KO?.unwrap ? KO.unwrap(viewModel.CustomerNo)
                : (typeof viewModel.CustomerNo === 'function' ? viewModel.CustomerNo() : viewModel.CustomerNo);
            const v = Array.isArray(raw) ? raw[0] : raw;
            return (v ?? '').toString().trim();
        } catch { return ''; }
    }

    async function maybeBoot() {
        if (booted || booting) return;       // 👈 prevent overlap
        booting = true;

        try {
            if (!TMUtils.matchRoute?.(ROUTES)) { booting = false; return; }
            if (!(await anchorAppears(ANCHOR, { timeoutMs: 2000 }))) { booting = false; return; }

            // mark as booted ASAP to defeat racing callers
            booted = true;

            await TMUtils.getApiKey();

            const { controller, viewModel } = await TMUtils.waitForModelAsync(ANCHOR, {
                pollMs: 200,
                timeoutMs: 8000,
                logger: IS_TEST_ENV ? L : null
            });
            if (!controller || !viewModel) { booted = false; booting = false; return; }

            let lastCustomerNo = null;

            // store the disposer so we can detach if we navigate away
            disposeWatcher = TMUtils.watchBySelector({
                selector: ANCHOR,
                initial: false,
                fireOn: 'blur',
                settleMs: 350,
                logger: IS_TEST_ENV ? L : null,
                onChange: () => {
                    const customerNo = readCustomerNoFromVM(viewModel); // ✅ true number from VM
                    if (!customerNo || customerNo === lastCustomerNo) return;
                    lastCustomerNo = customerNo;
                    dlog('QT10: CustomerNo →', customerNo);
                    applyCatalogFor(customerNo);                         // your existing function
                }
            });


            // Your core lookup/writeback logic extracted so we can call it on init + every change
            async function applyCatalogFor(customerNo) {
                if (!customerNo) return;

                try {
                    // 1) Customer → CatalogKey
                    const [row1] = await TMUtils.dsRows(319, { Customer_No: customerNo });
                    const catalogKey = row1?.Catalog_Key || 0;
                    if (!catalogKey) {
                        TMUtils.toast(`⚠️ No catalog for ${customerNo}`, 'warn');
                        return;
                    }

                    // 2) CatalogKey → CatalogCode
                    const rows2 = await TMUtils.dsRows(22696, { Catalog_Key: catalogKey });
                    const catalogCode = rows2.map(r => r.Catalog_Code).find(Boolean) || '';

                    // 3) Write back to KO VM (observables or arrays)
                    if (typeof viewModel.CatalogKey === 'function') {
                        viewModel.CatalogKey(catalogKey);
                    } else if (Array.isArray(viewModel.CatalogKey)) {
                        viewModel.CatalogKey.length = 0; viewModel.CatalogKey.push(catalogKey);
                    }

                    if (typeof viewModel.CatalogCode === 'function') {
                        viewModel.CatalogCode(catalogCode);
                    } else if (Array.isArray(viewModel.CatalogCode)) {
                        viewModel.CatalogCode.length = 0; viewModel.CatalogCode.push(catalogCode);
                    }

                    TMUtils.toast(
                        `✅ Customer: ${customerNo}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                        'success'
                    );
                    dlog('QT10 done', { customerNo, catalogKey, catalogCode });
                } catch (err) {
                    TMUtils.toast(`❌ Lookup failed: ${err.message}`, 'error');
                    derror(err);
                }
            }
        } catch (e) {
            booted = false;
            derror('QT10 init failed:', e);
        } finally {
            booting = false;                 // 👈 release the lock
        }
    }

    // React to SPA route changes: detach when leaving, try boot when entering
    unsubscribeUrl = TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(ROUTES)) {
            // leaving the wizard — clean up
            try { disposeWatcher?.(); } catch { }
            disposeWatcher = null;
            booted = false;
            booting = false;
            return;
        }
        // still in wizard — attempt a boot (guarded)
        setTimeout(maybeBoot, 0);
    });

    // Single initial kick. (No manual _dispatchUrlChange to avoid duplicate.)
    setTimeout(maybeBoot, 0);
})();
