// qt10.noCatalog.spec.js
import { describe, it, expect, vi } from 'vitest';

function applyCatalogForFactory({ TMUtils, viewModel }) {
    return async function applyCatalogFor(customerNo) {
        const [row1] = await TMUtils.dsRows(319, { Customer_No: customerNo });
        const catalogKey = row1?.Catalog_Key || 0;
        if (!catalogKey) { TMUtils.toast(`No catalog for ${customerNo}`, 'warn'); return; }
        // ...
    };
}

describe('QT10 no-catalog path', () => {
    it('toasts warn and does not write to VM', async () => {
        const toast = vi.fn();
        const TMUtils = { dsRows: vi.fn().mockResolvedValue([{}]), toast };
        const vm = { CatalogKey: vi.fn(), CatalogCode: vi.fn() };
        const apply = applyCatalogForFactory({ TMUtils, viewModel: vm });

        await apply('C42');
        expect(toast).toHaveBeenCalled();
        expect(vm.CatalogKey).not.toHaveBeenCalled();
        expect(vm.CatalogCode).not.toHaveBeenCalled();
    });
});
