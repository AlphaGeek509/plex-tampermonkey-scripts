// src/quote-tracking/validation/engine.js
import rules from './rules';

export async function runValidation(TMUtils, settings) {
    await TMUtils.waitForModelAsync('.plex-grid', { requireKo: true, timeoutMs: 12000 });

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const grid = document.querySelector('.plex-grid');
    const gvm = grid ? KO?.dataFor?.(grid) : null;

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

    const issues = rules.flatMap(rule => rule(ctx, settings, utils));
    const ok = issues.every(i => i.level !== 'error');

    // stash if you want other modules to read it later
    TMUtils.state = TMUtils.state || {};
    TMUtils.state.lastValidation = { at: Date.now(), ok, issues };

    return { ok, issues };
}
