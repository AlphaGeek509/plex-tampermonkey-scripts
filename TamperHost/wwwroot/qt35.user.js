// ==UserScript==
// @name        QT35_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.11
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.11-1758584936458
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.11-1758584936458
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.11-1758584936458
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.11-1758584936458
// @require      http://localhost:5000/lt-core.user.js?v=3.8.11-1758584936458
// @resource     THEME_CSS http://localhost:5000/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @run-at      document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @updateURL   http://localhost:5000/qt35.user.js
// @downloadURL http://localhost:5000/qt35.user.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDM1LWF0dGFjaG1lbnRzR2V0L3F0MzUuaW5kZXguanNcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4gREVWICYmIGNvbnNvbGUuZGVidWcoJ1FUMzUnLCAuLi5hKTtcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcblxuICAgIC8vIFNhZmUgZGVsZWdhdGluZyB3cmFwcGVyOiB1c2UgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggd2hlbiBhdmFpbGFibGUsXG4gICAgLy8gb3RoZXJ3aXNlIGp1c3QgcnVuIHRoZSBjYWxsYmFjayBvbmNlIChiZXN0LWVmZm9ydCBmYWxsYmFjaykuXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cblxuICAgIC8vIEZsYXQgcmVwbyBmYWN0b3J5IChubyBwb2xsaW5nIHJlcXVpcmVkIG5vdyB0aGF0IGx0LWRhdGEtY29yZSBpbnN0YWxscyBhdCBkb2Mtc3RhcnQpXG4gICAgY29uc3QgUVRGID0gbHQuY29yZT8uZGF0YT8ubWFrZUZsYXRTY29wZWRSZXBvXG4gICAgICAgID8gbHQuY29yZS5kYXRhLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiBcIlFUXCIsIGVudGl0eTogXCJxdW90ZVwiLCBsZWdhY3lFbnRpdHk6IFwiUXVvdGVIZWFkZXJcIiB9KVxuICAgICAgICA6IG51bGw7XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+ICh0eXBlb2Ygb3BlbkF0dGFjaG1lbnRzTW9kYWwgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICA/IG9wZW5BdHRhY2htZW50c01vZGFsKClcbiAgICAgICAgICAgICAgICA6IGx0LmNvcmUuaHViLm5vdGlmeSgnQXR0YWNobWVudHMgVUkgbm90IGF2YWlsYWJsZScsICd3YXJuJywgeyB0b2FzdDogdHJ1ZSB9KSlcbiAgICAgICAgfSk7XG4gICAgfSkoKTtcblxuXG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBjb25zdCBGT1JDRV9TSE9XX0JUTiA9IGZhbHNlOyAvLyBzZXQgdG8gdHJ1ZSBkdXJpbmcgdGVzdGluZ1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XG5cbiAgICAvLyBNb3VudCBodWIgaW50byB0aGUgTkFWIGJhciBsaWtlIFFUMTBcbiAgICAvLyBOT1RFOiBEbyBub3QgYXdhaXQgYXQgdG9wLWxldmVsLiBpbml0KCkgcGVyZm9ybXMgdGhlIGF3YWl0ZWQgbW91bnQuXG4gICAgUk9PVC5fX0xUX0hVQl9NT1VOVCA9IFwibmF2XCI7XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gUm9idXN0IGh1YiBnZXR0ZXIgdGhhdCB0b2xlcmF0ZXMgbGF0ZS1sb2FkaW5nIGx0LXVpLWh1YlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogXCJuYXZcIiB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykgeyAvLyB+NXMgdG90YWxcbiAgICAgICAgICAgIGNvbnN0IGVuc3VyZSA9IChST09ULmVuc3VyZUxUSHViIHx8IHdpbmRvdy5lbnN1cmVMVEh1Yik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGVuc3VyZShvcHRzKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGh1YikgcmV0dXJuIGh1YjtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCByZXRyeWluZyAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG5cbiAgICBjb25zdCBDRkcgPSB7XG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcbiAgICAgICAgR1JJRF9TRUw6ICcucGxleC1ncmlkJyxcbiAgICAgICAgLy9TSE9XX09OX1BBR0VTX1JFOiAvXFxic3VtbWFyeVxcYi9pLFxuICAgICAgICBTSE9XX09OX1BBR0VTX1JFOiAvXnBhcnRcXHMqc3VtbWFyeSQvaSxcbiAgICAgICAgRFNfQVRUQUNITUVOVFNfQllfUVVPVEU6IDExNzEzLFxuICAgICAgICBBVFRBQ0hNRU5UX0dST1VQX0tFWTogMTEsXG4gICAgICAgIERTX1FVT1RFX0hFQURFUl9HRVQ6IDMxNTYsXG4gICAgICAgIFBPTExfTVM6IDIwMCxcbiAgICAgICAgVElNRU9VVF9NUzogMTIwMDBcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ2V0VGFiU2NvcGVJZChucyA9ICdRVCcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGsgPSBgbHQ6JHtuc306c2NvcGVJZGA7XG4gICAgICAgICAgICBsZXQgdiA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oayk7XG4gICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICB2ID0gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDIxNDc0ODM2NDcpKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKGssIHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0Nyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgLy8gQWN0aXZlIExJIHJlbmRlcnMgdGhlIHBhZ2UgbmFtZSBhcyBhIGRpcmVjdCB0ZXh0IG5vZGVcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xuICAgICAgICBpZiAoIWxpKSByZXR1cm4gJyc7XG4gICAgICAgIHJldHVybiAobGkudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7XG4gICAgICAgIHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xuICAgIH1cblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhdzAgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhd1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJhdzAgPyB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/LihyYXcwLCAnUXVvdGVLZXknKSA6IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gcm9vdEVsID8gS08/LmRhdGFGb3I/Lihyb290RWwpIDogbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHYgPSByb290Vk0gJiYgKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlS2V5JykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGUuUXVvdGVLZXknKSk7XG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICBjb25zdCBtID0gL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICAgIHJldHVybiBtID8gTnVtYmVyKG1bMV0pIDogbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcbiAgICBsZXQgX19RVF9fID0gbnVsbDtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xuICAgICAgICBpZiAoIVFURikgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShOdW1iZXIocXVvdGVLZXkpKTtcbiAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgICAgICAgICAgICAgICAgIC8vIDwtLSBiaW5kIHRoZSBtb2R1bGUtbGV2ZWwgaGFuZGxlXG4gICAgICAgIGxhc3RTY29wZSA9IE51bWJlcihxdW90ZUtleSk7ICAgICAvLyA8LS0gdHJhY2sgc2NvcGUgd2VcdTIwMTlyZSBib3VuZCB0b1xuICAgICAgICBhd2FpdCByZXBvLmVuc3VyZUZyb21MZWdhY3lJZk1pc3Npbmc/LigpO1xuICAgICAgICByZXR1cm4gcmVwbztcbiAgICB9XG5cblxuXG5cbiAgICAvLyBCYWNrZ3JvdW5kIHByb21vdGlvbiAocGVyLXRhYiBkcmFmdCAtPiBwZXItcXVvdGUpIHdpdGggZ2VudGxlIHJldHJpZXNcbiAgICBjb25zdCBfX1BST01PVEUgPSB7IHRpbWVyOiBudWxsLCB0cmllczogMCwgbWF4OiAxMjAsIGludGVydmFsTXM6IDI1MCB9O1xuXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVQcm9tb3RlRHJhZnRUb1F1b3RlKHF1b3RlS2V5KSB7XG4gICAgICAgIGlmIChfX1BST01PVEUudGltZXIpIHJldHVybjtcbiAgICAgICAgX19QUk9NT1RFLnRpbWVyID0gc2V0SW50ZXJ2YWwoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXBvUSA9IGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSk7XG4gICAgICAgICAgICAgICAgaWYgKCFRVEYgfHwgIXJlcG9RKSB7IGlmICgrK19fUFJPTU9URS50cmllcyA+PSBfX1BST01PVEUubWF4KSBzdG9wUHJvbW90ZSgpOyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIC8vIFJlYWQgdGhlIFNBTUUgcGVyLXRhYiBkcmFmdCBzY29wZSBRVDEwIHdyaXRlcyB0b1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgcmVwbzogZHJhZnRSZXBvIH0gPSBRVEYudXNlKGdldFRhYlNjb3BlSWQoJ1FUJykpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgKGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpIHx8IGRyYWZ0UmVwby5nZXQoKSk7XG4gICAgICAgICAgICAgICAgaWYgKGRyYWZ0ICYmIE9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwb1EucGF0Y2hIZWFkZXIoe1xuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocXVvdGVLZXkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgQ3VzdG9tZXJfTm86IGRyYWZ0LkN1c3RvbWVyX05vID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBDYXRhbG9nX0tleTogZHJhZnQuQ2F0YWxvZ19LZXkgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBQcm9tb3RlZF9Gcm9tOiAnZHJhZnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgUHJvbW90ZWRfQXQ6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFVwZGF0ZWRfQXQ6IGRyYWZ0LlVwZGF0ZWRfQXQgfHwgRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBRVEYudXNlKCdkcmFmdCcpOyBhd2FpdCBsZWdhY3kuY2xlYXI/LigpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0b3BQcm9tb3RlKCk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBrZWVwIHJldHJ5aW5nXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIF9fUFJPTU9URS5pbnRlcnZhbE1zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wUHJvbW90ZSgpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChfX1BST01PVEUudGltZXIpO1xuICAgICAgICBfX1BST01PVEUudGltZXIgPSBudWxsO1xuICAgICAgICBfX1BST01PVEUudHJpZXMgPSAwO1xuICAgIH1cblxuXG4gICAgLy8gPT09PT0gTWVyZ2UgUVQxMCBkcmFmdCBcdTIxOTIgcGVyLXF1b3RlIChvbmNlKSA9PT09PVxuICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKSB7XG4gICAgICAgIGlmICghcWsgfHwgIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgcmV0dXJuO1xuXG4gICAgICAgIGlmICghUVRGKSB7IHNjaGVkdWxlUHJvbW90ZURyYWZ0VG9RdW90ZShxayk7IHJldHVybjsgfVxuXG4gICAgICAgIC8vIFJlYWQgcGVyLXRhYiBkcmFmdCAoc2FtZSBzY29wZSBRVDEwIHdyaXRlcyB0bylcbiAgICAgICAgY29uc3QgeyByZXBvOiBkcmFmdFJlcG8gfSA9IFFURi51c2UoZ2V0VGFiU2NvcGVJZCgnUVQnKSk7XG4gICAgICAgIGNvbnN0IGRyYWZ0ID0gYXdhaXQgZHJhZnRSZXBvLmdldEhlYWRlcj8uKCkgfHwgYXdhaXQgZHJhZnRSZXBvLmdldCgpOyAvLyB0b2xlcmF0ZSBsZWdhY3lcbiAgICAgICAgaWYgKCFkcmFmdCkgcmV0dXJuO1xuXG4gICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47IC8vIERDIG5vdCByZWFkeSB5ZXRcblxuICAgICAgICBjb25zdCBjdXJyZW50SGVhZGVyID0gKGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXIoKSkgfHwge307XG4gICAgICAgIGNvbnN0IGN1ckN1c3QgPSBTdHJpbmcoY3VycmVudEhlYWRlci5DdXN0b21lcl9ObyA/PyAnJyk7XG4gICAgICAgIGNvbnN0IG5ld0N1c3QgPSBTdHJpbmcoZHJhZnQuQ3VzdG9tZXJfTm8gPz8gJycpO1xuXG4gICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxuICAgICAgICAgICAgKE51bWJlcigoYXdhaXQgZHJhZnRSZXBvLmdldCgpKT8uVXBkYXRlZF9BdCB8fCAwKSA+IE51bWJlcihjdXJyZW50SGVhZGVyLlByb21vdGVkX0F0IHx8IDApKSB8fFxuICAgICAgICAgICAgKGN1ckN1c3QgIT09IG5ld0N1c3QpIHx8XG4gICAgICAgICAgICAoY3VycmVudEhlYWRlci5DYXRhbG9nX0tleSAhPT0gZHJhZnQuQ2F0YWxvZ19LZXkpIHx8XG4gICAgICAgICAgICAoY3VycmVudEhlYWRlci5DYXRhbG9nX0NvZGUgIT09IGRyYWZ0LkNhdGFsb2dfQ29kZSk7XG5cbiAgICAgICAgaWYgKCFuZWVkc01lcmdlKSByZXR1cm47XG5cbiAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHtcbiAgICAgICAgICAgIFF1b3RlX0tleTogTnVtYmVyKHFrKSxcbiAgICAgICAgICAgIEN1c3RvbWVyX05vOiBkcmFmdC5DdXN0b21lcl9ObyA/PyBudWxsLFxuICAgICAgICAgICAgQ2F0YWxvZ19LZXk6IGRyYWZ0LkNhdGFsb2dfS2V5ID8/IG51bGwsXG4gICAgICAgICAgICBDYXRhbG9nX0NvZGU6IGRyYWZ0LkNhdGFsb2dfQ29kZSA/PyBudWxsLFxuICAgICAgICAgICAgUHJvbW90ZWRfRnJvbTogJ2RyYWZ0JyxcbiAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgLy8gZm9yY2UgcmUtaHlkcmF0aW9uIG5leHQgdGltZVxuICAgICAgICAgICAgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IG51bGxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gY2xlYXIgcGVyLXRhYiBkcmFmdCBhbmQgbGVnYWN5IGlmIHByZXNlbnRcbiAgICAgICAgYXdhaXQgZHJhZnRSZXBvLmNsZWFyPy4oKTtcbiAgICAgICAgdHJ5IHsgY29uc3QgeyByZXBvOiBsZWdhY3kgfSA9IFFURi51c2UoJ2RyYWZ0Jyk7IGF3YWl0IGxlZ2FjeS5jbGVhcj8uKCk7IH0gY2F0Y2ggeyB9XG5cblxuICAgICAgICBkbG9nKCdEcmFmdCBtZXJnZWQgKGZsYXQgcmVwbyBoZWFkZXIgdXBkYXRlZCknLCB7IHFrIH0pO1xuICAgIH1cblxuXG5cbiAgICAvLyA9PT09PSBEYXRhIHNvdXJjZXMgPT09PT1cbiAgICBhc3luYyBmdW5jdGlvbiBmZXRjaEF0dGFjaG1lbnRDb3VudChxdW90ZUtleSkge1xuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSBcImZ1bmN0aW9uXCIpID8gYXdhaXQgZ2V0UGxleEZhY2FkZSgpIDogKFJPT1QubHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXg/LmRzUm93cykgcmV0dXJuIDA7XG4gICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKENGRy5EU19BVFRBQ0hNRU5UU19CWV9RVU9URSwge1xuICAgICAgICAgICAgQXR0YWNobWVudF9Hcm91cF9LZXk6IENGRy5BVFRBQ0hNRU5UX0dST1VQX0tFWSxcbiAgICAgICAgICAgIFJlY29yZF9LZXlfVmFsdWU6IFN0cmluZyhxdW90ZUtleSlcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShyb3dzKSA/IHJvd3MubGVuZ3RoIDogMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBxdW90ZUhlYWRlckdldChyb3cpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIEN1c3RvbWVyX0NvZGU6IHJvdz8uQ3VzdG9tZXJfQ29kZSA/PyBudWxsLFxuICAgICAgICAgICAgQ3VzdG9tZXJfTmFtZTogcm93Py5DdXN0b21lcl9OYW1lID8/IG51bGwsXG4gICAgICAgICAgICBDdXN0b21lcl9Obzogcm93Py5DdXN0b21lcl9ObyA/PyBudWxsLFxuICAgICAgICAgICAgUXVvdGVfTm86IHJvdz8uUXVvdGVfTm8gPz8gbnVsbFxuICAgICAgICB9O1xuICAgIH1cbiAgICBhc3luYyBmdW5jdGlvbiBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKSB7XG4gICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG4gICAgICAgIGlmICghcXVvdGVSZXBvKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGhlYWRlclNuYXAgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpKSB8fCB7fTtcbiAgICAgICAgaWYgKGhlYWRlclNuYXAuUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQpIHJldHVybjtcblxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSBcImZ1bmN0aW9uXCIgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiBST09ULmx0Py5jb3JlPy5wbGV4KTtcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybjtcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoQ0ZHLkRTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocWspIH0pKTtcblxuICAgICAgICBjb25zdCBmaXJzdCA9IChBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoKSA/IHF1b3RlSGVhZGVyR2V0KHJvd3NbMF0pIDogbnVsbDtcbiAgICAgICAgaWYgKCFmaXJzdCkgcmV0dXJuO1xuXG4gICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIC4uLmZpcnN0LCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PSBIdWIgYnV0dG9uID09PT09XG4gICAgY29uc3QgSFVCX0JUTl9JRCA9ICdxdDM1LWF0dGFjaG1lbnRzLWJ0bic7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJCdXR0b24oKSB7XG4gICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiBcIm5hdlwiIH0pO1xuICAgICAgICBpZiAoIWh1YikgeyBkbG9nKCdlbnN1cmVIdWJCdXR0b246IGh1YiBub3QgYXZhaWxhYmxlJyk7IHJldHVybjsgfVxuICAgICAgICBpZiAodHlwZW9mIGh1Yi5yZWdpc3RlckJ1dHRvbiAhPT0gJ2Z1bmN0aW9uJykgeyBkbG9nKCdlbnN1cmVIdWJCdXR0b246IGh1Yi5yZWdpc3RlckJ1dHRvbiBtaXNzaW5nJyk7IHJldHVybjsgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBodWIubGlzdD8uKCk7XG4gICAgICAgIGNvbnN0IGFscmVhZHkgPSBBcnJheS5pc0FycmF5KGxpc3QpICYmIGxpc3QuaW5jbHVkZXMoSFVCX0JUTl9JRCk7XG4gICAgICAgIGlmIChhbHJlYWR5KSB7XG4gICAgICAgICAgICAvLyBCdXR0b24gZXhpc3RzOyBub3RoaW5nIHRvIGRvIGhlcmVcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGRsb2coJ2Vuc3VyZUh1YkJ1dHRvbjogcmVnaXN0ZXJpbmdcdTIwMjYnLCB7IGlkOiBIVUJfQlROX0lEIH0pO1xuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnQXR0YWNobWVudHMgMCcsXG4gICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5PbmVSZWZyZXNoKHRydWUpXG4gICAgICAgIH0pO1xuICAgICAgICB0cnkgeyB3aW5kb3cuX19IVUIgPSBodWI7IGRsb2coJ2Vuc3VyZUh1YkJ1dHRvbjogaHViLmxpc3QoKScsIGh1Yi5saXN0Py4oKSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGRsb2coJ2Vuc3VyZUh1YkJ1dHRvbjogcmVnaXN0ZXJlZCcpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHNldEJhZGdlQ291bnQobikge1xuICAgICAgICBjb25zdCBjb3VudCA9IE51bWJlcihuID8/IDApO1xuICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTtcbiAgICAgICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm47XG5cbiAgICAgICAgLy8gSWYgaHViIHN1cHBvcnRzIHVwZGF0ZUJ1dHRvbiwgdXNlIGl0OyBvdGhlcndpc2UgbWluaW1hbCBjaHVyblxuICAgICAgICBpZiAodHlwZW9mIGh1Yi51cGRhdGVCdXR0b24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGh1Yi51cGRhdGVCdXR0b24oSFVCX0JUTl9JRCwgeyBsYWJlbDogYEF0dGFjaG1lbnRzICR7Y291bnR9YCB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZhbGxiYWNrOiBvbmx5IHJlLXJlZ2lzdGVyIGlmIG5vdCBwcmVzZW50IChhdm9pZCByZW1vdmUvcmUtYWRkIGNodXJuKVxuICAgICAgICBjb25zdCBsaXN0ID0gaHViLmxpc3Q/LigpO1xuICAgICAgICBjb25zdCBhbHJlYWR5ID0gQXJyYXkuaXNBcnJheShsaXN0KSAmJiBsaXN0LmluY2x1ZGVzKEhVQl9CVE5fSUQpO1xuICAgICAgICBpZiAoIWFscmVhZHkpIHtcbiAgICAgICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcbiAgICAgICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgICAgICBsYWJlbDogYEF0dGFjaG1lbnRzICR7Y291bnR9YCxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgICAgIHdlaWdodDogMTIwLFxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm8gdXBkYXRlIEFQSTsgZG8gYSBnZW50bGUgcmVwbGFjZVxuICAgICAgICAgICAgaHViLnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgICAgIGxhYmVsOiBgQXR0YWNobWVudHMgJHtjb3VudH1gLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICAgICAgb25DbGljazogKCkgPT4gcnVuT25lUmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcmVmcmVzaEluRmxpZ2h0ID0gZmFsc2U7XG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuT25lUmVmcmVzaChtYW51YWwgPSBmYWxzZSkge1xuICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTsgLy8gZ3VhcmFudGVlcyB0aGUgYnV0dG9uIGlzIHByZXNlbnRcbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xuICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSB0cnVlO1xuICAgICAgICBjb25zdCB0ID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKFwiRmV0Y2hpbmcgQXR0YWNobWVudHNcdTIwMjZcIiwgXCJpbmZvXCIpO1xuXG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudCgwKTtcbiAgICAgICAgICAgICAgICB0LmVycm9yKGBcdTI2QTBcdUZFMEYgUXVvdGUgS2V5IG5vdCBmb3VuZGAsIDQwMDApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVhZCA9IGF3YWl0IHF1b3RlUmVwbz8uZ2V0SGVhZGVyPy4oKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWQ/LkF0dGFjaG1lbnRfQ291bnQgIT0gbnVsbCkgc2V0QmFkZ2VDb3VudChOdW1iZXIoaGVhZC5BdHRhY2htZW50X0NvdW50KSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUHJvbW90ZSAmIGNsZWFyIGRyYWZ0IEJFRk9SRSBwZXItcXVvdGUgdXBkYXRlc1xuICAgICAgICAgICAgYXdhaXQgbWVyZ2VEcmFmdEludG9RdW90ZU9uY2UocWspO1xuXG4gICAgICAgICAgICAvLyBJZiBEQyBpc24ndCByZWFkeSB5ZXQsIHJlc29sdmUgdGhlIHRhc2sgc28gdGhlIHBpbGwgZG9lc25cdTIwMTl0IHNwaW4gZm9yZXZlclxuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHtcbiAgICAgICAgICAgICAgICB0LmVycm9yKCdEYXRhIGNvbnRleHQgbm90IHJlYWR5IHlldCcsIDIwMDApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY291bnQgPSBhd2FpdCBmZXRjaEF0dGFjaG1lbnRDb3VudChxayk7XG4gICAgICAgICAgICBzZXRCYWRnZUNvdW50KGNvdW50KTtcbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIEF0dGFjaG1lbnRfQ291bnQ6IE51bWJlcihjb3VudCkgfSk7XG5cbiAgICAgICAgICAgIC8vIEFsd2F5cyByZXNvbHZlIHRoZSB0YXNrXG4gICAgICAgICAgICBjb25zdCBvayA9IGNvdW50ID4gMDtcbiAgICAgICAgICAgIHQuc3VjY2VzcyhvayA/IGBcdTI3MDUgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnXHUyNkEwXHVGRTBGIE5vIGF0dGFjaG1lbnRzJywgMjAwMCk7XG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsIHRvYXN0IHdoZW4gdXNlciBjbGlja2VkIG1hbnVhbGx5XG4gICAgICAgICAgICBpZiAobWFudWFsKSB7XG4gICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgICAgICBvayA/IGBcdTI3MDUgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnXHUyNkEwXHVGRTBGIE5vIGF0dGFjaG1lbnRzJyxcbiAgICAgICAgICAgICAgICAgICAgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsXG4gICAgICAgICAgICAgICAgICAgIHsgdGltZW91dDogMjAwMCwgdG9hc3Q6IHRydWUgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkbG9nKCdyZWZyZXNoJywgeyBxaywgY291bnQgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XG4gICAgICAgICAgICB0LmVycm9yKGBcdTI3NEMgQXR0YWNobWVudHMgcmVmcmVzaCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCA0MDAwKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcbiAgICAgICAgICAgICAgICBgXHUyNzRDIEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCxcbiAgICAgICAgICAgICAgICAnZXJyb3InLFxuICAgICAgICAgICAgICAgIHsgdGltZW91dDogNDAwMCwgdG9hc3Q6IHRydWUgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyA9PT09PSBTUEEgd2lyaW5nID09PT09XG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgYXdhaXQgcmFmKCk7XG5cbiAgICAgICAgdHJ5IHsgYXdhaXQgZ2V0SHViKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGF3YWl0IGVuc3VyZUh1YkJ1dHRvbigpO1xuICAgICAgICB0cnkgeyBhd2FpdCBnZXRIdWIoKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICBzdGFydFdpemFyZFBhZ2VPYnNlcnZlcigpO1xuICAgICAgICBhd2FpdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgY29uc3Qgc2hvdyA9IGlzT25UYXJnZXRXaXphcmRQYWdlKCk7XG5cbiAgICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XG4gICAgICAgICAgICBzY2hlZHVsZVByb21vdGVEcmFmdFRvUXVvdGUocWspO1xuXG4gICAgICAgICAgICBpZiAocWsgJiYgTnVtYmVyLmlzRmluaXRlKHFrKSAmJiBxayA+IDApIHtcbiAgICAgICAgICAgICAgICBxdW90ZVJlcG8gPSBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xuICAgICAgICAgICAgICAgIGF3YWl0IG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBydW5PbmVSZWZyZXNoKGZhbHNlKTtcbiAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBoeWRyYXRlUGFydFN1bW1hcnlPbmNlKHFrKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKCdRVDM1IGh5ZHJhdGUgZmFpbGVkJywgZSk7IH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBodWIgYnV0dG9uIGV4aXN0cyB3aXRoIHplcm8gd2hlbiB3ZSBjYW5cdTIwMTl0IGRldGVjdCBhIHF1b3RlIHlldFxuICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBOb3Qgb24gYSB0YXJnZXQgcGFnZVxuICAgICAgICAgICAgaWYgKEZPUkNFX1NIT1dfQlROKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudCgwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudCgwKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoKTtcbiAgICAgICAgICAgICAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9vcCAqLyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xuICAgIH1cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIG9mZlVybD8uKCk7XG4gICAgICAgIG9mZlVybCA9IG51bGw7XG4gICAgICAgIHN0b3BXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcbiAgICAgICAgc3RvcFByb21vdGUoKTsgLy8gZW5zdXJlIGJhY2tncm91bmQgdGltZXIgaXMgY2xlYXJlZFxuICAgIH1cblxuICAgIGluaXQoKTtcblxuICAgIGxldCBwYWdlT2JzZXJ2ZXIgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XG4gICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgICAgIGlmICghcm9vdCkgcmV0dXJuO1xuICAgICAgICBwYWdlT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0KSA9PiB7XG4gICAgICAgICAgICBpZiAobXV0LnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJyB8fCBtLnR5cGUgPT09ICdjaGlsZExpc3QnKSkge1xuICAgICAgICAgICAgICAgIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHBhZ2VPYnNlcnZlci5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10sIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCkge1xuICAgICAgICBjb25zdCBwYWdlTmFtZSA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCk7XG4gICAgICAgIGRsb2coJ3JlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHk6JywgeyBwYWdlTmFtZSB9KTtcbiAgICAgICAgaWYgKEZPUkNFX1NIT1dfQlROIHx8IGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUh1YkJ1dHRvbigpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKCk7XG4gICAgICAgICAgICBkbG9nKCdyZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5OiByZW1vdmluZyBidXR0b24gKG9mZiB0YXJnZXQgcGFnZSknKTtcbiAgICAgICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc3RvcFdpemFyZFBhZ2VPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHsgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcblxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxHQUFDLE1BQU07QUFDSDtBQUVBLFVBQU0sTUFBTyxPQUF3QyxPQUFnQjtBQUNyRSxVQUFNLE9BQU8sSUFBSSxNQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ3hELFVBQU0sT0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLHFCQUFXLEdBQUcsQ0FBQztBQUNwRCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBSW5FLFVBQU0sZ0JBQWdCLENBQUMsT0FBTztBQUMxQixZQUFNLE9BQU8sSUFBSSxNQUFNLE1BQU07QUFDN0IsYUFBUSxPQUFPLFNBQVMsYUFBYyxLQUFLLEVBQUUsSUFBSSxHQUFHO0FBQUEsSUFDeEQ7QUFJQSxVQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0scUJBQ3JCLEdBQUcsS0FBSyxLQUFLLG1CQUFtQixFQUFFLElBQUksTUFBTSxRQUFRLFNBQVMsY0FBYyxjQUFjLENBQUMsSUFDMUY7QUFFTixLQUFDLFlBQVk7QUFFVCxZQUFNLE9BQU8sTUFBTSxPQUFPLGVBQWU7QUFDekMsWUFBTSxTQUFTO0FBQUEsUUFDWCxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixTQUFTLE1BQU8sT0FBTyx5QkFBeUIsYUFDMUMscUJBQXFCLElBQ3JCLEdBQUcsS0FBSyxJQUFJ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
