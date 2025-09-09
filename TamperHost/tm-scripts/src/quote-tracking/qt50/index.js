// src/quote-tracking/validation/index.js
// ---------- Bootstrap / route guard ----------
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

const CONFIG = {
    wizardTargetPage: 'Part Summary',
    settingsKey: 'qt50_settings_v1',
    toastMs: 3500
};

const KO = (typeof unsafeWindow !== 'undefined' && unsafeWindow.ko) ? unsafeWindow.ko : window.ko;
const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];

// Instead of `return` at top-level, compute a flag:
const ON_ROUTE = !!TMUtils.matchRoute?.(ROUTES);
if (DEV && !ON_ROUTE) console.debug('QT50: wrong route, skipping bootstrap');

/* global GM_getValue, GM_setValue, GM_registerMenuCommand, TMUtils, unsafeWindow */
export const KEYS = {
    enabled: 'qtv.enabled',
    autoManageLtPartNoOnQuote: 'qtv.autoManageLtPartNoOnQuote',
    minUnitPrice: 'qtv.minUnitPrice',
    maxUnitPrice: 'qtv.maxUnitPrice',
    blockNextUntilValid: 'qtv.blockNextUntilValid',
    highlightFailures: 'qtv.highlightFailures'
};
const DEF = {
    [KEYS.enabled]: true,
    [KEYS.autoManageLtPartNoOnQuote]: true,
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
        autoManageLtPartNoOnQuote: getVal(KEYS.autoManageLtPartNoOnQuote),
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
GM_registerMenuCommand?.('⚙️ Open QT Validation Settings', showPanel);

// Only set up the gear/observers when we're actually on the wizard route
if (ON_ROUTE) {
    ensureGearOnToolbar();
    TMUtils?.onUrlChange?.(ensureGearOnToolbar);
    if (!TMUtils?.onUrlChange) {
        const iid = setInterval(ensureGearOnToolbar, 500);
        setTimeout(() => clearInterval(iid), 6000);
    }
}

function ensureGearOnToolbar() {
    // Only on the Quote Wizard route
    if (!TMUtils.matchRoute?.(ROUTES)) {
        document.querySelectorAll('#lt-qtv-gear-host').forEach(li => (li.style.display = 'none'));
        return;
    }

    // Inject into every visible action bar (wizard renders one per page)
    const bars = document.querySelectorAll('#QuoteWizardSharedActionBar');
    if (!bars.length) return;

    bars.forEach(bar => injectGearIntoActionBar(bar));
}

function injectGearIntoActionBar(ul) {
    try {
        if (!ul) return;
        // Avoid duplicate injection
        if (ul.querySelector('#lt-qtv-gear-host')) {
            // Ensure visibility is accurate for the current page
            const li = ul.querySelector('#lt-qtv-gear-host');
            showOnlyOnPartSummary(li, CONFIG.wizardTargetPage);
            return;
        }

        const li = document.createElement('li');
        li.id = 'lt-qtv-gear-host';
        li.style.display = 'none'; // hidden unless on the target wizard page

        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.textContent = 'LT Validation Settings';
        a.title = 'Open Quote Validation settings';
        a.setAttribute('aria-label', 'Quote Validation settings');
        a.setAttribute('role', 'button');
        a.style.cursor = 'pointer';
        a.addEventListener('click', showPanel);

        li.appendChild(a);
        ul.appendChild(li);

        // Show/hide based on active wizard page name
        showOnlyOnPartSummary(li, CONFIG.wizardTargetPage);
    } catch (e) {
        if (DEV) console.warn('QT50: injectGearIntoActionBar error', e);
    }
}

function showOnlyOnPartSummary(li, targetName) {
    const getActiveWizardPageName = () => {
        // Prefer KO VM name on the active page
        const activePage = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        const vm = activePage ? KO?.dataFor?.(activePage) : null;
        let name = vm ? (KO?.unwrap?.(vm.name) ?? (typeof vm.name === 'function' ? vm.name() : vm.name)) : '';
        if (name && typeof name === 'string') return name.trim();

        // Fallback: text in the wizard nav
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
    };

    const update = () => {
        const onTarget = getActiveWizardPageName() === targetName;
        li.style.display = onTarget ? '' : 'none';
    };

    // Observe the wizard nav for page changes
    const nav = document.querySelector('.plex-wizard-page-list');
    if (nav && !li._qtvObserverAttached) {
        li._qtvObserverAttached = true;
        new MutationObserver(update).observe(nav, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    update();
}



function showPanel() {
    const overlay = document.createElement('div');
    overlay.id = 'lt-qtv-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 100002
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#fff', padding: '18px', borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,.30)', fontFamily: 'system-ui, Segoe UI, sans-serif',
        width: '420px', maxWidth: '92vw'
    });

    // Close on ESC (works when focus is anywhere inside overlay)
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });
    overlay.tabIndex = -1; // make overlay focusable

    // Click-outside-to-close
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Prevent inner clicks from bubbling to overlay (extra safety)
    panel.addEventListener('click', (e) => e.stopPropagation());

    panel.innerHTML = `
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard → Part Summary page.</div>

    <label style="display:block; margin:10px 0;">
      <input type="checkbox" id="qtv-enabled"> Enable validations
    </label>

    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

    <label title="If Part Status is Quote, the Lyn-Tron Part No is controlled automatically."
           style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-autoManageLtPartNoOnQuote">
      Auto-manage Lyn-Tron Part No when Part status is “Quote”.
    </label>

    <div style="display:flex; gap:10px; margin:8px 0;">
      <label style="flex:1;">Min Unit Price
        <input type="number" step="0.01" id="qtv-min" placeholder="(none)"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <label style="flex:1;">Max Unit Price
        <input type="number" step="0.01" id="qtv-max" placeholder="10.00"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
    </div>

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-blockNext"> Block Next until all validations pass
    </label>

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-highlight"> Highlight failures on the grid
    </label>

    <div style="border-top:1px solid #eee; margin:12px 0 10px;"></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button id="qtv-export" class="btn btn-default">Export</button>
      <label class="btn btn-default">Import <input id="qtv-import" type="file" accept="application/json" style="display:none;"></label>
      <span style="flex:1"></span>
      <button id="qtv-reset" class="btn btn-default" style="border-color:#f59e0b; color:#b45309;">Reset</button>
      <button id="qtv-close" class="btn btn-primary" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
    </div>
  `;

    // Initialize control states
    panel.querySelector('#qtv-enabled').checked = getVal(KEYS.enabled);
    panel.querySelector('#qtv-autoManageLtPartNoOnQuote').checked = getVal(KEYS.autoManageLtPartNoOnQuote);
    setNumberOrBlank(panel.querySelector('#qtv-min'), getVal(KEYS.minUnitPrice));
    setNumberOrBlank(panel.querySelector('#qtv-max'), getVal(KEYS.maxUnitPrice));
    panel.querySelector('#qtv-blockNext').checked = getVal(KEYS.blockNextUntilValid);
    panel.querySelector('#qtv-highlight').checked = getVal(KEYS.highlightFailures);

    // Change handlers
    panel.querySelector('#qtv-enabled')?.addEventListener('change', e => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector('#qtv-autoManageLtPartNoOnQuote')?.addEventListener('change', e => setVal(KEYS.autoManageLtPartNoOnQuote, !!e.target.checked));
    panel.querySelector('#qtv-blockNext')?.addEventListener('change', e => setVal(KEYS.blockNextUntilValid, !!e.target.checked));
    panel.querySelector('#qtv-highlight')?.addEventListener('change', e => setVal(KEYS.highlightFailures, !!e.target.checked));

    panel.querySelector('#qtv-min')?.addEventListener('change', e => {
        const v = parseNumberOrNull(e.target.value); setVal(KEYS.minUnitPrice, v); setNumberOrBlank(e.target, v);
    });
    panel.querySelector('#qtv-max')?.addEventListener('change', e => {
        const v = parseNumberOrNull(e.target.value); setVal(KEYS.maxUnitPrice, v); setNumberOrBlank(e.target, v);
    });

    // Buttons
    panel.querySelector('#qtv-close')?.addEventListener('click', () => overlay.remove());
    panel.querySelector('#qtv-reset')?.addEventListener('click', () => {
        Object.keys(DEF).forEach(k => GM_setValue(k, DEF[k]));
        emitChanged(); overlay.remove();
        TMUtils.toast?.('Validation settings reset.', 'info', 1800);
    });

    // Export
    panel.querySelector('#qtv-export')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(getSettings(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'qt-validation-settings.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // Import
    panel.querySelector('#qtv-import')?.addEventListener('change', async (ev) => {
        try {
            const f = ev.target.files?.[0]; if (!f) return;
            const data = JSON.parse(await f.text());
            if (data && typeof data === 'object') {
                if ('enabled' in data) setVal(KEYS.enabled, !!data.enabled);
                if ('autoManageLtPartNoOnQuote' in data) setVal(KEYS.autoManageLtPartNoOnQuote, !!data.autoManageLtPartNoOnQuote);
                if ('minUnitPrice' in data) setVal(KEYS.minUnitPrice, toNullOrNumber(data.minUnitPrice));
                if ('maxUnitPrice' in data) setVal(KEYS.maxUnitPrice, toNullOrNumber(data.maxUnitPrice));
                if ('blockNextUntilValid' in data) setVal(KEYS.blockNextUntilValid, !!data.blockNextUntilValid);
                if ('highlightFailures' in data) setVal(KEYS.highlightFailures, !!data.highlightFailures);
                overlay.remove(); TMUtils.toast?.('Validation settings imported.', 'success', 1800);
            } else throw new Error('Invalid JSON.');
        } catch (err) {
            TMUtils.toast?.(`Import failed: ${err?.message || err}`, 'error', 3000);
        }
    });

    overlay.appendChild(panel);
    (document.body || document.documentElement).appendChild(overlay);

    // Focus AFTER appending so ESC works immediately
    overlay.focus();
}


function parseNumberOrNull(s) { const v = Number(String(s).trim()); return Number.isFinite(v) ? v : null; }
function toNullOrNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function setNumberOrBlank(input, val) { input.value = (val == null ? '' : String(val)); }
