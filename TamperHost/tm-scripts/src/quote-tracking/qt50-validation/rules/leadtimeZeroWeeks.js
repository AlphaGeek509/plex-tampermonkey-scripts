// ─────────────────────────────────────────────────────────────
// Rule: leadtimeZeroWeeks
// Purpose: Error when Leadtime == 0 weeks.
// Reads from settings.leadtimeZeroWeeks (boolean).
// Field: Leadtime (weeks) expected in VM row.
// ─────────────────────────────────────────────────────────────
export default function leadtimeZeroWeeks(ctx, settings, utils) {
    if (!settings?.leadtimeZeroWeeks) return [];

    const issues = [];
    const toNum = (v) => {
        if (v == null) return NaN;
        const s = String(typeof v === 'function' ? v() : v).trim();
        if (!s) return NaN;
        return Number(s.replace(/[^\d.-]/g, ''));
    };

    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
        for (const r of group) {
            const raw = utils.get(r, 'LeadTime'); // adjust field name if different
            const num = toNum(raw);

            if (Number.isFinite(num) && num === 0) {
                issues.push({
                    kind: 'time.leadtimeZeroWeeks',
                    level: 'error',
                    quotePartKey: qp,
                    message: `Leadtime is 0 weeks (must be > 0).`,
                    meta: { leadtimeRaw: raw, leadtimeNum: num }
                });
            }
        }
    }

    return issues;
}

leadtimeZeroWeeks.meta = { id: 'leadtimeZeroWeeks', label: 'Leadtime Zero Weeks' };
