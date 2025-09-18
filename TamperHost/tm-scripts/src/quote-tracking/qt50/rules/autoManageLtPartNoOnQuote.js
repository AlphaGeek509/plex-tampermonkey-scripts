// src/quote-tracking/validation/rules/autoManageLtPartNoOnQuote.js
// ─────────────────────────────────────────────────────────────
// Rule: autoManageLtPartNoOnQuote
// When PartStatus === "Quote", POST to DS 13509 using the QT35 pattern:
//   Quote_Key = vmQuoteKey
//   Part_Key  = vmPartKey
//   Part_No   = Quote_No || "_" || vmPartNo   (Quote_No resolved via lt.core QTF; session fallback)
//   Note      = "auto managed"
// Uses getPlexFacade() + lt.core.auth.withFreshAuth + plex.dsRows(...).
// ─────────────────────────────────────────────────────────────
export default async function autoManageLtPartNoOnQuote(ctx, settings, utils) {
    const issues = [];
    if (!settings?.autoManageLtPartNoOnQuote) return issues;

    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
    const lt = (ROOT.lt || {});
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return (typeof impl === 'function') ? impl(fn) : fn();
    };

    // QTF (flat repo) like QT35
    const QTF = lt.core?.data?.makeFlatScopedRepo
        ? lt.core.data.makeFlatScopedRepo({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' })
        : null;

    const DS_QUOTE_HEADER_GET = 3156;   // hydrate Quote_No if missing
    const DS_MANAGE_PARTNO = 13509;  // your target DS to post Part_No

    async function getPlex() {
        const plex = (typeof ROOT.getPlexFacade === 'function')
            ? await ROOT.getPlexFacade()
            : (lt?.core?.plex);
        if (!plex) throw new Error('Plex facade not available');
        return plex;
    }

    // Fallback to session storage if QTF/plex hydration not ready
    function getQuoteNoFromSession() {
        try { return (sessionStorage.getItem('Quote_No') || '').trim(); } catch { return ''; }
    }

    // Resolve Quote_No for a given QuoteKey using QTF; hydrate once from DS if needed.
    async function getQuoteNoForQuoteKey(qk) {
        const qKey = Number(qk);
        if (!qKey || !Number.isFinite(qKey) || qKey <= 0) return getQuoteNoFromSession();

        try {
            if (!QTF) return getQuoteNoFromSession();

            const { repo } = QTF.use(qKey);
            await repo.ensureFromLegacyIfMissing?.();

            let head = await repo.getHeader?.();
            if (!head?.Quote_No) {
                const plex = await getPlex();
                if (plex?.dsRows) {
                    const rows = await withFreshAuth(() => plex.dsRows(DS_QUOTE_HEADER_GET, { Quote_Key: String(qKey) }));
                    const first = Array.isArray(rows) && rows.length ? rows[0] : null;
                    const quoteNo = first?.Quote_No ?? null;
                    if (quoteNo != null) {
                        await repo.patchHeader?.({ Quote_Key: qKey, Quote_No: quoteNo, Quote_Header_Fetched_At: Date.now() });
                        head = await repo.getHeader?.();
                    }
                }
            }
            const qn = head?.Quote_No;
            return (qn == null ? getQuoteNoFromSession() : String(qn).trim());
        } catch {
            return getQuoteNoFromSession();
        }
    }

    // Iterate QuotePart groups, resolve Quote_No once per group, then post per-row when status === 'Quote'
    for (const [qpk, group] of ctx.groupsByQuotePart.entries()) {
        const any = Array.isArray(group) && group.length ? group[0] : null;
        const groupQuoteKey = utils.get(any, 'QuoteKey', { number: true });

        // eslint-disable-next-line no-await-in-loop
        const resolvedQuoteNo = await getQuoteNoForQuoteKey(groupQuoteKey);

        // Process each unique PartKey exactly once
        const uniqByPartKey = new Map();
        for (const row of group) {
            const pk = utils.get(row, 'PartKey', { number: true });
            if (Number.isFinite(pk) && !uniqByPartKey.has(pk)) {
                uniqByPartKey.set(pk, row); // first row wins
            }
        }

        for (const r of uniqByPartKey.values()) {
            const status = String(utils.get(r, 'PartStatus', { trim: true }) || '');
            if (status.toLowerCase() !== 'quote') continue;

            const vmQuoteKey = groupQuoteKey ?? utils.get(r, 'QuoteKey', { number: true });
            const vmPartKey = utils.get(r, 'PartKey', { number: true });
            const vmPartNo = String(utils.get(r, 'PartNo', { trim: true }) ?? '');

            // Idempotency guard:
            //   If we have Quote_No, desired prefix is "<Quote_No>_"
            //   If not, desired prefix is "_" (per original spec).
            const hasQuoteNo = !!resolvedQuoteNo;
            const desiredPrefix = hasQuoteNo ? `${resolvedQuoteNo}_` : `_`;
            const alreadyManaged = vmPartNo.startsWith(desiredPrefix);

            // If already normalized, skip DS call and note it (so users know it was checked).
            if (alreadyManaged) {
                issues.push({
                    kind: 'part.autoManageLtPartNoOnQuote',
                    level: 'info',
                    quotePartKey: qpk,
                    message: `No change: Part_No already managed.`,
                    meta: { status: 'Quote', quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: false }
                });
                continue;
            }

            // Build the desired Part_No just once (avoid double-prefixing on subsequent runs)
            const partNoForPost = `${desiredPrefix}${vmPartNo}`;

            const body = {
                Quote_Key: String(vmQuoteKey ?? ''),
                Part_Key: String(vmPartKey ?? ''),
                Part_No: String(partNoForPost ?? ''),
                Name: 'auto managed',
                Update_Part: true
            };

            try {
                const plex = await getPlex();
                if (!plex?.dsRows) throw new Error('plex.dsRows unavailable');

                // QT35-style DS call with auth wrapper
                // eslint-disable-next-line no-await-in-loop
                await withFreshAuth(() => plex.dsRows(DS_MANAGE_PARTNO, body));

                issues.push({
                    kind: 'part.autoManageLtPartNoOnQuote',
                    level: 'warning',
                    quotePartKey: qpk,
                    message: `Part_No “${body.Part_No}” auto managed.`,
                    meta: { status: 'Quote', quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: true }
                });
            } catch (err) {
                issues.push({
                    kind: 'part.autoManageLtPartNoOnQuote',
                    level: 'warning',
                    quotePartKey: qpk,
                    message: `DS ${DS_MANAGE_PARTNO} failed: ${err?.message || err}`,
                    meta: { status: 'Quote', quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: false }
                });
            }
        }
    }

    return issues;
}

// Label the rule for the modal
autoManageLtPartNoOnQuote.meta = { id: 'autoManageLtPartNoOnQuote', label: 'Auto-Manage LT Part No' };
