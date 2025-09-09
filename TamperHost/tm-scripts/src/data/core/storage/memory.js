// src/data/core/storage/memory.js
export class MemoryStore {
    #m = new Map();
    get(k) { return this.#m.get(k) ?? null; }
    set(k, v) { this.#m.set(k, v); }
    del(k) { this.#m.delete(k); }
    keys(prefix) { return [...this.#m.keys()].filter(k => k.startsWith(prefix)); }
    clear(prefix) { for (const k of this.keys(prefix)) this.#m.delete(k); }
}
