// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.7
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
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
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  // src/quote-tracking/qt30-catalogPricing/index.js
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
    const hasDataCore = !!(lt?.core?.data?.createDataContext && lt?.core?.data?.RepoBase?.value);
    class QuoteRepo extends (hasDataCore ? lt.core.data.RepoBase.value : class {
    }) {
      constructor(base) {
        super({ ...base, entity: "quote" });
      }
      async get() {
        return hasDataCore ? this.read("current") : null;
      }
      async set(m) {
        return hasDataCore ? this.write("current", m) : m;
      }
      async update(patch) {
        if (!hasDataCore) return patch;
        const prev = await this.get() ?? {};
        const next = { ...prev, ...patch, Updated_At: Date.now() };
        return this.write("current", next);
      }
    }
    let ctx = null, quoteRepo = null, lastScope = null;
    async function ensureRepoForQuote(qk) {
      if (!hasDataCore) return null;
      if (!ctx || lastScope !== qk) {
        ctx = lt.core.data.createDataContext({ ns: "QT", scopeKey: String(qk), persist: "session", ttlMs: 3e3 });
        quoteRepo = ctx.makeRepo(QuoteRepo);
        lastScope = qk;
      }
      return quoteRepo;
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
    async function ensureAuthOrToast() {
      try {
        const key = await lt.core.auth.getKey();
        if (key) return true;
      } catch {
      }
      devToast("Sign-in required. Please log in, then click again.", "warn", 5e3);
      return false;
    }
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (e) {
        const status = +(e?.status || (/\b(\d{3})\b/.exec(e?.message || "") || [])[1] || 0);
        if (status === 419) {
          try {
            await TMUtils.getApiKey?.({ force: true });
          } catch {
          }
          return await run();
        }
        throw e;
      }
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
        await ensureRepoForQuote(quoteKey);
        let catalogKey = (await quoteRepo?.get())?.Catalog_Key;
        if (!catalogKey) {
          devToast("\u23F3 Fetching Catalog Key\u2026", "info");
          const rows1 = await withFreshAuth(
            () => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: quoteKey })
          );
          catalogKey = rows1?.[0]?.Catalog_Key || null;
          if (catalogKey) await quoteRepo?.update({ Quote_Key: quoteKey, Catalog_Key: catalogKey });
        }
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
          const rows = await withFreshAuth(
            () => lt.core.plex.dsRows(CONFIG.DS_BreakpointsByPart, { Catalog_Key: catalogKey, Catalog_Part_No: p })
          ) || [];
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
                const res = await lt.core.http.post("/SalesAndCRM/QuotePart/DeleteQuotePrice", {
                  quoteKey: qk,
                  quotePartKey: qpk,
                  quotePriceKey: qpr
                });
                const ok = res?.ok === true || res?.status >= 200 && res?.status < 300;
                devToast(ok ? `\u{1F5D1} Deleted row[${i}]` : `\u274C Delete failed row[${i}]`, ok ? "success" : "error");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gdG0tc2NyaXB0cy9zcmMvcXQzMC9pbmRleC5qc1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG4oKCkgPT4ge1xuICAgIC8vIC0tLS0tLS0tLS0gQ29uZmlnIC0tLS0tLS0tLS1cbiAgICBjb25zdCBDT05GSUcgPSB7XG4gICAgICAgIERTX0NhdGFsb2dLZXlCeVF1b3RlS2V5OiAzMTU2LFxuICAgICAgICBEU19CcmVha3BvaW50c0J5UGFydDogNDgwOSxcbiAgICAgICAgdG9hc3RNczogMzUwMCxcbiAgICAgICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIGRlZmF1bHRzOiB7IGRlbGV0ZVplcm9RdHlSb3dzOiB0cnVlLCB1bml0UHJpY2VEZWNpbWFsczogMywgZW5hYmxlSG92ZXJBZmZvcmRhbmNlOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCB3YXJuID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy53YXJuPy4oLi4uYSk7IH07XG4gICAgY29uc3QgZXJyID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5lcnJvcj8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBpZiAoIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIHsgbG9nKCdRVDMwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcnKTsgcmV0dXJuOyB9XG5cblxuICAgIC8vID09PT09IFF1b3RlUmVwbyB2aWEgbHQtZGF0YS1jb3JlIChzY29wZWQgcGVyIHRhYiArIHF1b3RlKSA9PT09PVxuICAgIGNvbnN0IGhhc0RhdGFDb3JlID0gISEobHQ/LmNvcmU/LmRhdGE/LmNyZWF0ZURhdGFDb250ZXh0ICYmIGx0Py5jb3JlPy5kYXRhPy5SZXBvQmFzZT8udmFsdWUpO1xuXG4gICAgY2xhc3MgUXVvdGVSZXBvIGV4dGVuZHMgKGhhc0RhdGFDb3JlID8gbHQuY29yZS5kYXRhLlJlcG9CYXNlLnZhbHVlIDogY2xhc3MgeyB9KSB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGJhc2UpIHsgc3VwZXIoeyAuLi5iYXNlLCBlbnRpdHk6ICdxdW90ZScgfSk7IH1cbiAgICAgICAgYXN5bmMgZ2V0KCkgeyByZXR1cm4gaGFzRGF0YUNvcmUgPyB0aGlzLnJlYWQoJ2N1cnJlbnQnKSA6IG51bGw7IH1cbiAgICAgICAgYXN5bmMgc2V0KG0pIHsgcmV0dXJuIGhhc0RhdGFDb3JlID8gdGhpcy53cml0ZSgnY3VycmVudCcsIG0pIDogbTsgfVxuICAgICAgICBhc3luYyB1cGRhdGUocGF0Y2gpIHtcbiAgICAgICAgICAgIGlmICghaGFzRGF0YUNvcmUpIHJldHVybiBwYXRjaDtcbiAgICAgICAgICAgIGNvbnN0IHByZXYgPSAoYXdhaXQgdGhpcy5nZXQoKSkgPz8ge307XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0geyAuLi5wcmV2LCAuLi5wYXRjaCwgVXBkYXRlZF9BdDogRGF0ZS5ub3coKSB9O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMud3JpdGUoJ2N1cnJlbnQnLCBuZXh0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBjdHggPSBudWxsLCBxdW90ZVJlcG8gPSBudWxsLCBsYXN0U2NvcGUgPSBudWxsO1xuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIWhhc0RhdGFDb3JlKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFjdHggfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY3R4ID0gbHQuY29yZS5kYXRhLmNyZWF0ZURhdGFDb250ZXh0KHsgbnM6ICdRVCcsIHNjb3BlS2V5OiBTdHJpbmcocWspLCBwZXJzaXN0OiAnc2Vzc2lvbicsIHR0bE1zOiAzMDAwIH0pO1xuICAgICAgICAgICAgcXVvdGVSZXBvID0gY3R4Lm1ha2VSZXBvKFF1b3RlUmVwbyk7XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuXG4gICAgLy8gLS0tLS0tLS0tLSBTZXR0aW5ncyAoR00gdG9sZXJhbnQpIC0tLS0tLS0tLS1cbiAgICBjb25zdCBsb2FkU2V0dGluZ3MgPSAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBDT05GSUcuZGVmYXVsdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi5KU09OLnBhcnNlKHYpIH0gOiB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4udiB9O1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgLi4uQ09ORklHLmRlZmF1bHRzIH07IH1cbiAgICB9O1xuICAgIGNvbnN0IHNhdmVTZXR0aW5ncyA9IChuZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgbmV4dCk7IH1cbiAgICAgICAgY2F0Y2ggeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIEpTT04uc3RyaW5naWZ5KG5leHQpKTsgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRvYXN0IChyb2J1c3QgaW4gREVWKSAtLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZGV2VG9hc3QobXNnLCBsZXZlbCA9ICdpbmZvJywgbXMgPSBDT05GSUcudG9hc3RNcykge1xuICAgICAgICB0cnkgeyBUTVV0aWxzLnRvYXN0Py4obXNnLCBsZXZlbCwgbXMpOyBpZiAoREVWKSBjb25zb2xlLmRlYnVnKCdbUVQzMCBERVZdIHRvYXN0OicsIGxldmVsLCBtc2cpOyByZXR1cm47IH0gY2F0Y2ggeyB9XG4gICAgICAgIGlmICghREVWKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZWwuc3R5bGUsIHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCByaWdodDogJzE2cHgnLCBib3R0b206ICcxNnB4JywgekluZGV4OiAyMTQ3NDgzNjQ3LFxuICAgICAgICAgICAgcGFkZGluZzogJzEwcHggMTJweCcsIGJvcmRlclJhZGl1czogJzhweCcsIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwuMjUpJyxcbiAgICAgICAgICAgIGZvbnQ6ICcxNHB4LzEuMyBzeXN0ZW0tdWksIFNlZ29lIFVJLCBBcmlhbCcsIGNvbG9yOiAnI2ZmZicsXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsZXZlbCA9PT0gJ3N1Y2Nlc3MnID8gJyMxYjVlMjAnIDogbGV2ZWwgPT09ICd3YXJuJyA/ICcjN2Y2MDAwJyA6IGxldmVsID09PSAnZXJyb3InID8gJyNiNzFjMWMnIDogJyM0MjQyNDInLFxuICAgICAgICAgICAgd2hpdGVTcGFjZTogJ3ByZS13cmFwJywgbWF4V2lkdGg6ICczNmNoJ1xuICAgICAgICB9KTtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBTdHJpbmcobXNnKTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7IHNldFRpbWVvdXQoKCkgPT4gZWwucmVtb3ZlKCksIG1zIHx8IDM1MDApO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gQXV0aCBoZWxwZXJzIC0tLS0tLS0tLS1cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVBdXRoT3JUb2FzdCgpIHtcbiAgICAgICAgdHJ5IHsgY29uc3Qga2V5ID0gYXdhaXQgbHQuY29yZS5hdXRoLmdldEtleSgpOyBpZiAoa2V5KSByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IH1cbiAgICAgICAgZGV2VG9hc3QoJ1NpZ24taW4gcmVxdWlyZWQuIFBsZWFzZSBsb2cgaW4sIHRoZW4gY2xpY2sgYWdhaW4uJywgJ3dhcm4nLCA1MDAwKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHdpdGhGcmVzaEF1dGgocnVuKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBhd2FpdCBydW4oKTsgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gKyhlPy5zdGF0dXMgfHwgKC9cXGIoXFxkezN9KVxcYi8uZXhlYyhlPy5tZXNzYWdlIHx8ICcnKSB8fCBbXSlbMV0gfHwgMCk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSA0MTkpIHsgdHJ5IHsgYXdhaXQgVE1VdGlscy5nZXRBcGlLZXk/Lih7IGZvcmNlOiB0cnVlIH0pOyB9IGNhdGNoIHsgfSByZXR1cm4gYXdhaXQgcnVuKCk7IH1cbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gSW5qZWN0IFVJIC0tLS0tLS0tLS1cbiAgICBjb25zdCBzdG9wT2JzZXJ2ZSA9IFRNVXRpbHMub2JzZXJ2ZUluc2VydE1hbnk/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKVxuICAgICAgICB8fCBUTVV0aWxzLm9ic2VydmVJbnNlcnQ/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcbiAgICBUTVV0aWxzLm9uVXJsQ2hhbmdlPy4oKCkgPT4ge1xuICAgICAgICBpZiAoIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIHsgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSByZXR1cm47IH1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJykuZm9yRWFjaChpbmplY3RQcmljaW5nQ29udHJvbHMpO1xuICAgIH0pO1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicpLmZvckVhY2goaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcblxuICAgIGZ1bmN0aW9uIGluamVjdFByaWNpbmdDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCF1bCB8fCB1bC5kYXRhc2V0LnF0MzBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDMwSW5qZWN0ZWQgPSAnMSc7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGxpLmlkID0gJ2x0LWFwcGx5LWNhdGFsb2ctcHJpY2luZyc7XG4gICAgICAgICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYS5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBhLnRleHRDb250ZW50ID0gJ0xUIEFwcGx5IENhdGFsb2cgUHJpY2luZyc7XG4gICAgICAgICAgICBhLnRpdGxlID0gJ0NsaWNrIHRvIGFwcGx5IGN1c3RvbWVyIHNwZWNpZmljIGNhdGFsb2cgcHJpY2luZyc7XG4gICAgICAgICAgICBhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdBcHBseSBjYXRhbG9nIHByaWNpbmcnKTtcbiAgICAgICAgICAgIGEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhLnN0eWxlLCB7IGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAnZmlsdGVyIC4xNXMsIHRleHREZWNvcmF0aW9uQ29sb3I6IC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBpZiAoUy5lbmFibGVIb3ZlckFmZm9yZGFuY2UpIHtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGEuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBhLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgYS5zdHlsZS5maWx0ZXIgPSAnJzsgYS5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBhLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnJzsgYS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUFwcGx5Q2xpY2soYSkpO1xuICAgICAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7IHVsLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgICAgIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgQ09ORklHLndpemFyZFRhcmdldFBhZ2UpO1xuICAgICAgICAgICAgbG9nKCdRVDMwOiBidXR0b24gaW5qZWN0ZWQnKTtcbiAgICAgICAgfSBjYXRjaCAoZSkgeyBlcnIoJ1FUMzAgaW5qZWN0OicsIGUpOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd09ubHlPblBhcnRTdW1tYXJ5KGxpLCB0YXJnZXROYW1lKSB7XG4gICAgICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHZtID0gYWN0aXZlRWwgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZUVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gdm0gPyBLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkgOiAnJztcbiAgICAgICAgICAgIGlmIChuYW1lKSByZXR1cm4gU3RyaW5nKG5hbWUpO1xuICAgICAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgdG9nZ2xlID0gKCkgPT4geyBsaS5zdHlsZS5kaXNwbGF5ID0gKGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWUpID8gJycgOiAnbm9uZSc7IH07XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIodG9nZ2xlKS5vYnNlcnZlKG5hdiwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUgfSk7XG4gICAgICAgIHRvZ2dsZSgpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gTWFpbiBoYW5kbGVyIChmdWxseSBwb3J0ZWQpIC0tLS0tLS0tLS1cbiAgICBhc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseUNsaWNrKGJ0bikge1xuICAgICAgICBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgY29uc3QgcmVzdG9yZSA9ICgpID0+IHsgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnJzsgfTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycsIDUwMDApO1xuICAgICAgICAgICAgaWYgKCEoYXdhaXQgZW5zdXJlQXV0aE9yVG9hc3QoKSkpIHRocm93IG5ldyBFcnJvcignTm8gQVBJIGtleS9zZXNzaW9uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgICAgICBpZiAoIWdyaWQpIHRocm93IG5ldyBFcnJvcignR3JpZCBub3QgZm91bmQnKTtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPPy5kYXRhRm9yPy4oZ3JpZCk7XG4gICAgICAgICAgICBjb25zdCByYXcgPSBncmlkVk0/LmRhdGFzb3VyY2U/LnJhdyB8fCBbXTtcbiAgICAgICAgICAgIGlmICghcmF3Lmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdObyByb3dzIGZvdW5kJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyYXdbMF0sICdRdW90ZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoIXF1b3RlS2V5KSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlX0tleSBtaXNzaW5nJyk7XG5cbiAgICAgICAgICAgIC8vIDEpIENhdGFsb2cga2V5IChyZXBvLWNhY2hlZClcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSk7XG4gICAgICAgICAgICBsZXQgY2F0YWxvZ0tleSA9IChhd2FpdCBxdW90ZVJlcG8/LmdldCgpKT8uQ2F0YWxvZ19LZXk7XG5cbiAgICAgICAgICAgIGlmICghY2F0YWxvZ0tleSkge1xuICAgICAgICAgICAgICAgIGRldlRvYXN0KCdcdTIzRjMgRmV0Y2hpbmcgQ2F0YWxvZyBLZXlcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PlxuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19DYXRhbG9nS2V5QnlRdW90ZUtleSwgeyBRdW90ZV9LZXk6IHF1b3RlS2V5IH0pXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSkgYXdhaXQgcXVvdGVSZXBvPy51cGRhdGUoeyBRdW90ZV9LZXk6IHF1b3RlS2V5LCBDYXRhbG9nX0tleTogY2F0YWxvZ0tleSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7IGRldlRvYXN0KG9uZU9mKE5PX0NBVEFMT0dfTUVTU0FHRVMpLCAnd2FybicsIDUwMDApOyByZXR1cm47IH1cbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3MDUgQ2F0YWxvZyBLZXk6ICR7Y2F0YWxvZ0tleX1gLCAnc3VjY2VzcycsIDE4MDApO1xuXG4gICAgICAgICAgICAvLyAyKSBCcmVha3BvaW50cyBieSBwYXJ0XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgY29uc3QgcGFydE5vcyA9IFsuLi5uZXcgU2V0KHJhdy5tYXAociA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdQYXJ0Tm8nLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pKS5maWx0ZXIoQm9vbGVhbikpXTtcbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgZGV2VG9hc3QoJ1x1MjZBMFx1RkUwRiBObyBQYXJ0Tm8gdmFsdWVzIGZvdW5kJywgJ3dhcm4nLCA0MDAwKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTIzRjMgTG9hZGluZyAke3BhcnROb3MubGVuZ3RofSBwYXJ0KHMpXHUyMDI2YCwgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IHByaWNlTWFwID0ge307XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChwYXJ0Tm9zLm1hcChhc3luYyAocCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0JyZWFrcG9pbnRzQnlQYXJ0LCB7IENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5LCBDYXRhbG9nX1BhcnRfTm86IHAgfSlcbiAgICAgICAgICAgICAgICApIHx8IFtdO1xuICAgICAgICAgICAgICAgIHByaWNlTWFwW3BdID0gcm93c1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gci5DYXRhbG9nX1BhcnRfTm8gPT09IHAgJiYgbmV3IERhdGUoci5FZmZlY3RpdmVfRGF0ZSkgPD0gbm93ICYmIG5vdyA8PSBuZXcgRGF0ZShyLkV4cGlyYXRpb25fRGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLkJyZWFrcG9pbnRfUXVhbnRpdHkgLSBiLkJyZWFrcG9pbnRfUXVhbnRpdHkpO1xuICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogbG9hZGVkICR7cHJpY2VNYXBbcF0ubGVuZ3RofSBicmVha3BvaW50cyBmb3IgJHtwfWApO1xuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAvLyAzKSBBcHBseSBvciBkZWxldGUgcGVyIHJvd1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBwcmljZXNcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBsb2NhdGlvbi5vcmlnaW47XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAocG9ydGVkKVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPD0gMCAmJiBTLmRlbGV0ZVplcm9RdHlSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVQYXJ0S2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXByID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZVByaWNlS2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgcXBrICYmIHFwcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBsdC5jb3JlLmh0dHAucG9zdCgnL1NhbGVzQW5kQ1JNL1F1b3RlUGFydC9EZWxldGVRdW90ZVByaWNlJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBxdW90ZUtleTogcWssIHF1b3RlUGFydEtleTogcXBrLCBxdW90ZVByaWNlS2V5OiBxcHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvayA9IChyZXM/Lm9rID09PSB0cnVlKSB8fCAocmVzPy5zdGF0dXMgPj0gMjAwICYmIHJlcz8uc3RhdHVzIDwgMzAwKTsgLy8gVE1VdGlscy5mZXRjaERhdGEgcmV0dXJucyBib2R5OyBmYWxsYmFjayBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXZUb2FzdChvayA/IGBcdUQ4M0RcdURERDEgRGVsZXRlZCByb3dbJHtpfV1gIDogYFx1Mjc0QyBEZWxldGUgZmFpbGVkIHJvd1ske2l9XWAsIG9rID8gJ3N1Y2Nlc3MnIDogJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV2VG9hc3QoYFx1Mjc0QyBEZWxldGUgZXJyb3Igcm93WyR7aX1dYCwgJ2Vycm9yJywgNjAwMCk7IGVycignUVQzMCBkZWxldGUgZXJyb3InLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwcmljZVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUGFydE5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnAgPSBwaWNrUHJpY2UocHJpY2VNYXBbcGFydE5vXSwgcXR5KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJwID09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBhcHBseVByaWNlVG9Sb3cocm93LCByb3VuZChicCkpO1xuICAgICAgICAgICAgICAgICAgICBsb2coYFFUMzA6IHJvd1ske2l9XSBxdHk9JHtxdHl9IHByaWNlPSR7cm91bmQoYnApfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gNCkgUmVmcmVzaCB3aXphcmQgc28gVUkgcmVmbGVjdHMgY2hhbmdlcyAocG9ydGVkKVxuICAgICAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWcgPSB3aXoubmF2aWdhdGVQYWdlLmJpbmQod2l6KTtcbiAgICAgICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlID0gKHBhZ2UpID0+IHsgY29uc3QgcmV0ID0gb3JpZyhwYWdlKTsgc2V0VGltZW91dCgoKSA9PiBkZXZUb2FzdCgnXHVEODNDXHVERjg5IEFsbCB1cGRhdGVkIScsICdzdWNjZXNzJyksIDgwMCk7IHJldHVybiByZXQ7IH07XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZSh3aXouYWN0aXZlUGFnZSgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGV2VG9hc3QoJ1x1RDgzQ1x1REY4OSBBbGwgdXBkYXRlZCEnLCAnc3VjY2VzcycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgJHtlLm1lc3NhZ2UgfHwgZX1gLCAnZXJyb3InLCA4MDAwKTsgZXJyKCdRVDMwOicsIGUpO1xuICAgICAgICB9IGZpbmFsbHkgeyByZXN0b3JlKCk7IH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEhlbHBlcnMgLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIHBpY2tQcmljZShicHMsIHF0eSkge1xuICAgICAgICBpZiAoIWJwcz8ubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKHF0eSA8IGJwc1swXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzWzBdLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBicHNbYnBzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAocXR5ID49IGxhc3QuQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGxhc3QuQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocXR5ID49IGJwc1tpXS5CcmVha3BvaW50X1F1YW50aXR5ICYmIHF0eSA8IGJwc1tpICsgMV0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1tpXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhcHBseVByaWNlVG9Sb3cocm93LCBwcmljZSkge1xuICAgICAgICBUTVV0aWxzLnNldE9ic1ZhbHVlKHJvdywgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScsIHByaWNlKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIE1lc3NhZ2VzIChwb3J0ZWQpIC0tLS0tLS0tLS1cbiAgICBjb25zdCBOT19DQVRBTE9HX01FU1NBR0VTID0gW1xuICAgICAgICAnXHVEODNEXHVERUFCIE5vIGNhdGFsb2cgc2VsZWN0ZWQgXHUyMDEzIGNhbm5vdCBmZXRjaCBwcmljZXMuJyxcbiAgICAgICAgJ1x1MjZBMFx1RkUwRiBNaXNzaW5nIGN1c3RvbWVyIGNhdGFsb2cgXHUyMDEzIHByaWNpbmcgc2tpcHBlZC4nLFxuICAgICAgICAnXHVEODNEXHVERDBEIE5vIGNhdGFsb2cgZm91bmQgXHUyMDEzIHByaWNlcyB1bmF2YWlsYWJsZS4nLFxuICAgICAgICAnXHUyNzU3IENhdGFsb2cgbm90IHNldCBcdTIwMTMgcGxlYXNlIHBpY2sgYSBjYXRhbG9nLicsXG4gICAgICAgICdcdUQ4M0RcdURFRDEgQ2Fubm90IGxvYWQgcHJpY2VzIHdpdGhvdXQgYSBjdXN0b21lciBjYXRhbG9nLicsXG4gICAgICAgICdcdUQ4M0RcdURDREIgTm8gY2F0YWxvZyBrZXkgXHUyMDEzIHVuYWJsZSB0byBsb29rdXAgcHJpY2VzLicsXG4gICAgICAgICdcdTI2QTBcdUZFMEYgUHJpY2VzIHJlcXVpcmUgYSBjYXRhbG9nIFx1MjAxMyBub25lIGNvbmZpZ3VyZWQuJyxcbiAgICAgICAgJ1x1RDgzRFx1REVBOCBObyBjYXRhbG9nIGRldGVjdGVkIFx1MjAxMyBza2lwcGluZyBwcmljZSBsb29rdXAuJyxcbiAgICAgICAgJ1x1MjEzOVx1RkUwRiBTZWxlY3QgYSBjYXRhbG9nIGZpcnN0IHRvIHJldHJpZXZlIHByaWNpbmcuJyxcbiAgICAgICAgJ1x1RDgzRFx1REU0OCBObyBjYXRhbG9nIGNob3NlbiBcdTIwMTMgaGlkaW5nIHByaWNlIGZldGNoLidcbiAgICBdO1xuICAgIGNvbnN0IG9uZU9mID0gKGFycikgPT4gYXJyW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGFyci5sZW5ndGgpXTtcblxuICAgIC8vIC0tLS0tLS0tLS0gVGlueSBERVYgdGVzdCBzZWFtIC0tLS0tLS0tLS1cbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMzBfXyA9IHsgcGlja1ByaWNlLCBhcHBseVByaWNlVG9Sb3csIGhhbmRsZUFwcGx5Q2xpY2sgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsTUFBTTtBQUVILFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEs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
