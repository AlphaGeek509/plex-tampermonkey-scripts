// src/quote-tracking/qt35-attachmentsGet/qt35.index.js

(() => {
    'use strict';

    const DEV = (typeof __BUILD_DEV__ !== 'undefined') ? __BUILD_DEV__ : true;
    const dlog = (...a) => DEV && console.debug('QT35', ...a);
    const derr = (...a) => console.error('QT35 ✖️', ...a);

    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some(rx => rx.test(location.pathname))) return;

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

    // ===== Repo via lt-data-core flat {header, lines} =====
    let QT = null;
    async function waitForDC(timeoutMs = 20000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const LT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.lt : window.lt);
            if (LT?.core?.data?.createDataContext) {
                // if our factory is already installed, we’re done
                if (LT.core.data.makeFlatScopedRepo) return LT.core.data;
            }
            // small sleep
            await (TMUtils.sleep?.(50) || new Promise(r => setTimeout(r, 50)));
        }
        throw new Error('DataCore not ready');
    }
    async function getQT() {
        if (QT) return QT;
        const DC = await waitForDC();
        // lt-data-core will install the factory soon after DC is ready; if still missing, retry once
        if (!DC.makeFlatScopedRepo) {
            await (TMUtils.sleep?.(50) || new Promise(r => setTimeout(r, 50)));
        }
        QT = DC.makeFlatScopedRepo({ ns: 'QT', entity: 'quote', legacyEntity: 'QuoteHeader' });
        return QT;
    }


    let quoteRepo = null, lastScope = null;
    async function ensureRepoForQuote(qk) {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return null;
        if (!quoteRepo || lastScope !== qk) {
            const { repo } = (await getQT()).use(Number(qk));
            await repo.ensureFromLegacyIfMissing();
            quoteRepo = repo;
            lastScope = qk;
        }
        return quoteRepo;
    }

    // ===== Merge QT10 draft → per-quote (once) =====
    async function mergeDraftIntoQuoteOnce(qk) {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return;

        const { repo: draftRepo } = (await getQT()).use('draft');
        const draft = await draftRepo.getHeader?.() || await draftRepo.get(); // tolerate legacy
        if (!draft) return;

        await ensureRepoForQuote(qk);
        const currentHeader = (await quoteRepo.getHeader()) || {};

        const curCust = String(currentHeader.Customer_No ?? '');
        const newCust = String(draft.Customer_No ?? '');

        const needsMerge =
            (Number((await draftRepo.get())?.Updated_At || 0) > Number(currentHeader.Promoted_At || 0)) ||
            (curCust !== newCust) ||
            (currentHeader.Catalog_Key !== draft.Catalog_Key) ||
            (currentHeader.Catalog_Code !== draft.Catalog_Code);

        if (!needsMerge) return;

        await quoteRepo.patchHeader({
            Quote_Key: Number(qk),
            Customer_No: draft.Customer_No ?? null,
            Catalog_Key: draft.Catalog_Key ?? null,
            Catalog_Code: draft.Catalog_Code ?? null,
            Promoted_From: 'draft',
            Promoted_At: Date.now(),
            // force re-hydration next time
            Quote_Header_Fetched_At: null
        });

        // clear the draft bucket
        await draftRepo.clear?.();
        dlog('Draft merged (flat repo header updated)', { qk });
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
        const headerSnap = (await quoteRepo.getHeader()) || {};
        if (headerSnap.Quote_Header_Fetched_At) return;

        const plex = (typeof getPlexFacade === 'function') ? await getPlexFacade() : window.lt.core.plex;
        const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
        const first = (Array.isArray(rows) && rows.length) ? quoteHeaderGet(rows[0]) : null;
        if (!first) return;

        await quoteRepo.patchHeader({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
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
                    const head = await quoteRepo.getHeader();
                    if (head?.Attachment_Count != null) setBadgeCount(Number(head.Attachment_Count));
                } catch { }
            }

            // Promote & clear draft BEFORE per-quote updates
            await mergeDraftIntoQuoteOnce(qk);

            const count = await fetchAttachmentCount(qk);
            setBadgeCount(count);
            await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });

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

    wireNav(() => { if (ROUTES.some(rx => rx.test(location.pathname))) init(); else teardown(); });

})();
