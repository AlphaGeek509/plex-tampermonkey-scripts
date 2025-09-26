// Adds a “Validate Lines” button and wires it to the engine.
// Assumes your settings UI exports getSettings/onSettingsChange.

import { runValidation } from './engine';
import { getSettings, onSettingsChange } from './index';

// --- KO surface (qt30 pattern) ---
const KO = (typeof unsafeWindow !== 'undefined' && unsafeWindow.ko) ? unsafeWindow.ko : window.ko;

// --- summarize issues for status pill / toasts ---
function buildIssuesSummary(issues) {
    try {
        const items = Array.isArray(issues) ? issues : [];
        const agg = items.reduce((acc, it) => {
            const lvl = String(it?.level || 'info').toLowerCase();
            acc[lvl] = (acc[lvl] || 0) + 1;
            if (it?.quotePartKey != null) acc.parts.add(it.quotePartKey);
            return acc;
        }, { error: 0, warning: 0, info: 0, parts: new Set() });

        const partsCount = agg.parts.size;
        const segs = [];
        if (agg.error) segs.push(`${agg.error} error${agg.error === 1 ? '' : 's'}`);
        if (agg.warning) segs.push(`${agg.warning} warning${agg.warning === 1 ? '' : 's'}`);
        if (agg.info) segs.push(`${agg.info} info`);
        const levelPart = segs.join(', ') || 'updates';

        return `${levelPart} across ${partsCount || 0} part${partsCount === 1 ? '' : 's'}`;
    } catch {
        return '';
    }
}

// --- QT30-style grid refresh (copied) ---
async function refreshQuoteGrid() {
    try {
        const gridEl = document.querySelector('.plex-grid');
        const gridVM = gridEl && KO?.dataFor?.(gridEl);

        if (typeof gridVM?.datasource?.read === 'function') {
            await gridVM.datasource.read();   // async re-query/rebind
            return 'ds.read';
        }
        if (typeof gridVM?.refresh === 'function') {
            gridVM.refresh();                  // sync visual refresh
            return 'vm.refresh';
        }
    } catch { /* swallow */ }

    // Fallback: wizard navigate to the active page (rebind)
    try {
        const wiz = unsafeWindow?.plex?.currentPage?.QuoteWizard;
        if (wiz?.navigatePage) {
            const active = (typeof wiz.activePage === 'function') ? wiz.activePage() : wiz.activePage;
            wiz.navigatePage(active);
            return 'wiz.navigatePage';
        }
    } catch { /* swallow */ }

    return null;
}



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

