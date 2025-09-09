// src/quote-tracking/qt35-attachmentsGet/qt35.index.js

(() => {
    'use strict';

    const DEV = (typeof __BUILD_DEV__ !== 'undefined') ? __BUILD_DEV__ : true;
    const dlog = (...a) => DEV && console.debug('QT35', ...a);
    const derr = (...a) => console.error('QT35 ✖️', ...a);

    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!(window.TMUtils && window.TMUtils.matchRoute && window.TMUtils.matchRoute(ROUTES))) return;

    const KO = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.ko : window.ko);
    const raf = () => new Promise(r => requestAnimationFrame(r));

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

    function getActiveWizardPageName() {
        const active = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        if (active) {
            try {
                const vm = KO?.dataFor?.(active);
                const name = vm ? (window.TMUtils?.getObsValue?.(vm, 'Name') || window.TMUtils?.getObsValue?.(vm, 'name')) : '';
                if (name) return String(name);
            } catch { }
        }
        const h = document.querySelector('.wizard-header, .plex-page h1, h1');
        if (h?.textContent) return h.textContent.trim();
        const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav?.textContent || '').trim();
    }
    function isOnTargetWizardPage() { return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName() || ''); }

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

    // ===== DataCore (prefer lt.core.data or lt.data; fallback shim) =====
    const DataCore = (() => {
        const DC = window.lt?.core?.data ?? window.lt?.data ?? null;
        if (DC?.createDataContext && (DC?.RepoBase || DC?.RepoBase?.value)) {
            return {
                create(ns, scopeKey) {
                    const ctx = DC.createDataContext({ ns, scopeKey, persist: 'session', ttlMs: 3000 });
                    try { sessionStorage.setItem('lt.tabId', ctx.tabId); } catch { }
                    return { makeRepo: ctx.makeRepo, scopeKey, tabId: ctx.tabId };
                },
                RepoBase: DC.RepoBase?.value ?? DC.RepoBase
            };
        }
        // Session-backed shim (structure mirrors lt.core.data)
        const getTabId = () => {
            let id = sessionStorage.getItem('lt.tabId');
            if (!id) { id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); sessionStorage.setItem('lt.tabId', id); }
            return id;
        };
        class SessionStore { get(k) { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); } del(k) { sessionStorage.removeItem(k); } }
        class Cache { constructor(ttl = 3000) { this.ttl = ttl; this.m = new Map(); } get(k) { const e = this.m.get(k); if (!e) return null; if (Date.now() > e.expires) { this.m.delete(k); return null; } return e.value; } set(k, v) { this.m.set(k, { value: v, expires: Date.now() + this.ttl }); } del(k) { this.m.delete(k); } }
        class RepoBase {
            constructor({ ns, entity, scopeKey }) { if (!scopeKey) throw new Error(`${entity} repo requires scopeKey`); Object.assign(this, { ns, entity, scopeKey, tabId: getTabId(), store: new SessionStore(), cache: new Cache(3000) }); }
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
        constructor(base) { super({ ...base, entity: 'QuoteHeader' }); }
        async get() { return await this.read('current'); }
        async set(v) { return await this.write('current', v); }
        async clear() { return await this.remove('current'); }
        async update(patch) { const cur = (await this.get()) || {}; return await this.set({ ...cur, ...patch, Updated_At: Date.now() }); }
    }

    let ctx = null, quoteRepo = null, lastScope = null, refreshInFlight = false;

    async function ensureRepoForQuote(qk) {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return null;
        if (!ctx || lastScope !== qk) {
            ctx = DataCore.create('QT', qk);
            quoteRepo = ctx.makeRepo(QuoteRepo);
            lastScope = qk;
        }
        return quoteRepo;
    }

    // ===== 419 re-auth wrapper =====
    async function withFreshAuth(run) {
        try { return await run(); }
        catch (err) {
            const s = err?.status || ((/(\b\d{3}\b)/.exec(err?.message || '') || [])[1]);
            if (+s === 419) { try { await window.lt?.core?.auth?.getKey?.(); } catch { } return await run(); }
            throw err;
        }
    }

    // ===== Merge QT10 draft → per-quote (once) =====
    async function mergeDraftIntoQuoteOnce(qk) {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return;

        const draftCtx = DataCore.create('QT', 'draft');
        const draftRepo = draftCtx.makeRepo(QuoteRepo);
        const draft = await draftRepo.get();
        if (!draft) return;

        await ensureRepoForQuote(qk);
        const current = (await quoteRepo.get()) || {};
        const promotedAt = Number(current.Promoted_At || 0);
        const draftUpdated = Number(draft.Updated_At || 0);

        // Normalize for compare (avoid number vs string mismatches)
        const curCust = String(current.Customer_No ?? '');
        const newCust = String(draft.Customer_No ?? '');

        const needsMerge =
            (draftUpdated > promotedAt) ||
            (curCust !== newCust) ||
            (current.Catalog_Key !== draft.Catalog_Key) ||
            (current.Catalog_Code !== draft.Catalog_Code);

        if (!needsMerge) return;

        const merged = {
            ...current,
            Quote_Key: qk,
            Customer_No: draft.Customer_No ?? null,
            Catalog_Key: draft.Catalog_Key ?? null,
            Catalog_Code: draft.Catalog_Code ?? null,
            Promoted_From: 'draft',
            Promoted_At: Date.now(),
        };

        await quoteRepo.set(merged);

        // Clear the persistent “fetched once” guard so we re-hydrate header for the new customer
        const merged2 = { ...merged };
        delete merged2.Quote_Header_Fetched_At;
        await quoteRepo.set(merged2);
        await draftRepo.clear();
        dlog('Draft merged and cleared (re-promote if newer/different)', { qk, merged });

        // If you adopted the in-memory header fetch guard, clear it so we re-hydrate.
        if (typeof fetchedHeaderOnce !== 'undefined') {
            fetchedHeaderOnce.delete(`${ctx?.tabId || 'shim'}:${qk}`);
        }
    }


    // ===== Data sources =====
    async function fetchAttachmentCount(quoteKey) {
        const rows = await withFreshAuth(() => window.lt.core.plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
            Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
            Record_Key_Value: String(quoteKey)
        }));
        return Array.isArray(rows) ? rows.length : 0;
    }
    function quoteHeaderGet(row) {
        return {
            Customer_Code: row?.Customer_Code ?? null,
            Customer_Name: row?.Customer_Name ?? null,
            Customer_No: row?.Customer_No ?? null,
            Quote_No: row?.Quote_No ?? null
        };
    }
    async function hydratePartSummaryOnce(qk) {
        await ensureRepoForQuote(qk);
        if (!quoteRepo) return;
        const snap = (await quoteRepo.get()) || {};
        if (snap.Quote_Header_Fetched_At) return;

        const plex = (typeof getPlexFacade === 'function') ? await getPlexFacade() : window.lt.core.plex;
        const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
        const first = (Array.isArray(rows) && rows.length) ? quoteHeaderGet(rows[0]) : null;
        if (!first) return;

        await quoteRepo.update({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
    }

    // ===== UI badge =====
    const LI_ID = 'lt-attachments-badge';
    const PILL_ID = 'lt-attach-pill';

    function ensureBadge() {
        const bar = document.querySelector(CFG.ACTION_BAR_SEL);
        if (!bar || bar.tagName !== 'UL') return null;

        const existing = document.getElementById(LI_ID);
        if (existing) return existing;

        const li = document.createElement('li'); li.id = LI_ID;
        const a = document.createElement('a'); a.href = 'javascript:void(0)'; a.title = 'Refresh attachments (manual)';
        const pill = document.createElement('span'); pill.id = PILL_ID;
        Object.assign(pill.style, { display: 'inline-block', minWidth: '18px', padding: '2px 8px', borderRadius: '999px', textAlign: 'center', fontWeight: '600' });

        a.appendChild(document.createTextNode('Attachments '));
        a.appendChild(pill);
        li.appendChild(a);
        bar.appendChild(li);

        a.addEventListener('click', () => runOneRefresh(true));
        return li;
    }
    function setBadgeCount(n) {
        const pill = document.getElementById(PILL_ID);
        if (!pill) return;
        pill.textContent = String(n ?? 0);
        const isZero = !n || n === 0;
        pill.style.background = isZero ? '#e5e7eb' : '#10b981';
        pill.style.color = isZero ? '#111827' : '#fff';
    }

    async function runOneRefresh(manual = false) {
        if (refreshInFlight) return;
        refreshInFlight = true;
        try {
            await ensureWizardVM();
            const qk = getQuoteKeyDeterministic();
            if (!qk || !Number.isFinite(qk) || qk <= 0) {
                setBadgeCount(0);
                if (manual) window.TMUtils?.toast?.('⚠️ Quote Key not found', 'warn', 2200);
                return;
            }

            // If scope changed, paint any existing snapshot before fetching
            if (!ctx || lastScope !== qk) {
                await ensureRepoForQuote(qk);
                try {
                    const snap = await quoteRepo.get();
                    if (snap?.Attachment_Count != null) setBadgeCount(Number(snap.Attachment_Count));
                } catch { }
            }

            // Promote & clear draft BEFORE per-quote updates
            await mergeDraftIntoQuoteOnce(qk);

            const count = await fetchAttachmentCount(qk);
            setBadgeCount(count);
            await quoteRepo.update({ Quote_Key: qk, Attachment_Count: Number(count) });

            if (manual) {
                const ok = count > 0;
                window.TMUtils?.toast?.(ok ? `✅ ${count} attachment(s)` : '⚠️ No attachments', ok ? 'success' : 'warn', 2000);
            }
            dlog('refresh', { qk, count });
        } catch (err) {
            derr('refresh failed', err);
            window.TMUtils?.toast?.(`❌ Attachments refresh failed: ${err?.message || err}`, 'error', 4000);
        } finally {
            refreshInFlight = false;
        }
    }

    // ===== SPA wiring =====
    let booted = false; let offUrl = null;
    function wireNav(handler) { offUrl?.(); offUrl = window.TMUtils?.onUrlChange?.(handler); }

    async function init() {
        if (booted) return;
        booted = true;
        await raf();

        const li = ensureBadge();
        if (!li) return;
        startWizardPageObserver();

        const show = isOnTargetWizardPage();
        li.style.display = show ? '' : 'none';

        if (show) {
            await ensureWizardVM();
            const qk = getQuoteKeyDeterministic();
            if (qk && Number.isFinite(qk) && qk > 0) {
                await ensureRepoForQuote(qk);
                await mergeDraftIntoQuoteOnce(qk);
                await runOneRefresh(false);
                try { await hydratePartSummaryOnce(qk); } catch (e) { console.error('QT35 hydrate failed', e); }
            }
        }
        dlog('initialized');
    }
    function teardown() {
        booted = false;
        offUrl?.();
        offUrl = null;
        stopWizardPageObserver();
    }

    init();

    // Place near other module-level lets
    let lastWizardPage = null;
    let pageObserver = null;

    function startWizardPageObserver() {
        const root = document.querySelector('.plex-wizard') || document.body;
        lastWizardPage = getActiveWizardPageName();
        pageObserver?.disconnect();
        pageObserver = new MutationObserver(() => {
            const name = getActiveWizardPageName();
            if (name !== lastWizardPage) {
                lastWizardPage = name;
                if (isOnTargetWizardPage()) {
                    queueMicrotask(async () => {
                        const qk = getQuoteKeyDeterministic();
                        if (qk && Number.isFinite(qk) && qk > 0) {
                            await ensureRepoForQuote(qk);
                            await mergeDraftIntoQuoteOnce(qk);
                            await runOneRefresh(false);
                            try { await hydratePartSummaryOnce(qk); } catch { }
                        }
                    });
                }
            }
        });
        pageObserver.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'aria-current'] });
    }

    function stopWizardPageObserver() {
        pageObserver?.disconnect();
        pageObserver = null;
    }

    wireNav(() => { if (window.TMUtils?.matchRoute?.(ROUTES)) init(); else teardown(); });
})();
