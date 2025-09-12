// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.63
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.63-1757634412391
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.63-1757634412391
// @require      http://localhost:5000/lt-core.user.js?v=3.6.63-1757634412391
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.63-1757634412391
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzXHJcblxyXG4oKCkgPT4ge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XHJcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDM1JywgLi4uYSk7XHJcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcclxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xyXG4gICAgLy8gVXNlIGdsb2JhbCB3aXRoRnJlc2hBdXRoIGlmIHByZXNlbnQ7IG90aGVyd2lzZSBhIG5vLW9wIHdyYXBwZXJcclxuICAgIGNvbnN0IF9fd2l0aEZyZXNoQXV0aCA9ICh0eXBlb2Ygd2l0aEZyZXNoQXV0aCA9PT0gJ2Z1bmN0aW9uJykgPyB3aXRoRnJlc2hBdXRoIDogYXN5bmMgKGZuKSA9PiBhd2FpdCBmbigpO1xyXG5cclxuXHJcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xyXG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XHJcblxyXG4gICAgY29uc3QgQ0ZHID0ge1xyXG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcclxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxyXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9yZXZpZXd8c3VtbWFyeXxzdWJtaXQvaSxcclxuICAgICAgICBEU19BVFRBQ0hNRU5UU19CWV9RVU9URTogMTE3MTMsXHJcbiAgICAgICAgQVRUQUNITUVOVF9HUk9VUF9LRVk6IDExLFxyXG4gICAgICAgIERTX1FVT1RFX0hFQURFUl9HRVQ6IDMxNTYsXHJcbiAgICAgICAgUE9MTF9NUzogMjAwLFxyXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyXzAwMFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyA9PT0gUGVyLXRhYiBzY29wZSBpZCAoc2FtZSBhcyBRVDEwKSA9PT1cclxuICAgIGZ1bmN0aW9uIGZpbmREQyh3aW4gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpKSB7XHJcbiAgICAgICAgdHJ5IHsgaWYgKHdpbi5sdD8uY29yZT8uZGF0YSkgcmV0dXJuIHdpbi5sdC5jb3JlLmRhdGE7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3aW4uZnJhbWVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRyeSB7IGNvbnN0IGRjID0gZmluZERDKHdpbi5mcmFtZXNbaV0pOyBpZiAoZGMpIHJldHVybiBkYzsgfSBjYXRjaCB7IH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRhYlNjb3BlSWQobnMgPSAnUVQnKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgayA9IGBsdDoke25zfTpzY29wZUlkYDtcclxuICAgICAgICAgICAgbGV0IHYgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGspO1xyXG4gICAgICAgICAgICBpZiAoIXYpIHtcclxuICAgICAgICAgICAgICAgIHYgPSBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0NykpO1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbShrLCB2KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgICAgIGlmIChhY3RpdmUpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHZtID0gS08/LmRhdGFGb3I/LihhY3RpdmUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHZtID8gKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnTmFtZScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnbmFtZScpKSA6ICcnO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5hbWUpIHJldHVybiBTdHJpbmcobmFtZSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGggPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcud2l6YXJkLWhlYWRlciwgLnBsZXgtcGFnZSBoMSwgaDEnKTtcclxuICAgICAgICBpZiAoaD8udGV4dENvbnRlbnQpIHJldHVybiBoLnRleHRDb250ZW50LnRyaW0oKTtcclxuICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcclxuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkgeyByZXR1cm4gQ0ZHLlNIT1dfT05fUEFHRVNfUkUudGVzdChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHx8ICcnKTsgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVdpemFyZFZNKCkge1xyXG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcclxuICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYyhhbmNob3IsIHsgcG9sbE1zOiBDRkcuUE9MTF9NUywgdGltZW91dE1zOiBDRkcuVElNRU9VVF9NUywgcmVxdWlyZUtvOiB0cnVlIH0pID8/IHsgdmlld01vZGVsOiBudWxsIH0pO1xyXG4gICAgICAgIHJldHVybiB2aWV3TW9kZWw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCk7XHJcbiAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByYXcwID8gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocmF3MCwgJ1F1b3RlS2V5JykgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvb3RWTSA9IHJvb3RFbCA/IEtPPy5kYXRhRm9yPy4ocm9vdEVsKSA6IG51bGw7XHJcbiAgICAgICAgICAgIGNvbnN0IHYgPSByb290Vk0gJiYgKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlS2V5JykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGUuUXVvdGVLZXknKSk7XHJcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XHJcbiAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICBjb25zdCBtID0gL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKGxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IFJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxyXG4gICAgZnVuY3Rpb24gcGVla0RDKCkge1xyXG4gICAgICAgIGNvbnN0IERDID0gZmluZERDKCk7XHJcbiAgICAgICAgcmV0dXJuIERDICYmIERDLmNyZWF0ZURhdGFDb250ZXh0ICYmIERDLm1ha2VGbGF0U2NvcGVkUmVwbyA/IERDIDogbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcclxuICAgIGxldCBfX1FUX18gPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIHRyeUdldFFUKCkge1xyXG4gICAgICAgIGNvbnN0IERDID0gcGVla0RDKCk7XHJcbiAgICAgICAgaWYgKCFEQykgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgaWYgKCFfX1FUX18pIF9fUVRfXyA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcclxuICAgICAgICByZXR1cm4gX19RVF9fO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xyXG4gICAgICAgIGNvbnN0IFFURiA9IHRyeUdldFFUKCk7XHJcbiAgICAgICAgaWYgKCFRVEYpIHJldHVybiBudWxsO1xyXG4gICAgICAgIGNvbnN0IHsgY3R4LCByZXBvIH0gPSBRVEYudXNlKE51bWJlcihxdW90ZUtleSkpO1xyXG4gICAgICAgIHF1b3RlUmVwbyA9IHJlcG87ICAgICAgICAgICAgICAgICAvLyA8LS0gcGVyc2lzdCBmb3IgbGF0ZXIgY2FsbGVyc1xyXG4gICAgICAgIGxhc3RTY29wZSA9IE51bWJlcihxdW90ZUtleSk7ICAgICAvLyA8LS0gdHJhY2sgc2NvcGUgd2VcdTIwMTlyZSBib3VuZCB0b1xyXG4gICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XHJcbiAgICAgICAgcmV0dXJuIHJlcG87XHJcbiAgICB9XHJcblxyXG5cclxuXHJcbiAgICAvLyBCYWNrZ3JvdW5kIHByb21vdGlvbiAocGVyLXRhYiBkcmFmdCAtPiBwZXItcXVvdGUpIHdpdGggZ2VudGxlIHJldHJpZXNcclxuICAgIGNvbnN0IF9fUFJPTU9URSA9IHsgdGltZXI6IG51bGwsIHRyaWVzOiAwLCBtYXg6IDEyMCwgaW50ZXJ2YWxNczogMjUwIH07XHJcblxyXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHF1b3RlS2V5KSB7XHJcbiAgICAgICAgaWYgKF9fUFJPTU9URS50aW1lcikgcmV0dXJuO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFFURiA9IHRyeUdldFFUKCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXBvUSA9IGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIVFURiB8fCAhcmVwb1EpIHsgaWYgKCsrX19QUk9NT1RFLnRyaWVzID49IF9fUFJPTU9URS5tYXgpIHN0b3BQcm9tb3RlKCk7IHJldHVybjsgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFJlYWQgdGhlIFNBTUUgcGVyLXRhYiBkcmFmdCBzY29wZSBRVDEwIHdyaXRlcyB0b1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeyByZXBvOiBkcmFmdFJlcG8gfSA9IFFURi51c2UoZ2V0VGFiU2NvcGVJZCgnUVQnKSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkcmFmdCA9IGF3YWl0IChkcmFmdFJlcG8uZ2V0SGVhZGVyPy4oKSB8fCBkcmFmdFJlcG8uZ2V0KCkpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRyYWZ0ICYmIE9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCByZXBvUS5wYXRjaEhlYWRlcih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHF1b3RlS2V5KSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgQ3VzdG9tZXJfTm86IGRyYWZ0LkN1c3RvbWVyX05vID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBDYXRhbG9nX0NvZGU6IGRyYWZ0LkNhdGFsb2dfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFVwZGF0ZWRfQXQ6IGRyYWZ0LlVwZGF0ZWRfQXQgfHwgRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBkcmFmdFJlcG8uY2xlYXI/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBRVEYudXNlKCdkcmFmdCcpOyBhd2FpdCBsZWdhY3kuY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxyXG5cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHN0b3BQcm9tb3RlKCk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICAgICAgLy8ga2VlcCByZXRyeWluZ1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgX19QUk9NT1RFLmludGVydmFsTXMpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN0b3BQcm9tb3RlKCkge1xyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwoX19QUk9NT1RFLnRpbWVyKTtcclxuICAgICAgICBfX1BST01PVEUudGltZXIgPSBudWxsO1xyXG4gICAgICAgIF9fUFJPTU9URS50cmllcyA9IDA7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8vID09PT09IE1lcmdlIFFUMTAgZHJhZnQgXHUyMTkyIHBlci1xdW90ZSAob25jZSkgPT09PT1cclxuICAgIC8vID09PT09IE1lcmdlIFFUMTAgZHJhZnQgXHUyMTkyIHBlci1xdW90ZSAob25jZSkgPT09PT1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKSB7XHJcbiAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IFFURiA9IHRyeUdldFFUKCk7XHJcbiAgICAgICAgaWYgKCFRVEYpIHsgc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHFrKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgIC8vIFJlYWQgcGVyLXRhYiBkcmFmdCAoc2FtZSBzY29wZSBRVDEwIHdyaXRlcyB0bylcclxuICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICBjb25zdCBkcmFmdCA9IGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGF3YWl0IGRyYWZ0UmVwby5nZXQoKTsgLy8gdG9sZXJhdGUgbGVnYWN5XHJcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47IC8vIERDIG5vdCByZWFkeSB5ZXRcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWRlciA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyKCkpIHx8IHt9O1xyXG4gICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudEhlYWRlci5DdXN0b21lcl9ObyA/PyAnJyk7XHJcbiAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdC5DdXN0b21lcl9ObyA/PyAnJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxyXG4gICAgICAgICAgICAoTnVtYmVyKChhd2FpdCBkcmFmdFJlcG8uZ2V0KCkpPy5VcGRhdGVkX0F0IHx8IDApID4gTnVtYmVyKGN1cnJlbnRIZWFkZXIuUHJvbW90ZWRfQXQgfHwgMCkpIHx8XHJcbiAgICAgICAgICAgIChjdXJDdXN0ICE9PSBuZXdDdXN0KSB8fFxyXG4gICAgICAgICAgICAoY3VycmVudEhlYWRlci5DYXRhbG9nX0tleSAhPT0gZHJhZnQuQ2F0YWxvZ19LZXkpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50SGVhZGVyLkNhdGFsb2dfQ29kZSAhPT0gZHJhZnQuQ2F0YWxvZ19Db2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFuZWVkc01lcmdlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7XHJcbiAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHFrKSxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IGRyYWZ0LkN1c3RvbWVyX05vID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDYXRhbG9nX0NvZGU6IGRyYWZ0LkNhdGFsb2dfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtaHlkcmF0aW9uIG5leHQgdGltZVxyXG4gICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBjbGVhciBwZXItdGFiIGRyYWZ0IGFuZCBsZWdhY3kgaWYgcHJlc2VudFxyXG4gICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG5cclxuICAgICAgICBkbG9nKCdEcmFmdCBtZXJnZWQgKGZsYXQgcmVwbyBoZWFkZXIgdXBkYXRlZCknLCB7IHFrIH0pO1xyXG4gICAgfVxyXG5cclxuXHJcblxyXG4gICAgLy8gPT09PT0gRGF0YSBzb3VyY2VzID09PT09XHJcbiAgICBhc3luYyBmdW5jdGlvbiBmZXRjaEF0dGFjaG1lbnRDb3VudChxdW90ZUtleSkge1xyXG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIikgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiAoUk9PVC5sdD8uY29yZT8ucGxleCk7XHJcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybiAwO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCBfX3dpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoQ0ZHLkRTX0FUVEFDSE1FTlRTX0JZX1FVT1RFLCB7XHJcbiAgICAgICAgICAgIEF0dGFjaG1lbnRfR3JvdXBfS2V5OiBDRkcuQVRUQUNITUVOVF9HUk9VUF9LRVksXHJcbiAgICAgICAgICAgIFJlY29yZF9LZXlfVmFsdWU6IFN0cmluZyhxdW90ZUtleSlcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkocm93cykgPyByb3dzLmxlbmd0aCA6IDA7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcXVvdGVIZWFkZXJHZXQocm93KSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgQ3VzdG9tZXJfQ29kZTogcm93Py5DdXN0b21lcl9Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgIEN1c3RvbWVyX05hbWU6IHJvdz8uQ3VzdG9tZXJfTmFtZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9Obzogcm93Py5DdXN0b21lcl9ObyA/PyBudWxsLFxyXG4gICAgICAgICAgICBRdW90ZV9Obzogcm93Py5RdW90ZV9ObyA/PyBudWxsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGh5ZHJhdGVQYXJ0U3VtbWFyeU9uY2UocWspIHtcclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgaGVhZGVyU25hcCA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyKCkpIHx8IHt9O1xyXG4gICAgICAgIGlmIChoZWFkZXJTbmFwLlF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIiA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IFJPT1QubHQ/LmNvcmU/LnBsZXgpO1xyXG4gICAgICAgIGlmICghcGxleD8uZHNSb3dzKSByZXR1cm47XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IF9fd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhDRkcuRFNfUVVPVEVfSEVBREVSX0dFVCwgeyBRdW90ZV9LZXk6IFN0cmluZyhxaykgfSkpO1xyXG5cclxuICAgICAgICBjb25zdCBmaXJzdCA9IChBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoKSA/IHF1b3RlSGVhZGVyR2V0KHJvd3NbMF0pIDogbnVsbDtcclxuICAgICAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIC4uLmZpcnN0LCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PSBVSSBiYWRnZSA9PT09PVxyXG4gICAgY29uc3QgTElfSUQgPSAnbHQtYXR0YWNobWVudHMtYmFkZ2UnO1xyXG4gICAgY29uc3QgUElMTF9JRCA9ICdsdC1hdHRhY2gtcGlsbCc7XHJcblxyXG4gICAgZnVuY3Rpb24gZW5zdXJlQmFkZ2UoKSB7XHJcbiAgICAgICAgY29uc3QgYmFyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuQUNUSU9OX0JBUl9TRUwpO1xyXG4gICAgICAgIGlmICghYmFyIHx8IGJhci50YWdOYW1lICE9PSAnVUwnKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChMSV9JRCk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XHJcblxyXG4gICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTsgbGkuaWQgPSBMSV9JRDtcclxuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJzsgYS50aXRsZSA9ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJztcclxuICAgICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyBwaWxsLmlkID0gUElMTF9JRDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHBpbGwuc3R5bGUsIHsgZGlzcGxheTogJ2lubGluZS1ibG9jaycsIG1pbldpZHRoOiAnMThweCcsIHBhZGRpbmc6ICcycHggOHB4JywgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCBmb250V2VpZ2h0OiAnNjAwJyB9KTtcclxuXHJcbiAgICAgICAgYS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnQXR0YWNobWVudHMgJykpO1xyXG4gICAgICAgIGEuYXBwZW5kQ2hpbGQocGlsbCk7XHJcbiAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7XHJcbiAgICAgICAgYmFyLmFwcGVuZENoaWxkKGxpKTtcclxuXHJcbiAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSkpO1xyXG4gICAgICAgIHJldHVybiBsaTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHNldEJhZGdlQ291bnQobikge1xyXG4gICAgICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChQSUxMX0lEKTtcclxuICAgICAgICBpZiAoIXBpbGwpIHJldHVybjtcclxuICAgICAgICBwaWxsLnRleHRDb250ZW50ID0gU3RyaW5nKG4gPz8gMCk7XHJcbiAgICAgICAgY29uc3QgaXNaZXJvID0gIW4gfHwgbiA9PT0gMDtcclxuICAgICAgICBwaWxsLnN0eWxlLmJhY2tncm91bmQgPSBpc1plcm8gPyAnI2U1ZTdlYicgOiAnIzEwYjk4MSc7XHJcbiAgICAgICAgcGlsbC5zdHlsZS5jb2xvciA9IGlzWmVybyA/ICcjMTExODI3JyA6ICcjZmZmJztcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcmVmcmVzaEluRmxpZ2h0ID0gZmFsc2U7XHJcbiAgICBhc3luYyBmdW5jdGlvbiBydW5PbmVSZWZyZXNoKG1hbnVhbCA9IGZhbHNlKSB7XHJcbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xyXG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1hbnVhbCkgd2luZG93LlRNVXRpbHM/LnRvYXN0Py4oJ1x1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kJywgJ3dhcm4nLCAyMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xyXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0gYXdhaXQgcXVvdGVSZXBvPy5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChoZWFkPy5BdHRhY2htZW50X0NvdW50ICE9IG51bGwpIHNldEJhZGdlQ291bnQoTnVtYmVyKGhlYWQuQXR0YWNobWVudF9Db3VudCkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gUHJvbW90ZSAmIGNsZWFyIGRyYWZ0IEJFRk9SRSBwZXItcXVvdGUgdXBkYXRlc1xyXG4gICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBEQyBpc24ndCByZWFkeSB5ZXQsIHNraXAgcXVpZXRseTsgdGhlIG9ic2VydmVyL25leHQgY2xpY2sgd2lsbCByZXRyeVxyXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbykgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY291bnQgPSBhd2FpdCBmZXRjaEF0dGFjaG1lbnRDb3VudChxayk7XHJcbiAgICAgICAgICAgIHNldEJhZGdlQ291bnQoY291bnQpO1xyXG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXIoeyBRdW90ZV9LZXk6IHFrLCBBdHRhY2htZW50X0NvdW50OiBOdW1iZXIoY291bnQpIH0pO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1hbnVhbCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb2sgPSBjb3VudCA+IDA7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3cuVE1VdGlscz8udG9hc3Q/LihvayA/IGBcdTI3MDUgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnXHUyNkEwXHVGRTBGIE5vIGF0dGFjaG1lbnRzJywgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsIDIwMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGRsb2coJ3JlZnJlc2gnLCB7IHFrLCBjb3VudCB9KTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgZGVycigncmVmcmVzaCBmYWlsZWQnLCBlcnIpO1xyXG4gICAgICAgICAgICB3aW5kb3cuVE1VdGlscz8udG9hc3Q/LihgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgNDAwMCk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgcmVmcmVzaEluRmxpZ2h0ID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvLyA9PT09PSBTUEEgd2lyaW5nID09PT09XHJcbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xyXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcclxuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XHJcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcclxuICAgICAgICBhd2FpdCByYWYoKTtcclxuXHJcbiAgICAgICAgY29uc3QgbGkgPSBlbnN1cmVCYWRnZSgpO1xyXG4gICAgICAgIGlmICghbGkpIHJldHVybjtcclxuICAgICAgICBzdGFydFdpemFyZFBhZ2VPYnNlcnZlcigpO1xyXG5cclxuICAgICAgICBjb25zdCBzaG93ID0gaXNPblRhcmdldFdpemFyZFBhZ2UoKTtcclxuICAgICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gc2hvdyA/ICcnIDogJ25vbmUnO1xyXG5cclxuICAgICAgICBpZiAoc2hvdykge1xyXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHFrKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChxayAmJiBOdW1iZXIuaXNGaW5pdGUocWspICYmIHFrID4gMCkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHJ1bk9uZVJlZnJlc2goZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHsgYXdhaXQgaHlkcmF0ZVBhcnRTdW1tYXJ5T25jZShxayk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5lcnJvcignUVQzNSBoeWRyYXRlIGZhaWxlZCcsIGUpOyB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xyXG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xyXG4gICAgICAgIG9mZlVybD8uKCk7XHJcbiAgICAgICAgb2ZmVXJsID0gbnVsbDtcclxuICAgICAgICBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpO1xyXG5cclxuICAgIC8vIFBsYWNlIG5lYXIgb3RoZXIgbW9kdWxlLWxldmVsIGxldHNcclxuICAgIGxldCBsYXN0V2l6YXJkUGFnZSA9IG51bGw7XHJcbiAgICBsZXQgcGFnZU9ic2VydmVyID0gbnVsbDtcclxuXHJcbiAgICBmdW5jdGlvbiBzdGFydFdpemFyZFBhZ2VPYnNlcnZlcigpIHtcclxuICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkJykgfHwgZG9jdW1lbnQuYm9keTtcclxuICAgICAgICBsYXN0V2l6YXJkUGFnZSA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKTtcclxuICAgICAgICAgICAgaWYgKG5hbWUgIT09IGxhc3RXaXphcmRQYWdlKSB7XHJcbiAgICAgICAgICAgICAgICBsYXN0V2l6YXJkUGFnZSA9IG5hbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlTWljcm90YXNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHFrICYmIE51bWJlci5pc0Zpbml0ZShxaykgJiYgcWsgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcnVuT25lUmVmcmVzaChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydjbGFzcycsICdhcmlhLWN1cnJlbnQnXSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xyXG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcclxuXHJcbn0pKCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLEdBQUMsTUFBTTtBQUNIO0FBRUEsVUFBTSxNQUFPLE9BQXdDLE9BQWdCO0FBQ3JFLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sT0FBUSxPQUFPLGlCQUFpQixjQUFjLGVBQWU7QUFFbkUsVUFBTSxrQkFBbUIsT0FBTyxrQkFBa0IsYUFBYyxnQkFBZ0IsT0FBTyxPQUFPLE1BQU0sR0FBRztBQUd2RyxVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFNLEdBQUcsS0FBSyxTQUFTLFFBQVEsQ0FBQyxFQUFHO0FBRXBELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUksUUFBUSxPQUFLLHNCQUFzQixDQUFDLENBQUM7QUFFM0QsVUFBTSxNQUFNO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixVQUFVO0FBQUEsTUFDVixrQkFBa0I7QUFBQSxNQUNsQix5QkFBeUI7QUFBQSxNQUN6QixzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUI7QUFBQSxNQUNyQixTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsSUFDaEI7QUFHQSxhQUFTLE9BQU8sTUFBTyxPQUFPLGlCQUFpQixjQUFjLGVBQWUsUUFBUztBQUNqRixVQUFJO0FBQUUsWUFBSSxJ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
