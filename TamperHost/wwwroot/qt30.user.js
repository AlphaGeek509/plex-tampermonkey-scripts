// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.46
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.46-1758144171643
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.46-1758144171643
// @require      http://localhost:5000/lt-ui-hub.js?v=3.6.46-1758144171643
// @require      http://localhost:5000/lt-core.user.js?v=3.6.46-1758144171643
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.46-1758144171643
// @resource     THEME_CSS http://localhost:5000/theme.css
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
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
      settingsKey: "qt30_settings_v1",
      SHOW_ON_PAGES_RE: /^part\s*summary$/i,
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
    async function getHub(opts = { mount: "nav" }) {
      for (let i = 0; i < 50; i++) {
        const ensure = window.ensureLTHub || unsafeWindow?.ensureLTHub;
        if (typeof ensure === "function") {
          try {
            const hub = await ensure(opts);
            if (hub) return hub;
          } catch {
          }
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }
    function getActiveWizardPageName() {
      const li = document.querySelector(".plex-wizard-page-list .plex-wizard-page.active");
      if (!li) return "";
      return (li.textContent || "").trim().replace(/\s+/g, " ");
    }
    function isOnTargetWizardPage() {
      return CONFIG.SHOW_ON_PAGES_RE.test(getActiveWizardPageName());
    }
    async function ensureHubButton() {
      const hub = await getHub({ mount: "nav" });
      if (!hub?.registerButton) return;
      const already = hub.list?.()?.includes(HUB_BTN_ID);
      if (already) return;
      hub.registerButton("left", {
        id: HUB_BTN_ID,
        label: "Apply Pricing",
        title: "Apply customer catalog pricing",
        weight: 120,
        onClick: () => runApplyPricing()
      });
    }
    let booted = false;
    let offUrl = null;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    async function reconcileHubButtonVisibility() {
      if (CONFIG.FORCE_SHOW_BTN || isOnTargetWizardPage()) {
        await ensureHubButton();
      } else {
        const hub = await getHub();
        hub?.remove?.(HUB_BTN_ID);
      }
    }
    let pageObserver = null;
    function startWizardPageObserver() {
      const root = document.querySelector(".plex-wizard-page-list");
      if (!root) return;
      pageObserver = new MutationObserver((mut) => {
        if (mut.some((m) => m.type === "attributes" || m.type === "childList")) {
          reconcileHubButtonVisibility();
        }
      });
      pageObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
      window.addEventListener("hashchange", reconcileHubButtonVisibility);
    }
    function stopWizardPageObserver() {
      try {
        window.removeEventListener("hashchange", reconcileHubButtonVisibility);
      } catch {
      }
      try {
        pageObserver?.disconnect();
      } catch {
      }
      pageObserver = null;
    }
    async function init() {
      if (booted) return;
      booted = true;
      try {
        await getHub({ mount: "nav" });
      } catch {
      }
      await reconcileHubButtonVisibility();
      startWizardPageObserver();
    }
    function teardown() {
      booted = false;
      offUrl?.();
      offUrl = null;
      stopWizardPageObserver();
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
        const qk = getQuoteKeyDeterministic();
        if (!qk) {
          task.error("Quote_Key missing");
          return;
        }
        await ensureRepoForQuote(qk);
        const header = await quoteRepo.getHeader?.() || {};
        let catalogKey = TMUtils.getObsValue?.(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;
        if (!catalogKey) {
          task.update("Fetching Catalog Key\u2026");
          const rows1 = await withFreshAuth(() => lt.core.plex.dsRows(CONFIG.DS_CatalogKeyByQuoteKey, { Quote_Key: qk }));
          catalogKey = rows1?.[0]?.Catalog_Key || null;
          if (catalogKey) await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: Number(catalogKey) });
        }
        if (!catalogKey) {
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
          await reconcileHubButtonVisibility();
        } catch {
        }
      }
    }
    function getQuoteKeyDeterministic() {
      try {
        const grid = document.querySelector(CONFIG.GRID_SEL);
        const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        if (grid && KO2?.dataFor) {
          const gridVM = KO2.dataFor(grid);
          const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
          const v = raw0 ? TMUtils.getObsValue?.(raw0, ["QuoteKey", "Quote_Key"]) : null;
          if (v != null) return Number(v);
        }
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        const rootVM = rootEl ? KO2?.dataFor?.(rootEl) : null;
        const v = rootVM && (TMUtils.getObsValue?.(rootVM, ["QuoteKey", "Quote_Key"]) || TMUtils.getObsValue?.(rootVM, ["Quote.QuoteKey", "Quote.Quote_Key"]));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICBGT1JDRV9TSE9XX0JUTjogZmFsc2UsXG4gICAgICAgIGRlZmF1bHRzOiB7IGRlbGV0ZVplcm9RdHlSb3dzOiB0cnVlLCB1bml0UHJpY2VEZWNpbWFsczogMywgZW5hYmxlSG92ZXJBZmZvcmRhbmNlOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87IGxhc3RTY29wZSA9IHFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBxdW90ZVJlcG87XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBTZXR0aW5ncyAoR00gdG9sZXJhbnQpIC0tLS0tLS0tLS1cbiAgICBjb25zdCBsb2FkU2V0dGluZ3MgPSAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBDT05GSUcuZGVmYXVsdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi5KU09OLnBhcnNlKHYpIH0gOiB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4udiB9O1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgLi4uQ09ORklHLmRlZmF1bHRzIH07IH1cbiAgICB9O1xuICAgIGNvbnN0IHNhdmVTZXR0aW5ncyA9IChuZXh0KSA9PiB7XG4gICAgICAgIHRyeSB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgbmV4dCk7IH1cbiAgICAgICAgY2F0Y2ggeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIEpTT04uc3RyaW5naWZ5KG5leHQpKTsgfVxuICAgIH07XG5cblxuICAgIC8vIERlbGVnYXRlIHRvIGx0LmNvcmUuYXV0aCB3cmFwcGVyIChxdDIwL3F0MzUgcGF0dGVybilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIEh1YiBidXR0b24gcmVnaXN0cmF0aW9uIChxdDM1IHBhdHRlcm4pXG4gICAgY29uc3QgSFVCX0JUTl9JRCA9ICdxdDMwLWFwcGx5LXByaWNpbmcnO1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiBcIm5hdlwiIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XG4gICAgICAgIC8vIEFjdGl2ZSBMSSByZW5kZXJzIHRoZSBwYWdlIG5hbWUgYXMgYSBkaXJlY3QgdGV4dCBub2RlIChxdDM1IGxvZ2ljKVxuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlJyk7XG4gICAgICAgIGlmICghbGkpIHJldHVybiAnJztcbiAgICAgICAgcmV0dXJuIChsaS50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7XG4gICAgICAgIHJldHVybiBDT05GSUcuU0hPV19PTl9QQUdFU19SRS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xuICAgIH1cblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSHViQnV0dG9uKCkge1xuICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogXCJuYXZcIiB9KTtcbiAgICAgICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgYWxyZWFkeSA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSFVCX0JUTl9JRCk7XG4gICAgICAgIGlmIChhbHJlYWR5KSByZXR1cm47XG5cbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ0FwcGx5IFByaWNpbmcnLFxuICAgICAgICAgICAgdGl0bGU6ICdBcHBseSBjdXN0b21lciBjYXRhbG9nIHByaWNpbmcnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMjAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5BcHBseVByaWNpbmcoKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PSBTUEEgd2lyaW5nIChxdDM1IHBhdHRlcm4pID09PT09XG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlOyBsZXQgb2ZmVXJsID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpIHtcbiAgICAgICAgLy8gU2hvdyBvbmx5IG9uIHRhcmdldCBwYWdlICh1bmxlc3MgZm9yY2VkKVxuICAgICAgICBpZiAoQ09ORklHLkZPUkNFX1NIT1dfQlROIHx8IGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUh1YkJ1dHRvbigpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKCk7XG4gICAgICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHBhZ2VPYnNlcnZlciA9IG51bGw7XG4gICAgZnVuY3Rpb24gc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKSB7XG4gICAgICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgICAgIGlmICghcm9vdCkgcmV0dXJuO1xuICAgICAgICBwYWdlT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0KSA9PiB7XG4gICAgICAgICAgICBpZiAobXV0LnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJyB8fCBtLnR5cGUgPT09ICdjaGlsZExpc3QnKSkge1xuICAgICAgICAgICAgICAgIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHBhZ2VPYnNlcnZlci5vYnNlcnZlKHJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10sIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc3RvcFdpemFyZFBhZ2VPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHsgcGFnZU9ic2VydmVyPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuXG4gICAgICAgIHRyeSB7IGF3YWl0IGdldEh1Yih7IG1vdW50OiBcIm5hdlwiIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICBhd2FpdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG4gICAgICAgIHN0YXJ0V2l6YXJkUGFnZU9ic2VydmVyKCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gbnVsbDtcbiAgICAgICAgc3RvcFdpemFyZFBhZ2VPYnNlcnZlcigpO1xuICAgIH1cblxuICAgIC8vIGluaXRpYWxpemUgZm9yIGN1cnJlbnQgcm91dGUgKyB3aXJlIHJvdXRlIGNoYW5nZXNcbiAgICBpbml0KCk7XG4gICAgd2lyZU5hdigoKSA9PiB7IGlmIChST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcblxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuQXBwbHlQcmljaW5nKCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKCdBcHBseWluZyBjYXRhbG9nIHByaWNpbmdcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gYXV0aFxuICAgICAgICAgICAgdHJ5IHsgaWYgKCEoYXdhaXQgbHQuY29yZS5hdXRoLmdldEtleSgpKSkgeyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ1NpZ24taW4gcmVxdWlyZWQnLCAnd2FybicsIHsgbXM6IDQwMDAgfSk7IHRhc2suZXJyb3IoJ05vIHNlc3Npb24nKTsgcmV0dXJuOyB9IH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XG4gICAgICAgICAgICBpZiAoIXFrKSB7IHRhc2suZXJyb3IoJ1F1b3RlX0tleSBtaXNzaW5nJyk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVSZXBvRm9yUXVvdGUocWspO1xuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcj8uKCkgfHwge307XG4gICAgICAgICAgICBsZXQgY2F0YWxvZ0tleSA9IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihoZWFkZXIsIFsnQ2F0YWxvZ19LZXknLCAnQ2F0YWxvZ0tleSddLCB7IGZpcnN0OiB0cnVlIH0pID8/IG51bGw7XG5cbiAgICAgICAgICAgIGlmICghY2F0YWxvZ0tleSkge1xuICAgICAgICAgICAgICAgIHRhc2sudXBkYXRlKCdGZXRjaGluZyBDYXRhbG9nIEtleVx1MjAyNicpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MxID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19DYXRhbG9nS2V5QnlRdW90ZUtleSwgeyBRdW90ZV9LZXk6IHFrIH0pKTtcbiAgICAgICAgICAgICAgICBjYXRhbG9nS2V5ID0gcm93czE/LlswXT8uQ2F0YWxvZ19LZXkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY2F0YWxvZ0tleSkgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IE51bWJlcihxayksIENhdGFsb2dfS2V5OiBOdW1iZXIoY2F0YWxvZ0tleSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHsgdGFzay5lcnJvcignTm8gQ2F0YWxvZyBLZXknKTsgbHQuY29yZS5odWIubm90aWZ5KCdObyBjYXRhbG9nIGZvdW5kIGZvciB0aGlzIHF1b3RlJywgJ3dhcm4nLCB7IG1zOiA0MDAwIH0pOyByZXR1cm47IH1cblxuICAgICAgICAgICAgLy8gQ29sbGVjdCBwYXJ0cyBmcm9tIEtPIGdyaWQgbm93IChyZXVzZSB0b3AtbGV2ZWwgS08pXG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuXG4gICAgICAgICAgICBjb25zdCByYXcgPSAoZ3JpZCAmJiBLTz8uZGF0YUZvciAmJiBBcnJheS5pc0FycmF5KEtPLmRhdGFGb3IoZ3JpZCk/LmRhdGFzb3VyY2U/LnJhdykpXG4gICAgICAgICAgICAgICAgPyBLTy5kYXRhRm9yKGdyaWQpLmRhdGFzb3VyY2UucmF3IDogW107XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnROb3MgPSBbLi4ubmV3IFNldChyYXcubWFwKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHIsIFwiUGFydE5vXCIsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkpLmZpbHRlcihCb29sZWFuKSldO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm9zLmxlbmd0aCkgeyB0YXNrLmVycm9yKCdObyBQYXJ0Tm8gdmFsdWVzJyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gUGFydE5vIHZhbHVlcyBmb3VuZCcsICd3YXJuJywgeyBtczogNDAwMCB9KTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHRhc2sudXBkYXRlKGBMb2FkaW5nICR7cGFydE5vcy5sZW5ndGh9IHBhcnQocylcdTIwMjZgKTtcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICBjb25zdCBwcmljZU1hcCA9IHt9O1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocGFydE5vcy5tYXAoYXN5bmMgKHApID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBsdC5jb3JlLnBsZXguZHNSb3dzKENPTkZJRy5EU19CcmVha3BvaW50c0J5UGFydCwgeyBDYXRhbG9nX0tleTogY2F0YWxvZ0tleSwgQ2F0YWxvZ19QYXJ0X05vOiBwIH0pKSB8fCBbXTtcbiAgICAgICAgICAgICAgICBwcmljZU1hcFtwXSA9IHJvd3NcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IHIuQ2F0YWxvZ19QYXJ0X05vID09PSBwICYmIG5ldyBEYXRlKHIuRWZmZWN0aXZlX0RhdGUpIDw9IG5vdyAmJiBub3cgPD0gbmV3IERhdGUoci5FeHBpcmF0aW9uX0RhdGUpKVxuICAgICAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5CcmVha3BvaW50X1F1YW50aXR5IC0gYi5CcmVha3BvaW50X1F1YW50aXR5KTtcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLy8gMykgQXBwbHkgb3IgZGVsZXRlIHBlciByb3cgKHF0LXN0YW5kYXJkIGxvb3ApXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBjb25zdCByb3VuZCA9IChuKSA9PiArKCtuKS50b0ZpeGVkKFMudW5pdFByaWNlRGVjaW1hbHMpO1xuXG4gICAgICAgICAgICAvLyBSZXVzZSBncmlkL3JhdyByZXNvbHZlZCBhYm92ZSAoYXZvaWQgcmVkZWNsYXJhdGlvbilcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByYXcubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSByYXdbaV07XG4gICAgICAgICAgICAgICAgY29uc3QgcXR5ID0gKyhUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1F1YW50aXR5JywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KSB8fCAwKTtcblxuICAgICAgICAgICAgICAgIC8vIERlbGV0ZSB6ZXJvLXF0eSByb3dzIChzdGFuZGFyZCBiZWhhdmlvcilcbiAgICAgICAgICAgICAgICBpZiAocXR5IDw9IDAgJiYgUy5kZWxldGVaZXJvUXR5Um93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxa1JvdyA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlS2V5JywgJ1F1b3RlX0tleSddLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZVBhcnRLZXknLCAnUXVvdGVfUGFydF9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXByID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVQcmljZUtleScsICdRdW90ZV9QcmljZV9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocWtSb3cgJiYgcXBrICYmIHFwcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBCdWlsZCB4LXd3dy1mb3JtLXVybGVuY29kZWQgcGF5bG9hZCBzbyBpdCB3b3JrcyB3aGV0aGVyIFRNVXRpbHMuZmV0Y2hEYXRhIG9yIG5hdGl2ZSBmZXRjaCBpcyB1c2VkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9ybSA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVLZXknLCBTdHJpbmcoTnVtYmVyKHFrUm93KSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcm0uc2V0KCdRdW90ZVBhcnRLZXknLCBTdHJpbmcoTnVtYmVyKHFwaykpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVQcmljZUtleScsIFN0cmluZyhOdW1iZXIocXByKSkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQW50aS1mb3JnZXJ5IHRva2VuIChpZiBwcmVzZW50IG9uIHBhZ2UpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcnZ0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT1cIl9fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuXCJdJyk/LnZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21ldGFbbmFtZT1cIl9fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuXCJdJyk/LmNvbnRlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ2dCkgZm9ybS5zZXQoJ19fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuJywgcnZ0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5odHRwLnBvc3QoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICcvU2FsZXNBbmRDUk0vUXVvdGVQYXJ0L0RlbGV0ZVF1b3RlUHJpY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnRvU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOCcgfSB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYERlbGV0ZWQgcm93WyR7aX1dYCwgJ3N1Y2Nlc3MnLCB7IG1zOiAyNTAwIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyKCdRVDMwIGRlbGV0ZSBlcnJvcicsIGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgRGVsZXRlIGZhaWxlZCByb3dbJHtpfV1gLCAnZXJyb3InLCB7IG1zOiAzMDAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTa2lwIGRlbGV0ZSByb3dbJHtpfV0gXHUyMDE0IG1pc3Npbmcga2V5c2AsICd3YXJuJywgeyBtczogMjUwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IHByaWNlIHRvIG5vbi16ZXJvIHJvd3NcbiAgICAgICAgICAgICAgICBpZiAocXR5ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgJ1BhcnRObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gcGlja1ByaWNlKHByaWNlTWFwW3BhcnROb10sIHF0eSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicCA9PSBudWxsKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlQcmljZVRvUm93KHJvdywgcm91bmQoYnApKTtcbiAgICAgICAgICAgICAgICAgICAgbG9nKGBRVDMwOiByb3dbJHtpfV0gcXR5PSR7cXR5fSBwcmljZT0ke3JvdW5kKGJwKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRhc2sudXBkYXRlKCdSZWZyZXNoaW5nIGdyaWRcdTIwMjYnKTtcbiAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG5cbiAgICAgICAgICAgIHRhc2suc3VjY2VzcygnUHJpY2luZyBhcHBsaWVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoXG4gICAgICAgICAgICAgICAgbW9kZSA/ICdQcmljaW5nIGFwcGxpZWQgYW5kIGdyaWQgcmVmcmVzaGVkJyA6ICdQcmljaW5nIGFwcGxpZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgJ3N1Y2Nlc3MnLFxuICAgICAgICAgICAgICAgIHsgbXM6IDMwMDAgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0YXNrLmVycm9yKCdGYWlsZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgQXBwbHkgZmFpbGVkOiAke2U/Lm1lc3NhZ2UgfHwgZX1gLCAnZXJyb3InLCB7IG1zOiA0MDAwIH0pO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgLy8gcmVjb25jaWxlIHByZXNlbmNlIGlmIFNQQSBuYXZpZ2F0aW9uIGNoYW5nZWQgdGhlIHBhZ2VcbiAgICAgICAgICAgIHRyeSB7IGF3YWl0IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cbiAgICAvLyBEZXRlcm1pbmlzdGljIFF1b3RlS2V5IChxdDM1IHBhdHRlcm4pXG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gS08uZGF0YUZvcihncmlkKTtcbiAgICAgICAgICAgICAgICBjb25zdCByYXcwID0gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXdbMF0gOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByYXcwID8gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHJhdzAsIFsnUXVvdGVLZXknLCAnUXVvdGVfS2V5J10pIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XG4gICAgICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAoXG4gICAgICAgICAgICAgICAgVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgWydRdW90ZUtleScsICdRdW90ZV9LZXknXSkgfHxcbiAgICAgICAgICAgICAgICBUTVV0aWxzLmdldE9ic1ZhbHVlPy4ocm9vdFZNLCBbJ1F1b3RlLlF1b3RlS2V5JywgJ1F1b3RlLlF1b3RlX0tleSddKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICByZXR1cm4gbSA/IE51bWJlcihtWzFdKSA6IG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGlja1ByaWNlKGJwcywgcXR5KSB7XG4gICAgICAgIGlmICghYnBzPy5sZW5ndGgpIHJldHVybiBudWxsO1xuICAgICAgICBpZiAocXR5IDwgYnBzWzBdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbMF0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgY29uc3QgbGFzdCA9IGJwc1ticHMubGVuZ3RoIC0gMV07XG4gICAgICAgIGlmIChxdHkgPj0gbGFzdC5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gbGFzdC5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJwcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChxdHkgPj0gYnBzW2ldLkJyZWFrcG9pbnRfUXVhbnRpdHkgJiYgcXR5IDwgYnBzW2kgKyAxXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzW2ldLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFwcGx5UHJpY2VUb1Jvdyhyb3csIHByaWNlKSB7XG4gICAgICAgIFRNVXRpbHMuc2V0T2JzVmFsdWUocm93LCAnUnZDdXN0b21pemVkVW5pdFByaWNlJywgcHJpY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyeSB0byByZWZyZXNoIHRoZSBRdW90ZSBncmlkIHZpc3VhbHMgYWZ0ZXIgYXBwbHkvZGVsZXRlIG9wcy5cbiAgICAgKiBPcmRlciBvZiBhdHRlbXB0czpcbiAgICAgKiAgMSkgS08gZ3JpZCBWTSBkYXRhc291cmNlLnJlYWQoKSAoYXN5bmMpXG4gICAgICogIDIpIGdyaWQgVk0gLnJlZnJlc2goKSAoc3luYylcbiAgICAgKiAgMykgV2l6YXJkIG5hdiB0byBjdXJyZW50IHBhZ2UgKHJlYmluZHMgcGFnZSlcbiAgICAgKiBSZXR1cm5zIGEgc3RyaW5nIGRlc2NyaWJpbmcgd2hpY2ggcGF0aCBzdWNjZWVkZWQsIG9yIG51bGwuXG4gICAgICovXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFF1b3RlR3JpZCgpIHtcbiAgICAgICAgLy8gUHJlZmVyIGEgS08tbGV2ZWwgcmVmcmVzaCBpZiBhdmFpbGFibGVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcbiAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IGdyaWRFbCAmJiBLTz8uZGF0YUZvcj8uKGdyaWRFbCk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxuICAgICAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgc2FtZSBhY3RpdmUgcGFnZSB0byBmb3JjZSByZWJpbmRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdy5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlKGFjdGl2ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFRpbnkgREVWIHRlc3Qgc2VhbSAtLS0tLS0tLS0tXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDMwX18gPSB7IHBpY2tQcmljZSwgYXBwbHlQcmljZVRvUm93LCBydW5BcHBseVByaWNpbmcgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsTUFBTTtBQUVILFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2Isa0JBQWtCO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFHQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlBQVksTUFBTTtBQUNwQyxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFBRyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQUc7QUFDNUQsVUFBTSxNQUFNLElBQUksTUFBTTtBQUFFLFVBQUksT0FBTyxRQUFTLElBQUcsUUFBUSxHQUFHLENBQUM7QUFBQSxJQUFHO0FBQzlELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixlQUFlLGFBQWEsS0FBTSxhQUFhLEtBQUssT0FBTztBQUMvRixVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFNLEdBQUcsS0FBSyxTQUFTLFFBQVEsQ0FBQyxHQUFHO0FBQUUsVUFBSSw2QkFBNkI7QUFBRztBQUFBLElBQVE7QUFHbEcsV0FBTyxpQkFBaUI7QUFDeEIsS0FBQyxZQUFZO0FBQ1QsVUFBSTtBQUFFLGNBQU0sT0FBTyxjQUFjLEVBQUUsT0FBTyxNQUFNLENBQUM7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUFFO0FBQzlELFNBQUcsS0FBSyxJQUFJLE9BQU8sU0FBUyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFBQSxJQUN4RCxHQUFHO0FBSUgsUUFBSSxLQUFLLE1BQU0sWUFBWSxNQUFNLFlBQVk7QUFFN0MsbUJBQWUsUUFBUTtBQUNuQixVQUFJLEdBQUksUUFBTztBQUNmLFlBQU0sS0FBSyxHQUFHLE1BQU07QUFDcEIsVUFBSSxDQUFDLElBQUksbUJBQW9CLE9BQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUNqRSxXQUFLLEdBQUcsbUJBQW1CLEVBQUUsSUFBSSxNQUFNLFFBQVEsU0FBUyxjQUFjLGNBQWMsQ0FBQztBQUNyRixhQUFPO0FBQUEsSUFDWDtBQUVBLG1CQUFlLG1CQUFtQixJQUFJO0FBQ2xDLFVBQUksQ0FBQyxHQUFJLFFBQU87QUFDaEIsVUFBSSxDQUFDLGFBQWEsY0FBYyxJQUFJO0FBQ2hDLGNBQU0sRUFBRSxLQUFLLEtBQUssTUFBTSxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztBQUMvQyxjQUFNLEtBQUssNEJBQTRCO0FBQ3ZDLG9CQUFZO0FBQU0sb0JBQVk7QUFBQSxNQUNsQztBQUNBLGFBQU87QUFBQSxJQUNYO0FBR0EsVUFBTSxlQUFlLE1BQU07QUFDdkIsVUFBSTtBQUNBLGNBQU0sSUFBSSxZQUFZLE9BQU8sYUFBYSxPQUFPLFFBQVE7QUFDekQsZUFBTyxPQUFPLE1BQU0sV0FBVyxFQUFFLEdBQUcsT0FBTyxVQUFVLEdBQUcsS0FBSyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxPQUFPLFVBQVUsR0FBRyxFQUFFO0FBQUEsTUFDekcsUUFBUTtBQUFFLGVBQU8sRUFBRSxHQUFHLE9BQU8sU0FBUztBQUFBLE1BQUc7QUFBQSxJQUM3QztBQUNBLFVBQU0sZUFBZSxDQUFDLFNBQVM7QUFDM0IsVUFBSTtBQUFFLG9CQUFZLE9BQU8sYUFBYSxJQUFJO0FBQUEsTUFBRyxRQUN2QztBQUFFLG9CQUFZLE9BQU8sYUFBYSxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQUEsTUFBRztBQUFBLElBQ25FO0FBSUEsVUFBTSxnQkFBZ0IsQ0FBQyxPQUFPO0FBQzFCLFlBQU0sT0FBTyxJQUFJLE1BQU0sTUFBTTtBQUM3QixhQUFRLE9BQU8sU0FBUyxhQUFjLEtBQUssRUFBRSxJQUFJLEdBQUc7QUFBQSxJQUN4RDtBQUdBLFVBQU0sYUFBYTtBQUVuQixtQkFBZSxPQUFPLE9BQU8sRUFBRSxPQUFPLE1BQU0sR0FBRztBQUMzQyxlQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUN6QixjQUFNLFNBQVUsT0FBTyxlQUFlLGNBQWM7QUFDcEQsWUFBSSxPQUFPLFdBQVcsWUFBWTtBQUM5QixjQUFJO0FBQUUsa0JBQU0sTUFBTSxNQUFNLE9BQU8sSUFBSTtBQUFHLGdCQUFJLElBQUssUUFBTztBQUFBLFVBQUssUUFBUTtBQUFBLFVBQUU7QUFBQSxRQUN6RTtBQUNBLGNBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQzdDO0FBQ0EsYUFBTztBQUFBLElBQ1g7QUFFQSxhQUFTLDBCQUEwQjtBQUUvQixZQUFNLEtBQUssU0FBUyxjQUFjLGlEQUFpRDtBQUNuRixVQUFJLENBQUMsR0FBSSxRQUFPO0FBQ2hCLGNBQVEsR0FBRyxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxHQUFHO0FBQUEsSUFDNUQ7QUFDQSxhQUFTLHVCQUF1QjtBQUM1QixhQUFPLE9BQU8saUJBQWlCLEtBQUssd0JBQXdCLENBQUM7QUFBQSxJQUNqRTtBQUdBLG1CQUFlLGtCQUFrQjtBQUM3QixZQUFNLE1BQU0sTUFBTSxPQUFPLEVBQUUsT0FBTyxNQUFNLENBQUM7QUFDekMsVUFBSSxDQUFDLEtBQUssZUFBZ0I7QUFFMUIsWUFBTSxVQUFVLElBQUksT0FBTyxHQUFHLFNBQVMsVUFBVTtBQUNqRCxVQUFJLFFBQVM7QUFFYixVQUFJLGVBQWUsUUFBUTtBQUFBLFFBQ3ZCLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFNBQVMsTUFBTSxnQkFBZ0I7QUFBQSxNQUNuQyxDQUFDO0FBQUEsSUFDTDtBQUdBLFFBQUksU0FBUztBQUFPLFFBQUksU0FBUztBQUVqQyxhQUFTLFFBQVEsU0FBUztBQUFFLGVBQVM7QUFBRyxlQUFTLE9BQU8sU0FBUyxjQUFjLE9BQU87QUFBQSxJQUFHO0FBRXpGLG1CQUFlLCtCQUErQjtBQUUxQyxVQUFJLE9BQU8sa0JBQWtCLHFCQUFxQixHQUFHO0FBQ2pELGNBQU0sZ0JBQWdCO0FBQUEsTUFDMUIsT0FBTztBQUNILGNBQU0sTUFBTSxNQUFNLE9BQU87QUFDekIsYUFBSyxTQUFTLFVBQVU7QUFBQSxNQUM1QjtBQUFBLElBQ0o7QUFFQSxRQUFJLGVBQWU7QUFDbkIsYUFBUywwQkFBMEI7QUFDL0IsWUFBTSxPQUFPLFNBQVMsY0FBYyx3QkFBd0I7QUFDNUQsVUFBSSxDQUFDLEtBQU07QUFDWCxxQkFBZSxJQUFJLGlCQUFpQixDQUFDLFFBQVE7QUFDekMsWUFBSSxJQUFJLEtBQUssT0FBSyxFQUFFLFNBQVMsZ0JBQWdCLEVBQUUsU0FBUyxXQUFXLEdBQUc7QUFDbEUsdUNBQTZCO0FBQUEsUUFDakM7QUFBQSxNQUNKLENBQUM7QUFDRCxtQkFBYSxRQUFRLE1BQU0sRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLGlCQUFpQixDQUFDLE9BQU8sR0FBRyxXQUFXLEtBQUssQ0FBQztBQUMzRyxhQUFPLGlCQUFpQixjQUFjLDRCQUE0QjtBQUFBLElBQ3RFO0FBQ0EsYUFBUyx5QkFBeUI7QUFDOUIsVUFBSTtBQUFFLGVBQU8sb0JBQW9CLGNBQWMsNEJBQTRCO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUN4RixVQUFJO0FBQUUsc0JBQWMsV0FBVztBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUU7QUFDNUMscUJBQWU7QUFBQSxJQUNuQjtBQUVBLG1CQUFlLE9BQU87QUFDbEIsVUFBSSxPQUFRO0FBQ1osZUFBUztBQUVULFVBQUk7QUFBRSxjQUFNLE9BQU8sRUFBRSxPQUFPLE1BQU0sQ0FBQztBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUU7QUFDaEQsWUFBTSw2QkFBNkI7QUFDbkMsOEJBQXdCO0FBQUEsSUFDNUI7QUFDQSxhQUFTLFdBQVc7QUFDaEIsZUFBUztBQUNULGVBQVM7QUFBRyxlQUFTO0FBQ3JCLDZCQUF1QjtBQUFBLElBQzNCO0FBR0EsU0FBSztBQUNMLFlBQVEsTUFBTTtBQUFFLFVBQUksT0FBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDLEVBQUcsTUFBSztBQUFBLFVBQVEsVUFBUztBQUFBLElBQUcsQ0FBQztBQUc3RixtQkFBZSxrQkFBa0I7QUFDN0IsWUFBTSxPQUFPLEdBQUcsS0FBSyxJQUFJLFVBQVUsa0NBQTZCLE1BQU07QUFDdEUsVUFBSTtBQUVBLFlBQUk7QUFBRSxjQUFJLENBQUUsTUFBTSxHQUFHLEtBQUssS0FBSyxPQUFPLEdBQUk7QUFBRSxlQUFHLEtBQUssSUFBSSxPQUFPLG9CQUFvQixRQUFRLEVBQUUsSUFBSSxJQUFLLENBQUM7QUFBRyxpQkFBSyxNQUFNLFlBQVk7QUFBRztBQUFBLFVBQVE7QUFBQSxRQUFFLFFBQVE7QUFBQSxRQUFFO0FBRXhKLGNBQU0sS0FBSyx5QkFBeUI7QUFDcEMsWUFBSSxDQUFDLElBQUk7QUFBRSxlQUFLLE1BQU0sbUJBQW1CO0FBQUc7QUFBQSxRQUFRO0FBRXBELGNBQU0sbUJBQW1CLEVBQUU7QUFDM0IsY0FBTSxTQUFTLE1BQU0sVUFBVSxZQUFZLEtBQUssQ0FBQztBQUNqRCxZQUFJLGFBQWEsUUFBUSxjQUFjLFFBQVEsQ0FBQyxlQUFlLFlBQVksR0FBRyxFQUFFLE9BQU8sS0FBSyxDQUFDLEtBQUs7QUFFbEcsWUFBSSxDQUFDLFlBQVk7QUFDYixlQUFLLE9BQU8sNEJBQXVCO0FBQ25DLGdCQUFNLFFBQVEsTUFBTSxjQUFjLE1BQU0sR0FBRyxLQUFLLEtBQUssT0FBTyxPQUFPLHlCQUF5QixFQUFFLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFDOUcsdUJBQWEsUUFBUSxDQUFDLEdBQUcsZUFBZTtBQUN4QyxjQUFJLFdBQVksT0FBTSxVQUFVLGNBQWMsRUFBRSxXQUFXLE9BQU8sRUFBRSxHQUFHLGFBQWEsT0FBTyxVQUFVLEVBQUUsQ0FBQztBQUFBLFFBQzVHO0FBQ0EsWUFBSSxDQUFDLFlBQVk7QUFBRSxlQUFLLE1BQU0sZ0JBQWdCO0FBQUcsYUFBRyxLQUFLLElBQUksT0FBTyxtQ0FBbUMsUUFBUSxFQUFFLElBQUksSUFBSyxDQUFDO0FBQUc7QUFBQSxRQUFRO0FBR3RJLGNBQU0sT0FBTyxTQUFTLGNBQWMsT0FBTyxRQUFRO0FBRW5ELGNBQU0sTUFBTyxRQUFRLElBQUksV0FBVyxNQUFNLFFBQVEsR0FBRyxRQUFRLElBQUksR0FBRyxZQUFZLEdBQUcsSUFDN0UsR0FBRyxRQUFRLElBQUksRUFBRSxXQUFXLE1BQU0sQ0FBQztBQUV6QyxjQUFNLFVBQVUsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksT0FBSyxRQUFRLGNBQWMsR0FBRyxVQUFVLEVBQUUsT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBQzFILFlBQUksQ0FBQyxRQUFRLFFBQVE7QUFBRSxlQUFLLE1BQU0sa0JBQWtCO0FBQUcsYUFBRyxLQUFLLElBQUksT0FBTywwQkFBMEIsUUFBUSxFQUFFLElBQUksSUFBSyxDQUFDO0FBQUc7QUFBQSxRQUFRO0FBRW5JLGFBQUssT0FBTyxXQUFXLFFBQVEsTUFBTSxnQkFBVztBQUNoRCxjQUFNLE1BQU0sb0JBQUksS0FBSztBQUNyQixjQUFNLFdBQVcsQ0FBQztBQUNsQixjQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksT0FBTyxNQUFNO0FBQ3ZDLGdCQUFNLE9BQU8sTUFBTSxjQUFjLE1BQU0sR0FBRyxLQUFLLEtBQUssT0FBTyxPQUFPLHNCQUFzQixFQUFFLGFBQWEsWUFBWSxpQkFBaUIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzlJLG1CQUFTLENBQUMsSUFBSSxLQUNULE9BQU8sT0FBSyxFQUFFLG9CQUFvQixLQUFLLElBQUksS0FBSyxFQUFFLGNBQWMsS0FBSyxPQUFPLE9BQU8sSUFBSSxLQUFLLEVBQUUsZUFBZSxDQUFDLEVBQzlHLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxtQkFBbUI7QUFBQSxRQUNyRSxDQUFDLENBQUM7QUFHRixjQUFNLElBQUksYUFBYTtBQUN2QixjQUFNLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLFFBQVEsRUFBRSxpQkFBaUI7QUFJdEQsaUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxRQUFRLEtBQUs7QUFDakMsZ0JBQU0sTUFBTSxJQUFJLENBQUM7QUFDakIsZ0JBQU0sTUFBTSxFQUFFLFFBQVEsWUFBWSxLQUFLLFlBQVksRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUMsS0FBSztBQUduRixjQUFJLE9BQU8sS0FBSyxFQUFFLG1CQUFtQjtBQUNqQyxrQkFBTSxRQUFRLFFBQVEsWUFBWSxLQUFLLENBQUMsWUFBWSxXQUFXLEdBQUcsRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUM7QUFDN0Ysa0JBQU0sTUFBTSxRQUFRLFlBQVksS0FBSyxDQUFDLGdCQUFnQixnQkFBZ0IsR0FBRyxFQUFFLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQztBQUNwRyxrQkFBTSxNQUFNLFFBQVEsWUFBWSxLQUFLLENBQUMsaUJBQWlCLGlCQUFpQixHQUFHLEVBQUUsT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBRXRHLGdCQUFJLFNBQVMsT0FBTyxLQUFLO0FBQ3JCLGtCQUFJO0FBRUEsc0JBQU0sT0FBTyxJQUFJLGdCQUFnQjtBQUNqQyxxQkFBSyxJQUFJLFlBQVksT0FBTyxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQzFDLHFCQUFLLElBQUksZ0JBQWdCLE9BQU8sT0FBTyxHQUFHLENBQUMsQ0FBQztBQUM1QyxxQkFBSyxJQUFJLGlCQUFpQixPQUFPLE9BQU8sR0FBRyxDQUFDLENBQUM7QUFHN0Msc0JBQU0sTUFBTSxTQUFTLGNBQWMsMENBQTBDLEdBQUcsU0FDekUsU0FBUyxjQUFjLHlDQUF5QyxHQUFHO0FBQzFFLG9CQUFJLElBQUssTUFBSyxJQUFJLDhCQUE4QixHQUFHO0FBRW5ELHNCQUFNLGNBQWMsTUFBTSxHQUFHLEtBQUssS0FBSztBQUFBLGtCQUNuQztBQUFBLGtCQUNBLEtBQUssU0FBUztBQUFBLGtCQUNkLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixtREFBbUQsRUFBRTtBQUFBLGdCQUN0RixDQUFDO0FBRUQsbUJBQUcsS0FBSyxJQUFJLE9BQU8sZUFBZSxDQUFDLEtBQUssV0FBVyxFQUFFLElBQUksS0FBSyxDQUFDO0FBQUEsY0FFbkUsU0FBUyxHQUFHO0FBQ1Isb0JBQUkscUJBQXFCLENBQUM7QUFDMUIsbUJBQUcsS0FBSyxJQUFJLE9BQU8scUJBQXFCLENBQUMsS0FBSyxTQUFTLEVBQUUsSUFBSSxJQUFLLENBQUM7QUFBQSxjQUN2RTtBQUFBLFlBQ0osT0FBTztBQUNILGlCQUFHLEtBQUssSUFBSSxPQUFPLG1CQUFtQixDQUFDLHlCQUFvQixRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFBQSxZQUNuRjtBQUVBO0FBQUEsVUFDSjtBQUdBLGNBQUksTUFBTSxHQUFHO0FBQ1Qsa0JBQU0sU0FBUyxRQUFRLFlBQVksS0FBSyxVQUFVLEVBQUUsT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQzdFLGtCQUFNLEtBQUssVUFBVSxTQUFTLE1BQU0sR0FBRyxHQUFHO0FBQzFDLGdCQUFJLE1BQU0sS0FBTTtBQUNoQiw0QkFBZ0IsS0FBSyxNQUFNLEVBQUUsQ0FBQztBQUM5QixnQkFBSSxhQUFhLENBQUMsU0FBUyxHQUFHLFVBQVUsTUFBTSxFQUFFLENBQUMsRUFBRTtBQUFBLFVBQ3ZEO0FBQUEsUUFDSjtBQUVBLGFBQUssT0FBTyx1QkFBa0I7QUFDOUIsY0FBTSxPQUFPLE1BQU0saUJBQWlCO0FBRXBDLGFBQUssUUFBUSxpQkFBaUI7QUFDOUIsV0FBRyxLQUFLLElBQUk7QUFBQSxVQUNSLE9BQU8sdUNBQXVDO0FBQUEsVUFDOUM7QUFBQSxVQUNBLEVBQUUsSUFBSSxJQUFLO0FBQUEsUUFDZjtBQUFBLE1BRUosU0FBUyxHQUFHO0FBQ1IsYUFBSyxNQUFNLFFBQVE7QUFDbkIsV0FBRyxLQUFLLElBQUksT0FBTyxpQkFBaUIsR0FBRyxXQUFXLENBQUMsSUFBSSxTQUFTLEVBQUUsSUFBSSxJQUFLLENBQUM7QUFBQSxNQUNoRixVQUFFO0FBRUUsWUFBSTtBQUFFLGdCQUFNLDZCQUE2QjtBQUFBLFFBQUcsUUFBUTtBQUFBLFFBQUU7QUFBQSxNQUMxRDtBQUFBLElBQ0o7QUFLQSxhQUFTLDJCQUEyQjtBQUNoQyxVQUFJO0FBQ0EsY0FBTSxPQUFPLFNBQVMsY0FBYyxPQUFPLFFBQVE7QUFDbkQsY0FBTUEsTUFBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFlBQUksUUFBUUEsS0FBSSxTQUFTO0FBQ3JCLGdCQUFNLFNBQVNBLElBQUcsUUFBUSxJQUFJO0FBQzlCLGdCQUFNLE9BQU8sTUFBTSxRQUFRLFFBQVEsWUFBWSxHQUFHLElBQUksT0FBTyxXQUFXLElBQUksQ0FBQyxJQUFJO0FBQ2pGLGdCQUFNLElBQUksT0FBTyxRQUFRLGNBQWMsTUFBTSxDQUFDLFlBQVksV0FBVyxDQUFDLElBQUk7QUFDMUUsY0FBSSxLQUFLLEtBQU0sUUFBTyxPQUFPLENBQUM7QUFBQSxRQUNsQztBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQUU7QUFDVixVQUFJO0FBQ0EsY0FBTSxTQUFTLFNBQVMsY0FBYywwQkFBMEI7QUFDaEUsY0FBTUEsTUFBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLGNBQU0sU0FBUyxTQUFTQSxLQUFJLFVBQVUsTUFBTSxJQUFJO0FBQ2hELGNBQU0sSUFBSSxXQUNOLFFBQVEsY0FBYyxRQUFRLENBQUMsWUFBWSxXQUFXLENBQUMsS0FDdkQsUUFBUSxjQUFjLFFBQVEsQ0FBQyxrQkFBa0IsaUJBQWlCLENBQUM7QUFHdkUsWUFBSSxLQUFLLEtBQU0sUUFBTyxPQUFPLENBQUM7QUFBQSxNQUNsQyxRQUFRO0FBQUEsTUFBRTtBQUNWLFlBQU0sSUFBSSxzQkFBc0IsS0FBSyxTQUFTLE1BQU07QUFDcEQsYUFBTyxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUMsSUFBSTtBQUFBLElBQzlCO0FBRUEsYUFBUyxVQUFVLEtBQUssS0FBSztBQUN6QixVQUFJLENBQUMsS0FBSyxPQUFRLFFBQU87QUFDekIsVUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQ3BELFlBQU0sT0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQy9CLFVBQUksT0FBTyxLQUFLLG9CQUFxQixRQUFPLEtBQUs7QUFDakQsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFNBQVMsR0FBRyxLQUFLO0FBQ3JDLFlBQUksT0FBTyxJQUFJLENBQUMsRUFBRSx1QkFBdUIsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLG9CQUFxQixRQUFPLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDakc7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUNBLGFBQVMsZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxjQUFRLFlBQVksS0FBSyx5QkFBeUIsS0FBSztBQUFBLElBQzNEO0FBVUEsbUJBQWUsbUJBQW1CO0FBRTlCLFVBQUk7QUFDQSxjQUFNLFNBQVMsU0FBUyxjQUFjLE9BQU8sUUFBUTtBQUNyRCxjQUFNLFNBQVMsVUFBVSxJQUFJLFVBQVUsTUFBTTtBQUU3QyxZQUFJLE9BQU8sUUFBUSxZQUFZLFNBQVMsWUFBWTtBQUNoRCxnQkFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixpQkFBTztBQUFBLFFBQ1g7QUFDQSxZQUFJLE9BQU8sUUFBUSxZQUFZLFlBQVk7QUFDdkMsaUJBQU8sUUFBUTtBQUNmLGlCQUFPO0FBQUEsUUFDWDtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQUU7QUFHVixVQUFJO0FBQ0EsY0FBTSxNQUFNLGFBQWEsTUFBTSxhQUFhO0FBQzVDLFlBQUksS0FBSyxjQUFjO0FBQ25CLGdCQUFNLFNBQVUsT0FBTyxJQUFJLGVBQWUsYUFBYyxJQUFJLFdBQVcsSUFBSSxJQUFJO0FBQy9FLGNBQUksYUFBYSxNQUFNO0FBQ3ZCLGlCQUFPO0FBQUEsUUFDWDtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQUU7QUFFVixhQUFPO0FBQUEsSUFDWDtBQUdBLFFBQUksT0FBTyxPQUFPLFdBQVcsYUFBYTtBQUN0QyxhQUFPLFdBQVcsRUFBRSxXQUFXLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNwRTtBQUFBLEVBQ0osR0FBRzsiLAogICJuYW1lcyI6IFsiS08iXQp9Cg==
