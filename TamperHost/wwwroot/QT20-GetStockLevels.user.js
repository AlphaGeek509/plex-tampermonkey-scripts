// ==UserScript==
// @name         QT20 > Part Detail > Get Stock Levels
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.71
// @description  Inject a "Get Stock Levels" button into the "Quote Part Detail" modal; calls DS 172 and appends STK: <sum> to NoteNew
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

(function () {
    'use strict';

    const DEV = /test\.on\.plex\.com$/i.test(location.hostname);
    const ROUTES = [/\/SalesAndCRM\/QuoteWizard\b/i];
    const DS_STOCK = 172;

    if (!TMUtils.matchRoute(ROUTES)) return;

    // 🚫 Remove the blocking KO wait; the modal may not share that root.
    // 🔎 Observe immediately for the modal’s actions <ul>
    TMUtils.observeInsert('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions', injectStockButton);
    // also handle already-open modals
    document.querySelectorAll('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions')
        .forEach(injectStockButton);

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔎 QT20: Diagnostics', () =>
            TMUtils.toast(`Route: ${location.pathname}`, 'info')
        );
    }

    function injectStockButton(ul) {
        try {
            const modal = ul.closest('.plex-dialog');
            const title = modal?.querySelector('.plex-dialog-title')?.textContent?.trim();
            if (title !== 'Quote Part Detail') return;

            if (ul.dataset.qt20StockInjected) return;
            ul.dataset.qt20StockInjected = '1';

            if (DEV) TMUtils.log('QT20: injecting button');

            const li = document.createElement('li');
            const btn = document.createElement('a');
            btn.href = 'javascript:void(0)';
            btn.textContent = 'LT Get Stock Levels';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => handleClick(btn, modal));
            li.appendChild(btn);
            ul.appendChild(li);
        } catch (e) {
            if (DEV) console.error('QT20 inject error:', e);
        }
    }

    async function handleClick(btn, modalEl) {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
        try {
            TMUtils.toast('⏳ Fetching stock levels…', 'info', 5000);

            // Ensure key (offer to set once if missing)
            let apiKey = TMUtils.getApiKey();
            if (!apiKey) {
                if (confirm('No Plex API key found. Set it now?')) {
                    await PlexAuth.setKey();
                    apiKey = TMUtils.getApiKey();
                }
                if (!apiKey) throw new Error('No API Key configured');
            }

            // Resolve KO context *from the modal* (no global root dependency)
            const ta = modalEl.querySelector('textarea[name="NoteNew"]') || document.querySelector('textarea[name="NoteNew"]');
            if (!ta) throw new Error('NoteNew textarea not found');
            const ctx = ko.contextFor(ta);
            if (!ctx?.$root?.data) throw new Error('Knockout context not found');

            const partNo = ko.unwrap(ctx.$root.data.PartNo);
            if (!partNo) throw new Error('PartNo not available');

            const noteSetter =
                (unsafeWindow.plex?.data?.getObservableOrValue?.(ctx.$root.data, 'NoteNew')) ||
                (typeof ctx.$root.data.NoteNew === 'function' ? ctx.$root.data.NoteNew : null);
            if (typeof noteSetter !== 'function') throw new Error('NoteNew not writable');

            // Call DS 172 via TMUtils.fetchData (auto Authorization)
            const rows = await TMUtils.fetchData(DS_STOCK, {
                Part_No: partNo, Shippable: 'TRUE', Container_Status: 'OK'
            });

            const qtySum = (rows || []).reduce((sum, r) => sum + (Number(r?.Quantity) || 0), 0);
            const formatted = qtySum.toLocaleString('en-US', { maximumFractionDigits: 0 });

            const current = String(ko.unwrap(ctx.$root.data.NoteNew) || '');
            const withoutTrailing = current.replace(/STK:\s*[\d,]+\s*$/m, '').trim();
            const newNote = withoutTrailing ? `${withoutTrailing} STK: ${formatted}` : `STK: ${formatted}`;

            noteSetter(newNote);
            TMUtils.toast(`✅ STK: ${formatted}`, 'success');
            if (DEV) TMUtils.log('QT20 success', { partNo, qtySum, newNote });
        } catch (err) {
            TMUtils.toast(`❌ ${err.message || err}`, 'error', 8000);
            if (DEV) console.error('QT20 error:', err);
        } finally {
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    }

    // Re-scan on SPA route changes
    TMUtils.onRouteChange(() => {
        if (!TMUtils.matchRoute(ROUTES)) return;
        document.querySelectorAll('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions')
            .forEach(injectStockButton);
    });
})();