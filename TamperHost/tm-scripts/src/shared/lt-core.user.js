// ==UserScript==
// @name         lt-core
// @namespace    lt
// @version      3.8.11
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

    // Auto-apply THEME_CSS if provided (safe no-op otherwise)
    try { core.theme.apply(); } catch { }

    // Tiny ready signal
    try { console.debug?.('[lt-core] ready'); } catch { }

})();
