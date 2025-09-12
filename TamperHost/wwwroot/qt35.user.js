// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.70
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.70-1757638923599
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.70-1757638923599
// @require      http://localhost:5000/lt-core.user.js?v=3.6.70-1757638923599
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.70-1757638923599
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

(() => {
  // src/quote-tracking/qt35-attachmentsGet/qt35.index.js
  (() => {
    "use strict";
    const DEV = true ? true : true;
    const dlog = (...a) => DEV && console.debug("QT35", ...a);
    const derr = (...a) => console.error("QT35 \u2716\uFE0F", ...a);
    const ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const __withFreshAuth = typeof withFreshAuth === "function" ? withFreshAuth : async (fn) => await fn();
    (async () => {
      const dock = await window.ensureLTDock?.();
      dock?.register({
        id: "qt35-attachments",
        label: "Attachments",
        title: "Open QT35 Attachments",
        weight: 120,
        onClick: () => openAttachmentsModal()
      });
    })();
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some((rx) => rx.test(location.pathname))) return;
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const CFG = {
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      SHOW_ON_PAGES_RE: /review|summary|submit/i,
      DS_ATTACHMENTS_BY_QUOTE: 11713,
      ATTACHMENT_GROUP_KEY: 11,
      DS_QUOTE_HEADER_GET: 3156,
      POLL_MS: 200,
      TIMEOUT_MS: 12e3
    };
    function findDC(win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window) {
      try {
        if (win.lt?.core?.data) return win.lt.core.data;
      } catch {
      }
      for (let i = 0; i < win.frames.length; i++) {
        try {
          const dc = findDC(win.frames[i]);
          if (dc) return dc;
        } catch {
        }
      }
      return null;
    }
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
      const active = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
      if (active) {
        try {
          const vm = KO?.dataFor?.(active);
          const name = vm ? window.TMUtils?.getObsValue?.(vm, "Name") || window.TMUtils?.getObsValue?.(vm, "name") : "";
          if (name) return String(name);
        } catch {
        }
      }
      const h = document.querySelector(".wizard-header, .plex-page h1, h1");
      if (h?.textContent) return h.textContent.trim();
      const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
      return (nav?.textContent || "").trim();
    }
    function isOnTargetWizardPage() {
      return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName() || "");
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
    function peekDC() {
      const DC = findDC();
      return DC && DC.createDataContext && DC.makeFlatScopedRepo ? DC : null;
    }
    let quoteRepo = null, lastScope = null;
    let __QT__ = null;
    function tryGetQT() {
      const DC = peekDC();
      if (!DC) return null;
      if (!__QT__) __QT__ = DC.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" });
      return __QT__;
    }
    async function ensureRepoForQuote(quoteKey) {
      const QTF = tryGetQT();
      if (!QTF) return null;
      const { ctx, repo } = QTF.use(Number(quoteKey));
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
          const QTF = tryGetQT();
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
      const QTF = tryGetQT();
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
      const rows = await __withFreshAuth(() => plex.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
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
      const rows = await __withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
      const first = Array.isArray(rows) && rows.length ? quoteHeaderGet(rows[0]) : null;
      if (!first) return;
      await quoteRepo.patchHeader({ Quote_Key: qk, ...first, Quote_Header_Fetched_At: Date.now() });
    }
    const LI_ID = "lt-attachments-badge";
    const PILL_ID = "lt-attach-pill";
    function ensureBadge() {
      const bar = document.querySelector(CFG.ACTION_BAR_SEL);
      if (!bar || bar.tagName !== "UL") return null;
      const existing = document.getElementById(LI_ID);
      if (existing) return existing;
      const li = document.createElement("li");
      li.id = LI_ID;
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.title = "Refresh attachments (manual)";
      const pill = document.createElement("span");
      pill.id = PILL_ID;
      Object.assign(pill.style, { display: "inline-block", minWidth: "18px", padding: "2px 8px", borderRadius: "999px", textAlign: "center", fontWeight: "600" });
      a.appendChild(document.createTextNode("Attachments "));
      a.appendChild(pill);
      li.appendChild(a);
      bar.appendChild(li);
      a.addEventListener("click", () => runOneRefresh(true));
      return li;
    }
    function setBadgeCount(n) {
      const pill = document.getElementById(PILL_ID);
      if (!pill) return;
      pill.textContent = String(n ?? 0);
      const isZero = !n || n === 0;
      pill.style.background = isZero ? "#e5e7eb" : "#10b981";
      pill.style.color = isZero ? "#111827" : "#fff";
    }
    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        if (!qk || !Number.isFinite(qk) || qk <= 0) {
          setBadgeCount(0);
          if (manual) window.TMUtils?.toast?.("\u26A0\uFE0F Quote Key not found", "warn", 2200);
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
        if (!quoteRepo) return;
        const count = await fetchAttachmentCount(qk);
        setBadgeCount(count);
        await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });
        if (manual) {
          const ok = count > 0;
          window.TMUtils?.toast?.(ok ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments", ok ? "success" : "warn", 2e3);
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        window.TMUtils?.toast?.(`\u274C Attachments refresh failed: ${err?.message || err}`, "error", 4e3);
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
      const li = ensureBadge();
      if (!li) return;
      startWizardPageObserver();
      const show = isOnTargetWizardPage();
      li.style.display = show ? "" : "none";
      if (show) {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        schedulePromoteDraftToQuote(qk);
        if (qk && Number.isFinite(qk) && qk > 0) {
          await ensureRepoForQuote(qk);
          await mergeDraftIntoQuoteOnce(qk);
          await runOneRefresh(false);
          try {
            await hydratePartSummaryOnce(qk);
          } catch (e) {
            console.error("QT35 hydrate failed", e);
          }
        }
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
      const root = document.querySelector(".plex-wizard") || document.body;
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
                try {
                  await hydratePartSummaryOnce(qk);
                } catch {
                }
              }
            });
          }
        }
      });
      pageObserver.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "aria-current"] });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzXHJcblxyXG4oKCkgPT4ge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XHJcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDM1JywgLi4uYSk7XHJcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcclxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xyXG4gICAgLy8gVXNlIGdsb2JhbCB3aXRoRnJlc2hBdXRoIGlmIHByZXNlbnQ7IG90aGVyd2lzZSBhIG5vLW9wIHdyYXBwZXJcclxuICAgIGNvbnN0IF9fd2l0aEZyZXNoQXV0aCA9ICh0eXBlb2Ygd2l0aEZyZXNoQXV0aCA9PT0gJ2Z1bmN0aW9uJykgPyB3aXRoRnJlc2hBdXRoIDogYXN5bmMgKGZuKSA9PiBhd2FpdCBmbigpO1xyXG5cclxuICAgIChhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgLy8gZW5zdXJlTFREb2NrIGlzIHByb3ZpZGVkIGJ5IEByZXF1aXJlXHUyMDE5ZCBsdC11aS1kb2NrLmpzXHJcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xyXG4gICAgICAgIGRvY2s/LnJlZ2lzdGVyKHtcclxuICAgICAgICAgICAgaWQ6ICdxdDM1LWF0dGFjaG1lbnRzJyxcclxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXHJcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRVDM1IEF0dGFjaG1lbnRzJyxcclxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXHJcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IG9wZW5BdHRhY2htZW50c01vZGFsKClcclxuICAgICAgICB9KTtcclxuICAgIH0pKCk7XHJcblxyXG5cclxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XHJcbiAgICBpZiAoIVJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IHJhZiA9ICgpID0+IG5ldyBQcm9taXNlKHIgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcclxuXHJcbiAgICBjb25zdCBDRkcgPSB7XHJcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxyXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXHJcbiAgICAgICAgU0hPV19PTl9QQUdFU19SRTogL3Jldmlld3xzdW1tYXJ5fHN1Ym1pdC9pLFxyXG4gICAgICAgIERTX0FUVEFDSE1FTlRTX0JZX1FVT1RFOiAxMTcxMyxcclxuICAgICAgICBBVFRBQ0hNRU5UX0dST1VQX0tFWTogMTEsXHJcbiAgICAgICAgRFNfUVVPVEVfSEVBREVSX0dFVDogMzE1NixcclxuICAgICAgICBQT0xMX01TOiAyMDAsXHJcbiAgICAgICAgVElNRU9VVF9NUzogMTJfMDAwXHJcbiAgICB9O1xyXG5cclxuICAgIC8vID09PSBQZXItdGFiIHNjb3BlIGlkIChzYW1lIGFzIFFUMTApID09PVxyXG4gICAgZnVuY3Rpb24gZmluZERDKHdpbiA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdykpIHtcclxuICAgICAgICB0cnkgeyBpZiAod2luLmx0Py5jb3JlPy5kYXRhKSByZXR1cm4gd2luLmx0LmNvcmUuZGF0YTsgfSBjYXRjaCB7IH1cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdpbi5mcmFtZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdHJ5IHsgY29uc3QgZGMgPSBmaW5kREMod2luLmZyYW1lc1tpXSk7IGlmIChkYykgcmV0dXJuIGRjOyB9IGNhdGNoIHsgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0VGFiU2NvcGVJZChucyA9ICdRVCcpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBrID0gYGx0OiR7bnN9OnNjb3BlSWRgO1xyXG4gICAgICAgICAgICBsZXQgdiA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oayk7XHJcbiAgICAgICAgICAgIGlmICghdikge1xyXG4gICAgICAgICAgICAgICAgdiA9IFN0cmluZyhNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KSk7XHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKGssIHYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBOdW1iZXIodik7XHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgdm0gPSBLTz8uZGF0YUZvcj8uKGFjdGl2ZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdm0gPyAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICdOYW1lJykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICduYW1lJykpIDogJyc7XHJcbiAgICAgICAgICAgICAgICBpZiAobmFtZSkgcmV0dXJuIFN0cmluZyhuYW1lKTtcclxuICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy53aXphcmQtaGVhZGVyLCAucGxleC1wYWdlIGgxLCBoMScpO1xyXG4gICAgICAgIGlmIChoPy50ZXh0Q29udGVudCkgcmV0dXJuIGgudGV4dENvbnRlbnQudHJpbSgpO1xyXG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgICAgIHJldHVybiAobmF2Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7IHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgfHwgJycpOyB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XHJcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpID8gQ0ZHLkdSSURfU0VMIDogQ0ZHLkFDVElPTl9CQVJfU0VMO1xyXG4gICAgICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSBhd2FpdCAod2luZG93LlRNVXRpbHM/LndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwgeyBwb2xsTXM6IENGRy5QT0xMX01TLCB0aW1lb3V0TXM6IENGRy5USU1FT1VUX01TLCByZXF1aXJlS286IHRydWUgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfSk7XHJcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKTtcclxuICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByYXcwID0gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXdbMF0gOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJhdzAgPyB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/LihyYXcwLCAnUXVvdGVLZXknKSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByb290RWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQsIC5wbGV4LXBhZ2UnKTtcclxuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gcm9vdEVsID8gS08/LmRhdGFGb3I/Lihyb290RWwpIDogbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcclxuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcclxuICAgICAgICB9IGNhdGNoIHsgfVxyXG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgICByZXR1cm4gbSA/IE51bWJlcihtWzFdKSA6IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT0gUmVwbyB2aWEgbHQtZGF0YS1jb3JlIGZsYXQge2hlYWRlciwgbGluZXN9ID09PT09XHJcbiAgICBmdW5jdGlvbiBwZWVrREMoKSB7XHJcbiAgICAgICAgY29uc3QgREMgPSBmaW5kREMoKTtcclxuICAgICAgICByZXR1cm4gREMgJiYgREMuY3JlYXRlRGF0YUNvbnRleHQgJiYgREMubWFrZUZsYXRTY29wZWRSZXBvID8gREMgOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBxdW90ZVJlcG8gPSBudWxsLCBsYXN0U2NvcGUgPSBudWxsO1xyXG4gICAgbGV0IF9fUVRfXyA9IG51bGw7XHJcblxyXG4gICAgZnVuY3Rpb24gdHJ5R2V0UVQoKSB7XHJcbiAgICAgICAgY29uc3QgREMgPSBwZWVrREMoKTtcclxuICAgICAgICBpZiAoIURDKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBpZiAoIV9fUVRfXykgX19RVF9fID0gREMubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pO1xyXG4gICAgICAgIHJldHVybiBfX1FUX187XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KSB7XHJcbiAgICAgICAgY29uc3QgUVRGID0gdHJ5R2V0UVQoKTtcclxuICAgICAgICBpZiAoIVFURikgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgY29uc3QgeyBjdHgsIHJlcG8gfSA9IFFURi51c2UoTnVtYmVyKHF1b3RlS2V5KSk7XHJcbiAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgICAgICAgICAgICAgICAgIC8vIDwtLSBwZXJzaXN0IGZvciBsYXRlciBjYWxsZXJzXHJcbiAgICAgICAgbGFzdFNjb3BlID0gTnVtYmVyKHF1b3RlS2V5KTsgICAgIC8vIDwtLSB0cmFjayBzY29wZSB3ZVx1MjAxOXJlIGJvdW5kIHRvXHJcbiAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcclxuICAgICAgICByZXR1cm4gcmVwbztcclxuICAgIH1cclxuXHJcblxyXG5cclxuICAgIC8vIEJhY2tncm91bmQgcHJvbW90aW9uIChwZXItdGFiIGRyYWZ0IC0+IHBlci1xdW90ZSkgd2l0aCBnZW50bGUgcmV0cmllc1xyXG4gICAgY29uc3QgX19QUk9NT1RFID0geyB0aW1lcjogbnVsbCwgdHJpZXM6IDAsIG1heDogMTIwLCBpbnRlcnZhbE1zOiAyNTAgfTtcclxuXHJcbiAgICBmdW5jdGlvbiBzY2hlZHVsZVByb21vdGVEcmFmdFRvUXVvdGUocXVvdGVLZXkpIHtcclxuICAgICAgICBpZiAoX19QUk9NT1RFLnRpbWVyKSByZXR1cm47XHJcbiAgICAgICAgX19QUk9NT1RFLnRpbWVyID0gc2V0SW50ZXJ2YWwoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgUVRGID0gdHJ5R2V0UVQoKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcG9RID0gYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KTtcclxuICAgICAgICAgICAgICAgIGlmICghUVRGIHx8ICFyZXBvUSkgeyBpZiAoKytfX1BST01PVEUudHJpZXMgPj0gX19QUk9NT1RFLm1heCkgc3RvcFByb21vdGUoKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVhZCB0aGUgU0FNRSBwZXItdGFiIGRyYWZ0IHNjb3BlIFFUMTAgd3JpdGVzIHRvXHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgKGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGRyYWZ0UmVwby5nZXQoKSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlcG9RLnBhdGNoSGVhZGVyKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocXVvdGVLZXkpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgVXBkYXRlZF9BdDogZHJhZnQuVXBkYXRlZF9BdCB8fCBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc3RvcFByb21vdGUoKTtcclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICAvLyBrZWVwIHJldHJ5aW5nXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCBfX1BST01PVEUuaW50ZXJ2YWxNcyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3RvcFByb21vdGUoKSB7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbChfX1BST01PVEUudGltZXIpO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IG51bGw7XHJcbiAgICAgICAgX19QUk9NT1RFLnRyaWVzID0gMDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gPT09PT0gTWVyZ2UgUVQxMCBkcmFmdCBcdTIxOTIgcGVyLXF1b3RlIChvbmNlKSA9PT09PVxyXG4gICAgLy8gPT09PT0gTWVyZ2UgUVQxMCBkcmFmdCBcdTIxOTIgcGVyLXF1b3RlIChvbmNlKSA9PT09PVxyXG4gICAgYXN5bmMgZnVuY3Rpb24gbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspIHtcclxuICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgUVRGID0gdHJ5R2V0UVQoKTtcclxuICAgICAgICBpZiAoIVFURikgeyBzY2hlZHVsZVByb21vdGVEcmFmdFRvUXVvdGUocWspOyByZXR1cm47IH1cclxuXHJcbiAgICAgICAgLy8gUmVhZCBwZXItdGFiIGRyYWZ0IChzYW1lIHNjb3BlIFFUMTAgd3JpdGVzIHRvKVxyXG4gICAgICAgIGNvbnN0IHsgcmVwbzogZHJhZnRSZXBvIH0gPSBRVEYudXNlKGdldFRhYlNjb3BlSWQoJ1FUJykpO1xyXG4gICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgZHJhZnRSZXBvLmdldEhlYWRlcj8uKCkgfHwgYXdhaXQgZHJhZnRSZXBvLmdldCgpOyAvLyB0b2xlcmF0ZSBsZWdhY3lcclxuICAgICAgICBpZiAoIWRyYWZ0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XHJcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHJldHVybjsgLy8gREMgbm90IHJlYWR5IHlldFxyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50SGVhZGVyID0gKGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXIoKSkgfHwge307XHJcbiAgICAgICAgY29uc3QgY3VyQ3VzdCA9IFN0cmluZyhjdXJyZW50SGVhZGVyLkN1c3RvbWVyX05vID8/ICcnKTtcclxuICAgICAgICBjb25zdCBuZXdDdXN0ID0gU3RyaW5nKGRyYWZ0LkN1c3RvbWVyX05vID8/ICcnKTtcclxuXHJcbiAgICAgICAgY29uc3QgbmVlZHNNZXJnZSA9XHJcbiAgICAgICAgICAgIChOdW1iZXIoKGF3YWl0IGRyYWZ0UmVwby5nZXQoKSk/LlVwZGF0ZWRfQXQgfHwgMCkgPiBOdW1iZXIoY3VycmVudEhlYWRlci5Qcm9tb3RlZF9BdCB8fCAwKSkgfHxcclxuICAgICAgICAgICAgKGN1ckN1c3QgIT09IG5ld0N1c3QpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50SGVhZGVyLkNhdGFsb2dfS2V5ICE9PSBkcmFmdC5DYXRhbG9nX0tleSkgfHxcclxuICAgICAgICAgICAgKGN1cnJlbnRIZWFkZXIuQ2F0YWxvZ19Db2RlICE9PSBkcmFmdC5DYXRhbG9nX0NvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIW5lZWRzTWVyZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHtcclxuICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocWspLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAvLyBmb3JjZSByZS1oeWRyYXRpb24gbmV4dCB0aW1lXHJcbiAgICAgICAgICAgIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBudWxsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIGNsZWFyIHBlci10YWIgZHJhZnQgYW5kIGxlZ2FjeSBpZiBwcmVzZW50XHJcbiAgICAgICAgYXdhaXQgZHJhZnRSZXBvLmNsZWFyPy4oKTtcclxuICAgICAgICB0cnkgeyBjb25zdCB7IHJlcG86IGxlZ2FjeSB9ID0gUVRGLnVzZSgnZHJhZnQnKTsgYXdhaXQgbGVnYWN5LmNsZWFyPy4oKTsgfSBjYXRjaCB7IH1cclxuXHJcblxyXG4gICAgICAgIGRsb2coJ0RyYWZ0IG1lcmdlZCAoZmxhdCByZXBvIGhlYWRlciB1cGRhdGVkKScsIHsgcWsgfSk7XHJcbiAgICB9XHJcblxyXG5cclxuXHJcbiAgICAvLyA9PT09PSBEYXRhIHNvdXJjZXMgPT09PT1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGZldGNoQXR0YWNobWVudENvdW50KHF1b3RlS2V5KSB7XHJcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgZ2V0UGxleEZhY2FkZSA9PT0gXCJmdW5jdGlvblwiKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IChST09ULmx0Py5jb3JlPy5wbGV4KTtcclxuICAgICAgICBpZiAoIXBsZXg/LmRzUm93cykgcmV0dXJuIDA7XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IF9fd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhDRkcuRFNfQVRUQUNITUVOVFNfQllfUVVPVEUsIHtcclxuICAgICAgICAgICAgQXR0YWNobWVudF9Hcm91cF9LZXk6IENGRy5BVFRBQ0hNRU5UX0dST1VQX0tFWSxcclxuICAgICAgICAgICAgUmVjb3JkX0tleV9WYWx1ZTogU3RyaW5nKHF1b3RlS2V5KVxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShyb3dzKSA/IHJvd3MubGVuZ3RoIDogMDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBxdW90ZUhlYWRlckdldChyb3cpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBDdXN0b21lcl9Db2RlOiByb3c/LkN1c3RvbWVyX0NvZGUgPz8gbnVsbCxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTmFtZTogcm93Py5DdXN0b21lcl9OYW1lID8/IG51bGwsXHJcbiAgICAgICAgICAgIEN1c3RvbWVyX05vOiByb3c/LkN1c3RvbWVyX05vID8/IG51bGwsXHJcbiAgICAgICAgICAgIFF1b3RlX05vOiByb3c/LlF1b3RlX05vID8/IG51bGxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgYXN5bmMgZnVuY3Rpb24gaHlkcmF0ZVBhcnRTdW1tYXJ5T25jZShxaykge1xyXG4gICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XHJcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHJldHVybjtcclxuICAgICAgICBjb25zdCBoZWFkZXJTbmFwID0gKGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXIoKSkgfHwge307XHJcbiAgICAgICAgaWYgKGhlYWRlclNuYXAuUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgZ2V0UGxleEZhY2FkZSA9PT0gXCJmdW5jdGlvblwiID8gYXdhaXQgZ2V0UGxleEZhY2FkZSgpIDogUk9PVC5sdD8uY29yZT8ucGxleCk7XHJcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybjtcclxuICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgX193aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFrKSB9KSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpcnN0ID0gKEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGgpID8gcXVvdGVIZWFkZXJHZXQocm93c1swXSkgOiBudWxsO1xyXG4gICAgICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHsgUXVvdGVfS2V5OiBxaywgLi4uZmlyc3QsIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IFVJIGJhZGdlID09PT09XHJcbiAgICBjb25zdCBMSV9JRCA9ICdsdC1hdHRhY2htZW50cy1iYWRnZSc7XHJcbiAgICBjb25zdCBQSUxMX0lEID0gJ2x0LWF0dGFjaC1waWxsJztcclxuXHJcbiAgICBmdW5jdGlvbiBlbnN1cmVCYWRnZSgpIHtcclxuICAgICAgICBjb25zdCBiYXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5BQ1RJT05fQkFSX1NFTCk7XHJcbiAgICAgICAgaWYgKCFiYXIgfHwgYmFyLnRhZ05hbWUgIT09ICdVTCcpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKExJX0lEKTtcclxuICAgICAgICBpZiAoZXhpc3RpbmcpIHJldHVybiBleGlzdGluZztcclxuXHJcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpOyBsaS5pZCA9IExJX0lEO1xyXG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7IGEuaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknOyBhLnRpdGxlID0gJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknO1xyXG4gICAgICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IHBpbGwuaWQgPSBQSUxMX0lEO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24ocGlsbC5zdHlsZSwgeyBkaXNwbGF5OiAnaW5saW5lLWJsb2NrJywgbWluV2lkdGg6ICcxOHB4JywgcGFkZGluZzogJzJweCA4cHgnLCBib3JkZXJSYWRpdXM6ICc5OTlweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIGZvbnRXZWlnaHQ6ICc2MDAnIH0pO1xyXG5cclxuICAgICAgICBhLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCdBdHRhY2htZW50cyAnKSk7XHJcbiAgICAgICAgYS5hcHBlbmRDaGlsZChwaWxsKTtcclxuICAgICAgICBsaS5hcHBlbmRDaGlsZChhKTtcclxuICAgICAgICBiYXIuYXBwZW5kQ2hpbGQobGkpO1xyXG5cclxuICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gcnVuT25lUmVmcmVzaCh0cnVlKSk7XHJcbiAgICAgICAgcmV0dXJuIGxpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gc2V0QmFkZ2VDb3VudChuKSB7XHJcbiAgICAgICAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFBJTExfSUQpO1xyXG4gICAgICAgIGlmICghcGlsbCkgcmV0dXJuO1xyXG4gICAgICAgIHBpbGwudGV4dENvbnRlbnQgPSBTdHJpbmcobiA/PyAwKTtcclxuICAgICAgICBjb25zdCBpc1plcm8gPSAhbiB8fCBuID09PSAwO1xyXG4gICAgICAgIHBpbGwuc3R5bGUuYmFja2dyb3VuZCA9IGlzWmVybyA/ICcjZTVlN2ViJyA6ICcjMTBiOTgxJztcclxuICAgICAgICBwaWxsLnN0eWxlLmNvbG9yID0gaXNaZXJvID8gJyMxMTE4MjcnIDogJyNmZmYnO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bk9uZVJlZnJlc2gobWFudWFsID0gZmFsc2UpIHtcclxuICAgICAgICBpZiAocmVmcmVzaEluRmxpZ2h0KSByZXR1cm47XHJcbiAgICAgICAgcmVmcmVzaEluRmxpZ2h0ID0gdHJ1ZTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xyXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xyXG4gICAgICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQoMCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobWFudWFsKSB3aW5kb3cuVE1VdGlscz8udG9hc3Q/LignXHUyNkEwXHVGRTBGIFF1b3RlIEtleSBub3QgZm91bmQnLCAnd2FybicsIDIyMDApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBzY29wZSBjaGFuZ2VkLCBwYWludCBhbnkgZXhpc3Rpbmcgc25hcHNob3QgYmVmb3JlIGZldGNoaW5nXHJcbiAgICAgICAgICAgIGlmICghcXVvdGVSZXBvIHx8IGxhc3RTY29wZSAhPT0gcWspIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhlYWQgPSBhd2FpdCBxdW90ZVJlcG8/LmdldEhlYWRlcj8uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWQ/LkF0dGFjaG1lbnRfQ291bnQgIT0gbnVsbCkgc2V0QmFkZ2VDb3VudChOdW1iZXIoaGVhZC5BdHRhY2htZW50X0NvdW50KSk7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBQcm9tb3RlICYgY2xlYXIgZHJhZnQgQkVGT1JFIHBlci1xdW90ZSB1cGRhdGVzXHJcbiAgICAgICAgICAgIGF3YWl0IG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIERDIGlzbid0IHJlYWR5IHlldCwgc2tpcCBxdWlldGx5OyB0aGUgb2JzZXJ2ZXIvbmV4dCBjbGljayB3aWxsIHJldHJ5XHJcbiAgICAgICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IGF3YWl0IGZldGNoQXR0YWNobWVudENvdW50KHFrKTtcclxuICAgICAgICAgICAgc2V0QmFkZ2VDb3VudChjb3VudCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIEF0dGFjaG1lbnRfQ291bnQ6IE51bWJlcihjb3VudCkgfSk7XHJcblxyXG4gICAgICAgICAgICBpZiAobWFudWFsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvayA9IGNvdW50ID4gMDtcclxuICAgICAgICAgICAgICAgIHdpbmRvdy5UTVV0aWxzPy50b2FzdD8uKG9rID8gYFx1MjcwNSAke2NvdW50fSBhdHRhY2htZW50KHMpYCA6ICdcdTI2QTBcdUZFMEYgTm8gYXR0YWNobWVudHMnLCBvayA/ICdzdWNjZXNzJyA6ICd3YXJuJywgMjAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZGxvZygncmVmcmVzaCcsIHsgcWssIGNvdW50IH0pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XHJcbiAgICAgICAgICAgIHdpbmRvdy5UTVV0aWxzPy50b2FzdD8uKGBcdTI3NEMgQXR0YWNobWVudHMgcmVmcmVzaCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCA0MDAwKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgPT09PT1cclxuICAgIGxldCBib290ZWQgPSBmYWxzZTsgbGV0IG9mZlVybCA9IG51bGw7XHJcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xyXG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcclxuICAgICAgICBib290ZWQgPSB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHJhZigpO1xyXG5cclxuICAgICAgICBjb25zdCBsaSA9IGVuc3VyZUJhZGdlKCk7XHJcbiAgICAgICAgaWYgKCFsaSkgcmV0dXJuO1xyXG4gICAgICAgIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNob3cgPSBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpO1xyXG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBzaG93ID8gJycgOiAnbm9uZSc7XHJcblxyXG4gICAgICAgIGlmIChzaG93KSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xyXG4gICAgICAgICAgICBzY2hlZHVsZVByb21vdGVEcmFmdFRvUXVvdGUocWspO1xyXG5cclxuICAgICAgICAgICAgaWYgKHFrICYmIE51bWJlci5pc0Zpbml0ZShxaykgJiYgcWsgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgcnVuT25lUmVmcmVzaChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdRVDM1IGh5ZHJhdGUgZmFpbGVkJywgZSk7IH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XHJcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XHJcbiAgICAgICAgb2ZmVXJsPy4oKTtcclxuICAgICAgICBvZmZVcmwgPSBudWxsO1xyXG4gICAgICAgIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBpbml0KCk7XHJcblxyXG4gICAgLy8gUGxhY2UgbmVhciBvdGhlciBtb2R1bGUtbGV2ZWwgbGV0c1xyXG4gICAgbGV0IGxhc3RXaXphcmRQYWdlID0gbnVsbDtcclxuICAgIGxldCBwYWdlT2JzZXJ2ZXIgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQnKSB8fCBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGxhc3RXaXphcmRQYWdlID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXI/LmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpO1xyXG4gICAgICAgICAgICBpZiAobmFtZSAhPT0gbGFzdFdpemFyZFBhZ2UpIHtcclxuICAgICAgICAgICAgICAgIGxhc3RXaXphcmRQYWdlID0gbmFtZTtcclxuICAgICAgICAgICAgICAgIGlmIChpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcXVldWVNaWNyb3Rhc2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgTnVtYmVyLmlzRmluaXRlKHFrKSAmJiBxayA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBydW5PbmVSZWZyZXNoKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGF3YWl0IGh5ZHJhdGVQYXJ0U3VtbWFyeU9uY2UocWspOyB9IGNhdGNoIHsgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXIub2JzZXJ2ZShyb290LCB7IGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJywgJ2FyaWEtY3VycmVudCddIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKFJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xyXG5cclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUVuRSxVQUFNLGtCQUFtQixPQUFPLGtCQUFrQixhQUFjLGdCQUFnQixPQUFPLE9BQU8sTUFBTSxHQUFHO0FBRXZHLEtB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
