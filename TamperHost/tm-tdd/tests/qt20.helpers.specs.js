import { describe, it, expect } from 'vitest';

beforeAll(async () => {
    // Minimal globals for module init
    global.TMUtils = { matchRoute: () => true, observeInsertMany: () => () => { }, onUrlChange: () => { } };
    global.GM_getValue = () => ({});
    global.GM_setValue = () => { };
    global.unsafeWindow = {};
    global.window = global;
    global.ko = { unwrap: (x) => (typeof x === 'function' ? x() : x) };

    global.__TM_DEV__ = true;
    await import('../src/qt20/main.js');
});

describe('QT20 helpers', () => {
    it('splitBaseAndPack parses -10BAG suffix', () => {
        const { splitBaseAndPack } = window.__QT20__;
        const r = splitBaseAndPack('AA5003-30-05.0-00-10BAG');
        expect(r).toEqual({ base: 'AA5003-30-05.0-00', packSize: 10, packUnit: 'BAG' });
    });

    it('toBasePart strips pack suffix', () => {
        const { toBasePart } = window.__QT20__;
        expect(toBasePart('AA-01-02-10BOX')).toBe('AA-01-02');
    });

    it('normalize + summarize totals by location (pcs)', () => {
        const { normalizeRowToPieces, summarizeStockNormalized } = window.__QT20__;
        const base = 'AA-01-02';
        const rows = [
            { Part_No: 'AA-01-02', Quantity: 5, Unit: 'pcs', Location: 'M1' },
            { Part_No: 'AA-01-02-10BAG', Quantity: 3, Unit: 'bag', Location: 'M1' }, // 3*10
            { Part_No: 'AA-01-02-25BOX', Quantity: 1, Unit: 'box', Location: 'M2' }, // 1*25
            { Part_No: 'BB-XX', Quantity: 99, Unit: 'pcs', Location: 'M9' }          // ignored (different base)
        ];
        expect(normalizeRowToPieces(rows[0], base)).toBe(5);
        expect(normalizeRowToPieces(rows[1], base)).toBe(30);
        expect(normalizeRowToPieces(rows[2], base)).toBe(25);

        const { sum, breakdown } = summarizeStockNormalized(rows, base);
        expect(sum).toBe(60);
        expect(breakdown).toEqual([{ loc: 'M1', qty: 35 }, { loc: 'M2', qty: 25 }]);
    });
});
