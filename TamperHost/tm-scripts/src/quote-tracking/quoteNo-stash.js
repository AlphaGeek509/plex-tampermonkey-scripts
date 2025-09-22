// ==UserScript==
// @name         QT Shared: QuoteNo Stash
// @namespace    lt
// @version      1.0.2
// @description  Tab-scoped QuoteNo storage for the Plex Quote Wizard (sessionStorage-backed)
// @author       LT
// @match        https://*.plex.com/*
// @grant        none
// ==/UserScript==
/* global window, sessionStorage */
(function () {
    'use strict';

    const KEY = 'QT_WIZARD/QuoteNo';

    const safeSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { } };
    const safeGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
    const safeDel = (k) => { try { sessionStorage.removeItem(k); } catch { } };

    const QuoteNoStash = {
        /** Persist the given QuoteNo (string|number) for this tab */
        set(value) {
            const v = (value == null) ? '' : String(value).trim();
            safeSet(KEY, JSON.stringify({ v, t: Date.now() }));
        },
        /** Retrieve the last stored QuoteNo, or null */
        get() {
            const raw = safeGet(KEY);
            if (!raw) return null;
            try { return (JSON.parse(raw).v || null); } catch { return null; }
        },
        /** Clear the stored QuoteNo (good hygiene once consumed) */
        clear() { safeDel(KEY); },
        /** For debugging in console */
        debugPeek() {
            const raw = safeGet(KEY);
            if (!raw) return null;
            try { return JSON.parse(raw); } catch { return null; }
        },
        _key: () => KEY,
    };

    // Expose for other QT scripts (QT10/QT50) without imports
    try {
        const w = /** @type {any} */ (window);
        w.lt = w.lt || {};
        w.lt.QT = w.lt.QT || {};
        w.lt.QT.QuoteNoStash = QuoteNoStash;
    } catch { }
})();
