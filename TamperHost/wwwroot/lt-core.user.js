// ==UserScript==
// @name         lt-core
// @namespace    lt
// @version      1.1.2
// @description  Single façade for auth, http, plex ds, and (optionally) data access
// @match        https://*/SalesAndCRM/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    const LT = (ROOT.lt = ROOT.lt || {});
    const core = (LT.core = LT.core || {});


    // ---------- Auth (from plex-auth) ----------
    core.auth = {
        async getKey() {
            // Prefer PlexAuth if available
            try {
                if (window.PlexAuth?.getKey) return await window.PlexAuth.getKey();
                if (window.PlexAPI?.getKey) return await window.PlexAPI.getKey();
            } catch { }
            return null;
        },
    };

    // ---------- HTTP (delegates to TMUtils.fetchData; fallback to fetch) ----------
    core.http = {
        async fetch(url, { method = 'GET', headers = {}, body, timeoutMs = 15000, useXHR = false } = {}) {
            if (window.TMUtils?.fetchData) {
                return await window.TMUtils.fetchData(url, { method, headers, body, timeoutMs, useXHR });
            }
            // Fallback: fetch with Authorization from plex-auth
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
                    credentials: 'include',
                });
                const ct = res.headers.get('content-type') || '';
                const data = ct.includes('application/json') ? await res.json() : await res.text();
                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
                return data;
            } finally { clearTimeout(t); }
        },
        async get(url, opts = {}) { return this.fetch(url, { ...(opts || {}), method: 'GET' }); },
        async post(url, body, opts = {}) { return this.fetch(url, { ...(opts || {}), method: 'POST', body }); },
    };

    // ---------- Plex APIs (datasources; delegates to TMUtils.ds/dsRows) ----------
    core.plex = {
        async ds(sourceId, payload = {}, opts = {}) {
            if (window.TMUtils?.ds) return await window.TMUtils.ds(sourceId, payload, opts);
            // Fallback: direct POST to DS endpoint
            const base = location.origin.replace(/\/$/, '');
            const url = `${base}/api/datasources/${sourceId}/execute?format=2`;
            const json = await core.http.post(url, payload, opts);
            // Normalize rows shape
            const rows = Array.isArray(json?.rows) ? json.rows : [];
            return { ...json, rows };
        },
        async dsRows(sourceId, payload = {}, opts = {}) {
            if (window.TMUtils?.dsRows) return await window.TMUtils.dsRows(sourceId, payload, opts);
            const { rows } = await this.ds(sourceId, payload, opts);
            return rows;
        },
    };

    // ---------- Data ----------
    // Do NOT define core.data here. Plex provides lt.core.data.
    // Our other scripts (lt-data-core, QT10/QT35) will detect/extend it when present.
    // (Intentionally left blank to avoid recursion / premature access.)



    // Tiny ready signal for debugging
    try { console.debug?.('[lt-core] loaded'); } catch { }

})();
