// tm-scripts/src/qt20-partStockLevelGet/qt20.index.js

/* Build-time dev flag (esbuild sets __BUILD_DEV__), with a runtime fallback */
const DEV = (typeof __BUILD_DEV__ !== 'undefined') ? __BUILD_DEV__ : true;

(() => {
    'use strict';

    // ===== Logging / KO =====
    const dlog = (...a) => DEV && console.debug('QT20', ...a);
    const derr = (...a) => console.error('QT20 ✖️', ...a);
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const raf = () => new Promise(r => requestAnimationFrame(r));

    // ===== Routes / UI anchors =====
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!(window.TMUtils && window.TMUtils.matchRoute && window.TMUtils.matchRoute(ROUTES))) return;

    const CFG = {
        ACTIONS_UL_SEL: '.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions',
        MODAL_TITLE: 'Quote Part Detail',
        NOTE_SEL: 'textarea[name="NoteNew"]',
        DS_STOCK: 172,
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        POLL_MS: 200,
        TIMEOUT_MS: 12_000,
        TOAST_MS: 3500,
        SETTINGS_KEY: 'qt20_settings_v2',
        DEFAULTS: { includeBreakdown: true, includeTimestamp: true }
    };

    // ===== KO/Wizard helpers
    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
        return viewModel;
    }

    function getQuoteKeyDeterministic() {
        try {
            const grid = document.querySelector(CFG.GRID_SEL);
            if (grid && KO?.dataFor) {
                const gridVM = KO.dataFor(grid);
                const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
                const v = raw0 ? window.TMUtils?.getObsValue?.(raw0, 'QuoteKey') : null;
                if (v != null) return Number(v);
            }
        } catch { }
        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const v = rootVM && (window.TMUtils?.getObsValue?.(rootVM, 'QuoteKey') || window.TMUtils?.getObsValue?.(rootVM, 'Quote.QuoteKey'));
            if (v != null) return Number(v);
        } catch { }
        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    // ===== 419 re-auth wrapper
    async function withFreshAuth(run) {
        try { return await run(); }
        catch (err) {
            const s = err?.status || ((/(\b\d{3}\b)/.exec(err?.message || '') || [])[1]);
            if (+s === 419) {
                try { await window.lt?.core?.auth?.getKey?.(); } catch { try { await window.TMUtils?.getApiKey?.({ force: true }); } catch { } }
                return await run();
            }
            throw err;
        }
    }

    // ===== Settings (GM)
    function loadSettings() {
        try {
            const v = GM_getValue(CFG.SETTINGS_KEY, CFG.DEFAULTS);
            return typeof v === 'string' ? { ...CFG.DEFAULTS, ...JSON.parse(v) } : { ...CFG.DEFAULTS, ...v };
        } catch { return { ...CFG.DEFAULTS }; }
    }
    function saveSettings(next) {
        try { GM_setValue(CFG.SETTINGS_KEY, next); }
        catch { GM_setValue(CFG.SETTINGS_KEY, JSON.stringify(next)); }
    }

    // ===== Stock helpers
    function splitBaseAndPack(partNo) {
        const s = String(partNo || '').trim();
        const m = s.match(/^(.*?)-(\d+)\s*(BAG|BOX|PACK|PKG)$/i);
        if (m) return { base: m[1], packSize: Number(m[2]), packUnit: m[3].toUpperCase() };
        return { base: s, packSize: null, packUnit: null };
    }
    function toBasePart(partNo) { return splitBaseAndPack(partNo).base; }
    function normalizeRowToPieces(row, targetBase) {
        const rowPart = String(row?.Part_No || '').trim();
        const { base, packSize } = splitBaseAndPack(rowPart);
        if (!base || base !== targetBase) return 0;
        const unit = String(row?.Unit || '').toLowerCase();
        const qty = Number(row?.Quantity) || 0;
        if (unit === '' || unit === 'pcs' || unit === 'piece' || unit === 'pieces') return qty;
        if (packSize) return qty * packSize;
        return qty;
    }
    function summarizeStockNormalized(rows, targetBase) {
        const byLoc = new Map(); let total = 0;
        for (const r of (rows || [])) {
            const pcs = normalizeRowToPieces(r, targetBase);
            if (!pcs) continue;
            const loc = String(r?.Location || r?.Warehouse || r?.Site || 'UNK').trim();
            total += pcs;
            byLoc.set(loc, (byLoc.get(loc) || 0) + pcs);
        }
        const breakdown = [...byLoc].map(([loc, qty]) => ({ loc, qty })).sort((a, b) => b.qty - a.qty);
        return { sum: total, breakdown };
    }
    const formatInt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    function formatTimestamp(d) {
        const pad = x => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }


    // ===== Click handler (no repo writes)
    async function handleClick(btn, modalEl) {
        btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5';
        const restore = () => { btn.style.pointerEvents = ''; btn.style.opacity = ''; };

        try {
            TMUtils.toast('⏳ Fetching stock levels…', 'info', 5000);
            await ensureWizardVM();

            // Resolve Quote Key (used for logging only now)
            const qk = getQuoteKeyDeterministic();
            if (!qk || !Number.isFinite(qk) || qk <= 0) throw new Error('Quote Key not found');

            // Resolve KO Note field within the same modal
            const ta = modalEl.querySelector(CFG.NOTE_SEL) || document.querySelector(CFG.NOTE_SEL);
            if (!ta) throw new Error('NoteNew textarea not found');

            const ctxKO = KO?.contextFor?.(ta);
            const vm = ctxKO?.$root?.data;
            if (!vm) throw new Error('Knockout context not found');

            // Read part and normalize to base
            const partNo = readPartFromVM(vm);
            if (!partNo) throw new Error('PartNo not available');
            const basePart = toBasePart(partNo);

            // DS call with 419 retry
            const plex = (typeof getPlexFacade === 'function') ? await getPlexFacade() : window.lt?.core?.plex ?? window.TMUtils;
            const rows = await withFreshAuth(() =>
                plex.dsRows(CFG.DS_STOCK, { Part_No: basePart, Shippable: 'TRUE', Container_Status: 'OK' })
            );

            const { sum, breakdown } = summarizeStockNormalized(rows || [], basePart);

            const S = loadSettings();
            const parts = [`STK: ${formatInt(sum)} pcs`];
            if (S.includeBreakdown && breakdown.length) {
                const bk = breakdown.map(({ loc, qty }) => `${loc} ${formatInt(qty)}`).join(', ');
                parts.push(`(${bk})`);
            }
            if (S.includeTimestamp) parts.push(`@${formatTimestamp(new Date())}`);
            const stamp = parts.join(' ');

            // Append to NoteNew (clean previous stamp if present)
            const current = window.TMUtils?.getObsValue?.(vm, 'NoteNew', { trim: true }) || '';
            const baseNote = (/^(null|undefined)$/i.test(current) ? '' : current);
            const cleaned = baseNote.replace(
                /(?:^|\s)STK:\s*[\d,]+(?:\s*pcs)?(?:\s*\([^)]*\))?(?:\s*@[0-9:\-\/\s]+)?/gi,
                ''
            ).trim();
            const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
            const setOk = window.TMUtils?.setObsValue?.(vm, 'NoteNew', newNote);
            if (!setOk && ta) { ta.value = newNote; ta.dispatchEvent(new Event('input', { bubbles: true })); }

            TMUtils.toast(`✅ ${stamp}`, 'success', CFG.TOAST_MS);
            dlog('QT20 success', { qk, partNo, basePart, sum, breakdown });

        } catch (err) {
            TMUtils.toast(`❌ ${err.message || err}`, 'error', 8000);
            derr('handleClick:', err);
        } finally {
            restore();
        }
    }

    function readPartFromVM(vm) {
        const keys = ['PartNo', 'ItemNo', 'Part_Number', 'Item_Number', 'Part', 'Item'];
        for (const k of keys) {
            const v = window.TMUtils?.getObsValue?.(vm, k, { first: true, trim: true });
            if (v) return v;
        }
        return '';
    }

    // ===== Modal wiring (idempotent per modal)
    function onNodeRemoved(node, cb) {
        if (!node || !node.ownerDocument) return () => { };
        const mo = new MutationObserver(muts => {
            for (const m of muts) for (const n of m.removedNodes || []) {
                if (n === node || (n.contains && n.contains(node))) { try { cb(); } finally { mo.disconnect(); } return; }
            }
        });
        mo.observe(node.ownerDocument.body, { childList: true, subtree: true });
        return () => mo.disconnect();
    }

    function injectStockControls(ul) {
        try {
            const modal = ul.closest('.plex-dialog');
            const title = modal?.querySelector('.plex-dialog-title')?.textContent?.trim();
            const looksRight = title === CFG.MODAL_TITLE || modal?.querySelector(CFG.NOTE_SEL);
            if (!looksRight) return;

            if (ul.dataset.qt20Injected) return;
            ul.dataset.qt20Injected = '1';
            dlog('injecting controls');

            // Main action
            const liMain = document.createElement('li');
            const btn = document.createElement('a');
            btn.href = 'javascript:void(0)';
            btn.textContent = 'LT Get Stock Levels';
            btn.title = 'Append normalized stock summary to Note';
            btn.setAttribute('aria-label', 'Get stock levels');
            btn.setAttribute('role', 'button');
            Object.assign(btn.style, { cursor: 'pointer', transition: 'filter .15s, text-decoration-color .15s' });
            btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.08)'; btn.style.textDecoration = 'underline'; });
            btn.addEventListener('mouseleave', () => { btn.style.filter = ''; btn.style.textDecoration = ''; });
            btn.addEventListener('focus', () => { btn.style.outline = '2px solid #4a90e2'; btn.style.outlineOffset = '2px'; });
            btn.addEventListener('blur', () => { btn.style.outline = ''; btn.style.outlineOffset = ''; });
            btn.addEventListener('click', () => handleClick(btn, modal));
            liMain.appendChild(btn);
            ul.appendChild(liMain);

            // Settings gear
            const liGear = document.createElement('li');
            const gear = document.createElement('a');
            gear.href = 'javascript:void(0)';
            gear.textContent = '⚙️';
            gear.title = 'QT20 Settings (breakdown / timestamp)';
            gear.setAttribute('aria-label', 'QT20 Settings');
            Object.assign(gear.style, { marginLeft: '8px', fontSize: '16px', lineHeight: '1', cursor: 'pointer', transition: 'transform .15s, filter .15s' });

            const panel = document.createElement('div');
            panel.className = 'qt20-settings';
            Object.assign(panel.style, {
                position: 'absolute', top: '40px', right: '16px',
                minWidth: '220px', padding: '10px 12px',
                border: '1px solid #ccc', borderRadius: '8px',
                background: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                zIndex: '9999', display: 'none'
            });

            const S0 = loadSettings();
            panel.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px;">QT20 Settings</div>
        <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
          <input type="checkbox" id="qt20-breakdown" ${S0.includeBreakdown ? 'checked' : ''}>
          <span>Include breakdown</span>
        </label>
        <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
          <input type="checkbox" id="qt20-timestamp" ${S0.includeTimestamp ? 'checked' : ''}>
          <span>Include timestamp</span>
        </label>
        <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end;">
          <button type="button" id="qt20-close" style="padding:4px 8px;">Close</button>
        </div>
      `;

            function openPanel() { panel.style.display = 'block'; document.addEventListener('mousedown', outsideClose, true); document.addEventListener('keydown', escClose, true); }
            function closePanel() { panel.style.display = 'none'; document.removeEventListener('mousedown', outsideClose, true); document.removeEventListener('keydown', escClose, true); }
            function outsideClose(e) { if (!panel.contains(e.target) && e.target !== gear) closePanel(); }
            function escClose(e) { if (e.key === 'Escape') closePanel(); }

            gear.addEventListener('click', (e) => { e.preventDefault(); panel.style.display === 'none' ? openPanel() : closePanel(); });
            gear.addEventListener('mouseenter', () => { gear.style.filter = 'brightness(1.08)'; gear.style.transform = 'rotate(15deg)'; });
            gear.addEventListener('mouseleave', () => { gear.style.filter = ''; gear.style.transform = ''; });
            gear.addEventListener('focus', () => { gear.style.outline = '2px solid #4a90e2'; gear.style.outlineOffset = '2px'; });
            gear.addEventListener('blur', () => { gear.style.outline = ''; gear.style.outlineOffset = ''; });

            panel.querySelector('#qt20-close')?.addEventListener('click', closePanel);
            panel.querySelector('#qt20-breakdown')?.addEventListener('change', (ev) => {
                const cur = loadSettings(); saveSettings({ ...cur, includeBreakdown: !!ev.target.checked });
            });
            panel.querySelector('#qt20-timestamp')?.addEventListener('change', (ev) => {
                const cur = loadSettings(); saveSettings({ ...cur, includeTimestamp: !!ev.target.checked });
            });

            liGear.appendChild(gear);
            ul.appendChild(liGear);
            (modal.querySelector('.plex-dialog-content') || modal).appendChild(panel);

            // Let other modules refresh if they care (no-op here)
            onNodeRemoved(modal, () => {
                const W = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
                const CE = (W && ('CustomEvent' in W) ? W.CustomEvent : globalThis.CustomEvent);
                if (W && W.dispatchEvent && CE) {
                    try {
                        W.dispatchEvent(new CE('LT:AttachmentRefreshRequested', { detail: { source: 'QT20', ts: Date.now() } }));
                    } catch { }
                }
            });

        } catch (e) {
            derr('inject:', e);
        }
    }

    // ===== Boot / SPA wiring
    let stopObserve = null;
    let offUrl = null;
    let booted = false;

    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    function startModalObserver() {
        stopObserve?.();
        stopObserve = window.TMUtils?.observeInsertMany?.(CFG.ACTIONS_UL_SEL, injectStockControls);
    }

    function stopModalObserver() {
        try { stopObserve?.(); } catch { } finally { stopObserve = null; }
    }

    async function init() {
        if (booted) return;
        booted = true;
        await raf();
        await ensureWizardVM();
        startModalObserver();
        dlog('initialized');
    }

    function teardown() {
        booted = false;
        stopModalObserver();
    }

    wireNav(() => { if (window.TMUtils?.matchRoute?.(ROUTES)) init(); else teardown(); });
    init();

    // Dev seam (optional)
    if (DEV && typeof window !== 'undefined') {
        window.__QT20__ = { injectStockControls, handleClick, splitBaseAndPack, toBasePart, normalizeRowToPieces, summarizeStockNormalized };
    }
})();
