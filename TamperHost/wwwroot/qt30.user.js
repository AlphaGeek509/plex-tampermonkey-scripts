// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.33
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.33-1757638923568
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.33-1757638923568
// @require      http://localhost:5000/lt-core.user.js?v=3.6.33-1757638923568
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.33-1757638923568
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
    (async () => {
      const dock = await window.ensureLTDock?.();
      dock?.register({
        id: "qt35-attachments",
        label: "Attachments",
        title: "Open QT35 Attachments",
        weight: 120,
        onClick: () => openAttachmentsModal()
      });
    })();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHdpemFyZFRhcmdldFBhZ2U6ICdQYXJ0IFN1bW1hcnknLFxuICAgICAgICBzZXR0aW5nc0tleTogJ3F0MzBfc2V0dGluZ3NfdjEnLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tIEJvb3RzdHJhcCAtLS0tLS0tLS0tXG4gICAgY29uc3QgSVNfVEVTVCA9IC90ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xuICAgIFRNVXRpbHMuc2V0RGVidWc/LihJU19URVNUKTtcbiAgICBjb25zdCBMID0gVE1VdGlscy5nZXRMb2dnZXI/LignUVQzMCcpO1xuICAgIGNvbnN0IGxvZyA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ubG9nPy4oLi4uYSk7IH07XG4gICAgY29uc3Qgd2FybiA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ud2Fybj8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IGVyciA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8uZXJyb3I/LiguLi5hKTsgfTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHsgbG9nKCdRVDMwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IG9wZW5BdHRhY2htZW50c01vZGFsKClcbiAgICAgICAgfSk7XG4gICAgfSkoKTtcblxuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGw7XG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckRDKHRpbWVvdXRNcyA9IDIwMDAwKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IHRpbWVvdXRNcykge1xuICAgICAgICAgICAgY29uc3QgTFQgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cubHQgOiB3aW5kb3cubHQpO1xuICAgICAgICAgICAgaWYgKExUPy5jb3JlPy5kYXRhPy5jcmVhdGVEYXRhQ29udGV4dCkge1xuICAgICAgICAgICAgICAgIGlmIChMVC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKSByZXR1cm4gTFQuY29yZS5kYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgKFRNVXRpbHMuc2xlZXA/Lig1MCkgfHwgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSkpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRGF0YUNvcmUgbm90IHJlYWR5Jyk7XG4gICAgfVxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFFUKCkge1xuICAgICAgICBpZiAoUVQpIHJldHVybiBRVDtcbiAgICAgICAgY29uc3QgREMgPSBhd2FpdCB3YWl0Rm9yREMoKTtcbiAgICAgICAgaWYgKCFEQy5tYWtlRmxhdFNjb3BlZFJlcG8pIHsgYXdhaXQgKFRNVXRpbHMuc2xlZXA/Lig1MCkgfHwgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSkpOyB9XG4gICAgICAgIFFUID0gREMubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pO1xuICAgICAgICByZXR1cm4gUVQ7XG4gICAgfVxuXG5cbiAgICBsZXQgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVSZXBvRm9yUXVvdGUocWspIHtcbiAgICAgICAgaWYgKCFxaykgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmICghcXVvdGVSZXBvIHx8IGxhc3RTY29wZSAhPT0gcWspIHtcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gKGF3YWl0IGdldFFUKCkpLnVzZShOdW1iZXIocWspKTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZygpO1xuICAgICAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgbGFzdFNjb3BlID0gcWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHF1b3RlUmVwbztcbiAgICB9XG5cblxuXG4gICAgLy8gLS0tLS0tLS0tLSBTZXR0aW5ncyAoR00gdG9sZXJhbnQpIC0tLS0tLS0tLS1cbiAgICBjb25zdCBsb2FkU2V0dGluZ3MgPSAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBDT05GSUcuZGVmYXVsdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi5KU09OLnBhcnNlKHYpIH0gOiB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4udiB9O1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgLi4uQ09ORklHLmRlZmF1bHRzIH07IH1cbiAgICB9O1xuICAgIGNvbnN0IHNhdmVTZXR0aW5ncyA9IChuZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgbmV4dCk7IH1cbiAgICAgICAgY2F0Y2ggeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIEpTT04uc3RyaW5naWZ5KG5leHQpKTsgfVxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRvYXN0IChyb2J1c3QgaW4gREVWKSAtLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gZGV2VG9hc3QobXNnLCBsZXZlbCA9ICdpbmZvJywgbXMgPSBDT05GSUcudG9hc3RNcykge1xuICAgICAgICB0cnkgeyBUTVV0aWxzLnRvYXN0Py4obXNnLCBsZXZlbCwgbXMpOyBpZiAoREVWKSBjb25zb2xlLmRlYnVnKCdbUVQzMCBERVZdIHRvYXN0OicsIGxldmVsLCBtc2cpOyByZXR1cm47IH0gY2F0Y2ggeyB9XG4gICAgICAgIGlmICghREVWKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZWwuc3R5bGUsIHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCByaWdodDogJzE2cHgnLCBib3R0b206ICcxNnB4JywgekluZGV4OiAyMTQ3NDgzNjQ3LFxuICAgICAgICAgICAgcGFkZGluZzogJzEwcHggMTJweCcsIGJvcmRlclJhZGl1czogJzhweCcsIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwuMjUpJyxcbiAgICAgICAgICAgIGZvbnQ6ICcxNHB4LzEuMyBzeXN0ZW0tdWksIFNlZ29lIFVJLCBBcmlhbCcsIGNvbG9yOiAnI2ZmZicsXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsZXZlbCA9PT0gJ3N1Y2Nlc3MnID8gJyMxYjVlMjAnIDogbGV2ZWwgPT09ICd3YXJuJyA/ICcjN2Y2MDAwJyA6IGxldmVsID09PSAnZXJyb3InID8gJyNiNzFjMWMnIDogJyM0MjQyNDInLFxuICAgICAgICAgICAgd2hpdGVTcGFjZTogJ3ByZS13cmFwJywgbWF4V2lkdGg6ICczNmNoJ1xuICAgICAgICB9KTtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBTdHJpbmcobXNnKTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7IHNldFRpbWVvdXQoKCkgPT4gZWwucmVtb3ZlKCksIG1zIHx8IDM1MDApO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gQXV0aCBoZWxwZXJzIC0tLS0tLS0tLS1cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVBdXRoT3JUb2FzdCgpIHtcbiAgICAgICAgdHJ5IHsgY29uc3Qga2V5ID0gYXdhaXQgbHQuY29yZS5hdXRoLmdldEtleSgpOyBpZiAoa2V5KSByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IH1cbiAgICAgICAgZGV2VG9hc3QoJ1NpZ24taW4gcmVxdWlyZWQuIFBsZWFzZSBsb2cgaW4sIHRoZW4gY2xpY2sgYWdhaW4uJywgJ3dhcm4nLCA1MDAwKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHdpdGhGcmVzaEF1dGgocnVuKSB7XG4gICAgICAgIHRyeSB7IHJldHVybiBhd2FpdCBydW4oKTsgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gKyhlPy5zdGF0dXMgfHwgKC9cXGIoXFxkezN9KVxcYi8uZXhlYyhlPy5tZXNzYWdlIHx8ICcnKSB8fCBbXSlbMV0gfHwgMCk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSA0MTkpIHsgdHJ5IHsgYXdhaXQgVE1VdGlscy5nZXRBcGlLZXk/Lih7IGZvcmNlOiB0cnVlIH0pOyB9IGNhdGNoIHsgfSByZXR1cm4gYXdhaXQgcnVuKCk7IH1cbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gSW5qZWN0IFVJIC0tLS0tLS0tLS1cbiAgICBjb25zdCBzdG9wT2JzZXJ2ZSA9IFRNVXRpbHMub2JzZXJ2ZUluc2VydE1hbnk/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKVxuICAgICAgICB8fCBUTVV0aWxzLm9ic2VydmVJbnNlcnQ/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcblxuICAgIFRNVXRpbHMub25VcmxDaGFuZ2U/LigoKSA9PiB7XG4gICAgICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IHRyeSB7IHN0b3BPYnNlcnZlPy4oKTsgfSBjYXRjaCB7IH0gcmV0dXJuOyB9XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicpLmZvckVhY2goaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicpLmZvckVhY2goaW5qZWN0UHJpY2luZ0NvbnRyb2xzKTtcblxuICAgIGZ1bmN0aW9uIGluamVjdFByaWNpbmdDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCF1bCB8fCB1bC5kYXRhc2V0LnF0MzBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDMwSW5qZWN0ZWQgPSAnMSc7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGxpLmlkID0gJ2x0LWFwcGx5LWNhdGFsb2ctcHJpY2luZyc7XG4gICAgICAgICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYS5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBhLnRleHRDb250ZW50ID0gJ0xUIEFwcGx5IENhdGFsb2cgUHJpY2luZyc7XG4gICAgICAgICAgICBhLnRpdGxlID0gJ0NsaWNrIHRvIGFwcGx5IGN1c3RvbWVyIHNwZWNpZmljIGNhdGFsb2cgcHJpY2luZyc7XG4gICAgICAgICAgICBhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdBcHBseSBjYXRhbG9nIHByaWNpbmcnKTtcbiAgICAgICAgICAgIGEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhLnN0eWxlLCB7IGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAnZmlsdGVyIC4xNXMsIHRleHREZWNvcmF0aW9uQ29sb3I6IC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBpZiAoUy5lbmFibGVIb3ZlckFmZm9yZGFuY2UpIHtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGEuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBhLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgYS5zdHlsZS5maWx0ZXIgPSAnJzsgYS5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBhLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBhLnN0eWxlLm91dGxpbmUgPSAnJzsgYS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUFwcGx5Q2xpY2soYSkpO1xuICAgICAgICAgICAgbGkuYXBwZW5kQ2hpbGQoYSk7IHVsLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgICAgICAgIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgQ09ORklHLndpemFyZFRhcmdldFBhZ2UpO1xuICAgICAgICAgICAgbG9nKCdRVDMwOiBidXR0b24gaW5qZWN0ZWQnKTtcbiAgICAgICAgfSBjYXRjaCAoZSkgeyBlcnIoJ1FUMzAgaW5qZWN0OicsIGUpOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd09ubHlPblBhcnRTdW1tYXJ5KGxpLCB0YXJnZXROYW1lKSB7XG4gICAgICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHZtID0gYWN0aXZlRWwgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZUVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCBuYW1lID0gdm0gPyBLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkgOiAnJztcbiAgICAgICAgICAgIGlmIChuYW1lKSByZXR1cm4gU3RyaW5nKG5hbWUpO1xuICAgICAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgdG9nZ2xlID0gKCkgPT4geyBsaS5zdHlsZS5kaXNwbGF5ID0gKGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWUpID8gJycgOiAnbm9uZSc7IH07XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIodG9nZ2xlKS5vYnNlcnZlKG5hdiwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUgfSk7XG4gICAgICAgIHRvZ2dsZSgpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gTWFpbiBoYW5kbGVyIChmdWxseSBwb3J0ZWQpIC0tLS0tLS0tLS1cbiAgICBhc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseUNsaWNrKGJ0bikge1xuICAgICAgICBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgY29uc3QgcmVzdG9yZSA9ICgpID0+IHsgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnJzsgfTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGV2VG9hc3QoJ1x1MjNGMyBBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycsIDUwMDApO1xuICAgICAgICAgICAgaWYgKCEoYXdhaXQgZW5zdXJlQXV0aE9yVG9hc3QoKSkpIHRocm93IG5ldyBFcnJvcignTm8gQVBJIGtleS9zZXNzaW9uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHF1b3RlS2V5ID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XG4gICAgICAgICAgICBpZiAoIXF1b3RlS2V5KSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlX0tleSBtaXNzaW5nJyk7XG5cbiAgICAgICAgICAgIC8vIDEpIENhdGFsb2cga2V5IChyZXBvLWNhY2hlZClcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxdW90ZUtleSk7XG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyKCk7XG4gICAgICAgICAgICBsZXQgY2F0YWxvZ0tleSA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUoaGVhZGVyLCBbJ0NhdGFsb2dfS2V5JywgJ0NhdGFsb2dLZXknXSwgeyBmaXJzdDogdHJ1ZSB9KSA/PyBudWxsO1xuXG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHtcbiAgICAgICAgICAgICAgICBkZXZUb2FzdCgnXHUyM0YzIEZldGNoaW5nIENhdGFsb2cgS2V5XHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzMSA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT5cbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQ2F0YWxvZ0tleUJ5UXVvdGVLZXksIHsgUXVvdGVfS2V5OiBxdW90ZUtleSB9KVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY2F0YWxvZ0tleSA9IHJvd3MxPy5bMF0/LkNhdGFsb2dfS2V5IHx8IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKGNhdGFsb2dLZXkpIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7IFF1b3RlX0tleTogTnVtYmVyKHF1b3RlS2V5KSwgQ2F0YWxvZ19LZXk6IE51bWJlcihjYXRhbG9nS2V5KSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7IGRldlRvYXN0KG9uZU9mKE5PX0NBVEFMT0dfTUVTU0FHRVMpLCAnd2FybicsIDUwMDApOyByZXR1cm47IH1cbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3MDUgQ2F0YWxvZyBLZXk6ICR7Y2F0YWxvZ0tleX1gLCAnc3VjY2VzcycsIDE4MDApO1xuXG4gICAgICAgICAgICAvLyAyKSBCcmVha3BvaW50cyBieSBwYXJ0XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXG4gICAgICAgICAgICAvLyBBY3F1aXJlIEtPIGdyaWQgcm93cyBhdCBjbGljayB0aW1lXG4gICAgICAgICAgICBjb25zdCByYXcgPSAoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3IDogW107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnROb3MgPSBbLi4ubmV3IFNldChcbiAgICAgICAgICAgICAgICByYXcubWFwKChyKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsIFwiUGFydE5vXCIsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgICldO1xuXG4gICAgICAgICAgICBpZiAoIXBhcnROb3MubGVuZ3RoKSB7IGRldlRvYXN0KCdcdTI2QTBcdUZFMEYgTm8gUGFydE5vIHZhbHVlcyBmb3VuZCcsICd3YXJuJywgNDAwMCk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyM0YzIExvYWRpbmcgJHtwYXJ0Tm9zLmxlbmd0aH0gcGFydChzKVx1MjAyNmAsICdpbmZvJyk7XG4gICAgICAgICAgICBjb25zdCBwcmljZU1hcCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocGFydE5vcy5tYXAoYXN5bmMgKHApID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PlxuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19CcmVha3BvaW50c0J5UGFydCwgeyBDYXRhbG9nX0tleTogY2F0YWxvZ0tleSwgQ2F0YWxvZ19QYXJ0X05vOiBwIH0pXG4gICAgICAgICAgICAgICAgKSB8fCBbXTtcbiAgICAgICAgICAgICAgICBwcmljZU1hcFtwXSA9IHJvd3NcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IHIuQ2F0YWxvZ19QYXJ0X05vID09PSBwICYmIG5ldyBEYXRlKHIuRWZmZWN0aXZlX0RhdGUpIDw9IG5vdyAmJiBub3cgPD0gbmV3IERhdGUoci5FeHBpcmF0aW9uX0RhdGUpKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5CcmVha3BvaW50X1F1YW50aXR5IC0gYi5CcmVha3BvaW50X1F1YW50aXR5KTtcbiAgICAgICAgICAgICAgICBsb2coYFFUMzA6IGxvYWRlZCAke3ByaWNlTWFwW3BdLmxlbmd0aH0gYnJlYWtwb2ludHMgZm9yICR7cH1gKTtcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLy8gMykgQXBwbHkgb3IgZGVsZXRlIHBlciByb3dcbiAgICAgICAgICAgIGRldlRvYXN0KCdcdTIzRjMgQXBwbHlpbmcgcHJpY2VzXHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IFMgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGNvbnN0IHJvdW5kID0gKG4pID0+ICsoK24pLnRvRml4ZWQoUy51bml0UHJpY2VEZWNpbWFscyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlID0gbG9jYXRpb24ub3JpZ2luO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJhdy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJhd1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBxdHkgPSArKFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVhbnRpdHknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pIHx8IDApO1xuXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHplcm8tcXR5IHJvd3MgKHBvcnRlZClcbiAgICAgICAgICAgICAgICBpZiAocXR5IDw9IDAgJiYgUy5kZWxldGVaZXJvUXR5Um93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVLZXknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1F1b3RlUGFydEtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwciA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVvdGVQcmljZUtleScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHFrICYmIHFwayAmJiBxcHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgbHQuY29yZS5odHRwLnBvc3QoJy9TYWxlc0FuZENSTS9RdW90ZVBhcnQvRGVsZXRlUXVvdGVQcmljZScsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcXVvdGVLZXk6IHFrLCBxdW90ZVBhcnRLZXk6IHFwaywgcXVvdGVQcmljZUtleTogcXByXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2sgPSAocmVzPy5vayA9PT0gdHJ1ZSkgfHwgKHJlcz8uc3RhdHVzID49IDIwMCAmJiByZXM/LnN0YXR1cyA8IDMwMCk7IC8vIFRNVXRpbHMuZmV0Y2hEYXRhIHJldHVybnMgYm9keTsgZmFsbGJhY2sgaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGV2VG9hc3Qob2sgPyBgXHVEODNEXHVEREQxIERlbGV0ZWQgcm93WyR7aX1dYCA6IGBcdTI3NEMgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCBvayA/ICdzdWNjZXNzJyA6ICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgRGVsZXRlIGVycm9yIHJvd1ske2l9XWAsICdlcnJvcicsIDYwMDApOyBlcnIoJ1FUMzAgZGVsZXRlIGVycm9yJywgZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcHJpY2VcbiAgICAgICAgICAgICAgICBpZiAocXR5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gcGlja1ByaWNlKHByaWNlTWFwW3BhcnROb10sIHF0eSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicCA9PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlQcmljZVRvUm93KHJvdywgcm91bmQoYnApKTtcbiAgICAgICAgICAgICAgICAgICAgbG9nKGBRVDMwOiByb3dbJHtpfV0gcXR5PSR7cXR5fSBwcmljZT0ke3JvdW5kKGJwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIDQpIFJlZnJlc2ggd2l6YXJkIHNvIFVJIHJlZmxlY3RzIGNoYW5nZXMgKHBvcnRlZClcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnID0gd2l6Lm5hdmlnYXRlUGFnZS5iaW5kKHdpeik7XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZSA9IChwYWdlKSA9PiB7IGNvbnN0IHJldCA9IG9yaWcocGFnZSk7IHNldFRpbWVvdXQoKCkgPT4gZGV2VG9hc3QoJ1x1RDgzQ1x1REY4OSBBbGwgdXBkYXRlZCEnLCAnc3VjY2VzcycpLCA4MDApOyByZXR1cm4gcmV0OyB9O1xuICAgICAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2Uod2l6LmFjdGl2ZVBhZ2UoKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRldlRvYXN0KCdcdUQ4M0NcdURGODkgQWxsIHVwZGF0ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBkZXZUb2FzdChgXHUyNzRDICR7ZS5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJywgODAwMCk7IGVycignUVQzMDonLCBlKTtcbiAgICAgICAgfSBmaW5hbGx5IHsgcmVzdG9yZSgpOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cblxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwaWNrUHJpY2UoYnBzLCBxdHkpIHtcbiAgICAgICAgaWYgKCFicHM/Lmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChxdHkgPCBicHNbMF0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1swXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBjb25zdCBsYXN0ID0gYnBzW2Jwcy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKHF0eSA+PSBsYXN0LkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBsYXN0LkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnBzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHF0eSA+PSBicHNbaV0uQnJlYWtwb2ludF9RdWFudGl0eSAmJiBxdHkgPCBicHNbaSArIDFdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbaV0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gYXBwbHlQcmljZVRvUm93KHJvdywgcHJpY2UpIHtcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZShyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnLCBwcmljZSk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBNZXNzYWdlcyAocG9ydGVkKSAtLS0tLS0tLS0tXG4gICAgY29uc3QgTk9fQ0FUQUxPR19NRVNTQUdFUyA9IFtcbiAgICAgICAgJ1x1RDgzRFx1REVBQiBObyBjYXRhbG9nIHNlbGVjdGVkIFx1MjAxMyBjYW5ub3QgZmV0Y2ggcHJpY2VzLicsXG4gICAgICAgICdcdTI2QTBcdUZFMEYgTWlzc2luZyBjdXN0b21lciBjYXRhbG9nIFx1MjAxMyBwcmljaW5nIHNraXBwZWQuJyxcbiAgICAgICAgJ1x1RDgzRFx1REQwRCBObyBjYXRhbG9nIGZvdW5kIFx1MjAxMyBwcmljZXMgdW5hdmFpbGFibGUuJyxcbiAgICAgICAgJ1x1Mjc1NyBDYXRhbG9nIG5vdCBzZXQgXHUyMDEzIHBsZWFzZSBwaWNrIGEgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVERUQxIENhbm5vdCBsb2FkIHByaWNlcyB3aXRob3V0IGEgY3VzdG9tZXIgY2F0YWxvZy4nLFxuICAgICAgICAnXHVEODNEXHVEQ0RCIE5vIGNhdGFsb2cga2V5IFx1MjAxMyB1bmFibGUgdG8gbG9va3VwIHByaWNlcy4nLFxuICAgICAgICAnXHUyNkEwXHVGRTBGIFByaWNlcyByZXF1aXJlIGEgY2F0YWxvZyBcdTIwMTMgbm9uZSBjb25maWd1cmVkLicsXG4gICAgICAgICdcdUQ4M0RcdURFQTggTm8gY2F0YWxvZyBkZXRlY3RlZCBcdTIwMTMgc2tpcHBpbmcgcHJpY2UgbG9va3VwLicsXG4gICAgICAgICdcdTIxMzlcdUZFMEYgU2VsZWN0IGEgY2F0YWxvZyBmaXJzdCB0byByZXRyaWV2ZSBwcmljaW5nLicsXG4gICAgICAgICdcdUQ4M0RcdURFNDggTm8gY2F0YWxvZyBjaG9zZW4gXHUyMDEzIGhpZGluZyBwcmljZSBmZXRjaC4nXG4gICAgXTtcbiAgICBjb25zdCBvbmVPZiA9IChhcnIpID0+IGFycltNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnIubGVuZ3RoKV07XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBoYW5kbGVBcHBseUNsaWNrIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTSxNQUFPLE9BQ1AsT0FDQSxDQUFDLEVBQUUsT0FBTyxlQUFlLGVBQWUsV0FBVztBQUV6RCxHQUFDLE1BQU07QUFFSCxVQUFNLFNBQVM7QUFBQSxNQUNYLHlCQUF5QjtBQUFBLE1BQ3pCLHNCQUFzQjtBQUFBLE1BQ3RCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxNQUNULGtCQUFrQjtBQUFBLE1BQ2xCLGFBQWE7QUFBQSxNQUNiLFVBQVUsRUFBRSxtQkFBbUIsTUFBTSxtQkFBbUIsR0FBRyx1QkFBdUIsS0FBSztBQUFBLElBQzNGO0FBR0EsVUFBTSxVQUFVLHdCQUF3QixLQUFLLFNBQVMsUUFBUTtBQUM5RCxZQUFRLFdBQVcsT0FBTztBQUMxQixVQUFNLElBQUksUUFBUSxZQUFZLE1BQU07QUFDcEMsVUFBTSxNQUFNLElBQUksTUFBTTtBQUFFLFVBQUksT0FBTyxRQUFTLElBQUcsTUFBTSxHQUFHLENBQUM7QUFBQSxJQUFHO0FBQzVELFVBQU0sT0FBTyxJQUFJLE1BQU07QUFBRSxVQUFJLE9BQU8sUUFBUyxJQUFHLE9BQU8sR0FBRyxDQUFDO0FBQUEsSUFBRztBQUM5RCxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFBRyxRQUFRLEdBQUcsQ0FBQztBQUFBLElBQUc7QUFDOUQsVUFBTSxLQUFNLE9BQU8saUJBQWlCLGVBQWUsYUFBYSxLQUFNLGFBQWEsS0FBSyxPQUFPO0FBQy9GLFVBQU0sU0FBUyxDQUFDLHNDQUFzQztBQUN0RCxRQUFJLENBQUMsT0FBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDLEdBQUc7QUFBRSxVQUFJLDZCQUE2QjtBQUFHO0FBQUEsSUFBUTtBQUVsRyxLQUFDLFlBQVk7QUFFVCxZQUFNLE9BQU8sTUFBTSxPQUFPLGVBQWU7QUFDekMsWUFBTSxTQUFTO0FBQUEsUUFDWCxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixTQUFTLE1BQU0scUJBQXFCO0FBQUEsTUFDeEMsQ0FBQztBQUFBLElBQ0wsR0FBRztBQUtILFFBQUksS0FBSztBQUNULG1CQUFlLFVBQVUsWUFBWSxLQUFPO0FBQ3hDLFlBQU0sUUFBUSxLQUFLLElBQUk7QUFDdkIsYUFBTyxLQUFLLElBQUksSUFBSSxRQUFRLFdBQVc7QUFDbkMsY0FBTSxLQUFNLE9BQU8saUJBQWlCLGNBQWMsYUFBYSxLQUFLLE9BQU87QUFDM0UsWUFBSSxJQUFJLE1BQU0sTUFBTSxtQkFBbUI7QUFDbkMsY0FBSSxHQUFHLEtBQUssS0FBSyxtQkFBb0IsUUFBTyxHQUFHLEtBQUs7QUFBQSxRQUN4RDtBQUNBLGVBQU8sUUFBUSxRQUFRLEVBQUUsS0FBSyxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDcEU7QUFDQSxZQUFNLElBQUksTUFBTSxvQkFBb0I7QUFBQSxJQUN4QztBQUNBLG1CQUFlLFFBQVE7QUFDbkIsVUFBSSxHQUFJLFFBQU87QUFDZixZQUFNLEtBQUssTUFBTSxVQUFVO0FBQzNCLFVBQUksQ0FBQyxHQUFHLG9CQUFvQjtBQUFFLGVBQU8sUUFBUSxRQUFRLEVBQUUsS0FBSyxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFBSTtBQUNsRyxXQUFLLEdBQUcsbUJBQW1CLEVBQUUsSUFBSSxNQUFNLFFBQVEsU0FBUyxjQUFjLGNBQWMsQ0FBQztBQUNyRixhQUFPO0FBQUEsSUFDWDtBQUdBLFFBQUksWUFBWSxNQUFNLFlBQVk7QUFDbEMsbUJBQWUsbUJBQW1CLElBQUk7QUFDbEMsVUFBSSxDQUFDLEdBQUksUUFBTztBQUNoQixVQUFJLENBQUMsYUFBYSxjQUFjLElBQUk7QUFDaEMsY0FBTSxFQUFFLEtBQUssS0FBSyxNQUFNLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBQy9DLGNBQU0sS0FBSywwQkFBMEI7QUFDckMsb0JBQVk7QUFBTSxvQkFBWTtBQUFBLE1BQ2xDO0FBQ0EsYUFBTztBQUFBLElBQ1g7QUFLQSxVQUFNLGVBQWUsTUFBTTtBQUN2QixVQUFJO0FBQ0EsY0FBTSxJQUFJLFlBQVksT0FBTyxhQUFhLE9BQU8sUUFBUTtBQUN6RCxlQUFPLE9BQU8sTUFBTSxXQUFXLEVBQUUsR0FBRyxPQUFPLFVBQVUsR0FBRyxLQUFLLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLE9BQU8sVUFBVSxHQUFHLEVBQUU7QUFBQSxNQUN6RyxRQUFRO0FBQUUsZUFBTyxFQUFFLEdBQUcsT0FBTyxTQUFTO0FBQUEsTUFBRztBQUFBLElBQzdDO0FBQ0EsVUFBTSxlQUFlLENBQUMsU0FBUztBQUMzQixVQUFJO0FBQUUsb0JBQVksT0FBTyxhQUFhLElBQUk7QUFBQSxNQUFHLFFBQ3ZDO0FBQUUsb0JBQVksT0FBTyxhQUFhLEtBQUssVUFBVSxJQUFJLENBQUM7QUFBQSxNQUFHO0FBQUEsSUFDbkU7QUFHQSxhQUFTLFNBQVMsS0FBSyxRQUFRLFFBQVEsS0FBSyxPQUFPLFNBQVM7QUFDeEQsVUFBSTtBQUFFLGdCQUFRLFFBQVEsS0FBSyxPQUFPLEVBQUU7QUFBRyxZQUFJLElBQUssU0FBUSxNQUFNLHFCQUFxQixPQUFPLEdBQUc7QUFBRztBQUFBLE1BQVEsUUFBUTtBQUFBLE1BQUU7QUFDbEgsVUFBSSxDQUFDLElBQUs7QUFDVixZQUFNLEtBQUssU0FBUyxjQUFjLEtBQUs7QUFDdkMsYUFBTyxPQUFPLEdBQUcsT0FBTztBQUFBLFFBQ3BCLFVBQVU7QUFBQSxRQUFTLE9BQU87QUFBQSxRQUFRLFFBQVE7QUFBQSxRQUFRLFFBQVE7QUFBQSxRQUMxRCxTQUFTO0FBQUEsUUFBYSxjQUFjO0FBQUEsUUFBTyxXQUFXO0FBQUEsUUFDdEQsTUFBTTtBQUFBLFFBQXVDLE9BQU87QUFBQSxRQUNwRCxZQUFZLFVBQVUsWUFBWSxZQUFZLFVBQVUsU0FBUyxZQUFZLFVBQVUsVUFBVSxZQUFZO0FBQUEsUUFDN0csWUFBWTtBQUFBLFFBQVksVUFBVTtBQUFBLE1BQ3RDLENBQUM7QUFDRCxTQUFHLGNBQWMsT0FBTyxHQUFHO0FBQUcsZUFBUyxLQUFLLFlBQVksRUFBRTtBQUFHLGlCQUFXLE1BQU0sR0FBRyxPQUFPLEdBQUcsTUFBTSxJQUFJO0FBQUEsSUFDekc7QUFHQSxtQkFBZSxvQkFBb0I7QUFDL0IsVUFBSTtBQUFFLGNBQU0sTUFBTSxNQUFNLEdBQUcsS0FBSyxLQUFLLE9BQU87QUFBRyxZQUFJLElBQUssUUFBTztBQUFBLE1BQU0sUUFBUTtBQUFBLE1BQUU7QUFDL0UsZUFBUyxzREFBc0QsUUFBUSxHQUFJO0FBQzNFLGFBQU87QUFBQSxJQUNYO0FBRUEsbUJBQWUsY0FBYyxLQUFLO0FBQzlCLFVBQUk7QUFBRSxlQUFPLE1BQU0sSUFBSTtBQUFBLE1BQUcsU0FDbkIsR0FBRztBQUNOLGNBQU0sU0FBUyxFQUFFLEdBQUcsV0FBVyxjQUFjLEtBQUssR0FBRyxXQUFXLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLO0FBQ2pGLFlBQUksV0FBVyxLQUFLO0FBQUUsY0FBSTtBQUFFLGtCQUFNLFFBQVEsWUFBWSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsVUFBRyxRQUFRO0FBQUEsVUFBRTtBQUFFLGlCQUFPLE1BQU0sSUFBSTtBQUFBLFFBQUc7QUFDeEcsY0FBTTtBQUFBLE1BQ1Y7QUFBQSxJQUNKO0FBSUEsVUFBTSxjQUFjLFFBQVEsb0JBQW9CLCtCQUErQixxQkFBcUIsS0FDN0YsUUFBUSxnQkFBZ0IsK0JBQStCLHFCQUFxQjtBQUVuRixZQUFRLGNBQWMsTUFBTTtBQUN4QixVQUFJLENBQUMsT0FBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDLEdBQUc7QUFBRSxZQUFJO0FBQUUsd0JBQWM7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFFO0FBQUU7QUFBQSxNQUFRO0FBQ2pHLGVBQVMsaUJBQWlCLDZCQUE2QixFQUFFLFFBQVEscUJBQXFCO0FBQUEsSUFDMUYsQ0FBQztBQUVELGFBQVMsaUJBQWlCLDZCQUE2QixFQUFFLFFBQVEscUJBQXFCO0FBRXRGLGFBQVMsc0JBQXNCLElBQUk7QUFDL0IsVUFBSTtBQUNBLFlBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxhQUFjO0FBQ3BDLFdBQUcsUUFBUSxlQUFlO0FBRTFCLGNBQU0sS0FBSyxTQUFTLGNBQWMsSUFBSTtBQUN0QyxXQUFHLEtBQUs7QUFDUixXQUFHLE1BQU0sVUFBVTtBQUVuQixjQUFNLElBQUksU0FBUyxjQUFjLEdBQUc7QUFDcEMsVUFBRSxPQUFPO0FBQ1QsVUFBRSxjQUFjO0FBQ2hCLFVBQUUsUUFBUTtBQUNWLFVBQUUsYUFBYSxjQUFjLHVCQUF1QjtBQUNwRCxVQUFFLGFBQWEsUUFBUSxRQUFRO0FBQy9CLGVBQU8sT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLFdBQVcsWUFBWSx5Q0FBeUMsQ0FBQztBQUVsRyxjQUFNLElBQUksYUFBYTtBQUN2QixZQUFJLEVBQUUsdUJBQXVCO0FBQ3pCLFlBQUUsaUJBQWlCLGNBQWMsTUFBTTtBQUFFLGNBQUUsTUFBTSxTQUFTO0FBQW9CLGNBQUUsTUFBTSxpQkFBaUI7QUFBQSxVQUFhLENBQUM7QUFDckgsWUFBRSxpQkFBaUIsY0FBYyxNQUFNO0FBQUUsY0FBRSxNQUFNLFNBQVM7QUFBSSxjQUFFLE1BQU0saUJBQWlCO0FBQUEsVUFBSSxDQUFDO0FBQzVGLFlBQUUsaUJBQWlCLFNBQVMsTUFBTTtBQUFFLGNBQUUsTUFBTSxVQUFVO0FBQXFCLGNBQUUsTUFBTSxnQkFBZ0I7QUFBQSxVQUFPLENBQUM7QUFDM0csWUFBRSxpQkFBaUIsUUFBUSxNQUFNO0FBQUUsY0FBRSxNQUFNLFVBQVU7QUFBSSxjQUFFLE1BQU0sZ0JBQWdCO0FBQUEsVUFBSSxDQUFDO0FBQUEsUUFDMUY7QUFDQSxVQUFFLGlCQUFpQixTQUFTLE1BQU0saUJBQWlCLENBQUMsQ0FBQztBQUNyRCxXQUFHLFlBQVksQ0FBQztBQUFHLFdBQUcsWUFBWSxFQUFFO0FBQ3BDLDhCQUFzQixJQUFJLE9BQU8sZ0JBQWdCO0FBQ2pELFlBQUksdUJBQXVCO0FBQUEsTUFDL0IsU0FBUyxHQUFHO0FBQUUsWUFBSSxnQkFBZ0IsQ0FBQztBQUFBLE1BQUc7QUFBQSxJQUMxQztBQUVBLGFBQVMsc0JBQXNCLElBQUksWUFBWTtBQUMzQyxZQUFNLDBCQUEwQixNQUFNO0FBQ2xDLGNBQU0sV0FBVyxTQUFTLGNBQWMsa0VBQWtFO0FBQzFHLGNBQU0sS0FBSyxXQUFXLElBQUksVUFBVSxRQUFRLElBQUk7QUFDaEQsY0FBTSxPQUFPLEtBQUssSUFBSSxTQUFTLEdBQUcsSUFBSSxNQUFNLE9BQU8sR0FBRyxTQUFTLGFBQWEsR0FBRyxLQUFLLElBQUksR0FBRyxRQUFRO0FBQ25HLFlBQUksS0FBTSxRQUFPLE9BQU8sSUFBSTtBQUM1QixjQUFNQSxPQUFNLFNBQVMsY0FBYyw4RUFBOEU7QUFDakgsZ0JBQVFBLE1BQUssZUFBZSxJQUFJLEtBQUs7QUFBQSxNQUN6QztBQUNBLFlBQU0sU0FBUyxNQUFNO0FBQUUsV0FBRyxNQUFNLFVBQVcsd0JBQXdCLE1BQU0sYUFBYyxLQUFLO0FBQUEsTUFBUTtBQUNwRyxZQUFNLE1BQU0sU0FBUyxjQUFjLHdCQUF3QjtBQUMzRCxVQUFJLElBQUssS0FBSSxpQkFBaUIsTUFBTSxFQUFFLFFBQVEsS0FBSyxFQUFFLFdBQVcsTUFBTSxTQUFTLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFDdkcsYUFBTztBQUFBLElBQ1g7QUFHQSxtQkFBZSxpQkFBaUIsS0FBSztBQUNqQyxVQUFJLE1BQU0sZ0JBQWdCO0FBQVEsVUFBSSxNQUFNLFVBQVU7QUFDdEQsWUFBTSxVQUFVLE1BQU07QUFBRSxZQUFJLE1BQU0sZ0JBQWdCO0FBQUksWUFBSSxNQUFNLFVBQVU7QUFBQSxNQUFJO0FBRTlFLFVBQUk7QUFDQSxpQkFBUyx5Q0FBK0IsUUFBUSxHQUFJO0FBQ3BELFlBQUksQ0FBRSxNQUFNLGtCQUFrQixFQUFJLE9BQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUV0RSxjQUFNLFdBQVcseUJBQXlCO0FBQzFDLFlBQUksQ0FBQyxTQUFVLE9BQU0sSUFBSSxNQUFNLG1CQUFtQjtBQUdsRCxjQUFNLG1CQUFtQixRQUFRO0FBQ2pDLGNBQU0sU0FBUyxNQUFNLFVBQVUsVUFBVTtBQUN6QyxZQUFJLGFBQWEsUUFBUSxZQUFZLFFBQVEsQ0FBQyxlQUFlLFlBQVksR0FBRyxFQUFFLE9BQU8sS0FBSyxDQUFDLEtBQUs7QUFFaEcsWUFBSSxDQUFDLFlBQVk7QUFDYixtQkFBUyxxQ0FBMkIsTUFBTTtBQUMxQyxnQkFBTSxRQUFRLE1BQU07QUFBQSxZQUFjLE1BQzlCLEdBQUcsS0FBSyxLQUFLLE9BQU8sT0FBTyx5QkFBeUIsRUFBRSxXQUFXLFNBQVMsQ0FBQztBQUFBLFVBQy9FO0FBQ0EsdUJBQWEsUUFBUSxDQUFDLEdBQUcsZUFBZTtBQUN4QyxjQUFJLFdBQVksT0FBTSxVQUFVLFlBQVksRUFBRSxXQUFXLE9BQU8sUUFBUSxHQUFHLGFBQWEsT0FBTyxVQUFVLEVBQUUsQ0FBQztBQUFBLFFBQ2hIO0FBRUEsWUFBSSxDQUFDLFlBQVk7QUFBRSxtQkFBUyxNQUFNLG1CQUFtQixHQUFHLFFBQVEsR0FBSTtBQUFHO0FBQUEsUUFBUTtBQUMvRSxpQkFBUyx1QkFBa0IsVUFBVSxJQUFJLFdBQVcsSUFBSTtBQUd4RCxjQUFNLE1BQU0sb0JBQUksS0FBSztBQUdyQixjQUFNLE9BQU8sTUFBTTtBQUNmLGNBQUk7QUFDQSxrQkFBTSxPQUFPLFNBQVMsY0FBYyxPQUFPLFFBQVE7QUFDbkQsZ0JBQUksUUFBUSxJQUFJLFNBQVM7QUFDckIsb0JBQU0sU0FBUyxHQUFHLFFBQVEsSUFBSTtBQUM5QixxQkFBTyxNQUFNLFFBQVEsUUFBUSxZQUFZLEdBQUcsSUFBSSxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQUEsWUFDN0U7QUFBQSxVQUNKLFFBQVE7QUFBQSxVQUFFO0FBQ1YsaUJBQU8sQ0FBQztBQUFBLFFBQ1osR0FBRztBQUVILGNBQU0sVUFBVSxDQUFDLEdBQUcsSUFBSTtBQUFBLFVBQ3BCLElBQUksSUFBSSxDQUFDLE1BQU0sUUFBUSxZQUFZLEdBQUcsVUFBVSxFQUFFLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQyxDQUFDLEVBQ3ZFLE9BQU8sT0FBTztBQUFBLFFBQ3ZCLENBQUM7QUFFRCxZQUFJLENBQUMsUUFBUSxRQUFRO0FBQUUsbUJBQVMsdUNBQTZCLFFBQVEsR0FBSTtBQUFHO0FBQUEsUUFBUTtBQUVwRixpQkFBUyxrQkFBYSxRQUFRLE1BQU0sa0JBQWEsTUFBTTtBQUN2RCxjQUFNLFdBQVcsQ0FBQztBQUNsQixjQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksT0FBTyxNQUFNO0FBQ3ZDLGdCQUFNLE9BQU8sTUFBTTtBQUFBLFlBQWMsTUFDN0IsR0FBRyxLQUFLLEtBQUssT0FBTyxPQUFPLHNCQUFzQixFQUFFLGFBQWEsWUFBWSxpQkFBaUIsRUFBRSxDQUFDO0FBQUEsVUFDcEcsS0FBSyxDQUFDO0FBQ04sbUJBQVMsQ0FBQyxJQUFJLEtBQ1QsT0FBTyxPQUFLLEVBQUUsb0JBQW9CLEtBQUssSUFBSSxLQUFLLEVBQUUsY0FBYyxLQUFLLE9BQU8sT0FBTyxJQUFJLEtBQUssRUFBRSxlQUFlLENBQUMsRUFDOUcsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLHNCQUFzQixFQUFFLG1CQUFtQjtBQUNqRSxjQUFJLGdCQUFnQixTQUFTLENBQUMsRUFBRSxNQUFNLG9CQUFvQixDQUFDLEVBQUU7QUFBQSxRQUNqRSxDQUFDLENBQUM7QUFHRixpQkFBUyxnQ0FBc0IsTUFBTTtBQUNyQyxjQUFNLElBQUksYUFBYTtBQUN2QixjQUFNLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLFFBQVEsRUFBRSxpQkFBaUI7QUFDdEQsY0FBTSxPQUFPLFNBQVM7QUFFdEIsaUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxRQUFRLEtBQUs7QUFDakMsZ0JBQU0sTUFBTSxJQUFJLENBQUM7QUFDakIsZ0JBQU0sTUFBTSxFQUFFLFFBQVEsWUFBWSxLQUFLLFlBQVksRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUMsS0FBSztBQUduRixjQUFJLE9BQU8sS0FBSyxFQUFFLG1CQUFtQjtBQUNqQyxrQkFBTSxLQUFLLFFBQVEsWUFBWSxLQUFLLFlBQVksRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFDM0Usa0JBQU0sTUFBTSxRQUFRLFlBQVksS0FBSyxnQkFBZ0IsRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFDaEYsa0JBQU0sTUFBTSxRQUFRLFlBQVksS0FBSyxpQkFBaUIsRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFFakYsZ0JBQUksTUFBTSxPQUFPLEtBQUs7QUFDbEIsa0JBQUk7QUFDQSxzQkFBTSxNQUFNLE1BQU0sR0FBRyxLQUFLLEtBQUssS0FBSywyQ0FBMkM7QUFBQSxrQkFDM0UsVUFBVTtBQUFBLGtCQUFJLGNBQWM7QUFBQSxrQkFBSyxlQUFlO0FBQUEsZ0JBQ3BELENBQUM7QUFDRCxzQkFBTSxLQUFNLEtBQUssT0FBTyxRQUFVLEtBQUssVUFBVSxPQUFPLEtBQUssU0FBUztBQUN0RSx5QkFBUyxLQUFLLHlCQUFrQixDQUFDLE1BQU0sNEJBQXVCLENBQUMsS0FBSyxLQUFLLFlBQVksT0FBTztBQUFBLGNBQ2hHLFNBQVMsR0FBRztBQUNSLHlCQUFTLDJCQUFzQixDQUFDLEtBQUssU0FBUyxHQUFJO0FBQUcsb0JBQUkscUJBQXFCLENBQUM7QUFBQSxjQUNuRjtBQUFBLFlBQ0o7QUFDQTtBQUFBLFVBQ0o7QUFHQSxjQUFJLE1BQU0sR0FBRztBQUNULGtCQUFNLFNBQVMsUUFBUSxZQUFZLEtBQUssVUFBVSxFQUFFLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQztBQUM3RSxrQkFBTSxLQUFLLFVBQVUsU0FBUyxNQUFNLEdBQUcsR0FBRztBQUMxQyxnQkFBSSxNQUFNLEtBQU07QUFDaEIsNEJBQWdCLEtBQUssTUFBTSxFQUFFLENBQUM7QUFDOUIsZ0JBQUksYUFBYSxDQUFDLFNBQVMsR0FBRyxVQUFVLE1BQU0sRUFBRSxDQUFDLEVBQUU7QUFBQSxVQUN2RDtBQUFBLFFBQ0o7QUFHQSxjQUFNLE1BQU0sYUFBYSxNQUFNLGFBQWE7QUFDNUMsWUFBSSxLQUFLLGNBQWM7QUFDbkIsZ0JBQU0sT0FBTyxJQUFJLGFBQWEsS0FBSyxHQUFHO0FBQ3RDLGNBQUksZUFBZSxDQUFDLFNBQVM7QUFBRSxrQkFBTSxNQUFNLEtBQUssSUFBSTtBQUFHLHVCQUFXLE1BQU0sU0FBUywwQkFBbUIsU0FBUyxHQUFHLEdBQUc7QUFBRyxtQkFBTztBQUFBLFVBQUs7QUFDbEksY0FBSSxhQUFhLElBQUksV0FBVyxDQUFDO0FBQUEsUUFDckMsT0FBTztBQUNILG1CQUFTLDBCQUFtQixTQUFTO0FBQUEsUUFDekM7QUFBQSxNQUVKLFNBQVMsR0FBRztBQUNSLGlCQUFTLFVBQUssRUFBRSxXQUFXLENBQUMsSUFBSSxTQUFTLEdBQUk7QUFBRyxZQUFJLFNBQVMsQ0FBQztBQUFBLE1BQ2xFLFVBQUU7QUFBVSxnQkFBUTtBQUFBLE1BQUc7QUFBQSxJQUMzQjtBQUlBLGFBQVMsMkJBQTJCO0FBQ2hDLFVBQUk7QUFDQSxjQUFNLE9BQU8sU0FBUyxjQUFjLE9BQU8sUUFBUTtBQUNuRCxZQUFJLFFBQVEsSUFBSSxTQUFTO0FBQ3JCLGdCQUFNLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDOUIsZ0JBQU0sT0FBTyxNQUFNLFFBQVEsUUFBUSxZQUFZLEdBQUcsSUFBSSxPQUFPLFdBQVcsSUFBSSxDQUFDLElBQUk7QUFDakYsZ0JBQU0sSUFBSSxPQUFPLE9BQU8sU0FBUyxjQUFjLE1BQU0sVUFBVSxJQUFJO0FBQ25FLGNBQUksS0FBSyxLQUFNLFFBQU8sT0FBTyxDQUFDO0FBQUEsUUFDbEM7QUFBQSxNQUNKLFFBQVE7QUFBQSxNQUFFO0FBQ1YsVUFBSTtBQUNBLGNBQU0sU0FBUyxTQUFTLGNBQWMsMEJBQTBCO0FBQ2hFLGNBQU0sU0FBUyxTQUFTLElBQUksVUFBVSxNQUFNLElBQUk7QUFDaEQsY0FBTSxJQUFJLFdBQVcsT0FBTyxTQUFTLGNBQWMsUUFBUSxVQUFVLEtBQUssT0FBTyxTQUFTLGNBQWMsUUFBUSxnQkFBZ0I7QUFDaEksWUFBSSxLQUFLLEtBQU0sUUFBTyxPQUFPLENBQUM7QUFBQSxNQUNsQyxRQUFRO0FBQUEsTUFBRTtBQUNWLFlBQU0sSUFBSSxzQkFBc0IsS0FBSyxTQUFTLE1BQU07QUFDcEQsYUFBTyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUMsSUFBSTtBQUFBLElBQzlCO0FBQ0EsYUFBUyxVQUFVLEtBQUssS0FBSztBQUN6QixVQUFJLENBQUMsS0FBSyxPQUFRLFFBQU87QUFDekIsVUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQ3BELFlBQU0sT0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQy9CLFVBQUksT0FBTyxLQUFLLG9CQUFxQixRQUFPLEtBQUs7QUFDakQsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFNBQVMsR0FBRyxLQUFLO0FBQ3JDLFlBQUksT0FBTyxJQUFJLENBQUMsRUFBRSx1QkFBdUIsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDakc7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUNBLGFBQVMsZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxjQUFRLFlBQVksS0FBSyx5QkFBeUIsS0FBSztBQUFBLElBQzNEO0FBR0EsVUFBTSxzQkFBc0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0o7QUFDQSxVQUFNLFFBQVEsQ0FBQyxRQUFRLElBQUksS0FBSyxNQUFNLEtBQUssT0FBTyxJQUFJLElBQUksTUFBTSxDQUFDO0FBR2pFLFFBQUksT0FBTyxPQUFPLFdBQVcsYUFBYTtBQUN0QyxhQUFPLFdBQVcsRUFBRSxXQUFXLGlCQUFpQixpQkFBaUI7QUFBQSxJQUNyRTtBQUFBLEVBQ0osR0FBRzsiLAogICJuYW1lcyI6IFsibmF2Il0KfQo=
