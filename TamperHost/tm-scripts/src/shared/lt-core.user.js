// ==UserScript==
// @name         lt-core
// @namespace    lt
// @version      3.8.49
// @description  Shared core: auth + http + plex DS + hub (status/toast) + theme bridge + tiny utils
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    // Prefer the page context if available (so globals are shared with the app)
    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    const LT = (ROOT.lt = ROOT.lt || {});
    const core = (LT.core = LT.core || {});

    // -------------------------
    // Auth (from your plex-auth)
    // -------------------------
    core.auth = core.auth || {
        /**
         * Try PlexAuth first, then PlexAPI; return bearer token string or null.
         */
        async getKey() {
            try {
                if (ROOT.PlexAuth?.getKey) return await ROOT.PlexAuth.getKey();
                if (ROOT.PlexAPI?.getKey) return await ROOT.PlexAPI.getKey();
            } catch { /* non-fatal */ }
            return null;
        },

        /**
         * Run a function after ensuring we have an auth key.
         * If a refresh hook exists we’ll attempt it once.
         */
        async withFreshAuth(fn) {
            let key = await core.auth.getKey();
            if (!key) {
                try {
                    if (ROOT.PlexAuth?.refresh) {
                        await ROOT.PlexAuth.refresh();
                        key = await core.auth.getKey();
                    } else if (ROOT.PlexAPI?.refresh) {
                        await ROOT.PlexAPI.refresh();
                        key = await core.auth.getKey();
                    }
                } catch { /* non-fatal */ }
            }
            return fn(key || undefined);
        }
    };

    // -------------------------
    // HTTP
    // Delegates to TMUtils.fetchData when available; falls back to fetch()
    // -------------------------
    core.http = core.http || {
        async fetch(url, { method = 'GET', headers = {}, body, timeoutMs = 15000, useXHR = false } = {}) {
            if (ROOT.TMUtils?.fetchData) {
                return await ROOT.TMUtils.fetchData(url, { method, headers, body, timeoutMs, useXHR });
            }

            // Fallback: native fetch with Authorization (from plex-auth)
            const key = await core.auth.getKey();
            const h = new Headers(headers || {});
            if (key && !h.has('Authorization')) h.set('Authorization', `Bearer ${key}`);
            if (body && !h.has('Content-Type')) h.set('Content-Type', 'application/json');

            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), timeoutMs);

            try {
                const res = await fetch(url, {
                    method,
                    headers: h,
                    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
                    signal: ctl.signal,
                    credentials: 'include'
                });
                const ct = res.headers.get('content-type') || '';
                const data = ct.includes('application/json') ? await res.json() : await res.text();
                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
                return data;
            } finally {
                clearTimeout(t);
            }
        },

        async get(url, opts = {}) { return this.fetch(url, { ...(opts || {}), method: 'GET' }); },
        async post(url, body, opts = {}) { return this.fetch(url, { ...(opts || {}), method: 'POST', body }); }
    };

    // --------------------------------------
    // Plex DS helpers
    // --------------------------------------
    core.plex = core.plex || {
        async ds(sourceId, payload = {}, opts = {}) {
            if (ROOT.TMUtils?.ds) return await ROOT.TMUtils.ds(sourceId, payload, opts);

            // Fallback: direct POST to DS endpoint (format=2 → rows in array)
            const base = location.origin.replace(/\/$/, '');
            const url = `${base}/api/datasources/${sourceId}/execute?format=2`;
            const json = await core.http.post(url, payload, opts);
            const rows = Array.isArray(json?.rows) ? json.rows : [];
            return { ...json, rows };
        },

        async dsRows(sourceId, payload = {}, opts = {}) {
            if (ROOT.TMUtils?.dsRows) return await ROOT.TMUtils.dsRows(sourceId, payload, opts);
            const { rows } = await this.ds(sourceId, payload, opts);
            return rows;
        }
    };

    // ---------------- Hub facade (prefers lt-ui-hub; mounts on first use) ----------------
    core.hub = core.hub || (() => {
        // --- small pill fallback (used only if lt-ui-hub missing) ---
        const fallback = (() => {
            const api = {};
            api._sticky = false;

            function ensurePill() {
                let pill = document.querySelector('#lt-hub-pill');
                if (!pill) {
                    pill = document.createElement('div');
                    pill.id = 'lt-hub-pill';
                    pill.style.cssText = `
                        position: fixed;
                        top: 10px; right: 10px;
                        z-index: 2147483000;
                        background: rgba(0,0,0,.8);
                        color: #fff;
                        font: 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
                        padding: 6px 10px; border-radius: 999px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                    `;
                    pill.textContent = '…';
                    document.documentElement.appendChild(pill);
                }
                return pill;
            }

            api.setStatus = (text, tone = 'info', { sticky = false } = {}) => {
                const el = ensurePill();
                el.textContent = text || '';
                api._sticky = !!sticky;
                if (!api._sticky) setTimeout(() => { try { el.remove(); } catch { } }, 2000);
                return api;
            };

            api.notify = (_level, text, { ms = 2500 } = {}) => {
                const el = ensurePill();
                el.textContent = text || '';
                setTimeout(() => { try { el.remove(); } catch { } }, Math.max(500, ms | 0));
                return api;
            };

            api.toast = (msg, ms = 3000) => api.notify('info', msg, { ms });

            return api;
        })();

        // --- queue until lt-ui-hub mounts ---
        let mounted = false;
        let mounting = null;               // Promise
        const queue = [];                  // [{fn, args}]

        async function mountUiHubOnce() {
            if (mounted) return true;
            if (mounting) return mounting;

            mounting = (async () => {
                try {
                    // If ensureLTHub is available, mount the full-width bar
                    const ensureFn =
                        (typeof ensureLTHub === 'function') ? ensureLTHub :
                            (typeof ROOT.ensureLTHub === 'function' ? ROOT.ensureLTHub : null);

                    if (ensureFn) {
                        await ensureFn({
                            theme: { name: 'OneMonroe' },
                            // default to body; honor any earlier selection
                            mount: (ROOT.__LT_HUB_MOUNT || 'nav'),
                            pageRootSelectors: [
                                '#plexSidetabsMenuPage',
                                '.plex-sidetabs-menu-page',
                                '.plex-sidetabs-menu-page-content',
                                '.plex-sidetabs-menu-page-content-container',
                                '.plex-actions-wrapper'
                            ],
                            // when living in the navbar we never want to alter page layout
                            stick: false,
                            gap: 8
                        });
                    }

                    const hubObj = (typeof ltUIHub !== 'undefined') ? ltUIHub : ROOT.ltUIHub;
                    mounted = !!hubObj;
                    return mounted;
                } catch {
                    mounted = false;
                    return false;
                } finally {
                    // flush queued calls through either ui-hub (if mounted) or fallback
                    const hub = mounted ? ROOT.ltUIHub : null;
                    for (const { fn, args } of queue.splice(0)) {
                        try {
                            if (hub && typeof hub[fn] === 'function') hub[fn](...args);
                            else fallback[fn](...args);
                        } catch { /* non-fatal */ }
                    }
                }
            })();

            return mounting;
        }

        function delegateOrQueue(fn, ...args) {
            // If lt-ui-hub is already mounted, delegate immediately
            const hubNow = mounted
                ? ((typeof ltUIHub !== 'undefined') ? ltUIHub : ROOT.ltUIHub)
                : null;

            if (hubNow && typeof hubNow[fn] === 'function') {
                try { hubNow[fn](...args); } catch { /* non-fatal */ }
                return;
            }

            // If we can mount (sandbox or window), queue and kick it off
            if (typeof ensureLTHub === 'function' || typeof ROOT.ensureLTHub === 'function') {
                queue.push({ fn, args });
                mountUiHubOnce();  // fire & forget
                return;
            }

            // No ui-hub available → fallback immediately
            fallback[fn](...args);
        }

        // Public API (sync looking; internally queues/delegates)
        return {
            setStatus(text, tone = 'info', opts = {}) { delegateOrQueue('setStatus', text, tone, opts); return this; },

            notify(text, tone = 'info', opts = {}) {
                // lt-ui-hub signature: notify(kind, text, {ms, sticky, toast})
                const ms = opts?.timeout ?? opts?.ms ?? 2500;
                delegateOrQueue('notify', tone, text, { ms, sticky: !!opts?.sticky, toast: !!opts?.toast });
                if (!mounted && typeof ROOT.ensureLTHub !== 'function') fallback.notify(text, tone, opts);
                return this;
            },
            toast(msg, timeout = 3000) {
                delegateOrQueue('notify', 'info', msg, { ms: timeout, toast: true });
                if (!mounted && typeof ROOT.ensureLTHub !== 'function') fallback.toast(msg, timeout);
                return this;
            },
            updateButton(id, patch = {}) {
                delegateOrQueue('updateButton', id, patch);
                return this;
            },
            beginTask(label, tone = 'info') {
                if (mounted && ROOT.ltUIHub?.beginTask) return ROOT.ltUIHub.beginTask(label, tone);
                // queue a synthetic beginTask using status + success/error helpers
                this.setStatus(label, tone, { sticky: true });
                const ctl = {
                    update: (txt, t = tone) => { this.setStatus(txt, t, { sticky: true }); return ctl; },
                    success: (msg = 'Done', ms = 2500) => { this.setStatus('', 'info', { sticky: false }); this.notify(msg, 'success', { timeout: ms }); return ctl; },
                    error: (msg = 'Failed') => { this.setStatus('', 'info', { sticky: false }); this.notify(msg, 'error', { timeout: 3500 }); return ctl; },
                    clear: () => { this.setStatus('', 'info', { sticky: false }); return ctl; },
                    done: (msg, ms) => ctl.success(msg, ms)
                };
                // try to upgrade to lt-ui-hub real task after mount
                mountUiHubOnce().then(() => {
                    const hubNow = (typeof ltUIHub !== 'undefined') ? ltUIHub : ROOT.ltUIHub;
                    if (hubNow?.beginTask) {
                        try { hubNow.beginTask(label, tone); } catch { /* non-fatal */ }
                    }
                });
                return ctl;
            }
        };
    })();

    // -------------------
    // Theme bridge (@resource THEME_CSS → GM_addStyle)
    // Grants are expected in the parent (entry) banner; this is safe no-op.
    // -------------------
    core.theme = core.theme || {
        apply() {
            try {
                // Only main script’s @grant matters; @require metadata is ignored by TM
                const css = (typeof GM_getResourceText === 'function') ? GM_getResourceText('THEME_CSS') : '';
                if (css && typeof GM_addStyle === 'function') GM_addStyle(css);
            } catch (e) {
                try { console.warn('[lt-core] theme.apply failed', e); } catch { /* non-fatal */ }
            }
        }
    };

    // -------------------
    // Small utilities
    // -------------------
    core.util = core.util || {
        sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms | 0))); },

        /**
         * Run a function only once per key (per page load).
         */
        once(key, fn) {
            const store = (core.__once = core.__once || new Set());
            if (store.has(key)) return undefined;
            store.add(key);
            return fn();
        }
    };
    // ---------------
    // Data (intentionally blank in core)
    // Do NOT define core.data here; lt-data-core / your repos augment it.
    // ---------------

    // ---------------
    // QT helpers: repos + promotion + quote context + hub button
    // ---------------
    core.qt = core.qt || (() => {
        const ROOT = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

        function getTabScopeId(ns = 'QT') {
            try { if (typeof ROOT.getTabScopeId === 'function') return ROOT.getTabScopeId(ns); } catch { }
            try {
                const storage = ROOT.sessionStorage;
                const K = `lt:${ns}:__scopeId`;
                let v = storage.getItem(K);
                if (!v) {
                    v = String(Math.floor(Math.random() * 2147483647));
                    storage.setItem(K, v);
                }
                const n = Number(v);
                if (!Number.isFinite(n) || n <= 0) throw new Error('bad scope');
                return n;
            } catch {
                const key = '__LT_QT_SCOPE_ID__';
                if (!ROOT[key]) ROOT[key] = Math.floor(Math.random() * 2147483647);
                return ROOT[key];
            }
        }

        function getQTF() {
            const make = ROOT.lt?.core?.data?.makeFlatScopedRepo;
            return (typeof make === 'function') ? make({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' }) : null;
        }

        async function useDraftRepo() {
            const QTF = getQTF();
            if (!QTF) return null;
            const { repo } = QTF.use(getTabScopeId('QT'));
            return repo || null;
        }

        async function useQuoteRepo(qk) {
            const QTF = getQTF();
            if (!QTF || !qk || !Number.isFinite(qk) || qk <= 0) return null;
            const { repo } = QTF.use(Number(qk));
            return repo || null;
        }

        // ---------- Promotion (A) ----------
        function needsMerge(current = {}, draft = {}) {
            const curUpd = Number(current.Updated_At ?? 0);
            const dUpd = Number(draft?.Updated_At ?? 0);
            const curCust = String(current.Customer_No ?? '');
            const newCust = String(draft?.Customer_No ?? '');
            const keyChanged = String(current.Catalog_Key ?? '') !== String(draft?.Catalog_Key ?? '');
            const codeChanged = String(current.Catalog_Code ?? '') !== String(draft?.Catalog_Code ?? '');
            return (dUpd > curUpd) || keyChanged || codeChanged || (curCust !== newCust);
        }

        async function mergeOnce(qk) {
            const draftRepo = await useDraftRepo();
            if (!draftRepo) return 'no-dc';
            let draft = (await draftRepo.getHeader?.()) || (await draftRepo.get?.());

            // If empty, try legacy "draft" scope and migrate it forward
            if (!draft || !Object.keys(draft).length) {
                try {
                    const { repo: legacy } = getQTF().use('draft');
                    const legacyDraft = (await legacy.getHeader?.()) || (await legacy.get?.());
                    if (legacyDraft && Object.keys(legacyDraft).length) {
                        await draftRepo.patchHeader?.(legacyDraft);
                        draft = legacyDraft;
                    }
                } catch { /* non-fatal */ }
            }

            if (!draft || !Object.keys(draft).length) return 'no-draft';

            const quoteRepo = await useQuoteRepo(qk);
            if (!quoteRepo) return 'no-quote';

            const current = (await quoteRepo.getHeader?.()) || {};
            if (!needsMerge(current, draft)) return 'noop';

            await quoteRepo.patchHeader?.({
                ...draft,
                Quote_Key: Number(qk),
                Quote_Header_Fetched_At: Date.now(),
                Promoted_From: 'draft',
                Promoted_At: Date.now()
            });

            try { await draftRepo.clear?.(); } catch { }
            try { const { repo: legacy } = getQTF().use('draft'); await legacy.clear?.(); } catch { }
            return 'merged';
        }

        const RETRY = { timer: null, tries: 0, max: 20, ms: 250 };
        function stopRetry() { if (RETRY.timer) clearInterval(RETRY.timer); RETRY.timer = null; RETRY.tries = 0; }
        function promoteDraftToQuote({ qk, strategy = 'once' } = {}) {
            if (strategy === 'retry') {
                stopRetry();
                RETRY.timer = setInterval(async () => { RETRY.tries++; const res = await mergeOnce(qk); if (res === 'merged' || RETRY.tries >= RETRY.max) stopRetry(); }, RETRY.ms);
                return;
            }
            return mergeOnce(qk);
        }

        // ---------- Quote Context (B) ----------
        function getNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
        function fromUrl() { try { const u = new URL(location.href); return { quoteKey: getNumber(u.searchParams.get('QuoteKey') || u.searchParams.get('quoteKey')) }; } catch { return { quoteKey: 0 }; } }
        function fromDom() {
            const el = document.querySelector('[data-quote-key],#QuoteKey,[name="QuoteKey"]');
            const qk = el ? getNumber(el.getAttribute('data-quote-key') ?? el.value) : 0;
            const pn = (document.querySelector('.wizard-steps .active, .wizard .active, .plex-sidetabs .active')?.textContent
                || document.querySelector('.page-title, .content-header h1, .plex-navbar-title')?.textContent
                || document.querySelector('[aria-current="page"]')?.textContent || '').trim();
            return { quoteKey: qk, pageName: pn };
        }
        function fromKo() {
            try {
                const koRoot = (window.ko && typeof window.ko.dataFor === 'function') ? window.ko.dataFor(document.body) : null;
                const qk = getNumber(koRoot?.QuoteKey ?? koRoot?.quoteKey ?? koRoot?.Quote?.QuoteKey) || 0;
                const pn = String(koRoot?.CurrentPageName ?? koRoot?.currentPageName ?? koRoot?.Wizard?.CurrentPageName ?? '').trim();
                return { quoteKey: qk, pageName: pn };
            } catch { return { quoteKey: 0, pageName: '' }; }
        }
        function coalesce() {
            const a = fromKo(), b = fromDom(), c = fromUrl();
            const quoteKey = a.quoteKey || b.quoteKey || c.quoteKey || 0;
            const pageName = (a.pageName || b.pageName || document.title || '').replace(/\s+/g, ' ').trim();
            const isOnPartSummary = (() => {
                try {
                    // DOM signal from Part Summary: IDs like "QuotePartSummaryForm_*"
                    const hasPSForm =
                        !!document.querySelector('#QuotePartSummaryForm,[id^="QuotePartSummaryForm_"]');
                    if (hasPSForm) return true;

                    // (Optional) active wizard step label equals "Part Summary"
                    const active = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active');
                    if (active && active.textContent && active.textContent.trim().toLowerCase() === 'part summary')
                        return true;
                } catch { /* ignore */ }

                // Fallbacks (URL/title heuristics)
                return /part\s*summary/i.test(pageName) ||
                    /part(?:%20|\s|-)?summary|summary(?:%20|\s|-)?part/i.test(location.href);
            })();

            return { quoteKey, pageName, isOnPartSummary };
        }
        function getQuoteContext() {
            const { quoteKey, pageName, isOnPartSummary } = coalesce();
            return { quoteKey, pageName, isOnPartSummary, hasQuoteKey: quoteKey > 0, isPage: (n) => new RegExp(String(n).replace(/\s+/g, '\\s*'), 'i').test(pageName) };
        }

        // ---------- Hub helpers (C) ----------
        async function getHub(opts = { mount: 'nav' }) {
            const R = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
            for (let i = 0; i < 50; i++) {
                const ensure = (R.ensureLTHub || window.ensureLTHub);
                if (typeof ensure === 'function') {
                    try {
                        await ensure(opts); // may return void
                        const hubNow = (typeof ltUIHub !== 'undefined') ? ltUIHub : R.ltUIHub;
                        if (hubNow) return hubNow;
                    } catch { }
                }
                const hubNow = (typeof ltUIHub !== 'undefined') ? ltUIHub : R.ltUIHub;
                if (hubNow) return hubNow;
                await new Promise(r => setTimeout(r, 100));
            }
            return { __fallback: true }; // fallback sentinel
        }

        async function ensureHubButton({
            id, label, title, side = 'left', weight = 120, onClick, showWhen, force = false, mount = 'nav'
        } = {}) {
            const hub = await getHub({ mount });
            const usingUiHub = !!(hub && !hub.__fallback && typeof hub.registerButton === 'function');

            const shouldShowNow = () => {
                try { const ctx = getQuoteContext(); return !!(force || (typeof showWhen === 'function' ? showWhen(ctx) : true)); }
                catch { return !!force; }
            };

            if (usingUiHub) {
                function listIds() {
                    try {
                        const v = hub.list?.();
                        if (!Array.isArray(v)) return [];
                        // Support arrays of strings OR arrays of { id, ... }
                        return v.map(x => (x && typeof x === 'object') ? x.id : x).filter(Boolean);
                    } catch { return []; }
                }

                function isPresent() {
                    try {
                        if (typeof hub.has === 'function') return !!hub.has(id);
                        return listIds().includes(id);
                    } catch { return false; }
                }

                async function register() {
                    const def = { id, label, title, weight, onClick };
                    // Always prefer the 2-arg form; fall back to 1-arg
                    try { hub.registerButton?.(side, def); } catch { }
                    await 0;
                    if (!isPresent()) { try { hub.registerButton?.({ ...def, section: side }); } catch { } }

                    // If still not present, try the alternate form explicitly
                    await 0; // yield
                    if (!isPresent()) {
                        try {
                            hub.registerButton({ ...def, section: side });
                        } catch { /* ignore */ }
                    }
                    await 0;
                    if (!isPresent()) {
                        try {
                            hub.registerButton(side, def);
                        } catch { /* ignore */ }
                    }
                    return isPresent();
                }

                function ensureReg() { if (isPresent()) return false; return register(); }
                ensureReg();

                async function reconcile() {
                    try {
                        const show = shouldShowNow();
                        const present = isPresent();
                        if (show) { if (!present) ensureReg(); return true; }
                        if (present) hub.remove?.(id);
                        return false;
                    } catch { return false; }
                }

                ensureHubButton.__state = ensureHubButton.__state || {};
                const state = ensureHubButton.__state[id] ||= { obs: null, offUrl: null };

                await reconcile();
                if (!state.obs) {
                    const root = document.querySelector('.plex-wizard-page-list') || document.body;
                    if (root && window.MutationObserver) {
                        state.obs = new MutationObserver(() => { reconcile(); });
                        state.obs.observe(root, { subtree: true, attributes: true, childList: true });
                    }
                }
                if (!state.offUrl && window.TMUtils?.onUrlChange) {
                    state.offUrl = window.TMUtils.onUrlChange(() => { reconcile(); });
                }
                return true;
            }

            // Fallback: synthesize a simple navbar button (only if lt-ui-hub not present)
            const domId = `lt-navbtn-${id}`;
            function navRight() {
                return document.querySelector('#navBar .navbar-right') ||
                    document.querySelector('.plex-navbar-container .navbar-right') ||
                    document.querySelector('.navbar-right') ||
                    document.getElementById('navBar') || document.body;
            }
            function ensureDom() {
                const host = navRight(); if (!host) return null;
                let btn = document.getElementById(domId);
                if (!btn) {
                    btn = document.createElement('button');
                    btn.id = domId; btn.type = 'button'; btn.className = 'btn btn-primary';
                    btn.title = title || ''; btn.textContent = label || id; btn.style.marginLeft = '8px';
                    btn.addEventListener('click', (ev) => { try { onClick?.(ev); } catch { } });
                    host.appendChild(btn);
                }
                return btn;
            }
            function removeDom() { const n = document.getElementById(domId); if (n) try { n.remove(); } catch { } }

            async function reconcileDom() { const show = shouldShowNow(); if (show) ensureDom(); else removeDom(); }

            ensureHubButton.__state = ensureHubButton.__state || {};
            const state = ensureHubButton.__state[id] ||= { obs: null, offUrl: null };

            await reconcileDom();
            if (!state.obs) {
                const root = document.querySelector('.plex-wizard-page-list') || document.body;
                if (root && window.MutationObserver) {
                    state.obs = new MutationObserver(() => { reconcileDom(); });
                    state.obs.observe(root, { subtree: true, attributes: true, childList: true });
                }
            }
            if (!state.offUrl && window.TMUtils?.onUrlChange) {
                state.offUrl = window.TMUtils.onUrlChange(() => { reconcileDom(); });
            }
            return true;
        }

        return { promoteDraftToQuote, stopRetry, useDraftRepo, useQuoteRepo, getQuoteContext, getHub, ensureHubButton };
    })();

    // Auto-apply THEME_CSS if provided (safe no-op otherwise)
    try { core.theme.apply(); } catch { }

})();
