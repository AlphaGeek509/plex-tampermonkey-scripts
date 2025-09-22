// src/data/core/storage/composite.js
export class CompositeStore {
    constructor(primary, shared = null) { this.primary = primary; this.shared = shared; }
    async get(k) { const v = this.primary.get?.(k) ?? await this.primary.get?.(k); return v ?? (this.shared ? (await this.shared.get?.(k)) : null); }
    async set(k, v) { this.primary.set?.(k, v); if (this.shared) await this.shared.set?.(k, v); }
    async del(k) { this.primary.del?.(k); if (this.shared) await this.shared.del?.(k); }
}
