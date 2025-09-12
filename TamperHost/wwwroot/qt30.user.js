// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.26
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.26-1757635931875
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.26-1757635931875
// @require      http://localhost:5000/lt-core.user.js?v=3.6.26-1757635931875
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.26-1757635931875
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
      GRID_SEL: ".plex-grid",
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
        const raw = (() => {
          try {
            const grid = document.querySelector(CONFIG.GRID_SEL);
            if (grid && KO?.dataFor) {
              const gridVM = KO.dataFor(grid);
              return Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw : [];
            }
          } catch {
          }
          return [];
        })();
        const partNos = [...new Set(
          raw.map((r) => TMUtils.getObsValue(r, "PartNo", { first: true, trim: true })).filter(Boolean)
        )];
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHdpemFyZFRhcmdldFBhZ2U6ICdQYXJ0IFN1bW1hcnknLFxuICAgICAgICBzZXR0aW5nc0tleTogJ3F0MzBfc2V0dGluZ3NfdjEnLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tIEJvb3RzdHJhcCAtLS0tLS0tLS0tXG4gICAgY29uc3QgSVNfVEVTVCA9IC90ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xuICAgIFRNVXRpbHMuc2V0RGVidWc/LihJU19URVNUKTtcbiAgICBjb25zdCBMID0gVE1VdGlscy5nZXRMb2dnZXI/LignUVQzMCcpO1xuICAgIGNvbnN0IGxvZyA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ubG9nPy4oLi4uYSk7IH07XG4gICAgY29uc3Qgd2FybiA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ud2Fybj8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IGVyciA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8uZXJyb3I/LiguLi5hKTsgfTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHsgbG9nKCdRVDMwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcnKTsgcmV0dXJuOyB9XG5cblxuICAgIC8vID09PT09IFF1b3RlUmVwbyB2aWEgbHQtZGF0YS1jb3JlIGZsYXQge2hlYWRlciwgbGluZXN9ID09PT09XG4gICAgbGV0IFFUID0gbnVsbDtcbiAgICBhc3luYyBmdW5jdGlvbiB3YWl0Rm9yREModGltZW91dE1zID0gMjAwMDApIHtcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICB3aGlsZSAoRGF0ZS5ub3coKSAtIHN0YXJ0IDwgdGltZW91dE1zKSB7XG4gICAgICAgICAgICBjb25zdCBMVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5sdCA6IHdpbmRvdy5sdCk7XG4gICAgICAgICAgICBpZiAoTFQ/LmNvcmU/LmRhdGE/LmNyZWF0ZURhdGFDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgaWYgKExULmNvcmUuZGF0YS5tYWtlRmxhdFNjb3BlZFJlcG8pIHJldHVybiBMVC5jb3JlLmRhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCAoVE1VdGlscy5zbGVlcD8uKDUwKSB8fCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdEYXRhQ29yZSBub3QgcmVhZHknKTtcbiAgICB9XG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UVQoKSB7XG4gICAgICAgIGlmIChRVCkgcmV0dXJuIFFUO1xuICAgICAgICBjb25zdCBEQyA9IGF3YWl0IHdhaXRGb3JEQygpO1xuICAgICAgICBpZiAoIURDLm1ha2VGbGF0U2NvcGVkUmVwbykgeyBhd2FpdCAoVE1VdGlscy5zbGVlcD8uKDUwKSB8fCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKSk7IH1cbiAgICAgICAgUVQgPSBEQy5tYWtlRmxhdFNjb3BlZFJlcG8oeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSk7XG4gICAgICAgIHJldHVybiBRVDtcbiAgICB9XG5cblxuICAgIGxldCBxdW90ZVJlcG8gPSBudWxsLCBsYXN0U2NvcGUgPSBudWxsO1xuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nKCk7XG4gICAgICAgICAgICBxdW90ZVJlcG8gPSByZXBvOyBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuXG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIChHTSB0b2xlcmFudCkgLS0tLS0tLS0tLVxuICAgIGNvbnN0IGxvYWRTZXR0aW5ncyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIENPTkZJRy5kZWZhdWx0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnID8geyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLkpTT04ucGFyc2UodikgfSA6IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi52IH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DT05GSUcuZGVmYXVsdHMgfTsgfVxuICAgIH07XG4gICAgY29uc3Qgc2F2ZVNldHRpbmdzID0gKG5leHQpID0+IHtcbiAgICAgICAgdHJ5IHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBuZXh0KTsgfVxuICAgICAgICBjYXRjaCB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgSlNPTi5zdHJpbmdpZnkobmV4dCkpOyB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gVG9hc3QgKHJvYnVzdCBpbiBERVYpIC0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBkZXZUb2FzdChtc2csIGxldmVsID0gJ2luZm8nLCBtcyA9IENPTkZJRy50b2FzdE1zKSB7XG4gICAgICAgIHRyeSB7IFRNVXRpbHMudG9hc3Q/Lihtc2csIGxldmVsLCBtcyk7IGlmIChERVYpIGNvbnNvbGUuZGVidWcoJ1tRVDMwIERFVl0gdG9hc3Q6JywgbGV2ZWwsIG1zZyk7IHJldHVybjsgfSBjYXRjaCB7IH1cbiAgICAgICAgaWYgKCFERVYpIHJldHVybjtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihlbC5zdHlsZSwge1xuICAgICAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsIHJpZ2h0OiAnMTZweCcsIGJvdHRvbTogJzE2cHgnLCB6SW5kZXg6IDIxNDc0ODM2NDcsXG4gICAgICAgICAgICBwYWRkaW5nOiAnMTBweCAxMnB4JywgYm9yZGVyUmFkaXVzOiAnOHB4JywgYm94U2hhZG93OiAnMCA2cHggMjBweCByZ2JhKDAsMCwwLC4yNSknLFxuICAgICAgICAgICAgZm9udDogJzE0cHgvMS4zIHN5c3RlbS11aSwgU2Vnb2UgVUksIEFyaWFsJywgY29sb3I6ICcjZmZmJyxcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IGxldmVsID09PSAnc3VjY2VzcycgPyAnIzFiNWUyMCcgOiBsZXZlbCA9PT0gJ3dhcm4nID8gJyM3ZjYwMDAnIDogbGV2ZWwgPT09ICdlcnJvcicgPyAnI2I3MWMxYycgOiAnIzQyNDI0MicsXG4gICAgICAgICAgICB3aGl0ZVNwYWNlOiAncHJlLXdyYXAnLCBtYXhXaWR0aDogJzM2Y2gnXG4gICAgICAgIH0pO1xuICAgICAgICBlbC50ZXh0Q29udGVudCA9IFN0cmluZyhtc2cpOyBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTsgc2V0VGltZW91dCgoKSA9PiBlbC5yZW1vdmUoKSwgbXMgfHwgMzUwMCk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBBdXRoIGhlbHBlcnMgLS0tLS0tLS0tLVxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUF1dGhPclRvYXN0KCkge1xuICAgICAgICB0cnkgeyBjb25zdCBrZXkgPSBhd2FpdCBsdC5jb3JlLmF1dGguZ2V0S2V5KCk7IGlmIChrZXkpIHJldHVybiB0cnVlOyB9IGNhdGNoIHsgfVxuICAgICAgICBkZXZUb2FzdCgnU2lnbi1pbiByZXF1aXJlZC4gUGxlYXNlIGxvZyBpbiwgdGhlbiBjbGljayBhZ2Fpbi4nLCAnd2FybicsIDUwMDApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gd2l0aEZyZXNoQXV0aChydW4pIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIGF3YWl0IHJ1bigpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXMgPSArKGU/LnN0YXR1cyB8fCAoL1xcYihcXGR7M30pXFxiLy5leGVjKGU/Lm1lc3NhZ2UgfHwgJycpIHx8IFtdKVsxXSB8fCAwKTtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQxOSkgeyB0cnkgeyBhd2FpdCBUTVV0aWxzLmdldEFwaUtleT8uKHsgZm9yY2U6IHRydWUgfSk7IH0gY2F0Y2ggeyB9IHJldHVybiBhd2FpdCBydW4oKTsgfVxuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gLS0tLS0tLS0tLSBJbmplY3QgVUkgLS0tLS0tLS0tLVxuICAgIGNvbnN0IHN0b3BPYnNlcnZlID0gVE1VdGlscy5vYnNlcnZlSW5zZXJ0TWFueT8uKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLCBpbmplY3RQcmljaW5nQ29udHJvbHMpXG4gICAgICAgIHx8IFRNVXRpbHMub2JzZXJ2ZUluc2VydD8uKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLCBpbmplY3RQcmljaW5nQ29udHJvbHMpO1xuXG4gICAgVE1VdGlscy5vblVybENoYW5nZT8uKCgpID0+IHtcbiAgICAgICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHsgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSByZXR1cm47IH1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJykuZm9yRWFjaChpbmplY3RQcmljaW5nQ29udHJvbHMpO1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJykuZm9yRWFjaChpbmplY3RQcmljaW5nQ29udHJvbHMpO1xuXG4gICAgZnVuY3Rpb24gaW5qZWN0UHJpY2luZ0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoIXVsIHx8IHVsLmRhdGFzZXQucXQzMEluamVjdGVkKSByZXR1cm47XG4gICAgICAgICAgICB1bC5kYXRhc2V0LnF0MzBJbmplY3RlZCA9ICcxJztcblxuICAgICAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgbGkuaWQgPSAnbHQtYXBwbHktY2F0YWxvZy1wcmljaW5nJztcbiAgICAgICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBhLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGEudGV4dENvbnRlbnQgPSAnTFQgQXBwbHkgQ2F0YWxvZyBQcmljaW5nJztcbiAgICAgICAgICAgIGEudGl0bGUgPSAnQ2xpY2sgdG8gYXBwbHkgY3VzdG9tZXIgc3BlY2lmaWMgY2F0YWxvZyBwcmljaW5nJztcbiAgICAgICAgICAgIGEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0FwcGx5IGNhdGFsb2cgcHJpY2luZycpO1xuICAgICAgICAgICAgYS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGEuc3R5bGUsIHsgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICdmaWx0ZXIgLjE1cywgdGV4dERlY29yYXRpb25Db2xvcjogLjE1cycgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IFMgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGlmIChTLmVuYWJsZUhvdmVyQWZmb3JkYW5jZSkge1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgYS5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGEuc3R5bGUudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJzsgfSk7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBhLnN0eWxlLmZpbHRlciA9ICcnOyBhLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJyc7IH0pO1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXMnLCAoKSA9PiB7IGEuc3R5bGUub3V0bGluZSA9ICcycHggc29saWQgIzRhOTBlMic7IGEuc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGEuc3R5bGUub3V0bGluZSA9ICcnOyBhLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJzsgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gaGFuZGxlQXBwbHlDbGljayhhKSk7XG4gICAgICAgICAgICBsaS5hcHBlbmRDaGlsZChhKTsgdWwuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgICAgICAgc2hvd09ubHlPblBhcnRTdW1tYXJ5KGxpLCBDT05GSUcud2l6YXJkVGFyZ2V0UGFnZSk7XG4gICAgICAgICAgICBsb2coJ1FUMzA6IGJ1dHRvbiBpbmplY3RlZCcpO1xuICAgICAgICB9IGNhdGNoIChlKSB7IGVycignUVQzMCBpbmplY3Q6JywgZSk7IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93T25seU9uUGFydFN1bW1hcnkobGksIHRhcmdldE5hbWUpIHtcbiAgICAgICAgY29uc3QgZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmVFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICAgICAgY29uc3Qgdm0gPSBhY3RpdmVFbCA/IEtPPy5kYXRhRm9yPy4oYWN0aXZlRWwpIDogbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSB2bSA/IEtPPy51bndyYXA/Lih2bS5uYW1lKSA/PyAodHlwZW9mIHZtLm5hbWUgPT09ICdmdW5jdGlvbicgPyB2bS5uYW1lKCkgOiB2bS5uYW1lKSA6ICcnO1xuICAgICAgICAgICAgaWYgKG5hbWUpIHJldHVybiBTdHJpbmcobmFtZSk7XG4gICAgICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICAgICAgICAgIHJldHVybiAobmF2Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCB0b2dnbGUgPSAoKSA9PiB7IGxpLnN0eWxlLmRpc3BsYXkgPSAoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSA9PT0gdGFyZ2V0TmFtZSkgPyAnJyA6ICdub25lJzsgfTtcbiAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xuICAgICAgICBpZiAobmF2KSBuZXcgTXV0YXRpb25PYnNlcnZlcih0b2dnbGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSB9KTtcbiAgICAgICAgdG9nZ2xlKCk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBNYWluIGhhbmRsZXIgKGZ1bGx5IHBvcnRlZCkgLS0tLS0tLS0tLVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFwcGx5Q2xpY2soYnRuKSB7XG4gICAgICAgIGJ0bi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnOyBidG4uc3R5bGUub3BhY2l0eSA9ICcwLjUnO1xuICAgICAgICBjb25zdCByZXN0b3JlID0gKCkgPT4geyBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnOyBidG4uc3R5bGUub3BhY2l0eSA9ICcnOyB9O1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBkZXZUb2FzdCgnXHUyM0YzIEFwcGx5aW5nIGNhdGFsb2cgcHJpY2luZ1x1MjAyNicsICdpbmZvJywgNTAwMCk7XG4gICAgICAgICAgICBpZiAoIShhd2FpdCBlbnN1cmVBdXRoT3JUb2FzdCgpKSkgdGhyb3cgbmV3IEVycm9yKCdObyBBUEkga2V5L3Nlc3Npb24nKTtcblxuICAgICAgICAgICAgY29uc3QgcXVvdGVLZXkgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcbiAgICAgICAgICAgIGlmICghcXVvdGVLZXkpIHRocm93IG5ldyBFcnJvcignUXVvdGVfS2V5IG1pc3NpbmcnKTtcblxuICAgICAgICAgICAgLy8gMSkgQ2F0YWxvZyBrZXkgKHJlcG8tY2FjaGVkKVxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHF1b3RlS2V5KTtcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXIoKTtcbiAgICAgICAgICAgIGxldCBjYXRhbG9nS2V5ID0gVE1VdGlscy5nZXRPYnNWYWx1ZShoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG5cbiAgICAgICAgICAgIGlmICghY2F0YWxvZ0tleSkge1xuICAgICAgICAgICAgICAgIGRldlRvYXN0KCdcdTIzRjMgRmV0Y2hpbmcgQ2F0YWxvZyBLZXlcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PlxuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19DYXRhbG9nS2V5QnlRdW90ZUtleSwgeyBRdW90ZV9LZXk6IHF1b3RlS2V5IH0pXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSkgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyKHsgUXVvdGVfS2V5OiBOdW1iZXIocXVvdGVLZXkpLCBDYXRhbG9nX0tleTogTnVtYmVyKGNhdGFsb2dLZXkpIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHsgZGV2VG9hc3Qob25lT2YoTk9fQ0FUQUxPR19NRVNTQUdFUyksICd3YXJuJywgNTAwMCk7IHJldHVybjsgfVxuICAgICAgICAgICAgZGV2VG9hc3QoYFx1MjcwNSBDYXRhbG9nIEtleTogJHtjYXRhbG9nS2V5fWAsICdzdWNjZXNzJywgMTgwMCk7XG5cbiAgICAgICAgICAgIC8vIDIpIEJyZWFrcG9pbnRzIGJ5IHBhcnRcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cbiAgICAgICAgICAgIC8vIEFjcXVpcmUgS08gZ3JpZCByb3dzIGF0IGNsaWNrIHRpbWVcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9ICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXcgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfSkoKTtcblxuICAgICAgICAgICAgY29uc3QgcGFydE5vcyA9IFsuLi5uZXcgU2V0KFxuICAgICAgICAgICAgICAgIHJhdy5tYXAoKHIpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgXCJQYXJ0Tm9cIiwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KSlcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgKV07XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgZGV2VG9hc3QoJ1x1MjZBMFx1RkUwRiBObyBQYXJ0Tm8gdmFsdWVzIGZvdW5kJywgJ3dhcm4nLCA0MDAwKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTIzRjMgTG9hZGluZyAke3BhcnROb3MubGVuZ3RofSBwYXJ0KHMpXHUyMDI2YCwgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IHByaWNlTWFwID0ge307XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChwYXJ0Tm9zLm1hcChhc3luYyAocCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0JyZWFrcG9pbnRzQnlQYXJ0LCB7IENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5LCBDYXRhbG9nX1BhcnRfTm86IHAgfSlcbiAgICAgICAgICAgICAgICApIHx8IFtdO1xuICAgICAgICAgICAgICAgIHByaWNlTWFwW3BdID0gcm93c1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gci5DYXRhbG9nX1BhcnRfTm8gPT09IHAgJiYgbmV3IERhdGUoci5FZmZlY3RpdmVfRGF0ZSkgPD0gbm93ICYmIG5vdyA8PSBuZXcgRGF0ZShyLkV4cGlyYXRpb25fRGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLkJyZWFrcG9pbnRfUXVhbnRpdHkgLSBiLkJyZWFrcG9pbnRfUXVhbnRpdHkpO1xuICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogbG9hZGVkICR7cHJpY2VNYXBbcF0ubGVuZ3RofSBicmVha3BvaW50cyBmb3IgJHtwfWApO1xuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAvLyAzKSBBcHBseSBvciBkZWxldGUgcGVyIHJvd1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBwcmljZXNcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBsb2NhdGlvbi5vcmlnaW47XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAocG9ydGVkKVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPD0gMCAmJiBTLmRlbGV0ZVplcm9RdHlSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVQYXJ0S2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXByID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdW90ZVByaWNlS2V5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocWsgJiYgcXBrICYmIHFwcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBsdC5jb3JlLmh0dHAucG9zdCgnL1NhbGVzQW5kQ1JNL1F1b3RlUGFydC9EZWxldGVRdW90ZVByaWNlJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBxdW90ZUtleTogcWssIHF1b3RlUGFydEtleTogcXBrLCBxdW90ZVByaWNlS2V5OiBxcHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvayA9IChyZXM/Lm9rID09PSB0cnVlKSB8fCAocmVzPy5zdGF0dXMgPj0gMjAwICYmIHJlcz8uc3RhdHVzIDwgMzAwKTsgLy8gVE1VdGlscy5mZXRjaERhdGEgcmV0dXJucyBib2R5OyBmYWxsYmFjayBpZiBuZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXZUb2FzdChvayA/IGBcdUQ4M0RcdURERDEgRGVsZXRlZCByb3dbJHtpfV1gIDogYFx1Mjc0QyBEZWxldGUgZmFpbGVkIHJvd1ske2l9XWAsIG9rID8gJ3N1Y2Nlc3MnIDogJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV2VG9hc3QoYFx1Mjc0QyBEZWxldGUgZXJyb3Igcm93WyR7aX1dYCwgJ2Vycm9yJywgNjAwMCk7IGVycignUVQzMCBkZWxldGUgZXJyb3InLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwcmljZVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUGFydE5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnAgPSBwaWNrUHJpY2UocHJpY2VNYXBbcGFydE5vXSwgcXR5KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJwID09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBhcHBseVByaWNlVG9Sb3cocm93LCByb3VuZChicCkpO1xuICAgICAgICAgICAgICAgICAgICBsb2coYFFUMzA6IHJvd1ske2l9XSBxdHk9JHtxdHl9IHByaWNlPSR7cm91bmQoYnApfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gNCkgUmVmcmVzaCB3aXphcmQgc28gVUkgcmVmbGVjdHMgY2hhbmdlcyAocG9ydGVkKVxuICAgICAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWcgPSB3aXoubmF2aWdhdGVQYWdlLmJpbmQod2l6KTtcbiAgICAgICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlID0gKHBhZ2UpID0+IHsgY29uc3QgcmV0ID0gb3JpZyhwYWdlKTsgc2V0VGltZW91dCgoKSA9PiBkZXZUb2FzdCgnXHVEODNDXHVERjg5IEFsbCB1cGRhdGVkIScsICdzdWNjZXNzJyksIDgwMCk7IHJldHVybiByZXQ7IH07XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZSh3aXouYWN0aXZlUGFnZSgpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGV2VG9hc3QoJ1x1RDgzQ1x1REY4OSBBbGwgdXBkYXRlZCEnLCAnc3VjY2VzcycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgJHtlLm1lc3NhZ2UgfHwgZX1gLCAnZXJyb3InLCA4MDAwKTsgZXJyKCdRVDMwOicsIGUpO1xuICAgICAgICB9IGZpbmFsbHkgeyByZXN0b3JlKCk7IH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEhlbHBlcnMgLS0tLS0tLS0tLVxuXG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcbiAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gS08uZGF0YUZvcihncmlkKTtcbiAgICAgICAgICAgICAgICBjb25zdCByYXcwID0gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXdbMF0gOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByYXcwID8gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocmF3MCwgJ1F1b3RlS2V5JykgOiBudWxsO1xuICAgICAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByb290RWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQsIC5wbGV4LXBhZ2UnKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RWTSA9IHJvb3RFbCA/IEtPPy5kYXRhRm9yPy4ocm9vdEVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2ID0gcm9vdFZNICYmICh3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZUtleScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlLlF1b3RlS2V5JykpO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICByZXR1cm4gbSA/IE51bWJlcihtWzFdKSA6IG51bGw7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHBpY2tQcmljZShicHMsIHF0eSkge1xuICAgICAgICBpZiAoIWJwcz8ubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKHF0eSA8IGJwc1swXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzWzBdLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBicHNbYnBzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAocXR5ID49IGxhc3QuQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGxhc3QuQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocXR5ID49IGJwc1tpXS5CcmVha3BvaW50X1F1YW50aXR5ICYmIHF0eSA8IGJwc1tpICsgMV0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1tpXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhcHBseVByaWNlVG9Sb3cocm93LCBwcmljZSkge1xuICAgICAgICBUTVV0aWxzLnNldE9ic1ZhbHVlKHJvdywgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScsIHByaWNlKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIE1lc3NhZ2VzIChwb3J0ZWQpIC0tLS0tLS0tLS1cbiAgICBjb25zdCBOT19DQVRBTE9HX01FU1NBR0VTID0gW1xuICAgICAgICAnXHVEODNEXHVERUFCIE5vIGNhdGFsb2cgc2VsZWN0ZWQgXHUyMDEzIGNhbm5vdCBmZXRjaCBwcmljZXMuJyxcbiAgICAgICAgJ1x1MjZBMFx1RkUwRiBNaXNzaW5nIGN1c3RvbWVyIGNhdGFsb2cgXHUyMDEzIHByaWNpbmcgc2tpcHBlZC4nLFxuICAgICAgICAnXHVEODNEXHVERDBEIE5vIGNhdGFsb2cgZm91bmQgXHUyMDEzIHByaWNlcyB1bmF2YWlsYWJsZS4nLFxuICAgICAgICAnXHUyNzU3IENhdGFsb2cgbm90IHNldCBcdTIwMTMgcGxlYXNlIHBpY2sgYSBjYXRhbG9nLicsXG4gICAgICAgICdcdUQ4M0RcdURFRDEgQ2Fubm90IGxvYWQgcHJpY2VzIHdpdGhvdXQgYSBjdXN0b21lciBjYXRhbG9nLicsXG4gICAgICAgICdcdUQ4M0RcdURDREIgTm8gY2F0YWxvZyBrZXkgXHUyMDEzIHVuYWJsZSB0byBsb29rdXAgcHJpY2VzLicsXG4gICAgICAgICdcdTI2QTBcdUZFMEYgUHJpY2VzIHJlcXVpcmUgYSBjYXRhbG9nIFx1MjAxMyBub25lIGNvbmZpZ3VyZWQuJyxcbiAgICAgICAgJ1x1RDgzRFx1REVBOCBObyBjYXRhbG9nIGRldGVjdGVkIFx1MjAxMyBza2lwcGluZyBwcmljZSBsb29rdXAuJyxcbiAgICAgICAgJ1x1MjEzOVx1RkUwRiBTZWxlY3QgYSBjYXRhbG9nIGZpcnN0IHRvIHJldHJpZXZlIHByaWNpbmcuJyxcbiAgICAgICAgJ1x1RDgzRFx1REU0OCBObyBjYXRhbG9nIGNob3NlbiBcdTIwMTMgaGlkaW5nIHByaWNlIGZldGNoLidcbiAgICBdO1xuICAgIGNvbnN0IG9uZU9mID0gKGFycikgPT4gYXJyW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGFyci5sZW5ndGgpXTtcblxuICAgIC8vIC0tLS0tLS0tLS0gVGlueSBERVYgdGVzdCBzZWFtIC0tLS0tLS0tLS1cbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMzBfXyA9IHsgcGlja1ByaWNlLCBhcHBseVByaWNlVG9Sb3csIGhhbmRsZUFwcGx5Q2xpY2sgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsTUFBTTtBQUVILFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1Qsa0JBQWtCO0FBQUEsTUFDbEIsYUFBYTtBQUFBLE1BQ2IsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFHQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlB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Q25FLGNBQUksS0FBSyxLQUFNLFFBQU8sT0FBTyxDQUFDO0FBQUEsUUFDbEM7QUFBQSxNQUNKLFFBQVE7QUFBQSxNQUFFO0FBQ1YsVUFBSTtBQUNBLGNBQU0sU0FBUyxTQUFTLGNBQWMsMEJBQTBCO0FBQ2hFLGNBQU0sU0FBUyxTQUFTLElBQUksVUFBVSxNQUFNLElBQUk7QUFDaEQsY0FBTSxJQUFJLFdBQVcsT0FBTyxTQUFTLGNBQWMsUUFBUSxVQUFVLEtBQUssT0FBTyxTQUFTLGNBQWMsUUFBUSxnQkFBZ0I7QUFDaEksWUFBSSxLQUFLLEtBQU0sUUFBTyxPQUFPLENBQUM7QUFBQSxNQUNsQyxRQUFRO0FBQUEsTUFBRTtBQUNWLFlBQU0sSUFBSSxzQkFBc0IsS0FBSyxTQUFTLE1BQU07QUFDcEQsYUFBTyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUMsSUFBSTtBQUFBLElBQzlCO0FBQ0EsYUFBUyxVQUFVLEtBQUssS0FBSztBQUN6QixVQUFJLENBQUMsS0FBSyxPQUFRLFFBQU87QUFDekIsVUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQ3BELFlBQU0sT0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQy9CLFVBQUksT0FBTyxLQUFLLG9CQUFxQixRQUFPLEtBQUs7QUFDakQsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFNBQVMsR0FBRyxLQUFLO0FBQ3JDLFlBQUksT0FBTyxJQUFJLENBQUMsRUFBRSx1QkFBdUIsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDakc7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUNBLGFBQVMsZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxjQUFRLFlBQVksS0FBSyx5QkFBeUIsS0FBSztBQUFBLElBQzNEO0FBR0EsVUFBTSxzQkFBc0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0o7QUFDQSxVQUFNLFFBQVEsQ0FBQyxRQUFRLElBQUksS0FBSyxNQUFNLEtBQUssT0FBTyxJQUFJLElBQUksTUFBTSxDQUFDO0FBR2pFLFFBQUksT0FBTyxPQUFPLFdBQVcsYUFBYTtBQUN0QyxhQUFPLFdBQVcsRUFBRSxXQUFXLGlCQUFpQixpQkFBaUI7QUFBQSxJQUNyRTtBQUFBLEVBQ0osR0FBRzsiLAogICJuYW1lcyI6IFsibmF2Il0KfQo=
