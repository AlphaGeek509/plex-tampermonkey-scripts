// ==UserScript==
// @name         LT › Plex TM Utils
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.97
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
    // Create + expose first so we can safely attach props below
    const TMUtils = {};
    window.TMUtils = TMUtils;

    if (typeof unsafeWindow !== 'undefined') unsafeWindow.TMUtils = TMUtils;
    

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

    // Low-level: one place that actually executes the HTTP call
    TMUtils.fetchData = async function fetchData(url, { method = 'GET', headers = {}, body, timeoutMs = 15000, useXHR = false } = {}) {
        const auth = await TMUtils.getApiKey().catch(() => '');
        const finalHeaders = {
            'Accept': 'application/json',
            ...(body ? { 'Content-Type': 'application/json;charset=UTF-8' } : {}),
            ...(auth ? { 'Authorization': auth } : {}),
            ...headers
        };
        const payload = typeof body === 'string' ? body : (body ? JSON.stringify(body) : undefined);

        if (useXHR && typeof GM_xmlhttpRequest === 'function') {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
                GM_xmlhttpRequest({
                    method, url, headers: finalHeaders, data: payload,
                    onload: (res) => {
                        clearTimeout(timer);
                        const ok = res.status >= 200 && res.status < 300;
                        if (!ok) return reject(new Error(`${res.status} ${res.statusText || 'Request failed'}`));
                        try { resolve(JSON.parse(res.responseText || '{}')); }
                        catch { resolve({}); } // tolerate empty/invalid json => {}
                    },
                    onerror: () => { clearTimeout(timer); reject(new Error('Network error')); },
                    ontimeout: () => { clearTimeout(timer); reject(new Error('Network timeout')); }
                });
            });
        }

        // fetch path
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const resp = await fetch(url, { method, headers: finalHeaders, body: payload, signal: ctrl.signal });
            if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
            const text = await resp.text();
            return text ? JSON.parse(text) : {};
        } finally {
            clearTimeout(t);
        }
    };

    // DS helpers: the only API your userscripts need to call
    TMUtils.ds = async function ds(sourceId, payload, opts = {}) {
        const url = `${location.origin}/api/datasources/${sourceId}/execute?format=2`;
        const json = await TMUtils.fetchData(url, { method: 'POST', body: payload, ...opts });
        // normalize: always return { rows: [...] }
        const rows = Array.isArray(json?.rows) ? json.rows : [];
        return { ...json, rows }; // keep any extra fields if Plex adds them
    };

    TMUtils.dsRows = async function dsRows(sourceId, payload, opts = {}) {
        const { rows } = await TMUtils.ds(sourceId, payload, opts);
        return rows;
    };

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
                console.debug('selector →', sel);
                console.debug('controller →', ctrl);
                console.debug('vm →', vm);
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
            try { handler(location.pathname); } catch (e) { console.warn('onRouteChange handler error', e); }
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
    // Logger Helpers
    // ---------------------------------------------------------------------
    function setDebug(v) { __tmDebug = !!v; }
    function makeLogger(ns) {
        const label = ns || 'TM';
        const emit = (m, badge, ...a) => (console[m] || console.log)(`${label} ${badge}`, ...a);
        return {
            log: (...a) => emit('log', '▶️', ...a),
            info: (...a) => emit('info', 'ℹ️', ...a),
            warn: (...a) => emit('warn', '⚠️', ...a),
            error: (...a) => emit('error', '✖️', ...a),
            ok: (...a) => emit('log', '✅', ...a)
        };
    }

    function deriveNsFromScriptName() {
        try {
            const name = (typeof GM_info !== 'undefined' && GM_info?.script?.name) || '';
            if (!name) return 'TM';
            // grab the first token before a space/arrow (works for “QT10 …”, “CR&S10 ➜ …”, etc.)
            return name.split(/[ \t–—\-→➜>]/)[0].trim() || 'TM';
        } catch { return 'TM'; }
    }

    function getLogger(ns) {
        const label = ns || deriveNsFromScriptName();
        return TMUtils.makeLogger ? TMUtils.makeLogger(label) : {
            log: (...a) => console.log(`${label} ▶️`, ...a),
            info: (...a) => console.info(`${label} ℹ️`, ...a),
            warn: (...a) => console.warn(`${label} ⚠️`, ...a),
            error: (...a) => console.error(`${label} ✖️`, ...a),
            ok: (...a) => console.log(`${label} ✅`, ...a),
        };
    }

    // Optional: set a global `L` for convenience (avoid if you fear collisions)
    function attachLoggerGlobal(ns) {
        const logger = getLogger(ns);
        window.L = logger;
        if (typeof unsafeWindow !== 'undefined') unsafeWindow.L = logger;
        return logger;
    }

    // ---------------------------------------------------------------------
    // 🔁 Global exposure for TamperMonkey sandbox
    // ---------------------------------------------------------------------
    Object.assign(TMUtils, {
        // core
        getApiKey,
        fetchData,        // low-level HTTP
        ds, dsRows,       // DS helpers
        getLogger, attachLoggerGlobal,

        // UI / toast
        showMessage, hideMessage, toast,

        // DOM/KO helpers
        observeInsert, waitForModel, waitForModelAsync,
        selectOptionByText, selectOptionByValue,

        // routing + debug
        ensureRoute, onRouteChange, matchRoute,
        setDebug, makeLogger,

        // internal (if you intend to expose it)
        _buildAuthHeader
    });


    console.log('🐛 TMUtils loaded from local build:', {
        waitForModelAsync: typeof TMUtils.waitForModelAsync,
        observeInsert: typeof TMUtils.observeInsert,
        fetchData: typeof TMUtils.fetchData,
        toast: typeof TMUtils.toast,
        ensureRoute: typeof TMUtils.ensureRoute
    });

})(window);
