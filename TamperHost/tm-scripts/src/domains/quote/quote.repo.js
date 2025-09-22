// src/data/domains/quote/quote.repo.js
import { normalizeQuote } from './quote.entity.js';

export class QuoteRepo extends DataCore.RepoBase {
    constructor(base) { super({ ...base, entity: 'quote' }); }

    async get() {
        return await this.read('current');
    }

    async set(model) {
        const prev = (await this.get()) ?? {};
        const next = normalizeQuote(model, prev);
        return await this.write('current', next);
    }

    async update(patch) {
        const prev = (await this.get()) ?? {};
        // Merge patch over prev, bump Updated_At, then normalize
        const next = normalizeQuote({ ...prev, ...patch, Updated_At: Date.now() }, prev);
        return await this.write('current', next);
    }

    async clear() {
        await this.remove('current');
    }
}
