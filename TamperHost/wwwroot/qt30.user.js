// ==UserScript==
// @name        QT30_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.11
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.11-1758584936435
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.11-1758584936435
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.11-1758584936435
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.11-1758584936435
// @require      http://localhost:5000/lt-core.user.js?v=3.8.11-1758584936435
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
    function getTabScopeId(ns = "QT") {
      try {
        const k = `lt:${ns}:scopeId`;
        let v = sessionStorage.getItem(k);
        if (!v) {
          v = String(Math.floor(Math.random() * 2147483647));
          sessionStorage.setItem(k, v);
        }
        return Number(v);
      } catch {
        return Math.floor(Math.random() * 2147483647);
      }
    }
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
    async function getDraftHeaderFlex() {
      try {
        const QTF = await getQT();
        let { repo: r1 } = QTF.use(getTabScopeId("QT"));
        let d1 = await (r1.getHeader?.() || r1.get?.());
        if (d1 && Object.keys(d1).length) return d1;
        let { repo: r2 } = QTF.use("draft");
        let d2 = await (r2.getHeader?.() || r2.get?.());
        if (d2 && Object.keys(d2).length) return d2;
        return null;
      } catch {
        return null;
      }
    }
    async function mergeDraftIntoQuoteOnce(qk) {
      try {
        if (!qk || !Number.isFinite(qk) || qk <= 0) return;
        const QTF = await getQT();
        const { repo: draftRepo } = QTF.use(window.getTabScopeId ? window.getTabScopeId("QT") : window.__LT_QT_SCOPE_ID__ ||= Math.floor(Math.random() * 2147483647));
        const draft = await draftRepo.getHeader?.() || await draftRepo.get?.();
        if (!draft || !Object.keys(draft).length) return;
        await ensureRepoForQuote(qk);
        const current = await quoteRepo.getHeader?.() || {};
        const curCust = String(current.Customer_No ?? "");
        const newCust = String(draft.Customer_No ?? "");
        const needsMerge = Number((await draftRepo.get())?.Updated_At || 0) > Number(current.Promoted_At || 0) || curCust !== newCust || current.Catalog_Key !== draft.Catalog_Key || current.Catalog_Code !== draft.Catalog_Code;
        if (!needsMerge) return;
        await quoteRepo.patchHeader({
          Quote_Key: Number(qk),
          Customer_No: draft.Customer_No ?? null,
          Catalog_Key: draft.Catalog_Key ?? null,
          Catalog_Code: draft.Catalog_Code ?? null,
          Promoted_From: "draft",
          Promoted_At: Date.now(),
          // Force hydration later if you add it to qt30
          Quote_Header_Fetched_At: null
        });
        await draftRepo.clear?.();
        try {
          const { repo: legacy } = QTF.use("draft");
          await legacy.clear?.();
        } catch {
        }
      } catch (e) {
      }
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
        try {
          const draft = await getDraftHeaderFlex();
          if (draft && Object.keys(draft).length) {
            await quoteRepo.patchHeader?.({
              Quote_Key: Number(qk),
              Customer_No: draft.Customer_No ?? null,
              Catalog_Key: draft.Catalog_Key ?? null,
              Catalog_Code: draft.Catalog_Code ?? null,
              Promoted_From: "draft",
              Promoted_At: Date.now(),
              Quote_Header_Fetched_At: null
            });
          }
        } catch {
        }
        let header = await quoteRepo.getHeader?.() || {};
        let catalogKey = TMUtils.getObsValue?.(header, ["Catalog_Key", "CatalogKey"], { first: true }) ?? null;
        if (!catalogKey) {
          try {
            const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
            const grid2 = document.querySelector(CONFIG.GRID_SEL);
            const gridVM = grid2 && KO2?.dataFor ? KO2.dataFor(grid2) : null;
            const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
            const ck = raw0 ? TMUtils.getObsValue?.(raw0, ["CatalogKey", "Catalog_Key"], { first: true }) : null;
            if (ck != null) {
              catalogKey = Number(ck);
              await quoteRepo.patchHeader?.({ Quote_Key: Number(qk), Catalog_Key: catalogKey });
              header = await quoteRepo.getHeader?.() || {};
            }
          } catch {
          }
        }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHNldHRpbmdzS2V5OiAncXQzMF9zZXR0aW5nc192MScsXG4gICAgICAgIFNIT1dfT05fUEFHRVNfUkU6IC9ecGFydFxccypzdW1tYXJ5JC9pLFxuICAgICAgICBGT1JDRV9TSE9XX0JUTjogZmFsc2UsXG4gICAgICAgIGRlZmF1bHRzOiB7IGRlbGV0ZVplcm9RdHlSb3dzOiB0cnVlLCB1bml0UHJpY2VEZWNpbWFsczogMywgZW5hYmxlSG92ZXJBZmZvcmRhbmNlOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUID0gL3Rlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgVE1VdGlscy5zZXREZWJ1Zz8uKElTX1RFU1QpO1xuICAgIGNvbnN0IEwgPSBUTVV0aWxzLmdldExvZ2dlcj8uKCdRVDMwJyk7XG4gICAgY29uc3QgbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUKSBMPy5sb2c/LiguLi5hKTsgfTtcbiAgICBjb25zdCBlcnIgPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1QpIEw/LmVycm9yPy4oLi4uYSk7IH07XG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSB7IGxvZygnUVQzMDogd3Jvbmcgcm91dGUsIHNraXBwaW5nJyk7IHJldHVybjsgfVxuXG4gICAgLy8gSHViLWZpcnN0IG1vdW50IChuYXYgdmFyaWFudCkgXHUyMDE0IGFsaWduIHdpdGggcXQxMC9xdDIwL3F0MzVcbiAgICB3aW5kb3cuX19MVF9IVUJfTU9VTlQgPSBcIm5hdlwiO1xuICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShcIlJlYWR5XCIsIFwiaW5mb1wiLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICB9KSgpO1xuXG5cbiAgICAvLyA9PT09PSBRdW90ZVJlcG8gdmlhIGx0LWRhdGEtY29yZSBmbGF0IHtoZWFkZXIsIGxpbmVzfSA9PT09PVxuICAgIGxldCBRVCA9IG51bGwsIHF1b3RlUmVwbyA9IG51bGwsIGxhc3RTY29wZSA9IG51bGw7XG5cbiAgICAvLyBTZXNzaW9uLXNjb3BlZCBpZCBzbyBkcmFmdCBzdXJ2aXZlcyBwYWdlIHVwZGF0ZXMgaW4gdGhpcyB0YWJcbiAgICBmdW5jdGlvbiBnZXRUYWJTY29wZUlkKG5zID0gXCJRVFwiKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBrID0gYGx0OiR7bnN9OnNjb3BlSWRgO1xuICAgICAgICAgICAgbGV0IHYgPSBzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKGspO1xuICAgICAgICAgICAgaWYgKCF2KSB7IHYgPSBTdHJpbmcoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjE0NzQ4MzY0NykpOyBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKGssIHYpOyB9XG4gICAgICAgICAgICByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMTQ3NDgzNjQ3KTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRVCgpIHtcbiAgICAgICAgaWYgKFFUKSByZXR1cm4gUVQ7XG4gICAgICAgIGNvbnN0IERDID0gbHQuY29yZT8uZGF0YTtcbiAgICAgICAgaWYgKCFEQz8ubWFrZUZsYXRTY29wZWRSZXBvKSB0aHJvdyBuZXcgRXJyb3IoJ0RhdGFDb3JlIG5vdCByZWFkeScpO1xuICAgICAgICBRVCA9IERDLm1ha2VGbGF0U2NvcGVkUmVwbyh7IG5zOiAnUVQnLCBlbnRpdHk6ICdxdW90ZScsIGxlZ2FjeUVudGl0eTogJ1F1b3RlSGVhZGVyJyB9KTtcbiAgICAgICAgcmV0dXJuIFFUO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVJlcG9Gb3JRdW90ZShxaykge1xuICAgICAgICBpZiAoIXFrKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKCFxdW90ZVJlcG8gfHwgbGFzdFNjb3BlICE9PSBxaykge1xuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSAoYXdhaXQgZ2V0UVQoKSkudXNlKE51bWJlcihxaykpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcbiAgICAgICAgICAgIHF1b3RlUmVwbyA9IHJlcG87XG4gICAgICAgICAgICBsYXN0U2NvcGUgPSBxaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcXVvdGVSZXBvO1xuICAgIH1cblxuICAgIC8vIFRyeSBjdXJyZW50IHRhYi1zY29wZWQgZHJhZnQgZmlyc3Q7IGZhbGwgYmFjayB0byBsZWdhY3kgXCJkcmFmdFwiIHNjb3BlXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0RHJhZnRIZWFkZXJGbGV4KCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgUVRGID0gYXdhaXQgZ2V0UVQoKTtcbiAgICAgICAgICAgIC8vIFRhYi1zY29wZWQgZHJhZnRcbiAgICAgICAgICAgIGxldCB7IHJlcG86IHIxIH0gPSBRVEYudXNlKGdldFRhYlNjb3BlSWQoXCJRVFwiKSk7XG4gICAgICAgICAgICBsZXQgZDEgPSBhd2FpdCAocjEuZ2V0SGVhZGVyPy4oKSB8fCByMS5nZXQ/LigpKTtcbiAgICAgICAgICAgIGlmIChkMSAmJiBPYmplY3Qua2V5cyhkMSkubGVuZ3RoKSByZXR1cm4gZDE7XG5cbiAgICAgICAgICAgIC8vIExlZ2FjeSBcImRyYWZ0XCIgc2NvcGUgKGhhc2hlZCBzdHJpbmcgc2NvcGUpXG4gICAgICAgICAgICBsZXQgeyByZXBvOiByMiB9ID0gUVRGLnVzZShcImRyYWZ0XCIpO1xuICAgICAgICAgICAgbGV0IGQyID0gYXdhaXQgKHIyLmdldEhlYWRlcj8uKCkgfHwgcjIuZ2V0Py4oKSk7XG4gICAgICAgICAgICBpZiAoZDIgJiYgT2JqZWN0LmtleXMoZDIpLmxlbmd0aCkgcmV0dXJuIGQyO1xuXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gRHJhZnQgXHUyMTkyIFF1b3RlIHByb21vdGlvbiAoc2luZ2xlLXNob3QpLCBtaXJyb3JzIHF0MzVcbiAgICBhc3luYyBmdW5jdGlvbiBtZXJnZURyYWZ0SW50b1F1b3RlT25jZShxaykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBRVEYgPSBhd2FpdCBnZXRRVCgpO1xuICAgICAgICAgICAgY29uc3QgeyByZXBvOiBkcmFmdFJlcG8gfSA9IFFURi51c2Uod2luZG93LmdldFRhYlNjb3BlSWQgPyB3aW5kb3cuZ2V0VGFiU2NvcGVJZChcIlFUXCIpIDogKHdpbmRvdy5fX0xUX1FUX1NDT1BFX0lEX18gfHw9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDIxNDc0ODM2NDcpKSk7XG4gICAgICAgICAgICBjb25zdCBkcmFmdCA9IChhd2FpdCBkcmFmdFJlcG8uZ2V0SGVhZGVyPy4oKSkgfHwgKGF3YWl0IGRyYWZ0UmVwby5nZXQ/LigpKTtcbiAgICAgICAgICAgIGlmICghZHJhZnQgfHwgIU9iamVjdC5rZXlzKGRyYWZ0KS5sZW5ndGgpIHJldHVybjtcblxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSAoYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcj8uKCkpIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgY3VyQ3VzdCA9IFN0cmluZyhjdXJyZW50LkN1c3RvbWVyX05vID8/IFwiXCIpO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdCA9IFN0cmluZyhkcmFmdC5DdXN0b21lcl9ObyA/PyBcIlwiKTtcbiAgICAgICAgICAgIGNvbnN0IG5lZWRzTWVyZ2UgPVxuICAgICAgICAgICAgICAgIE51bWJlcigoYXdhaXQgZHJhZnRSZXBvLmdldCgpKT8uVXBkYXRlZF9BdCB8fCAwKSA+IE51bWJlcihjdXJyZW50LlByb21vdGVkX0F0IHx8IDApIHx8XG4gICAgICAgICAgICAgICAgY3VyQ3VzdCAhPT0gbmV3Q3VzdCB8fFxuICAgICAgICAgICAgICAgIGN1cnJlbnQuQ2F0YWxvZ19LZXkgIT09IGRyYWZ0LkNhdGFsb2dfS2V5IHx8XG4gICAgICAgICAgICAgICAgY3VycmVudC5DYXRhbG9nX0NvZGUgIT09IGRyYWZ0LkNhdGFsb2dfQ29kZTtcblxuICAgICAgICAgICAgaWYgKCFuZWVkc01lcmdlKSByZXR1cm47XG5cbiAgICAgICAgICAgIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcih7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBOdW1iZXIocWspLFxuICAgICAgICAgICAgICAgIEN1c3RvbWVyX05vOiBkcmFmdC5DdXN0b21lcl9ObyA/PyBudWxsLFxuICAgICAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxuICAgICAgICAgICAgICAgIENhdGFsb2dfQ29kZTogZHJhZnQuQ2F0YWxvZ19Db2RlID8/IG51bGwsXG4gICAgICAgICAgICAgICAgUHJvbW90ZWRfRnJvbTogXCJkcmFmdFwiLFxuICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIC8vIEZvcmNlIGh5ZHJhdGlvbiBsYXRlciBpZiB5b3UgYWRkIGl0IHRvIHF0MzBcbiAgICAgICAgICAgICAgICBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogbnVsbFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGF3YWl0IGRyYWZ0UmVwby5jbGVhcj8uKCk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgcmVwbzogbGVnYWN5IH0gPSBRVEYudXNlKFwiZHJhZnRcIik7XG4gICAgICAgICAgICAgICAgYXdhaXQgbGVnYWN5LmNsZWFyPy4oKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIHNpbGVudDoga2VlcCBxdDMwIHJlc2lsaWVudFxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIChHTSB0b2xlcmFudCkgLS0tLS0tLS0tLVxuICAgIGNvbnN0IGxvYWRTZXR0aW5ncyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIENPTkZJRy5kZWZhdWx0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnID8geyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLkpTT04ucGFyc2UodikgfSA6IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi52IH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DT05GSUcuZGVmYXVsdHMgfTsgfVxuICAgIH07XG4gICAgY29uc3Qgc2F2ZVNldHRpbmdzID0gKG5leHQpID0+IHtcbiAgICAgICAgdHJ5IHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBuZXh0KTsgfVxuICAgICAgICBjYXRjaCB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgSlNPTi5zdHJpbmdpZnkobmV4dCkpOyB9XG4gICAgfTtcblxuXG4gICAgLy8gRGVsZWdhdGUgdG8gbHQuY29yZS5hdXRoIHdyYXBwZXIgKHF0MjAvcXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcbiAgICAgICAgY29uc3QgaW1wbCA9IGx0Py5jb3JlPy5hdXRoPy53aXRoRnJlc2hBdXRoO1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcbiAgICB9O1xuXG4gICAgLy8gSHViIGJ1dHRvbiByZWdpc3RyYXRpb24gKHF0MzUgcGF0dGVybilcbiAgICBjb25zdCBIVUJfQlROX0lEID0gJ3F0MzAtYXBwbHktcHJpY2luZyc7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6IFwibmF2XCIgfSkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGVuc3VyZSA9ICh3aW5kb3cuZW5zdXJlTFRIdWIgfHwgdW5zYWZlV2luZG93Py5lbnN1cmVMVEh1Yik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IGh1YiA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGh1YikgcmV0dXJuIGh1YjsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgLy8gQWN0aXZlIExJIHJlbmRlcnMgdGhlIHBhZ2UgbmFtZSBhcyBhIGRpcmVjdCB0ZXh0IG5vZGUgKHF0MzUgbG9naWMpXG4gICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUnKTtcbiAgICAgICAgaWYgKCFsaSkgcmV0dXJuICcnO1xuICAgICAgICByZXR1cm4gKGxpLnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcbiAgICAgICAgcmV0dXJuIENPTkZJRy5TSE9XX09OX1BBR0VTX1JFLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XG4gICAgfVxuXG5cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJCdXR0b24oKSB7XG4gICAgICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiBcIm5hdlwiIH0pO1xuICAgICAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgICAgICBjb25zdCBhbHJlYWR5ID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhIVUJfQlROX0lEKTtcbiAgICAgICAgaWYgKGFscmVhZHkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnQXBwbHkgUHJpY2luZycsXG4gICAgICAgICAgICB0aXRsZTogJ0FwcGx5IGN1c3RvbWVyIGNhdGFsb2cgcHJpY2luZycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IHJ1bkFwcGx5UHJpY2luZygpXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PT09IFNQQSB3aXJpbmcgKHF0MzUgcGF0dGVybikgPT09PT1cbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7IGxldCBvZmZVcmwgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCkge1xuICAgICAgICAvLyBTaG93IG9ubHkgb24gdGFyZ2V0IHBhZ2UgKHVubGVzcyBmb3JjZWQpXG4gICAgICAgIGlmIChDT05GSUcuRk9SQ0VfU0hPV19CVE4gfHwgaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoKTtcbiAgICAgICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcGFnZU9ic2VydmVyID0gbnVsbDtcbiAgICBmdW5jdGlvbiBzdGFydFdpemFyZFBhZ2VPYnNlcnZlcigpIHtcbiAgICAgICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgaWYgKCFyb290KSByZXR1cm47XG4gICAgICAgIHBhZ2VPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChtdXQpID0+IHtcbiAgICAgICAgICAgIGlmIChtdXQuc29tZShtID0+IG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnIHx8IG0udHlwZSA9PT0gJ2NoaWxkTGlzdCcpKSB7XG4gICAgICAgICAgICAgICAgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcGFnZU9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnY2xhc3MnXSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCkge1xuICAgICAgICB0cnkgeyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkpOyB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkgeyBwYWdlT2JzZXJ2ZXI/LmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgcGFnZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG5cbiAgICAgICAgdHJ5IHsgYXdhaXQgZ2V0SHViKHsgbW91bnQ6IFwibmF2XCIgfSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGF3YWl0IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgc3RhcnRXaXphcmRQYWdlT2JzZXJ2ZXIoKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBvZmZVcmw/LigpOyBvZmZVcmwgPSBudWxsO1xuICAgICAgICBzdG9wV2l6YXJkUGFnZU9ic2VydmVyKCk7XG4gICAgfVxuXG4gICAgLy8gaW5pdGlhbGl6ZSBmb3IgY3VycmVudCByb3V0ZSArIHdpcmUgcm91dGUgY2hhbmdlc1xuICAgIGluaXQoKTtcbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKFJPVVRFUy5zb21lKHJ4ID0+IHJ4LnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xuXG5cbiAgICBhc3luYyBmdW5jdGlvbiBydW5BcHBseVByaWNpbmcoKSB7XG4gICAgICAgIGNvbnN0IHRhc2sgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2soJ0FwcGx5aW5nIGNhdGFsb2cgcHJpY2luZ1x1MjAyNicsICdpbmZvJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBhdXRoXG4gICAgICAgICAgICB0cnkgeyBpZiAoIShhd2FpdCBsdC5jb3JlLmF1dGguZ2V0S2V5KCkpKSB7IGx0LmNvcmUuaHViLm5vdGlmeSgnU2lnbi1pbiByZXF1aXJlZCcsICd3YXJuJywgeyBtczogNDAwMCB9KTsgdGFzay5lcnJvcignTm8gc2Vzc2lvbicpOyByZXR1cm47IH0gfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgY29uc3QgcWsgPSBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKTtcbiAgICAgICAgICAgIGlmICghcWspIHsgdGFzay5lcnJvcignUXVvdGVfS2V5IG1pc3NpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZVJlcG9Gb3JRdW90ZShxayk7XG5cbiAgICAgICAgICAgIC8vIFByb21vdGUgZHJhZnQgdG8gcXVvdGUgaGVhZGVyIChvbmUtc2hvdCksIHRoZW4gcmVhZCBoZWFkZXJcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZHJhZnQgPSBhd2FpdCBnZXREcmFmdEhlYWRlckZsZXgoKTtcbiAgICAgICAgICAgICAgICBpZiAoZHJhZnQgJiYgT2JqZWN0LmtleXMoZHJhZnQpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBxdW90ZVJlcG8ucGF0Y2hIZWFkZXI/Lih7XG4gICAgICAgICAgICAgICAgICAgICAgICBRdW90ZV9LZXk6IE51bWJlcihxayksXG4gICAgICAgICAgICAgICAgICAgICAgICBDdXN0b21lcl9ObzogZHJhZnQuQ3VzdG9tZXJfTm8gPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIENhdGFsb2dfS2V5OiBkcmFmdC5DYXRhbG9nX0tleSA/PyBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgQ2F0YWxvZ19Db2RlOiBkcmFmdC5DYXRhbG9nX0NvZGUgPz8gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0Zyb206IFwiZHJhZnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFByb21vdGVkX0F0OiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IG51bGxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGtlZXAgcmVzaWxpZW50ICovIH1cblxuICAgICAgICAgICAgbGV0IGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgbGV0IGNhdGFsb2dLZXkgPSBUTVV0aWxzLmdldE9ic1ZhbHVlPy4oaGVhZGVyLCBbXCJDYXRhbG9nX0tleVwiLCBcIkNhdGFsb2dLZXlcIl0sIHsgZmlyc3Q6IHRydWUgfSkgPz8gbnVsbDtcblxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IGdyaWQgJiYgS08/LmRhdGFGb3IgPyBLTy5kYXRhRm9yKGdyaWQpIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2sgPSByYXcwID8gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHJhdzAsIFtcIkNhdGFsb2dLZXlcIiwgXCJDYXRhbG9nX0tleVwiXSwgeyBmaXJzdDogdHJ1ZSB9KSA6IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNrICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGFsb2dLZXkgPSBOdW1iZXIoY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcXVvdGVSZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IE51bWJlcihxayksIENhdGFsb2dfS2V5OiBjYXRhbG9nS2V5IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVyID0gYXdhaXQgcXVvdGVSZXBvLmdldEhlYWRlcj8uKCkgfHwge307XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHtcbiAgICAgICAgICAgICAgICB0YXNrLnVwZGF0ZSgnRmV0Y2hpbmcgQ2F0YWxvZyBLZXlcdTIwMjYnKTtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzMSA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQ2F0YWxvZ0tleUJ5UXVvdGVLZXksIHsgUXVvdGVfS2V5OiBxayB9KSk7XG4gICAgICAgICAgICAgICAgY2F0YWxvZ0tleSA9IHJvd3MxPy5bMF0/LkNhdGFsb2dfS2V5IHx8IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKGNhdGFsb2dLZXkpIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBOdW1iZXIocWspLCBDYXRhbG9nX0tleTogTnVtYmVyKGNhdGFsb2dLZXkpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7IHRhc2suZXJyb3IoJ05vIENhdGFsb2cgS2V5Jyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gY2F0YWxvZyBmb3VuZCBmb3IgdGhpcyBxdW90ZScsICd3YXJuJywgeyBtczogNDAwMCB9KTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIENvbGxlY3QgcGFydHMgZnJvbSBLTyBncmlkIG5vdyAocmV1c2UgdG9wLWxldmVsIEtPKVxuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ09ORklHLkdSSURfU0VMKTtcblxuICAgICAgICAgICAgY29uc3QgcmF3ID0gKGdyaWQgJiYgS08/LmRhdGFGb3IgJiYgQXJyYXkuaXNBcnJheShLTy5kYXRhRm9yKGdyaWQpPy5kYXRhc291cmNlPy5yYXcpKVxuICAgICAgICAgICAgICAgID8gS08uZGF0YUZvcihncmlkKS5kYXRhc291cmNlLnJhdyA6IFtdO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9zID0gWy4uLm5ldyBTZXQocmF3Lm1hcChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihyLCBcIlBhcnROb1wiLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pKS5maWx0ZXIoQm9vbGVhbikpXTtcbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgdGFzay5lcnJvcignTm8gUGFydE5vIHZhbHVlcycpOyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ05vIFBhcnRObyB2YWx1ZXMgZm91bmQnLCAnd2FybicsIHsgbXM6IDQwMDAgfSk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZShgTG9hZGluZyAke3BhcnROb3MubGVuZ3RofSBwYXJ0KHMpXHUyMDI2YCk7XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgY29uc3QgcHJpY2VNYXAgPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHBhcnROb3MubWFwKGFzeW5jIChwKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQnJlYWtwb2ludHNCeVBhcnQsIHsgQ2F0YWxvZ19LZXk6IGNhdGFsb2dLZXksIENhdGFsb2dfUGFydF9ObzogcCB9KSkgfHwgW107XG4gICAgICAgICAgICAgICAgcHJpY2VNYXBbcF0gPSByb3dzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiByLkNhdGFsb2dfUGFydF9ObyA9PT0gcCAmJiBuZXcgRGF0ZShyLkVmZmVjdGl2ZV9EYXRlKSA8PSBub3cgJiYgbm93IDw9IG5ldyBEYXRlKHIuRXhwaXJhdGlvbl9EYXRlKSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuQnJlYWtwb2ludF9RdWFudGl0eSAtIGIuQnJlYWtwb2ludF9RdWFudGl0eSk7XG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIC8vIDMpIEFwcGx5IG9yIGRlbGV0ZSBwZXIgcm93IChxdC1zdGFuZGFyZCBsb29wKVxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcblxuICAgICAgICAgICAgLy8gUmV1c2UgZ3JpZC9yYXcgcmVzb2x2ZWQgYWJvdmUgKGF2b2lkIHJlZGVjbGFyYXRpb24pXG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAoc3RhbmRhcmQgYmVoYXZpb3IpXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA8PSAwICYmIFMuZGVsZXRlWmVyb1F0eVJvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcWtSb3cgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZUtleScsICdRdW90ZV9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXBrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVQYXJ0S2V5JywgJ1F1b3RlX1BhcnRfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwciA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlUHJpY2VLZXknLCAnUXVvdGVfUHJpY2VfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHFrUm93ICYmIHFwayAmJiBxcHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQnVpbGQgeC13d3ctZm9ybS11cmxlbmNvZGVkIHBheWxvYWQgc28gaXQgd29ya3Mgd2hldGhlciBUTVV0aWxzLmZldGNoRGF0YSBvciBuYXRpdmUgZmV0Y2ggaXMgdXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvcm0gPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlS2V5JywgU3RyaW5nKE51bWJlcihxa1JvdykpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVQYXJ0S2V5JywgU3RyaW5nKE51bWJlcihxcGspKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlUHJpY2VLZXknLCBTdHJpbmcoTnVtYmVyKHFwcikpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFudGktZm9yZ2VyeSB0b2tlbiAoaWYgcHJlc2VudCBvbiBwYWdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJ2dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy52YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy5jb250ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydnQpIGZvcm0uc2V0KCdfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlbicsIHJ2dCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUuaHR0cC5wb3N0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnL1NhbGVzQW5kQ1JNL1F1b3RlUGFydC9EZWxldGVRdW90ZVByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQ7IGNoYXJzZXQ9VVRGLTgnIH0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBEZWxldGVkIHJvd1ske2l9XWAsICdzdWNjZXNzJywgeyBtczogMjUwMCB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycignUVQzMCBkZWxldGUgZXJyb3InLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYERlbGV0ZSBmYWlsZWQgcm93WyR7aX1dYCwgJ2Vycm9yJywgeyBtczogMzAwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgU2tpcCBkZWxldGUgcm93WyR7aX1dIFx1MjAxNCBtaXNzaW5nIGtleXNgLCAnd2FybicsIHsgbXM6IDI1MDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwcmljZSB0byBub24temVybyByb3dzXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydE5vID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdQYXJ0Tm8nLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBicCA9IHBpY2tQcmljZShwcmljZU1hcFtwYXJ0Tm9dLCBxdHkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYnAgPT0gbnVsbCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5UHJpY2VUb1Jvdyhyb3csIHJvdW5kKGJwKSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogcm93WyR7aX1dIHF0eT0ke3F0eX0gcHJpY2U9JHtyb3VuZChicCl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZSgnUmVmcmVzaGluZyBncmlkXHUyMDI2Jyk7XG4gICAgICAgICAgICBjb25zdCBtb2RlID0gYXdhaXQgcmVmcmVzaFF1b3RlR3JpZCgpO1xuXG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1ByaWNpbmcgYXBwbGllZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgIG1vZGUgPyAnUHJpY2luZyBhcHBsaWVkIGFuZCBncmlkIHJlZnJlc2hlZCcgOiAnUHJpY2luZyBhcHBsaWVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxuICAgICAgICAgICAgICAgICdzdWNjZXNzJyxcbiAgICAgICAgICAgICAgICB7IG1zOiAzMDAwIH1cbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYEFwcGx5IGZhaWxlZDogJHtlPy5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJywgeyBtczogNDAwMCB9KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIC8vIHJlY29uY2lsZSBwcmVzZW5jZSBpZiBTUEEgbmF2aWdhdGlvbiBjaGFuZ2VkIHRoZSBwYWdlXG4gICAgICAgICAgICB0cnkgeyBhd2FpdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gSGVscGVycyAtLS0tLS0tLS0tXG4gICAgLy8gRGV0ZXJtaW5pc3RpYyBRdW90ZUtleSAocXQzNSBwYXR0ZXJuKVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihyYXcwLCBbJ1F1b3RlS2V5JywgJ1F1b3RlX0tleSddKSA6IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gcm9vdEVsID8gS08/LmRhdGFGb3I/Lihyb290RWwpIDogbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHYgPSByb290Vk0gJiYgKFxuICAgICAgICAgICAgICAgIFRNVXRpbHMuZ2V0T2JzVmFsdWU/Lihyb290Vk0sIFsnUXVvdGVLZXknLCAnUXVvdGVfS2V5J10pIHx8XG4gICAgICAgICAgICAgICAgVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgWydRdW90ZS5RdW90ZUtleScsICdRdW90ZS5RdW90ZV9LZXknXSlcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBpY2tQcmljZShicHMsIHF0eSkge1xuICAgICAgICBpZiAoIWJwcz8ubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKHF0eSA8IGJwc1swXS5CcmVha3BvaW50X1F1YW50aXR5KSByZXR1cm4gYnBzWzBdLkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBicHNbYnBzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAocXR5ID49IGxhc3QuQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGxhc3QuQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocXR5ID49IGJwc1tpXS5CcmVha3BvaW50X1F1YW50aXR5ICYmIHF0eSA8IGJwc1tpICsgMV0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1tpXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhcHBseVByaWNlVG9Sb3cocm93LCBwcmljZSkge1xuICAgICAgICBUTVV0aWxzLnNldE9ic1ZhbHVlKHJvdywgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScsIHByaWNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcnkgdG8gcmVmcmVzaCB0aGUgUXVvdGUgZ3JpZCB2aXN1YWxzIGFmdGVyIGFwcGx5L2RlbGV0ZSBvcHMuXG4gICAgICogT3JkZXIgb2YgYXR0ZW1wdHM6XG4gICAgICogIDEpIEtPIGdyaWQgVk0gZGF0YXNvdXJjZS5yZWFkKCkgKGFzeW5jKVxuICAgICAqICAyKSBncmlkIFZNIC5yZWZyZXNoKCkgKHN5bmMpXG4gICAgICogIDMpIFdpemFyZCBuYXYgdG8gY3VycmVudCBwYWdlIChyZWJpbmRzIHBhZ2UpXG4gICAgICogUmV0dXJucyBhIHN0cmluZyBkZXNjcmliaW5nIHdoaWNoIHBhdGggc3VjY2VlZGVkLCBvciBudWxsLlxuICAgICAqL1xuICAgIGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgICAgIC8vIFByZWZlciBhIEtPLWxldmVsIHJlZnJlc2ggaWYgYXZhaWxhYmxlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENPTkZJRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGF3YWl0IGdyaWRWTS5kYXRhc291cmNlLnJlYWQoKTsgICAvLyBhc3luYyByZS1xdWVyeS9yZWJpbmRcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2RzLnJlYWQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LnJlZnJlc2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBncmlkVk0ucmVmcmVzaCgpOyAgICAgICAgICAgICAgICAgIC8vIHN5bmMgdmlzdWFsIHJlZnJlc2hcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB3aXphcmQgbmF2aWdhdGUgdG8gdGhlIHNhbWUgYWN0aXZlIHBhZ2UgdG8gZm9yY2UgcmViaW5kXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3cucGxleD8uY3VycmVudFBhZ2U/LlF1b3RlV2l6YXJkO1xuICAgICAgICAgICAgaWYgKHdpej8ubmF2aWdhdGVQYWdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gKHR5cGVvZiB3aXouYWN0aXZlUGFnZSA9PT0gJ2Z1bmN0aW9uJykgPyB3aXouYWN0aXZlUGFnZSgpIDogd2l6LmFjdGl2ZVBhZ2U7XG4gICAgICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZShhY3RpdmUpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnd2l6Lm5hdmlnYXRlUGFnZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBUaW55IERFViB0ZXN0IHNlYW0gLS0tLS0tLS0tLVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQzMF9fID0geyBwaWNrUHJpY2UsIGFwcGx5UHJpY2VUb1JvdywgcnVuQXBwbHlQcmljaW5nIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsTUFBTTtBQUVILFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2Isa0JBQWtCO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFHQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlBQVksTUFBTTtBQUNwQyxVQUFNLE1BQU0sSUFB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
