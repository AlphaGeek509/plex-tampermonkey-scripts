// ==UserScript==
// @name         lt-data-core
// @namespace    lt
// @version      1.0.3
// @description  Core data context & RepoBase exposed as window.lt.data
// @match        https://*/SalesAndCRM/*
// @grant        none
// ==/UserScript>
(() => {
    const LT = (window.lt = window.lt || {});
    LT.data = LT.data || {};

    const getTabId = () => {
        let id = sessionStorage.getItem('lt.tabId');
        if (!id) { id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); sessionStorage.setItem('lt.tabId', id); }
        return id;
    };

    class SessionStore {
        get(k) { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; }
        set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); }
        del(k) { sessionStorage.removeItem(k); }
    }
    class LocalStore {
        get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
        del(k) { try { localStorage.removeItem(k); } catch { } }
    }
    class Cache {
        constructor(ttlMs = 3000) { this.ttl = ttlMs; this.m = new Map(); }
        get(k) { const e = this.m.get(k); if (!e) return null; if (Date.now() > e.expires) { this.m.delete(k); return null; } return e.value; }
        set(k, v) { this.m.set(k, { value: v, expires: Date.now() + this.ttl }); }
        del(k) { this.m.delete(k); }
    }
    class RepoBase {
        constructor({ ns, entity, scopeKey, tabId, store, cache }) {
            if (!scopeKey) throw new Error(`${entity} repo requires scopeKey`);
            Object.assign(this, { ns, entity, scopeKey, tabId, store, cache });
        }
        k(id = 'current') { return `lt:${this.ns}:tab:${this.tabId}:scope:${this.scopeKey}:${this.entity}:${id}`; }
        getCached(id) { return this.cache?.get(this.k(id)) ?? null; }
        setCached(id, val) { this.cache?.set(this.k(id), val); }
        async read(id) { const k = this.k(id); const c = this.getCached(id); if (c) return c; const v = this.store.get?.(k); if (v) this.setCached(id, v); return v ?? null; }
        async write(id, val) { const k = this.k(id); this.store.set?.(k, val); this.setCached(id, val); return val; }
        async remove(id) { const k = this.k(id); this.store.del?.(k); this.cache?.del?.(k); }
    }
    function createDataContext({ ns, scopeKey, ttlMs = 3000, persist = 'session' } = {}) {
        const tabId = getTabId();
        const store = persist === 'local' ? new LocalStore() : new SessionStore();
        const cache = new Cache(ttlMs);
        const base = { ns, scopeKey, tabId, store, cache };
        const makeRepo = (RepoCtor) => new RepoCtor(base);
        return { tabId, scopeKey, makeRepo, _base: base };
    }

    LT.data.createDataContext = createDataContext;
    LT.data.RepoBase = RepoBase;
})();
