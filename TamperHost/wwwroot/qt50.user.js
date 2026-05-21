// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.21.0
// @description Runs rule-based checks on quote lines for lead time, unit price limits, and part number management. Adds a Hub Bar “Validate Lines” button with settings, a details modal, and CSV export. Highlights issues directly in the grid with optional auto-fixes. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.21.0-1779375756894
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.21.0-1779375756894
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.21.0-1779375756894
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.21.0-1779375756894
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.21.0-1779375756894
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
      const r = group[0];
      if (!r) continue;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9sZWFkdGltZVplcm9XZWVrcy5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvbWluVW5pdFByaWNlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9lbmdpbmUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vaW5qZWN0QnV0dG9uLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qc1xuLy8gLS0tLS0tLS0tLSBCb290c3RyYXAgLyByb3V0ZSBndWFyZCAtLS0tLS0tLS0tXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmNvbnN0IENPTkZJRyA9IHtcbiAgICB3aXphcmRUYXJnZXRQYWdlOiAnUGFydCBTdW1tYXJ5JyxcbiAgICBzZXR0aW5nc0tleTogJ3F0NTBfc2V0dGluZ3NfdjEnLFxuICAgIHRvYXN0TXM6IDM1MDBcbn07XG5cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuXG4vLyBJbnN0ZWFkIG9mIGByZXR1cm5gIGF0IHRvcC1sZXZlbCwgY29tcHV0ZSBhIGZsYWc6XG5jb25zdCBPTl9ST1VURSA9ICEhVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbmlmIChERVYgJiYgIU9OX1JPVVRFKSBjb25zb2xlLmRlYnVnKCdRVDUwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcgYm9vdHN0cmFwJyk7XG5cbi8qIGdsb2JhbCBHTV9nZXRWYWx1ZSwgR01fc2V0VmFsdWUsIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQsIFRNVXRpbHMsIHVuc2FmZVdpbmRvdyAqL1xuZXhwb3J0IGNvbnN0IEtFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0NTAuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0NTAuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgbWluVW5pdFByaWNlOiAncXQ1MC5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0NTAubWF4VW5pdFByaWNlJyxcbiAgICBsZWFkdGltZVplcm9XZWVrczogJ3F0NTAubGVhZHRpbWVaZXJvV2Vla3MnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxuICAgIGxlYWR0aW1lWmVyb1dlZWtzOiAncXQ1MC5sZWFkdGltZVplcm9XZWVrcycsXG59O1xuXG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbiAgICBbS0VZUy5sZWFkdGltZVplcm9XZWVrc106IHRydWUsXG59O1xuXG5mdW5jdGlvbiByZWFkT3JMZWdhY3koaykge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrKTtcbiAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSByZXR1cm4gdjtcbiAgICAvLyBvbmUtdGltZSBsZWdhY3kgcmVhZFxuICAgIGNvbnN0IGxlZ2FjeUtleSA9IE9iamVjdC52YWx1ZXMoTEVHQUNZX0tFWVMpLmZpbmQobGsgPT4gbGsuZW5kc1dpdGgoay5zcGxpdCgnLicpLnBvcCgpKSk7XG4gICAgY29uc3QgbHYgPSBsZWdhY3lLZXkgPyBHTV9nZXRWYWx1ZShsZWdhY3lLZXkpIDogdW5kZWZpbmVkO1xuICAgIHJldHVybiAobHYgIT09IHVuZGVmaW5lZCkgPyBsdiA6IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgZ2V0VmFsID0gayA9PiB7XG4gICAgY29uc3QgdiA9IHJlYWRPckxlZ2FjeShrKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSxcbiAgICAgICAgbGVhZHRpbWVaZXJvV2Vla3M6IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gdHJ1ZTtcbiAgICAvL2NvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgICBpbnNldDogMCxcbiAgICAgICAgYmFja2dyb3VuZDogJ3ZhcigtLWx0LW92ZXJsYXksIHJnYmEoMCwwLDAsLjM2KSknLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMlxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwYW5lbC5pZCA9ICdsdC1xdHYtcGFuZWwnO1xuICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdsdC1jYXJkIGx0LW1vZGFsJztcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICB3aWR0aDogJzUyMHB4JyxcbiAgICAgICAgbWF4V2lkdGg6ICdtaW4oOTJ2dywgNTYwcHgpJ1xuICAgIH0pO1xuXG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBvbWl0dGVkIEx5bi1Ucm9uIFBhcnQgTm8uXG4gICAgPC9sYWJlbD5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1sZWFkdGltZVplcm9XZWVrc1wiPlxuICAgICAgQWxlcnQgd2hlbiBMZWFkdGltZSBpcyAwIHdlZWtzXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjoxMnB4IDAgMTBweDtcIj48L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBmbGV4LXdyYXA6d3JhcDtcIj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtZXhwb3J0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1pbXBvcnQtYnRuXCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1naG9zdFwiIHR5cGU9XCJidXR0b25cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJsdC1idG4gbHQtYnRuLS13YXJuXCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLXByaW1hcnlcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmxlYWR0aW1lWmVyb1dlZWtzKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWxlYWR0aW1lWmVyb1dlZWtzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT5cbiAgICAgICAgc2V0VmFsKEtFWVMubGVhZHRpbWVaZXJvV2Vla3MsICEhZS50YXJnZXQuY2hlY2tlZClcbiAgICApO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHNhdmVkLicsICdzdWNjZXNzJywgMTYwMCk7XG4gICAgfSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LXJlc2V0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTtcbiAgICAgICAgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnRcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWltcG9ydC1idG4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBlbnN1cmVTZXR0aW5nc1N0eWxlcygpOyAvLyBORVc6IGZhbGxiYWNrIHN0eWxlcyBpZiB0aGVtZS5jc3MgaXNuXHUyMDE5dCByZWFkeVxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBGb2N1cyBBRlRFUiBhcHBlbmRpbmcgc28gRVNDIHdvcmtzIGltbWVkaWF0ZWx5XG4gICAgb3ZlcmxheS5mb2N1cygpO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlTnVtYmVyT3JOdWxsKHMpIHsgY29uc3QgdiA9IE51bWJlcihTdHJpbmcocykudHJpbSgpKTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2KSA/IHYgOiBudWxsOyB9XG5mdW5jdGlvbiB0b051bGxPck51bWJlcih2KSB7IGNvbnN0IG4gPSBOdW1iZXIodik7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDsgfVxuZnVuY3Rpb24gc2V0TnVtYmVyT3JCbGFuayhpbnB1dCwgdmFsKSB7IGlucHV0LnZhbHVlID0gKHZhbCA9PSBudWxsID8gJycgOiBTdHJpbmcodmFsKSk7IH1cblxuLyogTkVXOiBtaW5pbWFsIGZhbGxiYWNrIHN0eWxlcyBmb3IgdGhlIHNldHRpbmdzIHBhbmVsICovXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHMuaWQgPSAnbHQtcXR2LXBhbmVsLXN0eWxlcyc7XG4gICAgcy50ZXh0Q29udGVudCA9IGBcbiNsdC1xdHYtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jbHQtcXR2LXBhbmVsLmx0LWNhcmQge1xuICAvKiBMb2NhbCBNb25yb2UgcGFsZXR0ZSAoaW5kZXBlbmRlbnQgb2YgcGFnZSB0b2tlbnMpICovXG4gIC0tYnJhbmQtNjAwOiAjOGIwYjA0O1xuICAtLWJyYW5kLTcwMDogIzVjMGEwYTtcbiAgLS1vazogIzI4YTc0NTtcbiAgLS13YXJuOiAjZmZjMTA3O1xuICAtLWVycjogI2RjMzU0NTtcblxuICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCk7XG4gIG92ZXJmbG93OiBoaWRkZW47IHBhZGRpbmc6IDE2cHg7XG59XG4jbHQtcXR2LXBhbmVsIGgzIHsgbWFyZ2luOiAwIDAgMTBweCAwOyBmb250OiA2MDAgMTZweC8xLjIgc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZjsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLFxuI2x0LXF0di1wYW5lbCBsYWJlbC5sdC1idG4ge1xuICBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7XG4gIGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7XG59XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXByaW1hcnk6aG92ZXIgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC03MDApOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLWdob3N0ICAgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6IHZhcigtLWJyYW5kLTYwMCk7IGJvcmRlci1jb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgfVxuI2x0LXF0di1wYW5lbCAubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLXdhcm4gICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS13YXJuKTsgY29sb3I6IzExMTsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0td2FybikgNTAlLCBibGFjayk7IH1cbiNsdC1xdHYtcGFuZWwgLmx0LWJ0bi0tZXJyb3IgICB7IGJhY2tncm91bmQ6IHZhcigtLWVycik7ICBjb2xvcjojZmZmOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1lcnIpIDcwJSwgYmxhY2spOyB9XG4jbHQtcXR2LXBhbmVsIC5sdC1idG4tLW9rICAgICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1vayk7ICAgY29sb3I6I2ZmZjsgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tb2spIDcwJSwgYmxhY2spOyB9XG5cbiNsdC1xdHYtcGFuZWwgaW5wdXRbdHlwZT1cIm51bWJlclwiXSwgI2x0LXF0di1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXSB7XG4gIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiA2cHggOHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiOyBib3JkZXItcmFkaXVzOiA2cHg7IGJhY2tncm91bmQ6ICNmZmY7XG59XG4gIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzKTtcbn1cblxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxuLy8gV2hlbiBQYXJ0U3RhdHVzID09PSBcIlF1b3RlXCIsIFBPU1QgdG8gRFMgMTM1MDkgdXNpbmcgdGhlIFFUMzUgcGF0dGVybjpcbi8vICAgUXVvdGVfS2V5ID0gdm1RdW90ZUtleVxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcbi8vICAgUGFydF9ObyAgID0gUXVvdGVfTm8gfHwgXCJfXCIgfHwgdm1QYXJ0Tm8gICAoUXVvdGVfTm8gcmVzb2x2ZWQgdmlhIGx0LmNvcmUgUVRGOyBzZXNzaW9uIGZhbGxiYWNrKVxuLy8gICBOb3RlICAgICAgPSBcImF1dG8gbWFuYWdlZFwiXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgIGlmICghc2V0dGluZ3M/LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpIHJldHVybiBpc3N1ZXM7XG5cbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcbiAgICBjb25zdCBsdCA9IChST09ULmx0IHx8IHt9KTtcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vIFFURiAoZmxhdCByZXBvKSBsaWtlIFFUMzVcbiAgICBjb25zdCBRVEYgPSBsdC5jb3JlPy5kYXRhPy5tYWtlRmxhdFNjb3BlZFJlcG9cbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXG4gICAgICAgIDogbnVsbDtcblxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xuICAgIGNvbnN0IERTX01BTkFHRV9QQVJUTk8gPSAxMzUwOTsgIC8vIHlvdXIgdGFyZ2V0IERTIHRvIHBvc3QgUGFydF9Ob1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcbiAgICAgICAgY29uc3QgcGxleCA9ICh0eXBlb2YgUk9PVC5nZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgPyBhd2FpdCBST09ULmdldFBsZXhGYWNhZGUoKVxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xuICAgICAgICBpZiAoIXBsZXgpIHRocm93IG5ldyBFcnJvcignUGxleCBmYWNhZGUgbm90IGF2YWlsYWJsZScpO1xuICAgICAgICByZXR1cm4gcGxleDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayB0byBzZXNzaW9uIHN0b3JhZ2UgaWYgUVRGL3BsZXggaHlkcmF0aW9uIG5vdCByZWFkeVxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIChzZXNzaW9uU3RvcmFnZS5nZXRJdGVtKCdRdW90ZV9ObycpIHx8ICcnKS50cmltKCk7IH0gY2F0Y2ggeyByZXR1cm4gJyc7IH1cbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIFF1b3RlX05vIGZvciBhIGdpdmVuIFF1b3RlS2V5IHVzaW5nIFFURjsgaHlkcmF0ZSBvbmNlIGZyb20gRFMgaWYgbmVlZGVkLlxuICAgIGFzeW5jIGZ1bmN0aW9uIGdldFF1b3RlTm9Gb3JRdW90ZUtleShxaykge1xuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcbiAgICAgICAgaWYgKCFxS2V5IHx8ICFOdW1iZXIuaXNGaW5pdGUocUtleSkgfHwgcUtleSA8PSAwKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghUVRGKSByZXR1cm4gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcbiAgICAgICAgICAgIGF3YWl0IHJlcG8uZW5zdXJlRnJvbUxlZ2FjeUlmTWlzc2luZz8uKCk7XG5cbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgaWYgKCFoZWFkPy5RdW90ZV9Obykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19RVU9URV9IRUFERVJfR0VULCB7IFF1b3RlX0tleTogU3RyaW5nKHFLZXkpIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBBcnJheS5pc0FycmF5KHJvd3MpICYmIHJvd3MubGVuZ3RoID8gcm93c1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1b3RlTm8gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVwby5wYXRjaEhlYWRlcj8uKHsgUXVvdGVfS2V5OiBxS2V5LCBRdW90ZV9ObzogcXVvdGVObywgUXVvdGVfSGVhZGVyX0ZldGNoZWRfQXQ6IERhdGUubm93KCkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcW4gPSBoZWFkPy5RdW90ZV9ObztcbiAgICAgICAgICAgIHJldHVybiAocW4gPT0gbnVsbCA/IGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIDogU3RyaW5nKHFuKS50cmltKCkpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgUXVvdGVQYXJ0IGdyb3VwcywgcmVzb2x2ZSBRdW90ZV9ObyBvbmNlIHBlciBncm91cCwgdGhlbiBwb3N0IHBlci1yb3cgd2hlbiBzdGF0dXMgPT09ICdRdW90ZSdcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGFueSA9IEFycmF5LmlzQXJyYXkoZ3JvdXApICYmIGdyb3VwLmxlbmd0aCA/IGdyb3VwWzBdIDogbnVsbDtcbiAgICAgICAgY29uc3QgZ3JvdXBRdW90ZUtleSA9IHV0aWxzLmdldChhbnksICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgIGNvbnN0IHJlc29sdmVkUXVvdGVObyA9IGF3YWl0IGdldFF1b3RlTm9Gb3JRdW90ZUtleShncm91cFF1b3RlS2V5KTtcblxuICAgICAgICAvLyBQcm9jZXNzIGVhY2ggdW5pcXVlIFBhcnRLZXkgZXhhY3RseSBvbmNlXG4gICAgICAgIGNvbnN0IHVuaXFCeVBhcnRLZXkgPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBwayA9IHV0aWxzLmdldChyb3csICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHBrKSAmJiAhdW5pcUJ5UGFydEtleS5oYXMocGspKSB7XG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgdW5pcUJ5UGFydEtleS52YWx1ZXMoKSkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCB2bVF1b3RlS2V5ID0gZ3JvdXBRdW90ZUtleSA/PyB1dGlscy5nZXQociwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcblxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxuICAgICAgICAgICAgLy8gICBJZiBub3QsIGRlc2lyZWQgcHJlZml4IGlzIFwiX1wiIChwZXIgb3JpZ2luYWwgc3BlYykuXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcbiAgICAgICAgICAgIGNvbnN0IGFscmVhZHlNYW5hZ2VkID0gdm1QYXJ0Tm8uc3RhcnRzV2l0aChkZXNpcmVkUHJlZml4KTtcblxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxuICAgICAgICAgICAgaWYgKGFscmVhZHlNYW5hZ2VkKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkLmAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBCdWlsZCB0aGUgZGVzaXJlZCBQYXJ0X05vIGp1c3Qgb25jZSAoYXZvaWQgZG91YmxlLXByZWZpeGluZyBvbiBzdWJzZXF1ZW50IHJ1bnMpXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XG5cbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB7XG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxuICAgICAgICAgICAgICAgIFBhcnRfTm86IFN0cmluZyhwYXJ0Tm9Gb3JQb3N0ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBRVDM1LXN0eWxlIERTIGNhbGwgd2l0aCBhdXRoIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiB0cnVlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcbmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUubWV0YSA9IHsgaWQ6ICdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJywgbGFiZWw6ICdBdXRvLU1hbmFnZSBMVCBQYXJ0IE5vJyB9O1xuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUnVsZTogbGVhZHRpbWVaZXJvV2Vla3Ncbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gTGVhZHRpbWUgPT0gMCB3ZWVrcy5cbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubGVhZHRpbWVaZXJvV2Vla3MgKGJvb2xlYW4pLlxuLy8gRmllbGQ6IExlYWR0aW1lICh3ZWVrcykgZXhwZWN0ZWQgaW4gVk0gcm93LlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBsZWFkdGltZVplcm9XZWVrcyhjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIGlmICghc2V0dGluZ3M/LmxlYWR0aW1lWmVyb1dlZWtzKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBjb25zdCByID0gZ3JvdXBbMF07XG4gICAgICAgIGlmICghcikgY29udGludWU7XG4gICAgICAgIGNvbnN0IHJhdyA9IHV0aWxzLmdldChyLCAnTGVhZFRpbWUnKTtcbiAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID09PSAwKSB7XG4gICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAga2luZDogJ3RpbWUubGVhZHRpbWVaZXJvV2Vla3MnLFxuICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxuICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYExlYWR0aW1lIGlzIDAgd2Vla3MgKG11c3QgYmUgPiAwKS5gLFxuICAgICAgICAgICAgICAgIG1ldGE6IHsgbGVhZHRpbWVSYXc6IHJhdywgbGVhZHRpbWVOdW06IG51bSB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbmxlYWR0aW1lWmVyb1dlZWtzLm1ldGEgPSB7IGlkOiAnbGVhZHRpbWVaZXJvV2Vla3MnLCBsYWJlbDogJ0xlYWR0aW1lIFplcm8gV2Vla3MnIH07XG4iLCAiLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSdWxlOiBtaW5Vbml0UHJpY2Vcbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gdGhlIGVmZmVjdGl2ZSB1bml0IHByaWNlIGlzIGJlbG93IHRoZSBjb25maWd1cmVkIG1pbmltdW0uXG4vLyBSZWFkcyBmcm9tIHNldHRpbmdzLm1pblVuaXRQcmljZSAobnVsbGFibGUpLlxuLy8gUHJlY2VkZW5jZSBmb3IgdW5pdCBwcmljZSBmaWVsZHM6XG4vLyAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZSA+IFJ2VW5pdFByaWNlQ29weSA+IFVuaXRQcmljZVxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtaW5Vbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICBjb25zdCBtaW4gPSBOdW1iZXIoc2V0dGluZ3MubWluVW5pdFByaWNlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtaW4pKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgLy8gRGVjaWRlIGN1cnJlbmN5OiBpbmZlciBmcm9tIHJhdyBvciB1c2Ugc2V0dGluZ3MuY3VycmVuY3lDb2RlIChkZWZhdWx0IFVTRClcbiAgICAgICAgICAgIGNvbnN0IGluZmVyQ3VycmVuY3kgPSAocmF3VmFsKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgcmF3VmFsID09PSAnZnVuY3Rpb24nID8gcmF3VmFsKCkgOiByYXdWYWwgfHwgJycpO1xuICAgICAgICAgICAgICAgIGlmICgvXFwkLy50ZXN0KHMpKSByZXR1cm4gJ1VTRCc7XG4gICAgICAgICAgICAgICAgaWYgKC9cdTIwQUMvLnRlc3QocykpIHJldHVybiAnRVVSJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MDBBMy8udGVzdChzKSkgcmV0dXJuICdHQlAnO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZXR0aW5ncz8uY3VycmVuY3lDb2RlIHx8ICdVU0QnO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgY29uc3QgY3VycmVuY3kgPSBpbmZlckN1cnJlbmN5KHJhdyk7XG4gICAgICAgICAgICBjb25zdCBtb25leUZtdCA9IG5ldyBJbnRsLk51bWJlckZvcm1hdCgnZW4tVVMnLCB7IHN0eWxlOiAnY3VycmVuY3knLCBjdXJyZW5jeSwgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pO1xuICAgICAgICAgICAgY29uc3QgbnVtRm10ID0gbmV3IEludGwuTnVtYmVyRm9ybWF0KCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pO1xuXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtIDwgbWluKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm10TW9uZXkgPSAobikgPT4gTnVtYmVyLmlzRmluaXRlKG4pID8gbW9uZXlGbXQuZm9ybWF0KG4pIDogU3RyaW5nKG4pO1xuXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWluVW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10TW9uZXkobnVtKX0gPCBNaW4gJHtmbXRNb25leShtaW4pfWAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgdW5pdFJhdzogcmF3LCB1bml0TnVtOiBudW0sIG1pbiwgY3VycmVuY3kgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGlzc3Vlcztcbn1cblxubWluVW5pdFByaWNlLm1ldGEgPSB7IGlkOiAnbWluVW5pdFByaWNlJywgbGFiZWw6ICdNaW4gVW5pdCBQcmljZScgfTtcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanNcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIG1heFVuaXRQcmljZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xuICAgIC8vIEd1YXJkIGlmIG5vdCBjb25maWd1cmVkXG4gICAgY29uc3QgbWF4ID0gTnVtYmVyKHNldHRpbmdzLm1heFVuaXRQcmljZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWF4KSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgaXNzdWVzID0gW107XG5cbiAgICAvLyBTaW1wbGUgY3VycmVuY3kvbnVtYmVyIHNhbml0aXplclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJyA/IHYoKSA6IHYpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xuICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICB9O1xuXG5cbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xuXG4gICAgICAgICAgICAvLyBwcmVjZWRlbmNlOiBjdXN0b21pemVkID4gY29weSA+IGJhc2VcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSA/P1xuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1VuaXRQcmljZScpO1xuXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xuXG4gICAgICAgICAgICAvLyBEZWNpZGUgY3VycmVuY3k6IGluZmVyIGZyb20gcmF3IG9yIHVzZSBzZXR0aW5ncy5jdXJyZW5jeUNvZGUgKGRlZmF1bHQgVVNEKVxuICAgICAgICAgICAgY29uc3QgaW5mZXJDdXJyZW5jeSA9IChyYXdWYWwpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiByYXdWYWwgPT09ICdmdW5jdGlvbicgPyByYXdWYWwoKSA6IChyYXdWYWwgPz8gJycpKS50cmltKCk7XG4gICAgICAgICAgICAgICAgaWYgKC9cXCQvLnRlc3QocykpIHJldHVybiAnVVNEJztcbiAgICAgICAgICAgICAgICBpZiAoL1x1MjBBQy8udGVzdChzKSkgcmV0dXJuICdFVVInO1xuICAgICAgICAgICAgICAgIGlmICgvXHUwMEEzLy50ZXN0KHMpKSByZXR1cm4gJ0dCUCc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNldHRpbmdzPy5jdXJyZW5jeUNvZGUgfHwgJ1VTRCc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW5jeSA9IGluZmVyQ3VycmVuY3kocmF3KTtcbiAgICAgICAgICAgIGNvbnN0IG1vbmV5Rm10ID0gbmV3IEludGwuTnVtYmVyRm9ybWF0KCdlbi1VUycsIHsgc3R5bGU6ICdjdXJyZW5jeScsIGN1cnJlbmN5LCBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSk7XG5cbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobnVtKSAmJiBudW0gPiBtYXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmbXRNb25leSA9IChuKSA9PiBOdW1iZXIuaXNGaW5pdGUobikgPyBtb25leUZtdC5mb3JtYXQobikgOiBTdHJpbmcobik7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWF4VW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10TW9uZXkobnVtKX0gPiBNYXggJHtmbXRNb25leShtYXgpfWAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgdW5pdFJhdzogcmF3LCB1bml0TnVtOiBudW0sIG1heCwgY3VycmVuY3kgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGlzc3Vlcztcbn1cblxubWF4VW5pdFByaWNlLm1ldGEgPSB7IGlkOiAnbWF4VW5pdFByaWNlJywgbGFiZWw6ICdNYXggVW5pdCBQcmljZScgfTtcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9pbmRleC5qc1xuaW1wb3J0IGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUgZnJvbSAnLi9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJztcbmltcG9ydCBsZWFkdGltZVplcm9XZWVrcyBmcm9tICcuL2xlYWR0aW1lWmVyb1dlZWtzJztcbmltcG9ydCBtaW5Vbml0UHJpY2UgZnJvbSAnLi9taW5Vbml0UHJpY2UnO1xuaW1wb3J0IG1heFVuaXRQcmljZSBmcm9tICcuL21heFVuaXRQcmljZSc7XG5cbmV4cG9ydCBkZWZhdWx0IFthdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCBsZWFkdGltZVplcm9XZWVrcywgbWF4VW5pdFByaWNlLCBtaW5Vbml0UHJpY2VdOyBcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcbmltcG9ydCBydWxlcyBmcm9tICcuL3J1bGVzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcbiAgICBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1ncmlkJywgeyByZXF1aXJlS286IHRydWUsIHRpbWVvdXRNczogMTIwMDAgfSk7XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBjb25zdCBndm0gPSAoZ3JpZCAmJiBLTyAmJiB0eXBlb2YgS08uZGF0YUZvciA9PT0gJ2Z1bmN0aW9uJykgPyBLTy5kYXRhRm9yKGdyaWQpIDogbnVsbDtcbiAgICBpZiAoIWd2bSkgcmV0dXJuIHsgb2s6IHRydWUsIGlzc3VlczogW10gfTsgLy8gbm90aGluZyB0byB2YWxpZGF0ZSB5ZXRcblxuICAgIGNvbnN0IHJvd3MgPSAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIGNvbnN0IGdyb3Vwc0J5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IHFwID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUXVvdGVQYXJ0S2V5JykgPz8gLTE7XG4gICAgICAgIChncm91cHNCeVF1b3RlUGFydC5nZXQocXApIHx8IGdyb3Vwc0J5UXVvdGVQYXJ0LnNldChxcCwgW10pLmdldChxcCkpLnB1c2gocik7XG4gICAgfVxuXG4gICAgY29uc3QgcHJpbWFyeUJ5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IHAgPSBncm91cC5maW5kKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnSXNVbmlxdWVRdW90ZVBhcnQnKSA9PT0gMSkgfHwgZ3JvdXBbMF07XG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydC5zZXQocXAsIHApO1xuICAgIH1cblxuICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgcm93cyxcbiAgICAgICAgZ3JvdXBzQnlRdW90ZVBhcnQsXG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydCxcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXG4gICAgICAgIGxhc3RSZXN1bHQ6IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlPy4oKVxuICAgIH07XG5cbiAgICBjb25zdCB1dGlscyA9IHsgZ2V0OiAob2JqLCBwYXRoLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKG9iaiwgcGF0aCwgb3B0cykgfTtcblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChydWxlcy5tYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSkpO1xuICAgIGNvbnN0IGlzc3Vlc1JhdyA9IHJlc3VsdHMuZmxhdCgpO1xuICAgIGNvbnN0IG9rID0gaXNzdWVzUmF3LmV2ZXJ5KGkgPT4gaS5sZXZlbCAhPT0gJ2Vycm9yJyk7XG5cbiAgICAvLyBFbnJpY2ggaXNzdWVzIHdpdGggVUktZmFjaW5nIGRhdGEgKGxpbmVOdW1iZXIsIHBhcnRObywgcnVsZUxhYmVsKVxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IE51bWJlcihTdHJpbmcodiA/PyAnJykucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICBjb25zdCBydWxlTGFiZWxGcm9tID0gKGlzcykgPT4ge1xuICAgICAgICAvLyBQcmVmZXJyZWQ6IHJ1bGUgZnVuY3Rpb24gc2V0cyAubWV0YS5sYWJlbCAoZS5nLiwgbWF4VW5pdFByaWNlLm1ldGEubGFiZWwpXG4gICAgICAgIGlmIChpc3M/Lm1ldGE/LmxhYmVsKSByZXR1cm4gaXNzLm1ldGEubGFiZWw7XG4gICAgICAgIGlmIChpc3M/LmtpbmQpIHtcbiAgICAgICAgICAgIGNvbnN0IGsgPSBTdHJpbmcoaXNzLmtpbmQpO1xuICAgICAgICAgICAgLy8gcHJldHRpZnkgXCJwcmljZS5tYXhVbml0UHJpY2VcIiA9PiBcIk1heCBVbml0IFByaWNlXCJcbiAgICAgICAgICAgIGNvbnN0IHRhaWwgPSBrLnNwbGl0KCcuJykucG9wKCk7XG4gICAgICAgICAgICByZXR1cm4gdGFpbFxuICAgICAgICAgICAgICAgID8gdGFpbC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXi4vLCAoYykgPT4gYy50b1VwcGVyQ2FzZSgpKVxuICAgICAgICAgICAgICAgIDogaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ1ZhbGlkYXRpb24nO1xuICAgIH07XG5cbiAgICAvLyBCdWlsZCBhIHF1aWNrIG1hcCBvZiByb3cgLT4gaW5mb1xuICAgIGNvbnN0IHJvd0luZm8gPSBuZXcgTWFwKCk7IC8vIHZtIC0+IHsgbGluZU51bWJlciwgcGFydE5vIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHIgPSBjdHgucm93c1tpXTtcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuICAgICAgICBjb25zdCBwYXJ0Tm8gPSB1dGlscy5nZXQociwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJztcbiAgICAgICAgcm93SW5mby5zZXQociwgeyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfSk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyBtYXAgUVBLIC0+IFwicHJpbWFyeVwiIHJvdyBmb3IgY2hlYXAgbG9va3VwXG4gICAgY29uc3QgcXBrVG9QcmltYXJ5SW5mbyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgcHJpbWFyeV0gb2YgY3R4LnByaW1hcnlCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHJvd0luZm8uZ2V0KHByaW1hcnkpIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiB1dGlscy5nZXQocHJpbWFyeSwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJyB9O1xuICAgICAgICBxcGtUb1ByaW1hcnlJbmZvLnNldChxcCwgaW5mbyk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgYSBTb3J0T3JkZXIgbG9va3VwIGJ5IHZpc3VhbCByb3cgaW5kZXggKGZyb20gdGhlIFZNLCBub3QgdGhlIERPTSlcbiAgICBjb25zdCBzb3J0QnlMaW5lID0gbmV3IE1hcCgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgcm93ID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3Qgc29ydE9yZGVyID0gdXRpbHMuZ2V0KHJvdywgJ1NvcnRPcmRlcicsIHsgbnVtYmVyOiB0cnVlIH0pO1xuICAgICAgICBzb3J0QnlMaW5lLnNldChsaW5lTnVtYmVyLCBzb3J0T3JkZXIpO1xuICAgIH1cblxuICAgIGNvbnN0IGlzc3VlcyA9IGlzc3Vlc1Jhdy5tYXAoaXNzID0+IHtcbiAgICAgICAgY29uc3QgcXBrID0gaXNzLnF1b3RlUGFydEtleSA/PyAtMTtcbiAgICAgICAgY29uc3QgaW5mbyA9IHFwa1RvUHJpbWFyeUluZm8uZ2V0KHFwaykgfHwgeyBsaW5lTnVtYmVyOiBudWxsLCBwYXJ0Tm86ICcnIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5pc3MsXG4gICAgICAgICAgICBsaW5lTnVtYmVyOiBpbmZvLmxpbmVOdW1iZXIsXG4gICAgICAgICAgICBwYXJ0Tm86IGluZm8ucGFydE5vLFxuICAgICAgICAgICAgcnVsZUxhYmVsOiBydWxlTGFiZWxGcm9tKGlzcyksXG4gICAgICAgICAgICBzb3J0T3JkZXI6IHNvcnRCeUxpbmUuZ2V0KGluZm8ubGluZU51bWJlciA/PyAtMSlcbiAgICAgICAgfTtcbiAgICB9KTtcblxuXG4gICAgLy8gc3Rhc2ggaWYgeW91IHdhbnQgb3RoZXIgbW9kdWxlcyB0byByZWFkIGl0IGxhdGVyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XG4gICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHsgYXQ6IERhdGUubm93KCksIG9rLCBpc3N1ZXMgfTtcblxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcbn1cblxuIiwgIi8vIFFUViBlbnRyeXBvaW50OiBtb3VudHMgdGhlIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBvbiBQYXJ0IFN1bW1hcnlcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuaWYgKF9fQlVJTERfREVWX18pIHtcbiAgICAvLyBNaW5pbWFsIEtPL2dyaWQgcmVzb2x2ZXJzIGtlcHQgbG9jYWwgdG8gZGVidWcgaGVscGVyc1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBmdW5jdGlvbiBnZXRHcmlkVk0oKSB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIHJldHVybiBncmlkID8gKEtPPy5kYXRhRm9yPy4oZ3JpZCkgfHwgbnVsbCkgOiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRHcmlkUm93cygpIHtcbiAgICAgICAgY29uc3QgZ3ZtID0gZ2V0R3JpZFZNKCk7XG4gICAgICAgIHJldHVybiAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwbGFpblJvdyhyKSB7XG4gICAgICAgIGNvbnN0IGd2ID0gKHAsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgcCwgb3B0cyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBRdW90ZVBhcnRLZXk6IGd2KCdRdW90ZVBhcnRLZXknKSxcbiAgICAgICAgICAgIFBhcnRObzogZ3YoJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFBhcnRTdGF0dXM6IGd2KCdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pLFxuICAgICAgICAgICAgUXVhbnRpdHk6IGd2KCdRdWFudGl0eScpLFxuICAgICAgICAgICAgVW5pdFByaWNlOiBndignVW5pdFByaWNlJyksXG4gICAgICAgICAgICBSdlVuaXRQcmljZUNvcHk6IGd2KCdSdlVuaXRQcmljZUNvcHknKSxcbiAgICAgICAgICAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZTogZ3YoJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpLFxuICAgICAgICAgICAgSXNVbmlxdWVRdW90ZVBhcnQ6IGd2KCdJc1VuaXF1ZVF1b3RlUGFydCcpXG4gICAgICAgIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvQ1NWKG9ianMpIHtcbiAgICAgICAgaWYgKCFvYmpzPy5sZW5ndGgpIHJldHVybiAnJztcbiAgICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKG9ianNbMF0pO1xuICAgICAgICBjb25zdCBlc2MgPSAodikgPT4gKHYgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHYpLmluY2x1ZGVzKCcsJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcIicpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXFxuJylcbiAgICAgICAgICAgID8gYFwiJHtTdHJpbmcodikucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImBcbiAgICAgICAgICAgIDogU3RyaW5nKHYpKTtcbiAgICAgICAgY29uc3QgaGVhZCA9IGNvbHMuam9pbignLCcpO1xuICAgICAgICBjb25zdCBib2R5ID0gb2Jqcy5tYXAobyA9PiBjb2xzLm1hcChjID0+IGVzYyhvW2NdKSkuam9pbignLCcpKS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGhlYWQgKyAnXFxuJyArIGJvZHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGRvd25sb2FkKG5hbWUsIGJsb2IpIHtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gbmFtZTsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMjAwMCk7XG4gICAgfVxuXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcbiAgICAgICAgLy8gU2V0dGluZ3MgaGVscGVyc1xuICAgICAgICBzZXR0aW5nczogKCkgPT4gKHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxuICAgICAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogR01fZ2V0VmFsdWUoJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyksXG4gICAgICAgICAgICBtaW5Vbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWluVW5pdFByaWNlJyksXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJylcbiAgICAgICAgfSksXG4gICAgICAgIGdldFZhbHVlOiBrZXkgPT4gR01fZ2V0VmFsdWUoa2V5KSxcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxuXG4gICAgICAgIC8vIEdyaWQgZXhwb3J0ZXJzXG4gICAgICAgIGdyaWQ6ICh7IHBsYWluID0gdHJ1ZSB9ID0ge30pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBnZXRHcmlkUm93cygpO1xuICAgICAgICAgICAgcmV0dXJuIHBsYWluID8gcm93cy5tYXAocGxhaW5Sb3cpIDogcm93cztcbiAgICAgICAgfSxcbiAgICAgICAgZ3JpZFRhYmxlOiAoKSA9PiBjb25zb2xlLnRhYmxlPy4odW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpLFxuXG4gICAgICAgIC8vIENTVi9KU09OIGRvd25sb2FkZXJzXG4gICAgICAgIGRvd25sb2FkR3JpZEpTT046IChmaWxlbmFtZSA9ICdxdC1ncmlkLmpzb24nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSksIG51bGwsIDIpO1xuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSkpO1xuICAgICAgICB9LFxuICAgICAgICBkb3dubG9hZEdyaWRDU1Y6IChmaWxlbmFtZSA9ICdxdC1ncmlkLmNzdicpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNzdiA9IHRvQ1NWKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbY3N2XSwgeyB0eXBlOiAndGV4dC9jc3YnIH0pKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBWYWxpZGF0aW9uIG9uLWRlbWFuZCAoc2FtZSBlbmdpbmUgYXMgdGhlIGJ1dHRvbilcbiAgICAgICAgdmFsaWRhdGVOb3c6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgcnVuVmFsaWRhdGlvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2VuZ2luZS5qcycpOyAvLyBzYW1lIG1vZHVsZSB1c2VkIGJ5IHRoZSBodWIgYnV0dG9uXG4gICAgICAgICAgICBjb25zdCB7IGdldFNldHRpbmdzIH0gPSBhd2FpdCBpbXBvcnQoJy4vaW5kZXguanMnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgZ2V0U2V0dGluZ3MoKSk7XG4gICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4ocmVzLmlzc3VlcyB8fCBbXSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFF1aWNrIGV4cGVjdGF0aW9uIGhlbHBlcjogXHUyMDFDc2hvdyBtZSByb3dzIGFib3ZlIG1heFx1MjAxRFxuICAgICAgICBleHBlY3RVbmRlck1heDogKG1heCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1heCk7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA+IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHVuZGVyTWluOiAobWluKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWluKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiByb3dzXG4gICAgICAgICAgICAgICAgLm1hcChyID0+ICh7IC4uLnIsIF9Vbml0TnVtOiB0b051bShyLlJ2Q3VzdG9taXplZFVuaXRQcmljZSA/PyByLlJ2VW5pdFByaWNlQ29weSA/PyByLlVuaXRQcmljZSkgfSkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtIDwgc2V0KVxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XG4gICAgICAgIH0sXG5cbiAgICB9O1xufVxuXG5cbi8vIEVuc3VyZSB0aGUgc2V0dGluZ3MgVUkgbG9hZHMgKGdlYXIgYnV0dG9uLCBzdG9yYWdlIEFQSSlcbmltcG9ydCAnLi9pbmRleC5qcyc7XG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcbmltcG9ydCB7IG1vdW50VmFsaWRhdGlvbkJ1dHRvbiB9IGZyb20gJy4vaW5qZWN0QnV0dG9uLmpzJztcblxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcblxuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcblxuZnVuY3Rpb24gaXNXaXphcmQoKSB7XG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xuICAgIHJldHVybiBST1VURVMuc29tZShyZSA9PiByZS50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSk7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xufVxuXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcbiAgICByZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHNob3cgb24gYWxsIHBhZ2VzXG4gICAgLy9yZXR1cm4gL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xuICAgIGlmICghaXNXaXphcmQoKSkgcmV0dXJuIHVubW91bnQoKTtcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xuICAgICAgICBpZiAoIXVubW91bnRCdG4pIHVubW91bnRCdG4gPSBhd2FpdCBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5tb3VudCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5tb3VudCgpIHsgaWYgKHVubW91bnRCdG4pIHsgdW5tb3VudEJ0bigpOyB1bm1vdW50QnRuID0gbnVsbDsgfSB9XG5cbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcbnJlY29uY2lsZSgpO1xuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihyZWNvbmNpbGUpO1xud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xuY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xuaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb25jaWxlKS5vYnNlcnZlKG5hdiwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG5cbiIsICIvLyBBZGRzIGEgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIGFuZCB3aXJlcyBpdCB0byB0aGUgZW5naW5lLlxuLy8gQXNzdW1lcyB5b3VyIHNldHRpbmdzIFVJIGV4cG9ydHMgZ2V0U2V0dGluZ3Mvb25TZXR0aW5nc0NoYW5nZS5cblxuaW1wb3J0IHsgcnVuVmFsaWRhdGlvbiB9IGZyb20gJy4vZW5naW5lJztcbmltcG9ydCB7IGdldFNldHRpbmdzLCBvblNldHRpbmdzQ2hhbmdlIH0gZnJvbSAnLi9pbmRleCc7XG5cbi8vIC0tLSBLTyBzdXJmYWNlIChxdDMwIHBhdHRlcm4pIC0tLVxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcblxuLy8gLS0tIHN1bW1hcml6ZSBpc3N1ZXMgZm9yIHN0YXR1cyBwaWxsIC8gdG9hc3RzIC0tLVxuZnVuY3Rpb24gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuaXNBcnJheShpc3N1ZXMpID8gaXNzdWVzIDogW107XG4gICAgICAgIGNvbnN0IGFnZyA9IGl0ZW1zLnJlZHVjZSgoYWNjLCBpdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbHZsID0gU3RyaW5nKGl0Py5sZXZlbCB8fCAnaW5mbycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBhY2NbbHZsXSA9IChhY2NbbHZsXSB8fCAwKSArIDE7XG4gICAgICAgICAgICBpZiAoaXQ/LnF1b3RlUGFydEtleSAhPSBudWxsKSBhY2MucGFydHMuYWRkKGl0LnF1b3RlUGFydEtleSk7XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCB7IGVycm9yOiAwLCB3YXJuaW5nOiAwLCBpbmZvOiAwLCBwYXJ0czogbmV3IFNldCgpIH0pO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzQ291bnQgPSBhZ2cucGFydHMuc2l6ZTtcbiAgICAgICAgY29uc3Qgc2VncyA9IFtdO1xuICAgICAgICBpZiAoYWdnLmVycm9yKSBzZWdzLnB1c2goYCR7YWdnLmVycm9yfSBlcnJvciR7YWdnLmVycm9yID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICAgIGlmIChhZ2cud2FybmluZykgc2Vncy5wdXNoKGAke2FnZy53YXJuaW5nfSB3YXJuaW5nJHthZ2cud2FybmluZyA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLmluZm8pIHNlZ3MucHVzaChgJHthZ2cuaW5mb30gaW5mb2ApO1xuICAgICAgICBjb25zdCBsZXZlbFBhcnQgPSBzZWdzLmpvaW4oJywgJykgfHwgJ3VwZGF0ZXMnO1xuXG4gICAgICAgIHJldHVybiBgJHtsZXZlbFBhcnR9IGFjcm9zcyAke3BhcnRzQ291bnQgfHwgMH0gcGFydCR7cGFydHNDb3VudCA9PT0gMSA/ICcnIDogJ3MnfWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG59XG5cbi8vIC0tLSBRVDMwLXN0eWxlIGdyaWQgcmVmcmVzaCAoY29waWVkKSAtLS1cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ3JpZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXG4gICAgICAgICAgICByZXR1cm4gJ2RzLnJlYWQnO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBncmlkVk0ucmVmcmVzaCgpOyAgICAgICAgICAgICAgICAgIC8vIHN5bmMgdmlzdWFsIHJlZnJlc2hcbiAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBhY3RpdmUgcGFnZSAocmViaW5kKVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdz8ucGxleD8uY3VycmVudFBhZ2U/LlF1b3RlV2l6YXJkO1xuICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9ICh0eXBlb2Ygd2l6LmFjdGl2ZVBhZ2UgPT09ICdmdW5jdGlvbicpID8gd2l6LmFjdGl2ZVBhZ2UoKSA6IHdpei5hY3RpdmVQYWdlO1xuICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZShhY3RpdmUpO1xuICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblxuICAgIHJldHVybiBudWxsO1xufVxuXG5cblxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcblxuYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGVuc3VyZSA9ICh3aW5kb3cuZW5zdXJlTFRIdWIgfHwgdW5zYWZlV2luZG93Py5lbnN1cmVMVEh1Yik7XG4gICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMgPSBbXSkge1xuICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcblxuICAgIC8vIGVsZW1lbnRzXG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG92ZXJsYXkuaWQgPSAncXR2LW1vZGFsLW92ZXJsYXknO1xuICAgIE9iamVjdC5hc3NpZ24ob3ZlcmxheS5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJyxcbiAgICAgICAgaW5zZXQ6IDAsXG4gICAgICAgIGJhY2tncm91bmQ6ICd2YXIoLS1sdC1vdmVybGF5LCByZ2JhKDAsMCwwLC4zNikpJyxcbiAgICAgICAgekluZGV4OiAxMDAwMDJcbiAgICB9KTtcblxuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9kYWwuaWQgPSAncXR2LW1vZGFsJztcbiAgICBtb2RhbC5jbGFzc05hbWUgPSAnbHQtY2FyZCc7XG4gICAgT2JqZWN0LmFzc2lnbihtb2RhbC5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnNTAlJyxcbiAgICAgICAgbGVmdDogJzUwJScsXG4gICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLC01MCUpJyxcbiAgICAgICAgd2lkdGg6ICdtaW4oOTAwcHgsIDkydncpJ1xuICAgIH0pO1xuXG4gICAgLy8gYnVpbGQgcm93cyAoUGxleC1saWtlOiBzb3J0ICsgc3VwcHJlc3MgcmVwZWF0aW5nIFNvcnQvUGFydC9SdWxlIGRpc3BsYXkpXG4gICAgY29uc3Qgc29ydGVkID0gWy4uLmlzc3Vlc10uc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBzb0EgPSAoYS5zb3J0T3JkZXIgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKTtcbiAgICAgICAgY29uc3Qgc29CID0gKGIuc29ydE9yZGVyID8/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSk7XG4gICAgICAgIGlmIChzb0EgIT09IHNvQikgcmV0dXJuIHNvQSAtIHNvQjtcbiAgICAgICAgY29uc3QgcG5BID0gU3RyaW5nKGEucGFydE5vID8/ICcnKTtcbiAgICAgICAgY29uc3QgcG5CID0gU3RyaW5nKGIucGFydE5vID8/ICcnKTtcbiAgICAgICAgaWYgKHBuQSAhPT0gcG5CKSByZXR1cm4gcG5BLmxvY2FsZUNvbXBhcmUocG5CKTtcbiAgICAgICAgY29uc3QgcmxBID0gU3RyaW5nKGEucnVsZUxhYmVsID8/IGEua2luZCA/PyAnJyk7XG4gICAgICAgIGNvbnN0IHJsQiA9IFN0cmluZyhiLnJ1bGVMYWJlbCA/PyBiLmtpbmQgPz8gJycpO1xuICAgICAgICByZXR1cm4gcmxBLmxvY2FsZUNvbXBhcmUocmxCKTtcbiAgICB9KTtcblxuICAgIGxldCBwcmV2U29ydCA9IG51bGwsIHByZXZQYXJ0ID0gbnVsbCwgcHJldlJ1bGUgPSBudWxsO1xuICAgIGNvbnN0IHJvd3NIdG1sID0gc29ydGVkLm1hcChpc3MgPT4ge1xuICAgICAgICBjb25zdCBsdmwgPSAoaXNzLmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBsdmxDbGFzcyA9IChsdmwgPT09ICdlcnJvcicpID8gJ3F0di1waWxsLS1lcnJvcicgOiAobHZsID09PSAnd2FybicgfHwgbHZsID09PSAnd2FybmluZycpID8gJ3F0di1waWxsLS13YXJuJyA6ICdxdHYtcGlsbC0taW5mbyc7XG4gICAgICAgIGNvbnN0IGx2bFBpbGwgPSBgPHNwYW4gY2xhc3M9XCJxdHYtcGlsbCAke2x2bENsYXNzfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcbiAgICAgICAgY29uc3QgcmVhc29uID0gaXNzLm1lc3NhZ2UgfHwgJyhubyBtZXNzYWdlKSc7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBTdHJpbmcoaXNzLnJ1bGVMYWJlbCB8fCBpc3Mua2luZCB8fCAnVmFsaWRhdGlvbicpO1xuXG4gICAgICAgIC8vIFN1cHByZXNzIHJlcGVhdHMgaW4gdmlzdWFsIHRhYmxlIGNlbGxzXG4gICAgICAgIGNvbnN0IHNob3dTb3J0ID0gKGlzcy5zb3J0T3JkZXIgIT09IHByZXZTb3J0KSA/IChpc3Muc29ydE9yZGVyID8/ICcnKSA6ICcnO1xuICAgICAgICBjb25zdCBzaG93UGFydCA9IChzaG93U29ydCAhPT0gJycgfHwgKGlzcy5wYXJ0Tm8gIT09IHByZXZQYXJ0KSkgPyAoaXNzLnBhcnRObyA/PyAnJykgOiAnJztcbiAgICAgICAgY29uc3Qgc2FtZUdyb3VwQXNQcmV2ID0gKHNob3dTb3J0ID09PSAnJyAmJiBzaG93UGFydCA9PT0gJycpO1xuICAgICAgICBjb25zdCBzaG93UnVsZSA9ICghc2FtZUdyb3VwQXNQcmV2IHx8IHJ1bGUgIT09IHByZXZSdWxlKSA/IHJ1bGUgOiAnJztcblxuICAgICAgICBwcmV2U29ydCA9IGlzcy5zb3J0T3JkZXI7XG4gICAgICAgIHByZXZQYXJ0ID0gaXNzLnBhcnRObztcbiAgICAgICAgcHJldlJ1bGUgPSBydWxlO1xuXG4gICAgICAgIHJldHVybiBgXG4gIDx0ciBkYXRhLXFwaz1cIiR7aXNzLnF1b3RlUGFydEtleSA/PyAnJ31cIiBkYXRhLXJ1bGU9XCIke1N0cmluZyhpc3Mua2luZCB8fCAnJyl9XCI+XG4gICAgPHRkPiR7c2hvd1NvcnR9PC90ZD5cbiAgICA8dGQ+JHtzaG93UGFydH08L3RkPlxuICAgIDx0ZD4ke3Nob3dSdWxlfTwvdGQ+XG4gICAgPHRkPiR7bHZsUGlsbH08L3RkPlxuICAgIDx0ZD4ke3JlYXNvbn08L3RkPlxuICA8L3RyPmA7XG4gICAgfSkuam9pbignJyk7XG5cblxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcbiAgPGRpdiBjbGFzcz1cInF0di1oZCBsdC1jYXJkX19oZWFkZXJcIj5cbiAgICA8aDMgY2xhc3M9XCJsdC1jYXJkX190aXRsZVwiPlZhbGlkYXRpb24gRGV0YWlsczwvaDM+XG4gICAgPGRpdiBjbGFzcz1cInF0di1hY3Rpb25zIGx0LWNhcmRfX3NwYWNlclwiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImx0LWJ0biBsdC1idG4tLWdob3N0XCIgaWQ9XCJxdHYtZXhwb3J0LWNzdlwiIHRpdGxlPVwiRXhwb3J0IHZpc2libGUgaXNzdWVzIHRvIENTVlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJsdC1idG4gbHQtYnRuLS1wcmltYXJ5XCIgaWQ9XCJxdHYtY2xvc2VcIj5DbG9zZTwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbiAgPGRpdiBjbGFzcz1cInF0di1iZCBsdC1jYXJkX19ib2R5XCI+XG4gICAgPHRhYmxlIGNsYXNzPVwibHQtdGFibGVcIiBhcmlhLWxhYmVsPVwiVmFsaWRhdGlvbiBJc3N1ZXNcIj5cbiAgICAgIDx0aGVhZD5cbiAgICAgICAgPHRyPlxuICAgICAgICAgIDx0aD5Tb3J0Jm5ic3A7T3JkZXI8L3RoPlxuICAgICAgICAgIDx0aD5QYXJ0ICM8L3RoPlxuICAgICAgICAgIDx0aD5SdWxlPC90aD5cbiAgICAgICAgICA8dGg+TGV2ZWw8L3RoPlxuICAgICAgICAgIDx0aD5SZWFzb248L3RoPlxuICAgICAgICA8L3RyPlxuICAgICAgPC90aGVhZD5cbiAgICAgIDx0Ym9keT4ke3Jvd3NIdG1sIHx8IGA8dHI+PHRkIGNvbHNwYW49XCI1XCIgc3R5bGU9XCJvcGFjaXR5Oi43OyBwYWRkaW5nOjEycHg7XCI+Tm8gaXNzdWVzLjwvdGQ+PC90cj5gfTwvdGJvZHk+XG4gICAgPC90YWJsZT5cbiAgPC9kaXY+XG5gO1xuXG5cbiAgICAvLyBpbnRlcmFjdGlvbnNcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBjbGljayByb3cgdG8gZm9jdXMgKyBoaWdobGlnaHQgKyBzY3JvbGxcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCd0Ym9keScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTsgaWYgKCF0cikgcmV0dXJuO1xuICAgICAgICBjb25zdCBxcGsgPSB0ci5nZXRBdHRyaWJ1dGUoJ2RhdGEtcXBrJyk7XG4gICAgICAgIGlmICghcXBrKSByZXR1cm47XG4gICAgICAgIC8vIGVuc3VyZSBoaWdobGlnaHRzIGV4aXN0LCB0aGVuIGp1bXBcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XG4gICAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBleHBvcnQgQ1NWXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQtY3N2Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBjc3YgPSBbXG4gICAgICAgICAgICBbJ0xpbmUnLCAnU29ydE9yZGVyJywgJ1BhcnRObycsICdRdW90ZVBhcnRLZXknLCAnUnVsZScsICdMZXZlbCcsICdSZWFzb24nXS5qb2luKCcsJyksXG4gICAgICAgICAgICAuLi5pc3N1ZXMubWFwKGkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodiA/PyAnJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAvW1wiLFxcbl0vLnRlc3QocykgPyBgXCIke3MucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImAgOiBzO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgICAgaS5saW5lTnVtYmVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnNvcnRPcmRlciA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5wYXJ0Tm8gPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucXVvdGVQYXJ0S2V5ID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnJ1bGVMYWJlbCB8fCBpLmtpbmQgfHwgJ1ZhbGlkYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICBpLmxldmVsIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLm1lc3NhZ2UgfHwgJydcbiAgICAgICAgICAgICAgICBdLm1hcChlc2MpLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF0uam9pbignXFxuJyk7XG5cbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9ICdxdC12YWxpZGF0aW9uLWlzc3Vlcy5jc3YnOyBhLmNsaWNrKCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICB9KTtcblxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQobW9kYWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG4gICAgdHJ5IHsgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7IG92ZXJsYXkuZm9jdXMoKTsgfSBjYXRjaCB7IH1cbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4geyBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcblxufVxuXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscykge1xuICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiAnbmF2JyB9KTtcbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybiAoKSA9PiB7IH07XG5cbiAgICAvLyBhdm9pZCBkdXBsaWNhdGVcbiAgICBpZiAoaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhIVUJfQlROX0lEKSkgcmV0dXJuICgpID0+IHsgfTtcblxuICAgIGxldCBidG5FbCA9IG51bGw7XG4gICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgbGFiZWw6ICdWYWxpZGF0ZSBMaW5lcycsXG4gICAgICAgIHRpdGxlOiAnVmFsaWRhdGUgcXVvdGUgbGluZSBydWxlcycsXG4gICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgIG9uQ2xpY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaz8uKCdWYWxpZGF0aW5nXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgb2xkIGhpZ2hsaWdodHMgYW5kIGVuc3VyZSBzdHlsZXMgYXJlIHByZXNlbnQgdXAtZnJvbnRcbiAgICAgICAgICAgICAgICBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCk7XG4gICAgICAgICAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncyk7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XG4gICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBpc3N1ZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gQXV0by1oaWdobGlnaHQgYWxsIGVycm9yIHJvd3MgaW1tZWRpYXRlbHkgKGJlZm9yZSBtb2RhbClcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGlzcyBvZiBpc3N1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IGlzcz8ucXVvdGVQYXJ0S2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFxcGspIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyb3cpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZSA9ICdxdHYtcm93LWZhaWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NGb3JJc3N1ZShpc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoYmFzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xzKSByb3cuY2xhc3NMaXN0LmFkZChjbHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oJ0xpbmVzIHZhbGlkJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oJ0FsbCBjbGVhcicsICdzdWNjZXNzJywgeyBzdGlja3k6IGZhbHNlIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oMCk7XG4gICAgICAgICAgICAgICAgICAgIHRhc2suZG9uZT8uKCdWYWxpZCcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRhbGx5IG91dGNvbWVzIChoYW5kbGVzIG1pc3NpbmcgbGV2ZWwgZ3JhY2VmdWxseSlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGV2ZWxzID0gaXNzdWVzLm1hcChpID0+IFN0cmluZyhpPy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0Vycm9yID0gbGV2ZWxzLnNvbWUobCA9PiBsID09PSAnZXJyb3InIHx8IGwgPT09ICdmYWlsJyB8fCBsID09PSAnY3JpdGljYWwnKVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgaXNzdWVzLnNvbWUoaSA9PiAvcHJpY2VcXC4oPzptYXh1bml0cHJpY2V8bWludW5pdHByaWNlKS9pLnRlc3QoU3RyaW5nKGk/LmtpbmQgfHwgJycpKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1dhcm4gPSAhaGFzRXJyb3IgJiYgbGV2ZWxzLnNvbWUobCA9PiBsID09PSAnd2FybicgfHwgbCA9PT0gJ3dhcm5pbmcnKTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdW1tYXJ5ID0gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gR3VhcmQgdG8gZW5zdXJlIFVJIHByb2JsZW1zIG5ldmVyIGJsb2NrIHRoZSBtb2RhbFxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oYFxcdTI3NEMgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ2lzc3VlJyA6ICdpc3N1ZXMnfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNzRDICR7Y291bnR9IGlzc3VlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdlcnJvcicsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhc1dhcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXFx1MjZBMFxcdUZFMEYgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ3dhcm5pbmcnIDogJ3dhcm5pbmdzJ31gLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNkEwXFx1RkUwRiAke2NvdW50fSB3YXJuaW5nJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICd3YXJuJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mby1vbmx5IHVwZGF0ZXMgKGUuZy4sIGF1dG8tbWFuYWdlIHBvc3RzIHdpdGggbGV2ZWw9aW5mbylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBhcHBsaWVkYCwgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdpbmZvJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5ldmVyIGJsb2NrIHRoZSBtb2RhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHNob3cgdGhlIGRldGFpbHMgd2hlbiBjb3VudCA+IDBcbiAgICAgICAgICAgICAgICAgICAgc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGF1dG9NYW5hZ2UgYWN0dWFsbHkgY2hhbmdlZCBQYXJ0X05vIChsZXZlbD13YXJuaW5nKSwgcmVmcmVzaCB0aGUgZ3JpZCAocXQzMCBwYXR0ZXJuKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZWVkc1JlZnJlc2ggPSBpc3N1ZXMuc29tZShpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ua2luZCB8fCAnJykuaW5jbHVkZXMoJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnd2FybmluZycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGk/Lm1ldGE/LmNoYW5nZWQgPT09IHRydWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobmVlZHNSZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/IGBHcmlkIHJlZnJlc2hlZCAoJHttb2RlfSlgIDogJ0dyaWQgcmVmcmVzaCBhdHRlbXB0ZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyAnc3VjY2VzcycgOiAnaW5mbydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LignR3JpZCByZWZyZXNoIGZhaWxlZCcsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignQ2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNhY2hlIGxhc3Qgc3RhdHVzIGZvciBTUEEgcmVkcmF3c1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSByZXM7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLmVycm9yPy4oYFZhbGlkYXRpb24gZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA2MDAwIH0pO1xuICAgICAgICAgICAgICAgIHRhc2suZXJyb3I/LignRXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gR3JhYiBiYWNrIHRoZSByZWFsIERPTSBidXR0b24gdG8gdXBkYXRlIHRpdGxlIGxhdGVyXG4gICAgYnRuRWwgPSBodWIuX3NoYWRvdz8ucXVlcnlTZWxlY3Rvcj8uKGBbZGF0YS1pZD1cIiR7SFVCX0JUTl9JRH1cIl1gKTtcblxuICAgIGNvbnN0IG9mZlNldHRpbmdzID0gb25TZXR0aW5nc0NoYW5nZT8uKCgpID0+IHJlZnJlc2hMYWJlbChidG5FbCkpO1xuICAgIHJlZnJlc2hMYWJlbChidG5FbCk7XG5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBvZmZTZXR0aW5ncz8uKCk7XG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaExhYmVsKGJ0bikge1xuICAgIGlmICghYnRuKSByZXR1cm47XG4gICAgY29uc3QgcyA9IGdldFNldHRpbmdzKCk7XG4gICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICAvL2lmIChzLnJlcXVpcmVSZXNvbHZlZFBhcnQpIHBhcnRzLnB1c2goJ1BhcnQnKTtcbiAgICAvL2lmIChzLmZvcmJpZFplcm9QcmljZSkgcGFydHMucHVzaCgnXHUyMjYwJDAnKTtcbiAgICBpZiAocy5taW5Vbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY1JHtzLm1pblVuaXRQcmljZX1gKTtcbiAgICBpZiAocy5tYXhVbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY0JHtzLm1heFVuaXRQcmljZX1gKTtcbiAgICBidG4udGl0bGUgPSBgUnVsZXM6ICR7cGFydHMuam9pbignLCAnKSB8fCAnbm9uZSd9YDtcbn1cblxuZnVuY3Rpb24gZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpIHtcbiAgICAvLyBJZiB0aGUgZ2xvYmFsIHRoZW1lIHByb3ZpZGVzIC5xdHYtKiBzdHlsZXMsIGRvIG5vdGhpbmcuXG4gICAgY29uc3QgaGFzVGhlbWVRdHYgPSAoKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdGVzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgdGVzdC5jbGFzc05hbWUgPSAncXR2LXBpbGwnO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0ZXN0KTtcbiAgICAgICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZSh0ZXN0KTtcbiAgICAgICAgICAgIGNvbnN0IG9rID0gISFjcyAmJiAoY3MuYm9yZGVyUmFkaXVzIHx8ICcnKS5pbmNsdWRlcygnOTk5cHgnKTtcbiAgICAgICAgICAgIHRlc3QucmVtb3ZlKCk7XG4gICAgICAgICAgICByZXR1cm4gb2s7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICB9KSgpO1xuXG4gICAgaWYgKGhhc1RoZW1lUXR2KSByZXR1cm47XG5cbiAgICAvLyBGYWxsYmFjayBzaGltIChrZXB0IHRpbnkpOiBoaWdobGlnaHQgb25seTsgbW9kYWwvdGFibGUgc3R5bGVzIHdpbGwgc3RpbGwgYmUgc2V0IGlubGluZS5cbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3F0di1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS5pZCA9ICdxdHYtc3R5bGVzJztcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbi8qIE1pbmltYWwgc2NhZmZvbGRpbmcgd2hlbiB0aGVtZS5jc3MgaXNuJ3QgcmVhZHkgKi9cbiNxdHYtbW9kYWwtb3ZlcmxheSB7IHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjM2KTsgei1pbmRleDogMTAwMDAyOyB9XG4jcXR2LW1vZGFsIHtcbiAgLyogTG9jYWwgTW9ucm9lIHBhbGV0dGUgKGluZGVwZW5kZW50IG9mIHBhZ2UgdG9rZW5zKSAqL1xuICAtLWJyYW5kLTYwMDogIzhiMGIwNDtcbiAgLS1icmFuZC03MDA6ICM1YzBhMGE7XG4gIC0tb2s6ICMyOGE3NDU7XG4gIC0td2FybjogI2ZmYzEwNztcbiAgLS1lcnI6ICNkYzM1NDU7XG5cbiAgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDUwJTsgbGVmdDogNTAlOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLC01MCUpOyB3aWR0aDogbWluKDkwMHB4LDkydncpO1xufVxuXG4ubHQtY2FyZCB7IGJhY2tncm91bmQ6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDEycHg7IGJveC1zaGFkb3c6IDAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjMwKTsgb3ZlcmZsb3c6IGhpZGRlbjsgfVxuLmx0LWNhcmRfX2hlYWRlciB7IGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjsgcGFkZGluZzogMTJweCAxNnB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgwLDAsMCwuMDgpOyB9XG4ubHQtY2FyZF9fdGl0bGUgeyBtYXJnaW46IDA7IGZvbnQ6IDYwMCAxNnB4LzEuMiBzeXN0ZW0tdWksIFNlZ29lIFVJLCBzYW5zLXNlcmlmOyB9XG4ubHQtY2FyZF9fc3BhY2VyIHsgbWFyZ2luLWxlZnQ6IGF1dG87IH1cbi5sdC1jYXJkX19ib2R5IHsgcGFkZGluZzogMTJweCAxNnB4OyBtYXgtaGVpZ2h0OiBtaW4oNzB2aCw2ODBweCk7IG92ZXJmbG93OiBhdXRvOyB9XG5cbi5sdC1idG4geyBkaXNwbGF5OmlubGluZS1mbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDo2cHg7IHBhZGRpbmc6NnB4IDEwcHg7IGJvcmRlcjoxcHggc29saWQgI2QxZDVkYjsgYm9yZGVyLXJhZGl1czo4cHg7IGJhY2tncm91bmQ6I2Y5ZmFmYjsgY3Vyc29yOnBvaW50ZXI7IH1cbi5sdC1idG4tLXByaW1hcnkgeyBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC02MDApOyBib3JkZXItY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDcwJSwgYmxhY2spOyBjb2xvcjojZmZmOyB9XG4ubHQtYnRuLS1wcmltYXJ5OmhvdmVyIHsgYmFja2dyb3VuZDogdmFyKC0tYnJhbmQtNzAwKTsgfVxuLmx0LWJ0bi0tZ2hvc3QgeyBiYWNrZ3JvdW5kOnRyYW5zcGFyZW50OyBjb2xvcjogdmFyKC0tYnJhbmQtNjAwKTsgYm9yZGVyLWNvbG9yOiB2YXIoLS1icmFuZC02MDApOyB9XG4ubHQtYnRuLS1naG9zdDpob3ZlciB7IGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1icmFuZC02MDApIDEyJSwgdHJhbnNwYXJlbnQpOyB9XG5cbi5sdC10YWJsZSB7IHdpZHRoOjEwMCU7IGJvcmRlci1jb2xsYXBzZTogc2VwYXJhdGU7IGJvcmRlci1zcGFjaW5nOiAwOyBmb250OiA0MDAgMTNweC8xLjM1IHN5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWY7IH1cbi5sdC10YWJsZSB0aCB7IHRleHQtYWxpZ246bGVmdDsgcGFkZGluZzo4cHggMTBweDsgYmFja2dyb3VuZDojZjNmNGY2OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZTVlN2ViOyBwb3NpdGlvbjpzdGlja3k7IHRvcDowOyB9XG4ubHQtdGFibGUgdGQgeyBwYWRkaW5nOjhweCAxMHB4OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZjFmNWY5OyB9XG4ubHQtdGFibGUgdGJvZHkgdHI6aG92ZXIgeyBiYWNrZ3JvdW5kOiNmOGZhZmM7IH1cblxuLnF0di1waWxsIHsgZGlzcGxheTppbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6NnB4OyBwYWRkaW5nOjNweCAxMHB4OyBib3JkZXItcmFkaXVzOjk5OXB4OyBmb250LXdlaWdodDo2MDA7IGZvbnQtc2l6ZToxMnB4OyBib3JkZXI6MXB4IHNvbGlkIHRyYW5zcGFyZW50OyB9XG4ucXR2LXBpbGwtLWVycm9yIHsgYmFja2dyb3VuZDojZGMyNjI2OyBjb2xvcjojZmZmOyB9XG4ucXR2LXBpbGwtLXdhcm4gIHsgYmFja2dyb3VuZDojZjU5ZTBiOyBjb2xvcjojMTExOyB9XG4ucXR2LXBpbGwtLWluZm8gIHsgYmFja2dyb3VuZDojM2I4MmY2OyBjb2xvcjojZmZmOyB9XG5cbi8qIFJvdyBoaWdobGlnaHRzICovXG4ucXR2LXJvdy1mYWlsIHsgb3V0bGluZTogMnB4IHNvbGlkIHJnYmEoMjIwLCAzOCwgMzgsIC44NSkgIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0ycHg7IH1cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NCwgMjI2LCAyMjYsIC42NSkgIWltcG9ydGFudDsgfVxuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjE5LCAyMzQsIDI1NCwgLjY1KSAhaW1wb3J0YW50OyB9XG5gO1xuXG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbn1cblxuXG4vLyBpbnNlcnQgYWJvdmUgZW5zdXJlUm93S2V5QXR0cmlidXRlcygpXG5mdW5jdGlvbiBnZXRPYnNWYWwodm0sIHByb3ApIHtcbiAgICB0cnkgeyBjb25zdCB2ID0gdm0/Lltwcm9wXTsgcmV0dXJuICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgPyB2KCkgOiB2OyB9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG4vKiogVGFnIHZpc2libGUgZ3JpZCByb3dzIHdpdGggZGF0YS1xdW90ZS1wYXJ0LWtleSBieSByZWFkaW5nIEtPIGNvbnRleHQgKi9cbmZ1bmN0aW9uIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSB7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBpZiAoIWdyaWQpIHJldHVybiAwO1xuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBsZXQgdGFnZ2VkID0gMDtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBpZiAoci5oYXNBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknKSkgeyB0YWdnZWQrKzsgY29udGludWU7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4ocik7XG4gICAgICAgICAgICBjb25zdCByb3dWTSA9IGN0eD8uJGRhdGEgPz8gY3R4Py4kcm9vdCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgcXBrID0gKHR5cGVvZiBUTVV0aWxzPy5nZXRPYnNWYWx1ZSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgICAgICAgICA/IFRNVXRpbHMuZ2V0T2JzVmFsdWUocm93Vk0sICdRdW90ZVBhcnRLZXknKVxuICAgICAgICAgICAgICAgIDogZ2V0T2JzVmFsKHJvd1ZNLCAnUXVvdGVQYXJ0S2V5Jyk7XG5cbiAgICAgICAgICAgIGlmIChxcGsgIT0gbnVsbCAmJiBxcGsgIT09ICcnICYmIE51bWJlcihxcGspID4gMCkge1xuICAgICAgICAgICAgICAgIHIuc2V0QXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JywgU3RyaW5nKHFwaykpO1xuICAgICAgICAgICAgICAgIHRhZ2dlZCsrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgcGVyLXJvdyBmYWlsdXJlcyAqLyB9XG4gICAgfVxuICAgIHJldHVybiB0YWdnZWQ7XG59XG5mdW5jdGlvbiBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCcpO1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBGYXN0IHBhdGg6IGF0dHJpYnV0ZSAocHJlZmVycmVkKVxuICAgIGxldCByb3cgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXF1b3RlLXBhcnQta2V5PVwiJHtDU1MuZXNjYXBlKFN0cmluZyhxcGspKX1cIl1gKTtcbiAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuXG4gICAgLy8gSWYgYXR0cmlidXRlcyBhcmUgbWlzc2luZywgdHJ5IHRvIHRhZyB0aGVtIG9uY2UgdGhlbiByZXRyeVxuICAgIGlmIChlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkgPiAwKSB7XG4gICAgICAgIHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgICAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuICAgIH1cblxuICAgIC8vIExhc3QgcmVzb3J0OiB0ZXh0dWFsIHNjYW4gKGxlc3MgcmVsaWFibGUsIGJ1dCB3b3JrcyB0b2RheSlcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xuICAgICk7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgY29uc3QgdHh0ID0gKHIudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKHR4dC5pbmNsdWRlcyhTdHJpbmcocXBrKSkpIHJldHVybiByO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY2xhc3NGb3JJc3N1ZShpc3MpIHtcbiAgICBjb25zdCBraW5kID0gU3RyaW5nKGlzcz8ua2luZCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoa2luZC5pbmNsdWRlcygncHJpY2UubWF4dW5pdHByaWNlJykpIHJldHVybiAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0JztcbiAgICBpZiAoa2luZC5pbmNsdWRlcygncHJpY2UubWludW5pdHByaWNlJykpIHJldHVybiAncXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0JztcbiAgICByZXR1cm4gJyc7XG59XG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XG5cblxuaWYgKERFVikge1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgPSAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHIHx8IHt9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcudGFnU3RhdHMgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIGNvbnN0IHJvd3MgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnKSA6IFtdO1xuICAgICAgICBjb25zdCB0YWdnZWQgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1xdW90ZS1wYXJ0LWtleV0nKSA6IFtdO1xuICAgICAgICBjb25zb2xlLmxvZygnW1FUVl0gcm93czonLCByb3dzLmxlbmd0aCwgJ3RhZ2dlZDonLCB0YWdnZWQubGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIHsgdG90YWw6IHJvd3MubGVuZ3RoLCB0YWdnZWQ6IHRhZ2dlZC5sZW5ndGggfTtcbiAgICB9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcuaGlsaVRlc3QgPSAocXBrKSA9PiB7XG4gICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcbiAgICAgICAgY29uc3QgciA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHIpIHsgci5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnLCAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7IHIuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgfVxuICAgICAgICBy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LEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsTUFFQSxVQUFVLENBQUMsUUFBUTtBQUNmLGNBQU0sTUFBTSxPQUFPLEdBQUc7QUFDdEIsY0FBTSxPQUFPLGFBQWEsVUFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDeEQsY0FBTSxRQUFRLENBQUMsTUFBTTtBQUNqQixjQUFJLEtBQUssS0FBTSxRQUFPO0FBQ3RCLGdCQUFNLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSztBQUN6QixpQkFBTyxPQUFPLEVBQUUsUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsZUFBTyxLQUNGLElBQUksUUFBTSxFQUFFLEdBQUcsR0FBRyxVQUFVLE1BQU0sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsSUFFSjtBQUFBLEVBQ0o7QUFRQSxXQUFTLEtBQUssZ0JBQWdCO0FBRTlCLE1BQU1DLFVBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsTUFBSSxhQUFhO0FBRWpCLFdBQVMsV0FBVztBQUNoQixRQUFJLFNBQVMsV0FBWSxRQUFPLENBQUMsQ0FBQyxRQUFRLFdBQVdBLE9BQU07QUFDM0QsV0FBT0EsUUFBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdkQ7QUFPQSxXQUFTLHVCQUF1QjtBQUM1QixXQUFPO0FBQUEsRUFFWDtBQUVBLGlCQUFlLFlBQVk7QUFDdkIsUUFBSSxDQUFDLFNBQVMsRUFBRyxRQUFPLFFBQVE7QUFDaEMsUUFBSSxxQkFBcUIsR0FBRztBQUN4QixVQUFJLENBQUMsV0FBWSxjQUFhLE1BQU0sc0JBQXNCLE9BQU87QUFBQSxJQUNyRSxPQUFPO0FBQ0gsY0FBUTtBQUFBLElBQ1o7QUFBQSxFQUNKO0FBRUEsV0FBUyxVQUFVO0FBQUUsUUFBSSxZQUFZO0FBQUUsaUJBQVc7QUFBRyxtQkFBYTtBQUFBLElBQU07QUFBQSxFQUFFO0FBRzFFLFlBQVU7QUFDVixXQUFTLGNBQWMsU0FBUztBQUNoQyxTQUFPLGlCQUFpQixjQUFjLFNBQVM7QUFDL0MsTUFBTSxNQUFNLFNBQVMsY0FBYyx3QkFBd0I7QUFDM0QsTUFBSSxJQUFLLEtBQUksaUJBQWlCLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDOyIsCiAgIm5hbWVzIjogWyJnZXRIdWIiLCAibHQiLCAiVE1VdGlscyIsICJLTyIsICJLTyIsICJUTVV0aWxzIiwgIkRFViIsICJERVYiLCAiS08iLCAicnVuVmFsaWRhdGlvbiIsICJnZXRTZXR0aW5ncyIsICJST1VURVMiXQp9Cg==
