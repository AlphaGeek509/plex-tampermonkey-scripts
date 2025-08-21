// ==UserScript==
// @name         QT30 › Apply Catalog Pricing
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.167
// @description  Adds “LT Apply Catalog Pricing” button on Quote Wizard (Part Summary).
//               Looks up Catalog_Key (DS 3156), loads breakpoints per part (DS 4809),
//               applies the correct price by quantity, deletes zero-qty rows, and refreshes the wizard.
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

    const L = TMUtils.getLogger?.('QT30');
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

    // ---------- Config ----------
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    const TARGET_WIZARD_PAGE = 'Part Summary';
    const CONFIG = {
        CatalogKeyByQuoteKey: 3156,
        BreakpointsByPart: 4809
    };

    if (!TMUtils.matchRoute?.(ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔎 QT30: Diagnostics', () => {
            TMUtils.toast(`Route: ${location.pathname}`, 'info', 2500);
        });
    }

    // ---------- Persistent injection (survives modal/page re-creates) ----------
    // Requires TM Utils ≥ 3.5.160 (observeInsertMany). If not present, you can fall back to observeInsert.
    const stopObserve = TMUtils.observeInsertMany?.('#QuoteWizardSharedActionBar', injectPricingButton)
        || TMUtils.observeInsert('#QuoteWizardSharedActionBar', injectPricingButton);

    // Also try now for any existing action bar
    document.querySelectorAll('#QuoteWizardSharedActionBar').forEach(injectPricingButton);

    // Re-check on SPA URL changes (don’t double-inject thanks to data-flag)
    TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(ROUTES)) return;
        document.querySelectorAll('#QuoteWizardSharedActionBar').forEach(injectPricingButton);
    });

    function injectPricingButton(actionBarUl) {
        try {
            if (!actionBarUl || actionBarUl.nodeName !== 'UL') return;
            if (actionBarUl.dataset.qt30Injected) return;
            actionBarUl.dataset.qt30Injected = '1';

            const li = document.createElement('li');
            li.id = 'lt-apply-catalog-pricing';
            li.style.display = 'none';

            const a = document.createElement('a');
            a.href = 'javascript:void(0)';
            a.textContent = 'LT Apply Catalog Pricing';
            a.title = 'Click to apply customer specific catalog pricing';       // ✅ tooltip
            a.setAttribute('aria-label', 'Apply catalog pricing');
            a.setAttribute('role', 'button');
            a.style.cursor = 'pointer';
            a.style.transition = 'filter .15s, text-decoration-color .15s';  // ✅ smooth hover

            // Run your existing handler
            a.addEventListener('click', runCatalogPricing);

            // ✅ subtle hover/focus affordances (matches QT35 feel)
            a.addEventListener('mouseenter', () => {
                a.style.filter = 'brightness(1.08)';
                a.style.textDecoration = 'underline';
            });
            a.addEventListener('mouseleave', () => {
                a.style.filter = '';
                a.style.textDecoration = '';
            });
            a.addEventListener('focus', () => {
                a.style.outline = '2px solid #4a90e2';
                a.style.outlineOffset = '2px';
            });
            a.addEventListener('blur', () => {
                a.style.outline = '';
                a.style.outlineOffset = '';
            });

            li.appendChild(a);
            actionBarUl.appendChild(li);

            // keep your existing step visibility logic
            watchWizardPage(li);
            dlog('QT30: button injected (hover+tooltip enabled)');
        } catch (e) {
            derror('injectPricingButton:', e);
        }
    }


    // Toggle button only on the intended wizard step
    function watchWizardPage(buttonLi) {
        const getActiveWizardPageName = () => {
            // Try KO-bound element name
            const activePageEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
            const vm = activePageEl ? KO?.dataFor?.(activePageEl) : null;
            const name = vm ? KO?.unwrap?.(vm.name) ?? (typeof vm.name === 'function' ? vm.name() : vm.name) : '';
            // Fallback: read from nav list text
            if (name) return String(name);
            const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
            return (nav?.textContent || '').trim();
        };

        const toggle = () => {
            const pageName = getActiveWizardPageName();
            const show = pageName === TARGET_WIZARD_PAGE;
            buttonLi.style.display = show ? '' : 'none';
            dlog(`QT30: wizard page "${pageName}", button ${show ? 'shown' : 'hidden'}`);
        };

        const list = document.querySelector('.plex-wizard-page-list');
        if (list) {
            const mo = new MutationObserver(toggle);
            mo.observe(list, { childList: true, subtree: true, attributes: true });
            toggle(); // run once on init
        } else {
            toggle();
            dwarn('QT30: .plex-wizard-page-list not found; using single check');
        }
    }

    // ========= Main workflow =========
    async function runCatalogPricing() {
        try {
            TMUtils.toast('⏳ Applying catalog pricing…', 'info', 4000);

            // Ensure API key (await so the guard is real)
            let key = await TMUtils.getApiKey({ useCache: true });
            if (!key) {
                if (confirm('No Plex API key found. Set it now?')) {
                    await PlexAuth.setKey();
                    key = await TMUtils.getApiKey({ useCache: true });
                }
                if (!key) throw new Error('API key required');
            }

            // Live grid rows from current wizard view
            const grid = document.querySelector('.plex-grid');
            if (!grid) throw new Error('Grid not found');
            const gridVM = KO?.dataFor?.(grid);
            const raw = gridVM?.datasource?.raw;
            if (!raw?.length) throw new Error('No rows found');

            const base = location.origin;
            const quoteKey = KO?.unwrap?.(raw[0].QuoteKey) ?? (typeof raw[0].QuoteKey === 'function' ? raw[0].QuoteKey() : raw[0].QuoteKey);
            if (!quoteKey) throw new Error('Quote_Key missing');

            // 1) Catalog_Key
            TMUtils.toast('⏳ Fetching Catalog Key…', 'info');
            const rows1 = await TMUtils.dsRows(CONFIG.CatalogKeyByQuoteKey, { Quote_Key: quoteKey });
            const catalogKey = rows1?.[0]?.Catalog_Key;
            if (!catalogKey) {
                TMUtils.toast(oneOf(NO_CATALOG_MESSAGES), 'warn', 5000);
                return;
            }
            TMUtils.toast(`✅ Catalog Key: ${catalogKey}`, 'success', 1800);

            // 2) Breakpoints per unique part
            const now = new Date();
            const partNos = [...new Set(raw.map(r => KO?.unwrap?.(r.PartNo) ?? (typeof r.PartNo === 'function' ? r.PartNo() : r.PartNo)).filter(Boolean))];
            if (!partNos.length) {
                TMUtils.toast('⚠️ No PartNo values found', 'warn', 4000);
                return;
            }

            TMUtils.toast(`⏳ Loading ${partNos.length} part(s)…`, 'info');
            const priceMap = {}; // partNo -> sorted breakpoints[]
            await Promise.all(partNos.map(async (p) => {
                const rows = await TMUtils.dsRows(CONFIG.BreakpointsByPart, { Catalog_Key: catalogKey, Catalog_Part_No: p });
                priceMap[p] = (rows || [])
                    .filter(r =>
                        r.Catalog_Part_No === p &&
                        new Date(r.Effective_Date) <= now &&
                        now <= new Date(r.Expiration_Date)
                    )
                    .sort((a, b) => a.Breakpoint_Quantity - b.Breakpoint_Quantity);
                dlog(`QT30: loaded ${priceMap[p].length} breakpoints for ${p}`);
            }));

            // 3) Apply or delete per row
            TMUtils.toast('⏳ Applying prices…', 'info');

            const pickPrice = (bps, qty) => {
                if (!bps?.length) return null;
                if (qty < bps[0].Breakpoint_Quantity) return bps[0].Breakpoint_Price;
                const last = bps[bps.length - 1];
                if (qty >= last.Breakpoint_Quantity) return last.Breakpoint_Price;
                for (let i = 0; i < bps.length - 1; i++) {
                    if (qty >= bps[i].Breakpoint_Quantity && qty < bps[i + 1].Breakpoint_Quantity) {
                        return bps[i].Breakpoint_Price;
                    }
                }
                return null;
            };

            for (let i = 0; i < raw.length; i++) {
                const row = raw[i];
                const qty = + (KO?.unwrap?.(row.Quantity) ?? (typeof row.Quantity === 'function' ? row.Quantity() : row.Quantity)) || 0;

                // Delete zero-qty rows
                if (qty <= 0) {
                    const qk = KO?.unwrap?.(row.QuoteKey) ?? (typeof row.QuoteKey === 'function' ? row.QuoteKey() : row.QuoteKey);
                    const qpk = KO?.unwrap?.(row.QuotePartKey) ?? (typeof row.QuotePartKey === 'function' ? row.QuotePartKey() : row.QuotePartKey);
                    const qpr = KO?.unwrap?.(row.QuotePriceKey) ?? (typeof row.QuotePriceKey === 'function' ? row.QuotePriceKey() : row.QuotePriceKey);
                    if (qk && qpk && qpr) {
                        try {
                            const res = await fetch(`${base}/SalesAndCRM/QuotePart/DeleteQuotePrice`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ quoteKey: qk, quotePartKey: qpk, quotePriceKey: qpr })
                            });
                            TMUtils.toast(res.ok ? `🗑 Deleted row[${i}]` : `❌ Delete failed row[${i}]`, res.ok ? 'success' : 'error');
                        } catch (e) {
                            TMUtils.toast(`❌ Delete error row[${i}]`, 'error', 6000);
                            derror('QT30 delete error', e);
                        }
                    }
                    continue;
                }

                // Apply price
                const partNo = KO?.unwrap?.(row.PartNo) ?? (typeof row.PartNo === 'function' ? row.PartNo() : row.PartNo);
                const bp = pickPrice(priceMap[partNo], qty);
                if (bp == null) continue;

                const price = +(+bp).toFixed(3);
                const setter = unsafeWindow.plex?.data?.getObservableOrValue?.(row, 'RvCustomizedUnitPrice')
                    || (typeof row.RvCustomizedUnitPrice === 'function' ? row.RvCustomizedUnitPrice : null);

                if (KO?.isObservable?.(setter)) setter(price);
                else if (typeof setter === 'function') setter(price);

                dlog(`QT30: row[${i}] qty=${qty} price=${price}`);
            }

            // 4) Refresh wizard so UI reflects changes
            const wiz = unsafeWindow.plex?.currentPage?.QuoteWizard;
            if (wiz?.navigatePage) {
                const orig = wiz.navigatePage.bind(wiz);
                wiz.navigatePage = (page) => {
                    const ret = orig(page);
                    setTimeout(() => TMUtils.toast('🎉 All updated!', 'success'), 800);
                    return ret;
                };
                wiz.navigatePage(wiz.activePage());
            } else {
                TMUtils.toast('🎉 All updated!', 'success');
            }

            dlog('QT30: done');
        } catch (err) {
            TMUtils.toast(`❌ ${err.message || err}`, 'error', 8000);
            derror('QT30 error:', err);
        }
    }

    // ========= Messages =========
    const NO_CATALOG_MESSAGES = [
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
    const oneOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
})();
