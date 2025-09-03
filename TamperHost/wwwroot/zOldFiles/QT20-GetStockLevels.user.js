// ==UserScript==
// @name         QT20 > Part Detail > Get Stock Levels
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.173
// @description  Injects a "Get Stock Levels" button into the "Quote Part Detail" modal.
//               On click, calls Plex DS 172 (Stock lookup) and appends `STK: <sum>` to NoteNew.
//               Useful for quoting visibility—quick stock check without leaving the modal.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async function () {
    'use strict';

    // ---------- Config ----------
    const CONFIG = {
        DS_STOCK: 172,
        includeBreakdown: true,     // show per-location quantities
        includeTimestamp: false,     // append time like "@2025-08-21 09:14"
        toastMs: 3500,
        modalTitle: 'Quote Part Detail'
    };

    // ---------- Bootstrap ----------
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.('QT20');
    const dlog = (...a) => { if (IS_TEST_ENV) L?.log?.(...a); };
    const dwarn = (...a) => { if (IS_TEST_ENV) L?.warn?.(...a); };
    const derror = (...a) => { if (IS_TEST_ENV) L?.error?.(...a); };

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
        dlog('Skipping route:', location.pathname);
        return;
    }

    // ------- Settings (persisted with GM storage) -------
    const SETTINGS_KEY = 'qt20_settings_v1';
    const DEFAULTS = { includeBreakdown: true, includeTimestamp: true };

    function loadSettings() {
        try {
            const v = GM_getValue(SETTINGS_KEY, DEFAULTS);
            // v may be object (TM) or string (edge setups)
            return typeof v === 'string' ? { ...DEFAULTS, ...JSON.parse(v) } : { ...DEFAULTS, ...v };
        } catch { return { ...DEFAULTS }; }
    }

    function saveSettings(next) {
        try { GM_setValue(SETTINGS_KEY, next); }
        catch { GM_setValue(SETTINGS_KEY, JSON.stringify(next)); }
    }

    // ========= ENTRY POINTS =========
    // Persistently inject the button(s) for every new modal instance
    const stopQT20Observe = TMUtils.observeInsertMany(
        '.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions',
        injectStockButton
    );

    // Optional: detach observer when leaving the wizard
    TMUtils.onUrlChange?.(() => {
        if (!TMUtils.matchRoute?.(ROUTES)) {
            try { stopQT20Observe?.(); } catch { }
        }
    });

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔎 QT20: Diagnostics', () =>
            TMUtils.toast(`Route: ${location.pathname}`, 'info', CONFIG.toastMs)
        );
    }

    

    // ========= UI INJECTION =========
    function injectStockButton(ul) {
        try {
            const modal = ul.closest('.plex-dialog');
            const title = modal?.querySelector('.plex-dialog-title')?.textContent?.trim();
            const looksRight = title === CONFIG.modalTitle || modal?.querySelector('textarea[name="NoteNew"]');
            if (!looksRight) return;

            if (ul.dataset.qt20StockInjected) return; // idempotent per modal instance
            ul.dataset.qt20StockInjected = '1';
            dlog('QT20: injecting buttons');

            // --- Main action button ---
            const liMain = document.createElement('li');
            const btn = document.createElement('a');
            btn.href = 'javascript:void(0)';
            btn.textContent = 'LT Get Stock Levels';
            btn.title = 'Click to append normalized stock levels to Note';   // ✅ tooltip
            btn.setAttribute('aria-label', 'Get stock levels');
            btn.setAttribute('role', 'button');
            Object.assign(btn.style, {
                cursor: 'pointer',
                transition: 'filter .15s, text-decoration-color .15s'         // ✅ smooth hover
            });
            btn.addEventListener('click', () => handleClick(btn, modal));
            // ✅ subtle hover + focus ring
            btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.08)'; btn.style.textDecoration = 'underline'; });
            btn.addEventListener('mouseleave', () => { btn.style.filter = ''; btn.style.textDecoration = ''; });
            btn.addEventListener('focus', () => { btn.style.outline = '2px solid #4a90e2'; btn.style.outlineOffset = '2px'; });
            btn.addEventListener('blur', () => { btn.style.outline = ''; btn.style.outlineOffset = ''; });

            liMain.appendChild(btn);
            ul.appendChild(liMain);

            // --- Settings gear ---
            const liGear = document.createElement('li');
            const gear = document.createElement('a');
            gear.href = 'javascript:void(0)';
            gear.title = 'QT20 Settings (breakdown / timestamp)';           // ✅ tooltip
            gear.setAttribute('aria-label', 'QT20 Settings');
            gear.textContent = '⚙️';
            Object.assign(gear.style, {
                marginLeft: '8px',
                fontSize: '16px',
                lineHeight: '1',
                cursor: 'pointer',
                transition: 'transform .15s, filter .15s'                     // ✅ smooth hover
            });
            // panel scaffold
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

            // toggle panel
            function openPanel() {
                panel.style.display = 'block';
                document.addEventListener('mousedown', outsideClose, true);
                document.addEventListener('keydown', escClose, true);
            }
            function closePanel() {
                panel.style.display = 'none';
                document.removeEventListener('mousedown', outsideClose, true);
                document.removeEventListener('keydown', escClose, true);
            }
            function outsideClose(e) { if (!panel.contains(e.target) && e.target !== gear) closePanel(); }
            function escClose(e) { if (e.key === 'Escape') closePanel(); }

            // gear interactions (hover/focus polish)
            gear.addEventListener('click', (e) => { e.preventDefault(); panel.style.display === 'none' ? openPanel() : closePanel(); });
            gear.addEventListener('mouseenter', () => { gear.style.filter = 'brightness(1.08)'; gear.style.transform = 'rotate(15deg)'; });
            gear.addEventListener('mouseleave', () => { gear.style.filter = ''; gear.style.transform = ''; });
            gear.addEventListener('focus', () => { gear.style.outline = '2px solid #4a90e2'; gear.style.outlineOffset = '2px'; });
            gear.addEventListener('blur', () => { gear.style.outline = ''; gear.style.outlineOffset = ''; });

            // panel events
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

            // When the Part Detail modal closes, tell listeners (e.g., QT35) to refresh attachments.
            onNodeRemoved(modal, () => {
                window.dispatchEvent(new CustomEvent('LT:AttachmentRefreshRequested', { detail: { source: 'QT20', ts: Date.now() } }));
            });

        } catch (e) {
            derror('QT20 inject:', e);
        }
    }


    // ========= CORE HANDLER =========
    // Add this helper near your other helpers:
    function readPartFromVM(vm, KO) {
        const candidates = ['PartNo', 'ItemNo', 'Part_Number', 'Item_Number', 'Part', 'Item'];
        for (const k of candidates) {
            try {
                const raw = KO?.unwrap ? KO.unwrap(vm[k])
                    : (typeof vm[k] === 'function' ? vm[k]() : vm[k]);
                const v = Array.isArray(raw) ? raw[0] : raw;
                const out = (v ?? '').toString().trim();
                if (out) return out;
            } catch { }
        }
        return '';
    }

    async function handleClick(btn, modalEl) {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
        const restore = () => { btn.style.pointerEvents = ''; btn.style.opacity = ''; };

        try {
            TMUtils.toast('⏳ Fetching stock levels…', 'info', 5000);

            // ✅ Await the key so the guard is real
            let apiKey = await TMUtils.getApiKey({ useCache: true });
            if (!apiKey) {
                if (confirm('No Plex API key found. Set it now?')) {
                    await PlexAuth.setKey();
                    apiKey = await TMUtils.getApiKey({ useCache: true });
                }
                if (!apiKey) throw new Error('No API Key configured');
            }

            // KO context from NoteNew (scopes us to the right modal VM)
            const ta = modalEl.querySelector('textarea[name="NoteNew"]')
                || document.querySelector('textarea[name="NoteNew"]');
            if (!ta) throw new Error('NoteNew textarea not found');

            const ctx = KO?.contextFor?.(ta);
            const vm = ctx?.$root?.data;
            if (!vm) throw new Error('Knockout context not found');

            // Resolve the requested part from the VM (your existing resolver is fine)
            const partNo = readPartFromVM(vm, KO);
            if (!partNo) throw new Error('PartNo not available');

            // 🔑 Use the base part for grouping & normalization
            const basePart = toBasePart(partNo);

            // Writable NoteNew
            const noteSetter =
                (unsafeWindow.plex?.data?.getObservableOrValue?.(vm, 'NoteNew')) ||
                (typeof vm.NoteNew === 'function' ? vm.NoteNew : null);
            if (typeof noteSetter !== 'function') throw new Error('NoteNew not writable');

            // DS call (as before)
            const rows = await TMUtils.dsRows(CONFIG.DS_STOCK, {
                Part_No: basePart,         // 🆕 query by base; if your DS requires exact matches only,
                Shippable: 'TRUE',        // keep your filters if needed
                Container_Status: 'OK'
            });

            // 🔄 Normalize to pieces (bags/boxes → pcs) and summarize
            const { sum, breakdown } = summarizeStockNormalized(rows || [], basePart);

            // Build the stamp
            const sumFmt = formatInt(sum);
            // 🔧 Load current settings
            const S = loadSettings();

            const parts = [`STK: ${formatInt(sum)} pcs`];
            if (S.includeBreakdown && breakdown.length) {
                const bk = breakdown.map(({ loc, qty }) => `${loc} ${formatInt(qty)}`).join(', ');
                parts.push(`(${bk})`);
            }
            if (S.includeTimestamp) {
                parts.push(`@${formatTimestamp(new Date())}`);
            }
            const stamp = parts.join(' ');


            // Read & sanitize existing note (keep your "null"/"undefined" cleanup)
            const rawNote =
                (KO?.unwrap ? KO.unwrap(vm.NoteNew)
                    : (typeof vm.NoteNew === 'function' ? vm.NoteNew() : vm.NoteNew));
            const current = (rawNote == null) ? '' : String(rawNote).trim();
            const baseNote = (/^(null|undefined)$/i.test(current) ? '' : current);

            // Remove any prior STK:… fragment anywhere in the note
            const cleaned = baseNote.replace(
                /(?:^|\s)STK:\s*[\d,]+(?:\s*pcs)?(?:\s*\([^)]*\))?(?:\s*@[0-9:\-\/\s]+)?/gi,
                ''
            ).trim();

            const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
            noteSetter(newNote);

            TMUtils.toast(`✅ ${stamp}`, 'success', CONFIG.toastMs);
            dlog('QT20 success', { partNo, basePart, sum, breakdown, newNote });


        } catch (err) {
            TMUtils.toast(`❌ ${err.message || err}`, 'error', 8000);
            derror('QT20:', err);
        } finally {
            restore();
        }
    }

    // ========= Helpers =========
    // Parse "AA5003-30-05.0-00-10BAG" -> { base: "AA5003-30-05.0-00", packSize: 10, packUnit: "BAG" }
    // If it’s just the base part, packSize is null.
    function splitBaseAndPack(partNo) {
        const s = String(partNo || '').trim();
        const m = s.match(/^(.*?)-(\d+)\s*(BAG|BOX|PACK|PKG)$/i);
        if (m) return { base: m[1], packSize: Number(m[2]), packUnit: m[3].toUpperCase() };
        return { base: s, packSize: null, packUnit: null };
    }

    // Normalize a single DS row to pieces for a specific base part.
    // Returns 0 if the row does not belong to that base part.
    function normalizeRowToPieces(row, targetBase) {
        const rowPart = String(row?.Part_No || '').trim();
        const { base, packSize } = splitBaseAndPack(rowPart);
        if (!base || base !== targetBase) return 0;

        const unit = String(row?.Unit || '').toLowerCase();
        const qty = Number(row?.Quantity) || 0;

        // Known simple rules:
        // - pcs => 1 piece per unit
        // - packaged variants ("-10BAG" etc.) => use the numeric suffix as multiplier
        // - if Unit is "bag/box/pack/pkg" and we DID parse a packSize, use it
        // - otherwise, fallback to 1 (conservative). You can expand rules as needed.
        if (unit === 'pcs' || unit === 'piece' || unit === 'pieces' || unit === '') {
            return qty; // already pieces
        }
        if (packSize) {
            return qty * packSize;
        }
        // Unknown unit but no packSize found; count as-is (or return 0 if you prefer to exclude)
        return qty;
    }

    // Sum + per-location breakdown in pieces for one base part
    function summarizeStockNormalized(rows, targetBase) {
        const byLoc = new Map();
        let total = 0;
        for (const r of (rows || [])) {
            const pcs = normalizeRowToPieces(r, targetBase);
            if (!pcs) continue;
            const loc = String(r?.Location || r?.Warehouse || r?.Site || 'UNK').trim();
            total += pcs;
            byLoc.set(loc, (byLoc.get(loc) || 0) + pcs);
        }
        const breakdown = [...byLoc].map(([loc, qty]) => ({ loc, qty }))
            .sort((a, b) => b.qty - a.qty);
        return { sum: total, breakdown };
    }

    // You already have this; ensure it’s present
    function formatInt(n) {
        return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    // Turn the chosen part into its base for grouping math
    function toBasePart(partNo) {
        return splitBaseAndPack(partNo).base;
    }

    function formatInt(n) {
        return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function formatTimestamp(d) {
        // 2025-08-21 09:14 (local)
        const pad = (x) => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // Fire once when a node leaves the DOM; returns a disposer
    function onNodeRemoved(node, cb) {
        if (!node || !node.ownerDocument) return () => { };
        const mo = new MutationObserver(muts => {
            for (const m of muts) for (const n of m.removedNodes || []) {
                if (n === node || (n.contains && n.contains(node))) {
                    try { cb(); } finally { mo.disconnect(); }
                    return;
                }
            }
        });
        mo.observe(node.ownerDocument.body, { childList: true, subtree: true });
        return () => mo.disconnect();
    }
})();
