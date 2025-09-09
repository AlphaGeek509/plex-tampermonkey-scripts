// src/data/core/storage/session.js
export class SessionStore {
    get(k) { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; }
    set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); }
    del(k) { sessionStorage.removeItem(k); }
    keys(prefix) { return Object.keys(sessionStorage).filter(k => k.startsWith(prefix)); }
    clear(prefix) { for (const k of this.keys(prefix)) sessionStorage.removeItem(k); }
}
