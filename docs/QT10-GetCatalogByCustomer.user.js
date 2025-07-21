// File: QT10-GetCatalogByCustomer.user.js
// =================================================================
/* global TMUtils, PlexAPI, ko */

// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.55
// @description  Lookup & float CustomerNo → CatalogKey/Code into VM & dropdown
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-auth.user.js
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      https://*.plex.com
// ==/UserScript==

; (async function () {
    'use strict';
    const log = (...args) => console.log('QT10 ▶️', ...args);
    const err = (...args) => console.error('QT10 ✖️', ...args);

    // 1️⃣ Fetch Plex API key
    let apiKey;
    try {
        apiKey = await TMUtils.getApiKey();
        log('PlexAPI ready');
    } catch (e) {
        return err('PlexAPI failed', e);
    }

    // 2️⃣ Sanity‑check TMUtils
    if (typeof TMUtils !== 'object') {
        return err('TMUtils not available');
    }
    log('🐛 TMUtils loaded:', TMUtils);

    // 3️⃣ Wait for the formatted‑address component to bind
    let ctrl, vm;
    try {
        ({ controller: ctrl, viewModel: vm } = await TMUtils.waitForModelAsync('.plex-formatted-address'));
        log('✅ waitForModelAsync → controller & VM found', ctrl, vm);
    } catch (e) {
        return err('waitForModelAsync failed', e);
    }

    // 4️⃣ Subscribe to the address picker (fires when the user selects an address)
    if (!ko.isObservable(ctrl.address)) {
        return err('address is not an observable on controller!');
    }
    const sub = ctrl.address.subscribe(async () => {
        // pull the newly‐written CustomerNo array off the VM
        const arr = ko.unwrap(vm.CustomerNo);
        const cust = Array.isArray(arr) ? arr[0] : arr;
        if (!cust) {
            return log('⏳ CustomerNo still empty…');
        }
        sub.dispose();
        log('✅ New CustomerNo detected:', cust);

        try {
            // 🔍 Lookup CatalogKey
            const [row1] = await TMUtils.fetchData(319, { Customer_No: cust });
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) {
                return TMUtils.showMessage(`⚠️ No catalog for ${cust}`, { type: 'warning' });
            }

            // 🔍 Lookup CatalogCode
            const rows2 = await TMUtils.fetchData(22696, { Catalog_Key: catalogKey });
            const catalogCode = rows2.map(r => r.Catalog_Code).filter(Boolean)[0] || '';

            // 🧠 Update the VM
            if (typeof vm.CatalogKey === 'function') {
                vm.CatalogKey(catalogKey);
            } else {
                vm.CatalogKey.splice(0, vm.CatalogKey.length, catalogKey);
            }

            // 🎯 Sync the dropdown
            TMUtils.observeInsert('#QuoteCatalogDropDown', dd => {
                const koCtx = ko.contextFor(dd);
                const items = ko.unwrap(koCtx.$data.data);
                const match = items.find(i => i.CatalogKey === catalogKey);
                if (match && typeof koCtx.$data.selected === 'function') {
                    koCtx.$data.selected([match]);
                } else {
                    TMUtils.selectOptionByText(dd, catalogCode);
                }
            });

            // ✅ Show a little toast
            TMUtils.showMessage(
                `Customer: ${cust}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                { type: 'success' }
            );
        } catch (lookupErr) {
            err('Lookup failed', lookupErr);
            TMUtils.showMessage('Lookup failed', { type: 'error' });
        }
    });

    // 5️⃣ Log that we're standing by
    log('⏳ Subscribed — waiting for address change…');
})();
