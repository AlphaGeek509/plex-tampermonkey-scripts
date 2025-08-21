// ==UserScript==
// @name         LT › Plex TM Utils
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.150
// @description  Shared utilities (fetchData, observeInsert, waitForModelAsync, matchRoute, etc.)
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *.plex.com
// ==/UserScript==



// -------------------------------------------------------------------------------------------------------------------------
//  When to use what (cheat sheet)
//      waitForModelAsync(sel): you need { controller, viewModel } (writeback, methods, grid data, etc.). Use once at init.
//      watchByLabel({ labelText, onChange }): the field has a visible label (e.g., “Customer”). Best for forms.
//      awaitValueByLabel({ labelText }): you just need the first value and you’re done.
//      watchBySelector({ selector, onChange }): no label / grid / custom widget. Target the element directly.
//  All of these can happily live in TMUtils so your page scripts stay tiny and consistent.
// -------------------------------------------------------------------------------------------------------------------------

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

    // Normalize like the auth helper (accepts "user:pass", "Basic …", "Bearer …")
    function _normalizeAuth(raw) {
        if (!raw) return '';
        if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
        // Accept "user:pass" and encode as Basic
        try { return `Basic ${btoa(raw.trim())}`; } catch { return ''; }
    }

    // Resolve API key across routes: prefer PlexAuth/PlexAPI, fallback to GM/localStorage.
    // Mirrors the resolved key to localStorage + GM so future loads on this subdomain don’t need to wait.
    async function getApiKey({
        wait = false,       // set true on routes that load PlexAuth late
        timeoutMs = 0,
        pollMs = 200,
        useCache = true,
        cacheMs = 5 * 60_000
    } = {}) {
        // cache fast-path (lives on TMUtils to avoid scope issues)
        const cached = TMUtils.__apiKeyCache;
        if (useCache && cached && (Date.now() - cached.ts) < cacheMs) {
            return cached.value;
        }

        const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

        const resolveGetter = () =>
            (root?.PlexAuth && typeof root.PlexAuth.getKey === 'function' && root.PlexAuth.getKey) ||
            (root?.PlexAPI && typeof root.PlexAPI.getKey === 'function' && root.PlexAPI.getKey) ||
            null;

        let getter = resolveGetter();

        if (!getter && wait && timeoutMs > 0) {
            const start = Date.now();
            while (!getter && (Date.now() - start) < timeoutMs) {
                await new Promise(r => setTimeout(r, pollMs));
                getter = resolveGetter();
            }
        }

        // 1) Preferred: helper object if available
        if (getter) {
            try {
                const val = getter.call(root);
                const key = (val && typeof val.then === 'function') ? await val : val;
                const out = _normalizeAuth(key);
                if (out) {
                    // Mirror so subsequent loads on this subdomain don’t depend on the helper being present
                    try { localStorage.setItem('PlexApiKey', out); } catch { }
                    try { if (typeof GM_setValue === 'function') GM_setValue('PlexApiKey', out); } catch { }
                    if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
                    return out;
                }
            } catch { /* fall through */ }
        }

        // 2) Fallback: GM store (authoritative if set via menu)
        try {
            const rawGM = typeof GM_getValue === 'function' ? GM_getValue('PlexApiKey', '') : '';
            if (rawGM) {
                const out = _normalizeAuth(rawGM);
                if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
                return out;
            }
        } catch { }

        // 3) Fallback: localStorage on this subdomain
        try {
            const rawLS = localStorage.getItem('PlexApiKey') || '';
            if (rawLS) {
                const out = _normalizeAuth(rawLS);
                if (useCache) TMUtils.__apiKeyCache = { value: out, ts: Date.now() };
                return out;
            }
        } catch { }

        return '';
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
        const auth = _normalizeAuth(await TMUtils.getApiKey().catch(() => ''));

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
            const resp = await fetch(url, {
                method,
                headers: finalHeaders,
                body: payload,
                signal: ctrl.signal,
                credentials: 'include'   // keep same-origin cookies where needed
            });

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

    // Helper used by both watchers
    function __tmCreateQuietDispatcher(fn, delay) {
        let t = null;
        return () => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, delay); };
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

    // Watch a field by its <label> text. Subscribes to KO if available; else falls back to DOM.
    // Returns an unsubscribe() function.
    // --------------------------- watchByLabel (DROP-IN) ---------------------------
    TMUtils.watchByLabel = function watchByLabel({
        labelText,
        onChange: onValue,
        initial = true,
        fireOn = 'change',             // 'change' | 'blur'
        settleMs = 250,
        koPrefer = 'root',
        bagKeys = ['value', 'displayValue', 'boundDisplayValue', 'textInput'],
        widgetSelector = '.k-combobox,.k-dropdown,.k-dropdownlist,.k-autocomplete,[role="combobox"]',
        timeoutMs = 30000,
        logger = null
    } = {}) {
        const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
        const isObs = (x) => (KO?.isObservable?.(x)) || (typeof x === 'function' && typeof x.subscribe === 'function');
        const un = (x) => KO?.unwrap ? KO.unwrap(x) : (typeof x === 'function' ? x() : x);
        const log = (...a) => logger?.log?.(...a);

        const norm = (s) => String(s || '').toLowerCase().replace(/\u00a0/g, ' ').replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
        const want = labelText instanceof RegExp ? labelText : norm(labelText);

        const findLabel = () => {
            const labels = [...document.querySelectorAll('label[for]')];
            for (const l of labels) {
                const txt = norm(l.textContent || l.getAttribute('data-original-text') || '');
                if (labelText instanceof RegExp ? labelText.test(txt) : (txt === want || txt.startsWith(want))) return l;
            }
            return null;
        };

        function hookNow() {
            const label = findLabel();
            if (!label) return null;

            const forId = label.getAttribute('for');
            const el = forId && document.getElementById(forId);
            if (!el) return null;

            let bound = null;
            if (KO?.contextFor) {
                try {
                    const ctx = KO.contextFor(el);
                    const bag = (koPrefer === 'data' ? ctx?.$data?.elements?.[forId] : ctx?.$root?.elements?.[forId])
                        || (koPrefer === 'data' ? ctx?.$root?.elements?.[forId] : ctx?.$data?.elements?.[forId]);
                    if (bag) bound = bagKeys.map(k => bag[k]).find(Boolean) ?? null;

                    if (!bound) {
                        const dbRaw = el.getAttribute('data-bind') || '';
                        const m = /(?:value|textInput)\s*:\s*([^,}]+)/.exec(dbRaw);
                        if (m) {
                            const expr = m[1].trim();
                            const evalIn = (obj) => { try { return Function('with(this){return (' + expr + ')}').call(obj); } catch { return undefined; } };
                            bound = evalIn(ctx?.$data);
                            if (bound === undefined) bound = evalIn(ctx?.$root);
                        }
                    }
                } catch { /* noop */ }
            }

            const kendoWrap = el.closest(widgetSelector);
            const target = kendoWrap?.querySelector('input') || el;

            const read = () => {
                const v = bound !== null ? un(bound) : (el.value ?? '').toString();
                return (Array.isArray(v) ? v[0] : v)?.toString().trim() || '';
            };

            const fire = () => {
                const v = read();
                if (v && typeof onValue === 'function') onValue(v);
            };
            const queueFire = __tmCreateQuietDispatcher(fire, settleMs);

            const unsubs = [];

            if (initial && fireOn !== 'blur') queueFire();

            if (isObs(bound)) {
                const sub = bound.subscribe(() => queueFire());
                unsubs.push(() => sub.dispose?.());
                log?.('watchByLabel: KO subscription attached for', labelText);
            }

            if (fireOn === 'blur') {
                const onFocusOut = () => queueFire();
                const onChange = () => queueFire();
                const onKeyDown = (e) => { if (e.key === 'Tab' || e.key === 'Enter') setTimeout(queueFire, 0); };

                target.addEventListener('focusout', onFocusOut, true);
                target.addEventListener('change', onChange);
                target.addEventListener('keydown', onKeyDown);

                if (kendoWrap && kendoWrap !== target) {
                    kendoWrap.addEventListener('focusout', onFocusOut, true);
                    kendoWrap.addEventListener('change', onChange, true);
                }

                const mo = new MutationObserver(() => queueFire());
                mo.observe(target, { childList: true, characterData: true, subtree: true });

                unsubs.push(() => {
                    target.removeEventListener('focusout', onFocusOut, true);
                    target.removeEventListener('change', onChange);
                    target.removeEventListener('keydown', onKeyDown);
                    if (kendoWrap && kendoWrap !== target) {
                        kendoWrap.removeEventListener('focusout', onFocusOut, true);
                        kendoWrap.removeEventListener('change', onChange, true);
                    }
                    mo.disconnect();
                });
            } else {
                const onChange = () => queueFire();
                target.addEventListener('change', onChange);
                unsubs.push(() => target.removeEventListener('change', onChange));
            }


            log?.('watchByLabel: listeners attached for', labelText, target);
            return () => { unsubs.forEach(fn => { try { fn(); } catch { } }); };
        }

        let unsub = hookNow();
        if (typeof unsub === 'function') return unsub;

        const mo = new MutationObserver(() => {
            unsub = hookNow();
            if (typeof unsub === 'function') mo.disconnect();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), timeoutMs);

        return () => { try { typeof unsub === 'function' && unsub(); } catch { } try { mo.disconnect(); } catch { } };
    };

    // Resolve once with the first non-empty value, then auto-unsubscribe
    TMUtils.awaitValueByLabel = function awaitValueByLabel({ labelText, timeoutMs = 30000, logger = null } = {}) {
        return new Promise((resolve, reject) => {
            let stop = null;
            let done = false;
            const timer = setTimeout(() => { if (!done) { done = true; stop?.(); reject(new Error('Timeout')); } }, timeoutMs);
            stop = TMUtils.watchByLabel({
                labelText,
                initial: true,
                logger,
                onChange: (v) => {
                    if (done || !v) return;
                    done = true;
                    clearTimeout(timer);
                    stop?.();           // clean up
                    resolve(v);
                }
            });
        });
    };


    // --------------------------- watchBySelector (DROP-IN) ---------------------------
    TMUtils.watchBySelector = function watchBySelector({
        selector,
        onChange: onValue,
        initial = true,
        fireOn = 'change',             // 'change' | 'blur'
        settleMs = 250,                // wait for KO/Kendo/DOM to settle
        koPrefer = 'root',
        bagKeys = ['value', 'displayValue', 'boundDisplayValue', 'textInput'],
        widgetSelector = '.k-combobox,.k-dropdown,.k-dropdownlist,.k-autocomplete,[role="combobox"]',
        timeoutMs = 30000,
        logger = null
    } = {}) {
        const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
        const isObs = (x) => (KO?.isObservable?.(x)) || (typeof x === 'function' && typeof x.subscribe === 'function');
        const un = (x) => KO?.unwrap ? KO.unwrap(x) : (typeof x === 'function' ? x() : x);
        const log = (...a) => logger?.log?.(...a);

        function hookNow() {
            const el = document.querySelector(selector);
            if (!el) return null;

            let ctx = null, bag = null, obs = null;
            try {
                ctx = KO?.contextFor ? KO.contextFor(el) : null;
                const id = el.id;
                const fromRoot = id && ctx?.$root?.elements?.[id];
                const fromData = id && ctx?.$data?.elements?.[id];
                bag = (koPrefer === 'data' ? fromData : fromRoot) || (koPrefer === 'data' ? fromRoot : fromData) || null;

                if (bag) {
                    const cand = bagKeys.map(k => bag[k]).find(Boolean);
                    if (isObs(cand)) obs = cand;
                }

                if (!obs && KO?.contextFor) {
                    const dbRaw = el.getAttribute('data-bind') || '';
                    const m = /(?:value|textInput)\s*:\s*([^,}]+)/.exec(dbRaw);
                    if (m) {
                        const expr = m[1].trim();
                        const evalIn = (obj) => { try { return Function('with(this){return (' + expr + ')}').call(obj); } catch { return undefined; } };
                        const probe = evalIn(ctx?.[koPrefer === 'data' ? '$data' : '$root']);
                        if (isObs(probe)) obs = probe;
                    }
                }
            } catch { /* noop */ }

            const kendoWrap = el.closest(widgetSelector);
            const target = kendoWrap?.querySelector('input') || el;

            const read = () => {
                let v;
                if (obs) v = un(obs);
                else if (bag) {
                    const bagVal = bagKeys.map(k => bag[k]).find(Boolean);
                    v = typeof bagVal === 'function' ? bagVal() : bagVal;
                }
                if (v == null || v === '') v = (el.value ?? el.textContent ?? '');
                const s = Array.isArray(v) ? v[0] : v;
                return (s ?? '').toString().trim();
            };

            const fire = () => {
                const val = read();
                if (val !== '' && typeof onValue === 'function') onValue(val);
            };
            const queueFire = __tmCreateQuietDispatcher(fire, settleMs);

            const unsubs = [];

            // Initial fire (skip if blur-mode, because user hasn’t confirmed yet)
            if (initial && fireOn !== 'blur') queueFire();

            // KO subscriptions collapse into a single queued fire
            if (obs && typeof obs.subscribe === 'function') {
                const sub = obs.subscribe(() => queueFire());
                unsubs.push(() => sub.dispose?.());
                log?.('watchBySelector: KO observable subscription attached for', selector);
            }

            // Bag wrappers (optional)
            if (bag) {
                const bagUnhooks = [];
                const wrap = (obj, name) => {
                    if (!obj || typeof obj[name] !== 'function') return;
                    const orig = obj[name];
                    obj[name] = function wrapped(...args) { try { queueFire(); } catch { } return orig.apply(this, args); };
                    bagUnhooks.push(() => { obj[name] = orig; });
                };
                ['onchange', 'onblur', 'onkeyup', 'onkeydown'].forEach(n => wrap(bag, n));
                unsubs.push(() => bagUnhooks.forEach(fn => { try { fn(); } catch { } }));
                log?.('watchBySelector: bag event wrappers attached for', selector);
            }

            // DOM listeners — no 'input' handler in blur/change mode => no keystroke spam
            if (fireOn === 'blur') {
                const onFocusOut = () => queueFire();
                const onChange = () => queueFire();
                const onKeyDown = (e) => { if (e.key === 'Tab' || e.key === 'Enter') setTimeout(queueFire, 0); };

                // Focus-out (bubbling) is more reliable with Kendo wrappers; use capture
                target.addEventListener('focusout', onFocusOut, true);
                target.addEventListener('change', onChange);
                target.addEventListener('keydown', onKeyDown);

                // If there is a widget wrapper, listen there too (some combos move focus)
                if (kendoWrap && kendoWrap !== target) {
                    kendoWrap.addEventListener('focusout', onFocusOut, true);
                    kendoWrap.addEventListener('change', onChange, true);
                }

                const mo = new MutationObserver(() => queueFire());
                mo.observe(target, { childList: true, characterData: true, subtree: true });

                unsubs.push(() => {
                    target.removeEventListener('focusout', onFocusOut, true);
                    target.removeEventListener('change', onChange);
                    target.removeEventListener('keydown', onKeyDown);
                    if (kendoWrap && kendoWrap !== target) {
                        kendoWrap.removeEventListener('focusout', onFocusOut, true);
                        kendoWrap.removeEventListener('change', onChange, true);
                    }
                    mo.disconnect();
                });
            } else {
                const onChange = () => queueFire();
                target.addEventListener('change', onChange);
                unsubs.push(() => target.removeEventListener('change', onChange));
            }


            log?.('watchBySelector: listeners attached for', selector, target);
            return () => { unsubs.forEach(fn => { try { fn(); } catch { } }); };
        }

        let unsub = hookNow();
        if (typeof unsub === 'function') return unsub;

        const mo = new MutationObserver(() => {
            unsub = hookNow();
            if (typeof unsub === 'function') mo.disconnect();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), timeoutMs);

        return () => { try { typeof unsub === 'function' && unsub(); } catch { } try { mo.disconnect(); } catch { } };
    };

    (function installTmUrlObserver() {
        if (window.__tmUrlObsInstalled) return;
        window.__tmUrlObsInstalled = true;

        const EV = 'tmutils:urlchange';
        const fire = () => window.dispatchEvent(new CustomEvent(EV));

        const origPush = history.pushState;
        history.pushState = function () { const r = origPush.apply(this, arguments); fire(); return r; };

        const origReplace = history.replaceState;
        history.replaceState = function () { const r = origReplace.apply(this, arguments); fire(); return r; };

        window.addEventListener('popstate', fire);

        TMUtils.onUrlChange = function onUrlChange(cb) {
            const h = () => cb(location);
            window.addEventListener(EV, h);
            return () => window.removeEventListener(EV, h);
        };

        TMUtils._dispatchUrlChange = fire; // optional: manual trigger
    })();


    // ---------------------------------------------------------------------
    // 🔁 Global exposure for TamperMonkey sandbox
    // ---------------------------------------------------------------------
    Object.assign(TMUtils, {
        getApiKey,
        fetchData: TMUtils.fetchData, 
        watchByLabel: TMUtils.watchByLabel,
        awaitValueByLabel: TMUtils.awaitValueByLabel,
        watchBySelector: TMUtils.watchBySelector,
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

    //console.log('🐛 TMUtils loaded from local build:', {
    //    waitForModelAsync: typeof TMUtils.waitForModelAsync,
    //    observeInsert: typeof TMUtils.observeInsert,
    //    fetchData: typeof TMUtils.fetchData,
    //    toast: typeof TMUtils.toast,
    //    ensureRoute: typeof TMUtils.ensureRoute
    //});

})(window);
