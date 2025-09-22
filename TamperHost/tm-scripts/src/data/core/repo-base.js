// src/data/core/repo-base.js
export class RepoBase {
    constructor({ ns, entity, scopeKey, tabId, store, cache, bus, singleTab = true }) {
        if (!scopeKey) throw new Error(`${entity} repo requires scopeKey`);
        Object.assign(this, { ns, entity, scopeKey, tabId, store, cache, bus, singleTab });
    }
    k(id = 'current') { return `lt:${this.ns}:tab:${this.tabId}:scope:${this.scopeKey}:${this.entity}:${id}`; }
    getCached(id) { return this.cache?.get(this.k(id)) ?? null; }
    setCached(id, val) { this.cache?.set(this.k(id), val); }
    async read(id) {
        const k = this.k(id); const cached = this.getCached(id); if (cached) return cached;
        const v = await this.store.get?.(k); if (v) this.setCached(id, v); return v ?? null;
    }
    async write(id, val) {
        const k = this.k(id); await this.store.set?.(k, val); this.setCached(id, val);
        this.bus?.publish({ topic: `${this.ns}.${this.entity}.updated`, scopeKey: this.scopeKey, tabId: this.tabId, id }); return val;
    }
    async remove(id) {
        const k = this.k(id); await this.store.del?.(k); this.cache?.del?.(k);
        this.bus?.publish({ topic: `${this.ns}.${this.entity}.removed`, scopeKey: this.scopeKey, tabId: this.tabId, id });
    }
}
