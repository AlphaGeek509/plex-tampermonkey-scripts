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
        if (__BUILD_DEV__) {
            const preview = [];
            for (const [qp2, grp] of ctx.groupsByQuotePart.entries()) {
                for (const row of grp) {
                    const raw =
                        utils.get(row, 'RvCustomizedUnitPrice') ??
                        utils.get(row, 'RvUnitPriceCopy') ??
                        utils.get(row, 'UnitPrice');

                    preview.push({
                        qp: qp2,
                        qty: utils.get(row, 'Quantity'),
                        unitPrice_raw: raw,
                        unitPrice_num: Number(String(raw ?? '').replace(/[^\d.-]/g, '')),
                        partNo: utils.get(row, 'CustomerPartNo'),
                        desc: utils.get(row, 'Description')
                    });
                }
            }
            console.table(preview);
        }


        for (const r of group) {
            const qty = utils.get(r, 'Quantity') ?? '?';

            // precedence: customized > copy > base
            const raw =
                utils.get(r, 'RvCustomizedUnitPrice') ??
                utils.get(r, 'RvUnitPriceCopy') ??
                utils.get(r, 'UnitPrice');

            const num = toNum(raw);

            if (Number.isFinite(num) && num > max) {
                issues.push({
                    kind: 'price.maxUnitPrice',
                    level: 'error',
                    quotePartKey: qp,
                    message: `QP ${qp} Qty ${qty}: Unit Price ${raw} > Max ${max}`,
                    meta: { unitRaw: raw, unitNum: num, max }
                });
            }
        }
    }

    return issues;
}

maxUnitPrice.meta = { id: 'maxUnitPrice', label: 'Max Unit Price' };
