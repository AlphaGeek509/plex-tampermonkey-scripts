// ==UserScript==
// @name        QT10_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.5.180
// @description DEV-only build; includes user-start gate
// @match       https://*.plex.com/*
// @match       https://*.on.plex.com/*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js
// @require     http://localhost:5000/lt-plex-auth.user.js
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlHttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @run-at      document-idle
// @noframes
// ==/UserScript==
(() => {
  // src/qt10/main.js
  (async function() {
    "use strict";
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.("QT10");
    const dlog = (...a) => {
      if (IS_TEST_ENV) L?.log?.(...a);
    };
    const dwarn = (...a) => {
      if (IS_TEST_ENV) L?.warn?.(...a);
    };
    const derror = (...a) => {
      if (IS_TEST_ENV) L?.error?.(...a);
    };
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
      dlog("Skipping route:", location.pathname);
      return;
    }
    const ANCHOR = '[data-val-property-name="CustomerNo"]';
    let booted = false;
    let booting = false;
    let disposeWatcher = null;
    let unsubscribeUrl = null;
    async function anchorAppears(sel, { timeoutMs = 5e3, pollMs = 150 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (document.querySelector(sel)) return true;
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return !!document.querySelector(sel);
    }
    function readCustomerNoFromVM(viewModel) {
      const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
      try {
        const raw = KO?.unwrap ? KO.unwrap(viewModel.CustomerNo) : typeof viewModel.CustomerNo === "function" ? viewModel.CustomerNo() : viewModel.CustomerNo;
        const v = Array.isArray(raw) ? raw[0] : raw;
        return (v ?? "").toString().trim();
      } catch {
        return "";
      }
    }
    async function maybeBoot() {
      if (booted || booting) return;
      booting = true;
      try {
        if (!TMUtils.matchRoute?.(ROUTES)) {
          booting = false;
          return;
        }
        if (!await anchorAppears(ANCHOR, { timeoutMs: 2e3 })) {
          booting = false;
          return;
        }
        booted = true;
        await TMUtils.getApiKey();
        const { controller, viewModel } = await TMUtils.waitForModelAsync(ANCHOR, {
          pollMs: 200,
          timeoutMs: 8e3,
          logger: IS_TEST_ENV ? L : null
        });
        let gate = null;
        if (true) {
          const inputEl = document.querySelector('[data-val-property-name="CustomerNo"] input') || document.querySelector('input[name="CustomerNo"]') || document.querySelector('[data-val-property-name="CustomerNo"]');
          if (inputEl && window.ko) {
            gate = createGatedComputed({ ko: window.ko, read: () => true });
            startGateOnFirstUserEdit({ gate, inputEl });
            console.debug("[QT10 DEV] gate armed on", inputEl);
          } else {
            console.debug("[QT10 DEV] gate not armed (missing ko/input)");
          }
        }
        const gateIsStarted = () => !gate || (typeof gate.isStarted === "function" ? !!gate.isStarted() : !!gate.isStarted);
        if (!controller || !viewModel) {
          booted = false;
          booting = false;
          return;
        }
        let lastCustomerNo = null;
        disposeWatcher = TMUtils.watchBySelector({
          selector: ANCHOR,
          initial: false,
          fireOn: "blur",
          settleMs: 350,
          logger: IS_TEST_ENV ? L : null,
          onChange: () => {
            const customerNo = readCustomerNoFromVM(viewModel);
            if (!customerNo || customerNo === lastCustomerNo) return;
            lastCustomerNo = customerNo;
            dlog("QT10: CustomerNo \u2192", customerNo);
            applyCatalogFor(customerNo);
            if (!gateIsStarted()) {
              if (true) console.debug("[QT10 DEV] change ignored until first user edit");
              return;
            }
          }
        });
        async function applyCatalogFor(customerNo) {
          if (!customerNo) return;
          try {
            const [row1] = await TMUtils.dsRows(319, { Customer_No: customerNo });
            const catalogKey = row1?.Catalog_Key || 0;
            if (!catalogKey) {
              TMUtils.toast(`\u26A0\uFE0F No catalog for ${customerNo}`, "warn");
              return;
            }
            const rows2 = await TMUtils.dsRows(22696, { Catalog_Key: catalogKey });
            const catalogCode = rows2.map((r) => r.Catalog_Code).find(Boolean) || "";
            if (typeof viewModel.CatalogKey === "function") {
              viewModel.CatalogKey(catalogKey);
            } else if (Array.isArray(viewModel.CatalogKey)) {
              viewModel.CatalogKey.length = 0;
              viewModel.CatalogKey.push(catalogKey);
            }
            if (typeof viewModel.CatalogCode === "function") {
              viewModel.CatalogCode(catalogCode);
            } else if (Array.isArray(viewModel.CatalogCode)) {
              viewModel.CatalogCode.length = 0;
              viewModel.CatalogCode.push(catalogCode);
            }
            TMUtils.toast(
              `\u2705 Customer: ${customerNo}
CatalogKey: ${catalogKey}
CatalogCode: ${catalogCode}`,
              "success"
            );
            dlog("QT10 done", { customerNo, catalogKey, catalogCode });
          } catch (err) {
            TMUtils.toast(`\u274C Lookup failed: ${err.message}`, "error");
            derror(err);
          }
        }
      } catch (e) {
        booted = false;
        derror("QT10 init failed:", e);
      } finally {
        booting = false;
      }
    }
    unsubscribeUrl = TMUtils.onUrlChange?.(() => {
      if (!TMUtils.matchRoute?.(ROUTES)) {
        try {
          disposeWatcher?.();
        } catch {
        }
        disposeWatcher = null;
        booted = false;
        booting = false;
        return;
      }
      setTimeout(maybeBoot, 0);
    });
    setTimeout(maybeBoot, 0);
  })();
})();
