// ==UserScript==
// @name         LT › Plex TM Utils
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.109
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

    // ensure a place to cache the key lives on the shared object
    if (!('__apiKeyCache' in TMUtils)) TMUtils.__apiKeyCache = null;


    // Resolve Plex API key safely from page context (supports late load + caching)
    async function getApiKey({
        wait = true,          // poll for the getter if not present yet
        timeoutMs = 5000,     // how long to wait
        pollMs = 200,         // poll interval
        useCache = true,      // return a cached key if fresh
        cacheMs = 5 * 60_000  // consider cache fresh for 5 minutes
    } = {}) {
        // cache fast-path
        const cached = TMUtils.__apiKeyCache;
        if (useCache && cached && (Date.now() - cached.ts) < cacheMs) {
            return cached.value;
        }

        const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

        const resolveGetter = () => {
            const g1 = root?.PlexAuth && typeof root.PlexAuth.getKey === 'function' ? root.PlexAuth.getKey : null;
            const g2 = root?.PlexAPI && typeof root.PlexAPI.getKey === 'function' ? root.PlexAPI.getKey : null;
            return g1 || g2 || null;
        };

        let getter = resolveGetter();

        if (!getter && wait) {
            const start = Date.now();
            while (!getter && (Date.now() - start) < timeoutMs) {
                await new Promise(r => setTimeout(r, pollMs));
                getter = resolveGetter();
            }
        }

        if (!getter) return '';

        try {
            const val = getter.call(root);
            const key = (val && typeof val.then === 'function') ? await val : val;
            const out = (typeof key === 'string' ? key.trim() : '') || '';
            if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
            return out;
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
        const auth = _buildAuthHeader(await TMUtils.getApiKey().catch(() => ''));

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
                    method, url, headers: finalHeaders, data: payload, timeout: timeoutMs,
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
        waitForModelAsync(selector, { pollMs: interval, timeoutMs: interval * maxAttempts })
            .then(cb)
            .catch(e => console.error('waitForModel error:', e));
    }

    // TMUtils v3.6.x — KO-aware waiter (standardized return)
    function waitForModelAsync(sel, {
        pollMs = 250,
        timeoutMs = 30000,
        requireKo = true,   // if false, resolve as soon as the element is found
        logger = null,      // pass TMUtils.getLogger('QT10') / _logger, etc.
        log = false         // set true to print debug with console.* even without a logger
    } = {}) {
        const start = Date.now();

        const getKo = () =>
            (typeof window !== 'undefined' && window.ko) ||
            (typeof unsafeWindow !== 'undefined' && unsafeWindow.ko) || null;

        const dbg = (fn, ...args) => {
            if (logger && typeof logger[fn] === 'function') logger[fn](...args);
            else if (log) (console[fn] || console.log)(...args);
        };

        return new Promise((resolve, reject) => {
            function tick() {
                const el = document.querySelector(sel);
                if (!el) return schedule();

                if (!requireKo) {
                    // return early without KO context
                    log && console.debug('🔍 waitForModelAsync (no KO):', { sel, el });
                    return resolve({ element: el, controller: null, viewModel: null });
                }

                const koObj = getKo();
                if (!koObj || typeof koObj.contextFor !== 'function') return schedule();

                let controller = null, viewModel = null;
                try {
                    const ctx = koObj.contextFor(el);
                    controller = ctx && ctx.$data || null;                  // e.g., controller
                    viewModel = (controller && controller.model) || null;  // e.g., VM on controller
                    if (!viewModel && ctx) viewModel = ctx.$root?.data || ctx.$root || null; // VM fallback
                } catch { /* not ready yet */ }

                if (logger || log) {
                    console.groupCollapsed('🔍 waitForModelAsync');
                    dbg('debug', 'selector →', sel);
                    dbg('debug', 'controller →', controller);
                    dbg('debug', 'vm →', viewModel);
                    console.groupEnd();
                }

                if (viewModel) return resolve({ element: el, controller, viewModel });
                schedule();
            }

            function schedule() {
                if ((Date.now() - start) >= timeoutMs) {
                    const msg = `Timed out waiting for "${sel}" after ${timeoutMs}ms`;
                    dbg('warn', '⌛ waitForModelAsync', msg);
                    return reject(new Error(msg));
                }
                setTimeout(tick, pollMs);
            }

            tick();
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
        if (history.__tmWrapped) { handler(location.pathname); return; }
        const fire = () => {
            try { handler(location.pathname); } catch (e) { console.warn('onRouteChange handler error', e); }
        };
        const _ps = history.pushState;
        history.pushState = function () { _ps.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        const _rs = history.replaceState;
        history.replaceState = function () { _rs.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        window.addEventListener('popstate', fire);
        window.addEventListener('locationchange', fire);
        history.__tmWrapped = true;
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
    let __tmDebug = false;            // declare this so setDebug works
    function setDebug(v) { __tmDebug = !!v; }
    function makeLogger(ns) {
        const label = ns || 'TM';
        const emit = (m, badge, ...a) => (console[m] || console.log)(`${label} ${badge}`, ...a);
        return {
            log: (...a) => emit('log', '▶️', ...a),
            info: (...a) => emit('info', 'ℹ️', ...a),
            warn: (...a) => emit('warn', '⚠️', ...a),
            error: (...a) => emit('error', '✖️', ...a),
            ok: (...a) => emit('log', '✅', ...a),
        };
    }

    // Simple global shims so TMUtils.log/warn/error exist (handy for your dlog/dwarn/derror)
    function log(...a) { console.log('TM ▶️', ...a); }
    function warn(...a) { console.warn('TM ⚠️', ...a); }
    function error(...a) { console.error('TM ✖️', ...a); }
    function ok(...a) { console.log('TM ✅', ...a); }

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
        getApiKey,
        fetchData: TMUtils.fetchData, // ← reference the property you set earlier
        showMessage, hideMessage, observeInsert,
        waitForModel, waitForModelAsync,
        selectOptionByText, selectOptionByValue,
        toast,
        log, warn, error, ok,
        ensureRoute, onRouteChange, matchRoute,
        setDebug, makeLogger, getLogger, attachLoggerGlobal,
        _buildAuthHeader,
        ds: TMUtils.ds, dsRows: TMUtils.dsRows
    });

    console.log('🐛 TMUtils loaded from local build:', {
        waitForModelAsync: typeof TMUtils.waitForModelAsync,
        observeInsert: typeof TMUtils.observeInsert,
        fetchData: typeof TMUtils.fetchData,
        toast: typeof TMUtils.toast,
        ensureRoute: typeof TMUtils.ensureRoute
    });

})(window);
