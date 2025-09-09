// src/data/core/storage/local.js
export class LocalStore {
    get(k) {
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
        catch { return null; }
    }
    set(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); }
        catch { /* quota/full */ }
    }
    del(k) {
        try { localStorage.removeItem(k); }
        catch { /* ignore */ }
    }
    keys(prefix) {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(prefix)) keys.push(k);
            }
            return keys;
        } catch { return []; }
    }
    clear(prefix) {
        for (const k of this.keys(prefix)) {
            try { localStorage.removeItem(k); } catch { }
        }
    }
}
