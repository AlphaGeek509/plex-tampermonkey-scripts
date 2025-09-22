// ─────────────────────────────────────────────────────────────
// Rule: minUnitPrice
// Purpose: Error when the effective unit price is below the configured minimum.
// Reads from settings.minUnitPrice (nullable).
// Precedence for unit price fields:
//   RvCustomizedUnitPrice > RvUnitPriceCopy > UnitPrice
// ─────────────────────────────────────────────────────────────
export default function minUnitPrice(ctx, settings, utils) {
    const min = Number(settings.minUnitPrice);
    if (!Number.isFinite(min)) return [];

    const issues = [];
    const toNum = (v) => {
        if (v == null) return NaN;
        const s = String(typeof v === 'function' ? v() : v).trim();
        if (!s) return NaN;
        return Number(s.replace(/[^\d.-]/g, ''));
    };

    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
        for (const r of group) {
            const qty = utils.get(r, 'Quantity') ?? '?';
            const raw =
                utils.get(r, 'RvCustomizedUnitPrice') ??
                utils.get(r, 'RvUnitPriceCopy') ??
                utils.get(r, 'UnitPrice');

            const num = toNum(raw);

            if (Number.isFinite(num) && num < min) {
                const fmt = (n) => (Number.isFinite(n)
                    ? n.toLocaleString('en-US', { maximumFractionDigits: 6 })
                    : String(n));
                issues.push({
                    kind: 'price.minUnitPrice',
                    level: 'error',
                    quotePartKey: qp,
                    message: `Unit Price ${fmt(num)} < Min ${fmt(min)}`,
                    meta: { unitRaw: raw, unitNum: num, min }
                });
            }
        }
    }

    return issues;
}

minUnitPrice.meta = { id: 'minUnitPrice', label: 'Min Unit Price' };
