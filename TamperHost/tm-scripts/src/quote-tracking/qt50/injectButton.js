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

    // build rows
    const rowsHtml = issues.map(iss => {
        const lvl = (iss.level || '').toLowerCase();
        const lvlPill = `<span class="qtv-pill" style="border-color:${lvl === 'error' ? '#fca5a5' : '#cbd5e1'}; color:${lvl === 'error' ? '#b91c1c' : '#334155'}">${lvl || 'info'}</span>`;
        const reason = iss.message || '(no message)';
        const rule = iss.ruleLabel || iss.kind || 'Validation';

        return `
        <tr data-qpk="${iss.quotePartKey ?? ''}" data-rule="${String(iss.kind || '')}">
          <td>${iss.sortOrder ?? ''}</td>
          <td>${iss.partNo ?? ''}</td>
          <td>${rule}</td>
          <td>${lvlPill}</td>
          <td>${reason}</td>
        </tr>`
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'qtv-modal-overlay';
    const modal = document.createElement('div');
    modal.id = 'qtv-modal';
    modal.innerHTML = `
  <div class="qtv-hd">
    <h3>Validation Details</h3>
    <div class="qtv-actions">
      <button class="btn btn-default" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="btn btn-primary" id="qtv-close" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
    </div>
  </div>
  <div class="qtv-bd">
    <table aria-label="Validation Issues">
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
                const issues = Array.isArray(res?.issues) ? res.issues : [];
                const count = issues.length;
                const hasError = issues.some(i => String(i.level || '').toLowerCase() === 'error');

                if (count === 0) {
                    lt.core.hub.notify?.('✅ Lines valid', 'success', { ms: 1800 });
                    task.done?.('Valid');
                } else {
                    const summary = buildIssuesSummary(issues);

                    if (hasError) {
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
                    } else {
                        // Info/warn only (e.g., auto-manage posts)
                        lt.core.hub.notify?.(
                            `ℹ️ ${count} update${count === 1 ? '' : 's'} applied`,
                            'info',
                            { ms: 3500 }
                        );
                        lt.core.hub.setStatus?.(
                            `ℹ️ ${count} update${count === 1 ? '' : 's'} — ${summary}`,
                            'info',
                            { sticky: true }
                        );
                    }

                    // Always show details when we have any issues (info/warn/error)
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
    if (document.getElementById('qtv-styles')) return;
    const style = document.createElement('style');
    style.id = 'qtv-styles';
    style.textContent = `
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }  /* red-ish */
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }  /* blue-ish */

/* Modal shell */
#qtv-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.38); z-index:100003; }
#qtv-modal {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  background:#fff; width:min(960px, 94vw); max-height:80vh; overflow:hidden;
  border-radius:12px; box-shadow:0 18px 40px rgba(0,0,0,.28);
  font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

/* Header */
#qtv-modal .qtv-hd {
  display:flex; align-items:center; gap:12px;
  padding:14px 16px; border-bottom:1px solid #eaeaea;
  background: linear-gradient(180deg, #fbfbfb 0%, #f7f7f7 100%);
}
#qtv-modal .qtv-hd h3 { margin:0; font-size:16px; font-weight:600; color:#0f172a; }
#qtv-modal .qtv-actions { margin-left:auto; display:flex; gap:8px; }
#qtv-modal .qtv-actions .btn { border-radius:8px; line-height:1.3; padding:6px 10px; }

/* Body */
#qtv-modal .qtv-bd { padding:10px 14px 14px; overflow:auto; max-height:calc(80vh - 56px); }

/* Table */
#qtv-modal table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
#qtv-modal thead th {
  position: sticky; top: 0; z-index: 1;
  background:#fff; border-bottom:1px solid #eaeaea; padding:8px 10px; text-align:left; color:#475569;
}
#qtv-modal tbody td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
#qtv-modal tbody tr:nth-child(odd) { background:#fcfdff; }
#qtv-modal tbody tr:hover { background:#f1f5f9; cursor:pointer; }
#qtv-modal td:nth-child(1) { width:100px; }           /* Sort Order */
#qtv-modal td:nth-child(2) { width:220px; }           /* Part #    */
#qtv-modal td:last-child { word-break: break-word; }  /* Reason    */

/* Pills */
#qtv-modal .qtv-pill { display:inline-block; padding:2px 8px; border:1px solid #e2e8f0; border-radius:999px; font-size:12px; }
`;


    document.head.appendChild(style);
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
