// src/quote-tracking/validation/rules/autoManageLtPartNoOnQuote.js
// ─────────────────────────────────────────────────────────────
// Rule: autoManageLtPartNoOnQuote
// Purpose: If Part Status is "Quote", auto-manage (lock/control)
//          the Lyn-Tron Part No field for that row.
// ─────────────────────────────────────────────────────────────
export default function autoManageLtPartNoOnQuote(ctx, settings, utils) {
    const issues = [];

    // Skip entirely if setting disabled
    if (!settings.autoManageLtPartNoOnQuote) return issues;

    // Placeholder logic: just dump context for now
    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
        for (const r of group) {
            const status = utils.get(r, 'PartStatus');
            const ltPartNo = utils.get(r, 'PartNo');

            // TODO: implement actual "auto-manage" enforcement
            if (status === 'Quote') {
                // At this point we might lock the UI, or push an informational issue
                issues.push({
                    kind: 'part.autoManageLtPartNoOnQuote',
                    level: 'info',
                    quotePartKey: qp,
                    message: `QP ${qp}: auto-manage Lyn-Tron Part No = ${ltPartNo} (status=Quote).`,
                    meta: { status, ltPartNo }
                });
            }
        }
    }

    return issues;
}
