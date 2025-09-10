// tm-scripts/src/qt30-catalogPricingApply/qt30.index.js

(() => {
    'use strict';

    // ===== Flags / Logging =====
    const DEV = typeof __BUILD_DEV__ !== 'undefined' ? __BUILD_DEV__ : false;
    const dlog = (...a) => DEV && console.debug('QT35', ...a);
    const derr = (...a) => console.error('QT35 ✖️', ...a);

    // ===== Route guard =====
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!window.TMUtils?.matchRoute?.(ROUTES)) return;

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);

    // ===== Config =====
    const CFG = {
        ACTION_BAR_SEL: '#QuoteWizardSharedActionBar',
        GRID_SEL: '.plex-grid',
        SHOW_ON_PAGES_RE: /review|summary|submit/i,
        DS_ATTACHMENTS_BY_QUOTE: 11713,
        ATTACHMENT_GROUP_KEY: 11,
        DS_QUOTE_HEADER_GET: 3156,
        POLL_MS: 200,
        TIMEOUT_MS: 12_000
    };

    // ===== Utilities =====
    const raf = () => new Promise(r => requestAnimationFrame(r));

    function getActiveWizardPageName() {
        const active = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        if (active) {
            try {
                const vm = KO?.dataFor?.(active);
                const name = vm ? TMUtils.getObsValue(vm, 'name', { first: true, trim: true }) : '';
                if (name) return name;
            } catch { }
        }
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
    }

    function isOnTargetWizardPage() {
        return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName() || '');
    }

    async function ensureWizardVM() {
        const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
        const { viewModel } = await TMUtils.waitForModelAsync(anchor, {
            pollMs: CFG.POLL_MS,
            timeoutMs: CFG.TIMEOUT_MS,
            requireKo: true
        });
        return viewModel;
    }

    // ===== QuoteKey (deterministic) =====
    function getQuoteKeyDeterministic() {
        try {
            const grid = document.querySelector(CFG.GRID_SEL);
            if (grid && KO?.dataFor) {
                const gridVM = KO.dataFor(grid);
                const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
                const v = raw0 ? TMUtils.getObsValue(raw0, 'QuoteKey') : null;
                if (v != null) return Number(v);
            }
        } catch { }
        try {
            const rootEl = document.querySelector('.plex-wizard, .plex-page');
            const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
            const v = rootVM && (TMUtils.getObsValue(rootVM, 'QuoteKey') || TMUtils.getObsValue(rootVM, 'Quote.QuoteKey'));
            if (v != null) return Number(v);
        } catch { }
        const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
        return m ? Number(m[1]) : null;
    }

    // ===== Minimal per-tab/per-quote data shim (prefers lt-data-core) =====
    const DataCore = (() => {
        if (window.lt?.data?.createDataContext && window.lt?.data?.RepoBase) {
            return {
                create(ns, scopeKey) {
                    const ctx = window.lt.data.createDataContext({ ns, scopeKey, persist: 'session', ttlMs: 3000 });
                    return { makeRepo: ctx.makeRepo, scopeKey, tabId: ctx.tabId };
                },
                RepoBase: window.lt.data.RepoBase
            };
        }
        // Fallback shim (session only)
        const getTabId = () => {
            let id = sessionStorage.getItem('lt.tabId');
            if (!id) { id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); sessionStorage.setItem('lt.tabId', id); }
            return id;
        };
        class SessionStore { get(k) { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); } del(k) { sessionStorage.removeItem(k); } }
        class Cache { constructor(ttl = 3000) { this.ttl = ttl; this.m = new Map(); } get(k) { const e = this.m.get(k); if (!e) return null; if (Date.now() > e.expires) { this.m.delete(k); return null; } return e.value; } set(k, v) { this.m.set(k, { value: v, expires: Date.now() + this.ttl }); } del(k) { this.m.delete(k); } }
        class RepoBase {
            constructor({ ns, entity, scopeKey }) {
                if (!scopeKey) throw new Error(`${entity} repo requires scopeKey`);
                Object.assign(this, { ns, entity, scopeKey, tabId: getTabId(), store: new SessionStore(), cache: new Cache(3000) });
            }
            k(id = 'current') { return `lt:${this.ns}:tab:${this.tabId}:scope:${this.scopeKey}:${this.entity}:${id}`; }
            getCached(id) { return this.cache.get(this.k(id)); }
            setCached(id, v) { this.cache.set(this.k(id), v); }
            async read(id) { const k = this.k(id); const c = this.getCached(id); if (c) return c; const v = this.store.get(k); if (v) this.setCached(id, v); return v ?? null; }
            async write(id, v) { const k = this.k(id); this.store.set(k, v); this.setCached(id, v); return v; }
            async remove(id) { const k = this.k(id); this.store.del(k); this.cache.del(k); }
        }
        function create(ns, scopeKey) { const base = { ns, scopeKey }; const makeRepo = (Ctor) => new Ctor(base); return { makeRepo, scopeKey, tabId: getTabId() }; }
        return { create, RepoBase };
    })();

    class QuoteRepo extends DataCore.RepoBase {
        constructor(base) { super(Object.assign({ entity: 'quote' }, base)); }
        async get() { return await this.read('current'); }
        async set(m) { return await this.write('current', m); }
        async update(patch) { const cur = (await this.get()) ?? {}; return await this.set({ ...cur, ...patch, Updated_At: Date.now() }); }
        async clear() { await this.remove('current'); }
    }

    let ctx = null, quoteRepo = null, lastScope = null, refreshInFlight = false;

    async function ensureRepoForQuote(qk) {
        if (!qk) return null;
        if (!ctx || lastScope !== qk) {
            ctx = DataCore.create('QT', qk);
            quoteRepo = ctx.makeRepo(QuoteRepo);
            lastScope = qk;
        }
        return quoteRepo;
    }

    // ===== Data source =====
    async function fetchAttachmentCount(quoteKey) {
        const rows = await lt.core.plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
            Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
            Record_Key_Value: String(quoteKey)
        });
        return Array.isArray(rows) ? rows.length : 0;
    }

    // ===== Merge QT10 draft → per-quote (runs once when Quote_Key exists) =====
    async function mergeDraftIntoQuoteOnce(qk) {
        if (!qk) return;
        // QT10 writes draft under scope 'draft' with entity 'quote'
        const draftCtx = DataCore.create('QT', 'draft');
        const draftRepo = draftCtx.makeRepo(QuoteRepo);

        const draft = await draftRepo.get();
        if (!draft) return;

        await ensureRepoForQuote(qk);
        const current = (await quoteRepo.get()) || {};

        const merged = {
            ...current,
            Quote_Key: qk,
            // Fill only if missing to avoid clobbering
            Customer_No: current.Customer_No ?? draft.Customer_No ?? null,
            Catalog_Key: current.Catalog_Key ?? draft.Catalog_Key ?? null,
            Catalog_Code: current.Catalog_Code ?? draft.Catalog_Code ?? null,
            Promoted_From: 'draft',
            Promoted_At: Date.now(),
        };

        await quoteRepo.set(merged);
        await draftRepo.clear(); // IMPORTANT: remove draft so only the per-quote record remains
        dlog('Draft merged → quote and cleared', { qk, merged });
    }

    // ===== UI =====
    const LI_ID = 'lt-attachments-badge';
    const PILL_ID = 'lt-attach-pill';

    function ensureBadge() {
        const bar = document.querySelector(CFG.ACTION_BAR_SEL);
        if (!bar || bar.tagName !== 'UL') return null;

        const existing = document.getElementById(LI_ID);
        if (existing) return existing;

        const li = document.createElement('li');
        li.id = LI_ID;

        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.title = 'Refresh attachments (manual)';

        const pill = document.createElement('span');
        pill.id = PILL_ID;
        Object.assign(pill.style, {
            display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
            background: '#999', color: '#fff', fontWeight: '600'
        });
        pill.textContent = 'Attachments: …';

        a.appendChild(pill);
        a.addEventListener('click', () => manualRefresh(), { passive: true });
        li.appendChild(a);
        bar.appendChild(li);

        return li;
    }

    function setBadge(n) {
        const pill = document.getElementById(PILL_ID);
        if (!pill) return;
        let text, bg;
        if (n == null || isNaN(n)) { text = 'Attachments: –'; bg = '#999'; }
        else { text = `Attachments: ${n}`; bg = n > 0 ? '#27ae60' : '#c0392b'; }
        pill.textContent = text;
        pill.style.background = bg;
    }

    // ===== Single-shot refresh (no polling) =====
    async function runOneRefresh(toast = false) {
        if (refreshInFlight) return;
        try {
            refreshInFlight = true;
            setBadge(null);
            await ensureWizardVM();

            const qk = getQuoteKeyDeterministic();
            if (!qk) {
                setBadge(null);
                if (toast) TMUtils.toast('⚠️ Quote Key not found', 'warn', 2200);
                return;
            }

            if (!ctx || lastScope !== qk) {
                await ensureRepoForQuote(qk);

                // instant paint from prior state (no network)
                try {
                    const snap = await quoteRepo.get();
                    if (snap?.Attachment_Count != null) setBadge(Number(snap.Attachment_Count));
                } catch { }
            }

            // merge any draft from QT10 (if still present) before counting attachments
            await mergeDraftIntoQuoteOnce(qk);

            const count = await fetchAttachmentCount(qk);
            setBadge(count);
            await quoteRepo.update({ Quote_Key: qk, Attachment_Count: Number(count) });

            if (toast) {
                TMUtils.toast(count > 0 ? `✅ ${count} attachment(s)` : '⚠️ No attachments',
                    count > 0 ? 'success' : 'warn', 2000);
            }
            dlog('one-shot refresh', { qk, count });
        } catch (err) {
            derr('refresh', err);
            TMUtils.toast(`❌ Attachments refresh failed: ${err?.message || err}`, 'error', 4000);
        } finally {
            refreshInFlight = false;
        }
    }

    // Map DS row -> flat header fields
    function quoteHeaderGet(row) {
        return {
            Customer_Code: row?.Customer_Code ?? null,
            Customer_Name: row?.Customer_Name ?? null,
            Customer_No: row?.Customer_No ?? null,
            Quote_No: row?.Quote_No ?? null,
        };
    }

    async function hydratePartSummaryOnce(qk) {
        await ensureRepoForQuote(qk);
        if (!quoteRepo) return;

        const snap = (await quoteRepo.get()) || {};
        if (snap.Quote_Header_Fetched_At) return; // already hydrated

        const plex = (typeof getPlexFacade === 'function') ? await getPlexFacade() : lt.core.plex;
        const rows = await plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) });

        const first = Array.isArray(rows) && rows.length ? quoteHeaderGet(rows[0]) : null;
        if (!first) return;

        await quoteRepo.update({
            Quote_Key: qk,
            ...first,
            Quote_Header_Fetched_At: Date.now()
        });
    }

    // Manual refresh (click)
    function manualRefresh() { runOneRefresh(true); }

    // ===== Init (single-shot on page load) =====
    async function init() {
        await raf();
        const li = ensureBadge();
        if (!li) return;

        // Show or hide the badge depending on page; NO auto-refresh here.
        const show = isOnTargetWizardPage();
        li.style.display = show ? '' : 'none';

        if (show) {
            await ensureWizardVM();
            const qk = getQuoteKeyDeterministic();
            if (qk) {
                await ensureRepoForQuote(qk);
                // Merge draft immediately on landing a quote page
                await mergeDraftIntoQuoteOnce(qk);
                // One refresh for attachments
                await runOneRefresh(false);
                // Hydrate header (DS 3156) once
                try { await hydratePartSummaryOnce(qk); } catch (e) { console.error('QT35 hydrate failed', e); }
            }
        }

        dlog('initialized');
    }

    init();

    // ===== Route change handler (single-shot per navigation) =====
    TMUtils.onUrlChange?.(() => {
        if (!window.TMUtils?.matchRoute?.(ROUTES)) return;
        init();
    });
})();
