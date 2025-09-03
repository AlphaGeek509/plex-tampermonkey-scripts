// src/quote-tracking/validation/index.js
/* global GM_getValue, GM_setValue, GM_registerMenuCommand, TMUtils, unsafeWindow */
export const KEYS = {
    enabled: 'qtv.enabled',
    requireResolvedPart: 'qtv.requireResolvedPart',
    forbidZeroPrice: 'qtv.forbidZeroPrice',
    minUnitPrice: 'qtv.minUnitPrice',
    maxUnitPrice: 'qtv.maxUnitPrice',
    blockNextUntilValid: 'qtv.blockNextUntilValid',
    highlightFailures: 'qtv.highlightFailures'
};
const DEF = {
    [KEYS.enabled]: true,
    [KEYS.requireResolvedPart]: true,
    [KEYS.forbidZeroPrice]: true,
    [KEYS.minUnitPrice]: null,
    [KEYS.maxUnitPrice]: 10,
    [KEYS.blockNextUntilValid]: true,
    [KEYS.highlightFailures]: true
};
const getVal = k => {
    const v = GM_getValue(k, DEF[k]);
    return (v === undefined ? DEF[k] : v);
};
const setVal = (k, v) => { GM_setValue(k, v); emitChanged(); };

export function getSettings() {
    return {
        enabled: getVal(KEYS.enabled),
        requireResolvedPart: getVal(KEYS.requireResolvedPart),
        forbidZeroPrice: getVal(KEYS.forbidZeroPrice),
        minUnitPrice: getVal(KEYS.minUnitPrice),
        maxUnitPrice: getVal(KEYS.maxUnitPrice),
        blockNextUntilValid: getVal(KEYS.blockNextUntilValid),
        highlightFailures: getVal(KEYS.highlightFailures)
    };
}
export function onSettingsChange(fn) {
    if (typeof fn !== 'function') return () => { };
    const h = () => fn(getSettings());
    window.addEventListener('LT:QTV:SettingsChanged', h);
    return () => window.removeEventListener('LT:QTV:SettingsChanged', h);
}
function emitChanged() {
    try { window.dispatchEvent(new CustomEvent('LT:QTV:SettingsChanged', { detail: getSettings() })); } catch { }
}

// ---------- UI (gear + panel) ----------
const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
function isWizard() {
        if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES);
        return ROUTES.some(re => re.test(location.pathname));
    }
GM_registerMenuCommand?.('⚙️ Open QT Validation Settings', showPanel);
ensureGearVisibility();
TMUtils?.onUrlChange?.(ensureGearVisibility);
if (!TMUtils?.onUrlChange) { const iid = setInterval(ensureGearVisibility, 500); setTimeout(() => clearInterval(iid), 6000); }

