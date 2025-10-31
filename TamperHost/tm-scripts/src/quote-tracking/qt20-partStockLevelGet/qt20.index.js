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
        // Primary KO anchor is the form container; fallbacks retained for older layouts
        //, .plex-dialog-content, [data-bind], input[name="PartNo"], input[name="PartNoNew"], input[name="ItemNo"], input[name="Part_Number"], input[name="Item_Number"]
        ANCHOR_SEL: '.plex-form-content',
        DS_STOCK: 172,
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        POLL_MS: 200,
        TIMEOUT_MS: 12000
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

    function getModalVM(modalEl) {
        try {
            const pick = sel => modalEl?.querySelector(sel);
            const anchor =
                pick('.plex-form-content') ||
                pick('.plex-dialog-content') ||
                pick('[data-bind]') ||
                modalEl;

            const ctx = KO?.contextFor?.(anchor) || KO?.contextFor?.(modalEl) || null;
            const vm = ctx?.$data || ctx?.$root?.data || null;

            // Some dialogs wrap the actual record on vm.data or vm.model
            return (vm && (vm.data || vm.model)) ? (vm.data || vm.model) : vm;
        } catch { return null; }
    }

    // ===== Auth wrapper (prefers lt.core.auth.withFreshAuth; falls back to plain run)
    const withFreshAuth = (fn) => {
        const impl = lt?.core?.auth?.withFreshAuth;
        return (typeof impl === 'function') ? impl(fn) : fn();
    };

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
            const rootVM = await ensureWizardVM();

            // Resolve Quote Key …
            let qk = Number(lt?.core?.qt?.getQuoteContext?.()?.quoteKey || 0);
            if (!Number.isFinite(qk) || qk <= 0) {
                const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
                qk = m ? Number(m[1]) : 0;
            }
            if (!Number.isFinite(qk) || qk <= 0) throw new Error('Quote Key not found');

            // Prefer the modal VM anchored at .plex-form-content
            // Wait briefly for KO to bind this modal before grabbing its VM
            let vmModal = getModalVM(modalEl);
            if (!vmModal && window.TMUtils?.waitForModelAsync) {
                try {
                    const { viewModel } = await window.TMUtils.waitForModelAsync('.plex-dialog-has-buttons .plex-form-content', {
                        pollMs: 120,
                        timeoutMs: 1500,
                        requireKo: true
                    }) ?? {};
                    if (viewModel) vmModal = (viewModel.data || viewModel.model || viewModel);
                } catch { /* ignore and continue */ }
            }

            const partNo = await resolvePartNo(modalEl, vmModal ?? rootVM, { timeoutMs: 5000, pollMs: 150 });

            if (!partNo) throw new Error('PartNo not available');
            const basePart = toBasePart(partNo);


            // DS call with 419 retry
            const plex = (typeof getPlexFacade === 'function') ? await getPlexFacade() : window.lt?.core?.plex ?? window.TMUtils;
            const rows = await withFreshAuth(() =>
                plex.dsRows(CFG.DS_STOCK, { Part_No: basePart, Shippable: 'TRUE', Container_Status: 'OK' })
            );

            const { sum } = summarizeStockNormalized(rows || [], basePart);

            const parts = [`STK: ${formatInt(sum)} pcs`];

            // Append to NoteNew (clean previous stamp if present)
            const current = window.TMUtils?.getObsValue?.(vmModal, 'NoteNew', { trim: true }) || '';
            const baseNote = (/^(null|undefined)$/i.test(current) ? '' : current);
            // 2) remove any prior stamp variants (old STK w/ breakdown/timestamp OR prior "Stock: N pcs")
            const cleaned = baseNote.replace(
                /(?:^|\s)(?:STK:\s*\d[\d,]*(?:\s*pcs)?(?:\s*\([^()]*\))?(?:\s*@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?|Stock:\s*\d[\d,]*\s*pcs)\s*/gi,
                ''
            ).trim();

            // 3) build minimal stamp and append
            const stamp = `Stock: ${formatInt(sum)} pcs`;
            const nextNote = cleaned ? `${cleaned} ${stamp}` : stamp;

            // 4) write back via KO; fallback to direct textarea
            let setOk = window.TMUtils?.setObsValue?.(vmModal, 'NoteNew', nextNote);
            if (!setOk) {
                const ta = modalEl?.querySelector('textarea[name="NoteNew"]');
                if (ta) { ta.value = nextNote; ta.dispatchEvent(new Event('input', { bubbles: true })); setOk = true; }
            }

            // No breakdown, no stamp — just a simple toast
            task.success('Stock retrieved', 1200);
            lt.core.hub.notify(`Stock: ${formatInt(sum)} pcs`, 'success', { toast: true });

            dlog('QT20 success', { qk, partNo, basePart, sum });
        } catch (err) {
            task.error('Failed');
            lt.core.hub.notify(`Stock check failed: ${err?.message || err}`, 'error', { toast: true });

            derr('handleClick:', err);
        } finally {
            // no transient UI to restore here; keep idempotent
        }
    }

    // Prefer KO via TMUtils.getObsValue; works with VM or DOM node (resolves KO context).
    function readPartFromAny(modalEl, vmCandidate) {
        const paths = [
            // direct
            'PartNo', 'ItemNo', 'Part_Number', 'Item_Number', 'Part', 'Item',
            'PartNoNew', 'PartNoOld',
            // nested common
            'QuotePart.PartNo', 'QuotePart.Part_Number',
            'SelectedRow.PartNo', 'Row.PartNo', 'Model.PartNo',
            // when vm is wrapper objects
            'data.PartNo', 'data.ItemNo', 'model.PartNo', 'model.ItemNo'
        ];
        const TMU = window.TMUtils;

        // 1) modal VM preferred
        if (vmCandidate) {
            const vVM = TMU?.getObsValue?.(vmCandidate, paths, { first: true, trim: true, allowPlex: true });
            if (vVM) return vVM;
        }
        // 2) modal element KO context
        const vModal = TMU?.getObsValue?.(modalEl, paths, { first: true, trim: true, allowPlex: true });
        if (vModal) return vModal;
        // 3) DOM inputs (last resort)
        try {
            const el = modalEl?.querySelector('input[name="PartNo"],input[name="Part_Number"],input[name="ItemNo"],input[name="Item_Number"]');
            const raw = (el?.value ?? '').trim();
            if (raw) return raw;
        } catch { }
        return '';
    }

    // Robust resolver that retries briefly to survive KO/layout timing.
    async function resolvePartNo(modalEl, vmCandidate, { timeoutMs = 5000, pollMs = 150 } = {}) {
        const deadline = Date.now() + Math.max(500, timeoutMs | 0);
        let last = '';

        while (Date.now() < deadline) {
            // 1) Try the fast path (existing logic)
            const v = readPartFromAny(modalEl, vmCandidate);
            if (v) return v;
            last = v || last;

            // 2) Nudge DOM to commit pending input → KO (blur/change)
            try {
                const el = modalEl?.querySelector('input[name="PartNo"],input[name="Part_Number"],input[name="ItemNo"],input[name="Item_Number"]');
                if (el) {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            } catch { /* non-fatal */ }

            // 3) Yield + small delay to let KO settle
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, Math.max(50, pollMs | 0)));
        }

        return last; // still '', caller will handle
    }

    // ===== Pricing columns lockout (hide, disable, and re-apply on re-render)
    function findHeaderIndexes(modalEl, headerTexts) {
        try {
            const hdr = modalEl.querySelector('.plex-grid-container .plex-grid-header thead');
            if (!hdr) return [];
            const cells = [...hdr.querySelectorAll('th .plex-grid-header-inner-content abbr')];
            const set = new Set();
            for (const want of headerTexts) {
                const idx = cells.findIndex(a => a && a.textContent && a.textContent.trim().toLowerCase() === String(want).trim().toLowerCase());
                if (idx >= 0) set.add(idx);
            }
            return [...set].sort((a, b) => a - b);
        } catch { return []; }
    }

    function hideColumnsByIndexes(modalEl, idxs) {
        if (!idxs || !idxs.length) return;
        try {
            // 1) Headers
            const hdrCells = modalEl.querySelectorAll('.plex-grid-container .plex-grid-header thead th');
            idxs.forEach(i => { if (hdrCells[i]) hdrCells[i].style.display = 'none'; });

            // 2) Body cells
            const bodyRows = modalEl.querySelectorAll('.plex-grid-wrapper .plex-grid tbody tr');
            for (const r of bodyRows) {
                const tds = r.children;
                idxs.forEach(i => { if (tds && tds[i]) tds[i].style.display = 'none'; });
            }

            // 3) Colgroups to keep widths sane
            const colgroups = modalEl.querySelectorAll('.plex-grid-container colgroup, .plex-grid-wrapper colgroup');
            for (const cg of colgroups) {
                const cols = cg.querySelectorAll('col');
                idxs.forEach(i => { if (cols[i]) cols[i].style.display = 'none'; });
            }
        } catch { /* no-op */ }
    }

    function disableInputsInLockedColumns(modalEl, idxs) {
        try {
            // Also directly target known field names we never allow
            const hardNames = ['NewUnitPrice', 'NewPercentMarkup', 'PercentMarkup', 'MarkupPercent'];
            const hardSel = hardNames.map(n => `input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`).join(',');
            const markReadOnly = el => {
                try {
                    if ('readOnly' in el) el.readOnly = true;
                    if ('disabled' in el) el.disabled = true;
                    el.setAttribute('aria-readonly', 'true');
                    el.title = 'Disabled by policy';
                    el.style.pointerEvents = 'none';
                } catch { }
            };

            // Mark any known named controls now
            try { modalEl.querySelectorAll(hardSel).forEach(markReadOnly); } catch { }

            // Event-level hard block for any input living inside locked TDs
            const idxSet = new Set(idxs);
            const isInLockedCell = (node) => {
                const td = node?.closest?.('td');
                if (!td || typeof td.cellIndex !== 'number') return false;
                return idxSet.has(td.cellIndex);
            };

            // Avoid duplicate listeners per modal instance
            if (!modalEl.dataset.qt20LockoutListeners) {
                modalEl.dataset.qt20LockoutListeners = '1';

                modalEl.addEventListener('focusin', (e) => {
                    const t = e.target;
                    if (t && (isInLockedCell(t) || (t.matches && t.matches(hardSel)))) {
                        try { t.blur?.(); } catch { }
                        lt?.core?.hub?.notify?.('This field is controlled by policy and cannot be edited here.', 'warning', { toast: true });
                    }
                }, true);

                modalEl.addEventListener('keydown', (e) => {
                    const t = e.target;
                    if (t && (isInLockedCell(t) || (t.matches && t.matches(hardSel)))) {
                        e.stopImmediatePropagation(); e.preventDefault();
                    }
                }, true);

                modalEl.addEventListener('input', (e) => {
                    const t = e.target;
                    if (t && (isInLockedCell(t) || (t.matches && t.matches(hardSel)))) {
                        if ('value' in t) t.value = '';
                        e.stopImmediatePropagation(); e.preventDefault();
                    }
                }, true);
            }

            // Also sweep existing inputs in those TDs and mark them read-only
            const rows = modalEl.querySelectorAll('.plex-grid-wrapper .plex-grid tbody tr');
            for (const r of rows) {
                idxs.forEach(i => {
                    const td = r.children?.[i];
                    if (!td) return;
                    td.querySelectorAll('input,textarea,select').forEach(markReadOnly);
                });
            }
        } catch { /* no-op */ }
    }

    function lockoutPricingColumns(modalEl) {
        // Columns to hide/lock by header text
        const idxs = findHeaderIndexes(modalEl, ['Unit Price', '% Markup', '$ Markup']);
        // Disable any inputs inside those columns (and known field names)
        disableInputsInLockedColumns(modalEl, idxs);
        // Hide the columns visually
        hideColumnsByIndexes(modalEl, idxs);
    }

    function watchPricingLockout(modalEl) {
        try {
            // Apply immediately
            lockoutPricingColumns(modalEl);
            // Re-apply on grid re-render (Plex rebinding)
            const root = modalEl.querySelector('.plex-grid-container') || modalEl;
            const mo = new MutationObserver(() => lockoutPricingColumns(modalEl));
            mo.observe(root, { childList: true, subtree: true });
            // Stop when modal is removed
            onNodeRemoved(modalEl, () => mo.disconnect());
        } catch { /* ignore */ }
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
            // options removed: match by title only
            const looksRight = title === CFG.MODAL_TITLE;
            if (!looksRight) return;

            if (ul.dataset.qt20Injected) return;
            ul.dataset.qt20Injected = '1';
            dlog('injecting controls');

            // Main action (themed anchor inside LI to match Plex action bar sizing)
            const liMain = document.createElement('li');
            liMain.className = 'lt-action lt-action--brand';
            const btn = document.createElement('a');
            btn.href = 'javascript:void(0)';
            btn.id = 'qt20-stock-li-btn';
            btn.className = 'lt-btn lt-btn--ghost';
            btn.textContent = 'Get Stock Levels';
            btn.title = 'Fetch stock for this part (no stamp)';
            btn.addEventListener('click', (e) => { e.preventDefault(); handleClick(modal); });
            liMain.appendChild(btn);
            ul.appendChild(liMain);

            // Enforce Unit Price and % Markup lockout in this modal instance
            watchPricingLockout(modal);

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
