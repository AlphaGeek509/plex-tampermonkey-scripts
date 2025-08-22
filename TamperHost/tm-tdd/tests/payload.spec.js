import { describe, it, expect } from 'vitest';
import { buildAttachmentPayload, buildAuthHeaders } from '../src/common/payload.js';

describe('Payload builders', () => {
    it('builds attachment payload deterministically', () => {
        const body = buildAttachmentPayload({
            quoteId: 123,
            customerNo: 'C00042',
            partNo: 'P-7788',
            fileMeta: { name: 'spec.pdf', size: 2048, type: 'application/pdf' }
        });
        expect(body).toEqual({
            quoteId: 123,
            customerNo: 'C00042',
            partNo: 'P-7788',
            attachment: { name: 'spec.pdf', size: 2048, type: 'application/pdf' }
        });
    });

    it('builds auth headers', () => {
        const h = buildAuthHeaders({ token: 'abc123' });
        expect(h['Content-Type']).toBe('application/json');
        expect(h.Authorization).toBe('Bearer abc123');
    });
});
