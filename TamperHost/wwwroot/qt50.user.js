// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.19.21
// @description Runs rule-based checks on quote lines for lead time, unit price limits, and part number management. Adds a Hub Bar “Validate Lines” button with settings, a details modal, and CSV export. Highlights issues directly in the grid with optional auto-fixes. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.19.21-1779233317767
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.19.21-1779233317767
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.19.21-1779233317767
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.19.21-1779233317767
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.19.21-1779233317767
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

  // tm-scripts/src/quote-tracking/qt50-validation/index.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/index.js"() {
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

  // tm-scripts/src/quote-tracking/qt50-validation/rules/autoManageLtPartNoOnQuote.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/rules/autoManageLtPartNoOnQuote.js"() {
      autoManageLtPartNoOnQuote.meta = { id: "autoManageLtPartNoOnQuote", label: "Auto-Manage LT Part No" };
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/rules/leadtimeZeroWeeks.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/rules/leadtimeZeroWeeks.js"() {
      leadtimeZeroWeeks.meta = { id: "leadtimeZeroWeeks", label: "Leadtime Zero Weeks" };
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/rules/minUnitPrice.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/rules/minUnitPrice.js"() {
      minUnitPrice.meta = { id: "minUnitPrice", label: "Min Unit Price" };
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/rules/maxUnitPrice.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/rules/maxUnitPrice.js"() {
      maxUnitPrice.meta = { id: "maxUnitPrice", label: "Max Unit Price" };
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/rules/index.js
  var rules_default;
  var init_rules = __esm({
    "tm-scripts/src/quote-tracking/qt50-validation/rules/index.js"() {
      init_autoManageLtPartNoOnQuote();
      init_leadtimeZeroWeeks();
      init_minUnitPrice();
      init_maxUnitPrice();
      rules_default = [autoManageLtPartNoOnQuote, leadtimeZeroWeeks, maxUnitPrice, minUnitPrice];
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/engine.js
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
    "tm-scripts/src/quote-tracking/qt50-validation/engine.js"() {
      init_rules();
    }
  });

  // tm-scripts/src/quote-tracking/qt50-validation/qtv.entry.js
  init_index();

  // tm-scripts/src/quote-tracking/qt50-validation/injectButton.js
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
      weight: 30,
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

  // tm-scripts/src/quote-tracking/qt50-validation/qtv.entry.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9sZWFkdGltZVplcm9XZWVrcy5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvbWluVW5pdFByaWNlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9lbmdpbmUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vaW5qZWN0QnV0dG9uLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qc1xuLy8gLS0tLS0tLS0tLSBCb290c3RyYXAgLyByb3V0ZSBndWFyZCAtLS0tLS0tLS0tXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmNvbnN0IENPTkZJRyA9IHtcbiAgICB3aXphcmRUYXJnZXRQYWdlOiAnUGFydCBTdW1tYXJ5JyxcbiAgICBzZXR0aW5nc0tleTogJ3F0NTBfc2V0dGluZ3NfdjEnLFxuICAgIHRvYXN0TXM6IDM1MDBcbn07XG5cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuXG4vLyBJbnN0ZWFkIG9mIGByZXR1cm5gIGF0IHRvcC1sZXZlbCwgY29tcHV0ZSBhIGZsYWc6XG5jb25zdCBPTl9ST1VURSA9ICEhVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbmlmIChERVYgJiYgIU9OX1JPVVRFKSBjb25zb2xlLmRlYnVnKCdRVDUwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcgYm9vdHN0cmFwJyk7XG5cbi8qIGdsb2JhbCBHTV9nZXRWYWx1ZSwgR01fc2V0VmFsdWUsIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQsIFRNVXRpbHMsIHVuc2FmZVdpbmRvdyAqL1xuZXhwb3J0IGNvbnN0IEtFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0NTAuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0NTAuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgbWluVW5pdFByaWNlOiAncXQ1MC5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0NTAubWF4VW5pdFByaWNlJyxcbiAgICBsZWFkdGltZVplcm9XZWVrczogJ3F0NTAubGVhZHRpbWVaZXJvV2Vla3MnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxuICAgIGxlYWR0aW1lWmVyb1dlZWtzOiAncXQ1MC5sZWFkdGltZVplcm9XZWVrcycsXG59O1xuXG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbiAgICBbS0VZUy5sZWFkdGltZVplcm9XZWVrc106IHRydWUsXG59O1xuXG5mdW5jdGlvbiByZWFkT3JMZWdhY3koaykge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrKTtcbiAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSByZXR1cm4gdjtcbiAgICAvLyBvbmUtdGltZSBsZWdhY3kgcmVhZFxuICAgIGNvbnN0IGxlZ2FjeUtleSA9IE9iamVjdC52YWx1ZXMoTEVHQUNZX0tFWVMpLmZpbmQobGsgPT4gbGsuZW5kc1dpdGgoay5zcGxpdCgnLicpLnBvcCgpKSk7XG4gICAgY29uc3QgbHYgPSBsZWdhY3lLZXkgPyBHTV9nZXRWYWx1ZShsZWdhY3lLZXkpIDogdW5kZWZpbmVkO1xuICAgIHJldHVybiAobHYgIT09IHVuZGVmaW5lZCkgPyBsdiA6IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgZ2V0VmFsID0gayA9PiB7XG4gICAgY29uc3QgdiA9IHJlYWRPckxlZ2FjeShrKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSxcbiAgICAgICAgbGVhZHRpbWVaZXJvV2Vla3M6IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gdHJ1ZTtcbiAgICAvL2NvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwYW5lbC5pZCA9ICdsdC1xdHYtcGFuZWwnO1xuICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdsdC1jYXJkIGx0LW1vZGFsJztcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJzUyMHB4JyxcbiAgICAgICAgbWF4V2lkdGg6ICdtaW4oOTJ2dywgNTYwcHgpJ1xuICAgIH0pO1xuXG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBvbWl0dGVkIEx5bi1Ucm9uIFBhcnQgTm8uXG4gICAgPC9sYWJlbD5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1sZWFkdGltZVplcm9XZWVrc1wiPlxuICAgICAgQWxlcnQgd2hlbiBMZWFkdGltZSBpcyAwIHdlZWtzXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjoxMnB4IDAgMTBweDtcIj48L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBmbGV4LXdyYXA6d3JhcDtcIj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtZXhwb3J0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1pbXBvcnQtYnRuXCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS13YXJuXCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT5cbiAgICAgICAgc2V0VmFsKEtFWVMubGVhZHRpbWVaZXJvV2Vla3MsICEhZS50YXJnZXQuY2hlY2tlZClcbiAgICApO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHNhdmVkLicsICdzdWNjZXNzJywgMTYwMCk7XG4gICAgfSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LXJlc2V0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTtcbiAgICAgICAgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWltcG9ydC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBlbnN1cmVTZXR0aW5nc1N0eWxlcygpOyAvLyBORVc6IGZhbGxiYWNrIHN0eWxlcyBpZiB0aGVtZS5jc3MgaXNuXHUyMDE5dCByZWFkeVxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBGb2N1cyBBRlRFUiBhcHBlbmRpbmcgc28gRVNDIHdvcmtzIGltbWVkaWF0ZWx5XG4gICAgb3ZlcmxheS5mb2N1cygpO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVyT3JOdWxsKHMpIHsgY29uc3QgdiA9IE51bWJlcihTdHJpbmcocykudHJpbSgpKTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2KSA/IHYgOiBudWxsOyB9XG5mdW5jdGlvbiB0b051bGxPck51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDsgfVxuZnVuY3Rpb24gc2V0TnVtYmVyT3JCbGFuayhpbnB1dCwgdmFsKSB7IGlucHV0LnZhbHVlID0gKHZhbCA9PSBudWxsID8gJycgOiBTdHJpbmcodmFsKSk7IH1cblxuLyogTkVXOiBtaW5pbWFsIGZhbGxiYWNrIHN0eWxlcyBmb3IgdGhlIHNldHRpbmdzIHBhbmVsICovXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHMuaWQgPSAnbHQtcXR2LXBhbmVsLXN0eWxlcyc7XG4gICAgcy50ZXh0Q29udGVudCA9IGBcbiNsdC1xdHYtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jbHQtcXR2LXBhbmVsLmx0LWNhcmQge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7XG4gIG92ZXJmbG93OiBoaWRkZW47IHBhZGRpbmc6IDE2cHg7XG59XG4jbHQtcXR2LXBhbmVsIGgzIHsgbWFyZ2luOiAwIDAgMTBweCAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLFxuI2x0LXF0di1wYW5lbCBsYWJlbC5sdC1idG4ge1xuICBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7XG4gIGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7XG59XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLWdob3N0ICAgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXdhcm4gICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJuKTsgY29sb3I6IzExMTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0td2FybikgNTAlLCBibGFjayk7IH1cbiNsdC1xdHYtcGFuZWwgLmx0LWJ0bi0tZXJyb3IgICB7IGJhY2tncm91bmQ6IHZhcigtLWVycik7ICBjb2xvcjojZmZmOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1lcnIpIDcwJSwgYmxhY2spOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLW9rICAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1vayk7ICAgY29sb3I6I2ZmZjsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tb2spIDcwJSwgYmxhY2spOyB9XG5cbiNsdC1xdHYtcGFuZWwgaW5wdXRbdHlwZT1cIm51bWJlclwiXSwgI2x0LXF0di1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXSB7XG4gIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiA2cHggOHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOiA2cHg7IGJhY2tncm91bmQ6ICNmZmY7XG59XG4gIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzKTtcbn1cblxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxuLy8gV2hlbiBQYXJ0U3RhdHVzID09PSBcIlF1b3RlXCIsIFBPU1QgdG8gRFMgMTM1MDkgdXNpbmcgdGhlIFFUMzUgcGF0dGVybjpcbi8vICAgUXVvdGVfS2V5ID0gdm1RdW90ZUtleVxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcbi8vICAgUGFydF9ObyAgID0gUXVvdGVfTm8gfHwgXCJfXCIgfHwgdm1QYXJ0Tm8gICAoUXVvdGVfTm8gcmVzb2x2ZWQgdmlhIGx0LmNvcmUgUVRGOyBzZXNzaW9uIGZhbGxiYWNrKVxuLy8gICBOb3RlICAgICAgPSBcImF1dG8gbWFuYWdlZFwiXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGlmICghc2V0dGluZ3M/LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpIHJldHVybiBpc3N1ZXM7XG5cbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBsdCA9IChST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIFFURiAoZmxhdCByZXBvKSBsaWtlIFFUMzVcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXG4gICAgICAgIDogbnVsbDtcblxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xuICAgIGNvbnN0IERTX01BTkFHRV9QQVJUTk8gPSAxMzUwOTsgIC8vIHlvdXIgdGFyZ2V0IERTIHRvIHBvc3QgUGFydF9Ob1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgUk9PVC5nZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgPyBhd2FpdCBST09ULmdldFBsZXhGYWNhZGUoKVxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXgpIHRocm93IG5ldyBFcnJvcignUGxleCBmYWNhZGUgbm90IGF2YWlsYWJsZScpO1xuICAgICAgICByZXR1cm4gcGxleDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0byBzZXNzaW9uIHN0b3JhZ2UgaWYgUVRGL3BsZXggaHlkcmF0aW9uIG5vdCByZWFkeVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIChzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdRdW90ZV9ObycpIHx8ICcnKS50cmltKCk7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIFF1b3RlX05vIGZvciBhIGdpdmVuIFF1b3RlS2V5IHVzaW5nIFFURjsgaHlkcmF0ZSBvbmNlIGZyb20gRFMgaWYgbmVlZGVkLlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFF1b3RlTm9Gb3JRdW90ZUtleShxaykge1xuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcbiAgICAgICAgaWYgKCFxS2V5IHx8ICFOdW1iZXIuaXNGaW5pdGUocUtleSkgfHwgcUtleSA8PSAwKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XG5cbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgaWYgKCFoZWFkPy5RdW90ZV9Obykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFLZXkpIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoID8gcm93c1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1b3RlTm8gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBxS2V5LCBRdW90ZV9ObzogcXVvdGVObywgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcW4gPSBoZWFkPy5RdW90ZV9ObztcbiAgICAgICAgICAgIHJldHVybiAocW4gPT0gbnVsbCA/IGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIDogU3RyaW5nKHFuKS50cmltKCkpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgUXVvdGVQYXJ0IGdyb3VwcywgcmVzb2x2ZSBRdW90ZV9ObyBvbmNlIHBlciBncm91cCwgdGhlbiBwb3N0IHBlci1yb3cgd2hlbiBzdGF0dXMgPT09ICdRdW90ZSdcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGFueSA9IEFycmF5LmlzQXJyYXkoZ3JvdXApICYmIGdyb3VwLmxlbmd0aCA/IGdyb3VwWzBdIDogbnVsbDtcbiAgICAgICAgY29uc3QgZ3JvdXBRdW90ZUtleSA9IHV0aWxzLmdldChhbnksICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgIGNvbnN0IHJlc29sdmVkUXVvdGVObyA9IGF3YWl0IGdldFF1b3RlTm9Gb3JRdW90ZUtleShncm91cFF1b3RlS2V5KTtcblxuICAgICAgICAvLyBQcm9jZXNzIGVhY2ggdW5pcXVlIFBhcnRLZXkgZXhhY3RseSBvbmNlXG4gICAgICAgIGNvbnN0IHVuaXFCeVBhcnRLZXkgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBwayA9IHV0aWxzLmdldChyb3csICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHBrKSAmJiAhdW5pcUJ5UGFydEtleS5oYXMocGspKSB7XG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdW5pcUJ5UGFydEtleS52YWx1ZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB2bVF1b3RlS2V5ID0gZ3JvdXBRdW90ZUtleSA/PyB1dGlscy5nZXQociwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcblxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxuICAgICAgICAgICAgLy8gICBJZiBub3QsIGRlc2lyZWQgcHJlZml4IGlzIFwiX1wiIChwZXIgb3JpZ2luYWwgc3BlYykuXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlNYW5hZ2VkID0gdm1QYXJ0Tm8uc3RhcnRzV2l0aChkZXNpcmVkUHJlZml4KTtcblxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxuICAgICAgICAgICAgaWYgKGFscmVhZHlNYW5hZ2VkKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCB0aGUgZGVzaXJlZCBQYXJ0X05vIGp1c3Qgb25jZSAoYXZvaWQgZG91YmxlLXByZWZpeGluZyBvbiBzdWJzZXF1ZW50IHJ1bnMpXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxuICAgICAgICAgICAgICAgIFBhcnRfTm86IFN0cmluZyhwYXJ0Tm9Gb3JQb3N0ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBRVDM1LXN0eWxlIERTIGNhbGwgd2l0aCBhdXRoIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiB0cnVlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcbmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUubWV0YSA9IHsgaWQ6ICdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJywgbGFiZWw6ICdBdXRvLU1hbmFnZSBMVCBQYXJ0IE5vJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbGVhZHRpbWVaZXJvV2Vla3Ncbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gTGVhZHRpbWUgPT0gMCB3ZWVrcy5cbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubGVhZHRpbWVaZXJvV2Vla3MgKGJvb2xlYW4pLlxuLy8gRmllbGQ6IExlYWR0aW1lICh3ZWVrcykgZXhwZWN0ZWQgaW4gVk0gcm93LlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBsZWFkdGltZVplcm9XZWVrcyhjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGlmICghc2V0dGluZ3M/LmxlYWR0aW1lWmVyb1dlZWtzKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IHV0aWxzLmdldChyLCAnTGVhZFRpbWUnKTsgLy8gYWRqdXN0IGZpZWxkIG5hbWUgaWYgZGlmZmVyZW50XG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAndGltZS5sZWFkdGltZVplcm9XZWVrcycsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTGVhZHRpbWUgaXMgMCB3ZWVrcyAobXVzdCBiZSA+IDApLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgbGVhZHRpbWVSYXc6IHJhdywgbGVhZHRpbWVOdW06IG51bSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaXNzdWVzO1xufVxuXG5sZWFkdGltZVplcm9XZWVrcy5tZXRhID0geyBpZDogJ2xlYWR0aW1lWmVyb1dlZWtzJywgbGFiZWw6ICdMZWFkdGltZSBaZXJvIFdlZWtzJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbWluVW5pdFByaWNlXG4vLyBQdXJwb3NlOiBFcnJvciB3aGVuIHRoZSBlZmZlY3RpdmUgdW5pdCBwcmljZSBpcyBiZWxvdyB0aGUgY29uZmlndXJlZCBtaW5pbXVtLlxuLy8gUmVhZHMgZnJvbSBzZXR0aW5ncy5taW5Vbml0UHJpY2UgKG51bGxhYmxlKS5cbi8vIFByZWNlZGVuY2UgZm9yIHVuaXQgcHJpY2UgZmllbGRzOlxuLy8gICBSdkN1c3RvbWl6ZWRVbml0UHJpY2UgPiBSdlVuaXRQcmljZUNvcHkgPiBVbml0UHJpY2Vcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWluVW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgY29uc3QgbWluID0gTnVtYmVyKHNldHRpbmdzLm1pblVuaXRQcmljZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWluKSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xuICAgICAgICAgICAgY29uc3QgcmF3ID1cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XG5cbiAgICAgICAgICAgIC8vIERlY2lkZSBjdXJyZW5jeTogaW5mZXIgZnJvbSByYXcgb3IgdXNlIHNldHRpbmdzLmN1cnJlbmN5Q29kZSAoZGVmYXVsdCBVU0QpXG4gICAgICAgICAgICBjb25zdCBpbmZlckN1cnJlbmN5ID0gKHJhd1ZhbCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHJhd1ZhbCA9PT0gJ2Z1bmN0aW9uJyA/IHJhd1ZhbCgpIDogcmF3VmFsIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoL1xcJC8udGVzdChzKSkgcmV0dXJuICdVU0QnO1xuICAgICAgICAgICAgICAgIGlmICgvXHUyMEFDLy50ZXN0KHMpKSByZXR1cm4gJ0VVUic7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTAwQTMvLnRlc3QocykpIHJldHVybiAnR0JQJztcbiAgICAgICAgICAgICAgICByZXR1cm4gc2V0dGluZ3M/LmN1cnJlbmN5Q29kZSB8fCAnVVNEJztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbmN5ID0gaW5mZXJDdXJyZW5jeShyYXcpO1xuICAgICAgICAgICAgY29uc3QgbW9uZXlGbXQgPSBuZXcgSW50bC5OdW1iZXJGb3JtYXQoJ2VuLVVTJywgeyBzdHlsZTogJ2N1cnJlbmN5JywgY3VycmVuY3ksIG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcbiAgICAgICAgICAgIGNvbnN0IG51bUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdE1vbmV5ID0gKG4pID0+IE51bWJlci5pc0Zpbml0ZShuKSA/IG1vbmV5Rm10LmZvcm1hdChuKSA6IFN0cmluZyhuKTtcblxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1pblVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9IDwgTWluICR7Zm10TW9uZXkobWluKX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtaW4sIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcblxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgLy8gRGVjaWRlIGN1cnJlbmN5OiBpbmZlciBmcm9tIHJhdyBvciB1c2Ugc2V0dGluZ3MuY3VycmVuY3lDb2RlIChkZWZhdWx0IFVTRClcbiAgICAgICAgICAgIGNvbnN0IGluZmVyQ3VycmVuY3kgPSAocmF3VmFsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgcmF3VmFsID09PSAnZnVuY3Rpb24nID8gcmF3VmFsKCkgOiAocmF3VmFsID8/ICcnKSkudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICgvXFwkLy50ZXN0KHMpKSByZXR1cm4gJ1VTRCc7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTIwQUMvLnRlc3QocykpIHJldHVybiAnRVVSJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MDBBMy8udGVzdChzKSkgcmV0dXJuICdHQlAnO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZXR0aW5ncz8uY3VycmVuY3lDb2RlIHx8ICdVU0QnO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY3VycmVuY3kgPSBpbmZlckN1cnJlbmN5KHJhdyk7XG4gICAgICAgICAgICBjb25zdCBtb25leUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IHN0eWxlOiAnY3VycmVuY3knLCBjdXJyZW5jeSwgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID4gbWF4KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm10TW9uZXkgPSAobikgPT4gTnVtYmVyLmlzRmluaXRlKG4pID8gbW9uZXlGbXQuZm9ybWF0KG4pIDogU3RyaW5nKG4pO1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1heFVuaXRQcmljZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdE1vbmV5KG51bSl9ID4gTWF4ICR7Zm10TW9uZXkobWF4KX1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtYXgsIGN1cnJlbmN5IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XG5pbXBvcnQgbGVhZHRpbWVaZXJvV2Vla3MgZnJvbSAnLi9sZWFkdGltZVplcm9XZWVrcyc7XG5pbXBvcnQgbWluVW5pdFByaWNlIGZyb20gJy4vbWluVW5pdFByaWNlJztcbmltcG9ydCBtYXhVbml0UHJpY2UgZnJvbSAnLi9tYXhVbml0UHJpY2UnO1xuXG5leHBvcnQgZGVmYXVsdCBbYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSwgbGVhZHRpbWVaZXJvV2Vla3MsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgXG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vZW5naW5lLmpzXG5pbXBvcnQgcnVsZXMgZnJvbSAnLi9ydWxlcyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKSB7XG4gICAgYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHsgcmVxdWlyZUtvOiB0cnVlLCB0aW1lb3V0TXM6IDEyMDAwIH0pO1xuXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgY29uc3QgZ3ZtID0gKGdyaWQgJiYgS08gJiYgdHlwZW9mIEtPLmRhdGFGb3IgPT09ICdmdW5jdGlvbicpID8gS08uZGF0YUZvcihncmlkKSA6IG51bGw7XG4gICAgaWYgKCFndm0pIHJldHVybiB7IG9rOiB0cnVlLCBpc3N1ZXM6IFtdIH07IC8vIG5vdGhpbmcgdG8gdmFsaWRhdGUgeWV0XG5cbiAgICBjb25zdCByb3dzID0gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCBxcCA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ1F1b3RlUGFydEtleScpID8/IC0xO1xuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xuICAgIH1cblxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBjb25zdCBwID0gZ3JvdXAuZmluZChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ0lzVW5pcXVlUXVvdGVQYXJ0JykgPT09IDEpIHx8IGdyb3VwWzBdO1xuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcbiAgICB9XG5cbiAgICBjb25zdCBjdHggPSB7XG4gICAgICAgIHJvd3MsXG4gICAgICAgIGdyb3Vwc0J5UXVvdGVQYXJ0LFxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXG4gICAgICAgIGxhc3RGb3JtOiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZUZvcm0/LigpLFxuICAgICAgICBsYXN0UmVzdWx0OiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZT8uKClcbiAgICB9O1xuXG4gICAgY29uc3QgdXRpbHMgPSB7IGdldDogKG9iaiwgcGF0aCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShvYmosIHBhdGgsIG9wdHMpIH07XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocnVsZXMubWFwKHJ1bGUgPT4gcnVsZShjdHgsIHNldHRpbmdzLCB1dGlscykpKTtcbiAgICBjb25zdCBpc3N1ZXNSYXcgPSByZXN1bHRzLmZsYXQoKTtcbiAgICBjb25zdCBvayA9IGlzc3Vlc1Jhdy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xuXG4gICAgLy8gRW5yaWNoIGlzc3VlcyB3aXRoIFVJLWZhY2luZyBkYXRhIChsaW5lTnVtYmVyLCBwYXJ0Tm8sIHJ1bGVMYWJlbClcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiBOdW1iZXIoU3RyaW5nKHYgPz8gJycpLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgY29uc3QgcnVsZUxhYmVsRnJvbSA9IChpc3MpID0+IHtcbiAgICAgICAgLy8gUHJlZmVycmVkOiBydWxlIGZ1bmN0aW9uIHNldHMgLm1ldGEubGFiZWwgKGUuZy4sIG1heFVuaXRQcmljZS5tZXRhLmxhYmVsKVxuICAgICAgICBpZiAoaXNzPy5tZXRhPy5sYWJlbCkgcmV0dXJuIGlzcy5tZXRhLmxhYmVsO1xuICAgICAgICBpZiAoaXNzPy5raW5kKSB7XG4gICAgICAgICAgICBjb25zdCBrID0gU3RyaW5nKGlzcy5raW5kKTtcbiAgICAgICAgICAgIC8vIHByZXR0aWZ5IFwicHJpY2UubWF4VW5pdFByaWNlXCIgPT4gXCJNYXggVW5pdCBQcmljZVwiXG4gICAgICAgICAgICBjb25zdCB0YWlsID0gay5zcGxpdCgnLicpLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRhaWxcbiAgICAgICAgICAgICAgICA/IHRhaWwucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL14uLywgKGMpID0+IGMudG9VcHBlckNhc2UoKSlcbiAgICAgICAgICAgICAgICA6IGs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICdWYWxpZGF0aW9uJztcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgYSBxdWljayBtYXAgb2Ygcm93IC0+IGluZm9cbiAgICBjb25zdCByb3dJbmZvID0gbmV3IE1hcCgpOyAvLyB2bSAtPiB7IGxpbmVOdW1iZXIsIHBhcnRObyB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdHgucm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCByID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3QgcGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJyc7XG4gICAgICAgIHJvd0luZm8uc2V0KHIsIHsgbGluZU51bWJlciwgcGFydE5vIH0pO1xuICAgIH1cblxuICAgIC8vIEFsc28gbWFwIFFQSyAtPiBcInByaW1hcnlcIiByb3cgZm9yIGNoZWFwIGxvb2t1cFxuICAgIGNvbnN0IHFwa1RvUHJpbWFyeUluZm8gPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBbcXAsIHByaW1hcnldIG9mIGN0eC5wcmltYXJ5QnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGluZm8gPSByb3dJbmZvLmdldChwcmltYXJ5KSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogdXRpbHMuZ2V0KHByaW1hcnksICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycgfTtcbiAgICAgICAgcXBrVG9QcmltYXJ5SW5mby5zZXQocXAsIGluZm8pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIGEgU29ydE9yZGVyIGxvb2t1cCBieSB2aXN1YWwgcm93IGluZGV4IChmcm9tIHRoZSBWTSwgbm90IHRoZSBET00pXG4gICAgY29uc3Qgc29ydEJ5TGluZSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGN0eC5yb3dzW2ldO1xuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG4gICAgICAgIGNvbnN0IHNvcnRPcmRlciA9IHV0aWxzLmdldChyb3csICdTb3J0T3JkZXInLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgc29ydEJ5TGluZS5zZXQobGluZU51bWJlciwgc29ydE9yZGVyKTtcbiAgICB9XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBpc3N1ZXNSYXcubWFwKGlzcyA9PiB7XG4gICAgICAgIGNvbnN0IHFwayA9IGlzcy5xdW90ZVBhcnRLZXkgPz8gLTE7XG4gICAgICAgIGNvbnN0IGluZm8gPSBxcGtUb1ByaW1hcnlJbmZvLmdldChxcGspIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiAnJyB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uaXNzLFxuICAgICAgICAgICAgbGluZU51bWJlcjogaW5mby5saW5lTnVtYmVyLFxuICAgICAgICAgICAgcGFydE5vOiBpbmZvLnBhcnRObyxcbiAgICAgICAgICAgIHJ1bGVMYWJlbDogcnVsZUxhYmVsRnJvbShpc3MpLFxuICAgICAgICAgICAgc29ydE9yZGVyOiBzb3J0QnlMaW5lLmdldChpbmZvLmxpbmVOdW1iZXIgPz8gLTEpXG4gICAgICAgIH07XG4gICAgfSk7XG5cblxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxuICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSB7IGF0OiBEYXRlLm5vdygpLCBvaywgaXNzdWVzIH07XG5cbiAgICByZXR1cm4geyBvaywgaXNzdWVzIH07XG59XG5cbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmlmIChfX0JVSUxEX0RFVl9fKSB7XG4gICAgLy8gTWluaW1hbCBLTy9ncmlkIHJlc29sdmVycyBrZXB0IGxvY2FsIHRvIGRlYnVnIGhlbHBlcnNcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFZNKCkge1xuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICByZXR1cm4gZ3JpZCA/IChLTz8uZGF0YUZvcj8uKGdyaWQpIHx8IG51bGwpIDogbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFJvd3MoKSB7XG4gICAgICAgIGNvbnN0IGd2bSA9IGdldEdyaWRWTSgpO1xuICAgICAgICByZXR1cm4gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcGxhaW5Sb3cocikge1xuICAgICAgICBjb25zdCBndiA9IChwLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsIHAsIG9wdHMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgUXVvdGVQYXJ0S2V5OiBndignUXVvdGVQYXJ0S2V5JyksXG4gICAgICAgICAgICBQYXJ0Tm86IGd2KCdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSksXG4gICAgICAgICAgICBQYXJ0U3RhdHVzOiBndignUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFF1YW50aXR5OiBndignUXVhbnRpdHknKSxcbiAgICAgICAgICAgIFVuaXRQcmljZTogZ3YoJ1VuaXRQcmljZScpLFxuICAgICAgICAgICAgUnZVbml0UHJpY2VDb3B5OiBndignUnZVbml0UHJpY2VDb3B5JyksXG4gICAgICAgICAgICBSdkN1c3RvbWl6ZWRVbml0UHJpY2U6IGd2KCdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSxcbiAgICAgICAgICAgIElzVW5pcXVlUXVvdGVQYXJ0OiBndignSXNVbmlxdWVRdW90ZVBhcnQnKVxuICAgICAgICB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0NTVihvYmpzKSB7XG4gICAgICAgIGlmICghb2Jqcz8ubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgICAgIGNvbnN0IGNvbHMgPSBPYmplY3Qua2V5cyhvYmpzWzBdKTtcbiAgICAgICAgY29uc3QgZXNjID0gKHYpID0+ICh2ID09IG51bGwgPyAnJyA6IFN0cmluZyh2KS5pbmNsdWRlcygnLCcpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXCInKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1xcbicpXG4gICAgICAgICAgICA/IGBcIiR7U3RyaW5nKHYpLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgXG4gICAgICAgICAgICA6IFN0cmluZyh2KSk7XG4gICAgICAgIGNvbnN0IGhlYWQgPSBjb2xzLmpvaW4oJywnKTtcbiAgICAgICAgY29uc3QgYm9keSA9IG9ianMubWFwKG8gPT4gY29scy5tYXAoYyA9PiBlc2Mob1tjXSkpLmpvaW4oJywnKSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBoZWFkICsgJ1xcbicgKyBib2R5O1xuICAgIH1cbiAgICBmdW5jdGlvbiBkb3dubG9hZChuYW1lLCBibG9iKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9IG5hbWU7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDIwMDApO1xuICAgIH1cblxuICAgIHVuc2FmZVdpbmRvdy5RVFZfREVCVUcgPSB7XG4gICAgICAgIC8vIFNldHRpbmdzIGhlbHBlcnNcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XG4gICAgICAgICAgICBlbmFibGVkOiBHTV9nZXRWYWx1ZSgncXR2LmVuYWJsZWQnKSxcbiAgICAgICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IEdNX2dldFZhbHVlKCdxdHYuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLFxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxuICAgICAgICAgICAgbWF4VW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1heFVuaXRQcmljZScpXG4gICAgICAgIH0pLFxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXG4gICAgICAgIHNldFZhbHVlOiAoa2V5LCB2YWwpID0+IEdNX3NldFZhbHVlKGtleSwgdmFsKSxcblxuICAgICAgICAvLyBHcmlkIGV4cG9ydGVyc1xuICAgICAgICBncmlkOiAoeyBwbGFpbiA9IHRydWUgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gZ2V0R3JpZFJvd3MoKTtcbiAgICAgICAgICAgIHJldHVybiBwbGFpbiA/IHJvd3MubWFwKHBsYWluUm93KSA6IHJvd3M7XG4gICAgICAgIH0sXG4gICAgICAgIGdyaWRUYWJsZTogKCkgPT4gY29uc29sZS50YWJsZT8uKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKSxcblxuICAgICAgICAvLyBDU1YvSlNPTiBkb3dubG9hZGVyc1xuICAgICAgICBkb3dubG9hZEdyaWRKU09OOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5qc29uJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pLCBudWxsLCAyKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbZGF0YV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgZG93bmxvYWRHcmlkQ1NWOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5jc3YnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjc3YgPSB0b0NTVih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSk7XG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gVmFsaWRhdGlvbiBvbi1kZW1hbmQgKHNhbWUgZW5naW5lIGFzIHRoZSBidXR0b24pXG4gICAgICAgIHZhbGlkYXRlTm93OiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHJ1blZhbGlkYXRpb24gfSA9IGF3YWl0IGltcG9ydCgnLi9lbmdpbmUuanMnKTsgLy8gc2FtZSBtb2R1bGUgdXNlZCBieSB0aGUgaHViIGJ1dHRvblxuICAgICAgICAgICAgY29uc3QgeyBnZXRTZXR0aW5ncyB9ID0gYXdhaXQgaW1wb3J0KCcuL2luZGV4LmpzJyk7XG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIGdldFNldHRpbmdzKCkpO1xuICAgICAgICAgICAgY29uc29sZS50YWJsZT8uKHJlcy5pc3N1ZXMgfHwgW10pO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBRdWljayBleHBlY3RhdGlvbiBoZWxwZXI6IFx1MjAxQ3Nob3cgbWUgcm93cyBhYm92ZSBtYXhcdTIwMURcbiAgICAgICAgZXhwZWN0VW5kZXJNYXg6IChtYXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldCA9IE51bWJlcihtYXgpO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIHJvd3NcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gTnVtYmVyLmlzRmluaXRlKHIuX1VuaXROdW0pICYmIHIuX1VuaXROdW0gPiBzZXQpXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcbiAgICAgICAgfSxcblxuICAgICAgICB1bmRlck1pbjogKG1pbikgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1pbik7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA8IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgfTtcbn1cblxuXG4vLyBFbnN1cmUgdGhlIHNldHRpbmdzIFVJIGxvYWRzIChnZWFyIGJ1dHRvbiwgc3RvcmFnZSBBUEkpXG5pbXBvcnQgJy4vaW5kZXguanMnO1xuLy8gTW91bnRzIHRoZSBWYWxpZGF0ZSBMaW5lcyBidXR0b24gJiB3aXJlcyBjbGljayB0byB0aGUgZW5naW5lXG5pbXBvcnQgeyBtb3VudFZhbGlkYXRpb25CdXR0b24gfSBmcm9tICcuL2luamVjdEJ1dHRvbi5qcyc7XG5cblRNVXRpbHM/Lm5ldD8uZW5zdXJlV2F0Y2hlcj8uKCk7IC8vIG9wdGlvbmFsLCBoYXJtbGVzcyBpZiBtaXNzaW5nXG5cbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG5sZXQgdW5tb3VudEJ0biA9IG51bGw7XG5cbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xuICAgIGlmIChUTVV0aWxzPy5tYXRjaFJvdXRlKSByZXR1cm4gISFUTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKTtcbiAgICByZXR1cm4gUk9VVEVTLnNvbWUocmUgPT4gcmUudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICByZXR1cm4gKGxpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn1cblxuZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7XG4gICAgcmV0dXJuIHRydWU7IC8vIGFsd2F5cyBzaG93IG9uIGFsbCBwYWdlc1xuICAgIC8vcmV0dXJuIC9ecGFydFxccypzdW1tYXJ5JC9pLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XG4gICAgaWYgKGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcbiAgICAgICAgaWYgKCF1bm1vdW50QnRuKSB1bm1vdW50QnRuID0gYXdhaXQgbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHVubW91bnQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVubW91bnQoKSB7IGlmICh1bm1vdW50QnRuKSB7IHVubW91bnRCdG4oKTsgdW5tb3VudEJ0biA9IG51bGw7IH0gfVxuXG4vLyBpbml0aWFsICsgU1BBIHdpcmluZyAobWlycm9ycyBxdDMwL3F0MzUpXG5yZWNvbmNpbGUoKTtcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlKTtcbmNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuXG4iLCAiLy8gQWRkcyBhIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBhbmQgd2lyZXMgaXQgdG8gdGhlIGVuZ2luZS5cbi8vIEFzc3VtZXMgeW91ciBzZXR0aW5ncyBVSSBleHBvcnRzIGdldFNldHRpbmdzL29uU2V0dGluZ3NDaGFuZ2UuXG5cbmltcG9ydCB7IHJ1blZhbGlkYXRpb24gfSBmcm9tICcuL2VuZ2luZSc7XG5pbXBvcnQgeyBnZXRTZXR0aW5ncywgb25TZXR0aW5nc0NoYW5nZSB9IGZyb20gJy4vaW5kZXgnO1xuXG4vLyAtLS0gS08gc3VyZmFjZSAocXQzMCBwYXR0ZXJuKSAtLS1cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5cbi8vIC0tLSBzdW1tYXJpemUgaXNzdWVzIGZvciBzdGF0dXMgcGlsbCAvIHRvYXN0cyAtLS1cbmZ1bmN0aW9uIGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IEFycmF5LmlzQXJyYXkoaXNzdWVzKSA/IGlzc3VlcyA6IFtdO1xuICAgICAgICBjb25zdCBhZ2cgPSBpdGVtcy5yZWR1Y2UoKGFjYywgaXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGx2bCA9IFN0cmluZyhpdD8ubGV2ZWwgfHwgJ2luZm8nKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgYWNjW2x2bF0gPSAoYWNjW2x2bF0gfHwgMCkgKyAxO1xuICAgICAgICAgICAgaWYgKGl0Py5xdW90ZVBhcnRLZXkgIT0gbnVsbCkgYWNjLnBhcnRzLmFkZChpdC5xdW90ZVBhcnRLZXkpO1xuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgeyBlcnJvcjogMCwgd2FybmluZzogMCwgaW5mbzogMCwgcGFydHM6IG5ldyBTZXQoKSB9KTtcblxuICAgICAgICBjb25zdCBwYXJ0c0NvdW50ID0gYWdnLnBhcnRzLnNpemU7XG4gICAgICAgIGNvbnN0IHNlZ3MgPSBbXTtcbiAgICAgICAgaWYgKGFnZy5lcnJvcikgc2Vncy5wdXNoKGAke2FnZy5lcnJvcn0gZXJyb3Ike2FnZy5lcnJvciA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLndhcm5pbmcpIHNlZ3MucHVzaChgJHthZ2cud2FybmluZ30gd2FybmluZyR7YWdnLndhcm5pbmcgPT09IDEgPyAnJyA6ICdzJ31gKTtcbiAgICAgICAgaWYgKGFnZy5pbmZvKSBzZWdzLnB1c2goYCR7YWdnLmluZm99IGluZm9gKTtcbiAgICAgICAgY29uc3QgbGV2ZWxQYXJ0ID0gc2Vncy5qb2luKCcsICcpIHx8ICd1cGRhdGVzJztcblxuICAgICAgICByZXR1cm4gYCR7bGV2ZWxQYXJ0fSBhY3Jvc3MgJHtwYXJ0c0NvdW50IHx8IDB9IHBhcnQke3BhcnRzQ291bnQgPT09IDEgPyAnJyA6ICdzJ31gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxufVxuXG4vLyAtLS0gUVQzMC1zdHlsZSBncmlkIHJlZnJlc2ggKGNvcGllZCkgLS0tXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoUXVvdGVHcmlkKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZEVsICYmIEtPPy5kYXRhRm9yPy4oZ3JpZEVsKTtcblxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgcmV0dXJuICdkcy5yZWFkJztcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgZ3JpZFZNLnJlZnJlc2goKTsgICAgICAgICAgICAgICAgICAvLyBzeW5jIHZpc3VhbCByZWZyZXNoXG4gICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXG4gICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgYWN0aXZlIHBhZ2UgKHJlYmluZClcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3c/LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgaWYgKHdpej8ubmF2aWdhdGVQYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiAnd2l6Lm5hdmlnYXRlUGFnZSc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuXG5cbmNvbnN0IEhVQl9CVE5fSUQgPSAncXQ1MC12YWxpZGF0ZSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdHJ5IHsgY29uc3QgaHViID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaHViKSByZXR1cm4gaHViOyB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzID0gW10pIHtcbiAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG5cbiAgICAvLyBlbGVtZW50c1xuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBvdmVybGF5LmlkID0gJ3F0di1tb2RhbC1vdmVybGF5JztcbiAgICBPYmplY3QuYXNzaWduKG92ZXJsYXkuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsXG4gICAgICAgIGluc2V0OiAwLFxuICAgICAgICBiYWNrZ3JvdW5kOiAndmFyKC0tbHQtb3ZlcmxheSwgcmdiYSgwLDAsMCwuMzYpKScsXG4gICAgICAgIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ3F0di1tb2RhbCc7XG4gICAgbW9kYWwuY2xhc3NOYW1lID0gJ2x0LWNhcmQnO1xuICAgIE9iamVjdC5hc3NpZ24obW9kYWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4gICAgICAgIHRvcDogJzUwJScsXG4gICAgICAgIGxlZnQ6ICc1MCUnLFxuICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIHdpZHRoOiAnbWluKDkwMHB4LCA5MnZ3KSdcbiAgICB9KTtcblxuICAgIC8vIGJ1aWxkIHJvd3MgKFBsZXgtbGlrZTogc29ydCArIHN1cHByZXNzIHJlcGVhdGluZyBTb3J0L1BhcnQvUnVsZSBkaXNwbGF5KVxuICAgIGNvbnN0IHNvcnRlZCA9IFsuLi5pc3N1ZXNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgY29uc3Qgc29BID0gKGEuc29ydE9yZGVyID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSk7XG4gICAgICAgIGNvbnN0IHNvQiA9IChiLnNvcnRPcmRlciA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpO1xuICAgICAgICBpZiAoc29BICE9PSBzb0IpIHJldHVybiBzb0EgLSBzb0I7XG4gICAgICAgIGNvbnN0IHBuQSA9IFN0cmluZyhhLnBhcnRObyA/PyAnJyk7XG4gICAgICAgIGNvbnN0IHBuQiA9IFN0cmluZyhiLnBhcnRObyA/PyAnJyk7XG4gICAgICAgIGlmIChwbkEgIT09IHBuQikgcmV0dXJuIHBuQS5sb2NhbGVDb21wYXJlKHBuQik7XG4gICAgICAgIGNvbnN0IHJsQSA9IFN0cmluZyhhLnJ1bGVMYWJlbCA/PyBhLmtpbmQgPz8gJycpO1xuICAgICAgICBjb25zdCBybEIgPSBTdHJpbmcoYi5ydWxlTGFiZWwgPz8gYi5raW5kID8/ICcnKTtcbiAgICAgICAgcmV0dXJuIHJsQS5sb2NhbGVDb21wYXJlKHJsQik7XG4gICAgfSk7XG5cbiAgICBsZXQgcHJldlNvcnQgPSBudWxsLCBwcmV2UGFydCA9IG51bGwsIHByZXZSdWxlID0gbnVsbDtcbiAgICBjb25zdCByb3dzSHRtbCA9IHNvcnRlZC5tYXAoaXNzID0+IHtcbiAgICAgICAgY29uc3QgbHZsID0gKGlzcy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgbHZsQ2xhc3MgPSAobHZsID09PSAnZXJyb3InKSA/ICdxdHYtcGlsbC0tZXJyb3InIDogKGx2bCA9PT0gJ3dhcm4nIHx8IGx2bCA9PT0gJ3dhcm5pbmcnKSA/ICdxdHYtcGlsbC0td2FybicgOiAncXR2LXBpbGwtLWluZm8nO1xuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGwgJHtsdmxDbGFzc31cIj4ke2x2bCB8fCAnaW5mbyd9PC9zcGFuPmA7XG4gICAgICAgIGNvbnN0IHJlYXNvbiA9IGlzcy5tZXNzYWdlIHx8ICcobm8gbWVzc2FnZSknO1xuICAgICAgICBjb25zdCBydWxlID0gU3RyaW5nKGlzcy5ydWxlTGFiZWwgfHwgaXNzLmtpbmQgfHwgJ1ZhbGlkYXRpb24nKTtcblxuICAgICAgICAvLyBTdXBwcmVzcyByZXBlYXRzIGluIHZpc3VhbCB0YWJsZSBjZWxsc1xuICAgICAgICBjb25zdCBzaG93U29ydCA9IChpc3Muc29ydE9yZGVyICE9PSBwcmV2U29ydCkgPyAoaXNzLnNvcnRPcmRlciA/PyAnJykgOiAnJztcbiAgICAgICAgY29uc3Qgc2hvd1BhcnQgPSAoc2hvd1NvcnQgIT09ICcnIHx8IChpc3MucGFydE5vICE9PSBwcmV2UGFydCkpID8gKGlzcy5wYXJ0Tm8gPz8gJycpIDogJyc7XG4gICAgICAgIGNvbnN0IHNhbWVHcm91cEFzUHJldiA9IChzaG93U29ydCA9PT0gJycgJiYgc2hvd1BhcnQgPT09ICcnKTtcbiAgICAgICAgY29uc3Qgc2hvd1J1bGUgPSAoIXNhbWVHcm91cEFzUHJldiB8fCBydWxlICE9PSBwcmV2UnVsZSkgPyBydWxlIDogJyc7XG5cbiAgICAgICAgcHJldlNvcnQgPSBpc3Muc29ydE9yZGVyO1xuICAgICAgICBwcmV2UGFydCA9IGlzcy5wYXJ0Tm87XG4gICAgICAgIHByZXZSdWxlID0gcnVsZTtcblxuICAgICAgICByZXR1cm4gYFxuICA8dHIgZGF0YS1xcGs9XCIke2lzcy5xdW90ZVBhcnRLZXkgPz8gJyd9XCIgZGF0YS1ydWxlPVwiJHtTdHJpbmcoaXNzLmtpbmQgfHwgJycpfVwiPlxuICAgIDx0ZD4ke3Nob3dTb3J0fTwvdGQ+XG4gICAgPHRkPiR7c2hvd1BhcnR9PC90ZD5cbiAgICA8dGQ+JHtzaG93UnVsZX08L3RkPlxuICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cbiAgICA8dGQ+JHtyZWFzb259PC90ZD5cbiAgPC90cj5gO1xuICAgIH0pLmpvaW4oJycpO1xuXG5cbiAgICBtb2RhbC5pbm5lckhUTUwgPSBgXG4gIDxkaXYgY2xhc3M9XCJxdHYtaGQgbHQtY2FyZF9faGVhZGVyXCI+XG4gICAgPGgzIGNsYXNzPVwibHQtY2FyZF9fdGl0bGVcIj5WYWxpZGF0aW9uIERldGFpbHM8L2gzPlxuICAgIDxkaXYgY2xhc3M9XCJxdHYtYWN0aW9ucyBsdC1jYXJkX19zcGFjZXJcIj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIGlkPVwicXR2LWV4cG9ydC1jc3ZcIiB0aXRsZT1cIkV4cG9ydCB2aXNpYmxlIGlzc3VlcyB0byBDU1ZcIj5FeHBvcnQgQ1NWPC9idXR0b24+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwibHQtYnRuIGx0LWJ0bi0tcHJpbWFyeVwiIGlkPVwicXR2LWNsb3NlXCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG4gIDxkaXYgY2xhc3M9XCJxdHYtYmQgbHQtY2FyZF9fYm9keVwiPlxuICAgIDx0YWJsZSBjbGFzcz1cImx0LXRhYmxlXCIgYXJpYS1sYWJlbD1cIlZhbGlkYXRpb24gSXNzdWVzXCI+XG4gICAgICA8dGhlYWQ+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICA8dGg+U29ydCZuYnNwO09yZGVyPC90aD5cbiAgICAgICAgICA8dGg+UGFydCAjPC90aD5cbiAgICAgICAgICA8dGg+UnVsZTwvdGg+XG4gICAgICAgICAgPHRoPkxldmVsPC90aD5cbiAgICAgICAgICA8dGg+UmVhc29uPC90aD5cbiAgICAgICAgPC90cj5cbiAgICAgIDwvdGhlYWQ+XG4gICAgICA8dGJvZHk+JHtyb3dzSHRtbCB8fCBgPHRyPjx0ZCBjb2xzcGFuPVwiNVwiIHN0eWxlPVwib3BhY2l0eTouNzsgcGFkZGluZzoxMnB4O1wiPk5vIGlzc3Vlcy48L3RkPjwvdHI+YH08L3Rib2R5PlxuICAgIDwvdGFibGU+XG4gIDwvZGl2PlxuYDtcblxuXG4gICAgLy8gaW50ZXJhY3Rpb25zXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG92ZXJsYXkucmVtb3ZlKCkpO1xuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gY2xpY2sgcm93IHRvIGZvY3VzICsgaGlnaGxpZ2h0ICsgc2Nyb2xsXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcigndGJvZHknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBjb25zdCB0ciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ3RyJyk7IGlmICghdHIpIHJldHVybjtcbiAgICAgICAgY29uc3QgcXBrID0gdHIuZ2V0QXR0cmlidXRlKCdkYXRhLXFwaycpO1xuICAgICAgICBpZiAoIXFwaykgcmV0dXJuO1xuICAgICAgICAvLyBlbnN1cmUgaGlnaGxpZ2h0cyBleGlzdCwgdGhlbiBqdW1wXG4gICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocm93KSB7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXR2LXJvdy1mYWlsJykuZm9yRWFjaChlbCA9PiBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKSk7XG4gICAgICAgICAgICByb3cuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJyk7XG4gICAgICAgICAgICByb3cuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gZXhwb3J0IENTVlxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZXhwb3J0LWNzdicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgY3N2ID0gW1xuICAgICAgICAgICAgWydMaW5lJywgJ1NvcnRPcmRlcicsICdQYXJ0Tm8nLCAnUXVvdGVQYXJ0S2V5JywgJ1J1bGUnLCAnTGV2ZWwnLCAnUmVhc29uJ10uam9pbignLCcpLFxuICAgICAgICAgICAgLi4uaXNzdWVzLm1hcChpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlc2MgPSAodikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYgPz8gJycpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gL1tcIixcXG5dLy50ZXN0KHMpID8gYFwiJHtzLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgIDogcztcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICAgIGkubGluZU51bWJlciA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5zb3J0T3JkZXIgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucGFydE5vID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnF1b3RlUGFydEtleSA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5ydWxlTGFiZWwgfHwgaS5raW5kIHx8ICdWYWxpZGF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgaS5sZXZlbCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5tZXNzYWdlIHx8ICcnXG4gICAgICAgICAgICAgICAgXS5tYXAoZXNjKS5qb2luKCcsJyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xuXG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbY3N2XSwgeyB0eXBlOiAndGV4dC9jc3YnIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1pc3N1ZXMuY3N2JzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKG1vZGFsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuICAgIHRyeSB7IG92ZXJsYXkuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpOyBvdmVybGF5LmZvY3VzKCk7IH0gY2F0Y2ggeyB9XG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcbiAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogJ25hdicgfSk7XG4gICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgLy8gYXZvaWQgZHVwbGljYXRlXG4gICAgaWYgKGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSFVCX0JUTl9JRCkpIHJldHVybiAoKSA9PiB7IH07XG5cbiAgICBsZXQgYnRuRWwgPSBudWxsO1xuICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgIGxhYmVsOiAnVmFsaWRhdGUgTGluZXMnLFxuICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIHF1b3RlIGxpbmUgcnVsZXMnLFxuICAgICAgICB3ZWlnaHQ6IDMwLFxuICAgICAgICBvbkNsaWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGdldFNldHRpbmdzPy4oKSB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IHRhc2sgPSBsdC5jb3JlLmh1Yi5iZWdpblRhc2s/LignVmFsaWRhdGluZ1x1MjAyNicsICdpbmZvJykgfHwgeyBkb25lKCkgeyB9LCBlcnJvcigpIHsgfSB9O1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIC8vIENsZWFyIG9sZCBoaWdobGlnaHRzIGFuZCBlbnN1cmUgc3R5bGVzIGFyZSBwcmVzZW50IHVwLWZyb250XG4gICAgICAgICAgICAgICAgY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpO1xuICAgICAgICAgICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzc3VlcyA9IEFycmF5LmlzQXJyYXkocmVzPy5pc3N1ZXMpID8gcmVzLmlzc3VlcyA6IFtdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gaXNzdWVzLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgIC8vIEF1dG8taGlnaGxpZ2h0IGFsbCBlcnJvciByb3dzIGltbWVkaWF0ZWx5IChiZWZvcmUgbW9kYWwpXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpc3Mgb2YgaXNzdWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBxcGsgPSBpc3M/LnF1b3RlUGFydEtleTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcXBrKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcm93KSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2UgPSAncXR2LXJvdy1mYWlsJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNscyA9IGNsYXNzRm9ySXNzdWUoaXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKGJhc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNscykgcm93LmNsYXNzTGlzdC5hZGQoY2xzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKCdMaW5lcyB2YWxpZCcsICdzdWNjZXNzJyk7XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKCdBbGwgY2xlYXInLCAnc3VjY2VzcycsIHsgc3RpY2t5OiBmYWxzZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKDApO1xuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignVmFsaWQnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBUYWxseSBvdXRjb21lcyAoaGFuZGxlcyBtaXNzaW5nIGxldmVsIGdyYWNlZnVsbHkpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxldmVscyA9IGlzc3Vlcy5tYXAoaSA9PiBTdHJpbmcoaT8ubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNFcnJvciA9IGxldmVscy5zb21lKGwgPT4gbCA9PT0gJ2Vycm9yJyB8fCBsID09PSAnZmFpbCcgfHwgbCA9PT0gJ2NyaXRpY2FsJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IGlzc3Vlcy5zb21lKGkgPT4gL3ByaWNlXFwuKD86bWF4dW5pdHByaWNlfG1pbnVuaXRwcmljZSkvaS50ZXN0KFN0cmluZyhpPy5raW5kIHx8ICcnKSkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNXYXJuID0gIWhhc0Vycm9yICYmIGxldmVscy5zb21lKGwgPT4gbCA9PT0gJ3dhcm4nIHx8IGwgPT09ICd3YXJuaW5nJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3VtbWFyeSA9IGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEd1YXJkIHRvIGVuc3VyZSBVSSBwcm9ibGVtcyBuZXZlciBibG9jayB0aGUgbW9kYWxcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYXNFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKGBcXHUyNzRDICR7Y291bnR9IHZhbGlkYXRpb24gJHtjb3VudCA9PT0gMSA/ICdpc3N1ZScgOiAnaXNzdWVzJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgXFx1Mjc0QyAke2NvdW50fSBpc3N1ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLCAnZXJyb3InLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oY291bnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNXYXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oYFxcdTI2QTBcXHVGRTBGICR7Y291bnR9IHZhbGlkYXRpb24gJHtjb3VudCA9PT0gMSA/ICd3YXJuaW5nJyA6ICd3YXJuaW5ncyd9YCwgJ3dhcm4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgXFx1MjZBMFxcdUZFMEYgJHtjb3VudH0gd2FybmluZyR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLCAnd2FybicsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluZm8tb25seSB1cGRhdGVzIChlLmcuLCBhdXRvLW1hbmFnZSBwb3N0cyB3aXRoIGxldmVsPWluZm8pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oYCR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gYXBwbGllZGAsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oYCR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLCAnaW5mbycsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBuZXZlciBibG9jayB0aGUgbW9kYWwgKi8gfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBzaG93IHRoZSBkZXRhaWxzIHdoZW4gY291bnQgPiAwXG4gICAgICAgICAgICAgICAgICAgIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBhdXRvTWFuYWdlIGFjdHVhbGx5IGNoYW5nZWQgUGFydF9ObyAobGV2ZWw9d2FybmluZyksIHJlZnJlc2ggdGhlIGdyaWQgKHF0MzAgcGF0dGVybilcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmVlZHNSZWZyZXNoID0gaXNzdWVzLnNvbWUoaSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmtpbmQgfHwgJycpLmluY2x1ZGVzKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIFN0cmluZyhpPy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKSA9PT0gJ3dhcm5pbmcnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBpPy5tZXRhPy5jaGFuZ2VkID09PSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5lZWRzUmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2RlID0gYXdhaXQgcmVmcmVzaFF1b3RlR3JpZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyBgR3JpZCByZWZyZXNoZWQgKCR7bW9kZX0pYCA6ICdHcmlkIHJlZnJlc2ggYXR0ZW1wdGVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlID8gJ3N1Y2Nlc3MnIDogJ2luZm8nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0dyaWQgcmVmcmVzaCBmYWlsZWQnLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGFzay5kb25lPy4oJ0NoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBjYWNoZSBsYXN0IHN0YXR1cyBmb3IgU1BBIHJlZHJhd3NcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0gcmVzO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5lcnJvcj8uKGBWYWxpZGF0aW9uIGVycm9yOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgeyBtczogNjAwMCB9KTtcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEdyYWIgYmFjayB0aGUgcmVhbCBET00gYnV0dG9uIHRvIHVwZGF0ZSB0aXRsZSBsYXRlclxuICAgIGJ0bkVsID0gaHViLl9zaGFkb3c/LnF1ZXJ5U2VsZWN0b3I/LihgW2RhdGEtaWQ9XCIke0hVQl9CVE5fSUR9XCJdYCk7XG5cbiAgICBjb25zdCBvZmZTZXR0aW5ncyA9IG9uU2V0dGluZ3NDaGFuZ2U/LigoKSA9PiByZWZyZXNoTGFiZWwoYnRuRWwpKTtcbiAgICByZWZyZXNoTGFiZWwoYnRuRWwpO1xuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgb2ZmU2V0dGluZ3M/LigpO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hMYWJlbChidG4pIHtcbiAgICBpZiAoIWJ0bikgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xuICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgLy9pZiAocy5yZXF1aXJlUmVzb2x2ZWRQYXJ0KSBwYXJ0cy5wdXNoKCdQYXJ0Jyk7XG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XG4gICAgaWYgKHMubWluVW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NSR7cy5taW5Vbml0UHJpY2V9YCk7XG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XG4gICAgYnRuLnRpdGxlID0gYFJ1bGVzOiAke3BhcnRzLmpvaW4oJywgJykgfHwgJ25vbmUnfWA7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKSB7XG4gICAgLy8gSWYgdGhlIGdsb2JhbCB0aGVtZSBwcm92aWRlcyAucXR2LSogc3R5bGVzLCBkbyBub3RoaW5nLlxuICAgIGNvbnN0IGhhc1RoZW1lUXR2ID0gKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRlc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHRlc3QuY2xhc3NOYW1lID0gJ3F0di1waWxsJztcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGVzdCk7XG4gICAgICAgICAgICBjb25zdCBjcyA9IGdldENvbXB1dGVkU3R5bGUodGVzdCk7XG4gICAgICAgICAgICBjb25zdCBvayA9ICEhY3MgJiYgKGNzLmJvcmRlclJhZGl1cyB8fCAnJykuaW5jbHVkZXMoJzk5OXB4Jyk7XG4gICAgICAgICAgICB0ZXN0LnJlbW92ZSgpO1xuICAgICAgICAgICAgcmV0dXJuIG9rO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgfSkoKTtcblxuICAgIGlmIChoYXNUaGVtZVF0dikgcmV0dXJuO1xuXG4gICAgLy8gRmFsbGJhY2sgc2hpbSAoa2VwdCB0aW55KTogaGlnaGxpZ2h0IG9ubHk7IG1vZGFsL3RhYmxlIHN0eWxlcyB3aWxsIHN0aWxsIGJlIHNldCBpbmxpbmUuXG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdHYtc3R5bGVzJykpIHJldHVybjtcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gICAgc3R5bGUuaWQgPSAncXR2LXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4vKiBNaW5pbWFsIHNjYWZmb2xkaW5nIHdoZW4gdGhlbWUuY3NzIGlzbid0IHJlYWR5ICovXG4jcXR2LW1vZGFsLW92ZXJsYXkgeyBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLC4zNik7IHotaW5kZXg6IDEwMDAwMjsgfVxuI3F0di1tb2RhbCB7XG4gIC8qIExvY2FsIE1vbnJvZSBwYWxldHRlIChpbmRlcGVuZGVudCBvZiBwYWdlIHRva2VucykgKi9cbiAgLS1icmFuZC02MDA6ICM4YjBiMDQ7XG4gIC0tYnJhbmQtNzAwOiAjNWMwYTBhO1xuICAtLW9rOiAjMjhhNzQ1O1xuICAtLXdhcm46ICNmZmMxMDc7XG4gIC0tZXJyOiAjZGMzNTQ1O1xuXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiA1MCU7IGxlZnQ6IDUwJTsgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwtNTAlKTsgd2lkdGg6IG1pbig5MDBweCw5MnZ3KTtcbn1cblxuLmx0LWNhcmQgeyBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7IG92ZXJmbG93OiBoaWRkZW47IH1cbi5sdC1jYXJkX19oZWFkZXIgeyBkaXNwbGF5OmZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsganVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47IHBhZGRpbmc6IDEycHggMTZweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMCwwLDAsLjA4KTsgfVxuLmx0LWNhcmRfX3RpdGxlIHsgbWFyZ2luOiAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuLmx0LWNhcmRfX3NwYWNlciB7IG1hcmdpbi1sZWZ0OiBhdXRvOyB9XG4ubHQtY2FyZF9fYm9keSB7IHBhZGRpbmc6IDEycHggMTZweDsgbWF4LWhlaWdodDogbWluKDcwdmgsNjgwcHgpOyBvdmVyZmxvdzogYXV0bzsgfVxuXG4ubHQtYnRuIHsgZGlzcGxheTppbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6NnB4OyBwYWRkaW5nOjZweCAxMHB4OyBib3JkZXI6MXB4IHNvbGlkICNkMWQ1ZGI7IGJvcmRlci1yYWRpdXM6OHB4OyBiYWNrZ3JvdW5kOiNmOWZhZmI7IGN1cnNvcjpwb2ludGVyOyB9XG4ubHQtYnRuLS1wcmltYXJ5IHsgYmFja2dyb3VuZDogdmFyKC0tYnJhbmQtNjAwKTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tYnJhbmQtNjAwKSA3MCUsIGJsYWNrKTsgY29sb3I6I2ZmZjsgfVxuLmx0LWJ0bi0tcHJpbWFyeTpob3ZlciB7IGJhY2tncm91bmQ6IHZhcigtLWJyYW5kLTcwMCk7IH1cbi5sdC1idG4tLWdob3N0IHsgYmFja2dyb3VuZDp0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuLmx0LWJ0bi0tZ2hvc3Q6aG92ZXIgeyBiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tYnJhbmQtNjAwKSAxMiUsIHRyYW5zcGFyZW50KTsgfVxuXG4ubHQtdGFibGUgeyB3aWR0aDoxMDAlOyBib3JkZXItY29sbGFwc2U6IHNlcGFyYXRlOyBib3JkZXItc3BhY2luZzogMDsgZm9udDogNDAwIDEzcHgvMS4zNSBzeXN0ZW0tdWksIFNlZ29lIFVJLCBzYW5zLXNlcmlmOyB9XG4ubHQtdGFibGUgdGggeyB0ZXh0LWFsaWduOmxlZnQ7IHBhZGRpbmc6OHB4IDEwcHg7IGJhY2tncm91bmQ6I2YzZjRmNjsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2U1ZTdlYjsgcG9zaXRpb246c3RpY2t5OyB0b3A6MDsgfVxuLmx0LXRhYmxlIHRkIHsgcGFkZGluZzo4cHggMTBweDsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2YxZjVmOTsgfVxuLmx0LXRhYmxlIHRib2R5IHRyOmhvdmVyIHsgYmFja2dyb3VuZDojZjhmYWZjOyB9XG5cbi5xdHYtcGlsbCB7IGRpc3BsYXk6aW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjZweDsgcGFkZGluZzozcHggMTBweDsgYm9yZGVyLXJhZGl1czo5OTlweDsgZm9udC13ZWlnaHQ6NjAwOyBmb250LXNpemU6MTJweDsgYm9yZGVyOjFweCBzb2xpZCB0cmFuc3BhcmVudDsgfVxuLnF0di1waWxsLS1lcnJvciB7IGJhY2tncm91bmQ6I2RjMjYyNjsgY29sb3I6I2ZmZjsgfVxuLnF0di1waWxsLS13YXJuICB7IGJhY2tncm91bmQ6I2Y1OWUwYjsgY29sb3I6IzExMTsgfVxuLnF0di1waWxsLS1pbmZvICB7IGJhY2tncm91bmQ6IzNiODJmNjsgY29sb3I6I2ZmZjsgfVxuXG4vKiBSb3cgaGlnaGxpZ2h0cyAqL1xuLnF0di1yb3ctZmFpbCB7IG91dGxpbmU6IDJweCBzb2xpZCByZ2JhKDIyMCwgMzgsIDM4LCAuODUpICFpbXBvcnRhbnQ7IG91dGxpbmUtb2Zmc2V0OiAtMnB4OyB9XG4ucXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0IHsgYmFja2dyb3VuZDogcmdiYSgyNTQsIDIyNiwgMjI2LCAuNjUpICFpbXBvcnRhbnQ7IH1cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDIxOSwgMjM0LCAyNTQsIC42NSkgIWltcG9ydGFudDsgfVxuYDtcblxuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG59XG5cblxuLy8gaW5zZXJ0IGFib3ZlIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKVxuZnVuY3Rpb24gZ2V0T2JzVmFsKHZtLCBwcm9wKSB7XG4gICAgdHJ5IHsgY29uc3QgdiA9IHZtPy5bcHJvcF07IHJldHVybiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpID8gdigpIDogdjsgfSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuLyoqIFRhZyB2aXNpYmxlIGdyaWQgcm93cyB3aXRoIGRhdGEtcXVvdGUtcGFydC1rZXkgYnkgcmVhZGluZyBLTyBjb250ZXh0ICovXG5mdW5jdGlvbiBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gMDtcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xuICAgICk7XG4gICAgbGV0IHRhZ2dlZCA9IDA7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgaWYgKHIuaGFzQXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JykpIHsgdGFnZ2VkKys7IGNvbnRpbnVlOyB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSBLTz8uY29udGV4dEZvcj8uKHIpO1xuICAgICAgICAgICAgY29uc3Qgcm93Vk0gPSBjdHg/LiRkYXRhID8/IGN0eD8uJHJvb3QgPz8gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHFwayA9ICh0eXBlb2YgVE1VdGlscz8uZ2V0T2JzVmFsdWUgPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICAgICAgPyBUTVV0aWxzLmdldE9ic1ZhbHVlKHJvd1ZNLCAnUXVvdGVQYXJ0S2V5JylcbiAgICAgICAgICAgICAgICA6IGdldE9ic1ZhbChyb3dWTSwgJ1F1b3RlUGFydEtleScpO1xuXG4gICAgICAgICAgICBpZiAocXBrICE9IG51bGwgJiYgcXBrICE9PSAnJyAmJiBOdW1iZXIocXBrKSA+IDApIHtcbiAgICAgICAgICAgICAgICByLnNldEF0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScsIFN0cmluZyhxcGspKTtcbiAgICAgICAgICAgICAgICB0YWdnZWQrKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlIHBlci1yb3cgZmFpbHVyZXMgKi8gfVxuICAgIH1cbiAgICByZXR1cm4gdGFnZ2VkO1xufVxuZnVuY3Rpb24gY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXR2LXJvdy1mYWlsJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpO1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0Jyk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKSB7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBpZiAoIWdyaWQpIHJldHVybiBudWxsO1xuXG4gICAgLy8gRmFzdCBwYXRoOiBhdHRyaWJ1dGUgKHByZWZlcnJlZClcbiAgICBsZXQgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XG4gICAgaWYgKHJvdykgcmV0dXJuIHJvdy5jbG9zZXN0KCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdycpIHx8IHJvdztcblxuICAgIC8vIElmIGF0dHJpYnV0ZXMgYXJlIG1pc3NpbmcsIHRyeSB0byB0YWcgdGhlbSBvbmNlIHRoZW4gcmV0cnlcbiAgICBpZiAoZW5zdXJlUm93S2V5QXR0cmlidXRlcygpID4gMCkge1xuICAgICAgICByb3cgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXF1b3RlLXBhcnQta2V5PVwiJHtDU1MuZXNjYXBlKFN0cmluZyhxcGspKX1cIl1gKTtcbiAgICAgICAgaWYgKHJvdykgcmV0dXJuIHJvdy5jbG9zZXN0KCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdycpIHx8IHJvdztcbiAgICB9XG5cbiAgICAvLyBMYXN0IHJlc29ydDogdGV4dHVhbCBzY2FuIChsZXNzIHJlbGlhYmxlLCBidXQgd29ya3MgdG9kYXkpXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcbiAgICAgICAgJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdydcbiAgICApO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChyLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgIGlmICh0eHQuaW5jbHVkZXMoU3RyaW5nKHFwaykpKSByZXR1cm4gcjtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsYXNzRm9ySXNzdWUoaXNzKSB7XG4gICAgY29uc3Qga2luZCA9IFN0cmluZyhpc3M/LmtpbmQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKGtpbmQuaW5jbHVkZXMoJ3ByaWNlLm1heHVuaXRwcmljZScpKSByZXR1cm4gJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCc7XG4gICAgaWYgKGtpbmQuaW5jbHVkZXMoJ3ByaWNlLm1pbnVuaXRwcmljZScpKSByZXR1cm4gJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCc7XG4gICAgcmV0dXJuICcnO1xufVxuXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuXG5cbmlmIChERVYpIHtcbiAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHID0gKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyB8fCB7fTtcbiAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHLnRhZ1N0YXRzID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICBjb25zdCByb3dzID0gZ3JpZCA/IGdyaWQucXVlcnlTZWxlY3RvckFsbCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93JykgOiBbXTtcbiAgICAgICAgY29uc3QgdGFnZ2VkID0gZ3JpZCA/IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcXVvdGUtcGFydC1rZXldJykgOiBbXTtcbiAgICAgICAgY29uc29sZS5sb2coJ1tRVFZdIHJvd3M6Jywgcm93cy5sZW5ndGgsICd0YWdnZWQ6JywgdGFnZ2VkLmxlbmd0aCk7XG4gICAgICAgIHJldHVybiB7IHRvdGFsOiByb3dzLmxlbmd0aCwgdGFnZ2VkOiB0YWdnZWQubGVuZ3RoIH07XG4gICAgfTtcbiAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHLmhpbGlUZXN0ID0gKHFwaykgPT4ge1xuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG4gICAgICAgIGNvbnN0IHIgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XG4gICAgICAgIGlmIChyKSB7IHIuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJywgJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCcpOyByLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICdjZW50ZXInLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7IH1cbiAgICAgICAgcmV0dXJuICEhcjtcbiAgICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTRDQSxXQUFTLGFBQWEsR0FBRztBQUNyQixVQUFNLElBQUksWUFBWSxDQUFDO0FBQ3ZCLFFBQUksTUFBTSxPQUFXLFFBQU87QUFFNUIsVUFBTSxZQUFZLE9BQU8sT0FBTyxXQUFXLEVBQUUsS0FBSyxRQUFNLEdBQUcsU0FBUyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3ZGLFVBQU0sS0FBSyxZQUFZLFlBQVksU0FBUyxJQUFJO0FBQ2hELFdBQVEsT0FBTyxTQUFhLEtBQUs7QUFBQSxFQUNyQztBQVFPLFdBQVMsY0FBYztBQUMxQixXQUFPO0FBQUEsTUFDSCxTQUFTLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDNUIsMkJBQTJCLE9BQU8sS0FBSyx5QkFBeUI7QUFBQSxNQUNoRSxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsTUFDdEMsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLE1BQ3RDLG1CQUFtQixPQUFPLEtBQUssaUJBQWlCO0FBQUEsSUFDcEQ7QUFBQSxFQUNKO0FBRU8sV0FBUyxpQkFBaUIsSUFBSTtBQUNqQyxRQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFDN0MsVUFBTSxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFDaEMsV0FBTyxpQkFBaUIsMEJBQTBCLENBQUM7QUFDbkQsV0FBTyxNQUFNLE9BQU8sb0JBQW9CLDBCQUEwQixDQUFDO0FBQUEsRUFDdkU7QUFDQSxXQUFTLGNBQWM7QUFDbkIsUUFBSTtBQUFFLGFBQU8sY0FBYyxJQUFJLFlBQVksMEJBQTBCLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQyxD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cUIsR0FBRztBQUN4QixVQUFJLENBQUMsV0FBWSxjQUFhLE1BQU0sc0JBQXNCLE9BQU87QUFBQSxJQUNyRSxPQUFPO0FBQ0gsY0FBUTtBQUFBLElBQ1o7QUFBQSxFQUNKO0FBRUEsV0FBUyxVQUFVO0FBQUUsUUFBSSxZQUFZO0FBQUUsaUJBQVc7QUFBRyxtQkFBYTtBQUFBLElBQU07QUFBQSxFQUFFO0FBRzFFLFlBQVU7QUFDVixXQUFTLGNBQWMsU0FBUztBQUNoQyxTQUFPLGlCQUFpQixjQUFjLFNBQVM7QUFDL0MsTUFBTSxNQUFNLFNBQVMsY0FBYyx3QkFBd0I7QUFDM0QsTUFBSSxJQUFLLEtBQUksaUJBQWlCLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDOyIsCiAgIm5hbWVzIjogWyJnZXRIdWIiLCAibHQiLCAiVE1VdGlscyIsICJLTyIsICJLTyIsICJUTVV0aWxzIiwgIkRFViIsICJERVYiLCAiS08iLCAicnVuVmFsaWRhdGlvbiIsICJnZXRTZXR0aW5ncyIsICJST1VURVMiXQp9Cg==
