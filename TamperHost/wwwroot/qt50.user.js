// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.121
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.121-1758912627539
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.121-1758912627539
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.121-1758912627539
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.121-1758912627539
// @require      http://localhost:5000/lt-core.user.js?v=3.8.121-1758912627539
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
// @updateURL   http://localhost:5000/qt50.user.js
// @downloadURL http://localhost:5000/qt50.user.js
// ==/UserScript==

(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/quote-tracking/qt50-validation/index.js
  var index_exports = {};
  __export(index_exports, {
    KEYS: () => KEYS,
    getSettings: () => getSettings,
    onSettingsChange: () => onSettingsChange
  });
  function readOrLegacy(k) {
    const v = GM_getValue(k);
    if (v !== void 0) return v;
    const legacyKey = Object.values(LEGACY_KEYS).find((lk) => lk.endsWith(k.split(".").pop()));
    const lv = legacyKey ? GM_getValue(legacyKey) : void 0;
    return lv !== void 0 ? lv : void 0;
  }
  function getSettings() {
    return {
      enabled: getVal(KEYS.enabled),
      autoManageLtPartNoOnQuote: getVal(KEYS.autoManageLtPartNoOnQuote),
      minUnitPrice: getVal(KEYS.minUnitPrice),
      maxUnitPrice: getVal(KEYS.maxUnitPrice)
    };
  }
  function onSettingsChange(fn) {
    if (typeof fn !== "function") return () => {
    };
    const h = () => fn(getSettings());
    window.addEventListener("LT:QTV:SettingsChanged", h);
    return () => window.removeEventListener("LT:QTV:SettingsChanged", h);
  }
  function emitChanged() {
    try {
      window.dispatchEvent(new CustomEvent("LT:QTV:SettingsChanged", { detail: getSettings() }));
    } catch {
    }
  }
  async function ensureHubGear() {
    const onWizard = TMUtils.matchRoute?.(ROUTES);
    const active = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]');
    const name = (active?.textContent || "").trim().replace(/\s+/g, " ");
    const onTarget = onWizard && /^part\s*summary$/i.test(name);
    const hub = await (async function getHub2(opts = { mount: "nav" }) {
      for (let i = 0; i < 50; i++) {
        const ensure = window.ensureLTHub || unsafeWindow?.ensureLTHub;
        if (typeof ensure === "function") {
          try {
            const h = await ensure(opts);
            if (h) return h;
          } catch {
          }
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    })();
    if (!hub?.registerButton) return;
    const ID = "qt50-settings";
    const listed = hub.list?.()?.includes(ID);
    if (onTarget && !listed) {
      hub.registerButton("right", {
        id: ID,
        label: "Validation \u2699\uFE0E",
        title: "Open Quote Validation settings",
        weight: 30,
        onClick: showPanel
      });
    } else if (!onTarget && listed) {
      hub.remove?.(ID);
    }
  }
  function showPanel() {
    const overlay = document.createElement("div");
    overlay.id = "lt-qtv-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: 0,
      background: "var(--lt-overlay, rgba(0,0,0,.36))",
      zIndex: 100002
    });
    const panel = document.createElement("div");
    panel.id = "lt-qtv-panel";
    panel.className = "lt-card lt-modal";
    Object.assign(panel.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: "520px",
      maxWidth: "min(92vw, 560px)"
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
    });
    overlay.tabIndex = -1;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    panel.innerHTML = `
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard \u2192 Part Summary page.</div>

    <label style="display:block; margin:10px 0;">
      <input type="checkbox" id="qtv-enabled"> Enable validations
    </label>

    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

    <label title="If Part Status is Quote, the Lyn-Tron Part No is controlled automatically."
           style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-autoManageLtPartNoOnQuote">
      Auto-manage omitted Lyn-Tron Part No.
    </label>

    <div style="display:flex; gap:10px; margin:8px 0;">
      <label style="flex:1;">Min Unit Price
        <input type="number" step="0.01" id="qtv-min" placeholder="(none)"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <label style="flex:1;">Max Unit Price
        <input type="number" step="0.01" id="qtv-max" placeholder="10.00"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
    </div>

    <div style="border-top:1px solid #eee; margin:12px 0 10px;"></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button id="qtv-export" class="lt-btn lt-btn--ghost">Export</button>
      <button id="qtv-import-btn" class="lt-btn lt-btn--ghost" type="button">Import</button>
        <input id="qtv-import" type="file" accept="application/json" style="display:none;">
      <span style="flex:1"></span>
      <button id="qtv-reset" class="lt-btn lt-btn--warn">Reset</button>
      <button id="qtv-close" class="lt-btn lt-btn--primary">Save &amp; Close</button>
    </div>
  `;
    panel.querySelector("#qtv-enabled").checked = getVal(KEYS.enabled);
    panel.querySelector("#qtv-autoManageLtPartNoOnQuote").checked = getVal(KEYS.autoManageLtPartNoOnQuote);
    setNumberOrBlank(panel.querySelector("#qtv-min"), getVal(KEYS.minUnitPrice));
    setNumberOrBlank(panel.querySelector("#qtv-max"), getVal(KEYS.maxUnitPrice));
    panel.querySelector("#qtv-enabled")?.addEventListener("change", (e) => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change", (e) => setVal(KEYS.autoManageLtPartNoOnQuote, !!e.target.checked));
    panel.querySelector("#qtv-min")?.addEventListener("change", (e) => {
      const v = parseNumberOrNull(e.target.value);
      setVal(KEYS.minUnitPrice, v);
      setNumberOrBlank(e.target, v);
    });
    panel.querySelector("#qtv-max")?.addEventListener("change", (e) => {
      const v = parseNumberOrNull(e.target.value);
      setVal(KEYS.maxUnitPrice, v);
      setNumberOrBlank(e.target, v);
    });
    panel.querySelector("#qtv-close")?.addEventListener("click", () => {
      overlay.remove();
      TMUtils.toast?.("Validation settings saved.", "success", 1600);
    });
    panel.querySelector("#qtv-reset")?.addEventListener("click", () => {
      Object.keys(DEF).forEach((k) => GM_setValue(k, DEF[k]));
      emitChanged();
      overlay.remove();
      TMUtils.toast?.("Validation settings reset.", "info", 1800);
    });
    panel.querySelector("#qtv-export")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getSettings(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qt-validation-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    panel.querySelector("#qtv-import-btn")?.addEventListener("change", async (ev) => {
      try {
        const f = ev.target.files?.[0];
        if (!f) return;
        const data = JSON.parse(await f.text());
        if (data && typeof data === "object") {
          if ("enabled" in data) setVal(KEYS.enabled, !!data.enabled);
          if ("autoManageLtPartNoOnQuote" in data) setVal(KEYS.autoManageLtPartNoOnQuote, !!data.autoManageLtPartNoOnQuote);
          if ("minUnitPrice" in data) setVal(KEYS.minUnitPrice, toNullOrNumber(data.minUnitPrice));
          if ("maxUnitPrice" in data) setVal(KEYS.maxUnitPrice, toNullOrNumber(data.maxUnitPrice));
          overlay.remove();
          TMUtils.toast?.("Validation settings imported.", "success", 1800);
        } else throw new Error("Invalid JSON.");
      } catch (err) {
        TMUtils.toast?.(`Import failed: ${err?.message || err}`, "error", 3e3);
      }
    });
    ensureSettingsStyles();
    overlay.appendChild(panel);
    (document.body || document.documentElement).appendChild(overlay);
    overlay.focus();
  }
  function parseNumberOrNull(s) {
    const v = Number(String(s).trim());
    return Number.isFinite(v) ? v : null;
  }
  function toNullOrNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function setNumberOrBlank(input, val) {
    input.value = val == null ? "" : String(val);
  }
  function ensureSettingsStyles() {
    if (document.getElementById("lt-qtv-panel-styles")) return;
    const s = document.createElement("style");
    s.id = "lt-qtv-panel-styles";
    s.textContent = `
#lt-qtv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.36); z-index: 100002; }
#lt-qtv-panel.lt-card {
  /* Local Monroe palette (independent of page tokens) */
  --brand-600: #8b0b04;
  --brand-700: #5c0a0a;
  --ok: #28a745;
  --warn: #ffc107;
  --err: #dc3545;

  background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.30);
  overflow: hidden; padding: 16px;
}
#lt-qtv-panel h3 { margin: 0 0 10px 0; font: 600 16px/1.2 system-ui, Segoe UI, sans-serif; }
#lt-qtv-panel .lt-btn,
#lt-qtv-panel label.lt-btn {
  display:inline-flex; align-items:center; gap:6px; padding:6px 10px;
  border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; cursor:pointer;
}
#lt-qtv-panel .lt-btn--primary { background: var(--brand-600); border-color: color-mix(in srgb, var(--brand-600) 70%, black); color:#fff; }
#lt-qtv-panel .lt-btn--primary:hover { background: var(--brand-700); }
#lt-qtv-panel .lt-btn--ghost   { background: transparent; color: var(--brand-600); border-color: var(--brand-600); }
#lt-qtv-panel .lt-btn--ghost:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }
#lt-qtv-panel .lt-btn--warn    { background: var(--warn); color:#111; border-color: color-mix(in srgb, var(--warn) 50%, black); }
#lt-qtv-panel .lt-btn--error   { background: var(--err);  color:#fff; border-color: color-mix(in srgb, var(--err) 70%, black); }
#lt-qtv-panel .lt-btn--ok      { background: var(--ok);   color:#fff; border-color: color-mix(in srgb, var(--ok) 70%, black); }

#lt-qtv-panel input[type="number"], #lt-qtv-panel input[type="text"] {
  width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff;
}
  `;
    document.head.appendChild(s);
  }
  var DEV, KO, ROUTES, ON_ROUTE, KEYS, LEGACY_KEYS, DEF, getVal, setVal;
  var init_index = __esm({
    "src/quote-tracking/qt50-validation/index.js"() {
      DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
      KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
      ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
      ON_ROUTE = !!TMUtils.matchRoute?.(ROUTES);
      if (DEV && !ON_ROUTE) console.debug("QT50: wrong route, skipping bootstrap");
      KEYS = {
        enabled: "qt50.enabled",
        autoManageLtPartNoOnQuote: "qt50.autoManageLtPartNoOnQuote",
        minUnitPrice: "qt50.minUnitPrice",
        maxUnitPrice: "qt50.maxUnitPrice"
      };
      LEGACY_KEYS = {
        enabled: "qtv.enabled",
        autoManageLtPartNoOnQuote: "qtv.autoManageLtPartNoOnQuote",
        minUnitPrice: "qtv.minUnitPrice",
        maxUnitPrice: "qtv.maxUnitPrice"
      };
      DEF = {
        [KEYS.enabled]: true,
        [KEYS.autoManageLtPartNoOnQuote]: true,
        [KEYS.minUnitPrice]: 0,
        [KEYS.maxUnitPrice]: 10
      };
      getVal = (k) => {
        const v = readOrLegacy(k);
        return v === void 0 ? DEF[k] : v;
      };
      setVal = (k, v) => {
        GM_setValue(k, v);
        emitChanged();
      };
      GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings", showPanel);
      if (ON_ROUTE) {
        ensureHubGear();
        TMUtils?.onUrlChange?.(ensureHubGear);
        setTimeout(ensureHubGear, 500);
      }
    }
  });

  // src/quote-tracking/qt50-validation/rules/autoManageLtPartNoOnQuote.js
  async function autoManageLtPartNoOnQuote(ctx, settings, utils) {
    const issues = [];
    if (!settings?.autoManageLtPartNoOnQuote) return issues;
    const ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const lt2 = ROOT.lt || {};
    const withFreshAuth = (fn) => {
      const impl = lt2?.core?.auth?.withFreshAuth;
      return typeof impl === "function" ? impl(fn) : fn();
    };
    const QTF = lt2.core?.data?.makeFlatScopedRepo ? lt2.core.data.makeFlatScopedRepo({ ns: "QT", entity: "quote", legacyEntity: "QuoteHeader" }) : null;
    const DS_QUOTE_HEADER_GET = 3156;
    const DS_MANAGE_PARTNO = 13509;
    async function getPlex() {
      const plex = typeof ROOT.getPlexFacade === "function" ? await ROOT.getPlexFacade() : lt2?.core?.plex;
      if (!plex) throw new Error("Plex facade not available");
      return plex;
    }
    function getQuoteNoFromSession() {
      try {
        return (sessionStorage.getItem("Quote_No") || "").trim();
      } catch {
        return "";
      }
    }
    async function getQuoteNoForQuoteKey(qk) {
      const qKey = Number(qk);
      if (!qKey || !Number.isFinite(qKey) || qKey <= 0) return getQuoteNoFromSession();
      try {
        if (!QTF) return getQuoteNoFromSession();
        const { repo } = QTF.use(qKey);
        await repo.ensureFromLegacyIfMissing?.();
        let head = await repo.getHeader?.();
        if (!head?.Quote_No) {
          const plex = await getPlex();
          if (plex?.dsRows) {
            const rows = await withFreshAuth(() => plex.dsRows(DS_QUOTE_HEADER_GET, { Quote_Key: String(qKey) }));
            const first = Array.isArray(rows) && rows.length ? rows[0] : null;
            const quoteNo = first?.Quote_No ?? null;
            if (quoteNo != null) {
              await repo.patchHeader?.({ Quote_Key: qKey, Quote_No: quoteNo, Quote_Header_Fetched_At: Date.now() });
              head = await repo.getHeader?.();
            }
          }
        }
        const qn = head?.Quote_No;
        return qn == null ? getQuoteNoFromSession() : String(qn).trim();
      } catch {
        return getQuoteNoFromSession();
      }
    }
    for (const [qpk, group] of ctx.groupsByQuotePart.entries()) {
      const any = Array.isArray(group) && group.length ? group[0] : null;
      const groupQuoteKey = utils.get(any, "QuoteKey", { number: true });
      const resolvedQuoteNo = await getQuoteNoForQuoteKey(groupQuoteKey);
      const uniqByPartKey = /* @__PURE__ */ new Map();
      for (const row of group) {
        const pk = utils.get(row, "PartKey", { number: true });
        if (Number.isFinite(pk) && !uniqByPartKey.has(pk)) {
          uniqByPartKey.set(pk, row);
        }
      }
      for (const r of uniqByPartKey.values()) {
        const status = String(utils.get(r, "PartStatus", { trim: true }) || "");
        if (status.toLowerCase() !== "quote") continue;
        const vmQuoteKey = groupQuoteKey ?? utils.get(r, "QuoteKey", { number: true });
        const vmPartKey = utils.get(r, "PartKey", { number: true });
        const vmPartNo = String(utils.get(r, "PartNo", { trim: true }) ?? "");
        const hasQuoteNo = !!resolvedQuoteNo;
        const desiredPrefix = hasQuoteNo ? `${resolvedQuoteNo}_` : `_`;
        const alreadyManaged = vmPartNo.startsWith(desiredPrefix);
        if (alreadyManaged) {
          issues.push({
            kind: "part.autoManageLtPartNoOnQuote",
            level: "info",
            quotePartKey: qpk,
            message: `No change: Part_No already managed.`,
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: false }
          });
          continue;
        }
        const partNoForPost = `${desiredPrefix}${vmPartNo}`;
        const body = {
          Quote_Key: String(vmQuoteKey ?? ""),
          Part_Key: String(vmPartKey ?? ""),
          Part_No: String(partNoForPost ?? ""),
          Update_Part: true
        };
        try {
          const plex = await getPlex();
          if (!plex?.dsRows) throw new Error("plex.dsRows unavailable");
          await withFreshAuth(() => plex.dsRows(DS_MANAGE_PARTNO, body));
          issues.push({
            kind: "part.autoManageLtPartNoOnQuote",
            level: "warning",
            quotePartKey: qpk,
            message: `Part_No \u201C${body.Part_No}\u201D auto managed.`,
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: true }
          });
        } catch (err) {
          issues.push({
            kind: "part.autoManageLtPartNoOnQuote",
            level: "warning",
            quotePartKey: qpk,
            message: `DS ${DS_MANAGE_PARTNO} failed: ${err?.message || err}`,
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO, changed: false }
          });
        }
      }
    }
    return issues;
  }
  var init_autoManageLtPartNoOnQuote = __esm({
    "src/quote-tracking/qt50-validation/rules/autoManageLtPartNoOnQuote.js"() {
      autoManageLtPartNoOnQuote.meta = { id: "autoManageLtPartNoOnQuote", label: "Auto-Manage LT Part No" };
    }
  });

  // src/quote-tracking/qt50-validation/rules/minUnitPrice.js
  function minUnitPrice(ctx, settings, utils) {
    const min = Number(settings.minUnitPrice);
    if (!Number.isFinite(min)) return [];
    const issues = [];
    const toNum = (v) => {
      if (v == null) return NaN;
      const s = String(typeof v === "function" ? v() : v).trim();
      if (!s) return NaN;
      return Number(s.replace(/[^\d.-]/g, ""));
    };
    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
      for (const r of group) {
        const qty = utils.get(r, "Quantity") ?? "?";
        const raw = utils.get(r, "RvCustomizedUnitPrice") ?? utils.get(r, "RvUnitPriceCopy") ?? utils.get(r, "UnitPrice");
        const num = toNum(raw);
        const inferCurrency = (rawVal) => {
          const s = String(typeof rawVal === "function" ? rawVal() : rawVal || "");
          if (/\$/.test(s)) return "USD";
          if (/€/.test(s)) return "EUR";
          if (/£/.test(s)) return "GBP";
          return settings?.currencyCode || "USD";
        };
        const currency = inferCurrency(raw);
        const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 6 });
        const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
        if (Number.isFinite(num) && num < min) {
          const fmtMoney = (n) => Number.isFinite(n) ? moneyFmt.format(n) : String(n);
          issues.push({
            kind: "price.minUnitPrice",
            level: "error",
            quotePartKey: qp,
            message: `Unit Price ${fmtMoney(num)} < Min ${fmtMoney(min)}`,
            meta: { unitRaw: raw, unitNum: num, min, currency }
          });
        }
      }
    }
    return issues;
  }
  var init_minUnitPrice = __esm({
    "src/quote-tracking/qt50-validation/rules/minUnitPrice.js"() {
      minUnitPrice.meta = { id: "minUnitPrice", label: "Min Unit Price" };
    }
  });

  // src/quote-tracking/qt50-validation/rules/maxUnitPrice.js
  function maxUnitPrice(ctx, settings, utils) {
    const max = Number(settings.maxUnitPrice);
    if (!Number.isFinite(max)) return [];
    const issues = [];
    const toNum = (v) => {
      if (v == null) return NaN;
      const s = String(typeof v === "function" ? v() : v).trim();
      if (!s) return NaN;
      return Number(s.replace(/[^\d.-]/g, ""));
    };
    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
      for (const r of group) {
        const qty = utils.get(r, "Quantity") ?? "?";
        const raw = utils.get(r, "RvCustomizedUnitPrice") ?? utils.get(r, "RvUnitPriceCopy") ?? utils.get(r, "UnitPrice");
        const num = toNum(raw);
        const inferCurrency = (rawVal) => {
          const s = String(typeof rawVal === "function" ? rawVal() : rawVal ?? "").trim();
          if (/\$/.test(s)) return "USD";
          if (/€/.test(s)) return "EUR";
          if (/£/.test(s)) return "GBP";
          return settings?.currencyCode || "USD";
        };
        const currency = inferCurrency(raw);
        const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 6 });
        if (Number.isFinite(num) && num > max) {
          const fmtMoney = (n) => Number.isFinite(n) ? moneyFmt.format(n) : String(n);
          issues.push({
            kind: "price.maxUnitPrice",
            level: "error",
            quotePartKey: qp,
            message: `Unit Price ${fmtMoney(num)} > Max ${fmtMoney(max)}`,
            meta: { unitRaw: raw, unitNum: num, max, currency }
          });
        }
      }
    }
    return issues;
  }
  var init_maxUnitPrice = __esm({
    "src/quote-tracking/qt50-validation/rules/maxUnitPrice.js"() {
      maxUnitPrice.meta = { id: "maxUnitPrice", label: "Max Unit Price" };
    }
  });

  // src/quote-tracking/qt50-validation/rules/index.js
  var rules_default;
  var init_rules = __esm({
    "src/quote-tracking/qt50-validation/rules/index.js"() {
      init_autoManageLtPartNoOnQuote();
      init_minUnitPrice();
      init_maxUnitPrice();
      rules_default = [autoManageLtPartNoOnQuote, maxUnitPrice, minUnitPrice];
    }
  });

  // src/quote-tracking/qt50-validation/engine.js
  var engine_exports = {};
  __export(engine_exports, {
    runValidation: () => runValidation
  });
  async function runValidation(TMUtils2, settings) {
    await TMUtils2.waitForModelAsync(".plex-grid", { requireKo: true, timeoutMs: 12e3 });
    const KO3 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const grid = document.querySelector(".plex-grid");
    const gvm = grid && KO3 && typeof KO3.dataFor === "function" ? KO3.dataFor(grid) : null;
    if (!gvm) return { ok: true, issues: [] };
    const rows = gvm?.datasource?.raw || gvm?.datasource?.data || [];
    const groupsByQuotePart = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const qp = TMUtils2.getObsValue(r, "QuotePartKey") ?? -1;
      (groupsByQuotePart.get(qp) || groupsByQuotePart.set(qp, []).get(qp)).push(r);
    }
    const primaryByQuotePart = /* @__PURE__ */ new Map();
    for (const [qp, group] of groupsByQuotePart.entries()) {
      const p = group.find((r) => TMUtils2.getObsValue(r, "IsUniqueQuotePart") === 1) || group[0];
      primaryByQuotePart.set(qp, p);
    }
    const ctx = {
      rows,
      groupsByQuotePart,
      primaryByQuotePart,
      lastForm: TMUtils2.net?.getLastAddUpdateForm?.(),
      lastResult: TMUtils2.net?.getLastAddUpdate?.()
    };
    const utils = { get: (obj, path, opts) => TMUtils2.getObsValue(obj, path, opts) };
    const results = await Promise.all(rules_default.map((rule) => rule(ctx, settings, utils)));
    const issuesRaw = results.flat();
    const ok = issuesRaw.every((i) => i.level !== "error");
    const toNum = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    const ruleLabelFrom = (iss) => {
      if (iss?.meta?.label) return iss.meta.label;
      if (iss?.kind) {
        const k = String(iss.kind);
        const tail = k.split(".").pop();
        return tail ? tail.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()) : k;
      }
      return "Validation";
    };
    const rowInfo = /* @__PURE__ */ new Map();
    for (let i = 0; i < ctx.rows.length; i++) {
      const r = ctx.rows[i];
      const lineNumber = i + 1;
      const partNo = utils.get(r, "PartNo", { trim: true }) ?? "";
      rowInfo.set(r, { lineNumber, partNo });
    }
    const qpkToPrimaryInfo = /* @__PURE__ */ new Map();
    for (const [qp, primary] of ctx.primaryByQuotePart.entries()) {
      const info = rowInfo.get(primary) || { lineNumber: null, partNo: utils.get(primary, "PartNo", { trim: true }) ?? "" };
      qpkToPrimaryInfo.set(qp, info);
    }
    const sortByLine = /* @__PURE__ */ new Map();
    for (let i = 0; i < ctx.rows.length; i++) {
      const row = ctx.rows[i];
      const lineNumber = i + 1;
      const sortOrder = utils.get(row, "SortOrder", { number: true });
      sortByLine.set(lineNumber, sortOrder);
    }
    const issues = issuesRaw.map((iss) => {
      const qpk = iss.quotePartKey ?? -1;
      const info = qpkToPrimaryInfo.get(qpk) || { lineNumber: null, partNo: "" };
      return {
        ...iss,
        lineNumber: info.lineNumber,
        partNo: info.partNo,
        ruleLabel: ruleLabelFrom(iss),
        sortOrder: sortByLine.get(info.lineNumber ?? -1)
      };
    });
    TMUtils2.state = TMUtils2.state || {};
    TMUtils2.state.lastValidation = { at: Date.now(), ok, issues };
    return { ok, issues };
  }
  var init_engine = __esm({
    "src/quote-tracking/qt50-validation/engine.js"() {
      init_rules();
    }
  });

  // src/quote-tracking/qt50-validation/qtv.entry.js
  init_index();

  // src/quote-tracking/qt50-validation/injectButton.js
  init_engine();
  init_index();
  var KO2 = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
  function buildIssuesSummary(issues) {
    try {
      const items = Array.isArray(issues) ? issues : [];
      const agg = items.reduce((acc, it) => {
        const lvl = String(it?.level || "info").toLowerCase();
        acc[lvl] = (acc[lvl] || 0) + 1;
        if (it?.quotePartKey != null) acc.parts.add(it.quotePartKey);
        return acc;
      }, { error: 0, warning: 0, info: 0, parts: /* @__PURE__ */ new Set() });
      const partsCount = agg.parts.size;
      const segs = [];
      if (agg.error) segs.push(`${agg.error} error${agg.error === 1 ? "" : "s"}`);
      if (agg.warning) segs.push(`${agg.warning} warning${agg.warning === 1 ? "" : "s"}`);
      if (agg.info) segs.push(`${agg.info} info`);
      const levelPart = segs.join(", ") || "updates";
      return `${levelPart} across ${partsCount || 0} part${partsCount === 1 ? "" : "s"}`;
    } catch {
      return "";
    }
  }
  async function refreshQuoteGrid() {
    try {
      const gridEl = document.querySelector(".plex-grid");
      const gridVM = gridEl && KO2?.dataFor?.(gridEl);
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
      const wiz = unsafeWindow?.plex?.currentPage?.QuoteWizard;
      if (wiz?.navigatePage) {
        const active = typeof wiz.activePage === "function" ? wiz.activePage() : wiz.activePage;
        wiz.navigatePage(active);
        return "wiz.navigatePage";
      }
    } catch {
    }
    return null;
  }
  var HUB_BTN_ID = "qt50-validate";
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
  function showValidationModal(issues = []) {
    ensureValidationStyles();
    const overlay = document.createElement("div");
    overlay.id = "qtv-modal-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: 0,
      background: "var(--lt-overlay, rgba(0,0,0,.36))",
      zIndex: 100002
    });
    const modal = document.createElement("div");
    modal.id = "qtv-modal";
    modal.className = "lt-card";
    Object.assign(modal.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: "min(900px, 92vw)"
    });
    const sorted = [...issues].sort((a, b) => {
      const soA = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const soB = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (soA !== soB) return soA - soB;
      const pnA = String(a.partNo ?? "");
      const pnB = String(b.partNo ?? "");
      if (pnA !== pnB) return pnA.localeCompare(pnB);
      const rlA = String(a.ruleLabel ?? a.kind ?? "");
      const rlB = String(b.ruleLabel ?? b.kind ?? "");
      return rlA.localeCompare(rlB);
    });
    let prevSort = null, prevPart = null, prevRule = null;
    const rowsHtml = sorted.map((iss) => {
      const lvl = (iss.level || "").toLowerCase();
      const lvlClass = lvl === "error" ? "qtv-pill--error" : lvl === "warn" || lvl === "warning" ? "qtv-pill--warn" : "qtv-pill--info";
      const lvlPill = `<span class="qtv-pill ${lvlClass}">${lvl || "info"}</span>`;
      const reason = iss.message || "(no message)";
      const rule = String(iss.ruleLabel || iss.kind || "Validation");
      const showSort = iss.sortOrder !== prevSort ? iss.sortOrder ?? "" : "";
      const showPart = showSort !== "" || iss.partNo !== prevPart ? iss.partNo ?? "" : "";
      const sameGroupAsPrev = showSort === "" && showPart === "";
      const showRule = !sameGroupAsPrev || rule !== prevRule ? rule : "";
      prevSort = iss.sortOrder;
      prevPart = iss.partNo;
      prevRule = rule;
      return `
  <tr data-qpk="${iss.quotePartKey ?? ""}" data-rule="${String(iss.kind || "")}">
    <td>${showSort}</td>
    <td>${showPart}</td>
    <td>${showRule}</td>
    <td>${lvlPill}</td>
    <td>${reason}</td>
  </tr>`;
    }).join("");
    modal.innerHTML = `
  <div class="qtv-hd lt-card__header">
    <h3 class="lt-card__title">Validation Details</h3>
    <div class="qtv-actions lt-card__spacer">
      <button class="lt-btn lt-btn--ghost" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="lt-btn lt-btn--primary" id="qtv-close">Close</button>
    </div>
  </div>
  <div class="qtv-bd lt-card__body">
    <table class="lt-table" aria-label="Validation Issues">
      <thead>
        <tr>
          <th>Sort&nbsp;Order</th>
          <th>Part #</th>
          <th>Rule</th>
          <th>Level</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || `<tr><td colspan="5" style="opacity:.7; padding:12px;">No issues.</td></tr>`}</tbody>
    </table>
  </div>
`;
    modal.querySelector("#qtv-close")?.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    modal.querySelector("tbody")?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      const qpk = tr.getAttribute("data-qpk");
      if (!qpk) return;
      ensureValidationStyles();
      const row = findGridRowByQuotePartKey(qpk);
      if (row) {
        document.querySelectorAll(".qtv-row-fail").forEach((el) => el.classList.remove("qtv-row-fail"));
        row.classList.add("qtv-row-fail");
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    modal.querySelector("#qtv-export-csv")?.addEventListener("click", () => {
      const csv = [
        ["Line", "SortOrder", "PartNo", "QuotePartKey", "Rule", "Level", "Reason"].join(","),
        ...issues.map((i) => {
          const esc = (v) => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          return [
            i.lineNumber ?? "",
            i.sortOrder ?? "",
            i.partNo ?? "",
            i.quotePartKey ?? "",
            i.ruleLabel || i.kind || "Validation",
            i.level || "",
            i.message || ""
          ].map(esc).join(",");
        })
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qt-validation-issues.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    overlay.appendChild(modal);
    (document.body || document.documentElement).appendChild(overlay);
    try {
      overlay.setAttribute("tabindex", "-1");
      overlay.focus();
    } catch {
    }
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
    });
  }
  async function mountValidationButton(TMUtils2) {
    const hub = await getHub({ mount: "nav" });
    if (!hub?.registerButton) return () => {
    };
    if (hub.list?.()?.includes(HUB_BTN_ID)) return () => {
    };
    let btnEl = null;
    hub.registerButton("left", {
      id: HUB_BTN_ID,
      label: "Validate Lines",
      title: "Validate quote line rules",
      weight: 130,
      onClick: async () => {
        const settings = getSettings?.() || {};
        const task = lt.core.hub.beginTask?.("Validating\u2026", "info") || { done() {
        }, error() {
        } };
        try {
          clearValidationHighlights();
          ensureValidationStyles();
          const res = await runValidation(TMUtils2, settings);
          const issues = Array.isArray(res?.issues) ? res.issues : [];
          const count = issues.length;
          try {
            for (const iss of issues) {
              const qpk = iss?.quotePartKey;
              if (!qpk) continue;
              const row = findGridRowByQuotePartKey(qpk);
              if (!row) continue;
              const base = "qtv-row-fail";
              const cls = classForIssue(iss);
              row.classList.add(base);
              if (cls) row.classList.add(cls);
            }
          } catch {
          }
          if (count === 0) {
            lt.core.hub.notify?.("\u2705 Lines valid", "success", { ms: 1800 });
            lt.core.hub.setStatus?.("\u2705 All clear", "success", { sticky: false });
            setBadgeCount?.(0);
            task.done?.("Valid");
          } else {
            const levels = issues.map((i) => String(i?.level || "").toLowerCase());
            const hasError = levels.some((l) => l === "error" || l === "fail" || l === "critical") || issues.some((i) => /price\.(?:maxunitprice|minunitprice)/i.test(String(i?.kind || "")));
            const hasWarn = !hasError && levels.some((l) => l === "warn" || l === "warning");
            const summary = buildIssuesSummary(issues);
            try {
              if (hasError) {
                lt.core.hub.notify?.(`\u274C ${count} validation ${count === 1 ? "issue" : "issues"}`, "error", { ms: 6500 });
                lt.core.hub.setStatus?.(`\u274C ${count} issue${count === 1 ? "" : "s"} \u2014 ${summary}`, "error", { sticky: true });
                setBadgeCount?.(count);
              } else if (hasWarn) {
                lt.core.hub.notify?.(`\u26A0\uFE0F ${count} validation ${count === 1 ? "warning" : "warnings"}`, "warn", { ms: 5e3 });
                lt.core.hub.setStatus?.(`\u26A0\uFE0F ${count} warning${count === 1 ? "" : "s"} \u2014 ${summary}`, "warn", { sticky: true });
                setBadgeCount?.(count);
              } else {
                lt.core.hub.notify?.(`\u2139\uFE0F ${count} update${count === 1 ? "" : "s"} applied`, "info", { ms: 3500 });
                lt.core.hub.setStatus?.(`\u2139\uFE0F ${count} update${count === 1 ? "" : "s"} \u2014 ${summary}`, "info", { sticky: true });
                setBadgeCount?.(count);
              }
            } catch {
            }
            showValidationModal(issues);
            const needsRefresh = issues.some(
              (i) => String(i?.kind || "").includes("autoManageLtPartNoOnQuote") && String(i?.level || "").toLowerCase() === "warning" && i?.meta?.changed === true
            );
            if (needsRefresh) {
              try {
                const mode = await refreshQuoteGrid();
                lt.core?.hub?.notify?.(
                  mode ? `Grid refreshed (${mode})` : "Grid refresh attempted (reload may be needed)",
                  mode ? "success" : "info",
                  { ms: 2500 }
                );
              } catch {
                lt.core?.hub?.notify?.("Grid refresh failed", "warn", { ms: 3e3 });
              }
            }
            task.done?.("Checked");
          }
          TMUtils2.state = TMUtils2.state || {};
          TMUtils2.state.lastValidation = res;
        } catch (err) {
          lt.core.hub.error?.(`Validation error: ${err?.message || err}`, "error", { ms: 6e3 });
          task.error?.("Error");
        }
      }
    });
    btnEl = hub._shadow?.querySelector?.(`[data-id="${HUB_BTN_ID}"]`);
    const offSettings = onSettingsChange?.(() => refreshLabel(btnEl));
    refreshLabel(btnEl);
    return () => {
      offSettings?.();
      hub?.remove?.(HUB_BTN_ID);
    };
  }
  function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    if (s.minUnitPrice != null) parts.push(`\u2265${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`\u2264${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(", ") || "none"}`;
  }
  function ensureValidationStyles() {
    const hasThemeQtv = (() => {
      try {
        const test = document.createElement("div");
        test.className = "qtv-pill";
        document.body.appendChild(test);
        const cs = getComputedStyle(test);
        const ok = !!cs && (cs.borderRadius || "").includes("999px");
        test.remove();
        return ok;
      } catch {
        return false;
      }
    })();
    if (hasThemeQtv) return;
    if (document.getElementById("qtv-styles")) return;
    const style = document.createElement("style");
    style.id = "qtv-styles";
    style.textContent = `
/* Minimal scaffolding when theme.css isn't ready */
#qtv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.36); z-index: 100002; }
#qtv-modal {
  /* Local Monroe palette (independent of page tokens) */
  --brand-600: #8b0b04;
  --brand-700: #5c0a0a;
  --ok: #28a745;
  --warn: #ffc107;
  --err: #dc3545;

  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(900px,92vw);
}

.lt-card { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.30); overflow: hidden; }
.lt-card__header { display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,.08); }
.lt-card__title { margin: 0; font: 600 16px/1.2 system-ui, Segoe UI, sans-serif; }
.lt-card__spacer { margin-left: auto; }
.lt-card__body { padding: 12px 16px; max-height: min(70vh,680px); overflow: auto; }

