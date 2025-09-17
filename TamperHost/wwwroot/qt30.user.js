// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.39
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.39-1758141673629
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.39-1758141673629
// @require      http://localhost:5000/lt-ui-hub.js?v=3.6.39-1758141673629
// @require      http://localhost:5000/lt-core.user.js?v=3.6.39-1758141673629
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.39-1758141673629
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
      const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
      const activeEl = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
      const vm = activeEl ? KO2?.dataFor?.(activeEl) : null;
      const name = vm ? KO2?.unwrap?.(vm.name) ?? (typeof vm.name === "function" ? vm.name() : vm.name) : "";
      if (name) return String(name);
      const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
      return (nav?.textContent || "").trim();
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
        onClick: () => runApplyPricing()
      });
      refreshHubButtonEnablement();
    }
    function refreshHubButtonEnablement() {
      const hub = window.ltUIHub;
      if (!hub?.updateButton) return;
      const onTarget = getActiveWizardPageName().toLowerCase() === "part summary";
      hub.updateButton(HUB_BTN_ID, { disabled: !onTarget, title: onTarget ? "Apply customer catalog pricing" : "Switch to Part Summary" });
    }
    TMUtils.onUrlChange?.(refreshHubButtonEnablement);
    new MutationObserver(refreshHubButtonEnablement).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    ensureHubButton();
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
        const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        const grid = document.querySelector(CONFIG.GRID_SEL);
        const raw = grid && KO2?.dataFor && Array.isArray(KO2.dataFor(grid)?.datasource?.raw) ? KO2.dataFor(grid).datasource.raw : [];
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
          refreshHubButtonEnablement();
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
          const v = raw0 ? TMUtils.getObsValue?.(raw0, "QuoteKey") : null;
          if (v != null) return Number(v);
        }
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
        const rootVM = rootEl ? KO2?.dataFor?.(rootEl) : null;
        const v = rootVM && (TMUtils.getObsValue?.(rootVM, "QuoteKey") || TMUtils.getObsValue?.(rootVM, "Quote.QuoteKey"));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQzMC1jYXRhbG9nUHJpY2luZ0FwcGx5L3F0MzAuaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MzAtY2F0YWxvZ1ByaWNpbmdBcHBseS9xdDMwLmluZGV4LmpzXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19DYXRhbG9nS2V5QnlRdW90ZUtleTogMzE1NixcbiAgICAgICAgRFNfQnJlYWtwb2ludHNCeVBhcnQ6IDQ4MDksXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIHRvYXN0TXM6IDM1MDAsXG4gICAgICAgIHdpemFyZFRhcmdldFBhZ2U6ICdQYXJ0IFN1bW1hcnknLFxuICAgICAgICBzZXR0aW5nc0tleTogJ3F0MzBfc2V0dGluZ3NfdjEnLFxuICAgICAgICBkZWZhdWx0czogeyBkZWxldGVaZXJvUXR5Um93czogdHJ1ZSwgdW5pdFByaWNlRGVjaW1hbHM6IDMsIGVuYWJsZUhvdmVyQWZmb3JkYW5jZTogdHJ1ZSB9LFxuICAgIH07XG5cbiAgICAvLyAtLS0tLS0tLS0tIEJvb3RzdHJhcCAtLS0tLS0tLS0tXG4gICAgY29uc3QgSVNfVEVTVCA9IC90ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xuICAgIFRNVXRpbHMuc2V0RGVidWc/LihJU19URVNUKTtcbiAgICBjb25zdCBMID0gVE1VdGlscy5nZXRMb2dnZXI/LignUVQzMCcpO1xuICAgIGNvbnN0IGxvZyA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ubG9nPy4oLi4uYSk7IH07XG4gICAgY29uc3Qgd2FybiA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8ud2Fybj8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IGVyciA9ICguLi5hKSA9PiB7IGlmIChERVYgfHwgSVNfVEVTVCkgTD8uZXJyb3I/LiguLi5hKTsgfTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHsgbG9nKCdRVDMwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAvLyBIdWItZmlyc3QgbW91bnQgKG5hdiB2YXJpYW50KSBcdTIwMTQgYWxpZ24gd2l0aCBxdDEwL3F0MjAvcXQzNVxuICAgIHdpbmRvdy5fX0xUX0hVQl9NT1VOVCA9IFwibmF2XCI7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogXCJuYXZcIiB9KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFwiUmVhZHlcIiwgXCJpbmZvXCIsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgIH0pKCk7XG5cblxuICAgIC8vID09PT09IFF1b3RlUmVwbyB2aWEgbHQtZGF0YS1jb3JlIGZsYXQge2hlYWRlciwgbGluZXN9ID09PT09XG4gICAgbGV0IFFUID0gbnVsbCwgcXVvdGVSZXBvID0gbnVsbCwgbGFzdFNjb3BlID0gbnVsbDtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFFUKCkge1xuICAgICAgICBpZiAoUVQpIHJldHVybiBRVDtcbiAgICAgICAgY29uc3QgREMgPSBsdC5jb3JlPy5kYXRhO1xuICAgICAgICBpZiAoIURDPy5tYWtlRmxhdFNjb3BlZFJlcG8pIHRocm93IG5ldyBFcnJvcignRGF0YUNvcmUgbm90IHJlYWR5Jyk7XG4gICAgICAgIFFUID0gREMubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pO1xuICAgICAgICByZXR1cm4gUVQ7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlUmVwb0ZvclF1b3RlKHFrKSB7XG4gICAgICAgIGlmICghcWspIHJldHVybiBudWxsO1xuICAgICAgICBpZiAoIXF1b3RlUmVwbyB8fCBsYXN0U2NvcGUgIT09IHFrKSB7XG4gICAgICAgICAgICBjb25zdCB7IHJlcG8gfSA9IChhd2FpdCBnZXRRVCgpKS51c2UoTnVtYmVyKHFrKSk7XG4gICAgICAgICAgICBhd2FpdCByZXBvLmVuc3VyZUZyb21MZWdhY3lJZk1pc3Npbmc/LigpO1xuICAgICAgICAgICAgcXVvdGVSZXBvID0gcmVwbzsgbGFzdFNjb3BlID0gcWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHF1b3RlUmVwbztcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIChHTSB0b2xlcmFudCkgLS0tLS0tLS0tLVxuICAgIGNvbnN0IGxvYWRTZXR0aW5ncyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIENPTkZJRy5kZWZhdWx0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnID8geyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLkpTT04ucGFyc2UodikgfSA6IHsgLi4uQ09ORklHLmRlZmF1bHRzLCAuLi52IH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DT05GSUcuZGVmYXVsdHMgfTsgfVxuICAgIH07XG4gICAgY29uc3Qgc2F2ZVNldHRpbmdzID0gKG5leHQpID0+IHtcbiAgICAgICAgdHJ5IHsgR01fc2V0VmFsdWUoQ09ORklHLnNldHRpbmdzS2V5LCBuZXh0KTsgfVxuICAgICAgICBjYXRjaCB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgSlNPTi5zdHJpbmdpZnkobmV4dCkpOyB9XG4gICAgfTtcblxuXG4gICAgLy8gRGVsZWdhdGUgdG8gbHQuY29yZS5hdXRoIHdyYXBwZXIgKHF0MjAvcXQzNSBwYXR0ZXJuKVxuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcbiAgICAgICAgY29uc3QgaW1wbCA9IGx0Py5jb3JlPy5hdXRoPy53aXRoRnJlc2hBdXRoO1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcbiAgICB9O1xuXG4gICAgLy8gSHViIGJ1dHRvbiByZWdpc3RyYXRpb24gKHF0MzUgcGF0dGVybilcbiAgICBjb25zdCBIVUJfQlROX0lEID0gJ3F0MzAtYXBwbHktcHJpY2luZyc7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6IFwibmF2XCIgfSkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGVuc3VyZSA9ICh3aW5kb3cuZW5zdXJlTFRIdWIgfHwgdW5zYWZlV2luZG93Py5lbnN1cmVMVEh1Yik7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyeSB7IGNvbnN0IGh1YiA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGh1YikgcmV0dXJuIGh1YjsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgICAgICBjb25zdCBhY3RpdmVFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZUVsID8gS08/LmRhdGFGb3I/LihhY3RpdmVFbCkgOiBudWxsO1xuICAgICAgICBjb25zdCBuYW1lID0gdm0gPyAoS08/LnVud3JhcD8uKHZtLm5hbWUpID8/ICh0eXBlb2Ygdm0ubmFtZSA9PT0gJ2Z1bmN0aW9uJyA/IHZtLm5hbWUoKSA6IHZtLm5hbWUpKSA6ICcnO1xuICAgICAgICBpZiAobmFtZSkgcmV0dXJuIFN0cmluZyhuYW1lKTtcbiAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgIHJldHVybiAobmF2Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQ6IFwibmF2XCIgfSk7XG4gICAgICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuICAgICAgICBjb25zdCBhbHJlYWR5ID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhIVUJfQlROX0lEKTtcbiAgICAgICAgaWYgKGFscmVhZHkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnQXBwbHkgUHJpY2luZycsXG4gICAgICAgICAgICB0aXRsZTogJ0FwcGx5IGN1c3RvbWVyIGNhdGFsb2cgcHJpY2luZycsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5BcHBseVByaWNpbmcoKVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBpbml0aWFsIGVuYWJsZS9kaXNhYmxlIGJ5IHBhZ2VcbiAgICAgICAgcmVmcmVzaEh1YkJ1dHRvbkVuYWJsZW1lbnQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZWZyZXNoSHViQnV0dG9uRW5hYmxlbWVudCgpIHtcbiAgICAgICAgY29uc3QgaHViID0gd2luZG93Lmx0VUlIdWI7XG4gICAgICAgIGlmICghaHViPy51cGRhdGVCdXR0b24pIHJldHVybjtcbiAgICAgICAgY29uc3Qgb25UYXJnZXQgPSBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpLnRvTG93ZXJDYXNlKCkgPT09ICdwYXJ0IHN1bW1hcnknO1xuICAgICAgICBodWIudXBkYXRlQnV0dG9uKEhVQl9CVE5fSUQsIHsgZGlzYWJsZWQ6ICFvblRhcmdldCwgdGl0bGU6IG9uVGFyZ2V0ID8gJ0FwcGx5IGN1c3RvbWVyIGNhdGFsb2cgcHJpY2luZycgOiAnU3dpdGNoIHRvIFBhcnQgU3VtbWFyeScgfSk7XG4gICAgfVxuXG4gICAgVE1VdGlscy5vblVybENoYW5nZT8uKHJlZnJlc2hIdWJCdXR0b25FbmFibGVtZW50KTtcbiAgICBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWZyZXNoSHViQnV0dG9uRW5hYmxlbWVudClcbiAgICAgICAgLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSB9KTtcblxuICAgIC8vIGNhbGwgb25jZSBhdCBib290c3RyYXBcbiAgICBlbnN1cmVIdWJCdXR0b24oKTtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIHJ1bkFwcGx5UHJpY2luZygpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnQXBwbHlpbmcgY2F0YWxvZyBwcmljaW5nXHUyMDI2JywgJ2luZm8nKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIGF1dGhcbiAgICAgICAgICAgIHRyeSB7IGlmICghKGF3YWl0IGx0LmNvcmUuYXV0aC5nZXRLZXkoKSkpIHsgbHQuY29yZS5odWIubm90aWZ5KCdTaWduLWluIHJlcXVpcmVkJywgJ3dhcm4nLCB7IG1zOiA0MDAwIH0pOyB0YXNrLmVycm9yKCdObyBzZXNzaW9uJyk7IHJldHVybjsgfSB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xuICAgICAgICAgICAgaWYgKCFxaykgeyB0YXNrLmVycm9yKCdRdW90ZV9LZXkgbWlzc2luZycpOyByZXR1cm47IH1cblxuICAgICAgICAgICAgYXdhaXQgZW5zdXJlUmVwb0ZvclF1b3RlKHFrKTtcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGF3YWl0IHF1b3RlUmVwby5nZXRIZWFkZXI/LigpIHx8IHt9O1xuICAgICAgICAgICAgbGV0IGNhdGFsb2dLZXkgPSBUTVV0aWxzLmdldE9ic1ZhbHVlPy4oaGVhZGVyLCBbJ0NhdGFsb2dfS2V5JywgJ0NhdGFsb2dLZXknXSwgeyBmaXJzdDogdHJ1ZSB9KSA/PyBudWxsO1xuXG4gICAgICAgICAgICBpZiAoIWNhdGFsb2dLZXkpIHtcbiAgICAgICAgICAgICAgICB0YXNrLnVwZGF0ZSgnRmV0Y2hpbmcgQ2F0YWxvZyBLZXlcdTIwMjYnKTtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzMSA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQ2F0YWxvZ0tleUJ5UXVvdGVLZXksIHsgUXVvdGVfS2V5OiBxayB9KSk7XG4gICAgICAgICAgICAgICAgY2F0YWxvZ0tleSA9IHJvd3MxPy5bMF0/LkNhdGFsb2dfS2V5IHx8IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKGNhdGFsb2dLZXkpIGF3YWl0IHF1b3RlUmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBOdW1iZXIocWspLCBDYXRhbG9nX0tleTogTnVtYmVyKGNhdGFsb2dLZXkpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjYXRhbG9nS2V5KSB7IHRhc2suZXJyb3IoJ05vIENhdGFsb2cgS2V5Jyk7IGx0LmNvcmUuaHViLm5vdGlmeSgnTm8gY2F0YWxvZyBmb3VuZCBmb3IgdGhpcyBxdW90ZScsICd3YXJuJywgeyBtczogNDAwMCB9KTsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIENvbGxlY3QgcGFydHMgZnJvbSBLTyBncmlkIG5vd1xuICAgICAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuXG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgY29uc3QgcmF3ID0gKGdyaWQgJiYgS08/LmRhdGFGb3IgJiYgQXJyYXkuaXNBcnJheShLTy5kYXRhRm9yKGdyaWQpPy5kYXRhc291cmNlPy5yYXcpKVxuICAgICAgICAgICAgICAgID8gS08uZGF0YUZvcihncmlkKS5kYXRhc291cmNlLnJhdyA6IFtdO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9zID0gWy4uLm5ldyBTZXQocmF3Lm1hcChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWU/LihyLCBcIlBhcnROb1wiLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pKS5maWx0ZXIoQm9vbGVhbikpXTtcbiAgICAgICAgICAgIGlmICghcGFydE5vcy5sZW5ndGgpIHsgdGFzay5lcnJvcignTm8gUGFydE5vIHZhbHVlcycpOyBsdC5jb3JlLmh1Yi5ub3RpZnkoJ05vIFBhcnRObyB2YWx1ZXMgZm91bmQnLCAnd2FybicsIHsgbXM6IDQwMDAgfSk7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZShgTG9hZGluZyAke3BhcnROb3MubGVuZ3RofSBwYXJ0KHMpXHUyMDI2YCk7XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgY29uc3QgcHJpY2VNYXAgPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHBhcnROb3MubWFwKGFzeW5jIChwKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gbHQuY29yZS5wbGV4LmRzUm93cyhDT05GSUcuRFNfQnJlYWtwb2ludHNCeVBhcnQsIHsgQ2F0YWxvZ19LZXk6IGNhdGFsb2dLZXksIENhdGFsb2dfUGFydF9ObzogcCB9KSkgfHwgW107XG4gICAgICAgICAgICAgICAgcHJpY2VNYXBbcF0gPSByb3dzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiByLkNhdGFsb2dfUGFydF9ObyA9PT0gcCAmJiBuZXcgRGF0ZShyLkVmZmVjdGl2ZV9EYXRlKSA8PSBub3cgJiYgbm93IDw9IG5ldyBEYXRlKHIuRXhwaXJhdGlvbl9EYXRlKSlcbiAgICAgICAgICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEuQnJlYWtwb2ludF9RdWFudGl0eSAtIGIuQnJlYWtwb2ludF9RdWFudGl0eSk7XG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIC8vIDMpIEFwcGx5IG9yIGRlbGV0ZSBwZXIgcm93IChxdC1zdGFuZGFyZCBsb29wKVxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3Qgcm91bmQgPSAobikgPT4gKygrbikudG9GaXhlZChTLnVuaXRQcmljZURlY2ltYWxzKTtcblxuICAgICAgICAgICAgLy8gUmV1c2UgZ3JpZC9yYXcgcmVzb2x2ZWQgYWJvdmUgKGF2b2lkIHJlZGVjbGFyYXRpb24pXG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcmF3W2ldO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF0eSA9ICsoVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdRdWFudGl0eScsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSkgfHwgMCk7XG5cbiAgICAgICAgICAgICAgICAvLyBEZWxldGUgemVyby1xdHkgcm93cyAoc3RhbmRhcmQgYmVoYXZpb3IpXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA8PSAwICYmIFMuZGVsZXRlWmVyb1F0eVJvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcWtSb3cgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvdywgWydRdW90ZUtleScsICdRdW90ZV9LZXknXSwgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXBrID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csIFsnUXVvdGVQYXJ0S2V5JywgJ1F1b3RlX1BhcnRfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwciA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93LCBbJ1F1b3RlUHJpY2VLZXknLCAnUXVvdGVfUHJpY2VfS2V5J10sIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHFrUm93ICYmIHFwayAmJiBxcHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQnVpbGQgeC13d3ctZm9ybS11cmxlbmNvZGVkIHBheWxvYWQgc28gaXQgd29ya3Mgd2hldGhlciBUTVV0aWxzLmZldGNoRGF0YSBvciBuYXRpdmUgZmV0Y2ggaXMgdXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvcm0gPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlS2V5JywgU3RyaW5nKE51bWJlcihxa1JvdykpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3JtLnNldCgnUXVvdGVQYXJ0S2V5JywgU3RyaW5nKE51bWJlcihxcGspKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS5zZXQoJ1F1b3RlUHJpY2VLZXknLCBTdHJpbmcoTnVtYmVyKHFwcikpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFudGktZm9yZ2VyeSB0b2tlbiAoaWYgcHJlc2VudCBvbiBwYWdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJ2dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy52YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9XCJfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlblwiXScpPy5jb250ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydnQpIGZvcm0uc2V0KCdfX1JlcXVlc3RWZXJpZmljYXRpb25Ub2tlbicsIHJ2dCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IGx0LmNvcmUuaHR0cC5wb3N0KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnL1NhbGVzQW5kQ1JNL1F1b3RlUGFydC9EZWxldGVRdW90ZVByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9ybS50b1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQ7IGNoYXJzZXQ9VVRGLTgnIH0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBEZWxldGVkIHJvd1ske2l9XWAsICdzdWNjZXNzJywgeyBtczogMjUwMCB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycignUVQzMCBkZWxldGUgZXJyb3InLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYERlbGV0ZSBmYWlsZWQgcm93WyR7aX1dYCwgJ2Vycm9yJywgeyBtczogMzAwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgU2tpcCBkZWxldGUgcm93WyR7aX1dIFx1MjAxNCBtaXNzaW5nIGtleXNgLCAnd2FybicsIHsgbXM6IDI1MDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwcmljZSB0byBub24temVybyByb3dzXG4gICAgICAgICAgICAgICAgaWYgKHF0eSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydE5vID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3csICdQYXJ0Tm8nLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBicCA9IHBpY2tQcmljZShwcmljZU1hcFtwYXJ0Tm9dLCBxdHkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYnAgPT0gbnVsbCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5UHJpY2VUb1Jvdyhyb3csIHJvdW5kKGJwKSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhgUVQzMDogcm93WyR7aX1dIHF0eT0ke3F0eX0gcHJpY2U9JHtyb3VuZChicCl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0YXNrLnVwZGF0ZSgnUmVmcmVzaGluZyBncmlkXHUyMDI2Jyk7XG4gICAgICAgICAgICBjb25zdCBtb2RlID0gYXdhaXQgcmVmcmVzaFF1b3RlR3JpZCgpO1xuXG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1ByaWNpbmcgYXBwbGllZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KFxuICAgICAgICAgICAgICAgIG1vZGUgPyAnUHJpY2luZyBhcHBsaWVkIGFuZCBncmlkIHJlZnJlc2hlZCcgOiAnUHJpY2luZyBhcHBsaWVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxuICAgICAgICAgICAgICAgICdzdWNjZXNzJyxcbiAgICAgICAgICAgICAgICB7IG1zOiAzMDAwIH1cbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYEFwcGx5IGZhaWxlZDogJHtlPy5tZXNzYWdlIHx8IGV9YCwgJ2Vycm9yJywgeyBtczogNDAwMCB9KTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIC8vIG9wdGlvbmFsOiByZWZyZXNoIGVuYWJsZW1lbnQgaWYgcGFnZSBjaGFuZ2VkIGR1ZSB0byBTUEEgbmF2XG4gICAgICAgICAgICB0cnkgeyByZWZyZXNoSHViQnV0dG9uRW5hYmxlbWVudCgpOyB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyAtLS0tLS0tLS0tIEhlbHBlcnMgLS0tLS0tLS0tLVxuICAgIC8vIERldGVybWluaXN0aWMgUXVvdGVLZXkgKHF0MzUgcGF0dGVybilcbiAgICBmdW5jdGlvbiBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhdzAgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhd1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJhdzAgPyBUTVV0aWxzLmdldE9ic1ZhbHVlPy4ocmF3MCwgJ1F1b3RlS2V5JykgOiBudWxsO1xuICAgICAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByb290RWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQsIC5wbGV4LXBhZ2UnKTtcbiAgICAgICAgICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RWTSA9IHJvb3RFbCA/IEtPPy5kYXRhRm9yPy4ocm9vdEVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2ID0gcm9vdFZNICYmIChUTVV0aWxzLmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCBUTVV0aWxzLmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGUuUXVvdGVLZXknKSk7XG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICBjb25zdCBtID0gL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICAgIHJldHVybiBtID8gTnVtYmVyKG1bMV0pIDogbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwaWNrUHJpY2UoYnBzLCBxdHkpIHtcbiAgICAgICAgaWYgKCFicHM/Lmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChxdHkgPCBicHNbMF0uQnJlYWtwb2ludF9RdWFudGl0eSkgcmV0dXJuIGJwc1swXS5CcmVha3BvaW50X1ByaWNlO1xuICAgICAgICBjb25zdCBsYXN0ID0gYnBzW2Jwcy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKHF0eSA+PSBsYXN0LkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBsYXN0LkJyZWFrcG9pbnRfUHJpY2U7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnBzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHF0eSA+PSBicHNbaV0uQnJlYWtwb2ludF9RdWFudGl0eSAmJiBxdHkgPCBicHNbaSArIDFdLkJyZWFrcG9pbnRfUXVhbnRpdHkpIHJldHVybiBicHNbaV0uQnJlYWtwb2ludF9QcmljZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gYXBwbHlQcmljZVRvUm93KHJvdywgcHJpY2UpIHtcbiAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZShyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnLCBwcmljZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJ5IHRvIHJlZnJlc2ggdGhlIFF1b3RlIGdyaWQgdmlzdWFscyBhZnRlciBhcHBseS9kZWxldGUgb3BzLlxuICAgICAqIE9yZGVyIG9mIGF0dGVtcHRzOlxuICAgICAqICAxKSBLTyBncmlkIFZNIGRhdGFzb3VyY2UucmVhZCgpIChhc3luYylcbiAgICAgKiAgMikgZ3JpZCBWTSAucmVmcmVzaCgpIChzeW5jKVxuICAgICAqICAzKSBXaXphcmQgbmF2IHRvIGN1cnJlbnQgcGFnZSAocmViaW5kcyBwYWdlKVxuICAgICAqIFJldHVybnMgYSBzdHJpbmcgZGVzY3JpYmluZyB3aGljaCBwYXRoIHN1Y2NlZWRlZCwgb3IgbnVsbC5cbiAgICAgKi9cbiAgICBhc3luYyBmdW5jdGlvbiByZWZyZXNoUXVvdGVHcmlkKCkge1xuICAgICAgICAvLyBQcmVmZXIgYSBLTy1sZXZlbCByZWZyZXNoIGlmIGF2YWlsYWJsZVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZ3JpZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDT05GSUcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZEVsICYmIEtPPy5kYXRhRm9yPy4oZ3JpZEVsKTtcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LmRhdGFzb3VyY2U/LnJlYWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXG4gICAgICAgICAgICAgICAgcmV0dXJuICdkcy5yZWFkJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgZ3JpZFZNLnJlZnJlc2goKTsgICAgICAgICAgICAgICAgICAvLyBzeW5jIHZpc3VhbCByZWZyZXNoXG4gICAgICAgICAgICAgICAgcmV0dXJuICd2bS5yZWZyZXNoJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBzYW1lIGFjdGl2ZSBwYWdlIHRvIGZvcmNlIHJlYmluZFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9ICh0eXBlb2Ygd2l6LmFjdGl2ZVBhZ2UgPT09ICdmdW5jdGlvbicpID8gd2l6LmFjdGl2ZVBhZ2UoKSA6IHdpei5hY3RpdmVQYWdlO1xuICAgICAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3dpei5uYXZpZ2F0ZVBhZ2UnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gVGlueSBERVYgdGVzdCBzZWFtIC0tLS0tLS0tLS1cbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMzBfXyA9IHsgcGlja1ByaWNlLCBhcHBseVByaWNlVG9Sb3csIHJ1bkFwcGx5UHJpY2luZyB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELEdBQUMsTUFBTTtBQUVILFVBQU0sU0FBUztBQUFBLE1BQ1gseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsTUFDdEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1Qsa0JBQWtCO0FBQUEsTUFDbEIsYUFBYTtBQUFBLE1BQ2IsVUFBVSxFQUFFLG1CQUFtQixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QixLQUFLO0FBQUEsSUFDM0Y7QUFHQSxVQUFNLFVBQVUsd0JBQXdCLEtBQUssU0FBUyxRQUFRO0FBQzlELFlBQVEsV0FBVyxPQUFPO0FBQzFCLFVBQU0sSUFBSSxRQUFRLFlBQVksTUFBTTtBQUNwQyxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUUsVUFBSSxPQUFPLFFBQVMsSUFBRyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQUc7QUFDNUQsVUFBTSxPQUFPLElBQUksTUFBTTtBQUFFLFVBQUksT0FBTyxRQUFTLElBQUcsT0FBTyxHQUFHLENBQUM7QUFBQSxJQUFHO0FBQzlELFVBQU0sTUFBTSxJQUFJLE1BQU07QUFBRSxVQUFJLE9BQU8sUUFBUyxJQUFHLFFBQVEsR0FBRyxDQUFDO0FBQUEsSUFBRztBQUM5RCxVQUFNLEtBQU0sT0FBTyxpQkFBaUIsZUFBZSxhQUFhLEtBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0YsVUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBQ3RELFFBQUksQ0FBQyxPQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUMsR0FBRztBQUFFLFVBQUksNkJBQTZCO0FBQUc7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
