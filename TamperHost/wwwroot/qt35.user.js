// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.49
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @require      http://localhost:5000/lt-data-core.user.js 
// @require      http://localhost:5000/lt-core.user.js
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
    let QT = null;
    async function waitForDC(timeoutMs = 2e4) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const LT = typeof unsafeWindow !== "undefined" ? unsafeWindow.lt : window.lt;
        if (LT?.core?.data?.createDataContext) {
          if (LT.core.data.makeFlatScopedRepo) return LT.core.data;
        }
        await (TMUtils.sleep?.(50) || new Promise((r) => setTimeout(r, 50)));
      }
      throw new Error("DataCore not ready");
    }
    async function getQT() {
      if (QT) return QT;
      const DC = await waitForDC();
      if (!DC.makeFlatScopedRepo) {
        await (TMUtils.sleep?.(50) || new Promise((r) => setTimeout(r, 50)));
      }
      QT = DC.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" });
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
    async function mergeDraftIntoQuoteOnce(qk) {
      if (!qk || !Number.isFinite(qk) || qk <= 0) return;
      const { repo: draftRepo } = (await getQT()).use("draft");
      const draft = await draftRepo.getHeader?.() || await draftRepo.get();
      if (!draft) return;
      await ensureRepoForQuote(qk);
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
      dlog("Draft merged (flat repo header updated)", { qk });
    }
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
      const headerSnap = await quoteRepo.getHeader() || {};
      if (headerSnap.Quote_Header_Fetched_At) return;
      const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : window.lt.core.plex;
      const rows = await withFreshAuth(() => plex.dsRows(CFG.DS_QUOTE_HEADER_GET, { Quote_Key: String(qk) }));
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
        if (!ctx || lastScope !== qk) {
          await ensureRepoForQuote(qk);
          try {
            const head = await quoteRepo.getHeader();
            if (head?.Attachment_Count != null) setBadgeCount(Number(head.Attachment_Count));
          } catch {
          }
        }
        await mergeDraftIntoQuoteOnce(qk);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzXHJcblxyXG4oKCkgPT4ge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XHJcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDM1JywgLi4uYSk7XHJcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoJ1FUMzUgXHUyNzE2XHVGRTBGJywgLi4uYSk7XHJcblxyXG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcclxuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xyXG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xyXG5cclxuICAgIGNvbnN0IENGRyA9IHtcclxuICAgICAgICBBQ1RJT05fQkFSX1NFTDogJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsXHJcbiAgICAgICAgR1JJRF9TRUw6ICcucGxleC1ncmlkJyxcclxuICAgICAgICBTSE9XX09OX1BBR0VTX1JFOiAvcmV2aWV3fHN1bW1hcnl8c3VibWl0L2ksXHJcbiAgICAgICAgRFNfQVRUQUNITUVOVFNfQllfUVVPVEU6IDExNzEzLFxyXG4gICAgICAgIEFUVEFDSE1FTlRfR1JPVVBfS0VZOiAxMSxcclxuICAgICAgICBEU19RVU9URV9IRUFERVJfR0VUOiAzMTU2LFxyXG4gICAgICAgIFBPTExfTVM6IDIwMCxcclxuICAgICAgICBUSU1FT1VUX01TOiAxMl8wMDBcclxuICAgIH07XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XHJcbiAgICAgICAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgdm0gPSBLTz8uZGF0YUZvcj8uKGFjdGl2ZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdm0gPyAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICdOYW1lJykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICduYW1lJykpIDogJyc7XHJcbiAgICAgICAgICAgICAgICBpZiAobmFtZSkgcmV0dXJuIFN0cmluZyhuYW1lKTtcclxuICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy53aXphcmQtaGVhZGVyLCAucGxleC1wYWdlIGgxLCBoMScpO1xyXG4gICAgICAgIGlmIChoPy50ZXh0Q29udGVudCkgcmV0dXJuIGgudGV4dENvbnRlbnQudHJpbSgpO1xyXG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgICAgIHJldHVybiAobmF2Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7IHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgfHwgJycpOyB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XHJcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpID8gQ0ZHLkdSSURfU0VMIDogQ0ZHLkFDVElPTl9CQVJfU0VMO1xyXG4gICAgICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSBhd2FpdCAod2luZG93LlRNVXRpbHM/LndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwgeyBwb2xsTXM6IENGRy5QT0xMX01TLCB0aW1lb3V0TXM6IENGRy5USU1FT1VUX01TLCByZXF1aXJlS286IHRydWUgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfSk7XHJcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKTtcclxuICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByYXcwID0gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXdbMF0gOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJhdzAgPyB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/LihyYXcwLCAnUXVvdGVLZXknKSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByb290RWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQsIC5wbGV4LXBhZ2UnKTtcclxuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gcm9vdEVsID8gS08/LmRhdGFGb3I/Lihyb290RWwpIDogbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcclxuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcclxuICAgICAgICB9IGNhdGNoIHsgfVxyXG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgICByZXR1cm4gbSA/IE51bWJlcihtWzFdKSA6IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT0gUmVwbyB2aWEgbHQtZGF0YS1jb3JlIGZsYXQge2hlYWRlciwgbGluZXN9ID09PT09XHJcbiAgICBsZXQgUVQgPSBudWxsO1xyXG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckRDKHRpbWVvdXRNcyA9IDIwMDAwKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gICAgICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcclxuICAgICAgICAgICAgY29uc3QgTFQgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cubHQgOiB3aW5kb3cubHQpO1xyXG4gICAgICAgICAgICBpZiAoTFQ/LmNvcmU/LmRhdGE/LmNyZWF0ZURhdGFDb250ZXh0KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBpZiBvdXIgZmFjdG9yeSBpcyBhbHJlYWR5IGluc3RhbGxlZCwgd2VcdTIwMTlyZSBkb25lXHJcbiAgICAgICAgICAgICAgICBpZiAoTFQuY29yZS5kYXRhLm1ha2VGbGF0U2NvcGVkUmVwbykgcmV0dXJuIExULmNvcmUuZGF0YTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBzbWFsbCBzbGVlcFxyXG4gICAgICAgICAgICBhd2FpdCAoVE1VdGlscy5zbGVlcD8uKDUwKSB8fCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRGF0YUNvcmUgbm90IHJlYWR5Jyk7XHJcbiAgICB9XHJcbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcclxuICAgICAgICBpZiAoUVQpIHJldHVybiBRVDtcclxuICAgICAgICBjb25zdCBEQyA9IGF3YWl0IHdhaXRGb3JEQygpO1xyXG4gICAgICAgIC8vIGx0LWRhdGEtY29yZSB3aWxsIGluc3RhbGwgdGhlIGZhY3Rvcnkgc29vbiBhZnRlciBEQyBpcyByZWFkeTsgaWYgc3RpbGwgbWlzc2luZywgcmV0cnkgb25jZVxyXG4gICAgICAgIGlmICghREMubWFrZUZsYXRTY29wZWRSZXBvKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IChUTVV0aWxzLnNsZWVwPy4oNTApIHx8IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgUVQgPSBEQy5tYWtlRmxhdFNjb3BlZFJlcG8oeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSk7XHJcbiAgICAgICAgcmV0dXJuIFFUO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xyXG4gICAgICAgIGlmICghcWsgfHwgIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xyXG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IChhd2FpdCBnZXRRVCgpKS51c2UoTnVtYmVyKHFrKSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZygpO1xyXG4gICAgICAgICAgICBxdW90ZVJlcG8gPSByZXBvO1xyXG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHF1b3RlUmVwbztcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PSBNZXJnZSBRVDEwIGRyYWZ0IFx1MjE5MiBwZXItcXVvdGUgKG9uY2UpID09PT09XHJcbiAgICBhc3luYyBmdW5jdGlvbiBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxaykge1xyXG4gICAgICAgIGlmICghcWsgfHwgIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gKGF3YWl0IGdldFFUKCkpLnVzZSgnZHJhZnQnKTtcclxuICAgICAgICBjb25zdCBkcmFmdCA9IGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGF3YWl0IGRyYWZ0UmVwby5nZXQoKTsgLy8gdG9sZXJhdGUgbGVnYWN5XHJcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRIZWFkZXIgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpKSB8fCB7fTtcclxuXHJcbiAgICAgICAgY29uc3QgY3VyQ3VzdCA9IFN0cmluZyhjdXJyZW50SGVhZGVyLkN1c3RvbWVyX05vID8/ICcnKTtcclxuICAgICAgICBjb25zdCBuZXdDdXN0ID0gU3RyaW5nKGRyYWZ0LkN1c3RvbWVyX05vID8/ICcnKTtcclxuXHJcbiAgICAgICAgY29uc3QgbmVlZHNNZXJnZSA9XHJcbiAgICAgICAgICAgIChOdW1iZXIoKGF3YWl0IGRyYWZ0UmVwby5nZXQoKSk/LlVwZGF0ZWRfQXQgfHwgMCkgPiBOdW1iZXIoY3VycmVudEhlYWRlci5Qcm9tb3RlZF9BdCB8fCAwKSkgfHxcclxuICAgICAgICAgICAgKGN1ckN1c3QgIT09IG5ld0N1c3QpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50SGVhZGVyLkNhdGFsb2dfS2V5ICE9PSBkcmFmdC5DYXRhbG9nX0tleSkgfHxcclxuICAgICAgICAgICAgKGN1cnJlbnRIZWFkZXIuQ2F0YWxvZ19Db2RlICE9PSBkcmFmdC5DYXRhbG9nX0NvZGUpO1xyXG5cclxuICAgICAgICBpZiAoIW5lZWRzTWVyZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHtcclxuICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocWspLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAvLyBmb3JjZSByZS1oeWRyYXRpb24gbmV4dCB0aW1lXHJcbiAgICAgICAgICAgIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBudWxsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIGNsZWFyIHRoZSBkcmFmdCBidWNrZXRcclxuICAgICAgICBhd2FpdCBkcmFmdFJlcG8uY2xlYXI/LigpO1xyXG4gICAgICAgIGRsb2coJ0RyYWZ0IG1lcmdlZCAoZmxhdCByZXBvIGhlYWRlciB1cGRhdGVkKScsIHsgcWsgfSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8vID09PT09IERhdGEgc291cmNlcyA9PT09PVxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZmV0Y2hBdHRhY2htZW50Q291bnQocXVvdGVLZXkpIHtcclxuICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiB3aW5kb3cubHQuY29yZS5wbGV4LmRzUm93cyhDRkcuRFNfQVRUQUNITUVOVFNfQllfUVVPVEUsIHtcclxuICAgICAgICAgICAgQXR0YWNobWVudF9Hcm91cF9LZXk6IENGRy5BVFRBQ0hNRU5UX0dST1VQX0tFWSxcclxuICAgICAgICAgICAgUmVjb3JkX0tleV9WYWx1ZTogU3RyaW5nKHF1b3RlS2V5KVxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShyb3dzKSA/IHJvd3MubGVuZ3RoIDogMDtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHF1b3RlSGVhZGVyR2V0KHJvdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIEN1c3RvbWVyX0NvZGU6IHJvdz8uQ3VzdG9tZXJfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9OYW1lOiByb3c/LkN1c3RvbWVyX05hbWUgPz8gbnVsbCxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IHJvdz8uQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgUXVvdGVfTm86IHJvdz8uUXVvdGVfTm8gPz8gbnVsbFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBhc3luYyBmdW5jdGlvbiBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKSB7XHJcbiAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICBpZiAoIXF1b3RlUmVwbykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlclNuYXAgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpKSB8fCB7fTtcclxuICAgICAgICBpZiAoaGVhZGVyU25hcC5RdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdC5jb3JlLnBsZXg7XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoQ0ZHLkRTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocWspIH0pKTtcclxuICAgICAgICBjb25zdCBmaXJzdCA9IChBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoKSA/IHF1b3RlSGVhZGVyR2V0KHJvd3NbMF0pIDogbnVsbDtcclxuICAgICAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIC4uLmZpcnN0LCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PSBVSSBiYWRnZSA9PT09PVxyXG4gICAgY29uc3QgTElfSUQgPSAnbHQtYXR0YWNobWVudHMtYmFkZ2UnO1xyXG4gICAgY29uc3QgUElMTF9JRCA9ICdsdC1hdHRhY2gtcGlsbCc7XHJcblxyXG4gICAgZnVuY3Rpb24gZW5zdXJlQmFkZ2UoKSB7XHJcbiAgICAgICAgY29uc3QgYmFyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuQUNUSU9OX0JBUl9TRUwpO1xyXG4gICAgICAgIGlmICghYmFyIHx8IGJhci50YWdOYW1lICE9PSAnVUwnKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChMSV9JRCk7XHJcbiAgICAgICAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XHJcblxyXG4gICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTsgbGkuaWQgPSBMSV9JRDtcclxuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJzsgYS50aXRsZSA9ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJztcclxuICAgICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyBwaWxsLmlkID0gUElMTF9JRDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHBpbGwuc3R5bGUsIHsgZGlzcGxheTogJ2lubGluZS1ibG9jaycsIG1pbldpZHRoOiAnMThweCcsIHBhZGRpbmc6ICcycHggOHB4JywgYm9yZGVyUmFkaXVzOiAnOTk5cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCBmb250V2VpZ2h0OiAnNjAwJyB9KTtcclxuXHJcbiAgICAgICAgYS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnQXR0YWNobWVudHMgJykpO1xyXG4gICAgICAgIGEuYXBwZW5kQ2hpbGQocGlsbCk7XHJcbiAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7XHJcbiAgICAgICAgYmFyLmFwcGVuZENoaWxkKGxpKTtcclxuXHJcbiAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSkpO1xyXG4gICAgICAgIHJldHVybiBsaTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHNldEJhZGdlQ291bnQobikge1xyXG4gICAgICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChQSUxMX0lEKTtcclxuICAgICAgICBpZiAoIXBpbGwpIHJldHVybjtcclxuICAgICAgICBwaWxsLnRleHRDb250ZW50ID0gU3RyaW5nKG4gPz8gMCk7XHJcbiAgICAgICAgY29uc3QgaXNaZXJvID0gIW4gfHwgbiA9PT0gMDtcclxuICAgICAgICBwaWxsLnN0eWxlLmJhY2tncm91bmQgPSBpc1plcm8gPyAnI2U1ZTdlYicgOiAnIzEwYjk4MSc7XHJcbiAgICAgICAgcGlsbC5zdHlsZS5jb2xvciA9IGlzWmVybyA/ICcjMTExODI3JyA6ICcjZmZmJztcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBydW5PbmVSZWZyZXNoKG1hbnVhbCA9IGZhbHNlKSB7XHJcbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xyXG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1hbnVhbCkgd2luZG93LlRNVXRpbHM/LnRvYXN0Py4oJ1x1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kJywgJ3dhcm4nLCAyMjAwKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xyXG4gICAgICAgICAgICBpZiAoIWN0eCB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0gYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChoZWFkPy5BdHRhY2htZW50X0NvdW50ICE9IG51bGwpIHNldEJhZGdlQ291bnQoTnVtYmVyKGhlYWQuQXR0YWNobWVudF9Db3VudCkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gUHJvbW90ZSAmIGNsZWFyIGRyYWZ0IEJFRk9SRSBwZXItcXVvdGUgdXBkYXRlc1xyXG4gICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IGF3YWl0IGZldGNoQXR0YWNobWVudENvdW50KHFrKTtcclxuICAgICAgICAgICAgc2V0QmFkZ2VDb3VudChjb3VudCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIEF0dGFjaG1lbnRfQ291bnQ6IE51bWJlcihjb3VudCkgfSk7XHJcblxyXG4gICAgICAgICAgICBpZiAobWFudWFsKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvayA9IGNvdW50ID4gMDtcclxuICAgICAgICAgICAgICAgIHdpbmRvdy5UTVV0aWxzPy50b2FzdD8uKG9rID8gYFx1MjcwNSAke2NvdW50fSBhdHRhY2htZW50KHMpYCA6ICdcdTI2QTBcdUZFMEYgTm8gYXR0YWNobWVudHMnLCBvayA/ICdzdWNjZXNzJyA6ICd3YXJuJywgMjAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZGxvZygncmVmcmVzaCcsIHsgcWssIGNvdW50IH0pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XHJcbiAgICAgICAgICAgIHdpbmRvdy5UTVV0aWxzPy50b2FzdD8uKGBcdTI3NEMgQXR0YWNobWVudHMgcmVmcmVzaCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCA0MDAwKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT0gU1BBIHdpcmluZyA9PT09PVxyXG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcclxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xyXG4gICAgICAgIGJvb3RlZCA9IHRydWU7XHJcbiAgICAgICAgYXdhaXQgcmFmKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxpID0gZW5zdXJlQmFkZ2UoKTtcclxuICAgICAgICBpZiAoIWxpKSByZXR1cm47XHJcbiAgICAgICAgc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc2hvdyA9IGlzT25UYXJnZXRXaXphcmRQYWdlKCk7XHJcbiAgICAgICAgbGkuc3R5bGUuZGlzcGxheSA9IHNob3cgPyAnJyA6ICdub25lJztcclxuXHJcbiAgICAgICAgaWYgKHNob3cpIHtcclxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgaWYgKHFrICYmIE51bWJlci5pc0Zpbml0ZShxaykgJiYgcWsgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgcnVuT25lUmVmcmVzaChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdRVDM1IGh5ZHJhdGUgZmFpbGVkJywgZSk7IH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XHJcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XHJcbiAgICAgICAgb2ZmVXJsPy4oKTtcclxuICAgICAgICBvZmZVcmwgPSBudWxsO1xyXG4gICAgICAgIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBpbml0KCk7XHJcblxyXG4gICAgLy8gUGxhY2UgbmVhciBvdGhlciBtb2R1bGUtbGV2ZWwgbGV0c1xyXG4gICAgbGV0IGxhc3RXaXphcmRQYWdlID0gbnVsbDtcclxuICAgIGxldCBwYWdlT2JzZXJ2ZXIgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQnKSB8fCBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGxhc3RXaXphcmRQYWdlID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXI/LmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpO1xyXG4gICAgICAgICAgICBpZiAobmFtZSAhPT0gbGFzdFdpemFyZFBhZ2UpIHtcclxuICAgICAgICAgICAgICAgIGxhc3RXaXphcmRQYWdlID0gbmFtZTtcclxuICAgICAgICAgICAgICAgIGlmIChpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcXVldWVNaWNyb3Rhc2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgTnVtYmVyLmlzRmluaXRlKHFrKSAmJiBxayA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBydW5PbmVSZWZyZXNoKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGF3YWl0IGh5ZHJhdGVQYXJ0U3VtbWFyeU9uY2UocWspOyB9IGNhdGNoIHsgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBwYWdlT2JzZXJ2ZXIub2JzZXJ2ZShyb290LCB7IGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJywgJ2FyaWEtY3VycmVudCddIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKFJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xyXG5cclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFFcEQsVUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBQ3RELFFBQUksQ0FBQyxPQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUMsRUFBRztBQUVwRCxVQUFNLEtBQU0sT0FBTyxpQkFBaUIsY0FBYyxhQUFhLEtBQUssT0FBTztBQUMzRSxVQUFNLE1BQU0sTUFB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
