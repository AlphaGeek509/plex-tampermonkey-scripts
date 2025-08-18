// ==UserScript==
// @name         LT › Plex TM Utils
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @namespace    http://tampermonkey.net/
// @version      3.5.93
// @description  Shared utilities (fetchData, observeInsert, waitForModelAsync, matchRoute, etc.)
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *.plex.com
// ==/UserScript==

(function (window) {
    'use strict';

    // ---------------------------------------------------------------------
    // ENV / FLAGS
    // ---------------------------------------------------------------------
    const DEV = /test\.on\.plex\.com$/i.test(location.hostname);
    let __tmDebug = false;
    function setDebug(v) { __tmDebug = !!v; }

    function log(...args) { if (__tmDebug) console.log('TMUtils:', ...args); }
    function warn(...args) { if (__tmDebug) console.warn('TMUtils:', ...args); }
    function error(...args) { console.error('TMUtils:', ...args); } // errors always print

    // ---------------------------------------------------------------------
    // 1) Fetch Plex API key (now robust to PlexAuth or PlexAPI; async-safe)
    //    - Back-compat: your original used PlexAPI.getKey()
    //    - New: prefers PlexAuth.getKey() if present
    // ---------------------------------------------------------------------
    async function getApiKey() {
        try {
            const getter =
                (window.PlexAuth && typeof window.PlexAuth.getKey === 'function' && window.PlexAuth.getKey) ||
                (window.PlexAPI && typeof window.PlexAPI.getKey === 'function' && window.PlexAPI.getKey);
            if (!getter) return '';
            const val = getter();
            return (val && typeof val.then === 'function') ? await val : val || '';
        } catch {
            return '';
        }
    }

    // Normalizes Authorization header
    function _buildAuthHeader(raw) {
        if (!raw) return '';
        if (/^(Basic|Bearer)\s/i.test(raw)) return raw;
        // Your current auth flow prefers Basic; keep that default
        return `Basic ${raw}`;
    }

    // ---------------------------------------------------------------------
    // 2) Generic data fetch from Plex datasource (keeps your original API)
    //    - Default: same-origin fetch to /api/datasources/{id}/execute?format=2
    //    - Injects Authorization using your saved key
    //    - Adds optional XHR path (GM_xmlhttpRequest) for cross-origin if needed
    // ---------------------------------------------------------------------
    async function fetchData(sourceId, payload, opts = {}) {
        const key = _buildAuthHeader(await getApiKey());
        const url = `${location.origin}/api/datasources/${sourceId}/execute?format=2`;

        if (opts.useXHR) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json;charset=UTF-8',
                        ...(key ? { 'Authorization': key } : {})
                    },
                    data: JSON.stringify(payload ?? {}),
                    onload: (res) => {
                        const ok = res.status >= 200 && res.status < 300;
                        if (!ok) return reject(new Error(`Fetch ${sourceId} failed: ${res.status}`));
                        try {
                            const parsed = JSON.parse(res.responseText || '{}');
                            resolve(parsed.rows || []);
                        } catch {
                            reject(new Error('Invalid JSON response'));
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Network timeout'))
                });
            });
        }

        // Original same-origin fetch path (unchanged behavior, now with Authorization)
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json;charset=UTF-8',
                ...(key ? { 'Authorization': key } : {})
            },
            body: JSON.stringify(payload ?? {})
        });
        if (!resp.ok) throw new Error(`Fetch ${sourceId} failed: ${resp.status}`);
        const { rows = [] } = await resp.json();
        return rows;
    }

    // ---------------------------------------------------------------------
    // 3) Floating message UI (kept as-is; added toast() alias + log())
    // ---------------------------------------------------------------------
    function hideMessage() {
        document.getElementById('tm-msg')?.remove();
    }

    function showMessage(text, { type = 'info', autoClear = 4000 } = {}) {
        hideMessage();
        const colors = {
            info: { bg: '#d9edf7', fg: '#31708f' },
            success: { bg: '#dff0d8', fg: '#3c763d' },
            warning: { bg: '#fcf8e3', fg: '#8a6d3b' },
            error: { bg: '#f2dede', fg: '#a94442' }
        }[type] || { bg: '#fff', fg: '#000' };
        const box = document.createElement('div');
        box.id = 'tm-msg';
        Object.assign(box.style, {
            position: 'fixed', top: '10px', right: '10px',
            padding: '8px 12px', backgroundColor: colors.bg,
            color: colors.fg, border: `1px solid ${colors.fg}`,
            borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            zIndex: 10000, fontSize: '0.9em', maxWidth: '80%',
            whiteSpace: 'pre-line'
        });
        box.textContent = text;
        document.body.appendChild(box);
        if (autoClear) setTimeout(hideMessage, autoClear);
    }

    // Alias: unified toast API
    function toast(msg, level = 'info', ms) {
        showMessage(msg, { type: level, autoClear: ms ?? 4000 });
    }

    // Dev logger
    //function log(...args) {
    //    if (DEV) log('TMUtils:', ...args);
    //}

    // ---------------------------------------------------------------------
    // 4) DOM insertion observer (kept as-is)
    // ---------------------------------------------------------------------
    function observeInsert(selector, callback) {
        const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect(); callback(el);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        const existing = document.querySelector(selector);
        if (existing) { obs.disconnect(); callback(existing); }
    }

    // ---------------------------------------------------------------------
    // 5) KO controller + VM waiters (kept; async variant preserved)
    // ---------------------------------------------------------------------
    function waitForModel(selector, cb, interval = 100, maxAttempts = 100) {
        waitForModelAsync(selector, interval, maxAttempts)
            .then(cb)
            .catch(e => console.error('waitForModel error:', e));
    }

    async function waitForModelAsync(sel, interval = 250, max = 10000) {
        return new Promise((resolve, reject) => {
            let tries = 0;
            function go() {
                const el = document.querySelector(sel);
                if (!el || typeof ko?.contextFor !== 'function') return next();

                const ctrl = ko.contextFor(el).$data; // FormattedAddressController
                const vm = ctrl && ctrl.model;        // QuoteWizard VM

                console.groupCollapsed('🔍 waitForModelAsync');
                log('selector →', sel);
                log('controller →', ctrl);
                log('vm →', vm);
                console.groupEnd();

                if (vm) return resolve({ controller: ctrl, viewModel: vm });
                next();
            }
            function next() {
                if (++tries >= max) {
                    console.warn(`⌛ waitForModelAsync timed out`);
                    return reject(new Error('Timed out'));
                }
                setTimeout(go, interval);
            }
            go();
        });
    }

    // ---------------------------------------------------------------------
    // 6) Select <option> helpers (kept)
    // ---------------------------------------------------------------------
    function selectOptionByText(selectEl, text) {
        const opt = Array.from(selectEl.options)
            .find(o => o.textContent.trim() === text);
        if (opt) { selectEl.value = opt.value; selectEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    function selectOptionByValue(selectEl, value) {
        const opt = Array.from(selectEl.options)
            .find(o => o.value == value);
        if (opt) { selectEl.value = opt.value; selectEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    // ---------------------------------------------------------------------
    // 7) Route helpers (new): ensureRoute(regex) + onRouteChange(handler)
    // ---------------------------------------------------------------------
    function ensureRoute(regex) {
        try { return regex.test(location.pathname); }
        catch { return false; }
    }

    function onRouteChange(handler) {
        const fire = () => {
            try { handler(location.pathname); } catch (e) { log('onRouteChange handler error', e); }
        };
        const _ps = history.pushState;
        history.pushState = function () { _ps.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        const _rs = history.replaceState;
        history.replaceState = function () { _rs.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        window.addEventListener('popstate', fire);
        window.addEventListener('locationchange', fire);
        fire(); // immediate fire for initial route
    }

    // ---------------------------------------------------------------------
    // 8) Route matcher (new): accepts regex or array of regex
    // ---------------------------------------------------------------------
    function matchRoute(regexOrArray, path = location.pathname) {
        if (!regexOrArray) return false;
        if (regexOrArray instanceof RegExp) return regexOrArray.test(path);
        if (Array.isArray(regexOrArray)) return regexOrArray.some(rx => rx.test(path));
        return false;
    }

    // ---------------------------------------------------------------------
    // 🔁 Global exposure for TamperMonkey sandbox
    // ---------------------------------------------------------------------
    const TMUtils = {
        // existing
        getApiKey,
        fetchData,
        showMessage,
        hideMessage,
        observeInsert,
        waitForModel,
        waitForModelAsync,
        selectOptionByText,
        selectOptionByValue,

        // new/standardized
        toast,
        log,
        warn,
        error,
        ensureRoute,
        onRouteChange,
        matchRoute,
        setDebug,

        // exposed for completeness
        _buildAuthHeader
    };

    window.TMUtils = TMUtils;
    unsafeWindow.TMUtils = TMUtils;

    console.log('🐛 TMUtils loaded from local build:', {
        waitForModelAsync: typeof waitForModelAsync,
        observeInsert: typeof observeInsert,
        fetchData: typeof fetchData,
        toast: typeof toast,
        ensureRoute: typeof ensureRoute
    });

})(window);
