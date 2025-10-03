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

            // Decide currency: infer from raw or use settings.currencyCode (default USD)
            const inferCurrency = (rawVal) => {
                const s = String(typeof rawVal === 'function' ? rawVal() : rawVal || '');
                if (/\$/.test(s)) return 'USD';
                if (/€/.test(s)) return 'EUR';
                if (/£/.test(s)) return 'GBP';
                return settings?.currencyCode || 'USD';
            };

            const currency = inferCurrency(raw);
            const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 6 });
            const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

            if (Number.isFinite(num) && num < min) {
                const fmtMoney = (n) => Number.isFinite(n) ? moneyFmt.format(n) : String(n);

                issues.push({
                    kind: 'price.minUnitPrice',
                    level: 'error',
                    quotePartKey: qp,
                    message: `Unit Price ${fmtMoney(num)} < Min ${fmtMoney(min)}`,
                    meta: { unitRaw: raw, unitNum: num, min, currency }
                });
            }
        }
    }

    return issues;
}

minUnitPrice.meta = { id: 'minUnitPrice', label: 'Min Unit Price' };
