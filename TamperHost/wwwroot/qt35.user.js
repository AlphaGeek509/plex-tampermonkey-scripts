// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.86
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// // @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.86-1757976972275
// @require      http://localhost:5000/lt-ui-hub.js?v=3.6.86-1757976972275
// @require      http://localhost:5000/lt-core.user.js?v=3.6.86-1757976972275
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.86-1757976972275
// // @resource     THEME_CSS http://localhost:5000/theme.css
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

(() => {
  // src/quote-tracking/qt35-attachmentsGet/qt35.index.js
  (() => {
    "use strict";
    const DEV = true ? true : true;
    const dlog = (...a) => DEV && console.debug("QT35", ...a);
    const derr = (...a) => console.error("QT35 \u2716\uFE0F", ...a);
    const ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const withFreshAuth = (fn) => {
      const impl = lt?.core?.auth?.withFreshAuth;
      return typeof impl === "function" ? impl(fn) : fn();
    };
    const QTF = lt.core?.data?.makeFlatScopedRepo ? lt.core.data.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" }) : null;
    (async () => {
      const dock = await window.ensureLTDock?.();
      dock?.register({
        id: "qt35-attachments",
        label: "Attachments",
        title: "Open QT35 Attachments",
        weight: 120,
        onClick: () => typeof openAttachmentsModal === "function" ? openAttachmentsModal() : lt.core.hub.notify("Attachments UI not available", "warn", { toast: true })
      });
    })();
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some((rx) => rx.test(location.pathname))) return;
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const CFG = {
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      SHOW_ON_PAGES_RE: /^part\s*summary$/i,
      DS_ATTACHMENTS_BY_QUOTE: 11713,
      ATTACHMENT_GROUP_KEY: 11,
      DS_QUOTE_HEADER_GET: 3156,
      POLL_MS: 200,
      TIMEOUT_MS: 12e3
    };
    function getTabScopeId(ns = "QT") {
      try {
        const k = `lt:${ns}:scopeId`;
        let v = sessionStorage.getItem(k);
        if (!v) {
          v = String(Math.floor(Math.random() * 2147483647));
          sessionStorage.setItem(k, v);
        }
        return Number(v);
      } catch {
        return Math.floor(Math.random() * 2147483647);
      }
    }
    function getActiveWizardPageName() {
      const li = document.querySelector(".plex-wizard-page-list .plex-wizard-page.active");
      if (!li) return "";
      return (li.textContent || "").trim().replace(/\s+/g, " ");
    }
    function isOnTargetWizardPage() {
      return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }
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
          const v = raw0 ? window.TMUtils?.getObsValue?.(raw0, "QuoteKey") : null;
          if (v != null) return Number(v);
        }
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
        const v = rootVM && (window.TMUtils?.getObsValue?.(rootVM, "QuoteKey") || window.TMUtils?.getObsValue?.(rootVM, "Quote.QuoteKey"));
        if (v != null) return Number(v);
      } catch {
      }
      const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
      return m ? Number(m[1]) : null;
    }
    let quoteRepo = null, lastScope = null;
    let __QT__ = null;
    async function ensureRepoForQuote(quoteKey) {
      if (!QTF) return null;
      const { repo } = QTF.use(Number(quoteKey));
      quoteRepo = repo;
      lastScope = Number(quoteKey);
      await repo.ensureFromLegacyIfMissing?.();
      return repo;
    }
    const __PROMOTE = { timer: null, tries: 0, max: 120, intervalMs: 250 };
    function schedulePromoteDraftToQuote(quoteKey) {
      if (__PROMOTE.timer) return;
      __PROMOTE.timer = setInterval(async () => {
        try {
          const repoQ = await ensureRepoForQuote(quoteKey);
          if (!QTF || !repoQ) {
            if (++__PROMOTE.tries >= __PROMOTE.max) stopPromote();
            return;
          }
          const { repo: draftRepo } = QTF.use(getTabScopeId("QT"));
          const draft = await (draftRepo.getHeader?.() || draftRepo.get());
          if (draft && Object.keys(draft).length) {
            await repoQ.patchHeader({
              Quote_Key: Number(quoteKey),
              Customer_No: draft.Customer_No ?? null,
              Catalog_Key: draft.Catalog_Key ?? null,
              Catalog_Code: draft.Catalog_Code ?? null,
              Promoted_From: "draft",
              Promoted_At: Date.now(),
              Quote_Header_Fetched_At: null,
              Updated_At: draft.Updated_At || Date.now()
            });
            await draftRepo.clear?.();
            try {
              const { repo: legacy } = QTF.use("draft");
              await legacy.clear?.();
            } catch {
            }
          }
          stopPromote();
        } catch {
        }
      }, __PROMOTE.intervalMs);
    }
    function stopPromote() {
      clearInterval(__PROMOTE.timer);
      __PROMOTE.timer = null;
      __PROMOTE.tries = 0;
    }
    async function mergeDraftIntoQuoteOnce(qk) {
      if (!qk || !Number.isFinite(qk) || qk <= 0) return;
      if (!QTF) {
        schedulePromoteDraftToQuote(qk);
        return;
      }
      const { repo: draftRepo } = QTF.use(getTabScopeId("QT"));
      const draft = await draftRepo.getHeader?.() || await draftRepo.get();
      if (!draft) return;
      await ensureRepoForQuote(qk);
      if (!quoteRepo) return;
      const currentHeader = await quoteRepo.getHeader() || {};
      const curCust = String(currentHeader.Customer_No ?? "");
      const newCust = String(draft.Customer_No ?? "");
      const needsMerge = Number((await draftRepo.get())?.Updated_At || 0) > Number(currentHeader.Promoted_At || 0) || curCust !== newCust || currentHeader.Catalog_Key !== draft.Catalog_Key || currentHeader.Catalog_Code !== draft.Catalog_Code;
      if (!needsMerge) return;
      await quoteRepo.patchHeader({
        Quote_Key: Number(qk),
        Customer_No: draft.Customer_No ?? null,
        Catalog_Key: draft.Catalog_Key ?? null,
        Catalog_Code: draft.Catalog_Code ?? null,
        Promoted_From: "draft",
        Promoted_At: Date.now(),
        // force re-hydration next time
        Quote_Header_Fetched_At: null
      });
      await draftRepo.clear?.();
      try {
        const { repo: legacy } = QTF.use("draft");
        await legacy.clear?.();
      } catch {
      }
      dlog("Draft merged (flat repo header updated)", { qk });
    }
    async function fetchAttachmentCount(quoteKey) {
      const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : ROOT.lt?.core?.plex;
      if (!plex?.dsRows) return 0;
      const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
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
      const headerSnap = await quoteRepo.getHeader() || {};
      if (headerSnap.Quote_Header_Fetched_At) return;
      const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : ROOT.lt?.core?.plex;
      if (!plex?.dsRows) return;
      const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
      const first = Array.isArray(rows) && rows.length ? quoteHeaderGet(rows[0]) : null;
      if (!first) return;
      await quoteRepo.patchHeader({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
    }
    const HUB_BTN_ID = "qt35-attachments-btn";
    function ensureHubButton() {
      try {
        await(window.ensureLTHub?.());
      } catch {
      }
      lt.core.hub.registerButton({
        id: HUB_BTN_ID,
        label: "Attachments 0",
        title: "Refresh attachments (manual)",
        section: "left",
        weight: 120,
        onClick: () => runOneRefresh(true)
      });
    }
    function setBadgeCount(n) {
      const count = Number(n ?? 0);
      try {
        await(window.ensureLTHub?.());
      } catch {
      }
      lt.core.hub.registerButton({
        id: HUB_BTN_ID,
        label: `Attachments ${count}`,
        title: "Refresh attachments (manual)",
        section: "left",
        weight: 120,
        onClick: () => runOneRefresh(true)
      });
    }
    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
      ensureHubButton();
      if (refreshInFlight) return;
      refreshInFlight = true;
      const t = lt.core.hub.beginTask("Fetching Attachments\u2026", "info");
      try {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        if (!qk || !Number.isFinite(qk) || qk <= 0) {
          setBadgeCount(0);
          t.error(`\u26A0\uFE0F Quote Key not found`, 4e3);
          return;
        }
        if (!quoteRepo || lastScope !== qk) {
          await ensureRepoForQuote(qk);
          try {
            const head = await quoteRepo?.getHeader?.();
            if (head?.Attachment_Count != null) setBadgeCount(Number(head.Attachment_Count));
          } catch {
          }
        }
        await mergeDraftIntoQuoteOnce(qk);
        if (!quoteRepo) {
          t.error("Data context not ready yet", 2e3);
          return;
        }
        const count = await fetchAttachmentCount(qk);
        setBadgeCount(count);
        await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });
        const ok = count > 0;
        t.success(ok ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments", 2e3);
        if (manual) {
          lt.core.hub.notify(
            ok ? "success" : "warn",
            ok ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments",
            { timeout: 2e3, toast: true }
          );
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        t.error(`\u274C Attachments refresh failed: ${err?.message || err}`, 4e3);
        lt.core.hub.notify(
          "error",
          `\u274C Attachments refresh failed: ${err?.message || err}`,
          { timeout: 4e3, toast: true }
        );
      } finally {
        refreshInFlight = false;
      }
    }
    let booted = false;
    let offUrl = null;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    async function init() {
      if (booted) return;
      booted = true;
      await raf();
      try {
        await window.ensureLTHub?.();
      } catch {
      }
      ensureHubButton();
      startWizardPageObserver();
      reconcileHubButtonVisibility();
      const show = isOnTargetWizardPage();
      if (show) {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        schedulePromoteDraftToQuote(qk);
        if (qk && Number.isFinite(qk) && qk > 0) {
          quoteRepo = await ensureRepoForQuote(qk);
          await mergeDraftIntoQuoteOnce(qk);
          await runOneRefresh(false);
          try {
            await hydratePartSummaryOnce(qk);
          } catch (e) {
            console.error("QT35 hydrate failed", e);
          }
        } else {
          setBadgeCount(0);
        }
      } else {
        setBadgeCount(0);
        lt.core.hub.remove?.(HUB_BTN_ID);
      }
      dlog("initialized");
    }
    function teardown() {
      booted = false;
      offUrl?.();
      offUrl = null;
      stopWizardPageObserver();
    }
    init();
    let lastWizardPage = null;
    let pageObserver = null;
    function startWizardPageObserver() {
      const root = document.querySelector(".plex-wizard-page-list");
      if (!root) return;
      const obs = new MutationObserver((mut) => {
        if (mut.some((m) => m.type === "attributes" || m.type === "childList")) {
          reconcileHubButtonVisibility();
        }
      });
      obs.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
      window.addEventListener("hashchange", reconcileHubButtonVisibility);
    }
    async function reconcileHubButtonVisibility() {
      if (isOnTargetWizardPage()) {
        await ensureHubButton();
      } else {
        lt.core.hub.remove?.(HUB_BTN_ID);
      }
    }
    function stopWizardPageObserver() {
      pageObserver?.disconnect();
      pageObserver = null;
    }
    wireNav(() => {
      if (ROUTES.some((rx) => rx.test(location.pathname))) init();
      else teardown();
    });
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzXHJcblxyXG4oKCkgPT4ge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XHJcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDM1JywgLi4uYSk7XHJcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcclxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xyXG5cclxuICAgIC8vIFNhZmUgZGVsZWdhdGluZyB3cmFwcGVyOiB1c2UgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggd2hlbiBhdmFpbGFibGUsXHJcbiAgICAvLyBvdGhlcndpc2UganVzdCBydW4gdGhlIGNhbGxiYWNrIG9uY2UgKGJlc3QtZWZmb3J0IGZhbGxiYWNrKS5cclxuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcclxuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XHJcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XHJcbiAgICB9O1xyXG5cclxuXHJcbiAgICAvLyBGbGF0IHJlcG8gZmFjdG9yeSAobm8gcG9sbGluZyByZXF1aXJlZCBub3cgdGhhdCBsdC1kYXRhLWNvcmUgaW5zdGFsbHMgYXQgZG9jLXN0YXJ0KVxyXG4gICAgY29uc3QgUVRGID0gbHQuY29yZT8uZGF0YT8ubWFrZUZsYXRTY29wZWRSZXBvXHJcbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6IFwiUVRcIiwgZW50aXR5OiBcInF1b3RlXCIsIGxlZ2FjeUVudGl0eTogXCJRdW90ZUhlYWRlclwiIH0pXHJcbiAgICAgICAgOiBudWxsO1xyXG5cclxuICAgIChhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgLy8gZW5zdXJlTFREb2NrIGlzIHByb3ZpZGVkIGJ5IEByZXF1aXJlXHUyMDE5ZCBsdC11aS1kb2NrLmpzXHJcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xyXG4gICAgICAgIGRvY2s/LnJlZ2lzdGVyKHtcclxuICAgICAgICAgICAgaWQ6ICdxdDM1LWF0dGFjaG1lbnRzJyxcclxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXHJcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRVDM1IEF0dGFjaG1lbnRzJyxcclxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXHJcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+ICh0eXBlb2Ygb3BlbkF0dGFjaG1lbnRzTW9kYWwgPT09ICdmdW5jdGlvbidcclxuICAgICAgICAgICAgICAgID8gb3BlbkF0dGFjaG1lbnRzTW9kYWwoKVxyXG4gICAgICAgICAgICAgICAgOiBsdC5jb3JlLmh1Yi5ub3RpZnkoJ0F0dGFjaG1lbnRzIFVJIG5vdCBhdmFpbGFibGUnLCAnd2FybicsIHsgdG9hc3Q6IHRydWUgfSkpXHJcbiAgICAgICAgfSk7XHJcbiAgICB9KSgpO1xyXG5cclxuXHJcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xyXG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XHJcblxyXG4gICAgY29uc3QgQ0ZHID0ge1xyXG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcclxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxyXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxyXG4gICAgICAgIERTX0FUVEFDSE1FTlRTX0JZX1FVT1RFOiAxMTcxMyxcclxuICAgICAgICBBVFRBQ0hNRU5UX0dST1VQX0tFWTogMTEsXHJcbiAgICAgICAgRFNfUVVPVEVfSEVBREVSX0dFVDogMzE1NixcclxuICAgICAgICBQT0xMX01TOiAyMDAsXHJcbiAgICAgICAgVElNRU9VVF9NUzogMTIwMDBcclxuICAgIH07XHJcblxyXG4gICAgLy8gPT09IFBlci10YWIgc2NvcGUgaWQgKHNhbWUgYXMgUVQxMCkgPT09XHJcblxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRhYlNjb3BlSWQobnMgPSAnUVQnKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgayA9IGBsdDoke25zfTpzY29wZUlkYDtcclxuICAgICAgICAgICAgbGV0IHYgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGspO1xyXG4gICAgICAgICAgICBpZiAoIXYpIHtcclxuICAgICAgICAgICAgICAgIHYgPSBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0NykpO1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbShrLCB2KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xyXG4gICAgICAgIC8vIEFjdGl2ZSBMSSByZW5kZXJzIHRoZSBwYWdlIG5hbWUgYXMgYSBkaXJlY3QgdGV4dCBub2RlXHJcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xyXG4gICAgICAgIGlmICghbGkpIHJldHVybiAnJztcclxuICAgICAgICByZXR1cm4gKGxpLnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkge1xyXG4gICAgICAgIHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVXaXphcmRWTSgpIHtcclxuICAgICAgICBjb25zdCBhbmNob3IgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCkgPyBDRkcuR1JJRF9TRUwgOiBDRkcuQUNUSU9OX0JBUl9TRUw7XHJcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcclxuICAgICAgICByZXR1cm4gdmlld01vZGVsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpO1xyXG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gS08uZGF0YUZvcihncmlkKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJhdzAgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhd1swXSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIHsgfVxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xyXG4gICAgICAgICAgICBjb25zdCB2ID0gcm9vdFZNICYmICh3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZUtleScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlLlF1b3RlS2V5JykpO1xyXG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xyXG4gICAgICAgIHJldHVybiBtID8gTnVtYmVyKG1bMV0pIDogbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcclxuICAgIGxldCBfX1FUX18gPSBudWxsO1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xyXG4gICAgICAgIGlmICghUVRGKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCB7IHJlcG8gfSA9IFFURi51c2UoTnVtYmVyKHF1b3RlS2V5KSk7XHJcbiAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgICAgICAgICAgICAgICAgIC8vIDwtLSBiaW5kIHRoZSBtb2R1bGUtbGV2ZWwgaGFuZGxlXHJcbiAgICAgICAgbGFzdFNjb3BlID0gTnVtYmVyKHF1b3RlS2V5KTsgICAgIC8vIDwtLSB0cmFjayBzY29wZSB3ZVx1MjAxOXJlIGJvdW5kIHRvXHJcbiAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcclxuICAgICAgICByZXR1cm4gcmVwbztcclxuICAgIH1cclxuXHJcblxyXG5cclxuXHJcbiAgICAvLyBCYWNrZ3JvdW5kIHByb21vdGlvbiAocGVyLXRhYiBkcmFmdCAtPiBwZXItcXVvdGUpIHdpdGggZ2VudGxlIHJldHJpZXNcclxuICAgIGNvbnN0IF9fUFJPTU9URSA9IHsgdGltZXI6IG51bGwsIHRyaWVzOiAwLCBtYXg6IDEyMCwgaW50ZXJ2YWxNczogMjUwIH07XHJcblxyXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHF1b3RlS2V5KSB7XHJcbiAgICAgICAgaWYgKF9fUFJPTU9URS50aW1lcikgcmV0dXJuO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcG9RID0gYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KTtcclxuICAgICAgICAgICAgICAgIGlmICghUVRGIHx8ICFyZXBvUSkgeyBpZiAoKytfX1BST01PVEUudHJpZXMgPj0gX19QUk9NT1RFLm1heCkgc3RvcFByb21vdGUoKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVhZCB0aGUgU0FNRSBwZXItdGFiIGRyYWZ0IHNjb3BlIFFUMTAgd3JpdGVzIHRvXHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgKGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGRyYWZ0UmVwby5nZXQoKSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlcG9RLnBhdGNoSGVhZGVyKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocXVvdGVLZXkpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgVXBkYXRlZF9BdDogZHJhZnQuVXBkYXRlZF9BdCB8fCBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc3RvcFByb21vdGUoKTtcclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICAvLyBrZWVwIHJldHJ5aW5nXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCBfX1BST01PVEUuaW50ZXJ2YWxNcyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3RvcFByb21vdGUoKSB7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbChfX1BST01PVEUudGltZXIpO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IG51bGw7XHJcbiAgICAgICAgX19QUk9NT1RFLnRyaWVzID0gMDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gPT09PT0gTWVyZ2UgUVQxMCBkcmFmdCBcdTIxOTIgcGVyLXF1b3RlIChvbmNlKSA9PT09PVxyXG4gICAgYXN5bmMgZnVuY3Rpb24gbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspIHtcclxuICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFRVEYpIHsgc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHFrKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgIC8vIFJlYWQgcGVyLXRhYiBkcmFmdCAoc2FtZSBzY29wZSBRVDEwIHdyaXRlcyB0bylcclxuICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICBjb25zdCBkcmFmdCA9IGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGF3YWl0IGRyYWZ0UmVwby5nZXQoKTsgLy8gdG9sZXJhdGUgbGVnYWN5XHJcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47IC8vIERDIG5vdCByZWFkeSB5ZXRcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWRlciA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyKCkpIHx8IHt9O1xyXG4gICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudEhlYWRlci5DdXN0b21lcl9ObyA/PyAnJyk7XHJcbiAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdC5DdXN0b21lcl9ObyA/PyAnJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxyXG4gICAgICAgICAgICAoTnVtYmVyKChhd2FpdCBkcmFmdFJlcG8uZ2V0KCkpPy5VcGRhdGVkX0F0IHx8IDApID4gTnVtYmVyKGN1cnJlbnRIZWFkZXIuUHJvbW90ZWRfQXQgfHwgMCkpIHx8XHJcbiAgICAgICAgICAgIChjdXJDdXN0ICE9PSBuZXdDdXN0KSB8fFxyXG4gICAgICAgICAgICAoY3VycmVudEhlYWRlci5DYXRhbG9nX0tleSAhPT0gZHJhZnQuQ2F0YWxvZ19LZXkpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50SGVhZGVyLkNhdGFsb2dfQ29kZSAhPT0gZHJhZnQuQ2F0YWxvZ19Db2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFuZWVkc01lcmdlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7XHJcbiAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHFrKSxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IGRyYWZ0LkN1c3RvbWVyX05vID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDYXRhbG9nX0NvZGU6IGRyYWZ0LkNhdGFsb2dfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtaHlkcmF0aW9uIG5leHQgdGltZVxyXG4gICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBjbGVhciBwZXItdGFiIGRyYWZ0IGFuZCBsZWdhY3kgaWYgcHJlc2VudFxyXG4gICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG5cclxuICAgICAgICBkbG9nKCdEcmFmdCBtZXJnZWQgKGZsYXQgcmVwbyBoZWFkZXIgdXBkYXRlZCknLCB7IHFrIH0pO1xyXG4gICAgfVxyXG5cclxuXHJcblxyXG4gICAgLy8gPT09PT0gRGF0YSBzb3VyY2VzID09PT09XHJcbiAgICBhc3luYyBmdW5jdGlvbiBmZXRjaEF0dGFjaG1lbnRDb3VudChxdW90ZUtleSkge1xyXG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIikgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiAoUk9PVC5sdD8uY29yZT8ucGxleCk7XHJcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybiAwO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19BVFRBQ0hNRU5UU19CWV9RVU9URSwge1xyXG4gICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogQ0ZHLkFUVEFDSE1FTlRfR1JPVVBfS0VZLFxyXG4gICAgICAgICAgICBSZWNvcmRfS2V5X1ZhbHVlOiBTdHJpbmcocXVvdGVLZXkpXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHJvd3MpID8gcm93cy5sZW5ndGggOiAwO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHF1b3RlSGVhZGVyR2V0KHJvdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIEN1c3RvbWVyX0NvZGU6IHJvdz8uQ3VzdG9tZXJfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9OYW1lOiByb3c/LkN1c3RvbWVyX05hbWUgPz8gbnVsbCxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IHJvdz8uQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgUXVvdGVfTm86IHJvdz8uUXVvdGVfTm8gPz8gbnVsbFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBhc3luYyBmdW5jdGlvbiBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKSB7XHJcbiAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICBpZiAoIXF1b3RlUmVwbykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlclNuYXAgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpKSB8fCB7fTtcclxuICAgICAgICBpZiAoaGVhZGVyU25hcC5RdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSBcImZ1bmN0aW9uXCIgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiBST09ULmx0Py5jb3JlPy5wbGV4KTtcclxuICAgICAgICBpZiAoIXBsZXg/LmRzUm93cykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFrKSB9KSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpcnN0ID0gKEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGgpID8gcXVvdGVIZWFkZXJHZXQocm93c1swXSkgOiBudWxsO1xyXG4gICAgICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHsgUXVvdGVfS2V5OiBxaywgLi4uZmlyc3QsIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IEh1YiBidXR0b24gPT09PT1cclxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzNS1hdHRhY2htZW50cy1idG4nO1xyXG5cclxuICAgIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcclxuICAgICAgICB0cnkgeyBhd2FpdCh3aW5kb3cuZW5zdXJlTFRIdWI/LigpKTsgfSBjYXRjaCB7IH1cclxuXHJcbiAgICAgICAgLy8gUmVnaXN0ZXJzIChvciB1cGRhdGVzKSBhIGJ1dHRvbiBpbiBvdXIgaHViLiBTZWN0aW9uOiBsZWZ0LlxyXG4gICAgICAgIGx0LmNvcmUuaHViLnJlZ2lzdGVyQnV0dG9uKHtcclxuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXHJcbiAgICAgICAgICAgIGxhYmVsOiAnQXR0YWNobWVudHMgMCcsXHJcbiAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXHJcbiAgICAgICAgICAgIHNlY3Rpb246ICdsZWZ0JyxcclxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXHJcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzZXRCYWRnZUNvdW50KG4pIHtcclxuICAgICAgICBjb25zdCBjb3VudCA9IE51bWJlcihuID8/IDApO1xyXG4gICAgICAgIHRyeSB7IGF3YWl0KHdpbmRvdy5lbnN1cmVMVEh1Yj8uKCkpOyB9IGNhdGNoIHsgfVxyXG5cclxuICAgICAgICBsdC5jb3JlLmh1Yi5yZWdpc3RlckJ1dHRvbih7XHJcbiAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxyXG4gICAgICAgICAgICBsYWJlbDogYEF0dGFjaG1lbnRzICR7Y291bnR9YCxcclxuICAgICAgICAgICAgdGl0bGU6ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJyxcclxuICAgICAgICAgICAgc2VjdGlvbjogJ2xlZnQnLFxyXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcclxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gcnVuT25lUmVmcmVzaCh0cnVlKVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bk9uZVJlZnJlc2gobWFudWFsID0gZmFsc2UpIHtcclxuICAgICAgICBlbnN1cmVIdWJCdXR0b24oKTsgLy8gZ3VhcmFudGVlcyB0aGUgYnV0dG9uIGlzIHByZXNlbnRcclxuICAgICAgICBpZiAocmVmcmVzaEluRmxpZ2h0KSByZXR1cm47XHJcbiAgICAgICAgcmVmcmVzaEluRmxpZ2h0ID0gdHJ1ZTtcclxuICAgICAgICBjb25zdCB0ID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKFwiRmV0Y2hpbmcgQXR0YWNobWVudHNcdTIwMjZcIiwgXCJpbmZvXCIpO1xyXG5cclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICAgICAgdC5lcnJvcihgXHUyNkEwXHVGRTBGIFF1b3RlIEtleSBub3QgZm91bmRgLCA0MDAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xyXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0gYXdhaXQgcXVvdGVSZXBvPy5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChoZWFkPy5BdHRhY2htZW50X0NvdW50ICE9IG51bGwpIHNldEJhZGdlQ291bnQoTnVtYmVyKGhlYWQuQXR0YWNobWVudF9Db3VudCkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gUHJvbW90ZSAmIGNsZWFyIGRyYWZ0IEJFRk9SRSBwZXItcXVvdGUgdXBkYXRlc1xyXG4gICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBEQyBpc24ndCByZWFkeSB5ZXQsIHJlc29sdmUgdGhlIHRhc2sgc28gdGhlIHBpbGwgZG9lc25cdTIwMTl0IHNwaW4gZm9yZXZlclxyXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbykge1xyXG4gICAgICAgICAgICAgICAgdC5lcnJvcignRGF0YSBjb250ZXh0IG5vdCByZWFkeSB5ZXQnLCAyMDAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgY291bnQgPSBhd2FpdCBmZXRjaEF0dGFjaG1lbnRDb3VudChxayk7XHJcbiAgICAgICAgICAgIHNldEJhZGdlQ291bnQoY291bnQpO1xyXG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXIoeyBRdW90ZV9LZXk6IHFrLCBBdHRhY2htZW50X0NvdW50OiBOdW1iZXIoY291bnQpIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQWx3YXlzIHJlc29sdmUgdGhlIHRhc2tcclxuICAgICAgICAgICAgY29uc3Qgb2sgPSBjb3VudCA+IDA7XHJcbiAgICAgICAgICAgIHQuc3VjY2VzcyhvayA/IGBcdTI3MDUgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnXHUyNkEwXHVGRTBGIE5vIGF0dGFjaG1lbnRzJywgMjAwMCk7XHJcblxyXG4gICAgICAgICAgICAvLyBPcHRpb25hbCB0b2FzdCB3aGVuIHVzZXIgY2xpY2tlZCBtYW51YWxseVxyXG4gICAgICAgICAgICBpZiAobWFudWFsKSB7XHJcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXHJcbiAgICAgICAgICAgICAgICAgICAgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsXHJcbiAgICAgICAgICAgICAgICAgICAgb2sgPyBgXHUyNzA1ICR7Y291bnR9IGF0dGFjaG1lbnQocylgIDogJ1x1MjZBMFx1RkUwRiBObyBhdHRhY2htZW50cycsXHJcbiAgICAgICAgICAgICAgICAgICAgeyB0aW1lb3V0OiAyMDAwLCB0b2FzdDogdHJ1ZSB9XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGRsb2coJ3JlZnJlc2gnLCB7IHFrLCBjb3VudCB9KTtcclxuXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGRlcnIoJ3JlZnJlc2ggZmFpbGVkJywgZXJyKTtcclxuICAgICAgICAgICAgdC5lcnJvcihgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgNDAwMCk7XHJcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcclxuICAgICAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICBgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCxcclxuICAgICAgICAgICAgICAgIHsgdGltZW91dDogNDAwMCwgdG9hc3Q6IHRydWUgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gPT09PT0gU1BBIHdpcmluZyA9PT09PVxyXG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcclxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xyXG4gICAgICAgIGJvb3RlZCA9IHRydWU7XHJcbiAgICAgICAgYXdhaXQgcmFmKCk7XHJcblxyXG4gICAgICAgIHRyeSB7IGF3YWl0ICh3aW5kb3cuZW5zdXJlTFRIdWI/LigpKTsgfSBjYXRjaCB7IH1cclxuICAgICAgICBlbnN1cmVIdWJCdXR0b24oKTtcclxuXHJcbiAgICAgICAgc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuICAgICAgICByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNob3cgPSBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpO1xyXG4gICAgICAgIGlmIChzaG93KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xyXG4gICAgICAgICAgICBzY2hlZHVsZVByb21vdGVEcmFmdFRvUXVvdGUocWspO1xyXG5cclxuICAgICAgICAgICAgaWYgKHFrICYmIE51bWJlci5pc0Zpbml0ZShxaykgJiYgcWsgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBxdW90ZVJlcG8gPSBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgcnVuT25lUmVmcmVzaChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdRVDM1IGh5ZHJhdGUgZmFpbGVkJywgZSk7IH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgaHViIGJ1dHRvbiBleGlzdHMgd2l0aCB6ZXJvIHdoZW4gd2UgY2FuXHUyMDE5dCBkZXRlY3QgYSBxdW90ZSB5ZXRcclxuICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQoMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBOb3Qgb24gYSB0YXJnZXQgcGFnZTogc2hvdyBhIGJlbmlnbiBkZWZhdWx0XHJcbiAgICAgICAgICAgIHNldEJhZGdlQ291bnQoMCk7XHJcbiAgICAgICAgICAgIC8vIE9mZiB0YXJnZXQgcGFnZTogbWFrZSBzdXJlIHRoZSBidXR0b24gaXMgZ29uZVxyXG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5yZW1vdmU/LihIVUJfQlROX0lEKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRsb2coJ2luaXRpYWxpemVkJyk7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcclxuICAgICAgICBib290ZWQgPSBmYWxzZTtcclxuICAgICAgICBvZmZVcmw/LigpO1xyXG4gICAgICAgIG9mZlVybCA9IG51bGw7XHJcbiAgICAgICAgc3RvcFdpemFyZFBhZ2VPYnNlcnZlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQoKTtcclxuXHJcbiAgICAvLyBQbGFjZSBuZWFyIG90aGVyIG1vZHVsZS1sZXZlbCBsZXRzXHJcbiAgICBsZXQgbGFzdFdpemFyZFBhZ2UgPSBudWxsO1xyXG4gICAgbGV0IHBhZ2VPYnNlcnZlciA9IG51bGw7XHJcblxyXG4gICAgZnVuY3Rpb24gc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XHJcbiAgICAgICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcclxuICAgICAgICBpZiAoIXJvb3QpIHJldHVybjtcclxuICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGNsYXNzIGZsaXBzIG9yIGNoaWxkIGNoYW5nZXMgaW5kaWNhdGUgcGFnZSBjaGFuZ2VcclxuICAgICAgICAgICAgaWYgKG11dC5zb21lKG0gPT4gbS50eXBlID09PSAnYXR0cmlidXRlcycgfHwgbS50eXBlID09PSAnY2hpbGRMaXN0JykpIHtcclxuICAgICAgICAgICAgICAgIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIG9icy5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10sIGNoaWxkTGlzdDogdHJ1ZSB9KTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKSB7XHJcbiAgICAgICAgaWYgKGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbHQuY29yZS5odWIucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vZnVuY3Rpb24gc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XHJcbiAgICAvLyAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkJykgfHwgZG9jdW1lbnQuYm9keTtcclxuICAgIC8vICAgIGxhc3RXaXphcmRQYWdlID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKTtcclxuICAgIC8vICAgIHBhZ2VPYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xyXG4gICAgLy8gICAgcGFnZU9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xyXG4gICAgLy8gICAgICAgIGNvbnN0IG5hbWUgPSBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpO1xyXG4gICAgLy8gICAgICAgIGlmIChuYW1lICE9PSBsYXN0V2l6YXJkUGFnZSkge1xyXG4gICAgLy8gICAgICAgICAgICBsYXN0V2l6YXJkUGFnZSA9IG5hbWU7XHJcbiAgICAvLyAgICAgICAgICAgIGlmIChpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XHJcbiAgICAvLyAgICAgICAgICAgICAgICBxdWV1ZU1pY3JvdGFzayhhc3luYyAoKSA9PiB7XHJcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgIC8vICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgTnVtYmVyLmlzRmluaXRlKHFrKSAmJiBxayA+IDApIHtcclxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBydW5PbmVSZWZyZXNoKGZhbHNlKTtcclxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgYXdhaXQgaHlkcmF0ZVBhcnRTdW1tYXJ5T25jZShxayk7IH0gY2F0Y2ggeyB9XHJcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgLy8gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAvLyAgICAgICAgICAgIH1cclxuICAgIC8vICAgICAgICB9XHJcbiAgICAvLyAgICB9KTtcclxuICAgIC8vICAgIHBhZ2VPYnNlcnZlci5vYnNlcnZlKHJvb3QsIHsgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnY2xhc3MnLCAnYXJpYS1jdXJyZW50J10gfSk7XHJcbiAgICAvL31cclxuXHJcbiAgICBmdW5jdGlvbiBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcclxuXHJcbn0pKCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxHQUFDLE1BQU07QUFDSDtBQUVBLFVBQU0sTUFBTyxPQUF3QyxPQUFnQjtBQUNyRSxVQUFNLE9BQU8sSUFBSSxNQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ3hELFVBQU0sT0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLHFCQUFXLEdBQUcsQ0FBQztBQUNwRCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBSW5FLFVBQU0sZ0JBQWdCLENBQUMsT0FBTztBQUMxQixZQUFNLE9BQU8sSUFBSSxNQUFNLE1BQU07QUFDN0IsYUFBUSxPQUFPLFNBQVMsYUFBYyxLQUFLLEVBQUUsSUFBSSxHQUFHO0FBQUEsSUFDeEQ7QUFJQSxVQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0scUJBQ3JCLEdBQUcsS0FBSyxLQUFLLG1CQUFtQixFQUFFLElBQUksTUFBTSxRQUFRLFNBQVMsY0FBYyxjQUFj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
