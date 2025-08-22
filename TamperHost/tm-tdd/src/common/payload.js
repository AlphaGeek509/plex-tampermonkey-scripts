export function buildAttachmentPayload({ quoteId, customerNo, partNo, fileMeta }) {
    // Keep this mapping authoritative; tests will lock it down.
    return {
        quoteId,
        customerNo,
        partNo,
        attachment: {
            name: fileMeta.name,
            size: fileMeta.size,
            type: fileMeta.type ?? 'application/octet-stream'
        }
    };
}

export function buildAuthHeaders({ token }) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}
