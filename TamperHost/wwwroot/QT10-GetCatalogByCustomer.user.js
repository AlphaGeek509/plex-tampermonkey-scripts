// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.63
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

    // 1️⃣ Grab your Plex API key
    try {
        await TMUtils.getApiKey();
        log('PlexAPI ready');
    } catch (e) {
        return err('PlexAPI failed', e);
    }

    // 2️⃣ Sanity‐check TMUtils
    if (typeof TMUtils !== 'object') {
        return err('TMUtils not available');
    }

    // 3️⃣ Wait for the FormattedAddressComponent to bind
    //    — it now resolves to an object { controller, viewModel }
    let controller, viewModel;
    try {
        ({ controller, viewModel } = await TMUtils.waitForModelAsync('.plex-formatted-address', 250, 1000));
        log('✅ waitForModelAsync → controller & viewModel found', controller, viewModel);
    } catch (e) {
        return err('waitForModelAsync failed', e);
    }

    // 4️⃣ Subscribe to the address picker
    if (!ko.isObservable(controller.address)) {
        return err('address is not an observable on controller!');
    }
    const sub = controller.address.subscribe(async formattedAddress => {
        if (!formattedAddress) {
            log('⏳ Waiting for formatted address…');
            return;
        }
        sub.dispose();
        log('✅ Formatted address arrived:', formattedAddress);

        // 5️⃣ Pull the CustomerNo off your viewModel (it's an observableArray)
        const arr = ko.unwrap(viewModel.CustomerNo);
        const cust = Array.isArray(arr) ? arr[0] : arr;
        if (!cust) {
            return err('No CustomerNo found on the viewModel—aborting.');
        }
        log('👤 CustomerNo is:', cust);

        // 6️⃣ Do your Plex lookup
        try {
            const [row1] = await TMUtils.fetchData(319, { Customer_No: cust });
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) {
                return TMUtils.showMessage(`⚠️ No catalog for ${cust}`, { type: 'warning' });
            }
            const rows2 = await TMUtils.fetchData(22696, { Catalog_Key: catalogKey });
            const catalogCode = rows2.map(r => r.Catalog_Code).filter(Boolean)[0] || '';

            // 7️⃣ Update your viewModel
            if (typeof viewModel.CatalogKey === 'function') {
                viewModel.CatalogKey(catalogKey);
            } else {
                viewModel.CatalogKey.splice(0, viewModel.CatalogKey.length, catalogKey);
            }
            debugger;
            TMUtils.observeInsert('#QuoteCatalogDropDown', dd => {
                const ddCtx = ko.contextFor(dd).$data;
                const items = ko.unwrap(ddCtx.data);
                // find the matching item object:
                const match = items.find(i => i.CatalogKey === catalogKey);

                if (match && typeof ddCtx.selected === 'function') {
                    // 1) bind the object itself:
                    ddCtx.selected([match]);
                    // 2) also fire a native change so any listeners pick it up
                    dd.value = String(items.indexOf(match));
                    dd.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('📝 Dropdown set via KO to item:', match);
                } else {
                    // fallback by text if something weird happens
                    TMUtils.selectOptionByText(dd, catalogCode);
                    console.log('⚠️ Fallback: setting by visible text to', catalogCode);
                }
            });

;

            //// 8️⃣ Sync the dropdown UI
            //TMUtils.observeInsert('#QuoteCatalogDropDown', dd => {
            //    const ddCtx = ko.contextFor(dd).$data;
            //    const match = ko.unwrap(ddCtx.data).find(i => i.CatalogKey === catalogKey);
            //    if (match && typeof ddCtx.selected === 'function') {
            //        ddCtx.selected([match]);
            //    } else {
            //        TMUtils.selectOptionByText(dd, catalogCode);
            //    }
            //});

            TMUtils.showMessage(
                `Customer: ${cust}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                { type: 'success' }
            );
        } catch (lookupErr) {
            err('Lookup failed', lookupErr);
            TMUtils.showMessage('Lookup failed', { type: 'error' });
        }
    });

    log('⏳ Subscribed — waiting for address change…');
})();
