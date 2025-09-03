// ==UserScript==
// @name         zDev Tools > Dump Any ViewModel
// @namespace    http://tampermonkey.net/
// @version      3.5.175
// @description  Inspect Knockout viewmodels on Plex pages via menu or floating panel (with persistence)
// @match        *://*.plex.com/*
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ko = unsafeWindow.ko;

    // helper to test observables/computeds
    function isObservable(v) { return ko?.isObservable?.(v); }
    function isComputed(v) { return isObservable(v) && v.__ko_isComputed; }

    // ---- KO-aware deep search ---------------------------------------------------
    // ---------- Safe helpers ----------
    function isPlainObject(x) {
        if (!x || typeof x !== 'object') return false;
        const proto = Object.getPrototypeOf(x);
        return proto === Object.prototype || proto === null;
    }

    function isDomNode(x) {
        return !!(x && typeof x === 'object' && typeof x.nodeType === 'number' && typeof x.nodeName === 'string');
    }

    function isWindowLike(x) {
        // Defensive: some envs don’t expose window; also handle iframes
        return !!(x && typeof x === 'object' && (x === x.window || x === globalThis || x === unsafeWindow));
    }

    function isPromiseLike(x) {
        return !!(x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function');
    }

    function koIsObservable(v) {
        try { return typeof ko !== 'undefined' && !!ko && typeof ko.isObservable === 'function' && ko.isObservable(v); }
        catch { return false; }
    }

    function koIsComputed(v) {
        try { return typeof ko !== 'undefined' && !!ko && typeof ko.isComputed === 'function' && ko.isComputed(v); }
        catch { return false; }
    }

    function koUnwrapIfObservable(v, { evaluateComputeds = false } = {}) {
        try {
            if (!koIsObservable(v)) return v;
            if (koIsComputed(v) && !evaluateComputeds) return v; // don't evaluate computeds unless explicit
            // Use ko.unwrap only for plain observables (or when allowed for computeds)
            return (ko && typeof ko.unwrap === 'function') ? ko.unwrap(v) : (typeof v === 'function' ? v() : v);
        } catch {
            return v; // if unwrapping throws, return the original
        }
    }

    // Return own property names *without* touching getters.
    function safeOwnKeys(obj) {
        try {
            return Object.getOwnPropertyNames(obj);
        } catch {
            return [];
        }
    }

    // Read a property without triggering accessors (skip accessors entirely)
    function tryReadOwnDataProp(obj, key) {
        try {
            const desc = Object.getOwnPropertyDescriptor(obj, key);
            if (!desc) return { ok: false };
            if (typeof desc.get === 'function') return { ok: false }; // accessor → skip
            return { ok: true, value: desc.value };
        } catch {
            return { ok: false };
        }
    }

    function isTraversableObject(x) {
        if (!x) return false;
        const t = typeof x;
        if (t !== 'object' && t !== 'function') return false;
        if (isDomNode(x) || isWindowLike(x) || isPromiseLike(x)) return false;
        return true;
    }


    /**
     * deepSearch(obj, query, options)
     *  - query: string or number
     *  - options:
     *      { caseInsensitive: true, maxResults: 200, recordFirstMatchOnly: false }
     * Matches:
     *  - number => exact equality
     *  - string => substring (case-insensitive by default)
     */
    /**
 * safeDeepSearch(root, query, options)
 * - query: string or number
 * - options:
 *    caseInsensitive: boolean (default true, applies to string queries)
 *    maxResults: number (default 200)
 *    maxDepth: number (default 8)
 *    maxNodes: number (default 50000)  // overall safety cap
 *    evaluateComputeds: boolean (default false) // don't auto-evaluate KO computeds
 *    ignoreKeys: string[] (default KO-ish keys)
 */
    function safeDeepSearch(root, query, options = {}) {
        const opt = {
            caseInsensitive: true,
            maxResults: 200,
            maxDepth: 8,
            maxNodes: 50000,
            evaluateComputeds: false,
            ignoreKeys: ['$element', '$parent', '$parents', '$root'],
            ...options
        };

        const results = [];
        const seen = new WeakSet();
        let visited = 0;

        const isNumQuery = typeof query === 'number';
        const qStr = typeof query === 'string'
            ? (opt.caseInsensitive ? query.toLowerCase() : query)
            : null;

        function matches(val) {
            if (isNumQuery) return val === query;
            if (qStr == null) return false;
            if (val == null) return false;
            const s = String(val);
            return opt.caseInsensitive ? s.toLowerCase().includes(qStr) : s.includes(qStr);
        }

        // BFS queue entries: { node, path, depth }
        const queue = [];
        queue.push({ node: root, path: '', depth: 0 });

        while (queue.length) {
            if (results.length >= opt.maxResults) break;

            const { node, path, depth } = queue.shift();

            // Unwrap KO observable cautiously
            const unwrapped = koUnwrapIfObservable(node, { evaluateComputeds: opt.evaluateComputeds });

            // If leaf-like after unwrap, test and continue
            if (!isTraversableObject(unwrapped)) {
                try {
                    if (matches(unwrapped)) results.push({ path, value: unwrapped, type: typeof unwrapped });
                } catch { /* ignore */ }
                continue;
            }

            // Guard cycles / massive graphs
            if (seen.has(unwrapped)) continue;
            seen.add(unwrapped);
            visited++; if (visited > opt.maxNodes) break;

            // Respect depth limit
            if (depth >= opt.maxDepth) continue;

            // Arrays: iterate by index using direct index (no getters typically)
            if (Array.isArray(unwrapped)) {
                const len = Math.min(unwrapped.length, 100000); // sanity cap
                for (let i = 0; i < len; i++) {
                    if (results.length >= opt.maxResults) break;
                    const next = unwrapped[i];
                    queue.push({ node: next, path: `${path}[${i}]`, depth: depth + 1 });
                }
                continue;
            }

            // Maps/Sets: iterate entries without property access
            if (unwrapped instanceof Map) {
                let idx = 0;
                for (const [k, v] of unwrapped) {
                    if (results.length >= opt.maxResults) break;
                    queue.push({ node: v, path: `${path}{map:${idx}}`, depth: depth + 1 });
                    idx++;
                }
                continue;
            }
            if (unwrapped instanceof Set) {
                let idx = 0;
                for (const v of unwrapped) {
                    if (results.length >= opt.maxResults) break;
                    queue.push({ node: v, path: `${path}{set:${idx}}`, depth: depth + 1 });
                    idx++;
                }
                continue;
            }

            // Objects: enumerate own keys but skip KO internals and accessors
            const keys = safeOwnKeys(unwrapped);
            for (const k of keys) {
                if (results.length >= opt.maxResults) break;
                if (k.startsWith('__ko') || opt.ignoreKeys.includes(k)) continue;

                const read = tryReadOwnDataProp(unwrapped, k);
                if (!read.ok) continue; // skip accessors/getters

                const nextPath = path ? `${path}.${k}` : k;
                queue.push({ node: read.value, path: nextPath, depth: depth + 1 });
            }
        }

        return results;
    }



    // find the root VM on the page
    function getRootViewModel() {
        const selectors = [
            '.plex-wizard-page-list',
            '.plex-grid',
            '.plex-form-header',
            'input[name="CustomerNo"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const ctx = ko.contextFor(el);
            if (ctx?.$root) return ctx.$root.data || ctx.$root;
        }
        const bodyCtx = ko.contextFor(document.body);
        if (bodyCtx?.$root) return bodyCtx.$root.data || bodyCtx.$root;
        console.warn('🛑 No KO root viewmodel found');
        return null;
    }

    // shallow-dump an object’s own keys
    function logViewModelShallow(vm) {
        if (!vm || typeof vm !== 'object') return;
        const keys = Object.keys(vm).sort();
        console.groupCollapsed('🔍 KO ViewModel Properties (Shallow)');
        for (const key of keys) {
            let raw = vm[key], val, label = '';
            try {
                if (isComputed(raw)) {
                    val = ko.unwrap(raw); label = '🧠 computed';
                } else if (isObservable(raw)) {
                    val = ko.unwrap(raw); label = '📦 observable';
                } else if (typeof raw === 'function') {
                    val = '[function]'; label = '🛠 function';
                } else if (typeof raw === 'object') {
                    val = raw; label = '📁 object';
                } else {
                    val = raw;
                }
            } catch {
                val = '⚠️ [error accessing]';
            }
            console.log(`%c${key}%c${label}`, 'color:teal', 'color:gray', val);
        }
        console.groupEnd();
    }

    // menu callbacks
    function dumpShallow() {
        const vm = getRootViewModel();
        //         if (vm?.$$controller?.model) {
        //             console.log('%c📦 Controller Model found:', 'color:orange;font-weight:bold');
        //             logViewModelShallow(vm.$$controller.model);
        //         } else if (typeof vm?.$$controller?.model === 'function') {
        //             const model = vm.$$controller.model();
        //             console.log('%c📦 Controller Model (computed) found:', 'color:orange;font-weight:bold');
        //             logViewModelShallow(model);
        //         } else {
        //             console.warn('⚠️ No $$controller.model found yet');
        //         }

        if (!vm) return;

        console.log('%c🧾 Shallow ViewModel Dump (root):', 'color:teal;font-weight:bold', vm);
        logViewModelShallow(vm);

        if (vm?.$$controller?.model) {
            console.log('%c📦 Controller Model:', 'color:orange;font-weight:bold', vm.$$controller.model);
            logViewModelShallow(vm.$$controller.model);
        }
    }


    function dumpSelected() {
        const el = unsafeWindow._lastInspected;
        if (!el || el.nodeType !== 1) {
            console.warn('⚠️ No valid inspected element. Use Capture then click an element to set it.');
            return;
        }
        const ctx = ko.contextFor(el);
        if (!ctx) {
            console.warn('❌ No KO context found for the inspected element');
            return;
        }
        const data = ctx.$data;
        console.log('%c🔎 Dumping KO DataFor inspected element:', 'color:darkgreen;font-weight:bold', data);
        logViewModelShallow(data);
    }

    // build & show the floating panel
    function createFloatingPanel() {
        if (document.getElementById('ko-debug-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'ko-debug-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 100002,
            background: '#fff',
            border: '1px solid #999',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,.30)',
            padding: '10px',
            fontFamily: 'system-ui, Segoe UI, sans-serif',
            fontSize: '13px',
            minWidth: '260px',
            maxWidth: '420px'
        });

        panel.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">KO Debug Tools</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
          <button id="ko-btn-root">🔍 Dump Root</button>
          <button id="ko-btn-capture">🧲 Capture</button>
          <button id="ko-btn-dump">🧱 Dump Selected</button>
          <button id="ko-btn-close">🧹 Close</button>
        </div>

        <div style="margin:8px 0 4px; font-weight:600;">Search KO</div>
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
          <input id="ko-search-term" type="text" placeholder="Enter value, e.g. 76022"
                 style="flex:1; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-family:inherit; font-size:13px;">
          <button id="ko-btn-search-root" title="Search Root VM">Root</button>
          <button id="ko-btn-search-selected" title="Search last captured element">Sel</button>
        </div>
        <label style="display:flex; align-items:center; gap:6px; color:#444; font-size:12px; margin-bottom:6px;">
          <input type="checkbox" id="ko-search-ci" checked>
          Case-insensitive (strings)
        </label>
        <div id="ko-search-status" style="font-size:12px; color:#666; margin-bottom:4px;"></div>
        <div id="ko-search-results" style="max-height:220px; overflow:auto; border:1px solid #eee; border-radius:6px; padding:6px;"></div>

        <div style="margin-top:8px; font-size:12px;">
          <label><input type="checkbox" id="ko-opt-auto"> Auto-open on load</label>
        </div>
        <div style="font-size:11px; margin-top:6px; color:#666;">
          Tip: Click “Capture”, then click any element to make it “Selected”.
        </div>
    `;
        document.body.appendChild(panel);

        // Button wiring (existing)
        panel.querySelector('#ko-btn-root')?.addEventListener('click', dumpShallow);
        panel.querySelector('#ko-btn-capture')?.addEventListener('click', () => {
            console.log('🧲 Click any element on the page to capture it for KO inspection…');
            const handler = ev => {
                if (ev.target.closest('#ko-debug-panel')) return;
                ev.preventDefault(); ev.stopPropagation();
                unsafeWindow._lastInspected = ev.target;
                console.log('✅ Captured for inspection:', ev.target);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });
        panel.querySelector('#ko-btn-dump')?.addEventListener('click', dumpSelected);
        panel.querySelector('#ko-btn-close')?.addEventListener('click', () => panel.remove());

        // Auto-open persistence
        const autoCB = panel.querySelector('#ko-opt-auto');
        const autoVal = GM_getValue('autoShow', false);
        autoCB.checked = autoVal;
        autoCB.addEventListener('change', () => {
            GM_setValue('autoShow', autoCB.checked);
            console.log('⚙️ KO Debug Panel auto-open set to', autoCB.checked);
        });

        // ---- Search wiring ----
        const termEl = panel.querySelector('#ko-search-term');
        const ciEl = panel.querySelector('#ko-search-ci');
        const statusEl = panel.querySelector('#ko-search-status');
        const listEl = panel.querySelector('#ko-search-results');

        function renderResults(hits) {
            listEl.innerHTML = '';
            if (!hits.length) {
                listEl.innerHTML = `<div style="color:#999;">No matches</div>`;
                return;
            }
            const frag = document.createDocumentFragment();
            hits.forEach((h, i) => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:4px 6px; border-bottom:1px solid #f1f1f1; cursor:pointer;';
                row.title = `Type: ${h.type}\nValue: ${String(h.value).slice(0, 200)}`;
                row.innerHTML = `<code>${h.path || '(root)'}</code>`;
                row.addEventListener('click', () => {
                    console.groupCollapsed(`🔎 Hit #${i + 1}: ${h.path}`);
                    console.log('Path:', h.path);
                    console.log('Value:', h.value);
                    console.groupEnd();
                    navigator.clipboard?.writeText(h.path || '').catch(() => { });
                });
                frag.appendChild(row);
            });
            listEl.appendChild(frag);
        }

        function doSearch(targetObj) {
            const raw = termEl.value?.trim();
            listEl.innerHTML = '';
            statusEl.textContent = '';
            if (!raw) return;

            // Try to coerce to number when appropriate (e.g., "76022")
            const asNum = Number(raw);
            const query = (raw !== '' && !Number.isNaN(asNum) && String(asNum) === raw) ? asNum : raw;

            const opt = { caseInsensitive: !!ciEl.checked, maxResults: 300 };
            const t0 = performance.now();
            const hits = safeDeepSearch(targetObj, query, {
                caseInsensitive: !!ciEl.checked,
                maxResults: 300,
                maxDepth: 12,              // you can tune this higher/lower
                maxNodes: 75000,           // overall safety cap
                evaluateComputeds: false   // set true only if you *need* computed values
            });

            const t1 = performance.now();

            statusEl.textContent = `Found ${hits.length} match(es) in ${(t1 - t0).toFixed(1)} ms`;
            renderResults(hits);
        }

        // Search buttons
        panel.querySelector('#ko-btn-search-root')?.addEventListener('click', () => {
            const vm = getRootViewModel();
            if (!vm) { statusEl.textContent = 'No root ViewModel found.'; listEl.innerHTML = ''; return; }
            doSearch(vm);
        });
        panel.querySelector('#ko-btn-search-selected')?.addEventListener('click', () => {
            const el = unsafeWindow._lastInspected;
            if (!el || el.nodeType !== 1) { statusEl.textContent = 'No selected element. Click “Capture” first.'; listEl.innerHTML = ''; return; }
            const ctx = ko.contextFor(el);
            if (!ctx) { statusEl.textContent = 'No KO context for selected element.'; listEl.innerHTML = ''; return; }
            doSearch(ctx.$data);
        });

        // Enter key → root search
        termEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const vm = getRootViewModel();
                if (!vm) { statusEl.textContent = 'No root ViewModel found.'; listEl.innerHTML = ''; return; }
                doSearch(vm);
            }
        });
    }


    // helper: run on DOM ready
    function onReady(cb) {
        if (['interactive', 'complete'].includes(document.readyState)) {
            requestAnimationFrame(cb);
        } else {
            document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(cb));
        }
    }

    // register menu commands
    //GM_registerMenuCommand('🔍 Dump KO ViewModel (shallow)', dumpShallow);
    //GM_registerMenuCommand('🧱 Dump inspected element', dumpSelected);
    GM_registerMenuCommand('🧪 Show KO Debug Panel', () => onReady(createFloatingPanel));
    GM_registerMenuCommand('🔎 Search KO (prompt)', () => {
        const q = prompt('Search KO (string or number):');
        if (q == null) return;
        const vm = getRootViewModel();
        if (!vm) { console.warn('No KO root found.'); return; }
        const asNum = Number(q);
        const query = (!Number.isNaN(asNum) && String(asNum) === q) ? asNum : q.trim();
        const hits = deepSearch(vm, query, { caseInsensitive: true, maxResults: 300 });
        console.log(`🔎 Found ${hits.length} hit(s) for`, query, hits);
    });


    // auto-show panel if user opted in
    onReady(() => {
        if (GM_getValue('autoShow', false)) {
            createFloatingPanel();
        }
    });

})();
