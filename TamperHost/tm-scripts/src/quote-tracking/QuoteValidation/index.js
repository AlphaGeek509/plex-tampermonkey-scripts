// tm-scripts/src/qt50/index.js
/* Build-time dev flag (esbuild sets __BUILD_DEV__), with a runtime fallback for tests */
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

(function () {
    'use strict';

    // ---------- Route guard: Quote Wizard only ----------
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils?.matchRoute?.(ROUTES)) return;

    // ---------- Storage keys + defaults ----------
    const K = {
        enabled: 'qtv.enabled',              // master switch
        requireResolvedPart: 'qtv.requireResolvedPart',  // PartStatus !== "Quote" on primary row
        forbidZeroPrice: 'qtv.forbidZeroPrice',      // UnitPrice !== 0 on any break
        minUnitPrice: 'qtv.minUnitPrice',         // null to disable
        maxUnitPrice: 'qtv.maxUnitPrice',         // null to disable
        blockNextUntilValid: 'qtv.blockNextUntilValid',  // future gate uses this
        highlightFailures: 'qtv.highlightFailures',    // future: emphasize bad rows
        notes: 'qtv.notes'                 // freeform text
    };

    const DEF = {
        [K.enabled]: true,
        [K.requireResolvedPart]: true,
        [K.forbidZeroPrice]: true,
        [K.minUnitPrice]: null,
        [K.maxUnitPrice]: 10,
        [K.blockNextUntilValid]: true,
        [K.highlightFailures]: true,
        [K.notes]: ''
    };

    function getVal(key) {
        const v = GM_getValue(key, DEF[key]);
        return (v === undefined ? DEF[key] : v);
    }
    function setVal(key, val) {
        GM_setValue(key, val);
        emitChanged();
    }

    // ---------- Public API for other QT scripts ----------
    const API = {
        getAll() {
            return {
                enabled: getVal(K.enabled),
                requireResolvedPart: getVal(K.requireResolvedPart),
                forbidZeroPrice: getVal(K.forbidZeroPrice),
                minUnitPrice: getVal(K.minUnitPrice),
                maxUnitPrice: getVal(K.maxUnitPrice),
                blockNextUntilValid: getVal(K.blockNextUntilValid),
                highlightFailures: getVal(K.highlightFailures),
                notes: getVal(K.notes)
            };
        },
        set(partial) {
            if (!partial || typeof partial !== 'object') return;
            Object.entries(partial).forEach(([k, v]) => {
                const key = Object.values(K).find(x => x.endsWith(k)) || k; // allow short names
                if (K[key] || Object.values(K).includes(key)) GM_setValue(key, v);
            });
            emitChanged();
        },
        onChange(fn) {
            if (typeof fn !== 'function') return () => { };
            const h = () => fn(API.getAll());
            window.addEventListener('LT:QTV:SettingsChanged', h);
            return () => window.removeEventListener('LT:QTV:SettingsChanged', h);
        },
        keys: K
    };
    // Expose for consumers:
    window.QTValidationConfig = API;
    TMUtils.validation = TMUtils.validation || {};
    TMUtils.validation.settings = API;

    function emitChanged() {
        try { window.dispatchEvent(new CustomEvent('LT:QTV:SettingsChanged', { detail: API.getAll() })); } catch { }
    }

    // ---------- Gear button ----------
    injectGearButton();
    GM_registerMenuCommand?.('⚙️ Open QT Validation Settings', showPanel);

    function injectGearButton() {
        if (document.getElementById('lt-qtv-gear')) return;
        const btn = document.createElement('button');
        btn.id = 'lt-qtv-gear';
        btn.textContent = '⚙️';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            zIndex: 100001, padding: '8px 10px', borderRadius: '50%',
            fontSize: '18px', cursor: 'pointer', border: '1px solid #bbb',
            background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.18)'
        });
        btn.title = 'QT Validation Settings';
        btn.addEventListener('click', showPanel);
        document.body.appendChild(btn);
    }

    // ---------- Panel UI ----------
    function showPanel() {
        const overlay = document.createElement('div');
        overlay.id = 'lt-qtv-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100002
        });

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: '#fff', padding: '18px', borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.30)', fontFamily: 'system-ui, Segoe UI, sans-serif',
            width: '420px', maxWidth: '92vw'
        });

        panel.innerHTML = `
      <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
      <div style="font-size:12px; opacity:.75; margin-bottom:10px;">
        Applies on the Quote Wizard → Part Summary page.
      </div>

      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="qtv-enabled"> Enable validations
      </label>

      <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

      <label style="display:block; margin:8px 0;">
        <input type="checkbox" id="qtv-requireResolved"> Require resolved part (PartStatus ≠ "Quote")
      </label>

      <label style="display:block; margin:8px 0;">
        <input type="checkbox" id="qtv-forbidZero"> Forbid Unit Price = 0
      </label>

      <div style="display:flex; gap:10px; margin:8px 0;">
        <label style="flex:1;">
          Min Unit Price
          <input type="number" step="0.01" id="qtv-min" placeholder="(none)"
                 style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
        </label>
        <label style="flex:1;">
          Max Unit Price
          <input type="number" step="0.01" id="qtv-max" placeholder="(none)"
                 style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
        </label>
      </div>

      <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

      <label style="display:block; margin:8px 0;">
        <input type="checkbox" id="qtv-blockNext"> Block “Next >” until validated
      </label>

      <label style="display:block; margin:8px 0;">
        <input type="checkbox" id="qtv-highlight"> Highlight failing rows (when gating is on)
      </label>

      <label style="display:block; margin:10px 0;">
        Notes (optional)
        <textarea id="qtv-notes" rows="3" placeholder="e.g., Customer-specific rules"
          style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px; resize:vertical;"></textarea>
      </label>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
        <div style="display:flex; gap:8px;">
          <button id="qtv-reset" class="btn">Reset Defaults</button>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="qtv-export" class="btn">Export</button>
          <button id="qtv-import" class="btn">Import</button>
          <button id="qtv-close"  class="btn btn-primary">Close</button>
        </div>
      </div>
    `;

        // style buttons lightly
        panel.querySelectorAll('.btn').forEach(b => {
            Object.assign(b.style, {
                padding: '6px 10px', borderRadius: '6px', border: '1px solid #bbb',
                background: '#f7f7f7', cursor: 'pointer'
            });
        });
        const btnPrimary = panel.querySelector('#qtv-close');
        Object.assign(btnPrimary.style, { background: '#2563eb', color: '#fff', borderColor: '#1d4ed8' });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // seed values
        panel.querySelector('#qtv-enabled').checked = getVal(K.enabled);
        panel.querySelector('#qtv-requireResolved').checked = getVal(K.requireResolvedPart);
        panel.querySelector('#qtv-forbidZero').checked = getVal(K.forbidZeroPrice);
        setNumberOrBlank(panel.querySelector('#qtv-min'), getVal(K.minUnitPrice));
        setNumberOrBlank(panel.querySelector('#qtv-max'), getVal(K.maxUnitPrice));
        panel.querySelector('#qtv-blockNext').checked = getVal(K.blockNextUntilValid);
        panel.querySelector('#qtv-highlight').checked = getVal(K.highlightFailures);
        panel.querySelector('#qtv-notes').value = getVal(K.notes) || '';

        // wire inputs
        panel.querySelector('#qtv-enabled').addEventListener('change', e => setVal(K.enabled, !!e.target.checked));
        panel.querySelector('#qtv-requireResolved').addEventListener('change', e => setVal(K.requireResolvedPart, !!e.target.checked));
        panel.querySelector('#qtv-forbidZero').addEventListener('change', e => setVal(K.forbidZeroPrice, !!e.target.checked));
        panel.querySelector('#qtv-blockNext').addEventListener('change', e => setVal(K.blockNextUntilValid, !!e.target.checked));
        panel.querySelector('#qtv-highlight').addEventListener('change', e => setVal(K.highlightFailures, !!e.target.checked));

        panel.querySelector('#qtv-min').addEventListener('change', e => {
            const v = parseNumberOrNull(e.target.value);
            setVal(K.minUnitPrice, v);
            setNumberOrBlank(e.target, v);
        });
        panel.querySelector('#qtv-max').addEventListener('change', e => {
            const v = parseNumberOrNull(e.target.value);
            setVal(K.maxUnitPrice, v);
            setNumberOrBlank(e.target, v);
        });
        panel.querySelector('#qtv-notes').addEventListener('change', e => setVal(K.notes, String(e.target.value || '').trim()));

        panel.querySelector('#qtv-close').addEventListener('click', () => overlay.remove());

        panel.querySelector('#qtv-reset').addEventListener('click', () => {
            Object.keys(DEF).forEach(k => GM_setValue(k, DEF[k]));
            emitChanged();
            overlay.remove();
            TMUtils.toast?.('Validation settings reset.', 'info', 1800);
        });

        panel.querySelector('#qtv-export').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(API.getAll(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'qt-validation-settings.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        panel.querySelector('#qtv-import').addEventListener('click', async () => {
            try {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = 'application/json';
                input.onchange = async () => {
                    const file = input.files?.[0]; if (!file) return;
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (!data || typeof data !== 'object') throw new Error('Invalid JSON.');
                    // apply only known keys
                    Object.entries(data).forEach(([k, v]) => {
                        switch (k) {
                            case 'enabled': setVal(K.enabled, !!v); break;
                            case 'requireResolvedPart': setVal(K.requireResolvedPart, !!v); break;
                            case 'forbidZeroPrice': setVal(K.forbidZeroPrice, !!v); break;
                            case 'minUnitPrice': setVal(K.minUnitPrice, toNullOrNumber(v)); break;
                            case 'maxUnitPrice': setVal(K.maxUnitPrice, toNullOrNumber(v)); break;
                            case 'blockNextUntilValid': setVal(K.blockNextUntilValid, !!v); break;
                            case 'highlightFailures': setVal(K.highlightFailures, !!v); break;
                            case 'notes': setVal(K.notes, String(v || '')); break;
                        }
                    });
                    overlay.remove();
                    TMUtils.toast?.('Validation settings imported.', 'success', 1800);
                };
                input.click();
            } catch (err) {
                TMUtils.toast?.(`Import failed: ${err?.message || err}`, 'error', 3000);
            }
        });
    }

    function parseNumberOrNull(s) {
        const v = Number(String(s).trim());
        return Number.isFinite(v) ? v : null;
    }
    function toNullOrNumber(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function setNumberOrBlank(input, val) {
        input.value = (val == null ? '' : String(val));
    }
})();
