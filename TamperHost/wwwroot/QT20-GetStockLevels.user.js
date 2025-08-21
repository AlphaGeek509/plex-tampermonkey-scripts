// ==UserScript==
// @name         QT20 > Part Detail > Get Stock Levels
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.150
// @description  Injects a "Get Stock Levels" button into the "Quote Part Detail" modal.
//               On click, calls Plex DS 172 (Stock lookup) and appends `STK: <sum>` to NoteNew.
//               Useful for quoting visibility—quick stock check without leaving the modal.
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

    const L = TMUtils.getLogger?.('QT20'); // rename per file: QT20, QT30, QT35
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    // Route allowlist (CASE-INSENSITIVE)
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    //const STEP = 'Lines';
    //const ANCHOR = '[data-val-property-name="PartNo"], input[name="PartNo"]';

    //// Fast bail if not the intended step
    //if (!isWizardStepActive(STEP)) return;

    //// Fast bail if the field we need isn’t even on this page (avoids timeouts)
    //if (!(await anchorAppears(ANCHOR, { timeoutMs: 1200 }))) return;

    // Drop-in guard for all QT scripts
    function isWizardStepActive(nameOrRegex) {
        const el = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        const txt = (el?.textContent || '').trim();
        return nameOrRegex instanceof RegExp ? nameOrRegex.test(txt) : txt.toLowerCase() === String(nameOrRegex).toLowerCase();
    }

    // Wait (briefly) for an anchor selector to appear; resolve true/false (no throw)
    async function anchorAppears(selector, { timeoutMs = 1500, pollMs = 150 } = {}) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (document.querySelector(selector)) return true;
            await new Promise(r => setTimeout(r, pollMs));
        }
        return !!document.querySelector(selector);
    }

    // ========= Config / Routing =========
    const DS_STOCK = 172;                                        // Plex datasource: stock levels

    // --- Route guard: bail if not on one of our intended pages ---
    if (!TMUtils.matchRoute(ROUTES)) return;

    // === ENTRY POINTS ===
    // Watch for the modal "actions <ul>" being inserted, inject button when present
    TMUtils.observeInsert('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions', injectStockButton);

    // In case modal already exists when script loads, patch immediately
    document.querySelectorAll('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions')
        .forEach(injectStockButton);

    // Quick dev diagnostic menu in TM toolbar
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔎 QT20: Diagnostics', () =>
            TMUtils.toast(`Route: ${location.pathname}`, 'info')
        );
    }

    // === UI INJECTION ===
    function injectStockButton(ul) {
        try {
            const modal = ul.closest('.plex-dialog');
            const title = modal?.querySelector('.plex-dialog-title')?.textContent?.trim();
            if (title !== 'Quote Part Detail') return; // only apply to this modal

            if (ul.dataset.qt20StockInjected) return; // idempotency guard
            ul.dataset.qt20StockInjected = '1';

            dlog('QT20: injecting button');

            // Create new <li><a> element to look like other modal buttons
            const li = document.createElement('li');
            const btn = document.createElement('a');
            btn.href = 'javascript:void(0)';
            btn.textContent = 'LT Get Stock Levels';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => handleClick(btn, modal));
            li.appendChild(btn);
            ul.appendChild(li);
        } catch (e) {
            derror('QT20:', e);
        }
    }

    // === CORE HANDLER ===
    async function handleClick(btn, modalEl) {
        // disable button while processing
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
        try {
            TMUtils.toast('⏳ Fetching stock levels…', 'info', 5000);

            // --- API key handshake ---
            let apiKey = TMUtils.getApiKey();
            if (!apiKey) {
                if (confirm('No Plex API key found. Set it now?')) {
                    await PlexAuth.setKey(); // prompts user for credentials
                    apiKey = TMUtils.getApiKey();
                }
                if (!apiKey) throw new Error('No API Key configured');
            }

            // --- Find KO context ---
            // Get the "NoteNew" <textarea> inside the modal
            const ta = modalEl.querySelector('textarea[name="NoteNew"]')
                || document.querySelector('textarea[name="NoteNew"]');
            if (!ta) throw new Error('NoteNew textarea not found');

            const ctx = ko.contextFor(ta);
            if (!ctx?.$root?.data) throw new Error('Knockout context not found');

            const partNo = ko.unwrap(ctx.$root.data.PartNo);
            if (!partNo) throw new Error('PartNo not available');

            // KO setter for NoteNew (works for both observable + function cases)
            const noteSetter =
                (unsafeWindow.plex?.data?.getObservableOrValue?.(ctx.$root.data, 'NoteNew')) ||
                (typeof ctx.$root.data.NoteNew === 'function' ? ctx.$root.data.NoteNew : null);
            if (typeof noteSetter !== 'function') throw new Error('NoteNew not writable');

            // --- DS Call ---
            const rows = await TMUtils.dsRows(DS_STOCK, {
                Part_No: partNo,
                Shippable: 'TRUE',
                Container_Status: 'OK'
            });

            // --- Aggregate quantities ---
            const qtySum = (rows || []).reduce((sum, r) => sum + (Number(r?.Quantity) || 0), 0);
            const formatted = qtySum.toLocaleString('en-US', { maximumFractionDigits: 0 });

            // --- Update note ---
            const current = String(ko.unwrap(ctx.$root.data.NoteNew) || '');
            // strip any existing STK: <n> at end of note, to avoid stacking
            const withoutTrailing = current.replace(/STK:\s*[\d,]+\s*$/m, '').trim();
            const newNote = withoutTrailing
                ? `${withoutTrailing} STK: ${formatted}`
                : `STK: ${formatted}`;

            noteSetter(newNote);
            TMUtils.toast(`✅ STK: ${formatted}`, 'success');

            dlog('QT20 success', { partNo, qtySum, newNote });
        } catch (err) {
            TMUtils.toast(`❌ ${err.message || err}`, 'error', 8000);
            derror('QT20:', err);
        } finally {
            // restore button usability
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    }

    // === SPA SAFETY ===
    // Plex is single-page, so re-check on route changes
    TMUtils.onRouteChange(() => {
        if (!TMUtils.matchRoute(ROUTES)) return;
        document.querySelectorAll('.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions')
            .forEach(injectStockButton);
    });
})();