function showValidationModal(issues = []) {
    ensureValidationStyles();

    // elements
    const overlay = document.createElement('div');
    overlay.id = 'qtv-modal-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: 0,
        background: 'var(--lt-overlay, rgba(0,0,0,.36))',
        zIndex: 100002
    });

    const modal = document.createElement('div');
    modal.id = 'qtv-modal';
    modal.className = 'lt-card';
    Object.assign(modal.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(900px, 92vw)'
    });

    // build rows (Plex-like: sort + suppress repeating Sort/Part/Rule display)
    const sorted = [...issues].sort((a, b) => {
        const soA = (a.sortOrder ?? Number.POSITIVE_INFINITY);
        const soB = (b.sortOrder ?? Number.POSITIVE_INFINITY);
        if (soA !== soB) return soA - soB;
        const pnA = String(a.partNo ?? '');
        const pnB = String(b.partNo ?? '');
        if (pnA !== pnB) return pnA.localeCompare(pnB);
        const rlA = String(a.ruleLabel ?? a.kind ?? '');
        const rlB = String(b.ruleLabel ?? b.kind ?? '');
        return rlA.localeCompare(rlB);
    });

    let prevSort = null, prevPart = null, prevRule = null;
    const rowsHtml = sorted.map(iss => {
        const lvl = (iss.level || '').toLowerCase();
        const lvlClass = (lvl === 'error') ? 'qtv-pill--error' : (lvl === 'warn' || lvl === 'warning') ? 'qtv-pill--warn' : 'qtv-pill--info';
        const lvlPill = `<span class="qtv-pill ${lvlClass}">${lvl || 'info'}</span>`;
        const reason = iss.message || '(no message)';
        const rule = String(iss.ruleLabel || iss.kind || 'Validation');

        // Suppress repeats in visual table cells
        const showSort = (iss.sortOrder !== prevSort) ? (iss.sortOrder ?? '') : '';
        const showPart = (showSort !== '' || (iss.partNo !== prevPart)) ? (iss.partNo ?? '') : '';
        const sameGroupAsPrev = (showSort === '' && showPart === '');
        const showRule = (!sameGroupAsPrev || rule !== prevRule) ? rule : '';

        prevSort = iss.sortOrder;
        prevPart = iss.partNo;
        prevRule = rule;

        return `
  <tr data-qpk="${iss.quotePartKey ?? ''}" data-rule="${String(iss.kind || '')}">
    <td>${showSort}</td>
    <td>${showPart}</td>
    <td>${showRule}</td>
    <td>${lvlPill}</td>
    <td>${reason}</td>
  </tr>`;
    }).join('');


    modal.innerHTML = `
  <div class="qtv-hd lt-card__header">
    <h3 class="lt-card__title">Validation Details</h3>
    <div class="qtv-actions lt-card__spacer">
      <button class="lt-btn lt-btn--ghost" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="lt-btn lt-btn--primary" id="qtv-close">Close</button>
    </div>
  </div>
  <div class="qtv-bd lt-card__body">
    <table class="lt-table" aria-label="Validation Issues">
      <thead>
        <tr>
          <th>Sort&nbsp;Order</th>
          <th>Part #</th>
          <th>Rule</th>
          <th>Level</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || `<tr><td colspan="5" style="opacity:.7; padding:12px;">No issues.</td></tr>`}</tbody>
    </table>
  </div>
`;


    // interactions
    modal.querySelector('#qtv-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // click row to focus + highlight + scroll
    modal.querySelector('tbody')?.addEventListener('click', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const qpk = tr.getAttribute('data-qpk');
        if (!qpk) return;
        // ensure highlights exist, then jump
        ensureValidationStyles();
        const row = findGridRowByQuotePartKey(qpk);
        if (row) {
            document.querySelectorAll('.qtv-row-fail').forEach(el => el.classList.remove('qtv-row-fail'));
            row.classList.add('qtv-row-fail');
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    });

    // export CSV
    modal.querySelector('#qtv-export-csv')?.addEventListener('click', () => {
        const csv = [
            ['Line', 'SortOrder', 'PartNo', 'QuotePartKey', 'Rule', 'Level', 'Reason'].join(','),
            ...issues.map(i => {
                const esc = (v) => {
                    const s = String(v ?? '');
                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                };
                return [
                    i.lineNumber ?? '',
                    i.sortOrder ?? '',
                    i.partNo ?? '',
                    i.quotePartKey ?? '',
                    i.ruleLabel || i.kind || 'Validation',
                    i.level || '',
                    i.message || ''
                ].map(esc).join(',');
            })
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'qt-validation-issues.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    overlay.appendChild(modal);
    (document.body || document.documentElement).appendChild(overlay);
    try { overlay.setAttribute('tabindex', '-1'); overlay.focus(); } catch { }
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });

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
                // Clear old highlights and ensure styles are present up-front
                clearValidationHighlights();
                ensureValidationStyles();

                const res = await runValidation(TMUtils, settings);
                const issues = Array.isArray(res?.issues) ? res.issues : [];
                const count = issues.length;

                // Auto-highlight all error rows immediately (before modal)
                try {
                    for (const iss of issues) {
                        const qpk = iss?.quotePartKey;
                        if (!qpk) continue;
                        const row = findGridRowByQuotePartKey(qpk);
                        if (!row) continue;
                        const base = 'qtv-row-fail';
                        const cls = classForIssue(iss);
                        row.classList.add(base);
                        if (cls) row.classList.add(cls);
                    }
                } catch { /* non-fatal */ }

                if (count === 0) {
                    lt.core.hub.notify?.('✅ Lines valid', 'success', { ms: 1800 });
                    lt.core.hub.setStatus?.('✅ All clear', 'success', { sticky: false });
                    setBadgeCount?.(0);
                    task.done?.('Valid');
                } else {
                    // Tally outcomes (handles missing level gracefully)
                    const levels = issues.map(i => String(i?.level || '').toLowerCase());
                    const hasError = levels.some(l => l === 'error' || l === 'fail' || l === 'critical')
                        || issues.some(i => /price\.(?:maxunitprice|minunitprice)/i.test(String(i?.kind || '')));
                    const hasWarn = !hasError && levels.some(l => l === 'warn' || l === 'warning');

                    const summary = buildIssuesSummary(issues);

                    // Guard to ensure UI problems never block the modal
                    try {
                        if (hasError) {
                            lt.core.hub.notify?.(`\u274C ${count} validation ${count === 1 ? 'issue' : 'issues'}`, 'error', { ms: 6500 });
                            lt.core.hub.setStatus?.(`\u274C ${count} issue${count === 1 ? '' : 's'} — ${summary}`, 'error', { sticky: true });
                            setBadgeCount?.(count);
                        } else if (hasWarn) {
                            lt.core.hub.notify?.(`\u26A0\uFE0F ${count} validation ${count === 1 ? 'warning' : 'warnings'}`, 'warn', { ms: 5000 });
                            lt.core.hub.setStatus?.(`\u26A0\uFE0F ${count} warning${count === 1 ? '' : 's'} — ${summary}`, 'warn', { sticky: true });
                            setBadgeCount?.(count);
                        } else {
                            // Info-only updates (e.g., auto-manage posts with level=info)
                            lt.core.hub.notify?.(`ℹ️ ${count} update${count === 1 ? '' : 's'} applied`, 'info', { ms: 3500 });
                            lt.core.hub.setStatus?.(`ℹ️ ${count} update${count === 1 ? '' : 's'} — ${summary}`, 'info', { sticky: true });
                            setBadgeCount?.(count);
                        }
                    } catch { /* never block the modal */ }

                    // Always show the details when count > 0
                    showValidationModal(issues);

                    // If autoManage actually changed Part_No (level=warning), refresh the grid (qt30 pattern)
                    const needsRefresh = issues.some(i =>
                        String(i?.kind || '').includes('autoManageLtPartNoOnQuote') &&
                        String(i?.level || '').toLowerCase() === 'warning' &&
                        i?.meta?.changed === true
                    );

                    if (needsRefresh) {
                        try {
                            const mode = await refreshQuoteGrid();
                            lt.core?.hub?.notify?.(
                                mode ? `Grid refreshed (${mode})` : 'Grid refresh attempted (reload may be needed)',
                                mode ? 'success' : 'info',
                                { ms: 2500 }
                            );
                        } catch {
                            lt.core?.hub?.notify?.('Grid refresh failed', 'warn', { ms: 3000 });
                        }
                    }

                    task.done?.('Checked');
                }

                // cache last status for SPA redraws
                TMUtils.state = TMUtils.state || {};
                TMUtils.state.lastValidation = res;

            } catch (err) {
                lt.core.hub.error?.(`Validation error: ${err?.message || err}`, 'error', { ms: 6000 });
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

function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    //if (s.requireResolvedPart) parts.push('Part');
    //if (s.forbidZeroPrice) parts.push('≠$0');
    if (s.minUnitPrice != null) parts.push(`≥${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`≤${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(', ') || 'none'}`;
}

function ensureValidationStyles() {
    // If the global theme provides .qtv-* styles, do nothing.
    const hasThemeQtv = (() => {
        try {
            const test = document.createElement('div');
            test.className = 'qtv-pill';
            document.body.appendChild(test);
            const cs = getComputedStyle(test);
            const ok = !!cs && (cs.borderRadius || '').includes('999px');
            test.remove();
            return ok;
        } catch { return false; }
    })();

    if (hasThemeQtv) return;

    // Fallback shim (kept tiny): highlight only; modal/table styles will still be set inline.
    if (document.getElementById('qtv-styles')) return;
    const style = document.createElement('style');
    style.id = 'qtv-styles';
    style.textContent = `
/* Minimal scaffolding when theme.css isn't ready */
#qtv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.36); z-index: 100002; }
#qtv-modal {
  /* Local Monroe palette (independent of page tokens) */
  --brand-600: #8b0b04;
  --brand-700: #5c0a0a;
  --ok: #28a745;
  --warn: #ffc107;
  --err: #dc3545;

  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(900px,92vw);
}

.lt-card { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.30); overflow: hidden; }
.lt-card__header { display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,.08); }
.lt-card__title { margin: 0; font: 600 16px/1.2 system-ui, Segoe UI, sans-serif; }
.lt-card__spacer { margin-left: auto; }
.lt-card__body { padding: 12px 16px; max-height: min(70vh,680px); overflow: auto; }

