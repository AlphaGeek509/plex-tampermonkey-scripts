// src/quote-tracking/validation/engine.js
import rules from './rules';

export async function runValidation(TMUtils, settings) {
    await TMUtils.waitForModelAsync('.plex-grid', { requireKo: true, timeoutMs: 12000 });

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const grid = document.querySelector('.plex-grid');
    const gvm = (grid && KO && typeof KO.dataFor === 'function') ? KO.dataFor(grid) : null;
    if (!gvm) return { ok: true, issues: [] }; // nothing to validate yet

    const rows = (gvm?.datasource?.raw) || (gvm?.datasource?.data) || [];
    const groupsByQuotePart = new Map();
    for (const r of rows) {
        const qp = TMUtils.getObsValue(r, 'QuotePartKey') ?? -1;
        (groupsByQuotePart.get(qp) || groupsByQuotePart.set(qp, []).get(qp)).push(r);
    }

    const primaryByQuotePart = new Map();
    for (const [qp, group] of groupsByQuotePart.entries()) {
        const p = group.find(r => TMUtils.getObsValue(r, 'IsUniqueQuotePart') === 1) || group[0];
        primaryByQuotePart.set(qp, p);
    }

    const ctx = {
        rows,
        groupsByQuotePart,
        primaryByQuotePart,
        lastForm: TMUtils.net?.getLastAddUpdateForm?.(),
        lastResult: TMUtils.net?.getLastAddUpdate?.()
    };

    const utils = { get: (obj, path, opts) => TMUtils.getObsValue(obj, path, opts) };

    const results = await Promise.all(rules.map(rule => rule(ctx, settings, utils)));
    const issuesRaw = results.flat();
    const ok = issuesRaw.every(i => i.level !== 'error');

    // Enrich issues with UI-facing data (lineNumber, partNo, ruleLabel)
    const toNum = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    const ruleLabelFrom = (iss) => {
        // Preferred: rule function sets .meta.label (e.g., maxUnitPrice.meta.label)
        if (iss?.meta?.label) return iss.meta.label;
        if (iss?.kind) {
            const k = String(iss.kind);
            // prettify "price.maxUnitPrice" => "Max Unit Price"
            const tail = k.split('.').pop();
            return tail
                ? tail.replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/^./, (c) => c.toUpperCase())
                : k;
        }
        return 'Validation';
    };

    // Build a quick map of row -> info
    const rowInfo = new Map(); // vm -> { lineNumber, partNo }
    for (let i = 0; i < ctx.rows.length; i++) {
        const r = ctx.rows[i];
        const lineNumber = i + 1;
        const partNo = utils.get(r, 'PartNo', { trim: true }) ?? '';
        rowInfo.set(r, { lineNumber, partNo });
    }

    // Also map QPK -> "primary" row for cheap lookup
    const qpkToPrimaryInfo = new Map();
    for (const [qp, primary] of ctx.primaryByQuotePart.entries()) {
        const info = rowInfo.get(primary) || { lineNumber: null, partNo: utils.get(primary, 'PartNo', { trim: true }) ?? '' };
        qpkToPrimaryInfo.set(qp, info);
    }

    // Build a SortOrder lookup by visual row index (from the VM, not the DOM)
    const sortByLine = new Map();
    for (let i = 0; i < ctx.rows.length; i++) {
        const row = ctx.rows[i];
        const lineNumber = i + 1;
        const sortOrder = utils.get(row, 'SortOrder', { number: true });
        sortByLine.set(lineNumber, sortOrder);
    }

    const issues = issuesRaw.map(iss => {
        const qpk = iss.quotePartKey ?? -1;
        const info = qpkToPrimaryInfo.get(qpk) || { lineNumber: null, partNo: '' };
        return {
            ...iss,
            lineNumber: info.lineNumber,
            partNo: info.partNo,
            ruleLabel: ruleLabelFrom(iss),
            sortOrder: sortByLine.get(info.lineNumber ?? -1)
        };
    });


    // stash if you want other modules to read it later
    TMUtils.state = TMUtils.state || {};
    TMUtils.state.lastValidation = { at: Date.now(), ok, issues };

    return { ok, issues };
}

