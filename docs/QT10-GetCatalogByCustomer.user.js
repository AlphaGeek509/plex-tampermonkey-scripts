// File: QT10-GetCatalogByCustomer.user.js
// =================================================================
/* global TMUtils, PlexAPI, ko */

// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.0.13
// @description  Lookup & float CustomerNo → CatalogKey/Code into VM & dropdown
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-auth.user.js
// @require      https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/lt-plex-auth.user.js
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/lt-plex-tm-utils.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      https://*.plex.com
// @updateURL    http://localhost:5000/QT10-GetCatalogByCustomer.user.js
// @updateURL    https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT10-GetCatalogByCustomer.user.js
// @downloadURL  http://localhost:5000/QT10-GetCatalogByCustomer.user.js
// @downloadURL  https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT10-GetCatalogByCustomer.user.js
// ==/UserScript==


(async function () {
    'use strict';
    const log = (...args) => console.log('QT10 ▶️', ...args);
    const err = (...args) => console.error('QT10 ✖️', ...args);

    // 1) Get API key
    let apiKey;
    try { apiKey = await TMUtils.getApiKey(); log('PlexAPI ready'); }
    catch (e) { err('PlexAPI failed', e); return; }

    // 2) Wait for root VM model
    TMUtils.waitForModel('.plex-formatted-address', m => {
        console.log('🐛 QT10 – waitForModel matched element, VM model is:', m);

        let lastCust;
        ko.computed(async () => {
            const raw = ko.unwrap(m.CustomerNo);
            console.log('🐛 QT10 – computed fired, raw CustomerNo =', raw);

            const cust = Array.isArray(raw) ? raw[0] : raw;

            console.log('🐛 QT10 – normalized cust =', cust);
            if (!cust || cust === lastCust) return;
            lastCust = cust;
            log('New customer', cust);
            try {
                // — lookup CatalogKey —
                const [row1] = await TMUtils.fetchData(319, { Customer_No: cust });
                const catalogKey = row1?.Catalog_Key || 0;
                if (!catalogKey) {
                    TMUtils.showMessage(`⚠️ No catalog for ${cust}`, { type: 'warning' });
                    return;
                }

                // — lookup CatalogCode —
                const rows2 = await TMUtils.fetchData(22696, { Catalog_Key: catalogKey });
                const catalogCode = rows2.map(r => r.Catalog_Code).filter(Boolean)[0] || '';

                // — update root VM —
                if (typeof m.CatalogKey === 'function') m.CatalogKey(catalogKey);
                else if (Array.isArray(m.CatalogKey)) {
                    m.CatalogKey.splice(0, m.CatalogKey.length, catalogKey);
                }

                // — sync dropdown —
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

                // — show feedback —
                TMUtils.showMessage(
                    `Customer: ${cust}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                    { type: 'success' }
                );
            } catch (e) {
                err('Lookup failed', e);
                TMUtils.showMessage('Lookup failed', { type: 'error' });
            }
        });
    });
})();