// Adds a “Validate Lines” button and wires it to the engine.
// Assumes your settings UI exports getSettings/onSettingsChange.

import { runValidation } from './engine';
import { getSettings, onSettingsChange } from './index';

const HUB_BTN_ID = 'qt50-validate';

async function getHub(opts = { mount: 'nav' }) {
    for (let i = 0; i < 50; i++) {
        const ensure = (window.ensureLTHub || unsafeWindow?.ensureLTHub);
        if (typeof ensure === 'function') {
            try { const hub = await ensure(opts); if (hub) return hub; } catch { }
        }
        await new Promise(r => setTimeout(r, 100));
    }
    return null;
}

export async function mountValidationButton(TMUtils) {
    const hub = await getHub({ mount: 'nav' });
    if (!hub?.registerButton) return () => { };

    // avoid duplicate
    if (hub.list?.()?.includes(HUB_BTN_ID)) return () => { };

    let btnEl = null;
    hub.registerButton('left', {
        id: HUB_BTN_ID,
        label: 'Validate Lines',
        title: 'Validate quote line rules',
        weight: 130,
        onClick: async () => {
            const settings = getSettings?.() || {};
            const task = lt.core.hub.beginTask?.('Validating…', 'info') || { done() { }, error() { } };

            try {
                // Clear old highlights
                clearValidationHighlights();

                const res = await runValidation(TMUtils, settings);

                if (res?.ok) {
                    lt.core.hub.notify?.('✅ Lines valid', 'success', { ms: 1800 });
                    task.done?.('Valid');
                    if (settings.blockNextUntilValid) setNextDisabled(false);
                } else {
                    // Show summary
                    const issues = Array.isArray(res?.issues) ? res.issues : [];
                    const count = issues.length;
                    const summary = buildIssuesSummary(issues);

                    lt.core.hub.notify?.(
                        `❌ ${count} validation ${count === 1 ? 'issue' : 'issues'}`,
                        'error',
                        { ms: 6500 }
                    );
                    lt.core.hub.setStatus?.(
                        `❌ ${count} issue${count === 1 ? '' : 's'} — ${summary}`,
                        'error',
                        { sticky: true }
                    );

                    // 🔴 Apply highlights now (don’t wait for keepAlive)
                    if (settings.highlightFailures !== false) {
                        ensureValidationStyles();
                        highlightIssues(issues);
                        scrollToFirstIssue(issues);
                    }
                    if (settings.blockNextUntilValid) setNextDisabled(true);

                }

                // cache last status for SPA redraws
                TMUtils.state = TMUtils.state || {};
                TMUtils.state.lastValidation = res;

                // Keep "Next" button state + highlights sticky for a few SPA ticks if enabled
                let ticks = 0;
                const keepAlive = setInterval(() => {
                    const last = TMUtils?.state?.lastValidation;

                    // re-apply highlights if grid re-rendered
                    if (settings.highlightFailures !== false && last?.issues?.length) {
                        highlightIssues(last.issues);
                    }

                    // persist Next disabled when configured
                    if (settings.blockNextUntilValid) {
                        const shouldBlock = !!(last && last.ok === false);
                        syncNextButtonDisabled(shouldBlock);
                    }

                    if (++ticks >= 8) clearInterval(keepAlive); // ~6s
                }, 750);
            } catch (err) {
                lt.core.hub.notify?.(`Validation error: ${err?.message || err}`, 'error', { ms: 6000 });
                task.error?.('Error');
            }
        }
    });

    // Grab back the real DOM button to update title later
    btnEl = hub._shadow?.querySelector?.(`[data-id="${HUB_BTN_ID}"]`);

    const offSettings = onSettingsChange?.(() => refreshLabel(btnEl));
    refreshLabel(btnEl);

    return () => {
        offSettings?.();
        hub?.remove?.(HUB_BTN_ID);
    };
}

function syncNextButtonDisabled(disabled) {
    const next = document.querySelector('#NextWizardPage');
    if (next) next.disabled = !!disabled;
}

function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    //if (s.requireResolvedPart) parts.push('Part');
    //if (s.forbidZeroPrice) parts.push('≠$0');
    //if (s.minUnitPrice != null) parts.push(`≥${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`≤${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(', ') || 'none'}`;
}

// --- KO + grid helpers ---
const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

