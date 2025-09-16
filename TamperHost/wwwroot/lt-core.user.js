// ==UserScript==
// @name         lt-core
// @namespace    lt
// @version      1.7
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
            } catch { }
            return null;
        },

        /**
         * Simple wrapper that ensures an auth key is present before running fn.
         * If a refresh hook exists we’ll attempt it once.
         */
        async withFreshAuth(fn) {
            let key = await core.auth.getKey();
            if (!key) {
                try {
                    // Best-effort refresh patterns if present in your environment
                    if (ROOT.PlexAuth?.refresh) {
                        await ROOT.PlexAuth.refresh();
                        key = await core.auth.getKey();
                    } else if (ROOT.PlexAPI?.refresh) {
                        await ROOT.PlexAPI.refresh();
                        key = await core.auth.getKey();
                    }
                } catch { }
            }
            return fn(key || undefined);
        }
    };

    // -------------------------
    // HTTP (keeps your behavior)
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
    // Plex DS helpers (keeps your behavior)
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
        const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

        // --- small pill fallback (used only if lt-ui-hub missing) ---
        const fallback = (() => {
            const api = {};
            api._sticky = false;

            function ensurePill() {
                let pill = document.querySelector('#lt-hub-pill');
                if (!pill) {
                    pill = document.createElement('div');
                    pill.id = 'lt-hub-pill';
                    pill.className = 'lt-hub-pill lt-tone-info';
                    pill.style.cssText = [
                        'position:fixed', 'top:8px', 'right:8px', 'z-index:2147483647',
                        'padding:6px 10px', 'border-radius:8px', 'font:12px/1.2 system-ui',
                        'background:#eee', 'color:#111', 'box-shadow:0 6px 16px rgba(0,0,0,.15)'
                    ].join(';');
                    (document.body || document.documentElement).appendChild(pill);
                }
                return pill;
            }
            function removePill() { const p = document.querySelector('#lt-hub-pill'); if (p) p.remove(); }

            api.setStatus = function (text, tone = 'info', opts = {}) {
                const pill = ensurePill();
                pill.textContent = text || '';
                pill.className = `lt-hub-pill lt-tone-${tone || 'info'}`;
                api._sticky = !!(opts && opts.sticky && text);
                if (!api._sticky && (!text || text === '')) removePill();
                return api;
            };

            api.toast = function (msg, timeout = 3000) {
                try {
                    const el = document.createElement('div');
                    el.className = 'lt-toast';
                    el.textContent = msg;
                    el.style.cssText = [
                        'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
                        'padding:8px 12px', 'border-radius:10px',
                        'background:rgba(0,0,0,.82)', 'color:#fff', 'font:12px/1.2 system-ui',
                        'box-shadow:0 10px 24px rgba(0,0,0,.35)', 'max-width:420px'
                    ].join(';');
                    (document.body || document.documentElement).appendChild(el);
                    setTimeout(() => el.remove(), Math.max(500, timeout || 3000));
                } catch { }
                return api;
            };

            api.notify = function (text, tone = 'info', opts = {}) {
                api.setStatus(text, tone, opts);
                if (!opts?.sticky && opts?.timeout) {
                    setTimeout(() => api.setStatus('', tone, { sticky: false }), opts.timeout);
                }
                return api;
            };

            api.beginTask = function (label, tone = 'info') {
                api.setStatus(label, tone, { sticky: true });
                const ctl = {
                    update(txt, t = tone) { api.setStatus(txt, t, { sticky: true }); return ctl; },
                    success(msg = 'Done', ms = 2500) { api.setStatus('', 'info', { sticky: false }); api.notify(msg, 'success', { timeout: ms }); return ctl; },
                    error(msg = 'Failed') { api.setStatus('', 'info', { sticky: false }); api.notify(msg, 'error', { timeout: 3500 }); return ctl; },
                    clear() { api.setStatus('', 'info', { sticky: false }); return ctl; },
                    done(msg, ms) { return ctl.success(msg, ms); }
                };
                return ctl;
            };

            return api;
        })();

        // --- queue until lt-ui-hub mounts ---
        let mounted = false;
        let mounting = null;              // Promise
        const queue = [];                 // [{fn, args}]

        async function mountUiHubOnce() {
            if (mounted) return true;
            if (mounting) return mounting;
            mounting = (async () => {
                try {
                    // If ensureLTHub is available, mount the sticky full-width bar where you want it
                    const ensureFn = (typeof ensureLTHub === 'function')
                        ? ensureLTHub
                        : (typeof ROOT.ensureLTHub === 'function' ? ROOT.ensureLTHub : null);

                    if (ensureFn) {
                        await ensureFn({
                            theme: { name: 'OneMonroe' },
                            // default to 'nav', but honor any earlier selection
                            mount: (ROOT.__LT_HUB_MOUNT || 'body'),
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
                        } catch { }
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
                try { hubNow[fn](...args); } catch { /* fall through */ }
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
                        try { hubNow.beginTask(label, tone); } catch { }
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
                try { console.warn('[lt-core] theme.apply failed', e); } catch { }
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

    // Auto-apply THEME_CSS if provided (safe no-op otherwise)
    try { core.theme.apply(); } catch { }

    // Tiny ready signal
    try { console.debug?.('[lt-core] ready'); } catch { }


})();
