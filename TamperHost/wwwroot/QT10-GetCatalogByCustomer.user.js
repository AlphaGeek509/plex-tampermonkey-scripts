// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.97
// @description  Lookup CatalogKey/Code for CustomerNo and write to VM (no dropdown sync)
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @require      http://localhost:5000/lt-plex-auth.user.js
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Debug setup (quiet by default) ----------
    // Flip TMUtils.setDebug(true) in the console when you want verbose logs.
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    const ROUTES = [/\/SalesAndCRM\/QuoteWizard\b/i];

    TMUtils.setDebug(true);
    const dlog = (...args) => { if (IS_TEST_ENV) TMUtils.log('QT10:', ...args); };
    const dwarn = (...args) => { if (IS_TEST_ENV) TMUtils.warn('QT10:', ...args); };
    const derror = (...args) => { TMUtils.error('QT10:', ...args); };


    try {
        // Ensure key is available (uses PlexAuth/PlexAPI via TMUtils)
        await TMUtils.getApiKey();

        // Wait for KO to bind and hand back controller + viewModel
        const { controller, viewModel } =
            await TMUtils.waitForModelAsync('.plex-formatted-address', 250, 1000);

        if (!ko.isObservable(controller.address)) {
            TMUtils.toast('❌ controller.address is not observable', 'error');
            return;
        }

        // React once the formatted address is populated
        const sub = controller.address.subscribe(async formattedAddress => {
            if (!formattedAddress) return; // still waiting

            sub.dispose();
            dlog('QT10: formatted address ready →', formattedAddress);

            // Pull CustomerNo off the VM (can be observable or array)
            const unwrapped = ko.unwrap(viewModel.CustomerNo);
            const customerNo = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped;
            if (!customerNo) {
                TMUtils.toast('❌ No CustomerNo found on VM', 'error');
                return;
            }

            try {
                // 1) Customer → CatalogKey
                //    (Your existing datasource IDs preserved)
                const [row1] = await TMUtils.fetchData(319, { Customer_No: customerNo });
                const catalogKey = row1?.Catalog_Key || 0;
                if (!catalogKey) {
                    TMUtils.toast(`⚠️ No catalog for ${customerNo}`, 'warn');
                    return;
                }

                // 2) CatalogKey → CatalogCode
                const rows2 = await TMUtils.fetchData(22696, { Catalog_Key: catalogKey });
                const catalogCode = rows2.map(r => r.Catalog_Code).find(Boolean) || '';

                // 3) Write back to KO VM (prefer observables, fallback to arrays)
                if (typeof viewModel.CatalogKey === 'function') {
                    viewModel.CatalogKey(catalogKey);
                } else if (Array.isArray(viewModel.CatalogKey)) {
                    viewModel.CatalogKey.length = 0;
                    viewModel.CatalogKey.push(catalogKey);
                }

                if (typeof viewModel.CatalogCode === 'function') {
                    viewModel.CatalogCode(catalogCode);
                } else if (Array.isArray(viewModel.CatalogCode)) {
                    viewModel.CatalogCode.length = 0;
                    viewModel.CatalogCode.push(catalogCode);
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
        });

        dlog('QT10: subscribed — waiting for address change…');
    } catch (e) {
        TMUtils.toast(`❌ QT10 init failed: ${e.message}`, 'error');
        derror(e);
    }
})();
