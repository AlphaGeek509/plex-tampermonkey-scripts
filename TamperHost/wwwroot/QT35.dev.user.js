// ==UserScript==
// @name         QT35_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.239
// @description  Displays read-only “Attachments: N” in the Quote Wizard action bar.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
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
  // src/qt35/main.js
  (async function() {
    "use strict";
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.("QT35");
    const dlog = (...a) => {
      if (IS_TEST_ENV) L?.log?.(...a);
    };
    const derror = (...a) => {
      if (IS_TEST_ENV) L?.error?.(...a);
    };
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) return;
    const CFG = {
      DS_ATTACHMENTS_BY_QUOTE: 11713,
      ATTACHMENT_GROUP_KEY: 11,
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      SHOW_ON_PAGES_RE: /review|summary|submit/i,
      POLL_MS: 200,
      TIMEOUT_MS: 12e3
    };
    const LABEL_LI_ID = "lt-attachments-badge";
    const LABEL_PILL_ID = "lt-attach-pill";
    const QT30_BTN_ID = "lt-apply-catalog-pricing";
    const QT30_BTN_ID_LEGACY = "lt-catalog-pricing-button";
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("\u{1F504} QT35: Refresh now", () => {
        const li = document.getElementById(LABEL_LI_ID);
        if (li) refreshBadge(li, { forceToast: true, ignoreVisibility: true });
      });
    }
    const injectOnce = (ul) => injectBadge(ul);
    const stopObserve = TMUtils.observeInsertMany?.(CFG.ACTION_BAR_SEL, injectOnce) || TMUtils.observeInsert?.(CFG.ACTION_BAR_SEL, injectOnce);
    document.querySelectorAll(CFG.ACTION_BAR_SEL).forEach(injectOnce);
    TMUtils.onUrlChange?.(() => {
      if (!TMUtils.matchRoute?.(ROUTES)) return;
      document.querySelectorAll(CFG.ACTION_BAR_SEL).forEach(injectOnce);
    });
    window.addEventListener("LT:AttachmentRefreshRequested", () => {
      const li = document.getElementById(LABEL_LI_ID);
      if (li) refreshBadge(li, { forceToast: false, ignoreVisibility: false });
    });
    function injectBadge(actionBarUl) {
      try {
        if (!actionBarUl || actionBarUl.nodeName !== "UL") return;
        if (document.getElementById(LABEL_LI_ID)) return;
        const li = document.createElement("li");
        li.id = LABEL_LI_ID;
        li.style.display = "none";
        const a = document.createElement("a");
        a.href = "javascript:void(0)";
        a.title = "Click to refresh attachments";
        a.style.cursor = "pointer";
        a.innerHTML = `
        <span id="${LABEL_PILL_ID}"
              style="display:inline-block; padding:2px 8px; border-radius:999px; background:#999; color:#fff; font-weight:600; transition:filter .15s;">
          Attachments: \u2026
        </span>
      `;
        a.addEventListener("click", () => refreshBadge(li, { forceToast: true }));
        a.addEventListener("mouseenter", () => {
          const pill = a.querySelector("#" + CSS.escape(LABEL_PILL_ID));
          if (pill) pill.style.filter = "brightness(1.08)";
        });
        a.addEventListener("mouseleave", () => {
          const pill = a.querySelector("#" + CSS.escape(LABEL_PILL_ID));
          if (pill) pill.style.filter = "";
        });
        li.appendChild(a);
        const afterNode = document.getElementById(QT30_BTN_ID) || document.getElementById(QT30_BTN_ID_LEGACY);
        if (afterNode && afterNode.parentNode === actionBarUl) {
          afterNode.parentNode.insertBefore(li, afterNode.nextSibling);
        } else {
          actionBarUl.appendChild(li);
        }
        watchWizardPage(li);
        dlog("QT35: badge injected");
      } catch (e) {
        derror("injectBadge:", e);
      }
    }
    function watchWizardPage(li) {
      const toggle = () => {
        const show = isOnTargetWizardPage();
        li.style.display = show ? "" : "none";
        if (show) refreshBadge(li);
      };
      const list = document.querySelector(".plex-wizard-page-list");
      if (list) {
        const mo = new MutationObserver(toggle);
        mo.observe(list, { childList: true, subtree: true, attributes: true });
        toggle();
      } else {
        toggle();
      }
    }
    function getActiveWizardPageName() {
      const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
      if (activeEl) {
        try {
          const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
          const vm = KO?.dataFor?.(activeEl);
          const name = vm ? TMUtils.getObsValue(vm, "name", { first: true, trim: true }) : "";
          if (name) return name;
        } catch {
        }
      }
      const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
      return (nav?.textContent || "").trim();
    }
    function isOnTargetWizardPage() {
      const nm = getActiveWizardPageName();
      return CFG.SHOW_ON_PAGES_RE.test(String(nm || ""));
    }
    async function ensureWizardVM() {
      const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
      const { viewModel } = await TMUtils.waitForModelAsync(anchor, {
        pollMs: CFG.POLL_MS,
        timeoutMs: CFG.TIMEOUT_MS,
        requireKo: true
      });
      return viewModel;
    }
    function resolveQuoteKeySync() {
      try {
        const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        const grid = document.querySelector(CFG.GRID_SEL);
        const gridVM = grid ? KO?.dataFor?.(grid) : null;
        const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
        const fromGrid = raw0 ? TMUtils.getObsValue(raw0, "QuoteKey") : null;
        if (fromGrid) return fromGrid;
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
        const fromRoot = rootVM && (TMUtils.getObsValue(rootVM, "QuoteKey") || TMUtils.getObsValue(rootVM, "Quote.QuoteKey"));
        if (fromRoot) return fromRoot;
      } catch {
      }
      const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
      return m ? Number(m[1]) : null;
    }
    async function fetchAttachmentCount(quoteKey) {
      const rows = await TMUtils.dsRows(CFG.DS_ATTACHMENTS_BY_QUOTE, {
        Attachment_Group_Key: CFG.ATTACHMENT_GROUP_KEY,
        Record_Key_Value: String(quoteKey)
      });
      return Array.isArray(rows) ? rows.length : 0;
    }
    function setBadge(countOrText) {
      const pill = document.getElementById(LABEL_PILL_ID);
      if (!pill) return;
      if (typeof countOrText === "number") {
        pill.textContent = `Attachments: ${countOrText}`;
        pill.style.background = countOrText > 0 ? "#27ae60" : "#c0392b";
      } else {
        pill.textContent = String(countOrText);
        pill.style.background = "#999";
      }
    }
    let lastQuoteKey = null;
    async function refreshBadge(li, { forceToast = false, ignoreVisibility = false } = {}) {
      try {
        if (!ignoreVisibility && !isOnTargetWizardPage()) return;
        setBadge("Attachments: \u2026");
        await ensureWizardVM();
        const qk = resolveQuoteKeySync();
        if (!qk) {
          setBadge("Attachments: ?");
          if (forceToast) TMUtils.toast("\u26A0\uFE0F Quote Key not found on this page", "warn", 2500);
          return;
        }
        const count = await fetchAttachmentCount(qk);
        setBadge(count);
        lastQuoteKey = qk;
        if (forceToast) {
          TMUtils.toast(
            count > 0 ? `\u2705 ${count} attachment(s)` : "\u26A0\uFE0F No attachments",
            count > 0 ? "success" : "warn",
            2200
          );
        }
        dlog("QT35: attachments", { qk, count });
      } catch (e) {
        TMUtils.toast(`\u274C Attachments refresh failed: ${e.message}`, "error", 5e3);
        derror("refreshBadge:", e);
      }
    }
  })();
})();
