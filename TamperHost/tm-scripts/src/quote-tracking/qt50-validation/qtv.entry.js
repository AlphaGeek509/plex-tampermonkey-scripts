// QTV entrypoint: mounts the “Validate Lines” button on Part Summary
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

if (__BUILD_DEV__) {
    // Minimal KO/grid resolvers kept local to debug helpers
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    function getGridVM() {
        const grid = document.querySelector('.plex-grid');
        return grid ? (KO?.dataFor?.(grid) || null) : null;
    }
    function getGridRows() {
        const gvm = getGridVM();
        return (gvm?.datasource?.raw) || (gvm?.datasource?.data) || [];
    }
    function plainRow(r) {
        const gv = (p, opts) => TMUtils.getObsValue(r, p, opts);
        return {
            QuotePartKey: gv('QuotePartKey'),
            PartNo: gv('PartNo', { trim: true }),
            PartStatus: gv('PartStatus', { trim: true }),
            Quantity: gv('Quantity'),
            UnitPrice: gv('UnitPrice'),
            RvUnitPriceCopy: gv('RvUnitPriceCopy'),
            RvCustomizedUnitPrice: gv('RvCustomizedUnitPrice'),
            IsUniqueQuotePart: gv('IsUniqueQuotePart')
        };
    }
    function toCSV(objs) {
        if (!objs?.length) return '';
        const cols = Object.keys(objs[0]);
        const esc = (v) => (v == null ? '' : String(v).includes(',') || String(v).includes('"') || String(v).includes('\n')
            ? `"${String(v).replace(/"/g, '""')}"`
            : String(v));
        const head = cols.join(',');
        const body = objs.map(o => cols.map(c => esc(o[c])).join(',')).join('\n');
        return head + '\n' + body;
    }
    function download(name, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    unsafeWindow.QTV_DEBUG = {
        // Settings helpers
        settings: () => ({
            enabled: GM_getValue('qtv.enabled'),
            autoManageLtPartNoOnQuote: GM_getValue('qtv.autoManageLtPartNoOnQuote'),
            minUnitPrice: GM_getValue('qtv.minUnitPrice'),
            maxUnitPrice: GM_getValue('qtv.maxUnitPrice')
        }),
        getValue: key => GM_getValue(key),
        setValue: (key, val) => GM_setValue(key, val),

        // Grid exporters
        grid: ({ plain = true } = {}) => {
            const rows = getGridRows();
            return plain ? rows.map(plainRow) : rows;
        },
        gridTable: () => console.table?.(unsafeWindow.QTV_DEBUG.grid({ plain: true })),

        // CSV/JSON downloaders
        downloadGridJSON: (filename = 'qt-grid.json') => {
            const data = JSON.stringify(unsafeWindow.QTV_DEBUG.grid({ plain: true }), null, 2);
            download(filename, new Blob([data], { type: 'application/json' }));
        },
        downloadGridCSV: (filename = 'qt-grid.csv') => {
            const csv = toCSV(unsafeWindow.QTV_DEBUG.grid({ plain: true }));
            download(filename, new Blob([csv], { type: 'text/csv' }));
        },

        // Validation on-demand (same engine as the button)
        validateNow: async () => {
            const { runValidation } = await import('./engine.js'); // same module used by the hub button
            const { getSettings } = await import('./index.js');
            const res = await runValidation(TMUtils, getSettings());
            console.table?.(res.issues || []);
            return res;
        },

        // Quick expectation helper: “show me rows above max”
        expectUnderMax: (max) => {
            const set = Number(max);
            const rows = unsafeWindow.QTV_DEBUG.grid({ plain: true });
            const toNum = (v) => {
                if (v == null) return NaN;
                const s = String(v).trim();
                return Number(s.replace(/[^\d.-]/g, ''));
            };
            return rows
                .map(r => ({ ...r, _UnitNum: toNum(r.RvCustomizedUnitPrice ?? r.RvUnitPriceCopy ?? r.UnitPrice) }))
                .filter(r => Number.isFinite(r._UnitNum) && r._UnitNum > set)
                .map(({ _UnitNum, ...r }) => r);
        },

        underMin: (min) => {
            const set = Number(min);
            const rows = unsafeWindow.QTV_DEBUG.grid({ plain: true });
            const toNum = (v) => {
                if (v == null) return NaN;
                const s = String(v).trim();
                return Number(s.replace(/[^\d.-]/g, ''));
            };
            return rows
                .map(r => ({ ...r, _UnitNum: toNum(r.RvCustomizedUnitPrice ?? r.RvUnitPriceCopy ?? r.UnitPrice) }))
                .filter(r => Number.isFinite(r._UnitNum) && r._UnitNum < set)
                .map(({ _UnitNum, ...r }) => r);
        },

    };
}


// Ensure the settings UI loads (gear button, storage API)
import './index.js';
// Mounts the Validate Lines button & wires click to the engine
import { mountValidationButton } from './injectButton.js';

TMUtils?.net?.ensureWatcher?.(); // optional, harmless if missing

const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
let unmountBtn = null;

function isWizard() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES);
    return ROUTES.some(re => re.test(location.pathname));
}

function getActiveWizardPageName() {
    const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]');
    return (li?.textContent || '').trim().replace(/\s+/g, ' ');
}

function isOnTargetWizardPage() {
    return true; // always show on all pages
    //return /^part\s*summary$/i.test(getActiveWizardPageName());
}

async function reconcile() {
    if (!isWizard()) return unmount();
    if (isOnTargetWizardPage()) {
        if (!unmountBtn) unmountBtn = await mountValidationButton(TMUtils);
    } else {
        unmount();
    }
}

function unmount() { if (unmountBtn) { unmountBtn(); unmountBtn = null; } }

// initial + SPA wiring (mirrors qt30/qt35)
reconcile();
TMUtils?.onUrlChange?.(reconcile);
window.addEventListener('hashchange', reconcile);
const nav = document.querySelector('.plex-wizard-page-list');
if (nav) new MutationObserver(reconcile).observe(nav, { subtree: true, attributes: true, childList: true });

