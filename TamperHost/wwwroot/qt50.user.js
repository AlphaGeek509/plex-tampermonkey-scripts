// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.138
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.138-1759273268365
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.138-1759273268365
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.138-1759273268365
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.138-1759273268365
// @require      http://localhost:5000/lt-core.user.js?v=3.8.138-1759273268365
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
      maxUnitPrice: getVal(KEYS.maxUnitPrice),
      leadtimeZeroWeeks: getVal(KEYS.leadtimeZeroWeeks)
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
    const onTarget = true;
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

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-leadtimeZeroWeeks">
      Alert when Leadtime is 0 weeks
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
    panel.querySelector("#qtv-leadtimeZeroWeeks").checked = getVal(KEYS.leadtimeZeroWeeks);
    setNumberOrBlank(panel.querySelector("#qtv-min"), getVal(KEYS.minUnitPrice));
    setNumberOrBlank(panel.querySelector("#qtv-max"), getVal(KEYS.maxUnitPrice));
    panel.querySelector("#qtv-enabled")?.addEventListener("change", (e) => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change", (e) => setVal(KEYS.autoManageLtPartNoOnQuote, !!e.target.checked));
    panel.querySelector("#qtv-leadtimeZeroWeeks")?.addEventListener(
      "change",
      (e) => setVal(KEYS.leadtimeZeroWeeks, !!e.target.checked)
    );
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
        maxUnitPrice: "qt50.maxUnitPrice",
        leadtimeZeroWeeks: "qt50.leadtimeZeroWeeks"
      };
      LEGACY_KEYS = {
        enabled: "qtv.enabled",
        autoManageLtPartNoOnQuote: "qtv.autoManageLtPartNoOnQuote",
        minUnitPrice: "qtv.minUnitPrice",
        maxUnitPrice: "qtv.maxUnitPrice",
        leadtimeZeroWeeks: "qt50.leadtimeZeroWeeks"
      };
      DEF = {
        [KEYS.enabled]: true,
        [KEYS.autoManageLtPartNoOnQuote]: true,
        [KEYS.minUnitPrice]: 0,
        [KEYS.maxUnitPrice]: 10,
        [KEYS.leadtimeZeroWeeks]: true
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

  // src/quote-tracking/qt50-validation/rules/leadtimeZeroWeeks.js
  function leadtimeZeroWeeks(ctx, settings, utils) {
    if (!settings?.leadtimeZeroWeeks) return [];
    const issues = [];
    const toNum = (v) => {
      if (v == null) return NaN;
      const s = String(typeof v === "function" ? v() : v).trim();
      if (!s) return NaN;
      return Number(s.replace(/[^\d.-]/g, ""));
    };
    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
      for (const r of group) {
        const raw = utils.get(r, "LeadTime");
        const num = toNum(raw);
        if (Number.isFinite(num) && num === 0) {
          issues.push({
            kind: "time.leadtimeZeroWeeks",
            level: "error",
            quotePartKey: qp,
            message: `Leadtime is 0 weeks (must be > 0).`,
            meta: { leadtimeRaw: raw, leadtimeNum: num }
          });
        }
      }
    }
    return issues;
  }
  var init_leadtimeZeroWeeks = __esm({
    "src/quote-tracking/qt50-validation/rules/leadtimeZeroWeeks.js"() {
      leadtimeZeroWeeks.meta = { id: "leadtimeZeroWeeks", label: "Leadtime Zero Weeks" };
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
      init_leadtimeZeroWeeks();
      init_minUnitPrice();
      init_maxUnitPrice();
      rules_default = [autoManageLtPartNoOnQuote, leadtimeZeroWeeks, maxUnitPrice, minUnitPrice];
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
            lt.core.hub.notify?.("Lines valid", "success");
            lt.core.hub.setStatus?.("All clear", "success", { sticky: false });
            setBadgeCount?.(0);
            task.done?.("Valid");
          } else {
            const levels = issues.map((i) => String(i?.level || "").toLowerCase());
            const hasError = levels.some((l) => l === "error" || l === "fail" || l === "critical") || issues.some((i) => /price\.(?:maxunitprice|minunitprice)/i.test(String(i?.kind || "")));
            const hasWarn = !hasError && levels.some((l) => l === "warn" || l === "warning");
            const summary = buildIssuesSummary(issues);
            try {
              if (hasError) {
                lt.core.hub.notify?.(`\u274C ${count} validation ${count === 1 ? "issue" : "issues"}`, "error");
                lt.core.hub.setStatus?.(`\u274C ${count} issue${count === 1 ? "" : "s"} \u2014 ${summary}`, "error", { sticky: true });
                setBadgeCount?.(count);
              } else if (hasWarn) {
                lt.core.hub.notify?.(`\u26A0\uFE0F ${count} validation ${count === 1 ? "warning" : "warnings"}`, "warn");
                lt.core.hub.setStatus?.(`\u26A0\uFE0F ${count} warning${count === 1 ? "" : "s"} \u2014 ${summary}`, "warn", { sticky: true });
                setBadgeCount?.(count);
              } else {
                lt.core.hub.notify?.(`${count} update${count === 1 ? "" : "s"} applied`, "info");
                lt.core.hub.setStatus?.(`${count} update${count === 1 ? "" : "s"} \u2014 ${summary}`, "info", { sticky: true });
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
                  mode ? "success" : "info"
                );
              } catch {
                lt.core?.hub?.notify?.("Grid refresh failed", "warn");
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
  function isOnTargetWizardPage() {
    return true;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9sZWFkdGltZVplcm9XZWVrcy5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvbWluVW5pdFByaWNlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9lbmdpbmUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vaW5qZWN0QnV0dG9uLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qc1xuLy8gLS0tLS0tLS0tLSBCb290c3RyYXAgLyByb3V0ZSBndWFyZCAtLS0tLS0tLS0tXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmNvbnN0IENPTkZJRyA9IHtcbiAgICB3aXphcmRUYXJnZXRQYWdlOiAnUGFydCBTdW1tYXJ5JyxcbiAgICBzZXR0aW5nc0tleTogJ3F0NTBfc2V0dGluZ3NfdjEnLFxuICAgIHRvYXN0TXM6IDM1MDBcbn07XG5cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuXG4vLyBJbnN0ZWFkIG9mIGByZXR1cm5gIGF0IHRvcC1sZXZlbCwgY29tcHV0ZSBhIGZsYWc6XG5jb25zdCBPTl9ST1VURSA9ICEhVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbmlmIChERVYgJiYgIU9OX1JPVVRFKSBjb25zb2xlLmRlYnVnKCdRVDUwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcgYm9vdHN0cmFwJyk7XG5cbi8qIGdsb2JhbCBHTV9nZXRWYWx1ZSwgR01fc2V0VmFsdWUsIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQsIFRNVXRpbHMsIHVuc2FmZVdpbmRvdyAqL1xuZXhwb3J0IGNvbnN0IEtFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0NTAuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0NTAuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgbWluVW5pdFByaWNlOiAncXQ1MC5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0NTAubWF4VW5pdFByaWNlJyxcbiAgICBsZWFkdGltZVplcm9XZWVrczogJ3F0NTAubGVhZHRpbWVaZXJvV2Vla3MnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxuICAgIGxlYWR0aW1lWmVyb1dlZWtzOiAncXQ1MC5sZWFkdGltZVplcm9XZWVrcycsXG59O1xuXG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbiAgICBbS0VZUy5sZWFkdGltZVplcm9XZWVrc106IHRydWUsXG59O1xuXG5mdW5jdGlvbiByZWFkT3JMZWdhY3koaykge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrKTtcbiAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSByZXR1cm4gdjtcbiAgICAvLyBvbmUtdGltZSBsZWdhY3kgcmVhZFxuICAgIGNvbnN0IGxlZ2FjeUtleSA9IE9iamVjdC52YWx1ZXMoTEVHQUNZX0tFWVMpLmZpbmQobGsgPT4gbGsuZW5kc1dpdGgoay5zcGxpdCgnLicpLnBvcCgpKSk7XG4gICAgY29uc3QgbHYgPSBsZWdhY3lLZXkgPyBHTV9nZXRWYWx1ZShsZWdhY3lLZXkpIDogdW5kZWZpbmVkO1xuICAgIHJldHVybiAobHYgIT09IHVuZGVmaW5lZCkgPyBsdiA6IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgZ2V0VmFsID0gayA9PiB7XG4gICAgY29uc3QgdiA9IHJlYWRPckxlZ2FjeShrKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSxcbiAgICAgICAgbGVhZHRpbWVaZXJvV2Vla3M6IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gdHJ1ZTtcbiAgICAvL2NvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwYW5lbC5pZCA9ICdsdC1xdHYtcGFuZWwnO1xuICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdsdC1jYXJkIGx0LW1vZGFsJztcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJzUyMHB4JyxcbiAgICAgICAgbWF4V2lkdGg6ICdtaW4oOTJ2dywgNTYwcHgpJ1xuICAgIH0pO1xuXG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBvbWl0dGVkIEx5bi1Ucm9uIFBhcnQgTm8uXG4gICAgPC9sYWJlbD5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1sZWFkdGltZVplcm9XZWVrc1wiPlxuICAgICAgQWxlcnQgd2hlbiBMZWFkdGltZSBpcyAwIHdlZWtzXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjoxMnB4IDAgMTBweDtcIj48L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBmbGV4LXdyYXA6d3JhcDtcIj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtZXhwb3J0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1pbXBvcnQtYnRuXCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS13YXJuXCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT5cbiAgICAgICAgc2V0VmFsKEtFWVMubGVhZHRpbWVaZXJvV2Vla3MsICEhZS50YXJnZXQuY2hlY2tlZClcbiAgICApO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHNhdmVkLicsICdzdWNjZXNzJywgMTYwMCk7XG4gICAgfSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LXJlc2V0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTtcbiAgICAgICAgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWltcG9ydC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBlbnN1cmVTZXR0aW5nc1N0eWxlcygpOyAvLyBORVc6IGZhbGxiYWNrIHN0eWxlcyBpZiB0aGVtZS5jc3MgaXNuXHUyMDE5dCByZWFkeVxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBGb2N1cyBBRlRFUiBhcHBlbmRpbmcgc28gRVNDIHdvcmtzIGltbWVkaWF0ZWx5XG4gICAgb3ZlcmxheS5mb2N1cygpO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVyT3JOdWxsKHMpIHsgY29uc3QgdiA9IE51bWJlcihTdHJpbmcocykudHJpbSgpKTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2KSA/IHYgOiBudWxsOyB9XG5mdW5jdGlvbiB0b051bGxPck51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDsgfVxuZnVuY3Rpb24gc2V0TnVtYmVyT3JCbGFuayhpbnB1dCwgdmFsKSB7IGlucHV0LnZhbHVlID0gKHZhbCA9PSBudWxsID8gJycgOiBTdHJpbmcodmFsKSk7IH1cblxuLyogTkVXOiBtaW5pbWFsIGZhbGxiYWNrIHN0eWxlcyBmb3IgdGhlIHNldHRpbmdzIHBhbmVsICovXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHMuaWQgPSAnbHQtcXR2LXBhbmVsLXN0eWxlcyc7XG4gICAgcy50ZXh0Q29udGVudCA9IGBcbiNsdC1xdHYtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jbHQtcXR2LXBhbmVsLmx0LWNhcmQge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7XG4gIG92ZXJmbG93OiBoaWRkZW47IHBhZGRpbmc6IDE2cHg7XG59XG4jbHQtcXR2LXBhbmVsIGgzIHsgbWFyZ2luOiAwIDAgMTBweCAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLFxuI2x0LXF0di1wYW5lbCBsYWJlbC5sdC1idG4ge1xuICBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7XG4gIGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7XG59XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLWdob3N0ICAgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXdhcm4gICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJuKTsgY29sb3I6IzExMTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0td2FybikgNTAlLCBibGFjayk7IH1cbiNsdC1xdHYtcGFuZWwgLmx0LWJ0bi0tZXJyb3IgICB7IGJhY2tncm91bmQ6IHZhcigtLWVycik7ICBjb2xvcjojZmZmOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1lcnIpIDcwJSwgYmxhY2spOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLW9rICAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1vayk7ICAgY29sb3I6I2ZmZjsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tb2spIDcwJSwgYmxhY2spOyB9XG5cbiNsdC1xdHYtcGFuZWwgaW5wdXRbdHlwZT1cIm51bWJlclwiXSwgI2x0LXF0di1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXSB7XG4gIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiA2cHggOHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOiA2cHg7IGJhY2tncm91bmQ6ICNmZmY7XG59XG4gIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzKTtcbn1cblxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxuLy8gV2hlbiBQYXJ0U3RhdHVzID09PSBcIlF1b3RlXCIsIFBPU1QgdG8gRFMgMTM1MDkgdXNpbmcgdGhlIFFUMzUgcGF0dGVybjpcbi8vICAgUXVvdGVfS2V5ID0gdm1RdW90ZUtleVxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcbi8vICAgUGFydF9ObyAgID0gUXVvdGVfTm8gfHwgXCJfXCIgfHwgdm1QYXJ0Tm8gICAoUXVvdGVfTm8gcmVzb2x2ZWQgdmlhIGx0LmNvcmUgUVRGOyBzZXNzaW9uIGZhbGxiYWNrKVxuLy8gICBOb3RlICAgICAgPSBcImF1dG8gbWFuYWdlZFwiXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGlmICghc2V0dGluZ3M/LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpIHJldHVybiBpc3N1ZXM7XG5cbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBsdCA9IChST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIFFURiAoZmxhdCByZXBvKSBsaWtlIFFUMzVcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXG4gICAgICAgIDogbnVsbDtcblxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xuICAgIGNvbnN0IERTX01BTkFHRV9QQVJUTk8gPSAxMzUwOTsgIC8vIHlvdXIgdGFyZ2V0IERTIHRvIHBvc3QgUGFydF9Ob1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgUk9PVC5nZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgPyBhd2FpdCBST09ULmdldFBsZXhGYWNhZGUoKVxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXgpIHRocm93IG5ldyBFcnJvcignUGxleCBmYWNhZGUgbm90IGF2YWlsYWJsZScpO1xuICAgICAgICByZXR1cm4gcGxleDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0byBzZXNzaW9uIHN0b3JhZ2UgaWYgUVRGL3BsZXggaHlkcmF0aW9uIG5vdCByZWFkeVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIChzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdRdW90ZV9ObycpIHx8ICcnKS50cmltKCk7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIFF1b3RlX05vIGZvciBhIGdpdmVuIFF1b3RlS2V5IHVzaW5nIFFURjsgaHlkcmF0ZSBvbmNlIGZyb20gRFMgaWYgbmVlZGVkLlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFF1b3RlTm9Gb3JRdW90ZUtleShxaykge1xuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcbiAgICAgICAgaWYgKCFxS2V5IHx8ICFOdW1iZXIuaXNGaW5pdGUocUtleSkgfHwgcUtleSA8PSAwKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XG5cbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgaWYgKCFoZWFkPy5RdW90ZV9Obykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFLZXkpIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoID8gcm93c1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1b3RlTm8gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBxS2V5LCBRdW90ZV9ObzogcXVvdGVObywgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcW4gPSBoZWFkPy5RdW90ZV9ObztcbiAgICAgICAgICAgIHJldHVybiAocW4gPT0gbnVsbCA/IGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIDogU3RyaW5nKHFuKS50cmltKCkpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgUXVvdGVQYXJ0IGdyb3VwcywgcmVzb2x2ZSBRdW90ZV9ObyBvbmNlIHBlciBncm91cCwgdGhlbiBwb3N0IHBlci1yb3cgd2hlbiBzdGF0dXMgPT09ICdRdW90ZSdcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGFueSA9IEFycmF5LmlzQXJyYXkoZ3JvdXApICYmIGdyb3VwLmxlbmd0aCA/IGdyb3VwWzBdIDogbnVsbDtcbiAgICAgICAgY29uc3QgZ3JvdXBRdW90ZUtleSA9IHV0aWxzLmdldChhbnksICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgIGNvbnN0IHJlc29sdmVkUXVvdGVObyA9IGF3YWl0IGdldFF1b3RlTm9Gb3JRdW90ZUtleShncm91cFF1b3RlS2V5KTtcblxuICAgICAgICAvLyBQcm9jZXNzIGVhY2ggdW5pcXVlIFBhcnRLZXkgZXhhY3RseSBvbmNlXG4gICAgICAgIGNvbnN0IHVuaXFCeVBhcnRLZXkgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBwayA9IHV0aWxzLmdldChyb3csICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHBrKSAmJiAhdW5pcUJ5UGFydEtleS5oYXMocGspKSB7XG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdW5pcUJ5UGFydEtleS52YWx1ZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB2bVF1b3RlS2V5ID0gZ3JvdXBRdW90ZUtleSA/PyB1dGlscy5nZXQociwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcblxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxuICAgICAgICAgICAgLy8gICBJZiBub3QsIGRlc2lyZWQgcHJlZml4IGlzIFwiX1wiIChwZXIgb3JpZ2luYWwgc3BlYykuXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlNYW5hZ2VkID0gdm1QYXJ0Tm8uc3RhcnRzV2l0aChkZXNpcmVkUHJlZml4KTtcblxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxuICAgICAgICAgICAgaWYgKGFscmVhZHlNYW5hZ2VkKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCB0aGUgZGVzaXJlZCBQYXJ0X05vIGp1c3Qgb25jZSAoYXZvaWQgZG91YmxlLXByZWZpeGluZyBvbiBzdWJzZXF1ZW50IHJ1bnMpXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxuICAgICAgICAgICAgICAgIFBhcnRfTm86IFN0cmluZyhwYXJ0Tm9Gb3JQb3N0ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBRVDM1LXN0eWxlIERTIGNhbGwgd2l0aCBhdXRoIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiB0cnVlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcbmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUubWV0YSA9IHsgaWQ6ICdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJywgbGFiZWw6ICdBdXRvLU1hbmFnZSBMVCBQYXJ0IE5vJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4vLyBSdWxlOiBsZWFkdGltZVplcm9XZWVrc1xyXG4vLyBQdXJwb3NlOiBFcnJvciB3aGVuIExlYWR0aW1lID09IDAgd2Vla3MuXHJcbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubGVhZHRpbWVaZXJvV2Vla3MgKGJvb2xlYW4pLlxyXG4vLyBGaWVsZDogTGVhZHRpbWUgKHdlZWtzKSBleHBlY3RlZCBpbiBWTSByb3cuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBsZWFkdGltZVplcm9XZWVrcyhjdHgsIHNldHRpbmdzLCB1dGlscykge1xyXG4gICAgaWYgKCFzZXR0aW5ncz8ubGVhZHRpbWVaZXJvV2Vla3MpIHJldHVybiBbXTtcclxuXHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcmF3ID0gdXRpbHMuZ2V0KHIsICdMZWFkVGltZScpOyAvLyBhZGp1c3QgZmllbGQgbmFtZSBpZiBkaWZmZXJlbnRcclxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobnVtKSAmJiBudW0gPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAndGltZS5sZWFkdGltZVplcm9XZWVrcycsXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTGVhZHRpbWUgaXMgMCB3ZWVrcyAobXVzdCBiZSA+IDApLmAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBsZWFkdGltZVJhdzogcmF3LCBsZWFkdGltZU51bTogbnVtIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbmxlYWR0aW1lWmVyb1dlZWtzLm1ldGEgPSB7IGlkOiAnbGVhZHRpbWVaZXJvV2Vla3MnLCBsYWJlbDogJ0xlYWR0aW1lIFplcm8gV2Vla3MnIH07XHJcbiIsICIvLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFJ1bGU6IG1pblVuaXRQcmljZVxuLy8gUHVycG9zZTogRXJyb3Igd2hlbiB0aGUgZWZmZWN0aXZlIHVuaXQgcHJpY2UgaXMgYmVsb3cgdGhlIGNvbmZpZ3VyZWQgbWluaW11bS5cbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubWluVW5pdFByaWNlIChudWxsYWJsZSkuXG4vLyBQcmVjZWRlbmNlIGZvciB1bml0IHByaWNlIGZpZWxkczpcbi8vICAgUnZDdXN0b21pemVkVW5pdFByaWNlID4gUnZVbml0UHJpY2VDb3B5ID4gVW5pdFByaWNlXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIG1pblVuaXRQcmljZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IG1pbiA9IE51bWJlcihzZXR0aW5ncy5taW5Vbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1pbikpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJyA/IHYoKSA6IHYpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xuICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1VuaXRQcmljZScpO1xuXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xuXG4gICAgICAgICAgICAvLyBEZWNpZGUgY3VycmVuY3k6IGluZmVyIGZyb20gcmF3IG9yIHVzZSBzZXR0aW5ncy5jdXJyZW5jeUNvZGUgKGRlZmF1bHQgVVNEKVxuICAgICAgICAgICAgY29uc3QgaW5mZXJDdXJyZW5jeSA9IChyYXdWYWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiByYXdWYWwgPT09ICdmdW5jdGlvbicgPyByYXdWYWwoKSA6IHJhd1ZhbCB8fCAnJyk7XG4gICAgICAgICAgICAgICAgaWYgKC9cXCQvLnRlc3QocykpIHJldHVybiAnVVNEJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MjBBQy8udGVzdChzKSkgcmV0dXJuICdFVVInO1xuICAgICAgICAgICAgICAgIGlmICgvXHUwMEEzLy50ZXN0KHMpKSByZXR1cm4gJ0dCUCc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNldHRpbmdzPy5jdXJyZW5jeUNvZGUgfHwgJ1VTRCc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW5jeSA9IGluZmVyQ3VycmVuY3kocmF3KTtcbiAgICAgICAgICAgIGNvbnN0IG1vbmV5Rm10ID0gbmV3IEludGwuTnVtYmVyRm9ybWF0KCdlbi1VUycsIHsgc3R5bGU6ICdjdXJyZW5jeScsIGN1cnJlbmN5LCBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSk7XG4gICAgICAgICAgICBjb25zdCBudW1GbXQgPSBuZXcgSW50bC5OdW1iZXJGb3JtYXQoJ2VuLVVTJywgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSk7XG5cbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobnVtKSAmJiBudW0gPCBtaW4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmbXRNb25leSA9IChuKSA9PiBOdW1iZXIuaXNGaW5pdGUobikgPyBtb25leUZtdC5mb3JtYXQobikgOiBTdHJpbmcobik7XG5cbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwcmljZS5taW5Vbml0UHJpY2UnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFVuaXQgUHJpY2UgJHtmbXRNb25leShudW0pfSA8IE1pbiAke2ZtdE1vbmV5KG1pbil9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWluLCBjdXJyZW5jeSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaXNzdWVzO1xufVxuXG5taW5Vbml0UHJpY2UubWV0YSA9IHsgaWQ6ICdtaW5Vbml0UHJpY2UnLCBsYWJlbDogJ01pbiBVbml0IFByaWNlJyB9O1xuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL21heFVuaXRQcmljZS5qc1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWF4VW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgLy8gR3VhcmQgaWYgbm90IGNvbmZpZ3VyZWRcbiAgICBjb25zdCBtYXggPSBOdW1iZXIoc2V0dGluZ3MubWF4VW5pdFByaWNlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtYXgpKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcblxuICAgIC8vIFNpbXBsZSBjdXJyZW5jeS9udW1iZXIgc2FuaXRpemVyXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgIH07XG5cblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XG5cbiAgICAgICAgICAgIC8vIHByZWNlZGVuY2U6IGN1c3RvbWl6ZWQgPiBjb3B5ID4gYmFzZVxuICAgICAgICAgICAgY29uc3QgcmF3ID1cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XG5cbiAgICAgICAgICAgIC8vIERlY2lkZSBjdXJyZW5jeTogaW5mZXIgZnJvbSByYXcgb3IgdXNlIHNldHRpbmdzLmN1cnJlbmN5Q29kZSAoZGVmYXVsdCBVU0QpXG4gICAgICAgICAgICBjb25zdCBpbmZlckN1cnJlbmN5ID0gKHJhd1ZhbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHJhd1ZhbCA9PT0gJ2Z1bmN0aW9uJyA/IHJhd1ZhbCgpIDogKHJhd1ZhbCA/PyAnJykpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBpZiAoL1xcJC8udGVzdChzKSkgcmV0dXJuICdVU0QnO1xuICAgICAgICAgICAgICAgIGlmICgvXHUyMEFDLy50ZXN0KHMpKSByZXR1cm4gJ0VVUic7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTAwQTMvLnRlc3QocykpIHJldHVybiAnR0JQJztcbiAgICAgICAgICAgICAgICByZXR1cm4gc2V0dGluZ3M/LmN1cnJlbmN5Q29kZSB8fCAnVVNEJztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbmN5ID0gaW5mZXJDdXJyZW5jeShyYXcpO1xuICAgICAgICAgICAgY29uc3QgbW9uZXlGbXQgPSBuZXcgSW50bC5OdW1iZXJGb3JtYXQoJ2VuLVVTJywgeyBzdHlsZTogJ2N1cnJlbmN5JywgY3VycmVuY3ksIG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdE1vbmV5ID0gKG4pID0+IE51bWJlci5pc0Zpbml0ZShuKSA/IG1vbmV5Rm10LmZvcm1hdChuKSA6IFN0cmluZyhuKTtcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwcmljZS5tYXhVbml0UHJpY2UnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFVuaXQgUHJpY2UgJHtmbXRNb25leShudW0pfSA+IE1heCAke2ZtdE1vbmV5KG1heCl9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4LCBjdXJyZW5jeSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaXNzdWVzO1xufVxuXG5tYXhVbml0UHJpY2UubWV0YSA9IHsgaWQ6ICdtYXhVbml0UHJpY2UnLCBsYWJlbDogJ01heCBVbml0IFByaWNlJyB9O1xuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzXG5pbXBvcnQgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSBmcm9tICcuL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnO1xuaW1wb3J0IGxlYWR0aW1lWmVyb1dlZWtzIGZyb20gJy4vbGVhZHRpbWVaZXJvV2Vla3MnO1xuaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcblxuZXhwb3J0IGRlZmF1bHQgW2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsIGxlYWR0aW1lWmVyb1dlZWtzLCBtYXhVbml0UHJpY2UsIG1pblVuaXRQcmljZV07IFxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2VuZ2luZS5qc1xuaW1wb3J0IHJ1bGVzIGZyb20gJy4vcnVsZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncykge1xuICAgIGF3YWl0IFRNVXRpbHMud2FpdEZvck1vZGVsQXN5bmMoJy5wbGV4LWdyaWQnLCB7IHJlcXVpcmVLbzogdHJ1ZSwgdGltZW91dE1zOiAxMjAwMCB9KTtcblxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGNvbnN0IGd2bSA9IChncmlkICYmIEtPICYmIHR5cGVvZiBLTy5kYXRhRm9yID09PSAnZnVuY3Rpb24nKSA/IEtPLmRhdGFGb3IoZ3JpZCkgOiBudWxsO1xuICAgIGlmICghZ3ZtKSByZXR1cm4geyBvazogdHJ1ZSwgaXNzdWVzOiBbXSB9OyAvLyBub3RoaW5nIHRvIHZhbGlkYXRlIHlldFxuXG4gICAgY29uc3Qgcm93cyA9IChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XG4gICAgY29uc3QgZ3JvdXBzQnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgY29uc3QgcXAgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdRdW90ZVBhcnRLZXknKSA/PyAtMTtcbiAgICAgICAgKGdyb3Vwc0J5UXVvdGVQYXJ0LmdldChxcCkgfHwgZ3JvdXBzQnlRdW90ZVBhcnQuc2V0KHFwLCBbXSkuZ2V0KHFwKSkucHVzaChyKTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmltYXJ5QnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgcCA9IGdyb3VwLmZpbmQociA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdJc1VuaXF1ZVF1b3RlUGFydCcpID09PSAxKSB8fCBncm91cFswXTtcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LnNldChxcCwgcCk7XG4gICAgfVxuXG4gICAgY29uc3QgY3R4ID0ge1xuICAgICAgICByb3dzLFxuICAgICAgICBncm91cHNCeVF1b3RlUGFydCxcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LFxuICAgICAgICBsYXN0Rm9ybTogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGVGb3JtPy4oKSxcbiAgICAgICAgbGFzdFJlc3VsdDogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGU/LigpXG4gICAgfTtcblxuICAgIGNvbnN0IHV0aWxzID0geyBnZXQ6IChvYmosIHBhdGgsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUob2JqLCBwYXRoLCBvcHRzKSB9O1xuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHJ1bGVzLm1hcChydWxlID0+IHJ1bGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpKSk7XG4gICAgY29uc3QgaXNzdWVzUmF3ID0gcmVzdWx0cy5mbGF0KCk7XG4gICAgY29uc3Qgb2sgPSBpc3N1ZXNSYXcuZXZlcnkoaSA9PiBpLmxldmVsICE9PSAnZXJyb3InKTtcblxuICAgIC8vIEVucmljaCBpc3N1ZXMgd2l0aCBVSS1mYWNpbmcgZGF0YSAobGluZU51bWJlciwgcGFydE5vLCBydWxlTGFiZWwpXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4gTnVtYmVyKFN0cmluZyh2ID8/ICcnKS5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgIGNvbnN0IHJ1bGVMYWJlbEZyb20gPSAoaXNzKSA9PiB7XG4gICAgICAgIC8vIFByZWZlcnJlZDogcnVsZSBmdW5jdGlvbiBzZXRzIC5tZXRhLmxhYmVsIChlLmcuLCBtYXhVbml0UHJpY2UubWV0YS5sYWJlbClcbiAgICAgICAgaWYgKGlzcz8ubWV0YT8ubGFiZWwpIHJldHVybiBpc3MubWV0YS5sYWJlbDtcbiAgICAgICAgaWYgKGlzcz8ua2luZCkge1xuICAgICAgICAgICAgY29uc3QgayA9IFN0cmluZyhpc3Mua2luZCk7XG4gICAgICAgICAgICAvLyBwcmV0dGlmeSBcInByaWNlLm1heFVuaXRQcmljZVwiID0+IFwiTWF4IFVuaXQgUHJpY2VcIlxuICAgICAgICAgICAgY29uc3QgdGFpbCA9IGsuc3BsaXQoJy4nKS5wb3AoKTtcbiAgICAgICAgICAgIHJldHVybiB0YWlsXG4gICAgICAgICAgICAgICAgPyB0YWlsLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpXG4gICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eLi8sIChjKSA9PiBjLnRvVXBwZXJDYXNlKCkpXG4gICAgICAgICAgICAgICAgOiBrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnVmFsaWRhdGlvbic7XG4gICAgfTtcblxuICAgIC8vIEJ1aWxkIGEgcXVpY2sgbWFwIG9mIHJvdyAtPiBpbmZvXG4gICAgY29uc3Qgcm93SW5mbyA9IG5ldyBNYXAoKTsgLy8gdm0gLT4geyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgciA9IGN0eC5yb3dzW2ldO1xuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG4gICAgICAgIGNvbnN0IHBhcnRObyA9IHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnO1xuICAgICAgICByb3dJbmZvLnNldChyLCB7IGxpbmVOdW1iZXIsIHBhcnRObyB9KTtcbiAgICB9XG5cbiAgICAvLyBBbHNvIG1hcCBRUEsgLT4gXCJwcmltYXJ5XCIgcm93IGZvciBjaGVhcCBsb29rdXBcbiAgICBjb25zdCBxcGtUb1ByaW1hcnlJbmZvID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgW3FwLCBwcmltYXJ5XSBvZiBjdHgucHJpbWFyeUJ5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBjb25zdCBpbmZvID0gcm93SW5mby5nZXQocHJpbWFyeSkgfHwgeyBsaW5lTnVtYmVyOiBudWxsLCBwYXJ0Tm86IHV0aWxzLmdldChwcmltYXJ5LCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnIH07XG4gICAgICAgIHFwa1RvUHJpbWFyeUluZm8uc2V0KHFwLCBpbmZvKTtcbiAgICB9XG5cbiAgICAvLyBCdWlsZCBhIFNvcnRPcmRlciBsb29rdXAgYnkgdmlzdWFsIHJvdyBpbmRleCAoZnJvbSB0aGUgVk0sIG5vdCB0aGUgRE9NKVxuICAgIGNvbnN0IHNvcnRCeUxpbmUgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdHgucm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCByb3cgPSBjdHgucm93c1tpXTtcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuICAgICAgICBjb25zdCBzb3J0T3JkZXIgPSB1dGlscy5nZXQocm93LCAnU29ydE9yZGVyJywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgIHNvcnRCeUxpbmUuc2V0KGxpbmVOdW1iZXIsIHNvcnRPcmRlcik7XG4gICAgfVxuXG4gICAgY29uc3QgaXNzdWVzID0gaXNzdWVzUmF3Lm1hcChpc3MgPT4ge1xuICAgICAgICBjb25zdCBxcGsgPSBpc3MucXVvdGVQYXJ0S2V5ID8/IC0xO1xuICAgICAgICBjb25zdCBpbmZvID0gcXBrVG9QcmltYXJ5SW5mby5nZXQocXBrKSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogJycgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmlzcyxcbiAgICAgICAgICAgIGxpbmVOdW1iZXI6IGluZm8ubGluZU51bWJlcixcbiAgICAgICAgICAgIHBhcnRObzogaW5mby5wYXJ0Tm8sXG4gICAgICAgICAgICBydWxlTGFiZWw6IHJ1bGVMYWJlbEZyb20oaXNzKSxcbiAgICAgICAgICAgIHNvcnRPcmRlcjogc29ydEJ5TGluZS5nZXQoaW5mby5saW5lTnVtYmVyID8/IC0xKVxuICAgICAgICB9O1xuICAgIH0pO1xuXG5cbiAgICAvLyBzdGFzaCBpZiB5b3Ugd2FudCBvdGhlciBtb2R1bGVzIHRvIHJlYWQgaXQgbGF0ZXJcbiAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcbiAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0geyBhdDogRGF0ZS5ub3coKSwgb2ssIGlzc3VlcyB9O1xuXG4gICAgcmV0dXJuIHsgb2ssIGlzc3VlcyB9O1xufVxuXG4iLCAiLy8gUVRWIGVudHJ5cG9pbnQ6IG1vdW50cyB0aGUgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIG9uIFBhcnQgU3VtbWFyeVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5pZiAoX19CVUlMRF9ERVZfXykge1xuICAgIC8vIE1pbmltYWwgS08vZ3JpZCByZXNvbHZlcnMga2VwdCBsb2NhbCB0byBkZWJ1ZyBoZWxwZXJzXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgIGZ1bmN0aW9uIGdldEdyaWRWTSgpIHtcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgcmV0dXJuIGdyaWQgPyAoS08/LmRhdGFGb3I/LihncmlkKSB8fCBudWxsKSA6IG51bGw7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldEdyaWRSb3dzKCkge1xuICAgICAgICBjb25zdCBndm0gPSBnZXRHcmlkVk0oKTtcbiAgICAgICAgcmV0dXJuIChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XG4gICAgfVxuICAgIGZ1bmN0aW9uIHBsYWluUm93KHIpIHtcbiAgICAgICAgY29uc3QgZ3YgPSAocCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCBwLCBvcHRzKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFF1b3RlUGFydEtleTogZ3YoJ1F1b3RlUGFydEtleScpLFxuICAgICAgICAgICAgUGFydE5vOiBndignUGFydE5vJywgeyB0cmltOiB0cnVlIH0pLFxuICAgICAgICAgICAgUGFydFN0YXR1czogZ3YoJ1BhcnRTdGF0dXMnLCB7IHRyaW06IHRydWUgfSksXG4gICAgICAgICAgICBRdWFudGl0eTogZ3YoJ1F1YW50aXR5JyksXG4gICAgICAgICAgICBVbml0UHJpY2U6IGd2KCdVbml0UHJpY2UnKSxcbiAgICAgICAgICAgIFJ2VW5pdFByaWNlQ29weTogZ3YoJ1J2VW5pdFByaWNlQ29weScpLFxuICAgICAgICAgICAgUnZDdXN0b21pemVkVW5pdFByaWNlOiBndignUnZDdXN0b21pemVkVW5pdFByaWNlJyksXG4gICAgICAgICAgICBJc1VuaXF1ZVF1b3RlUGFydDogZ3YoJ0lzVW5pcXVlUXVvdGVQYXJ0JylcbiAgICAgICAgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9DU1Yob2Jqcykge1xuICAgICAgICBpZiAoIW9ianM/Lmxlbmd0aCkgcmV0dXJuICcnO1xuICAgICAgICBjb25zdCBjb2xzID0gT2JqZWN0LmtleXMob2Jqc1swXSk7XG4gICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiAodiA9PSBudWxsID8gJycgOiBTdHJpbmcodikuaW5jbHVkZXMoJywnKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1wiJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcXG4nKVxuICAgICAgICAgICAgPyBgXCIke1N0cmluZyh2KS5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYFxuICAgICAgICAgICAgOiBTdHJpbmcodikpO1xuICAgICAgICBjb25zdCBoZWFkID0gY29scy5qb2luKCcsJyk7XG4gICAgICAgIGNvbnN0IGJvZHkgPSBvYmpzLm1hcChvID0+IGNvbHMubWFwKGMgPT4gZXNjKG9bY10pKS5qb2luKCcsJykpLmpvaW4oJ1xcbicpO1xuICAgICAgICByZXR1cm4gaGVhZCArICdcXG4nICsgYm9keTtcbiAgICB9XG4gICAgZnVuY3Rpb24gZG93bmxvYWQobmFtZSwgYmxvYikge1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSBuYW1lOyBhLmNsaWNrKCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAyMDAwKTtcbiAgICB9XG5cbiAgICB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHID0ge1xuICAgICAgICAvLyBTZXR0aW5ncyBoZWxwZXJzXG4gICAgICAgIHNldHRpbmdzOiAoKSA9PiAoe1xuICAgICAgICAgICAgZW5hYmxlZDogR01fZ2V0VmFsdWUoJ3F0di5lbmFibGVkJyksXG4gICAgICAgICAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiBHTV9nZXRWYWx1ZSgncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSxcbiAgICAgICAgICAgIG1pblVuaXRQcmljZTogR01fZ2V0VmFsdWUoJ3F0di5taW5Vbml0UHJpY2UnKSxcbiAgICAgICAgICAgIG1heFVuaXRQcmljZTogR01fZ2V0VmFsdWUoJ3F0di5tYXhVbml0UHJpY2UnKVxuICAgICAgICB9KSxcbiAgICAgICAgZ2V0VmFsdWU6IGtleSA9PiBHTV9nZXRWYWx1ZShrZXkpLFxuICAgICAgICBzZXRWYWx1ZTogKGtleSwgdmFsKSA9PiBHTV9zZXRWYWx1ZShrZXksIHZhbCksXG5cbiAgICAgICAgLy8gR3JpZCBleHBvcnRlcnNcbiAgICAgICAgZ3JpZDogKHsgcGxhaW4gPSB0cnVlIH0gPSB7fSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGdldEdyaWRSb3dzKCk7XG4gICAgICAgICAgICByZXR1cm4gcGxhaW4gPyByb3dzLm1hcChwbGFpblJvdykgOiByb3dzO1xuICAgICAgICB9LFxuICAgICAgICBncmlkVGFibGU6ICgpID0+IGNvbnNvbGUudGFibGU/Lih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSksXG5cbiAgICAgICAgLy8gQ1NWL0pTT04gZG93bmxvYWRlcnNcbiAgICAgICAgZG93bmxvYWRHcmlkSlNPTjogKGZpbGVuYW1lID0gJ3F0LWdyaWQuanNvbicpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnN0cmluZ2lmeSh1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSwgbnVsbCwgMik7XG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2RhdGFdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRvd25sb2FkR3JpZENTVjogKGZpbGVuYW1lID0gJ3F0LWdyaWQuY3N2JykgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3N2ID0gdG9DU1YodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpO1xuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFZhbGlkYXRpb24gb24tZGVtYW5kIChzYW1lIGVuZ2luZSBhcyB0aGUgYnV0dG9uKVxuICAgICAgICB2YWxpZGF0ZU5vdzogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBydW5WYWxpZGF0aW9uIH0gPSBhd2FpdCBpbXBvcnQoJy4vZW5naW5lLmpzJyk7IC8vIHNhbWUgbW9kdWxlIHVzZWQgYnkgdGhlIGh1YiBidXR0b25cbiAgICAgICAgICAgIGNvbnN0IHsgZ2V0U2V0dGluZ3MgfSA9IGF3YWl0IGltcG9ydCgnLi9pbmRleC5qcycpO1xuICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBnZXRTZXR0aW5ncygpKTtcbiAgICAgICAgICAgIGNvbnNvbGUudGFibGU/LihyZXMuaXNzdWVzIHx8IFtdKTtcbiAgICAgICAgICAgIHJldHVybiByZXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gUXVpY2sgZXhwZWN0YXRpb24gaGVscGVyOiBcdTIwMUNzaG93IG1lIHJvd3MgYWJvdmUgbWF4XHUyMDFEXG4gICAgICAgIGV4cGVjdFVuZGVyTWF4OiAobWF4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWF4KTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiByb3dzXG4gICAgICAgICAgICAgICAgLm1hcChyID0+ICh7IC4uLnIsIF9Vbml0TnVtOiB0b051bShyLlJ2Q3VzdG9taXplZFVuaXRQcmljZSA/PyByLlJ2VW5pdFByaWNlQ29weSA/PyByLlVuaXRQcmljZSkgfSkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtID4gc2V0KVxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdW5kZXJNaW46IChtaW4pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldCA9IE51bWJlcihtaW4pO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIHJvd3NcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gTnVtYmVyLmlzRmluaXRlKHIuX1VuaXROdW0pICYmIHIuX1VuaXROdW0gPCBzZXQpXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcbiAgICAgICAgfSxcblxuICAgIH07XG59XG5cblxuLy8gRW5zdXJlIHRoZSBzZXR0aW5ncyBVSSBsb2FkcyAoZ2VhciBidXR0b24sIHN0b3JhZ2UgQVBJKVxuaW1wb3J0ICcuL2luZGV4LmpzJztcbi8vIE1vdW50cyB0aGUgVmFsaWRhdGUgTGluZXMgYnV0dG9uICYgd2lyZXMgY2xpY2sgdG8gdGhlIGVuZ2luZVxuaW1wb3J0IHsgbW91bnRWYWxpZGF0aW9uQnV0dG9uIH0gZnJvbSAnLi9pbmplY3RCdXR0b24uanMnO1xuXG5UTVV0aWxzPy5uZXQ/LmVuc3VyZVdhdGNoZXI/LigpOyAvLyBvcHRpb25hbCwgaGFybWxlc3MgaWYgbWlzc2luZ1xuXG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xubGV0IHVubW91bnRCdG4gPSBudWxsO1xuXG5mdW5jdGlvbiBpc1dpemFyZCgpIHtcbiAgICBpZiAoVE1VdGlscz8ubWF0Y2hSb3V0ZSkgcmV0dXJuICEhVE1VdGlscy5tYXRjaFJvdXRlKFJPVVRFUyk7XG4gICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XG4gICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgcmV0dXJuIChsaT8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG59XG5cbmZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkge1xuICAgIHJldHVybiB0cnVlOyAvLyBhbHdheXMgc2hvdyBvbiBhbGwgcGFnZXNcbiAgICAvL3JldHVybiAvXnBhcnRcXHMqc3VtbWFyeSQvaS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XG4gICAgaWYgKCFpc1dpemFyZCgpKSByZXR1cm4gdW5tb3VudCgpO1xuICAgIGlmIChpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XG4gICAgICAgIGlmICghdW5tb3VudEJ0bikgdW5tb3VudEJ0biA9IGF3YWl0IG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB1bm1vdW50KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bm1vdW50KCkgeyBpZiAodW5tb3VudEJ0bikgeyB1bm1vdW50QnRuKCk7IHVubW91bnRCdG4gPSBudWxsOyB9IH1cblxuLy8gaW5pdGlhbCArIFNQQSB3aXJpbmcgKG1pcnJvcnMgcXQzMC9xdDM1KVxucmVjb25jaWxlKCk7XG5UTVV0aWxzPy5vblVybENoYW5nZT8uKHJlY29uY2lsZSk7XG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZSk7XG5jb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG5pZiAobmF2KSBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWNvbmNpbGUpLm9ic2VydmUobmF2LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcblxuIiwgIi8vIEFkZHMgYSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gYW5kIHdpcmVzIGl0IHRvIHRoZSBlbmdpbmUuXG4vLyBBc3N1bWVzIHlvdXIgc2V0dGluZ3MgVUkgZXhwb3J0cyBnZXRTZXR0aW5ncy9vblNldHRpbmdzQ2hhbmdlLlxuXG5pbXBvcnQgeyBydW5WYWxpZGF0aW9uIH0gZnJvbSAnLi9lbmdpbmUnO1xuaW1wb3J0IHsgZ2V0U2V0dGluZ3MsIG9uU2V0dGluZ3NDaGFuZ2UgfSBmcm9tICcuL2luZGV4JztcblxuLy8gLS0tIEtPIHN1cmZhY2UgKHF0MzAgcGF0dGVybikgLS0tXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuXG4vLyAtLS0gc3VtbWFyaXplIGlzc3VlcyBmb3Igc3RhdHVzIHBpbGwgLyB0b2FzdHMgLS0tXG5mdW5jdGlvbiBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSBBcnJheS5pc0FycmF5KGlzc3VlcykgPyBpc3N1ZXMgOiBbXTtcbiAgICAgICAgY29uc3QgYWdnID0gaXRlbXMucmVkdWNlKChhY2MsIGl0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBsdmwgPSBTdHJpbmcoaXQ/LmxldmVsIHx8ICdpbmZvJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGFjY1tsdmxdID0gKGFjY1tsdmxdIHx8IDApICsgMTtcbiAgICAgICAgICAgIGlmIChpdD8ucXVvdGVQYXJ0S2V5ICE9IG51bGwpIGFjYy5wYXJ0cy5hZGQoaXQucXVvdGVQYXJ0S2V5KTtcbiAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIHsgZXJyb3I6IDAsIHdhcm5pbmc6IDAsIGluZm86IDAsIHBhcnRzOiBuZXcgU2V0KCkgfSk7XG5cbiAgICAgICAgY29uc3QgcGFydHNDb3VudCA9IGFnZy5wYXJ0cy5zaXplO1xuICAgICAgICBjb25zdCBzZWdzID0gW107XG4gICAgICAgIGlmIChhZ2cuZXJyb3IpIHNlZ3MucHVzaChgJHthZ2cuZXJyb3J9IGVycm9yJHthZ2cuZXJyb3IgPT09IDEgPyAnJyA6ICdzJ31gKTtcbiAgICAgICAgaWYgKGFnZy53YXJuaW5nKSBzZWdzLnB1c2goYCR7YWdnLndhcm5pbmd9IHdhcm5pbmcke2FnZy53YXJuaW5nID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICAgIGlmIChhZ2cuaW5mbykgc2Vncy5wdXNoKGAke2FnZy5pbmZvfSBpbmZvYCk7XG4gICAgICAgIGNvbnN0IGxldmVsUGFydCA9IHNlZ3Muam9pbignLCAnKSB8fCAndXBkYXRlcyc7XG5cbiAgICAgICAgcmV0dXJuIGAke2xldmVsUGFydH0gYWNyb3NzICR7cGFydHNDb3VudCB8fCAwfSBwYXJ0JHtwYXJ0c0NvdW50ID09PSAxID8gJycgOiAncyd9YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cbn1cblxuLy8gLS0tIFFUMzAtc3R5bGUgZ3JpZCByZWZyZXNoIChjb3BpZWQpIC0tLVxuYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFF1b3RlR3JpZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBncmlkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIGNvbnN0IGdyaWRWTSA9IGdyaWRFbCAmJiBLTz8uZGF0YUZvcj8uKGdyaWRFbCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LmRhdGFzb3VyY2U/LnJlYWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGF3YWl0IGdyaWRWTS5kYXRhc291cmNlLnJlYWQoKTsgICAvLyBhc3luYyByZS1xdWVyeS9yZWJpbmRcbiAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LnJlZnJlc2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxuICAgICAgICAgICAgcmV0dXJuICd2bS5yZWZyZXNoJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblxuICAgIC8vIEZhbGxiYWNrOiB3aXphcmQgbmF2aWdhdGUgdG8gdGhlIGFjdGl2ZSBwYWdlIChyZWJpbmQpXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93Py5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gKHR5cGVvZiB3aXouYWN0aXZlUGFnZSA9PT0gJ2Z1bmN0aW9uJykgPyB3aXouYWN0aXZlUGFnZSgpIDogd2l6LmFjdGl2ZVBhZ2U7XG4gICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlKGFjdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gJ3dpei5uYXZpZ2F0ZVBhZ2UnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXG4gICAgcmV0dXJuIG51bGw7XG59XG5cblxuXG5jb25zdCBIVUJfQlROX0lEID0gJ3F0NTAtdmFsaWRhdGUnO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRyeSB7IGNvbnN0IGh1YiA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGh1YikgcmV0dXJuIGh1YjsgfSBjYXRjaCB7IH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3VlcyA9IFtdKSB7XG4gICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuXG4gICAgLy8gZWxlbWVudHNcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdxdHYtbW9kYWwtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbC5pZCA9ICdxdHYtbW9kYWwnO1xuICAgIG1vZGFsLmNsYXNzTmFtZSA9ICdsdC1jYXJkJztcbiAgICBPYmplY3QuYXNzaWduKG1vZGFsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLFxuICAgICAgICBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJ21pbig5MDBweCwgOTJ2dyknXG4gICAgfSk7XG5cbiAgICAvLyBidWlsZCByb3dzIChQbGV4LWxpa2U6IHNvcnQgKyBzdXBwcmVzcyByZXBlYXRpbmcgU29ydC9QYXJ0L1J1bGUgZGlzcGxheSlcbiAgICBjb25zdCBzb3J0ZWQgPSBbLi4uaXNzdWVzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGNvbnN0IHNvQSA9IChhLnNvcnRPcmRlciA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpO1xuICAgICAgICBjb25zdCBzb0IgPSAoYi5zb3J0T3JkZXIgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKTtcbiAgICAgICAgaWYgKHNvQSAhPT0gc29CKSByZXR1cm4gc29BIC0gc29CO1xuICAgICAgICBjb25zdCBwbkEgPSBTdHJpbmcoYS5wYXJ0Tm8gPz8gJycpO1xuICAgICAgICBjb25zdCBwbkIgPSBTdHJpbmcoYi5wYXJ0Tm8gPz8gJycpO1xuICAgICAgICBpZiAocG5BICE9PSBwbkIpIHJldHVybiBwbkEubG9jYWxlQ29tcGFyZShwbkIpO1xuICAgICAgICBjb25zdCBybEEgPSBTdHJpbmcoYS5ydWxlTGFiZWwgPz8gYS5raW5kID8/ICcnKTtcbiAgICAgICAgY29uc3QgcmxCID0gU3RyaW5nKGIucnVsZUxhYmVsID8/IGIua2luZCA/PyAnJyk7XG4gICAgICAgIHJldHVybiBybEEubG9jYWxlQ29tcGFyZShybEIpO1xuICAgIH0pO1xuXG4gICAgbGV0IHByZXZTb3J0ID0gbnVsbCwgcHJldlBhcnQgPSBudWxsLCBwcmV2UnVsZSA9IG51bGw7XG4gICAgY29uc3Qgcm93c0h0bWwgPSBzb3J0ZWQubWFwKGlzcyA9PiB7XG4gICAgICAgIGNvbnN0IGx2bCA9IChpc3MubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGx2bENsYXNzID0gKGx2bCA9PT0gJ2Vycm9yJykgPyAncXR2LXBpbGwtLWVycm9yJyA6IChsdmwgPT09ICd3YXJuJyB8fCBsdmwgPT09ICd3YXJuaW5nJykgPyAncXR2LXBpbGwtLXdhcm4nIDogJ3F0di1waWxsLS1pbmZvJztcbiAgICAgICAgY29uc3QgbHZsUGlsbCA9IGA8c3BhbiBjbGFzcz1cInF0di1waWxsICR7bHZsQ2xhc3N9XCI+JHtsdmwgfHwgJ2luZm8nfTwvc3Bhbj5gO1xuICAgICAgICBjb25zdCByZWFzb24gPSBpc3MubWVzc2FnZSB8fCAnKG5vIG1lc3NhZ2UpJztcbiAgICAgICAgY29uc3QgcnVsZSA9IFN0cmluZyhpc3MucnVsZUxhYmVsIHx8IGlzcy5raW5kIHx8ICdWYWxpZGF0aW9uJyk7XG5cbiAgICAgICAgLy8gU3VwcHJlc3MgcmVwZWF0cyBpbiB2aXN1YWwgdGFibGUgY2VsbHNcbiAgICAgICAgY29uc3Qgc2hvd1NvcnQgPSAoaXNzLnNvcnRPcmRlciAhPT0gcHJldlNvcnQpID8gKGlzcy5zb3J0T3JkZXIgPz8gJycpIDogJyc7XG4gICAgICAgIGNvbnN0IHNob3dQYXJ0ID0gKHNob3dTb3J0ICE9PSAnJyB8fCAoaXNzLnBhcnRObyAhPT0gcHJldlBhcnQpKSA/IChpc3MucGFydE5vID8/ICcnKSA6ICcnO1xuICAgICAgICBjb25zdCBzYW1lR3JvdXBBc1ByZXYgPSAoc2hvd1NvcnQgPT09ICcnICYmIHNob3dQYXJ0ID09PSAnJyk7XG4gICAgICAgIGNvbnN0IHNob3dSdWxlID0gKCFzYW1lR3JvdXBBc1ByZXYgfHwgcnVsZSAhPT0gcHJldlJ1bGUpID8gcnVsZSA6ICcnO1xuXG4gICAgICAgIHByZXZTb3J0ID0gaXNzLnNvcnRPcmRlcjtcbiAgICAgICAgcHJldlBhcnQgPSBpc3MucGFydE5vO1xuICAgICAgICBwcmV2UnVsZSA9IHJ1bGU7XG5cbiAgICAgICAgcmV0dXJuIGBcbiAgPHRyIGRhdGEtcXBrPVwiJHtpc3MucXVvdGVQYXJ0S2V5ID8/ICcnfVwiIGRhdGEtcnVsZT1cIiR7U3RyaW5nKGlzcy5raW5kIHx8ICcnKX1cIj5cbiAgICA8dGQ+JHtzaG93U29ydH08L3RkPlxuICAgIDx0ZD4ke3Nob3dQYXJ0fTwvdGQ+XG4gICAgPHRkPiR7c2hvd1J1bGV9PC90ZD5cbiAgICA8dGQ+JHtsdmxQaWxsfTwvdGQ+XG4gICAgPHRkPiR7cmVhc29ufTwvdGQ+XG4gIDwvdHI+YDtcbiAgICB9KS5qb2luKCcnKTtcblxuXG4gICAgbW9kYWwuaW5uZXJIVE1MID0gYFxuICA8ZGl2IGNsYXNzPVwicXR2LWhkIGx0LWNhcmRfX2hlYWRlclwiPlxuICAgIDxoMyBjbGFzcz1cImx0LWNhcmRfX3RpdGxlXCI+VmFsaWRhdGlvbiBEZXRhaWxzPC9oMz5cbiAgICA8ZGl2IGNsYXNzPVwicXR2LWFjdGlvbnMgbHQtY2FyZF9fc3BhY2VyXCI+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwibHQtYnRuIGx0LWJ0bi0tZ2hvc3RcIiBpZD1cInF0di1leHBvcnQtY3N2XCIgdGl0bGU9XCJFeHBvcnQgdmlzaWJsZSBpc3N1ZXMgdG8gQ1NWXCI+RXhwb3J0IENTVjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIiBpZD1cInF0di1jbG9zZVwiPkNsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIDwvZGl2PlxuICA8ZGl2IGNsYXNzPVwicXR2LWJkIGx0LWNhcmRfX2JvZHlcIj5cbiAgICA8dGFibGUgY2xhc3M9XCJsdC10YWJsZVwiIGFyaWEtbGFiZWw9XCJWYWxpZGF0aW9uIElzc3Vlc1wiPlxuICAgICAgPHRoZWFkPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRoPlNvcnQmbmJzcDtPcmRlcjwvdGg+XG4gICAgICAgICAgPHRoPlBhcnQgIzwvdGg+XG4gICAgICAgICAgPHRoPlJ1bGU8L3RoPlxuICAgICAgICAgIDx0aD5MZXZlbDwvdGg+XG4gICAgICAgICAgPHRoPlJlYXNvbjwvdGg+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RoZWFkPlxuICAgICAgPHRib2R5PiR7cm93c0h0bWwgfHwgYDx0cj48dGQgY29sc3Bhbj1cIjVcIiBzdHlsZT1cIm9wYWNpdHk6Ljc7IHBhZGRpbmc6MTJweDtcIj5ObyBpc3N1ZXMuPC90ZD48L3RyPmB9PC90Ym9keT5cbiAgICA8L3RhYmxlPlxuICA8L2Rpdj5cbmA7XG5cblxuICAgIC8vIGludGVyYWN0aW9uc1xuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKTtcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBvdmVybGF5KSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcblxuICAgIC8vIGNsaWNrIHJvdyB0byBmb2N1cyArIGhpZ2hsaWdodCArIHNjcm9sbFxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJ3Rib2R5Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgY29uc3QgdHIgPSBlLnRhcmdldC5jbG9zZXN0KCd0cicpOyBpZiAoIXRyKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHFwayA9IHRyLmdldEF0dHJpYnV0ZSgnZGF0YS1xcGsnKTtcbiAgICAgICAgaWYgKCFxcGspIHJldHVybjtcbiAgICAgICAgLy8gZW5zdXJlIGhpZ2hsaWdodHMgZXhpc3QsIHRoZW4ganVtcFxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG4gICAgICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHJvdykge1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJykpO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcpO1xuICAgICAgICAgICAgcm93LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICdjZW50ZXInLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIGV4cG9ydCBDU1ZcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydC1jc3YnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNzdiA9IFtcbiAgICAgICAgICAgIFsnTGluZScsICdTb3J0T3JkZXInLCAnUGFydE5vJywgJ1F1b3RlUGFydEtleScsICdSdWxlJywgJ0xldmVsJywgJ1JlYXNvbiddLmpvaW4oJywnKSxcbiAgICAgICAgICAgIC4uLmlzc3Vlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXNjID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2ID8/ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIC9bXCIsXFxuXS8udGVzdChzKSA/IGBcIiR7cy5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYCA6IHM7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgICBpLmxpbmVOdW1iZXIgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkuc29ydE9yZGVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnBhcnRObyA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5xdW90ZVBhcnRLZXkgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucnVsZUxhYmVsIHx8IGkua2luZCB8fCAnVmFsaWRhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgIGkubGV2ZWwgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIGkubWVzc2FnZSB8fCAnJ1xuICAgICAgICAgICAgICAgIF0ubWFwKGVzYykuam9pbignLCcpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXS5qb2luKCdcXG4nKTtcblxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24taXNzdWVzLmNzdic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChtb2RhbCk7XG4gICAgKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChvdmVybGF5KTtcbiAgICB0cnkgeyBvdmVybGF5LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTsgb3ZlcmxheS5mb2N1cygpOyB9IGNhdGNoIHsgfVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG59XG5cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKSB7XG4gICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQ6ICduYXYnIH0pO1xuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcblxuICAgIC8vIGF2b2lkIGR1cGxpY2F0ZVxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgbGV0IGJ0bkVsID0gbnVsbDtcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICBsYWJlbDogJ1ZhbGlkYXRlIExpbmVzJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcbiAgICAgICAgd2VpZ2h0OiAxMzAsXG4gICAgICAgIG9uQ2xpY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaz8uKCdWYWxpZGF0aW5nXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgb2xkIGhpZ2hsaWdodHMgYW5kIGVuc3VyZSBzdHlsZXMgYXJlIHByZXNlbnQgdXAtZnJvbnRcbiAgICAgICAgICAgICAgICBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCk7XG4gICAgICAgICAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncyk7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XG4gICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBpc3N1ZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gQXV0by1oaWdobGlnaHQgYWxsIGVycm9yIHJvd3MgaW1tZWRpYXRlbHkgKGJlZm9yZSBtb2RhbClcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGlzcyBvZiBpc3N1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IGlzcz8ucXVvdGVQYXJ0S2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFxcGspIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyb3cpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZSA9ICdxdHYtcm93LWZhaWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NGb3JJc3N1ZShpc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoYmFzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xzKSByb3cuY2xhc3NMaXN0LmFkZChjbHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oJ0xpbmVzIHZhbGlkJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oJ0FsbCBjbGVhcicsICdzdWNjZXNzJywgeyBzdGlja3k6IGZhbHNlIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oMCk7XG4gICAgICAgICAgICAgICAgICAgIHRhc2suZG9uZT8uKCdWYWxpZCcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRhbGx5IG91dGNvbWVzIChoYW5kbGVzIG1pc3NpbmcgbGV2ZWwgZ3JhY2VmdWxseSlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGV2ZWxzID0gaXNzdWVzLm1hcChpID0+IFN0cmluZyhpPy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0Vycm9yID0gbGV2ZWxzLnNvbWUobCA9PiBsID09PSAnZXJyb3InIHx8IGwgPT09ICdmYWlsJyB8fCBsID09PSAnY3JpdGljYWwnKVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgaXNzdWVzLnNvbWUoaSA9PiAvcHJpY2VcXC4oPzptYXh1bml0cHJpY2V8bWludW5pdHByaWNlKS9pLnRlc3QoU3RyaW5nKGk/LmtpbmQgfHwgJycpKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1dhcm4gPSAhaGFzRXJyb3IgJiYgbGV2ZWxzLnNvbWUobCA9PiBsID09PSAnd2FybicgfHwgbCA9PT0gJ3dhcm5pbmcnKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdW1tYXJ5ID0gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gR3VhcmQgdG8gZW5zdXJlIFVJIHByb2JsZW1zIG5ldmVyIGJsb2NrIHRoZSBtb2RhbFxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oYFxcdTI3NEMgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ2lzc3VlJyA6ICdpc3N1ZXMnfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNzRDICR7Y291bnR9IGlzc3VlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdlcnJvcicsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhc1dhcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXFx1MjZBMFxcdUZFMEYgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ3dhcm5pbmcnIDogJ3dhcm5pbmdzJ31gLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNkEwXFx1RkUwRiAke2NvdW50fSB3YXJuaW5nJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICd3YXJuJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mby1vbmx5IHVwZGF0ZXMgKGUuZy4sIGF1dG8tbWFuYWdlIHBvc3RzIHdpdGggbGV2ZWw9aW5mbylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBhcHBsaWVkYCwgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdpbmZvJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5ldmVyIGJsb2NrIHRoZSBtb2RhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHNob3cgdGhlIGRldGFpbHMgd2hlbiBjb3VudCA+IDBcbiAgICAgICAgICAgICAgICAgICAgc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGF1dG9NYW5hZ2UgYWN0dWFsbHkgY2hhbmdlZCBQYXJ0X05vIChsZXZlbD13YXJuaW5nKSwgcmVmcmVzaCB0aGUgZ3JpZCAocXQzMCBwYXR0ZXJuKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZWVkc1JlZnJlc2ggPSBpc3N1ZXMuc29tZShpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ua2luZCB8fCAnJykuaW5jbHVkZXMoJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnd2FybmluZycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGk/Lm1ldGE/LmNoYW5nZWQgPT09IHRydWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobmVlZHNSZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/IGBHcmlkIHJlZnJlc2hlZCAoJHttb2RlfSlgIDogJ0dyaWQgcmVmcmVzaCBhdHRlbXB0ZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyAnc3VjY2VzcycgOiAnaW5mbydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LignR3JpZCByZWZyZXNoIGZhaWxlZCcsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignQ2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNhY2hlIGxhc3Qgc3RhdHVzIGZvciBTUEEgcmVkcmF3c1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSByZXM7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLmVycm9yPy4oYFZhbGlkYXRpb24gZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA2MDAwIH0pO1xuICAgICAgICAgICAgICAgIHRhc2suZXJyb3I/LignRXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gR3JhYiBiYWNrIHRoZSByZWFsIERPTSBidXR0b24gdG8gdXBkYXRlIHRpdGxlIGxhdGVyXG4gICAgYnRuRWwgPSBodWIuX3NoYWRvdz8ucXVlcnlTZWxlY3Rvcj8uKGBbZGF0YS1pZD1cIiR7SFVCX0JUTl9JRH1cIl1gKTtcblxuICAgIGNvbnN0IG9mZlNldHRpbmdzID0gb25TZXR0aW5nc0NoYW5nZT8uKCgpID0+IHJlZnJlc2hMYWJlbChidG5FbCkpO1xuICAgIHJlZnJlc2hMYWJlbChidG5FbCk7XG5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBvZmZTZXR0aW5ncz8uKCk7XG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaExhYmVsKGJ0bikge1xuICAgIGlmICghYnRuKSByZXR1cm47XG4gICAgY29uc3QgcyA9IGdldFNldHRpbmdzKCk7XG4gICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICAvL2lmIChzLnJlcXVpcmVSZXNvbHZlZFBhcnQpIHBhcnRzLnB1c2goJ1BhcnQnKTtcbiAgICAvL2lmIChzLmZvcmJpZFplcm9QcmljZSkgcGFydHMucHVzaCgnXHUyMjYwJDAnKTtcbiAgICBpZiAocy5taW5Vbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY1JHtzLm1pblVuaXRQcmljZX1gKTtcbiAgICBpZiAocy5tYXhVbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY0JHtzLm1heFVuaXRQcmljZX1gKTtcbiAgICBidG4udGl0bGUgPSBgUnVsZXM6ICR7cGFydHMuam9pbignLCAnKSB8fCAnbm9uZSd9YDtcbn1cblxuZnVuY3Rpb24gZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpIHtcbiAgICAvLyBJZiB0aGUgZ2xvYmFsIHRoZW1lIHByb3ZpZGVzIC5xdHYtKiBzdHlsZXMsIGRvIG5vdGhpbmcuXG4gICAgY29uc3QgaGFzVGhlbWVRdHYgPSAoKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdGVzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgdGVzdC5jbGFzc05hbWUgPSAncXR2LXBpbGwnO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0ZXN0KTtcbiAgICAgICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZSh0ZXN0KTtcbiAgICAgICAgICAgIGNvbnN0IG9rID0gISFjcyAmJiAoY3MuYm9yZGVyUmFkaXVzIHx8ICcnKS5pbmNsdWRlcygnOTk5cHgnKTtcbiAgICAgICAgICAgIHRlc3QucmVtb3ZlKCk7XG4gICAgICAgICAgICByZXR1cm4gb2s7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICB9KSgpO1xuXG4gICAgaWYgKGhhc1RoZW1lUXR2KSByZXR1cm47XG5cbiAgICAvLyBGYWxsYmFjayBzaGltIChrZXB0IHRpbnkpOiBoaWdobGlnaHQgb25seTsgbW9kYWwvdGFibGUgc3R5bGVzIHdpbGwgc3RpbGwgYmUgc2V0IGlubGluZS5cbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3F0di1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS5pZCA9ICdxdHYtc3R5bGVzJztcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbi8qIE1pbmltYWwgc2NhZmZvbGRpbmcgd2hlbiB0aGVtZS5jc3MgaXNuJ3QgcmVhZHkgKi9cbiNxdHYtbW9kYWwtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jcXR2LW1vZGFsIHtcbiAgLyogTG9jYWwgTW9ucm9lIHBhbGV0dGUgKGluZGVwZW5kZW50IG9mIHBhZ2UgdG9rZW5zKSAqL1xuICAtLWJyYW5kLTYwMDogIzhiMGIwNDtcbiAgLS1icmFuZC03MDA6ICM1YzBhMGE7XG4gIC0tb2s6ICMyOGE3NDU7XG4gIC0td2FybjogI2ZmYzEwNztcbiAgLS1lcnI6ICNkYzM1NDU7XG5cbiAgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDUwJTsgbGVmdDogNTAlOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLC01MCUpOyB3aWR0aDogbWluKDkwMHB4LDkydncpO1xufVxuXG4ubHQtY2FyZCB7IGJhY2tncm91bmQ6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDEycHg7IGJveC1zaGFkb3c6IDAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjMwKTsgb3ZlcmZsb3c6IGhpZGRlbjsgfVxuLmx0LWNhcmRfX2hlYWRlciB7IGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjsgcGFkZGluZzogMTJweCAxNnB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgwLDAsMCwuMDgpOyB9XG4ubHQtY2FyZF9fdGl0bGUgeyBtYXJnaW46IDA7IGZvbnQ6IDYwMCAxNnB4LzEuMiBzeXN0ZW0tdWksIFNlZ29lIFVJLCBzYW5zLXNlcmlmOyB9XG4ubHQtY2FyZF9fc3BhY2VyIHsgbWFyZ2luLWxlZnQ6IGF1dG87IH1cbi5sdC1jYXJkX19ib2R5IHsgcGFkZGluZzogMTJweCAxNnB4OyBtYXgtaGVpZ2h0OiBtaW4oNzB2aCw2ODBweCk7IG92ZXJmbG93OiBhdXRvOyB9XG5cbi5sdC1idG4geyBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7IGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7IH1cbi5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4ubHQtYnRuLS1wcmltYXJ5OmhvdmVyIHsgYmFja2dyb3VuZDogdmFyKC0tYnJhbmQtNzAwKTsgfVxuLmx0LWJ0bi0tZ2hvc3QgeyBiYWNrZ3JvdW5kOnRyYW5zcGFyZW50OyBjb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgYm9yZGVyLWNvbG9yOiB2YXIoLS1icmFuZC02MDApOyB9XG4ubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG5cbi5sdC10YWJsZSB7IHdpZHRoOjEwMCU7IGJvcmRlci1jb2xsYXBzZTogc2VwYXJhdGU7IGJvcmRlci1zcGFjaW5nOiAwOyBmb250OiA0MDAgMTNweC8xLjM1IHN5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWY7IH1cbi5sdC10YWJsZSB0aCB7IHRleHQtYWxpZ246bGVmdDsgcGFkZGluZzo4cHggMTBweDsgYmFja2dyb3VuZDojZjNmNGY2OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZTVlN2ViOyBwb3NpdGlvbjpzdGlja3k7IHRvcDowOyB9XG4ubHQtdGFibGUgdGQgeyBwYWRkaW5nOjhweCAxMHB4OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZjFmNWY5OyB9XG4ubHQtdGFibGUgdGJvZHkgdHI6aG92ZXIgeyBiYWNrZ3JvdW5kOiNmOGZhZmM7IH1cblxuLnF0di1waWxsIHsgZGlzcGxheTppbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6NnB4OyBwYWRkaW5nOjNweCAxMHB4OyBib3JkZXItcmFkaXVzOjk5OXB4OyBmb250LXdlaWdodDo2MDA7IGZvbnQtc2l6ZToxMnB4OyBib3JkZXI6MXB4IHNvbGlkIHRyYW5zcGFyZW50OyB9XG4ucXR2LXBpbGwtLWVycm9yIHsgYmFja2dyb3VuZDojZGMyNjI2OyBjb2xvcjojZmZmOyB9XG4ucXR2LXBpbGwtLXdhcm4gIHsgYmFja2dyb3VuZDojZjU5ZTBiOyBjb2xvcjojMTExOyB9XG4ucXR2LXBpbGwtLWluZm8gIHsgYmFja2dyb3VuZDojM2I4MmY2OyBjb2xvcjojZmZmOyB9XG5cbi8qIFJvdyBoaWdobGlnaHRzICovXG4ucXR2LXJvdy1mYWlsIHsgb3V0bGluZTogMnB4IHNvbGlkIHJnYmEoMjIwLCAzOCwgMzgsIC44NSkgIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0ycHg7IH1cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NCwgMjI2LCAyMjYsIC42NSkgIWltcG9ydGFudDsgfVxuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjE5LCAyMzQsIDI1NCwgLjY1KSAhaW1wb3J0YW50OyB9XG5gO1xuXG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbn1cblxuXG4vLyBpbnNlcnQgYWJvdmUgZW5zdXJlUm93S2V5QXR0cmlidXRlcygpXG5mdW5jdGlvbiBnZXRPYnNWYWwodm0sIHByb3ApIHtcbiAgICB0cnkgeyBjb25zdCB2ID0gdm0/Lltwcm9wXTsgcmV0dXJuICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgPyB2KCkgOiB2OyB9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG4vKiogVGFnIHZpc2libGUgZ3JpZCByb3dzIHdpdGggZGF0YS1xdW90ZS1wYXJ0LWtleSBieSByZWFkaW5nIEtPIGNvbnRleHQgKi9cbmZ1bmN0aW9uIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSB7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBpZiAoIWdyaWQpIHJldHVybiAwO1xuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBsZXQgdGFnZ2VkID0gMDtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBpZiAoci5oYXNBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknKSkgeyB0YWdnZWQrKzsgY29udGludWU7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4ocik7XG4gICAgICAgICAgICBjb25zdCByb3dWTSA9IGN0eD8uJGRhdGEgPz8gY3R4Py4kcm9vdCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgcXBrID0gKHR5cGVvZiBUTVV0aWxzPy5nZXRPYnNWYWx1ZSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgICAgICAgICA/IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93Vk0sICdRdW90ZVBhcnRLZXknKVxuICAgICAgICAgICAgICAgIDogZ2V0T2JzVmFsKHJvd1ZNLCAnUXVvdGVQYXJ0S2V5Jyk7XG5cbiAgICAgICAgICAgIGlmIChxcGsgIT0gbnVsbCAmJiBxcGsgIT09ICcnICYmIE51bWJlcihxcGspID4gMCkge1xuICAgICAgICAgICAgICAgIHIuc2V0QXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JywgU3RyaW5nKHFwaykpO1xuICAgICAgICAgICAgICAgIHRhZ2dlZCsrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgcGVyLXJvdyBmYWlsdXJlcyAqLyB9XG4gICAgfVxuICAgIHJldHVybiB0YWdnZWQ7XG59XG5mdW5jdGlvbiBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCcpO1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBGYXN0IHBhdGg6IGF0dHJpYnV0ZSAocHJlZmVycmVkKVxuICAgIGxldCByb3cgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXF1b3RlLXBhcnQta2V5PVwiJHtDU1MuZXNjYXBlKFN0cmluZyhxcGspKX1cIl1gKTtcbiAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuXG4gICAgLy8gSWYgYXR0cmlidXRlcyBhcmUgbWlzc2luZywgdHJ5IHRvIHRhZyB0aGVtIG9uY2UgdGhlbiByZXRyeVxuICAgIGlmIChlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkgPiAwKSB7XG4gICAgICAgIHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgICAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuICAgIH1cblxuICAgIC8vIExhc3QgcmVzb3J0OiB0ZXh0dWFsIHNjYW4gKGxlc3MgcmVsaWFibGUsIGJ1dCB3b3JrcyB0b2RheSlcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xuICAgICk7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgY29uc3QgdHh0ID0gKHIudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKHR4dC5pbmNsdWRlcyhTdHJpbmcocXBrKSkpIHJldHVybiByO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY2xhc3NGb3JJc3N1ZShpc3MpIHtcbiAgICBjb25zdCBraW5kID0gU3RyaW5nKGlzcz8ua2luZCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoa2luZC5pbmNsdWRlcygncHJpY2UubWF4dW5pdHByaWNlJykpIHJldHVybiAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0JztcbiAgICBpZiAoa2luZC5pbmNsdWRlcygncHJpY2UubWludW5pdHByaWNlJykpIHJldHVybiAncXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0JztcbiAgICByZXR1cm4gJyc7XG59XG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XG5cblxuaWYgKERFVikge1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgPSAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHIHx8IHt9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcudGFnU3RhdHMgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIGNvbnN0IHJvd3MgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnKSA6IFtdO1xuICAgICAgICBjb25zdCB0YWdnZWQgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1xdW90ZS1wYXJ0LWtleV0nKSA6IFtdO1xuICAgICAgICBjb25zb2xlLmxvZygnW1FUVl0gcm93czonLCByb3dzLmxlbmd0aCwgJ3RhZ2dlZDonLCB0YWdnZWQubGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIHsgdG90YWw6IHJvd3MubGVuZ3RoLCB0YWdnZWQ6IHRhZ2dlZC5sZW5ndGggfTtcbiAgICB9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcuaGlsaVRlc3QgPSAocXBrKSA9PiB7XG4gICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcbiAgICAgICAgY29uc3QgciA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHIpIHsgci5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnLCAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7IHIuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgfVxuICAgICAgICByZXR1cm4gISFyO1xuICAgIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTRDQSxXQUFTLGFBQWEsR0FBRztBQUNyQixVQUFNLElBQUksWUFBWSxDQUFDO0FBQ3ZCLFFBQUksTUFBTSxPQUFXLFFBQU87QUFFNUIsVUFBTSxZQUFZLE9BQU8sT0FBTyxXQUFXLEVBQUUsS0FBSyxRQUFNLEdBQUcsU0FBUyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3ZGLFVBQU0sS0FBSyxZQUFZLFlBQVksU0FBUyxJQUFJO0FBQ2hELFdBQVEsT0FBTyxTQUFhLEtBQUs7QUFBQSxFQUNyQztBQVFPLFdBQVMsY0FBYztBQUMxQixXQUFPO0FBQUEsTUFDSCxTQUFTLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDNUIsMkJBQTJCLE9BQU8sS0FBSyx5QkFBeUI7QUFBQSxNQUNoRSxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsTUFDdEMsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLE1BQ3RDLG1CQUFtQixPQUFPLEtBQUssaUJBQWlCO0FBQUEsSUFDcEQ7QUFBQSxFQUNKO0FBRU8sV0FBUyxpQkFBaUIsSUFBSTtBQUNqQyxRQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFDN0MsVUFBTSxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFDaEMsV0FBTyxpQkFBaUIsMEJBQTBCLENBQUM7QUFDbkQsV0FBTyxNQUFNLE9BQU8sb0JBQW9CLDBCQUEwQixDQUFDO0FBQUEsRUFDdkU7QUFDQSxXQUFTLGNBQWM7QUFDbkIsUUFBSTtBQUFFLGFBQU8sY0FBYyxJQUFJLFlBQVksMEJBQTBCLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFBRyxRQUFRO0FBQUEsSUFBRTtBQUFBLEVBQ2hIO0FBV0EsaUJBQWUsZ0JBQWdCO0FBRTNCLFVBQU0sV0FBVyxRQUFRLGFBQWEsTUFBTTtBQUM1QyxVQUFNLFNBQVMsU0FBUyxjQUFjLGdIQUFnSDtBQUN0SixVQUFNLFFBQVEsUUFBUSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxHQUFHO0FBQ25FLFVBQU0sV0FBVztBQUdqQixVQUFNLE1BQU0sT0FBTyxlQUFlQSxRQUFPLE9BQU8sRUFBRSxPQUFPLE1BQU0sR0FBRztBQUM5RCxlQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUN6QixjQUFNLFNBQVUsT0FBTyxlQUFlLGNBQWM7QUFDcEQsWUFBSSxPQUFPLFdBQVcsWUFBWTtBQUM5QixjQUFJO0FBQUUsa0JBQU0sSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUFHLGdCQUFJLEVBQUcsUUFBTztBQUFBLFVBQUcsUUFBUTtBQUFBLFVBQUU7QUFBQSxRQUNuRTtBQUNBLGNBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQzdDO0FBQ0EsYUFBTztBQUFBLElBQ1gsR0FBRztBQUVILFFBQUksQ0FBQyxLQUFLLGVBQWdCO0FBRTFCLFVBQU0sS0FBSztBQUNYLFVBQU0sU0FBUyxJQUFJLE9BQU8sR0FBRyxTQUFTLEVBQUU7QUFDeEMsUUFBSSxZQUFZLENBQUMsUUFBUTtBQUNyQixVQUFJLGVBQWUsU0FBUztBQUFBLFFBQ3hCLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNMLFdBQVcsQ0FBQyxZQUFZLFFBQVE7QUFDNUIsVUFBSSxTQUFTLEVBQUU7QUFBQSxJQUNuQjtBQUFBLEVBQ0o7QUFFQSxXQUFTLFlBQVk7QUFDakIsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsS0FBSztBQUNiLFdBQU8sT0FBTyxRQUFRLE9BQU87QUFBQSxNQUN6QixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsSUFDWixDQUFDO0FBRUQsVUFBTSxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQzFDLFVBQU0sS0FBSztBQUNYLFVBQU0sWUFBWTtBQUNsQixXQUFPLE9BQU8sTUFBTSxPQUFPO0FBQUEsTUFDdkIsVUFBVTtBQUFBLE1BQ1YsS0FBSztBQUFBLE1BQU8sTUFBTTtBQUFBLE1BQ2xCLFdBQVc7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLFVBQVU7QUFBQSxJQUNkLENBQUM7QUFJRCxZQUFRLGlCQUFpQixXQUFXLENBQUMsTUFBTTtBQUFFLFVBQUksRUFBRSxRQUFRLFNBQVUsU0FBUSxPQUFPO0FBQUEsSUFBRyxDQUFDO0FBQ3hGLFlBQVEsV0FBVztBQUduQixZQUFRLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUFFLFVBQUksRUFBRSxXQUFXLFFBQVMsU0FBUSxPQUFPO0FBQUEsSUFBRyxDQUFDO0FBR3hGLFVBQU0saUJBQWlCLFNBQVMsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUM7QUFFMUQsVUFBTSxZQUFZO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTRDbEIsVUFBTSxjQUFjLGNBQWMsRUFBRSxVQUFVLE9BQU8sS0FBSyxPQUFPO0FBQ2pFLFVBQU0sY0FBYyxnQ0FBZ0MsRUFBRSxVQUFVLE9BQU8sS0FBSyx5QkFBeUI7QUFDckcsVUFBTSxjQUFjLHdCQUF3QixFQUFFLFVBQVUsT0FBTyxLQUFLLGlCQUFpQjtBQUNyRixxQkFBaUIsTUFBTSxjQUFjLFVBQVUsR0FBRyxPQUFPLEtBQUssWUFBWSxDQUFDO0FBQzNFLHFCQUFpQixNQUFNLGNBQWMsVUFBVSxHQUFHLE9BQU8sS0FBSyxZQUFZLENBQUM7QUFHM0UsVUFBTSxjQUFjLGNBQWMsR0FBRyxpQkFBaUIsVUFBVSxPQUFLLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQzdHLFVBQU0sY0FBYyxnQ0FBZ0MsR0FBRyxpQkFBaUIsVUFBVSxPQUFLLE9BQU8sS0FBSywyQkFBMkIsQ0FBQyxDQUFDLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFDakosVUFBTSxjQUFjLHdCQUF3QixHQUFHO0FBQUEsTUFBaUI7QUFBQSxNQUFVLE9BQ3RFLE9BQU8sS0FBSyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsSUFDckQ7QUFDQSxVQUFNLGNBQWMsVUFBVSxHQUFHLGlCQUFpQixVQUFVLE9BQUs7QUFDN0QsWUFBTSxJQUFJLGtCQUFrQixFQUFFLE9BQU8sS0FBSztBQUFHLGFBQU8sS0FBSyxjQUFjLENBQUM7QUFBRyx1QkFBaUIsRUFBRSxRQUFRLENBQUM7QUFBQSxJQUMzRyxDQUFDO0FBQ0QsVUFBTSxjQUFjLFVBQVUsR0FBRyxpQkFBaUIsVUFBVSxPQUFLO0FBQzdELFlBQU0sSUFBSSxrQkFBa0IsRUFBRSxPQUFPLEtBQUs7QUFBRyxhQUFPLEtBQUssY0FBYyxDQUFDO0FBQUcsdUJBQWlCLEVBQUUsUUFBUSxDQUFDO0FBQUEsSUFDM0csQ0FBQztBQUdELFVBQU0sY0FBYyxZQUFZLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUMvRCxjQUFRLE9BQU87QUFDZixjQUFRLFFBQVEsOEJBQThCLFdBQVcsSUFBSTtBQUFBLElBQ2pFLENBQUM7QUFFRCxVQUFNLGNBQWMsWUFBWSxHQUFHLGlCQUFpQixTQUFTLE1BQU07QUFDL0QsYUFBTyxLQUFLLEdBQUcsRUFBRSxRQUFRLE9BQUssWUFBWSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDcEQsa0JBQVk7QUFBRyxjQUFRLE9BQU87QUFDOUIsY0FBUSxRQUFRLDhCQUE4QixRQUFRLElBQUk7QUFBQSxJQUM5RCxDQUFDO0FBR0QsVUFBTSxjQUFjLGFBQWEsR0FBRyxpQkFBaUIsU0FBUyxNQUFNO0FBQ2hFLFlBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxLQUFLLFVBQVUsWUFBWSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzVGLFlBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJO0FBQUcsWUFBTSxJQUFJLFNBQVMsY0FBYyxHQUFHO0FBQzNFLFFBQUUsT0FBTztBQUFLLFFBQUUsV0FBVztBQUErQixRQUFFLE1BQU07QUFDbEUsaUJBQVcsTUFBTSxJQUFJLGdCQUFnQixHQUFHLEdBQUcsR0FBSTtBQUFBLElBQ25ELENBQUM7QUFHRCxVQUFNLGNBQWMsaUJBQWlCLEdBQUcsaUJBQWlCLFVBQVUsT0FBTyxPQUFPO0FBQzdFLFVBQUk7QUFDQSxjQUFNLElBQUksR0FBRyxPQUFPLFFBQVEsQ0FBQztBQUFHLFlBQUksQ0FBQyxFQUFHO0FBQ3hDLGNBQU0sT0FBTyxLQUFLLE1BQU0sTUFBTSxFQUFFLEtBQUssQ0FBQztBQUN0QyxZQUFJLFFBQVEsT0FBTyxTQUFTLFVBQVU7QUFDbEMsY0FBSSxhQUFhLEtBQU0sUUFBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLEtBQUssT0FBTztBQUMxRCxjQUFJLCtCQUErQixLQUFNLFFBQU8sS0FBSywyQkFBMkIsQ0FBQyxDQUFDLEtBQUsseUJBQXlCO0FBQ2hILGNBQUksa0JBQWtCLEtBQU0sUUFBTyxLQUFLLGNBQWMsZUFBZSxLQUFLLFlBQVksQ0FBQztBQUN2RixjQUFJLGtCQUFrQixLQUFNLFFBQU8sS0FBSyxjQUFjLGVBQWUsS0FBSyxZQUFZLENBQUM7QUFDdkYsa0JBQVEsT0FBTztBQUFHLGtCQUFRLFFBQVEsaUNBQWlDLFdBQVcsSUFBSTtBQUFBLFFBQ3RGLE1BQU8sT0FBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLE1BQzFDLFNBQVMsS0FBSztBQUNWLGdCQUFRLFFBQVEsa0JBQWtCLEtBQUssV0FBVyxHQUFHLElBQUksU0FBUyxHQUFJO0FBQUEsTUFDMUU7QUFBQSxJQUNKLENBQUM7QUFFRCx5QkFBcUI7QUFDckIsWUFBUSxZQUFZLEtBQUs7QUFDekIsS0FBQyxTQUFTLFFBQVEsU0FBUyxpQkFBaUIsWUFBWSxPQUFPO0FBRy9ELFlBQVEsTUFBTTtBQUFBLEVBQ2xCO0FBR0EsV0FBUyxrQkFBa0IsR0FBRztBQUFFLFVBQU0sSUFBSSxPQUFPLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQztBQUFHLFdBQU8sT0FBTyxTQUFTLENBQUMsSUFBSSxJQUFJO0FBQUEsRUFBTTtBQUMxRyxXQUFTLGVBQWUsR0FBRztBQUFFLFVBQU0sSUFBSSxPQUFPLENBQUM7QUFBRyxXQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksSUFBSTtBQUFBLEVBQU07QUFDeEYsV0FBUyxpQkFBaUIsT0FBTyxLQUFLO0FBQUUsVUFBTSxRQUFTLE9BQU8sT0FBTyxLQUFLLE9BQU8sR0FBRztBQUFBLEVBQUk7QUFHeEYsV0FBUyx1QkFBdUI7QUFDNUIsUUFBSSxTQUFTLGVBQWUscUJBQXFCLEVBQUc7QUFDcEQsVUFBTSxJQUFJLFNBQVMsY0FBYyxPQUFPO0FBQ3hDLE1BQUUsS0FBSztBQUNQLE1BQUUsY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQStCaEIsYUFBUyxLQUFLLFlBQVksQ0FBQztBQUFBLEVBQy9CO0FBbFRBLE1BRU0sS0FVQSxJQUNBLFFBR0EsVUFJTyxNQVFQLGFBUUEsS0FpQkEsUUFJQTtBQXpETjtBQUFBO0FBRUEsTUFBTSxNQUFPLE9BQ1AsT0FDQSxDQUFDLEVBQUUsT0FBTyxlQUFlLGVBQWUsV0FBVztBQVF6RCxNQUFNLEtBQU0sT0FBTyxpQkFBaUIsZUFBZSxhQUFhLEtBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0YsTUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBR3RELE1BQU0sV0FBVyxDQUFDLENBQUMsUUFBUSxhQUFhLE1BQU07QUFDOUMsVUFBSSxPQUFPLENBQUMsU0FBVSxTQUFRLE1BQU0sdUNBQXVDO0FBR3BFLE1BQU0sT0FBTztBQUFBLFFBQ2hCLFNBQVM7QUFBQSxRQUNULDJCQUEyQjtBQUFBLFFBQzNCLGNBQWM7QUFBQSxRQUNkLGNBQWM7QUFBQSxRQUNkLG1CQUFtQjtBQUFBLE1BQ3ZCO0FBRUEsTUFBTSxjQUFjO0FBQUEsUUFDaEIsU0FBUztBQUFBLFFBQ1QsMkJBQTJCO0FBQUEsUUFDM0IsY0FBYztBQUFBLFFBQ2QsY0FBYztBQUFBLFFBQ2QsbUJBQW1CO0FBQUEsTUFDdkI7QUFFQSxNQUFNLE1BQU07QUFBQSxRQUNSLENBQUMsS0FBSyxPQUFPLEdBQUc7QUFBQSxRQUNoQixDQUFDLEtBQUsseUJBQXlCLEdBQUc7QUFBQSxRQUNsQyxDQUFDLEtBQUssWUFBWSxHQUFHO0FBQUEsUUFDckIsQ0FBQyxLQUFLLFlBQVksR0FBRztBQUFBLFFBQ3JCLENBQUMsS0FBSyxpQkFBaUIsR0FBRztBQUFBLE1BQzlCO0FBV0EsTUFBTSxTQUFTLE9BQUs7QUFDaEIsY0FBTSxJQUFJLGFBQWEsQ0FBQztBQUN4QixlQUFRLE1BQU0sU0FBWSxJQUFJLENBQUMsSUFBSTtBQUFBLE1BQ3ZDO0FBQ0EsTUFBTSxTQUFTLENBQUMsR0FBRyxNQUFNO0FBQUUsb0JBQVksR0FBRyxDQUFDO0FBQUcsb0JBQVk7QUFBQSxNQUFHO0FBdUI3RCwrQkFBeUIsNENBQWtDLFNBQVM7QUFFcEUsVUFBSSxVQUFVO0FBQ1Ysc0JBQWM7QUFDZCxpQkFBUyxjQUFjLGFBQWE7QUFDcEMsbUJBQVcsZUFBZSxHQUFHO0FBQUEsTUFDakM7QUFBQTtBQUFBOzs7QUM1RUEsaUJBQU8sMEJBQWlELEtBQUssVUFBVSxPQUFPO0FBQzFFLFVBQU0sU0FBUyxDQUFDO0FBQ2hCLFFBQUksQ0FBQyxVQUFVLDBCQUEyQixRQUFPO0FBRWpELFVBQU0sT0FBUSxPQUFPLGlCQUFpQixjQUFjLGVBQWU7QUFDbkUsVUFBTUMsTUFBTSxLQUFLLE1BQU0sQ0FBQztBQUN4QixVQUFNLGdCQUFnQixDQUFDLE9BQU87QUFDMUIsWUFBTSxPQUFPQSxLQUFJLE1BQU0sTUFBTTtBQUM3QixhQUFRLE9BQU8sU0FBUyxhQUFjLEtBQUssRUFBRSxJQUFJLEdBQUc7QUFBQSxJQUN4RDtBQUdBLFVBQU0sTUFBTUEsSUFBRyxNQUFNLE1BQU0scUJBQ3JCQSxJQUFHLEtBQUssS0FBSyxtQkFBbUIsRUFBRSxJQUFJLE1BQU0sUUFBUSxTQUFTLGNBQWMsY0FBYyxDQUFDLElBQzFGO0FBRU4sVUFBTSxzQkFBc0I7QUFDNUIsVUFBTSxtQkFBbUI7QUFFekIsbUJBQWUsVUFBVTtBQUNyQixZQUFNLE9BQVEsT0FBTyxLQUFLLGtCQUFrQixhQUN0QyxNQUFNLEtBQUssY0FBYyxJQUN4QkEsS0FBSSxNQUFNO0FBQ2pCLFVBQUksQ0FBQyxLQUFNLE9BQU0sSUFBSSxNQUFNLDJCQUEyQjtBQUN0RCxhQUFPO0FBQUEsSUFDWDtBQUdBLGFBQVMsd0JBQXdCO0FBQzdCLFVBQUk7QUFBRSxnQkFBUSxlQUFlLFFBQVEsVUFBVSxLQUFLLElBQUksS0FBSztBQUFBLE1BQUcsUUFBUTtBQUFFLGVBQU87QUFBQSxNQUFJO0FBQUEsSUFDekY7QUFHQSxtQkFBZSxzQkFBc0IsSUFBSTtBQUNyQyxZQUFNLE9BQU8sT0FBTyxFQUFFO0FBQ3RCLFVBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxTQUFTLElBQUksS0FBSyxRQUFRLEVBQUcsUUFBTyxzQkFBc0I7QUFFL0UsVUFBSTtBQUNBLFlBQUksQ0FBQyxJQUFLLFFBQU8sc0JBQXNCO0FBRXZDLGNBQU0sRUFBRSxLQUFLLElBQUksSUFBSSxJQUFJLElBQUk7QUFDN0IsY0FBTSxLQUFLLDRCQUE0QjtBQUV2QyxZQUFJLE9BQU8sTUFBTSxLQUFLLFlBQVk7QUFDbEMsWUFBSSxDQUFDLE1BQU0sVUFBVTtBQUNqQixnQkFBTSxPQUFPLE1BQU0sUUFBUTtBQUMzQixjQUFJLE1BQU0sUUFBUTtBQUNkLGtCQUFNLE9BQU8sTUFBTSxjQUFjLE1BQU0sS0FBSyxPQUFPLHFCQUFxQixFQUFFLFdBQVcsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3BHLGtCQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsS0FBSyxDQUFDLElBQUk7QUFDN0Qsa0JBQU0sVUFBVSxPQUFPLFlBQVk7QUFDbkMsZ0JBQUksV0FBVyxNQUFNO0FBQ2pCLG9CQUFNLEtBQUssY0FBYyxFQUFFLFdBQVcsTUFBTSxVQUFVLFNBQVMseUJBQXlCLEtBQUssSUFBSSxFQUFFLENBQUM7QUFDcEcscUJBQU8sTUFBTSxLQUFLLFlBQVk7QUFBQSxZQUNsQztBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQ0EsY0FBTSxLQUFLLE1BQU07QUFDakIsZUFBUSxNQUFNLE9BQU8sc0JBQXNCLElBQUksT0FBTyxFQUFFLEVBQUUsS0FBSztBQUFBLE1BQ25FLFFBQVE7QUFDSixlQUFPLHNCQUFzQjtBQUFBLE1BQ2pDO0FBQUEsSUFDSjtBQUdBLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxJQUFJLGtCQUFrQixRQUFRLEdBQUc7QUFDeEQsWUFBTSxNQUFNLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxJQUFJO0FBQzlELFlBQU0sZ0JBQWdCLE1BQU0sSUFBSSxLQUFLLFlBQVksRUFBRSxRQUFRLEtBQUssQ0FBQztBQUdqRSxZQUFNLGtCQUFrQixNQUFNLHNCQUFzQixhQUFhO0FBR2pFLFlBQU0sZ0JBQWdCLG9CQUFJLElBQUk7QUFDOUIsaUJBQVcsT0FBTyxPQUFPO0FBQ3JCLGNBQU0sS0FBSyxNQUFNLElBQUksS0FBSyxXQUFXLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDckQsWUFBSSxPQUFPLFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxJQUFJLEVBQUUsR0FBRztBQUMvQyx3QkFBYyxJQUFJLElBQUksR0FBRztBQUFBLFFBQzdCO0FBQUEsTUFDSjtBQUVBLGlCQUFXLEtBQUssY0FBYyxPQUFPLEdBQUc7QUFDcEMsY0FBTSxTQUFTLE9BQU8sTUFBTSxJQUFJLEdBQUcsY0FBYyxFQUFFLE1BQU0sS0FBSyxDQUFDLEtBQUssRUFBRTtBQUN0RSxZQUFJLE9BQU8sWUFBWSxNQUFNLFFBQVM7QUFFdEMsY0FBTSxhQUFhLGlCQUFpQixNQUFNLElBQUksR0FBRyxZQUFZLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDN0UsY0FBTSxZQUFZLE1BQU0sSUFBSSxHQUFHLFdBQVcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMxRCxjQUFNLFdBQVcsT0FBTyxNQUFNLElBQUksR0FBRyxVQUFVLEVBQUUsTUFBTSxLQUFLLENBQUMsS0FBSyxFQUFFO0FBS3BFLGNBQU0sYUFBYSxDQUFDLENBQUM7QUFDckIsY0FBTSxnQkFBZ0IsYUFBYSxHQUFHLGVBQWUsTUFBTTtBQUMzRCxjQUFNLGlCQUFpQixTQUFTLFdBQVcsYUFBYTtBQUd4RCxZQUFJLGdCQUFnQjtBQUNoQixpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTO0FBQUEsWUFDVCxNQUFNLEVBQUUsUUFBUSxTQUFTLFVBQVUsWUFBWSxTQUFTLFdBQVcsUUFBUSxVQUFVLElBQUksa0JBQWtCLFNBQVMsTUFBTTtBQUFBLFVBQzlILENBQUM7QUFDRDtBQUFBLFFBQ0o7QUFHQSxjQUFNLGdCQUFnQixHQUFHLGFBQWEsR0FBRyxRQUFRO0FBRWpELGNBQU0sT0FBTztBQUFBLFVBQ1QsV0FBVyxPQUFPLGNBQWMsRUFBRTtBQUFBLFVBQ2xDLFVBQVUsT0FBTyxhQUFhLEVBQUU7QUFBQSxVQUNoQyxTQUFTLE9BQU8saUJBQWlCLEVBQUU7QUFBQSxVQUNuQyxhQUFhO0FBQUEsUUFDakI7QUFFQSxZQUFJO0FBQ0EsZ0JBQU0sT0FBTyxNQUFNLFFBQVE7QUFDM0IsY0FBSSxDQUFDLE1BQU0sT0FBUSxPQUFNLElBQUksTUFBTSx5QkFBeUI7QUFJNUQsZ0JBQU0sY0FBYyxNQUFNLEtBQUssT0FBTyxrQkFBa0IsSUFBSSxDQUFDO0FBRTdELGlCQUFPLEtBQUs7QUFBQSxZQUNSLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxZQUNQLGNBQWM7QUFBQSxZQUNkLFNBQVMsaUJBQVksS0FBSyxPQUFPO0FBQUEsWUFDakMsTUFBTSxFQUFFLFFBQVEsU0FBUyxVQUFVLFlBQVksU0FBUyxXQUFXLFFBQVEsVUFBVSxJQUFJLGtCQUFrQixTQUFTLEtBQUs7QUFBQSxVQUM3SCxDQUFDO0FBQUEsUUFDTCxTQUFTLEtBQUs7QUFDVixpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTLE1BQU0sZ0JBQWdCLFlBQVksS0FBSyxXQUFXLEdBQUc7QUFBQSxZQUM5RCxNQUFNLEVBQUUsUUFBUSxTQUFTLFVBQVUsWUFBWSxTQUFTLFdBQVcsUUFBUSxVQUFVLElBQUksa0JBQWtCLFNBQVMsTUFBTTtBQUFBLFVBQzlILENBQUM7QUFBQSxRQUNMO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFFQSxXQUFPO0FBQUEsRUFDWDtBQTNKQTtBQUFBO0FBOEpBLGdDQUEwQixPQUFPLEVBQUUsSUFBSSw2QkFBNkIsT0FBTyx5QkFBeUI7QUFBQTtBQUFBOzs7QUN4SnJGLFdBQVIsa0JBQW1DLEtBQUssVUFBVSxPQUFPO0FBQzVELFFBQUksQ0FBQyxVQUFVLGtCQUFtQixRQUFPLENBQUM7QUFFMUMsVUFBTSxTQUFTLENBQUM7QUFDaEIsVUFBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixVQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLFlBQU0sSUFBSSxPQUFPLE9BQU8sTUFBTSxhQUFhLEVBQUUsSUFBSSxDQUFDLEVBQUUsS0FBSztBQUN6RCxVQUFJLENBQUMsRUFBRyxRQUFPO0FBQ2YsYUFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLElBQzNDO0FBRUEsZUFBVyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksa0JBQWtCLFFBQVEsR0FBRztBQUN2RCxpQkFBVyxLQUFLLE9BQU87QUFDbkIsY0FBTSxNQUFNLE1BQU0sSUFBSSxHQUFHLFVBQVU7QUFDbkMsY0FBTSxNQUFNLE1BQU0sR0FBRztBQUVyQixZQUFJLE9BQU8sU0FBUyxHQUFHLEtBQUssUUFBUSxHQUFHO0FBQ25DLGlCQUFPLEtBQUs7QUFBQSxZQUNSLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxZQUNQLGNBQWM7QUFBQSxZQUNkLFNBQVM7QUFBQSxZQUNULE1BQU0sRUFBRSxhQUFhLEtBQUssYUFBYSxJQUFJO0FBQUEsVUFDL0MsQ0FBQztBQUFBLFFBQ0w7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUVBLFdBQU87QUFBQSxFQUNYO0FBbkNBO0FBQUE7QUFxQ0Esd0JBQWtCLE9BQU8sRUFBRSxJQUFJLHFCQUFxQixPQUFPLHNCQUFzQjtBQUFBO0FBQUE7OztBQzlCbEUsV0FBUixhQUE4QixLQUFLLFVBQVUsT0FBTztBQUN2RCxVQUFNLE1BQU0sT0FBTyxTQUFTLFlBQVk7QUFDeEMsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHLEVBQUcsUUFBTyxDQUFDO0FBRW5DLFVBQU0sU0FBUyxDQUFDO0FBQ2hCLFVBQU0sUUFBUSxDQUFDLE1BQU07QUFDakIsVUFBSSxLQUFLLEtBQU0sUUFBTztBQUN0QixZQUFNLElBQUksT0FBTyxPQUFPLE1BQU0sYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUs7QUFDekQsVUFBSSxDQUFDLEVBQUcsUUFBTztBQUNmLGFBQU8sT0FBTyxFQUFFLFFBQVEsWUFBWSxFQUFFLENBQUM7QUFBQSxJQUMzQztBQUVBLGVBQVcsQ0FBQyxJQUFJLEtBQUssS0FBSyxJQUFJLGtCQUFrQixRQUFRLEdBQUc7QUFDdkQsaUJBQVcsS0FBSyxPQUFPO0FBQ25CLGNBQU0sTUFBTSxNQUFNLElBQUksR0FBRyxVQUFVLEtBQUs7QUFDeEMsY0FBTSxNQUNGLE1BQU0sSUFBSSxHQUFHLHVCQUF1QixLQUNwQyxNQUFNLElBQUksR0FBRyxpQkFBaUIsS0FDOUIsTUFBTSxJQUFJLEdBQUcsV0FBVztBQUU1QixjQUFNLE1BQU0sTUFBTSxHQUFHO0FBR3JCLGNBQU0sZ0JBQWdCLENBQUMsV0FBVztBQUM5QixnQkFBTSxJQUFJLE9BQU8sT0FBTyxXQUFXLGFBQWEsT0FBTyxJQUFJLFVBQVUsRUFBRTtBQUN2RSxjQUFJLEtBQUssS0FBSyxDQUFDLEVBQUcsUUFBTztBQUN6QixjQUFJLElBQUksS0FBSyxDQUFDLEVBQUcsUUFBTztBQUN4QixjQUFJLElBQUksS0FBSyxDQUFDLEVBQUcsUUFBTztBQUN4QixpQkFBTyxVQUFVLGdCQUFnQjtBQUFBLFFBQ3JDO0FBRUEsY0FBTSxXQUFXLGNBQWMsR0FBRztBQUNsQyxjQUFNLFdBQVcsSUFBSSxLQUFLLGFBQWEsU0FBUyxFQUFFLE9BQU8sWUFBWSxVQUFVLHVCQUF1QixFQUFFLENBQUM7QUFDekcsY0FBTSxTQUFTLElBQUksS0FBSyxhQUFhLFNBQVMsRUFBRSx1QkFBdUIsRUFBRSxDQUFDO0FBRTFFLFlBQUksT0FBTyxTQUFTLEdBQUcsS0FBSyxNQUFNLEtBQUs7QUFDbkMsZ0JBQU0sV0FBVyxDQUFDLE1BQU0sT0FBTyxTQUFTLENBQUMsSUFBSSxTQUFTLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQztBQUUxRSxpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTLGNBQWMsU0FBUyxHQUFHLENBQUMsVUFBVSxTQUFTLEdBQUcsQ0FBQztBQUFBLFlBQzNELE1BQU0sRUFBRSxTQUFTLEtBQUssU0FBUyxLQUFLLEtBQUssU0FBUztBQUFBLFVBQ3RELENBQUM7QUFBQSxRQUNMO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFFQSxXQUFPO0FBQUEsRUFDWDtBQXpEQTtBQUFBO0FBMkRBLG1CQUFhLE9BQU8sRUFBRSxJQUFJLGdCQUFnQixPQUFPLGlCQUFpQjtBQUFBO0FBQUE7OztBQzFEbkQsV0FBUixhQUE4QixLQUFLLFVBQVUsT0FBTztBQUV2RCxVQUFNLE1BQU0sT0FBTyxTQUFTLFlBQVk7QUFDeEMsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHLEVBQUcsUUFBTyxDQUFDO0FBRW5DLFVBQU0sU0FBUyxDQUFDO0FBR2hCLFVBQU0sUUFBUSxDQUFDLE1BQU07QUFDakIsVUFBSSxLQUFLLEtBQU0sUUFBTztBQUN0QixZQUFNLElBQUksT0FBTyxPQUFPLE1BQU0sYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLEtBQUs7QUFDekQsVUFBSSxDQUFDLEVBQUcsUUFBTztBQUNmLGFBQU8sT0FBTyxFQUFFLFFBQVEsWUFBWSxFQUFFLENBQUM7QUFBQSxJQUMzQztBQUdBLGVBQVcsQ0FBQyxJQUFJLEtBQUssS0FBSyxJQUFJLGtCQUFrQixRQUFRLEdBQUc7QUFDdkQsaUJBQVcsS0FBSyxPQUFPO0FBQ25CLGNBQU0sTUFBTSxNQUFNLElBQUksR0FBRyxVQUFVLEtBQUs7QUFHeEMsY0FBTSxNQUNGLE1BQU0sSUFBSSxHQUFHLHVCQUF1QixLQUNwQyxNQUFNLElBQUksR0FBRyxpQkFBaUIsS0FDOUIsTUFBTSxJQUFJLEdBQUcsV0FBVztBQUU1QixjQUFNLE1BQU0sTUFBTSxHQUFHO0FBR3JCLGNBQU0sZ0JBQWdCLENBQUMsV0FBVztBQUM5QixnQkFBTSxJQUFJLE9BQU8sT0FBTyxXQUFXLGFBQWEsT0FBTyxJQUFLLFVBQVUsRUFBRyxFQUFFLEtBQUs7QUFDaEYsY0FBSSxLQUFLLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDekIsY0FBSSxJQUFJLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDeEIsY0FBSSxJQUFJLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDeEIsaUJBQU8sVUFBVSxnQkFBZ0I7QUFBQSxRQUNyQztBQUVBLGNBQU0sV0FBVyxjQUFjLEdBQUc7QUFDbEMsY0FBTSxXQUFXLElBQUksS0FBSyxhQUFhLFNBQVMsRUFBRSxPQUFPLFlBQVksVUFBVSx1QkFBdUIsRUFBRSxDQUFDO0FBRXpHLFlBQUksT0FBTyxTQUFTLEdBQUcsS0FBSyxNQUFNLEtBQUs7QUFDbkMsZ0JBQU0sV0FBVyxDQUFDLE1BQU0sT0FBTyxTQUFTLENBQUMsSUFBSSxTQUFTLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQztBQUMxRSxpQkFBTyxLQUFLO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxjQUFjO0FBQUEsWUFDZCxTQUFTLGNBQWMsU0FBUyxHQUFHLENBQUMsVUFBVSxTQUFTLEdBQUcsQ0FBQztBQUFBLFlBQzNELE1BQU0sRUFBRSxTQUFTLEtBQUssU0FBUyxLQUFLLEtBQUssU0FBUztBQUFBLFVBQ3RELENBQUM7QUFBQSxRQUNMO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFFQSxXQUFPO0FBQUEsRUFDWDtBQXZEQTtBQUFBO0FBeURBLG1CQUFhLE9BQU8sRUFBRSxJQUFJLGdCQUFnQixPQUFPLGlCQUFpQjtBQUFBO0FBQUE7OztBQ3pEbEUsTUFNTztBQU5QO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBLE1BQU8sZ0JBQVEsQ0FBQywyQkFBMkIsbUJBQW1CLGNBQWMsWUFBWTtBQUFBO0FBQUE7OztBQ054RjtBQUFBO0FBQUE7QUFBQTtBQUdBLGlCQUFzQixjQUFjQyxVQUFTLFVBQVU7QUFDbkQsVUFBTUEsU0FBUSxrQkFBa0IsY0FBYyxFQUFFLFdBQVcsTUFBTSxXQUFXLEtBQU0sQ0FBQztBQUVuRixVQUFNQyxNQUFNLE9BQU8saUJBQWlCLGNBQWMsYUFBYSxLQUFLLE9BQU87QUFDM0UsVUFBTSxPQUFPLFNBQVMsY0FBYyxZQUFZO0FBQ2hELFVBQU0sTUFBTyxRQUFRQSxPQUFNLE9BQU9BLElBQUcsWUFBWSxhQUFjQSxJQUFHLFFBQVEsSUFBSSxJQUFJO0FBQ2xGLFFBQUksQ0FBQyxJQUFLLFFBQU8sRUFBRSxJQUFJLE1BQU0sUUFBUSxDQUFDLEVBQUU7QUFFeEMsVUFBTSxPQUFRLEtBQUssWUFBWSxPQUFTLEtBQUssWUFBWSxRQUFTLENBQUM7QUFDbkUsVUFBTSxvQkFBb0Isb0JBQUksSUFBSTtBQUNsQyxlQUFXLEtBQUssTUFBTTtBQUNsQixZQUFNLEtBQUtELFNBQVEsWUFBWSxHQUFHLGNBQWMsS0FBSztBQUNyRCxPQUFDLGtCQUFrQixJQUFJLEVBQUUsS0FBSyxrQkFBa0IsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQztBQUFBLElBQy9FO0FBRUEsVUFBTSxxQkFBcUIsb0JBQUksSUFBSTtBQUNuQyxlQUFXLENBQUMsSUFBSSxLQUFLLEtBQUssa0JBQWtCLFFBQVEsR0FBRztBQUNuRCxZQUFNLElBQUksTUFBTSxLQUFLLE9BQUtBLFNBQVEsWUFBWSxHQUFHLG1CQUFtQixNQUFNLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDdkYseUJBQW1CLElBQUksSUFBSSxDQUFDO0FBQUEsSUFDaEM7QUFFQSxVQUFNLE1BQU07QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFVBQVVBLFNBQVEsS0FBSyx1QkFBdUI7QUFBQSxNQUM5QyxZQUFZQSxTQUFRLEtBQUssbUJBQW1CO0FBQUEsSUFDaEQ7QUFFQSxVQUFNLFFBQVEsRUFBRSxLQUFLLENBQUMsS0FBSyxNQUFNLFNBQVNBLFNBQVEsWUFBWSxLQUFLLE1BQU0sSUFBSSxFQUFFO0FBRS9FLFVBQU0sVUFBVSxNQUFNLFFBQVEsSUFBSSxjQUFNLElBQUksVUFBUSxLQUFLLEtBQUssVUFBVSxLQUFLLENBQUMsQ0FBQztBQUMvRSxVQUFNLFlBQVksUUFBUSxLQUFLO0FBQy9CLFVBQU0sS0FBSyxVQUFVLE1BQU0sT0FBSyxFQUFFLFVBQVUsT0FBTztBQUduRCxVQUFNLFFBQVEsQ0FBQyxNQUFNLE9BQU8sT0FBTyxLQUFLLEVBQUUsRUFBRSxRQUFRLFlBQVksRUFBRSxDQUFDO0FBQ25FLFVBQU0sZ0JBQWdCLENBQUMsUUFBUTtBQUUzQixVQUFJLEtBQUssTUFBTSxNQUFPLFFBQU8sSUFBSSxLQUFLO0FBQ3RDLFVBQUksS0FBSyxNQUFNO0FBQ1gsY0FBTSxJQUFJLE9BQU8sSUFBSSxJQUFJO0FBRXpCLGNBQU0sT0FBTyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUk7QUFDOUIsZUFBTyxPQUNELEtBQUssUUFBUSxtQkFBbUIsT0FBTyxFQUNwQyxRQUFRLE1BQU0sQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLElBQ3ZDO0FBQUEsTUFDVjtBQUNBLGFBQU87QUFBQSxJQUNYO0FBR0EsVUFBTSxVQUFVLG9CQUFJLElBQUk7QUFDeEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3RDLFlBQU0sSUFBSSxJQUFJLEtBQUssQ0FBQztBQUNwQixZQUFNLGFBQWEsSUFBSTtBQUN2QixZQUFNLFNBQVMsTUFBTSxJQUFJLEdBQUcsVUFBVSxFQUFFLE1BQU0sS0FBSyxDQUFDLEtBQUs7QUFDekQsY0FBUSxJQUFJLEdBQUcsRUFBRSxZQUFZLE9BQU8sQ0FBQztBQUFBLElBQ3pDO0FBR0EsVUFBTSxtQkFBbUIsb0JBQUksSUFBSTtBQUNqQyxlQUFXLENBQUMsSUFBSSxPQUFPLEtBQUssSUFBSSxtQkFBbUIsUUFBUSxHQUFHO0FBQzFELFlBQU0sT0FBTyxRQUFRLElBQUksT0FBTyxLQUFLLEVBQUUsWUFBWSxNQUFNLFFBQVEsTUFBTSxJQUFJLFNBQVMsVUFBVSxFQUFFLE1BQU0sS0FBSyxDQUFDLEtBQUssR0FBRztBQUNwSCx1QkFBaUIsSUFBSSxJQUFJLElBQUk7QUFBQSxJQUNqQztBQUdBLFVBQU0sYUFBYSxvQkFBSSxJQUFJO0FBQzNCLGFBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLFFBQVEsS0FBSztBQUN0QyxZQUFNLE1BQU0sSUFBSSxLQUFLLENBQUM7QUFDdEIsWUFBTSxhQUFhLElBQUk7QUFDdkIsWUFBTSxZQUFZLE1BQU0sSUFBSSxLQUFLLGFBQWEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUM5RCxpQkFBVyxJQUFJLFlBQVksU0FBUztBQUFBLElBQ3hDO0FBRUEsVUFBTSxTQUFTLFVBQVUsSUFBSSxTQUFPO0FBQ2hDLFlBQU0sTUFBTSxJQUFJLGdCQUFnQjtBQUNoQyxZQUFNLE9BQU8saUJBQWlCLElBQUksR0FBRyxLQUFLLEVBQUUsWUFBWSxNQUFNLFFBQVEsR0FBRztBQUN6RSxhQUFPO0FBQUEsUUFDSCxHQUFHO0FBQUEsUUFDSCxZQUFZLEtBQUs7QUFBQSxRQUNqQixRQUFRLEtBQUs7QUFBQSxRQUNiLFdBQVcsY0FBYyxHQUFHO0FBQUEsUUFDNUIsV0FBVyxXQUFXLElBQUksS0FBSyxjQUFjLEVBQUU7QUFBQSxNQUNuRDtBQUFBLElBQ0osQ0FBQztBQUlELElBQUFBLFNBQVEsUUFBUUEsU0FBUSxTQUFTLENBQUM7QUFDbEMsSUFBQUEsU0FBUSxNQUFNLGlCQUFpQixFQUFFLElBQUksS0FBSyxJQUFJLEdBQUcsSUFBSSxPQUFPO0FBRTVELFdBQU8sRUFBRSxJQUFJLE9BQU87QUFBQSxFQUN4QjtBQWxHQTtBQUFBO0FBQ0E7QUFBQTtBQUFBOzs7QUNvSEE7OztBQ2xIQTtBQUNBO0FBR0EsTUFBTUUsTUFBTSxPQUFPLGlCQUFpQixlQUFlLGFBQWEsS0FBTSxhQUFhLEtBQUssT0FBTztBQUcvRixXQUFTLG1CQUFtQixRQUFRO0FBQ2hDLFFBQUk7QUFDQSxZQUFNLFFBQVEsTUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLENBQUM7QUFDaEQsWUFBTSxNQUFNLE1BQU0sT0FBTyxDQUFDLEtBQUssT0FBTztBQUNsQyxjQUFNLE1BQU0sT0FBTyxJQUFJLFNBQVMsTUFBTSxFQUFFLFlBQVk7QUFDcEQsWUFBSSxHQUFHLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSztBQUM3QixZQUFJLElBQUksZ0JBQWdCLEtBQU0sS0FBSSxNQUFNLElBQUksR0FBRyxZQUFZO0FBQzNELGVBQU87QUFBQSxNQUNYLEdBQUcsRUFBRSxPQUFPLEdBQUcsU0FBUyxHQUFHLE1BQU0sR0FBRyxPQUFPLG9CQUFJLElBQUksRUFBRSxDQUFDO0FBRXRELFlBQU0sYUFBYSxJQUFJLE1BQU07QUFDN0IsWUFBTSxPQUFPLENBQUM7QUFDZCxVQUFJLElBQUksTUFBTyxNQUFLLEtBQUssR0FBRyxJQUFJLEtBQUssU0FBUyxJQUFJLFVBQVUsSUFBSSxLQUFLLEdBQUcsRUFBRTtBQUMxRSxVQUFJLElBQUksUUFBUyxNQUFLLEtBQUssR0FBRyxJQUFJLE9BQU8sV0FBVyxJQUFJLFlBQVksSUFBSSxLQUFLLEdBQUcsRUFBRTtBQUNsRixVQUFJLElBQUksS0FBTSxNQUFLLEtBQUssR0FBRyxJQUFJLElBQUksT0FBTztBQUMxQyxZQUFNLFlBQVksS0FBSyxLQUFLLElBQUksS0FBSztBQUVyQyxhQUFPLEdBQUcsU0FBUyxXQUFXLGNBQWMsQ0FBQyxRQUFRLGVBQWUsSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUNwRixRQUFRO0FBQ0osYUFBTztBQUFBLElBQ1g7QUFBQSxFQUNKO0FBR0EsaUJBQWUsbUJBQW1CO0FBQzlCLFFBQUk7QUFDQSxZQUFNLFNBQVMsU0FBUyxjQUFjLFlBQVk7QUFDbEQsWUFBTSxTQUFTLFVBQVVBLEtBQUksVUFBVSxNQUFNO0FBRTdDLFVBQUksT0FBTyxRQUFRLFlBQVksU0FBUyxZQUFZO0FBQ2hELGNBQU0sT0FBTyxXQUFXLEtBQUs7QUFDN0IsZUFBTztBQUFBLE1BQ1g7QUFDQSxVQUFJLE9BQU8sUUFBUSxZQUFZLFlBQVk7QUFDdkMsZUFBTyxRQUFRO0FBQ2YsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKLFFBQVE7QUFBQSxJQUFnQjtBQUd4QixRQUFJO0FBQ0EsWUFBTSxNQUFNLGNBQWMsTUFBTSxhQUFhO0FBQzdDLFVBQUksS0FBSyxjQUFjO0FBQ25CLGNBQU0sU0FBVSxPQUFPLElBQUksZUFBZSxhQUFjLElBQUksV0FBVyxJQUFJLElBQUk7QUFDL0UsWUFBSSxhQUFhLE1BQU07QUFDdkIsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKLFFBQVE7QUFBQSxJQUFnQjtBQUV4QixXQUFPO0FBQUEsRUFDWDtBQUlBLE1BQU0sYUFBYTtBQUVuQixpQkFBZSxPQUFPLE9BQU8sRUFBRSxPQUFPLE1BQU0sR0FBRztBQUMzQyxhQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUN6QixZQUFNLFNBQVUsT0FBTyxlQUFlLGNBQWM7QUFDcEQsVUFBSSxPQUFPLFdBQVcsWUFBWTtBQUM5QixZQUFJO0FBQUUsZ0JBQU0sTUFBTSxNQUFNLE9BQU8sSUFBSTtBQUFHLGNBQUksSUFBSyxRQUFPO0FBQUEsUUFBSyxRQUFRO0FBQUEsUUFBRTtBQUFBLE1BQ3pFO0FBQ0EsWUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDN0M7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUVBLFdBQVMsb0JBQW9CLFNBQVMsQ0FBQyxHQUFHO0FBQ3RDLDJCQUF1QjtBQUd2QixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBUSxLQUFLO0FBQ2IsV0FBTyxPQUFPLFFBQVEsT0FBTztBQUFBLE1BQ3pCLFVBQVU7QUFBQSxNQUNWLE9BQU87QUFBQSxNQUNQLFlBQVk7QUFBQSxNQUNaLFFBQVE7QUFBQSxJQUNaLENBQUM7QUFFRCxVQUFNLFFBQVEsU0FBUyxjQUFjLEtBQUs7QUFDMUMsVUFBTSxLQUFLO0FBQ1gsVUFBTSxZQUFZO0FBQ2xCLFdBQU8sT0FBTyxNQUFNLE9BQU87QUFBQSxNQUN2QixVQUFVO0FBQUEsTUFDVixLQUFLO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxPQUFPO0FBQUEsSUFDWCxDQUFDO0FBR0QsVUFBTSxTQUFTLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUN0QyxZQUFNLE1BQU8sRUFBRSxhQUFhLE9BQU87QUFDbkMsWUFBTSxNQUFPLEVBQUUsYUFBYSxPQUFPO0FBQ25DLFVBQUksUUFBUSxJQUFLLFFBQU8sTUFBTTtBQUM5QixZQUFNLE1BQU0sT0FBTyxFQUFFLFVBQVUsRUFBRTtBQUNqQyxZQUFNLE1BQU0sT0FBTyxFQUFFLFVBQVUsRUFBRTtBQUNqQyxVQUFJLFFBQVEsSUFBSyxRQUFPLElBQUksY0FBYyxHQUFHO0FBQzdDLFlBQU0sTUFBTSxPQUFPLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRTtBQUM5QyxZQUFNLE1BQU0sT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUU7QUFDOUMsYUFBTyxJQUFJLGNBQWMsR0FBRztBQUFBLElBQ2hDLENBQUM7QUFFRCxRQUFJLFdBQVcsTUFBTSxXQUFXLE1BQU0sV0FBVztBQUNqRCxVQUFNLFdBQVcsT0FBTyxJQUFJLFNBQU87QUFDL0IsWUFBTSxPQUFPLElBQUksU0FBUyxJQUFJLFlBQVk7QUFDMUMsWUFBTSxXQUFZLFFBQVEsVUFBVyxvQkFBcUIsUUFBUSxVQUFVLFFBQVEsWUFBYSxtQkFBbUI7QUFDcEgsWUFBTSxVQUFVLHlCQUF5QixRQUFRLEtBQUssT0FBTyxNQUFNO0FBQ25FLFlBQU0sU0FBUyxJQUFJLFdBQVc7QUFDOUIsWUFBTSxPQUFPLE9BQU8sSUFBSSxhQUFhLElBQUksUUFBUSxZQUFZO0FBRzdELFlBQU0sV0FBWSxJQUFJLGNBQWMsV0FBYSxJQUFJLGFBQWEsS0FBTTtBQUN4RSxZQUFNLFdBQVksYUFBYSxNQUFPLElBQUksV0FBVyxXQUFjLElBQUksVUFBVSxLQUFNO0FBQ3ZGLFlBQU0sa0JBQW1CLGFBQWEsTUFBTSxhQUFhO0FBQ3pELFlBQU0sV0FBWSxDQUFDLG1CQUFtQixTQUFTLFdBQVksT0FBTztBQUVsRSxpQkFBVyxJQUFJO0FBQ2YsaUJBQVcsSUFBSTtBQUNmLGlCQUFXO0FBRVgsYUFBTztBQUFBLGtCQUNHLElBQUksZ0JBQWdCLEVBQUUsZ0JBQWdCLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztBQUFBLFVBQ3BFLFFBQVE7QUFBQSxVQUNSLFFBQVE7QUFBQSxVQUNSLFFBQVE7QUFBQSxVQUNSLE9BQU87QUFBQSxVQUNQLE1BQU07QUFBQTtBQUFBLElBRVosQ0FBQyxFQUFFLEtBQUssRUFBRTtBQUdWLFVBQU0sWUFBWTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBbUJQLFlBQVksNEVBQTRFO0FBQUE7QUFBQTtBQUFBO0FBT25HLFVBQU0sY0FBYyxZQUFZLEdBQUcsaUJBQWlCLFNBQVMsTUFBTSxRQUFRLE9BQU8sQ0FBQztBQUNuRixZQUFRLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUFFLFVBQUksRUFBRSxXQUFXLFFBQVMsU0FBUSxPQUFPO0FBQUEsSUFBRyxDQUFDO0FBR3hGLFVBQU0sY0FBYyxPQUFPLEdBQUcsaUJBQWlCLFNBQVMsQ0FBQyxNQUFNO0FBQzNELFlBQU0sS0FBSyxFQUFFLE9BQU8sUUFBUSxJQUFJO0FBQUcsVUFBSSxDQUFDLEdBQUk7QUFDNUMsWUFBTSxNQUFNLEdBQUcsYUFBYSxVQUFVO0FBQ3RDLFVBQUksQ0FBQyxJQUFLO0FBRVYsNkJBQXVCO0FBQ3ZCLFlBQU0sTUFBTSwwQkFBMEIsR0FBRztBQUN6QyxVQUFJLEtBQUs7QUFDTCxpQkFBUyxpQkFBaUIsZUFBZSxFQUFFLFFBQVEsUUFBTSxHQUFHLFVBQVUsT0FBTyxjQUFjLENBQUM7QUFDNUYsWUFBSSxVQUFVLElBQUksY0FBYztBQUNoQyxZQUFJLGVBQWUsRUFBRSxPQUFPLFVBQVUsVUFBVSxTQUFTLENBQUM7QUFBQSxNQUM5RDtBQUFBLElBQ0osQ0FBQztBQUdELFVBQU0sY0FBYyxpQkFBaUIsR0FBRyxpQkFBaUIsU0FBUyxNQUFNO0FBQ3BFLFlBQU0sTUFBTTtBQUFBLFFBQ1IsQ0FBQyxRQUFRLGFBQWEsVUFBVSxnQkFBZ0IsUUFBUSxTQUFTLFFBQVEsRUFBRSxLQUFLLEdBQUc7QUFBQSxRQUNuRixHQUFHLE9BQU8sSUFBSSxPQUFLO0FBQ2YsZ0JBQU0sTUFBTSxDQUFDLE1BQU07QUFDZixrQkFBTSxJQUFJLE9BQU8sS0FBSyxFQUFFO0FBQ3hCLG1CQUFPLFNBQVMsS0FBSyxDQUFDLElBQUksSUFBSSxFQUFFLFFBQVEsTUFBTSxJQUFJLENBQUMsTUFBTTtBQUFBLFVBQzdEO0FBQ0EsaUJBQU87QUFBQSxZQUNILEVBQUUsY0FBYztBQUFBLFlBQ2hCLEVBQUUsYUFBYTtBQUFBLFlBQ2YsRUFBRSxVQUFVO0FBQUEsWUFDWixFQUFFLGdCQUFnQjtBQUFBLFlBQ2xCLEVBQUUsYUFBYSxFQUFFLFFBQVE7QUFBQSxZQUN6QixFQUFFLFNBQVM7QUFBQSxZQUNYLEVBQUUsV0FBVztBQUFBLFVBQ2pCLEVBQUUsSUFBSSxHQUFHLEVBQUUsS0FBSyxHQUFHO0FBQUEsUUFDdkIsQ0FBQztBQUFBLE1BQ0wsRUFBRSxLQUFLLElBQUk7QUFFWCxZQUFNLE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDakQsWUFBTSxNQUFNLElBQUksZ0JBQWdCLElBQUk7QUFDcEMsWUFBTSxJQUFJLFNBQVMsY0FBYyxHQUFHO0FBQ3BDLFFBQUUsT0FBTztBQUFLLFFBQUUsV0FBVztBQUE0QixRQUFFLE1BQU07QUFDL0QsaUJBQVcsTUFBTSxJQUFJLGdCQUFnQixHQUFHLEdBQUcsR0FBSTtBQUFBLElBQ25ELENBQUM7QUFFRCxZQUFRLFlBQVksS0FBSztBQUN6QixLQUFDLFNBQVMsUUFBUSxTQUFTLGlCQUFpQixZQUFZLE9BQU87QUFDL0QsUUFBSTtBQUFFLGNBQVEsYUFBYSxZQUFZLElBQUk7QUFBRyxjQUFRLE1BQU07QUFBQSxJQUFHLFFBQVE7QUFBQSxJQUFFO0FBQ3pFLFlBQVEsaUJBQWlCLFdBQVcsQ0FBQyxNQUFNO0FBQUUsVUFBSSxFQUFFLFFBQVEsU0FBVSxTQUFRLE9BQU87QUFBQSxJQUFHLENBQUM7QUFBQSxFQUU1RjtBQUdBLGlCQUFzQixzQkFBc0JDLFVBQVM7QUFDakQsVUFBTSxNQUFNLE1BQU0sT0FBTyxFQUFFLE9BQU8sTUFBTSxDQUFDO0FBQ3pDLFFBQUksQ0FBQyxLQUFLLGVBQWdCLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFHekMsUUFBSSxJQUFJLE9BQU8sR0FBRyxTQUFTLFVBQVUsRUFBRyxRQUFPLE1BQU07QUFBQSxJQUFFO0FBRXZELFFBQUksUUFBUTtBQUNaLFFBQUksZUFBZSxRQUFRO0FBQUEsTUFDdkIsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsU0FBUyxZQUFZO0FBQ2pCLGNBQU0sV0FBVyxjQUFjLEtBQUssQ0FBQztBQUNyQyxjQUFNLE9BQU8sR0FBRyxLQUFLLElBQUksWUFBWSxvQkFBZSxNQUFNLEtBQUssRUFBRSxPQUFPO0FBQUEsUUFBRSxHQUFHLFFBQVE7QUFBQSxRQUFFLEVBQUU7QUFFekYsWUFBSTtBQUVBLG9DQUEwQjtBQUMxQixpQ0FBdUI7QUFFdkIsZ0JBQU0sTUFBTSxNQUFNLGNBQWNBLFVBQVMsUUFBUTtBQUNqRCxnQkFBTSxTQUFTLE1BQU0sUUFBUSxLQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsQ0FBQztBQUMxRCxnQkFBTSxRQUFRLE9BQU87QUFHckIsY0FBSTtBQUNBLHVCQUFXLE9BQU8sUUFBUTtBQUN0QixvQkFBTSxNQUFNLEtBQUs7QUFDakIsa0JBQUksQ0FBQyxJQUFLO0FBQ1Ysb0JBQU0sTUFBTSwwQkFBMEIsR0FBRztBQUN6QyxrQkFBSSxDQUFDLElBQUs7QUFDVixvQkFBTSxPQUFPO0FBQ2Isb0JBQU0sTUFBTSxjQUFjLEdBQUc7QUFDN0Isa0JBQUksVUFBVSxJQUFJLElBQUk7QUFDdEIsa0JBQUksSUFBSyxLQUFJLFVBQVUsSUFBSSxHQUFHO0FBQUEsWUFDbEM7QUFBQSxVQUNKLFFBQVE7QUFBQSxVQUFrQjtBQUUxQixjQUFJLFVBQVUsR0FBRztBQUNiLGVBQUcsS0FBSyxJQUFJLFNBQVMsZUFBZSxTQUFTO0FBQzdDLGVBQUcsS0FBSyxJQUFJLFlBQVksYUFBYSxXQUFXLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFDakUsNEJBQWdCLENBQUM7QUFDakIsaUJBQUssT0FBTyxPQUFPO0FBQUEsVUFDdkIsT0FBTztBQUVILGtCQUFNLFNBQVMsT0FBTyxJQUFJLE9BQUssT0FBTyxHQUFHLFNBQVMsRUFBRSxFQUFFLFlBQVksQ0FBQztBQUNuRSxrQkFBTSxXQUFXLE9BQU8sS0FBSyxPQUFLLE1BQU0sV0FBVyxNQUFNLFVBQVUsTUFBTSxVQUFVLEtBQzVFLE9BQU8sS0FBSyxPQUFLLHdDQUF3QyxLQUFLLE9BQU8sR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQzNGLGtCQUFNLFVBQVUsQ0FBQyxZQUFZLE9BQU8sS0FBSyxPQUFLLE1BQU0sVUFBVSxNQUFNLFNBQVM7QUFFN0Usa0JBQU0sVUFBVSxtQkFBbUIsTUFBTTtBQUd6QyxnQkFBSTtBQUNBLGtCQUFJLFVBQVU7QUFDVixtQkFBRyxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssZUFBZSxVQUFVLElBQUksVUFBVSxRQUFRLElBQUksT0FBTztBQUM5RixtQkFBRyxLQUFLLElBQUksWUFBWSxVQUFVLEtBQUssU0FBUyxVQUFVLElBQUksS0FBSyxHQUFHLFdBQU0sT0FBTyxJQUFJLFNBQVMsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUNoSCxnQ0FBZ0IsS0FBSztBQUFBLGNBQ3pCLFdBQVcsU0FBUztBQUNoQixtQkFBRyxLQUFLLElBQUksU0FBUyxnQkFBZ0IsS0FBSyxlQUFlLFVBQVUsSUFBSSxZQUFZLFVBQVUsSUFBSSxNQUFNO0FBQ3ZHLG1CQUFHLEtBQUssSUFBSSxZQUFZLGdCQUFnQixLQUFLLFdBQVcsVUFBVSxJQUFJLEtBQUssR0FBRyxXQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDdkgsZ0NBQWdCLEtBQUs7QUFBQSxjQUN6QixPQUFPO0FBRUgsbUJBQUcsS0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLFVBQVUsVUFBVSxJQUFJLEtBQUssR0FBRyxZQUFZLE1BQU07QUFDL0UsbUJBQUcsS0FBSyxJQUFJLFlBQVksR0FBRyxLQUFLLFVBQVUsVUFBVSxJQUFJLEtBQUssR0FBRyxXQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDekcsZ0NBQWdCLEtBQUs7QUFBQSxjQUN6QjtBQUFBLFlBQ0osUUFBUTtBQUFBLFlBQThCO0FBR3RDLGdDQUFvQixNQUFNO0FBRzFCLGtCQUFNLGVBQWUsT0FBTztBQUFBLGNBQUssT0FDN0IsT0FBTyxHQUFHLFFBQVEsRUFBRSxFQUFFLFNBQVMsMkJBQTJCLEtBQzFELE9BQU8sR0FBRyxTQUFTLEVBQUUsRUFBRSxZQUFZLE1BQU0sYUFDekMsR0FBRyxNQUFNLFlBQVk7QUFBQSxZQUN6QjtBQUVBLGdCQUFJLGNBQWM7QUFDZCxrQkFBSTtBQUNBLHNCQUFNLE9BQU8sTUFBTSxpQkFBaUI7QUFDcEMsbUJBQUcsTUFBTSxLQUFLO0FBQUEsa0JBQ1YsT0FBTyxtQkFBbUIsSUFBSSxNQUFNO0FBQUEsa0JBQ3BDLE9BQU8sWUFBWTtBQUFBLGdCQUN2QjtBQUFBLGNBQ0osUUFBUTtBQUNKLG1CQUFHLE1BQU0sS0FBSyxTQUFTLHVCQUF1QixNQUFNO0FBQUEsY0FDeEQ7QUFBQSxZQUNKO0FBRUEsaUJBQUssT0FBTyxTQUFTO0FBQUEsVUFDekI7QUFHQSxVQUFBQSxTQUFRLFFBQVFBLFNBQVEsU0FBUyxDQUFDO0FBQ2xDLFVBQUFBLFNBQVEsTUFBTSxpQkFBaUI7QUFBQSxRQUVuQyxTQUFTLEtBQUs7QUFDVixhQUFHLEtBQUssSUFBSSxRQUFRLHFCQUFxQixLQUFLLFdBQVcsR0FBRyxJQUFJLFNBQVMsRUFBRSxJQUFJLElBQUssQ0FBQztBQUNyRixlQUFLLFFBQVEsT0FBTztBQUFBLFFBQ3hCO0FBQUEsTUFDSjtBQUFBLElBQ0osQ0FBQztBQUdELFlBQVEsSUFBSSxTQUFTLGdCQUFnQixhQUFhLFVBQVUsSUFBSTtBQUVoRSxVQUFNLGNBQWMsbUJBQW1CLE1BQU0sYUFBYSxLQUFLLENBQUM7QUFDaEUsaUJBQWEsS0FBSztBQUVsQixXQUFPLE1BQU07QUFDVCxvQkFBYztBQUNkLFdBQUssU0FBUyxVQUFVO0FBQUEsSUFDNUI7QUFBQSxFQUNKO0FBRUEsV0FBUyxhQUFhLEtBQUs7QUFDdkIsUUFBSSxDQUFDLElBQUs7QUFDVixVQUFNLElBQUksWUFBWTtBQUN0QixVQUFNLFFBQVEsQ0FBQztBQUdmLFFBQUksRUFBRSxnQkFBZ0IsS0FBTSxPQUFNLEtBQUssU0FBSSxFQUFFLFlBQVksRUFBRTtBQUMzRCxRQUFJLEVBQUUsZ0JBQWdCLEtBQU0sT0FBTSxLQUFLLFNBQUksRUFBRSxZQUFZLEVBQUU7QUFDM0QsUUFBSSxRQUFRLFVBQVUsTUFBTSxLQUFLLElBQUksS0FBSyxNQUFNO0FBQUEsRUFDcEQ7QUFFQSxXQUFTLHlCQUF5QjtBQUU5QixVQUFNLGVBQWUsTUFBTTtBQUN2QixVQUFJO0FBQ0EsY0FBTSxPQUFPLFNBQVMsY0FBYyxLQUFLO0FBQ3pDLGFBQUssWUFBWTtBQUNqQixpQkFBUyxLQUFLLFlBQVksSUFBSTtBQUM5QixjQUFNLEtBQUssaUJBQWlCLElBQUk7QUFDaEMsY0FBTSxLQUFLLENBQUMsQ0FBQyxPQUFPLEdBQUcsZ0JBQWdCLElBQUksU0FBUyxPQUFPO0FBQzNELGFBQUssT0FBTztBQUNaLGVBQU87QUFBQSxNQUNYLFFBQVE7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQzVCLEdBQUc7QUFFSCxRQUFJLFlBQWE7QUFHakIsUUFBSSxTQUFTLGVBQWUsWUFBWSxFQUFHO0FBQzNDLFVBQU0sUUFBUSxTQUFTLGNBQWMsT0FBTztBQUM1QyxVQUFNLEtBQUs7QUFDWCxVQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTBDcEIsYUFBUyxLQUFLLFlBQVksS0FBSztBQUFBLEVBRW5DO0FBSUEsV0FBUyxVQUFVLElBQUksTUFBTTtBQUN6QixRQUFJO0FBQUUsWUFBTSxJQUFJLEtBQUssSUFBSTtBQUFHLGFBQVEsT0FBTyxNQUFNLGFBQWMsRUFBRSxJQUFJO0FBQUEsSUFBRyxRQUFRO0FBQUUsYUFBTztBQUFBLElBQVc7QUFBQSxFQUN4RztBQUdBLFdBQVMseUJBQXlCO0FBQzlCLFVBQU0sT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUNoRCxRQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFVBQU0sT0FBTyxLQUFLO0FBQUEsTUFDZDtBQUFBLElBQ0o7QUFDQSxRQUFJLFNBQVM7QUFDYixlQUFXLEtBQUssTUFBTTtBQUNsQixVQUFJLEVBQUUsYUFBYSxxQkFBcUIsR0FBRztBQUFFO0FBQVU7QUFBQSxNQUFVO0FBQ2pFLFVBQUk7QUFDQSxjQUFNLE1BQU1ELEtBQUksYUFBYSxDQUFDO0FBQzlCLGNBQU0sUUFBUSxLQUFLLFNBQVMsS0FBSyxTQUFTO0FBQzFDLGNBQU0sTUFBTyxPQUFPLFNBQVMsZ0JBQWdCLGFBQ3ZDLFFBQVEsWUFBWSxPQUFPLGNBQWMsSUFDekMsVUFBVSxPQUFPLGNBQWM7QUFFckMsWUFBSSxPQUFPLFFBQVEsUUFBUSxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUc7QUFDOUMsWUFBRSxhQUFhLHVCQUF1QixPQUFPLEdBQUcsQ0FBQztBQUNqRDtBQUFBLFFBQ0o7QUFBQSxNQUVKLFFBQVE7QUFBQSxNQUFnQztBQUFBLElBQzVDO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFDQSxXQUFTLDRCQUE0QjtBQUNqQyxhQUFTLGlCQUFpQixlQUFlLEVBQUUsUUFBUSxRQUFNO0FBQ3JELFNBQUcsVUFBVSxPQUFPLGNBQWM7QUFDbEMsU0FBRyxVQUFVLE9BQU8sNkJBQTZCO0FBQ2pELFNBQUcsVUFBVSxPQUFPLDZCQUE2QjtBQUFBLElBQ3JELENBQUM7QUFBQSxFQUNMO0FBRUEsV0FBUywwQkFBMEIsS0FBSztBQUNwQyxVQUFNLE9BQU8sU0FBUyxjQUFjLFlBQVk7QUFDaEQsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUdsQixRQUFJLE1BQU0sS0FBSyxjQUFjLHlCQUF5QixJQUFJLE9BQU8sT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJO0FBQ2pGLFFBQUksSUFBSyxRQUFPLElBQUksUUFBUSx3Q0FBd0MsS0FBSztBQUd6RSxRQUFJLHVCQUF1QixJQUFJLEdBQUc7QUFDOUIsWUFBTSxLQUFLLGNBQWMseUJBQXlCLElBQUksT0FBTyxPQUFPLEdBQUcsQ0FBQyxDQUFDLElBQUk7QUFDN0UsVUFBSSxJQUFLLFFBQU8sSUFBSSxRQUFRLHdDQUF3QyxLQUFLO0FBQUEsSUFDN0U7QUFHQSxVQUFNLE9BQU8sS0FBSztBQUFBLE1BQ2Q7QUFBQSxJQUNKO0FBQ0EsZUFBVyxLQUFLLE1BQU07QUFDbEIsWUFBTSxPQUFPLEVBQUUsZUFBZSxJQUFJLEtBQUs7QUFDdkMsVUFBSSxJQUFJLFNBQVMsT0FBTyxHQUFHLENBQUMsRUFBRyxRQUFPO0FBQUEsSUFDMUM7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUVBLFdBQVMsY0FBYyxLQUFLO0FBQ3hCLFVBQU0sT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFLEVBQUUsWUFBWTtBQUNqRCxRQUFJLEtBQUssU0FBUyxvQkFBb0IsRUFBRyxRQUFPO0FBQ2hELFFBQUksS0FBSyxTQUFTLG9CQUFvQixFQUFHLFFBQU87QUFDaEQsV0FBTztBQUFBLEVBQ1g7QUFFQSxNQUFNRSxPQUFPLE9BQXdDLE9BQWdCO0FBR3JFLE1BQUlBLE1BQUs7QUFDTCxLQUFDLGdCQUFnQixRQUFRLGFBQWEsZ0JBQWdCLFFBQVEsYUFBYSxDQUFDO0FBQzVFLEtBQUMsZ0JBQWdCLFFBQVEsVUFBVSxXQUFXLE1BQU07QUFDaEQsWUFBTSxPQUFPLFNBQVMsY0FBYyxZQUFZO0FBQ2hELFlBQU0sT0FBTyxPQUFPLEtBQUssaUJBQWlCLDRGQUE0RixJQUFJLENBQUM7QUFDM0ksWUFBTSxTQUFTLE9BQU8sS0FBSyxpQkFBaUIsdUJBQXVCLElBQUksQ0FBQztBQUN4RSxjQUFRLElBQUksZUFBZSxLQUFLLFFBQVEsV0FBVyxPQUFPLE1BQU07QUFDaEUsYUFBTyxFQUFFLE9BQU8sS0FBSyxRQUFRLFFBQVEsT0FBTyxPQUFPO0FBQUEsSUFDdkQ7QUFDQSxLQUFDLGdCQUFnQixRQUFRLFVBQVUsV0FBVyxDQUFDLFFBQVE7QUFDbkQsNkJBQXVCO0FBQ3ZCLFlBQU0sSUFBSSwwQkFBMEIsR0FBRztBQUN2QyxVQUFJLEdBQUc7QUFBRSxVQUFFLFVBQVUsSUFBSSxnQkFBZ0IsNkJBQTZCO0FBQUcsVUFBRSxlQUFlLEVBQUUsT0FBTyxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFBRztBQUNwSSxhQUFPLENBQUMsQ0FBQztBQUFBLElBQ2I7QUFBQSxFQUNKOzs7QUQ3ZkEsTUFBTUMsT0FBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFFekQsTUFBSSxNQUFlO0FBR2YsUUFBUyxZQUFULFdBQXFCO0FBQ2pCLFlBQU0sT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUNoRCxhQUFPLE9BQVFDLEtBQUksVUFBVSxJQUFJLEtBQUssT0FBUTtBQUFBLElBQ2xELEdBQ1MsY0FBVCxXQUF1QjtBQUNuQixZQUFNLE1BQU0sVUFBVTtBQUN0QixhQUFRLEtBQUssWUFBWSxPQUFTLEtBQUssWUFBWSxRQUFTLENBQUM7QUFBQSxJQUNqRSxHQUNTLFdBQVQsU0FBa0IsR0FBRztBQUNqQixZQUFNLEtBQUssQ0FBQyxHQUFHLFNBQVMsUUFBUSxZQUFZLEdBQUcsR0FBRyxJQUFJO0FBQ3RELGFBQU87QUFBQSxRQUNILGNBQWMsR0FBRyxjQUFjO0FBQUEsUUFDL0IsUUFBUSxHQUFHLFVBQVUsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLFFBQ25DLFlBQVksR0FBRyxjQUFjLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUMzQyxVQUFVLEdBQUcsVUFBVTtBQUFBLFFBQ3ZCLFdBQVcsR0FBRyxXQUFXO0FBQUEsUUFDekIsaUJBQWlCLEdBQUcsaUJBQWlCO0FBQUEsUUFDckMsdUJBQXVCLEdBQUcsdUJBQXVCO0FBQUEsUUFDakQsbUJBQW1CLEdBQUcsbUJBQW1CO0FBQUEsTUFDN0M7QUFBQSxJQUNKLEdBQ1MsUUFBVCxTQUFlLE1BQU07QUFDakIsVUFBSSxDQUFDLE1BQU0sT0FBUSxRQUFPO0FBQzFCLFlBQU0sT0FBTyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDaEMsWUFBTSxNQUFNLENBQUMsTUFBTyxLQUFLLE9BQU8sS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLElBQUksSUFDNUcsSUFBSSxPQUFPLENBQUMsRUFBRSxRQUFRLE1BQU0sSUFBSSxDQUFDLE1BQ2pDLE9BQU8sQ0FBQztBQUNkLFlBQU0sT0FBTyxLQUFLLEtBQUssR0FBRztBQUMxQixZQUFNLE9BQU8sS0FBSyxJQUFJLE9BQUssS0FBSyxJQUFJLE9BQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUk7QUFDeEUsYUFBTyxPQUFPLE9BQU87QUFBQSxJQUN6QixHQUNTLFdBQVQsU0FBa0IsTUFBTSxNQUFNO0FBQzFCLFlBQU0sTUFBTSxJQUFJLGdCQUFnQixJQUFJO0FBQ3BDLFlBQU0sSUFBSSxTQUFTLGNBQWMsR0FBRztBQUNwQyxRQUFFLE9BQU87QUFBSyxRQUFFLFdBQVc7QUFBTSxRQUFFLE1BQU07QUFDekMsaUJBQVcsTUFBTSxJQUFJLGdCQUFnQixHQUFHLEdBQUcsR0FBSTtBQUFBLElBQ25EO0FBckNBLFVBQU1BLE1BQU0sT0FBTyxpQkFBaUIsY0FBYyxhQUFhLEtBQUssT0FBTztBQXVDM0UsaUJBQWEsWUFBWTtBQUFBO0FBQUEsTUFFckIsVUFBVSxPQUFPO0FBQUEsUUFDYixTQUFTLFlBQVksYUFBYTtBQUFBLFFBQ2xDLDJCQUEyQixZQUFZLCtCQUErQjtBQUFBLFFBQ3RFLGNBQWMsWUFBWSxrQkFBa0I7QUFBQSxRQUM1QyxjQUFjLFlBQVksa0JBQWtCO0FBQUEsTUFDaEQ7QUFBQSxNQUNBLFVBQVUsU0FBTyxZQUFZLEdBQUc7QUFBQSxNQUNoQyxVQUFVLENBQUMsS0FBSyxRQUFRLFlBQVksS0FBSyxHQUFHO0FBQUE7QUFBQSxNQUc1QyxNQUFNLENBQUMsRUFBRSxRQUFRLEtBQUssSUFBSSxDQUFDLE1BQU07QUFDN0IsY0FBTSxPQUFPLFlBQVk7QUFDekIsZUFBTyxRQUFRLEtBQUssSUFBSSxRQUFRLElBQUk7QUFBQSxNQUN4QztBQUFBLE1BQ0EsV0FBVyxNQUFNLFFBQVEsUUFBUSxhQUFhLFVBQVUsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFBQTtBQUFBLE1BRzdFLGtCQUFrQixDQUFDLFdBQVcsbUJBQW1CO0FBQzdDLGNBQU0sT0FBTyxLQUFLLFVBQVUsYUFBYSxVQUFVLEtBQUssRUFBRSxPQUFPLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUNqRixpQkFBUyxVQUFVLElBQUksS0FBSyxDQUFDLElBQUksR0FBRyxFQUFFLE1BQU0sbUJBQW1CLENBQUMsQ0FBQztBQUFBLE1BQ3JFO0FBQUEsTUFDQSxpQkFBaUIsQ0FBQyxXQUFXLGtCQUFrQjtBQUMzQyxjQUFNLE1BQU0sTUFBTSxhQUFhLFVBQVUsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFDOUQsaUJBQVMsVUFBVSxJQUFJLEtBQUssQ0FBQyxHQUFHLEdBQUcsRUFBRSxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBQUEsTUFDNUQ7QUFBQTtBQUFBLE1BR0EsYUFBYSxZQUFZO0FBQ3JCLGNBQU0sRUFBRSxlQUFBQyxlQUFjLElBQUksTUFBTTtBQUNoQyxjQUFNLEVBQUUsYUFBQUMsYUFBWSxJQUFJLE1BQU07QUFDOUIsY0FBTSxNQUFNLE1BQU1ELGVBQWMsU0FBU0MsYUFBWSxDQUFDO0FBQ3RELGdCQUFRLFFBQVEsSUFBSSxVQUFVLENBQUMsQ0FBQztBQUNoQyxlQUFPO0FBQUEsTUFDWDtBQUFBO0FBQUEsTUFHQSxnQkFBZ0IsQ0FBQyxRQUFRO0FBQ3JCLGNBQU0sTUFBTSxPQUFPLEdBQUc7QUFDdEIsY0FBTSxPQUFPLGFBQWEsVUFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixjQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLGdCQUFNLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSztBQUN6QixpQkFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsZUFBTyxLQUNGLElBQUksUUFBTSxFQUFFLEdBQUcsR0FBRyxVQUFVLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsTUFFQSxVQUFVLENBQUMsUUFBUTtBQUNmLGNBQU0sTUFBTSxPQUFPLEdBQUc7QUFDdEIsY0FBTSxPQUFPLGFBQWEsVUFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixjQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLGdCQUFNLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSztBQUN6QixpQkFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsZUFBTyxLQUNGLElBQUksUUFBTSxFQUFFLEdBQUcsR0FBRyxVQUFVLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsSUFFSjtBQUFBLEVBQ0o7QUFRQSxXQUFTLEtBQUssZ0JBQWdCO0FBRTlCLE1BQU1DLFVBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsTUFBSSxhQUFhO0FBRWpCLFdBQVMsV0FBVztBQUNoQixRQUFJLFNBQVMsV0FBWSxRQUFPLENBQUMsQ0FBQyxRQUFRLFdBQVdBLE9BQU07QUFDM0QsV0FBT0EsUUFBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdkQ7QUFPQSxXQUFTLHVCQUF1QjtBQUM1QixXQUFPO0FBQUEsRUFFWDtBQUVBLGlCQUFlLFlBQVk7QUFDdkIsUUFBSSxDQUFDLFNBQVMsRUFBRyxRQUFPLFFBQVE7QUFDaEMsUUFBSSxxQkFBcUIsR0FBRztBQUN4QixVQUFJLENBQUMsV0FBWSxjQUFhLE1BQU0sc0JBQXNCLE9BQU87QUFBQSxJQUNyRSxPQUFPO0FBQ0gsY0FBUTtBQUFBLElBQ1o7QUFBQSxFQUNKO0FBRUEsV0FBUyxVQUFVO0FBQUUsUUFBSSxZQUFZO0FBQUUsaUJBQVc7QUFBRyxtQkFBYTtBQUFBLElBQU07QUFBQSxFQUFFO0FBRzFFLFlBQVU7QUFDVixXQUFTLGNBQWMsU0FBUztBQUNoQyxTQUFPLGlCQUFpQixjQUFjLFNBQVM7QUFDL0MsTUFBTSxNQUFNLFNBQVMsY0FBYyx3QkFBd0I7QUFDM0QsTUFBSSxJQUFLLEtBQUksaUJBQWlCLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDOyIsCiAgIm5hbWVzIjogWyJnZXRIdWIiLCAibHQiLCAiVE1VdGlscyIsICJLTyIsICJLTyIsICJUTVV0aWxzIiwgIkRFViIsICJERVYiLCAiS08iLCAicnVuVmFsaWRhdGlvbiIsICJnZXRTZXR0aW5ncyIsICJST1VURVMiXQp9Cg==
