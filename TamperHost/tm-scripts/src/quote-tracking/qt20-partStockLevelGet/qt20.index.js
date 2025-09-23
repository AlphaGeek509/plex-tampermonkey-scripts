// tm-scripts/src/qt20-partStockLevelGet/qt20.index.js

/* Build-time dev flag (esbuild sets __BUILD_DEV__), with a runtime fallback */
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : /localhost|127\.0\.0\.1|^test\./i.test(location.hostname);

(() => {
    'use strict';

    // ===== Logging / KO =====
    const dlog = (...a) => DEV && console.debug('QT20', ...a);
    const derr = (...a) => console.error('QT20 ✖️', ...a);
    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const raf = () => new Promise(r => requestAnimationFrame(r));

    // Guard against double-mount; qt10/qt35 already do this
    if (!('__LT_HUB_MOUNT' in window) || !window.__LT_HUB_MOUNT) window.__LT_HUB_MOUNT = 'nav';
    (async () => {
        try { await window.ensureLTHub?.({ mount: window.__LT_HUB_MOUNT }); } catch { }
        // "Ready" handled by qt10 to avoid duplicate sticky pills
    })();

    // ===== Routes / UI anchors =====
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some(rx => rx.test(location.pathname))) return;

    const CFG = {
        ACTIONS_UL_SEL: '.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions',
        MODAL_TITLE: 'Quote Part Detail',
        NOTE_SEL: 'textarea[name="NoteNew"]',
        DS_STOCK: 172,
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        POLL_MS: 200,
        TIMEOUT_MS: 12000,
        SETTINGS_KEY: 'qt20_settings_v2',
        DEFAULTS: { includeBreakdown: true, includeTimestamp: true }
    };

    // ===== KO/Wizard helpers
    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        if (window.TMUtils?.waitForModelAsync) {
            const { viewModel } = await window.TMUtils.waitForModelAsync(anchor, {
                pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true
            }) ?? { viewModel: null };
            if (viewModel) return viewModel;
        }
        // Fallback: try KO root near the wizard/page
        const rootEl = document.querySelector('.plex-wizard, .plex-page');
        return rootEl && (KO?.dataFor?.(rootEl) || null);
    }

    // Use centralized quote context
    const QT_CTX = lt?.core?.qt?.getQuoteContext();

    // ===== Auth wrapper (prefers lt.core.auth.withFreshAuth; falls back to plain run)
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return (typeof impl === 'function') ? impl(fn) : fn();
    };


    // ===== Settings (GM)
    function loadSettings() {
        try {
            const raw = GM_getValue(CFG.SETTINGS_KEY, null);
            if (!raw) return { ...CFG.DEFAULTS };
            const obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            return { ...CFG.DEFAULTS, ...obj };
        } catch { return { ...CFG.DEFAULTS }; }
    }
    function saveSettings(next) {
        try { GM_setValue(CFG.SETTINGS_KEY, JSON.stringify(next)); } catch { }
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
    async function handleClick(modalEl) {
        const task = lt.core.hub.beginTask('Fetching stock…', 'info');
        try {
            await ensureWizardVM();

            // Resolve Quote Key (used for logging only now)
            const qk = (QT_CTX?.quoteKey);
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
                /(?:^|\s)STK:\s*\d[\d,]*(?:\s*pcs)?(?:\s*\([^()]*\))?(?:\s*@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?/gi,
                ''
            ).trim();
            const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
            const setOk = window.TMUtils?.setObsValue?.(vm, 'NoteNew', newNote);
            if (!setOk && ta) { ta.value = newNote; ta.dispatchEvent(new Event('input', { bubbles: true })); }

            task.success('Stock updated', 1500);
            lt.core.hub.notify('Stock results copied to Note', 'success', { ms: 2500, toast: true });

            dlog('QT20 success', { qk, partNo, basePart, sum, breakdown });

        } catch (err) {
            task.error('Failed');
            lt.core.hub.notify(`Stock check failed: ${err?.message || err}`, 'error', { ms: 4000, toast: true });

            derr('handleClick:', err);
        } finally {
            // no transient UI to restore here; keep idempotent
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
            btn.addEventListener('click', () => handleClick(modal));
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(modal); }
            });
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

    const HUB_BTN_ID = 'qt20-stock-btn';

    function getActiveModalTitle() {
        const t = document.querySelector('.plex-dialog-has-buttons .plex-dialog-title');
        return (t?.textContent || '').trim().replace(/\s+/g, ' ');
    }

    function isTargetModalOpen() {
        return document.body.classList.contains('modal-open')
            && /^quote\s*part\s*detail$/i.test(getActiveModalTitle());
    }

    function getActiveModalRoot() {
        return document.querySelector('.plex-dialog-has-buttons') || document.querySelector('.plex-dialog');
    }

    async function ensureHubButton() {
        try { await window.ensureLTHub?.(); } catch { }
        const hub = lt?.core?.hub;
        if (!hub || !hub.registerButton) return; // UI not ready yet

        // Don't double-register
        if (hub.has?.(HUB_BTN_ID)) return;

        hub.registerButton('left', {
            id: HUB_BTN_ID,
            label: 'Stock',
            title: 'Fetch stock for current part',
            weight: 110,
            onClick: () => handleClick(getActiveModalRoot())
        });

    }

    function removeHubButton() {
        const hub = lt?.core?.hub;
        hub?.remove?.(HUB_BTN_ID);
    }

    function debounce(fn, ms = 50) {
        let id = null;
        return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
    }

    const reconcileHubButtonVisibility = debounce(async () => {
        if (isTargetModalOpen()) {
            await ensureHubButton();
        } else {
            removeHubButton();
        }
    }, 50);

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

        // Show/hide the button as the modal opens/closes and titles change
        reconcileHubButtonVisibility();

        const bodyObs = new MutationObserver(muts => {
            if (muts.some(m => m.type === 'attributes')) reconcileHubButtonVisibility();
        });
        bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Modal title may change after opening
        const modalRoot = document.querySelector('.plex-dialog-has-buttons') || document.body;
        const titleObs = new MutationObserver(() => reconcileHubButtonVisibility());
        titleObs.observe(modalRoot, { subtree: true, childList: true, characterData: true });


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
