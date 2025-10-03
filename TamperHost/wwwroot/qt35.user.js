// ==UserScript==
// @name        QT35_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.9.23
// @description Adds Attachments badge/button (and Dock) and promotes draft→quote once if needed. Counts attachments via DS 11713 (group 11) and auto-refreshes on Part Summary activation and QT20 modal close. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=3.9.23-1759506267260
// @require     http://localhost:5000/lt-plex-auth.user.js?v=3.9.23-1759506267260
// @require     http://localhost:5000/lt-ui-hub.js?v=3.9.23-1759506267260
// @require     http://localhost:5000/lt-data-core.user.js?v=3.9.23-1759506267260
// @require     http://localhost:5000/lt-core.user.js?v=3.9.23-1759506267260
// @resource    THEME_CSS http://localhost:5000/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @connect     cdn.jsdelivr.net
// @run-at      document-start
// @noframes
// @grant       GM_addStyle
// @grant       GM_getResourceText
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
        showWhen: () => true,
        //showWhen: (ctx) =>
        //    (typeof FORCE_SHOW_BTN !== 'undefined' && FORCE_SHOW_BTN) ||
        //    CFG.SHOW_ON_PAGES_RE.test(ctx.pageName) ||
        //    ctx.isOnPartSummary,
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
          t.error(`\u26A0\uFE0F Quote Key not found`, 5e3);
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
          t.error("Data context warming \u2014 try again in a moment", 500);
          return;
        }
        const count = await fetchAttachmentCount(qk);
        setBadgeCount(count);
        await quoteRepo.patchHeader({ Quote_Key: qk, Attachment_Count: Number(count) });
        const ok = count > 0;
        t.success(ok ? `${count} attachment(s)` : "No attachments", 5e3);
        if (manual) {
          lt.core.hub.notify(
            ok ? `${count} attachment(s)` : "No attachments",
            ok ? "success" : "warn",
            { toast: true }
          );
        }
        dlog("refresh", { qk, count });
      } catch (err) {
        derr("refresh failed", err);
        t.error(`Attachments refresh failed: ${err?.message || err}`, 5e3);
        lt.core.hub.notify(
          `Attachments refresh failed: ${err?.message || err}`,
          "error",
          { toast: true }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDM1LWF0dGFjaG1lbnRzR2V0L3F0MzUuaW5kZXguanNcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4gREVWICYmIGNvbnNvbGUuZGVidWcoJ1FUMzUnLCAuLi5hKTtcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcblxuICAgIC8vIFNhZmUgZGVsZWdhdGluZyB3cmFwcGVyOiB1c2UgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggd2hlbiBhdmFpbGFibGUsXG4gICAgLy8gb3RoZXJ3aXNlIGp1c3QgcnVuIHRoZSBjYWxsYmFjayBvbmNlIChiZXN0LWVmZm9ydCBmYWxsYmFjaykuXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+ICh0eXBlb2Ygb3BlbkF0dGFjaG1lbnRzTW9kYWwgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICA/IG9wZW5BdHRhY2htZW50c01vZGFsKClcbiAgICAgICAgICAgICAgICA6IGx0LmNvcmUuaHViLm5vdGlmeSgnQXR0YWNobWVudHMgVUkgbm90IGF2YWlsYWJsZScsICd3YXJuJywgeyB0b2FzdDogdHJ1ZSB9KSlcbiAgICAgICAgfSk7XG4gICAgfSkoKTtcblxuXG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBjb25zdCBGT1JDRV9TSE9XX0JUTiA9IGZhbHNlOyAvLyBzZXQgdG8gdHJ1ZSBkdXJpbmcgdGVzdGluZ1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgY29uc3QgQ0ZHID0ge1xuICAgICAgICBBQ1RJT05fQkFSX1NFTDogJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIC8vU0hPV19PTl9QQUdFU19SRTogL1xcYnN1bW1hcnlcXGIvaSxcbiAgICAgICAgU0hPV19PTl9QQUdFU19SRTogL15wYXJ0XFxzKnN1bW1hcnkkL2ksXG4gICAgICAgIERTX0FUVEFDSE1FTlRTX0JZX1FVT1RFOiAxMTcxMyxcbiAgICAgICAgQVRUQUNITUVOVF9HUk9VUF9LRVk6IDExLFxuICAgICAgICBEU19RVU9URV9IRUFERVJfR0VUOiAzMTU2LFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vIC0tLSBBY3RpdmUgd2l6YXJkIHBhZ2UgaGVscGVycyAtLS1cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc09uUGFydFN1bW1hcnkoKSB7XG4gICAgICAgIHJldHVybiBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xuICAgIH1cblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcbiAgICB9XG5cbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcbiAgICBsZXQgX19RVF9fID0gbnVsbDtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVwbyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8udXNlUXVvdGVSZXBvPy4oTnVtYmVyKHF1b3RlS2V5KSk7XG4gICAgICAgICAgICBxdW90ZVJlcG8gPSByZXBvO1xuICAgICAgICAgICAgbGFzdFNjb3BlID0gTnVtYmVyKHF1b3RlS2V5KTtcbiAgICAgICAgICAgIHJldHVybiByZXBvO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tIEJPVU5ERUQgQ09OVEVYVCBXQVJNLVVQIChubyBpbmZpbml0ZSBwb2xsaW5nKSAtLS1cbiAgICBjb25zdCBzbGVlcCA9IChtcykgPT4gbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIG1zKSk7XG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb1JlYWR5KHFrLCBhdHRlbXB0cyA9IDYsIGRlbGF5TXMgPSAyNTApIHtcbiAgICAgICAgLy8gVHJ5IGEgZmV3IHNob3J0IHRpbWVzIHRvIGFsbG93IERDL1JlcG8gdG8gY29tZSB1cCBhZnRlciBtb2RhbCBjbG9zZS9wcm9tb3RlXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXR0ZW1wdHM7IGkrKykge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgIGlmIChxdW90ZVJlcG8pIHJldHVybiBxdW90ZVJlcG87XG4gICAgICAgICAgICBhd2FpdCBzbGVlcChkZWxheU1zKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cblxuICAgIC8vIEJhY2tncm91bmQgcHJvbW90aW9uIChwZXItdGFiIGRyYWZ0IC0+IHBlci1xdW90ZSkgd2l0aCBnZW50bGUgcmV0cmllc1xuICAgIGZ1bmN0aW9uIHN0b3BQcm9tb3RlKCkge1xuICAgICAgICByZXR1cm4gbHQ/LmNvcmU/LnF0Py5zdG9wUmV0cnk/LigpO1xuICAgIH1cblxuICAgIC8vIFByb21vdGUgdGhlIHRhYi1zY29wZSBkcmFmdCBpbnRvIHRoZSBwZXItcXVvdGUgcmVwbyBvbmx5IGlmIGEgcmVhbCBkcmFmdCBleGlzdHMuXG4gICAgLy8gQWxzbyBndWFyZCBzbyB3ZSBkb24ndCBldmVuIGF0dGVtcHQgbW9yZSB0aGFuIG9uY2UgcGVyIHF1b3RlIGluIHRoaXMgdGFiLlxuICAgIGZ1bmN0aW9uIF9fZ3VhcmRLZXlGb3JQcm9tb3RlKHFrKSB7IHJldHVybiBgcXQzNTpwcm9tb3RlZDoke051bWJlcihxaykgfHwgMH1gOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBwcm9tb3RlRHJhZnRJZlByZXNlbnRPbmNlKHFrKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IF9fZ3VhcmRLZXlGb3JQcm9tb3RlKHFrKTtcbiAgICAgICAgdHJ5IHsgaWYgKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oa2V5KSA9PT0gJzEnKSByZXR1cm4gJ2d1YXJkZWQnOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBPbmx5IGNhbGwgaW50byBjb3JlIGlmIGEgZHJhZnQgYWN0dWFsbHkgZXhpc3RzXG4gICAgICAgIGNvbnN0IGRyYWZ0UmVwbyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8udXNlRHJhZnRSZXBvPy4oKTtcbiAgICAgICAgY29uc3QgZHJhZnQgPSBkcmFmdFJlcG8gJiYgKChhd2FpdCBkcmFmdFJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwgKGF3YWl0IGRyYWZ0UmVwby5nZXQ/LigpKSk7XG4gICAgICAgIGNvbnN0IGhhc0RyYWZ0ID0gISEoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCk7XG4gICAgICAgIGlmICghaGFzRHJhZnQpIHJldHVybiAnbm8tZHJhZnQnO1xuXG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGx0Py5jb3JlPy5xdD8ucHJvbW90ZURyYWZ0VG9RdW90ZT8uKHsgcWs6IE51bWJlcihxayksIHN0cmF0ZWd5OiAnb25jZScgfSkgfHwgJ25vb3AnO1xuXG4gICAgICAgIC8vIENvcmUgY2xlYXJzIHRoZSBkcmFmdCBvbiAnbWVyZ2VkJzsgZWl0aGVyIHdheSwgd2UgYXZvaWQgcmUtYXR0ZW1wdHMgZm9yIHRoaXMgdGFiL3F1b3RlXG4gICAgICAgIHRyeSB7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oa2V5LCAnMScpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cblxuICAgIC8vID09PT09IERhdGEgc291cmNlcyA9PT09PVxuICAgIGFzeW5jIGZ1bmN0aW9uIGZldGNoQXR0YWNobWVudENvdW50KHF1b3RlS2V5KSB7XG4gICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09IFwiZnVuY3Rpb25cIikgPyBhd2FpdCBnZXRQbGV4RmFjYWRlKCkgOiAoUk9PVC5sdD8uY29yZT8ucGxleCk7XG4gICAgICAgIGlmICghcGxleD8uZHNSb3dzKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoQ0ZHLkRTX0FUVEFDSE1FTlRTX0JZX1FVT1RFLCB7XG4gICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogQ0ZHLkFUVEFDSE1FTlRfR1JPVVBfS0VZLFxuICAgICAgICAgICAgUmVjb3JkX0tleV9WYWx1ZTogU3RyaW5nKHF1b3RlS2V5KVxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHJvd3MpID8gcm93cy5sZW5ndGggOiAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHF1b3RlSGVhZGVyR2V0KHJvdykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgQ3VzdG9tZXJfQ29kZTogcm93Py5DdXN0b21lcl9Db2RlID8/IG51bGwsXG4gICAgICAgICAgICBDdXN0b21lcl9OYW1lOiByb3c/LkN1c3RvbWVyX05hbWUgPz8gbnVsbCxcbiAgICAgICAgICAgIEN1c3RvbWVyX05vOiByb3c/LkN1c3RvbWVyX05vID8/IG51bGwsXG4gICAgICAgICAgICBRdW90ZV9Obzogcm93Py5RdW90ZV9ObyA/PyBudWxsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gPT09PT0gSHViIGJ1dHRvbiA9PT09PVxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzNS1hdHRhY2htZW50cy1idG4nO1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gc2V0QmFkZ2VDb3VudChuKSB7XG4gICAgICAgIGNvbnN0IGNvdW50ID0gTnVtYmVyKG4gPz8gMCk7XG4gICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGx0LmNvcmUucXQuZ2V0SHViKHsgbW91bnQ6IFwibmF2XCIgfSk7XG4gICAgICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgICAgIC8vIElmIGh1YiBzdXBwb3J0cyB1cGRhdGVCdXR0b24sIHVzZSBpdDsgb3RoZXJ3aXNlIG1pbmltYWwgY2h1cm5cbiAgICAgICAgY29uc3QgbGFiZWwgPSBgQXR0YWNobWVudHMgKCR7Y291bnR9KWA7XG4gICAgICAgIGlmICh0eXBlb2YgaHViLnVwZGF0ZUJ1dHRvbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgaHViLnVwZGF0ZUJ1dHRvbihIVUJfQlROX0lELCB7IGxhYmVsIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IG9ubHkgcmUtcmVnaXN0ZXIgaWYgbm90IHByZXNlbnQgKGF2b2lkIHJlbW92ZS9yZS1hZGQgY2h1cm4pXG4gICAgICAgIGNvbnN0IGxpc3QgPSBodWIubGlzdD8uKCk7XG4gICAgICAgIGNvbnN0IGFscmVhZHkgPSBBcnJheS5pc0FycmF5KGxpc3QpICYmIGxpc3QuaW5jbHVkZXMoSFVCX0JUTl9JRCk7XG4gICAgICAgIGlmICghYWxyZWFkeSkge1xuICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICAgICAgb25DbGljazogKCkgPT4gcnVuT25lUmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBObyB1cGRhdGUgQVBJOyBkbyBhIGdlbnRsZSByZXBsYWNlXG4gICAgICAgICAgICBodWIucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICAgICAgbGFiZWw6IGBBdHRhY2htZW50cyAoJHtjb3VudH0pYCxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgICAgIHdlaWdodDogMTIwLFxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bk9uZVJlZnJlc2gobWFudWFsID0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0F0dGFjaG1lbnRzICgwKScsXG4gICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5PbmVSZWZyZXNoKHRydWUpLFxuICAgICAgICAgICAgc2hvd1doZW46ICgpID0+IHRydWUsXG4gICAgICAgICAgICAvL3Nob3dXaGVuOiAoY3R4KSA9PlxuICAgICAgICAgICAgLy8gICAgKHR5cGVvZiBGT1JDRV9TSE9XX0JUTiAhPT0gJ3VuZGVmaW5lZCcgJiYgRk9SQ0VfU0hPV19CVE4pIHx8XG4gICAgICAgICAgICAvLyAgICBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGN0eC5wYWdlTmFtZSkgfHxcbiAgICAgICAgICAgIC8vICAgIGN0eC5pc09uUGFydFN1bW1hcnksXG4gICAgICAgICAgICBtb3VudDogJ25hdidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlZnJlc2hJbkZsaWdodCkgcmV0dXJuO1xuICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSB0cnVlO1xuICAgICAgICBjb25zdCB0ID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKFwiRmV0Y2hpbmcgQXR0YWNobWVudHNcdTIwMjZcIiwgXCJpbmZvXCIpO1xuXG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgICAgICBjb25zdCBjdHggPSBsdD8uY29yZT8ucXQ/LmdldFF1b3RlQ29udGV4dD8uKCk7XG4gICAgICAgICAgICBjb25zdCBxayA9IE51bWJlcihjdHg/LnF1b3RlS2V5KTtcblxuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudCgwKTtcbiAgICAgICAgICAgICAgICB0LmVycm9yKGBcdTI2QTBcdUZFMEYgUXVvdGUgS2V5IG5vdCBmb3VuZGAsIDUwMDApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgc2NvcGUgY2hhbmdlZCwgcGFpbnQgYW55IGV4aXN0aW5nIHNuYXBzaG90IGJlZm9yZSBmZXRjaGluZ1xuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVhZCA9IGF3YWl0IHF1b3RlUmVwbz8uZ2V0SGVhZGVyPy4oKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWQ/LkF0dGFjaG1lbnRfQ291bnQgIT0gbnVsbCkgc2V0QmFkZ2VDb3VudChOdW1iZXIoaGVhZC5BdHRhY2htZW50X0NvdW50KSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUHJvbW90ZSBvbmx5IGlmIGEgcmVhbCBkcmFmdCBleGlzdHM7IG90aGVyd2lzZSBza2lwIGZhc3RcbiAgICAgICAgICAgIGF3YWl0IHByb21vdGVEcmFmdElmUHJlc2VudE9uY2UocWspO1xuXG4gICAgICAgICAgICAvLyBBZnRlciBwcm9tb3Rpb24sIChyZSllbnN1cmUgdGhlIHBlci1xdW90ZSByZXBvIHdpdGggYm91bmRlZCByZXRyaWVzXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvUmVhZHkocWssIDYsIDI1MCk7XG5cbiAgICAgICAgICAgIGlmICghcXVvdGVSZXBvKSB7XG4gICAgICAgICAgICAgICAgLy8gTm8gZW5kbGVzcyBzcGlubmVyOyBmYWlsIGZhc3QsIHVzZXIgY2FuIGNsaWNrIGFnYWluIG9yIGl0IHdpbGwgd29yayBuZXh0IGZpcmVcbiAgICAgICAgICAgICAgICB0LmVycm9yKCdEYXRhIGNvbnRleHQgd2FybWluZyBcdTIwMTQgdHJ5IGFnYWluIGluIGEgbW9tZW50JywgNTAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgZmV0Y2hBdHRhY2htZW50Q291bnQocWspO1xuICAgICAgICAgICAgc2V0QmFkZ2VDb3VudChjb3VudCk7XG4gICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXIoeyBRdW90ZV9LZXk6IHFrLCBBdHRhY2htZW50X0NvdW50OiBOdW1iZXIoY291bnQpIH0pO1xuXG4gICAgICAgICAgICAvLyBBbHdheXMgcmVzb2x2ZSB0aGUgdGFza1xuICAgICAgICAgICAgY29uc3Qgb2sgPSBjb3VudCA+IDA7XG4gICAgICAgICAgICB0LnN1Y2Nlc3Mob2sgPyBgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnTm8gYXR0YWNobWVudHMnLCA1MDAwKTtcblxuICAgICAgICAgICAgLy8gT3B0aW9uYWwgdG9hc3Qgd2hlbiB1c2VyIGNsaWNrZWQgbWFudWFsbHlcbiAgICAgICAgICAgIGlmIChtYW51YWwpIHtcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXG4gICAgICAgICAgICAgICAgICAgIG9rID8gYCR7Y291bnR9IGF0dGFjaG1lbnQocylgIDogJ05vIGF0dGFjaG1lbnRzJyxcbiAgICAgICAgICAgICAgICAgICAgb2sgPyAnc3VjY2VzcycgOiAnd2FybicsXG4gICAgICAgICAgICAgICAgICAgIHsgdG9hc3Q6IHRydWUgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkbG9nKCdyZWZyZXNoJywgeyBxaywgY291bnQgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBkZXJyKCdyZWZyZXNoIGZhaWxlZCcsIGVycik7XG4gICAgICAgICAgICB0LmVycm9yKGBBdHRhY2htZW50cyByZWZyZXNoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsIDUwMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgIGBBdHRhY2htZW50cyByZWZyZXNoIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsXG4gICAgICAgICAgICAgICAgJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICB7IHRvYXN0OiB0cnVlIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICByZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIExpc3RlbiBmb3IgbW9kYWwtY2xvc2UgcmVmcmVzaCByZXF1ZXN0cyBmcm9tIFFUMjBcbiAgICBsZXQgX19xdDM1X2F1dG9SZWZyZXNoVGltZXIgPSBudWxsO1xuICAgIGZ1bmN0aW9uIG9uQXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQoZXYpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIE9ubHkgcmVmcmVzaCBvbiBQYXJ0IFN1bW1hcnlcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0Py4oKTtcbiAgICAgICAgICAgIGNvbnN0IG9uUGFydFN1bW1hcnkgPSAhIShjdHggJiYgKGN0eC5pc09uUGFydFN1bW1hcnkgfHwgQ0ZHLlNIT1dfT05fUEFHRVNfUkUudGVzdChjdHgucGFnZU5hbWUgfHwgJycpKSk7XG4gICAgICAgICAgICBpZiAoIW9uUGFydFN1bW1hcnkpIHJldHVybjtcblxuICAgICAgICAgICAgLy8gRGVib3VuY2UgcmFwaWQgZHVwbGljYXRlIGZpcmVzXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoX19xdDM1X2F1dG9SZWZyZXNoVGltZXIpO1xuICAgICAgICAgICAgX19xdDM1X2F1dG9SZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgcnVuT25lUmVmcmVzaChmYWxzZSk7IH0sIDM1MCk7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBuby1vcCAqLyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU1BBIHdpcmluZyA9PT09PVxuXG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIC8vIFRyYWNrIHdoZXRoZXIgd2Ugd2VyZSBwcmV2aW91c2x5IG9uIFBhcnQgU3VtbWFyeSB0byBkZXRlY3QgdHJhbnNpdGlvbnNcbiAgICBsZXQgd2FzT25QYXJ0U3VtbWFyeSA9IGZhbHNlO1xuICAgIGxldCBfX3F0MzVfcGFnZUFjdGl2YXRlVGltZXIgPSBudWxsO1xuICAgIGxldCBfX3F0MzVfbmF2T2JzZXJ2ZXIgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVSZWZyZXNoT25BY3RpdmUoZGVsYXkgPSAyNTApIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lcik7XG4gICAgICAgIF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBPbmx5IHJlZnJlc2ggaWYgd2UgdHJ1bHkgYXJlIG9uIFBhcnQgU3VtbWFyeVxuICAgICAgICAgICAgICAgIGlmIChpc09uUGFydFN1bW1hcnkoKSkgcnVuT25lUmVmcmVzaChmYWxzZSk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm8tb3AgKi8gfVxuICAgICAgICB9LCBkZWxheSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25XaXphcmRQYWdlTXV0YXRpb24oKSB7XG4gICAgICAgIGNvbnN0IG5vd09uID0gaXNPblBhcnRTdW1tYXJ5KCk7XG4gICAgICAgIGlmIChub3dPbiAmJiAhd2FzT25QYXJ0U3VtbWFyeSkge1xuICAgICAgICAgICAgLy8gUGFnZSBqdXN0IGJlY2FtZSBhY3RpdmUgLT4gcmVmcmVzaCBhdHRhY2htZW50c1xuICAgICAgICAgICAgc2NoZWR1bGVSZWZyZXNoT25BY3RpdmUoMjUwKTtcbiAgICAgICAgfVxuICAgICAgICB3YXNPblBhcnRTdW1tYXJ5ID0gbm93T247XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcblxuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gQXV0by1yZWZyZXNoIHdoZW4gUVQyMFx1MjAxOXMgbW9kYWwgY2xvc2VzXG4gICAgICAgIHRyeSB7IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpBdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCcsIG9uQXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQsIGZhbHNlKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICBhd2FpdCBsdC5jb3JlLnF0LmVuc3VyZUh1YkJ1dHRvbih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMtYnRuJyxcbiAgICAgICAgICAgIGxhYmVsOiAnQXR0YWNobWVudHMgKDApJyxcbiAgICAgICAgICAgIHRpdGxlOiAnUmVmcmVzaCBhdHRhY2htZW50cyAobWFudWFsKScsXG4gICAgICAgICAgICBzaWRlOiAnbGVmdCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSksXG4gICAgICAgICAgICBzaG93V2hlbjogKGN0eCkgPT4gKHR5cGVvZiBGT1JDRV9TSE9XX0JUTiAhPT0gJ3VuZGVmaW5lZCcgJiYgRk9SQ0VfU0hPV19CVE4pIHx8IENGRy5TSE9XX09OX1BBR0VTX1JFLnRlc3QoY3R4LnBhZ2VOYW1lKSB8fCBjdHguaXNPblBhcnRTdW1tYXJ5LFxuICAgICAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIE9ic2VydmUgd2l6YXJkIHBhZ2UgY2hhbmdlcyB0byBkZXRlY3Qgd2hlbiBQYXJ0IFN1bW1hcnkgYmVjb21lcyBhY3RpdmVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgICAgIGlmIChuYXYgJiYgIV9fcXQzNV9uYXZPYnNlcnZlcikge1xuICAgICAgICAgICAgICAgIF9fcXQzNV9uYXZPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG9uV2l6YXJkUGFnZU11dGF0aW9uKTtcbiAgICAgICAgICAgICAgICBfX3F0MzVfbmF2T2JzZXJ2ZXIub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBBbHNvIHJlYWN0IHRvIGhhc2ggY2hhbmdlcyAoc29tZSBTUEEgcm91dGVzIHVzZSBoYXNoIG5hdmlnYXRpb24pXG4gICAgICAgIHRyeSB7IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgb25XaXphcmRQYWdlTXV0YXRpb24pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgICAgICAvLyBTZWVkIHByaW9yIHN0YXRlICYgdHJpZ2dlciBpbml0aWFsIHJlZnJlc2ggaWYgd2UgYWxyZWFkeSBsYW5kZWQgb24gdGhlIHRhcmdldCBwYWdlXG4gICAgICAgIHdhc09uUGFydFN1bW1hcnkgPSBpc09uUGFydFN1bW1hcnkoKTtcbiAgICAgICAgaWYgKHdhc09uUGFydFN1bW1hcnkpIHNjaGVkdWxlUmVmcmVzaE9uQWN0aXZlKDE1MCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgb2ZmVXJsPy4oKTtcbiAgICAgICAgb2ZmVXJsID0gbnVsbDtcbiAgICAgICAgc3RvcFByb21vdGUoKTsgLy8gZW5zdXJlIGJhY2tncm91bmQgdGltZXIgaXMgY2xlYXJlZFxuICAgICAgICB0cnkgeyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCBvbkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkLCBmYWxzZSk7IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgLy8gRGlzY29ubmVjdCBwYWdlIGFjdGl2YXRpb24gb2JzZXJ2ZXJzL2xpc3RlbmVyc1xuICAgICAgICB0cnkgeyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIG9uV2l6YXJkUGFnZU11dGF0aW9uKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHsgX19xdDM1X25hdk9ic2VydmVyPy5kaXNjb25uZWN0Py4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgX19xdDM1X25hdk9ic2VydmVyID0gbnVsbDtcbiAgICAgICAgY2xlYXJUaW1lb3V0KF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lcik7XG4gICAgICAgIF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lciA9IG51bGw7XG5cbiAgICAgICAgLy8gSHViIHZpc2liaWxpdHkgaXMgaGFuZGxlZCBjZW50cmFsbHkgdmlhIGVuc3VyZUh1YkJ1dHRvbigpXG4gICAgfVxuXG4gICAgaW5pdCgpO1xuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxHQUFDLE1BQU07QUFDSDtBQUVBLFVBQU0sTUFBTyxPQUF3QyxPQUFnQjtBQUNyRSxVQUFNLE9BQU8sSUFBSSxNQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ3hELFVBQU0sT0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLHFCQUFXLEdBQUcsQ0FBQztBQUNwRCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBSW5FLFVBQU0sZ0JBQWdCLENBQUMsT0FBTztBQUMxQixZQUFNLE9BQU8sSUFBSSxNQUFNLE1BQU07QUFDN0IsYUFBUSxPQUFPLFNBQVMsYUFBYyxLQUFLLEVBQUUsSUFBSSxHQUFHO0FBQUEsSUFDeEQ7QUFFQSxLQUFDLFlBQVk7QUFFVCxZQUFNLE9BQU8sTUFBTSxPQUFPLGVBQWU7QUFDekMsWUFBTSxTQUFTO0FBQUEsUUFDWCxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixTQUFTLE1BQU8sT0FBTyx5QkFBeUIsYUFDMUMscUJBQXFCLElBQ3JCLEdBQUcsS0FBSyxJQUFJLE9BQU8sZ0NBQWdDLFFBQVEsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ3BGLENBQUM7QUFBQSxJQUNMLEdBQUc7QUFHSCxVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsVUFBTSxpQkFBaUI7QUFDdkIsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFNLEdBQUcsS0FBSyxTQUFTLFFBQVEsQ0FBQyxFQUFH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
