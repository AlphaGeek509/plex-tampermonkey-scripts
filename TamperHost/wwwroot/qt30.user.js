// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.16
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
  // src/quote-tracking/qt30-catalogPricingApply/qt30.index.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  (() => {
    const CONFIG = {
      DS_CatalogKeyByQuoteKey: 3156,
      DS_BreakpointsByPart: 4809,
      GRID_SEL: ".plex-grid-content",
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
    if (!ROUTES.some((rx) => rx.test(location.pathname))) {
      log("QT30: wrong route, skipping");
      return;
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
      if (!qk) return null;
      if (!quoteRepo || lastScope !== qk) {
        const { repo } = (await getQT()).use(Number(qk));
        await repo.ensureFromLegacyIfMissing();
        quoteRepo = repo;
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
      if (!ROUTES.some((rx) => rx.test(location.pathname))) {
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
        const quoteKey = getQuoteKeyDeterministic();
        if (!quoteKey) throw new Error("Quote_Key missing");
        await ensureRepoForQuote(quoteKey);
        const header = await quoteRepo.getHeader();
        let catalogKey = TMUtils.getObsValue(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;
        if (!catalogKey) {
          devToast("\u23F3 Fetching Catalog Key\u2026", "info");
          const rows1 = await withFreshAuth(
            () => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: quoteKey })
          );
          catalogKey = rows1?.[0]?.Catalog_Key || null;
          if (catalogKey) await quoteRepo.patchHeader({ Quote_Key: Number(quoteKey), Catalog_Key: Number(catalogKey) });
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
    function getQuoteKeyDeterministic() {
      try {
        const grid = document.querySelector(CONFIG.GRID_SEL);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZC1jb250ZW50JyxcbiAgICAgICAgdG9hc3RNczogMzUwMCxcbiAgICAgICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIGRlZmF1bHRzOiB7IGRlbGV0ZVplcm9RdHlSb3dzOiB0cnVlLCB1bml0UHJpY2VEZWNpbWFsczogMywgZW5hYmxlSG92ZXJBZmZvcmRhbmNlOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCB3YXJuID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy53YXJuPy4oLi4uYSk7IH07XG4gICAgY29uc3QgZXJyID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5lcnJvcj8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBpZiAoIVJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgeyBsb2coJ1FUMzA6IHdyb25nIHJvdXRlLCBza2lwcGluZycpOyByZXR1cm47IH1cblxuXG4gICAgLy8gPT09PT0gUXVvdGVSZXBvIHZpYSBsdC1kYXRhLWNvcmUgZmxhdCB7aGVhZGVyLCBsaW5lc30gPT09PT1cbiAgICBsZXQgUVQgPSBudWxsO1xuICAgIGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JEQyh0aW1lb3V0TXMgPSAyMDAwMCkge1xuICAgICAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCB0aW1lb3V0TXMpIHtcbiAgICAgICAgICAgIGNvbnN0IExUID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93Lmx0IDogd2luZG93Lmx0KTtcbiAgICAgICAgICAgIGlmIChMVD8uY29yZT8uZGF0YT8uY3JlYXRlRGF0YUNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBpZiAoTFQuY29yZS5kYXRhLm1ha2VGbGF0U2NvcGVkUmVwbykgcmV0dXJuIExULmNvcmUuZGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IChUTVV0aWxzLnNsZWVwPy4oNTApIHx8IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgIH1cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gYXdhaXQgd2FpdEZvckRDKCk7XG4gICAgICAgIGlmICghREMubWFrZUZsYXRTY29wZWRSZXBvKSB7IGF3YWl0IChUTVV0aWxzLnNsZWVwPy4oNTApIHx8IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpKTsgfVxuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuXG4gICAgbGV0IHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb0ZvclF1b3RlKHFrKSB7XG4gICAgICAgIGlmICghcWspIHJldHVybiBudWxsO1xuICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IChhd2FpdCBnZXRRVCgpKS51c2UoTnVtYmVyKHFrKSk7XG4gICAgICAgICAgICBhd2FpdCByZXBvLmVuc3VyZUZyb21MZWdhY3lJZk1pc3NpbmcoKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87IGxhc3RTY29wZSA9IHFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxdW90ZVJlcG87XG4gICAgfVxuXG5cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgKEdNIHRvbGVyYW50KSAtLS0tLS0tLS0tXG4gICAgY29uc3QgbG9hZFNldHRpbmdzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfTtcbiAgICBjb25zdCBzYXZlU2V0dGluZ3MgPSAobmV4dCkgPT4ge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9O1xuXG4gICAgLy8gLS0tLS0tLS0tLSBUb2FzdCAocm9idXN0IGluIERFVikgLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGRldlRvYXN0KG1zZywgbGV2ZWwgPSAnaW5mbycsIG1zID0gQ09ORklHLnRvYXN0TXMpIHtcbiAgICAgICAgdHJ5IHsgVE1VdGlscy50b2FzdD8uKG1zZywgbGV2ZWwsIG1zKTsgaWYgKERFVikgY29uc29sZS5kZWJ1ZygnW1FUMzAgREVWXSB0b2FzdDonLCBsZXZlbCwgbXNnKTsgcmV0dXJuOyB9IGNhdGNoIHsgfVxuICAgICAgICBpZiAoIURFVikgcmV0dXJuO1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBPYmplY3QuYXNzaWduKGVsLnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgcmlnaHQ6ICcxNnB4JywgYm90dG9tOiAnMTZweCcsIHpJbmRleDogMjE0NzQ4MzY0NyxcbiAgICAgICAgICAgIHBhZGRpbmc6ICcxMHB4IDEycHgnLCBib3JkZXJSYWRpdXM6ICc4cHgnLCBib3hTaGFkb3c6ICcwIDZweCAyMHB4IHJnYmEoMCwwLDAsLjI1KScsXG4gICAgICAgICAgICBmb250OiAnMTRweC8xLjMgc3lzdGVtLXVpLCBTZWdvZSBVSSwgQXJpYWwnLCBjb2xvcjogJyNmZmYnLFxuICAgICAgICAgICAgYmFja2dyb3VuZDogbGV2ZWwgPT09ICdzdWNjZXNzJyA/ICcjMWI1ZTIwJyA6IGxldmVsID09PSAnd2FybicgPyAnIzdmNjAwMCcgOiBsZXZlbCA9PT0gJ2Vycm9yJyA/ICcjYjcxYzFjJyA6ICcjNDI0MjQyJyxcbiAgICAgICAgICAgIHdoaXRlU3BhY2U6ICdwcmUtd3JhcCcsIG1heFdpZHRoOiAnMzZjaCdcbiAgICAgICAgfSk7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gU3RyaW5nKG1zZyk7IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpOyBzZXRUaW1lb3V0KCgpID0+IGVsLnJlbW92ZSgpLCBtcyB8fCAzNTAwKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEF1dGggaGVscGVycyAtLS0tLS0tLS0tXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlQXV0aE9yVG9hc3QoKSB7XG4gICAgICAgIHRyeSB7IGNvbnN0IGtleSA9IGF3YWl0IGx0LmNvcmUuYXV0aC5nZXRLZXkoKTsgaWYgKGtleSkgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGRldlRvYXN0KCdTaWduLWluIHJlcXVpcmVkLiBQbGVhc2UgbG9nIGluLCB0aGVuIGNsaWNrIGFnYWluLicsICd3YXJuJywgNTAwMCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiB3aXRoRnJlc2hBdXRoKHJ1bikge1xuICAgICAgICB0cnkgeyByZXR1cm4gYXdhaXQgcnVuKCk7IH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9ICsoZT8uc3RhdHVzIHx8ICgvXFxiKFxcZHszfSlcXGIvLmV4ZWMoZT8ubWVzc2FnZSB8fCAnJykgfHwgW10pWzFdIHx8IDApO1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gNDE5KSB7IHRyeSB7IGF3YWl0IFRNVXRpbHMuZ2V0QXBpS2V5Py4oeyBmb3JjZTogdHJ1ZSB9KTsgfSBjYXRjaCB7IH0gcmV0dXJuIGF3YWl0IHJ1bigpOyB9XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyAtLS0tLS0tLS0tIEluamVjdCBVSSAtLS0tLS0tLS0tXG4gICAgY29uc3Qgc3RvcE9ic2VydmUgPSBUTVV0aWxzLm9ic2VydmVJbnNlcnRNYW55Py4oJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsIGluamVjdFByaWNpbmdDb250cm9scylcbiAgICAgICAgfHwgVE1VdGlscy5vYnNlcnZlSW5zZXJ0Py4oJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsIGluamVjdFByaWNpbmdDb250cm9scyk7XG5cbiAgICBUTVV0aWxzLm9uVXJsQ2hhbmdlPy4oKCkgPT4ge1xuICAgICAgICBpZiAoIVJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgeyB0cnkgeyBzdG9wT2JzZXJ2ZT8uKCk7IH0gY2F0Y2ggeyB9IHJldHVybjsgfVxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInKS5mb3JFYWNoKGluamVjdFByaWNpbmdDb250cm9scyk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInKS5mb3JFYWNoKGluamVjdFByaWNpbmdDb250cm9scyk7XG5cbiAgICBmdW5jdGlvbiBpbmplY3RQcmljaW5nQ29udHJvbHModWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghdWwgfHwgdWwuZGF0YXNldC5xdDMwSW5qZWN0ZWQpIHJldHVybjtcbiAgICAgICAgICAgIHVsLmRhdGFzZXQucXQzMEluamVjdGVkID0gJzEnO1xuXG4gICAgICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBsaS5pZCA9ICdsdC1hcHBseS1jYXRhbG9nLXByaWNpbmcnO1xuICAgICAgICAgICAgbGkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgICAgIGEuaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgYS50ZXh0Q29udGVudCA9ICdMVCBBcHBseSBDYXRhbG9nIFByaWNpbmcnO1xuICAgICAgICAgICAgYS50aXRsZSA9ICdDbGljayB0byBhcHBseSBjdXN0b21lciBzcGVjaWZpYyBjYXRhbG9nIHByaWNpbmcnO1xuICAgICAgICAgICAgYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnQXBwbHkgY2F0YWxvZyBwcmljaW5nJyk7XG4gICAgICAgICAgICBhLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oYS5zdHlsZSwgeyBjdXJzb3I6ICdwb2ludGVyJywgdHJhbnNpdGlvbjogJ2ZpbHRlciAuMTVzLCB0ZXh0RGVjb3JhdGlvbkNvbG9yOiAuMTVzJyB9KTtcblxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgaWYgKFMuZW5hYmxlSG92ZXJBZmZvcmRhbmNlKSB7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4geyBhLnN0eWxlLmZpbHRlciA9ICdicmlnaHRuZXNzKDEuMDgpJzsgYS5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnOyB9KTtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGEuc3R5bGUuZmlsdGVyID0gJyc7IGEuc3R5bGUudGV4dERlY29yYXRpb24gPSAnJzsgfSk7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgYS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjNGE5MGUyJzsgYS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHsgYS5zdHlsZS5vdXRsaW5lID0gJyc7IGEuc3R5bGUub3V0bGluZU9mZnNldCA9ICcnOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBoYW5kbGVBcHBseUNsaWNrKGEpKTtcbiAgICAgICAgICAgIGxpLmFwcGVuZENoaWxkKGEpOyB1bC5hcHBlbmRDaGlsZChsaSk7XG4gICAgICAgICAgICBzaG93T25seU9uUGFydFN1bW1hcnkobGksIENPTkZJRy53aXphcmRUYXJnZXRQYWdlKTtcbiAgICAgICAgICAgIGxvZygnUVQzMDogYnV0dG9uIGluamVjdGVkJyk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHsgZXJyKCdRVDMwIGluamVjdDonLCBlKTsgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgICAgICBjb25zdCBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZUVsID8gS08/LmRhdGFGb3I/LihhY3RpdmVFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9IHZtID8gS08/LnVud3JhcD8uKHZtLm5hbWUpID8/ICh0eXBlb2Ygdm0ubmFtZSA9PT0gJ2Z1bmN0aW9uJyA/IHZtLm5hbWUoKSA6IHZtLm5hbWUpIDogJyc7XG4gICAgICAgICAgICBpZiAobmFtZSkgcmV0dXJuIFN0cmluZyhuYW1lKTtcbiAgICAgICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICAgICAgcmV0dXJuIChuYXY/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHRvZ2dsZSA9ICgpID0+IHsgbGkuc3R5bGUuZGlzcGxheSA9IChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpID09PSB0YXJnZXROYW1lKSA/ICcnIDogJ25vbmUnOyB9O1xuICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgICAgIGlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHRvZ2dsZSkub2JzZXJ2ZShuYXYsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlIH0pO1xuICAgICAgICB0b2dnbGUoKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIE1haW4gaGFuZGxlciAoZnVsbHkgcG9ydGVkKSAtLS0tLS0tLS0tXG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwbHlDbGljayhidG4pIHtcbiAgICAgICAgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7IGJ0bi5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgIGNvbnN0IHJlc3RvcmUgPSAoKSA9PiB7IGJ0bi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJyc7IGJ0bi5zdHlsZS5vcGFjaXR5ID0gJyc7IH07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGRldlRvYXN0KCdcdTIzRjMgQXBwbHlpbmcgY2F0YWxvZyBwcmljaW5nXHUyMDI2JywgJ2luZm8nLCA1MDAwKTtcbiAgICAgICAgICAgIGlmICghKGF3YWl0IGVuc3VyZUF1dGhPclRvYXN0KCkpKSB0aHJvdyBuZXcgRXJyb3IoJ05vIEFQSSBrZXkvc2Vzc2lvbicpO1xuXG4gICAgICAgICAgICBjb25zdCBxdW90ZUtleSA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xuICAgICAgICAgICAgaWYgKCFxdW90ZUtleSkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZV9LZXkgbWlzc2luZycpO1xuXG4gICAgICAgICAgICAvLyAxKSBDYXRhbG9nIGtleSAocmVwby1jYWNoZWQpXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocXVvdGVLZXkpO1xuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcigpO1xuICAgICAgICAgICAgbGV0IGNhdGFsb2dLZXkgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKGhlYWRlciwgWydDYXRhbG9nX0tleScsICdDYXRhbG9nS2V5J10sIHsgZmlyc3Q6IHRydWUgfSkgPz8gbnVsbDtcblxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7XG4gICAgICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBGZXRjaGluZyBDYXRhbG9nIEtleVx1MjAyNicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93czEgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0NhdGFsb2dLZXlCeVF1b3RlS2V5LCB7IFF1b3RlX0tleTogcXVvdGVLZXkgfSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNhdGFsb2dLZXkgPSByb3dzMT8uWzBdPy5DYXRhbG9nX0tleSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5KSBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXIoeyBRdW90ZV9LZXk6IE51bWJlcihxdW90ZUtleSksIENhdGFsb2dfS2V5OiBOdW1iZXIoY2F0YWxvZ0tleSkgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghY2F0YWxvZ0tleSkgeyBkZXZUb2FzdChvbmVPZihOT19DQVRBTE9HX01FU1NBR0VTKSwgJ3dhcm4nLCA1MDAwKTsgcmV0dXJuOyB9XG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyNzA1IENhdGFsb2cgS2V5OiAke2NhdGFsb2dLZXl9YCwgJ3N1Y2Nlc3MnLCAxODAwKTtcblxuICAgICAgICAgICAgLy8gMikgQnJlYWtwb2ludHMgYnkgcGFydFxuICAgICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcnROb3MgPSBbLi4ubmV3IFNldChyYXcubWFwKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUGFydE5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KSkuZmlsdGVyKEJvb2xlYW4pKV07XG4gICAgICAgICAgICBpZiAoIXBhcnROb3MubGVuZ3RoKSB7IGRldlRvYXN0KCdcdTI2QTBcdUZFMEYgTm8gUGFydE5vIHZhbHVlcyBmb3VuZCcsICd3YXJuJywgNDAwMCk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyM0YzIExvYWRpbmcgJHtwYXJ0Tm9zLmxlbmd0aH0gcGFydChzKVx1MjAyNmAsICdpbmZvJyk7XG4gICAgICAgICAgICBjb25zdCBwcmljZU1hcCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocGFydE5vcy5tYXAoYXN5bmMgKHApID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PlxuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19CcmVha3BvaW50c0J5UGFydCwgeyBDYXRhbG9nX0tleTogY2F0YWxvZ0tleSwgQ2F0YWxvZ19QYXJ0X05vOiBwIH0pXG4gICAgICAgICAgICAgICAgKSB8fCBbXTtcbiAgICAgICAgICAgICAgICBwcmljZU1hcFtwXSA9IHJvd3NcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IHIuQ2F0YWxvZ19QYXJ0X05vID09PSBwICYmIG5ldyBEYXRlKHIuRWZmZWN0aXZlX0RhdGUpIDw9IG5vdyAmJiBub3cgPD0gbmV3IERhdGUoci5FeHBpcmF0aW9uX0RhdGUpKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5CcmVha3BvaW50X1F1YW50aXR5IC0gYi5CcmVha3BvaW50X1F1YW50aXR5KTtcbiAgICAgICAgICAgICAgICBsb2coYFFUMzA6IGxvYWRlZCAke3ByaWNlTWFwW3BdLmxlbmd0aH0gYnJlYWtwb2ludHMgZm9yICR7cH1gKTtcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLy8gMykgQXBwbHkgb3IgZGVsZXRlIHBlciByb3dcbiAgICAgICAgICAgIGRldlRvYXN0KCdcdTIzRjMgQXBwbHlpbmcgcHJpY2VzXHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IFMgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGNvbnN0IHJvdW5kID0gKG4pID0+ICsoK24pLnRvRml4ZWQoUy51bml0UHJpY2VEZWNpbWFscyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlID0gbG9jYXRpb24ub3JpZ2luO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJhdy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJhd1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBxdHkgPSArKFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVhbnRpdHknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pIHx8IDApO1xuXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHplcm8tcXR5IHJvd3MgKHBvcnRlZClcbiAgICAgICAgICAgICAgICBpZiAocXR5IDw9IDAgJiYgUy5kZWxldGVaZXJvUXR5Um93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVLZXknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1F1b3RlUGFydEtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwciA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVQcmljZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHFrICYmIHFwayAmJiBxcHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgbHQuY29yZS5odHRwLnBvc3QoJy9TYWxlc0FuZENSTS9RdW90ZVBhcnQvRGVsZXRlUXVvdGVQcmljZScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcXVvdGVLZXk6IHFrLCBxdW90ZVBhcnRLZXk6IHFwaywgcXVvdGVQcmljZUtleTogcXByXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2sgPSAocmVzPy5vayA9PT0gdHJ1ZSkgfHwgKHJlcz8uc3RhdHVzID49IDIwMCAmJiByZXM/LnN0YXR1cyA8IDMwMCk7IC8vIFRNVXRpbHMuZmV0Y2hEYXRhIHJldHVybnMgYm9keTsgZmFsbGJhY2sgaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV2VG9hc3Qob2sgPyBgXHVEODNEXHVEREQxIERlbGV0ZWQgcm93WyR7aX1dYCA6IGBcdTI3NEMgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCBvayA/ICdzdWNjZXNzJyA6ICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgRGVsZXRlIGVycm9yIHJvd1ske2l9XWAsICdlcnJvcicsIDYwMDApOyBlcnIoJ1FUMzAgZGVsZXRlIGVycm9yJywgZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcHJpY2VcbiAgICAgICAgICAgICAgICBpZiAocXR5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gcGlja1ByaWNlKHByaWNlTWFwW3BhcnROb10sIHF0eSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicCA9PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlQcmljZVRvUm93KHJvdywgcm91bmQoYnApKTtcbiAgICAgICAgICAgICAgICAgICAgbG9nKGBRVDMwOiByb3dbJHtpfV0gcXR5PSR7cXR5fSBwcmljZT0ke3JvdW5kKGJwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIDQpIFJlZnJlc2ggd2l6YXJkIHNvIFVJIHJlZmxlY3RzIGNoYW5nZXMgKHBvcnRlZClcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnID0gd2l6Lm5hdmlnYXRlUGFnZS5iaW5kKHdpeik7XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZSA9IChwYWdlKSA9PiB7IGNvbnN0IHJldCA9IG9yaWcocGFnZSk7IHNldFRpbWVvdXQoKCkgPT4gZGV2VG9hc3QoJ1x1RDgzQ1x1REY4OSBBbGwgdXBkYXRlZCEnLCAnc3VjY2VzcycpLCA4MDApOyByZXR1cm4gcmV0OyB9O1xuICAgICAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2Uod2l6LmFjdGl2ZVBhZ2UoKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRldlRvYXN0KCdcdUQ4M0NcdURGODkgQWxsIHVwZGF0ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyNzRDICR7ZS5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJywgODAwMCk7IGVycignUVQzMDonLCBlKTtcbiAgICAgICAgfSBmaW5hbGx5IHsgcmVzdG9yZSgpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cblxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwaWNrUHJpY2UoYnBzLCBxdHkpIHtcbiAgICAgICAgaWYgKCFicHM/Lmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChxdHkgPCBicHNbMF0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1swXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBjb25zdCBsYXN0ID0gYnBzW2Jwcy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKHF0eSA+PSBsYXN0LkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBsYXN0LkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnBzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHF0eSA+PSBicHNbaV0uQnJlYWtwb2ludF9RdWFudGl0eSAmJiBxdHkgPCBicHNbaSArIDFdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbaV0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gYXBwbHlQcmljZVRvUm93KHJvdywgcHJpY2UpIHtcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZShyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnLCBwcmljZSk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBNZXNzYWdlcyAocG9ydGVkKSAtLS0tLS0tLS0tXG4gICAgY29uc3QgTk9fQ0FUQUxPR19NRVNTQUdFUyA9IFtcbiAgICAgICAgJ1x1RDgzRFx1REVBQiBObyBjYXRhbG9nIHNlbGVjdGVkIFx1MjAxMyBjYW5ub3QgZmV0Y2ggcHJpY2VzLicsXG4gICAgICAgICdcdTI2QTBcdUZFMEYgTWlzc2luZyBjdXN0b21lciBjYXRhbG9nIFx1MjAxMyBwcmljaW5nIHNraXBwZWQuJyxcbiAgICAgICAgJ1x1RDgzRFx1REQwRCBObyBjYXRhbG9nIGZvdW5kIFx1MjAxMyBwcmljZXMgdW5hdmFpbGFibGUuJyxcbiAgICAgICAgJ1x1Mjc1NyBDYXRhbG9nIG5vdCBzZXQgXHUyMDEzIHBsZWFzZSBwaWNrIGEgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVERUQxIENhbm5vdCBsb2FkIHByaWNlcyB3aXRob3V0IGEgY3VzdG9tZXIgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVEQ0RCIE5vIGNhdGFsb2cga2V5IFx1MjAxMyB1bmFibGUgdG8gbG9va3VwIHByaWNlcy4nLFxuICAgICAgICAnXHUyNkEwXHVGRTBGIFByaWNlcyByZXF1aXJlIGEgY2F0YWxvZyBcdTIwMTMgbm9uZSBjb25maWd1cmVkLicsXG4gICAgICAgICdcdUQ4M0RcdURFQTggTm8gY2F0YWxvZyBkZXRlY3RlZCBcdTIwMTMgc2tpcHBpbmcgcHJpY2UgbG9va3VwLicsXG4gICAgICAgICdcdTIxMzlcdUZFMEYgU2VsZWN0IGEgY2F0YWxvZyBmaXJzdCB0byByZXRyaWV2ZSBwcmljaW5nLicsXG4gICAgICAgICdcdUQ4M0RcdURFNDggTm8gY2F0YWxvZyBjaG9zZW4gXHUyMDEzIGhpZGluZyBwcmljZSBmZXRjaC4nXG4gICAgXTtcbiAgICBjb25zdCBvbmVPZiA9IChhcnIpID0+IGFycltNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnIubGVuZ3RoKV07XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBoYW5kbGVBcHBseUNsaWNrIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7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
