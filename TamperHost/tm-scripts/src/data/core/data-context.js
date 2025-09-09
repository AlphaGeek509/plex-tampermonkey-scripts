// src/data/core/data-context.js
import { MemoryStore } from './storage/memory.js';
import { SessionStore } from './storage/session.js';
import { LocalStore } from './storage/local.js';
import { CompositeStore } from './storage/composite.js';
import { Cache } from './cache.js';
import { Bus } from './pubsub.js';
import { getTabId } from '../../shared/ids.js';

export function createDataContext({ ns, scopeKey, ttlMs = 3000, persist = 'session' } = {}) {
    const tabId = (() => {
        let id = sessionStorage.getItem('lt.tabId');
        if (!id) { id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); sessionStorage.setItem('lt.tabId', id); }
        return id;
    })();

    const store = persist === 'local' ? new LocalStore() : new SessionStore();
    const cache = new Cache(ttlMs);
    const base = { ns, scopeKey, tabId, store, cache };
    const makeRepo = (RepoCtor) => new RepoCtor(base);
    return { tabId, scopeKey, makeRepo };
}
