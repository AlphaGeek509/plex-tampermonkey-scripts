// ==UserScript==
// @name        QT35_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.136
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.136-1758927204587
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.136-1758927204587
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.136-1758927204587
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.136-1758927204587
// @require      http://localhost:5000/lt-core.user.js?v=3.8.136-1758927204587
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
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
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
    function getActiveWizardPageName() {
      const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]');
      return (li?.textContent || "").trim().replace(/\s+/g, " ");
    }
    function isOnPartSummary() {
      return CFG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }
    async function ensureWizardVM() {
      const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
      const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
      return viewModel;
    }
    let quoteRepo = null, lastScope = null;
    let __QT__ = null;
    async function ensureRepoForQuote(quoteKey) {
      try {
        const repo = await lt?.core?.qt?.useQuoteRepo?.(Number(quoteKey));
        quoteRepo = repo;
        lastScope = Number(quoteKey);
        return repo;
      } catch {
        return null;
      }
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function ensureRepoReady(qk, attempts = 6, delayMs = 250) {
      for (let i = 0; i < attempts; i++) {
        await ensureRepoForQuote(qk);
        if (quoteRepo) return quoteRepo;
        await sleep(delayMs);
      }
      return null;
    }
    function stopPromote() {
      return lt?.core?.qt?.stopRetry?.();
    }
    function __guardKeyForPromote(qk) {
      return `qt35:promoted:${Number(qk) || 0}`;
    }
    async function promoteDraftIfPresentOnce(qk) {
      const key = __guardKeyForPromote(qk);
      try {
        if (sessionStorage.getItem(key) === "1") return "guarded";
      } catch {
      }
      const draftRepo = await lt?.core?.qt?.useDraftRepo?.();
      const draft = draftRepo && (await draftRepo.getHeader?.() || await draftRepo.get?.());
      const hasDraft = !!(draft && Object.keys(draft).length);
      if (!hasDraft) return "no-draft";
      const res = await lt?.core?.qt?.promoteDraftToQuote?.({ qk: Number(qk), strategy: "once" }) || "noop";
      try {
        sessionStorage.setItem(key, "1");
      } catch {
      }
      return res;
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
    const HUB_BTN_ID = "qt35-attachments-btn";
    async function setBadgeCount(n) {
      const count = Number(n ?? 0);
      const hub = await lt.core.qt.getHub({ mount: "nav" });
      if (!hub?.registerButton) return;
      const label = `Attachments (${count})`;
      if (typeof hub.updateButton === "function") {
        hub.updateButton(HUB_BTN_ID, { label });
        return;
      }
      const list = hub.list?.();
      const already = Array.isArray(list) && list.includes(HUB_BTN_ID);
      if (!already) {
        hub.registerButton("left", {
          id: HUB_BTN_ID,
          label,
          title: "Refresh attachments (manual)",
          weight: 120,
          onClick: () => runOneRefresh(true)
        });
      } else {
        hub.remove?.(HUB_BTN_ID);
        hub.registerButton("left", {
          id: HUB_BTN_ID,
          label: `Attachments (${count})`,
          title: "Refresh attachments (manual)",
          weight: 120,
          onClick: () => runOneRefresh(true)
        });
      }
    }
    let refreshInFlight = false;
    async function runOneRefresh(manual = false) {
      await lt.core.qt.ensureHubButton({
        id: HUB_BTN_ID,
        label: "Attachments (0)",
        title: "Refresh attachments (manual)",
        side: "left",
        weight: 120,
        onClick: () => runOneRefresh(true),
        showWhen: (ctx) => typeof FORCE_SHOW_BTN !== "undefined" && FORCE_SHOW_BTN || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) || ctx.isOnPartSummary,
        mount: "nav"
      });
      if (refreshInFlight) return;
      refreshInFlight = true;
      const t = lt.core.hub.beginTask("Fetching Attachments\u2026", "info");
      try {
        await ensureWizardVM();
        const ctx = lt?.core?.qt?.getQuoteContext?.();
        const qk = Number(ctx?.quoteKey);
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
        await promoteDraftIfPresentOnce(qk);
        await ensureRepoReady(qk, 6, 250);
        if (!quoteRepo) {
          t.error("Data context warming \u2014 try again in a moment", 2500);
          return;
        }
        const count = await fetchAttachmentCount(qk);
        setBadgeCount(count);
        await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });
        const ok = count > 0;
        t.success(ok ? `${count} attachment(s)` : "No attachments", 2e3);
        if (manual) {
          lt.core.hub.notify(
            ok ? `${count} attachment(s)` : "No attachments",
            ok ? "success" : "warn",
            { timeout: 2e3, toast: true }
          );
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        t.error(`Attachments refresh failed: ${err?.message || err}`, 4e3);
        lt.core.hub.notify(
          `Attachments refresh failed: ${err?.message || err}`,
          "error",
          { timeout: 4e3, toast: true }
        );
      } finally {
        refreshInFlight = false;
      }
    }
    let __qt35_autoRefreshTimer = null;
    function onAttachmentRefreshRequested(ev) {
      try {
        const ctx = lt?.core?.qt?.getQuoteContext?.();
        const onPartSummary = !!(ctx && (ctx.isOnPartSummary || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName || "")));
        if (!onPartSummary) return;
        clearTimeout(__qt35_autoRefreshTimer);
        __qt35_autoRefreshTimer = setTimeout(() => {
          runOneRefresh(false);
        }, 350);
      } catch {
      }
    }
    let booted = false;
    let offUrl = null;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    let wasOnPartSummary = false;
    let __qt35_pageActivateTimer = null;
    let __qt35_navObserver = null;
    function scheduleRefreshOnActive(delay = 250) {
      clearTimeout(__qt35_pageActivateTimer);
      __qt35_pageActivateTimer = setTimeout(() => {
        try {
          if (isOnPartSummary()) runOneRefresh(false);
        } catch {
        }
      }, delay);
    }
    function onWizardPageMutation() {
      const nowOn = isOnPartSummary();
      if (nowOn && !wasOnPartSummary) {
        scheduleRefreshOnActive(250);
      }
      wasOnPartSummary = nowOn;
    }
    async function init() {
      if (booted) return;
      booted = true;
      try {
        window.addEventListener("LT:AttachmentRefreshRequested", onAttachmentRefreshRequested, false);
      } catch {
      }
      await lt.core.qt.ensureHubButton({
        id: "qt35-attachments-btn",
        label: "Attachments (0)",
        title: "Refresh attachments (manual)",
        side: "left",
        weight: 120,
        onClick: () => runOneRefresh(true),
        showWhen: (ctx) => typeof FORCE_SHOW_BTN !== "undefined" && FORCE_SHOW_BTN || CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) || ctx.isOnPartSummary,
        mount: "nav"
      });
      try {
        const nav = document.querySelector(".plex-wizard-page-list");
        if (nav && !__qt35_navObserver) {
          __qt35_navObserver = new MutationObserver(onWizardPageMutation);
          __qt35_navObserver.observe(nav, { subtree: true, attributes: true, childList: true });
        }
      } catch {
      }
      try {
        window.addEventListener("hashchange", onWizardPageMutation);
      } catch {
      }
      wasOnPartSummary = isOnPartSummary();
      if (wasOnPartSummary) scheduleRefreshOnActive(150);
    }
    function teardown() {
      booted = false;
      offUrl?.();
      offUrl = null;
      stopPromote();
      try {
        window.removeEventListener("LT:AttachmentRefreshRequested", onAttachmentRefreshRequested, false);
      } catch {
      }
      try {
        window.removeEventListener("hashchange", onWizardPageMutation);
      } catch {
      }
      try {
        __qt35_navObserver?.disconnect?.();
      } catch {
      }
      __qt35_navObserver = null;
      clearTimeout(__qt35_pageActivateTimer);
      __qt35_pageActivateTimer = null;
    }
    init();
    wireNav(() => {
      if (ROUTES.some((rx) => rx.test(location.pathname))) init();
      else teardown();
    });
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDM1LWF0dGFjaG1lbnRzR2V0L3F0MzUuaW5kZXguanNcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4gREVWICYmIGNvbnNvbGUuZGVidWcoJ1FUMzUnLCAuLi5hKTtcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcblxuICAgIC8vIFNhZmUgZGVsZWdhdGluZyB3cmFwcGVyOiB1c2UgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggd2hlbiBhdmFpbGFibGUsXG4gICAgLy8gb3RoZXJ3aXNlIGp1c3QgcnVuIHRoZSBjYWxsYmFjayBvbmNlIChiZXN0LWVmZm9ydCBmYWxsYmFjaykuXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+ICh0eXBlb2Ygb3BlbkF0dGFjaG1lbnRzTW9kYWwgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICA/IG9wZW5BdHRhY2htZW50c01vZGFsKClcbiAgICAgICAgICAgICAgICA6IGx0LmNvcmUuaHViLm5vdGlmeSgnQXR0YWNobWVudHMgVUkgbm90IGF2YWlsYWJsZScsICd3YXJuJywgeyB0b2FzdDogdHJ1ZSB9KSlcbiAgICAgICAgfSk7XG4gICAgfSkoKTtcblxuXG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBjb25zdCBGT1JDRV9TSE9XX0JUTiA9IGZhbHNlOyAvLyBzZXQgdG8gdHJ1ZSBkdXJpbmcgdGVzdGluZ1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgY29uc3QgQ0ZHID0ge1xuICAgICAgICBBQ1RJT05fQkFSX1NFTDogJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIC8vU0hPV19PTl9QQUdFU19SRTogL1xcYnN1bW1hcnlcXGIvaSxcbiAgICAgICAgU0hPV19PTl9QQUdFU19SRTogL15wYXJ0XFxzKnN1bW1hcnkkL2ksXG4gICAgICAgIERTX0FUVEFDSE1FTlRTX0JZX1FVT1RFOiAxMTcxMyxcbiAgICAgICAgQVRUQUNITUVOVF9HUk9VUF9LRVk6IDExLFxuICAgICAgICBEU19RVU9URV9IRUFERVJfR0VUOiAzMTU2LFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vIC0tLSBBY3RpdmUgd2l6YXJkIHBhZ2UgaGVscGVycyAtLS1cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc09uUGFydFN1bW1hcnkoKSB7XG4gICAgICAgIHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xuICAgIH1cblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcbiAgICB9XG5cbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcbiAgICBsZXQgX19RVF9fID0gbnVsbDtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVwbyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8udXNlUXVvdGVSZXBvPy4oTnVtYmVyKHF1b3RlS2V5KSk7XG4gICAgICAgICAgICBxdW90ZVJlcG8gPSByZXBvO1xuICAgICAgICAgICAgbGFzdFNjb3BlID0gTnVtYmVyKHF1b3RlS2V5KTtcbiAgICAgICAgICAgIHJldHVybiByZXBvO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tIEJPVU5ERUQgQ09OVEVYVCBXQVJNLVVQIChubyBpbmZpbml0ZSBwb2xsaW5nKSAtLS1cbiAgICBjb25zdCBzbGVlcCA9IChtcykgPT4gbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIG1zKSk7XG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb1JlYWR5KHFrLCBhdHRlbXB0cyA9IDYsIGRlbGF5TXMgPSAyNTApIHtcbiAgICAgICAgLy8gVHJ5IGEgZmV3IHNob3J0IHRpbWVzIHRvIGFsbG93IERDL1JlcG8gdG8gY29tZSB1cCBhZnRlciBtb2RhbCBjbG9zZS9wcm9tb3RlXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXR0ZW1wdHM7IGkrKykge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgIGlmIChxdW90ZVJlcG8pIHJldHVybiBxdW90ZVJlcG87XG4gICAgICAgICAgICBhd2FpdCBzbGVlcChkZWxheU1zKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cblxuICAgIC8vIEJhY2tncm91bmQgcHJvbW90aW9uIChwZXItdGFiIGRyYWZ0IC0+IHBlci1xdW90ZSkgd2l0aCBnZW50bGUgcmV0cmllc1xuICAgIGZ1bmN0aW9uIHN0b3BQcm9tb3RlKCkge1xuICAgICAgICByZXR1cm4gbHQ/LmNvcmU/LnF0Py5zdG9wUmV0cnk/LigpO1xuICAgIH1cblxuICAgIC8vIFByb21vdGUgdGhlIHRhYi1zY29wZSBkcmFmdCBpbnRvIHRoZSBwZXItcXVvdGUgcmVwbyBvbmx5IGlmIGEgcmVhbCBkcmFmdCBleGlzdHMuXG4gICAgLy8gQWxzbyBndWFyZCBzbyB3ZSBkb24ndCBldmVuIGF0dGVtcHQgbW9yZSB0aGFuIG9uY2UgcGVyIHF1b3RlIGluIHRoaXMgdGFiLlxuICAgIGZ1bmN0aW9uIF9fZ3VhcmRLZXlGb3JQcm9tb3RlKHFrKSB7IHJldHVybiBgcXQzNTpwcm9tb3RlZDoke051bWJlcihxaykgfHwgMH1gOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBwcm9tb3RlRHJhZnRJZlByZXNlbnRPbmNlKHFrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IF9fZ3VhcmRLZXlGb3JQcm9tb3RlKHFrKTtcbiAgICAgICAgdHJ5IHsgaWYgKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oa2V5KSA9PT0gJzEnKSByZXR1cm4gJ2d1YXJkZWQnOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBPbmx5IGNhbGwgaW50byBjb3JlIGlmIGEgZHJhZnQgYWN0dWFsbHkgZXhpc3RzXG4gICAgICAgIGNvbnN0IGRyYWZ0UmVwbyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8udXNlRHJhZnRSZXBvPy4oKTtcbiAgICAgICAgY29uc3QgZHJhZnQgPSBkcmFmdFJlcG8gJiYgKChhd2FpdCBkcmFmdFJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwgKGF3YWl0IGRyYWZ0UmVwby5nZXQ/LigpKSk7XG4gICAgICAgIGNvbnN0IGhhc0RyYWZ0ID0gISEoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCk7XG4gICAgICAgIGlmICghaGFzRHJhZnQpIHJldHVybiAnbm8tZHJhZnQnO1xuXG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8ucHJvbW90ZURyYWZ0VG9RdW90ZT8uKHsgcWs6IE51bWJlcihxayksIHN0cmF0ZWd5OiAnb25jZScgfSkgfHwgJ25vb3AnO1xuXG4gICAgICAgIC8vIENvcmUgY2xlYXJzIHRoZSBkcmFmdCBvbiAnbWVyZ2VkJzsgZWl0aGVyIHdheSwgd2UgYXZvaWQgcmUtYXR0ZW1wdHMgZm9yIHRoaXMgdGFiL3F1b3RlXG4gICAgICAgIHRyeSB7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCAnMScpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cblxuICAgIC8vID09PT09IERhdGEgc291cmNlcyA9PT09PVxuICAgIGFzeW5jIGZ1bmN0aW9uIGZldGNoQXR0YWNobWVudENvdW50KHF1b3RlS2V5KSB7XG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIikgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiAoUk9PVC5sdD8uY29yZT8ucGxleCk7XG4gICAgICAgIGlmICghcGxleD8uZHNSb3dzKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoQ0ZHLkRTX0FUVEFDSE1FTlRTX0JZX1FVT1RFLCB7XG4gICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogQ0ZHLkFUVEFDSE1FTlRfR1JPVVBfS0VZLFxuICAgICAgICAgICAgUmVjb3JkX0tleV9WYWx1ZTogU3RyaW5nKHF1b3RlS2V5KVxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHJvd3MpID8gcm93cy5sZW5ndGggOiAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHF1b3RlSGVhZGVyR2V0KHJvdykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgQ3VzdG9tZXJfQ29kZTogcm93Py5DdXN0b21lcl9Db2RlID8/IG51bGwsXG4gICAgICAgICAgICBDdXN0b21lcl9OYW1lOiByb3c/LkN1c3RvbWVyX05hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgIEN1c3RvbWVyX05vOiByb3c/LkN1c3RvbWVyX05vID8/IG51bGwsXG4gICAgICAgICAgICBRdW90ZV9Obzogcm93Py5RdW90ZV9ObyA/PyBudWxsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gPT09PT0gSHViIGJ1dHRvbiA9PT09PVxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzNS1hdHRhY2htZW50cy1idG4nO1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gc2V0QmFkZ2VDb3VudChuKSB7XG4gICAgICAgIGNvbnN0IGNvdW50ID0gTnVtYmVyKG4gPz8gMCk7XG4gICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGx0LmNvcmUucXQuZ2V0SHViKHsgbW91bnQ6IFwibmF2XCIgfSk7XG4gICAgICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgICAgIC8vIElmIGh1YiBzdXBwb3J0cyB1cGRhdGVCdXR0b24sIHVzZSBpdDsgb3RoZXJ3aXNlIG1pbmltYWwgY2h1cm5cbiAgICAgICAgY29uc3QgbGFiZWwgPSBgQXR0YWNobWVudHMgKCR7Y291bnR9KWA7XG4gICAgICAgIGlmICh0eXBlb2YgaHViLnVwZGF0ZUJ1dHRvbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgaHViLnVwZGF0ZUJ1dHRvbihIVUJfQlROX0lELCB7IGxhYmVsIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IG9ubHkgcmUtcmVnaXN0ZXIgaWYgbm90IHByZXNlbnQgKGF2b2lkIHJlbW92ZS9yZS1hZGQgY2h1cm4pXG4gICAgICAgIGNvbnN0IGxpc3QgPSBodWIubGlzdD8uKCk7XG4gICAgICAgIGNvbnN0IGFscmVhZHkgPSBBcnJheS5pc0FycmF5KGxpc3QpICYmIGxpc3QuaW5jbHVkZXMoSFVCX0JUTl9JRCk7XG4gICAgICAgIGlmICghYWxyZWFkeSkge1xuICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICAgICAgb25DbGljazogKCkgPT4gcnVuT25lUmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBObyB1cGRhdGUgQVBJOyBkbyBhIGdlbnRsZSByZXBsYWNlXG4gICAgICAgICAgICBodWIucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICAgICAgbGFiZWw6IGBBdHRhY2htZW50cyAoJHtjb3VudH0pYCxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgICAgIHdlaWdodDogMTIwLFxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bk9uZVJlZnJlc2gobWFudWFsID0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0F0dGFjaG1lbnRzICgwKScsXG4gICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5PbmVSZWZyZXNoKHRydWUpLFxuICAgICAgICAgICAgc2hvd1doZW46IChjdHgpID0+XG4gICAgICAgICAgICAgICAgKHR5cGVvZiBGT1JDRV9TSE9XX0JUTiAhPT0gJ3VuZGVmaW5lZCcgJiYgRk9SQ0VfU0hPV19CVE4pIHx8XG4gICAgICAgICAgICAgICAgQ0ZHLlNIT1dfT05fUEFHRVNfUkUudGVzdChjdHgucGFnZU5hbWUpIHx8XG4gICAgICAgICAgICAgICAgY3R4LmlzT25QYXJ0U3VtbWFyeSxcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVmcmVzaEluRmxpZ2h0KSByZXR1cm47XG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIGNvbnN0IHQgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2soXCJGZXRjaGluZyBBdHRhY2htZW50c1x1MjAyNlwiLCBcImluZm9cIik7XG5cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0Py4oKTtcbiAgICAgICAgICAgIGNvbnN0IHFrID0gTnVtYmVyKGN0eD8ucXVvdGVLZXkpO1xuXG4gICAgICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHtcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xuICAgICAgICAgICAgICAgIHQuZXJyb3IoYFx1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kYCwgNDAwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiBzY29wZSBjaGFuZ2VkLCBwYWludCBhbnkgZXhpc3Rpbmcgc25hcHNob3QgYmVmb3JlIGZldGNoaW5nXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0gYXdhaXQgcXVvdGVSZXBvPy5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZD8uQXR0YWNobWVudF9Db3VudCAhPSBudWxsKSBzZXRCYWRnZUNvdW50KE51bWJlcihoZWFkLkF0dGFjaG1lbnRfQ291bnQpKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBQcm9tb3RlIG9ubHkgaWYgYSByZWFsIGRyYWZ0IGV4aXN0czsgb3RoZXJ3aXNlIHNraXAgZmFzdFxuICAgICAgICAgICAgYXdhaXQgcHJvbW90ZURyYWZ0SWZQcmVzZW50T25jZShxayk7XG5cbiAgICAgICAgICAgIC8vIEFmdGVyIHByb21vdGlvbiwgKHJlKWVuc3VyZSB0aGUgcGVyLXF1b3RlIHJlcG8gd2l0aCBib3VuZGVkIHJldHJpZXNcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9SZWFkeShxaywgNiwgMjUwKTtcblxuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHtcbiAgICAgICAgICAgICAgICAvLyBObyBlbmRsZXNzIHNwaW5uZXI7IGZhaWwgZmFzdCwgdXNlciBjYW4gY2xpY2sgYWdhaW4gb3IgaXQgd2lsbCB3b3JrIG5leHQgZmlyZVxuICAgICAgICAgICAgICAgIHQuZXJyb3IoJ0RhdGEgY29udGV4dCB3YXJtaW5nIFx1MjAxNCB0cnkgYWdhaW4gaW4gYSBtb21lbnQnLCAyNTAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgZmV0Y2hBdHRhY2htZW50Q291bnQocWspO1xuICAgICAgICAgICAgc2V0QmFkZ2VDb3VudChjb3VudCk7XG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXIoeyBRdW90ZV9LZXk6IHFrLCBBdHRhY2htZW50X0NvdW50OiBOdW1iZXIoY291bnQpIH0pO1xuXG4gICAgICAgICAgICAvLyBBbHdheXMgcmVzb2x2ZSB0aGUgdGFza1xuICAgICAgICAgICAgY29uc3Qgb2sgPSBjb3VudCA+IDA7XG4gICAgICAgICAgICB0LnN1Y2Nlc3Mob2sgPyBgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnTm8gYXR0YWNobWVudHMnLCAyMDAwKTtcblxuICAgICAgICAgICAgLy8gT3B0aW9uYWwgdG9hc3Qgd2hlbiB1c2VyIGNsaWNrZWQgbWFudWFsbHlcbiAgICAgICAgICAgIGlmIChtYW51YWwpIHtcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXG4gICAgICAgICAgICAgICAgICAgIG9rID8gYCR7Y291bnR9IGF0dGFjaG1lbnQocylgIDogJ05vIGF0dGFjaG1lbnRzJyxcbiAgICAgICAgICAgICAgICAgICAgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsXG4gICAgICAgICAgICAgICAgICAgIHsgdGltZW91dDogMjAwMCwgdG9hc3Q6IHRydWUgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkbG9nKCdyZWZyZXNoJywgeyBxaywgY291bnQgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XG4gICAgICAgICAgICB0LmVycm9yKGBBdHRhY2htZW50cyByZWZyZXNoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsIDQwMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgIGBBdHRhY2htZW50cyByZWZyZXNoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsXG4gICAgICAgICAgICAgICAgJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICB7IHRpbWVvdXQ6IDQwMDAsIHRvYXN0OiB0cnVlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIExpc3RlbiBmb3IgbW9kYWwtY2xvc2UgcmVmcmVzaCByZXF1ZXN0cyBmcm9tIFFUMjBcbiAgICBsZXQgX19xdDM1X2F1dG9SZWZyZXNoVGltZXIgPSBudWxsO1xuICAgIGZ1bmN0aW9uIG9uQXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQoZXYpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE9ubHkgcmVmcmVzaCBvbiBQYXJ0IFN1bW1hcnlcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0Py4oKTtcbiAgICAgICAgICAgIGNvbnN0IG9uUGFydFN1bW1hcnkgPSAhIShjdHggJiYgKGN0eC5pc09uUGFydFN1bW1hcnkgfHwgQ0ZHLlNIT1dfT05fUEFHRVNfUkUudGVzdChjdHgucGFnZU5hbWUgfHwgJycpKSk7XG4gICAgICAgICAgICBpZiAoIW9uUGFydFN1bW1hcnkpIHJldHVybjtcblxuICAgICAgICAgICAgLy8gRGVib3VuY2UgcmFwaWQgZHVwbGljYXRlIGZpcmVzXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoX19xdDM1X2F1dG9SZWZyZXNoVGltZXIpO1xuICAgICAgICAgICAgX19xdDM1X2F1dG9SZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgcnVuT25lUmVmcmVzaChmYWxzZSk7IH0sIDM1MCk7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBuby1vcCAqLyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU1BBIHdpcmluZyA9PT09PVxuXG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIC8vIFRyYWNrIHdoZXRoZXIgd2Ugd2VyZSBwcmV2aW91c2x5IG9uIFBhcnQgU3VtbWFyeSB0byBkZXRlY3QgdHJhbnNpdGlvbnNcbiAgICBsZXQgd2FzT25QYXJ0U3VtbWFyeSA9IGZhbHNlO1xuICAgIGxldCBfX3F0MzVfcGFnZUFjdGl2YXRlVGltZXIgPSBudWxsO1xuICAgIGxldCBfX3F0MzVfbmF2T2JzZXJ2ZXIgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVSZWZyZXNoT25BY3RpdmUoZGVsYXkgPSAyNTApIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lcik7XG4gICAgICAgIF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBPbmx5IHJlZnJlc2ggaWYgd2UgdHJ1bHkgYXJlIG9uIFBhcnQgU3VtbWFyeVxuICAgICAgICAgICAgICAgIGlmIChpc09uUGFydFN1bW1hcnkoKSkgcnVuT25lUmVmcmVzaChmYWxzZSk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm8tb3AgKi8gfVxuICAgICAgICB9LCBkZWxheSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25XaXphcmRQYWdlTXV0YXRpb24oKSB7XG4gICAgICAgIGNvbnN0IG5vd09uID0gaXNPblBhcnRTdW1tYXJ5KCk7XG4gICAgICAgIGlmIChub3dPbiAmJiAhd2FzT25QYXJ0U3VtbWFyeSkge1xuICAgICAgICAgICAgLy8gUGFnZSBqdXN0IGJlY2FtZSBhY3RpdmUgLT4gcmVmcmVzaCBhdHRhY2htZW50c1xuICAgICAgICAgICAgc2NoZWR1bGVSZWZyZXNoT25BY3RpdmUoMjUwKTtcbiAgICAgICAgfVxuICAgICAgICB3YXNPblBhcnRTdW1tYXJ5ID0gbm93T247XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcblxuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gQXV0by1yZWZyZXNoIHdoZW4gUVQyMFx1MjAxOXMgbW9kYWwgY2xvc2VzXG4gICAgICAgIHRyeSB7IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpBdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCcsIG9uQXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQsIGZhbHNlKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICBhd2FpdCBsdC5jb3JlLnF0LmVuc3VyZUh1YkJ1dHRvbih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMtYnRuJyxcbiAgICAgICAgICAgIGxhYmVsOiAnQXR0YWNobWVudHMgKDApJyxcbiAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXG4gICAgICAgICAgICBzaWRlOiAnbGVmdCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSksXG4gICAgICAgICAgICBzaG93V2hlbjogKGN0eCkgPT4gKHR5cGVvZiBGT1JDRV9TSE9XX0JUTiAhPT0gJ3VuZGVmaW5lZCcgJiYgRk9SQ0VfU0hPV19CVE4pIHx8IENGRy5TSE9XX09OX1BBR0VTX1JFLnRlc3QoY3R4LnBhZ2VOYW1lKSB8fCBjdHguaXNPblBhcnRTdW1tYXJ5LFxuICAgICAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIE9ic2VydmUgd2l6YXJkIHBhZ2UgY2hhbmdlcyB0byBkZXRlY3Qgd2hlbiBQYXJ0IFN1bW1hcnkgYmVjb21lcyBhY3RpdmVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgICAgIGlmIChuYXYgJiYgIV9fcXQzNV9uYXZPYnNlcnZlcikge1xuICAgICAgICAgICAgICAgIF9fcXQzNV9uYXZPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG9uV2l6YXJkUGFnZU11dGF0aW9uKTtcbiAgICAgICAgICAgICAgICBfX3F0MzVfbmF2T2JzZXJ2ZXIub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBBbHNvIHJlYWN0IHRvIGhhc2ggY2hhbmdlcyAoc29tZSBTUEEgcm91dGVzIHVzZSBoYXNoIG5hdmlnYXRpb24pXG4gICAgICAgIHRyeSB7IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgb25XaXphcmRQYWdlTXV0YXRpb24pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBTZWVkIHByaW9yIHN0YXRlICYgdHJpZ2dlciBpbml0aWFsIHJlZnJlc2ggaWYgd2UgYWxyZWFkeSBsYW5kZWQgb24gdGhlIHRhcmdldCBwYWdlXG4gICAgICAgIHdhc09uUGFydFN1bW1hcnkgPSBpc09uUGFydFN1bW1hcnkoKTtcbiAgICAgICAgaWYgKHdhc09uUGFydFN1bW1hcnkpIHNjaGVkdWxlUmVmcmVzaE9uQWN0aXZlKDE1MCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgb2ZmVXJsPy4oKTtcbiAgICAgICAgb2ZmVXJsID0gbnVsbDtcbiAgICAgICAgc3RvcFByb21vdGUoKTsgLy8gZW5zdXJlIGJhY2tncm91bmQgdGltZXIgaXMgY2xlYXJlZFxuICAgICAgICB0cnkgeyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCBvbkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkLCBmYWxzZSk7IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgLy8gRGlzY29ubmVjdCBwYWdlIGFjdGl2YXRpb24gb2JzZXJ2ZXJzL2xpc3RlbmVyc1xuICAgICAgICB0cnkgeyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIG9uV2l6YXJkUGFnZU11dGF0aW9uKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHsgX19xdDM1X25hdk9ic2VydmVyPy5kaXNjb25uZWN0Py4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgX19xdDM1X25hdk9ic2VydmVyID0gbnVsbDtcbiAgICAgICAgY2xlYXJUaW1lb3V0KF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lcik7XG4gICAgICAgIF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lciA9IG51bGw7XG5cbiAgICAgICAgLy8gSHViIHZpc2liaWxpdHkgaXMgaGFuZGxlZCBjZW50cmFsbHkgdmlhIGVuc3VyZUh1YkJ1dHRvbigpXG4gICAgfVxuXG4gICAgaW5pdCgpO1xuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUluRSxVQUFNLGdCQUFnQixDQUFDLE9BQU87QUFDMUIsWUFBTSxPQUFPLElBQUksTUFBTSxNQUFNO0FBQzdCLGFBQVEsT0FBTyxTQUFTLGFBQWMsS0FBSyxFQUFFLElBQUksR0FBRztBQUFBLElBQ3hEO0FBRUEsS0FBQyxZQUFZO0FBRVQsWUFBTSxPQUFPLE1BQU0sT0FBTyxlQUFlO0FBQ3pDLFlBQU0sU0FBUztBQUFBLFFBQ1gsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsU0FBUyxNQUFPLE9BQU8seUJBQXlCLGFBQzFDLHFCQUFxQixJQUNyQixHQUFHLEtBQUssSUFBSSxPQUFPLGdDQUFnQyxRQUFRLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUNwRixDQUFDO0FBQUEsSUFDTCxHQUFHO0FBR0gsVUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBQ3RELFVBQU0saUJBQWlCO0FBQ3ZCLFFBQUksQ0FBQyxPQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUMsRUFBRztBQUVwRCxVQUFNLEtBQU0s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
