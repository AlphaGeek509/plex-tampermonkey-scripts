import { describe, it, expect } from 'vitest';
import { makeKV } from '../src/common/storage.js';

describe('GM storage wrapper', () => {
    it('round-trips values via GM shim', async () => {
        const kv = makeKV({ GM: globalThis.GM });
        expect(await kv.get('lastQuote', null)).toBe(null);
        await kv.set('lastQuote', 456);
        expect(await kv.get('lastQuote')).toBe(456);
    });
});
