// ==UserScript==
// @name         LT › Plex TM Utils
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.8.49
// @description  Shared utilities
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
    // KO unwrap helpers (exported)
    // ---------------------------------------------------------------------
    // TMUtils.unwrap(v): returns the plain value of a KO observable/computed, else v
    // TMUtils.unwrapDeep(x): recursively unwraps arrays/objects of KO values (safe for JSON)
    // TMUtils.jsonPlain(x, space?): JSON.stringify(TMUtils.unwrapDeep(x), space)
    (function addUnwrapHelpers() {
        try {
            const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

            if (!TMUtils.unwrap) {
                TMUtils.unwrap = function unwrap(v) {
                    try {
                        if (KO && typeof KO.unwrap === 'function') return KO.unwrap(v);
                        return (typeof v === 'function') ? v() : v;
                    } catch { return v; }
                };
            }

            if (!TMUtils.unwrapDeep) {
                TMUtils.unwrapDeep = function unwrapDeep(x) {
                    const seen = new WeakMap();

                    const isKO = (fn) => !!fn && typeof fn === 'function' && (
                        (KO && KO.isObservable && KO.isObservable(fn)) ||
                        (KO && KO.isComputed && KO.isComputed(fn)) ||
                        (typeof fn.subscribe === 'function') ||
                        fn._isObs === true
                    );

                    const un = (v) => (KO && typeof KO.unwrap === 'function')
                        ? KO.unwrap(v)
                        : (typeof v === 'function' ? (isKO(v) ? v() : v) : v);

                    const walk = (v) => {
                        if (v == null) return v;
                        const t = typeof v;

                        if (t === 'string' || t === 'number' || t === 'boolean') return v;
                        if (Array.isArray(v)) return v.map(walk);
                        if (t === 'function') return un(v);
                        if (t === 'object') {
                            if (seen.has(v)) return seen.get(v);
                            const out = Array.isArray(v) ? [] : {};
                            seen.set(v, out);
                            for (const k in v) {
                                if (Object.prototype.hasOwnProperty.call(v, k)) {
                                    out[k] = walk(v[k]);
                                }
                            }
                            return out;
                        }
                        return v;
                    };

                    return walk(x);
                };
            }

            if (!TMUtils.jsonPlain) {
                TMUtils.jsonPlain = function jsonPlain(x, space = 0) {
                    try { return JSON.stringify(TMUtils.unwrapDeep(x), null, space); }
                    catch { return JSON.stringify(x, null, space); }
                };
            }
        } catch (e) {
            // no-op: KO may not be present yet in some contexts
        }
    })();

    // ---------------------------------------------------------------------
    // KO/Plex observable read & write helpers
    // ---------------------------------------------------------------------
    (function addObsAccessors() {
        const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        const KO = root.ko;

        // Returns the getter/setter or plain prop from Plex helper if available
        function _plexGetter(vm, prop) {
            const g = root?.plex?.data?.getObservableOrValue;
            return (typeof g === 'function') ? g(vm, prop) : undefined;
        }

        /**
         * Read a property from a Plex KO view-model and fully unwrap it.
         * - Supports dotted paths "Foo.Bar"
         * - If the final value is an array and options.first === true, returns first item
         * - options.trim: if true, returns a trimmed string for string/number
         */
        TMUtils.getObsValue = function getObsValue(vmOrEl, pathOrPaths, {
            first = true,      // if value is an array, return first item
            trim = false,      // trim string/number to string
            deep = true,       // deep unwrap (KO + nested)
            allowPlex = true,  // use plex.data.getObservableOrValue when available
            coalesceFalsy = false // if false, empty string is treated as "not found" and tries next candidate
        } = {}) {
            if (!vmOrEl || !pathOrPaths) return undefined;

            const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
            const KO = root.ko;
            const unwrapOnce = (v) => {
                try {
                    if (TMUtils.unwrap) return TMUtils.unwrap(v);
                    if (KO?.unwrap) return KO.unwrap(v);
                    return (typeof v === 'function') ? v() : v;
                } catch { return v; }
            };
            const unwrapDeep = (v) => {
                try {
                    if (TMUtils.unwrapDeep) return TMUtils.unwrapDeep(v);
                    if (KO?.unwrap) return KO.unwrap(v);
                    return (typeof v === 'function') ? v() : v;
                } catch { return v; }
            };
            const isKOFunc = (f) => !!f && typeof f === 'function' &&
                (KO?.isObservable?.(f) || 'peek' in f || 'subscribe' in f || 'notifySubscribers' in f);

            // If given a DOM node, resolve KO root VM
            let vm = vmOrEl;
            if (vmOrEl && vmOrEl.nodeType === 1) {
                try {
                    const ctx = KO?.contextFor?.(vmOrEl);
                    vm = ctx?.$root?.data ?? ctx?.$root ?? ctx?.$data ?? vmOrEl;
                } catch { /* ignore */ }
            }

            const candidates = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];

            const readViaPlex = (p) => {
                try {
                    const g = root?.plex?.data?.getObservableOrValue;
                    if (allowPlex && typeof g === 'function') {
                        const acc = g(vm, p);               // KO observable/computed OR plain value
                        return (typeof acc === 'function') ? acc() : acc;
                    }
                } catch { /* ignore */ }
                return undefined;
            };

            const readViaPath = (p) => {
                try {
                    const segments = String(p).split('.');
                    let cur = vm;
                    for (const k of segments) {
                        cur = (cur == null) ? undefined : cur[k];
                        if (cur === undefined) break;
                    }
                    if (typeof cur === 'function') return isKOFunc(cur) ? cur() : cur; // don't accidentally execute non-KO methods
                    return cur;
                } catch {
                    return undefined;
                }
            };

            for (const p of candidates) {
                let v = readViaPlex(p);
                if (v === undefined) v = readViaPath(p);

                v = deep ? unwrapDeep(v) : unwrapOnce(v);
                if (first && Array.isArray(v)) v = v.length ? v[0] : undefined;

                if (trim && (typeof v === 'string' || typeof v === 'number')) v = String(v).trim();

                const hasValue = (v !== undefined && v !== null && (coalesceFalsy || v !== ''));
                if (hasValue) return v;
            }

            return undefined;
        };


        /**
         * Write a value to a Plex KO view-model property.
         * - Supports dotted paths "Foo.Bar"
         * - If the target is an observable function, calls it with value
         * - If the target is an array, replaces contents with a single value
         * - Else assigns directly
         */
        // Array-aware write: respects KO observableArray, KO observable, or plain prop
        TMUtils.setObsValue = function setObsValue(vm, path, value) {
            if (!vm || !path) return;

            const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
            const KO = root.ko;

            // Helper to coerce to array iff target is array-shaped
            const toArrayIf = (isArrayTarget, v) => isArrayTarget ? (Array.isArray(v) ? v : [v]) : v;

            // Try Plex accessor first (usually returns a KO observable function)
            const plexGet = root?.plex?.data?.getObservableOrValue;
            if (typeof plexGet === 'function') {
                const acc = plexGet(vm, path);            // getter/setter function or value
                if (typeof acc === 'function') {
                    // Detect observableArray via method presence
                    const isObsArray = !!(acc && typeof acc.push === 'function' && typeof acc.removeAll === 'function');
                    if (isObsArray) {
                        acc.removeAll();
                        const arr = toArrayIf(true, value);
                        if (arr.length) acc.push(...arr);
                        return;
                    }
                    // For normal observable/computed: coerce only if current is array
                    let cur;
                    try { cur = acc(); } catch { cur = undefined; }
                    const isArrayTarget = Array.isArray(cur);
                    acc(toArrayIf(isArrayTarget, value));
                    return;
                }
                // If plex gave us a plain value (rare), fall through to direct path
            }

            // Direct path: walk to parent + key
            const keys = path.split('.');
            const finalKey = keys.pop();
            const parent = keys.reduce((acc, k) => (acc == null ? acc : acc[k]), vm);
            if (!parent) return;

            const cur = parent[finalKey];

            // KO observableArray
            if (KO && typeof KO.isObservable === 'function' && KO.isObservable(cur) &&
                typeof cur.push === 'function' && typeof cur.removeAll === 'function') {
                cur.removeAll();
                const arr = toArrayIf(true, value);
                if (arr.length) cur.push(...arr);
                return;
            }

            // KO observable scalar
            if (typeof cur === 'function') {
                let currentVal;
                try { currentVal = cur(); } catch { currentVal = undefined; }
                const isArrayTarget = Array.isArray(currentVal);
                cur(toArrayIf(isArrayTarget, value));
                return;
            }

            // Plain property (array or scalar)
            const isArrayTarget = Array.isArray(cur);
            parent[finalKey] = toArrayIf(isArrayTarget, value);
        };


        /** Convenience: coerce any obs/plain/array to a trimmed string id */
        TMUtils.coerceId = function coalesceToId(v) {
            const u = TMUtils.unwrapDeep ? TMUtils.unwrapDeep(v) : v;
            const x = Array.isArray(u) ? (u.length ? u[0] : undefined) : u;
            return String(x ?? '').trim();
        };
    })();


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
    // ✅ add this right after the waitForModelAsync function definition
    //TMUtils.waitForModelAsync = waitForModelAsync;



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
        const emit = (m, badge, ...a) => (console[m] || console.log).call(console, `${label} ${badge}`, ...a);
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

    TMUtils.observeInsertMany = function observeInsertMany(selector, callback, { root = document.body, subtree = true } = {}) {
        const seen = new WeakSet();

        function runOn(ctx) {
            if (ctx && ctx.nodeType === 1) {
                if (typeof ctx.matches === 'function' && ctx.matches(selector) && !seen.has(ctx)) {
                    seen.add(ctx);
                    try { callback(ctx); } catch (e) { console.error('observeInsertMany callback error:', e); }
                }
                if (typeof ctx.querySelectorAll === 'function') {
                    ctx.querySelectorAll(selector).forEach(el => {
                        if (!seen.has(el)) {
                            seen.add(el);
                            try { callback(el); } catch (e) { console.error('observeInsertMany callback error:', e); }
                        }
                    });
                }
            }
        }

        const mo = new MutationObserver(muts => {
            for (const m of muts) {
                if (m.addedNodes && m.addedNodes.length) {
                    m.addedNodes.forEach(runOn);
                }
            }
        });

        mo.observe(root, { childList: true, subtree });
        // fire for anything already on the page
        runOn(root);

        // return disposer
        return () => mo.disconnect();
    };

    TMUtils.sleep = (ms) => new Promise(r => setTimeout(r, ms));


    // ---------------------------------------------------------------------
    // Network watcher (AddUpdateForm 10032) — fetch + XHR
    // ---------------------------------------------------------------------
    (function addNetWatcher() {
        const root = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        const TMU = window.TMUtils;            // same object you export at the end
        TMU.net = TMU.net || {};

        TMU.net.ensureWatcher = function ensureWatcher() {
            if (root.__ltNetPatched) return;
            root.__ltNetPatched = true;

            // ---- fetch() ----
            const origFetch = root.fetch && root.fetch.bind(root);
            if (origFetch) {
                root.fetch = function (input, init) {
                    try {
                        const req = (input instanceof Request) ? input : new Request(input, init || {});
                        const url = String(req.url || '');
                        const method = (req.method || (init && init.method) || 'GET').toUpperCase();
                        if (isTarget(url, method)) {
                            req.clone().arrayBuffer().then(buf => {
                                const ct = req.headers.get('content-type') || '';
                                const body = parseBodyFromBuffer(buf, ct);
                                TMU.net._handleAddUpdate(url, body);
                            }).catch(() => { });
                        }
                    } catch { }
                    return origFetch(input, init);
                };
            }

            // ---- XHR ----
            const XHR = root.XMLHttpRequest;
            if (XHR && XHR.prototype) {
                const open = XHR.prototype.open;
                const send = XHR.prototype.send;
                const setRequestHeader = XHR.prototype.setRequestHeader;

                XHR.prototype.open = function (method, url) {
                    this.__ltMethod = String(method || 'GET').toUpperCase();
                    this.__ltUrl = String(url || '');
                    this.__ltHeaders = {};
                    return open.apply(this, arguments);
                };
                XHR.prototype.setRequestHeader = function (k, v) {
                    try { this.__ltHeaders[k.toLowerCase()] = v; } catch { }
                    return setRequestHeader.apply(this, arguments);
                };
                XHR.prototype.send = function (body) {
                    try {
                        const url = this.__ltUrl || '';
                        const method = this.__ltMethod || 'GET';
                        if (isTarget(url, method)) {
                            const ct = (this.__ltHeaders['content-type'] || '');
                            let obj = {};
                            if (typeof body === 'string') obj = parseBodyFromString(body, ct);
                            else if (body instanceof URLSearchParams) obj = Object.fromEntries(body.entries());
                            else if (root.FormData && body instanceof FormData) obj = Object.fromEntries(body.entries());
                            TMU.net._handleAddUpdate(url, obj);
                        }
                    } catch { }
                    return send.apply(this, arguments);
                };
            }
        };

        TMU.net.onAddUpdate = function onAddUpdate(fn) {
            if (typeof fn !== 'function') return () => { };
            const h = (e) => fn(e.detail || {});
            root.addEventListener('LT:QuotePartAddUpdateForm', h);
            return () => root.removeEventListener('LT:QuotePartAddUpdateForm', h);
        };

        TMU.net.getLastAddUpdate = function () {
            if (TMU.state?.lastAddUpdateForm) return TMU.state.lastAddUpdateForm;
            try {
                const s = sessionStorage.getItem('LT_LAST_ADDUPDATEFORM');
                return s ? JSON.parse(s) : null;
            } catch { return null; }
        };

        // ---- internals ----
        function isTarget(url, method) {
            return method === 'POST'
                && /\/SalesAndCRM\/QuotePart\/AddUpdateForm/i.test(url)
                && /(?:\?|&)sourceActionKey=10032(?:&|$)/i.test(url);
        }

        function parseBodyFromBuffer(buf, contentType) {
            try {
                const text = new TextDecoder().decode(buf || new Uint8Array());
                return parseBodyFromString(text, contentType);
            } catch { return {}; }
        }

        function parseBodyFromString(text, contentType) {
            if (!text) return {};
            const ct = (contentType || '').toLowerCase();
            if (ct.includes('application/json') || /^[\s{\[]/.test(text)) {
                try { return JSON.parse(text); } catch { }
            }
            if (ct.includes('application/x-www-form-urlencoded') || text.includes('=')) {
                try { return Object.fromEntries(new URLSearchParams(text).entries()); } catch { }
            }
            return {};
        }

        TMU.net._handleAddUpdate = function (url, payload) {
            const quoteKey =
                Number(payload?.QuoteKey) ||
                Number((/[?&]QuoteKey=(\d+)/i.exec(url) || [])[1]) ||
                undefined;

            const hasPartNo =
                !!(payload?.PartNo || payload?.PartKey || payload?.PartName) ||
                (Array.isArray(payload?.__revisionTrackingData) &&
                    payload.__revisionTrackingData.some(x =>
                        Array.isArray(x.revisionTrackingEntries) &&
                        x.revisionTrackingEntries.some(e => /Part No/i.test(e?.Field || ''))
                    ));

            const detail = {
                url,
                quoteKey,
                hasPartNo,
                partNo: payload?.PartNo ?? null,
                customerPartNo: payload?.CustomerPartNo ?? null,
                partKey: payload?.PartKey ?? null,
                at: Date.now()
            };

            TMU.state = TMU.state || {};
            TMU.state.lastAddUpdateForm = detail;
            try { sessionStorage.setItem('LT_LAST_ADDUPDATEFORM', JSON.stringify(detail)); } catch { }

            try { root.dispatchEvent(new CustomEvent('LT:QuotePartAddUpdateForm', { detail })); } catch { }
        };
    })();


    // ---------------------------------------------------------------------
    // 🔁 Global exposure for TamperMonkey sandbox
    // ---------------------------------------------------------------------
    Object.assign(TMUtils, {
        getApiKey,
        fetchData: TMUtils.fetchData, 
        waitForModelAsync,
        watchByLabel: TMUtils.watchByLabel,
        awaitValueByLabel: TMUtils.awaitValueByLabel,
        watchBySelector: TMUtils.watchBySelector,
        observeInsertMany: TMUtils.observeInsertMany,
        showMessage, hideMessage, observeInsert,
        selectOptionByText, selectOptionByValue,
        toast,
        log, warn, error, ok,
        ensureRoute, onRouteChange, matchRoute,
        setDebug, makeLogger, getLogger, attachLoggerGlobal,
        ds: TMUtils.ds, dsRows: TMUtils.dsRows,
        net: TMUtils.net,

    });
})(window);
