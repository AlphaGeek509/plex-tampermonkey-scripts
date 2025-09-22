// src/data/core/storage/gm.js
export class GMStore {
    constructor(GM) { this.GM = GM; }
    async get(k) { return await this.GM.getValue(k, null); }
    async set(k, v) { await this.GM.setValue(k, v); }
    async del(k) { await this.GM.deleteValue(k); }
    // No fast keys() API; track an index if you need enumeration.
}
