// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.5
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
  // src/quote-tracking/PartCatalogPricingGet/index.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvUGFydENhdGFsb2dQcmljaW5nR2V0L2luZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDMwL2luZGV4LmpzXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbigoKSA9PiB7XG4gICAgLy8gLS0tLS0tLS0tLSBDb25maWcgLS0tLS0tLS0tLVxuICAgIGNvbnN0IENPTkZJRyA9IHtcbiAgICAgICAgRFNfQ2F0YWxvZ0tleUJ5UXVvdGVLZXk6IDMxNTYsXG4gICAgICAgIERTX0JyZWFrcG9pbnRzQnlQYXJ0OiA0ODA5LFxuICAgICAgICB0b2FzdE1zOiAzNTAwLFxuICAgICAgICB3aXphcmRUYXJnZXRQYWdlOiAnUGFydCBTdW1tYXJ5JyxcbiAgICAgICAgc2V0dGluZ3NLZXk6ICdxdDMwX3NldHRpbmdzX3YxJyxcbiAgICAgICAgZGVmYXVsdHM6IHsgZGVsZXRlWmVyb1F0eVJvd3M6IHRydWUsIHVuaXRQcmljZURlY2ltYWxzOiAzLCBlbmFibGVIb3ZlckFmZm9yZGFuY2U6IHRydWUgfSxcbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLSBCb290c3RyYXAgLS0tLS0tLS0tLVxuICAgIGNvbnN0IElTX1RFU1QgPSAvdGVzdFxcLm9uXFwucGxleFxcLmNvbSQvaS50ZXN0KGxvY2F0aW9uLmhvc3RuYW1lKTtcbiAgICBUTVV0aWxzLnNldERlYnVnPy4oSVNfVEVTVCk7XG4gICAgY29uc3QgTCA9IFRNVXRpbHMuZ2V0TG9nZ2VyPy4oJ1FUMzAnKTtcbiAgICBjb25zdCBsb2cgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmxvZz8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IHdhcm4gPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/Lndhcm4/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkgeyBsb2coJ1FUMzA6IHdyb25nIHJvdXRlLCBza2lwcGluZycpOyByZXR1cm47IH1cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgKEdNIHRvbGVyYW50KSAtLS0tLS0tLS0tXG4gICAgY29uc3QgbG9hZFNldHRpbmdzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfTtcbiAgICBjb25zdCBzYXZlU2V0dGluZ3MgPSAobmV4dCkgPT4ge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLSBUb2FzdCAocm9idXN0IGluIERFVikgLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGRldlRvYXN0KG1zZywgbGV2ZWwgPSAnaW5mbycsIG1zID0gQ09ORklHLnRvYXN0TXMpIHtcbiAgICAgICAgdHJ5IHsgVE1VdGlscy50b2FzdD8uKG1zZywgbGV2ZWwsIG1zKTsgaWYgKERFVikgY29uc29sZS5kZWJ1ZygnW1FUMzAgREVWXSB0b2FzdDonLCBsZXZlbCwgbXNnKTsgcmV0dXJuOyB9IGNhdGNoIHsgfVxuICAgICAgICBpZiAoIURFVikgcmV0dXJuO1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBPYmplY3QuYXNzaWduKGVsLnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgcmlnaHQ6ICcxNnB4JywgYm90dG9tOiAnMTZweCcsIHpJbmRleDogMjE0NzQ4MzY0NyxcbiAgICAgICAgICAgIHBhZGRpbmc6ICcxMHB4IDEycHgnLCBib3JkZXJSYWRpdXM6ICc4cHgnLCBib3hTaGFkb3c6ICcwIDZweCAyMHB4IHJnYmEoMCwwLDAsLjI1KScsXG4gICAgICAgICAgICBmb250OiAnMTRweC8xLjMgc3lzdGVtLXVpLCBTZWdvZSBVSSwgQXJpYWwnLCBjb2xvcjogJyNmZmYnLFxuICAgICAgICAgICAgYmFja2dyb3VuZDogbGV2ZWwgPT09ICdzdWNjZXNzJyA/ICcjMWI1ZTIwJyA6IGxldmVsID09PSAnd2FybicgPyAnIzdmNjAwMCcgOiBsZXZlbCA9PT0gJ2Vycm9yJyA/ICcjYjcxYzFjJyA6ICcjNDI0MjQyJyxcbiAgICAgICAgICAgIHdoaXRlU3BhY2U6ICdwcmUtd3JhcCcsIG1heFdpZHRoOiAnMzZjaCdcbiAgICAgICAgfSk7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gU3RyaW5nKG1zZyk7IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpOyBzZXRUaW1lb3V0KCgpID0+IGVsLnJlbW92ZSgpLCBtcyB8fCAzNTAwKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEF1dGggaGVscGVycyAtLS0tLS0tLS0tXG4gICAgYXN5bmMgZnVuY3Rpb24gd2l0aEZyZXNoQXV0aChydW4pIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIGF3YWl0IHJ1bigpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXMgPSBlPy5zdGF0dXMgfHwgKC9cXGIoXFxkezN9KVxcYi8uZXhlYyhlPy5tZXNzYWdlIHx8ICcnKSB8fCBbXSlbMV07XG4gICAgICAgICAgICBpZiAoK3N0YXR1cyA9PT0gNDE5KSB7IGF3YWl0IFRNVXRpbHMuZ2V0QXBpS2V5KHsgZm9yY2U6IHRydWUgfSk7IHJldHVybiBhd2FpdCBydW4oKTsgfVxuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVBdXRoT3JUb2FzdCgpIHtcbiAgICAgICAgdHJ5IHsgY29uc3Qga2V5ID0gYXdhaXQgVE1VdGlscy5nZXRBcGlLZXkoeyB3YWl0OiB0cnVlLCB0aW1lb3V0TXM6IDMwMDAsIHBvbGxNczogMTUwIH0pOyBpZiAoa2V5KSByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IH1cbiAgICAgICAgZGV2VG9hc3QoJ1NpZ24taW4gcmVxdWlyZWQuIFBsZWFzZSBsb2cgaW4sIHRoZW4gY2xpY2sgYWdhaW4uJywgJ3dhcm4nLCA1MDAwKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gSW5qZWN0IFVJIC0tLS0tLS0tLS1cbiAgICBjb25zdCBzdG9wT2JzZXJ2ZSA9IFRNVXRpbHMub2JzZXJ2ZUluc2VydE1hbnk/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKVxuICAgICAgICB8fCBUTVV0aWxzLm9ic2VydmVJbnNlcnQ/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcbiAgICBUTVV0aWxzLm9uVXJsQ2hhbmdlPy4oKCkgPT4ge1xuICAgICAgICBpZiAoIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIHsgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSByZXR1cm47IH1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJykuZm9yRWFjaChpbmplY3RQcmljaW5nQ29udHJvbHMpO1xuICAgIH0pO1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicpLmZvckVhY2goaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcblxuICAgIGZ1bmN0aW9uIGluamVjdFByaWNpbmdDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCF1bCB8fCB1bC5kYXRhc2V0LnF0MzBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDMwSW5qZWN0ZWQgPSAnMSc7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGxpLmlkID0gJ2x0LWFwcGx5LWNhdGFsb2ctcHJpY2luZyc7XG4gICAgICAgICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYS5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBhLnRleHRDb250ZW50ID0gJ0xUIEFwcGx5IENhdGFsb2cgUHJpY2luZyc7XG4gICAgICAgICAgICBhLnRpdGxlID0gJ0NsaWNrIHRvIGFwcGx5IGN1c3RvbWVyIHNwZWNpZmljIGNhdGFsb2cgcHJpY2luZyc7XG4gICAgICAgICAgICBhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdBcHBseSBjYXRhbG9nIHByaWNpbmcnKTtcbiAgICAgICAgICAgIGEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhLnN0eWxlLCB7IGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAnZmlsdGVyIC4xNXMsIHRleHREZWNvcmF0aW9uQ29sb3I6IC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBpZiAoUy5lbmFibGVIb3ZlckFmZm9yZGFuY2UpIHtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGEuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBhLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgYS5zdHlsZS5maWx0ZXIgPSAnJzsgYS5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBhLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnJzsgYS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUFwcGx5Q2xpY2soYSkpO1xuICAgICAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7IHVsLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgICAgIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgQ09ORklHLndpemFyZFRhcmdldFBhZ2UpO1xuICAgICAgICAgICAgbG9nKCdRVDMwOiBidXR0b24gaW5qZWN0ZWQnKTtcbiAgICAgICAgfSBjYXRjaCAoZSkgeyBlcnIoJ1FUMzAgaW5qZWN0OicsIGUpOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd09ubHlPblBhcnRTdW1tYXJ5KGxpLCB0YXJnZXROYW1lKSB7XG4gICAgICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHZtID0gYWN0aXZlRWwgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZUVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gdm0gPyBLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkgOiAnJztcbiAgICAgICAgICAgIGlmIChuYW1lKSByZXR1cm4gU3RyaW5nKG5hbWUpO1xuICAgICAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgdG9nZ2xlID0gKCkgPT4geyBsaS5zdHlsZS5kaXNwbGF5ID0gKGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWUpID8gJycgOiAnbm9uZSc7IH07XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIodG9nZ2xlKS5vYnNlcnZlKG5hdiwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUgfSk7XG4gICAgICAgIHRvZ2dsZSgpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gTWFpbiBoYW5kbGVyIChmdWxseSBwb3J0ZWQpIC0tLS0tLS0tLS1cbiAgICBhc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseUNsaWNrKGJ0bikge1xuICAgICAgICBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgY29uc3QgcmVzdG9yZSA9ICgpID0+IHsgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnJzsgfTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycsIDUwMDApO1xuICAgICAgICAgICAgaWYgKCEoYXdhaXQgZW5zdXJlQXV0aE9yVG9hc3QoKSkpIHRocm93IG5ldyBFcnJvcignTm8gQVBJIGtleS9zZXNzaW9uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgICAgICBpZiAoIWdyaWQpIHRocm93IG5ldyBFcnJvcignR3JpZCBub3QgZm91bmQnKTtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPPy5kYXRhRm9yPy4oZ3JpZCk7XG4gICAgICAgICAgICBjb25zdCByYXcgPSBncmlkVk0/LmRhdGFzb3VyY2U/LnJhdyB8fCBbXTtcbiAgICAgICAgICAgIGlmICghcmF3Lmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdObyByb3dzIGZvdW5kJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyYXdbMF0sICdRdW90ZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoIXF1b3RlS2V5KSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlX0tleSBtaXNzaW5nJyk7XG5cbiAgICAgICAgICAgIC8vIDEpIENhdGFsb2cga2V5XG4gICAgICAgICAgICBkZXZUb2FzdCgnXHUyM0YzIEZldGNoaW5nIENhdGFsb2cgS2V5XHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBUTVV0aWxzLmRzUm93cyhDT05GSUcuRFNfQ2F0YWxvZ0tleUJ5UXVvdGVLZXksIHsgUXVvdGVfS2V5OiBxdW90ZUtleSB9KSk7XG4gICAgICAgICAgICBjb25zdCBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXk7XG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHsgZGV2VG9hc3Qob25lT2YoTk9fQ0FUQUxPR19NRVNTQUdFUyksICd3YXJuJywgNTAwMCk7IHJldHVybjsgfVxuICAgICAgICAgICAgZGV2VG9hc3QoYFx1MjcwNSBDYXRhbG9nIEtleTogJHtjYXRhbG9nS2V5fWAsICdzdWNjZXNzJywgMTgwMCk7XG5cbiAgICAgICAgICAgIC8vIDIpIEJyZWFrcG9pbnRzIGJ5IHBhcnRcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9zID0gWy4uLm5ldyBTZXQocmF3Lm1hcChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkpLmZpbHRlcihCb29sZWFuKSldO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm9zLmxlbmd0aCkgeyBkZXZUb2FzdCgnXHUyNkEwXHVGRTBGIE5vIFBhcnRObyB2YWx1ZXMgZm91bmQnLCAnd2FybicsIDQwMDApOyByZXR1cm47IH1cblxuICAgICAgICAgICAgZGV2VG9hc3QoYFx1MjNGMyBMb2FkaW5nICR7cGFydE5vcy5sZW5ndGh9IHBhcnQocylcdTIwMjZgLCAnaW5mbycpO1xuICAgICAgICAgICAgY29uc3QgcHJpY2VNYXAgPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHBhcnROb3MubWFwKGFzeW5jIChwKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gVE1VdGlscy5kc1Jvd3MoQ09ORklHLkRTX0JyZWFrcG9pbnRzQnlQYXJ0LCB7IENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5LCBDYXRhbG9nX1BhcnRfTm86IHAgfSkpIHx8IFtdO1xuICAgICAgICAgICAgICAgIHByaWNlTWFwW3BdID0gcm93c1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gci5DYXRhbG9nX1BhcnRfTm8gPT09IHAgJiYgbmV3IERhdGUoci5FZmZlY3RpdmVfRGF0ZSkgPD0gbm93ICYmIG5vdyA8PSBuZXcgRGF0ZShyLkV4cGlyYXRpb25fRGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLkJyZWFrcG9pbnRfUXVhbnRpdHkgLSBiLkJyZWFrcG9pbnRfUXVhbnRpdHkpO1xuICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogbG9hZGVkICR7cHJpY2VNYXBbcF0ubGVuZ3RofSBicmVha3BvaW50cyBmb3IgJHtwfWApO1xuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAvLyAzKSBBcHBseSBvciBkZWxldGUgcGVyIHJvd1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBwcmljZXNcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBsb2NhdGlvbi5vcmlnaW47XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAocG9ydGVkKVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPD0gMCAmJiBTLmRlbGV0ZVplcm9RdHlSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVQYXJ0S2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXByID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZVByaWNlS2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgcXBrICYmIHFwcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtiYXNlfS9TYWxlc0FuZENSTS9RdW90ZVBhcnQvRGVsZXRlUXVvdGVQcmljZWAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHF1b3RlS2V5OiBxaywgcXVvdGVQYXJ0S2V5OiBxcGssIHF1b3RlUHJpY2VLZXk6IHFwciB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRldlRvYXN0KHJlcy5vayA/IGBcdUQ4M0RcdURERDEgRGVsZXRlZCByb3dbJHtpfV1gIDogYFx1Mjc0QyBEZWxldGUgZmFpbGVkIHJvd1ske2l9XWAsIHJlcy5vayA/ICdzdWNjZXNzJyA6ICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgRGVsZXRlIGVycm9yIHJvd1ske2l9XWAsICdlcnJvcicsIDYwMDApOyBlcnIoJ1FUMzAgZGVsZXRlIGVycm9yJywgZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcHJpY2VcbiAgICAgICAgICAgICAgICBpZiAocXR5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gcGlja1ByaWNlKHByaWNlTWFwW3BhcnROb10sIHF0eSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicCA9PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlQcmljZVRvUm93KHJvdywgcm91bmQoYnApKTtcbiAgICAgICAgICAgICAgICAgICAgbG9nKGBRVDMwOiByb3dbJHtpfV0gcXR5PSR7cXR5fSBwcmljZT0ke3JvdW5kKGJwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIDQpIFJlZnJlc2ggd2l6YXJkIHNvIFVJIHJlZmxlY3RzIGNoYW5nZXMgKHBvcnRlZClcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnID0gd2l6Lm5hdmlnYXRlUGFnZS5iaW5kKHdpeik7XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZSA9IChwYWdlKSA9PiB7IGNvbnN0IHJldCA9IG9yaWcocGFnZSk7IHNldFRpbWVvdXQoKCkgPT4gZGV2VG9hc3QoJ1x1RDgzQ1x1REY4OSBBbGwgdXBkYXRlZCEnLCAnc3VjY2VzcycpLCA4MDApOyByZXR1cm4gcmV0OyB9O1xuICAgICAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2Uod2l6LmFjdGl2ZVBhZ2UoKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRldlRvYXN0KCdcdUQ4M0NcdURGODkgQWxsIHVwZGF0ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyNzRDICR7ZS5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJywgODAwMCk7IGVycignUVQzMDonLCBlKTtcbiAgICAgICAgfSBmaW5hbGx5IHsgcmVzdG9yZSgpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBwaWNrUHJpY2UoYnBzLCBxdHkpIHtcbiAgICAgICAgaWYgKCFicHM/Lmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChxdHkgPCBicHNbMF0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1swXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBjb25zdCBsYXN0ID0gYnBzW2Jwcy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKHF0eSA+PSBsYXN0LkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBsYXN0LkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnBzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHF0eSA+PSBicHNbaV0uQnJlYWtwb2ludF9RdWFudGl0eSAmJiBxdHkgPCBicHNbaSArIDFdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbaV0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gYXBwbHlQcmljZVRvUm93KHJvdywgcHJpY2UpIHtcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZShyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnLCBwcmljZSk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBNZXNzYWdlcyAocG9ydGVkKSAtLS0tLS0tLS0tXG4gICAgY29uc3QgTk9fQ0FUQUxPR19NRVNTQUdFUyA9IFtcbiAgICAgICAgJ1x1RDgzRFx1REVBQiBObyBjYXRhbG9nIHNlbGVjdGVkIFx1MjAxMyBjYW5ub3QgZmV0Y2ggcHJpY2VzLicsXG4gICAgICAgICdcdTI2QTBcdUZFMEYgTWlzc2luZyBjdXN0b21lciBjYXRhbG9nIFx1MjAxMyBwcmljaW5nIHNraXBwZWQuJyxcbiAgICAgICAgJ1x1RDgzRFx1REQwRCBObyBjYXRhbG9nIGZvdW5kIFx1MjAxMyBwcmljZXMgdW5hdmFpbGFibGUuJyxcbiAgICAgICAgJ1x1Mjc1NyBDYXRhbG9nIG5vdCBzZXQgXHUyMDEzIHBsZWFzZSBwaWNrIGEgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVERUQxIENhbm5vdCBsb2FkIHByaWNlcyB3aXRob3V0IGEgY3VzdG9tZXIgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVEQ0RCIE5vIGNhdGFsb2cga2V5IFx1MjAxMyB1bmFibGUgdG8gbG9va3VwIHByaWNlcy4nLFxuICAgICAgICAnXHUyNkEwXHVGRTBGIFByaWNlcyByZXF1aXJlIGEgY2F0YWxvZyBcdTIwMTMgbm9uZSBjb25maWd1cmVkLicsXG4gICAgICAgICdcdUQ4M0RcdURFQTggTm8gY2F0YWxvZyBkZXRlY3RlZCBcdTIwMTMgc2tpcHBpbmcgcHJpY2UgbG9va3VwLicsXG4gICAgICAgICdcdTIxMzlcdUZFMEYgU2VsZWN0IGEgY2F0YWxvZyBmaXJzdCB0byByZXRyaWV2ZSBwcmljaW5nLicsXG4gICAgICAgICdcdUQ4M0RcdURFNDggTm8gY2F0YWxvZyBjaG9zZW4gXHUyMDEzIGhpZGluZyBwcmljZSBmZXRjaC4nXG4gICAgXTtcbiAgICBjb25zdCBvbmVPZiA9IChhcnIpID0+IGFycltNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnIubGVuZ3RoKV07XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBoYW5kbGVBcHBseUNsaWNrIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLE1BQU0sTUFBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFFekQsR0FBQyxNQUFNO0FBRUgsVUFBTSxTQUFTO0FBQUEsTUFDWCx5QkFBeUI7QUFBQSxNQUN6QixzQkFBc0I7QUFBQSxNQUN0QixTQUFTO0FBQUEsTUFDVCxrQkFBa0I7QUFBQSxNQUNsQixhQUFhO0FBQUEsTUFDYixVQUFVLEVBQUUsbUJBQW1CLE1BQU0sbUJBQW1CLEdBQUcsdUJBQXVCLEtBQUs7QUFBQSxJQUMzRjtBQUdBLFVBQU0sVUFBVSx3QkFBd0IsS0FBSyxTQUFTLFFBQVE7QUFDOUQsWUFBUSxXQUFXLE9BQU87QUFDMUIsVUFBTSxJQUFJLFFBQVEsWUFBWSxNQUFNO0FBQ3BDLFVBQU0sTUFBTSxJQUFJLE1BQU07QUFBRSxVQUFJLE9BQU8sUUFBUyxJQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsSUFBRztBQUM1RCxVQUFNLE9BQU8sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFBRyxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQUc7QUFDOUQsVUFBTSxNQUFNLElBQUksTUFBTTtBQUFFLFVBQUksT0FBTyxRQUFTLElBQUcsUUFBUSxHQUFHLENBQUM7QUFBQSxJQUFHO0FBQzlELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixlQUFlLGFBQWEsS0FBTSxhQUFhLEtBQUssT0FBTztBQUMvRixVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxDQUFDLFFBQVEsYUFBYSxNQUFNLEdBQUc7QUFBRSxVQUFJLDZCQUE2QjtBQUFHO0FBQUEsSUFBUTtBQUdqRixVQUFNLGVBQWUsTUFBTTtBQUN2QixVQUFJO0FBQ0EsY0FBTSxJQUFJLFlBQVksT0FBTyxhQUFhLE9B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
