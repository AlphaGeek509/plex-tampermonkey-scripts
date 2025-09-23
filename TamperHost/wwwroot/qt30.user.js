// ==UserScript==
// @name        QT30_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.37
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.37-1758668539364
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.37-1758668539364
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.37-1758668539364
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.37-1758668539364
// @require      http://localhost:5000/lt-core.user.js?v=3.8.37-1758668539364
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
    async function mergeDraftIntoQuoteOnce(qk) {
      return lt?.core?.qt?.promoteDraftToQuote({ qk: Number(qk), strategy: "once" });
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
        showWhen: () => {
          try {
            if (document.querySelector('#QuotePartSummaryForm,[id^="QuotePartSummaryForm_"]')) {
              return true;
            }
            const active = document.querySelector(".plex-wizard-page-list .plex-wizard-page.active");
            return !!(active && active.textContent && active.textContent.trim().toLowerCase() === "part summary");
          } catch {
            return false;
          }
        },
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
            lt.core.hub.notify("Sign-in required", "warn", { ms: 4e3 });
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
          lt.core.hub.notify("No catalog found for this quote", "warn", { ms: 4e3 });
          return;
        }
        const grid = document.querySelector(CONFIG.GRID_SEL);
        const raw = grid && KO?.dataFor && Array.isArray(KO.dataFor(grid)?.datasource?.raw) ? KO.dataFor(grid).datasource.raw : [];
        const partNos = [...new Set(raw.map((r) => TMUtils.getObsValue?.(r, "PartNo", { first: true, trim: true })).filter(Boolean))];
        if (!partNos.length) {
          task.error("No PartNo values");
          lt.core.hub.notify("No PartNo values found", "warn", { ms: 4e3 });
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
                lt.core.hub.notify(`Deleted row[${i}]`, "success", { ms: 2500 });
              } catch (e) {
                err("QT30 delete error", e);
                lt.core.hub.notify(`Delete failed row[${i}]`, "error", { ms: 3e3 });
              }
            } else {
              lt.core.hub.notify(`Skip delete row[${i}] \u2014 missing keys`, "warn", { ms: 2500 });
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
          "success",
          { ms: 3e3 }
        );
      } catch (e) {
        task.error("Failed");
        lt.core.hub.notify(`Apply failed: ${e?.message || e}`, "error", { ms: 4e3 });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIC8vIExlZ2FjeSB0ZXh0IG1hdGNoZXIgKGtlcHQgZm9yIGZhbGxiYWNrIG9ubHkpXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICAvLyBOZXc6IHplcm8tYmFzZWQgaW5kZXggb2YgdGhlIFBhcnQgU3VtbWFyeSBzdGVwIGluIHRoZSB3aXphcmQgbGlzdFxuICAgICAgICBQQVJUX1NVTU1BUllfU1RFUF9JTkRFWDogMSwgLy8gMD1RdW90ZSwgMT1QYXJ0IFN1bW1hcnksIDI9Tm90ZXMgKGJhc2VkIG9uIHlvdXIgSFRNTClcbiAgICAgICAgRk9SQ0VfU0hPV19CVE46IGZhbHNlLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIG1lcmdlRHJhZnRJbnRvUXVvdGVPbmNlKHFrKSB7XG4gICAgICAgIHJldHVybiBsdD8uY29yZT8ucXQ/LnByb21vdGVEcmFmdFRvUXVvdGUoeyBxazogTnVtYmVyKHFrKSwgc3RyYXRlZ3k6ICdvbmNlJyB9KTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIChHTSB0b2xlcmFudCkgLS0tLS0tLS0tLVxuICAgIGNvbnN0IGxvYWRTZXR0aW5ncyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIENPTkZJRy5kZWZhdWx0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnID8geyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLkpTT04ucGFyc2UodikgfSA6IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi52IH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DT05GSUcuZGVmYXVsdHMgfTsgfVxuICAgIH07XG4gICAgY29uc3Qgc2F2ZVNldHRpbmdzID0gKG5leHQpID0+IHtcbiAgICAgICAgdHJ5IHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBuZXh0KTsgfVxuICAgICAgICBjYXRjaCB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgSlNPTi5zdHJpbmdpZnkobmV4dCkpOyB9XG4gICAgfTtcblxuXG4gICAgLy8gRGVsZWdhdGUgdG8gbHQuY29yZS5hdXRoIHdyYXBwZXIgKHF0MjAvcXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcbiAgICAgICAgY29uc3QgaW1wbCA9IGx0Py5jb3JlPy5hdXRoPy53aXRoRnJlc2hBdXRoO1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcbiAgICB9O1xuXG4gICAgLy8gSHViIGJ1dHRvbiByZWdpc3RyYXRpb24gKHF0MzUgcGF0dGVybilcbiAgICBjb25zdCBIVUJfQlROX0lEID0gJ3F0MzAtYXBwbHktcHJpY2luZyc7XG5cbiAgICAvLyA9PT09PSBTUEEgd2lyaW5nIChxdDM1IHBhdHRlcm4pID09PT09XG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuXG4gICAgICAgIGF3YWl0IGx0LmNvcmUucXQuZW5zdXJlSHViQnV0dG9uKHtcbiAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgbGFiZWw6ICdBcHBseSBQcmljaW5nJyxcbiAgICAgICAgICAgIHRpdGxlOiAnQXBwbHkgY3VzdG9tZXIgY2F0YWxvZyBwcmljaW5nJyxcbiAgICAgICAgICAgIHNpZGU6ICdsZWZ0JyxcbiAgICAgICAgICAgIHdlaWdodDogMTIwLFxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gcnVuQXBwbHlQcmljaW5nKCksXG4gICAgICAgICAgICAvLyBPbmx5IHNob3cgd2hlbiB0aGUgYWN0aXZlIHdpemFyZCBzdGVwIDxsaT4gaXMgdGhlIGNvbmZpZ3VyZWQgaW5kZXguXG4gICAgICAgICAgICAvLyBDb21wbGV0ZWx5IGlnbm9yZXMgYW55IFwiUGFydCBTdW1tYXJ5XCIgdGV4dCBlbHNld2hlcmUgb24gdGhlIHBhZ2UuXG4gICAgICAgICAgICBzaG93V2hlbjogKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFN0cm9uZ2VzdCBzaWduYWw6IHRoZSBQYXJ0IFN1bW1hcnkgZm9ybS9hY3Rpb25zIGV4aXN0IGluIERPTVxuICAgICAgICAgICAgICAgICAgICBpZiAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI1F1b3RlUGFydFN1bW1hcnlGb3JtLFtpZF49XCJRdW90ZVBhcnRTdW1tYXJ5Rm9ybV9cIl0nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gU2Vjb25kYXJ5OiBhY3RpdmUgd2l6YXJkIHN0ZXBcdTIwMTlzIHZpc2libGUgbGFiZWwgaXMgZXhhY3RseSBcIlBhcnQgU3VtbWFyeVwiXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhIShhY3RpdmUgJiYgYWN0aXZlLnRleHRDb250ZW50ICYmIGFjdGl2ZS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ3BhcnQgc3VtbWFyeScpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBTYWZldHkgZnVzZSAobm8gdG9wLWxldmVsIGF3YWl0KTogZGVmZXIgdmlhIHByb21pc2VcbiAgICAgICAgbHQuY29yZS5xdC5nZXRIdWIoeyBtb3VudDogJ25hdicgfSkudGhlbigoaHViKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gQXJyYXkuaXNBcnJheShodWI/Lmxpc3Q/LigpKSA/IGh1Yi5saXN0KCkgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGlkcyA9IGxpc3QubWFwKHggPT4gKHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnKSA/IHguaWQgOiB4KS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICBjb25zdCBwcmVzZW50ID0gKHR5cGVvZiBodWI/LmhhcyA9PT0gJ2Z1bmN0aW9uJykgPyAhIWh1Yi5oYXMoSFVCX0JUTl9JRCkgOiBpZHMuaW5jbHVkZXMoSFVCX0JUTl9JRCk7XG5cbiAgICAgICAgICAgIGlmICghcHJlc2VudCAmJiB0eXBlb2YgaHViPy5yZWdpc3RlckJ1dHRvbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlZiA9IHsgaWQ6IEhVQl9CVE5fSUQsIGxhYmVsOiAnQXBwbHkgUHJpY2luZycsIHRpdGxlOiAnQXBwbHkgY3VzdG9tZXIgY2F0YWxvZyBwcmljaW5nJywgd2VpZ2h0OiAxMjAsIG9uQ2xpY2s6ICgpID0+IHJ1bkFwcGx5UHJpY2luZygpIH07XG4gICAgICAgICAgICAgICAgdHJ5IHsgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0JywgZGVmKTsgfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaCgoKSA9PiB7IH0pO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBvZmZVcmw/LigpOyBvZmZVcmwgPSBudWxsO1xuICAgIH1cblxuICAgIC8vIGluaXRpYWxpemUgZm9yIGN1cnJlbnQgcm91dGUgKyB3aXJlIHJvdXRlIGNoYW5nZXNcbiAgICBpbml0KCk7XG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuQXBwbHlQcmljaW5nKCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKCdBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gYXV0aFxuICAgICAgICAgICAgdHJ5IHsgaWYgKCEoYXdhaXQgbHQuY29yZS5hdXRoLmdldEtleSgpKSkgeyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ1NpZ24taW4gcmVxdWlyZWQnLCAnd2FybicsIHsgbXM6IDQwMDAgfSk7IHRhc2suZXJyb3IoJ05vIHNlc3Npb24nKTsgcmV0dXJuOyB9IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcXVvdGVLZXk6IHFrIH0gPSBnZXRDdHgoKSB8fCB7fTtcbiAgICAgICAgICAgIGlmICghcWspIHsgdGFzay5lcnJvcignUXVvdGVfS2V5IG1pc3NpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB3ZVx1MjAxOXJlIG9wZXJhdGluZyBvbiB0aGUgY29ycmVjdCBxdW90ZSBzY29wZVxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcblxuICAgICAgICAgICAgLy8gMSkgQXNrIGx0LWNvcmUgdG8gcHJvbW90ZSBkcmFmdCBcdTIxOTIgcXVvdGUgKGNlbnRyYWxpemVkIHBhdGgsIG9uZS1zaG90IGZpcnN0KVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBQcmVmZXIgdGhlIHNpbmdsZSBwdWJsaWMgZW50cnlwb2ludCBpbiBsdC1jb3JlXG4gICAgICAgICAgICAgICAgYXdhaXQgbHQuY29yZS5xdC5wcm9tb3RlRHJhZnRUb1F1b3RlPy4oeyBxaywgc3RyYXRlZ3k6ICdvbmNlJyB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWw7IHdlXHUyMDE5bGwgdmVyaWZ5IGJ5IHJlYWRpbmcgaGVhZGVyIG5leHQgKi8gfVxuXG4gICAgICAgICAgICAvLyAyKSBSZS1yZWFkIGxpdmUgcXVvdGUgaGVhZGVyIGFmdGVyIHByb21vdGlvblxuICAgICAgICAgICAgbGV0IGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgbGV0IGNhdGFsb2dLZXkgPVxuICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG5cbiAgICAgICAgICAgIC8vIDMpIElmIEtPIHdhcyBzdGlsbCBiaW5kaW5nICh2ZXJ5IGZhc3QgY2xpY2spLCB0cnkgYSBzaG9ydCByZXRyeSB3aW5kb3cgdmlhIGx0LWNvcmVcbiAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBsdC5jb3JlLnF0LnByb21vdGVEcmFmdFRvUXVvdGU/Lih7IHFrLCBzdHJhdGVneTogJ3JldHJ5JyB9KTsgLy8gc2hvcnQsIGludGVybmFsIHJldHJ5XG4gICAgICAgICAgICAgICAgICAgIGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIHN0aWxsIG5vbi1mYXRhbDsgd2VcdTIwMTlsbCBmYWxsIGJhY2sgdG8gRFMgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGFzay51cGRhdGUoJ0ZldGNoaW5nIENhdGFsb2cgS2V5XHUyMDI2Jyk7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93czEgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUucGxleC5kc1Jvd3MoQ09ORklHLkRTX0NhdGFsb2dLZXlCeVF1b3RlS2V5LCB7IFF1b3RlX0tleTogcWsgfSkpO1xuICAgICAgICAgICAgICAgIGNhdGFsb2dLZXkgPSByb3dzMT8uWzBdPy5DYXRhbG9nX0tleSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5KSBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXI/Lih7IFF1b3RlX0tleTogTnVtYmVyKHFrKSwgQ2F0YWxvZ19LZXk6IE51bWJlcihjYXRhbG9nS2V5KSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjYXRhbG9nS2V5ID09IG51bGwpIHsgdGFzay5lcnJvcignTm8gQ2F0YWxvZyBLZXknKTsgbHQuY29yZS5odWIubm90aWZ5KCdObyBjYXRhbG9nIGZvdW5kIGZvciB0aGlzIHF1b3RlJywgJ3dhcm4nLCB7IG1zOiA0MDAwIH0pOyByZXR1cm47IH1cblxuICAgICAgICAgICAgLy8gQ29sbGVjdCBwYXJ0cyBmcm9tIEtPIGdyaWQgbm93IChyZXVzZSB0b3AtbGV2ZWwgS08pXG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuXG4gICAgICAgICAgICBjb25zdCByYXcgPSAoZ3JpZCAmJiBLTz8uZGF0YUZvciAmJiBBcnJheS5pc0FycmF5KEtPLmRhdGFGb3IoZ3JpZCk/LmRhdGFzb3VyY2U/LnJhdykpXG4gICAgICAgICAgICAgICAgPyBLTy5kYXRhRm9yKGdyaWQpLmRhdGFzb3VyY2UucmF3IDogW107XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnROb3MgPSBbLi4ubmV3IFNldChyYXcubWFwKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHIsIFwiUGFydE5vXCIsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkpLmZpbHRlcihCb29sZWFuKSldO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm9zLmxlbmd0aCkgeyB0YXNrLmVycm9yKCdObyBQYXJ0Tm8gdmFsdWVzJyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gUGFydE5vIHZhbHVlcyBmb3VuZCcsICd3YXJuJywgeyBtczogNDAwMCB9KTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHRhc2sudXBkYXRlKGBMb2FkaW5nICR7cGFydE5vcy5sZW5ndGh9IHBhcnQocylcdTIwMjZgKTtcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICBjb25zdCBwcmljZU1hcCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocGFydE5vcy5tYXAoYXN5bmMgKHApID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19CcmVha3BvaW50c0J5UGFydCwgeyBDYXRhbG9nX0tleTogY2F0YWxvZ0tleSwgQ2F0YWxvZ19QYXJ0X05vOiBwIH0pKSB8fCBbXTtcbiAgICAgICAgICAgICAgICBwcmljZU1hcFtwXSA9IHJvd3NcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IHIuQ2F0YWxvZ19QYXJ0X05vID09PSBwICYmIG5ldyBEYXRlKHIuRWZmZWN0aXZlX0RhdGUpIDw9IG5vdyAmJiBub3cgPD0gbmV3IERhdGUoci5FeHBpcmF0aW9uX0RhdGUpKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5CcmVha3BvaW50X1F1YW50aXR5IC0gYi5CcmVha3BvaW50X1F1YW50aXR5KTtcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLy8gMykgQXBwbHkgb3IgZGVsZXRlIHBlciByb3cgKHF0LXN0YW5kYXJkIGxvb3ApXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBjb25zdCByb3VuZCA9IChuKSA9PiArKCtuKS50b0ZpeGVkKFMudW5pdFByaWNlRGVjaW1hbHMpO1xuXG4gICAgICAgICAgICAvLyBSZXVzZSBncmlkL3JhdyByZXNvbHZlZCBhYm92ZSAoYXZvaWQgcmVkZWNsYXJhdGlvbilcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByYXcubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSByYXdbaV07XG4gICAgICAgICAgICAgICAgY29uc3QgcXR5ID0gKyhUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1F1YW50aXR5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KSB8fCAwKTtcblxuICAgICAgICAgICAgICAgIC8vIERlbGV0ZSB6ZXJvLXF0eSByb3dzIChzdGFuZGFyZCBiZWhhdmlvcilcbiAgICAgICAgICAgICAgICBpZiAocXR5IDw9IDAgJiYgUy5kZWxldGVaZXJvUXR5Um93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxa1JvdyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlS2V5JywgJ1F1b3RlX0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZVBhcnRLZXknLCAnUXVvdGVfUGFydF9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXByID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVQcmljZUtleScsICdRdW90ZV9QcmljZV9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocWtSb3cgJiYgcXBrICYmIHFwcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBCdWlsZCB4LXd3dy1mb3JtLXVybGVuY29kZWQgcGF5bG9hZCBzbyBpdCB3b3JrcyB3aGV0aGVyIFRNVXRpbHMuZmV0Y2hEYXRhIG9yIG5hdGl2ZSBmZXRjaCBpcyB1c2VkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9ybSA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVLZXknLCBTdHJpbmcoTnVtYmVyKHFrUm93KSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZVBhcnRLZXknLCBTdHJpbmcoTnVtYmVyKHFwaykpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVQcmljZUtleScsIFN0cmluZyhOdW1iZXIocXByKSkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQW50aS1mb3JnZXJ5IHRva2VuIChpZiBwcmVzZW50IG9uIHBhZ2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcnZ0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT1cIl9fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuXCJdJyk/LnZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21ldGFbbmFtZT1cIl9fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuXCJdJyk/LmNvbnRlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ2dCkgZm9ybS5zZXQoJ19fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuJywgcnZ0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5odHRwLnBvc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcvU2FsZXNBbmRDUk0vUXVvdGVQYXJ0L0RlbGV0ZVF1b3RlUHJpY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnRvU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOCcgfSB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYERlbGV0ZWQgcm93WyR7aX1dYCwgJ3N1Y2Nlc3MnLCB7IG1zOiAyNTAwIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyKCdRVDMwIGRlbGV0ZSBlcnJvcicsIGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCAnZXJyb3InLCB7IG1zOiAzMDAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTa2lwIGRlbGV0ZSByb3dbJHtpfV0gXHUyMDE0IG1pc3Npbmcga2V5c2AsICd3YXJuJywgeyBtczogMjUwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IHByaWNlIHRvIG5vbi16ZXJvIHJvd3NcbiAgICAgICAgICAgICAgICBpZiAocXR5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gcGlja1ByaWNlKHByaWNlTWFwW3BhcnROb10sIHF0eSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicCA9PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlQcmljZVRvUm93KHJvdywgcm91bmQoYnApKTtcbiAgICAgICAgICAgICAgICAgICAgbG9nKGBRVDMwOiByb3dbJHtpfV0gcXR5PSR7cXR5fSBwcmljZT0ke3JvdW5kKGJwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRhc2sudXBkYXRlKCdSZWZyZXNoaW5nIGdyaWRcdTIwMjYnKTtcbiAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG5cbiAgICAgICAgICAgIHRhc2suc3VjY2VzcygnUHJpY2luZyBhcHBsaWVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXG4gICAgICAgICAgICAgICAgbW9kZSA/ICdQcmljaW5nIGFwcGxpZWQgYW5kIGdyaWQgcmVmcmVzaGVkJyA6ICdQcmljaW5nIGFwcGxpZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgJ3N1Y2Nlc3MnLFxuICAgICAgICAgICAgICAgIHsgbXM6IDMwMDAgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0YXNrLmVycm9yKCdGYWlsZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgQXBwbHkgZmFpbGVkOiAke2U/Lm1lc3NhZ2UgfHwgZX1gLCAnZXJyb3InLCB7IG1zOiA0MDAwIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgLy8gcmVjb25jaWxlIHByZXNlbmNlIGlmIFNQQSBuYXZpZ2F0aW9uIGNoYW5nZWQgdGhlIHBhZ2VcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gaGFuZGxlZCBieSBsdC5jb3JlLnF0LmVuc3VyZUh1YkJ1dHRvbigpIFxuICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gSGVscGVycyAtLS0tLS0tLS0tXG4gICAgLy8gQWx3YXlzIHJlYWQgZnJlc2ggY29udGV4dCAoU1BBIGNhbiBjaGFuZ2UgUXVvdGVLZXkvUGFnZSlcbiAgICBjb25zdCBnZXRDdHggPSAoKSA9PiBsdD8uY29yZT8ucXQ/LmdldFF1b3RlQ29udGV4dCgpO1xuXG5cbiAgICBmdW5jdGlvbiBwaWNrUHJpY2UoYnBzLCBxdHkpIHtcbiAgICAgICAgaWYgKCFicHM/Lmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChxdHkgPCBicHNbMF0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1swXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBjb25zdCBsYXN0ID0gYnBzW2Jwcy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKHF0eSA+PSBsYXN0LkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBsYXN0LkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnBzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHF0eSA+PSBicHNbaV0uQnJlYWtwb2ludF9RdWFudGl0eSAmJiBxdHkgPCBicHNbaSArIDFdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbaV0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gYXBwbHlQcmljZVRvUm93KHJvdywgcHJpY2UpIHtcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZShyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnLCBwcmljZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ5IHRvIHJlZnJlc2ggdGhlIFF1b3RlIGdyaWQgdmlzdWFscyBhZnRlciBhcHBseS9kZWxldGUgb3BzLlxuICAgICAqIE9yZGVyIG9mIGF0dGVtcHRzOlxuICAgICAqICAxKSBLTyBncmlkIFZNIGRhdGFzb3VyY2UucmVhZCgpIChhc3luYylcbiAgICAgKiAgMikgZ3JpZCBWTSAucmVmcmVzaCgpIChzeW5jKVxuICAgICAqICAzKSBXaXphcmQgbmF2IHRvIGN1cnJlbnQgcGFnZSAocmViaW5kcyBwYWdlKVxuICAgICAqIFJldHVybnMgYSBzdHJpbmcgZGVzY3JpYmluZyB3aGljaCBwYXRoIHN1Y2NlZWRlZCwgb3IgbnVsbC5cbiAgICAgKi9cbiAgICBhc3luYyBmdW5jdGlvbiByZWZyZXNoUXVvdGVHcmlkKCkge1xuICAgICAgICAvLyBQcmVmZXIgYSBLTy1sZXZlbCByZWZyZXNoIGlmIGF2YWlsYWJsZVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZ3JpZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZEVsICYmIEtPPy5kYXRhRm9yPy4oZ3JpZEVsKTtcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LmRhdGFzb3VyY2U/LnJlYWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXG4gICAgICAgICAgICAgICAgcmV0dXJuICdkcy5yZWFkJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgZ3JpZFZNLnJlZnJlc2goKTsgICAgICAgICAgICAgICAgICAvLyBzeW5jIHZpc3VhbCByZWZyZXNoXG4gICAgICAgICAgICAgICAgcmV0dXJuICd2bS5yZWZyZXNoJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBzYW1lIGFjdGl2ZSBwYWdlIHRvIGZvcmNlIHJlYmluZFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9ICh0eXBlb2Ygd2l6LmFjdGl2ZVBhZ2UgPT09ICdmdW5jdGlvbicpID8gd2l6LmFjdGl2ZVBhZ2UoKSA6IHdpei5hY3RpdmVQYWdlO1xuICAgICAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3dpei5uYXZpZ2F0ZVBhZ2UnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gVGlueSBERVYgdGVzdCBzZWFtIC0tLS0tLS0tLS1cbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMzBfXyA9IHsgcGlja1ByaWNlLCBhcHBseVByaWNlVG9Sb3csIHJ1bkFwcGx5UHJpY2luZyB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTSxNQUFPLE9BQ1AsT0FDQSxDQUFDLEVBQUUsT0FBTyxlQUFlLGVBQWUsV0FBVztBQUV6RCxHQUFDLGlCQUFrQjtBQUVm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
