// ==UserScript==
// @name         lt-data-core
// @namespace    lt
// @version      1.2.2
// @description  Core data: add makeFlatScopedRepo (flat {header,lines}) onto lt.core.data, waiting for DC to load
// @match        https://*/SalesAndCRM/*
// @grant        none
// ==/UserScript>
(function () {
    'use strict';
    const root = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // ...snip (no changes above install()) ...

    function install() {
        const DC = root.lt?.core?.data;
        const RepoBase = DC?.RepoBase?.value ?? DC?.RepoBase;
        if (!DC || !DC.createDataContext || !RepoBase) return false;
        if (typeof DC.makeFlatScopedRepo === 'function') return true;

        function __ltDeepMerge(target, patch) { /* unchanged */ }

        function makeFlatScopedRepo({ ns, entity, schema = `${entity}@1`, persist = 'session', ttlMs = 3000, legacyEntity = null }) {
            class FlatRepo extends RepoBase { /* unchanged */ }

            // --- NEW: accept string scope keys by hashing deterministically ---
            function __hashScope(s) {
                let h = 0;
                for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
                h = Math.abs(h) || 1;
                return h;
            }

            function use(scopeKey) {
                const key = (typeof scopeKey === 'string') ? __hashScope(scopeKey) : Number(scopeKey);
                if (!Number.isFinite(key) || key <= 0) throw new Error('Invalid scopeKey');
                const ctx = DC.createDataContext({ ns, scopeKey: key, persist, ttlMs });
                const repo = ctx.makeRepo(FlatRepo);
                return { ctx, repo };
            }

            return { use, FlatRepo, opts: { ns, entity, schema, persist, ttlMs, legacyEntity } };
        }

        Object.defineProperty(DC, 'makeFlatScopedRepo', { value: makeFlatScopedRepo, configurable: true, writable: true });
        return true;
    }

    if (!install()) {
        const id = setInterval(() => { if (install()) clearInterval(id); }, 50);
        setTimeout(() => clearInterval(id), 20000);
    }
})();
