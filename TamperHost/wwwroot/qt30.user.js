// ==UserScript==
// @name        QT30_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.19.21
// @description Applies customer catalog breakpoints (DS 4809) using Catalog Key (repo/DS 3156), removes zero-qty rows, and sets RvCustomizedUnitPrice with rounding. Refreshes via KO or wizard nav. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.19.21-1779233317697
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.19.21-1779233317697
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.19.21-1779233317697
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.19.21-1779233317697
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.19.21-1779233317697
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
        //        // Secondary: active wizard step’s visible label is exactly "Part Summary"
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
        const grid = document.querySelector(CONFIG.GRID_SEL);
        const gridVM = grid && KO?.dataFor?.(grid);
        if (gridVM && (!Array.isArray(gridVM.datasource?.raw) || !gridVM.datasource.raw.length)) {
          task.update("Loading grid data\u2026");
          try {
            await gridVM.datasource.read();
          } catch {
          }
        }
        const raw = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw : [];
        log(`QT30: raw[0] keys=${raw[0] ? Object.keys(raw[0]).join(",") : "n/a"} | PartNo type=${raw[0] ? typeof raw[0].PartNo : "n/a"} | isObs=${raw[0] ? !!KO?.isObservable?.(raw[0].PartNo) : "n/a"} | val=${raw[0] ? TMUtils.getObsValue?.(raw[0], "PartNo", { first: true, trim: true }) : "n/a"}`);
        const partNos = [...new Set(raw.map((r) => TMUtils.getObsValue?.(r, "PartNo", { first: true, trim: true })).filter(Boolean))];
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
            const partNo = TMUtils.getObsValue(row, "PartNo", { first: true, trim: true });
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
      try {
        const gridEl = document.querySelector(CONFIG.GRID_SEL);
        const gridVM = gridEl && KO?.dataFor?.(gridEl);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIC8vIExlZ2FjeSB0ZXh0IG1hdGNoZXIgKGtlcHQgZm9yIGZhbGxiYWNrIG9ubHkpXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICAvLyBOZXc6IHplcm8tYmFzZWQgaW5kZXggb2YgdGhlIFBhcnQgU3VtbWFyeSBzdGVwIGluIHRoZSB3aXphcmQgbGlzdFxuICAgICAgICBQQVJUX1NVTU1BUllfU1RFUF9JTkRFWDogMSwgLy8gMD1RdW90ZSwgMT1QYXJ0IFN1bW1hcnksIDI9Tm90ZXMgKGJhc2VkIG9uIHlvdXIgSFRNTClcbiAgICAgICAgRk9SQ0VfU0hPV19CVE46IGZhbHNlLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgKEdNIHRvbGVyYW50KSAtLS0tLS0tLS0tXG4gICAgY29uc3QgbG9hZFNldHRpbmdzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfTtcbiAgICBjb25zdCBzYXZlU2V0dGluZ3MgPSAobmV4dCkgPT4ge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9O1xuXG5cbiAgICAvLyBEZWxlZ2F0ZSB0byBsdC5jb3JlLmF1dGggd3JhcHBlciAocXQyMC9xdDM1IHBhdHRlcm4pXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAvLyBIdWIgYnV0dG9uIHJlZ2lzdHJhdGlvbiAocXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzMC1hcHBseS1wcmljaW5nJztcblxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgKHF0MzUgcGF0dGVybikgPT09PT1cbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0FwcGx5IFByaWNpbmcnLFxuICAgICAgICAgICAgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bkFwcGx5UHJpY2luZygpLFxuICAgICAgICAgICAgLy8gT25seSBzaG93IHdoZW4gdGhlIGFjdGl2ZSB3aXphcmQgc3RlcCA8bGk+IGlzIHRoZSBjb25maWd1cmVkIGluZGV4LlxuICAgICAgICAgICAgLy8gQ29tcGxldGVseSBpZ25vcmVzIGFueSBcIlBhcnQgU3VtbWFyeVwiIHRleHQgZWxzZXdoZXJlIG9uIHRoZSBwYWdlLlxuICAgICAgICAgICAgc2hvd1doZW46ICgpID0+IHRydWUsXG4gICAgICAgICAgICAvL3tcbiAgICAgICAgICAgIC8vICAgIHRyeSB7XG4gICAgICAgICAgICAvLyAgICAgICAgLy8gU3Ryb25nZXN0IHNpZ25hbDogdGhlIFBhcnQgU3VtbWFyeSBmb3JtL2FjdGlvbnMgZXhpc3QgaW4gRE9NXG4gICAgICAgICAgICAvLyAgICAgICAgaWYgKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNRdW90ZVBhcnRTdW1tYXJ5Rm9ybSxbaWRePVwiUXVvdGVQYXJ0U3VtbWFyeUZvcm1fXCJdJykpIHtcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAvLyAgICAgICAgfVxuICAgICAgICAgICAgLy8gICAgICAgIC8vIFNlY29uZGFyeTogYWN0aXZlIHdpemFyZCBzdGVwXHUyMDE5cyB2aXNpYmxlIGxhYmVsIGlzIGV4YWN0bHkgXCJQYXJ0IFN1bW1hcnlcIlxuICAgICAgICAgICAgLy8gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlJyk7XG4gICAgICAgICAgICAvLyAgICAgICAgcmV0dXJuICEhKGFjdGl2ZSAmJiBhY3RpdmUudGV4dENvbnRlbnQgJiYgYWN0aXZlLnRleHRDb250ZW50LnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAncGFydCBzdW1tYXJ5Jyk7XG4gICAgICAgICAgICAvLyAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAvLyAgICB9XG4gICAgICAgICAgICAvL30sXG4gICAgICAgICAgICBtb3VudDogJ25hdidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU2FmZXR5IGZ1c2UgKG5vIHRvcC1sZXZlbCBhd2FpdCk6IGRlZmVyIHZpYSBwcm9taXNlXG4gICAgICAgIGx0LmNvcmUucXQuZ2V0SHViKHsgbW91bnQ6ICduYXYnIH0pLnRoZW4oKGh1YikgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkoaHViPy5saXN0Py4oKSkgPyBodWIubGlzdCgpIDogW107XG4gICAgICAgICAgICBjb25zdCBpZHMgPSBsaXN0Lm1hcCh4ID0+ICh4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JykgPyB4LmlkIDogeCkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgY29uc3QgcHJlc2VudCA9ICh0eXBlb2YgaHViPy5oYXMgPT09ICdmdW5jdGlvbicpID8gISFodWIuaGFzKEhVQl9CVE5fSUQpIDogaWRzLmluY2x1ZGVzKEhVQl9CVE5fSUQpO1xuXG4gICAgICAgICAgICBpZiAoIXByZXNlbnQgJiYgdHlwZW9mIGh1Yj8ucmVnaXN0ZXJCdXR0b24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZWYgPSB7IGlkOiBIVUJfQlROX0lELCBsYWJlbDogJ0FwcGx5IFByaWNpbmcnLCB0aXRsZTogJ0FwcGx5IGN1c3RvbWVyIGNhdGFsb2cgcHJpY2luZycsIHdlaWdodDogMjAsIG9uQ2xpY2s6ICgpID0+IHJ1bkFwcGx5UHJpY2luZygpIH07XG4gICAgICAgICAgICAgICAgdHJ5IHsgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0JywgZGVmKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7IH0pO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBvZmZVcmw/LigpOyBvZmZVcmwgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIGluaXRpYWxpemUgZm9yIGN1cnJlbnQgcm91dGUgKyB3aXJlIHJvdXRlIGNoYW5nZXNcbiAgICBpbml0KCk7XG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuQXBwbHlQcmljaW5nKCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKCdBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gYXV0aFxuICAgICAgICAgICAgdHJ5IHsgaWYgKCEoYXdhaXQgbHQuY29yZS5hdXRoLmdldEtleSgpKSkgeyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ1NpZ24taW4gcmVxdWlyZWQnLCAnd2FybicpOyB0YXNrLmVycm9yKCdObyBzZXNzaW9uJyk7IHJldHVybjsgfSB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICBjb25zdCB7IHF1b3RlS2V5OiBxayB9ID0gZ2V0Q3R4KCkgfHwge307XG4gICAgICAgICAgICBpZiAoIXFrKSB7IHRhc2suZXJyb3IoJ1F1b3RlX0tleSBtaXNzaW5nJyk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAvLyBFbnN1cmUgd2VcdTIwMTlyZSBvcGVyYXRpbmcgb24gdGhlIGNvcnJlY3QgcXVvdGUgc2NvcGVcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG5cbiAgICAgICAgICAgIC8vIDEpIEFzayBsdC1jb3JlIHRvIHByb21vdGUgZHJhZnQgXHUyMTkyIHF1b3RlIChjZW50cmFsaXplZCBwYXRoLCBvbmUtc2hvdCBmaXJzdClcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gUHJlZmVyIHRoZSBzaW5nbGUgcHVibGljIGVudHJ5cG9pbnQgaW4gbHQtY29yZVxuICAgICAgICAgICAgICAgIGF3YWl0IGx0LmNvcmUucXQucHJvbW90ZURyYWZ0VG9RdW90ZT8uKHsgcWssIHN0cmF0ZWd5OiAnb25jZScgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsOyB3ZVx1MjAxOWxsIHZlcmlmeSBieSByZWFkaW5nIGhlYWRlciBuZXh0ICovIH1cblxuICAgICAgICAgICAgLy8gMikgUmUtcmVhZCBsaXZlIHF1b3RlIGhlYWRlciBhZnRlciBwcm9tb3Rpb25cbiAgICAgICAgICAgIGxldCBoZWFkZXIgPSBhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyPy4oKSB8fCB7fTtcbiAgICAgICAgICAgIGxldCBjYXRhbG9nS2V5ID1cbiAgICAgICAgICAgICAgICBUTVV0aWxzLmdldE9ic1ZhbHVlPy4oaGVhZGVyLCBbJ0NhdGFsb2dfS2V5JywgJ0NhdGFsb2dLZXknXSwgeyBmaXJzdDogdHJ1ZSB9KSA/PyBudWxsO1xuXG4gICAgICAgICAgICAvLyAzKSBJZiBLTyB3YXMgc3RpbGwgYmluZGluZyAodmVyeSBmYXN0IGNsaWNrKSwgdHJ5IGEgc2hvcnQgcmV0cnkgd2luZG93IHZpYSBsdC1jb3JlXG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxaywgc3RyYXRlZ3k6ICdyZXRyeScgfSk7IC8vIHNob3J0LCBpbnRlcm5hbCByZXRyeVxuICAgICAgICAgICAgICAgICAgICBoZWFkZXIgPSBhd2FpdCBxdW90ZVJlcG8uZ2V0SGVhZGVyPy4oKSB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgY2F0YWxvZ0tleSA9XG4gICAgICAgICAgICAgICAgICAgICAgICBUTVV0aWxzLmdldE9ic1ZhbHVlPy4oaGVhZGVyLCBbJ0NhdGFsb2dfS2V5JywgJ0NhdGFsb2dLZXknXSwgeyBmaXJzdDogdHJ1ZSB9KSA/PyBudWxsO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBzdGlsbCBub24tZmF0YWw7IHdlXHUyMDE5bGwgZmFsbCBiYWNrIHRvIERTICovIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNhdGFsb2dLZXkgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRhc2sudXBkYXRlKCdGZXRjaGluZyBDYXRhbG9nIEtleVx1MjAyNicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19DYXRhbG9nS2V5QnlRdW90ZUtleSwgeyBRdW90ZV9LZXk6IHFrIH0pKTtcbiAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSkgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IE51bWJlcihxayksIENhdGFsb2dfS2V5OiBOdW1iZXIoY2F0YWxvZ0tleSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7IHRhc2suZXJyb3IoJ05vIENhdGFsb2cgS2V5Jyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gY2F0YWxvZyBmb3VuZCBmb3IgdGhpcyBxdW90ZScsICd3YXJuJyk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAvLyBDb2xsZWN0IHBhcnRzIGZyb20gS08gZ3JpZCBcdTIwMTQgZW5zdXJlIGRhdGFzb3VyY2UgaXMgbG9hZGVkIGZpcnN0XG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZCAmJiBLTz8uZGF0YUZvcj8uKGdyaWQpO1xuXG4gICAgICAgICAgICBpZiAoZ3JpZFZNICYmICghQXJyYXkuaXNBcnJheShncmlkVk0uZGF0YXNvdXJjZT8ucmF3KSB8fCAhZ3JpZFZNLmRhdGFzb3VyY2UucmF3Lmxlbmd0aCkpIHtcbiAgICAgICAgICAgICAgICB0YXNrLnVwZGF0ZSgnTG9hZGluZyBncmlkIGRhdGFcdTIwMjYnKTtcbiAgICAgICAgICAgICAgICB0cnkgeyBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3IDogW107XG5cbiAgICAgICAgICAgIGxvZyhgUVQzMDogcmF3WzBdIGtleXM9JHtyYXdbMF0gPyBPYmplY3Qua2V5cyhyYXdbMF0pLmpvaW4oJywnKSA6ICduL2EnfSB8IFBhcnRObyB0eXBlPSR7cmF3WzBdID8gdHlwZW9mIHJhd1swXS5QYXJ0Tm8gOiAnbi9hJ30gfCBpc09icz0ke3Jhd1swXSA/ICEhS08/LmlzT2JzZXJ2YWJsZT8uKHJhd1swXS5QYXJ0Tm8pIDogJ24vYSd9IHwgdmFsPSR7cmF3WzBdID8gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHJhd1swXSwgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgOiAnbi9hJ31gKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcnROb3MgPSBbLi4ubmV3IFNldChyYXcubWFwKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHIsIFwiUGFydE5vXCIsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkpLmZpbHRlcihCb29sZWFuKSldO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm9zLmxlbmd0aCkgeyB0YXNrLmVycm9yKCdObyBQYXJ0Tm8gdmFsdWVzJyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gUGFydE5vIHZhbHVlcyBmb3VuZCcsICd3YXJuJyk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZShgTG9hZGluZyAke3BhcnROb3MubGVuZ3RofSBwYXJ0KHMpXHUyMDI2YCk7XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgY29uc3QgcHJpY2VNYXAgPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHBhcnROb3MubWFwKGFzeW5jIChwKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQnJlYWtwb2ludHNCeVBhcnQsIHsgQ2F0YWxvZ19LZXk6IGNhdGFsb2dLZXksIENhdGFsb2dfUGFydF9ObzogcCB9KSkgfHwgW107XG4gICAgICAgICAgICAgICAgcHJpY2VNYXBbcF0gPSByb3dzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiByLkNhdGFsb2dfUGFydF9ObyA9PT0gcCAmJiBuZXcgRGF0ZShyLkVmZmVjdGl2ZV9EYXRlKSA8PSBub3cgJiYgbm93IDw9IG5ldyBEYXRlKHIuRXhwaXJhdGlvbl9EYXRlKSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuQnJlYWtwb2ludF9RdWFudGl0eSAtIGIuQnJlYWtwb2ludF9RdWFudGl0eSk7XG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIC8vIDMpIEFwcGx5IG9yIGRlbGV0ZSBwZXIgcm93IChxdC1zdGFuZGFyZCBsb29wKVxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcblxuICAgICAgICAgICAgLy8gUmV1c2UgZ3JpZC9yYXcgcmVzb2x2ZWQgYWJvdmUgKGF2b2lkIHJlZGVjbGFyYXRpb24pXG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAoc3RhbmRhcmQgYmVoYXZpb3IpXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA8PSAwICYmIFMuZGVsZXRlWmVyb1F0eVJvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcWtSb3cgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZUtleScsICdRdW90ZV9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXBrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVQYXJ0S2V5JywgJ1F1b3RlX1BhcnRfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwciA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlUHJpY2VLZXknLCAnUXVvdGVfUHJpY2VfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHFrUm93ICYmIHFwayAmJiBxcHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQnVpbGQgeC13d3ctZm9ybS11cmxlbmNvZGVkIHBheWxvYWQgc28gaXQgd29ya3Mgd2hldGhlciBUTVV0aWxzLmZldGNoRGF0YSBvciBuYXRpdmUgZmV0Y2ggaXMgdXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvcm0gPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlS2V5JywgU3RyaW5nKE51bWJlcihxa1JvdykpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVQYXJ0S2V5JywgU3RyaW5nKE51bWJlcihxcGspKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlUHJpY2VLZXknLCBTdHJpbmcoTnVtYmVyKHFwcikpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFudGktZm9yZ2VyeSB0b2tlbiAoaWYgcHJlc2VudCBvbiBwYWdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJ2dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy52YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy5jb250ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydnQpIGZvcm0uc2V0KCdfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlbicsIHJ2dCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUuaHR0cC5wb3N0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnL1NhbGVzQW5kQ1JNL1F1b3RlUGFydC9EZWxldGVRdW90ZVByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQ7IGNoYXJzZXQ9VVRGLTgnIH0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBEZWxldGVkIHJvd1ske2l9XWAsICdzdWNjZXNzJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnIoJ1FUMzAgZGVsZXRlIGVycm9yJywgZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBEZWxldGUgZmFpbGVkIHJvd1ske2l9XWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTa2lwIGRlbGV0ZSByb3dbJHtpfV0gXHUyMDE0IG1pc3Npbmcga2V5c2AsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwcmljZSB0byBub24temVybyByb3dzXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydE5vID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdQYXJ0Tm8nLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBicCA9IHBpY2tQcmljZShwcmljZU1hcFtwYXJ0Tm9dLCBxdHkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYnAgPT0gbnVsbCkgeyBsb2coYFFUMzA6IG5vIHByaWNlIGZvciBQYXJ0Tm89XCIke3BhcnROb31cIiBxdHk9JHtxdHl9IFx1MjAxNCBrZXlzIGluIHByaWNlTWFwOiBbJHtPYmplY3Qua2V5cyhwcmljZU1hcCkuam9pbignLCAnKX1dYCk7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5UHJpY2VUb1Jvdyhyb3csIHJvdW5kKGJwKSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogcm93WyR7aX1dIHF0eT0ke3F0eX0gcHJpY2U9JHtyb3VuZChicCl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZSgnUmVmcmVzaGluZyBncmlkXHUyMDI2Jyk7XG4gICAgICAgICAgICBjb25zdCBtb2RlID0gYXdhaXQgcmVmcmVzaFF1b3RlR3JpZCgpO1xuXG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1ByaWNpbmcgYXBwbGllZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgIG1vZGUgPyAnUHJpY2luZyBhcHBsaWVkIGFuZCBncmlkIHJlZnJlc2hlZCcgOiAnUHJpY2luZyBhcHBsaWVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxuICAgICAgICAgICAgICAgICdzdWNjZXNzJ1xuICAgICAgICAgICAgKTtcblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0YXNrLmVycm9yKCdGYWlsZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgQXBwbHkgZmFpbGVkOiAke2U/Lm1lc3NhZ2UgfHwgZX1gLCAnZXJyb3InKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIC8vIHJlY29uY2lsZSBwcmVzZW5jZSBpZiBTUEEgbmF2aWdhdGlvbiBjaGFuZ2VkIHRoZSBwYWdlXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIGhhbmRsZWQgYnkgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oKSBcbiAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEhlbHBlcnMgLS0tLS0tLS0tLVxuICAgIC8vIEFsd2F5cyByZWFkIGZyZXNoIGNvbnRleHQgKFNQQSBjYW4gY2hhbmdlIFF1b3RlS2V5L1BhZ2UpXG4gICAgY29uc3QgZ2V0Q3R4ID0gKCkgPT4gbHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQoKTtcblxuXG4gICAgZnVuY3Rpb24gcGlja1ByaWNlKGJwcywgcXR5KSB7XG4gICAgICAgIGlmICghYnBzPy5sZW5ndGgpIHJldHVybiBudWxsO1xuICAgICAgICBpZiAocXR5IDwgYnBzWzBdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbMF0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgY29uc3QgbGFzdCA9IGJwc1ticHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGlmIChxdHkgPj0gbGFzdC5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gbGFzdC5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJwcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChxdHkgPj0gYnBzW2ldLkJyZWFrcG9pbnRfUXVhbnRpdHkgJiYgcXR5IDwgYnBzW2kgKyAxXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzW2ldLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFwcGx5UHJpY2VUb1Jvdyhyb3csIHByaWNlKSB7XG4gICAgICAgIFRNVXRpbHMuc2V0T2JzVmFsdWUocm93LCAnUnZDdXN0b21pemVkVW5pdFByaWNlJywgcHJpY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyeSB0byByZWZyZXNoIHRoZSBRdW90ZSBncmlkIHZpc3VhbHMgYWZ0ZXIgYXBwbHkvZGVsZXRlIG9wcy5cbiAgICAgKiBPcmRlciBvZiBhdHRlbXB0czpcbiAgICAgKiAgMSkgS08gZ3JpZCBWTSBkYXRhc291cmNlLnJlYWQoKSAoYXN5bmMpXG4gICAgICogIDIpIGdyaWQgVk0gLnJlZnJlc2goKSAoc3luYylcbiAgICAgKiAgMykgV2l6YXJkIG5hdiB0byBjdXJyZW50IHBhZ2UgKHJlYmluZHMgcGFnZSlcbiAgICAgKiBSZXR1cm5zIGEgc3RyaW5nIGRlc2NyaWJpbmcgd2hpY2ggcGF0aCBzdWNjZWVkZWQsIG9yIG51bGwuXG4gICAgICovXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFF1b3RlR3JpZCgpIHtcbiAgICAgICAgLy8gUHJlZmVyIGEgS08tbGV2ZWwgcmVmcmVzaCBpZiBhdmFpbGFibGVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IGdyaWRFbCAmJiBLTz8uZGF0YUZvcj8uKGdyaWRFbCk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxuICAgICAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgc2FtZSBhY3RpdmUgcGFnZSB0byBmb3JjZSByZWJpbmRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlKGFjdGl2ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBydW5BcHBseVByaWNpbmcgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTSxNQUFPLE9BQ1AsT0FDQSxDQUFDLEVBQUUsT0FBTyxlQUFlLGVBQWUsV0FBVztBQUV6RCxHQUFDLGlCQUFrQjtBQUVmLFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBO0FBQUEsTUFFYixrQkFBa0I7QUFBQTtBQUFBLE1BRWxCLHlCQUF5QjtBQUFBO0FBQUEsTUFDekIsZ0JBQWdCO0FBQUEsTUFDaEIsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFJQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlBQVksTUFBTTtBQUNwQyxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFBRyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQUc7QUFDNUQsVUFBTSxNQUFNLElBQUksTUFBTTtBQUFFLFVBQUksT0FBTyxRQUFTLElBQUcs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
