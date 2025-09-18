// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.67
// @description  Gear + settings and a Validate Lines button on Quote Wizard Part Summary.
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=2.0.67-1758207939822
// @require      http://localhost:5000/lt-plex-auth.user.js?v=2.0.67-1758207939822
// @require      http://localhost:5000/lt-ui-hub.js?v=2.0.67-1758207939822
// @require      http://localhost:5000/lt-core.user.js?v=2.0.67-1758207939822
// @require      http://localhost:5000/lt-data-core.user.js?v=2.0.67-1758207939822
// @resource     THEME_CSS http://localhost:5000/theme.css
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
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

  // src/quote-tracking/qt50/index.js
  var index_exports = {};
  __export(index_exports, {
    KEYS: () => KEYS,
    getSettings: () => getSettings,
    onSettingsChange: () => onSettingsChange
  });
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
    const onTarget = onWizard && (document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent || "").trim().toLowerCase() === CONFIG.wizardTargetPage.toLowerCase();
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
      background: "rgba(0,0,0,.35)",
      zIndex: 100002
    });
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      background: "#fff",
      padding: "18px",
      borderRadius: "12px",
      boxShadow: "0 10px 30px rgba(0,0,0,.30)",
      fontFamily: "system-ui, Segoe UI, sans-serif",
      width: "420px",
      maxWidth: "92vw"
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
      Auto-manage Lyn-Tron Part No when Part status is \u201CQuote\u201D.
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
      <button id="qtv-export" class="btn btn-default">Export</button>
      <label class="btn btn-default">Import <input id="qtv-import" type="file" accept="application/json" style="display:none;"></label>
      <span style="flex:1"></span>
      <button id="qtv-reset" class="btn btn-default" style="border-color:#f59e0b; color:#b45309;">Reset</button>
      <button id="qtv-close" class="btn btn-primary" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
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
    panel.querySelector("#qtv-close")?.addEventListener("click", () => overlay.remove());
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
    panel.querySelector("#qtv-import")?.addEventListener("change", async (ev) => {
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
  var DEV, CONFIG, KO, ROUTES, ON_ROUTE, KEYS, DEF, getVal, setVal;
  var init_index = __esm({
    "src/quote-tracking/qt50/index.js"() {
      DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
      CONFIG = {
        wizardTargetPage: "Part Summary",
        settingsKey: "qt50_settings_v1",
        toastMs: 3500
      };
      KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
      ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
      ON_ROUTE = !!TMUtils.matchRoute?.(ROUTES);
      if (DEV && !ON_ROUTE) console.debug("QT50: wrong route, skipping bootstrap");
      KEYS = {
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
        const v = GM_getValue(k, DEF[k]);
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

  // src/quote-tracking/qt50/rules/autoManageLtPartNoOnQuote.js
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
        if (status !== "Quote") continue;
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
            message: `No change: Part_No already managed".`,
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO }
          });
          continue;
        }
        const partNoForPost = `${desiredPrefix}${vmPartNo}`;
        const body = {
          Quote_Key: String(vmQuoteKey ?? ""),
          Part_Key: String(vmPartKey ?? ""),
          Part_No: String(partNoForPost ?? ""),
          Name: "auto managed",
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
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO }
          });
        } catch (err) {
          issues.push({
            kind: "part.autoManageLtPartNoOnQuote",
            level: "warning",
            quotePartKey: qpk,
            message: `DS ${DS_MANAGE_PARTNO} failed: ${err?.message || err}`,
            meta: { status: "Quote", quoteKey: vmQuoteKey, partKey: vmPartKey, partNo: vmPartNo, ds: DS_MANAGE_PARTNO }
          });
        }
      }
    }
    return issues;
  }
  var init_autoManageLtPartNoOnQuote = __esm({
    "src/quote-tracking/qt50/rules/autoManageLtPartNoOnQuote.js"() {
      autoManageLtPartNoOnQuote.meta = { id: "autoManageLtPartNoOnQuote", label: "Auto-Manage LT Part No" };
    }
  });

  // src/quote-tracking/qt50/rules/minUnitPrice.js
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
        if (Number.isFinite(num) && num < min) {
          const fmt = (n) => Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(n);
          issues.push({
            kind: "price.minUnitPrice",
            level: "error",
            quotePartKey: qp,
            message: `Unit Price ${fmt(num)} < Min ${fmt(min)}`,
            meta: { unitRaw: raw, unitNum: num, min }
          });
        }
      }
    }
    return issues;
  }
  var init_minUnitPrice = __esm({
    "src/quote-tracking/qt50/rules/minUnitPrice.js"() {
      minUnitPrice.meta = { id: "minUnitPrice", label: "Min Unit Price" };
    }
  });

  // src/quote-tracking/qt50/rules/maxUnitPrice.js
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
        if (Number.isFinite(num) && num > max) {
          const fmt = (n) => Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(n);
          issues.push({
            kind: "price.maxUnitPrice",
            level: "error",
            quotePartKey: qp,
            message: `Unit Price ${fmt(num)} > Max ${fmt(max)}`,
            meta: { unitRaw: raw, unitNum: num, max }
          });
        }
      }
    }
    return issues;
  }
  var init_maxUnitPrice = __esm({
    "src/quote-tracking/qt50/rules/maxUnitPrice.js"() {
      maxUnitPrice.meta = { id: "maxUnitPrice", label: "Max Unit Price" };
    }
  });

  // src/quote-tracking/qt50/rules/index.js
  var rules_default;
  var init_rules = __esm({
    "src/quote-tracking/qt50/rules/index.js"() {
      init_autoManageLtPartNoOnQuote();
      init_minUnitPrice();
      init_maxUnitPrice();
      rules_default = [autoManageLtPartNoOnQuote, maxUnitPrice, minUnitPrice];
    }
  });

  // src/quote-tracking/qt50/engine.js
  var engine_exports = {};
  __export(engine_exports, {
    runValidation: () => runValidation
  });
  async function runValidation(TMUtils2, settings) {
    await TMUtils2.waitForModelAsync(".plex-grid", { requireKo: true, timeoutMs: 12e3 });
    const KO3 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const grid = document.querySelector(".plex-grid");
    const gvm = grid ? KO3?.dataFor?.(grid) : null;
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
    "src/quote-tracking/qt50/engine.js"() {
      init_rules();
    }
  });

  // src/quote-tracking/qt50/qtv.entry.js
  init_index();

  // src/quote-tracking/qt50/injectButton.js
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
    const rowsHtml = issues.map((iss) => {
      const lvl = (iss.level || "").toLowerCase();
      const lvlPill = `<span class="qtv-pill" style="border-color:${lvl === "error" ? "#fca5a5" : "#cbd5e1"}; color:${lvl === "error" ? "#b91c1c" : "#334155"}">${lvl || "info"}</span>`;
      const reason = iss.message || "(no message)";
      const rule = iss.ruleLabel || iss.kind || "Validation";
      return `
        <tr data-qpk="${iss.quotePartKey ?? ""}" data-rule="${String(iss.kind || "")}">
          <td>${iss.sortOrder ?? ""}</td>
          <td>${iss.partNo ?? ""}</td>
          <td>${rule}</td>
          <td>${lvlPill}</td>
          <td>${reason}</td>
        </tr>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.id = "qtv-modal-overlay";
    const modal = document.createElement("div");
    modal.id = "qtv-modal";
    modal.innerHTML = `
  <div class="qtv-hd">
    <h3>Validation Details</h3>
    <div class="qtv-actions">
      <button class="btn btn-default" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="btn btn-primary" id="qtv-close" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
    </div>
  </div>
  <div class="qtv-bd">
    <table aria-label="Validation Issues">
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
          const res = await runValidation(TMUtils2, settings);
          const issues = Array.isArray(res?.issues) ? res.issues : [];
          const count = issues.length;
          const hasError = issues.some((i) => String(i.level || "").toLowerCase() === "error");
          if (count === 0) {
            lt.core.hub.notify?.("\u2705 Lines valid", "success", { ms: 1800 });
            task.done?.("Valid");
          } else {
            const summary = buildIssuesSummary(issues);
            if (hasError) {
              lt.core.hub.notify?.(
                `\u274C ${count} validation ${count === 1 ? "issue" : "issues"}`,
                "error",
                { ms: 6500 }
              );
              lt.core.hub.setStatus?.(
                `\u274C ${count} issue${count === 1 ? "" : "s"} \u2014 ${summary}`,
                "error",
                { sticky: true }
              );
            } else {
              lt.core.hub.notify?.(
                `\u2139\uFE0F ${count} update${count === 1 ? "" : "s"} applied`,
                "info",
                { ms: 3500 }
              );
              lt.core.hub.setStatus?.(
                `\u2139\uFE0F ${count} update${count === 1 ? "" : "s"} \u2014 ${summary}`,
                "info",
                { sticky: true }
              );
            }
            showValidationModal(issues);
            const needsRefresh = issues.some(
              (i) => String(i?.kind || "").includes("autoManageLtPartNoOnQuote") && String(i?.level || "").toLowerCase() === "warning"
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
    if (document.getElementById("qtv-styles")) return;
    const style = document.createElement("style");
    style.id = "qtv-styles";
    style.textContent = `
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }  /* red-ish */
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }  /* blue-ish */

/* Modal shell */
#qtv-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.38); z-index:100003; }
#qtv-modal {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  background:#fff; width:min(960px, 94vw); max-height:80vh; overflow:hidden;
  border-radius:12px; box-shadow:0 18px 40px rgba(0,0,0,.28);
  font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

/* Header */
#qtv-modal .qtv-hd {
  display:flex; align-items:center; gap:12px;
  padding:14px 16px; border-bottom:1px solid #eaeaea;
  background: linear-gradient(180deg, #fbfbfb 0%, #f7f7f7 100%);
}
#qtv-modal .qtv-hd h3 { margin:0; font-size:16px; font-weight:600; color:#0f172a; }
#qtv-modal .qtv-actions { margin-left:auto; display:flex; gap:8px; }
#qtv-modal .qtv-actions .btn { border-radius:8px; line-height:1.3; padding:6px 10px; }

/* Body */
#qtv-modal .qtv-bd { padding:10px 14px 14px; overflow:auto; max-height:calc(80vh - 56px); }

/* Table */
#qtv-modal table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
#qtv-modal thead th {
  position: sticky; top: 0; z-index: 1;
  background:#fff; border-bottom:1px solid #eaeaea; padding:8px 10px; text-align:left; color:#475569;
}
#qtv-modal tbody td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
#qtv-modal tbody tr:nth-child(odd) { background:#fcfdff; }
#qtv-modal tbody tr:hover { background:#f1f5f9; cursor:pointer; }
#qtv-modal td:nth-child(1) { width:100px; }           /* Sort Order */
#qtv-modal td:nth-child(2) { width:220px; }           /* Part #    */
#qtv-modal td:last-child { word-break: break-word; }  /* Reason    */

/* Pills */
#qtv-modal .qtv-pill { display:inline-block; padding:2px 8px; border:1px solid #e2e8f0; border-radius:999px; font-size:12px; }
`;
    document.head.appendChild(style);
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
        const vm = ctx?.$data ?? ctx?.$root ?? null;
        const qpk = TMUtils.getObsValue?.(vm, "QuotePartKey");
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

  // src/quote-tracking/qt50/qtv.entry.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2luamVjdEJ1dHRvbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbn07XG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbn07XG5jb25zdCBnZXRWYWwgPSBrID0+IHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoaywgREVGW2tdKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBvblRhcmdldCA9IG9uV2l6YXJkICYmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKVxuICAgICAgICAudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IENPTkZJRy53aXphcmRUYXJnZXRQYWdlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zdCBodWIgPSBhd2FpdCAoYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgaCA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGgpIHJldHVybiBoOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pKCk7XG5cbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgIGNvbnN0IElEID0gJ3F0NTAtc2V0dGluZ3MnO1xuICAgIGNvbnN0IGxpc3RlZCA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSUQpO1xuICAgIGlmIChvblRhcmdldCAmJiAhbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbigncmlnaHQnLCB7XG4gICAgICAgICAgICBpZDogSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1ZhbGlkYXRpb24gXHUyNjk5XHVGRTBFJyxcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJyxcbiAgICAgICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgICAgICBvbkNsaWNrOiBzaG93UGFuZWxcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICghb25UYXJnZXQgJiYgbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZW1vdmU/LihJRCk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAvLyBQcmVmZXIgS08gVk0gbmFtZSBvbiB0aGUgYWN0aXZlIHBhZ2VcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZVBhZ2UgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZVBhZ2UpIDogbnVsbDtcbiAgICAgICAgbGV0IG5hbWUgPSB2bSA/IChLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkpIDogJyc7XG4gICAgICAgIGlmIChuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJykgcmV0dXJuIG5hbWUudHJpbSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB0ZXh0IGluIHRoZSB3aXphcmQgbmF2XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBvblRhcmdldCA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWU7XG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBvblRhcmdldCA/ICcnIDogJ25vbmUnO1xuICAgIH07XG5cbiAgICAvLyBPYnNlcnZlIHRoZSB3aXphcmQgbmF2IGZvciBwYWdlIGNoYW5nZXNcbiAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgaWYgKG5hdiAmJiAhbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQpIHtcbiAgICAgICAgbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQgPSB0cnVlO1xuICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcih1cGRhdGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGUoKTtcbn1cblxuXG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcblxuICAgIC8vIEluaXRpYWxpemUgY29udHJvbCBzdGF0ZXNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKSwgZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpLCBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpKTtcblxuICAgIC8vIENoYW5nZSBoYW5kbGVyc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmVuYWJsZWQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcblxuICAgIC8vIEJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxyXG4vLyBXaGVuIFBhcnRTdGF0dXMgPT09IFwiUXVvdGVcIiwgUE9TVCB0byBEUyAxMzUwOSB1c2luZyB0aGUgUVQzNSBwYXR0ZXJuOlxyXG4vLyAgIFF1b3RlX0tleSA9IHZtUXVvdGVLZXlcclxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcclxuLy8gICBQYXJ0X05vICAgPSBRdW90ZV9ObyB8fCBcIl9cIiB8fCB2bVBhcnRObyAgIChRdW90ZV9ObyByZXNvbHZlZCB2aWEgbHQuY29yZSBRVEY7IHNlc3Npb24gZmFsbGJhY2spXHJcbi8vICAgTm90ZSAgICAgID0gXCJhdXRvIG1hbmFnZWRcIlxyXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbmV4cG9ydCBkZWZhdWx0IGFzeW5jIGZ1bmN0aW9uIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG4gICAgaWYgKCFzZXR0aW5ncz8uYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSkgcmV0dXJuIGlzc3VlcztcclxuXHJcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcclxuICAgIGNvbnN0IGx0ID0gKFJPT1QubHQgfHwge30pO1xyXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcclxuICAgIH07XHJcblxyXG4gICAgLy8gUVRGIChmbGF0IHJlcG8pIGxpa2UgUVQzNVxyXG4gICAgY29uc3QgUVRGID0gbHQuY29yZT8uZGF0YT8ubWFrZUZsYXRTY29wZWRSZXBvXHJcbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXHJcbiAgICAgICAgOiBudWxsO1xyXG5cclxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xyXG4gICAgY29uc3QgRFNfTUFOQUdFX1BBUlROTyA9IDEzNTA5OyAgLy8geW91ciB0YXJnZXQgRFMgdG8gcG9zdCBQYXJ0X05vXHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcclxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBST09ULmdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpXHJcbiAgICAgICAgICAgID8gYXdhaXQgUk9PVC5nZXRQbGV4RmFjYWRlKClcclxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xyXG4gICAgICAgIGlmICghcGxleCkgdGhyb3cgbmV3IEVycm9yKCdQbGV4IGZhY2FkZSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgcmV0dXJuIHBsZXg7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmFsbGJhY2sgdG8gc2Vzc2lvbiBzdG9yYWdlIGlmIFFURi9wbGV4IGh5ZHJhdGlvbiBub3QgcmVhZHlcclxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcclxuICAgICAgICB0cnkgeyByZXR1cm4gKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ1F1b3RlX05vJykgfHwgJycpLnRyaW0oKTsgfSBjYXRjaCB7IHJldHVybiAnJzsgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc29sdmUgUXVvdGVfTm8gZm9yIGEgZ2l2ZW4gUXVvdGVLZXkgdXNpbmcgUVRGOyBoeWRyYXRlIG9uY2UgZnJvbSBEUyBpZiBuZWVkZWQuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRdW90ZU5vRm9yUXVvdGVLZXkocWspIHtcclxuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcclxuICAgICAgICBpZiAoIXFLZXkgfHwgIU51bWJlci5pc0Zpbml0ZShxS2V5KSB8fCBxS2V5IDw9IDApIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKCFRVEYpIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcclxuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICBpZiAoIWhlYWQ/LlF1b3RlX05vKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKERTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocUtleSkgfSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpcnN0ID0gQXJyYXkuaXNBcnJheShyb3dzKSAmJiByb3dzLmxlbmd0aCA/IHJvd3NbMF0gOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocXVvdGVObyAhPSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlcG8ucGF0Y2hIZWFkZXI/Lih7IFF1b3RlX0tleTogcUtleSwgUXVvdGVfTm86IHF1b3RlTm8sIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBxbiA9IGhlYWQ/LlF1b3RlX05vO1xyXG4gICAgICAgICAgICByZXR1cm4gKHFuID09IG51bGwgPyBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKSA6IFN0cmluZyhxbikudHJpbSgpKTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgcmV0dXJuIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJdGVyYXRlIFF1b3RlUGFydCBncm91cHMsIHJlc29sdmUgUXVvdGVfTm8gb25jZSBwZXIgZ3JvdXAsIHRoZW4gcG9zdCBwZXItcm93IHdoZW4gc3RhdHVzID09PSAnUXVvdGUnXHJcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgYW55ID0gQXJyYXkuaXNBcnJheShncm91cCkgJiYgZ3JvdXAubGVuZ3RoID8gZ3JvdXBbMF0gOiBudWxsO1xyXG4gICAgICAgIGNvbnN0IGdyb3VwUXVvdGVLZXkgPSB1dGlscy5nZXQoYW55LCAnUXVvdGVLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuXHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcclxuICAgICAgICBjb25zdCByZXNvbHZlZFF1b3RlTm8gPSBhd2FpdCBnZXRRdW90ZU5vRm9yUXVvdGVLZXkoZ3JvdXBRdW90ZUtleSk7XHJcblxyXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCB1bmlxdWUgUGFydEtleSBleGFjdGx5IG9uY2VcclxuICAgICAgICBjb25zdCB1bmlxQnlQYXJ0S2V5ID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBrID0gdXRpbHMuZ2V0KHJvdywgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShwaykgJiYgIXVuaXFCeVBhcnRLZXkuaGFzKHBrKSkge1xyXG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgciBvZiB1bmlxQnlQYXJ0S2V5LnZhbHVlcygpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IFN0cmluZyh1dGlscy5nZXQociwgJ1BhcnRTdGF0dXMnLCB7IHRyaW06IHRydWUgfSkgfHwgJycpO1xyXG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAnUXVvdGUnKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHZtUXVvdGVLZXkgPSBncm91cFF1b3RlS2V5ID8/IHV0aWxzLmdldChyLCAnUXVvdGVLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3Qgdm1QYXJ0S2V5ID0gdXRpbHMuZ2V0KHIsICdQYXJ0S2V5JywgeyBudW1iZXI6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydE5vID0gU3RyaW5nKHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnKTtcclxuXHJcbiAgICAgICAgICAgIC8vIElkZW1wb3RlbmN5IGd1YXJkOlxyXG4gICAgICAgICAgICAvLyAgIElmIHdlIGhhdmUgUXVvdGVfTm8sIGRlc2lyZWQgcHJlZml4IGlzIFwiPFF1b3RlX05vPl9cIlxyXG4gICAgICAgICAgICAvLyAgIElmIG5vdCwgZGVzaXJlZCBwcmVmaXggaXMgXCJfXCIgKHBlciBvcmlnaW5hbCBzcGVjKS5cclxuICAgICAgICAgICAgY29uc3QgaGFzUXVvdGVObyA9ICEhcmVzb2x2ZWRRdW90ZU5vO1xyXG4gICAgICAgICAgICBjb25zdCBkZXNpcmVkUHJlZml4ID0gaGFzUXVvdGVObyA/IGAke3Jlc29sdmVkUXVvdGVOb31fYCA6IGBfYDtcclxuICAgICAgICAgICAgY29uc3QgYWxyZWFkeU1hbmFnZWQgPSB2bVBhcnROby5zdGFydHNXaXRoKGRlc2lyZWRQcmVmaXgpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBub3JtYWxpemVkLCBza2lwIERTIGNhbGwgYW5kIG5vdGUgaXQgKHNvIHVzZXJzIGtub3cgaXQgd2FzIGNoZWNrZWQpLlxyXG4gICAgICAgICAgICBpZiAoYWxyZWFkeU1hbmFnZWQpIHtcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2luZm8nLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBObyBjaGFuZ2U6IFBhcnRfTm8gYWxyZWFkeSBtYW5hZ2VkXCIuYCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8gfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQnVpbGQgdGhlIGRlc2lyZWQgUGFydF9ObyBqdXN0IG9uY2UgKGF2b2lkIGRvdWJsZS1wcmVmaXhpbmcgb24gc3Vic2VxdWVudCBydW5zKVxyXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm9Gb3JQb3N0ID0gYCR7ZGVzaXJlZFByZWZpeH0ke3ZtUGFydE5vfWA7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0ge1xyXG4gICAgICAgICAgICAgICAgUXVvdGVfS2V5OiBTdHJpbmcodm1RdW90ZUtleSA/PyAnJyksXHJcbiAgICAgICAgICAgICAgICBQYXJ0X0tleTogU3RyaW5nKHZtUGFydEtleSA/PyAnJyksXHJcbiAgICAgICAgICAgICAgICBQYXJ0X05vOiBTdHJpbmcocGFydE5vRm9yUG9zdCA/PyAnJyksXHJcbiAgICAgICAgICAgICAgICBOYW1lOiAnYXV0byBtYW5hZ2VkJyxcclxuICAgICAgICAgICAgICAgIFVwZGF0ZV9QYXJ0OiB0cnVlXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGxleCA9IGF3YWl0IGdldFBsZXgoKTtcclxuICAgICAgICAgICAgICAgIGlmICghcGxleD8uZHNSb3dzKSB0aHJvdyBuZXcgRXJyb3IoJ3BsZXguZHNSb3dzIHVuYXZhaWxhYmxlJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUVQzNS1zdHlsZSBEUyBjYWxsIHdpdGggYXV0aCB3cmFwcGVyXHJcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYXdhaXQtaW4tbG9vcFxyXG4gICAgICAgICAgICAgICAgYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19NQU5BR0VfUEFSVE5PLCBib2R5KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFBhcnRfTm8gXHUyMDFDJHtib2R5LlBhcnRfTm99XHUyMDFEIGF1dG8gbWFuYWdlZC5gLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3BhcnQuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcclxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwayxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgRFMgJHtEU19NQU5BR0VfUEFSVE5PfSBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGlzc3VlcztcclxufVxyXG5cclxuLy8gTGFiZWwgdGhlIHJ1bGUgZm9yIHRoZSBtb2RhbFxyXG5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLm1ldGEgPSB7IGlkOiAnYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScsIGxhYmVsOiAnQXV0by1NYW5hZ2UgTFQgUGFydCBObycgfTtcclxuIiwgIi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4vLyBSdWxlOiBtaW5Vbml0UHJpY2VcclxuLy8gUHVycG9zZTogRXJyb3Igd2hlbiB0aGUgZWZmZWN0aXZlIHVuaXQgcHJpY2UgaXMgYmVsb3cgdGhlIGNvbmZpZ3VyZWQgbWluaW11bS5cclxuLy8gUmVhZHMgZnJvbSBzZXR0aW5ncy5taW5Vbml0UHJpY2UgKG51bGxhYmxlKS5cclxuLy8gUHJlY2VkZW5jZSBmb3IgdW5pdCBwcmljZSBmaWVsZHM6XHJcbi8vICAgUnZDdXN0b21pemVkVW5pdFByaWNlID4gUnZVbml0UHJpY2VDb3B5ID4gVW5pdFByaWNlXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtaW5Vbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIGNvbnN0IG1pbiA9IE51bWJlcihzZXR0aW5ncy5taW5Vbml0UHJpY2UpO1xyXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWluKSkgcmV0dXJuIFtdO1xyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XHJcbiAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJyA/IHYoKSA6IHYpLnRyaW0oKTtcclxuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XHJcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICB9O1xyXG5cclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xyXG4gICAgICAgICAgICBjb25zdCByYXcgPVxyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSA/P1xyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtIDwgbWluKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmbXQgPSAobikgPT4gKE51bWJlci5pc0Zpbml0ZShuKVxyXG4gICAgICAgICAgICAgICAgICAgID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KVxyXG4gICAgICAgICAgICAgICAgICAgIDogU3RyaW5nKG4pKTtcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWluVW5pdFByaWNlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2Vycm9yJyxcclxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9IDwgTWluICR7Zm10KG1pbil9YCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtaW4gfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGlzc3VlcztcclxufVxyXG5cclxubWluVW5pdFByaWNlLm1ldGEgPSB7IGlkOiAnbWluVW5pdFByaWNlJywgbGFiZWw6ICdNaW4gVW5pdCBQcmljZScgfTtcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL21heFVuaXRQcmljZS5qc1xyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIC8vIEd1YXJkIGlmIG5vdCBjb25maWd1cmVkXHJcbiAgICBjb25zdCBtYXggPSBOdW1iZXIoc2V0dGluZ3MubWF4VW5pdFByaWNlKTtcclxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcclxuXHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuXHJcbiAgICAvLyBTaW1wbGUgY3VycmVuY3kvbnVtYmVyIHNhbml0aXplclxyXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XHJcbiAgICAgICAgY29uc3QgcyA9IFN0cmluZyh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJyA/IHYoKSA6IHYpLnRyaW0oKTtcclxuICAgICAgICBpZiAoIXMpIHJldHVybiBOYU47XHJcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICB9O1xyXG5cclxuXHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcclxuXHJcbiAgICAgICAgICAgIC8vIHByZWNlZGVuY2U6IGN1c3RvbWl6ZWQgPiBjb3B5ID4gYmFzZVxyXG4gICAgICAgICAgICBjb25zdCByYXcgPVxyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSA/P1xyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdSdlVuaXRQcmljZUNvcHknKSA/P1xyXG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHRvTnVtKHJhdyk7XHJcblxyXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG51bSkgJiYgbnVtID4gbWF4KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmbXQgPSAobikgPT4gKE51bWJlci5pc0Zpbml0ZShuKSA/IG4udG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSkgOiBTdHJpbmcobikpO1xyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwcmljZS5tYXhVbml0UHJpY2UnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFVuaXQgUHJpY2UgJHtmbXQobnVtKX0gPiBNYXggJHtmbXQobWF4KX1gLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgdW5pdFJhdzogcmF3LCB1bml0TnVtOiBudW0sIG1heCB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaXNzdWVzO1xyXG59XHJcblxyXG5tYXhVbml0UHJpY2UubWV0YSA9IHsgaWQ6ICdtYXhVbml0UHJpY2UnLCBsYWJlbDogJ01heCBVbml0IFByaWNlJyB9O1xyXG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcclxuaW1wb3J0IGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUgZnJvbSAnLi9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJztcclxuLy9pbXBvcnQgZm9yYmlkWmVyb1ByaWNlIGZyb20gJy4vZm9yYmlkWmVyb1ByaWNlJztcclxuaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XHJcbmltcG9ydCBtYXhVbml0UHJpY2UgZnJvbSAnLi9tYXhVbml0UHJpY2UnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgW2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgIC8vcmVxdWlyZVJlc29sdmVkUGFydCwgZm9yYmlkWmVyb1ByaWNlLCBcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2VuZ2luZS5qc1xyXG5pbXBvcnQgcnVsZXMgZnJvbSAnLi9ydWxlcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncykge1xyXG4gICAgYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHsgcmVxdWlyZUtvOiB0cnVlLCB0aW1lb3V0TXM6IDEyMDAwIH0pO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICBjb25zdCBndm0gPSBncmlkID8gS08/LmRhdGFGb3I/LihncmlkKSA6IG51bGw7XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XHJcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgcXAgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdRdW90ZVBhcnRLZXknKSA/PyAtMTtcclxuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgcCA9IGdyb3VwLmZpbmQociA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdJc1VuaXF1ZVF1b3RlUGFydCcpID09PSAxKSB8fCBncm91cFswXTtcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdHggPSB7XHJcbiAgICAgICAgcm93cyxcclxuICAgICAgICBncm91cHNCeVF1b3RlUGFydCxcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXHJcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXHJcbiAgICAgICAgbGFzdFJlc3VsdDogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGU/LigpXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHV0aWxzID0geyBnZXQ6IChvYmosIHBhdGgsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUob2JqLCBwYXRoLCBvcHRzKSB9O1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChydWxlcy5tYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSkpO1xyXG4gICAgY29uc3QgaXNzdWVzUmF3ID0gcmVzdWx0cy5mbGF0KCk7XHJcbiAgICBjb25zdCBvayA9IGlzc3Vlc1Jhdy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xyXG5cclxuICAgIC8vIEVucmljaCBpc3N1ZXMgd2l0aCBVSS1mYWNpbmcgZGF0YSAobGluZU51bWJlciwgcGFydE5vLCBydWxlTGFiZWwpXHJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiBOdW1iZXIoU3RyaW5nKHYgPz8gJycpLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICBjb25zdCBydWxlTGFiZWxGcm9tID0gKGlzcykgPT4ge1xyXG4gICAgICAgIC8vIFByZWZlcnJlZDogcnVsZSBmdW5jdGlvbiBzZXRzIC5tZXRhLmxhYmVsIChlLmcuLCBtYXhVbml0UHJpY2UubWV0YS5sYWJlbClcclxuICAgICAgICBpZiAoaXNzPy5tZXRhPy5sYWJlbCkgcmV0dXJuIGlzcy5tZXRhLmxhYmVsO1xyXG4gICAgICAgIGlmIChpc3M/LmtpbmQpIHtcclxuICAgICAgICAgICAgY29uc3QgayA9IFN0cmluZyhpc3Mua2luZCk7XHJcbiAgICAgICAgICAgIC8vIHByZXR0aWZ5IFwicHJpY2UubWF4VW5pdFByaWNlXCIgPT4gXCJNYXggVW5pdCBQcmljZVwiXHJcbiAgICAgICAgICAgIGNvbnN0IHRhaWwgPSBrLnNwbGl0KCcuJykucG9wKCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0YWlsXHJcbiAgICAgICAgICAgICAgICA/IHRhaWwucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcclxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXi4vLCAoYykgPT4gYy50b1VwcGVyQ2FzZSgpKVxyXG4gICAgICAgICAgICAgICAgOiBrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gJ1ZhbGlkYXRpb24nO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBCdWlsZCBhIHF1aWNrIG1hcCBvZiByb3cgLT4gaW5mb1xyXG4gICAgY29uc3Qgcm93SW5mbyA9IG5ldyBNYXAoKTsgLy8gdm0gLT4geyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdHgucm93cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IHIgPSBjdHgucm93c1tpXTtcclxuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XHJcbiAgICAgICAgY29uc3QgcGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJyc7XHJcbiAgICAgICAgcm93SW5mby5zZXQociwgeyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWxzbyBtYXAgUVBLIC0+IFwicHJpbWFyeVwiIHJvdyBmb3IgY2hlYXAgbG9va3VwXHJcbiAgICBjb25zdCBxcGtUb1ByaW1hcnlJbmZvID0gbmV3IE1hcCgpO1xyXG4gICAgZm9yIChjb25zdCBbcXAsIHByaW1hcnldIG9mIGN0eC5wcmltYXJ5QnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgaW5mbyA9IHJvd0luZm8uZ2V0KHByaW1hcnkpIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiB1dGlscy5nZXQocHJpbWFyeSwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJyB9O1xyXG4gICAgICAgIHFwa1RvUHJpbWFyeUluZm8uc2V0KHFwLCBpbmZvKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBCdWlsZCBhIFNvcnRPcmRlciBsb29rdXAgYnkgdmlzdWFsIHJvdyBpbmRleCAoZnJvbSB0aGUgVk0sIG5vdCB0aGUgRE9NKVxyXG4gICAgY29uc3Qgc29ydEJ5TGluZSA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCByb3cgPSBjdHgucm93c1tpXTtcclxuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XHJcbiAgICAgICAgY29uc3Qgc29ydE9yZGVyID0gdXRpbHMuZ2V0KHJvdywgJ1NvcnRPcmRlcicsIHsgbnVtYmVyOiB0cnVlIH0pO1xyXG4gICAgICAgIHNvcnRCeUxpbmUuc2V0KGxpbmVOdW1iZXIsIHNvcnRPcmRlcik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaXNzdWVzID0gaXNzdWVzUmF3Lm1hcChpc3MgPT4ge1xyXG4gICAgICAgIGNvbnN0IHFwayA9IGlzcy5xdW90ZVBhcnRLZXkgPz8gLTE7XHJcbiAgICAgICAgY29uc3QgaW5mbyA9IHFwa1RvUHJpbWFyeUluZm8uZ2V0KHFwaykgfHwgeyBsaW5lTnVtYmVyOiBudWxsLCBwYXJ0Tm86ICcnIH07XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgLi4uaXNzLFxyXG4gICAgICAgICAgICBsaW5lTnVtYmVyOiBpbmZvLmxpbmVOdW1iZXIsXHJcbiAgICAgICAgICAgIHBhcnRObzogaW5mby5wYXJ0Tm8sXHJcbiAgICAgICAgICAgIHJ1bGVMYWJlbDogcnVsZUxhYmVsRnJvbShpc3MpLFxyXG4gICAgICAgICAgICBzb3J0T3JkZXI6IHNvcnRCeUxpbmUuZ2V0KGluZm8ubGluZU51bWJlciA/PyAtMSlcclxuICAgICAgICB9O1xyXG4gICAgfSk7XHJcblxyXG5cclxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XHJcbiAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0geyBhdDogRGF0ZS5ub3coKSwgb2ssIGlzc3VlcyB9O1xyXG5cclxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcclxufVxyXG5cclxuIiwgIi8vIFFUViBlbnRyeXBvaW50OiBtb3VudHMgdGhlIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBvbiBQYXJ0IFN1bW1hcnlcclxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcclxuICAgID8gX19CVUlMRF9ERVZfX1xyXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcclxuXHJcbmlmIChfX0JVSUxEX0RFVl9fKSB7XHJcbiAgICAvLyBNaW5pbWFsIEtPL2dyaWQgcmVzb2x2ZXJzIGtlcHQgbG9jYWwgdG8gZGVidWcgaGVscGVyc1xyXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xyXG4gICAgZnVuY3Rpb24gZ2V0R3JpZFZNKCkge1xyXG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICAgICAgcmV0dXJuIGdyaWQgPyAoS08/LmRhdGFGb3I/LihncmlkKSB8fCBudWxsKSA6IG51bGw7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBnZXRHcmlkUm93cygpIHtcclxuICAgICAgICBjb25zdCBndm0gPSBnZXRHcmlkVk0oKTtcclxuICAgICAgICByZXR1cm4gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHBsYWluUm93KHIpIHtcclxuICAgICAgICBjb25zdCBndiA9IChwLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsIHAsIG9wdHMpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIFF1b3RlUGFydEtleTogZ3YoJ1F1b3RlUGFydEtleScpLFxyXG4gICAgICAgICAgICBQYXJ0Tm86IGd2KCdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSksXHJcbiAgICAgICAgICAgIFBhcnRTdGF0dXM6IGd2KCdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pLFxyXG4gICAgICAgICAgICBRdWFudGl0eTogZ3YoJ1F1YW50aXR5JyksXHJcbiAgICAgICAgICAgIFVuaXRQcmljZTogZ3YoJ1VuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBSdlVuaXRQcmljZUNvcHk6IGd2KCdSdlVuaXRQcmljZUNvcHknKSxcclxuICAgICAgICAgICAgUnZDdXN0b21pemVkVW5pdFByaWNlOiBndignUnZDdXN0b21pemVkVW5pdFByaWNlJyksXHJcbiAgICAgICAgICAgIElzVW5pcXVlUXVvdGVQYXJ0OiBndignSXNVbmlxdWVRdW90ZVBhcnQnKVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiB0b0NTVihvYmpzKSB7XHJcbiAgICAgICAgaWYgKCFvYmpzPy5sZW5ndGgpIHJldHVybiAnJztcclxuICAgICAgICBjb25zdCBjb2xzID0gT2JqZWN0LmtleXMob2Jqc1swXSk7XHJcbiAgICAgICAgY29uc3QgZXNjID0gKHYpID0+ICh2ID09IG51bGwgPyAnJyA6IFN0cmluZyh2KS5pbmNsdWRlcygnLCcpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXCInKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1xcbicpXHJcbiAgICAgICAgICAgID8gYFwiJHtTdHJpbmcodikucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImBcclxuICAgICAgICAgICAgOiBTdHJpbmcodikpO1xyXG4gICAgICAgIGNvbnN0IGhlYWQgPSBjb2xzLmpvaW4oJywnKTtcclxuICAgICAgICBjb25zdCBib2R5ID0gb2Jqcy5tYXAobyA9PiBjb2xzLm1hcChjID0+IGVzYyhvW2NdKSkuam9pbignLCcpKS5qb2luKCdcXG4nKTtcclxuICAgICAgICByZXR1cm4gaGVhZCArICdcXG4nICsgYm9keTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGRvd25sb2FkKG5hbWUsIGJsb2IpIHtcclxuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xyXG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gbmFtZTsgYS5jbGljaygpO1xyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAyMDAwKTtcclxuICAgIH1cclxuXHJcbiAgICB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHID0ge1xyXG4gICAgICAgIC8vIFNldHRpbmdzIGhlbHBlcnNcclxuICAgICAgICBzZXR0aW5nczogKCkgPT4gKHtcclxuICAgICAgICAgICAgZW5hYmxlZDogR01fZ2V0VmFsdWUoJ3F0di5lbmFibGVkJyksXHJcbiAgICAgICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IEdNX2dldFZhbHVlKCdxdHYuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLFxyXG4gICAgICAgICAgICBtaW5Vbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWluVW5pdFByaWNlJyksXHJcbiAgICAgICAgICAgIG1heFVuaXRQcmljZTogR01fZ2V0VmFsdWUoJ3F0di5tYXhVbml0UHJpY2UnKVxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIGdldFZhbHVlOiBrZXkgPT4gR01fZ2V0VmFsdWUoa2V5KSxcclxuICAgICAgICBzZXRWYWx1ZTogKGtleSwgdmFsKSA9PiBHTV9zZXRWYWx1ZShrZXksIHZhbCksXHJcblxyXG4gICAgICAgIC8vIEdyaWQgZXhwb3J0ZXJzXHJcbiAgICAgICAgZ3JpZDogKHsgcGxhaW4gPSB0cnVlIH0gPSB7fSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCByb3dzID0gZ2V0R3JpZFJvd3MoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHBsYWluID8gcm93cy5tYXAocGxhaW5Sb3cpIDogcm93cztcclxuICAgICAgICB9LFxyXG4gICAgICAgIGdyaWRUYWJsZTogKCkgPT4gY29uc29sZS50YWJsZT8uKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKSxcclxuXHJcbiAgICAgICAgLy8gQ1NWL0pTT04gZG93bmxvYWRlcnNcclxuICAgICAgICBkb3dubG9hZEdyaWRKU09OOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5qc29uJykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSksIG51bGwsIDIpO1xyXG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2RhdGFdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBkb3dubG9hZEdyaWRDU1Y6IChmaWxlbmFtZSA9ICdxdC1ncmlkLmNzdicpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY3N2ID0gdG9DU1YodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KSk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLy8gVmFsaWRhdGlvbiBvbi1kZW1hbmQgKHNhbWUgZW5naW5lIGFzIHRoZSBidXR0b24pXHJcbiAgICAgICAgdmFsaWRhdGVOb3c6IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBydW5WYWxpZGF0aW9uIH0gPSBhd2FpdCBpbXBvcnQoJy4vZW5naW5lLmpzJyk7IC8vIHNhbWUgbW9kdWxlIHVzZWQgYnkgdGhlIGh1YiBidXR0b25cclxuICAgICAgICAgICAgY29uc3QgeyBnZXRTZXR0aW5ncyB9ID0gYXdhaXQgaW1wb3J0KCcuL2luZGV4LmpzJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgZ2V0U2V0dGluZ3MoKSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUudGFibGU/LihyZXMuaXNzdWVzIHx8IFtdKTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICAvLyBRdWljayBleHBlY3RhdGlvbiBoZWxwZXI6IFx1MjAxQ3Nob3cgbWUgcm93cyBhYm92ZSBtYXhcdTIwMURcclxuICAgICAgICBleHBlY3RVbmRlck1heDogKG1heCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWF4KTtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHJvd3NcclxuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtID4gc2V0KVxyXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICB1bmRlck1pbjogKG1pbikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWluKTtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHJvd3NcclxuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtIDwgc2V0KVxyXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcclxuICAgICAgICB9LFxyXG5cclxuICAgIH07XHJcbn1cclxuXHJcblxyXG4vLyBFbnN1cmUgdGhlIHNldHRpbmdzIFVJIGxvYWRzIChnZWFyIGJ1dHRvbiwgc3RvcmFnZSBBUEkpXHJcbmltcG9ydCAnLi9pbmRleC5qcyc7XHJcbi8vIE1vdW50cyB0aGUgVmFsaWRhdGUgTGluZXMgYnV0dG9uICYgd2lyZXMgY2xpY2sgdG8gdGhlIGVuZ2luZVxyXG5pbXBvcnQgeyBtb3VudFZhbGlkYXRpb25CdXR0b24gfSBmcm9tICcuL2luamVjdEJ1dHRvbi5qcyc7XHJcblxyXG5UTVV0aWxzPy5uZXQ/LmVuc3VyZVdhdGNoZXI/LigpOyAvLyBvcHRpb25hbCwgaGFybWxlc3MgaWYgbWlzc2luZ1xyXG5cclxuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcclxubGV0IHVubW91bnRCdG4gPSBudWxsO1xyXG5cclxuZnVuY3Rpb24gaXNXaXphcmQoKSB7XHJcbiAgICBpZiAoVE1VdGlscz8ubWF0Y2hSb3V0ZSkgcmV0dXJuICEhVE1VdGlscy5tYXRjaFJvdXRlKFJPVVRFUyk7XHJcbiAgICByZXR1cm4gUk9VVEVTLnNvbWUocmUgPT4gcmUudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcclxuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgcmV0dXJuIChsaT8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzT25UYXJnZXRXaXphcmRQYWdlKCkge1xyXG4gICAgcmV0dXJuIC9ecGFydFxccypzdW1tYXJ5JC9pLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcclxuICAgIGlmICghaXNXaXphcmQoKSkgcmV0dXJuIHVubW91bnQoKTtcclxuICAgIGlmIChpc09uVGFyZ2V0V2l6YXJkUGFnZSgpKSB7XHJcbiAgICAgICAgaWYgKCF1bm1vdW50QnRuKSB1bm1vdW50QnRuID0gYXdhaXQgbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB1bm1vdW50KCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVubW91bnQoKSB7IGlmICh1bm1vdW50QnRuKSB7IHVubW91bnRCdG4oKTsgdW5tb3VudEJ0biA9IG51bGw7IH0gfVxyXG5cclxuLy8gaW5pdGlhbCArIFNQQSB3aXJpbmcgKG1pcnJvcnMgcXQzMC9xdDM1KVxyXG5yZWNvbmNpbGUoKTtcclxuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihyZWNvbmNpbGUpO1xyXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZSk7XHJcbmNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcclxuaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb25jaWxlKS5vYnNlcnZlKG5hdiwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XHJcblxyXG4iLCAiLy8gQWRkcyBhIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBhbmQgd2lyZXMgaXQgdG8gdGhlIGVuZ2luZS5cclxuLy8gQXNzdW1lcyB5b3VyIHNldHRpbmdzIFVJIGV4cG9ydHMgZ2V0U2V0dGluZ3Mvb25TZXR0aW5nc0NoYW5nZS5cclxuXHJcbmltcG9ydCB7IHJ1blZhbGlkYXRpb24gfSBmcm9tICcuL2VuZ2luZSc7XHJcbmltcG9ydCB7IGdldFNldHRpbmdzLCBvblNldHRpbmdzQ2hhbmdlIH0gZnJvbSAnLi9pbmRleCc7XHJcblxyXG4vLyAtLS0gS08gc3VyZmFjZSAocXQzMCBwYXR0ZXJuKSAtLS1cclxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcclxuXHJcbi8vIC0tLSBzdW1tYXJpemUgaXNzdWVzIGZvciBzdGF0dXMgcGlsbCAvIHRvYXN0cyAtLS1cclxuZnVuY3Rpb24gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcykge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBpdGVtcyA9IEFycmF5LmlzQXJyYXkoaXNzdWVzKSA/IGlzc3VlcyA6IFtdO1xyXG4gICAgICAgIGNvbnN0IGFnZyA9IGl0ZW1zLnJlZHVjZSgoYWNjLCBpdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBsdmwgPSBTdHJpbmcoaXQ/LmxldmVsIHx8ICdpbmZvJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgYWNjW2x2bF0gPSAoYWNjW2x2bF0gfHwgMCkgKyAxO1xyXG4gICAgICAgICAgICBpZiAoaXQ/LnF1b3RlUGFydEtleSAhPSBudWxsKSBhY2MucGFydHMuYWRkKGl0LnF1b3RlUGFydEtleSk7XHJcbiAgICAgICAgICAgIHJldHVybiBhY2M7XHJcbiAgICAgICAgfSwgeyBlcnJvcjogMCwgd2FybmluZzogMCwgaW5mbzogMCwgcGFydHM6IG5ldyBTZXQoKSB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgcGFydHNDb3VudCA9IGFnZy5wYXJ0cy5zaXplO1xyXG4gICAgICAgIGNvbnN0IHNlZ3MgPSBbXTtcclxuICAgICAgICBpZiAoYWdnLmVycm9yKSBzZWdzLnB1c2goYCR7YWdnLmVycm9yfSBlcnJvciR7YWdnLmVycm9yID09PSAxID8gJycgOiAncyd9YCk7XHJcbiAgICAgICAgaWYgKGFnZy53YXJuaW5nKSBzZWdzLnB1c2goYCR7YWdnLndhcm5pbmd9IHdhcm5pbmcke2FnZy53YXJuaW5nID09PSAxID8gJycgOiAncyd9YCk7XHJcbiAgICAgICAgaWYgKGFnZy5pbmZvKSBzZWdzLnB1c2goYCR7YWdnLmluZm99IGluZm9gKTtcclxuICAgICAgICBjb25zdCBsZXZlbFBhcnQgPSBzZWdzLmpvaW4oJywgJykgfHwgJ3VwZGF0ZXMnO1xyXG5cclxuICAgICAgICByZXR1cm4gYCR7bGV2ZWxQYXJ0fSBhY3Jvc3MgJHtwYXJ0c0NvdW50IHx8IDB9IHBhcnQke3BhcnRzQ291bnQgPT09IDEgPyAnJyA6ICdzJ31gO1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgICAgcmV0dXJuICcnO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gUVQzMC1zdHlsZSBncmlkIHJlZnJlc2ggKGNvcGllZCkgLS0tXHJcbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcclxuICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xyXG5cclxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXHJcbiAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxyXG4gICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xyXG4gICAgICAgIH1cclxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cclxuXHJcbiAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBhY3RpdmUgcGFnZSAocmViaW5kKVxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3c/LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcclxuICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gKHR5cGVvZiB3aXouYWN0aXZlUGFnZSA9PT0gJ2Z1bmN0aW9uJykgPyB3aXouYWN0aXZlUGFnZSgpIDogd2l6LmFjdGl2ZVBhZ2U7XHJcbiAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcclxuICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcblxyXG5cclxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcclxuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3VlcyA9IFtdKSB7XHJcbiAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XHJcblxyXG4gICAgLy8gYnVpbGQgcm93c1xyXG4gICAgY29uc3Qgcm93c0h0bWwgPSBpc3N1ZXMubWFwKGlzcyA9PiB7XHJcbiAgICAgICAgY29uc3QgbHZsID0gKGlzcy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGxcIiBzdHlsZT1cImJvcmRlci1jb2xvcjoke2x2bCA9PT0gJ2Vycm9yJyA/ICcjZmNhNWE1JyA6ICcjY2JkNWUxJ307IGNvbG9yOiR7bHZsID09PSAnZXJyb3InID8gJyNiOTFjMWMnIDogJyMzMzQxNTUnfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcclxuICAgICAgICBjb25zdCByZWFzb24gPSBpc3MubWVzc2FnZSB8fCAnKG5vIG1lc3NhZ2UpJztcclxuICAgICAgICBjb25zdCBydWxlID0gaXNzLnJ1bGVMYWJlbCB8fCBpc3Mua2luZCB8fCAnVmFsaWRhdGlvbic7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPHRyIGRhdGEtcXBrPVwiJHtpc3MucXVvdGVQYXJ0S2V5ID8/ICcnfVwiIGRhdGEtcnVsZT1cIiR7U3RyaW5nKGlzcy5raW5kIHx8ICcnKX1cIj5cclxuICAgICAgICAgIDx0ZD4ke2lzcy5zb3J0T3JkZXIgPz8gJyd9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke2lzcy5wYXJ0Tm8gPz8gJyd9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke3J1bGV9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke3JlYXNvbn08L3RkPlxyXG4gICAgICAgIDwvdHI+YFxyXG4gICAgfSkuam9pbignJyk7XHJcblxyXG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgb3ZlcmxheS5pZCA9ICdxdHYtbW9kYWwtb3ZlcmxheSc7XHJcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgbW9kYWwuaWQgPSAncXR2LW1vZGFsJztcclxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcclxuICA8ZGl2IGNsYXNzPVwicXR2LWhkXCI+XHJcbiAgICA8aDM+VmFsaWRhdGlvbiBEZXRhaWxzPC9oMz5cclxuICAgIDxkaXYgY2xhc3M9XCJxdHYtYWN0aW9uc1wiPlxyXG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCIgaWQ9XCJxdHYtZXhwb3J0LWNzdlwiIHRpdGxlPVwiRXhwb3J0IHZpc2libGUgaXNzdWVzIHRvIENTVlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGlkPVwicXR2LWNsb3NlXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMyNTYzZWI7IGNvbG9yOiNmZmY7IGJvcmRlcjoxcHggc29saWQgIzFkNGVkODtcIj5DbG9zZTwvYnV0dG9uPlxyXG4gICAgPC9kaXY+XHJcbiAgPC9kaXY+XHJcbiAgPGRpdiBjbGFzcz1cInF0di1iZFwiPlxyXG4gICAgPHRhYmxlIGFyaWEtbGFiZWw9XCJWYWxpZGF0aW9uIElzc3Vlc1wiPlxyXG4gICAgICA8dGhlYWQ+XHJcbiAgPHRyPlxyXG4gICAgPHRoPlNvcnQmbmJzcDtPcmRlcjwvdGg+XHJcbiAgICA8dGg+UGFydCAjPC90aD5cclxuICAgIDx0aD5SdWxlPC90aD5cclxuICAgIDx0aD5MZXZlbDwvdGg+XHJcbiAgICA8dGg+UmVhc29uPC90aD5cclxuICA8L3RyPlxyXG48L3RoZWFkPlxyXG4gICAgICA8dGJvZHk+JHtyb3dzSHRtbCB8fCBgPHRyPjx0ZCBjb2xzcGFuPVwiNVwiIHN0eWxlPVwib3BhY2l0eTouNzsgcGFkZGluZzoxMnB4O1wiPk5vIGlzc3Vlcy48L3RkPjwvdHI+YH08L3Rib2R5PlxyXG4gICAgPC90YWJsZT5cclxuICA8L2Rpdj5cclxuYDtcclxuXHJcbiAgICAvLyBpbnRlcmFjdGlvbnNcclxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKTtcclxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xyXG5cclxuICAgIC8vIGNsaWNrIHJvdyB0byBmb2N1cyArIGhpZ2hsaWdodCArIHNjcm9sbFxyXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcigndGJvZHknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTsgaWYgKCF0cikgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHFwayA9IHRyLmdldEF0dHJpYnV0ZSgnZGF0YS1xcGsnKTtcclxuICAgICAgICBpZiAoIXFwaykgcmV0dXJuO1xyXG4gICAgICAgIC8vIGVuc3VyZSBoaWdobGlnaHRzIGV4aXN0LCB0aGVuIGp1bXBcclxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xyXG4gICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJykpO1xyXG4gICAgICAgICAgICByb3cuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJyk7XHJcbiAgICAgICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGV4cG9ydCBDU1ZcclxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZXhwb3J0LWNzdicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICBjb25zdCBjc3YgPSBbXHJcbiAgICAgICAgICAgIFsnTGluZScsICdTb3J0T3JkZXInLCAnUGFydE5vJywgJ1F1b3RlUGFydEtleScsICdSdWxlJywgJ0xldmVsJywgJ1JlYXNvbiddLmpvaW4oJywnKSxcclxuICAgICAgICAgICAgLi4uaXNzdWVzLm1hcChpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2ID8/ICcnKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gL1tcIixcXG5dLy50ZXN0KHMpID8gYFwiJHtzLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgIDogcztcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgICAgICAgIGkubGluZU51bWJlciA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnNvcnRPcmRlciA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnBhcnRObyA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnF1b3RlUGFydEtleSA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnJ1bGVMYWJlbCB8fCBpLmtpbmQgfHwgJ1ZhbGlkYXRpb24nLFxyXG4gICAgICAgICAgICAgICAgICAgIGkubGV2ZWwgfHwgJycsXHJcbiAgICAgICAgICAgICAgICAgICAgaS5tZXNzYWdlIHx8ICcnXHJcbiAgICAgICAgICAgICAgICBdLm1hcChlc2MpLmpvaW4oJywnKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xyXG5cclxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KTtcclxuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xyXG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24taXNzdWVzLmNzdic7IGEuY2xpY2soKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKG1vZGFsKTtcclxuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcclxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiAnbmF2JyB9KTtcclxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcclxuXHJcbiAgICAvLyBhdm9pZCBkdXBsaWNhdGVcclxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xyXG5cclxuICAgIGxldCBidG5FbCA9IG51bGw7XHJcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XHJcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXHJcbiAgICAgICAgbGFiZWw6ICdWYWxpZGF0ZSBMaW5lcycsXHJcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcclxuICAgICAgICB3ZWlnaHQ6IDEzMCxcclxuICAgICAgICBvbkNsaWNrOiBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xyXG4gICAgICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrPy4oJ1ZhbGlkYXRpbmdcdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBvbGQgaGlnaGxpZ2h0c1xyXG4gICAgICAgICAgICAgICAgY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb3VudCA9IGlzc3Vlcy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNFcnJvciA9IGlzc3Vlcy5zb21lKGkgPT4gU3RyaW5nKGkubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICdlcnJvcicpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKCdcdTI3MDUgTGluZXMgdmFsaWQnLCAnc3VjY2VzcycsIHsgbXM6IDE4MDAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFzay5kb25lPy4oJ1ZhbGlkJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0Vycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYFx1Mjc0QyAke2NvdW50fSB2YWxpZGF0aW9uICR7Y291bnQgPT09IDEgPyAnaXNzdWUnIDogJ2lzc3Vlcyd9YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IG1zOiA2NTAwIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyNzRDICR7Y291bnR9IGlzc3VlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnZXJyb3InLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluZm8vd2FybiBvbmx5IChlLmcuLCBhdXRvLW1hbmFnZSBwb3N0cylcclxuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyMTM5XHVGRTBGICR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gYXBwbGllZGAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaW5mbycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IG1zOiAzNTAwIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyMTM5XHVGRTBGICR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2luZm8nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHNob3cgZGV0YWlscyB3aGVuIHdlIGhhdmUgYW55IGlzc3VlcyAoaW5mby93YXJuL2Vycm9yKVxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgYXV0b01hbmFnZSBhY3R1YWxseSBjaGFuZ2VkIFBhcnRfTm8gKGxldmVsPXdhcm5pbmcpLCByZWZyZXNoIHRoZSBncmlkIChxdDMwIHBhdHRlcm4pXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmVlZHNSZWZyZXNoID0gaXNzdWVzLnNvbWUoaSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ua2luZCB8fCAnJykuaW5jbHVkZXMoJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICd3YXJuaW5nJ1xyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChuZWVkc1JlZnJlc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyBgR3JpZCByZWZyZXNoZWQgKCR7bW9kZX0pYCA6ICdHcmlkIHJlZnJlc2ggYXR0ZW1wdGVkIChyZWxvYWQgbWF5IGJlIG5lZWRlZCknLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyAnc3VjY2VzcycgOiAnaW5mbycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBtczogMjUwMCB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0dyaWQgcmVmcmVzaCBmYWlsZWQnLCAnd2FybicsIHsgbXM6IDMwMDAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIGNhY2hlIGxhc3Qgc3RhdHVzIGZvciBTUEEgcmVkcmF3c1xyXG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XHJcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0gcmVzO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLmVycm9yPy4oYFZhbGlkYXRpb24gZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA2MDAwIH0pO1xyXG4gICAgICAgICAgICAgICAgdGFzay5lcnJvcj8uKCdFcnJvcicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR3JhYiBiYWNrIHRoZSByZWFsIERPTSBidXR0b24gdG8gdXBkYXRlIHRpdGxlIGxhdGVyXHJcbiAgICBidG5FbCA9IGh1Yi5fc2hhZG93Py5xdWVyeVNlbGVjdG9yPy4oYFtkYXRhLWlkPVwiJHtIVUJfQlROX0lEfVwiXWApO1xyXG5cclxuICAgIGNvbnN0IG9mZlNldHRpbmdzID0gb25TZXR0aW5nc0NoYW5nZT8uKCgpID0+IHJlZnJlc2hMYWJlbChidG5FbCkpO1xyXG4gICAgcmVmcmVzaExhYmVsKGJ0bkVsKTtcclxuXHJcbiAgICByZXR1cm4gKCkgPT4ge1xyXG4gICAgICAgIG9mZlNldHRpbmdzPy4oKTtcclxuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVmcmVzaExhYmVsKGJ0bikge1xyXG4gICAgaWYgKCFidG4pIHJldHVybjtcclxuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xyXG4gICAgY29uc3QgcGFydHMgPSBbXTtcclxuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xyXG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XHJcbiAgICBpZiAocy5taW5Vbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY1JHtzLm1pblVuaXRQcmljZX1gKTtcclxuICAgIGlmIChzLm1heFVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjQke3MubWF4VW5pdFByaWNlfWApO1xyXG4gICAgYnRuLnRpdGxlID0gYFJ1bGVzOiAke3BhcnRzLmpvaW4oJywgJykgfHwgJ25vbmUnfWA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKSB7XHJcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3F0di1zdHlsZXMnKSkgcmV0dXJuO1xyXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xyXG4gICAgc3R5bGUuaWQgPSAncXR2LXN0eWxlcyc7XHJcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcclxuLnF0di1yb3ctZmFpbCB7IG91dGxpbmU6IDJweCBzb2xpZCByZ2JhKDIyMCwgMzgsIDM4LCAuODUpICFpbXBvcnRhbnQ7IG91dGxpbmUtb2Zmc2V0OiAtMnB4OyB9XHJcbi5xdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NCwgMjI2LCAyMjYsIC42NSkgIWltcG9ydGFudDsgfSAgLyogcmVkLWlzaCAqL1xyXG4ucXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0IHsgYmFja2dyb3VuZDogcmdiYSgyMTksIDIzNCwgMjU0LCAuNjUpICFpbXBvcnRhbnQ7IH0gIC8qIGJsdWUtaXNoICovXHJcblxyXG4vKiBNb2RhbCBzaGVsbCAqL1xyXG4jcXR2LW1vZGFsLW92ZXJsYXkgeyBwb3NpdGlvbjpmaXhlZDsgaW5zZXQ6MDsgYmFja2dyb3VuZDpyZ2JhKDAsMCwwLC4zOCk7IHotaW5kZXg6MTAwMDAzOyB9XHJcbiNxdHYtbW9kYWwge1xyXG4gIHBvc2l0aW9uOmFic29sdXRlOyB0b3A6NTAlOyBsZWZ0OjUwJTsgdHJhbnNmb3JtOnRyYW5zbGF0ZSgtNTAlLC01MCUpO1xyXG4gIGJhY2tncm91bmQ6I2ZmZjsgd2lkdGg6bWluKDk2MHB4LCA5NHZ3KTsgbWF4LWhlaWdodDo4MHZoOyBvdmVyZmxvdzpoaWRkZW47XHJcbiAgYm9yZGVyLXJhZGl1czoxMnB4OyBib3gtc2hhZG93OjAgMThweCA0MHB4IHJnYmEoMCwwLDAsLjI4KTtcclxuICBmb250LWZhbWlseTpzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIFNlZ29lIFVJLCBSb2JvdG8sIHNhbnMtc2VyaWY7XHJcbn1cclxuXHJcbi8qIEhlYWRlciAqL1xyXG4jcXR2LW1vZGFsIC5xdHYtaGQge1xyXG4gIGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6MTJweDtcclxuICBwYWRkaW5nOjE0cHggMTZweDsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2VhZWFlYTtcclxuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjZmJmYmZiIDAlLCAjZjdmN2Y3IDEwMCUpO1xyXG59XHJcbiNxdHYtbW9kYWwgLnF0di1oZCBoMyB7IG1hcmdpbjowOyBmb250LXNpemU6MTZweDsgZm9udC13ZWlnaHQ6NjAwOyBjb2xvcjojMGYxNzJhOyB9XHJcbiNxdHYtbW9kYWwgLnF0di1hY3Rpb25zIHsgbWFyZ2luLWxlZnQ6YXV0bzsgZGlzcGxheTpmbGV4OyBnYXA6OHB4OyB9XHJcbiNxdHYtbW9kYWwgLnF0di1hY3Rpb25zIC5idG4geyBib3JkZXItcmFkaXVzOjhweDsgbGluZS1oZWlnaHQ6MS4zOyBwYWRkaW5nOjZweCAxMHB4OyB9XHJcblxyXG4vKiBCb2R5ICovXHJcbiNxdHYtbW9kYWwgLnF0di1iZCB7IHBhZGRpbmc6MTBweCAxNHB4IDE0cHg7IG92ZXJmbG93OmF1dG87IG1heC1oZWlnaHQ6Y2FsYyg4MHZoIC0gNTZweCk7IH1cclxuXHJcbi8qIFRhYmxlICovXHJcbiNxdHYtbW9kYWwgdGFibGUgeyB3aWR0aDoxMDAlOyBib3JkZXItY29sbGFwc2U6c2VwYXJhdGU7IGJvcmRlci1zcGFjaW5nOjA7IGZvbnQtc2l6ZToxM3B4OyB9XHJcbiNxdHYtbW9kYWwgdGhlYWQgdGgge1xyXG4gIHBvc2l0aW9uOiBzdGlja3k7IHRvcDogMDsgei1pbmRleDogMTtcclxuICBiYWNrZ3JvdW5kOiNmZmY7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7IHBhZGRpbmc6OHB4IDEwcHg7IHRleHQtYWxpZ246bGVmdDsgY29sb3I6IzQ3NTU2OTtcclxufVxyXG4jcXR2LW1vZGFsIHRib2R5IHRkIHsgcGFkZGluZzo4cHggMTBweDsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2YxZjVmOTsgfVxyXG4jcXR2LW1vZGFsIHRib2R5IHRyOm50aC1jaGlsZChvZGQpIHsgYmFja2dyb3VuZDojZmNmZGZmOyB9XHJcbiNxdHYtbW9kYWwgdGJvZHkgdHI6aG92ZXIgeyBiYWNrZ3JvdW5kOiNmMWY1Zjk7IGN1cnNvcjpwb2ludGVyOyB9XHJcbiNxdHYtbW9kYWwgdGQ6bnRoLWNoaWxkKDEpIHsgd2lkdGg6MTAwcHg7IH0gICAgICAgICAgIC8qIFNvcnQgT3JkZXIgKi9cclxuI3F0di1tb2RhbCB0ZDpudGgtY2hpbGQoMikgeyB3aWR0aDoyMjBweDsgfSAgICAgICAgICAgLyogUGFydCAjICAgICovXHJcbiNxdHYtbW9kYWwgdGQ6bGFzdC1jaGlsZCB7IHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7IH0gIC8qIFJlYXNvbiAgICAqL1xyXG5cclxuLyogUGlsbHMgKi9cclxuI3F0di1tb2RhbCAucXR2LXBpbGwgeyBkaXNwbGF5OmlubGluZS1ibG9jazsgcGFkZGluZzoycHggOHB4OyBib3JkZXI6MXB4IHNvbGlkICNlMmU4ZjA7IGJvcmRlci1yYWRpdXM6OTk5cHg7IGZvbnQtc2l6ZToxMnB4OyB9XHJcbmA7XHJcblxyXG5cclxuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xyXG59XHJcblxyXG5cclxuLyoqIFRhZyB2aXNpYmxlIGdyaWQgcm93cyB3aXRoIGRhdGEtcXVvdGUtcGFydC1rZXkgYnkgcmVhZGluZyBLTyBjb250ZXh0ICovXHJcbmZ1bmN0aW9uIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSB7XHJcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgaWYgKCFncmlkKSByZXR1cm4gMDtcclxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXHJcbiAgICAgICAgJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdydcclxuICAgICk7XHJcbiAgICBsZXQgdGFnZ2VkID0gMDtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgaWYgKHIuaGFzQXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JykpIHsgdGFnZ2VkKys7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/LihyKTtcclxuICAgICAgICAgICAgY29uc3Qgdm0gPSBjdHg/LiRkYXRhID8/IGN0eD8uJHJvb3QgPz8gbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgcXBrID0gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHZtLCAnUXVvdGVQYXJ0S2V5Jyk7XHJcbiAgICAgICAgICAgIGlmIChxcGsgIT0gbnVsbCAmJiBxcGsgIT09ICcnICYmIE51bWJlcihxcGspID4gMCkge1xyXG4gICAgICAgICAgICAgICAgci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknLCBTdHJpbmcocXBrKSk7XHJcbiAgICAgICAgICAgICAgICB0YWdnZWQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgcGVyLXJvdyBmYWlsdXJlcyAqLyB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGFnZ2VkO1xyXG59XHJcbmZ1bmN0aW9uIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKSB7XHJcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXR2LXJvdy1mYWlsJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJyk7XHJcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7XHJcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1taW51bml0Jyk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspIHtcclxuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICBpZiAoIWdyaWQpIHJldHVybiBudWxsO1xyXG5cclxuICAgIC8vIEZhc3QgcGF0aDogYXR0cmlidXRlIChwcmVmZXJyZWQpXHJcbiAgICBsZXQgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XHJcbiAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xyXG5cclxuICAgIC8vIElmIGF0dHJpYnV0ZXMgYXJlIG1pc3NpbmcsIHRyeSB0byB0YWcgdGhlbSBvbmNlIHRoZW4gcmV0cnlcclxuICAgIGlmIChlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkgPiAwKSB7XHJcbiAgICAgICAgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XHJcbiAgICAgICAgaWYgKHJvdykgcmV0dXJuIHJvdy5jbG9zZXN0KCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdycpIHx8IHJvdztcclxuICAgIH1cclxuXHJcbiAgICAvLyBMYXN0IHJlc29ydDogdGV4dHVhbCBzY2FuIChsZXNzIHJlbGlhYmxlLCBidXQgd29ya3MgdG9kYXkpXHJcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXHJcbiAgICApO1xyXG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCB0eHQgPSAoci50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xyXG4gICAgICAgIGlmICh0eHQuaW5jbHVkZXMoU3RyaW5nKHFwaykpKSByZXR1cm4gcjtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5cclxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcclxuaWYgKERFVikge1xyXG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyA9ICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgfHwge307XHJcbiAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHLnRhZ1N0YXRzID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdycpIDogW107XHJcbiAgICAgICAgY29uc3QgdGFnZ2VkID0gZ3JpZCA/IGdyaWQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcXVvdGUtcGFydC1rZXldJykgOiBbXTtcclxuICAgICAgICBjb25zb2xlLmxvZygnW1FUVl0gcm93czonLCByb3dzLmxlbmd0aCwgJ3RhZ2dlZDonLCB0YWdnZWQubGVuZ3RoKTtcclxuICAgICAgICByZXR1cm4geyB0b3RhbDogcm93cy5sZW5ndGgsIHRhZ2dlZDogdGFnZ2VkLmxlbmd0aCB9O1xyXG4gICAgfTtcclxuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcuaGlsaVRlc3QgPSAocXBrKSA9PiB7XHJcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xyXG4gICAgICAgIGNvbnN0IHIgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XHJcbiAgICAgICAgaWYgKHIpIHsgci5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnLCAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7IHIuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgfVxyXG4gICAgICAgIHJldHVybiAhIXI7XHJcbiAgICB9O1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFzQ08sV0FBUyxjQUFjO0FBQzFCLFdBQU87QUFBQSxNQUNILFNBQVMsT0FBTyxLQUFLLE9BQU87QUFBQSxNQUM1QiwyQkFBMkIsT0FBTyxLQUFLLHlCQUF5QjtBQUFBLE1BQ2hFLGNBQWMsT0FBTyxLQUFLLFlBQVk7QUFBQSxNQUN0QyxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsSUFDMUM7QUFBQSxFQUNKO0FBQ08sV0FBUyxpQkFBaUIsSUFBSTtBQUNqQyxRQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFDN0MsVUFBTSxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFDaEMsV0FBTyxpQkFBaUIsMEJBQTBCLENBQUM7QUFDbkQsV0FBTyxNQUFNLE9BQU8sb0JBQW9CLDBCQUEwQixDQUFDO0FBQUEsRUFDdkU7QUFDQSxXQUFTLGNBQWM7QUFDbkIsUUFBSTtBQUFFLGFBQU8sY0FBYyxJQUFJLFlBQVksMEJBQTBC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QjtBQUMvQixVQUFNLEtBQUssU0FBUyxjQUFjLGdIQUFnSDtBQUNsSixZQUFRLElBQUksZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsR0FBRztBQUFBLEVBQzdEO0FBRUEsV0FBUyx1QkFBdUI7QUFDNUIsV0FBTyxvQkFBb0IsS0FBSyx3QkFBd0IsQ0FBQztBQUFBLEVBQzdEO0FBRUEsaUJBQWUsWUFBWTtBQUN2QixRQUFJLENBQUMsU0FBUyxFQUFHLFFBQU8sUUFBUTtBQUNoQyxRQUFJLHFCQUFxQixHQUFHO0FBQ3hCLFVBQUksQ0FBQyxXQUFZLGNBQWEsTUFBTSxzQkFBc0IsT0FBTztBQUFBLElBQ3JFLE9BQU87QUFDSCxjQUFRO0FBQUEsSUFDWjtBQUFBLEVBQ0o7QUFFQSxXQUFTLFVBQVU7QUFBRSxRQUFJLFlBQVk7QUFBRSxpQkFBVztBQUFHLG1CQUFhO0FBQUEsSUFBTTtBQUFBLEVBQUU7QUFHMUUsWUFBVTtBQUNWLFdBQVMsY0FBYyxTQUFTO0FBQ2hDLFNBQU8saUJBQWlCLGNBQWMsU0FBUztBQUMvQyxNQUFNLE1BQU0sU0FBUyxjQUFjLHdCQUF3QjtBQUMzRCxNQUFJLElBQUssS0FBSSxpQkFBaUIsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLFNBQVMsTUFBTSxZQUFZLE1BQU0sV0FBVyxLQUFLLENBQUM7IiwKICAibmFtZXMiOiBbImdldEh1YiIsICJsdCIsICJUTVV0aWxzIiwgIktPIiwgIktPIiwgIlRNVXRpbHMiLCAiREVWIiwgIkRFViIsICJLTyIsICJydW5WYWxpZGF0aW9uIiwgImdldFNldHRpbmdzIiwgIlJPVVRFUyJdCn0K
