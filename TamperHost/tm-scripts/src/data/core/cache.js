// src/data/core/cache.js
export class Cache {
    constructor(ttlMs = 5_000) { this.ttl = ttlMs; this.m = new Map(); }
    get(k) { const e = this.m.get(k); if (!e) return null; if (Date.now() > e.expires) { this.m.delete(k); return null; } return e.value; }
    set(k, v) { this.m.set(k, { value: v, expires: Date.now() + this.ttl }); }
    del(k) { this.m.delete(k); }
    clear() { this.m.clear(); }
}
