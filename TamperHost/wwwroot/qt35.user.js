// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.101
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// // @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.101-1758146037970
// @require      http://localhost:5000/lt-ui-hub.js?v=3.6.101-1758146037970
// @require      http://localhost:5000/lt-core.user.js?v=3.6.101-1758146037970
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.101-1758146037970
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
    const FORCE_SHOW_BTN = false;
    if (!ROUTES.some((rx) => rx.test(location.pathname))) return;
    ROOT.__LT_HUB_MOUNT = "nav";
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    async function getHub(opts = { mount: "nav" }) {
      for (let i = 0; i < 50; i++) {
        const ensure = ROOT.ensureLTHub || window.ensureLTHub;
        if (typeof ensure === "function") {
          try {
            const hub = await ensure(opts);
            if (hub) return hub;
          } catch {
          }
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }
    const CFG = {
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      //SHOW_ON_PAGES_RE: /\bsummary\b/i,
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
    async function ensureHubButton() {
      const hub = await getHub({ mount: "nav" });
      if (!hub) {
        dlog("ensureHubButton: hub not available");
        return;
      }
      if (typeof hub.registerButton !== "function") {
        dlog("ensureHubButton: hub.registerButton missing");
        return;
      }
      const list = hub.list?.();
      const already = Array.isArray(list) && list.includes(HUB_BTN_ID);
      if (already) {
        return;
      }
      dlog("ensureHubButton: registering\u2026", { id: HUB_BTN_ID });
      hub.registerButton("left", {
        id: HUB_BTN_ID,
        label: "Attachments 0",
        title: "Refresh attachments (manual)",
        weight: 120,
        onClick: () => runOneRefresh(true)
      });
      try {
        window.__HUB = hub;
        dlog("ensureHubButton: hub.list()", hub.list?.());
      } catch {
      }
      dlog("ensureHubButton: registered");
    }
    async function setBadgeCount(n) {
      const count = Number(n ?? 0);
      const hub = await getHub({ mount: "nav" });
      if (!hub?.registerButton) return;
      if (typeof hub.updateButton === "function") {
        hub.updateButton(HUB_BTN_ID, { label: `Attachments ${count}` });
        return;
      }
      const list = hub.list?.();
      const already = Array.isArray(list) && list.includes(HUB_BTN_ID);
      if (!already) {
        hub.registerButton("left", {
          id: HUB_BTN_ID,
          label: `Attachments ${count}`,
          title: "Refresh attachments (manual)",
          weight: 120,
          onClick: () => runOneRefresh(true)
        });
      } else {
        hub.remove?.(HUB_BTN_ID);
        hub.registerButton("left", {
          id: HUB_BTN_ID,
          label: `Attachments ${count}`,
          title: "Refresh attachments (manual)",
          weight: 120,
          onClick: () => runOneRefresh(true)
        });
      }
    }
    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
      await ensureHubButton();
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
            ok ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments",
            ok ? "success" : "warn",
            { timeout: 2e3, toast: true }
          );
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        t.error(`\u274C Attachments refresh failed: ${err?.message || err}`, 4e3);
        lt.core.hub.notify(
          `\u274C Attachments refresh failed: ${err?.message || err}`,
          "error",
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
        await getHub({ mount: "nav" });
      } catch {
      }
      await ensureHubButton();
      try {
        await getHub();
      } catch {
      }
      startWizardPageObserver();
      await reconcileHubButtonVisibility();
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
        if (FORCE_SHOW_BTN) {
          await ensureHubButton();
          setBadgeCount(0);
        } else {
          setBadgeCount(0);
          try {
            const hub = await getHub();
            hub?.remove?.(HUB_BTN_ID);
          } catch {
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
      stopPromote();
    }
    init();
    let pageObserver = null;
    function startWizardPageObserver() {
      const root = document.querySelector(".plex-wizard-page-list");
      if (!root) return;
      pageObserver = new MutationObserver((mut) => {
        if (mut.some((m) => m.type === "attributes" || m.type === "childList")) {
          reconcileHubButtonVisibility();
        }
      });
      pageObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
      window.addEventListener("hashchange", reconcileHubButtonVisibility);
    }
    async function reconcileHubButtonVisibility() {
      const pageName = getActiveWizardPageName();
      dlog("reconcileHubButtonVisibility:", { pageName });
      if (FORCE_SHOW_BTN || isOnTargetWizardPage()) {
        await ensureHubButton();
      } else {
        const hub = await getHub();
        dlog("reconcileHubButtonVisibility: removing button (off target page)");
        hub?.remove?.(HUB_BTN_ID);
      }
    }
    function stopWizardPageObserver() {
      try {
        window.removeEventListener("hashchange", reconcileHubButtonVisibility);
      } catch {
      }
      try {
        pageObserver?.disconnect();
      } catch {
      }
      pageObserver = null;
    }
    wireNav(() => {
      if (ROUTES.some((rx) => rx.test(location.pathname))) init();
      else teardown();
    });
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDM1LWF0dGFjaG1lbnRzR2V0L3F0MzUuaW5kZXguanNcclxuXHJcbigoKSA9PiB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcblxyXG4gICAgY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcclxuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4gREVWICYmIGNvbnNvbGUuZGVidWcoJ1FUMzUnLCAuLi5hKTtcclxuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcihcIlFUMzUgXHUyNzE2XHVGRTBGXCIsIC4uLmEpO1xyXG4gICAgY29uc3QgUk9PVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdyA6IHdpbmRvdyk7XHJcblxyXG4gICAgLy8gU2FmZSBkZWxlZ2F0aW5nIHdyYXBwZXI6IHVzZSBsdC5jb3JlLmF1dGgud2l0aEZyZXNoQXV0aCB3aGVuIGF2YWlsYWJsZSxcclxuICAgIC8vIG90aGVyd2lzZSBqdXN0IHJ1biB0aGUgY2FsbGJhY2sgb25jZSAoYmVzdC1lZmZvcnQgZmFsbGJhY2spLlxyXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcclxuICAgIH07XHJcblxyXG5cclxuICAgIC8vIEZsYXQgcmVwbyBmYWN0b3J5IChubyBwb2xsaW5nIHJlcXVpcmVkIG5vdyB0aGF0IGx0LWRhdGEtY29yZSBpbnN0YWxscyBhdCBkb2Mtc3RhcnQpXHJcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cclxuICAgICAgICA/IGx0LmNvcmUuZGF0YS5tYWtlRmxhdFNjb3BlZFJlcG8oeyBuczogXCJRVFwiLCBlbnRpdHk6IFwicXVvdGVcIiwgbGVnYWN5RW50aXR5OiBcIlF1b3RlSGVhZGVyXCIgfSlcclxuICAgICAgICA6IG51bGw7XHJcblxyXG4gICAgKGFzeW5jICgpID0+IHtcclxuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcclxuICAgICAgICBjb25zdCBkb2NrID0gYXdhaXQgd2luZG93LmVuc3VyZUxURG9jaz8uKCk7XHJcbiAgICAgICAgZG9jaz8ucmVnaXN0ZXIoe1xyXG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxyXG4gICAgICAgICAgICBsYWJlbDogJ0F0dGFjaG1lbnRzJyxcclxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFFUMzUgQXR0YWNobWVudHMnLFxyXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcclxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gKHR5cGVvZiBvcGVuQXR0YWNobWVudHNNb2RhbCA9PT0gJ2Z1bmN0aW9uJ1xyXG4gICAgICAgICAgICAgICAgPyBvcGVuQXR0YWNobWVudHNNb2RhbCgpXHJcbiAgICAgICAgICAgICAgICA6IGx0LmNvcmUuaHViLm5vdGlmeSgnQXR0YWNobWVudHMgVUkgbm90IGF2YWlsYWJsZScsICd3YXJuJywgeyB0b2FzdDogdHJ1ZSB9KSlcclxuICAgICAgICB9KTtcclxuICAgIH0pKCk7XHJcblxyXG5cclxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XHJcbiAgICBjb25zdCBGT1JDRV9TSE9XX0JUTiA9IGZhbHNlOyAvLyBzZXQgdG8gdHJ1ZSBkdXJpbmcgdGVzdGluZ1xyXG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcclxuXHJcbiAgICAvLyBNb3VudCBodWIgaW50byB0aGUgTkFWIGJhciBsaWtlIFFUMTBcclxuICAgIC8vIE5PVEU6IERvIG5vdCBhd2FpdCBhdCB0b3AtbGV2ZWwuIGluaXQoKSBwZXJmb3JtcyB0aGUgYXdhaXRlZCBtb3VudC5cclxuICAgIFJPT1QuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IHJhZiA9ICgpID0+IG5ldyBQcm9taXNlKHIgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcclxuXHJcbiAgICAvLyBSb2J1c3QgaHViIGdldHRlciB0aGF0IHRvbGVyYXRlcyBsYXRlLWxvYWRpbmcgbHQtdWktaHViXHJcbiAgICBhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6IFwibmF2XCIgfSkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykgeyAvLyB+NXMgdG90YWxcclxuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKFJPT1QuZW5zdXJlTFRIdWIgfHwgd2luZG93LmVuc3VyZUxUSHViKTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZW5zdXJlKG9wdHMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChodWIpIHJldHVybiBodWI7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCByZXRyeWluZyAqLyB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgY29uc3QgQ0ZHID0ge1xyXG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcclxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxyXG4gICAgICAgIC8vU0hPV19PTl9QQUdFU19SRTogL1xcYnN1bW1hcnlcXGIvaSxcclxuICAgICAgICBTSE9XX09OX1BBR0VTX1JFOiAvXnBhcnRcXHMqc3VtbWFyeSQvaSxcclxuICAgICAgICBEU19BVFRBQ0hNRU5UU19CWV9RVU9URTogMTE3MTMsXHJcbiAgICAgICAgQVRUQUNITUVOVF9HUk9VUF9LRVk6IDExLFxyXG4gICAgICAgIERTX1FVT1RFX0hFQURFUl9HRVQ6IDMxNTYsXHJcbiAgICAgICAgUE9MTF9NUzogMjAwLFxyXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXHJcbiAgICB9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGdldFRhYlNjb3BlSWQobnMgPSAnUVQnKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgayA9IGBsdDoke25zfTpzY29wZUlkYDtcclxuICAgICAgICAgICAgbGV0IHYgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGspO1xyXG4gICAgICAgICAgICBpZiAoIXYpIHtcclxuICAgICAgICAgICAgICAgIHYgPSBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0NykpO1xyXG4gICAgICAgICAgICAgICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbShrLCB2KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xyXG4gICAgICAgIC8vIEFjdGl2ZSBMSSByZW5kZXJzIHRoZSBwYWdlIG5hbWUgYXMgYSBkaXJlY3QgdGV4dCBub2RlXHJcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xyXG4gICAgICAgIGlmICghbGkpIHJldHVybiAnJztcclxuICAgICAgICByZXR1cm4gKGxpLnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkge1xyXG4gICAgICAgIHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVXaXphcmRWTSgpIHtcclxuICAgICAgICBjb25zdCBhbmNob3IgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCkgPyBDRkcuR1JJRF9TRUwgOiBDRkcuQUNUSU9OX0JBUl9TRUw7XHJcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcclxuICAgICAgICByZXR1cm4gdmlld01vZGVsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpO1xyXG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gS08uZGF0YUZvcihncmlkKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJhdzAgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhd1swXSA6IG51bGw7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIHsgfVxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xyXG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xyXG4gICAgICAgICAgICBjb25zdCB2ID0gcm9vdFZNICYmICh3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZUtleScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlLlF1b3RlS2V5JykpO1xyXG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xyXG4gICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xyXG4gICAgICAgIHJldHVybiBtID8gTnVtYmVyKG1bMV0pIDogbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcclxuICAgIGxldCBfX1FUX18gPSBudWxsO1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xyXG4gICAgICAgIGlmICghUVRGKSByZXR1cm4gbnVsbDtcclxuICAgICAgICBjb25zdCB7IHJlcG8gfSA9IFFURi51c2UoTnVtYmVyKHF1b3RlS2V5KSk7XHJcbiAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgICAgICAgICAgICAgICAgIC8vIDwtLSBiaW5kIHRoZSBtb2R1bGUtbGV2ZWwgaGFuZGxlXHJcbiAgICAgICAgbGFzdFNjb3BlID0gTnVtYmVyKHF1b3RlS2V5KTsgICAgIC8vIDwtLSB0cmFjayBzY29wZSB3ZVx1MjAxOXJlIGJvdW5kIHRvXHJcbiAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcclxuICAgICAgICByZXR1cm4gcmVwbztcclxuICAgIH1cclxuXHJcblxyXG5cclxuXHJcbiAgICAvLyBCYWNrZ3JvdW5kIHByb21vdGlvbiAocGVyLXRhYiBkcmFmdCAtPiBwZXItcXVvdGUpIHdpdGggZ2VudGxlIHJldHJpZXNcclxuICAgIGNvbnN0IF9fUFJPTU9URSA9IHsgdGltZXI6IG51bGwsIHRyaWVzOiAwLCBtYXg6IDEyMCwgaW50ZXJ2YWxNczogMjUwIH07XHJcblxyXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHF1b3RlS2V5KSB7XHJcbiAgICAgICAgaWYgKF9fUFJPTU9URS50aW1lcikgcmV0dXJuO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcG9RID0gYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KTtcclxuICAgICAgICAgICAgICAgIGlmICghUVRGIHx8ICFyZXBvUSkgeyBpZiAoKytfX1BST01PVEUudHJpZXMgPj0gX19QUk9NT1RFLm1heCkgc3RvcFByb21vdGUoKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVhZCB0aGUgU0FNRSBwZXItdGFiIGRyYWZ0IHNjb3BlIFFUMTAgd3JpdGVzIHRvXHJcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgKGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGRyYWZ0UmVwby5nZXQoKSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlcG9RLnBhdGNoSGVhZGVyKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocXVvdGVLZXkpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206ICdkcmFmdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgVXBkYXRlZF9BdDogZHJhZnQuVXBkYXRlZF9BdCB8fCBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc3RvcFByb21vdGUoKTtcclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICAvLyBrZWVwIHJldHJ5aW5nXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCBfX1BST01PVEUuaW50ZXJ2YWxNcyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3RvcFByb21vdGUoKSB7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbChfX1BST01PVEUudGltZXIpO1xyXG4gICAgICAgIF9fUFJPTU9URS50aW1lciA9IG51bGw7XHJcbiAgICAgICAgX19QUk9NT1RFLnRyaWVzID0gMDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gPT09PT0gTWVyZ2UgUVQxMCBkcmFmdCBcdTIxOTIgcGVyLXF1b3RlIChvbmNlKSA9PT09PVxyXG4gICAgYXN5bmMgZnVuY3Rpb24gbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspIHtcclxuICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCFRVEYpIHsgc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHFrKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgIC8vIFJlYWQgcGVyLXRhYiBkcmFmdCAoc2FtZSBzY29wZSBRVDEwIHdyaXRlcyB0bylcclxuICAgICAgICBjb25zdCB7IHJlcG86IGRyYWZ0UmVwbyB9ID0gUVRGLnVzZShnZXRUYWJTY29wZUlkKCdRVCcpKTtcclxuICAgICAgICBjb25zdCBkcmFmdCA9IGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGF3YWl0IGRyYWZ0UmVwby5nZXQoKTsgLy8gdG9sZXJhdGUgbGVnYWN5XHJcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xyXG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47IC8vIERDIG5vdCByZWFkeSB5ZXRcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWRlciA9IChhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyKCkpIHx8IHt9O1xyXG4gICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudEhlYWRlci5DdXN0b21lcl9ObyA/PyAnJyk7XHJcbiAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdC5DdXN0b21lcl9ObyA/PyAnJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxyXG4gICAgICAgICAgICAoTnVtYmVyKChhd2FpdCBkcmFmdFJlcG8uZ2V0KCkpPy5VcGRhdGVkX0F0IHx8IDApID4gTnVtYmVyKGN1cnJlbnRIZWFkZXIuUHJvbW90ZWRfQXQgfHwgMCkpIHx8XHJcbiAgICAgICAgICAgIChjdXJDdXN0ICE9PSBuZXdDdXN0KSB8fFxyXG4gICAgICAgICAgICAoY3VycmVudEhlYWRlci5DYXRhbG9nX0tleSAhPT0gZHJhZnQuQ2F0YWxvZ19LZXkpIHx8XHJcbiAgICAgICAgICAgIChjdXJyZW50SGVhZGVyLkNhdGFsb2dfQ29kZSAhPT0gZHJhZnQuQ2F0YWxvZ19Db2RlKTtcclxuXHJcbiAgICAgICAgaWYgKCFuZWVkc01lcmdlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7XHJcbiAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHFrKSxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IGRyYWZ0LkN1c3RvbWVyX05vID8/IG51bGwsXHJcbiAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDYXRhbG9nX0NvZGU6IGRyYWZ0LkNhdGFsb2dfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxyXG4gICAgICAgICAgICBQcm9tb3RlZF9BdDogRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtaHlkcmF0aW9uIG5leHQgdGltZVxyXG4gICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBjbGVhciBwZXItdGFiIGRyYWZ0IGFuZCBsZWdhY3kgaWYgcHJlc2VudFxyXG4gICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XHJcbiAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XHJcblxyXG5cclxuICAgICAgICBkbG9nKCdEcmFmdCBtZXJnZWQgKGZsYXQgcmVwbyBoZWFkZXIgdXBkYXRlZCknLCB7IHFrIH0pO1xyXG4gICAgfVxyXG5cclxuXHJcblxyXG4gICAgLy8gPT09PT0gRGF0YSBzb3VyY2VzID09PT09XHJcbiAgICBhc3luYyBmdW5jdGlvbiBmZXRjaEF0dGFjaG1lbnRDb3VudChxdW90ZUtleSkge1xyXG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIikgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiAoUk9PVC5sdD8uY29yZT8ucGxleCk7XHJcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybiAwO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19BVFRBQ0hNRU5UU19CWV9RVU9URSwge1xyXG4gICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogQ0ZHLkFUVEFDSE1FTlRfR1JPVVBfS0VZLFxyXG4gICAgICAgICAgICBSZWNvcmRfS2V5X1ZhbHVlOiBTdHJpbmcocXVvdGVLZXkpXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHJvd3MpID8gcm93cy5sZW5ndGggOiAwO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHF1b3RlSGVhZGVyR2V0KHJvdykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIEN1c3RvbWVyX0NvZGU6IHJvdz8uQ3VzdG9tZXJfQ29kZSA/PyBudWxsLFxyXG4gICAgICAgICAgICBDdXN0b21lcl9OYW1lOiByb3c/LkN1c3RvbWVyX05hbWUgPz8gbnVsbCxcclxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IHJvdz8uQ3VzdG9tZXJfTm8gPz8gbnVsbCxcclxuICAgICAgICAgICAgUXVvdGVfTm86IHJvdz8uUXVvdGVfTm8gPz8gbnVsbFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBhc3luYyBmdW5jdGlvbiBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKSB7XHJcbiAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICBpZiAoIXF1b3RlUmVwbykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGhlYWRlclNuYXAgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpKSB8fCB7fTtcclxuICAgICAgICBpZiAoaGVhZGVyU25hcC5RdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSBcImZ1bmN0aW9uXCIgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiBST09ULmx0Py5jb3JlPy5wbGV4KTtcclxuICAgICAgICBpZiAoIXBsZXg/LmRzUm93cykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFrKSB9KSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpcnN0ID0gKEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGgpID8gcXVvdGVIZWFkZXJHZXQocm93c1swXSkgOiBudWxsO1xyXG4gICAgICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuXHJcbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHsgUXVvdGVfS2V5OiBxaywgLi4uZmlyc3QsIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IEh1YiBidXR0b24gPT09PT1cclxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzNS1hdHRhY2htZW50cy1idG4nO1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcclxuICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTtcclxuICAgICAgICBpZiAoIWh1YikgeyBkbG9nKCdlbnN1cmVIdWJCdXR0b246IGh1YiBub3QgYXZhaWxhYmxlJyk7IHJldHVybjsgfVxyXG4gICAgICAgIGlmICh0eXBlb2YgaHViLnJlZ2lzdGVyQnV0dG9uICE9PSAnZnVuY3Rpb24nKSB7IGRsb2coJ2Vuc3VyZUh1YkJ1dHRvbjogaHViLnJlZ2lzdGVyQnV0dG9uIG1pc3NpbmcnKTsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBodWIubGlzdD8uKCk7XHJcbiAgICAgICAgY29uc3QgYWxyZWFkeSA9IEFycmF5LmlzQXJyYXkobGlzdCkgJiYgbGlzdC5pbmNsdWRlcyhIVUJfQlROX0lEKTtcclxuICAgICAgICBpZiAoYWxyZWFkeSkge1xyXG4gICAgICAgICAgICAvLyBCdXR0b24gZXhpc3RzOyBub3RoaW5nIHRvIGRvIGhlcmVcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZGxvZygnZW5zdXJlSHViQnV0dG9uOiByZWdpc3RlcmluZ1x1MjAyNicsIHsgaWQ6IEhVQl9CVE5fSUQgfSk7XHJcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xyXG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcclxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cyAwJyxcclxuICAgICAgICAgICAgdGl0bGU6ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJyxcclxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXHJcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcclxuICAgICAgICB9KTtcclxuICAgICAgICB0cnkgeyB3aW5kb3cuX19IVUIgPSBodWI7IGRsb2coJ2Vuc3VyZUh1YkJ1dHRvbjogaHViLmxpc3QoKScsIGh1Yi5saXN0Py4oKSk7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgZGxvZygnZW5zdXJlSHViQnV0dG9uOiByZWdpc3RlcmVkJyk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gc2V0QmFkZ2VDb3VudChuKSB7XHJcbiAgICAgICAgY29uc3QgY291bnQgPSBOdW1iZXIobiA/PyAwKTtcclxuICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTtcclxuICAgICAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gSWYgaHViIHN1cHBvcnRzIHVwZGF0ZUJ1dHRvbiwgdXNlIGl0OyBvdGhlcndpc2UgbWluaW1hbCBjaHVyblxyXG4gICAgICAgIGlmICh0eXBlb2YgaHViLnVwZGF0ZUJ1dHRvbiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBodWIudXBkYXRlQnV0dG9uKEhVQl9CVE5fSUQsIHsgbGFiZWw6IGBBdHRhY2htZW50cyAke2NvdW50fWAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZhbGxiYWNrOiBvbmx5IHJlLXJlZ2lzdGVyIGlmIG5vdCBwcmVzZW50IChhdm9pZCByZW1vdmUvcmUtYWRkIGNodXJuKVxyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBodWIubGlzdD8uKCk7XHJcbiAgICAgICAgY29uc3QgYWxyZWFkeSA9IEFycmF5LmlzQXJyYXkobGlzdCkgJiYgbGlzdC5pbmNsdWRlcyhIVUJfQlROX0lEKTtcclxuICAgICAgICBpZiAoIWFscmVhZHkpIHtcclxuICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xyXG4gICAgICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXHJcbiAgICAgICAgICAgICAgICBsYWJlbDogYEF0dGFjaG1lbnRzICR7Y291bnR9YCxcclxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXHJcbiAgICAgICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcclxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gTm8gdXBkYXRlIEFQSTsgZG8gYSBnZW50bGUgcmVwbGFjZVxyXG4gICAgICAgICAgICBodWIucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XHJcbiAgICAgICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcclxuICAgICAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxyXG4gICAgICAgICAgICAgICAgbGFiZWw6IGBBdHRhY2htZW50cyAke2NvdW50fWAsXHJcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxyXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXHJcbiAgICAgICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5PbmVSZWZyZXNoKHRydWUpXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBsZXQgcmVmcmVzaEluRmxpZ2h0ID0gZmFsc2U7XHJcbiAgICBhc3luYyBmdW5jdGlvbiBydW5PbmVSZWZyZXNoKG1hbnVhbCA9IGZhbHNlKSB7XHJcbiAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7IC8vIGd1YXJhbnRlZXMgdGhlIGJ1dHRvbiBpcyBwcmVzZW50XHJcbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xyXG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XHJcbiAgICAgICAgY29uc3QgdCA9IGx0LmNvcmUuaHViLmJlZ2luVGFzayhcIkZldGNoaW5nIEF0dGFjaG1lbnRzXHUyMDI2XCIsIFwiaW5mb1wiKTtcclxuXHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XHJcbiAgICAgICAgICAgIGlmICghcWsgfHwgIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudCgwKTtcclxuICAgICAgICAgICAgICAgIHQuZXJyb3IoYFx1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kYCwgNDAwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIElmIHNjb3BlIGNoYW5nZWQsIHBhaW50IGFueSBleGlzdGluZyBzbmFwc2hvdCBiZWZvcmUgZmV0Y2hpbmdcclxuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVhZCA9IGF3YWl0IHF1b3RlUmVwbz8uZ2V0SGVhZGVyPy4oKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZD8uQXR0YWNobWVudF9Db3VudCAhPSBudWxsKSBzZXRCYWRnZUNvdW50KE51bWJlcihoZWFkLkF0dGFjaG1lbnRfQ291bnQpKTtcclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFByb21vdGUgJiBjbGVhciBkcmFmdCBCRUZPUkUgcGVyLXF1b3RlIHVwZGF0ZXNcclxuICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgREMgaXNuJ3QgcmVhZHkgeWV0LCByZXNvbHZlIHRoZSB0YXNrIHNvIHRoZSBwaWxsIGRvZXNuXHUyMDE5dCBzcGluIGZvcmV2ZXJcclxuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHtcclxuICAgICAgICAgICAgICAgIHQuZXJyb3IoJ0RhdGEgY29udGV4dCBub3QgcmVhZHkgeWV0JywgMjAwMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgZmV0Y2hBdHRhY2htZW50Q291bnQocWspO1xyXG4gICAgICAgICAgICBzZXRCYWRnZUNvdW50KGNvdW50KTtcclxuICAgICAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHsgUXVvdGVfS2V5OiBxaywgQXR0YWNobWVudF9Db3VudDogTnVtYmVyKGNvdW50KSB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFsd2F5cyByZXNvbHZlIHRoZSB0YXNrXHJcbiAgICAgICAgICAgIGNvbnN0IG9rID0gY291bnQgPiAwO1xyXG4gICAgICAgICAgICB0LnN1Y2Nlc3Mob2sgPyBgXHUyNzA1ICR7Y291bnR9IGF0dGFjaG1lbnQocylgIDogJ1x1MjZBMFx1RkUwRiBObyBhdHRhY2htZW50cycsIDIwMDApO1xyXG5cclxuICAgICAgICAgICAgLy8gT3B0aW9uYWwgdG9hc3Qgd2hlbiB1c2VyIGNsaWNrZWQgbWFudWFsbHlcclxuICAgICAgICAgICAgaWYgKG1hbnVhbCkge1xyXG4gICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxyXG4gICAgICAgICAgICAgICAgICAgIG9rID8gYFx1MjcwNSAke2NvdW50fSBhdHRhY2htZW50KHMpYCA6ICdcdTI2QTBcdUZFMEYgTm8gYXR0YWNobWVudHMnLFxyXG4gICAgICAgICAgICAgICAgICAgIG9rID8gJ3N1Y2Nlc3MnIDogJ3dhcm4nLFxyXG4gICAgICAgICAgICAgICAgICAgIHsgdGltZW91dDogMjAwMCwgdG9hc3Q6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBkbG9nKCdyZWZyZXNoJywgeyBxaywgY291bnQgfSk7XHJcblxyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XHJcbiAgICAgICAgICAgIHQuZXJyb3IoYFx1Mjc0QyBBdHRhY2htZW50cyByZWZyZXNoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsIDQwMDApO1xyXG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXHJcbiAgICAgICAgICAgICAgICBgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCxcclxuICAgICAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICB7IHRpbWVvdXQ6IDQwMDAsIHRvYXN0OiB0cnVlIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgPT09PT1cclxuICAgIGxldCBib290ZWQgPSBmYWxzZTsgbGV0IG9mZlVybCA9IG51bGw7XHJcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xyXG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcclxuICAgICAgICBib290ZWQgPSB0cnVlO1xyXG4gICAgICAgIGF3YWl0IHJhZigpO1xyXG5cclxuICAgICAgICB0cnkgeyBhd2FpdCBnZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTsgfSBjYXRjaCB7IH1cclxuICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTtcclxuICAgICAgICB0cnkgeyBhd2FpdCBnZXRIdWIoKTsgfSBjYXRjaCB7IH1cclxuXHJcbiAgICAgICAgc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuICAgICAgICBhd2FpdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNob3cgPSBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpO1xyXG5cclxuICAgICAgICBpZiAoc2hvdykge1xyXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcclxuICAgICAgICAgICAgc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHFrKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChxayAmJiBOdW1iZXIuaXNGaW5pdGUocWspICYmIHFrID4gMCkge1xyXG4gICAgICAgICAgICAgICAgcXVvdGVSZXBvID0gYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHJ1bk9uZVJlZnJlc2goZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHsgYXdhaXQgaHlkcmF0ZVBhcnRTdW1tYXJ5T25jZShxayk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5lcnJvcignUVQzNSBoeWRyYXRlIGZhaWxlZCcsIGUpOyB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgdGhlIGh1YiBidXR0b24gZXhpc3RzIHdpdGggemVybyB3aGVuIHdlIGNhblx1MjAxOXQgZGV0ZWN0IGEgcXVvdGUgeWV0XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gTm90IG9uIGEgdGFyZ2V0IHBhZ2VcclxuICAgICAgICAgICAgaWYgKEZPUkNFX1NIT1dfQlROKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTtcclxuICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQoMCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoKTtcclxuICAgICAgICAgICAgICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vb3AgKi8gfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XHJcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XHJcbiAgICAgICAgb2ZmVXJsPy4oKTtcclxuICAgICAgICBvZmZVcmwgPSBudWxsO1xyXG4gICAgICAgIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcclxuICAgICAgICBzdG9wUHJvbW90ZSgpOyAvLyBlbnN1cmUgYmFja2dyb3VuZCB0aW1lciBpcyBjbGVhcmVkXHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpO1xyXG5cclxuICAgIGxldCBwYWdlT2JzZXJ2ZXIgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XHJcbiAgICAgICAgaWYgKCFyb290KSByZXR1cm47XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAobXV0LnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJyB8fCBtLnR5cGUgPT09ICdjaGlsZExpc3QnKSkge1xyXG4gICAgICAgICAgICAgICAgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcGFnZU9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnY2xhc3MnXSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpIHtcclxuICAgICAgICBjb25zdCBwYWdlTmFtZSA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCk7XHJcbiAgICAgICAgZGxvZygncmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eTonLCB7IHBhZ2VOYW1lIH0pO1xyXG4gICAgICAgIGlmIChGT1JDRV9TSE9XX0JUTiB8fCBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUh1YkJ1dHRvbigpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1YigpO1xyXG4gICAgICAgICAgICBkbG9nKCdyZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5OiByZW1vdmluZyBidXR0b24gKG9mZiB0YXJnZXQgcGFnZSknKTtcclxuICAgICAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCkge1xyXG4gICAgICAgIHRyeSB7IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSk7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgdHJ5IHsgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgcGFnZU9ic2VydmVyID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKFJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xyXG5cclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUluRSxVQUFNLGdCQUFnQixDQUFDLE9BQU87QUFDMUIsWUFBTSxPQUFPLElBQUksTUFBTSxNQUFNO0FBQzdCLGFBQVEsT0FBTyxTQUFTLGFBQWMsS0FBSyxFQUFFLElBQUksR0FBRztBQUFBLElBQ3hEO0FBSUEsVUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLHFCQUNyQixHQUFHLEtBQUssS0FBSyxtQkFBbUIsRUFBRSxJQUFJLE1BQU0sUUFBUSxTQUFTLGNBQWMsY0FBYyxDQUFDLElBQzFGO0FBRU4sS0FBQyxZQUFZO0FBRVQsWUFBTSxPQUFPLE1BQU0sT0FBTyxlQUFlO0FBQ3pDLFlBQU0sU0FBUztBQUFBLFFBQ1gsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsT0FBTztB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