.lt-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; cursor:pointer; }
.lt-btn--primary { background: var(--brand-600); border-color: color-mix(in srgb, var(--brand-600) 70%, black); color:#fff; }
.lt-btn--primary:hover { background: var(--brand-700); }
.lt-btn--ghost { background:transparent; color: var(--brand-600); border-color: var(--brand-600); }
.lt-btn--ghost:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }

.lt-table { width:100%; border-collapse: separate; border-spacing: 0; font: 400 13px/1.35 system-ui, Segoe UI, sans-serif; }
.lt-table th { text-align:left; padding:8px 10px; background:#f3f4f6; border-bottom:1px solid #e5e7eb; position:sticky; top:0; }
.lt-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
.lt-table tbody tr:hover { background:#f8fafc; }

.qtv-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-weight:600; font-size:12px; border:1px solid transparent; }
.qtv-pill--error { background:#dc2626; color:#fff; }
.qtv-pill--warn  { background:#f59e0b; color:#111; }
.qtv-pill--info  { background:#3b82f6; color:#fff; }

/* Row highlights */
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }
`;
    document.head.appendChild(style);
  }
  function getObsVal(vm, prop) {
    try {
      const v = vm?.[prop];
      return typeof v === "function" ? v() : v;
    } catch {
      return void 0;
    }
  }
  function ensureRowKeyAttributes() {
    const grid = document.querySelector(".plex-grid");
    if (!grid) return 0;
    const rows = grid.querySelectorAll(
      "tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"
    );
    let tagged = 0;
    for (const r of rows) {
      if (r.hasAttribute("data-quote-part-key")) {
        tagged++;
        continue;
      }
      try {
        const ctx = KO2?.contextFor?.(r);
        const rowVM = ctx?.$data ?? ctx?.$root ?? null;
        const qpk = typeof TMUtils?.getObsValue === "function" ? TMUtils.getObsValue(rowVM, "QuotePartKey") : getObsVal(rowVM, "QuotePartKey");
        if (qpk != null && qpk !== "" && Number(qpk) > 0) {
          r.setAttribute("data-quote-part-key", String(qpk));
          tagged++;
        }
      } catch {
      }
    }
    return tagged;
  }
  function clearValidationHighlights() {
    document.querySelectorAll(".qtv-row-fail").forEach((el) => {
      el.classList.remove("qtv-row-fail");
      el.classList.remove("qtv-row-fail--price-maxunit");
      el.classList.remove("qtv-row-fail--price-minunit");
    });
  }
  function findGridRowByQuotePartKey(qpk) {
    const grid = document.querySelector(".plex-grid");
    if (!grid) return null;
    let row = grid.querySelector(`[data-quote-part-key="${CSS.escape(String(qpk))}"]`);
    if (row) return row.closest("tr, .k-grid-content tr, .plex-grid-row") || row;
    if (ensureRowKeyAttributes() > 0) {
      row = grid.querySelector(`[data-quote-part-key="${CSS.escape(String(qpk))}"]`);
      if (row) return row.closest("tr, .k-grid-content tr, .plex-grid-row") || row;
    }
    const rows = grid.querySelectorAll(
      "tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"
    );
    for (const r of rows) {
      const txt = (r.textContent || "").trim();
      if (txt.includes(String(qpk))) return r;
    }
    return null;
  }
  function classForIssue(iss) {
    const kind = String(iss?.kind || "").toLowerCase();
    if (kind.includes("price.maxunitprice")) return "qtv-row-fail--price-maxunit";
    if (kind.includes("price.minunitprice")) return "qtv-row-fail--price-minunit";
    return "";
  }
  var DEV2 = true ? true : true;
  if (DEV2) {
    (unsafeWindow || window).QTV_DEBUG = (unsafeWindow || window).QTV_DEBUG || {};
    (unsafeWindow || window).QTV_DEBUG.tagStats = () => {
      const grid = document.querySelector(".plex-grid");
      const rows = grid ? grid.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row") : [];
      const tagged = grid ? grid.querySelectorAll("[data-quote-part-key]") : [];
      console.log("[QTV] rows:", rows.length, "tagged:", tagged.length);
      return { total: rows.length, tagged: tagged.length };
    };
    (unsafeWindow || window).QTV_DEBUG.hiliTest = (qpk) => {
      ensureValidationStyles();
      const r = findGridRowByQuotePartKey(qpk);
      if (r) {
        r.classList.add("qtv-row-fail", "qtv-row-fail--price-maxunit");
        r.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return !!r;
    };
  }

  // src/quote-tracking/qt50-validation/qtv.entry.js
  var DEV3 = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  if (true) {
    let getGridVM = function() {
      const grid = document.querySelector(".plex-grid");
      return grid ? KO3?.dataFor?.(grid) || null : null;
    }, getGridRows = function() {
      const gvm = getGridVM();
      return gvm?.datasource?.raw || gvm?.datasource?.data || [];
    }, plainRow = function(r) {
      const gv = (p, opts) => TMUtils.getObsValue(r, p, opts);
      return {
        QuotePartKey: gv("QuotePartKey"),
        PartNo: gv("PartNo", { trim: true }),
        PartStatus: gv("PartStatus", { trim: true }),
        Quantity: gv("Quantity"),
        UnitPrice: gv("UnitPrice"),
        RvUnitPriceCopy: gv("RvUnitPriceCopy"),
        RvCustomizedUnitPrice: gv("RvCustomizedUnitPrice"),
        IsUniqueQuotePart: gv("IsUniqueQuotePart")
      };
    }, toCSV = function(objs) {
      if (!objs?.length) return "";
      const cols = Object.keys(objs[0]);
      const esc = (v) => v == null ? "" : String(v).includes(",") || String(v).includes('"') || String(v).includes("\n") ? `"${String(v).replace(/"/g, '""')}"` : String(v);
      const head = cols.join(",");
      const body = objs.map((o) => cols.map((c) => esc(o[c])).join(",")).join("\n");
      return head + "\n" + body;
    }, download = function(name, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2e3);
    };
    const KO3 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    unsafeWindow.QTV_DEBUG = {
      // Settings helpers
      settings: () => ({
        enabled: GM_getValue("qtv.enabled"),
        autoManageLtPartNoOnQuote: GM_getValue("qtv.autoManageLtPartNoOnQuote"),
        minUnitPrice: GM_getValue("qtv.minUnitPrice"),
        maxUnitPrice: GM_getValue("qtv.maxUnitPrice")
      }),
      getValue: (key) => GM_getValue(key),
      setValue: (key, val) => GM_setValue(key, val),
      // Grid exporters
      grid: ({ plain = true } = {}) => {
        const rows = getGridRows();
        return plain ? rows.map(plainRow) : rows;
      },
      gridTable: () => console.table?.(unsafeWindow.QTV_DEBUG.grid({ plain: true })),
      // CSV/JSON downloaders
      downloadGridJSON: (filename = "qt-grid.json") => {
        const data = JSON.stringify(unsafeWindow.QTV_DEBUG.grid({ plain: true }), null, 2);
        download(filename, new Blob([data], { type: "application/json" }));
      },
      downloadGridCSV: (filename = "qt-grid.csv") => {
        const csv = toCSV(unsafeWindow.QTV_DEBUG.grid({ plain: true }));
        download(filename, new Blob([csv], { type: "text/csv" }));
      },
      // Validation on-demand (same engine as the button)
      validateNow: async () => {
        const { runValidation: runValidation2 } = await Promise.resolve().then(() => (init_engine(), engine_exports));
        const { getSettings: getSettings2 } = await Promise.resolve().then(() => (init_index(), index_exports));
        const res = await runValidation2(TMUtils, getSettings2());
        console.table?.(res.issues || []);
        return res;
      },
      // Quick expectation helper: “show me rows above max”
      expectUnderMax: (max) => {
        const set = Number(max);
        const rows = unsafeWindow.QTV_DEBUG.grid({ plain: true });
        const toNum = (v) => {
          if (v == null) return NaN;
          const s = String(v).trim();
          return Number(s.replace(/[^\d.-]/g, ""));
        };
        return rows.map((r) => ({ ...r, _UnitNum: toNum(r.RvCustomizedUnitPrice ?? r.RvUnitPriceCopy ?? r.UnitPrice) })).filter((r) => Number.isFinite(r._UnitNum) && r._UnitNum > set).map(({ _UnitNum, ...r }) => r);
      },
      underMin: (min) => {
        const set = Number(min);
        const rows = unsafeWindow.QTV_DEBUG.grid({ plain: true });
        const toNum = (v) => {
          if (v == null) return NaN;
          const s = String(v).trim();
          return Number(s.replace(/[^\d.-]/g, ""));
        };
        return rows.map((r) => ({ ...r, _UnitNum: toNum(r.RvCustomizedUnitPrice ?? r.RvUnitPriceCopy ?? r.UnitPrice) })).filter((r) => Number.isFinite(r._UnitNum) && r._UnitNum < set).map(({ _UnitNum, ...r }) => r);
      }
    };
  }
  TMUtils?.net?.ensureWatcher?.();
  var ROUTES2 = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
  var unmountBtn = null;
  function isWizard() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES2);
    return ROUTES2.some((re) => re.test(location.pathname));
  }
  function getActiveWizardPageName() {
    const li = document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]');
    return (li?.textContent || "").trim().replace(/\s+/g, " ");
  }
  function isOnTargetWizardPage() {
    return /^part\s*summary$/i.test(getActiveWizardPageName());
  }
  async function reconcile() {
    if (!isWizard()) return unmount();
    if (isOnTargetWizardPage()) {
      if (!unmountBtn) unmountBtn = await mountValidationButton(TMUtils);
    } else {
      unmount();
    }
  }
  function unmount() {
    if (unmountBtn) {
      unmountBtn();
      unmountBtn = null;
    }
  }
  reconcile();
  TMUtils?.onUrlChange?.(reconcile);
  window.addEventListener("hashchange", reconcile);
  var nav = document.querySelector(".plex-wizard-page-list");
  if (nav) new MutationObserver(reconcile).observe(nav, { subtree: true, attributes: true, childList: true });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL21heFVuaXRQcmljZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvaW5kZXguanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcXR2LmVudHJ5LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9pbmplY3RCdXR0b24uanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2luZGV4LmpzXG4vLyAtLS0tLS0tLS0tIEJvb3RzdHJhcCAvIHJvdXRlIGd1YXJkIC0tLS0tLS0tLS1cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuY29uc3QgQ09ORklHID0ge1xuICAgIHdpemFyZFRhcmdldFBhZ2U6ICdQYXJ0IFN1bW1hcnknLFxuICAgIHNldHRpbmdzS2V5OiAncXQ1MF9zZXR0aW5nc192MScsXG4gICAgdG9hc3RNczogMzUwMFxufTtcblxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG5cbi8vIEluc3RlYWQgb2YgYHJldHVybmAgYXQgdG9wLWxldmVsLCBjb21wdXRlIGEgZmxhZzpcbmNvbnN0IE9OX1JPVVRFID0gISFUTVV0aWxzLm1hdGNoUm91dGU/LihST1VURVMpO1xuaWYgKERFViAmJiAhT05fUk9VVEUpIGNvbnNvbGUuZGVidWcoJ1FUNTA6IHdyb25nIHJvdXRlLCBza2lwcGluZyBib290c3RyYXAnKTtcblxuLyogZ2xvYmFsIEdNX2dldFZhbHVlLCBHTV9zZXRWYWx1ZSwgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCwgVE1VdGlscywgdW5zYWZlV2luZG93ICovXG5leHBvcnQgY29uc3QgS0VZUyA9IHtcbiAgICBlbmFibGVkOiAncXQ1MC5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXQ1MC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdDUwLm1pblVuaXRQcmljZScsXG4gICAgbWF4VW5pdFByaWNlOiAncXQ1MC5tYXhVbml0UHJpY2UnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxufTtcblxuY29uc3QgREVGID0ge1xuICAgIFtLRVlTLmVuYWJsZWRdOiB0cnVlLFxuICAgIFtLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGVdOiB0cnVlLFxuICAgIFtLRVlTLm1pblVuaXRQcmljZV06IDAsXG4gICAgW0tFWVMubWF4VW5pdFByaWNlXTogMTAsXG59O1xuZnVuY3Rpb24gcmVhZE9yTGVnYWN5KGspIHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoayk7XG4gICAgaWYgKHYgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHY7XG4gICAgLy8gb25lLXRpbWUgbGVnYWN5IHJlYWRcbiAgICBjb25zdCBsZWdhY3lLZXkgPSBPYmplY3QudmFsdWVzKExFR0FDWV9LRVlTKS5maW5kKGxrID0+IGxrLmVuZHNXaXRoKGsuc3BsaXQoJy4nKS5wb3AoKSkpO1xuICAgIGNvbnN0IGx2ID0gbGVnYWN5S2V5ID8gR01fZ2V0VmFsdWUobGVnYWN5S2V5KSA6IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gKGx2ICE9PSB1bmRlZmluZWQpID8gbHYgOiB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IGdldFZhbCA9IGsgPT4ge1xuICAgIGNvbnN0IHYgPSByZWFkT3JMZWdhY3koayk7XG4gICAgcmV0dXJuICh2ID09PSB1bmRlZmluZWQgPyBERUZba10gOiB2KTtcbn07XG5jb25zdCBzZXRWYWwgPSAoaywgdikgPT4geyBHTV9zZXRWYWx1ZShrLCB2KTsgZW1pdENoYW5nZWQoKTsgfTtcblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwYW5lbC5pZCA9ICdsdC1xdHYtcGFuZWwnO1xuICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdsdC1jYXJkIGx0LW1vZGFsJztcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJzUyMHB4JyxcbiAgICAgICAgbWF4V2lkdGg6ICdtaW4oOTJ2dywgNTYwcHgpJ1xuICAgIH0pO1xuXG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBvbWl0dGVkIEx5bi1Ucm9uIFBhcnQgTm8uXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjoxMnB4IDAgMTBweDtcIj48L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBmbGV4LXdyYXA6d3JhcDtcIj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtZXhwb3J0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1pbXBvcnQtYnRuXCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS13YXJuXCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcblxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHNhdmVkLicsICdzdWNjZXNzJywgMTYwMCk7XG4gICAgfSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LXJlc2V0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTtcbiAgICAgICAgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWltcG9ydC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBlbnN1cmVTZXR0aW5nc1N0eWxlcygpOyAvLyBORVc6IGZhbGxiYWNrIHN0eWxlcyBpZiB0aGVtZS5jc3MgaXNuXHUyMDE5dCByZWFkeVxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBGb2N1cyBBRlRFUiBhcHBlbmRpbmcgc28gRVNDIHdvcmtzIGltbWVkaWF0ZWx5XG4gICAgb3ZlcmxheS5mb2N1cygpO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVyT3JOdWxsKHMpIHsgY29uc3QgdiA9IE51bWJlcihTdHJpbmcocykudHJpbSgpKTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2KSA/IHYgOiBudWxsOyB9XG5mdW5jdGlvbiB0b051bGxPck51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDsgfVxuZnVuY3Rpb24gc2V0TnVtYmVyT3JCbGFuayhpbnB1dCwgdmFsKSB7IGlucHV0LnZhbHVlID0gKHZhbCA9PSBudWxsID8gJycgOiBTdHJpbmcodmFsKSk7IH1cblxuLyogTkVXOiBtaW5pbWFsIGZhbGxiYWNrIHN0eWxlcyBmb3IgdGhlIHNldHRpbmdzIHBhbmVsICovXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHMuaWQgPSAnbHQtcXR2LXBhbmVsLXN0eWxlcyc7XG4gICAgcy50ZXh0Q29udGVudCA9IGBcbiNsdC1xdHYtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jbHQtcXR2LXBhbmVsLmx0LWNhcmQge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7XG4gIG92ZXJmbG93OiBoaWRkZW47IHBhZGRpbmc6IDE2cHg7XG59XG4jbHQtcXR2LXBhbmVsIGgzIHsgbWFyZ2luOiAwIDAgMTBweCAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLFxuI2x0LXF0di1wYW5lbCBsYWJlbC5sdC1idG4ge1xuICBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7XG4gIGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7XG59XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLWdob3N0ICAgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXdhcm4gICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJuKTsgY29sb3I6IzExMTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0td2FybikgNTAlLCBibGFjayk7IH1cbiNsdC1xdHYtcGFuZWwgLmx0LWJ0bi0tZXJyb3IgICB7IGJhY2tncm91bmQ6IHZhcigtLWVycik7ICBjb2xvcjojZmZmOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1lcnIpIDcwJSwgYmxhY2spOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLW9rICAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1vayk7ICAgY29sb3I6I2ZmZjsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tb2spIDcwJSwgYmxhY2spOyB9XG5cbiNsdC1xdHYtcGFuZWwgaW5wdXRbdHlwZT1cIm51bWJlclwiXSwgI2x0LXF0di1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXSB7XG4gIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiA2cHggOHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOiA2cHg7IGJhY2tncm91bmQ6ICNmZmY7XG59XG4gIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzKTtcbn1cblxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxuLy8gV2hlbiBQYXJ0U3RhdHVzID09PSBcIlF1b3RlXCIsIFBPU1QgdG8gRFMgMTM1MDkgdXNpbmcgdGhlIFFUMzUgcGF0dGVybjpcbi8vICAgUXVvdGVfS2V5ID0gdm1RdW90ZUtleVxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcbi8vICAgUGFydF9ObyAgID0gUXVvdGVfTm8gfHwgXCJfXCIgfHwgdm1QYXJ0Tm8gICAoUXVvdGVfTm8gcmVzb2x2ZWQgdmlhIGx0LmNvcmUgUVRGOyBzZXNzaW9uIGZhbGxiYWNrKVxuLy8gICBOb3RlICAgICAgPSBcImF1dG8gbWFuYWdlZFwiXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGlmICghc2V0dGluZ3M/LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpIHJldHVybiBpc3N1ZXM7XG5cbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBsdCA9IChST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIFFURiAoZmxhdCByZXBvKSBsaWtlIFFUMzVcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXG4gICAgICAgIDogbnVsbDtcblxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xuICAgIGNvbnN0IERTX01BTkFHRV9QQVJUTk8gPSAxMzUwOTsgIC8vIHlvdXIgdGFyZ2V0IERTIHRvIHBvc3QgUGFydF9Ob1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgUk9PVC5nZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgPyBhd2FpdCBST09ULmdldFBsZXhGYWNhZGUoKVxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXgpIHRocm93IG5ldyBFcnJvcignUGxleCBmYWNhZGUgbm90IGF2YWlsYWJsZScpO1xuICAgICAgICByZXR1cm4gcGxleDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0byBzZXNzaW9uIHN0b3JhZ2UgaWYgUVRGL3BsZXggaHlkcmF0aW9uIG5vdCByZWFkeVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIChzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdRdW90ZV9ObycpIHx8ICcnKS50cmltKCk7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIFF1b3RlX05vIGZvciBhIGdpdmVuIFF1b3RlS2V5IHVzaW5nIFFURjsgaHlkcmF0ZSBvbmNlIGZyb20gRFMgaWYgbmVlZGVkLlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFF1b3RlTm9Gb3JRdW90ZUtleShxaykge1xuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcbiAgICAgICAgaWYgKCFxS2V5IHx8ICFOdW1iZXIuaXNGaW5pdGUocUtleSkgfHwgcUtleSA8PSAwKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XG5cbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgaWYgKCFoZWFkPy5RdW90ZV9Obykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFLZXkpIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoID8gcm93c1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1b3RlTm8gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBxS2V5LCBRdW90ZV9ObzogcXVvdGVObywgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcW4gPSBoZWFkPy5RdW90ZV9ObztcbiAgICAgICAgICAgIHJldHVybiAocW4gPT0gbnVsbCA/IGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIDogU3RyaW5nKHFuKS50cmltKCkpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgUXVvdGVQYXJ0IGdyb3VwcywgcmVzb2x2ZSBRdW90ZV9ObyBvbmNlIHBlciBncm91cCwgdGhlbiBwb3N0IHBlci1yb3cgd2hlbiBzdGF0dXMgPT09ICdRdW90ZSdcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGFueSA9IEFycmF5LmlzQXJyYXkoZ3JvdXApICYmIGdyb3VwLmxlbmd0aCA/IGdyb3VwWzBdIDogbnVsbDtcbiAgICAgICAgY29uc3QgZ3JvdXBRdW90ZUtleSA9IHV0aWxzLmdldChhbnksICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgIGNvbnN0IHJlc29sdmVkUXVvdGVObyA9IGF3YWl0IGdldFF1b3RlTm9Gb3JRdW90ZUtleShncm91cFF1b3RlS2V5KTtcblxuICAgICAgICAvLyBQcm9jZXNzIGVhY2ggdW5pcXVlIFBhcnRLZXkgZXhhY3RseSBvbmNlXG4gICAgICAgIGNvbnN0IHVuaXFCeVBhcnRLZXkgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBwayA9IHV0aWxzLmdldChyb3csICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHBrKSAmJiAhdW5pcUJ5UGFydEtleS5oYXMocGspKSB7XG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdW5pcUJ5UGFydEtleS52YWx1ZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB2bVF1b3RlS2V5ID0gZ3JvdXBRdW90ZUtleSA/PyB1dGlscy5nZXQociwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcblxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxuICAgICAgICAgICAgLy8gICBJZiBub3QsIGRlc2lyZWQgcHJlZml4IGlzIFwiX1wiIChwZXIgb3JpZ2luYWwgc3BlYykuXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlNYW5hZ2VkID0gdm1QYXJ0Tm8uc3RhcnRzV2l0aChkZXNpcmVkUHJlZml4KTtcblxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxuICAgICAgICAgICAgaWYgKGFscmVhZHlNYW5hZ2VkKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCB0aGUgZGVzaXJlZCBQYXJ0X05vIGp1c3Qgb25jZSAoYXZvaWQgZG91YmxlLXByZWZpeGluZyBvbiBzdWJzZXF1ZW50IHJ1bnMpXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxuICAgICAgICAgICAgICAgIFBhcnRfTm86IFN0cmluZyhwYXJ0Tm9Gb3JQb3N0ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBRVDM1LXN0eWxlIERTIGNhbGwgd2l0aCBhdXRoIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiB0cnVlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcbmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUubWV0YSA9IHsgaWQ6ICdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJywgbGFiZWw6ICdBdXRvLU1hbmFnZSBMVCBQYXJ0IE5vJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbWluVW5pdFByaWNlXG4vLyBQdXJwb3NlOiBFcnJvciB3aGVuIHRoZSBlZmZlY3RpdmUgdW5pdCBwcmljZSBpcyBiZWxvdyB0aGUgY29uZmlndXJlZCBtaW5pbXVtLlxuLy8gUmVhZHMgZnJvbSBzZXR0aW5ncy5taW5Vbml0UHJpY2UgKG51bGxhYmxlKS5cbi8vIFByZWNlZGVuY2UgZm9yIHVuaXQgcHJpY2UgZmllbGRzOlxuLy8gICBSdkN1c3RvbWl6ZWRVbml0UHJpY2UgPiBSdlVuaXRQcmljZUNvcHkgPiBVbml0UHJpY2Vcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWluVW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgY29uc3QgbWluID0gTnVtYmVyKHNldHRpbmdzLm1pblVuaXRQcmljZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWluKSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xuICAgICAgICAgICAgY29uc3QgcmF3ID1cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XG5cbiAgICAgICAgICAgIC8vIERlY2lkZSBjdXJyZW5jeTogaW5mZXIgZnJvbSByYXcgb3IgdXNlIHNldHRpbmdzLmN1cnJlbmN5Q29kZSAoZGVmYXVsdCBVU0QpXG4gICAgICAgICAgICBjb25zdCBpbmZlckN1cnJlbmN5ID0gKHJhd1ZhbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHJhd1ZhbCA9PT0gJ2Z1bmN0aW9uJyA/IHJhd1ZhbCgpIDogcmF3VmFsIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoL1xcJC8udGVzdChzKSkgcmV0dXJuICdVU0QnO1xuICAgICAgICAgICAgICAgIGlmICgvXHUyMEFDLy50ZXN0KHMpKSByZXR1cm4gJ0VVUic7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTAwQTMvLnRlc3QocykpIHJldHVybiAnR0JQJztcbiAgICAgICAgICAgICAgICByZXR1cm4gc2V0dGluZ3M/LmN1cnJlbmN5Q29kZSB8fCAnVVNEJztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbmN5ID0gaW5mZXJDdXJyZW5jeShyYXcpO1xuICAgICAgICAgICAgY29uc3QgbW9uZXlGbXQgPSBuZXcgSW50bC5OdW1iZXJGb3JtYXQoJ2VuLVVTJywgeyBzdHlsZTogJ2N1cnJlbmN5JywgY3VycmVuY3ksIG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcbiAgICAgICAgICAgIGNvbnN0IG51bUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdE1vbmV5ID0gKG4pID0+IE51bWJlci5pc0Zpbml0ZShuKSA/IG1vbmV5Rm10LmZvcm1hdChuKSA6IFN0cmluZyhuKTtcblxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1pblVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9IDwgTWluICR7Zm10TW9uZXkobWluKX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtaW4sIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcblxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgLy8gRGVjaWRlIGN1cnJlbmN5OiBpbmZlciBmcm9tIHJhdyBvciB1c2Ugc2V0dGluZ3MuY3VycmVuY3lDb2RlIChkZWZhdWx0IFVTRClcbiAgICAgICAgICAgIGNvbnN0IGluZmVyQ3VycmVuY3kgPSAocmF3VmFsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgcmF3VmFsID09PSAnZnVuY3Rpb24nID8gcmF3VmFsKCkgOiAocmF3VmFsID8/ICcnKSkudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICgvXFwkLy50ZXN0KHMpKSByZXR1cm4gJ1VTRCc7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTIwQUMvLnRlc3QocykpIHJldHVybiAnRVVSJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MDBBMy8udGVzdChzKSkgcmV0dXJuICdHQlAnO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZXR0aW5ncz8uY3VycmVuY3lDb2RlIHx8ICdVU0QnO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY3VycmVuY3kgPSBpbmZlckN1cnJlbmN5KHJhdyk7XG4gICAgICAgICAgICBjb25zdCBtb25leUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IHN0eWxlOiAnY3VycmVuY3knLCBjdXJyZW5jeSwgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID4gbWF4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm10TW9uZXkgPSAobikgPT4gTnVtYmVyLmlzRmluaXRlKG4pID8gbW9uZXlGbXQuZm9ybWF0KG4pIDogU3RyaW5nKG4pO1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1heFVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9ID4gTWF4ICR7Zm10TW9uZXkobWF4KX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtYXgsIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XG4vL2ltcG9ydCBmb3JiaWRaZXJvUHJpY2UgZnJvbSAnLi9mb3JiaWRaZXJvUHJpY2UnO1xuaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcblxuZXhwb3J0IGRlZmF1bHQgW2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgIC8vcmVxdWlyZVJlc29sdmVkUGFydCwgZm9yYmlkWmVyb1ByaWNlLCBcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcbmltcG9ydCBydWxlcyBmcm9tICcuL3J1bGVzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcbiAgICBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1ncmlkJywgeyByZXF1aXJlS286IHRydWUsIHRpbWVvdXRNczogMTIwMDAgfSk7XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBjb25zdCBndm0gPSAoZ3JpZCAmJiBLTyAmJiB0eXBlb2YgS08uZGF0YUZvciA9PT0gJ2Z1bmN0aW9uJykgPyBLTy5kYXRhRm9yKGdyaWQpIDogbnVsbDtcbiAgICBpZiAoIWd2bSkgcmV0dXJuIHsgb2s6IHRydWUsIGlzc3VlczogW10gfTsgLy8gbm90aGluZyB0byB2YWxpZGF0ZSB5ZXRcblxuICAgIGNvbnN0IHJvd3MgPSAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIGNvbnN0IGdyb3Vwc0J5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IHFwID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUXVvdGVQYXJ0S2V5JykgPz8gLTE7XG4gICAgICAgIChncm91cHNCeVF1b3RlUGFydC5nZXQocXApIHx8IGdyb3Vwc0J5UXVvdGVQYXJ0LnNldChxcCwgW10pLmdldChxcCkpLnB1c2gocik7XG4gICAgfVxuXG4gICAgY29uc3QgcHJpbWFyeUJ5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IHAgPSBncm91cC5maW5kKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnSXNVbmlxdWVRdW90ZVBhcnQnKSA9PT0gMSkgfHwgZ3JvdXBbMF07XG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydC5zZXQocXAsIHApO1xuICAgIH1cblxuICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgcm93cyxcbiAgICAgICAgZ3JvdXBzQnlRdW90ZVBhcnQsXG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydCxcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXG4gICAgICAgIGxhc3RSZXN1bHQ6IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlPy4oKVxuICAgIH07XG5cbiAgICBjb25zdCB1dGlscyA9IHsgZ2V0OiAob2JqLCBwYXRoLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKG9iaiwgcGF0aCwgb3B0cykgfTtcblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChydWxlcy5tYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSkpO1xuICAgIGNvbnN0IGlzc3Vlc1JhdyA9IHJlc3VsdHMuZmxhdCgpO1xuICAgIGNvbnN0IG9rID0gaXNzdWVzUmF3LmV2ZXJ5KGkgPT4gaS5sZXZlbCAhPT0gJ2Vycm9yJyk7XG5cbiAgICAvLyBFbnJpY2ggaXNzdWVzIHdpdGggVUktZmFjaW5nIGRhdGEgKGxpbmVOdW1iZXIsIHBhcnRObywgcnVsZUxhYmVsKVxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IE51bWJlcihTdHJpbmcodiA/PyAnJykucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICBjb25zdCBydWxlTGFiZWxGcm9tID0gKGlzcykgPT4ge1xuICAgICAgICAvLyBQcmVmZXJyZWQ6IHJ1bGUgZnVuY3Rpb24gc2V0cyAubWV0YS5sYWJlbCAoZS5nLiwgbWF4VW5pdFByaWNlLm1ldGEubGFiZWwpXG4gICAgICAgIGlmIChpc3M/Lm1ldGE/LmxhYmVsKSByZXR1cm4gaXNzLm1ldGEubGFiZWw7XG4gICAgICAgIGlmIChpc3M/LmtpbmQpIHtcbiAgICAgICAgICAgIGNvbnN0IGsgPSBTdHJpbmcoaXNzLmtpbmQpO1xuICAgICAgICAgICAgLy8gcHJldHRpZnkgXCJwcmljZS5tYXhVbml0UHJpY2VcIiA9PiBcIk1heCBVbml0IFByaWNlXCJcbiAgICAgICAgICAgIGNvbnN0IHRhaWwgPSBrLnNwbGl0KCcuJykucG9wKCk7XG4gICAgICAgICAgICByZXR1cm4gdGFpbFxuICAgICAgICAgICAgICAgID8gdGFpbC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXi4vLCAoYykgPT4gYy50b1VwcGVyQ2FzZSgpKVxuICAgICAgICAgICAgICAgIDogaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ1ZhbGlkYXRpb24nO1xuICAgIH07XG5cbiAgICAvLyBCdWlsZCBhIHF1aWNrIG1hcCBvZiByb3cgLT4gaW5mb1xuICAgIGNvbnN0IHJvd0luZm8gPSBuZXcgTWFwKCk7IC8vIHZtIC0+IHsgbGluZU51bWJlciwgcGFydE5vIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHIgPSBjdHgucm93c1tpXTtcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuICAgICAgICBjb25zdCBwYXJ0Tm8gPSB1dGlscy5nZXQociwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJztcbiAgICAgICAgcm93SW5mby5zZXQociwgeyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfSk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyBtYXAgUVBLIC0+IFwicHJpbWFyeVwiIHJvdyBmb3IgY2hlYXAgbG9va3VwXG4gICAgY29uc3QgcXBrVG9QcmltYXJ5SW5mbyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgcHJpbWFyeV0gb2YgY3R4LnByaW1hcnlCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHJvd0luZm8uZ2V0KHByaW1hcnkpIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiB1dGlscy5nZXQocHJpbWFyeSwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJyB9O1xuICAgICAgICBxcGtUb1ByaW1hcnlJbmZvLnNldChxcCwgaW5mbyk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgYSBTb3J0T3JkZXIgbG9va3VwIGJ5IHZpc3VhbCByb3cgaW5kZXggKGZyb20gdGhlIFZNLCBub3QgdGhlIERPTSlcbiAgICBjb25zdCBzb3J0QnlMaW5lID0gbmV3IE1hcCgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgcm93ID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3Qgc29ydE9yZGVyID0gdXRpbHMuZ2V0KHJvdywgJ1NvcnRPcmRlcicsIHsgbnVtYmVyOiB0cnVlIH0pO1xuICAgICAgICBzb3J0QnlMaW5lLnNldChsaW5lTnVtYmVyLCBzb3J0T3JkZXIpO1xuICAgIH1cblxuICAgIGNvbnN0IGlzc3VlcyA9IGlzc3Vlc1Jhdy5tYXAoaXNzID0+IHtcbiAgICAgICAgY29uc3QgcXBrID0gaXNzLnF1b3RlUGFydEtleSA/PyAtMTtcbiAgICAgICAgY29uc3QgaW5mbyA9IHFwa1RvUHJpbWFyeUluZm8uZ2V0KHFwaykgfHwgeyBsaW5lTnVtYmVyOiBudWxsLCBwYXJ0Tm86ICcnIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5pc3MsXG4gICAgICAgICAgICBsaW5lTnVtYmVyOiBpbmZvLmxpbmVOdW1iZXIsXG4gICAgICAgICAgICBwYXJ0Tm86IGluZm8ucGFydE5vLFxuICAgICAgICAgICAgcnVsZUxhYmVsOiBydWxlTGFiZWxGcm9tKGlzcyksXG4gICAgICAgICAgICBzb3J0T3JkZXI6IHNvcnRCeUxpbmUuZ2V0KGluZm8ubGluZU51bWJlciA/PyAtMSlcbiAgICAgICAgfTtcbiAgICB9KTtcblxuXG4gICAgLy8gc3Rhc2ggaWYgeW91IHdhbnQgb3RoZXIgbW9kdWxlcyB0byByZWFkIGl0IGxhdGVyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XG4gICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHsgYXQ6IERhdGUubm93KCksIG9rLCBpc3N1ZXMgfTtcblxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcbn1cblxuIiwgIi8vIFFUViBlbnRyeXBvaW50OiBtb3VudHMgdGhlIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBvbiBQYXJ0IFN1bW1hcnlcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuaWYgKF9fQlVJTERfREVWX18pIHtcbiAgICAvLyBNaW5pbWFsIEtPL2dyaWQgcmVzb2x2ZXJzIGtlcHQgbG9jYWwgdG8gZGVidWcgaGVscGVyc1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBmdW5jdGlvbiBnZXRHcmlkVk0oKSB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIHJldHVybiBncmlkID8gKEtPPy5kYXRhRm9yPy4oZ3JpZCkgfHwgbnVsbCkgOiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRHcmlkUm93cygpIHtcbiAgICAgICAgY29uc3QgZ3ZtID0gZ2V0R3JpZFZNKCk7XG4gICAgICAgIHJldHVybiAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwbGFpblJvdyhyKSB7XG4gICAgICAgIGNvbnN0IGd2ID0gKHAsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgcCwgb3B0cyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBRdW90ZVBhcnRLZXk6IGd2KCdRdW90ZVBhcnRLZXknKSxcbiAgICAgICAgICAgIFBhcnRObzogZ3YoJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFBhcnRTdGF0dXM6IGd2KCdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pLFxuICAgICAgICAgICAgUXVhbnRpdHk6IGd2KCdRdWFudGl0eScpLFxuICAgICAgICAgICAgVW5pdFByaWNlOiBndignVW5pdFByaWNlJyksXG4gICAgICAgICAgICBSdlVuaXRQcmljZUNvcHk6IGd2KCdSdlVuaXRQcmljZUNvcHknKSxcbiAgICAgICAgICAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZTogZ3YoJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpLFxuICAgICAgICAgICAgSXNVbmlxdWVRdW90ZVBhcnQ6IGd2KCdJc1VuaXF1ZVF1b3RlUGFydCcpXG4gICAgICAgIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvQ1NWKG9ianMpIHtcbiAgICAgICAgaWYgKCFvYmpzPy5sZW5ndGgpIHJldHVybiAnJztcbiAgICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKG9ianNbMF0pO1xuICAgICAgICBjb25zdCBlc2MgPSAodikgPT4gKHYgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHYpLmluY2x1ZGVzKCcsJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcIicpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXFxuJylcbiAgICAgICAgICAgID8gYFwiJHtTdHJpbmcodikucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImBcbiAgICAgICAgICAgIDogU3RyaW5nKHYpKTtcbiAgICAgICAgY29uc3QgaGVhZCA9IGNvbHMuam9pbignLCcpO1xuICAgICAgICBjb25zdCBib2R5ID0gb2Jqcy5tYXAobyA9PiBjb2xzLm1hcChjID0+IGVzYyhvW2NdKSkuam9pbignLCcpKS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGhlYWQgKyAnXFxuJyArIGJvZHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGRvd25sb2FkKG5hbWUsIGJsb2IpIHtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gbmFtZTsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMjAwMCk7XG4gICAgfVxuXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcbiAgICAgICAgLy8gU2V0dGluZ3MgaGVscGVyc1xuICAgICAgICBzZXR0aW5nczogKCkgPT4gKHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxuICAgICAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogR01fZ2V0VmFsdWUoJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyksXG4gICAgICAgICAgICBtaW5Vbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWluVW5pdFByaWNlJyksXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJylcbiAgICAgICAgfSksXG4gICAgICAgIGdldFZhbHVlOiBrZXkgPT4gR01fZ2V0VmFsdWUoa2V5KSxcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxuXG4gICAgICAgIC8vIEdyaWQgZXhwb3J0ZXJzXG4gICAgICAgIGdyaWQ6ICh7IHBsYWluID0gdHJ1ZSB9ID0ge30pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBnZXRHcmlkUm93cygpO1xuICAgICAgICAgICAgcmV0dXJuIHBsYWluID8gcm93cy5tYXAocGxhaW5Sb3cpIDogcm93cztcbiAgICAgICAgfSxcbiAgICAgICAgZ3JpZFRhYmxlOiAoKSA9PiBjb25zb2xlLnRhYmxlPy4odW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpLFxuXG4gICAgICAgIC8vIENTVi9KU09OIGRvd25sb2FkZXJzXG4gICAgICAgIGRvd25sb2FkR3JpZEpTT046IChmaWxlbmFtZSA9ICdxdC1ncmlkLmpzb24nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSksIG51bGwsIDIpO1xuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSkpO1xuICAgICAgICB9LFxuICAgICAgICBkb3dubG9hZEdyaWRDU1Y6IChmaWxlbmFtZSA9ICdxdC1ncmlkLmNzdicpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNzdiA9IHRvQ1NWKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbY3N2XSwgeyB0eXBlOiAndGV4dC9jc3YnIH0pKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBWYWxpZGF0aW9uIG9uLWRlbWFuZCAoc2FtZSBlbmdpbmUgYXMgdGhlIGJ1dHRvbilcbiAgICAgICAgdmFsaWRhdGVOb3c6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgcnVuVmFsaWRhdGlvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2VuZ2luZS5qcycpOyAvLyBzYW1lIG1vZHVsZSB1c2VkIGJ5IHRoZSBodWIgYnV0dG9uXG4gICAgICAgICAgICBjb25zdCB7IGdldFNldHRpbmdzIH0gPSBhd2FpdCBpbXBvcnQoJy4vaW5kZXguanMnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgZ2V0U2V0dGluZ3MoKSk7XG4gICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4ocmVzLmlzc3VlcyB8fCBbXSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFF1aWNrIGV4cGVjdGF0aW9uIGhlbHBlcjogXHUyMDFDc2hvdyBtZSByb3dzIGFib3ZlIG1heFx1MjAxRFxuICAgICAgICBleHBlY3RVbmRlck1heDogKG1heCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1heCk7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA+IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHVuZGVyTWluOiAobWluKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWluKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiByb3dzXG4gICAgICAgICAgICAgICAgLm1hcChyID0+ICh7IC4uLnIsIF9Vbml0TnVtOiB0b051bShyLlJ2Q3VzdG9taXplZFVuaXRQcmljZSA/PyByLlJ2VW5pdFByaWNlQ29weSA/PyByLlVuaXRQcmljZSkgfSkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtIDwgc2V0KVxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XG4gICAgICAgIH0sXG5cbiAgICB9O1xufVxuXG5cbi8vIEVuc3VyZSB0aGUgc2V0dGluZ3MgVUkgbG9hZHMgKGdlYXIgYnV0dG9uLCBzdG9yYWdlIEFQSSlcbmltcG9ydCAnLi9pbmRleC5qcyc7XG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcbmltcG9ydCB7IG1vdW50VmFsaWRhdGlvbkJ1dHRvbiB9IGZyb20gJy4vaW5qZWN0QnV0dG9uLmpzJztcblxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcblxuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcblxuZnVuY3Rpb24gaXNXaXphcmQoKSB7XG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xuICAgIHJldHVybiBST1VURVMuc29tZShyZSA9PiByZS50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSk7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xufVxuXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcbiAgICByZXR1cm4gL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xuICAgIGlmICghaXNXaXphcmQoKSkgcmV0dXJuIHVubW91bnQoKTtcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xuICAgICAgICBpZiAoIXVubW91bnRCdG4pIHVubW91bnRCdG4gPSBhd2FpdCBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5tb3VudCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5tb3VudCgpIHsgaWYgKHVubW91bnRCdG4pIHsgdW5tb3VudEJ0bigpOyB1bm1vdW50QnRuID0gbnVsbDsgfSB9XG5cbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcbnJlY29uY2lsZSgpO1xuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihyZWNvbmNpbGUpO1xud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xuY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xuaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb25jaWxlKS5vYnNlcnZlKG5hdiwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG5cbiIsICIvLyBBZGRzIGEgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIGFuZCB3aXJlcyBpdCB0byB0aGUgZW5naW5lLlxuLy8gQXNzdW1lcyB5b3VyIHNldHRpbmdzIFVJIGV4cG9ydHMgZ2V0U2V0dGluZ3Mvb25TZXR0aW5nc0NoYW5nZS5cblxuaW1wb3J0IHsgcnVuVmFsaWRhdGlvbiB9IGZyb20gJy4vZW5naW5lJztcbmltcG9ydCB7IGdldFNldHRpbmdzLCBvblNldHRpbmdzQ2hhbmdlIH0gZnJvbSAnLi9pbmRleCc7XG5cbi8vIC0tLSBLTyBzdXJmYWNlIChxdDMwIHBhdHRlcm4pIC0tLVxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcblxuLy8gLS0tIHN1bW1hcml6ZSBpc3N1ZXMgZm9yIHN0YXR1cyBwaWxsIC8gdG9hc3RzIC0tLVxuZnVuY3Rpb24gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuaXNBcnJheShpc3N1ZXMpID8gaXNzdWVzIDogW107XG4gICAgICAgIGNvbnN0IGFnZyA9IGl0ZW1zLnJlZHVjZSgoYWNjLCBpdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbHZsID0gU3RyaW5nKGl0Py5sZXZlbCB8fCAnaW5mbycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBhY2NbbHZsXSA9IChhY2NbbHZsXSB8fCAwKSArIDE7XG4gICAgICAgICAgICBpZiAoaXQ/LnF1b3RlUGFydEtleSAhPSBudWxsKSBhY2MucGFydHMuYWRkKGl0LnF1b3RlUGFydEtleSk7XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCB7IGVycm9yOiAwLCB3YXJuaW5nOiAwLCBpbmZvOiAwLCBwYXJ0czogbmV3IFNldCgpIH0pO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzQ291bnQgPSBhZ2cucGFydHMuc2l6ZTtcbiAgICAgICAgY29uc3Qgc2VncyA9IFtdO1xuICAgICAgICBpZiAoYWdnLmVycm9yKSBzZWdzLnB1c2goYCR7YWdnLmVycm9yfSBlcnJvciR7YWdnLmVycm9yID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICAgIGlmIChhZ2cud2FybmluZykgc2Vncy5wdXNoKGAke2FnZy53YXJuaW5nfSB3YXJuaW5nJHthZ2cud2FybmluZyA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLmluZm8pIHNlZ3MucHVzaChgJHthZ2cuaW5mb30gaW5mb2ApO1xuICAgICAgICBjb25zdCBsZXZlbFBhcnQgPSBzZWdzLmpvaW4oJywgJykgfHwgJ3VwZGF0ZXMnO1xuXG4gICAgICAgIHJldHVybiBgJHtsZXZlbFBhcnR9IGFjcm9zcyAke3BhcnRzQ291bnQgfHwgMH0gcGFydCR7cGFydHNDb3VudCA9PT0gMSA/ICcnIDogJ3MnfWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG59XG5cbi8vIC0tLSBRVDMwLXN0eWxlIGdyaWQgcmVmcmVzaCAoY29waWVkKSAtLS1cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ3JpZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXG4gICAgICAgICAgICByZXR1cm4gJ2RzLnJlYWQnO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBncmlkVk0ucmVmcmVzaCgpOyAgICAgICAgICAgICAgICAgIC8vIHN5bmMgdmlzdWFsIHJlZnJlc2hcbiAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBhY3RpdmUgcGFnZSAocmViaW5kKVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdz8ucGxleD8uY3VycmVudFBhZ2U/LlF1b3RlV2l6YXJkO1xuICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9ICh0eXBlb2Ygd2l6LmFjdGl2ZVBhZ2UgPT09ICdmdW5jdGlvbicpID8gd2l6LmFjdGl2ZVBhZ2UoKSA6IHdpei5hY3RpdmVQYWdlO1xuICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZShhY3RpdmUpO1xuICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblxuICAgIHJldHVybiBudWxsO1xufVxuXG5cblxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcblxuYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGVuc3VyZSA9ICh3aW5kb3cuZW5zdXJlTFRIdWIgfHwgdW5zYWZlV2luZG93Py5lbnN1cmVMVEh1Yik7XG4gICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMgPSBbXSkge1xuICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcblxuICAgIC8vIGVsZW1lbnRzXG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG92ZXJsYXkuaWQgPSAncXR2LW1vZGFsLW92ZXJsYXknO1xuICAgIE9iamVjdC5hc3NpZ24ob3ZlcmxheS5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJyxcbiAgICAgICAgaW5zZXQ6IDAsXG4gICAgICAgIGJhY2tncm91bmQ6ICd2YXIoLS1sdC1vdmVybGF5LCByZ2JhKDAsMCwwLC4zNikpJyxcbiAgICAgICAgekluZGV4OiAxMDAwMDJcbiAgICB9KTtcblxuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9kYWwuaWQgPSAncXR2LW1vZGFsJztcbiAgICBtb2RhbC5jbGFzc05hbWUgPSAnbHQtY2FyZCc7XG4gICAgT2JqZWN0LmFzc2lnbihtb2RhbC5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnNTAlJyxcbiAgICAgICAgbGVmdDogJzUwJScsXG4gICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLC01MCUpJyxcbiAgICAgICAgd2lkdGg6ICdtaW4oOTAwcHgsIDkydncpJ1xuICAgIH0pO1xuXG4gICAgLy8gYnVpbGQgcm93cyAoUGxleC1saWtlOiBzb3J0ICsgc3VwcHJlc3MgcmVwZWF0aW5nIFNvcnQvUGFydC9SdWxlIGRpc3BsYXkpXG4gICAgY29uc3Qgc29ydGVkID0gWy4uLmlzc3Vlc10uc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBzb0EgPSAoYS5zb3J0T3JkZXIgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKTtcbiAgICAgICAgY29uc3Qgc29CID0gKGIuc29ydE9yZGVyID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSk7XG4gICAgICAgIGlmIChzb0EgIT09IHNvQikgcmV0dXJuIHNvQSAtIHNvQjtcbiAgICAgICAgY29uc3QgcG5BID0gU3RyaW5nKGEucGFydE5vID8/ICcnKTtcbiAgICAgICAgY29uc3QgcG5CID0gU3RyaW5nKGIucGFydE5vID8/ICcnKTtcbiAgICAgICAgaWYgKHBuQSAhPT0gcG5CKSByZXR1cm4gcG5BLmxvY2FsZUNvbXBhcmUocG5CKTtcbiAgICAgICAgY29uc3QgcmxBID0gU3RyaW5nKGEucnVsZUxhYmVsID8/IGEua2luZCA/PyAnJyk7XG4gICAgICAgIGNvbnN0IHJsQiA9IFN0cmluZyhiLnJ1bGVMYWJlbCA/PyBiLmtpbmQgPz8gJycpO1xuICAgICAgICByZXR1cm4gcmxBLmxvY2FsZUNvbXBhcmUocmxCKTtcbiAgICB9KTtcblxuICAgIGxldCBwcmV2U29ydCA9IG51bGwsIHByZXZQYXJ0ID0gbnVsbCwgcHJldlJ1bGUgPSBudWxsO1xuICAgIGNvbnN0IHJvd3NIdG1sID0gc29ydGVkLm1hcChpc3MgPT4ge1xuICAgICAgICBjb25zdCBsdmwgPSAoaXNzLmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBsdmxDbGFzcyA9IChsdmwgPT09ICdlcnJvcicpID8gJ3F0di1waWxsLS1lcnJvcicgOiAobHZsID09PSAnd2FybicgfHwgbHZsID09PSAnd2FybmluZycpID8gJ3F0di1waWxsLS13YXJuJyA6ICdxdHYtcGlsbC0taW5mbyc7XG4gICAgICAgIGNvbnN0IGx2bFBpbGwgPSBgPHNwYW4gY2xhc3M9XCJxdHYtcGlsbCAke2x2bENsYXNzfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcbiAgICAgICAgY29uc3QgcmVhc29uID0gaXNzLm1lc3NhZ2UgfHwgJyhubyBtZXNzYWdlKSc7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBTdHJpbmcoaXNzLnJ1bGVMYWJlbCB8fCBpc3Mua2luZCB8fCAnVmFsaWRhdGlvbicpO1xuXG4gICAgICAgIC8vIFN1cHByZXNzIHJlcGVhdHMgaW4gdmlzdWFsIHRhYmxlIGNlbGxzXG4gICAgICAgIGNvbnN0IHNob3dTb3J0ID0gKGlzcy5zb3J0T3JkZXIgIT09IHByZXZTb3J0KSA/IChpc3Muc29ydE9yZGVyID8/ICcnKSA6ICcnO1xuICAgICAgICBjb25zdCBzaG93UGFydCA9IChzaG93U29ydCAhPT0gJycgfHwgKGlzcy5wYXJ0Tm8gIT09IHByZXZQYXJ0KSkgPyAoaXNzLnBhcnRObyA/PyAnJykgOiAnJztcbiAgICAgICAgY29uc3Qgc2FtZUdyb3VwQXNQcmV2ID0gKHNob3dTb3J0ID09PSAnJyAmJiBzaG93UGFydCA9PT0gJycpO1xuICAgICAgICBjb25zdCBzaG93UnVsZSA9ICghc2FtZUdyb3VwQXNQcmV2IHx8IHJ1bGUgIT09IHByZXZSdWxlKSA/IHJ1bGUgOiAnJztcblxuICAgICAgICBwcmV2U29ydCA9IGlzcy5zb3J0T3JkZXI7XG4gICAgICAgIHByZXZQYXJ0ID0gaXNzLnBhcnRObztcbiAgICAgICAgcHJldlJ1bGUgPSBydWxlO1xuXG4gICAgICAgIHJldHVybiBgXG4gIDx0ciBkYXRhLXFwaz1cIiR7aXNzLnF1b3RlUGFydEtleSA/PyAnJ31cIiBkYXRhLXJ1bGU9XCIke1N0cmluZyhpc3Mua2luZCB8fCAnJyl9XCI+XG4gICAgPHRkPiR7c2hvd1NvcnR9PC90ZD5cbiAgICA8dGQ+JHtzaG93UGFydH08L3RkPlxuICAgIDx0ZD4ke3Nob3dSdWxlfTwvdGQ+XG4gICAgPHRkPiR7bHZsUGlsbH08L3RkPlxuICAgIDx0ZD4ke3JlYXNvbn08L3RkPlxuICA8L3RyPmA7XG4gICAgfSkuam9pbignJyk7XG5cblxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcbiAgPGRpdiBjbGFzcz1cInF0di1oZCBsdC1jYXJkX19oZWFkZXJcIj5cbiAgICA8aDMgY2xhc3M9XCJsdC1jYXJkX190aXRsZVwiPlZhbGlkYXRpb24gRGV0YWlsczwvaDM+XG4gICAgPGRpdiBjbGFzcz1cInF0di1hY3Rpb25zIGx0LWNhcmRfX3NwYWNlclwiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLWdob3N0XCIgaWQ9XCJxdHYtZXhwb3J0LWNzdlwiIHRpdGxlPVwiRXhwb3J0IHZpc2libGUgaXNzdWVzIHRvIENTVlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1wcmltYXJ5XCIgaWQ9XCJxdHYtY2xvc2VcIj5DbG9zZTwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbiAgPGRpdiBjbGFzcz1cInF0di1iZCBsdC1jYXJkX19ib2R5XCI+XG4gICAgPHRhYmxlIGNsYXNzPVwibHQtdGFibGVcIiBhcmlhLWxhYmVsPVwiVmFsaWRhdGlvbiBJc3N1ZXNcIj5cbiAgICAgIDx0aGVhZD5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0aD5Tb3J0Jm5ic3A7T3JkZXI8L3RoPlxuICAgICAgICAgIDx0aD5QYXJ0ICM8L3RoPlxuICAgICAgICAgIDx0aD5SdWxlPC90aD5cbiAgICAgICAgICA8dGg+TGV2ZWw8L3RoPlxuICAgICAgICAgIDx0aD5SZWFzb248L3RoPlxuICAgICAgICA8L3RyPlxuICAgICAgPC90aGVhZD5cbiAgICAgIDx0Ym9keT4ke3Jvd3NIdG1sIHx8IGA8dHI+PHRkIGNvbHNwYW49XCI1XCIgc3R5bGU9XCJvcGFjaXR5Oi43OyBwYWRkaW5nOjEycHg7XCI+Tm8gaXNzdWVzLjwvdGQ+PC90cj5gfTwvdGJvZHk+XG4gICAgPC90YWJsZT5cbiAgPC9kaXY+XG5gO1xuXG5cbiAgICAvLyBpbnRlcmFjdGlvbnNcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBjbGljayByb3cgdG8gZm9jdXMgKyBoaWdobGlnaHQgKyBzY3JvbGxcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCd0Ym9keScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTsgaWYgKCF0cikgcmV0dXJuO1xuICAgICAgICBjb25zdCBxcGsgPSB0ci5nZXRBdHRyaWJ1dGUoJ2RhdGEtcXBrJyk7XG4gICAgICAgIGlmICghcXBrKSByZXR1cm47XG4gICAgICAgIC8vIGVuc3VyZSBoaWdobGlnaHRzIGV4aXN0LCB0aGVuIGp1bXBcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XG4gICAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBleHBvcnQgQ1NWXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQtY3N2Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBjc3YgPSBbXG4gICAgICAgICAgICBbJ0xpbmUnLCAnU29ydE9yZGVyJywgJ1BhcnRObycsICdRdW90ZVBhcnRLZXknLCAnUnVsZScsICdMZXZlbCcsICdSZWFzb24nXS5qb2luKCcsJyksXG4gICAgICAgICAgICAuLi5pc3N1ZXMubWFwKGkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodiA/PyAnJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAvW1wiLFxcbl0vLnRlc3QocykgPyBgXCIke3MucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImAgOiBzO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgICAgaS5saW5lTnVtYmVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnNvcnRPcmRlciA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5wYXJ0Tm8gPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucXVvdGVQYXJ0S2V5ID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnJ1bGVMYWJlbCB8fCBpLmtpbmQgfHwgJ1ZhbGlkYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICBpLmxldmVsIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLm1lc3NhZ2UgfHwgJydcbiAgICAgICAgICAgICAgICBdLm1hcChlc2MpLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF0uam9pbignXFxuJyk7XG5cbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9ICdxdC12YWxpZGF0aW9uLWlzc3Vlcy5jc3YnOyBhLmNsaWNrKCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICB9KTtcblxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQobW9kYWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG4gICAgdHJ5IHsgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7IG92ZXJsYXkuZm9jdXMoKTsgfSBjYXRjaCB7IH1cbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4geyBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcblxufVxuXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscykge1xuICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiAnbmF2JyB9KTtcbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybiAoKSA9PiB7IH07XG5cbiAgICAvLyBhdm9pZCBkdXBsaWNhdGVcbiAgICBpZiAoaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhIVUJfQlROX0lEKSkgcmV0dXJuICgpID0+IHsgfTtcblxuICAgIGxldCBidG5FbCA9IG51bGw7XG4gICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgbGFiZWw6ICdWYWxpZGF0ZSBMaW5lcycsXG4gICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgcXVvdGUgbGluZSBydWxlcycsXG4gICAgICAgIHdlaWdodDogMTMwLFxuICAgICAgICBvbkNsaWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGdldFNldHRpbmdzPy4oKSB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHRhc2sgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2s/LignVmFsaWRhdGluZ1x1MjAyNicsICdpbmZvJykgfHwgeyBkb25lKCkgeyB9LCBlcnJvcigpIHsgfSB9O1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENsZWFyIG9sZCBoaWdobGlnaHRzIGFuZCBlbnN1cmUgc3R5bGVzIGFyZSBwcmVzZW50IHVwLWZyb250XG4gICAgICAgICAgICAgICAgY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpO1xuICAgICAgICAgICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzc3VlcyA9IEFycmF5LmlzQXJyYXkocmVzPy5pc3N1ZXMpID8gcmVzLmlzc3VlcyA6IFtdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gaXNzdWVzLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgIC8vIEF1dG8taGlnaGxpZ2h0IGFsbCBlcnJvciByb3dzIGltbWVkaWF0ZWx5IChiZWZvcmUgbW9kYWwpXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpc3Mgb2YgaXNzdWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBpc3M/LnF1b3RlUGFydEtleTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcXBrKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcm93KSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2UgPSAncXR2LXJvdy1mYWlsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNscyA9IGNsYXNzRm9ySXNzdWUoaXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKGJhc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNscykgcm93LmNsYXNzTGlzdC5hZGQoY2xzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKCdcdTI3MDUgTGluZXMgdmFsaWQnLCAnc3VjY2VzcycsIHsgbXM6IDE4MDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKCdcdTI3MDUgQWxsIGNsZWFyJywgJ3N1Y2Nlc3MnLCB7IHN0aWNreTogZmFsc2UgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/LigwKTtcbiAgICAgICAgICAgICAgICAgICAgdGFzay5kb25lPy4oJ1ZhbGlkJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGFsbHkgb3V0Y29tZXMgKGhhbmRsZXMgbWlzc2luZyBsZXZlbCBncmFjZWZ1bGx5KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsZXZlbHMgPSBpc3N1ZXMubWFwKGkgPT4gU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzRXJyb3IgPSBsZXZlbHMuc29tZShsID0+IGwgPT09ICdlcnJvcicgfHwgbCA9PT0gJ2ZhaWwnIHx8IGwgPT09ICdjcml0aWNhbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCBpc3N1ZXMuc29tZShpID0+IC9wcmljZVxcLig/Om1heHVuaXRwcmljZXxtaW51bml0cHJpY2UpL2kudGVzdChTdHJpbmcoaT8ua2luZCB8fCAnJykpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzV2FybiA9ICFoYXNFcnJvciAmJiBsZXZlbHMuc29tZShsID0+IGwgPT09ICd3YXJuJyB8fCBsID09PSAnd2FybmluZycpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBHdWFyZCB0byBlbnN1cmUgVUkgcHJvYmxlbXMgbmV2ZXIgYmxvY2sgdGhlIG1vZGFsXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGFzRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXFx1Mjc0QyAke2NvdW50fSB2YWxpZGF0aW9uICR7Y291bnQgPT09IDEgPyAnaXNzdWUnIDogJ2lzc3Vlcyd9YCwgJ2Vycm9yJywgeyBtczogNjUwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgXFx1Mjc0QyAke2NvdW50fSBpc3N1ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLCAnZXJyb3InLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oY291bnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNXYXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oYFxcdTI2QTBcXHVGRTBGICR7Y291bnR9IHZhbGlkYXRpb24gJHtjb3VudCA9PT0gMSA/ICd3YXJuaW5nJyA6ICd3YXJuaW5ncyd9YCwgJ3dhcm4nLCB7IG1zOiA1MDAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNkEwXFx1RkUwRiAke2NvdW50fSB3YXJuaW5nJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICd3YXJuJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mby1vbmx5IHVwZGF0ZXMgKGUuZy4sIGF1dG8tbWFuYWdlIHBvc3RzIHdpdGggbGV2ZWw9aW5mbylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXHUyMTM5XHVGRTBGICR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gYXBwbGllZGAsICdpbmZvJywgeyBtczogMzUwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgXHUyMTM5XHVGRTBGICR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLCAnaW5mbycsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBuZXZlciBibG9jayB0aGUgbW9kYWwgKi8gfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBzaG93IHRoZSBkZXRhaWxzIHdoZW4gY291bnQgPiAwXG4gICAgICAgICAgICAgICAgICAgIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBhdXRvTWFuYWdlIGFjdHVhbGx5IGNoYW5nZWQgUGFydF9ObyAobGV2ZWw9d2FybmluZyksIHJlZnJlc2ggdGhlIGdyaWQgKHF0MzAgcGF0dGVybilcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmVlZHNSZWZyZXNoID0gaXNzdWVzLnNvbWUoaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmtpbmQgfHwgJycpLmluY2x1ZGVzKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIFN0cmluZyhpPy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKSA9PT0gJ3dhcm5pbmcnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBpPy5tZXRhPy5jaGFuZ2VkID09PSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5lZWRzUmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2RlID0gYXdhaXQgcmVmcmVzaFF1b3RlR3JpZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyBgR3JpZCByZWZyZXNoZWQgKCR7bW9kZX0pYCA6ICdHcmlkIHJlZnJlc2ggYXR0ZW1wdGVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlID8gJ3N1Y2Nlc3MnIDogJ2luZm8nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IG1zOiAyNTAwIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LignR3JpZCByZWZyZXNoIGZhaWxlZCcsICd3YXJuJywgeyBtczogMzAwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRhc2suZG9uZT8uKCdDaGVja2VkJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY2FjaGUgbGFzdCBzdGF0dXMgZm9yIFNQQSByZWRyYXdzXG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHJlcztcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgbHQuY29yZS5odWIuZXJyb3I/LihgVmFsaWRhdGlvbiBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDYwMDAgfSk7XG4gICAgICAgICAgICAgICAgdGFzay5lcnJvcj8uKCdFcnJvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBHcmFiIGJhY2sgdGhlIHJlYWwgRE9NIGJ1dHRvbiB0byB1cGRhdGUgdGl0bGUgbGF0ZXJcbiAgICBidG5FbCA9IGh1Yi5fc2hhZG93Py5xdWVyeVNlbGVjdG9yPy4oYFtkYXRhLWlkPVwiJHtIVUJfQlROX0lEfVwiXWApO1xuXG4gICAgY29uc3Qgb2ZmU2V0dGluZ3MgPSBvblNldHRpbmdzQ2hhbmdlPy4oKCkgPT4gcmVmcmVzaExhYmVsKGJ0bkVsKSk7XG4gICAgcmVmcmVzaExhYmVsKGJ0bkVsKTtcblxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIG9mZlNldHRpbmdzPy4oKTtcbiAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZWZyZXNoTGFiZWwoYnRuKSB7XG4gICAgaWYgKCFidG4pIHJldHVybjtcbiAgICBjb25zdCBzID0gZ2V0U2V0dGluZ3MoKTtcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xuICAgIC8vaWYgKHMuZm9yYmlkWmVyb1ByaWNlKSBwYXJ0cy5wdXNoKCdcdTIyNjAkMCcpO1xuICAgIGlmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xuICAgIGlmIChzLm1heFVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjQke3MubWF4VW5pdFByaWNlfWApO1xuICAgIGJ0bi50aXRsZSA9IGBSdWxlczogJHtwYXJ0cy5qb2luKCcsICcpIHx8ICdub25lJ31gO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCkge1xuICAgIC8vIElmIHRoZSBnbG9iYWwgdGhlbWUgcHJvdmlkZXMgLnF0di0qIHN0eWxlcywgZG8gbm90aGluZy5cbiAgICBjb25zdCBoYXNUaGVtZVF0diA9ICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0ZXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB0ZXN0LmNsYXNzTmFtZSA9ICdxdHYtcGlsbCc7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRlc3QpO1xuICAgICAgICAgICAgY29uc3QgY3MgPSBnZXRDb21wdXRlZFN0eWxlKHRlc3QpO1xuICAgICAgICAgICAgY29uc3Qgb2sgPSAhIWNzICYmIChjcy5ib3JkZXJSYWRpdXMgfHwgJycpLmluY2x1ZGVzKCc5OTlweCcpO1xuICAgICAgICAgICAgdGVzdC5yZW1vdmUoKTtcbiAgICAgICAgICAgIHJldHVybiBvaztcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgIH0pKCk7XG5cbiAgICBpZiAoaGFzVGhlbWVRdHYpIHJldHVybjtcblxuICAgIC8vIEZhbGxiYWNrIHNoaW0gKGtlcHQgdGlueSk6IGhpZ2hsaWdodCBvbmx5OyBtb2RhbC90YWJsZSBzdHlsZXMgd2lsbCBzdGlsbCBiZSBzZXQgaW5saW5lLlxuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXR2LXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ3F0di1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuLyogTWluaW1hbCBzY2FmZm9sZGluZyB3aGVuIHRoZW1lLmNzcyBpc24ndCByZWFkeSAqL1xuI3F0di1tb2RhbC1vdmVybGF5IHsgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwuMzYpOyB6LWluZGV4OiAxMDAwMDI7IH1cbiNxdHYtbW9kYWwge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogNTAlOyBsZWZ0OiA1MCU7IHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsLTUwJSk7IHdpZHRoOiBtaW4oOTAwcHgsOTJ2dyk7XG59XG5cbi5sdC1jYXJkIHsgYmFja2dyb3VuZDogI2ZmZjsgYm9yZGVyLXJhZGl1czogMTJweDsgYm94LXNoYWRvdzogMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApOyBvdmVyZmxvdzogaGlkZGVuOyB9XG4ubHQtY2FyZF9faGVhZGVyIHsgZGlzcGxheTpmbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuOyBwYWRkaW5nOiAxMnB4IDE2cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDAsMCwwLC4wOCk7IH1cbi5sdC1jYXJkX190aXRsZSB7IG1hcmdpbjogMDsgZm9udDogNjAwIDE2cHgvMS4yIHN5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWY7IH1cbi5sdC1jYXJkX19zcGFjZXIgeyBtYXJnaW4tbGVmdDogYXV0bzsgfVxuLmx0LWNhcmRfX2JvZHkgeyBwYWRkaW5nOiAxMnB4IDE2cHg7IG1heC1oZWlnaHQ6IG1pbig3MHZoLDY4MHB4KTsgb3ZlcmZsb3c6IGF1dG87IH1cblxuLmx0LWJ0biB7IGRpc3BsYXk6aW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjZweDsgcGFkZGluZzo2cHggMTBweDsgYm9yZGVyOjFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOjhweDsgYmFja2dyb3VuZDojZjlmYWZiOyBjdXJzb3I6cG9pbnRlcjsgfVxuLmx0LWJ0bi0tcHJpbWFyeSB7IGJhY2tncm91bmQ6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWJyYW5kLTYwMCkgNzAlLCBibGFjayk7IGNvbG9yOiNmZmY7IH1cbi5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4ubHQtYnRuLS1naG9zdCB7IGJhY2tncm91bmQ6dHJhbnNwYXJlbnQ7IGNvbG9yOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IH1cbi5sdC1idG4tLWdob3N0OmhvdmVyIHsgYmFja2dyb3VuZDogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWJyYW5kLTYwMCkgMTIlLCB0cmFuc3BhcmVudCk7IH1cblxuLmx0LXRhYmxlIHsgd2lkdGg6MTAwJTsgYm9yZGVyLWNvbGxhcHNlOiBzZXBhcmF0ZTsgYm9yZGVyLXNwYWNpbmc6IDA7IGZvbnQ6IDQwMCAxM3B4LzEuMzUgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuLmx0LXRhYmxlIHRoIHsgdGV4dC1hbGlnbjpsZWZ0OyBwYWRkaW5nOjhweCAxMHB4OyBiYWNrZ3JvdW5kOiNmM2Y0ZjY7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlNWU3ZWI7IHBvc2l0aW9uOnN0aWNreTsgdG9wOjA7IH1cbi5sdC10YWJsZSB0ZCB7IHBhZGRpbmc6OHB4IDEwcHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNmMWY1Zjk7IH1cbi5sdC10YWJsZSB0Ym9keSB0cjpob3ZlciB7IGJhY2tncm91bmQ6I2Y4ZmFmYzsgfVxuXG4ucXR2LXBpbGwgeyBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6M3B4IDEwcHg7IGJvcmRlci1yYWRpdXM6OTk5cHg7IGZvbnQtd2VpZ2h0OjYwMDsgZm9udC1zaXplOjEycHg7IGJvcmRlcjoxcHggc29saWQgdHJhbnNwYXJlbnQ7IH1cbi5xdHYtcGlsbC0tZXJyb3IgeyBiYWNrZ3JvdW5kOiNkYzI2MjY7IGNvbG9yOiNmZmY7IH1cbi5xdHYtcGlsbC0td2FybiAgeyBiYWNrZ3JvdW5kOiNmNTllMGI7IGNvbG9yOiMxMTE7IH1cbi5xdHYtcGlsbC0taW5mbyAgeyBiYWNrZ3JvdW5kOiMzYjgyZjY7IGNvbG9yOiNmZmY7IH1cblxuLyogUm93IGhpZ2hsaWdodHMgKi9cbi5xdHYtcm93LWZhaWwgeyBvdXRsaW5lOiAycHggc29saWQgcmdiYSgyMjAsIDM4LCAzOCwgLjg1KSAhaW1wb3J0YW50OyBvdXRsaW5lLW9mZnNldDogLTJweDsgfVxuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjU0LCAyMjYsIDIyNiwgLjY1KSAhaW1wb3J0YW50OyB9XG4ucXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0IHsgYmFja2dyb3VuZDogcmdiYSgyMTksIDIzNCwgMjU0LCAuNjUpICFpbXBvcnRhbnQ7IH1cbmA7XG5cbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxufVxuXG5cbi8vIGluc2VydCBhYm92ZSBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKClcbmZ1bmN0aW9uIGdldE9ic1ZhbCh2bSwgcHJvcCkge1xuICAgIHRyeSB7IGNvbnN0IHYgPSB2bT8uW3Byb3BdOyByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7IH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbi8qKiBUYWcgdmlzaWJsZSBncmlkIHJvd3Mgd2l0aCBkYXRhLXF1b3RlLXBhcnQta2V5IGJ5IHJlYWRpbmcgS08gY29udGV4dCAqL1xuZnVuY3Rpb24gZW5zdXJlUm93S2V5QXR0cmlidXRlcygpIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIDA7XG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcbiAgICAgICAgJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdydcbiAgICApO1xuICAgIGxldCB0YWdnZWQgPSAwO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGlmIChyLmhhc0F0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScpKSB7IHRhZ2dlZCsrOyBjb250aW51ZTsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/LihyKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd1ZNID0gY3R4Py4kZGF0YSA/PyBjdHg/LiRyb290ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBxcGsgPSAodHlwZW9mIFRNVXRpbHM/LmdldE9ic1ZhbHVlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgID8gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3dWTSwgJ1F1b3RlUGFydEtleScpXG4gICAgICAgICAgICAgICAgOiBnZXRPYnNWYWwocm93Vk0sICdRdW90ZVBhcnRLZXknKTtcblxuICAgICAgICAgICAgaWYgKHFwayAhPSBudWxsICYmIHFwayAhPT0gJycgJiYgTnVtYmVyKHFwaykgPiAwKSB7XG4gICAgICAgICAgICAgICAgci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknLCBTdHJpbmcocXBrKSk7XG4gICAgICAgICAgICAgICAgdGFnZ2VkKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBwZXItcm93IGZhaWx1cmVzICovIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhZ2dlZDtcbn1cbmZ1bmN0aW9uIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCcpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwaykge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIEZhc3QgcGF0aDogYXR0cmlidXRlIChwcmVmZXJyZWQpXG4gICAgbGV0IHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG5cbiAgICAvLyBJZiBhdHRyaWJ1dGVzIGFyZSBtaXNzaW5nLCB0cnkgdG8gdGFnIHRoZW0gb25jZSB0aGVuIHJldHJ5XG4gICAgaWYgKGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSA+IDApIHtcbiAgICAgICAgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XG4gICAgICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG4gICAgfVxuXG4gICAgLy8gTGFzdCByZXNvcnQ6IHRleHR1YWwgc2NhbiAobGVzcyByZWxpYWJsZSwgYnV0IHdvcmtzIHRvZGF5KVxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCB0eHQgPSAoci50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjbGFzc0Zvcklzc3VlKGlzcykge1xuICAgIGNvbnN0IGtpbmQgPSBTdHJpbmcoaXNzPy5raW5kIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5tYXh1bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5taW51bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnO1xuICAgIHJldHVybiAnJztcbn1cblxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuXG5pZiAoREVWKSB7XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyA9ICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgfHwge307XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy50YWdTdGF0cyA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdycpIDogW107XG4gICAgICAgIGNvbnN0IHRhZ2dlZCA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXF1b3RlLXBhcnQta2V5XScpIDogW107XG4gICAgICAgIGNvbnNvbGUubG9nKCdbUVRWXSByb3dzOicsIHJvd3MubGVuZ3RoLCAndGFnZ2VkOicsIHRhZ2dlZC5sZW5ndGgpO1xuICAgICAgICByZXR1cm4geyB0b3RhbDogcm93cy5sZW5ndGgsIHRhZ2dlZDogdGFnZ2VkLmxlbmd0aCB9O1xuICAgIH07XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy5oaWxpVGVzdCA9IChxcGspID0+IHtcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocikgeyByLmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcsICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTsgci5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyB9XG4gICAgICAgIHJldHVybiAhIXI7XG4gICAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBd0NBLFdBQVMsYUFBYSxHQUFHO0FBQ3JCLFVBQU0sSUFBSSxZQUFZLENBQUM7QUFDdkIsUUFBSSxNQUFNLE9BQVcsUUFBTztBQUU1QixVQUFNLFlBQVksT0FBTyxPQUFPLFdBQVcsRUFBRSxLQUFLLFFBQU0sR0FBRyxTQUFTLEVBQUUsTUFBTSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkYsVUFBTSxLQUFLLFlBQVksWUFBWSxTQUFTLElBQUk7QUFDaEQsV0FBUSxPQUFPLFNBQWEsS0FBSztBQUFBLEVBQ3JDO0FBU08sV0FBUyxjQUFjO0FBQzFCLFdBQU87QUFBQSxNQUNILFNBQVMsT0FBTyxLQUFLLE9BQU87QUFBQSxNQUM1QiwyQkFBMkIsT0FBTyxLQUFLLHlCQUF5QjtBQUFBLE1BQ2hFLGNBQWMsT0FBTyxLQUFLLFlBQVk7QUFBQSxNQUN0QyxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsSUFDMUM7QUFBQSxFQUNKO0FBQ08sV0FBUyxpQkFBaUIsSUFBSTtBQUNqQyxRQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFDN0MsVUFBTSxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFDaEMsV0FBTyxpQkFBaUIsMEJBQTBCLENBQUM7QUFDbkQsV0FBTyxNQUFNLE9BQU8sb0JBQW9CLDBCQUEwQixDQUFDO0FBQUEsRUFDdkU7QUFDQSxXQUFTLGNBQWM7QUFDbkIsUUFBSTtBQUFFLGFBQU8sY0FBYyxJQUFJLFlBQVksMEJBQTBCLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFBRyxRQUFRO0FBQUEsSUFBRTtBQUFBLEVBQ2hIO0FBV0EsaUJBQWUsZ0JBQWdCO0FBRTNCLFVBQU0sV0FBVyxRQUFRLGFBQWEsTUFBTTtBQUM1QyxVQUFNLFNBQVMsU0FBUyxjQUFjLGdIQUFnSDtBQUN0SixVQUFNLFFBQVEsUUFBUSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxHQUFHO0FBQ25FLFVBQU0sV0FBVyxZQUFZLG9CQUFvQixLQUFLLElBQUk7QUFFMUQsVUFBTSxNQUFNLE9BQU8sZUFBZUEsUUFBTyxPQUFPLEVBQUUsT0FBTyxNQUFNLEdBQUc7QUFDOUQsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDekIsY0FBTSxTQUFVLE9BQU8sZUFBZSxjQUFjO0FBQ3BELFlBQUksT0FBTyxXQUFXLFlBQVk7QUFDOUIsY0FBSTtBQUFFLGtCQUFNLElBQUksTUFBTSxPQUFPLElBQUk7QUFBRyxnQkFBSSxFQUFHLFFBQU87QUFBQSxVQUFHLFFBQVE7QUFBQSxVQUFFO0FBQUEsUUFDbkU7QUFDQSxjQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUM3QztBQUNBLGFBQU87QUFBQSxJQUNYLEdBQUc7QUFFSCxRQUFJLENBQUMsS0FBSyxlQUFnQjtBQUUxQixVQUFNLEtBQUs7QUFDWCxVQUFNLFNBQVMsSUFBSSxPQUFPLEdBQUcsU0FBUyxFQUFFO0FBQ3hDLFFBQUksWUFBWSxDQUFDLFFBQVE7QUFDckIsVUFBSSxlQUFlLFNBQVM7QUFBQSxRQUN4QixJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDTCxXQUFXLENBQUMsWUFBWSxRQUFRO0FBQzVCLFVBQUksU0FBUyxFQUFFO0FBQUEsSUFDbkI7QUFBQSxFQUNKO0FBRUEsV0FBUyxZQUFZO0FBQ2pCLFVBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxZQUFRLEtBQUs7QUFDYixXQUFPLE9BQU8sUUFBUSxPQUFPO0FBQUEsTUFDekIsVUFBVTtBQUFBLE1BQ1YsT0FBTztBQUFBLE1BQ1AsWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLElBQ1osQ0FBQztBQUVELFVBQU0sUUFBUSxTQUFTLGNBQWMsS0FBSztBQUMxQyxVQUFNLEtBQUs7QUFDWCxVQUFNLFlBQVk7QUFDbEIsV0FBTyxPQUFPLE1BQU0sT0FBTztBQUFBLE1BQ3ZCLFVBQVU7QUFBQSxNQUNWLEtBQUs7QUFBQSxNQUFPLE1BQU07QUFBQSxNQUNsQixXQUFXO0FBQUEsTUFDWCxPQUFPO0FBQUEsTUFDUCxVQUFVO0FBQUEsSUFDZCxDQUFDO0FBSUQsWUFBUSxpQkFBaUIsV0FBVyxDQUFDLE1BQU07QUFBRSxVQUFJLEVBQUUsUUFBUSxTQUFVLFNBQVEsT0FBTztBQUFBLElBQUcsQ0FBQztBQUN4RixZQUFRLFdBQVc7QUFHbkIsWUFBUSxpQkFBaUIsU0FBUyxDQUFDLE1BQU07QUFBRSxVQUFJLEVBQUUsV0FBVyxRQUFTLFNBQVEsT0FBTztBQUFBLElBQUcsQ0FBQztBQUd4RixVQUFNLGlCQUFpQixTQUFTLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDO0FBRTFELFVBQU0sWUFBWTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQXVDbEIsVUFBTSxjQUFjLGNBQWMsRUFBRSxVQUFVLE9BQU8sS0FBSyxPQUFPO0FBQ2pFLFVBQU0sY0FBYyxnQ0FBZ0MsRUFBRSxVQUFVLE9BQU8sS0FBSyx5QkFBeUI7QUFDckcscUJBQWlCLE1BQU0sY0FBYyxVQUFVLEdBQUcsT0FBTyxLQUFLLFlBQVksQ0FBQztBQUMzRSxxQkFBaUIsTUFBTSxjQUFjLFVBQVUsR0FBRyxPQUFPLEtBQUssWUFBWSxDQUFDO0FBRzNFLFVBQU0sY0FBYyxjQUFjLEdBQUcsaUJBQWlCLFVBQVUsT0FBSyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUM3RyxVQUFNLGNBQWMsZ0NBQWdDLEdBQUcsaUJBQWlCLFVBQVUsT0FBSyxPQUFPLEtBQUssMkJBQTJCLENBQUMsQ0FBQyxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBRWpKLFVBQU0sY0FBYyxVQUFVLEdBQUcsaUJBQWlCLFVBQVUsT0FBSztBQUM3RCxZQUFNLElBQUksa0JBQWtCLEVBQUUsT0FBTyxLQUFLO0FBQUcsYUFBTyxLQUFLLGNBQWMsQ0FBQztBQUFHLHVCQUFpQixFQUFFLFFBQVEsQ0FBQztBQUFBLElBQzNHLENBQUM7QUFDRCxVQUFNLGNBQWMsVUFBVSxHQUFHLGlCQUFpQixVQUFVLE9BQUs7QUFDN0QsWUFBTSxJQUFJLGtCQUFrQixFQUFFLE9BQU8sS0FBSztBQUFHLGFBQU8sS0FBSyxjQUFjLENBQUM7QUFBRyx1QkFBaUIsRUFBRSxRQUFRLENBQUM7QUFBQSxJQUMzRyxDQUFDO0FBR0QsVUFBTSxjQUFjLFlBQVksR0FBRyxpQkFBaUIsU0FBUyxNQUFNO0FBQy9ELGNBQVEsT0FBTztBQUNmLGNBQVEsUUFBUSw4QkFBOEIsV0FBVyxJQUFJO0FBQUEsSUFDakUsQ0FBQztBQUVELFVBQU0sY0FBYyxZQUFZLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUMvRCxhQUFPLEtBQUssR0FBRyxFQUFFLFFBQVEsT0FBSyxZQUFZLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNwRCxrQkFBWTtBQUFHLGNBQVEsT0FBTztBQUM5QixjQUFRLFFBQVEsOEJBQThCLFFBQVEsSUFBSTtBQUFBLElBQzlELENBQUM7QUFHRCxVQUFNLGNBQWMsYUFBYSxHQUFHLGlCQUFpQixTQUFTLE1BQU07QUFDaEUsWUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLEtBQUssVUFBVSxZQUFZLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDNUYsWUFBTSxNQUFNLElBQUksZ0JBQWdCLElBQUk7QUFBRyxZQUFNLElBQUksU0FBUyxjQUFjLEdBQUc7QUFDM0UsUUFBRSxPQUFPO0FBQUssUUFBRSxXQUFXO0FBQStCLFFBQUUsTUFBTTtBQUNsRSxpQkFBVyxNQUFNLElBQUksZ0JBQWdCLEdBQUcsR0FBRyxHQUFJO0FBQUEsSUFDbkQsQ0FBQztBQUdELFVBQU0sY0FBYyxpQkFBaUIsR0FBRyxpQkFBaUIsVUFBVSxPQUFPLE9BQU87QUFDN0UsVUFBSTtBQUNBLGNBQU0sSUFBSSxHQUFHLE9BQU8sUUFBUSxDQUFDO0FBQUcsWUFBSSxDQUFDLEVBQUc7QUFDeEMsY0FBTSxPQUFPLEtBQUssTUFBTSxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQ3RDLFlBQUksUUFBUSxPQUFPLFNBQVMsVUFBVTtBQUNsQyxjQUFJLGFBQWEsS0FBTSxRQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsS0FBSyxPQUFPO0FBQzFELGNBQUksK0JBQStCLEtBQU0sUUFBTyxLQUFLLDJCQUEyQixDQUFDLENBQUMsS0FBSyx5QkFBeUI7QUFDaEgsY0FBSSxrQkFBa0IsS0FBTSxRQUFPLEtBQUssY0FBYyxlQUFlLEtBQUssWUFBWSxDQUFDO0FBQ3ZGLGNBQUksa0JBQWtCLEtBQU0sUUFBTyxLQUFLLGNBQWMsZUFBZSxLQUFLLFlBQVksQ0FBQztBQUN2RixrQkFBUSxPQUFPO0FBQUcsa0JBQVEsUUFBUSxpQ0FBaUMsV0FBVyxJQUFJO0FBQUEsUUFDdEYsTUFBTyxPQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsTUFDMUMsU0FBUyxLQUFLO0FBQ1YsZ0JBQVEsUUFBUSxrQkFBa0IsS0FBSyxXQUFXLEdBQUcsSUFBSSxTQUFTLEdBQUk7QUFBQSxNQUMxRTtBQUFBLElBQ0osQ0FBQztBQUVELHlCQUFxQjtBQUNyQixZQUFRLFlBQVksS0FBSztBQUN6QixLQUFDLFNBQVMsUUFBUSxTQUFTLGlCQUFpQixZQUFZLE9BQU87QUFHL0QsWUFBUSxNQUFNO0FBQUEsRUFDbEI7QUFHQSxXQUFTLGtCQUFrQixHQUFHO0FBQUUsVUFBTSxJQUFJLE9BQU8sT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDO0FBQUcsV0FBTyxPQUFPLFNBQVMsQ0FBQyxJQUFJLElBQUk7QUFBQSxFQUFNO0FBQzFHLFdBQVMsZUFBZSxHQUFHO0FBQUUsVUFBTSxJQUFJLE9BQU8sQ0FBQztBQUFHLFdBQU8sT0FBTyxTQUFTLENBQUMsSUFBSSxJQUFJO0FBQUEsRUFBTTtBQUN4RixXQUFTLGlCQUFpQixPQUFPLEtBQUs7QUFBRSxVQUFNLFFBQVMsT0FBTyxPQUFPLEtBQUssT0FBTyxHQUFHO0FBQUEsRUFBSTtBQUd4RixXQUFTLHVCQUF1QjtBQUM1QixRQUFJLFNBQVMsZUFBZSxxQkFBcUIsRUFBRztBQUNwRCxVQUFNLElBQUksU0FBUyxjQUFjLE9BQU87QUFDeEMsTUFBRSxLQUFLO0FBQ1AsTUFBRSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBK0JoQixhQUFTLEtBQUssWUFBWSxDQUFDO0FBQUEsRUFDL0I7QUFwU0EsTUFFTSxLQVVBLElBQ0EsUUFHQSxVQUlPLE1BT1AsYUFPQSxLQWVBLFFBSUE7QUFyRE47QUFBQTtBQUVBLE1BQU0sTUFBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFRekQsTUFBTSxLQUFNLE9BQU8saUJBQWlCLGVBQWUsYUFBYSxLQUFNLGFBQWEsS0FBSyxPQUFPO0FBQy9GLE1BQU0sU0FBUyxDQUFDLHNDQUFzQztBQUd0RCxNQUFNLFdBQVcsQ0FBQyxDQUFDLFFBQVEsYUFBYSxNQUFNO0FBQzlDLFVBQUksT0FBTyxDQUFDLFNBQVUsU0FBUSxNQUFNLHVDQUF1QztBQUdwRSxNQUFNLE9BQU87QUFBQSxRQUNoQixTQUFTO0FBQUEsUUFDVCwyQkFBMkI7QUFBQSxRQUMzQixjQUFjO0FBQUEsUUFDZCxjQUFjO0FBQUEsTUFDbEI7QUFFQSxNQUFNLGNBQWM7QUFBQSxRQUNoQixTQUFTO0FBQUEsUUFDVCwyQkFBMkI7QUFBQSxRQUMzQixjQUFjO0FBQUEsUUFDZCxjQUFjO0FBQUEsTUFDbEI7QUFFQSxNQUFNLE1BQU07QUFBQSxRQUNSLENBQUMsS0FBSyxPQUFPLEdBQUc7QUFBQSxRQUNoQixDQUFDLEtBQUsseUJBQXlCLEdBQUc7QUFBQSxRQUNsQyxDQUFDLEtBQUssWUFBWSxHQUFHO0FBQUEsUUFDckIsQ0FBQyxLQUFLLFlBQVksR0FBRztBQUFBLE1BQ3pCO0FBVUEsTUFBTSxTQUFTLE9BQUs7QUFDaEIsY0FBTSxJQUFJLGFBQWEsQ0FBQztBQUN4QixlQUFRLE1BQU0sU0FBWSxJQUFJLENBQUMsSUFBSTtBQUFBLE1BQ3ZDO0FBQ0EsTUFBTSxTQUFTLENBQUMsR0FBRyxNQUFNO0FBQUUsb0JBQVksR0FBRyxDQUFDO0FBQUcsb0JBQVk7QUFBQSxNQUFHO0FBc0I3RCwrQkFBeUIsNENBQWtDLFNBQVM7QUFFcEUsVUFBSSxVQUFVO0FBQ1Ysc0JBQWM7QUFDZCxpQkFBUyxjQUFjLGFBQWE7QUFDcEMsbUJBQVcsZUFBZSxHQUFHO0FBQUEsTUFDakM7QUFBQTtBQUFBOzs7QUN2RUEsaUJBQU8sMEJBQWlELEtBQUssVUFBVSxPQUFPO0FBQzFFLFVBQU0sU0FBUyxDQUFDO0FBQ2hCLFFBQUksQ0FBQyxVQUFVLDBCQUEyQixRQUFPO0FBRWpELFVBQU0sT0FBUSxPQUFPLGlCQUFpQixjQUFjLGVBQWU7QUFDbkUsVUFBTUMsTUFBTSxLQUFLLE1BQU0sQ0FBQztBQUN4QixVQUFNLGdCQUFnQixDQUFDLE9BQU87QUFDMUIsWUFBTSxPQUFPQSxLQUFJLE1BQU0sTUFBTTtBQUM3QixhQUFRLE9BQU8sU0FBUyxhQUFjLEtBQUssRUFBRSxJQUFJLEdBQUc7QUFBQSxJQUN4RDtBQUdBLFVBQU0sTUFBTUEsSUFBRyxNQUFNLE1BQU0scUJBQ3JCQSxJQUFHLEtBQUssS0FBSyxtQkFBbUIsRUFBRSxJQUFJLE1BQU0sUUFBUSxTQUFTLGNBQWMsY0FBYyxDQUFDLElBQzFGO0FBRU4sVUFBTSxzQkFBc0I7QUFDNUIsVUFBTSxtQkFBbUI7QUFFekIsbUJBQWUsVUFBVTtBQUNyQixZQUFNLE9BQVEsT0FBTyxLQUFLLGtCQUFrQixhQUN0QyxNQUFNLEtBQUssY0FBYyxJQUN4QkEsS0FBSSxNQUFNO0FBQ2pCLFVBQUksQ0FBQyxLQUFNLE9BQU0sSUFBSSxNQUFNLDJCQUEyQjtBQUN0RCxhQUFPO0FBQUEsSUFDWDtBQUdBLGFBQVMsd0JBQXdCO0FBQzdCLFVBQUk7QUFBRSxnQkFBUSxlQUFlLFFBQVEsVUFBVSxLQUFLLElBQUksS0FBSztBQUFBLE1BQUcsUUFBUTtBQUFFLGVBQU87QUFBQSxNQUFJO0FBQUEsSUFDekY7QUFHQSxtQkFBZSxzQkFBc0IsSUFBSTtBQUNyQyxZQUFNLE9BQU8sT0FBTyxFQUFFO0FBQ3RCLFVBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxTQUFTLElBQUksS0FBSyxRQUFRLEVBQUcsUUFBTyxzQkFBc0I7QUFFL0UsVUFBSTtBQUNBLFlBQUksQ0FBQyxJQUFLLFFBQU8sc0JBQXNCO0FBRXZDLGNBQU0sRUFBRSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUk7QUFDN0IsY0FBTSxLQUFLLDRCQUE0QjtBQUV2QyxZQUFJLE9BQU8sTUFBTSxLQUFLLFlBQVk7QUFDbEMsWUFBSSxDQUFDLE1BQU0sVUFBVTtBQUNqQixnQkFBTSxPQUFPLE1BQU0sUUFBUTtBQUMzQixjQUFJLE1BQU0sUUFBUTtBQUNkLGtCQUFNLE9BQU8sTUFBTSxjQUFjLE1BQU0sS0FBSyxPQUFPLHFCQUFxQixFQUFFLFdBQVcsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3BHLGtCQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsS0FBSyxDQUFDLElBQUk7QUFDN0Qsa0JBQU0sVUFBVSxPQUFPLFlBQVk7QUFDbkMsZ0JBQUksV0FBVyxNQUFNO0FBQ2pCLG9CQUFNLEtBQUssY0FBYyxFQUFFLFdBQVcsTUFBTSxVQUFVLFNBQVMseUJBQXlCLEtBQUssSUFBSSxFQUFFLENBQUM7QUFDcEcscUJBQU8sTUFBTSxLQUFLLFlBQVk7QUFBQSxZQUNsQztBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQ0EsY0FBTSxLQUFLLE1BQU07QUFDakIsZUFBUSxNQUFNLE9BQU8sc0JBQXNCLElBQUksT0FBTyxFQUFFLEVBQUUsS0FBSztBQUFBLE1BQ25FLFFBQVE7QUFDSixlQUFPLHNCQUFzQjtBQUFBLE1BQ2pDO0FBQUEsSUFDSjtBQUdBLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxJQUFJLGtCQUFrQixRQUFRLEdBQUc7QUFDeEQsWUFBTSxNQUFNLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxJQUFJO0FBQzlELFlBQU0sZ0JBQWdCLE1BQU0sSUFBSSxLQUFLLFlBQVksRUFBRSxRQUFRLEtBQUssQ0FBQztBQUdqRSxZQUFNLGtCQUFrQixNQUFNLHNCQUFzQixhQUFhO0FBR2pFLFlBQU0sZ0JBQWdCLG9CQUFJLElBQUk7QUFDOUIsaUJBQVcsT0FBTyxPQUFPO0FBQ3JCLGNBQU0sS0FBSyxNQUFNLElBQUksS0FBSyxXQUFXLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDckQsWUFBSSxPQUFPLFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsR0FBRztBQUMvQyx3QkFBYyxJQUFJLElBQUksR0FBRztBQUFBLFFBQzdCO0FBQUEsTUFDSjtBQUVBLGlCQUFXLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDcEMsY0FBTSxTQUFTLE9BQU8sTUFBTSxJQUFJLEdBQUcsY0FBYyxFQUFFLE1BQU0sS0FBSyxDQUFDLEtBQUssRUFBRTtBQUN0RSxZQUFJLE9BQU8sWUFBWSxNQUFNLFFBQVM7QUFFdEMsY0FBTSxhQUFhLGlCQUFpQixNQUFNLElBQUksR0FBRyxZQUFZLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDN0UsY0FBTSxZQUFZLE1BQU0sSUFBSSxHQUFHLFdBQVcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMxRCxjQUFNLFdBQVcsT0FBTyxNQUFNLElBQUksR0FBRyxVQUFVLEVBQUUsTUFBTSxLQUFLLENBQUMsS0FBSyxFQUFFO0FBS3BFLGNBQU0sYUFBYSxDQUFDLENBQUM7QUFDckIsY0FBTSxnQkFBZ0IsYUFBYSxHQUFHLGVBQWUsTUFBTTtBQUMzRCxjQUFNLGlCQUFpQixTQUFTLFdBQVcsYUFBYTtBQUd4RCxZQUFJLGdCQUFnQjtBQUNoQixpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTO0FBQUEsWUFDVCxNQUFNLEVBQUUsUUFBUSxTQUFTLFVBQVUsWUFBWSxTQUFTLFdBQVcsUUFBUSxVQUFVLElBQUksa0JBQWtCLFNBQVMsTUFBTTtBQUFBLFVBQzlILENBQUM7QUFDRDtBQUFBLFFBQ0o7QUFHQSxjQUFNLGdCQUFnQixHQUFHLGFBQWEsR0FBRyxRQUFRO0FBRWpELGNBQU0sT0FBTztBQUFBLFVBQ1QsV0FBVyxPQUFPLGNBQWMsRUFBRTtBQUFBLFVBQ2xDLFVBQVUsT0FBTyxhQUFhLEVBQUU7QUFBQSxVQUNoQyxTQUFTLE9BQU8saUJBQWlCLEVBQUU7QUFBQSxVQUNuQyxhQUFhO0FBQUEsUUFDakI7QUFFQSxZQUFJO0FBQ0EsZ0JBQU0sT0FBTyxNQUFNLFFBQVE7QUFDM0IsY0FBSSxDQUFDLE1BQU0sT0FBUSxPQUFNLElBQUksTUFBTSx5QkFBeUI7QUFJNUQsZ0JBQU0sY0FBYyxNQUFNLEtBQUssT0FBTyxrQkFBa0IsSUFBSSxDQUFDO0FBRTdELGlCQUFPLEtBQUs7QUFBQSxZQUNSLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxZQUNQLGNBQWM7QUFBQSxZQUNkLFNBQVMsaUJBQVksS0FBSyxPQUFPO0FBQUEsWUFDakMsTUFBTSxFQUFFLFFBQVEsU0FBUyxVQUFVLFlBQVksU0FBUyxXQUFXLFFBQVEsVUFBVSxJQUFJLGtCQUFrQixTQUFTLEtBQUs7QUFBQSxVQUM3SCxDQUFDO0FBQUEsUUFDTCxTQUFTLEtBQUs7QUFDVixpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTLE1BQU0sZ0JBQWdCLFlBQVksS0FBSyxXQUFXLEdBQUc7QUFBQSxZQUM5RCxNQUFNLEVBQUUsUUFBUSxTQUFTLFVBQVUsWUFBWSxTQUFTLFdBQVcsUUFBUSxVQUFVLElBQUksa0JBQWtCLFNBQVMsTUFBTTtBQUFBLFVBQzlILENBQUM7QUFBQSxRQUNMO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFFQSxXQUFPO0FBQUEsRUFDWDtBQTNKQTtBQUFBO0FBOEpBLGdDQUEwQixPQUFPLEVBQUUsSUFBSSw2QkFBNkIsT0FBTyx5QkFBeUI7QUFBQTtBQUFBOzs7QUN2SnJGLFdBQVIsYUFBOEIsS0FBSyxVQUFVLE9BQU87QUFDdkQsVUFBTSxNQUFNLE9BQU8sU0FBUyxZQUFZO0FBQ3hDLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRyxFQUFHLFFBQU8sQ0FBQztBQUVuQyxVQUFNLFNBQVMsQ0FBQztBQUNoQixVQUFNLFFBQVEsQ0FBQyxNQUFNO0FBQ2pCLFVBQUksS0FBSyxLQUFNLFFBQU87QUFDdEIsWUFBTSxJQUFJLE9BQU8sT0FBTyxNQUFNLGFBQWEsRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLO0FBQ3pELFVBQUksQ0FBQyxFQUFHLFFBQU87QUFDZixhQUFPLE9BQU8sRUFBRSxRQUFRLFlBQVksRUFBRSxDQUFDO0FBQUEsSUFDM0M7QUFFQSxlQUFXLENBQUMsSUFBSSxLQUFLLEtBQUssSUFBSSxrQkFBa0IsUUFBUSxHQUFHO0FBQ3ZELGlCQUFXLEtBQUssT0FBTztBQUNuQixjQUFNLE1BQU0sTUFBTSxJQUFJLEdBQUcsVUFBVSxLQUFLO0FBQ3hDLGNBQU0sTUFDRixNQUFNLElBQUksR0FBRyx1QkFBdUIsS0FDcEMsTUFBTSxJQUFJLEdBQUcsaUJBQWlCLEtBQzlCLE1BQU0sSUFBSSxHQUFHLFdBQVc7QUFFNUIsY0FBTSxNQUFNLE1BQU0sR0FBRztBQUdyQixjQUFNLGdCQUFnQixDQUFDLFdBQVc7QUFDOUIsZ0JBQU0sSUFBSSxPQUFPLE9BQU8sV0FBVyxhQUFhLE9BQU8sSUFBSSxVQUFVLEVBQUU7QUFDdkUsY0FBSSxLQUFLLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDekIsY0FBSSxJQUFJLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDeEIsY0FBSSxJQUFJLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDeEIsaUJBQU8sVUFBVSxnQkFBZ0I7QUFBQSxRQUNyQztBQUVBLGNBQU0sV0FBVyxjQUFjLEdBQUc7QUFDbEMsY0FBTSxXQUFXLElBQUksS0FBSyxhQUFhLFNBQVMsRUFBRSxPQUFPLFlBQVksVUFBVSx1QkFBdUIsRUFBRSxDQUFDO0FBQ3pHLGNBQU0sU0FBUyxJQUFJLEtBQUssYUFBYSxTQUFTLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztBQUUxRSxZQUFJLE9BQU8sU0FBUyxHQUFHLEtBQUssTUFBTSxLQUFLO0FBQ25DLGdCQUFNLFdBQVcsQ0FBQyxNQUFNLE9BQU8sU0FBUyxDQUFDLElBQUksU0FBUyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUM7QUFFMUUsaUJBQU8sS0FBSztBQUFBLFlBQ1IsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLFlBQ1AsY0FBYztBQUFBLFlBQ2QsU0FBUyxjQUFjLFNBQVMsR0FBRyxDQUFDLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFBQSxZQUMzRCxNQUFNLEVBQUUsU0FBUyxLQUFLLFNBQVMsS0FBSyxLQUFLLFNBQVM7QUFBQSxVQUN0RCxDQUFDO0FBQUEsUUFDTDtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBRUEsV0FBTztBQUFBLEVBQ1g7QUF6REE7QUFBQTtBQTJEQSxtQkFBYSxPQUFPLEVBQUUsSUFBSSxnQkFBZ0IsT0FBTyxpQkFBaUI7QUFBQTtBQUFBOzs7QUMxRG5ELFdBQVIsYUFBOEIsS0FBSyxVQUFVLE9BQU87QUFFdkQsVUFBTSxNQUFNLE9BQU8sU0FBUyxZQUFZO0FBQ3hDLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRyxFQUFHLFFBQU8sQ0FBQztBQUVuQyxVQUFNLFNBQVMsQ0FBQztBQUdoQixVQUFNLFFBQVEsQ0FBQyxNQUFNO0FBQ2pCLFVBQUksS0FBSyxLQUFNLFFBQU87QUFDdEIsWUFBTSxJQUFJLE9BQU8sT0FBTyxNQUFNLGFBQWEsRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLO0FBQ3pELFVBQUksQ0FBQyxFQUFHLFFBQU87QUFDZixhQUFPLE9BQU8sRUFBRSxRQUFRLFlBQVksRUFBRSxDQUFDO0FBQUEsSUFDM0M7QUFHQSxlQUFXLENBQUMsSUFBSSxLQUFLLEtBQUssSUFBSSxrQkFBa0IsUUFBUSxHQUFHO0FBQ3ZELGlCQUFXLEtBQUssT0FBTztBQUNuQixjQUFNLE1BQU0sTUFBTSxJQUFJLEdBQUcsVUFBVSxLQUFLO0FBR3hDLGNBQU0sTUFDRixNQUFNLElBQUksR0FBRyx1QkFBdUIsS0FDcEMsTUFBTSxJQUFJLEdBQUcsaUJBQWlCLEtBQzlCLE1BQU0sSUFBSSxHQUFHLFdBQVc7QUFFNUIsY0FBTSxNQUFNLE1BQU0sR0FBRztBQUdyQixjQUFNLGdCQUFnQixDQUFDLFdBQVc7QUFDOUIsZ0JBQU0sSUFBSSxPQUFPLE9BQU8sV0FBVyxhQUFhLE9BQU8sSUFBSyxVQUFVLEVBQUcsRUFBRSxLQUFLO0FBQ2hGLGNBQUksS0FBSyxLQUFLLENBQUMsRUFBRyxRQUFPO0FBQ3pCLGNBQUksSUFBSSxLQUFLLENBQUMsRUFBRyxRQUFPO0FBQ3hCLGNBQUksSUFBSSxLQUFLLENBQUMsRUFBRyxRQUFPO0FBQ3hCLGlCQUFPLFVBQVUsZ0JBQWdCO0FBQUEsUUFDckM7QUFFQSxjQUFNLFdBQVcsY0FBYyxHQUFHO0FBQ2xDLGNBQU0sV0FBVyxJQUFJLEtBQUssYUFBYSxTQUFTLEVBQUUsT0FBTyxZQUFZLFVBQVUsdUJBQXVCLEVBQUUsQ0FBQztBQUV6RyxZQUFJLE9BQU8sU0FBUyxHQUFHLEtBQUssTUFBTSxLQUFLO0FBQ25DLGdCQUFNLFdBQVcsQ0FBQyxNQUFNLE9BQU8sU0FBUyxDQUFDLElBQUksU0FBUyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUM7QUFDMUUsaUJBQU8sS0FBSztBQUFBLFlBQ1IsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLFlBQ1AsY0FBYztBQUFBLFlBQ2QsU0FBUyxjQUFjLFNBQVMsR0FBRyxDQUFDLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFBQSxZQUMzRCxNQUFNLEVBQUUsU0FBUyxLQUFLLFNBQVMsS0FBSyxLQUFLLFNBQVM7QUFBQSxVQUN0RCxDQUFDO0FBQUEsUUFDTDtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBRUEsV0FBTztBQUFBLEVBQ1g7QUF2REE7QUFBQTtBQXlEQSxtQkFBYSxPQUFPLEVBQUUsSUFBSSxnQkFBZ0IsT0FBTyxpQkFBaUI7QUFBQTtBQUFBOzs7QUN6RGxFLE1BTU87QUFOUDtBQUFBO0FBQ0E7QUFFQTtBQUNBO0FBRUEsTUFBTyxnQkFBUSxDQUFDLDJCQUEyQixjQUFjLFlBQVk7QUFBQTtBQUFBOzs7QUNOckU7QUFBQTtBQUFBO0FBQUE7QUFHQSxpQkFBc0IsY0FBY0MsVUFBUyxVQUFVO0FBQ25ELFVBQU1BLFNBQVEsa0JBQWtCLGNBQWMsRUFBRSxXQUFXLE1BQU0sV0FBVyxLQUFNLENBQUM7QUFFbkYsVUFBTUMsTUFBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUNoRCxVQUFNLE1BQU8sUUFBUUEsT0FBTSxPQUFPQSxJQUFHLFlBQVksYUFBY0EsSUFBRyxRQUFRLElBQUksSUFBSTtBQUNsRixRQUFJLENBQUMsSUFBSyxRQUFPLEVBQUUsSUFBSSxNQUFNLFFBQVEsQ0FBQyxFQUFFO0FBRXhDLFVBQU0sT0FBUSxLQUFLLFlBQVksT0FBUyxLQUFLLFlBQVksUUFBUyxDQUFDO0FBQ25FLFVBQU0sb0JBQW9CLG9CQUFJLElBQUk7QUFDbEMsZUFBVyxLQUFLLE1BQU07QUFDbEIsWUFBTSxLQUFLRCxTQUFRLFlBQVksR0FBRyxjQUFjLEtBQUs7QUFDckQsT0FBQyxrQkFBa0IsSUFBSSxFQUFFLEtBQUssa0JBQWtCLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUM7QUFBQSxJQUMvRTtBQUVBLFVBQU0scUJBQXFCLG9CQUFJLElBQUk7QUFDbkMsZUFBVyxDQUFDLElBQUksS0FBSyxLQUFLLGtCQUFrQixRQUFRLEdBQUc7QUFDbkQsWUFBTSxJQUFJLE1BQU0sS0FBSyxPQUFLQSxTQUFRLFlBQVksR0FBRyxtQkFBbUIsTUFBTSxDQUFDLEtBQUssTUFBTSxDQUFDO0FBQ3ZGLHlCQUFtQixJQUFJLElBQUksQ0FBQztBQUFBLElBQ2hDO0FBRUEsVUFBTSxNQUFNO0FBQUEsTUFDUjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxVQUFVQSxTQUFRLEtBQUssdUJBQXVCO0FBQUEsTUFDOUMsWUFBWUEsU0FBUSxLQUFLLG1CQUFtQjtBQUFBLElBQ2hEO0FBRUEsVUFBTSxRQUFRLEVBQUUsS0FBSyxDQUFDLEtBQUssTUFBTSxTQUFTQSxTQUFRLFlBQVksS0FBSyxNQUFNLElBQUksRUFBRTtBQUUvRSxVQUFNLFVBQVUsTUFBTSxRQUFRLElBQUksY0FBTSxJQUFJLFVBQVEsS0FBSyxLQUFLLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFDL0UsVUFBTSxZQUFZLFFBQVEsS0FBSztBQUMvQixVQUFNLEtBQUssVUFBVSxNQUFNLE9BQUssRUFBRSxVQUFVLE9BQU87QUFHbkQsVUFBTSxRQUFRLENBQUMsTUFBTSxPQUFPLE9BQU8sS0FBSyxFQUFFLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUNuRSxVQUFNLGdCQUFnQixDQUFDLFFBQVE7QUFFM0IsVUFBSSxLQUFLLE1BQU0sTUFBTyxRQUFPLElBQUksS0FBSztBQUN0QyxVQUFJLEtBQUssTUFBTTtBQUNYLGNBQU0sSUFBSSxPQUFPLElBQUksSUFBSTtBQUV6QixjQUFNLE9BQU8sRUFBRSxNQUFNLEdBQUcsRUFBRSxJQUFJO0FBQzlCLGVBQU8sT0FDRCxLQUFLLFFBQVEsbUJBQW1CLE9BQU8sRUFDcEMsUUFBUSxNQUFNLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxJQUN2QztBQUFBLE1BQ1Y7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUdBLFVBQU0sVUFBVSxvQkFBSSxJQUFJO0FBQ3hCLGFBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLFFBQVEsS0FBSztBQUN0QyxZQUFNLElBQUksSUFBSSxLQUFLLENBQUM7QUFDcEIsWUFBTSxhQUFhLElBQUk7QUFDdkIsWUFBTSxTQUFTLE1BQU0sSUFBSSxHQUFHLFVBQVUsRUFBRSxNQUFNLEtBQUssQ0FBQyxLQUFLO0FBQ3pELGNBQVEsSUFBSSxHQUFHLEVBQUUsWUFBWSxPQUFPLENBQUM7QUFBQSxJQUN6QztBQUdBLFVBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFDakMsZUFBVyxDQUFDLElBQUksT0FBTyxLQUFLLElBQUksbUJBQW1CLFFBQVEsR0FBRztBQUMxRCxZQUFNLE9BQU8sUUFBUSxJQUFJLE9BQU8sS0FBSyxFQUFFLFlBQVksTUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLFVBQVUsRUFBRSxNQUFNLEtBQUssQ0FBQyxLQUFLLEdBQUc7QUFDcEgsdUJBQWlCLElBQUksSUFBSSxJQUFJO0FBQUEsSUFDakM7QUFHQSxVQUFNLGFBQWEsb0JBQUksSUFBSTtBQUMzQixhQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSyxRQUFRLEtBQUs7QUFDdEMsWUFBTSxNQUFNLElBQUksS0FBSyxDQUFDO0FBQ3RCLFlBQU0sYUFBYSxJQUFJO0FBQ3ZCLFlBQU0sWUFBWSxNQUFNLElBQUksS0FBSyxhQUFhLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDOUQsaUJBQVcsSUFBSSxZQUFZLFNBQVM7QUFBQSxJQUN4QztBQUVBLFVBQU0sU0FBUyxVQUFVLElBQUksU0FBTztBQUNoQyxZQUFNLE1BQU0sSUFBSSxnQkFBZ0I7QUFDaEMsWUFBTSxPQUFPLGlCQUFpQixJQUFJLEdBQUcsS0FBSyxFQUFFLFlBQVksTUFBTSxRQUFRLEdBQUc7QUFDekUsYUFBTztBQUFBLFFBQ0gsR0FBRztBQUFBLFFBQ0gsWUFBWSxLQUFLO0FBQUEsUUFDakIsUUFBUSxLQUFLO0FBQUEsUUFDYixXQUFXLGNBQWMsR0FBRztBQUFBLFFBQzVCLFdBQVcsV0FBVyxJQUFJLEtBQUssY0FBYyxFQUFFO0FBQUEsTUFDbkQ7QUFBQSxJQUNKLENBQUM7QUFJRCxJQUFBQSxTQUFRLFFBQVFBLFNBQVEsU0FBUyxDQUFDO0FBQ2xDLElBQUFBLFNBQVEsTUFBTSxpQkFBaUIsRUFBRSxJQUFJLEtBQUssSUFBSSxHQUFHLElBQUksT0FBTztBQUU1RCxXQUFPLEVBQUUsSUFBSSxPQUFPO0FBQUEsRUFDeEI7QUFsR0E7QUFBQTtBQUNBO0FBQUE7QUFBQTs7O0FDb0hBOzs7QUNsSEE7QUFDQTtBQUdBLE1BQU1FLE1BQU0sT0FBTyxpQkFBaUIsZUFBZSxhQUFhLEtBQU0sYUFBYSxLQUFLLE9BQU87QUFHL0YsV0FBUyxtQkFBbUIsUUFBUTtBQUNoQyxRQUFJO0FBQ0EsWUFBTSxRQUFRLE1BQU0sUUFBUSxNQUFNLElBQUksU0FBUyxDQUFDO0FBQ2hELFlBQU0sTUFBTSxNQUFNLE9BQU8sQ0FBQyxLQUFLLE9BQU87QUFDbEMsY0FBTSxNQUFNLE9BQU8sSUFBSSxTQUFTLE1BQU0sRUFBRSxZQUFZO0FBQ3BELFlBQUksR0FBRyxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUs7QUFDN0IsWUFBSSxJQUFJLGdCQUFnQixLQUFNLEtBQUksTUFBTSxJQUFJLEdBQUcsWUFBWTtBQUMzRCxlQUFPO0FBQUEsTUFDWCxHQUFHLEVBQUUsT0FBTyxHQUFHLFNBQVMsR0FBRyxNQUFNLEdBQUcsT0FBTyxvQkFBSSxJQUFJLEVBQUUsQ0FBQztBQUV0RCxZQUFNLGFBQWEsSUFBSSxNQUFNO0FBQzdCLFlBQU0sT0FBTyxDQUFDO0FBQ2QsVUFBSSxJQUFJLE1BQU8sTUFBSyxLQUFLLEdBQUcsSUFBSSxLQUFLLFNBQVMsSUFBSSxVQUFVLElBQUksS0FBSyxHQUFHLEVBQUU7QUFDMUUsVUFBSSxJQUFJLFFBQVMsTUFBSyxLQUFLLEdBQUcsSUFBSSxPQUFPLFdBQVcsSUFBSSxZQUFZLElBQUksS0FBSyxHQUFHLEVBQUU7QUFDbEYsVUFBSSxJQUFJLEtBQU0sTUFBSyxLQUFLLEdBQUcsSUFBSSxJQUFJLE9BQU87QUFDMUMsWUFBTSxZQUFZLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFFckMsYUFBTyxHQUFHLFNBQVMsV0FBVyxjQUFjLENBQUMsUUFBUSxlQUFlLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDcEYsUUFBUTtBQUNKLGFBQU87QUFBQSxJQUNYO0FBQUEsRUFDSjtBQUdBLGlCQUFlLG1CQUFtQjtBQUM5QixRQUFJO0FBQ0EsWUFBTSxTQUFTLFNBQVMsY0FBYyxZQUFZO0FBQ2xELFlBQU0sU0FBUyxVQUFVQSxLQUFJLFVBQVUsTUFBTTtBQUU3QyxVQUFJLE9BQU8sUUFBUSxZQUFZLFNBQVMsWUFBWTtBQUNoRCxjQUFNLE9BQU8sV0FBVyxLQUFLO0FBQzdCLGVBQU87QUFBQSxNQUNYO0FBQ0EsVUFBSSxPQUFPLFFBQVEsWUFBWSxZQUFZO0FBQ3ZDLGVBQU8sUUFBUTtBQUNmLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSixRQUFRO0FBQUEsSUFBZ0I7QUFHeEIsUUFBSTtBQUNBLFlBQU0sTUFBTSxjQUFjLE1BQU0sYUFBYTtBQUM3QyxVQUFJLEtBQUssY0FBYztBQUNuQixjQUFNLFNBQVUsT0FBTyxJQUFJLGVBQWUsYUFBYyxJQUFJLFdBQVcsSUFBSSxJQUFJO0FBQy9FLFlBQUksYUFBYSxNQUFNO0FBQ3ZCLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSixRQUFRO0FBQUEsSUFBZ0I7QUFFeEIsV0FBTztBQUFBLEVBQ1g7QUFJQSxNQUFNLGFBQWE7QUFFbkIsaUJBQWUsT0FBTyxPQUFPLEVBQUUsT0FBTyxNQUFNLEdBQUc7QUFDM0MsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDekIsWUFBTSxTQUFVLE9BQU8sZUFBZSxjQUFjO0FBQ3BELFVBQUksT0FBTyxXQUFXLFlBQVk7QUFDOUIsWUFBSTtBQUFFLGdCQUFNLE1BQU0sTUFBTSxPQUFPLElBQUk7QUFBRyxjQUFJLElBQUssUUFBTztBQUFBLFFBQUssUUFBUTtBQUFBLFFBQUU7QUFBQSxNQUN6RTtBQUNBLFlBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQzdDO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFFQSxXQUFTLG9CQUFvQixTQUFTLENBQUMsR0FBRztBQUN0QywyQkFBdUI7QUFHdkIsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsS0FBSztBQUNiLFdBQU8sT0FBTyxRQUFRLE9BQU87QUFBQSxNQUN6QixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsSUFDWixDQUFDO0FBRUQsVUFBTSxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQzFDLFVBQU0sS0FBSztBQUNYLFVBQU0sWUFBWTtBQUNsQixXQUFPLE9BQU8sTUFBTSxPQUFPO0FBQUEsTUFDdkIsVUFBVTtBQUFBLE1BQ1YsS0FBSztBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsT0FBTztBQUFBLElBQ1gsQ0FBQztBQUdELFVBQU0sU0FBUyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDdEMsWUFBTSxNQUFPLEVBQUUsYUFBYSxPQUFPO0FBQ25DLFlBQU0sTUFBTyxFQUFFLGFBQWEsT0FBTztBQUNuQyxVQUFJLFFBQVEsSUFBSyxRQUFPLE1BQU07QUFDOUIsWUFBTSxNQUFNLE9BQU8sRUFBRSxVQUFVLEVBQUU7QUFDakMsWUFBTSxNQUFNLE9BQU8sRUFBRSxVQUFVLEVBQUU7QUFDakMsVUFBSSxRQUFRLElBQUssUUFBTyxJQUFJLGNBQWMsR0FBRztBQUM3QyxZQUFNLE1BQU0sT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUU7QUFDOUMsWUFBTSxNQUFNLE9BQU8sRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFO0FBQzlDLGFBQU8sSUFBSSxjQUFjLEdBQUc7QUFBQSxJQUNoQyxDQUFDO0FBRUQsUUFBSSxXQUFXLE1BQU0sV0FBVyxNQUFNLFdBQVc7QUFDakQsVUFBTSxXQUFXLE9BQU8sSUFBSSxTQUFPO0FBQy9CLFlBQU0sT0FBTyxJQUFJLFNBQVMsSUFBSSxZQUFZO0FBQzFDLFlBQU0sV0FBWSxRQUFRLFVBQVcsb0JBQXFCLFFBQVEsVUFBVSxRQUFRLFlBQWEsbUJBQW1CO0FBQ3BILFlBQU0sVUFBVSx5QkFBeUIsUUFBUSxLQUFLLE9BQU8sTUFBTTtBQUNuRSxZQUFNLFNBQVMsSUFBSSxXQUFXO0FBQzlCLFlBQU0sT0FBTyxPQUFPLElBQUksYUFBYSxJQUFJLFFBQVEsWUFBWTtBQUc3RCxZQUFNLFdBQVksSUFBSSxjQUFjLFdBQWEsSUFBSSxhQUFhLEtBQU07QUFDeEUsWUFBTSxXQUFZLGFBQWEsTUFBTyxJQUFJLFdBQVcsV0FBYyxJQUFJLFVBQVUsS0FBTTtBQUN2RixZQUFNLGtCQUFtQixhQUFhLE1BQU0sYUFBYTtBQUN6RCxZQUFNLFdBQVksQ0FBQyxtQkFBbUIsU0FBUyxXQUFZLE9BQU87QUFFbEUsaUJBQVcsSUFBSTtBQUNmLGlCQUFXLElBQUk7QUFDZixpQkFBVztBQUVYLGFBQU87QUFBQSxrQkFDRyxJQUFJLGdCQUFnQixFQUFFLGdCQUFnQixPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7QUFBQSxVQUNwRSxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsVUFDUixPQUFPO0FBQUEsVUFDUCxNQUFNO0FBQUE7QUFBQSxJQUVaLENBQUMsRUFBRSxLQUFLLEVBQUU7QUFHVixVQUFNLFlBQVk7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxlQW1CUCxZQUFZLDRFQUE0RTtBQUFBO0FBQUE7QUFBQTtBQU9uRyxVQUFNLGNBQWMsWUFBWSxHQUFHLGlCQUFpQixTQUFTLE1BQU0sUUFBUSxPQUFPLENBQUM7QUFDbkYsWUFBUSxpQkFBaUIsU0FBUyxDQUFDLE1BQU07QUFBRSxVQUFJLEVBQUUsV0FBVyxRQUFTLFNBQVEsT0FBTztBQUFBLElBQUcsQ0FBQztBQUd4RixVQUFNLGNBQWMsT0FBTyxHQUFHLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUMzRCxZQUFNLEtBQUssRUFBRSxPQUFPLFFBQVEsSUFBSTtBQUFHLFVBQUksQ0FBQyxHQUFJO0FBQzVDLFlBQU0sTUFBTSxHQUFHLGFBQWEsVUFBVTtBQUN0QyxVQUFJLENBQUMsSUFBSztBQUVWLDZCQUF1QjtBQUN2QixZQUFNLE1BQU0sMEJBQTBCLEdBQUc7QUFDekMsVUFBSSxLQUFLO0FBQ0wsaUJBQVMsaUJBQWlCLGVBQWUsRUFBRSxRQUFRLFFBQU0sR0FBRyxVQUFVLE9BQU8sY0FBYyxDQUFDO0FBQzVGLFlBQUksVUFBVSxJQUFJLGNBQWM7QUFDaEMsWUFBSSxlQUFlLEVBQUUsT0FBTyxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFDOUQ7QUFBQSxJQUNKLENBQUM7QUFHRCxVQUFNLGNBQWMsaUJBQWlCLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUNwRSxZQUFNLE1BQU07QUFBQSxRQUNSLENBQUMsUUFBUSxhQUFhLFVBQVUsZ0JBQWdCLFFBQVEsU0FBUyxRQUFRLEVBQUUsS0FBSyxHQUFHO0FBQUEsUUFDbkYsR0FBRyxPQUFPLElBQUksT0FBSztBQUNmLGdCQUFNLE1BQU0sQ0FBQyxNQUFNO0FBQ2Ysa0JBQU0sSUFBSSxPQUFPLEtBQUssRUFBRTtBQUN4QixtQkFBTyxTQUFTLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxRQUFRLE1BQU0sSUFBSSxDQUFDLE1BQU07QUFBQSxVQUM3RDtBQUNBLGlCQUFPO0FBQUEsWUFDSCxFQUFFLGNBQWM7QUFBQSxZQUNoQixFQUFFLGFBQWE7QUFBQSxZQUNmLEVBQUUsVUFBVTtBQUFBLFlBQ1osRUFBRSxnQkFBZ0I7QUFBQSxZQUNsQixFQUFFLGFBQWEsRUFBRSxRQUFRO0FBQUEsWUFDekIsRUFBRSxTQUFTO0FBQUEsWUFDWCxFQUFFLFdBQVc7QUFBQSxVQUNqQixFQUFFLElBQUksR0FBRyxFQUFFLEtBQUssR0FBRztBQUFBLFFBQ3ZCLENBQUM7QUFBQSxNQUNMLEVBQUUsS0FBSyxJQUFJO0FBRVgsWUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLEdBQUcsR0FBRyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ2pELFlBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJO0FBQ3BDLFlBQU0sSUFBSSxTQUFTLGNBQWMsR0FBRztBQUNwQyxRQUFFLE9BQU87QUFBSyxRQUFFLFdBQVc7QUFBNEIsUUFBRSxNQUFNO0FBQy9ELGlCQUFXLE1BQU0sSUFBSSxnQkFBZ0IsR0FBRyxHQUFHLEdBQUk7QUFBQSxJQUNuRCxDQUFDO0FBRUQsWUFBUSxZQUFZLEtBQUs7QUFDekIsS0FBQyxTQUFTLFFBQVEsU0FBUyxpQkFBaUIsWUFBWSxPQUFPO0FBQy9ELFFBQUk7QUFBRSxjQUFRLGFBQWEsWUFBWSxJQUFJO0FBQUcsY0FBUSxNQUFNO0FBQUEsSUFBRyxRQUFRO0FBQUEsSUFBRTtBQUN6RSxZQUFRLGlCQUFpQixXQUFXLENBQUMsTUFBTTtBQUFFLFVBQUksRUFBRSxRQUFRLFNBQVUsU0FBUSxPQUFPO0FBQUEsSUFBRyxDQUFDO0FBQUEsRUFFNUY7QUFHQSxpQkFBc0Isc0JBQXNCQyxVQUFTO0FBQ2pELFVBQU0sTUFBTSxNQUFNLE9BQU8sRUFBRSxPQUFPLE1BQU0sQ0FBQztBQUN6QyxRQUFJLENBQUMsS0FBSyxlQUFnQixRQUFPLE1BQU07QUFBQSxJQUFFO0FBR3pDLFFBQUksSUFBSSxPQUFPLEdBQUcsU0FBUyxVQUFVLEVBQUcsUUFBTyxNQUFNO0FBQUEsSUFBRTtBQUV2RCxRQUFJLFFBQVE7QUFDWixRQUFJLGVBQWUsUUFBUTtBQUFBLE1BQ3ZCLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxNQUNQLFFBQVE7QUFBQSxNQUNSLFNBQVMsWUFBWTtBQUNqQixjQUFNLFdBQVcsY0FBYyxLQUFLLENBQUM7QUFDckMsY0FBTSxPQUFPLEdBQUcsS0FBSyxJQUFJLFlBQVksb0JBQWUsTUFBTSxLQUFLLEVBQUUsT0FBTztBQUFBLFFBQUUsR0FBRyxRQUFRO0FBQUEsUUFBRSxFQUFFO0FBRXpGLFlBQUk7QUFFQSxvQ0FBMEI7QUFDMUIsaUNBQXVCO0FBRXZCLGdCQUFNLE1BQU0sTUFBTSxjQUFjQSxVQUFTLFFBQVE7QUFDakQsZ0JBQU0sU0FBUyxNQUFNLFFBQVEsS0FBSyxNQUFNLElBQUksSUFBSSxTQUFTLENBQUM7QUFDMUQsZ0JBQU0sUUFBUSxPQUFPO0FBR3JCLGNBQUk7QUFDQSx1QkFBVyxPQUFPLFFBQVE7QUFDdEIsb0JBQU0sTUFBTSxLQUFLO0FBQ2pCLGtCQUFJLENBQUMsSUFBSztBQUNWLG9CQUFNLE1BQU0sMEJBQTBCLEdBQUc7QUFDekMsa0JBQUksQ0FBQyxJQUFLO0FBQ1Ysb0JBQU0sT0FBTztBQUNiLG9CQUFNLE1BQU0sY0FBYyxHQUFHO0FBQzdCLGtCQUFJLFVBQVUsSUFBSSxJQUFJO0FBQ3RCLGtCQUFJLElBQUssS0FBSSxVQUFVLElBQUksR0FBRztBQUFBLFlBQ2xDO0FBQUEsVUFDSixRQUFRO0FBQUEsVUFBa0I7QUFFMUIsY0FBSSxVQUFVLEdBQUc7QUFDYixlQUFHLEtBQUssSUFBSSxTQUFTLHNCQUFpQixXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFDN0QsZUFBRyxLQUFLLElBQUksWUFBWSxvQkFBZSxXQUFXLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFDbkUsNEJBQWdCLENBQUM7QUFDakIsaUJBQUssT0FBTyxPQUFPO0FBQUEsVUFDdkIsT0FBTztBQUVILGtCQUFNLFNBQVMsT0FBTyxJQUFJLE9BQUssT0FBTyxHQUFHLFNBQVMsRUFBRSxFQUFFLFlBQVksQ0FBQztBQUNuRSxrQkFBTSxXQUFXLE9BQU8sS0FBSyxPQUFLLE1BQU0sV0FBVyxNQUFNLFVBQVUsTUFBTSxVQUFVLEtBQzVFLE9BQU8sS0FBSyxPQUFLLHdDQUF3QyxLQUFLLE9BQU8sR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQzNGLGtCQUFNLFVBQVUsQ0FBQyxZQUFZLE9BQU8sS0FBSyxPQUFLLE1BQU0sVUFBVSxNQUFNLFNBQVM7QUFFN0Usa0JBQU0sVUFBVSxtQkFBbUIsTUFBTTtBQUd6QyxnQkFBSTtBQUNBLGtCQUFJLFVBQVU7QUFDVixtQkFBRyxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssZUFBZSxVQUFVLElBQUksVUFBVSxRQUFRLElBQUksU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDO0FBQzVHLG1CQUFHLEtBQUssSUFBSSxZQUFZLFVBQVUsS0FBSyxTQUFTLFVBQVUsSUFBSSxLQUFLLEdBQUcsV0FBTSxPQUFPLElBQUksU0FBUyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ2hILGdDQUFnQixLQUFLO0FBQUEsY0FDekIsV0FBVyxTQUFTO0FBQ2hCLG1CQUFHLEtBQUssSUFBSSxTQUFTLGdCQUFnQixLQUFLLGVBQWUsVUFBVSxJQUFJLFlBQVksVUFBVSxJQUFJLFFBQVEsRUFBRSxJQUFJLElBQUssQ0FBQztBQUNySCxtQkFBRyxLQUFLLElBQUksWUFBWSxnQkFBZ0IsS0FBSyxXQUFXLFVBQVUsSUFBSSxLQUFLLEdBQUcsV0FBTSxPQUFPLElBQUksUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ3ZILGdDQUFnQixLQUFLO0FBQUEsY0FDekIsT0FBTztBQUVILG1CQUFHLEtBQUssSUFBSSxTQUFTLGdCQUFNLEtBQUssVUFBVSxVQUFVLElBQUksS0FBSyxHQUFHLFlBQVksUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDO0FBQ2hHLG1CQUFHLEtBQUssSUFBSSxZQUFZLGdCQUFNLEtBQUssVUFBVSxVQUFVLElBQUksS0FBSyxHQUFHLFdBQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUM1RyxnQ0FBZ0IsS0FBSztBQUFBLGNBQ3pCO0FBQUEsWUFDSixRQUFRO0FBQUEsWUFBOEI7QUFHdEMsZ0NBQW9CLE1BQU07QUFHMUIsa0JBQU0sZUFBZSxPQUFPO0FBQUEsY0FBSyxPQUM3QixPQUFPLEdBQUcsUUFBUSxFQUFFLEVBQUUsU0FBUywyQkFBMkIsS0FDMUQsT0FBTyxHQUFHLFNBQVMsRUFBRSxFQUFFLFlBQVksTUFBTSxhQUN6QyxHQUFHLE1BQU0sWUFBWTtBQUFBLFlBQ3pCO0FBRUEsZ0JBQUksY0FBYztBQUNkLGtCQUFJO0FBQ0Esc0JBQU0sT0FBTyxNQUFNLGlCQUFpQjtBQUNwQyxtQkFBRyxNQUFNLEtBQUs7QUFBQSxrQkFDVixPQUFPLG1CQUFtQixJQUFJLE1BQU07QUFBQSxrQkFDcEMsT0FBTyxZQUFZO0FBQUEsa0JBQ25CLEVBQUUsSUFBSSxLQUFLO0FBQUEsZ0JBQ2Y7QUFBQSxjQUNKLFFBQVE7QUFDSixtQkFBRyxNQUFNLEtBQUssU0FBUyx1QkFBdUIsUUFBUSxFQUFFLElBQUksSUFBSyxDQUFDO0FBQUEsY0FDdEU7QUFBQSxZQUNKO0FBRUEsaUJBQUssT0FBTyxTQUFTO0FBQUEsVUFDekI7QUFHQSxVQUFBQSxTQUFRLFFBQVFBLFNBQVEsU0FBUyxDQUFDO0FBQ2xDLFVBQUFBLFNBQVEsTUFBTSxpQkFBaUI7QUFBQSxRQUVuQyxTQUFTLEtBQUs7QUFDVixhQUFHLEtBQUssSUFBSSxRQUFRLHFCQUFxQixLQUFLLFdBQVcsR0FBRyxJQUFJLFNBQVMsRUFBRSxJQUFJLElBQUssQ0FBQztBQUNyRixlQUFLLFFBQVEsT0FBTztBQUFBLFFBQ3hCO0FBQUEsTUFDSjtBQUFBLElBQ0osQ0FBQztBQUdELFlBQVEsSUFBSSxTQUFTLGdCQUFnQixhQUFhLFVBQVUsSUFBSTtBQUVoRSxVQUFNLGNBQWMsbUJBQW1CLE1BQU0sYUFBYSxLQUFLLENBQUM7QUFDaEUsaUJBQWEsS0FBSztBQUVsQixXQUFPLE1BQU07QUFDVCxvQkFBYztBQUNkLFdBQUssU0FBUyxVQUFVO0FBQUEsSUFDNUI7QUFBQSxFQUNKO0FBRUEsV0FBUyxhQUFhLEtBQUs7QUFDdkIsUUFBSSxDQUFDLElBQUs7QUFDVixVQUFNLElBQUksWUFBWTtBQUN0QixVQUFNLFFBQVEsQ0FBQztBQUdmLFFBQUksRUFBRSxnQkFBZ0IsS0FBTSxPQUFNLEtBQUssU0FBSSxFQUFFLFlBQVksRUFBRTtBQUMzRCxRQUFJLEVBQUUsZ0JBQWdCLEtBQU0sT0FBTSxLQUFLLFNBQUksRUFBRSxZQUFZLEVBQUU7QUFDM0QsUUFBSSxRQUFRLFVBQVUsTUFBTSxLQUFLLElBQUksS0FBSyxNQUFNO0FBQUEsRUFDcEQ7QUFFQSxXQUFTLHlCQUF5QjtBQUU5QixVQUFNLGVBQWUsTUFBTTtBQUN2QixVQUFJO0FBQ0EsY0FBTSxPQUFPLFNBQVMsY0FBYyxLQUFLO0FBQ3pDLGFBQUssWUFBWTtBQUNqQixpQkFBUyxLQUFLLFlBQVksSUFBSTtBQUM5QixjQUFNLEtBQUssaUJBQWlCLElBQUk7QUFDaEMsY0FBTSxLQUFLLENBQUMsQ0FBQyxPQUFPLEdBQUcsZ0JBQWdCLElBQUksU0FBUyxPQUFPO0FBQzNELGFBQUssT0FBTztBQUNaLGVBQU87QUFBQSxNQUNYLFFBQVE7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQzVCLEdBQUc7QUFFSCxRQUFJLFlBQWE7QUFHakIsUUFBSSxTQUFTLGVBQWUsWUFBWSxFQUFHO0FBQzNDLFVBQU0sUUFBUSxTQUFTLGNBQWMsT0FBTztBQUM1QyxVQUFNLEtBQUs7QUFDWCxVQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTBDcEIsYUFBUyxLQUFLLFlBQVksS0FBSztBQUFBLEVBRW5DO0FBSUEsV0FBUyxVQUFVLElBQUksTUFBTTtBQUN6QixRQUFJO0FBQUUsWUFBTSxJQUFJLEtBQUssSUFBSTtBQUFHLGFBQVEsT0FBTyxNQUFNLGFBQWMsRUFBRSxJQUFJO0FBQUEsSUFBRyxRQUFRO0FBQUUsYUFBTztBQUFBLElBQVc7QUFBQSxFQUN4RztBQUdBLFdBQVMseUJBQXlCO0FBQzlCLFVBQU0sT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUNoRCxRQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFVBQU0sT0FBTyxLQUFLO0FBQUEsTUFDZDtBQUFBLElBQ0o7QUFDQSxRQUFJLFNBQVM7QUFDYixlQUFXLEtBQUssTUFBTTtBQUNsQixVQUFJLEVBQUUsYUFBYSxxQkFBcUIsR0FBRztBQUFFO0FBQVU7QUFBQSxNQUFVO0FBQ2pFLFVBQUk7QUFDQSxjQUFNLE1BQU1ELEtBQUksYUFBYSxDQUFDO0FBQzlCLGNBQU0sUUFBUSxLQUFLLFNBQVMsS0FBSyxTQUFTO0FBQzFDLGNBQU0sTUFBTyxPQUFPLFNBQVMsZ0JBQWdCLGFBQ3ZDLFFBQVEsWUFBWSxPQUFPLGNBQWMsSUFDekMsVUFBVSxPQUFPLGNBQWM7QUFFckMsWUFBSSxPQUFPLFFBQVEsUUFBUSxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUc7QUFDOUMsWUFBRSxhQUFhLHVCQUF1QixPQUFPLEdBQUcsQ0FBQztBQUNqRDtBQUFBLFFBQ0o7QUFBQSxNQUVKLFFBQVE7QUFBQSxNQUFnQztBQUFBLElBQzVDO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFDQSxXQUFTLDRCQUE0QjtBQUNqQyxhQUFTLGlCQUFpQixlQUFlLEVBQUUsUUFBUSxRQUFNO0FBQ3JELFNBQUcsVUFBVSxPQUFPLGNBQWM7QUFDbEMsU0FBRyxVQUFVLE9BQU8sNkJBQTZCO0FBQ2pELFNBQUcsVUFBVSxPQUFPLDZCQUE2QjtBQUFBLElBQ3JELENBQUM7QUFBQSxFQUNMO0FBRUEsV0FBUywwQkFBMEIsS0FBSztBQUNwQyxVQUFNLE9BQU8sU0FBUyxjQUFjLFlBQVk7QUFDaEQsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUdsQixRQUFJLE1BQU0sS0FBSyxjQUFjLHlCQUF5QixJQUFJLE9BQU8sT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJO0FBQ2pGLFFBQUksSUFBSyxRQUFPLElBQUksUUFBUSx3Q0FBd0MsS0FBSztBQUd6RSxRQUFJLHVCQUF1QixJQUFJLEdBQUc7QUFDOUIsWUFBTSxLQUFLLGNBQWMseUJBQXlCLElBQUksT0FBTyxPQUFPLEdBQUcsQ0FBQyxDQUFDLElBQUk7QUFDN0UsVUFBSSxJQUFLLFFBQU8sSUFBSSxRQUFRLHdDQUF3QyxLQUFLO0FBQUEsSUFDN0U7QUFHQSxVQUFNLE9BQU8sS0FBSztBQUFBLE1BQ2Q7QUFBQSxJQUNKO0FBQ0EsZUFBVyxLQUFLLE1BQU07QUFDbEIsWUFBTSxPQUFPLEVBQUUsZUFBZSxJQUFJLEtBQUs7QUFDdkMsVUFBSSxJQUFJLFNBQVMsT0FBTyxHQUFHLENBQUMsRUFBRyxRQUFPO0FBQUEsSUFDMUM7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUVBLFdBQVMsY0FBYyxLQUFLO0FBQ3hCLFVBQU0sT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFLEVBQUUsWUFBWTtBQUNqRCxRQUFJLEtBQUssU0FBUyxvQkFBb0IsRUFBRyxRQUFPO0FBQ2hELFFBQUksS0FBSyxTQUFTLG9CQUFvQixFQUFHLFFBQU87QUFDaEQsV0FBTztBQUFBLEVBQ1g7QUFFQSxNQUFNRSxPQUFPLE9BQXdDLE9BQWdCO0FBR3JFLE1BQUlBLE1BQUs7QUFDTCxLQUFDLGdCQUFnQixRQUFRLGFBQWEsZ0JBQWdCLFFBQVEsYUFBYSxDQUFDO0FBQzVFLEtBQUMsZ0JBQWdCLFFBQVEsVUFBVSxXQUFXLE1BQU07QUFDaEQsWUFBTSxPQUFPLFNBQVMsY0FBYyxZQUFZO0FBQ2hELFlBQU0sT0FBTyxPQUFPLEtBQUssaUJBQWlCLDRGQUE0RixJQUFJLENBQUM7QUFDM0ksWUFBTSxTQUFTLE9BQU8sS0FBSyxpQkFBaUIsdUJBQXVCLElBQUksQ0FBQztBQUN4RSxjQUFRLElBQUksZUFBZSxLQUFLLFFBQVEsV0FBVyxPQUFPLE1BQU07QUFDaEUsYUFBTyxFQUFFLE9BQU8sS0FBSyxRQUFRLFFBQVEsT0FBTyxPQUFPO0FBQUEsSUFDdkQ7QUFDQSxLQUFDLGdCQUFnQixRQUFRLFVBQVUsV0FBVyxDQUFDLFFBQVE7QUFDbkQsNkJBQXVCO0FBQ3ZCLFlBQU0sSUFBSSwwQkFBMEIsR0FBRztBQUN2QyxVQUFJLEdBQUc7QUFBRSxVQUFFLFVBQVUsSUFBSSxnQkFBZ0IsNkJBQTZCO0FBQUcsVUFBRSxlQUFlLEVBQUUsT0FBTyxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFBRztBQUNwSSxhQUFPLENBQUMsQ0FBQztBQUFBLElBQ2I7QUFBQSxFQUNKOzs7QUQ5ZkEsTUFBTUMsT0FBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFFekQsTUFBSSxNQUFlO0FBR2YsUUFBUyxZQUFULFdBQXFCO0FBQ2pCLFlBQU0sT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUNoRCxhQUFPLE9BQVFDLEtBQUksVUFBVSxJQUFJLEtBQUssT0FBUTtBQUFBLElBQ2xELEdBQ1MsY0FBVCxXQUF1QjtBQUNuQixZQUFNLE1BQU0sVUFBVTtBQUN0QixhQUFRLEtBQUssWUFBWSxPQUFTLEtBQUssWUFBWSxRQUFTLENBQUM7QUFBQSxJQUNqRSxHQUNTLFdBQVQsU0FBa0IsR0FBRztBQUNqQixZQUFNLEtBQUssQ0FBQyxHQUFHLFNBQVMsUUFBUSxZQUFZLEdBQUcsR0FBRyxJQUFJO0FBQ3RELGFBQU87QUFBQSxRQUNILGNBQWMsR0FBRyxjQUFjO0FBQUEsUUFDL0IsUUFBUSxHQUFHLFVBQVUsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLFFBQ25DLFlBQVksR0FBRyxjQUFjLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUMzQyxVQUFVLEdBQUcsVUFBVTtBQUFBLFFBQ3ZCLFdBQVcsR0FBRyxXQUFXO0FBQUEsUUFDekIsaUJBQWlCLEdBQUcsaUJBQWlCO0FBQUEsUUFDckMsdUJBQXVCLEdBQUcsdUJBQXVCO0FBQUEsUUFDakQsbUJBQW1CLEdBQUcsbUJBQW1CO0FBQUEsTUFDN0M7QUFBQSxJQUNKLEdBQ1MsUUFBVCxTQUFlLE1BQU07QUFDakIsVUFBSSxDQUFDLE1BQU0sT0FBUSxRQUFPO0FBQzFCLFlBQU0sT0FBTyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDaEMsWUFBTSxNQUFNLENBQUMsTUFBTyxLQUFLLE9BQU8sS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLElBQUksSUFDNUcsSUFBSSxPQUFPLENBQUMsRUFBRSxRQUFRLE1BQU0sSUFBSSxDQUFDLE1BQ2pDLE9BQU8sQ0FBQztBQUNkLFlBQU0sT0FBTyxLQUFLLEtBQUssR0FBRztBQUMxQixZQUFNLE9BQU8sS0FBSyxJQUFJLE9BQUssS0FBSyxJQUFJLE9BQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUk7QUFDeEUsYUFBTyxPQUFPLE9BQU87QUFBQSxJQUN6QixHQUNTLFdBQVQsU0FBa0IsTUFBTSxNQUFNO0FBQzFCLFlBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJO0FBQ3BDLFlBQU0sSUFBSSxTQUFTLGNBQWMsR0FBRztBQUNwQyxRQUFFLE9BQU87QUFBSyxRQUFFLFdBQVc7QUFBTSxRQUFFLE1BQU07QUFDekMsaUJBQVcsTUFBTSxJQUFJLGdCQUFnQixHQUFHLEdBQUcsR0FBSTtBQUFBLElBQ25EO0FBckNBLFVBQU1BLE1BQU0sT0FBTyxpQkFBaUIsY0FBYyxhQUFhLEtBQUssT0FBTztBQXVDM0UsaUJBQWEsWUFBWTtBQUFBO0FBQUEsTUFFckIsVUFBVSxPQUFPO0FBQUEsUUFDYixTQUFTLFlBQVksYUFBYTtBQUFBLFFBQ2xDLDJCQUEyQixZQUFZLCtCQUErQjtBQUFBLFFBQ3RFLGNBQWMsWUFBWSxrQkFBa0I7QUFBQSxRQUM1QyxjQUFjLFlBQVksa0JBQWtCO0FBQUEsTUFDaEQ7QUFBQSxNQUNBLFVBQVUsU0FBTyxZQUFZLEdBQUc7QUFBQSxNQUNoQyxVQUFVLENBQUMsS0FBSyxRQUFRLFlBQVksS0FBSyxHQUFHO0FBQUE7QUFBQSxNQUc1QyxNQUFNLENBQUMsRUFBRSxRQUFRLEtBQUssSUFBSSxDQUFDLE1BQU07QUFDN0IsY0FBTSxPQUFPLFlBQVk7QUFDekIsZUFBTyxRQUFRLEtBQUssSUFBSSxRQUFRLElBQUk7QUFBQSxNQUN4QztBQUFBLE1BQ0EsV0FBVyxNQUFNLFFBQVEsUUFBUSxhQUFhLFVBQVUsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFBQTtBQUFBLE1BRzdFLGtCQUFrQixDQUFDLFdBQVcsbUJBQW1CO0FBQzdDLGNBQU0sT0FBTyxLQUFLLFVBQVUsYUFBYSxVQUFVLEtBQUssRUFBRSxPQUFPLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUNqRixpQkFBUyxVQUFVLElBQUksS0FBSyxDQUFDLElBQUksR0FBRyxFQUFFLE1BQU0sbUJBQW1CLENBQUMsQ0FBQztBQUFBLE1BQ3JFO0FBQUEsTUFDQSxpQkFBaUIsQ0FBQyxXQUFXLGtCQUFrQjtBQUMzQyxjQUFNLE1BQU0sTUFBTSxhQUFhLFVBQVUsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFDOUQsaUJBQVMsVUFBVSxJQUFJLEtBQUssQ0FBQyxHQUFHLEdBQUcsRUFBRSxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBQUEsTUFDNUQ7QUFBQTtBQUFBLE1BR0EsYUFBYSxZQUFZO0FBQ3JCLGNBQU0sRUFBRSxlQUFBQyxlQUFjLElBQUksTUFBTTtBQUNoQyxjQUFNLEVBQUUsYUFBQUMsYUFBWSxJQUFJLE1BQU07QUFDOUIsY0FBTSxNQUFNLE1BQU1ELGVBQWMsU0FBU0MsYUFBWSxDQUFDO0FBQ3RELGdCQUFRLFFBQVEsSUFBSSxVQUFVLENBQUMsQ0FBQztBQUNoQyxlQUFPO0FBQUEsTUFDWDtBQUFBO0FBQUEsTUFHQSxnQkFBZ0IsQ0FBQyxRQUFRO0FBQ3JCLGNBQU0sTUFBTSxPQUFPLEdBQUc7QUFDdEIsY0FBTSxPQUFPLGFBQWEsVUFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixjQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLGdCQUFNLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSztBQUN6QixpQkFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsZUFBTyxLQUNGLElBQUksUUFBTSxFQUFFLEdBQUcsR0FBRyxVQUFVLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsTUFFQSxVQUFVLENBQUMsUUFBUTtBQUNmLGNBQU0sTUFBTSxPQUFPLEdBQUc7QUFDdEIsY0FBTSxPQUFPLGFBQWEsVUFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixjQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLGdCQUFNLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSztBQUN6QixpQkFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsZUFBTyxLQUNGLElBQUksUUFBTSxFQUFFLEdBQUcsR0FBRyxVQUFVLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsSUFFSjtBQUFBLEVBQ0o7QUFRQSxXQUFTLEtBQUssZ0JBQWdCO0FBRTlCLE1BQU1DLFVBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsTUFBSSxhQUFhO0FBRWpCLFdBQVMsV0FBVztBQUNoQixRQUFJLFNBQVMsV0FBWSxRQUFPLENBQUMsQ0FBQyxRQUFRLFdBQVdBLE9BQU07QUFDM0QsV0FBT0EsUUFBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdkQ7QUFFQSxXQUFTLDBCQUEwQjtBQUMvQixVQUFNLEtBQUssU0FBUyxjQUFjLGdIQUFnSDtBQUNsSixZQUFRLElBQUksZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsR0FBRztBQUFBLEVBQzdEO0FBRUEsV0FBUyx1QkFBdUI7QUFDNUIsV0FBTyxvQkFBb0IsS0FBSyx3QkFBd0IsQ0FBQztBQUFBLEVBQzdEO0FBRUEsaUJBQWUsWUFBWTtBQUN2QixRQUFJLENBQUMsU0FBUyxFQUFHLFFBQU8sUUFBUTtBQUNoQyxRQUFJLHFCQUFxQixHQUFHO0FBQ3hCLFVBQUksQ0FBQyxXQUFZLGNBQWEsTUFBTSxzQkFBc0IsT0FBTztBQUFBLElBQ3JFLE9BQU87QUFDSCxjQUFRO0FBQUEsSUFDWjtBQUFBLEVBQ0o7QUFFQSxXQUFTLFVBQVU7QUFBRSxRQUFJLFlBQVk7QUFBRSxpQkFBVztBQUFHLG1CQUFhO0FBQUEsSUFBTTtBQUFBLEVBQUU7QUFHMUUsWUFBVTtBQUNWLFdBQVMsY0FBYyxTQUFTO0FBQ2hDLFNBQU8saUJBQWlCLGNBQWMsU0FBUztBQUMvQyxNQUFNLE1BQU0sU0FBUyxjQUFjLHdCQUF3QjtBQUMzRCxNQUFJLElBQUssS0FBSSxpQkFBaUIsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLFNBQVMsTUFBTSxZQUFZLE1BQU0sV0FBVyxLQUFLLENBQUM7IiwKICAibmFtZXMiOiBbImdldEh1YiIsICJsdCIsICJUTVV0aWxzIiwgIktPIiwgIktPIiwgIlRNVXRpbHMiLCAiREVWIiwgIkRFViIsICJLTyIsICJydW5WYWxpZGF0aW9uIiwgImdldFNldHRpbmdzIiwgIlJPVVRFUyJdCn0K
