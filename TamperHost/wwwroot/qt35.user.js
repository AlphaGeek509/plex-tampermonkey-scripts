// ==UserScript==
// @name        QT35_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.19.21
// @description Adds Attachments badge/button (and Dock) and promotes draft→quote once if needed. Counts attachments via DS 11713 (group 11) and auto-refreshes on Part Summary activation and QT20 modal close. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.19.21-1779233317736
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.19.21-1779233317736
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.19.21-1779233317736
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.19.21-1779233317736
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.19.21-1779233317736
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
  // tm-scripts/src/quote-tracking/qt35-attachmentsGet/qt35.index.js
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
        weight: 40,
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
          weight: 40,
          onClick: () => runOneRefresh(true)
        });
      } else {
        hub.remove?.(HUB_BTN_ID);
        hub.registerButton("left", {
          id: HUB_BTN_ID,
          label: `Attachments (${count})`,
          title: "Refresh attachments (manual)",
          weight: 40,
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
        weight: 40,
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
        weight: 40,
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzNS1hdHRhY2htZW50c0dldC9xdDM1LmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDM1LWF0dGFjaG1lbnRzR2V0L3F0MzUuaW5kZXguanNcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4gREVWICYmIGNvbnNvbGUuZGVidWcoJ1FUMzUnLCAuLi5hKTtcbiAgICBjb25zdCBkZXJyID0gKC4uLmEpID0+IGNvbnNvbGUuZXJyb3IoXCJRVDM1IFx1MjcxNlx1RkUwRlwiLCAuLi5hKTtcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcblxuICAgIC8vIFNhZmUgZGVsZWdhdGluZyB3cmFwcGVyOiB1c2UgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggd2hlbiBhdmFpbGFibGUsXG4gICAgLy8gb3RoZXJ3aXNlIGp1c3QgcnVuIHRoZSBjYWxsYmFjayBvbmNlIChiZXN0LWVmZm9ydCBmYWxsYmFjaykuXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDQwLFxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gKHR5cGVvZiBvcGVuQXR0YWNobWVudHNNb2RhbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgID8gb3BlbkF0dGFjaG1lbnRzTW9kYWwoKVxuICAgICAgICAgICAgICAgIDogbHQuY29yZS5odWIubm90aWZ5KCdBdHRhY2htZW50cyBVSSBub3QgYXZhaWxhYmxlJywgJ3dhcm4nLCB7IHRvYXN0OiB0cnVlIH0pKVxuICAgICAgICB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGNvbnN0IEZPUkNFX1NIT1dfQlROID0gZmFsc2U7IC8vIHNldCB0byB0cnVlIGR1cmluZyB0ZXN0aW5nXG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XG5cbiAgICBjb25zdCBDRkcgPSB7XG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcbiAgICAgICAgR1JJRF9TRUw6ICcucGxleC1ncmlkJyxcbiAgICAgICAgLy9TSE9XX09OX1BBR0VTX1JFOiAvXFxic3VtbWFyeVxcYi9pLFxuICAgICAgICBTSE9XX09OX1BBR0VTX1JFOiAvXnBhcnRcXHMqc3VtbWFyeSQvaSxcbiAgICAgICAgRFNfQVRUQUNITUVOVFNfQllfUVVPVEU6IDExNzEzLFxuICAgICAgICBBVFRBQ0hNRU5UX0dST1VQX0tFWTogMTEsXG4gICAgICAgIERTX1FVT1RFX0hFQURFUl9HRVQ6IDMxNTYsXG4gICAgICAgIFBPTExfTVM6IDIwMCxcbiAgICAgICAgVElNRU9VVF9NUzogMTIwMDBcbiAgICB9O1xuXG4gICAgLy8gLS0tIEFjdGl2ZSB3aXphcmQgcGFnZSBoZWxwZXJzIC0tLVxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICAgICAgcmV0dXJuIChsaT8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGlzT25QYXJ0U3VtbWFyeSgpIHtcbiAgICAgICAgcmV0dXJuIENGRy5TSE9XX09OX1BBR0VTX1JFLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XG4gICAgfVxuXG5cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVXaXphcmRWTSgpIHtcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpID8gQ0ZHLkdSSURfU0VMIDogQ0ZHLkFDVElPTl9CQVJfU0VMO1xuICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYyhhbmNob3IsIHsgcG9sbE1zOiBDRkcuUE9MTF9NUywgdGltZW91dE1zOiBDRkcuVElNRU9VVF9NUywgcmVxdWlyZUtvOiB0cnVlIH0pID8/IHsgdmlld01vZGVsOiBudWxsIH0pO1xuICAgICAgICByZXR1cm4gdmlld01vZGVsO1xuICAgIH1cblxuICAgIGxldCBxdW90ZVJlcG8gPSBudWxsLCBsYXN0U2NvcGUgPSBudWxsO1xuICAgIGxldCBfX1FUX18gPSBudWxsO1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXBvID0gYXdhaXQgbHQ/LmNvcmU/LnF0Py51c2VRdW90ZVJlcG8/LihOdW1iZXIocXVvdGVLZXkpKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBOdW1iZXIocXVvdGVLZXkpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcG87XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0gQk9VTkRFRCBDT05URVhUIFdBUk0tVVAgKG5vIGluZmluaXRlIHBvbGxpbmcpIC0tLVxuICAgIGNvbnN0IHNsZWVwID0gKG1zKSA9PiBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgbXMpKTtcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVSZXBvUmVhZHkocWssIGF0dGVtcHRzID0gNiwgZGVsYXlNcyA9IDI1MCkge1xuICAgICAgICAvLyBUcnkgYSBmZXcgc2hvcnQgdGltZXMgdG8gYWxsb3cgREMvUmVwbyB0byBjb21lIHVwIGFmdGVyIG1vZGFsIGNsb3NlL3Byb21vdGVcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdHRlbXB0czsgaSsrKSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xuICAgICAgICAgICAgaWYgKHF1b3RlUmVwbykgcmV0dXJuIHF1b3RlUmVwbztcbiAgICAgICAgICAgIGF3YWl0IHNsZWVwKGRlbGF5TXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuXG4gICAgLy8gQmFja2dyb3VuZCBwcm9tb3Rpb24gKHBlci10YWIgZHJhZnQgLT4gcGVyLXF1b3RlKSB3aXRoIGdlbnRsZSByZXRyaWVzXG4gICAgZnVuY3Rpb24gc3RvcFByb21vdGUoKSB7XG4gICAgICAgIHJldHVybiBsdD8uY29yZT8ucXQ/LnN0b3BSZXRyeT8uKCk7XG4gICAgfVxuXG4gICAgLy8gUHJvbW90ZSB0aGUgdGFiLXNjb3BlIGRyYWZ0IGludG8gdGhlIHBlci1xdW90ZSByZXBvIG9ubHkgaWYgYSByZWFsIGRyYWZ0IGV4aXN0cy5cbiAgICAvLyBBbHNvIGd1YXJkIHNvIHdlIGRvbid0IGV2ZW4gYXR0ZW1wdCBtb3JlIHRoYW4gb25jZSBwZXIgcXVvdGUgaW4gdGhpcyB0YWIuXG4gICAgZnVuY3Rpb24gX19ndWFyZEtleUZvclByb21vdGUocWspIHsgcmV0dXJuIGBxdDM1OnByb21vdGVkOiR7TnVtYmVyKHFrKSB8fCAwfWA7IH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHByb21vdGVEcmFmdElmUHJlc2VudE9uY2UocWspIHtcbiAgICAgICAgY29uc3Qga2V5ID0gX19ndWFyZEtleUZvclByb21vdGUocWspO1xuICAgICAgICB0cnkgeyBpZiAoc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShrZXkpID09PSAnMScpIHJldHVybiAnZ3VhcmRlZCc7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgICAgIC8vIE9ubHkgY2FsbCBpbnRvIGNvcmUgaWYgYSBkcmFmdCBhY3R1YWxseSBleGlzdHNcbiAgICAgICAgY29uc3QgZHJhZnRSZXBvID0gYXdhaXQgbHQ/LmNvcmU/LnF0Py51c2VEcmFmdFJlcG8/LigpO1xuICAgICAgICBjb25zdCBkcmFmdCA9IGRyYWZ0UmVwbyAmJiAoKGF3YWl0IGRyYWZ0UmVwby5nZXRIZWFkZXI/LigpKSB8fCAoYXdhaXQgZHJhZnRSZXBvLmdldD8uKCkpKTtcbiAgICAgICAgY29uc3QgaGFzRHJhZnQgPSAhIShkcmFmdCAmJiBPYmplY3Qua2V5cyhkcmFmdCkubGVuZ3RoKTtcbiAgICAgICAgaWYgKCFoYXNEcmFmdCkgcmV0dXJuICduby1kcmFmdCc7XG5cbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgbHQ/LmNvcmU/LnF0Py5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxazogTnVtYmVyKHFrKSwgc3RyYXRlZ3k6ICdvbmNlJyB9KSB8fCAnbm9vcCc7XG5cbiAgICAgICAgLy8gQ29yZSBjbGVhcnMgdGhlIGRyYWZ0IG9uICdtZXJnZWQnOyBlaXRoZXIgd2F5LCB3ZSBhdm9pZCByZS1hdHRlbXB0cyBmb3IgdGhpcyB0YWIvcXVvdGVcbiAgICAgICAgdHJ5IHsgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbShrZXksICcxJyk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuXG4gICAgLy8gPT09PT0gRGF0YSBzb3VyY2VzID09PT09XG4gICAgYXN5bmMgZnVuY3Rpb24gZmV0Y2hBdHRhY2htZW50Q291bnQocXVvdGVLZXkpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgZ2V0UGxleEZhY2FkZSA9PT0gXCJmdW5jdGlvblwiKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IChST09ULmx0Py5jb3JlPy5wbGV4KTtcbiAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHJldHVybiAwO1xuICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhDRkcuRFNfQVRUQUNITUVOVFNfQllfUVVPVEUsIHtcbiAgICAgICAgICAgIEF0dGFjaG1lbnRfR3JvdXBfS2V5OiBDRkcuQVRUQUNITUVOVF9HUk9VUF9LRVksXG4gICAgICAgICAgICBSZWNvcmRfS2V5X1ZhbHVlOiBTdHJpbmcocXVvdGVLZXkpXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkocm93cykgPyByb3dzLmxlbmd0aCA6IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcXVvdGVIZWFkZXJHZXQocm93KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBDdXN0b21lcl9Db2RlOiByb3c/LkN1c3RvbWVyX0NvZGUgPz8gbnVsbCxcbiAgICAgICAgICAgIEN1c3RvbWVyX05hbWU6IHJvdz8uQ3VzdG9tZXJfTmFtZSA/PyBudWxsLFxuICAgICAgICAgICAgQ3VzdG9tZXJfTm86IHJvdz8uQ3VzdG9tZXJfTm8gPz8gbnVsbCxcbiAgICAgICAgICAgIFF1b3RlX05vOiByb3c/LlF1b3RlX05vID8/IG51bGxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyA9PT09PSBIdWIgYnV0dG9uID09PT09XG4gICAgY29uc3QgSFVCX0JUTl9JRCA9ICdxdDM1LWF0dGFjaG1lbnRzLWJ0bic7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBzZXRCYWRnZUNvdW50KG4pIHtcbiAgICAgICAgY29uc3QgY291bnQgPSBOdW1iZXIobiA/PyAwKTtcbiAgICAgICAgY29uc3QgaHViID0gYXdhaXQgbHQuY29yZS5xdC5nZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTtcbiAgICAgICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm47XG5cbiAgICAgICAgLy8gSWYgaHViIHN1cHBvcnRzIHVwZGF0ZUJ1dHRvbiwgdXNlIGl0OyBvdGhlcndpc2UgbWluaW1hbCBjaHVyblxuICAgICAgICBjb25zdCBsYWJlbCA9IGBBdHRhY2htZW50cyAoJHtjb3VudH0pYDtcbiAgICAgICAgaWYgKHR5cGVvZiBodWIudXBkYXRlQnV0dG9uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBodWIudXBkYXRlQnV0dG9uKEhVQl9CVE5fSUQsIHsgbGFiZWwgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYWxsYmFjazogb25seSByZS1yZWdpc3RlciBpZiBub3QgcHJlc2VudCAoYXZvaWQgcmVtb3ZlL3JlLWFkZCBjaHVybilcbiAgICAgICAgY29uc3QgbGlzdCA9IGh1Yi5saXN0Py4oKTtcbiAgICAgICAgY29uc3QgYWxyZWFkeSA9IEFycmF5LmlzQXJyYXkobGlzdCkgJiYgbGlzdC5pbmNsdWRlcyhIVUJfQlROX0lEKTtcbiAgICAgICAgaWYgKCFhbHJlYWR5KSB7XG4gICAgICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICAgICAgbGFiZWwsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJyxcbiAgICAgICAgICAgICAgICB3ZWlnaHQ6IDQwLFxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm8gdXBkYXRlIEFQSTsgZG8gYSBnZW50bGUgcmVwbGFjZVxuICAgICAgICAgICAgaHViLnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgICAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgICAgIGxhYmVsOiBgQXR0YWNobWVudHMgKCR7Y291bnR9KWAsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJyxcbiAgICAgICAgICAgICAgICB3ZWlnaHQ6IDQwLFxuICAgICAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bk9uZVJlZnJlc2gobWFudWFsID0gZmFsc2UpIHtcbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0F0dGFjaG1lbnRzICgwKScsXG4gICAgICAgICAgICB0aXRsZTogJ1JlZnJlc2ggYXR0YWNobWVudHMgKG1hbnVhbCknLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiA0MCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bk9uZVJlZnJlc2godHJ1ZSksXG4gICAgICAgICAgICBzaG93V2hlbjogKCkgPT4gdHJ1ZSxcbiAgICAgICAgICAgIC8vc2hvd1doZW46IChjdHgpID0+XG4gICAgICAgICAgICAvLyAgICAodHlwZW9mIEZPUkNFX1NIT1dfQlROICE9PSAndW5kZWZpbmVkJyAmJiBGT1JDRV9TSE9XX0JUTikgfHxcbiAgICAgICAgICAgIC8vICAgIENGRy5TSE9XX09OX1BBR0VTX1JFLnRlc3QoY3R4LnBhZ2VOYW1lKSB8fFxuICAgICAgICAgICAgLy8gICAgY3R4LmlzT25QYXJ0U3VtbWFyeSxcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVmcmVzaEluRmxpZ2h0KSByZXR1cm47XG4gICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIGNvbnN0IHQgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2soXCJGZXRjaGluZyBBdHRhY2htZW50c1x1MjAyNlwiLCBcImluZm9cIik7XG5cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0Py4oKTtcbiAgICAgICAgICAgIGNvbnN0IHFrID0gTnVtYmVyKGN0eD8ucXVvdGVLZXkpO1xuXG4gICAgICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHtcbiAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50KDApO1xuICAgICAgICAgICAgICAgIHQuZXJyb3IoYFx1MjZBMFx1RkUwRiBRdW90ZSBLZXkgbm90IGZvdW5kYCwgNTAwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiBzY29wZSBjaGFuZ2VkLCBwYWludCBhbnkgZXhpc3Rpbmcgc25hcHNob3QgYmVmb3JlIGZldGNoaW5nXG4gICAgICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0gYXdhaXQgcXVvdGVSZXBvPy5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZD8uQXR0YWNobWVudF9Db3VudCAhPSBudWxsKSBzZXRCYWRnZUNvdW50KE51bWJlcihoZWFkLkF0dGFjaG1lbnRfQ291bnQpKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBQcm9tb3RlIG9ubHkgaWYgYSByZWFsIGRyYWZ0IGV4aXN0czsgb3RoZXJ3aXNlIHNraXAgZmFzdFxuICAgICAgICAgICAgYXdhaXQgcHJvbW90ZURyYWZ0SWZQcmVzZW50T25jZShxayk7XG5cbiAgICAgICAgICAgIC8vIEFmdGVyIHByb21vdGlvbiwgKHJlKWVuc3VyZSB0aGUgcGVyLXF1b3RlIHJlcG8gd2l0aCBib3VuZGVkIHJldHJpZXNcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9SZWFkeShxaywgNiwgMjUwKTtcblxuICAgICAgICAgICAgaWYgKCFxdW90ZVJlcG8pIHtcbiAgICAgICAgICAgICAgICAvLyBObyBlbmRsZXNzIHNwaW5uZXI7IGZhaWwgZmFzdCwgdXNlciBjYW4gY2xpY2sgYWdhaW4gb3IgaXQgd2lsbCB3b3JrIG5leHQgZmlyZVxuICAgICAgICAgICAgICAgIHQuZXJyb3IoJ0RhdGEgY29udGV4dCB3YXJtaW5nIFx1MjAxNCB0cnkgYWdhaW4gaW4gYSBtb21lbnQnLCA1MDApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY291bnQgPSBhd2FpdCBmZXRjaEF0dGFjaG1lbnRDb3VudChxayk7XG4gICAgICAgICAgICBzZXRCYWRnZUNvdW50KGNvdW50KTtcbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogcWssIEF0dGFjaG1lbnRfQ291bnQ6IE51bWJlcihjb3VudCkgfSk7XG5cbiAgICAgICAgICAgIC8vIEFsd2F5cyByZXNvbHZlIHRoZSB0YXNrXG4gICAgICAgICAgICBjb25zdCBvayA9IGNvdW50ID4gMDtcbiAgICAgICAgICAgIHQuc3VjY2VzcyhvayA/IGAke2NvdW50fSBhdHRhY2htZW50KHMpYCA6ICdObyBhdHRhY2htZW50cycsIDUwMDApO1xuXG4gICAgICAgICAgICAvLyBPcHRpb25hbCB0b2FzdCB3aGVuIHVzZXIgY2xpY2tlZCBtYW51YWxseVxuICAgICAgICAgICAgaWYgKG1hbnVhbCkge1xuICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcbiAgICAgICAgICAgICAgICAgICAgb2sgPyBgJHtjb3VudH0gYXR0YWNobWVudChzKWAgOiAnTm8gYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgICAgICAgICBvayA/ICdzdWNjZXNzJyA6ICd3YXJuJyxcbiAgICAgICAgICAgICAgICAgICAgeyB0b2FzdDogdHJ1ZSB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRsb2coJ3JlZnJlc2gnLCB7IHFrLCBjb3VudCB9KTtcblxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGRlcnIoJ3JlZnJlc2ggZmFpbGVkJywgZXJyKTtcbiAgICAgICAgICAgIHQuZXJyb3IoYEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgNTAwMCk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXG4gICAgICAgICAgICAgICAgYEF0dGFjaG1lbnRzIHJlZnJlc2ggZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCxcbiAgICAgICAgICAgICAgICAnZXJyb3InLFxuICAgICAgICAgICAgICAgIHsgdG9hc3Q6IHRydWUgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuIGZvciBtb2RhbC1jbG9zZSByZWZyZXNoIHJlcXVlc3RzIGZyb20gUVQyMFxuICAgIGxldCBfX3F0MzVfYXV0b1JlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgZnVuY3Rpb24gb25BdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZChldikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gT25seSByZWZyZXNoIG9uIFBhcnQgU3VtbWFyeVxuICAgICAgICAgICAgY29uc3QgY3R4ID0gbHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpO1xuICAgICAgICAgICAgY29uc3Qgb25QYXJ0U3VtbWFyeSA9ICEhKGN0eCAmJiAoY3R4LmlzT25QYXJ0U3VtbWFyeSB8fCBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGN0eC5wYWdlTmFtZSB8fCAnJykpKTtcbiAgICAgICAgICAgIGlmICghb25QYXJ0U3VtbWFyeSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAvLyBEZWJvdW5jZSByYXBpZCBkdXBsaWNhdGUgZmlyZXNcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChfX3F0MzVfYXV0b1JlZnJlc2hUaW1lcik7XG4gICAgICAgICAgICBfX3F0MzVfYXV0b1JlZnJlc2hUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBydW5PbmVSZWZyZXNoKGZhbHNlKTsgfSwgMzUwKTtcbiAgICAgICAgfSBjYXRjaCB7IC8qIG5vLW9wICovIH1cbiAgICB9XG5cbiAgICAvLyA9PT09PSBTUEEgd2lyaW5nID09PT09XG5cbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgLy8gVHJhY2sgd2hldGhlciB3ZSB3ZXJlIHByZXZpb3VzbHkgb24gUGFydCBTdW1tYXJ5IHRvIGRldGVjdCB0cmFuc2l0aW9uc1xuICAgIGxldCB3YXNPblBhcnRTdW1tYXJ5ID0gZmFsc2U7XG4gICAgbGV0IF9fcXQzNV9wYWdlQWN0aXZhdGVUaW1lciA9IG51bGw7XG4gICAgbGV0IF9fcXQzNV9uYXZPYnNlcnZlciA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiBzY2hlZHVsZVJlZnJlc2hPbkFjdGl2ZShkZWxheSA9IDI1MCkge1xuICAgICAgICBjbGVhclRpbWVvdXQoX19xdDM1X3BhZ2VBY3RpdmF0ZVRpbWVyKTtcbiAgICAgICAgX19xdDM1X3BhZ2VBY3RpdmF0ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIE9ubHkgcmVmcmVzaCBpZiB3ZSB0cnVseSBhcmUgb24gUGFydCBTdW1tYXJ5XG4gICAgICAgICAgICAgICAgaWYgKGlzT25QYXJ0U3VtbWFyeSgpKSBydW5PbmVSZWZyZXNoKGZhbHNlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBuby1vcCAqLyB9XG4gICAgICAgIH0sIGRlbGF5KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbldpemFyZFBhZ2VNdXRhdGlvbigpIHtcbiAgICAgICAgY29uc3Qgbm93T24gPSBpc09uUGFydFN1bW1hcnkoKTtcbiAgICAgICAgaWYgKG5vd09uICYmICF3YXNPblBhcnRTdW1tYXJ5KSB7XG4gICAgICAgICAgICAvLyBQYWdlIGp1c3QgYmVjYW1lIGFjdGl2ZSAtPiByZWZyZXNoIGF0dGFjaG1lbnRzXG4gICAgICAgICAgICBzY2hlZHVsZVJlZnJlc2hPbkFjdGl2ZSgyNTApO1xuICAgICAgICB9XG4gICAgICAgIHdhc09uUGFydFN1bW1hcnkgPSBub3dPbjtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuXG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcblxuICAgICAgICAvLyBBdXRvLXJlZnJlc2ggd2hlbiBRVDIwXHUyMDE5cyBtb2RhbCBjbG9zZXNcbiAgICAgICAgdHJ5IHsgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgb25BdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCwgZmFsc2UpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgIGF3YWl0IGx0LmNvcmUucXQuZW5zdXJlSHViQnV0dG9uKHtcbiAgICAgICAgICAgIGlkOiAncXQzNS1hdHRhY2htZW50cy1idG4nLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cyAoMCknLFxuICAgICAgICAgICAgdGl0bGU6ICdSZWZyZXNoIGF0dGFjaG1lbnRzIChtYW51YWwpJyxcbiAgICAgICAgICAgIHNpZGU6ICdsZWZ0JyxcbiAgICAgICAgICAgIHdlaWdodDogNDAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5PbmVSZWZyZXNoKHRydWUpLFxuICAgICAgICAgICAgc2hvd1doZW46IChjdHgpID0+ICh0eXBlb2YgRk9SQ0VfU0hPV19CVE4gIT09ICd1bmRlZmluZWQnICYmIEZPUkNFX1NIT1dfQlROKSB8fCBDRkcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGN0eC5wYWdlTmFtZSkgfHwgY3R4LmlzT25QYXJ0U3VtbWFyeSxcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBPYnNlcnZlIHdpemFyZCBwYWdlIGNoYW5nZXMgdG8gZGV0ZWN0IHdoZW4gUGFydCBTdW1tYXJ5IGJlY29tZXMgYWN0aXZlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgICAgICAgICBpZiAobmF2ICYmICFfX3F0MzVfbmF2T2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgICBfX3F0MzVfbmF2T2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihvbldpemFyZFBhZ2VNdXRhdGlvbik7XG4gICAgICAgICAgICAgICAgX19xdDM1X25hdk9ic2VydmVyLm9ic2VydmUobmF2LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAgICAgLy8gQWxzbyByZWFjdCB0byBoYXNoIGNoYW5nZXMgKHNvbWUgU1BBIHJvdXRlcyB1c2UgaGFzaCBuYXZpZ2F0aW9uKVxuICAgICAgICB0cnkgeyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIG9uV2l6YXJkUGFnZU11dGF0aW9uKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAgICAgLy8gU2VlZCBwcmlvciBzdGF0ZSAmIHRyaWdnZXIgaW5pdGlhbCByZWZyZXNoIGlmIHdlIGFscmVhZHkgbGFuZGVkIG9uIHRoZSB0YXJnZXQgcGFnZVxuICAgICAgICB3YXNPblBhcnRTdW1tYXJ5ID0gaXNPblBhcnRTdW1tYXJ5KCk7XG4gICAgICAgIGlmICh3YXNPblBhcnRTdW1tYXJ5KSBzY2hlZHVsZVJlZnJlc2hPbkFjdGl2ZSgxNTApO1xuICAgIH1cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIG9mZlVybD8uKCk7XG4gICAgICAgIG9mZlVybCA9IG51bGw7XG4gICAgICAgIHN0b3BQcm9tb3RlKCk7IC8vIGVuc3VyZSBiYWNrZ3JvdW5kIHRpbWVyIGlzIGNsZWFyZWRcbiAgICAgICAgdHJ5IHsgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgb25BdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCwgZmFsc2UpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgIC8vIERpc2Nvbm5lY3QgcGFnZSBhY3RpdmF0aW9uIG9ic2VydmVycy9saXN0ZW5lcnNcbiAgICAgICAgdHJ5IHsgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCBvbldpemFyZFBhZ2VNdXRhdGlvbik7IH0gY2F0Y2ggeyB9XG4gICAgICAgIHRyeSB7IF9fcXQzNV9uYXZPYnNlcnZlcj8uZGlzY29ubmVjdD8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIF9fcXQzNV9uYXZPYnNlcnZlciA9IG51bGw7XG4gICAgICAgIGNsZWFyVGltZW91dChfX3F0MzVfcGFnZUFjdGl2YXRlVGltZXIpO1xuICAgICAgICBfX3F0MzVfcGFnZUFjdGl2YXRlVGltZXIgPSBudWxsO1xuXG4gICAgICAgIC8vIEh1YiB2aXNpYmlsaXR5IGlzIGhhbmRsZWQgY2VudHJhbGx5IHZpYSBlbnN1cmVIdWJCdXR0b24oKVxuICAgIH1cblxuICAgIGluaXQoKTtcblxuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAoUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsR0FBQyxNQUFNO0FBQ0g7QUFFQSxVQUFNLE1BQU8sT0FBd0MsT0FBZ0I7QUFDckUsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQUluRSxVQUFNLGdCQUFnQixDQUFDLE9BQU87QUFDMUIsWUFBTSxPQUFPLElBQUksTUFBTSxNQUFNO0FBQzdCLGFBQVEsT0FBTyxTQUFTLGFBQWMsS0FBSyxFQUFFLElBQUksR0FBRztBQUFBLElBQ3hEO0FBRUEsS0FBQyxZQUFZO0FBRVQsWUFBTSxPQUFPLE1BQU0sT0FBTyxlQUFlO0FBQ3pDLFlBQU0sU0FBUztBQUFBLFFBQ1gsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsU0FBUyxNQUFPLE9BQU8seUJBQXlCLGFBQzFDLHFCQUFxQixJQUNyQixHQUFHLEtBQUssSUFBSSxPQUFPLGdDQUFnQyxRQUFRLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUNwRixDQUFDO0FBQUEsSUFDTCxHQUFHO0FBR0gsVUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBQ3RELFVBQU0saUJBQWlCO0FBQ3ZCLFFBQUksQ0FBQyxPQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUMsRUFBRztBQUVw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
