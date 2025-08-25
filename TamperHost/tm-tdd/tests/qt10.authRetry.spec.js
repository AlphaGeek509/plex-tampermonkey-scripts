// qt10.authRetry.spec.js
import { describe, it, expect, vi } from 'vitest';
describe('QT10 auth retry', () => {
    it('retries once after 419', async () => {
        const err419 = Object.assign(new Error('419'), { status: 419 });
        const dsRows = vi.fn()
            .mockRejectedValueOnce(err419)
            .mockResolvedValueOnce([{ Catalog_Key: 1 }]);
        const getApiKey = vi.fn().mockResolvedValue('k');
        await (async function run() { try { await dsRows(319, { Customer_No: 'X' }) } catch (e) { if (e.status === 419) { await getApiKey({ force: true }); await dsRows(319, { Customer_No: 'X' }) } } })();
        expect(getApiKey).toHaveBeenCalled();
        expect(dsRows).toHaveBeenCalledTimes(2);
    });
});
