// ==UserScript==
// @name         QT10 > Get Catalog by Customer
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Floating CustomerNo, CatalogKey & CatalogCode with root-model + KO + DOM fallback, scheduled after KO tasks
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard
// @require      https://gist.githubusercontent.com/AlphaGeek509/c8a8aec394d2906fcc559dd70b679786/raw/871917c17a169d2ee839b2e1050eb0c71d431440/lt-plex-tm-utils.user.js
// @require      https://gist.githubusercontent.com/AlphaGeek509/1f0b6287c1f0e7e97cac1d079bd0935b/raw/78d3ea2f4829b51e8676d57affcd26ed5d917325/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(async function() {
    'use strict';

    // 1) PlexAPI helper
    let apiKey;
    try {
        apiKey = await TMUtils.getApiKey();
        console.log('QT10 ▶️ PlexAPI ready');
    } catch (e) {
        console.error('QT10 ✖️ PlexAPI failed', e);
    }

    // 2) Debug panel
    const debugPanel = document.createElement('div');
    debugPanel.id = 'tm-debug-panel';
    Object.assign(debugPanel.style, {
        position: 'fixed', bottom: '10px', left: '10px',
        background: 'rgba(0,0,0,0.7)', color: '#fff',
        padding: '6px 10px', borderRadius: '4px',
        fontSize: '0.85em', zIndex: 10000,
        maxWidth: '300px', lineHeight: '1.2'
    });
    // document.body.appendChild(debugPanel);

    // 3) Wait for the root VM
    function waitForModel(sel, cb) {
        const el = document.querySelector(sel);
        if (el) {
            const vm = ko.dataFor(el);
            if (vm?.model) return cb(vm.model);
        }
        setTimeout(() => waitForModel(sel, cb), 100);
    }

    // 4) Core: watch CustomerNo
    waitForModel('.plex-formatted-address', m => {
        console.log('QT10 ▶️ VM.model ready');
        let lastCust = null;

        ko.computed(async () => {
            const raw = ko.unwrap(m.CustomerNo);
            const cust = Array.isArray(raw) ? raw[0] : raw;
            debugPanel.textContent = `CustomerNo: ${cust}   CatalogKey: –   CatalogCode: –`;

            if (cust && cust !== lastCust) {
                lastCust = cust;
                console.log('QT10 ▶️ New customer:', cust);

                try {
                    // — Step 1: CatalogKey —
                    const rows1 = await fetch(
                        `${location.origin}/api/datasources/319/execute?format=2`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Authorization': apiKey
                        },
                        body: JSON.stringify({ Customer_No: cust })
                    }).then(r => r.json()).then(d => d.rows || []);
                    const catalogKey = rows1[0]?.Catalog_Key || 0;
                    console.log('QT10 ▶️ catalogKey:', catalogKey);

                    // — Step 2: CatalogCode —
                    const rows2 = await fetch(
                        `${location.origin}/api/datasources/22696/execute?format=2`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Authorization': apiKey
                        },
                        body: JSON.stringify({ Catalog_Key: catalogKey })
                    }).then(r => r.json()).then(d => d.rows || []);
                    const catalogCode = (rows2.map(r => r.Catalog_Code).filter(Boolean)[0]) || '';
                    console.log('QT10 ▶️ catalogCode:', catalogCode);

                    // — Update root view-model —
                    if (ko.isObservable(m.CatalogKey)) {
                        m.CatalogKey(catalogKey);
                    } else if (Array.isArray(m.CatalogKey)) {
                        m.CatalogKey.splice(0, m.CatalogKey.length, catalogKey);
                    }

                    // — Schedule update to dropdown —
                    ko.tasks.schedule(() => {
                        const dd = document.getElementById('QuoteCatalogDropDown');
                        if (!dd) return;

                        const ctx = ko.contextFor(dd);
                        const items = ko.unwrap(ctx.$data.data);
                        console.log('QT10 ▶️ dropdown items:', items);

                        // 1) KO binding
                        const match = items.find(i => i.CatalogKey === catalogKey);
                        if (match && typeof ctx.$data.selected === 'function') {
                            ctx.$data.selected([match]);
                            dd.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log('QT10 ▶️ selected via KO:', match);
                        }

                        // 2) DOM fallback
                        const opts = Array.from(dd.options);
                        const idx = opts.findIndex(o => o.textContent.trim() === catalogCode);
                        if (idx > 0) {
                            dd.selectedIndex = idx;
                            dd.dispatchEvent(new Event('change', { bubbles: true }));
                            console.log('QT10 ▶️ selected via DOM:', idx);
                        }
                    });

                    // — UI feedback —
                    TMUtils.showMessage(
                        `CustomerNo: ${cust}\nCatalogKey: ${catalogKey}\nCatalogCode: ${catalogCode}`,
                        { type: 'success' }
                    );
                    debugPanel.textContent =
                        `CustomerNo: ${cust}   CatalogKey: ${catalogKey}   CatalogCode: ${catalogCode}`;
                }
                catch (err) {
                    console.error('QT10 ✖️ lookup failed', err);
                    TMUtils.showMessage('Lookup failed', { type: 'error', autoClear: 0 });
                }
            }
        });
    });
})();
