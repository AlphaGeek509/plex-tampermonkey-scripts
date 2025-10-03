// src/quote-tracking/qt05-customerContactAdd/qt05.index.js
// Injects a Hub Bar button on the Quote Wizard → "Quote" page that opens the Customer Contact form.
// Follows the same route/Hub conventions used across QT modules.

(async function () {
    'use strict';

    // ===== Dev flag (build-time with runtime fallback) =====
    const DEV = (typeof __BUILD_DEV__ !== 'undefined')
        ? __BUILD_DEV__
        : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

    // ===== Config =====
    const CFG = {
        NAME: 'QT05',
        ROUTES: [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],
        ANCHOR: '[data-val-property-name="CustomerNo"]',
        BTN_ID: 'qt05-customer-contact',
        BTN_LABEL: 'New Contact',
        BTN_TITLE: 'Open Customer Contact form',
        BTN_WEIGHT: 70,
    };

    // Route allowlist
    if (!CFG.ROUTES.some(rx => rx.test(location.pathname))) return;

    // Ensure Hub is ready
    await (window.ensureLTHub?.({ mount: 'nav' }));

    // ===== Helpers =====
    //function onQuotePage(ctx) {
    //    // 1) Hub context (most reliable when available)
    //    if (typeof ctx?.isPage === 'function' && ctx.isPage('Quote')) return true;

    //    // 2) Active wizard tab text (tolerant of whitespace/case)
    //    const tabName = String(ctx?.pageName || getActiveWizardPageName())
    //        .trim()
    //        .replace(/\s+/g, ' ');
    //    if (/^quote$/i.test(tabName)) return true;

    //    // 3) DOM: the CustomerNo anchor is visible only when Quote content is active
    //    return isQuoteAnchorVisible();
    //}

    function getActiveWizardPageName() {
        const li = document.querySelector(
            '.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]'
        );
        return (li?.textContent || '').trim().replace(/\s+/g, ' ');
    }

    function isQuoteAnchorVisible() {
        const el = document.querySelector('[data-val-property-name="CustomerNo"]');
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return (r.width > 0 || r.height > 0);
    }


    async function resolveCustomerNo() {
        try {
            // Prefer KO-bound VM from the anchor field (same pattern used in QT10)
            const res = await TMUtils.waitForModelAsync(CFG.ANCHOR, { pollMs: 200, timeoutMs: 8000, requireKo: true });
            const vm = res?.viewModel || null;
            const cn = TMUtils.getObsValue(vm, 'CustomerNo', { first: true, trim: true });
            if (cn) return cn;

            // Fallback: read from the input (if any)
            const inp = document.querySelector(`${CFG.ANCHOR} input, ${CFG.ANCHOR} [contenteditable]`);
            const txt = (inp?.value ?? inp?.textContent ?? '').trim();
            if (txt) return txt;

            return null;
        } catch { return null; }
    }

    function makeContactUrl(customerNo) {
        // Preserve test/non-test environment per current hostname
        const isTest = /\.test\.on\.plex\.com$/i.test(location.hostname);
        const envPart = isTest ? 'test.' : '';
        const base = `https://lyntron.${envPart}on.plex.com`;
        const q = new URLSearchParams({
            CustomerNo: String(customerNo || ''),
            ContactType: 'Customer'
        }).toString();
        return `${base}/Communication/Contact/ContactFormView?${q}`;
    }

    async function onClick() {
        const task = lt?.core?.hub?.beginTask?.('Opening Contact form…', 'info') || { done() { }, error() { } };
        try {
            const customerNo = await resolveCustomerNo();
            if (!customerNo) {
                lt?.core?.hub?.notify?.('Customer No not found on the page.', 'warn');
                task.error?.('No Customer No');
                return;
            }
            const url = makeContactUrl(customerNo);
            window.open(url, '_blank', 'noopener,noreferrer');
            lt?.core?.hub?.notify?.('Contact form opened...', 'success');
        } catch (err) {
            lt?.core?.hub?.error?.(`Open failed: ${err?.message || err}`, 'error');
            task.error?.('Error');
        }
    }

    // ===== Register Hub button (SPA-safe via showWhen) =====
    await lt?.core?.qt?.ensureHubButton?.({
        id: CFG.BTN_ID,
        label: CFG.BTN_LABEL,
        title: CFG.BTN_TITLE,
        side: 'left',
        weight: CFG.BTN_WEIGHT,
        onClick,
        showWhen: () => true,
        mount: 'nav'
    });

    // Reconcile on SPA changes as a safety net (ensureHubButton also reconciles)
    function reconcile() {
        lt?.core?.qt?.ensureHubButton?.({
            id: CFG.BTN_ID,
            label: CFG.BTN_LABEL,
            title: CFG.BTN_TITLE,
            side: 'left',
            weight: CFG.BTN_WEIGHT,
            onClick,
            showWhen: () => true,
            mount: 'nav'
        });
    }

    TMUtils?.onUrlChange?.(reconcile);
    try { window.addEventListener('hashchange', reconcile); } catch { }
    try {
        const nav = document.querySelector('.plex-wizard-page-list');
        if (nav) new MutationObserver(reconcile).observe(nav, { subtree: true, attributes: true, childList: true });
    } catch { }



    if (DEV) {
        (unsafeWindow || window).QT05_debug = { makeContactUrl, resolveCustomerNo, onQuotePage };
    }
})();
