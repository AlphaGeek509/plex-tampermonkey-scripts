// ==UserScript==
// @name         QTxx > Template (Route-Agnostic)
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      0.2.1
// @description  Generic template for Plex TM scripts (KO-first, no dropdown sync)
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
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Config ----------
    const DEV = /test\.on\.plex\.com$/i.test(location.hostname);

    // Add/adjust routes your feature should run on:
    const ROUTES = [
        /\/SalesAndCRM\/QuoteWizard\b/i,
        // /\/Production\/WorkcenterBoard\b/i,
        // /\/Inventory\/MaterialIssues\b/i,
    ];

    // KO “root” selector varies by screen; adjust per target page
    const KO_ROOT_SELECTOR = '.plex-formatted-address';

    // ---------- Menu: diagnostics & manual run ----------
    function showDiag(viewModel) {
        try {
            const keyPresent = !!(unsafeWindow.PlexAuth?.getKey?.() || unsafeWindow.PlexAPI?.getKey?.());
            TMUtils.toast('🔎 Diagnostics → console', 'info', 2500);
            console.groupCollapsed('QTxx ▶️ Diagnostics');
            console.table({
                route: location.pathname,
                keyPresent,
                hasTMUtils: !!unsafeWindow.TMUtils,
                dev: DEV
            });
            if (viewModel) {
                const sample = Object.keys(viewModel).slice(0, 20);
                console.log('VM keys (first 20):', sample);
            }
            console.groupEnd();
        } catch (e) {
            TMUtils.toast(`❌ Diag error: ${e.message}`, 'error');
        }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔎 QTxx: Show diagnostics', () => showDiag());
        GM_registerMenuCommand('▶️ QTxx: Run now', () => init({ force: true }));
    }

    // ---------- Core init ----------
    async function init({ force = false } = {}) {
        if (!force && !TMUtils.matchRoute(ROUTES)) return;
        try {
            // Ensure API key is available (supports PlexAuth or legacy PlexAPI)
            await TMUtils.getApiKey();

            // Wait for KO controller & viewModel on the current screen
            const { controller, viewModel } =
                await TMUtils.waitForModelAsync(KO_ROOT_SELECTOR, 200, 150);

            // ===== Replace this block with your feature’s business logic =====
            // Example pattern:
            // const customerNo = ko.unwrap(viewModel.CustomerNo);
            // if (!customerNo) { TMUtils.toast('⚠️ No CustomerNo found', 'warn'); return; }
            // const rows = await TMUtils.fetchData(12345, { Customer_No: customerNo });
            // const value = rows?.[0]?.Some_Field;
            // if (typeof viewModel.SomeTarget === 'function') viewModel.SomeTarget(value);
            // TMUtils.toast(`✅ Set value: ${value}`, 'success');

            // Placeholder so you can verify the template runs:
            TMUtils.toast('✅ QTxx template ran (replace with your logic)', 'success');
            if (DEV) TMUtils.log('QTxx ▶️ init complete', { route: location.pathname });
            // Optional: show diagnostics with VM keys
            if (DEV) showDiag(viewModel);
        } catch (err) {
            TMUtils.toast(`❌ QTxx init failed: ${err.message}`, 'error');
            if (DEV) console.error(err);
        }
    }

    // Run once on load if route matches
    if (TMUtils.matchRoute(ROUTES)) {
        await init();
    }

    // Re-init on SPA route changes when a route matches
    TMUtils.onRouteChange(async () => {
        if (TMUtils.matchRoute(ROUTES)) {
            await init({ force: true });
        }
    });
})();
