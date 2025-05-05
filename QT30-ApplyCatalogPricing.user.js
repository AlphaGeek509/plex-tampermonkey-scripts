// ==UserScript==
// @downloadURL  https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT30-ApplyCatalogPricing.user.js  
// @updateURL    https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT30-ApplyCatalogPricing.user.js
// @name         QT30 › Apply Catalog Pricing
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Add “Apply Catalog Pricing” button to Plex quote wizard and POST to datasources endpoints
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard*
// @require      https://gist.githubusercontent.com/AlphaGeek509/c8a8aec394d2906fcc559dd70b679786/raw/871917c17a169d2ee839b2e1050eb0c71d431440/lt-plex-tm-utils.user.js
// @require      https://gist.githubusercontent.com/AlphaGeek509/1f0b6287c1f0e7e97cac1d079bd0935b/raw/78d3ea2f4829b51e8676d57affcd26ed5d917325/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(async function(window){
    'use strict';

    console.log('🚀 Apply Catalog Pricing script starting…');

    // 1) PlexAPI key helper
    let apiKey;
    try {
        apiKey = await TMUtils.getApiKey();
        console.log('✔️ PlexAPI key retrieved');
    } catch (e) {
        console.error('❌ PlexAPI failed to initialize', e);
    }

    // 2) Random “no catalog” messages
    const noCatalog = [
        '🚫 No catalog selected – cannot fetch prices.',
        '⚠️ Missing customer catalog – pricing skipped.',
        '🔍 No catalog found – prices unavailable.',
        '❗ Catalog not set – please pick a catalog.',
        '🛑 Cannot load prices without a customer catalog.',
        '📛 No catalog key – unable to lookup prices.',
        '⚠️ Prices require a catalog – none configured.',
        '🚨 No catalog detected – skipping price lookup.',
        'ℹ️ Select a catalog first to retrieve pricing.',
        '🙈 No catalog chosen – hiding price fetch.'
    ];
    function rndMessage() {
        return noCatalog[Math.floor(Math.random() * noCatalog.length)];
    }

    // 3) Main workflow
    async function runCatalogPricing() {
        console.log('▶️ runCatalogPricing invoked');
        window.onerror = e => e?.includes('cssRules') || false;

        try {
            if (!apiKey) throw 'API key required';
            console.log('🔑 Using API key:', apiKey);

            const now  = new Date();
            const base = location.origin;
            console.log('🌐 Base URL:', base);

            const grid = document.querySelector('.plex-grid');
            if (!grid) throw 'Grid not found';
            console.log('📊 Grid element found');

            const raw = ko.dataFor(grid).datasource.raw;
            if (!raw?.length) throw 'No rows found';
            console.log(`🔢 Retrieved ${raw.length} rows`);

            // 3.1) Fetch Catalog_Key
            TMUtils.showMessage('⏳ Fetching Catalog_Key…', { type: 'info' });
            console.log('📡 POST to datasources/3156 with Quote_Key =', ko.unwrap(raw[0].QuoteKey));
            const r1 = await fetch(`${base}/api/datasources/3156/execute?format=2`, {
                method: 'POST',
                headers: {
                    'Accept':        'application/json',
                    'Content-Type':  'application/json;charset=utf-8',
                    'Authorization': apiKey
                },
                body: JSON.stringify({ Quote_Key: ko.unwrap(raw[0].QuoteKey) })
            });
            console.log('⏳ Response status for Catalog_Key fetch:', r1.status);
            if (!r1.ok) throw `3156 → ${r1.status}`;
            const j1 = await r1.json();
            const catalogKey = j1.rows?.[0]?.Catalog_Key;
            console.log('🔑 Catalog_Key =', catalogKey);
            if (!catalogKey) {
                TMUtils.showMessage(rndMessage(), { type: 'warning' });
                return;
            }
            TMUtils.showMessage(`✅ Catalog_Key = ${catalogKey}`, { type: 'success' });

            // 3.2) Load each part’s breakpoints
            const partNos = [...new Set(raw.map(r => ko.unwrap(r.PartNo)).filter(Boolean))];
            console.log(`📦 Loading breakpoints for ${partNos.length} parts`);
            TMUtils.showMessage(`⏳ Loading ${partNos.length} parts…`, { type: 'info' });
            const priceMap = {};
            await Promise.all(partNos.map(async p => {
                console.log(`📡 POST to datasources/4809 for part ${p}`);
                const r2 = await fetch(`${base}/api/datasources/4809/execute?format=2`, {
                    method: 'POST',
                    headers: {
                        'Accept':        'application/json',
                        'Content-Type':  'application/json;charset=utf-8',
                        'Authorization': apiKey
                    },
                    body: JSON.stringify({
                        Catalog_Key:     catalogKey,
                        Catalog_Part_No: p
                    })
                });
                console.log(`⏳ Response status for part ${p}:`, r2.status);
                if (!r2.ok) throw `4809 → ${r2.status}`;
                const { rows = [] } = await r2.json();
                priceMap[p] = rows
                    .filter(r => r.Catalog_Part_No === p
                            && new Date(r.Effective_Date) <= now
                            && now <= new Date(r.Expiration_Date))
                    .sort((a, b) => a.Breakpoint_Quantity - b.Breakpoint_Quantity);
                console.log(`✅ Loaded ${priceMap[p].length} breakpoints for ${p}`);
            }));

            // 3.3) Apply or delete prices
            console.log('💡 Applying or deleting prices');
            TMUtils.showMessage('⏳ Applying prices…', { type: 'info' });

            function pick(bps, qty) {
                if (!bps?.length) return null;
                if (qty < bps[0].Breakpoint_Quantity) return bps[0].Breakpoint_Price;
                const last = bps[bps.length - 1];
                if (qty >= last.Breakpoint_Quantity) return last.Breakpoint_Price;
                for (let i = 0; i < bps.length - 1; i++) {
                    if (qty >= bps[i].Breakpoint_Quantity && qty < bps[i+1].Breakpoint_Quantity) {
                        return bps[i].Breakpoint_Price;
                    }
                }
                return null;
            }

            raw.forEach((r, i) => {
                const qty = ko.unwrap(r.Quantity);
                console.log(`Row ${i}: quantity =`, qty);
                if (qty <= 0) {
                    console.log(`🗑 Deleting zero-qty row ${i}`);
                    const qk  = ko.unwrap(r.QuoteKey),
                          qpk = ko.unwrap(r.QuotePartKey),
                          qpr = ko.unwrap(r.QuotePriceKey);
                    if (qk && qpk && qpr) {
                        fetch(`${base}/SalesAndCRM/QuotePart/DeleteQuotePrice`, {
                            method: 'POST',
                            headers: { 'Content-Type':'application/json' },
                            body: JSON.stringify({ quoteKey:qk, quotePartKey:qpk, quotePriceKey:qpr })
                        })
                            .then(res => {
                            console.log(`🗑 Delete row[${i}] status:`, res.status);
                            TMUtils.showMessage(
                                res.ok ? `🗑 Deleted row[${i}]` : `❌ Delete failed row[${i}]`,
                                { type: res.ok ? 'success' : 'error' }
                            );
                        })
                            .catch(err => {
                            console.error(`❌ Delete error row[${i}]`, err);
                            TMUtils.showMessage(`❌ Delete error row[${i}]`, { type: 'error', autoClear: 7500 });
                        });
                    }
                    return;
                }

                const p  = ko.unwrap(r.PartNo),
                      bp = pick(priceMap[p], qty);
                console.log(`Row ${i}: selected breakpoint price =`, bp);
                if (bp == null) return;
                const price = bp.toFixed(3),
                      setter = plex.data.getObservableOrValue(r, 'RvCustomizedUnitPrice');
                console.log(`Row ${i}: applying price =`, price);
                if (ko.isObservable(setter)) setter(+price);
                else if (typeof setter === 'function') setter(+price);
            });

            // 3.4) Refresh and final overlay
            console.log('🔄 Triggering wizard refresh');
            const wiz = plex.currentPage?.QuoteWizard;
            if (wiz?.navigatePage) {
                const orig = wiz.navigatePage.bind(wiz);
                wiz.navigatePage = page => {
                    const ret = orig(page);
                    setTimeout(() => {
                        console.log('🎉 All updated!');
                        TMUtils.showMessage('🎉 All updated!', { type:'success' });
                    }, 800);
                    return ret;
                };
                wiz.navigatePage(wiz.activePage());
            } else {
                console.log('🎉 All updated! (no wizard navigation)');
                TMUtils.showMessage('🎉 All updated!', { type:'success' });
            }

        } catch (err) {
            console.error('❌ Error in runCatalogPricing:', err);
            TMUtils.showMessage(`❌ ${err}`, { type:'error', autoClear: 7500 });
        }
    }

    // 4) Inject “Apply Catalog Pricing” button
    function injectPricingButton(ul) {
        if (ul.dataset.pricingInjected) return;

        console.log('🔌 Injecting LT Apply Catalog Pricing button');
        ul.dataset.pricingInjected = '1';

        const li = document.createElement('li');
        li.id = 'lt-catalog-pricing-button';
        li.style.display = 'none';  // Start hidden

        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.textContent = 'LT Apply Catalog Pricing';
        a.style.cursor = 'pointer';
        a.onclick = runCatalogPricing;

        li.appendChild(a);
        ul.appendChild(li);

        console.log('✔️ Button injected – watching for page changes');
        watchWizardPage();
    }

    function watchWizardPage() {
        const toggleButton = () => {
            const el = document.querySelector('.plex-wizard-page.active');
            const vm = ko.dataFor(el);
            const pageName = ko.unwrap(vm?.name);
            const btn = document.querySelector('#lt-catalog-pricing-button');

            if (btn) {
                btn.style.display = (pageName === 'Part Summary') ? '' : 'none';
                console.log(`🔁 Page change detected. Current page: "${pageName}", Button visible: ${btn.style.display !== 'none'}`);
            }
        };

        // Observe DOM mutations to detect page switches
        const observer = new MutationObserver(toggleButton);
        const target = document.querySelector('.plex-wizard-page-list');

        if (target) {
            observer.observe(target, { childList: true, subtree: true });
            toggleButton(); // Run once on load
        } else {
            console.warn('⚠️ Could not find .plex-wizard-page-list to observe');
        }
    }

    // wait for the action bar then inject
    TMUtils.observeInsert('#QuoteWizardSharedActionBar', injectPricingButton);

    console.log('✅ LT Apply Catalog Pricing script initialized');
})(window);
