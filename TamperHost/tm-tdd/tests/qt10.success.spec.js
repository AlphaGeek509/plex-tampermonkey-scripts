// qt10.success.spec.js
import { describe, it, expect, vi } from 'vitest';

describe('QT10 success path', () => {
    it('writes CatalogKey/Code and toasts success', async () => {
        const TMUtils = {
            dsRows: vi.fn()
                .mockResolvedValueOnce([{ Catalog_Key: 6245 }])       // 319
                .mockResolvedValueOnce([{ Catalog_Code: 'Distributor' }]) // 22696
        };
        const vm = { CatalogKey: vi.fn(), CatalogCode: vi.fn() };
        const toast = vi.fn(); TMUtils.toast = toast;

        // tiny inlined version of your applyCatalogFor (or import it if exported)
        async function apply(customerNo) {
            const [row1] = await TMUtils.dsRows(319, { Customer_No: customerNo });
            const key = row1?.Catalog_Key || 0; if (!key) return;
            const rows2 = await TMUtils.dsRows(22696, { Catalog_Key: key });
            const code = rows2.map(r => r.Catalog_Code).find(Boolean) || '';
            vm.CatalogKey(key); vm.CatalogCode(code);
            toast(`Customer: ${customerNo}\nCatalogKey: ${key}\nCatalogCode: ${code}`, 'success');
        }

        await apply('775797');
        expect(TMUtils.dsRows).toHaveBeenCalledTimes(2);
        expect(vm.CatalogKey).toHaveBeenCalledWith(6245);
        expect(vm.CatalogCode).toHaveBeenCalledWith('Distributor');
        expect(toast).toHaveBeenCalled();
    });
});
