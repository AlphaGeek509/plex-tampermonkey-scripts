// src/quote-tracking/validation/rules/maxUnitPrice.js
export default function maxUnitPrice(ctx, settings, utils) {
    // Guard if not configured
    const max = Number(settings.maxUnitPrice);
    if (!Number.isFinite(max)) return [];

    const issues = [];

    // Simple currency/number sanitizer
    const toNum = (v) => {
        if (v == null) return NaN;
        const s = String(typeof v === 'function' ? v() : v).trim();
        if (!s) return NaN;
        return Number(s.replace(/[^\d.-]/g, ''));
    };


    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
        for (const r of group) {
            const qty = utils.get(r, 'Quantity') ?? '?';

            // precedence: customized > copy > base
            const raw =
                utils.get(r, 'RvCustomizedUnitPrice') ??
                utils.get(r, 'RvUnitPriceCopy') ??
                utils.get(r, 'UnitPrice');

            const num = toNum(raw);

            // Decide currency: infer from raw or use settings.currencyCode (default USD)
            const inferCurrency = (rawVal) => {
                const s = String(typeof rawVal === 'function' ? rawVal() : (rawVal ?? '')).trim();
                if (/\$/.test(s)) return 'USD';
                if (/€/.test(s)) return 'EUR';
                if (/£/.test(s)) return 'GBP';
                return settings?.currencyCode || 'USD';
            };

            const currency = inferCurrency(raw);
            const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 6 });

            if (Number.isFinite(num) && num > max) {
                const fmtMoney = (n) => Number.isFinite(n) ? moneyFmt.format(n) : String(n);
                issues.push({
                    kind: 'price.maxUnitPrice',
                    level: 'error',
                    quotePartKey: qp,
                    message: `Unit Price ${fmtMoney(num)} > Max ${fmtMoney(max)}`,
                    meta: { unitRaw: raw, unitNum: num, max, currency }
                });
            }
        }
    }

    return issues;
}

maxUnitPrice.meta = { id: 'maxUnitPrice', label: 'Max Unit Price' };