function ensureGearVisibility() {
    const btn = document.getElementById('lt-qtv-gear');
    if (isWizard()) { if (!btn) injectGearButton(); else btn.style.display = ''; }
    else if (btn) { btn.style.display = 'none'; }
}
function injectGearButton() {
    if (document.getElementById('lt-qtv-gear')) return;
    const btn = document.createElement('button');
    btn.id = 'lt-qtv-gear';
    btn.textContent = '⚙️';
    Object.assign(btn.style, {
        position: 'fixed', bottom: '20px', left: '20px',
        zIndex: 100001, padding: '8px 10px', borderRadius: '50%',
        fontSize: '18px', cursor: 'pointer', border: '1px solid #bbb',
        background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.18)'
    });
    btn.title = 'QT Validation Settings';
    btn.addEventListener('click', showPanel);
    document.body.appendChild(btn);
}
function showPanel() {
    const overlay = document.createElement('div');
    overlay.id = 'lt-qtv-overlay';
    Object.assign(overlay.style, { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 100002 });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#fff', padding: '18px', borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,.30)', fontFamily: 'system-ui, Segoe UI, sans-serif',
        width: '420px', maxWidth: '92vw'
    });
    panel.innerHTML = `
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard → Part Summary page.</div>
    <label style="display:block; margin:10px 0;"><input type="checkbox" id="qtv-enabled"> Enable validations</label>
    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-requireResolved"> Require resolved part (PartStatus ≠ "Quote")</label>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-forbidZero"> Forbid Unit Price = 0</label>
    <div style="display:flex; gap:10px; margin:8px 0;">
      <label style="flex:1;">Min Unit Price
        <input type="number" step="0.01" id="qtv-min" placeholder="(none)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <label style="flex:1;">Max Unit Price
        <input type="number" step="0.01" id="qtv-max" placeholder="(none)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
    </div>
    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-blockNext"> Block “Next >” until validated</label>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-highlight"> Highlight failing rows (when gating is on)</label>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
      <div><button id="qtv-reset" class="btn">Reset Defaults</button></div>
      <div style="display:flex; gap:8px;">
        <button id="qtv-export" class="btn">Export</button>
        <button id="qtv-import" class="btn">Import</button>
        <button id="qtv-close"  class="btn btn-primary">Close</button>
      </div>
    </div>`;
    panel.querySelectorAll('.btn').forEach(b => Object.assign(b.style, {
        padding: '6px 10px', borderRadius: '6px', border: '1px solid #bbb', background: '#f7f7f7', cursor: 'pointer'
    }));
    Object.assign(panel.querySelector('#qtv-close').style, { background: '#2563eb', color: '#fff', borderColor: '#1d4ed8' });
    overlay.appendChild(panel); document.body.appendChild(overlay);

    panel.querySelector('#qtv-enabled').checked = getVal(KEYS.enabled);
    panel.querySelector('#qtv-requireResolved').checked = getVal(KEYS.requireResolvedPart);
    panel.querySelector('#qtv-forbidZero').checked = getVal(KEYS.forbidZeroPrice);
    setNumberOrBlank(panel.querySelector('#qtv-min'), getVal(KEYS.minUnitPrice));
    setNumberOrBlank(panel.querySelector('#qtv-max'), getVal(KEYS.maxUnitPrice));
    panel.querySelector('#qtv-blockNext').checked = getVal(KEYS.blockNextUntilValid);
    panel.querySelector('#qtv-highlight').checked = getVal(KEYS.highlightFailures);

    panel.querySelector('#qtv-enabled').addEventListener('change', e => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector('#qtv-requireResolved').addEventListener('change', e => setVal(KEYS.requireResolvedPart, !!e.target.checked));
    panel.querySelector('#qtv-forbidZero').addEventListener('change', e => setVal(KEYS.forbidZeroPrice, !!e.target.checked));
    panel.querySelector('#qtv-blockNext').addEventListener('change', e => setVal(KEYS.blockNextUntilValid, !!e.target.checked));
    panel.querySelector('#qtv-highlight').addEventListener('change', e => setVal(KEYS.highlightFailures, !!e.target.checked));

    panel.querySelector('#qtv-min').addEventListener('change', e => {
        const v = parseNumberOrNull(e.target.value); setVal(KEYS.minUnitPrice, v); setNumberOrBlank(e.target, v);
    });
    panel.querySelector('#qtv-max').addEventListener('change', e => {
        const v = parseNumberOrNull(e.target.value); setVal(KEYS.maxUnitPrice, v); setNumberOrBlank(e.target, v);
    });

    panel.querySelector('#qtv-close').addEventListener('click', () => overlay.remove());
    panel.querySelector('#qtv-reset').addEventListener('click', () => {
        Object.keys(DEF).forEach(k => GM_setValue(k, DEF[k])); emitChanged(); overlay.remove();
        TMUtils.toast?.('Validation settings reset.', 'info', 1800);
    });
    panel.querySelector('#qtv-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(getSettings(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'qt-validation-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    panel.querySelector('#qtv-import').addEventListener('click', async () => {
        try {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
            input.onchange = async () => {
                const f = input.files?.[0]; if (!f) return;
                const data = JSON.parse(await f.text());
                if (data && typeof data === 'object') {
                    if ('enabled' in data) setVal(KEYS.enabled, !!data.enabled);
                    if ('requireResolvedPart' in data) setVal(KEYS.requireResolvedPart, !!data.requireResolvedPart);
                    if ('forbidZeroPrice' in data) setVal(KEYS.forbidZeroPrice, !!data.forbidZeroPrice);
                    if ('minUnitPrice' in data) setVal(KEYS.minUnitPrice, toNullOrNumber(data.minUnitPrice));
                    if ('maxUnitPrice' in data) setVal(KEYS.maxUnitPrice, toNullOrNumber(data.maxUnitPrice));
                    if ('blockNextUntilValid' in data) setVal(KEYS.blockNextUntilValid, !!data.blockNextUntilValid);
                    if ('highlightFailures' in data) setVal(KEYS.highlightFailures, !!data.highlightFailures);
                    overlay.remove(); TMUtils.toast?.('Validation settings imported.', 'success', 1800);
                } else throw new Error('Invalid JSON.');
            };
            input.click();
        } catch (err) { TMUtils.toast?.(`Import failed: ${err?.message || err}`, 'error', 3000); }
    });
}
function parseNumberOrNull(s) { const v = Number(String(s).trim()); return Number.isFinite(v) ? v : null; }
function toNullOrNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function setNumberOrBlank(input, val) { input.value = (val == null ? '' : String(val)); }
