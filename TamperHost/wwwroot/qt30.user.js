// ==UserScript==
// @name        QT30_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.138
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.138-1759273268320
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.138-1759273268320
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.138-1759273268320
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.138-1759273268320
// @require      http://localhost:5000/lt-core.user.js?v=3.8.138-1759273268320
// @resource     THEME_CSS http://localhost:5000/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @run-at      document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @updateURL   http://localhost:5000/qt30.user.js
// @downloadURL http://localhost:5000/qt30.user.js
// ==/UserScript==

(() => {
  // src/quote-tracking/qt30-catalogPricingApply/qt30.index.js
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
        weight: 120,
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
          const def = { id: HUB_BTN_ID, label: "Apply Pricing", title: "Apply customer catalog pricing", weight: 120, onClick: () => runApplyPricing() };
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
        const raw = grid && KO?.dataFor && Array.isArray(KO.dataFor(grid)?.datasource?.raw) ? KO.dataFor(grid).datasource.raw : [];
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
            if (bp == null) continue;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIC8vIExlZ2FjeSB0ZXh0IG1hdGNoZXIgKGtlcHQgZm9yIGZhbGxiYWNrIG9ubHkpXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICAvLyBOZXc6IHplcm8tYmFzZWQgaW5kZXggb2YgdGhlIFBhcnQgU3VtbWFyeSBzdGVwIGluIHRoZSB3aXphcmQgbGlzdFxuICAgICAgICBQQVJUX1NVTU1BUllfU1RFUF9JTkRFWDogMSwgLy8gMD1RdW90ZSwgMT1QYXJ0IFN1bW1hcnksIDI9Tm90ZXMgKGJhc2VkIG9uIHlvdXIgSFRNTClcbiAgICAgICAgRk9SQ0VfU0hPV19CVE46IGZhbHNlLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgKEdNIHRvbGVyYW50KSAtLS0tLS0tLS0tXG4gICAgY29uc3QgbG9hZFNldHRpbmdzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfTtcbiAgICBjb25zdCBzYXZlU2V0dGluZ3MgPSAobmV4dCkgPT4ge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9O1xuXG5cbiAgICAvLyBEZWxlZ2F0ZSB0byBsdC5jb3JlLmF1dGggd3JhcHBlciAocXQyMC9xdDM1IHBhdHRlcm4pXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cbiAgICAvLyBIdWIgYnV0dG9uIHJlZ2lzdHJhdGlvbiAocXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQzMC1hcHBseS1wcmljaW5nJztcblxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgKHF0MzUgcGF0dGVybikgPT09PT1cbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5lbnN1cmVIdWJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0FwcGx5IFByaWNpbmcnLFxuICAgICAgICAgICAgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5BcHBseVByaWNpbmcoKSxcbiAgICAgICAgICAgIC8vIE9ubHkgc2hvdyB3aGVuIHRoZSBhY3RpdmUgd2l6YXJkIHN0ZXAgPGxpPiBpcyB0aGUgY29uZmlndXJlZCBpbmRleC5cbiAgICAgICAgICAgIC8vIENvbXBsZXRlbHkgaWdub3JlcyBhbnkgXCJQYXJ0IFN1bW1hcnlcIiB0ZXh0IGVsc2V3aGVyZSBvbiB0aGUgcGFnZS5cbiAgICAgICAgICAgIHNob3dXaGVuOiAoKSA9PiB0cnVlLFxuICAgICAgICAgICAgLy97XG4gICAgICAgICAgICAvLyAgICB0cnkge1xuICAgICAgICAgICAgLy8gICAgICAgIC8vIFN0cm9uZ2VzdCBzaWduYWw6IHRoZSBQYXJ0IFN1bW1hcnkgZm9ybS9hY3Rpb25zIGV4aXN0IGluIERPTVxuICAgICAgICAgICAgLy8gICAgICAgIGlmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjUXVvdGVQYXJ0U3VtbWFyeUZvcm0sW2lkXj1cIlF1b3RlUGFydFN1bW1hcnlGb3JtX1wiXScpKSB7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgLy8gICAgICAgIH1cbiAgICAgICAgICAgIC8vICAgICAgICAvLyBTZWNvbmRhcnk6IGFjdGl2ZSB3aXphcmQgc3RlcFx1MjAxOXMgdmlzaWJsZSBsYWJlbCBpcyBleGFjdGx5IFwiUGFydCBTdW1tYXJ5XCJcbiAgICAgICAgICAgIC8vICAgICAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZScpO1xuICAgICAgICAgICAgLy8gICAgICAgIHJldHVybiAhIShhY3RpdmUgJiYgYWN0aXZlLnRleHRDb250ZW50ICYmIGFjdGl2ZS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ3BhcnQgc3VtbWFyeScpO1xuICAgICAgICAgICAgLy8gICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgLy8gICAgfVxuICAgICAgICAgICAgLy99LFxuICAgICAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFNhZmV0eSBmdXNlIChubyB0b3AtbGV2ZWwgYXdhaXQpOiBkZWZlciB2aWEgcHJvbWlzZVxuICAgICAgICBsdC5jb3JlLnF0LmdldEh1Yih7IG1vdW50OiAnbmF2JyB9KS50aGVuKChodWIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KGh1Yj8ubGlzdD8uKCkpID8gaHViLmxpc3QoKSA6IFtdO1xuICAgICAgICAgICAgY29uc3QgaWRzID0gbGlzdC5tYXAoeCA9PiAoeCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcpID8geC5pZCA6IHgpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXNlbnQgPSAodHlwZW9mIGh1Yj8uaGFzID09PSAnZnVuY3Rpb24nKSA/ICEhaHViLmhhcyhIVUJfQlROX0lEKSA6IGlkcy5pbmNsdWRlcyhIVUJfQlROX0lEKTtcblxuICAgICAgICAgICAgaWYgKCFwcmVzZW50ICYmIHR5cGVvZiBodWI/LnJlZ2lzdGVyQnV0dG9uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVmID0geyBpZDogSFVCX0JUTl9JRCwgbGFiZWw6ICdBcHBseSBQcmljaW5nJywgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLCB3ZWlnaHQ6IDEyMCwgb25DbGljazogKCkgPT4gcnVuQXBwbHlQcmljaW5nKCkgfTtcbiAgICAgICAgICAgICAgICB0cnkgeyBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCBkZWYpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmNhdGNoKCgpID0+IHsgfSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIG9mZlVybD8uKCk7IG9mZlVybCA9IG51bGw7XG4gICAgfVxuXG4gICAgLy8gaW5pdGlhbGl6ZSBmb3IgY3VycmVudCByb3V0ZSArIHdpcmUgcm91dGUgY2hhbmdlc1xuICAgIGluaXQoKTtcbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKFJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xuXG5cbiAgICBhc3luYyBmdW5jdGlvbiBydW5BcHBseVByaWNpbmcoKSB7XG4gICAgICAgIGNvbnN0IHRhc2sgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2soJ0FwcGx5aW5nIGNhdGFsb2cgcHJpY2luZ1x1MjAyNicsICdpbmZvJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBhdXRoXG4gICAgICAgICAgICB0cnkgeyBpZiAoIShhd2FpdCBsdC5jb3JlLmF1dGguZ2V0S2V5KCkpKSB7IGx0LmNvcmUuaHViLm5vdGlmeSgnU2lnbi1pbiByZXF1aXJlZCcsICd3YXJuJyk7IHRhc2suZXJyb3IoJ05vIHNlc3Npb24nKTsgcmV0dXJuOyB9IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcXVvdGVLZXk6IHFrIH0gPSBnZXRDdHgoKSB8fCB7fTtcbiAgICAgICAgICAgIGlmICghcWspIHsgdGFzay5lcnJvcignUXVvdGVfS2V5IG1pc3NpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB3ZVx1MjAxOXJlIG9wZXJhdGluZyBvbiB0aGUgY29ycmVjdCBxdW90ZSBzY29wZVxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcblxuICAgICAgICAgICAgLy8gMSkgQXNrIGx0LWNvcmUgdG8gcHJvbW90ZSBkcmFmdCBcdTIxOTIgcXVvdGUgKGNlbnRyYWxpemVkIHBhdGgsIG9uZS1zaG90IGZpcnN0KVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIHNpbmdsZSBwdWJsaWMgZW50cnlwb2ludCBpbiBsdC1jb3JlXG4gICAgICAgICAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxaywgc3RyYXRlZ3k6ICdvbmNlJyB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWw7IHdlXHUyMDE5bGwgdmVyaWZ5IGJ5IHJlYWRpbmcgaGVhZGVyIG5leHQgKi8gfVxuXG4gICAgICAgICAgICAvLyAyKSBSZS1yZWFkIGxpdmUgcXVvdGUgaGVhZGVyIGFmdGVyIHByb21vdGlvblxuICAgICAgICAgICAgbGV0IGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgbGV0IGNhdGFsb2dLZXkgPVxuICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG5cbiAgICAgICAgICAgIC8vIDMpIElmIEtPIHdhcyBzdGlsbCBiaW5kaW5nICh2ZXJ5IGZhc3QgY2xpY2spLCB0cnkgYSBzaG9ydCByZXRyeSB3aW5kb3cgdmlhIGx0LWNvcmVcbiAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBsdC5jb3JlLnF0LnByb21vdGVEcmFmdFRvUXVvdGU/Lih7IHFrLCBzdHJhdGVneTogJ3JldHJ5JyB9KTsgLy8gc2hvcnQsIGludGVybmFsIHJldHJ5XG4gICAgICAgICAgICAgICAgICAgIGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIHN0aWxsIG5vbi1mYXRhbDsgd2VcdTIwMTlsbCBmYWxsIGJhY2sgdG8gRFMgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGFzay51cGRhdGUoJ0ZldGNoaW5nIENhdGFsb2cgS2V5XHUyMDI2Jyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93czEgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0NhdGFsb2dLZXlCeVF1b3RlS2V5LCB7IFF1b3RlX0tleTogcWsgfSkpO1xuICAgICAgICAgICAgICAgIGNhdGFsb2dLZXkgPSByb3dzMT8uWzBdPy5DYXRhbG9nX0tleSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5KSBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXI/Lih7IFF1b3RlX0tleTogTnVtYmVyKHFrKSwgQ2F0YWxvZ19LZXk6IE51bWJlcihjYXRhbG9nS2V5KSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5ID09IG51bGwpIHsgdGFzay5lcnJvcignTm8gQ2F0YWxvZyBLZXknKTsgbHQuY29yZS5odWIubm90aWZ5KCdObyBjYXRhbG9nIGZvdW5kIGZvciB0aGlzIHF1b3RlJywgJ3dhcm4nKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIENvbGxlY3QgcGFydHMgZnJvbSBLTyBncmlkIG5vdyAocmV1c2UgdG9wLWxldmVsIEtPKVxuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcblxuICAgICAgICAgICAgY29uc3QgcmF3ID0gKGdyaWQgJiYgS08/LmRhdGFGb3IgJiYgQXJyYXkuaXNBcnJheShLTy5kYXRhRm9yKGdyaWQpPy5kYXRhc291cmNlPy5yYXcpKVxuICAgICAgICAgICAgICAgID8gS08uZGF0YUZvcihncmlkKS5kYXRhc291cmNlLnJhdyA6IFtdO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9zID0gWy4uLm5ldyBTZXQocmF3Lm1hcChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihyLCBcIlBhcnROb1wiLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pKS5maWx0ZXIoQm9vbGVhbikpXTtcbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgdGFzay5lcnJvcignTm8gUGFydE5vIHZhbHVlcycpOyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ05vIFBhcnRObyB2YWx1ZXMgZm91bmQnLCAnd2FybicpOyByZXR1cm47IH1cblxuICAgICAgICAgICAgdGFzay51cGRhdGUoYExvYWRpbmcgJHtwYXJ0Tm9zLmxlbmd0aH0gcGFydChzKVx1MjAyNmApO1xuICAgICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIGNvbnN0IHByaWNlTWFwID0ge307XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChwYXJ0Tm9zLm1hcChhc3luYyAocCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0JyZWFrcG9pbnRzQnlQYXJ0LCB7IENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5LCBDYXRhbG9nX1BhcnRfTm86IHAgfSkpIHx8IFtdO1xuICAgICAgICAgICAgICAgIHByaWNlTWFwW3BdID0gcm93c1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gci5DYXRhbG9nX1BhcnRfTm8gPT09IHAgJiYgbmV3IERhdGUoci5FZmZlY3RpdmVfRGF0ZSkgPD0gbm93ICYmIG5vdyA8PSBuZXcgRGF0ZShyLkV4cGlyYXRpb25fRGF0ZSkpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLkJyZWFrcG9pbnRfUXVhbnRpdHkgLSBiLkJyZWFrcG9pbnRfUXVhbnRpdHkpO1xuICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAvLyAzKSBBcHBseSBvciBkZWxldGUgcGVyIHJvdyAocXQtc3RhbmRhcmQgbG9vcClcbiAgICAgICAgICAgIGNvbnN0IFMgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIGNvbnN0IHJvdW5kID0gKG4pID0+ICsoK24pLnRvRml4ZWQoUy51bml0UHJpY2VEZWNpbWFscyk7XG5cbiAgICAgICAgICAgIC8vIFJldXNlIGdyaWQvcmF3IHJlc29sdmVkIGFib3ZlIChhdm9pZCByZWRlY2xhcmF0aW9uKVxuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJhdy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJhd1tpXTtcbiAgICAgICAgICAgICAgICBjb25zdCBxdHkgPSArKFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUXVhbnRpdHknLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pIHx8IDApO1xuXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHplcm8tcXR5IHJvd3MgKHN0YW5kYXJkIGJlaGF2aW9yKVxuICAgICAgICAgICAgICAgIGlmIChxdHkgPD0gMCAmJiBTLmRlbGV0ZVplcm9RdHlSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFrUm93ID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVLZXknLCAnUXVvdGVfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlUGFydEtleScsICdRdW90ZV9QYXJ0X0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcHIgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZVByaWNlS2V5JywgJ1F1b3RlX1ByaWNlX0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChxa1JvdyAmJiBxcGsgJiYgcXByKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJ1aWxkIHgtd3d3LWZvcm0tdXJsZW5jb2RlZCBwYXlsb2FkIHNvIGl0IHdvcmtzIHdoZXRoZXIgVE1VdGlscy5mZXRjaERhdGEgb3IgbmF0aXZlIGZldGNoIGlzIHVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3JtID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZUtleScsIFN0cmluZyhOdW1iZXIocWtSb3cpKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlUGFydEtleScsIFN0cmluZyhOdW1iZXIocXBrKSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZVByaWNlS2V5JywgU3RyaW5nKE51bWJlcihxcHIpKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBbnRpLWZvcmdlcnkgdG9rZW4gKGlmIHByZXNlbnQgb24gcGFnZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBydnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPVwiX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW5cIl0nKT8udmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbWV0YVtuYW1lPVwiX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW5cIl0nKT8uY29udGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnZ0KSBmb3JtLnNldCgnX19SZXF1ZXN0VmVyaWZpY2F0aW9uVG9rZW4nLCBydnQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLmh0dHAucG9zdChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy9TYWxlc0FuZENSTS9RdW90ZVBhcnQvRGVsZXRlUXVvdGVQcmljZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0udG9TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04JyB9IH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlZCByb3dbJHtpfV1gLCAnc3VjY2VzcycpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyKCdRVDMwIGRlbGV0ZSBlcnJvcicsIGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgU2tpcCBkZWxldGUgcm93WyR7aX1dIFx1MjAxNCBtaXNzaW5nIGtleXNgLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcHJpY2UgdG8gbm9uLXplcm8gcm93c1xuICAgICAgICAgICAgICAgIGlmIChxdHkgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCAnUGFydE5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnAgPSBwaWNrUHJpY2UocHJpY2VNYXBbcGFydE5vXSwgcXR5KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJwID09IG51bGwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBhcHBseVByaWNlVG9Sb3cocm93LCByb3VuZChicCkpO1xuICAgICAgICAgICAgICAgICAgICBsb2coYFFUMzA6IHJvd1ske2l9XSBxdHk9JHtxdHl9IHByaWNlPSR7cm91bmQoYnApfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGFzay51cGRhdGUoJ1JlZnJlc2hpbmcgZ3JpZFx1MjAyNicpO1xuICAgICAgICAgICAgY29uc3QgbW9kZSA9IGF3YWl0IHJlZnJlc2hRdW90ZUdyaWQoKTtcblxuICAgICAgICAgICAgdGFzay5zdWNjZXNzKCdQcmljaW5nIGFwcGxpZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcbiAgICAgICAgICAgICAgICBtb2RlID8gJ1ByaWNpbmcgYXBwbGllZCBhbmQgZ3JpZCByZWZyZXNoZWQnIDogJ1ByaWNpbmcgYXBwbGllZCAocmVsb2FkIG1heSBiZSBuZWVkZWQpJyxcbiAgICAgICAgICAgICAgICAnc3VjY2VzcydcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYEFwcGx5IGZhaWxlZDogJHtlPy5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyByZWNvbmNpbGUgcHJlc2VuY2UgaWYgU1BBIG5hdmlnYXRpb24gY2hhbmdlZCB0aGUgcGFnZVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBoYW5kbGVkIGJ5IGx0LmNvcmUucXQuZW5zdXJlSHViQnV0dG9uKCkgXG4gICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cbiAgICAvLyBBbHdheXMgcmVhZCBmcmVzaCBjb250ZXh0IChTUEEgY2FuIGNoYW5nZSBRdW90ZUtleS9QYWdlKVxuICAgIGNvbnN0IGdldEN0eCA9ICgpID0+IGx0Py5jb3JlPy5xdD8uZ2V0UXVvdGVDb250ZXh0KCk7XG5cblxuICAgIGZ1bmN0aW9uIHBpY2tQcmljZShicHMsIHF0eSkge1xuICAgICAgICBpZiAoIWJwcz8ubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKHF0eSA8IGJwc1swXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzWzBdLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBicHNbYnBzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAocXR5ID49IGxhc3QuQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGxhc3QuQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocXR5ID49IGJwc1tpXS5CcmVha3BvaW50X1F1YW50aXR5ICYmIHF0eSA8IGJwc1tpICsgMV0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1tpXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhcHBseVByaWNlVG9Sb3cocm93LCBwcmljZSkge1xuICAgICAgICBUTVV0aWxzLnNldE9ic1ZhbHVlKHJvdywgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScsIHByaWNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnkgdG8gcmVmcmVzaCB0aGUgUXVvdGUgZ3JpZCB2aXN1YWxzIGFmdGVyIGFwcGx5L2RlbGV0ZSBvcHMuXG4gICAgICogT3JkZXIgb2YgYXR0ZW1wdHM6XG4gICAgICogIDEpIEtPIGdyaWQgVk0gZGF0YXNvdXJjZS5yZWFkKCkgKGFzeW5jKVxuICAgICAqICAyKSBncmlkIFZNIC5yZWZyZXNoKCkgKHN5bmMpXG4gICAgICogIDMpIFdpemFyZCBuYXYgdG8gY3VycmVudCBwYWdlIChyZWJpbmRzIHBhZ2UpXG4gICAgICogUmV0dXJucyBhIHN0cmluZyBkZXNjcmliaW5nIHdoaWNoIHBhdGggc3VjY2VlZGVkLCBvciBudWxsLlxuICAgICAqL1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgICAgIC8vIFByZWZlciBhIEtPLWxldmVsIHJlZnJlc2ggaWYgYXZhaWxhYmxlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IGdyaWRWTS5kYXRhc291cmNlLnJlYWQoKTsgICAvLyBhc3luYyByZS1xdWVyeS9yZWJpbmRcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2RzLnJlYWQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LnJlZnJlc2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBncmlkVk0ucmVmcmVzaCgpOyAgICAgICAgICAgICAgICAgIC8vIHN5bmMgdmlzdWFsIHJlZnJlc2hcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB3aXphcmQgbmF2aWdhdGUgdG8gdGhlIHNhbWUgYWN0aXZlIHBhZ2UgdG8gZm9yY2UgcmViaW5kXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3cucGxleD8uY3VycmVudFBhZ2U/LlF1b3RlV2l6YXJkO1xuICAgICAgICAgICAgaWYgKHdpej8ubmF2aWdhdGVQYWdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gKHR5cGVvZiB3aXouYWN0aXZlUGFnZSA9PT0gJ2Z1bmN0aW9uJykgPyB3aXouYWN0aXZlUGFnZSgpIDogd2l6LmFjdGl2ZVBhZ2U7XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZShhY3RpdmUpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnd2l6Lm5hdmlnYXRlUGFnZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBUaW55IERFViB0ZXN0IHNlYW0gLS0tLS0tLS0tLVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQzMF9fID0geyBwaWNrUHJpY2UsIGFwcGx5UHJpY2VUb1JvdywgcnVuQXBwbHlQcmljaW5nIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsaUJBQWtCO0FBRWYsVUFBTSxTQUFTO0FBQUEsTUFDWCx5QkFBeUI7QUFBQSxNQUN6QixzQkFBc0I7QUFBQSxNQUN0QixVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUE7QUFBQSxNQUViLGtCQUFrQjtBQUFBO0FBQUEsTUFFbEIseUJBQXlCO0FBQUE7QUFBQSxNQUN6QixnQkFBZ0I7QUFBQSxNQUNoQixVQUFVLEVBQUUsbUJBQW1CLE1BQU0sbUJBQW1CLEdBQUcsdUJBQXVCLEtBQUs7QUFBQSxJQUMzRjtBQUlB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
