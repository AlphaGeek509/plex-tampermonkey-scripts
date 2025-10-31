// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.1.10
// @description Runs rule-based checks on quote lines for lead time, unit price limits, and part number management. Adds a Hub Bar “Validate Lines” button with settings, a details modal, and CSV export. Highlights issues directly in the grid with optional auto-fixes. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=4.1.10-1761845775606
// @require     http://localhost:5000/lt-plex-auth.user.js?v=4.1.10-1761845775606
// @require     http://localhost:5000/lt-ui-hub.js?v=4.1.10-1761845775606
// @require     http://localhost:5000/lt-core.user.js?v=4.1.10-1761845775606
// @require     http://localhost:5000/lt-data-core.user.js?v=4.1.10-1761845775606
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9sZWFkdGltZVplcm9XZWVrcy5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvbWluVW5pdFByaWNlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9lbmdpbmUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vaW5qZWN0QnV0dG9uLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qc1xuLy8gLS0tLS0tLS0tLSBCb290c3RyYXAgLyByb3V0ZSBndWFyZCAtLS0tLS0tLS0tXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmNvbnN0IENPTkZJRyA9IHtcbiAgICB3aXphcmRUYXJnZXRQYWdlOiAnUGFydCBTdW1tYXJ5JyxcbiAgICBzZXR0aW5nc0tleTogJ3F0NTBfc2V0dGluZ3NfdjEnLFxuICAgIHRvYXN0TXM6IDM1MDBcbn07XG5cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuXG4vLyBJbnN0ZWFkIG9mIGByZXR1cm5gIGF0IHRvcC1sZXZlbCwgY29tcHV0ZSBhIGZsYWc6XG5jb25zdCBPTl9ST1VURSA9ICEhVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbmlmIChERVYgJiYgIU9OX1JPVVRFKSBjb25zb2xlLmRlYnVnKCdRVDUwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcgYm9vdHN0cmFwJyk7XG5cbi8qIGdsb2JhbCBHTV9nZXRWYWx1ZSwgR01fc2V0VmFsdWUsIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQsIFRNVXRpbHMsIHVuc2FmZVdpbmRvdyAqL1xuZXhwb3J0IGNvbnN0IEtFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0NTAuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0NTAuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgbWluVW5pdFByaWNlOiAncXQ1MC5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0NTAubWF4VW5pdFByaWNlJyxcbiAgICBsZWFkdGltZVplcm9XZWVrczogJ3F0NTAubGVhZHRpbWVaZXJvV2Vla3MnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxuICAgIGxlYWR0aW1lWmVyb1dlZWtzOiAncXQ1MC5sZWFkdGltZVplcm9XZWVrcycsXG59O1xuXG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbiAgICBbS0VZUy5sZWFkdGltZVplcm9XZWVrc106IHRydWUsXG59O1xuXG5mdW5jdGlvbiByZWFkT3JMZWdhY3koaykge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrKTtcbiAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSByZXR1cm4gdjtcbiAgICAvLyBvbmUtdGltZSBsZWdhY3kgcmVhZFxuICAgIGNvbnN0IGxlZ2FjeUtleSA9IE9iamVjdC52YWx1ZXMoTEVHQUNZX0tFWVMpLmZpbmQobGsgPT4gbGsuZW5kc1dpdGgoay5zcGxpdCgnLicpLnBvcCgpKSk7XG4gICAgY29uc3QgbHYgPSBsZWdhY3lLZXkgPyBHTV9nZXRWYWx1ZShsZWdhY3lLZXkpIDogdW5kZWZpbmVkO1xuICAgIHJldHVybiAobHYgIT09IHVuZGVmaW5lZCkgPyBsdiA6IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgZ2V0VmFsID0gayA9PiB7XG4gICAgY29uc3QgdiA9IHJlYWRPckxlZ2FjeShrKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSxcbiAgICAgICAgbGVhZHRpbWVaZXJvV2Vla3M6IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gdHJ1ZTtcbiAgICAvL2NvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwYW5lbC5pZCA9ICdsdC1xdHYtcGFuZWwnO1xuICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdsdC1jYXJkIGx0LW1vZGFsJztcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJzUyMHB4JyxcbiAgICAgICAgbWF4V2lkdGg6ICdtaW4oOTJ2dywgNTYwcHgpJ1xuICAgIH0pO1xuXG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBvbWl0dGVkIEx5bi1Ucm9uIFBhcnQgTm8uXG4gICAgPC9sYWJlbD5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1sZWFkdGltZVplcm9XZWVrc1wiPlxuICAgICAgQWxlcnQgd2hlbiBMZWFkdGltZSBpcyAwIHdlZWtzXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjoxMnB4IDAgMTBweDtcIj48L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBmbGV4LXdyYXA6d3JhcDtcIj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtZXhwb3J0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1pbXBvcnQtYnRuXCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS13YXJuXCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT5cbiAgICAgICAgc2V0VmFsKEtFWVMubGVhZHRpbWVaZXJvV2Vla3MsICEhZS50YXJnZXQuY2hlY2tlZClcbiAgICApO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHNhdmVkLicsICdzdWNjZXNzJywgMTYwMCk7XG4gICAgfSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LXJlc2V0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTtcbiAgICAgICAgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWltcG9ydC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBlbnN1cmVTZXR0aW5nc1N0eWxlcygpOyAvLyBORVc6IGZhbGxiYWNrIHN0eWxlcyBpZiB0aGVtZS5jc3MgaXNuXHUyMDE5dCByZWFkeVxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBGb2N1cyBBRlRFUiBhcHBlbmRpbmcgc28gRVNDIHdvcmtzIGltbWVkaWF0ZWx5XG4gICAgb3ZlcmxheS5mb2N1cygpO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVyT3JOdWxsKHMpIHsgY29uc3QgdiA9IE51bWJlcihTdHJpbmcocykudHJpbSgpKTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2KSA/IHYgOiBudWxsOyB9XG5mdW5jdGlvbiB0b051bGxPck51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDsgfVxuZnVuY3Rpb24gc2V0TnVtYmVyT3JCbGFuayhpbnB1dCwgdmFsKSB7IGlucHV0LnZhbHVlID0gKHZhbCA9PSBudWxsID8gJycgOiBTdHJpbmcodmFsKSk7IH1cblxuLyogTkVXOiBtaW5pbWFsIGZhbGxiYWNrIHN0eWxlcyBmb3IgdGhlIHNldHRpbmdzIHBhbmVsICovXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHMuaWQgPSAnbHQtcXR2LXBhbmVsLXN0eWxlcyc7XG4gICAgcy50ZXh0Q29udGVudCA9IGBcbiNsdC1xdHYtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jbHQtcXR2LXBhbmVsLmx0LWNhcmQge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7XG4gIG92ZXJmbG93OiBoaWRkZW47IHBhZGRpbmc6IDE2cHg7XG59XG4jbHQtcXR2LXBhbmVsIGgzIHsgbWFyZ2luOiAwIDAgMTBweCAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLFxuI2x0LXF0di1wYW5lbCBsYWJlbC5sdC1idG4ge1xuICBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7XG4gIGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7XG59XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLWdob3N0ICAgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXdhcm4gICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJuKTsgY29sb3I6IzExMTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0td2FybikgNTAlLCBibGFjayk7IH1cbiNsdC1xdHYtcGFuZWwgLmx0LWJ0bi0tZXJyb3IgICB7IGJhY2tncm91bmQ6IHZhcigtLWVycik7ICBjb2xvcjojZmZmOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1lcnIpIDcwJSwgYmxhY2spOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLW9rICAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1vayk7ICAgY29sb3I6I2ZmZjsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tb2spIDcwJSwgYmxhY2spOyB9XG5cbiNsdC1xdHYtcGFuZWwgaW5wdXRbdHlwZT1cIm51bWJlclwiXSwgI2x0LXF0di1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXSB7XG4gIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiA2cHggOHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOiA2cHg7IGJhY2tncm91bmQ6ICNmZmY7XG59XG4gIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzKTtcbn1cblxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxuLy8gV2hlbiBQYXJ0U3RhdHVzID09PSBcIlF1b3RlXCIsIFBPU1QgdG8gRFMgMTM1MDkgdXNpbmcgdGhlIFFUMzUgcGF0dGVybjpcbi8vICAgUXVvdGVfS2V5ID0gdm1RdW90ZUtleVxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcbi8vICAgUGFydF9ObyAgID0gUXVvdGVfTm8gfHwgXCJfXCIgfHwgdm1QYXJ0Tm8gICAoUXVvdGVfTm8gcmVzb2x2ZWQgdmlhIGx0LmNvcmUgUVRGOyBzZXNzaW9uIGZhbGxiYWNrKVxuLy8gICBOb3RlICAgICAgPSBcImF1dG8gbWFuYWdlZFwiXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGlmICghc2V0dGluZ3M/LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpIHJldHVybiBpc3N1ZXM7XG5cbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBsdCA9IChST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIFFURiAoZmxhdCByZXBvKSBsaWtlIFFUMzVcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXG4gICAgICAgIDogbnVsbDtcblxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xuICAgIGNvbnN0IERTX01BTkFHRV9QQVJUTk8gPSAxMzUwOTsgIC8vIHlvdXIgdGFyZ2V0IERTIHRvIHBvc3QgUGFydF9Ob1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgUk9PVC5nZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgPyBhd2FpdCBST09ULmdldFBsZXhGYWNhZGUoKVxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXgpIHRocm93IG5ldyBFcnJvcignUGxleCBmYWNhZGUgbm90IGF2YWlsYWJsZScpO1xuICAgICAgICByZXR1cm4gcGxleDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0byBzZXNzaW9uIHN0b3JhZ2UgaWYgUVRGL3BsZXggaHlkcmF0aW9uIG5vdCByZWFkeVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIChzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdRdW90ZV9ObycpIHx8ICcnKS50cmltKCk7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIFF1b3RlX05vIGZvciBhIGdpdmVuIFF1b3RlS2V5IHVzaW5nIFFURjsgaHlkcmF0ZSBvbmNlIGZyb20gRFMgaWYgbmVlZGVkLlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFF1b3RlTm9Gb3JRdW90ZUtleShxaykge1xuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcbiAgICAgICAgaWYgKCFxS2V5IHx8ICFOdW1iZXIuaXNGaW5pdGUocUtleSkgfHwgcUtleSA8PSAwKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XG5cbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgaWYgKCFoZWFkPy5RdW90ZV9Obykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFLZXkpIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoID8gcm93c1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1b3RlTm8gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBxS2V5LCBRdW90ZV9ObzogcXVvdGVObywgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcW4gPSBoZWFkPy5RdW90ZV9ObztcbiAgICAgICAgICAgIHJldHVybiAocW4gPT0gbnVsbCA/IGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIDogU3RyaW5nKHFuKS50cmltKCkpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgUXVvdGVQYXJ0IGdyb3VwcywgcmVzb2x2ZSBRdW90ZV9ObyBvbmNlIHBlciBncm91cCwgdGhlbiBwb3N0IHBlci1yb3cgd2hlbiBzdGF0dXMgPT09ICdRdW90ZSdcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGFueSA9IEFycmF5LmlzQXJyYXkoZ3JvdXApICYmIGdyb3VwLmxlbmd0aCA/IGdyb3VwWzBdIDogbnVsbDtcbiAgICAgICAgY29uc3QgZ3JvdXBRdW90ZUtleSA9IHV0aWxzLmdldChhbnksICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgIGNvbnN0IHJlc29sdmVkUXVvdGVObyA9IGF3YWl0IGdldFF1b3RlTm9Gb3JRdW90ZUtleShncm91cFF1b3RlS2V5KTtcblxuICAgICAgICAvLyBQcm9jZXNzIGVhY2ggdW5pcXVlIFBhcnRLZXkgZXhhY3RseSBvbmNlXG4gICAgICAgIGNvbnN0IHVuaXFCeVBhcnRLZXkgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBwayA9IHV0aWxzLmdldChyb3csICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHBrKSAmJiAhdW5pcUJ5UGFydEtleS5oYXMocGspKSB7XG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdW5pcUJ5UGFydEtleS52YWx1ZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB2bVF1b3RlS2V5ID0gZ3JvdXBRdW90ZUtleSA/PyB1dGlscy5nZXQociwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcblxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxuICAgICAgICAgICAgLy8gICBJZiBub3QsIGRlc2lyZWQgcHJlZml4IGlzIFwiX1wiIChwZXIgb3JpZ2luYWwgc3BlYykuXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlNYW5hZ2VkID0gdm1QYXJ0Tm8uc3RhcnRzV2l0aChkZXNpcmVkUHJlZml4KTtcblxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxuICAgICAgICAgICAgaWYgKGFscmVhZHlNYW5hZ2VkKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCB0aGUgZGVzaXJlZCBQYXJ0X05vIGp1c3Qgb25jZSAoYXZvaWQgZG91YmxlLXByZWZpeGluZyBvbiBzdWJzZXF1ZW50IHJ1bnMpXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxuICAgICAgICAgICAgICAgIFBhcnRfTm86IFN0cmluZyhwYXJ0Tm9Gb3JQb3N0ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBRVDM1LXN0eWxlIERTIGNhbGwgd2l0aCBhdXRoIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiB0cnVlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcbmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUubWV0YSA9IHsgaWQ6ICdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJywgbGFiZWw6ICdBdXRvLU1hbmFnZSBMVCBQYXJ0IE5vJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbGVhZHRpbWVaZXJvV2Vla3Ncbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gTGVhZHRpbWUgPT0gMCB3ZWVrcy5cbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubGVhZHRpbWVaZXJvV2Vla3MgKGJvb2xlYW4pLlxuLy8gRmllbGQ6IExlYWR0aW1lICh3ZWVrcykgZXhwZWN0ZWQgaW4gVk0gcm93LlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBsZWFkdGltZVplcm9XZWVrcyhjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGlmICghc2V0dGluZ3M/LmxlYWR0aW1lWmVyb1dlZWtzKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IHV0aWxzLmdldChyLCAnTGVhZFRpbWUnKTsgLy8gYWRqdXN0IGZpZWxkIG5hbWUgaWYgZGlmZmVyZW50XG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAndGltZS5sZWFkdGltZVplcm9XZWVrcycsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTGVhZHRpbWUgaXMgMCB3ZWVrcyAobXVzdCBiZSA+IDApLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgbGVhZHRpbWVSYXc6IHJhdywgbGVhZHRpbWVOdW06IG51bSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaXNzdWVzO1xufVxuXG5sZWFkdGltZVplcm9XZWVrcy5tZXRhID0geyBpZDogJ2xlYWR0aW1lWmVyb1dlZWtzJywgbGFiZWw6ICdMZWFkdGltZSBaZXJvIFdlZWtzJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbWluVW5pdFByaWNlXG4vLyBQdXJwb3NlOiBFcnJvciB3aGVuIHRoZSBlZmZlY3RpdmUgdW5pdCBwcmljZSBpcyBiZWxvdyB0aGUgY29uZmlndXJlZCBtaW5pbXVtLlxuLy8gUmVhZHMgZnJvbSBzZXR0aW5ncy5taW5Vbml0UHJpY2UgKG51bGxhYmxlKS5cbi8vIFByZWNlZGVuY2UgZm9yIHVuaXQgcHJpY2UgZmllbGRzOlxuLy8gICBSdkN1c3RvbWl6ZWRVbml0UHJpY2UgPiBSdlVuaXRQcmljZUNvcHkgPiBVbml0UHJpY2Vcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWluVW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgY29uc3QgbWluID0gTnVtYmVyKHNldHRpbmdzLm1pblVuaXRQcmljZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWluKSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xuICAgICAgICAgICAgY29uc3QgcmF3ID1cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XG5cbiAgICAgICAgICAgIC8vIERlY2lkZSBjdXJyZW5jeTogaW5mZXIgZnJvbSByYXcgb3IgdXNlIHNldHRpbmdzLmN1cnJlbmN5Q29kZSAoZGVmYXVsdCBVU0QpXG4gICAgICAgICAgICBjb25zdCBpbmZlckN1cnJlbmN5ID0gKHJhd1ZhbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHJhd1ZhbCA9PT0gJ2Z1bmN0aW9uJyA/IHJhd1ZhbCgpIDogcmF3VmFsIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoL1xcJC8udGVzdChzKSkgcmV0dXJuICdVU0QnO1xuICAgICAgICAgICAgICAgIGlmICgvXHUyMEFDLy50ZXN0KHMpKSByZXR1cm4gJ0VVUic7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTAwQTMvLnRlc3QocykpIHJldHVybiAnR0JQJztcbiAgICAgICAgICAgICAgICByZXR1cm4gc2V0dGluZ3M/LmN1cnJlbmN5Q29kZSB8fCAnVVNEJztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbmN5ID0gaW5mZXJDdXJyZW5jeShyYXcpO1xuICAgICAgICAgICAgY29uc3QgbW9uZXlGbXQgPSBuZXcgSW50bC5OdW1iZXJGb3JtYXQoJ2VuLVVTJywgeyBzdHlsZTogJ2N1cnJlbmN5JywgY3VycmVuY3ksIG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcbiAgICAgICAgICAgIGNvbnN0IG51bUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdE1vbmV5ID0gKG4pID0+IE51bWJlci5pc0Zpbml0ZShuKSA/IG1vbmV5Rm10LmZvcm1hdChuKSA6IFN0cmluZyhuKTtcblxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1pblVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9IDwgTWluICR7Zm10TW9uZXkobWluKX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtaW4sIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcblxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgLy8gRGVjaWRlIGN1cnJlbmN5OiBpbmZlciBmcm9tIHJhdyBvciB1c2Ugc2V0dGluZ3MuY3VycmVuY3lDb2RlIChkZWZhdWx0IFVTRClcbiAgICAgICAgICAgIGNvbnN0IGluZmVyQ3VycmVuY3kgPSAocmF3VmFsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgcmF3VmFsID09PSAnZnVuY3Rpb24nID8gcmF3VmFsKCkgOiAocmF3VmFsID8/ICcnKSkudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICgvXFwkLy50ZXN0KHMpKSByZXR1cm4gJ1VTRCc7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTIwQUMvLnRlc3QocykpIHJldHVybiAnRVVSJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MDBBMy8udGVzdChzKSkgcmV0dXJuICdHQlAnO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZXR0aW5ncz8uY3VycmVuY3lDb2RlIHx8ICdVU0QnO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY3VycmVuY3kgPSBpbmZlckN1cnJlbmN5KHJhdyk7XG4gICAgICAgICAgICBjb25zdCBtb25leUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IHN0eWxlOiAnY3VycmVuY3knLCBjdXJyZW5jeSwgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID4gbWF4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm10TW9uZXkgPSAobikgPT4gTnVtYmVyLmlzRmluaXRlKG4pID8gbW9uZXlGbXQuZm9ybWF0KG4pIDogU3RyaW5nKG4pO1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1heFVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9ID4gTWF4ICR7Zm10TW9uZXkobWF4KX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtYXgsIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XG5pbXBvcnQgbGVhZHRpbWVaZXJvV2Vla3MgZnJvbSAnLi9sZWFkdGltZVplcm9XZWVrcyc7XG5pbXBvcnQgbWluVW5pdFByaWNlIGZyb20gJy4vbWluVW5pdFByaWNlJztcbmltcG9ydCBtYXhVbml0UHJpY2UgZnJvbSAnLi9tYXhVbml0UHJpY2UnO1xuXG5leHBvcnQgZGVmYXVsdCBbYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSwgbGVhZHRpbWVaZXJvV2Vla3MsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgXG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vZW5naW5lLmpzXG5pbXBvcnQgcnVsZXMgZnJvbSAnLi9ydWxlcyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKSB7XG4gICAgYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHsgcmVxdWlyZUtvOiB0cnVlLCB0aW1lb3V0TXM6IDEyMDAwIH0pO1xuXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgY29uc3QgZ3ZtID0gKGdyaWQgJiYgS08gJiYgdHlwZW9mIEtPLmRhdGFGb3IgPT09ICdmdW5jdGlvbicpID8gS08uZGF0YUZvcihncmlkKSA6IG51bGw7XG4gICAgaWYgKCFndm0pIHJldHVybiB7IG9rOiB0cnVlLCBpc3N1ZXM6IFtdIH07IC8vIG5vdGhpbmcgdG8gdmFsaWRhdGUgeWV0XG5cbiAgICBjb25zdCByb3dzID0gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCBxcCA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ1F1b3RlUGFydEtleScpID8/IC0xO1xuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xuICAgIH1cblxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBjb25zdCBwID0gZ3JvdXAuZmluZChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ0lzVW5pcXVlUXVvdGVQYXJ0JykgPT09IDEpIHx8IGdyb3VwWzBdO1xuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcbiAgICB9XG5cbiAgICBjb25zdCBjdHggPSB7XG4gICAgICAgIHJvd3MsXG4gICAgICAgIGdyb3Vwc0J5UXVvdGVQYXJ0LFxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXG4gICAgICAgIGxhc3RGb3JtOiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZUZvcm0/LigpLFxuICAgICAgICBsYXN0UmVzdWx0OiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZT8uKClcbiAgICB9O1xuXG4gICAgY29uc3QgdXRpbHMgPSB7IGdldDogKG9iaiwgcGF0aCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShvYmosIHBhdGgsIG9wdHMpIH07XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocnVsZXMubWFwKHJ1bGUgPT4gcnVsZShjdHgsIHNldHRpbmdzLCB1dGlscykpKTtcbiAgICBjb25zdCBpc3N1ZXNSYXcgPSByZXN1bHRzLmZsYXQoKTtcbiAgICBjb25zdCBvayA9IGlzc3Vlc1Jhdy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xuXG4gICAgLy8gRW5yaWNoIGlzc3VlcyB3aXRoIFVJLWZhY2luZyBkYXRhIChsaW5lTnVtYmVyLCBwYXJ0Tm8sIHJ1bGVMYWJlbClcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiBOdW1iZXIoU3RyaW5nKHYgPz8gJycpLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgY29uc3QgcnVsZUxhYmVsRnJvbSA9IChpc3MpID0+IHtcbiAgICAgICAgLy8gUHJlZmVycmVkOiBydWxlIGZ1bmN0aW9uIHNldHMgLm1ldGEubGFiZWwgKGUuZy4sIG1heFVuaXRQcmljZS5tZXRhLmxhYmVsKVxuICAgICAgICBpZiAoaXNzPy5tZXRhPy5sYWJlbCkgcmV0dXJuIGlzcy5tZXRhLmxhYmVsO1xuICAgICAgICBpZiAoaXNzPy5raW5kKSB7XG4gICAgICAgICAgICBjb25zdCBrID0gU3RyaW5nKGlzcy5raW5kKTtcbiAgICAgICAgICAgIC8vIHByZXR0aWZ5IFwicHJpY2UubWF4VW5pdFByaWNlXCIgPT4gXCJNYXggVW5pdCBQcmljZVwiXG4gICAgICAgICAgICBjb25zdCB0YWlsID0gay5zcGxpdCgnLicpLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRhaWxcbiAgICAgICAgICAgICAgICA/IHRhaWwucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL14uLywgKGMpID0+IGMudG9VcHBlckNhc2UoKSlcbiAgICAgICAgICAgICAgICA6IGs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICdWYWxpZGF0aW9uJztcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgYSBxdWljayBtYXAgb2Ygcm93IC0+IGluZm9cbiAgICBjb25zdCByb3dJbmZvID0gbmV3IE1hcCgpOyAvLyB2bSAtPiB7IGxpbmVOdW1iZXIsIHBhcnRObyB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdHgucm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCByID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3QgcGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJyc7XG4gICAgICAgIHJvd0luZm8uc2V0KHIsIHsgbGluZU51bWJlciwgcGFydE5vIH0pO1xuICAgIH1cblxuICAgIC8vIEFsc28gbWFwIFFQSyAtPiBcInByaW1hcnlcIiByb3cgZm9yIGNoZWFwIGxvb2t1cFxuICAgIGNvbnN0IHFwa1RvUHJpbWFyeUluZm8gPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBbcXAsIHByaW1hcnldIG9mIGN0eC5wcmltYXJ5QnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGluZm8gPSByb3dJbmZvLmdldChwcmltYXJ5KSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogdXRpbHMuZ2V0KHByaW1hcnksICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycgfTtcbiAgICAgICAgcXBrVG9QcmltYXJ5SW5mby5zZXQocXAsIGluZm8pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIGEgU29ydE9yZGVyIGxvb2t1cCBieSB2aXN1YWwgcm93IGluZGV4IChmcm9tIHRoZSBWTSwgbm90IHRoZSBET00pXG4gICAgY29uc3Qgc29ydEJ5TGluZSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGN0eC5yb3dzW2ldO1xuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG4gICAgICAgIGNvbnN0IHNvcnRPcmRlciA9IHV0aWxzLmdldChyb3csICdTb3J0T3JkZXInLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgc29ydEJ5TGluZS5zZXQobGluZU51bWJlciwgc29ydE9yZGVyKTtcbiAgICB9XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBpc3N1ZXNSYXcubWFwKGlzcyA9PiB7XG4gICAgICAgIGNvbnN0IHFwayA9IGlzcy5xdW90ZVBhcnRLZXkgPz8gLTE7XG4gICAgICAgIGNvbnN0IGluZm8gPSBxcGtUb1ByaW1hcnlJbmZvLmdldChxcGspIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiAnJyB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uaXNzLFxuICAgICAgICAgICAgbGluZU51bWJlcjogaW5mby5saW5lTnVtYmVyLFxuICAgICAgICAgICAgcGFydE5vOiBpbmZvLnBhcnRObyxcbiAgICAgICAgICAgIHJ1bGVMYWJlbDogcnVsZUxhYmVsRnJvbShpc3MpLFxuICAgICAgICAgICAgc29ydE9yZGVyOiBzb3J0QnlMaW5lLmdldChpbmZvLmxpbmVOdW1iZXIgPz8gLTEpXG4gICAgICAgIH07XG4gICAgfSk7XG5cblxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxuICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSB7IGF0OiBEYXRlLm5vdygpLCBvaywgaXNzdWVzIH07XG5cbiAgICByZXR1cm4geyBvaywgaXNzdWVzIH07XG59XG5cbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmlmIChfX0JVSUxEX0RFVl9fKSB7XG4gICAgLy8gTWluaW1hbCBLTy9ncmlkIHJlc29sdmVycyBrZXB0IGxvY2FsIHRvIGRlYnVnIGhlbHBlcnNcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFZNKCkge1xuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICByZXR1cm4gZ3JpZCA/IChLTz8uZGF0YUZvcj8uKGdyaWQpIHx8IG51bGwpIDogbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFJvd3MoKSB7XG4gICAgICAgIGNvbnN0IGd2bSA9IGdldEdyaWRWTSgpO1xuICAgICAgICByZXR1cm4gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcGxhaW5Sb3cocikge1xuICAgICAgICBjb25zdCBndiA9IChwLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsIHAsIG9wdHMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgUXVvdGVQYXJ0S2V5OiBndignUXVvdGVQYXJ0S2V5JyksXG4gICAgICAgICAgICBQYXJ0Tm86IGd2KCdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSksXG4gICAgICAgICAgICBQYXJ0U3RhdHVzOiBndignUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFF1YW50aXR5OiBndignUXVhbnRpdHknKSxcbiAgICAgICAgICAgIFVuaXRQcmljZTogZ3YoJ1VuaXRQcmljZScpLFxuICAgICAgICAgICAgUnZVbml0UHJpY2VDb3B5OiBndignUnZVbml0UHJpY2VDb3B5JyksXG4gICAgICAgICAgICBSdkN1c3RvbWl6ZWRVbml0UHJpY2U6IGd2KCdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSxcbiAgICAgICAgICAgIElzVW5pcXVlUXVvdGVQYXJ0OiBndignSXNVbmlxdWVRdW90ZVBhcnQnKVxuICAgICAgICB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0NTVihvYmpzKSB7XG4gICAgICAgIGlmICghb2Jqcz8ubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgICAgIGNvbnN0IGNvbHMgPSBPYmplY3Qua2V5cyhvYmpzWzBdKTtcbiAgICAgICAgY29uc3QgZXNjID0gKHYpID0+ICh2ID09IG51bGwgPyAnJyA6IFN0cmluZyh2KS5pbmNsdWRlcygnLCcpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXCInKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1xcbicpXG4gICAgICAgICAgICA/IGBcIiR7U3RyaW5nKHYpLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgXG4gICAgICAgICAgICA6IFN0cmluZyh2KSk7XG4gICAgICAgIGNvbnN0IGhlYWQgPSBjb2xzLmpvaW4oJywnKTtcbiAgICAgICAgY29uc3QgYm9keSA9IG9ianMubWFwKG8gPT4gY29scy5tYXAoYyA9PiBlc2Mob1tjXSkpLmpvaW4oJywnKSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBoZWFkICsgJ1xcbicgKyBib2R5O1xuICAgIH1cbiAgICBmdW5jdGlvbiBkb3dubG9hZChuYW1lLCBibG9iKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9IG5hbWU7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDIwMDApO1xuICAgIH1cblxuICAgIHVuc2FmZVdpbmRvdy5RVFZfREVCVUcgPSB7XG4gICAgICAgIC8vIFNldHRpbmdzIGhlbHBlcnNcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XG4gICAgICAgICAgICBlbmFibGVkOiBHTV9nZXRWYWx1ZSgncXR2LmVuYWJsZWQnKSxcbiAgICAgICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IEdNX2dldFZhbHVlKCdxdHYuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLFxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxuICAgICAgICAgICAgbWF4VW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1heFVuaXRQcmljZScpXG4gICAgICAgIH0pLFxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXG4gICAgICAgIHNldFZhbHVlOiAoa2V5LCB2YWwpID0+IEdNX3NldFZhbHVlKGtleSwgdmFsKSxcblxuICAgICAgICAvLyBHcmlkIGV4cG9ydGVyc1xuICAgICAgICBncmlkOiAoeyBwbGFpbiA9IHRydWUgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gZ2V0R3JpZFJvd3MoKTtcbiAgICAgICAgICAgIHJldHVybiBwbGFpbiA/IHJvd3MubWFwKHBsYWluUm93KSA6IHJvd3M7XG4gICAgICAgIH0sXG4gICAgICAgIGdyaWRUYWJsZTogKCkgPT4gY29uc29sZS50YWJsZT8uKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKSxcblxuICAgICAgICAvLyBDU1YvSlNPTiBkb3dubG9hZGVyc1xuICAgICAgICBkb3dubG9hZEdyaWRKU09OOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5qc29uJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pLCBudWxsLCAyKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbZGF0YV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgZG93bmxvYWRHcmlkQ1NWOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5jc3YnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjc3YgPSB0b0NTVih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSk7XG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gVmFsaWRhdGlvbiBvbi1kZW1hbmQgKHNhbWUgZW5naW5lIGFzIHRoZSBidXR0b24pXG4gICAgICAgIHZhbGlkYXRlTm93OiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHJ1blZhbGlkYXRpb24gfSA9IGF3YWl0IGltcG9ydCgnLi9lbmdpbmUuanMnKTsgLy8gc2FtZSBtb2R1bGUgdXNlZCBieSB0aGUgaHViIGJ1dHRvblxuICAgICAgICAgICAgY29uc3QgeyBnZXRTZXR0aW5ncyB9ID0gYXdhaXQgaW1wb3J0KCcuL2luZGV4LmpzJyk7XG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIGdldFNldHRpbmdzKCkpO1xuICAgICAgICAgICAgY29uc29sZS50YWJsZT8uKHJlcy5pc3N1ZXMgfHwgW10pO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBRdWljayBleHBlY3RhdGlvbiBoZWxwZXI6IFx1MjAxQ3Nob3cgbWUgcm93cyBhYm92ZSBtYXhcdTIwMURcbiAgICAgICAgZXhwZWN0VW5kZXJNYXg6IChtYXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldCA9IE51bWJlcihtYXgpO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIHJvd3NcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gTnVtYmVyLmlzRmluaXRlKHIuX1VuaXROdW0pICYmIHIuX1VuaXROdW0gPiBzZXQpXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcbiAgICAgICAgfSxcblxuICAgICAgICB1bmRlck1pbjogKG1pbikgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1pbik7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA8IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgfTtcbn1cblxuXG4vLyBFbnN1cmUgdGhlIHNldHRpbmdzIFVJIGxvYWRzIChnZWFyIGJ1dHRvbiwgc3RvcmFnZSBBUEkpXG5pbXBvcnQgJy4vaW5kZXguanMnO1xuLy8gTW91bnRzIHRoZSBWYWxpZGF0ZSBMaW5lcyBidXR0b24gJiB3aXJlcyBjbGljayB0byB0aGUgZW5naW5lXG5pbXBvcnQgeyBtb3VudFZhbGlkYXRpb25CdXR0b24gfSBmcm9tICcuL2luamVjdEJ1dHRvbi5qcyc7XG5cblRNVXRpbHM/Lm5ldD8uZW5zdXJlV2F0Y2hlcj8uKCk7IC8vIG9wdGlvbmFsLCBoYXJtbGVzcyBpZiBtaXNzaW5nXG5cbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG5sZXQgdW5tb3VudEJ0biA9IG51bGw7XG5cbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xuICAgIGlmIChUTVV0aWxzPy5tYXRjaFJvdXRlKSByZXR1cm4gISFUTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKTtcbiAgICByZXR1cm4gUk9VVEVTLnNvbWUocmUgPT4gcmUudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICByZXR1cm4gKGxpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn1cblxuZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7XG4gICAgcmV0dXJuIHRydWU7IC8vIGFsd2F5cyBzaG93IG9uIGFsbCBwYWdlc1xuICAgIC8vcmV0dXJuIC9ecGFydFxccypzdW1tYXJ5JC9pLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XG4gICAgaWYgKGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcbiAgICAgICAgaWYgKCF1bm1vdW50QnRuKSB1bm1vdW50QnRuID0gYXdhaXQgbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHVubW91bnQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVubW91bnQoKSB7IGlmICh1bm1vdW50QnRuKSB7IHVubW91bnRCdG4oKTsgdW5tb3VudEJ0biA9IG51bGw7IH0gfVxuXG4vLyBpbml0aWFsICsgU1BBIHdpcmluZyAobWlycm9ycyBxdDMwL3F0MzUpXG5yZWNvbmNpbGUoKTtcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlKTtcbmNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuXG4iLCAiLy8gQWRkcyBhIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBhbmQgd2lyZXMgaXQgdG8gdGhlIGVuZ2luZS5cbi8vIEFzc3VtZXMgeW91ciBzZXR0aW5ncyBVSSBleHBvcnRzIGdldFNldHRpbmdzL29uU2V0dGluZ3NDaGFuZ2UuXG5cbmltcG9ydCB7IHJ1blZhbGlkYXRpb24gfSBmcm9tICcuL2VuZ2luZSc7XG5pbXBvcnQgeyBnZXRTZXR0aW5ncywgb25TZXR0aW5nc0NoYW5nZSB9IGZyb20gJy4vaW5kZXgnO1xuXG4vLyAtLS0gS08gc3VyZmFjZSAocXQzMCBwYXR0ZXJuKSAtLS1cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5cbi8vIC0tLSBzdW1tYXJpemUgaXNzdWVzIGZvciBzdGF0dXMgcGlsbCAvIHRvYXN0cyAtLS1cbmZ1bmN0aW9uIGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IEFycmF5LmlzQXJyYXkoaXNzdWVzKSA/IGlzc3VlcyA6IFtdO1xuICAgICAgICBjb25zdCBhZ2cgPSBpdGVtcy5yZWR1Y2UoKGFjYywgaXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGx2bCA9IFN0cmluZyhpdD8ubGV2ZWwgfHwgJ2luZm8nKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgYWNjW2x2bF0gPSAoYWNjW2x2bF0gfHwgMCkgKyAxO1xuICAgICAgICAgICAgaWYgKGl0Py5xdW90ZVBhcnRLZXkgIT0gbnVsbCkgYWNjLnBhcnRzLmFkZChpdC5xdW90ZVBhcnRLZXkpO1xuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgeyBlcnJvcjogMCwgd2FybmluZzogMCwgaW5mbzogMCwgcGFydHM6IG5ldyBTZXQoKSB9KTtcblxuICAgICAgICBjb25zdCBwYXJ0c0NvdW50ID0gYWdnLnBhcnRzLnNpemU7XG4gICAgICAgIGNvbnN0IHNlZ3MgPSBbXTtcbiAgICAgICAgaWYgKGFnZy5lcnJvcikgc2Vncy5wdXNoKGAke2FnZy5lcnJvcn0gZXJyb3Ike2FnZy5lcnJvciA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLndhcm5pbmcpIHNlZ3MucHVzaChgJHthZ2cud2FybmluZ30gd2FybmluZyR7YWdnLndhcm5pbmcgPT09IDEgPyAnJyA6ICdzJ31gKTtcbiAgICAgICAgaWYgKGFnZy5pbmZvKSBzZWdzLnB1c2goYCR7YWdnLmluZm99IGluZm9gKTtcbiAgICAgICAgY29uc3QgbGV2ZWxQYXJ0ID0gc2Vncy5qb2luKCcsICcpIHx8ICd1cGRhdGVzJztcblxuICAgICAgICByZXR1cm4gYCR7bGV2ZWxQYXJ0fSBhY3Jvc3MgJHtwYXJ0c0NvdW50IHx8IDB9IHBhcnQke3BhcnRzQ291bnQgPT09IDEgPyAnJyA6ICdzJ31gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxufVxuXG4vLyAtLS0gUVQzMC1zdHlsZSBncmlkIHJlZnJlc2ggKGNvcGllZCkgLS0tXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoUXVvdGVHcmlkKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZEVsICYmIEtPPy5kYXRhRm9yPy4oZ3JpZEVsKTtcblxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgcmV0dXJuICdkcy5yZWFkJztcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgZ3JpZFZNLnJlZnJlc2goKTsgICAgICAgICAgICAgICAgICAvLyBzeW5jIHZpc3VhbCByZWZyZXNoXG4gICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXG4gICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgYWN0aXZlIHBhZ2UgKHJlYmluZClcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3c/LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgaWYgKHdpej8ubmF2aWdhdGVQYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiAnd2l6Lm5hdmlnYXRlUGFnZSc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuXG5cbmNvbnN0IEhVQl9CVE5fSUQgPSAncXQ1MC12YWxpZGF0ZSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdHJ5IHsgY29uc3QgaHViID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaHViKSByZXR1cm4gaHViOyB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzID0gW10pIHtcbiAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG5cbiAgICAvLyBlbGVtZW50c1xuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBvdmVybGF5LmlkID0gJ3F0di1tb2RhbC1vdmVybGF5JztcbiAgICBPYmplY3QuYXNzaWduKG92ZXJsYXkuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsXG4gICAgICAgIGluc2V0OiAwLFxuICAgICAgICBiYWNrZ3JvdW5kOiAndmFyKC0tbHQtb3ZlcmxheSwgcmdiYSgwLDAsMCwuMzYpKScsXG4gICAgICAgIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ3F0di1tb2RhbCc7XG4gICAgbW9kYWwuY2xhc3NOYW1lID0gJ2x0LWNhcmQnO1xuICAgIE9iamVjdC5hc3NpZ24obW9kYWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4gICAgICAgIHRvcDogJzUwJScsXG4gICAgICAgIGxlZnQ6ICc1MCUnLFxuICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIHdpZHRoOiAnbWluKDkwMHB4LCA5MnZ3KSdcbiAgICB9KTtcblxuICAgIC8vIGJ1aWxkIHJvd3MgKFBsZXgtbGlrZTogc29ydCArIHN1cHByZXNzIHJlcGVhdGluZyBTb3J0L1BhcnQvUnVsZSBkaXNwbGF5KVxuICAgIGNvbnN0IHNvcnRlZCA9IFsuLi5pc3N1ZXNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3Qgc29BID0gKGEuc29ydE9yZGVyID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSk7XG4gICAgICAgIGNvbnN0IHNvQiA9IChiLnNvcnRPcmRlciA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpO1xuICAgICAgICBpZiAoc29BICE9PSBzb0IpIHJldHVybiBzb0EgLSBzb0I7XG4gICAgICAgIGNvbnN0IHBuQSA9IFN0cmluZyhhLnBhcnRObyA/PyAnJyk7XG4gICAgICAgIGNvbnN0IHBuQiA9IFN0cmluZyhiLnBhcnRObyA/PyAnJyk7XG4gICAgICAgIGlmIChwbkEgIT09IHBuQikgcmV0dXJuIHBuQS5sb2NhbGVDb21wYXJlKHBuQik7XG4gICAgICAgIGNvbnN0IHJsQSA9IFN0cmluZyhhLnJ1bGVMYWJlbCA/PyBhLmtpbmQgPz8gJycpO1xuICAgICAgICBjb25zdCBybEIgPSBTdHJpbmcoYi5ydWxlTGFiZWwgPz8gYi5raW5kID8/ICcnKTtcbiAgICAgICAgcmV0dXJuIHJsQS5sb2NhbGVDb21wYXJlKHJsQik7XG4gICAgfSk7XG5cbiAgICBsZXQgcHJldlNvcnQgPSBudWxsLCBwcmV2UGFydCA9IG51bGwsIHByZXZSdWxlID0gbnVsbDtcbiAgICBjb25zdCByb3dzSHRtbCA9IHNvcnRlZC5tYXAoaXNzID0+IHtcbiAgICAgICAgY29uc3QgbHZsID0gKGlzcy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgbHZsQ2xhc3MgPSAobHZsID09PSAnZXJyb3InKSA/ICdxdHYtcGlsbC0tZXJyb3InIDogKGx2bCA9PT0gJ3dhcm4nIHx8IGx2bCA9PT0gJ3dhcm5pbmcnKSA/ICdxdHYtcGlsbC0td2FybicgOiAncXR2LXBpbGwtLWluZm8nO1xuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGwgJHtsdmxDbGFzc31cIj4ke2x2bCB8fCAnaW5mbyd9PC9zcGFuPmA7XG4gICAgICAgIGNvbnN0IHJlYXNvbiA9IGlzcy5tZXNzYWdlIHx8ICcobm8gbWVzc2FnZSknO1xuICAgICAgICBjb25zdCBydWxlID0gU3RyaW5nKGlzcy5ydWxlTGFiZWwgfHwgaXNzLmtpbmQgfHwgJ1ZhbGlkYXRpb24nKTtcblxuICAgICAgICAvLyBTdXBwcmVzcyByZXBlYXRzIGluIHZpc3VhbCB0YWJsZSBjZWxsc1xuICAgICAgICBjb25zdCBzaG93U29ydCA9IChpc3Muc29ydE9yZGVyICE9PSBwcmV2U29ydCkgPyAoaXNzLnNvcnRPcmRlciA/PyAnJykgOiAnJztcbiAgICAgICAgY29uc3Qgc2hvd1BhcnQgPSAoc2hvd1NvcnQgIT09ICcnIHx8IChpc3MucGFydE5vICE9PSBwcmV2UGFydCkpID8gKGlzcy5wYXJ0Tm8gPz8gJycpIDogJyc7XG4gICAgICAgIGNvbnN0IHNhbWVHcm91cEFzUHJldiA9IChzaG93U29ydCA9PT0gJycgJiYgc2hvd1BhcnQgPT09ICcnKTtcbiAgICAgICAgY29uc3Qgc2hvd1J1bGUgPSAoIXNhbWVHcm91cEFzUHJldiB8fCBydWxlICE9PSBwcmV2UnVsZSkgPyBydWxlIDogJyc7XG5cbiAgICAgICAgcHJldlNvcnQgPSBpc3Muc29ydE9yZGVyO1xuICAgICAgICBwcmV2UGFydCA9IGlzcy5wYXJ0Tm87XG4gICAgICAgIHByZXZSdWxlID0gcnVsZTtcblxuICAgICAgICByZXR1cm4gYFxuICA8dHIgZGF0YS1xcGs9XCIke2lzcy5xdW90ZVBhcnRLZXkgPz8gJyd9XCIgZGF0YS1ydWxlPVwiJHtTdHJpbmcoaXNzLmtpbmQgfHwgJycpfVwiPlxuICAgIDx0ZD4ke3Nob3dTb3J0fTwvdGQ+XG4gICAgPHRkPiR7c2hvd1BhcnR9PC90ZD5cbiAgICA8dGQ+JHtzaG93UnVsZX08L3RkPlxuICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cbiAgICA8dGQ+JHtyZWFzb259PC90ZD5cbiAgPC90cj5gO1xuICAgIH0pLmpvaW4oJycpO1xuXG5cbiAgICBtb2RhbC5pbm5lckhUTUwgPSBgXG4gIDxkaXYgY2xhc3M9XCJxdHYtaGQgbHQtY2FyZF9faGVhZGVyXCI+XG4gICAgPGgzIGNsYXNzPVwibHQtY2FyZF9fdGl0bGVcIj5WYWxpZGF0aW9uIERldGFpbHM8L2gzPlxuICAgIDxkaXYgY2xhc3M9XCJxdHYtYWN0aW9ucyBsdC1jYXJkX19zcGFjZXJcIj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIGlkPVwicXR2LWV4cG9ydC1jc3ZcIiB0aXRsZT1cIkV4cG9ydCB2aXNpYmxlIGlzc3VlcyB0byBDU1ZcIj5FeHBvcnQgQ1NWPC9idXR0b24+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwibHQtYnRuIGx0LWJ0bi0tcHJpbWFyeVwiIGlkPVwicXR2LWNsb3NlXCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG4gIDxkaXYgY2xhc3M9XCJxdHYtYmQgbHQtY2FyZF9fYm9keVwiPlxuICAgIDx0YWJsZSBjbGFzcz1cImx0LXRhYmxlXCIgYXJpYS1sYWJlbD1cIlZhbGlkYXRpb24gSXNzdWVzXCI+XG4gICAgICA8dGhlYWQ+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICA8dGg+U29ydCZuYnNwO09yZGVyPC90aD5cbiAgICAgICAgICA8dGg+UGFydCAjPC90aD5cbiAgICAgICAgICA8dGg+UnVsZTwvdGg+XG4gICAgICAgICAgPHRoPkxldmVsPC90aD5cbiAgICAgICAgICA8dGg+UmVhc29uPC90aD5cbiAgICAgICAgPC90cj5cbiAgICAgIDwvdGhlYWQ+XG4gICAgICA8dGJvZHk+JHtyb3dzSHRtbCB8fCBgPHRyPjx0ZCBjb2xzcGFuPVwiNVwiIHN0eWxlPVwib3BhY2l0eTouNzsgcGFkZGluZzoxMnB4O1wiPk5vIGlzc3Vlcy48L3RkPjwvdHI+YH08L3Rib2R5PlxuICAgIDwvdGFibGU+XG4gIDwvZGl2PlxuYDtcblxuXG4gICAgLy8gaW50ZXJhY3Rpb25zXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG92ZXJsYXkucmVtb3ZlKCkpO1xuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gY2xpY2sgcm93IHRvIGZvY3VzICsgaGlnaGxpZ2h0ICsgc2Nyb2xsXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcigndGJvZHknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBjb25zdCB0ciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ3RyJyk7IGlmICghdHIpIHJldHVybjtcbiAgICAgICAgY29uc3QgcXBrID0gdHIuZ2V0QXR0cmlidXRlKCdkYXRhLXFwaycpO1xuICAgICAgICBpZiAoIXFwaykgcmV0dXJuO1xuICAgICAgICAvLyBlbnN1cmUgaGlnaGxpZ2h0cyBleGlzdCwgdGhlbiBqdW1wXG4gICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocm93KSB7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXR2LXJvdy1mYWlsJykuZm9yRWFjaChlbCA9PiBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKSk7XG4gICAgICAgICAgICByb3cuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJyk7XG4gICAgICAgICAgICByb3cuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gZXhwb3J0IENTVlxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZXhwb3J0LWNzdicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgY3N2ID0gW1xuICAgICAgICAgICAgWydMaW5lJywgJ1NvcnRPcmRlcicsICdQYXJ0Tm8nLCAnUXVvdGVQYXJ0S2V5JywgJ1J1bGUnLCAnTGV2ZWwnLCAnUmVhc29uJ10uam9pbignLCcpLFxuICAgICAgICAgICAgLi4uaXNzdWVzLm1hcChpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlc2MgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYgPz8gJycpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gL1tcIixcXG5dLy50ZXN0KHMpID8gYFwiJHtzLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgIDogcztcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICAgIGkubGluZU51bWJlciA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5zb3J0T3JkZXIgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucGFydE5vID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnF1b3RlUGFydEtleSA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5ydWxlTGFiZWwgfHwgaS5raW5kIHx8ICdWYWxpZGF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgaS5sZXZlbCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5tZXNzYWdlIHx8ICcnXG4gICAgICAgICAgICAgICAgXS5tYXAoZXNjKS5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xuXG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbY3N2XSwgeyB0eXBlOiAndGV4dC9jc3YnIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1pc3N1ZXMuY3N2JzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKG1vZGFsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuICAgIHRyeSB7IG92ZXJsYXkuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpOyBvdmVybGF5LmZvY3VzKCk7IH0gY2F0Y2ggeyB9XG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcbiAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogJ25hdicgfSk7XG4gICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgLy8gYXZvaWQgZHVwbGljYXRlXG4gICAgaWYgKGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSFVCX0JUTl9JRCkpIHJldHVybiAoKSA9PiB7IH07XG5cbiAgICBsZXQgYnRuRWwgPSBudWxsO1xuICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgIGxhYmVsOiAnVmFsaWRhdGUgTGluZXMnLFxuICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIHF1b3RlIGxpbmUgcnVsZXMnLFxuICAgICAgICB3ZWlnaHQ6IDEzMCxcbiAgICAgICAgb25DbGljazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBnZXRTZXR0aW5ncz8uKCkgfHwge307XG4gICAgICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrPy4oJ1ZhbGlkYXRpbmdcdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBvbGQgaGlnaGxpZ2h0cyBhbmQgZW5zdXJlIHN0eWxlcyBhcmUgcHJlc2VudCB1cC1mcm9udFxuICAgICAgICAgICAgICAgIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKTtcbiAgICAgICAgICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc3N1ZXMgPSBBcnJheS5pc0FycmF5KHJlcz8uaXNzdWVzKSA/IHJlcy5pc3N1ZXMgOiBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb3VudCA9IGlzc3Vlcy5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAvLyBBdXRvLWhpZ2hsaWdodCBhbGwgZXJyb3Igcm93cyBpbW1lZGlhdGVseSAoYmVmb3JlIG1vZGFsKVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgaXNzIG9mIGlzc3Vlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcXBrID0gaXNzPy5xdW90ZVBhcnRLZXk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXFwaykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJvdykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlID0gJ3F0di1yb3ctZmFpbCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbHMgPSBjbGFzc0Zvcklzc3VlKGlzcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByb3cuY2xhc3NMaXN0LmFkZChiYXNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbHMpIHJvdy5jbGFzc0xpc3QuYWRkKGNscyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbm9uLWZhdGFsICovIH1cblxuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LignTGluZXMgdmFsaWQnLCAnc3VjY2VzcycpO1xuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LignQWxsIGNsZWFyJywgJ3N1Y2Nlc3MnLCB7IHN0aWNreTogZmFsc2UgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/LigwKTtcbiAgICAgICAgICAgICAgICAgICAgdGFzay5kb25lPy4oJ1ZhbGlkJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGFsbHkgb3V0Y29tZXMgKGhhbmRsZXMgbWlzc2luZyBsZXZlbCBncmFjZWZ1bGx5KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsZXZlbHMgPSBpc3N1ZXMubWFwKGkgPT4gU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzRXJyb3IgPSBsZXZlbHMuc29tZShsID0+IGwgPT09ICdlcnJvcicgfHwgbCA9PT0gJ2ZhaWwnIHx8IGwgPT09ICdjcml0aWNhbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCBpc3N1ZXMuc29tZShpID0+IC9wcmljZVxcLig/Om1heHVuaXRwcmljZXxtaW51bml0cHJpY2UpL2kudGVzdChTdHJpbmcoaT8ua2luZCB8fCAnJykpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzV2FybiA9ICFoYXNFcnJvciAmJiBsZXZlbHMuc29tZShsID0+IGwgPT09ICd3YXJuJyB8fCBsID09PSAnd2FybmluZycpO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBHdWFyZCB0byBlbnN1cmUgVUkgcHJvYmxlbXMgbmV2ZXIgYmxvY2sgdGhlIG1vZGFsXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGFzRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXFx1Mjc0QyAke2NvdW50fSB2YWxpZGF0aW9uICR7Y291bnQgPT09IDEgPyAnaXNzdWUnIDogJ2lzc3Vlcyd9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oYFxcdTI3NEMgJHtjb3VudH0gaXNzdWUke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCwgJ2Vycm9yJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzV2Fybikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKGBcXHUyNkEwXFx1RkUwRiAke2NvdW50fSB2YWxpZGF0aW9uICR7Y291bnQgPT09IDEgPyAnd2FybmluZycgOiAnd2FybmluZ3MnfWAsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oYFxcdTI2QTBcXHVGRTBGICR7Y291bnR9IHdhcm5pbmcke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCwgJ3dhcm4nLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oY291bnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJbmZvLW9ubHkgdXBkYXRlcyAoZS5nLiwgYXV0by1tYW5hZ2UgcG9zdHMgd2l0aCBsZXZlbD1pbmZvKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKGAke2NvdW50fSB1cGRhdGUke2NvdW50ID09PSAxID8gJycgOiAncyd9IGFwcGxpZWRgLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGAke2NvdW50fSB1cGRhdGUke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCwgJ2luZm8nLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oY291bnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyogbmV2ZXIgYmxvY2sgdGhlIG1vZGFsICovIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBBbHdheXMgc2hvdyB0aGUgZGV0YWlscyB3aGVuIGNvdW50ID4gMFxuICAgICAgICAgICAgICAgICAgICBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3Vlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgYXV0b01hbmFnZSBhY3R1YWxseSBjaGFuZ2VkIFBhcnRfTm8gKGxldmVsPXdhcm5pbmcpLCByZWZyZXNoIHRoZSBncmlkIChxdDMwIHBhdHRlcm4pXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5lZWRzUmVmcmVzaCA9IGlzc3Vlcy5zb21lKGkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIFN0cmluZyhpPy5raW5kIHx8ICcnKS5pbmNsdWRlcygnYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICd3YXJuaW5nJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgaT8ubWV0YT8uY2hhbmdlZCA9PT0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChuZWVkc1JlZnJlc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbW9kZSA9IGF3YWl0IHJlZnJlc2hRdW90ZUdyaWQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlID8gYEdyaWQgcmVmcmVzaGVkICgke21vZGV9KWAgOiAnR3JpZCByZWZyZXNoIGF0dGVtcHRlZCAocmVsb2FkIG1heSBiZSBuZWVkZWQpJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/ICdzdWNjZXNzJyA6ICdpbmZvJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKCdHcmlkIHJlZnJlc2ggZmFpbGVkJywgJ3dhcm4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRhc2suZG9uZT8uKCdDaGVja2VkJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY2FjaGUgbGFzdCBzdGF0dXMgZm9yIFNQQSByZWRyYXdzXG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHJlcztcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgbHQuY29yZS5odWIuZXJyb3I/LihgVmFsaWRhdGlvbiBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDYwMDAgfSk7XG4gICAgICAgICAgICAgICAgdGFzay5lcnJvcj8uKCdFcnJvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBHcmFiIGJhY2sgdGhlIHJlYWwgRE9NIGJ1dHRvbiB0byB1cGRhdGUgdGl0bGUgbGF0ZXJcbiAgICBidG5FbCA9IGh1Yi5fc2hhZG93Py5xdWVyeVNlbGVjdG9yPy4oYFtkYXRhLWlkPVwiJHtIVUJfQlROX0lEfVwiXWApO1xuXG4gICAgY29uc3Qgb2ZmU2V0dGluZ3MgPSBvblNldHRpbmdzQ2hhbmdlPy4oKCkgPT4gcmVmcmVzaExhYmVsKGJ0bkVsKSk7XG4gICAgcmVmcmVzaExhYmVsKGJ0bkVsKTtcblxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIG9mZlNldHRpbmdzPy4oKTtcbiAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZWZyZXNoTGFiZWwoYnRuKSB7XG4gICAgaWYgKCFidG4pIHJldHVybjtcbiAgICBjb25zdCBzID0gZ2V0U2V0dGluZ3MoKTtcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xuICAgIC8vaWYgKHMuZm9yYmlkWmVyb1ByaWNlKSBwYXJ0cy5wdXNoKCdcdTIyNjAkMCcpO1xuICAgIGlmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xuICAgIGlmIChzLm1heFVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjQke3MubWF4VW5pdFByaWNlfWApO1xuICAgIGJ0bi50aXRsZSA9IGBSdWxlczogJHtwYXJ0cy5qb2luKCcsICcpIHx8ICdub25lJ31gO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCkge1xuICAgIC8vIElmIHRoZSBnbG9iYWwgdGhlbWUgcHJvdmlkZXMgLnF0di0qIHN0eWxlcywgZG8gbm90aGluZy5cbiAgICBjb25zdCBoYXNUaGVtZVF0diA9ICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0ZXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB0ZXN0LmNsYXNzTmFtZSA9ICdxdHYtcGlsbCc7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRlc3QpO1xuICAgICAgICAgICAgY29uc3QgY3MgPSBnZXRDb21wdXRlZFN0eWxlKHRlc3QpO1xuICAgICAgICAgICAgY29uc3Qgb2sgPSAhIWNzICYmIChjcy5ib3JkZXJSYWRpdXMgfHwgJycpLmluY2x1ZGVzKCc5OTlweCcpO1xuICAgICAgICAgICAgdGVzdC5yZW1vdmUoKTtcbiAgICAgICAgICAgIHJldHVybiBvaztcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgIH0pKCk7XG5cbiAgICBpZiAoaGFzVGhlbWVRdHYpIHJldHVybjtcblxuICAgIC8vIEZhbGxiYWNrIHNoaW0gKGtlcHQgdGlueSk6IGhpZ2hsaWdodCBvbmx5OyBtb2RhbC90YWJsZSBzdHlsZXMgd2lsbCBzdGlsbCBiZSBzZXQgaW5saW5lLlxuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXR2LXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ3F0di1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuLyogTWluaW1hbCBzY2FmZm9sZGluZyB3aGVuIHRoZW1lLmNzcyBpc24ndCByZWFkeSAqL1xuI3F0di1tb2RhbC1vdmVybGF5IHsgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwuMzYpOyB6LWluZGV4OiAxMDAwMDI7IH1cbiNxdHYtbW9kYWwge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogNTAlOyBsZWZ0OiA1MCU7IHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsLTUwJSk7IHdpZHRoOiBtaW4oOTAwcHgsOTJ2dyk7XG59XG5cbi5sdC1jYXJkIHsgYmFja2dyb3VuZDogI2ZmZjsgYm9yZGVyLXJhZGl1czogMTJweDsgYm94LXNoYWRvdzogMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApOyBvdmVyZmxvdzogaGlkZGVuOyB9XG4ubHQtY2FyZF9faGVhZGVyIHsgZGlzcGxheTpmbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuOyBwYWRkaW5nOiAxMnB4IDE2cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDAsMCwwLC4wOCk7IH1cbi5sdC1jYXJkX190aXRsZSB7IG1hcmdpbjogMDsgZm9udDogNjAwIDE2cHgvMS4yIHN5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWY7IH1cbi5sdC1jYXJkX19zcGFjZXIgeyBtYXJnaW4tbGVmdDogYXV0bzsgfVxuLmx0LWNhcmRfX2JvZHkgeyBwYWRkaW5nOiAxMnB4IDE2cHg7IG1heC1oZWlnaHQ6IG1pbig3MHZoLDY4MHB4KTsgb3ZlcmZsb3c6IGF1dG87IH1cblxuLmx0LWJ0biB7IGRpc3BsYXk6aW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjZweDsgcGFkZGluZzo2cHggMTBweDsgYm9yZGVyOjFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOjhweDsgYmFja2dyb3VuZDojZjlmYWZiOyBjdXJzb3I6cG9pbnRlcjsgfVxuLmx0LWJ0bi0tcHJpbWFyeSB7IGJhY2tncm91bmQ6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWJyYW5kLTYwMCkgNzAlLCBibGFjayk7IGNvbG9yOiNmZmY7IH1cbi5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4ubHQtYnRuLS1naG9zdCB7IGJhY2tncm91bmQ6dHJhbnNwYXJlbnQ7IGNvbG9yOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IH1cbi5sdC1idG4tLWdob3N0OmhvdmVyIHsgYmFja2dyb3VuZDogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWJyYW5kLTYwMCkgMTIlLCB0cmFuc3BhcmVudCk7IH1cblxuLmx0LXRhYmxlIHsgd2lkdGg6MTAwJTsgYm9yZGVyLWNvbGxhcHNlOiBzZXBhcmF0ZTsgYm9yZGVyLXNwYWNpbmc6IDA7IGZvbnQ6IDQwMCAxM3B4LzEuMzUgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuLmx0LXRhYmxlIHRoIHsgdGV4dC1hbGlnbjpsZWZ0OyBwYWRkaW5nOjhweCAxMHB4OyBiYWNrZ3JvdW5kOiNmM2Y0ZjY7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlNWU3ZWI7IHBvc2l0aW9uOnN0aWNreTsgdG9wOjA7IH1cbi5sdC10YWJsZSB0ZCB7IHBhZGRpbmc6OHB4IDEwcHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNmMWY1Zjk7IH1cbi5sdC10YWJsZSB0Ym9keSB0cjpob3ZlciB7IGJhY2tncm91bmQ6I2Y4ZmFmYzsgfVxuXG4ucXR2LXBpbGwgeyBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6M3B4IDEwcHg7IGJvcmRlci1yYWRpdXM6OTk5cHg7IGZvbnQtd2VpZ2h0OjYwMDsgZm9udC1zaXplOjEycHg7IGJvcmRlcjoxcHggc29saWQgdHJhbnNwYXJlbnQ7IH1cbi5xdHYtcGlsbC0tZXJyb3IgeyBiYWNrZ3JvdW5kOiNkYzI2MjY7IGNvbG9yOiNmZmY7IH1cbi5xdHYtcGlsbC0td2FybiAgeyBiYWNrZ3JvdW5kOiNmNTllMGI7IGNvbG9yOiMxMTE7IH1cbi5xdHYtcGlsbC0taW5mbyAgeyBiYWNrZ3JvdW5kOiMzYjgyZjY7IGNvbG9yOiNmZmY7IH1cblxuLyogUm93IGhpZ2hsaWdodHMgKi9cbi5xdHYtcm93LWZhaWwgeyBvdXRsaW5lOiAycHggc29saWQgcmdiYSgyMjAsIDM4LCAzOCwgLjg1KSAhaW1wb3J0YW50OyBvdXRsaW5lLW9mZnNldDogLTJweDsgfVxuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjU0LCAyMjYsIDIyNiwgLjY1KSAhaW1wb3J0YW50OyB9XG4ucXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0IHsgYmFja2dyb3VuZDogcmdiYSgyMTksIDIzNCwgMjU0LCAuNjUpICFpbXBvcnRhbnQ7IH1cbmA7XG5cbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxufVxuXG5cbi8vIGluc2VydCBhYm92ZSBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKClcbmZ1bmN0aW9uIGdldE9ic1ZhbCh2bSwgcHJvcCkge1xuICAgIHRyeSB7IGNvbnN0IHYgPSB2bT8uW3Byb3BdOyByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7IH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbi8qKiBUYWcgdmlzaWJsZSBncmlkIHJvd3Mgd2l0aCBkYXRhLXF1b3RlLXBhcnQta2V5IGJ5IHJlYWRpbmcgS08gY29udGV4dCAqL1xuZnVuY3Rpb24gZW5zdXJlUm93S2V5QXR0cmlidXRlcygpIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIDA7XG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcbiAgICAgICAgJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdydcbiAgICApO1xuICAgIGxldCB0YWdnZWQgPSAwO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGlmIChyLmhhc0F0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScpKSB7IHRhZ2dlZCsrOyBjb250aW51ZTsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/LihyKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd1ZNID0gY3R4Py4kZGF0YSA/PyBjdHg/LiRyb290ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBxcGsgPSAodHlwZW9mIFRNVXRpbHM/LmdldE9ic1ZhbHVlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgID8gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3dWTSwgJ1F1b3RlUGFydEtleScpXG4gICAgICAgICAgICAgICAgOiBnZXRPYnNWYWwocm93Vk0sICdRdW90ZVBhcnRLZXknKTtcblxuICAgICAgICAgICAgaWYgKHFwayAhPSBudWxsICYmIHFwayAhPT0gJycgJiYgTnVtYmVyKHFwaykgPiAwKSB7XG4gICAgICAgICAgICAgICAgci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknLCBTdHJpbmcocXBrKSk7XG4gICAgICAgICAgICAgICAgdGFnZ2VkKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBwZXItcm93IGZhaWx1cmVzICovIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhZ2dlZDtcbn1cbmZ1bmN0aW9uIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCcpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwaykge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIEZhc3QgcGF0aDogYXR0cmlidXRlIChwcmVmZXJyZWQpXG4gICAgbGV0IHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG5cbiAgICAvLyBJZiBhdHRyaWJ1dGVzIGFyZSBtaXNzaW5nLCB0cnkgdG8gdGFnIHRoZW0gb25jZSB0aGVuIHJldHJ5XG4gICAgaWYgKGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSA+IDApIHtcbiAgICAgICAgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XG4gICAgICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG4gICAgfVxuXG4gICAgLy8gTGFzdCByZXNvcnQ6IHRleHR1YWwgc2NhbiAobGVzcyByZWxpYWJsZSwgYnV0IHdvcmtzIHRvZGF5KVxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCB0eHQgPSAoci50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjbGFzc0Zvcklzc3VlKGlzcykge1xuICAgIGNvbnN0IGtpbmQgPSBTdHJpbmcoaXNzPy5raW5kIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5tYXh1bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5taW51bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnO1xuICAgIHJldHVybiAnJztcbn1cblxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuXG5pZiAoREVWKSB7XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyA9ICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgfHwge307XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy50YWdTdGF0cyA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdycpIDogW107XG4gICAgICAgIGNvbnN0IHRhZ2dlZCA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXF1b3RlLXBhcnQta2V5XScpIDogW107XG4gICAgICAgIGNvbnNvbGUubG9nKCdbUVRWXSByb3dzOicsIHJvd3MubGVuZ3RoLCAndGFnZ2VkOicsIHRhZ2dlZC5sZW5ndGgpO1xuICAgICAgICByZXR1cm4geyB0b3RhbDogcm93cy5sZW5ndGgsIHRhZ2dlZDogdGFnZ2VkLmxlbmd0aCB9O1xuICAgIH07XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy5oaWxpVGVzdCA9IChxcGspID0+IHtcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocikgeyByLmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcsICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTsgci5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyB9XG4gICAgICAgIHJldHVybiAhIXI7XG4gICAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUE0Q0EsV0FBUyxhQUFhLEdBQUc7QUFDckIsVUFBTSxJQUFJLFlBQVksQ0FBQztBQUN2QixRQUFJLE1BQU0sT0FBVyxRQUFPO0FBRTVCLFVBQU0sWUFBWSxPQUFPLE9BQU8sV0FBVyxFQUFFLEtBQUssUUFBTSxHQUFHLFNBQVMsRUFBRSxNQUFNLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN2RixVQUFNLEtBQUssWUFBWSxZQUFZLFNBQVMsSUFBSTtBQUNoRCxXQUFRLE9BQU8sU0FBYSxLQUFLO0FBQUEsRUFDckM7QUFRTyxXQUFTLGNBQWM7QUFDMUIsV0FBTztBQUFBLE1BQ0gsU0FBUyxPQUFPLEtBQUssT0FBTztBQUFBLE1BQzVCLDJCQUEyQixPQUFPLEtBQUsseUJBQXlCO0FBQUEsTUFDaEUsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLE1BQ3RDLGNBQWMsT0FBTyxLQUFLLFlBQVk7QUFBQSxNQUN0QyxtQkFBbUIsT0FBTyxLQUFLLGlCQUFpQjtBQUFBLElBQ3BEO0FBQUEsRUFDSjtBQUVPLFdBQVMsaUJBQWlCLElBQUk7QUFDakMsUUFBSSxPQUFPLE9BQU8sV0FBWSxRQUFPLE1BQU07QUFBQSxJQUFFO0FBQzdDLFVBQU0sSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQ2hDLFdBQU8saUJBQWlCLDBCQUEwQixDQUFDO0FBQ25ELFdBQU8sTUFBTSxPQUFPLG9CQUFvQiwwQkFBMEIsQ0FBQztBQUFBLEVBQ3ZFO0FBQ0EsV0FBUyxjQUFjO0FBQ25CLFFBQUk7QUFBRSxhQUFPLGNBQWMsSUFBSSxZQUFZLDBCQUEwQixFQUFFLFFBQVEsWUFBWSxFQUFFLENBQUMs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QXFCLEdBQUc7QUFDeEIsVUFBSSxDQUFDLFdBQVksY0FBYSxNQUFNLHNCQUFzQixPQUFPO0FBQUEsSUFDckUsT0FBTztBQUNILGNBQVE7QUFBQSxJQUNaO0FBQUEsRUFDSjtBQUVBLFdBQVMsVUFBVTtBQUFFLFFBQUksWUFBWTtBQUFFLGlCQUFXO0FBQUcsbUJBQWE7QUFBQSxJQUFNO0FBQUEsRUFBRTtBQUcxRSxZQUFVO0FBQ1YsV0FBUyxjQUFjLFNBQVM7QUFDaEMsU0FBTyxpQkFBaUIsY0FBYyxTQUFTO0FBQy9DLE1BQU0sTUFBTSxTQUFTLGNBQWMsd0JBQXdCO0FBQzNELE1BQUksSUFBSyxLQUFJLGlCQUFpQixTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsU0FBUyxNQUFNLFlBQVksTUFBTSxXQUFXLEtBQUssQ0FBQzsiLAogICJuYW1lcyI6IFsiZ2V0SHViIiwgImx0IiwgIlRNVXRpbHMiLCAiS08iLCAiS08iLCAiVE1VdGlscyIsICJERVYiLCAiREVWIiwgIktPIiwgInJ1blZhbGlkYXRpb24iLCAiZ2V0U2V0dGluZ3MiLCAiUk9VVEVTIl0KfQo=
