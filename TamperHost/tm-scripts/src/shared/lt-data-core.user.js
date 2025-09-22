// ==UserScript==
// @name         lt-data-core
// @namespace    lt
// @version      3.7.8
// @description  Core data: add makeFlatScopedRepo (flat {header,lines}) onto lt.core.data, waiting for DC to load
// @match        https://*/SalesAndCRM/*
// @grant        none
// @run-at       document-start
// ==/UserScript
(function () {
    'use strict';
    const root = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // Locate lt.core.data from either the sandbox `lt` (via @require lt-core) or any same-origin frame
    function findDC(env = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window)) {
        // 1) TM sandbox variable provided by lt-core.user.js
        try { if (typeof lt !== 'undefined' && lt?.core?.data) return { dc: lt.core.data, host: env }; } catch { }
        // 2) Page window
        try { if (env.lt?.core?.data) return { dc: env.lt.core.data, host: env }; } catch { }
        // 3) Same-origin subframes
        for (let i = 0; i < env.frames.length; i++) {
            try { const r = findDC(env.frames[i]); if (r) return r; } catch { }
        }
        return null;
    }



    function install() {
        const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

        // Prefer the TM sandbox lt if present; otherwise fall back to page window
        const LT = (typeof lt !== 'undefined') ? lt : (ROOT.lt = ROOT.lt || {});
        const CORE = (LT.core = LT.core || {});

        // If Plex hasn't provided a data core, create a tiny shim
        let DC = CORE.data;
        if (!DC) {
            DC = CORE.data = {};
        }

        // Provide a minimal createDataContext if missing (sessionStorage-backed)
        if (!DC.createDataContext) {
            DC.createDataContext = function createDataContext({ ns, scopeKey, persist = 'session', ttlMs = null }) {
                const storage = persist === 'local' ? ROOT.localStorage : ROOT.sessionStorage;
                const prefix = `lt:${ns}:${scopeKey}:`;
                const headerKey = `${prefix}header`;

                return {
                    // Flat repo factory: we ignore RepoCtor and return a simple header repo
                    makeRepo(/* RepoCtor */) {
                        const api = {
                            async get() {
                                try { const s = storage.getItem(headerKey); return s ? JSON.parse(s) : null; }
                                catch { return null; }
                            },
                            async getHeader() { return this.get(); },
                            async patchHeader(patch) {
                                const cur = (await this.get()) || {};
                                const next = Object.assign({}, cur, patch || {});
                                try { storage.setItem(headerKey, JSON.stringify(next)); } catch { }
                                return next;
                            },
                            async clear() { try { storage.removeItem(headerKey); } catch { } },
                            async ensureFromLegacyIfMissing() { /* no-op for shim */ }
                        };
                        return api;
                    }
                };
            };
        }

        // Attach our flat-scoped factory if missing
        if (!DC.makeFlatScopedRepo) {
            function hashScope(s) {
                // FNV-1a 32-bit
                let h = 0x811c9dc5 >>> 0;
                for (let i = 0; i < s.length; i++) {
                    h ^= s.charCodeAt(i);
                    h = Math.imul(h, 0x01000193) >>> 0;
                }
                return h >>> 0;
            }

            function makeFlatScopedRepo({ ns, entity = 'quote', schema = null, persist = 'session', ttlMs = null, legacyEntity = null } = {}) {
                function use(scopeKey) {
                    const key = (typeof scopeKey === 'string') ? hashScope(scopeKey) : Number(scopeKey);
                    if (!Number.isFinite(key) || key <= 0) throw new Error('Invalid scopeKey');

                    const ctx = DC.createDataContext({ ns, scopeKey: key, persist, ttlMs });
                    // Our shim returns a header-only repo; if Plex DC is present, it returns a proper repo
                    const repo = ctx.makeRepo(function FlatRepo() { });
                    return { ctx, repo };
                }
                return { use, FlatRepo: function FlatRepo() { }, opts: { ns, entity, schema, persist, ttlMs, legacyEntity } };
            }

            Object.defineProperty(DC, 'makeFlatScopedRepo', { value: makeFlatScopedRepo, configurable: true, writable: true });
        }

        try { console.info?.('[lt-data-core] installed'); } catch { }
        return true;
    }


    // Install immediately; if Plex later augments lt.core.data, our factory already exists
    install();



})();