/** Tag visible grid rows with data-quote-part-key by reading KO context */
function ensureRowKeyAttributes() {
    const grid = document.querySelector('.plex-grid');
    if (!grid) return 0;
    const rows = grid.querySelectorAll(
        'tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row'
    );
    let tagged = 0;
    for (const r of rows) {
        if (r.hasAttribute('data-quote-part-key')) { tagged++; continue; }
        try {
            const ctx = KO?.contextFor?.(r);
            const vm = ctx?.$data ?? ctx?.$root ?? null;
            const qpk = TMUtils.getObsValue?.(vm, 'QuotePartKey');
            if (qpk != null && qpk !== '' && Number(qpk) > 0) {
                r.setAttribute('data-quote-part-key', String(qpk));
                tagged++;
            }
        } catch { /* ignore per-row failures */ }
    }
    return tagged;
}

function clearValidationHighlights() {
    document.querySelectorAll('.qtv-row-fail').forEach(el => {
        el.classList.remove('qtv-row-fail');
        el.classList.remove('qtv-row-fail--price-maxunit');
    });
}

function findGridRowByQuotePartKey(qpk) {
    const grid = document.querySelector('.plex-grid');
    if (!grid) return null;

    // Fast path: attribute (preferred)
    let row = grid.querySelector(`[data-quote-part-key="${CSS.escape(String(qpk))}"]`);
    if (row) return row.closest('tr, .k-grid-content tr, .plex-grid-row') || row;

    // If attributes are missing, try to tag them once then retry
    if (ensureRowKeyAttributes() > 0) {
        row = grid.querySelector(`[data-quote-part-key="${CSS.escape(String(qpk))}"]`);
        if (row) return row.closest('tr, .k-grid-content tr, .plex-grid-row') || row;
    }

    // Last resort: textual scan (less reliable, but works today)
    const rows = grid.querySelectorAll(
        'tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row'
    );
    for (const r of rows) {
        const txt = (r.textContent || '').trim();
        if (txt.includes(String(qpk))) return r;
    }
    return null;
}

/** Add highlight classes; special class for max unit price */
function highlightIssues(issues) {
    if (!Array.isArray(issues) || !issues.length) return;

    // Ensure rows are tagged to make selection fast & stable
    ensureRowKeyAttributes();

    for (const iss of issues) {
        const row = findGridRowByQuotePartKey(iss.quotePartKey);
        if (!row) continue;
        row.classList.add('qtv-row-fail');

        // rule-specific accent: price.maxUnitPrice
        const kind = String(iss.kind || '').toLowerCase();
        if (kind === 'price.maxunitprice') {
            row.classList.add('qtv-row-fail--price-maxunit');
        }
    }
}

function scrollToFirstIssue(issues) {
    const first = (issues || [])[0];
    if (!first) return;
    const row = findGridRowByQuotePartKey(first.quotePartKey);
    if (row && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}


function buildIssuesSummary(issues, { maxGroups = 4, maxQpks = 5 } = {}) {
    const grouped = (issues || []).reduce((m, it) => {
        const k = it.kind || 'other';
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(it.quotePartKey);
        return m;
    }, new Map());

    const parts = [];
    let gIndex = 0;
    for (const [kind, qpks] of grouped) {
        if (gIndex++ >= maxGroups) { parts.push('…'); break; }
        const list = [...new Set(qpks)].slice(0, maxQpks).join(', ');
        parts.push(`${kind}: QPK ${list}${qpks.length > maxQpks ? ', …' : ''}`);
    }
    return parts.join(' • ') || 'See details';
}

const DEV = (typeof __BUILD_DEV__ !== 'undefined') ? __BUILD_DEV__ : true;
if (DEV) {
    (unsafeWindow || window).QTV_DEBUG = (unsafeWindow || window).QTV_DEBUG || {};
    (unsafeWindow || window).QTV_DEBUG.tagStats = () => {
        const grid = document.querySelector('.plex-grid');
        const rows = grid ? grid.querySelectorAll('tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row') : [];
        const tagged = grid ? grid.querySelectorAll('[data-quote-part-key]') : [];
        console.log('[QTV] rows:', rows.length, 'tagged:', tagged.length);
        return { total: rows.length, tagged: tagged.length };
    };
    (unsafeWindow || window).QTV_DEBUG.hiliTest = (qpk) => {
        ensureValidationStyles();
        const r = findGridRowByQuotePartKey(qpk);
        if (r) { r.classList.add('qtv-row-fail', 'qtv-row-fail--price-maxunit'); r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return !!r;
    };
}