.lt-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; cursor:pointer; }
.lt-btn--primary { background: var(--brand-600); border-color: color-mix(in srgb, var(--brand-600) 70%, black); color:#fff; }
.lt-btn--primary:hover { background: var(--brand-700); }
.lt-btn--ghost { background:transparent; color: var(--brand-600); border-color: var(--brand-600); }
.lt-btn--ghost:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }

.lt-table { width:100%; border-collapse: separate; border-spacing: 0; font: 400 13px/1.35 system-ui, Segoe UI, sans-serif; }
.lt-table th { text-align:left; padding:8px 10px; background:#f3f4f6; border-bottom:1px solid #e5e7eb; position:sticky; top:0; }
.lt-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
.lt-table tbody tr:hover { background:#f8fafc; }

.qtv-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-weight:600; font-size:12px; border:1px solid transparent; }
.qtv-pill--error { background:#dc2626; color:#fff; }
.qtv-pill--warn  { background:#f59e0b; color:#111; }
.qtv-pill--info  { background:#3b82f6; color:#fff; }

/* Row highlights */
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }
`;

    document.head.appendChild(style);

}


// insert above ensureRowKeyAttributes()
function getObsVal(vm, prop) {
    try { const v = vm?.[prop]; return (typeof v === 'function') ? v() : v; } catch { return undefined; }
}

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
            const rowVM = ctx?.$data ?? ctx?.$root ?? null;
            const qpk = (typeof TMUtils?.getObsValue === 'function')
                ? TMUtils.getObsValue(rowVM, 'QuotePartKey')
                : getObsVal(rowVM, 'QuotePartKey');

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
        el.classList.remove('qtv-row-fail--price-minunit');
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

function classForIssue(iss) {
    const kind = String(iss?.kind || '').toLowerCase();
    if (kind.includes('price.maxunitprice')) return 'qtv-row-fail--price-maxunit';
    if (kind.includes('price.minunitprice')) return 'qtv-row-fail--price-minunit';
    return '';
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
