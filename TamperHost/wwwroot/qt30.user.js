// ==UserScript==
// @name        QT30_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.28.5
// @description Applies customer catalog breakpoints (DS 4809) using Catalog Key (repo/DS 3156), removes zero-qty rows, and sets RvCustomizedUnitPrice with rounding. Refreshes via KO or wizard nav. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.28.5-1779981954293
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.28.5-1779981954293
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.28.5-1779981954293
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.28.5-1779981954293
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.28.5-1779981954293
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
// @updateURL   http://localhost:5000/qt30.user.js
// @downloadURL http://localhost:5000/qt30.user.js
// ==/UserScript==

(() => {
  // tm-scripts/src/quote-tracking/qt30-catalogPricingApply/qt30.index.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  (async function() {
    const CONFIG = {
      DS_CatalogKeyByQuoteKey: 3156,
      DS_BreakpointsByPart: 4809,
      GRID_SEL: ".plex-grid",
      toastMs: 3500,
      settingsKey: "qt30_settings_v1",
      // Legacy text matcher (kept for fallback only)
      SHOW_ON_PAGES_RE: /^part\s*summary$/i,
      // New: zero-based index of the Part Summary step in the wizard list
      PART_SUMMARY_STEP_INDEX: 1,
      // 0=Quote, 1=Part Summary, 2=Notes (based on your HTML)
      FORCE_SHOW_BTN: false,
      defaults: { deleteZeroQtyRows: true, unitPriceDecimals: 3, enableHoverAffordance: true }
    };
    const IS_TEST = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST);
    const L = TMUtils.getLogger?.("QT30");
    const log = (...a) => {
      if (DEV || IS_TEST) L?.log?.(...a);
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
    window.__LT_HUB_MOUNT = "nav";
    (async () => {
      try {
        await window.ensureLTHub?.({ mount: "nav" });
      } catch {
      }
      lt.core.hub.notify("Ready", "info", { sticky: true });
    })();
    let QT = null, quoteRepo = null, lastScope = null;
    async function getQT() {
      if (QT) return QT;
      const DC = lt.core?.data;
      if (!DC?.makeFlatScopedRepo) throw new Error("DataCore not ready");
      QT = DC.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" });
      return QT;
    }
    async function ensureRepoForQuote(qk) {
      if (!qk) return null;
      if (!quoteRepo || lastScope !== qk) {
        const { repo } = (await getQT()).use(Number(qk));
        await repo.ensureFromLegacyIfMissing?.();
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
    const withFreshAuth = (fn) => {
      const impl = lt?.core?.auth?.withFreshAuth;
      return typeof impl === "function" ? impl(fn) : fn();
    };
    const HUB_BTN_ID = "qt30-apply-pricing";
    let booted = false;
    let offUrl = null;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    async function init() {
      if (booted) return;
      booted = true;
      await lt.core.qt.ensureHubButton({
        id: HUB_BTN_ID,
        label: "Apply Pricing",
        title: "Apply customer catalog pricing",
        side: "left",
        weight: 20,
        onClick: () => runApplyPricing(),
        // Only show when the active wizard step <li> is the configured index.
        // Completely ignores any "Part Summary" text elsewhere on the page.
        showWhen: () => true,
        //{
        //    try {
        //        // Strongest signal: the Part Summary form/actions exist in DOM
        //        if (document.querySelector('#QuotePartSummaryForm,[id^="QuotePartSummaryForm_"]')) {
        //            return true;
        //        }
        //        // Secondary: active wizard step's visible label is exactly "Part Summary"
        //        const active = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active');
        //        return !!(active && active.textContent && active.textContent.trim().toLowerCase() === 'part summary');
        //    } catch {
        //        return false;
        //    }
        //},
        mount: "nav"
      });
      lt.core.qt.getHub({ mount: "nav" }).then((hub) => {
        const list = Array.isArray(hub?.list?.()) ? hub.list() : [];
        const ids = list.map((x) => x && typeof x === "object" ? x.id : x).filter(Boolean);
        const present = typeof hub?.has === "function" ? !!hub.has(HUB_BTN_ID) : ids.includes(HUB_BTN_ID);
        if (!present && typeof hub?.registerButton === "function") {
          const def = { id: HUB_BTN_ID, label: "Apply Pricing", title: "Apply customer catalog pricing", weight: 20, onClick: () => runApplyPricing() };
          try {
            hub.registerButton("left", def);
          } catch {
          }
        }
      }).catch(() => {
      });
    }
    function teardown() {
      booted = false;
      offUrl?.();
      offUrl = null;
    }
    init();
    wireNav(() => {
      if (ROUTES.some((rx) => rx.test(location.pathname))) init();
      else teardown();
    });
    async function runApplyPricing() {
      const task = lt.core.hub.beginTask("Applying catalog pricing\u2026", "info");
      try {
        const koRT = (typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : null) || window.ko;
        const allGridEls = Array.from(document.querySelectorAll(CONFIG.GRID_SEL));
        let grid = null, gridVM = null, raw = [];
        for (let gi = 0; gi < allGridEls.length; gi++) {
          const gEl = allGridEls[gi];
          const gVM = koRT?.dataFor?.(gEl);
          if (gVM && Array.isArray(gVM?.datasource?.raw) && gVM.datasource.raw.length > 0) {
            grid = gEl;
            gridVM = gVM;
            break;
          }
        }
        if (!gridVM && allGridEls.length > 0) {
          for (let gi = 0; gi < allGridEls.length; gi++) {
            const gEl = allGridEls[gi];
            const gVM = koRT?.dataFor?.(gEl);
            if (!gVM) continue;
            task.update("Loading grid data\u2026");
            try {
              await gVM.datasource.read();
            } catch {
            }
            if (Array.isArray(gVM.datasource?.raw) && gVM.datasource.raw.length > 0) {
              grid = gEl;
              gridVM = gVM;
              break;
            }
          }
        }
        raw = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw : [];
        try {
          if (!await lt.core.auth.getKey()) {
            lt.core.hub.notify("Sign-in required", "warn");
            task.error("No session");
            return;
          }
        } catch {
        }
        const { quoteKey: qk } = getCtx() || {};
        if (!qk) {
          task.error("Quote_Key missing");
          return;
        }
        await ensureRepoForQuote(qk);
        try {
          await lt.core.qt.promoteDraftToQuote?.({ qk, strategy: "once" });
        } catch {
        }
        let header = await quoteRepo.getHeader?.() || {};
        let catalogKey = TMUtils.getObsValue?.(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;
        if (catalogKey == null) {
          try {
            await lt.core.qt.promoteDraftToQuote?.({ qk, strategy: "retry" });
            header = await quoteRepo.getHeader?.() || {};
            catalogKey = TMUtils.getObsValue?.(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;
          } catch {
          }
        }
        if (catalogKey == null) {
          task.update("Fetching Catalog Key\u2026");
          const rows1 = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: qk }));
          catalogKey = rows1?.[0]?.Catalog_Key || null;
          if (catalogKey) await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: Number(catalogKey) });
        }
        if (catalogKey == null) {
          task.error("No Catalog Key");
          lt.core.hub.notify("No catalog found for this quote", "warn");
          return;
        }
        const partNos = [...new Set(raw.map((r) => TMUtils.getObsValue?.(r, "PartNo", { first: true, trim: true, allowPlex: false })).filter(Boolean))];
        if (!partNos.length) {
          task.error("No PartNo values");
          lt.core.hub.notify("No PartNo values found", "warn");
          return;
        }
        task.update(`Loading ${partNos.length} part(s)\u2026`);
        const now = /* @__PURE__ */ new Date();
        const priceMap = {};
        await Promise.all(partNos.map(async (p) => {
          const rows = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_BreakpointsByPart, { Catalog_Key: catalogKey, Catalog_Part_No: p })) || [];
          priceMap[p] = rows.filter((r) => r.Catalog_Part_No === p && new Date(r.Effective_Date) <= now && now <= new Date(r.Expiration_Date)).sort((a, b) => a.Breakpoint_Quantity - b.Breakpoint_Quantity);
        }));
        const S = loadSettings();
        const round = (n) => +(+n).toFixed(S.unitPriceDecimals);
        for (let i = 0; i < raw.length; i++) {
          const row = raw[i];
          const qty = +(TMUtils.getObsValue(row, "Quantity", { first: true, trim: true }) || 0);
          if (qty <= 0 && S.deleteZeroQtyRows) {
            const qkRow = TMUtils.getObsValue(row, ["QuoteKey", "Quote_Key"], { first: true, trim: true });
            const qpk = TMUtils.getObsValue(row, ["QuotePartKey", "Quote_Part_Key"], { first: true, trim: true });
            const qpr = TMUtils.getObsValue(row, ["QuotePriceKey", "Quote_Price_Key"], { first: true, trim: true });
            if (qkRow && qpk && qpr) {
              try {
                const form = new URLSearchParams();
                form.set("QuoteKey", String(Number(qkRow)));
                form.set("QuotePartKey", String(Number(qpk)));
                form.set("QuotePriceKey", String(Number(qpr)));
                const rvt = document.querySelector('input[name="__RequestVerificationToken"]')?.value || document.querySelector('meta[name="__RequestVerificationToken"]')?.content;
                if (rvt) form.set("__RequestVerificationToken", rvt);
                await withFreshAuth(() => lt.core.http.post(
                  "/SalesAndCRM/QuotePart/DeleteQuotePrice",
                  form.toString(),
                  { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } }
                ));
                lt.core.hub.notify(`Deleted row[${i}]`, "success");
              } catch (e) {
                err("QT30 delete error", e);
                lt.core.hub.notify(`Delete failed row[${i}]`, "error");
              }
            } else {
              lt.core.hub.notify(`Skip delete row[${i}] \u2014 missing keys`, "warn");
            }
            continue;
          }
          if (qty > 0) {
            const partNo = TMUtils.getObsValue(row, "PartNo", { first: true, trim: true, allowPlex: false });
            const bp = pickPrice(priceMap[partNo], qty);
            if (bp == null) {
              log(`QT30: no price for PartNo="${partNo}" qty=${qty} \u2014 keys in priceMap: [${Object.keys(priceMap).join(", ")}]`);
              continue;
            }
            applyPriceToRow(row, round(bp));
            log(`QT30: row[${i}] qty=${qty} price=${round(bp)}`);
          }
        }
        task.update("Refreshing grid\u2026");
        const mode = await refreshQuoteGrid();
        task.success("Pricing applied");
        lt.core.hub.notify(
          mode ? "Pricing applied and grid refreshed" : "Pricing applied (reload may be needed)",
          "success"
        );
      } catch (e) {
        task.error("Failed");
        lt.core.hub.notify(`Apply failed: ${e?.message || e}`, "error");
      } finally {
        try {
        } catch {
        }
      }
    }
    const getCtx = () => lt?.core?.qt?.getQuoteContext();
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
    async function refreshQuoteGrid() {
      const koRT = (typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : null) || window.ko;
      try {
        const gridEl = document.querySelector(CONFIG.GRID_SEL);
        const gridVM = gridEl && koRT?.dataFor?.(gridEl);
        if (typeof gridVM?.datasource?.read === "function") {
          await gridVM.datasource.read();
          return "ds.read";
        }
        if (typeof gridVM?.refresh === "function") {
          gridVM.refresh();
          return "vm.refresh";
        }
      } catch {
      }
      try {
        const wiz = unsafeWindow.plex?.currentPage?.QuoteWizard;
        if (wiz?.navigatePage) {
          const active = typeof wiz.activePage === "function" ? wiz.activePage() : wiz.activePage;
          wiz.navigatePage(active);
          return "wiz.navigatePage";
        }
      } catch {
      }
      return null;
    }
    if (DEV && typeof window !== "undefined") {
      window.__QT30__ = { pickPrice, applyPriceToRow, runApplyPricing };
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIC8vIExlZ2FjeSB0ZXh0IG1hdGNoZXIgKGtlcHQgZm9yIGZhbGxiYWNrIG9ubHkpXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICAvLyBOZXc6IHplcm8tYmFzZWQgaW5kZXggb2YgdGhlIFBhcnQgU3VtbWFyeSBzdGVwIGluIHRoZSB3aXphcmQgbGlzdFxuICAgICAgICBQQVJUX1NVTU1BUllfU1RFUF9JTkRFWDogMSwgLy8gMD1RdW90ZSwgMT1QYXJ0IFN1bW1hcnksIDI9Tm90ZXMgKGJhc2VkIG9uIHlvdXIgSFRNTClcbiAgICAgICAgRk9SQ0VfU0hPV19CVE46IGZhbHNlLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgKEdNIHRvbGVyYW50KSAtLS0tLS0tLS0tXG4gICAgY29uc3QgbG9hZFNldHRpbmdzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfTtcbiAgICBjb25zdCBzYXZlU2V0dGluZ3MgPSAobmV4dCkgPT4ge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9O1xuXG5cbiAgICAvLyBEZWxlZ2F0ZSB0byBsdC5jb3JlLmF1dGggd3JhcHBlciAocXQyMC9xdDM1IHBhdHRlcm4pXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAvLyBIdWIgYnV0dG9uIHJlZ2lzdHJhdGlvbiAocXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzMC1hcHBseS1wcmljaW5nJztcblxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgKHF0MzUgcGF0dGVybikgPT09PT1cbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0FwcGx5IFByaWNpbmcnLFxuICAgICAgICAgICAgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bkFwcGx5UHJpY2luZygpLFxuICAgICAgICAgICAgLy8gT25seSBzaG93IHdoZW4gdGhlIGFjdGl2ZSB3aXphcmQgc3RlcCA8bGk+IGlzIHRoZSBjb25maWd1cmVkIGluZGV4LlxuICAgICAgICAgICAgLy8gQ29tcGxldGVseSBpZ25vcmVzIGFueSBcIlBhcnQgU3VtbWFyeVwiIHRleHQgZWxzZXdoZXJlIG9uIHRoZSBwYWdlLlxuICAgICAgICAgICAgc2hvd1doZW46ICgpID0+IHRydWUsXG4gICAgICAgICAgICAvL3tcbiAgICAgICAgICAgIC8vICAgIHRyeSB7XG4gICAgICAgICAgICAvLyAgICAgICAgLy8gU3Ryb25nZXN0IHNpZ25hbDogdGhlIFBhcnQgU3VtbWFyeSBmb3JtL2FjdGlvbnMgZXhpc3QgaW4gRE9NXG4gICAgICAgICAgICAvLyAgICAgICAgaWYgKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNRdW90ZVBhcnRTdW1tYXJ5Rm9ybSxbaWRePVwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fXCJdJykpIHtcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAvLyAgICAgICAgfVxuICAgICAgICAgICAgLy8gICAgICAgIC8vIFNlY29uZGFyeTogYWN0aXZlIHdpemFyZCBzdGVwJ3MgdmlzaWJsZSBsYWJlbCBpcyBleGFjdGx5IFwiUGFydCBTdW1tYXJ5XCJcbiAgICAgICAgICAgIC8vICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xuICAgICAgICAgICAgLy8gICAgICAgIHJldHVybiAhIShhY3RpdmUgJiYgYWN0aXZlLnRleHRDb250ZW50ICYmIGFjdGl2ZS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ3BhcnQgc3VtbWFyeScpO1xuICAgICAgICAgICAgLy8gICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgLy8gICAgfVxuICAgICAgICAgICAgLy99LFxuICAgICAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFNhZmV0eSBmdXNlIChubyB0b3AtbGV2ZWwgYXdhaXQpOiBkZWZlciB2aWEgcHJvbWlzZVxuICAgICAgICBsdC5jb3JlLnF0LmdldEh1Yih7IG1vdW50OiAnbmF2JyB9KS50aGVuKChodWIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KGh1Yj8ubGlzdD8uKCkpID8gaHViLmxpc3QoKSA6IFtdO1xuICAgICAgICAgICAgY29uc3QgaWRzID0gbGlzdC5tYXAoeCA9PiAoeCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcpID8geC5pZCA6IHgpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXNlbnQgPSAodHlwZW9mIGh1Yj8uaGFzID09PSAnZnVuY3Rpb24nKSA/ICEhaHViLmhhcyhIVUJfQlROX0lEKSA6IGlkcy5pbmNsdWRlcyhIVUJfQlROX0lEKTtcblxuICAgICAgICAgICAgaWYgKCFwcmVzZW50ICYmIHR5cGVvZiBodWI/LnJlZ2lzdGVyQnV0dG9uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVmID0geyBpZDogSFVCX0JUTl9JRCwgbGFiZWw6ICdBcHBseSBQcmljaW5nJywgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLCB3ZWlnaHQ6IDIwLCBvbkNsaWNrOiAoKSA9PiBydW5BcHBseVByaWNpbmcoKSB9O1xuICAgICAgICAgICAgICAgIHRyeSB7IGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIGRlZik7IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkuY2F0Y2goKCkgPT4geyB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBpbml0aWFsaXplIGZvciBjdXJyZW50IHJvdXRlICsgd2lyZSByb3V0ZSBjaGFuZ2VzXG4gICAgaW5pdCgpO1xuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAoUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG5cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bkFwcGx5UHJpY2luZygpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnQXBwbHlpbmcgY2F0YWxvZyBwcmljaW5nXHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFJlc29sdmUgS08gYXQgY2FsbCB0aW1lIFx1MjAxNCB0aGUgbW9kdWxlLWxldmVsIEtPIGNvbnN0YW50IGlzIGNhcHR1cmVkIGF0XG4gICAgICAgICAgICAvLyBkb2N1bWVudC1zdGFydCBiZWZvcmUgUGxleCBsb2FkcyB3aW5kb3cua28gKGFuZCB1bnNhZmVXaW5kb3cgaXMgdW5hdmFpbGFibGVcbiAgICAgICAgICAgIC8vIGluIHRoZSBQbGF5d3JpZ2h0IHRlc3QgY29udGV4dCksIHNvIHdlIG11c3QgcmUtcmVhZCBpdCBoZXJlLlxuICAgICAgICAgICAgY29uc3Qga29SVCA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IG51bGwpIHx8IHdpbmRvdy5rbztcblxuICAgICAgICAgICAgLy8gU25hcHNob3QgdGhlIGdyaWQgaW1tZWRpYXRlbHkgXHUyMDE0IGJlZm9yZSBhbnkgYXN5bmMgb3BzIHRoYXQgbWF5IGNhdXNlIFBsZXggdG9cbiAgICAgICAgICAgIC8vIHJlLXJlbmRlciB0aGUgUGFydCBTdW1tYXJ5IGdyaWQgYW5kIHJlcGxhY2UgZGF0YXNvdXJjZS5yYXcgd2l0aCBhIG5ldyBhcnJheS5cbiAgICAgICAgICAgIGNvbnN0IGFsbEdyaWRFbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoQ09ORklHLkdSSURfU0VMKSk7XG4gICAgICAgICAgICBsZXQgZ3JpZCA9IG51bGwsIGdyaWRWTSA9IG51bGwsIHJhdyA9IFtdO1xuICAgICAgICAgICAgZm9yIChsZXQgZ2kgPSAwOyBnaSA8IGFsbEdyaWRFbHMubGVuZ3RoOyBnaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ0VsID0gYWxsR3JpZEVsc1tnaV07XG4gICAgICAgICAgICAgICAgY29uc3QgZ1ZNID0ga29SVD8uZGF0YUZvcj8uKGdFbCk7XG4gICAgICAgICAgICAgICAgaWYgKGdWTSAmJiBBcnJheS5pc0FycmF5KGdWTT8uZGF0YXNvdXJjZT8ucmF3KSAmJiBnVk0uZGF0YXNvdXJjZS5yYXcubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBncmlkID0gZ0VsOyBncmlkVk0gPSBnVk07IGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZ3JpZFZNICYmIGFsbEdyaWRFbHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIC8vIFRyeSBlYWNoIGdyaWQgd2l0aCBkYXRhc291cmNlLnJlYWQoKSBhcyBmYWxsYmFja1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGdpID0gMDsgZ2kgPCBhbGxHcmlkRWxzLmxlbmd0aDsgZ2krKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBnRWwgPSBhbGxHcmlkRWxzW2dpXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ1ZNID0ga29SVD8uZGF0YUZvcj8uKGdFbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZ1ZNKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgdGFzay51cGRhdGUoJ0xvYWRpbmcgZ3JpZCBkYXRhXHUyMDI2Jyk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IGF3YWl0IGdWTS5kYXRhc291cmNlLnJlYWQoKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZ1ZNLmRhdGFzb3VyY2U/LnJhdykgJiYgZ1ZNLmRhdGFzb3VyY2UucmF3Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyaWQgPSBnRWw7IGdyaWRWTSA9IGdWTTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByYXcgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhdyA6IFtdO1xuXG4gICAgICAgICAgICAvLyBhdXRoXG4gICAgICAgICAgICB0cnkgeyBpZiAoIShhd2FpdCBsdC5jb3JlLmF1dGguZ2V0S2V5KCkpKSB7IGx0LmNvcmUuaHViLm5vdGlmeSgnU2lnbi1pbiByZXF1aXJlZCcsICd3YXJuJyk7IHRhc2suZXJyb3IoJ05vIHNlc3Npb24nKTsgcmV0dXJuOyB9IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcXVvdGVLZXk6IHFrIH0gPSBnZXRDdHgoKSB8fCB7fTtcbiAgICAgICAgICAgIGlmICghcWspIHsgdGFzay5lcnJvcignUXVvdGVfS2V5IG1pc3NpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB3ZSdyZSBvcGVyYXRpbmcgb24gdGhlIGNvcnJlY3QgcXVvdGUgc2NvcGVcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG5cbiAgICAgICAgICAgIC8vIDEpIEFzayBsdC1jb3JlIHRvIHByb21vdGUgZHJhZnQgXHUyMTkyIHF1b3RlIChjZW50cmFsaXplZCBwYXRoLCBvbmUtc2hvdCBmaXJzdClcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxaywgc3RyYXRlZ3k6ICdvbmNlJyB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWw7IHdlJ2xsIHZlcmlmeSBieSByZWFkaW5nIGhlYWRlciBuZXh0ICovIH1cblxuICAgICAgICAgICAgLy8gMikgUmUtcmVhZCBsaXZlIHF1b3RlIGhlYWRlciBhZnRlciBwcm9tb3Rpb25cbiAgICAgICAgICAgIGxldCBoZWFkZXIgPSBhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyPy4oKSB8fCB7fTtcbiAgICAgICAgICAgIGxldCBjYXRhbG9nS2V5ID1cbiAgICAgICAgICAgICAgICBUTVV0aWxzLmdldE9ic1ZhbHVlPy4oaGVhZGVyLCBbJ0NhdGFsb2dfS2V5JywgJ0NhdGFsb2dLZXknXSwgeyBmaXJzdDogdHJ1ZSB9KSA/PyBudWxsO1xuXG4gICAgICAgICAgICAvLyAzKSBJZiBLTyB3YXMgc3RpbGwgYmluZGluZyAodmVyeSBmYXN0IGNsaWNrKSwgdHJ5IGEgc2hvcnQgcmV0cnkgd2luZG93IHZpYSBsdC1jb3JlXG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxaywgc3RyYXRlZ3k6ICdyZXRyeScgfSk7XG4gICAgICAgICAgICAgICAgICAgIGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIHN0aWxsIG5vbi1mYXRhbDsgd2UnbGwgZmFsbCBiYWNrIHRvIERTICovIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNhdGFsb2dLZXkgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRhc2sudXBkYXRlKCdGZXRjaGluZyBDYXRhbG9nIEtleVx1MjAyNicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19DYXRhbG9nS2V5QnlRdW90ZUtleSwgeyBRdW90ZV9LZXk6IHFrIH0pKTtcbiAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSkgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IE51bWJlcihxayksIENhdGFsb2dfS2V5OiBOdW1iZXIoY2F0YWxvZ0tleSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7IHRhc2suZXJyb3IoJ05vIENhdGFsb2cgS2V5Jyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gY2F0YWxvZyBmb3VuZCBmb3IgdGhpcyBxdW90ZScsICd3YXJuJyk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9zID0gWy4uLm5ldyBTZXQocmF3Lm1hcChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihyLCBcIlBhcnROb1wiLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlLCBhbGxvd1BsZXg6IGZhbHNlIH0pKS5maWx0ZXIoQm9vbGVhbikpXTtcbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgdGFzay5lcnJvcignTm8gUGFydE5vIHZhbHVlcycpOyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ05vIFBhcnRObyB2YWx1ZXMgZm91bmQnLCAnd2FybicpOyByZXR1cm47IH1cblxuICAgICAgICAgICAgdGFzay51cGRhdGUoYExvYWRpbmcgJHtwYXJ0Tm9zLmxlbmd0aH0gcGFydChzKVx1MjAyNmApO1xuICAgICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIGNvbnN0IHByaWNlTWFwID0ge307XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChwYXJ0Tm9zLm1hcChhc3luYyAocCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0JyZWFrcG9pbnRzQnlQYXJ0LCB7IENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5LCBDYXRhbG9nX1BhcnRfTm86IHAgfSkpIHx8IFtdO1xuICAgICAgICAgICAgICAgIHByaWNlTWFwW3BdID0gcm93c1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gci5DYXRhbG9nX1BhcnRfTm8gPT09IHAgJiYgbmV3IERhdGUoci5FZmZlY3RpdmVfRGF0ZSkgPD0gbm93ICYmIG5vdyA8PSBuZXcgRGF0ZShyLkV4cGlyYXRpb25fRGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLkJyZWFrcG9pbnRfUXVhbnRpdHkgLSBiLkJyZWFrcG9pbnRfUXVhbnRpdHkpO1xuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAvLyAzKSBBcHBseSBvciBkZWxldGUgcGVyIHJvdyAocXQtc3RhbmRhcmQgbG9vcClcbiAgICAgICAgICAgIGNvbnN0IFMgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGNvbnN0IHJvdW5kID0gKG4pID0+ICsoK24pLnRvRml4ZWQoUy51bml0UHJpY2VEZWNpbWFscyk7XG5cbiAgICAgICAgICAgIC8vIFJldXNlIGdyaWQvcmF3IHJlc29sdmVkIGFib3ZlIChhdm9pZCByZWRlY2xhcmF0aW9uKVxuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJhdy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJhd1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBxdHkgPSArKFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVhbnRpdHknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pIHx8IDApO1xuXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHplcm8tcXR5IHJvd3MgKHN0YW5kYXJkIGJlaGF2aW9yKVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPD0gMCAmJiBTLmRlbGV0ZVplcm9RdHlSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFrUm93ID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVLZXknLCAnUXVvdGVfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlUGFydEtleScsICdRdW90ZV9QYXJ0X0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcHIgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZVByaWNlS2V5JywgJ1F1b3RlX1ByaWNlX0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChxa1JvdyAmJiBxcGsgJiYgcXByKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJ1aWxkIHgtd3d3LWZvcm0tdXJsZW5jb2RlZCBwYXlsb2FkIHNvIGl0IHdvcmtzIHdoZXRoZXIgVE1VdGlscy5mZXRjaERhdGEgb3IgbmF0aXZlIGZldGNoIGlzIHVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3JtID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZUtleScsIFN0cmluZyhOdW1iZXIocWtSb3cpKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlUGFydEtleScsIFN0cmluZyhOdW1iZXIocXBrKSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZVByaWNlS2V5JywgU3RyaW5nKE51bWJlcihxcHIpKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBbnRpLWZvcmdlcnkgdG9rZW4gKGlmIHByZXNlbnQgb24gcGFnZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBydnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPVwiX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW5cIl0nKT8udmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbWV0YVtuYW1lPVwiX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW5cIl0nKT8uY29udGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnZ0KSBmb3JtLnNldCgnX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW4nLCBydnQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLmh0dHAucG9zdChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy9TYWxlc0FuZENSTS9RdW90ZVBhcnQvRGVsZXRlUXVvdGVQcmljZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0udG9TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04JyB9IH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlZCByb3dbJHtpfV1gLCAnc3VjY2VzcycpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyKCdRVDMwIGRlbGV0ZSBlcnJvcicsIGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgU2tpcCBkZWxldGUgcm93WyR7aX1dIFx1MjAxNCBtaXNzaW5nIGtleXNgLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcHJpY2UgdG8gbm9uLXplcm8gcm93c1xuICAgICAgICAgICAgICAgIGlmIChxdHkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUGFydE5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSwgYWxsb3dQbGV4OiBmYWxzZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnAgPSBwaWNrUHJpY2UocHJpY2VNYXBbcGFydE5vXSwgcXR5KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJwID09IG51bGwpIHsgbG9nKGBRVDMwOiBubyBwcmljZSBmb3IgUGFydE5vPVwiJHtwYXJ0Tm99XCIgcXR5PSR7cXR5fSBcdTIwMTQga2V5cyBpbiBwcmljZU1hcDogWyR7T2JqZWN0LmtleXMocHJpY2VNYXApLmpvaW4oJywgJyl9XWApOyBjb250aW51ZTsgfVxuICAgICAgICAgICAgICAgICAgICBhcHBseVByaWNlVG9Sb3cocm93LCByb3VuZChicCkpO1xuICAgICAgICAgICAgICAgICAgICBsb2coYFFUMzA6IHJvd1ske2l9XSBxdHk9JHtxdHl9IHByaWNlPSR7cm91bmQoYnApfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGFzay51cGRhdGUoJ1JlZnJlc2hpbmcgZ3JpZFx1MjAyNicpO1xuICAgICAgICAgICAgY29uc3QgbW9kZSA9IGF3YWl0IHJlZnJlc2hRdW90ZUdyaWQoKTtcblxuICAgICAgICAgICAgdGFzay5zdWNjZXNzKCdQcmljaW5nIGFwcGxpZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcbiAgICAgICAgICAgICAgICBtb2RlID8gJ1ByaWNpbmcgYXBwbGllZCBhbmQgZ3JpZCByZWZyZXNoZWQnIDogJ1ByaWNpbmcgYXBwbGllZCAocmVsb2FkIG1heSBiZSBuZWVkZWQpJyxcbiAgICAgICAgICAgICAgICAnc3VjY2VzcydcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYEFwcGx5IGZhaWxlZDogJHtlPy5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyByZWNvbmNpbGUgcHJlc2VuY2UgaWYgU1BBIG5hdmlnYXRpb24gY2hhbmdlZCB0aGUgcGFnZVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBoYW5kbGVkIGJ5IGx0LmNvcmUucXQuZW5zdXJlSHViQnV0dG9uKCkgXG4gICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cbiAgICAvLyBBbHdheXMgcmVhZCBmcmVzaCBjb250ZXh0IChTUEEgY2FuIGNoYW5nZSBRdW90ZUtleS9QYWdlKVxuICAgIGNvbnN0IGdldEN0eCA9ICgpID0+IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0KCk7XG5cblxuICAgIGZ1bmN0aW9uIHBpY2tQcmljZShicHMsIHF0eSkge1xuICAgICAgICBpZiAoIWJwcz8ubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKHF0eSA8IGJwc1swXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzWzBdLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBicHNbYnBzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAocXR5ID49IGxhc3QuQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGxhc3QuQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocXR5ID49IGJwc1tpXS5CcmVha3BvaW50X1F1YW50aXR5ICYmIHF0eSA8IGJwc1tpICsgMV0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1tpXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhcHBseVByaWNlVG9Sb3cocm93LCBwcmljZSkge1xuICAgICAgICBUTVV0aWxzLnNldE9ic1ZhbHVlKHJvdywgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScsIHByaWNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnkgdG8gcmVmcmVzaCB0aGUgUXVvdGUgZ3JpZCB2aXN1YWxzIGFmdGVyIGFwcGx5L2RlbGV0ZSBvcHMuXG4gICAgICogT3JkZXIgb2YgYXR0ZW1wdHM6XG4gICAgICogIDEpIEtPIGdyaWQgVk0gZGF0YXNvdXJjZS5yZWFkKCkgKGFzeW5jKVxuICAgICAqICAyKSBncmlkIFZNIC5yZWZyZXNoKCkgKHN5bmMpXG4gICAgICogIDMpIFdpemFyZCBuYXYgdG8gY3VycmVudCBwYWdlIChyZWJpbmRzIHBhZ2UpXG4gICAgICogUmV0dXJucyBhIHN0cmluZyBkZXNjcmliaW5nIHdoaWNoIHBhdGggc3VjY2VlZGVkLCBvciBudWxsLlxuICAgICAqL1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgICAgIGNvbnN0IGtvUlQgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiBudWxsKSB8fCB3aW5kb3cua287XG4gICAgICAgIC8vIFByZWZlciBhIEtPLWxldmVsIHJlZnJlc2ggaWYgYXZhaWxhYmxlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYga29SVD8uZGF0YUZvcj8uKGdyaWRFbCk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxuICAgICAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgc2FtZSBhY3RpdmUgcGFnZSB0byBmb3JjZSByZWJpbmRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlKGFjdGl2ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBydW5BcHBseVByaWNpbmcgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTSxNQUFPLE9BQ1AsT0FDQSxDQUFDLEVBQUUsT0FBTyxlQUFlLGVBQWUsV0FBVztBQUV6RCxHQUFDLGlCQUFrQjtBQUVmLFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBO0FBQUEsTUFFYixrQkFBa0I7QUFBQTtBQUFBLE1BRWxCLHlCQUF5QjtBQUFBO0FBQUEsTUFDekIsZ0JBQWdCO0FBQUEsTUFDaEIsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFJQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlBQVksTUFBTTtBQUNwQyxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFB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
