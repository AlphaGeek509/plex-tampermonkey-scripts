// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.2
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  // src/qt30/main.js
  var DEV = true ? true : !!(globalThis && globalThis.__TM_DEV__);
  (() => {
    const CONFIG = {
      DS_CatalogKeyByQuoteKey: 3156,
      DS_BreakpointsByPart: 4809,
      toastMs: 3500,
      wizardTargetPage: "Part Summary",
      settingsKey: "qt30_settings_v1",
      defaults: { deleteZeroQtyRows: true, unitPriceDecimals: 3, enableHoverAffordance: true }
    };
    const IS_TEST = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST);
    const L = TMUtils.getLogger?.("QT30");
    const log = (...a) => {
      if (DEV || IS_TEST) L?.log?.(...a);
    };
    const warn = (...a) => {
      if (DEV || IS_TEST) L?.warn?.(...a);
    };
    const err = (...a) => {
      if (DEV || IS_TEST) L?.error?.(...a);
    };
    const KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
      log("QT30: wrong route, skipping");
      return;
    }
    const loadSettings = () => {
      try {
        const v = GM_getValue(CONFIG.settingsKey, CONFIG.defaults);
        return typeof v === "string" ? { ...CONFIG.defaults, ...JSON.parse(v) } : { ...CONFIG.defaults, ...v };
      } catch {
        return { ...CONFIG.defaults };
      }
    };
    const saveSettings = (next) => {
      try {
        GM_setValue(CONFIG.settingsKey, next);
      } catch {
        GM_setValue(CONFIG.settingsKey, JSON.stringify(next));
      }
    };
    function devToast(msg, level = "info", ms = CONFIG.toastMs) {
      try {
        TMUtils.toast?.(msg, level, ms);
        if (DEV) console.debug("[QT30 DEV] toast:", level, msg);
        return;
      } catch {
      }
      if (!DEV) return;
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 2147483647,
        padding: "10px 12px",
        borderRadius: "8px",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        font: "14px/1.3 system-ui, Segoe UI, Arial",
        color: "#fff",
        background: level === "success" ? "#1b5e20" : level === "warn" ? "#7f6000" : level === "error" ? "#b71c1c" : "#424242",
        whiteSpace: "pre-wrap",
        maxWidth: "36ch"
      });
      el.textContent = String(msg);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), ms || 3500);
    }
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (e) {
        const status = e?.status || (/\b(\d{3})\b/.exec(e?.message || "") || [])[1];
        if (+status === 419) {
          await TMUtils.getApiKey({ force: true });
          return await run();
        }
        throw e;
      }
    }
    async function ensureAuthOrToast() {
      try {
        const key = await TMUtils.getApiKey({ wait: true, timeoutMs: 3e3, pollMs: 150 });
        if (key) return true;
      } catch {
      }
      devToast("Sign-in required. Please log in, then click again.", "warn", 5e3);
      return false;
    }
    GM_registerMenuCommand?.("QT30 DEV \u2014 Diagnostics", () => devToast(`Route: ${location.pathname}`, "info"));
    GM_registerMenuCommand?.("QT30 DEV \u2014 Reset Settings", () => {
      saveSettings({ ...CONFIG.defaults });
      devToast("QT30 settings reset", "success");
    });
    const stopObserve = TMUtils.observeInsertMany?.("#QuoteWizardSharedActionBar", injectPricingControls) || TMUtils.observeInsert?.("#QuoteWizardSharedActionBar", injectPricingControls);
    TMUtils.onUrlChange?.(() => {
      if (!TMUtils.matchRoute?.(ROUTES)) {
        try {
          stopObserve?.();
        } catch {
        }
        return;
      }
      document.querySelectorAll("#QuoteWizardSharedActionBar").forEach(injectPricingControls);
    });
    document.querySelectorAll("#QuoteWizardSharedActionBar").forEach(injectPricingControls);
    function injectPricingControls(ul) {
      try {
        if (!ul || ul.dataset.qt30Injected) return;
        ul.dataset.qt30Injected = "1";
        const li = document.createElement("li");
        li.id = "lt-apply-catalog-pricing";
        li.style.display = "none";
        const a = document.createElement("a");
        a.href = "javascript:void(0)";
        a.textContent = "LT Apply Catalog Pricing";
        a.title = "Click to apply customer specific catalog pricing";
        a.setAttribute("aria-label", "Apply catalog pricing");
        a.setAttribute("role", "button");
        Object.assign(a.style, { cursor: "pointer", transition: "filter .15s, textDecorationColor: .15s" });
        const S = loadSettings();
        if (S.enableHoverAffordance) {
          a.addEventListener("mouseenter", () => {
            a.style.filter = "brightness(1.08)";
            a.style.textDecoration = "underline";
          });
          a.addEventListener("mouseleave", () => {
            a.style.filter = "";
            a.style.textDecoration = "";
          });
          a.addEventListener("focus", () => {
            a.style.outline = "2px solid #4a90e2";
            a.style.outlineOffset = "2px";
          });
          a.addEventListener("blur", () => {
            a.style.outline = "";
            a.style.outlineOffset = "";
          });
        }
        a.addEventListener("click", () => handleApplyClick(a));
        li.appendChild(a);
        ul.appendChild(li);
        showOnlyOnPartSummary(li, CONFIG.wizardTargetPage);
        log("QT30: button injected");
      } catch (e) {
        err("QT30 inject:", e);
      }
    }
    function showOnlyOnPartSummary(li, targetName) {
      const getActiveWizardPageName = () => {
        const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
        const vm = activeEl ? KO?.dataFor?.(activeEl) : null;
        const name = vm ? KO?.unwrap?.(vm.name) ?? (typeof vm.name === "function" ? vm.name() : vm.name) : "";
        if (name) return String(name);
        const nav2 = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
        return (nav2?.textContent || "").trim();
      };
      const toggle = () => {
        li.style.display = getActiveWizardPageName() === targetName ? "" : "none";
      };
      const nav = document.querySelector(".plex-wizard-page-list");
      if (nav) new MutationObserver(toggle).observe(nav, { childList: true, subtree: true, attributes: true });
      toggle();
    }
    async function handleApplyClick(btn) {
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.5";
      const restore = () => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      };
      try {
        devToast("\u23F3 Applying catalog pricing\u2026", "info", 5e3);
        if (!await ensureAuthOrToast()) throw new Error("No API key/session");
        const grid = document.querySelector(".plex-grid");
        if (!grid) throw new Error("Grid not found");
        const gridVM = KO?.dataFor?.(grid);
        const raw = gridVM?.datasource?.raw || [];
        if (!raw.length) throw new Error("No rows found");
        const quoteKey = TMUtils.getObsValue(raw[0], "QuoteKey", { first: true, trim: true });
        if (!quoteKey) throw new Error("Quote_Key missing");
        devToast("\u23F3 Fetching Catalog Key\u2026", "info");
        const rows1 = await withFreshAuth(() => TMUtils.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: quoteKey }));
        const catalogKey = rows1?.[0]?.Catalog_Key;
        if (!catalogKey) {
          devToast(oneOf(NO_CATALOG_MESSAGES), "warn", 5e3);
          return;
        }
        devToast(`\u2705 Catalog Key: ${catalogKey}`, "success", 1800);
        const now = /* @__PURE__ */ new Date();
        const partNos = [...new Set(raw.map((r) => TMUtils.getObsValue(r, "PartNo", { first: true, trim: true })).filter(Boolean))];
        if (!partNos.length) {
          devToast("\u26A0\uFE0F No PartNo values found", "warn", 4e3);
          return;
        }
        devToast(`\u23F3 Loading ${partNos.length} part(s)\u2026`, "info");
        const priceMap = {};
        await Promise.all(partNos.map(async (p) => {
          const rows = await withFreshAuth(() => TMUtils.dsRows(CONFIG.DS_BreakpointsByPart, { Catalog_Key: catalogKey, Catalog_Part_No: p })) || [];
          priceMap[p] = rows.filter((r) => r.Catalog_Part_No === p && new Date(r.Effective_Date) <= now && now <= new Date(r.Expiration_Date)).sort((a, b) => a.Breakpoint_Quantity - b.Breakpoint_Quantity);
          log(`QT30: loaded ${priceMap[p].length} breakpoints for ${p}`);
        }));
        devToast("\u23F3 Applying prices\u2026", "info");
        const S = loadSettings();
        const round = (n) => +(+n).toFixed(S.unitPriceDecimals);
        const base = location.origin;
        for (let i = 0; i < raw.length; i++) {
          const row = raw[i];
          const qty = +(TMUtils.getObsValue(row, "Quantity", { first: true, trim: true }) || 0);
          if (qty <= 0 && S.deleteZeroQtyRows) {
            const qk = TMUtils.getObsValue(row, "QuoteKey", { first: true, trim: true });
            const qpk = TMUtils.getObsValue(row, "QuotePartKey", { first: true, trim: true });
            const qpr = TMUtils.getObsValue(row, "QuotePriceKey", { first: true, trim: true });
            if (qk && qpk && qpr) {
              try {
                const res = await fetch(`${base}/SalesAndCRM/QuotePart/DeleteQuotePrice`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ quoteKey: qk, quotePartKey: qpk, quotePriceKey: qpr })
                });
                devToast(res.ok ? `\u{1F5D1} Deleted row[${i}]` : `\u274C Delete failed row[${i}]`, res.ok ? "success" : "error");
              } catch (e) {
                devToast(`\u274C Delete error row[${i}]`, "error", 6e3);
                err("QT30 delete error", e);
              }
            }
            continue;
          }
          if (qty > 0) {
            const partNo = TMUtils.getObsValue(row, "PartNo", { first: true, trim: true });
            const bp = pickPrice(priceMap[partNo], qty);
            if (bp == null) continue;
            applyPriceToRow(row, round(bp));
            log(`QT30: row[${i}] qty=${qty} price=${round(bp)}`);
          }
        }
        const wiz = unsafeWindow.plex?.currentPage?.QuoteWizard;
        if (wiz?.navigatePage) {
          const orig = wiz.navigatePage.bind(wiz);
          wiz.navigatePage = (page) => {
            const ret = orig(page);
            setTimeout(() => devToast("\u{1F389} All updated!", "success"), 800);
            return ret;
          };
          wiz.navigatePage(wiz.activePage());
        } else {
          devToast("\u{1F389} All updated!", "success");
        }
      } catch (e) {
        devToast(`\u274C ${e.message || e}`, "error", 8e3);
        err("QT30:", e);
      } finally {
        restore();
      }
    }
    function pickPrice(bps, qty) {
      if (!bps?.length) return null;
      if (qty < bps[0].Breakpoint_Quantity) return bps[0].Breakpoint_Price;
      const last = bps[bps.length - 1];
      if (qty >= last.Breakpoint_Quantity) return last.Breakpoint_Price;
      for (let i = 0; i < bps.length - 1; i++) {
        if (qty >= bps[i].Breakpoint_Quantity && qty < bps[i + 1].Breakpoint_Quantity) return bps[i].Breakpoint_Price;
      }
      return null;
    }
    function applyPriceToRow(row, price) {
      TMUtils.setObsValue(row, "RvCustomizedUnitPrice", price);
    }
    const NO_CATALOG_MESSAGES = [
      "\u{1F6AB} No catalog selected \u2013 cannot fetch prices.",
      "\u26A0\uFE0F Missing customer catalog \u2013 pricing skipped.",
      "\u{1F50D} No catalog found \u2013 prices unavailable.",
      "\u2757 Catalog not set \u2013 please pick a catalog.",
      "\u{1F6D1} Cannot load prices without a customer catalog.",
      "\u{1F4DB} No catalog key \u2013 unable to lookup prices.",
      "\u26A0\uFE0F Prices require a catalog \u2013 none configured.",
      "\u{1F6A8} No catalog detected \u2013 skipping price lookup.",
      "\u2139\uFE0F Select a catalog first to retrieve pricing.",
      "\u{1F648} No catalog chosen \u2013 hiding price fetch."
    ];
    const oneOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (DEV && typeof window !== "undefined") {
      window.__QT30__ = { pickPrice, applyPriceToRow, handleApplyClick };
    }
  })();
})();
