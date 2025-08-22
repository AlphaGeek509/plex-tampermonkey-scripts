import { describe, it, expect, vi } from 'vitest';
import { makeCustomerFlow } from '../src/qt10/customerFlow.js';

describe('QT10 customer flow', () => {
    it('builds payload and reports it once when a customerNo arrives', async () => {
        const buildPayload = vi.fn().mockReturnValue({ customerNo: 'C42' });
        const onResult = vi.fn();
        const run = makeCustomerFlow({ buildPayload, onResult });

        await run('C42', {});
        expect(buildPayload).toHaveBeenCalledWith({ customerNo: 'C42' });
        expect(onResult).toHaveBeenCalledWith({ kind: 'payload', payload: { customerNo: 'C42' }, deps: {} });
    });
});
