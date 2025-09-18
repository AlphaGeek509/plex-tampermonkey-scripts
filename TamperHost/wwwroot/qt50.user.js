// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.73
// @description  Gear + settings and a Validate Lines button on Quote Wizard Part Summary.
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=2.0.73-1758210409536
// @require      http://localhost:5000/lt-plex-auth.user.js?v=2.0.73-1758210409536
// @require      http://localhost:5000/lt-ui-hub.js?v=2.0.73-1758210409536
// @require      http://localhost:5000/lt-core.user.js?v=2.0.73-1758210409536
// @require      http://localhost:5000/lt-data-core.user.js?v=2.0.73-1758210409536
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2luamVjdEJ1dHRvbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbn07XG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbn07XG5jb25zdCBnZXRWYWwgPSBrID0+IHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoaywgREVGW2tdKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBvblRhcmdldCA9IG9uV2l6YXJkICYmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKVxuICAgICAgICAudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IENPTkZJRy53aXphcmRUYXJnZXRQYWdlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zdCBodWIgPSBhd2FpdCAoYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgaCA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGgpIHJldHVybiBoOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pKCk7XG5cbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgIGNvbnN0IElEID0gJ3F0NTAtc2V0dGluZ3MnO1xuICAgIGNvbnN0IGxpc3RlZCA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSUQpO1xuICAgIGlmIChvblRhcmdldCAmJiAhbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbigncmlnaHQnLCB7XG4gICAgICAgICAgICBpZDogSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1ZhbGlkYXRpb24gXHUyNjk5XHVGRTBFJyxcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJyxcbiAgICAgICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgICAgICBvbkNsaWNrOiBzaG93UGFuZWxcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICghb25UYXJnZXQgJiYgbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZW1vdmU/LihJRCk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAvLyBQcmVmZXIgS08gVk0gbmFtZSBvbiB0aGUgYWN0aXZlIHBhZ2VcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZVBhZ2UgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZVBhZ2UpIDogbnVsbDtcbiAgICAgICAgbGV0IG5hbWUgPSB2bSA/IChLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkpIDogJyc7XG4gICAgICAgIGlmIChuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJykgcmV0dXJuIG5hbWUudHJpbSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB0ZXh0IGluIHRoZSB3aXphcmQgbmF2XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBvblRhcmdldCA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWU7XG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBvblRhcmdldCA/ICcnIDogJ25vbmUnO1xuICAgIH07XG5cbiAgICAvLyBPYnNlcnZlIHRoZSB3aXphcmQgbmF2IGZvciBwYWdlIGNoYW5nZXNcbiAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgaWYgKG5hdiAmJiAhbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQpIHtcbiAgICAgICAgbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQgPSB0cnVlO1xuICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcih1cGRhdGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGUoKTtcbn1cblxuXG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcblxuICAgIC8vIEluaXRpYWxpemUgY29udHJvbCBzdGF0ZXNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKSwgZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpLCBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpKTtcblxuICAgIC8vIENoYW5nZSBoYW5kbGVyc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmVuYWJsZWQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcblxuICAgIC8vIEJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxyXG4vLyBXaGVuIFBhcnRTdGF0dXMgPT09IFwiUXVvdGVcIiwgUE9TVCB0byBEUyAxMzUwOSB1c2luZyB0aGUgUVQzNSBwYXR0ZXJuOlxyXG4vLyAgIFF1b3RlX0tleSA9IHZtUXVvdGVLZXlcclxuLy8gICBQYXJ0X0tleSAgPSB2bVBhcnRLZXlcclxuLy8gICBQYXJ0X05vICAgPSBRdW90ZV9ObyB8fCBcIl9cIiB8fCB2bVBhcnRObyAgIChRdW90ZV9ObyByZXNvbHZlZCB2aWEgbHQuY29yZSBRVEY7IHNlc3Npb24gZmFsbGJhY2spXHJcbi8vICAgTm90ZSAgICAgID0gXCJhdXRvIG1hbmFnZWRcIlxyXG4vLyBVc2VzIGdldFBsZXhGYWNhZGUoKSArIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoICsgcGxleC5kc1Jvd3MoLi4uKS5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbmV4cG9ydCBkZWZhdWx0IGFzeW5jIGZ1bmN0aW9uIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG4gICAgaWYgKCFzZXR0aW5ncz8uYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSkgcmV0dXJuIGlzc3VlcztcclxuXHJcbiAgICBjb25zdCBST09UID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93IDogd2luZG93KTtcclxuICAgIGNvbnN0IGx0ID0gKFJPT1QubHQgfHwge30pO1xyXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcclxuICAgIH07XHJcblxyXG4gICAgLy8gUVRGIChmbGF0IHJlcG8pIGxpa2UgUVQzNVxyXG4gICAgY29uc3QgUVRGID0gbHQuY29yZT8uZGF0YT8ubWFrZUZsYXRTY29wZWRSZXBvXHJcbiAgICAgICAgPyBsdC5jb3JlLmRhdGEubWFrZUZsYXRTY29wZWRSZXBvKHsgbnM6ICdRVCcsIGVudGl0eTogJ3F1b3RlJywgbGVnYWN5RW50aXR5OiAnUXVvdGVIZWFkZXInIH0pXHJcbiAgICAgICAgOiBudWxsO1xyXG5cclxuICAgIGNvbnN0IERTX1FVT1RFX0hFQURFUl9HRVQgPSAzMTU2OyAgIC8vIGh5ZHJhdGUgUXVvdGVfTm8gaWYgbWlzc2luZ1xyXG4gICAgY29uc3QgRFNfTUFOQUdFX1BBUlROTyA9IDEzNTA5OyAgLy8geW91ciB0YXJnZXQgRFMgdG8gcG9zdCBQYXJ0X05vXHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UGxleCgpIHtcclxuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBST09ULmdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpXHJcbiAgICAgICAgICAgID8gYXdhaXQgUk9PVC5nZXRQbGV4RmFjYWRlKClcclxuICAgICAgICAgICAgOiAobHQ/LmNvcmU/LnBsZXgpO1xyXG4gICAgICAgIGlmICghcGxleCkgdGhyb3cgbmV3IEVycm9yKCdQbGV4IGZhY2FkZSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgcmV0dXJuIHBsZXg7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmFsbGJhY2sgdG8gc2Vzc2lvbiBzdG9yYWdlIGlmIFFURi9wbGV4IGh5ZHJhdGlvbiBub3QgcmVhZHlcclxuICAgIGZ1bmN0aW9uIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpIHtcclxuICAgICAgICB0cnkgeyByZXR1cm4gKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ1F1b3RlX05vJykgfHwgJycpLnRyaW0oKTsgfSBjYXRjaCB7IHJldHVybiAnJzsgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc29sdmUgUXVvdGVfTm8gZm9yIGEgZ2l2ZW4gUXVvdGVLZXkgdXNpbmcgUVRGOyBoeWRyYXRlIG9uY2UgZnJvbSBEUyBpZiBuZWVkZWQuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBnZXRRdW90ZU5vRm9yUXVvdGVLZXkocWspIHtcclxuICAgICAgICBjb25zdCBxS2V5ID0gTnVtYmVyKHFrKTtcclxuICAgICAgICBpZiAoIXFLZXkgfHwgIU51bWJlci5pc0Zpbml0ZShxS2V5KSB8fCBxS2V5IDw9IDApIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKCFRVEYpIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHsgcmVwbyB9ID0gUVRGLnVzZShxS2V5KTtcclxuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICBpZiAoIWhlYWQ/LlF1b3RlX05vKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGV4ID0gYXdhaXQgZ2V0UGxleCgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBsZXg/LmRzUm93cykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKERTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocUtleSkgfSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpcnN0ID0gQXJyYXkuaXNBcnJheShyb3dzKSAmJiByb3dzLmxlbmd0aCA/IHJvd3NbMF0gOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1b3RlTm8gPSBmaXJzdD8uUXVvdGVfTm8gPz8gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocXVvdGVObyAhPSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlcG8ucGF0Y2hIZWFkZXI/Lih7IFF1b3RlX0tleTogcUtleSwgUXVvdGVfTm86IHF1b3RlTm8sIFF1b3RlX0hlYWRlcl9GZXRjaGVkX0F0OiBEYXRlLm5vdygpIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWFkID0gYXdhaXQgcmVwby5nZXRIZWFkZXI/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBxbiA9IGhlYWQ/LlF1b3RlX05vO1xyXG4gICAgICAgICAgICByZXR1cm4gKHFuID09IG51bGwgPyBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKSA6IFN0cmluZyhxbikudHJpbSgpKTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgcmV0dXJuIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBJdGVyYXRlIFF1b3RlUGFydCBncm91cHMsIHJlc29sdmUgUXVvdGVfTm8gb25jZSBwZXIgZ3JvdXAsIHRoZW4gcG9zdCBwZXItcm93IHdoZW4gc3RhdHVzID09PSAnUXVvdGUnXHJcbiAgICBmb3IgKGNvbnN0IFtxcGssIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgYW55ID0gQXJyYXkuaXNBcnJheShncm91cCkgJiYgZ3JvdXAubGVuZ3RoID8gZ3JvdXBbMF0gOiBudWxsO1xyXG4gICAgICAgIGNvbnN0IGdyb3VwUXVvdGVLZXkgPSB1dGlscy5nZXQoYW55LCAnUXVvdGVLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuXHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcclxuICAgICAgICBjb25zdCByZXNvbHZlZFF1b3RlTm8gPSBhd2FpdCBnZXRRdW90ZU5vRm9yUXVvdGVLZXkoZ3JvdXBRdW90ZUtleSk7XHJcblxyXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCB1bmlxdWUgUGFydEtleSBleGFjdGx5IG9uY2VcclxuICAgICAgICBjb25zdCB1bmlxQnlQYXJ0S2V5ID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBrID0gdXRpbHMuZ2V0KHJvdywgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShwaykgJiYgIXVuaXFCeVBhcnRLZXkuaGFzKHBrKSkge1xyXG4gICAgICAgICAgICAgICAgdW5pcUJ5UGFydEtleS5zZXQocGssIHJvdyk7IC8vIGZpcnN0IHJvdyB3aW5zXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgciBvZiB1bmlxQnlQYXJ0S2V5LnZhbHVlcygpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IFN0cmluZyh1dGlscy5nZXQociwgJ1BhcnRTdGF0dXMnLCB7IHRyaW06IHRydWUgfSkgfHwgJycpO1xyXG4gICAgICAgICAgICBpZiAoc3RhdHVzLnRvTG93ZXJDYXNlKCkgIT09ICdxdW90ZScpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgdm1RdW90ZUtleSA9IGdyb3VwUXVvdGVLZXkgPz8gdXRpbHMuZ2V0KHIsICdRdW90ZUtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICBjb25zdCB2bVBhcnRLZXkgPSB1dGlscy5nZXQociwgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3Qgdm1QYXJ0Tm8gPSBTdHJpbmcodXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycpO1xyXG5cclxuICAgICAgICAgICAgLy8gSWRlbXBvdGVuY3kgZ3VhcmQ6XHJcbiAgICAgICAgICAgIC8vICAgSWYgd2UgaGF2ZSBRdW90ZV9ObywgZGVzaXJlZCBwcmVmaXggaXMgXCI8UXVvdGVfTm8+X1wiXHJcbiAgICAgICAgICAgIC8vICAgSWYgbm90LCBkZXNpcmVkIHByZWZpeCBpcyBcIl9cIiAocGVyIG9yaWdpbmFsIHNwZWMpLlxyXG4gICAgICAgICAgICBjb25zdCBoYXNRdW90ZU5vID0gISFyZXNvbHZlZFF1b3RlTm87XHJcbiAgICAgICAgICAgIGNvbnN0IGRlc2lyZWRQcmVmaXggPSBoYXNRdW90ZU5vID8gYCR7cmVzb2x2ZWRRdW90ZU5vfV9gIDogYF9gO1xyXG4gICAgICAgICAgICBjb25zdCBhbHJlYWR5TWFuYWdlZCA9IHZtUGFydE5vLnN0YXJ0c1dpdGgoZGVzaXJlZFByZWZpeCk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBhbHJlYWR5IG5vcm1hbGl6ZWQsIHNraXAgRFMgY2FsbCBhbmQgbm90ZSBpdCAoc28gdXNlcnMga25vdyBpdCB3YXMgY2hlY2tlZCkuXHJcbiAgICAgICAgICAgIGlmIChhbHJlYWR5TWFuYWdlZCkge1xyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnaW5mbycsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYE5vIGNoYW5nZTogUGFydF9ObyBhbHJlYWR5IG1hbmFnZWQuYCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEJ1aWxkIHRoZSBkZXNpcmVkIFBhcnRfTm8ganVzdCBvbmNlIChhdm9pZCBkb3VibGUtcHJlZml4aW5nIG9uIHN1YnNlcXVlbnQgcnVucylcclxuICAgICAgICAgICAgY29uc3QgcGFydE5vRm9yUG9zdCA9IGAke2Rlc2lyZWRQcmVmaXh9JHt2bVBhcnROb31gO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHtcclxuICAgICAgICAgICAgICAgIFF1b3RlX0tleTogU3RyaW5nKHZtUXVvdGVLZXkgPz8gJycpLFxyXG4gICAgICAgICAgICAgICAgUGFydF9LZXk6IFN0cmluZyh2bVBhcnRLZXkgPz8gJycpLFxyXG4gICAgICAgICAgICAgICAgUGFydF9ObzogU3RyaW5nKHBhcnROb0ZvclBvc3QgPz8gJycpLFxyXG4gICAgICAgICAgICAgICAgTmFtZTogJ2F1dG8gbWFuYWdlZCcsXHJcbiAgICAgICAgICAgICAgICBVcGRhdGVfUGFydDogdHJ1ZVxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXBsZXg/LmRzUm93cykgdGhyb3cgbmV3IEVycm9yKCdwbGV4LmRzUm93cyB1bmF2YWlsYWJsZScpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFFUMzUtc3R5bGUgRFMgY2FsbCB3aXRoIGF1dGggd3JhcHBlclxyXG4gICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcclxuICAgICAgICAgICAgICAgIGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT4gcGxleC5kc1Jvd3MoRFNfTUFOQUdFX1BBUlROTywgYm9keSkpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ3dhcm5pbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXBrLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBQYXJ0X05vIFx1MjAxQyR7Ym9keS5QYXJ0X05vfVx1MjAxRCBhdXRvIG1hbmFnZWQuYCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnd2FybmluZycsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYERTICR7RFNfTUFOQUdFX1BBUlROT30gZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IGZhbHNlIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbi8vIExhYmVsIHRoZSBydWxlIGZvciB0aGUgbW9kYWxcclxuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5tZXRhID0geyBpZDogJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLCBsYWJlbDogJ0F1dG8tTWFuYWdlIExUIFBhcnQgTm8nIH07XHJcbiIsICIvLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogbWluVW5pdFByaWNlXHJcbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gdGhlIGVmZmVjdGl2ZSB1bml0IHByaWNlIGlzIGJlbG93IHRoZSBjb25maWd1cmVkIG1pbmltdW0uXHJcbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubWluVW5pdFByaWNlIChudWxsYWJsZSkuXHJcbi8vIFByZWNlZGVuY2UgZm9yIHVuaXQgcHJpY2UgZmllbGRzOlxyXG4vLyAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZSA+IFJ2VW5pdFByaWNlQ29weSA+IFVuaXRQcmljZVxyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWluVW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICBjb25zdCBtaW4gPSBOdW1iZXIoc2V0dGluZ3MubWluVW5pdFByaWNlKTtcclxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1pbikpIHJldHVybiBbXTtcclxuXHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm10ID0gKG4pID0+IChOdW1iZXIuaXNGaW5pdGUobilcclxuICAgICAgICAgICAgICAgICAgICA/IG4udG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSlcclxuICAgICAgICAgICAgICAgICAgICA6IFN0cmluZyhuKSk7XHJcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1pblVuaXRQcmljZScsXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdChudW0pfSA8IE1pbiAke2ZtdChtaW4pfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWluIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanNcclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWF4VW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxyXG4gICAgY29uc3QgbWF4ID0gTnVtYmVyKHNldHRpbmdzLm1heFVuaXRQcmljZSk7XHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtYXgpKSByZXR1cm4gW107XHJcblxyXG4gICAgY29uc3QgaXNzdWVzID0gW107XHJcblxyXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XHJcblxyXG4gICAgICAgICAgICAvLyBwcmVjZWRlbmNlOiBjdXN0b21pemVkID4gY29weSA+IGJhc2VcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm10ID0gKG4pID0+IChOdW1iZXIuaXNGaW5pdGUobikgPyBuLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pIDogU3RyaW5nKG4pKTtcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWF4VW5pdFByaWNlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2Vycm9yJyxcclxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9ID4gTWF4ICR7Zm10KG1heCl9YCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtYXggfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGlzc3VlcztcclxufVxyXG5cclxubWF4VW5pdFByaWNlLm1ldGEgPSB7IGlkOiAnbWF4VW5pdFByaWNlJywgbGFiZWw6ICdNYXggVW5pdCBQcmljZScgfTtcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzXHJcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XHJcbi8vaW1wb3J0IGZvcmJpZFplcm9QcmljZSBmcm9tICcuL2ZvcmJpZFplcm9QcmljZSc7XHJcbmltcG9ydCBtaW5Vbml0UHJpY2UgZnJvbSAnLi9taW5Vbml0UHJpY2UnO1xyXG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IFthdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCBtYXhVbml0UHJpY2UsIG1pblVuaXRQcmljZV07ICAvL3JlcXVpcmVSZXNvbHZlZFBhcnQsIGZvcmJpZFplcm9QcmljZSwgXHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcclxuaW1wb3J0IHJ1bGVzIGZyb20gJy4vcnVsZXMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcclxuICAgIGF3YWl0IFRNVXRpbHMud2FpdEZvck1vZGVsQXN5bmMoJy5wbGV4LWdyaWQnLCB7IHJlcXVpcmVLbzogdHJ1ZSwgdGltZW91dE1zOiAxMjAwMCB9KTtcclxuXHJcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgY29uc3QgZ3ZtID0gZ3JpZCA/IEtPPy5kYXRhRm9yPy4oZ3JpZCkgOiBudWxsO1xyXG5cclxuICAgIGNvbnN0IHJvd3MgPSAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xyXG4gICAgY29uc3QgZ3JvdXBzQnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHFwID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUXVvdGVQYXJ0S2V5JykgPz8gLTE7XHJcbiAgICAgICAgKGdyb3Vwc0J5UXVvdGVQYXJ0LmdldChxcCkgfHwgZ3JvdXBzQnlRdW90ZVBhcnQuc2V0KHFwLCBbXSkuZ2V0KHFwKSkucHVzaChyKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcmltYXJ5QnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGNvbnN0IHAgPSBncm91cC5maW5kKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnSXNVbmlxdWVRdW90ZVBhcnQnKSA9PT0gMSkgfHwgZ3JvdXBbMF07XHJcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LnNldChxcCwgcCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY3R4ID0ge1xyXG4gICAgICAgIHJvd3MsXHJcbiAgICAgICAgZ3JvdXBzQnlRdW90ZVBhcnQsXHJcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LFxyXG4gICAgICAgIGxhc3RGb3JtOiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZUZvcm0/LigpLFxyXG4gICAgICAgIGxhc3RSZXN1bHQ6IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlPy4oKVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCB1dGlscyA9IHsgZ2V0OiAob2JqLCBwYXRoLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKG9iaiwgcGF0aCwgb3B0cykgfTtcclxuXHJcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocnVsZXMubWFwKHJ1bGUgPT4gcnVsZShjdHgsIHNldHRpbmdzLCB1dGlscykpKTtcclxuICAgIGNvbnN0IGlzc3Vlc1JhdyA9IHJlc3VsdHMuZmxhdCgpO1xyXG4gICAgY29uc3Qgb2sgPSBpc3N1ZXNSYXcuZXZlcnkoaSA9PiBpLmxldmVsICE9PSAnZXJyb3InKTtcclxuXHJcbiAgICAvLyBFbnJpY2ggaXNzdWVzIHdpdGggVUktZmFjaW5nIGRhdGEgKGxpbmVOdW1iZXIsIHBhcnRObywgcnVsZUxhYmVsKVxyXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4gTnVtYmVyKFN0cmluZyh2ID8/ICcnKS5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgY29uc3QgcnVsZUxhYmVsRnJvbSA9IChpc3MpID0+IHtcclxuICAgICAgICAvLyBQcmVmZXJyZWQ6IHJ1bGUgZnVuY3Rpb24gc2V0cyAubWV0YS5sYWJlbCAoZS5nLiwgbWF4VW5pdFByaWNlLm1ldGEubGFiZWwpXHJcbiAgICAgICAgaWYgKGlzcz8ubWV0YT8ubGFiZWwpIHJldHVybiBpc3MubWV0YS5sYWJlbDtcclxuICAgICAgICBpZiAoaXNzPy5raW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGsgPSBTdHJpbmcoaXNzLmtpbmQpO1xyXG4gICAgICAgICAgICAvLyBwcmV0dGlmeSBcInByaWNlLm1heFVuaXRQcmljZVwiID0+IFwiTWF4IFVuaXQgUHJpY2VcIlxyXG4gICAgICAgICAgICBjb25zdCB0YWlsID0gay5zcGxpdCgnLicpLnBvcCgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGFpbFxyXG4gICAgICAgICAgICAgICAgPyB0YWlsLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpXHJcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL14uLywgKGMpID0+IGMudG9VcHBlckNhc2UoKSlcclxuICAgICAgICAgICAgICAgIDogaztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuICdWYWxpZGF0aW9uJztcclxuICAgIH07XHJcblxyXG4gICAgLy8gQnVpbGQgYSBxdWljayBtYXAgb2Ygcm93IC0+IGluZm9cclxuICAgIGNvbnN0IHJvd0luZm8gPSBuZXcgTWFwKCk7IC8vIHZtIC0+IHsgbGluZU51bWJlciwgcGFydE5vIH1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCByID0gY3R4LnJvd3NbaV07XHJcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xyXG4gICAgICAgIGNvbnN0IHBhcnRObyA9IHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnO1xyXG4gICAgICAgIHJvd0luZm8uc2V0KHIsIHsgbGluZU51bWJlciwgcGFydE5vIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFsc28gbWFwIFFQSyAtPiBcInByaW1hcnlcIiByb3cgZm9yIGNoZWFwIGxvb2t1cFxyXG4gICAgY29uc3QgcXBrVG9QcmltYXJ5SW5mbyA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgW3FwLCBwcmltYXJ5XSBvZiBjdHgucHJpbWFyeUJ5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSByb3dJbmZvLmdldChwcmltYXJ5KSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogdXRpbHMuZ2V0KHByaW1hcnksICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycgfTtcclxuICAgICAgICBxcGtUb1ByaW1hcnlJbmZvLnNldChxcCwgaW5mbyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQnVpbGQgYSBTb3J0T3JkZXIgbG9va3VwIGJ5IHZpc3VhbCByb3cgaW5kZXggKGZyb20gdGhlIFZNLCBub3QgdGhlIERPTSlcclxuICAgIGNvbnN0IHNvcnRCeUxpbmUgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gY3R4LnJvd3NbaV07XHJcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xyXG4gICAgICAgIGNvbnN0IHNvcnRPcmRlciA9IHV0aWxzLmdldChyb3csICdTb3J0T3JkZXInLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICBzb3J0QnlMaW5lLnNldChsaW5lTnVtYmVyLCBzb3J0T3JkZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IGlzc3Vlc1Jhdy5tYXAoaXNzID0+IHtcclxuICAgICAgICBjb25zdCBxcGsgPSBpc3MucXVvdGVQYXJ0S2V5ID8/IC0xO1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSBxcGtUb1ByaW1hcnlJbmZvLmdldChxcGspIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiAnJyB9O1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIC4uLmlzcyxcclxuICAgICAgICAgICAgbGluZU51bWJlcjogaW5mby5saW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBwYXJ0Tm86IGluZm8ucGFydE5vLFxyXG4gICAgICAgICAgICBydWxlTGFiZWw6IHJ1bGVMYWJlbEZyb20oaXNzKSxcclxuICAgICAgICAgICAgc29ydE9yZGVyOiBzb3J0QnlMaW5lLmdldChpbmZvLmxpbmVOdW1iZXIgPz8gLTEpXHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuXHJcbiAgICAvLyBzdGFzaCBpZiB5b3Ugd2FudCBvdGhlciBtb2R1bGVzIHRvIHJlYWQgaXQgbGF0ZXJcclxuICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xyXG4gICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHsgYXQ6IERhdGUubm93KCksIG9rLCBpc3N1ZXMgfTtcclxuXHJcbiAgICByZXR1cm4geyBvaywgaXNzdWVzIH07XHJcbn1cclxuXHJcbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XHJcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXHJcbiAgICA/IF9fQlVJTERfREVWX19cclxuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XHJcblxyXG5pZiAoX19CVUlMRF9ERVZfXykge1xyXG4gICAgLy8gTWluaW1hbCBLTy9ncmlkIHJlc29sdmVycyBrZXB0IGxvY2FsIHRvIGRlYnVnIGhlbHBlcnNcclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGZ1bmN0aW9uIGdldEdyaWRWTSgpIHtcclxuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgICAgIHJldHVybiBncmlkID8gKEtPPy5kYXRhRm9yPy4oZ3JpZCkgfHwgbnVsbCkgOiBudWxsO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gZ2V0R3JpZFJvd3MoKSB7XHJcbiAgICAgICAgY29uc3QgZ3ZtID0gZ2V0R3JpZFZNKCk7XHJcbiAgICAgICAgcmV0dXJuIChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBwbGFpblJvdyhyKSB7XHJcbiAgICAgICAgY29uc3QgZ3YgPSAocCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCBwLCBvcHRzKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBRdW90ZVBhcnRLZXk6IGd2KCdRdW90ZVBhcnRLZXknKSxcclxuICAgICAgICAgICAgUGFydE5vOiBndignUGFydE5vJywgeyB0cmltOiB0cnVlIH0pLFxyXG4gICAgICAgICAgICBQYXJ0U3RhdHVzOiBndignUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSxcclxuICAgICAgICAgICAgUXVhbnRpdHk6IGd2KCdRdWFudGl0eScpLFxyXG4gICAgICAgICAgICBVbml0UHJpY2U6IGd2KCdVbml0UHJpY2UnKSxcclxuICAgICAgICAgICAgUnZVbml0UHJpY2VDb3B5OiBndignUnZVbml0UHJpY2VDb3B5JyksXHJcbiAgICAgICAgICAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZTogZ3YoJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBJc1VuaXF1ZVF1b3RlUGFydDogZ3YoJ0lzVW5pcXVlUXVvdGVQYXJ0JylcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gdG9DU1Yob2Jqcykge1xyXG4gICAgICAgIGlmICghb2Jqcz8ubGVuZ3RoKSByZXR1cm4gJyc7XHJcbiAgICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKG9ianNbMF0pO1xyXG4gICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiAodiA9PSBudWxsID8gJycgOiBTdHJpbmcodikuaW5jbHVkZXMoJywnKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1wiJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcXG4nKVxyXG4gICAgICAgICAgICA/IGBcIiR7U3RyaW5nKHYpLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgXHJcbiAgICAgICAgICAgIDogU3RyaW5nKHYpKTtcclxuICAgICAgICBjb25zdCBoZWFkID0gY29scy5qb2luKCcsJyk7XHJcbiAgICAgICAgY29uc3QgYm9keSA9IG9ianMubWFwKG8gPT4gY29scy5tYXAoYyA9PiBlc2Mob1tjXSkpLmpvaW4oJywnKSkuam9pbignXFxuJyk7XHJcbiAgICAgICAgcmV0dXJuIGhlYWQgKyAnXFxuJyArIGJvZHk7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBkb3dubG9hZChuYW1lLCBibG9iKSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcclxuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xyXG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9IG5hbWU7IGEuY2xpY2soKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMjAwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcclxuICAgICAgICAvLyBTZXR0aW5ncyBoZWxwZXJzXHJcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XHJcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxyXG4gICAgICAgICAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiBHTV9nZXRWYWx1ZSgncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSxcclxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJylcclxuICAgICAgICB9KSxcclxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXHJcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxyXG5cclxuICAgICAgICAvLyBHcmlkIGV4cG9ydGVyc1xyXG4gICAgICAgIGdyaWQ6ICh7IHBsYWluID0gdHJ1ZSB9ID0ge30pID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGdldEdyaWRSb3dzKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBwbGFpbiA/IHJvd3MubWFwKHBsYWluUm93KSA6IHJvd3M7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBncmlkVGFibGU6ICgpID0+IGNvbnNvbGUudGFibGU/Lih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSksXHJcblxyXG4gICAgICAgIC8vIENTVi9KU09OIGRvd25sb2FkZXJzXHJcbiAgICAgICAgZG93bmxvYWRHcmlkSlNPTjogKGZpbGVuYW1lID0gJ3F0LWdyaWQuanNvbicpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pLCBudWxsLCAyKTtcclxuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSkpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZG93bmxvYWRHcmlkQ1NWOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5jc3YnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNzdiA9IHRvQ1NWKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSkpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8vIFZhbGlkYXRpb24gb24tZGVtYW5kIChzYW1lIGVuZ2luZSBhcyB0aGUgYnV0dG9uKVxyXG4gICAgICAgIHZhbGlkYXRlTm93OiBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgcnVuVmFsaWRhdGlvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2VuZ2luZS5qcycpOyAvLyBzYW1lIG1vZHVsZSB1c2VkIGJ5IHRoZSBodWIgYnV0dG9uXHJcbiAgICAgICAgICAgIGNvbnN0IHsgZ2V0U2V0dGluZ3MgfSA9IGF3YWl0IGltcG9ydCgnLi9pbmRleC5qcycpO1xyXG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIGdldFNldHRpbmdzKCkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4ocmVzLmlzc3VlcyB8fCBbXSk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXM7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLy8gUXVpY2sgZXhwZWN0YXRpb24gaGVscGVyOiBcdTIwMUNzaG93IG1lIHJvd3MgYWJvdmUgbWF4XHUyMDFEXHJcbiAgICAgICAgZXhwZWN0VW5kZXJNYXg6IChtYXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1heCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzXHJcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA+IHNldClcclxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgdW5kZXJNaW46IChtaW4pID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1pbik7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzXHJcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA8IHNldClcclxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuLy8gRW5zdXJlIHRoZSBzZXR0aW5ncyBVSSBsb2FkcyAoZ2VhciBidXR0b24sIHN0b3JhZ2UgQVBJKVxyXG5pbXBvcnQgJy4vaW5kZXguanMnO1xyXG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcclxuaW1wb3J0IHsgbW91bnRWYWxpZGF0aW9uQnV0dG9uIH0gZnJvbSAnLi9pbmplY3RCdXR0b24uanMnO1xyXG5cclxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcclxuXHJcbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XHJcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xyXG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xyXG4gICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcclxuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcclxuICAgIHJldHVybiAvXnBhcnRcXHMqc3VtbWFyeSQvaS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XHJcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XHJcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xyXG4gICAgICAgIGlmICghdW5tb3VudEJ0bikgdW5tb3VudEJ0biA9IGF3YWl0IG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdW5tb3VudCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB1bm1vdW50KCkgeyBpZiAodW5tb3VudEJ0bikgeyB1bm1vdW50QnRuKCk7IHVubW91bnRCdG4gPSBudWxsOyB9IH1cclxuXHJcbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcclxucmVjb25jaWxlKCk7XHJcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcclxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xyXG5jb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XHJcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xyXG5cclxuIiwgIi8vIEFkZHMgYSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gYW5kIHdpcmVzIGl0IHRvIHRoZSBlbmdpbmUuXG4vLyBBc3N1bWVzIHlvdXIgc2V0dGluZ3MgVUkgZXhwb3J0cyBnZXRTZXR0aW5ncy9vblNldHRpbmdzQ2hhbmdlLlxuXG5pbXBvcnQgeyBydW5WYWxpZGF0aW9uIH0gZnJvbSAnLi9lbmdpbmUnO1xuaW1wb3J0IHsgZ2V0U2V0dGluZ3MsIG9uU2V0dGluZ3NDaGFuZ2UgfSBmcm9tICcuL2luZGV4JztcblxuLy8gLS0tIEtPIHN1cmZhY2UgKHF0MzAgcGF0dGVybikgLS0tXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuXG4vLyAtLS0gc3VtbWFyaXplIGlzc3VlcyBmb3Igc3RhdHVzIHBpbGwgLyB0b2FzdHMgLS0tXG5mdW5jdGlvbiBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSBBcnJheS5pc0FycmF5KGlzc3VlcykgPyBpc3N1ZXMgOiBbXTtcbiAgICAgICAgY29uc3QgYWdnID0gaXRlbXMucmVkdWNlKChhY2MsIGl0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBsdmwgPSBTdHJpbmcoaXQ/LmxldmVsIHx8ICdpbmZvJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGFjY1tsdmxdID0gKGFjY1tsdmxdIHx8IDApICsgMTtcbiAgICAgICAgICAgIGlmIChpdD8ucXVvdGVQYXJ0S2V5ICE9IG51bGwpIGFjYy5wYXJ0cy5hZGQoaXQucXVvdGVQYXJ0S2V5KTtcbiAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIHsgZXJyb3I6IDAsIHdhcm5pbmc6IDAsIGluZm86IDAsIHBhcnRzOiBuZXcgU2V0KCkgfSk7XG5cbiAgICAgICAgY29uc3QgcGFydHNDb3VudCA9IGFnZy5wYXJ0cy5zaXplO1xuICAgICAgICBjb25zdCBzZWdzID0gW107XG4gICAgICAgIGlmIChhZ2cuZXJyb3IpIHNlZ3MucHVzaChgJHthZ2cuZXJyb3J9IGVycm9yJHthZ2cuZXJyb3IgPT09IDEgPyAnJyA6ICdzJ31gKTtcbiAgICAgICAgaWYgKGFnZy53YXJuaW5nKSBzZWdzLnB1c2goYCR7YWdnLndhcm5pbmd9IHdhcm5pbmcke2FnZy53YXJuaW5nID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICAgIGlmIChhZ2cuaW5mbykgc2Vncy5wdXNoKGAke2FnZy5pbmZvfSBpbmZvYCk7XG4gICAgICAgIGNvbnN0IGxldmVsUGFydCA9IHNlZ3Muam9pbignLCAnKSB8fCAndXBkYXRlcyc7XG5cbiAgICAgICAgcmV0dXJuIGAke2xldmVsUGFydH0gYWNyb3NzICR7cGFydHNDb3VudCB8fCAwfSBwYXJ0JHtwYXJ0c0NvdW50ID09PSAxID8gJycgOiAncyd9YDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cbn1cblxuLy8gLS0tIFFUMzAtc3R5bGUgZ3JpZCByZWZyZXNoIChjb3BpZWQpIC0tLVxuYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFF1b3RlR3JpZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBncmlkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIGNvbnN0IGdyaWRWTSA9IGdyaWRFbCAmJiBLTz8uZGF0YUZvcj8uKGdyaWRFbCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LmRhdGFzb3VyY2U/LnJlYWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGF3YWl0IGdyaWRWTS5kYXRhc291cmNlLnJlYWQoKTsgICAvLyBhc3luYyByZS1xdWVyeS9yZWJpbmRcbiAgICAgICAgICAgIHJldHVybiAnZHMucmVhZCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBncmlkVk0/LnJlZnJlc2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGdyaWRWTS5yZWZyZXNoKCk7ICAgICAgICAgICAgICAgICAgLy8gc3luYyB2aXN1YWwgcmVmcmVzaFxuICAgICAgICAgICAgcmV0dXJuICd2bS5yZWZyZXNoJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblxuICAgIC8vIEZhbGxiYWNrOiB3aXphcmQgbmF2aWdhdGUgdG8gdGhlIGFjdGl2ZSBwYWdlIChyZWJpbmQpXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd2l6ID0gdW5zYWZlV2luZG93Py5wbGV4Py5jdXJyZW50UGFnZT8uUXVvdGVXaXphcmQ7XG4gICAgICAgIGlmICh3aXo/Lm5hdmlnYXRlUGFnZSkge1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlID0gKHR5cGVvZiB3aXouYWN0aXZlUGFnZSA9PT0gJ2Z1bmN0aW9uJykgPyB3aXouYWN0aXZlUGFnZSgpIDogd2l6LmFjdGl2ZVBhZ2U7XG4gICAgICAgICAgICB3aXoubmF2aWdhdGVQYWdlKGFjdGl2ZSk7XG4gICAgICAgICAgICByZXR1cm4gJ3dpei5uYXZpZ2F0ZVBhZ2UnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXG4gICAgcmV0dXJuIG51bGw7XG59XG5cblxuXG5jb25zdCBIVUJfQlROX0lEID0gJ3F0NTAtdmFsaWRhdGUnO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcbiAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRyeSB7IGNvbnN0IGh1YiA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGh1YikgcmV0dXJuIGh1YjsgfSBjYXRjaCB7IH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3VlcyA9IFtdKSB7XG4gICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuXG4gICAgLy8gYnVpbGQgcm93c1xuICAgIGNvbnN0IHJvd3NIdG1sID0gaXNzdWVzLm1hcChpc3MgPT4ge1xuICAgICAgICBjb25zdCBsdmwgPSAoaXNzLmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGxcIiBzdHlsZT1cImJvcmRlci1jb2xvcjoke2x2bCA9PT0gJ2Vycm9yJyA/ICcjZmNhNWE1JyA6ICcjY2JkNWUxJ307IGNvbG9yOiR7bHZsID09PSAnZXJyb3InID8gJyNiOTFjMWMnIDogJyMzMzQxNTUnfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcbiAgICAgICAgY29uc3QgcmVhc29uID0gaXNzLm1lc3NhZ2UgfHwgJyhubyBtZXNzYWdlKSc7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBpc3MucnVsZUxhYmVsIHx8IGlzcy5raW5kIHx8ICdWYWxpZGF0aW9uJztcblxuICAgICAgICByZXR1cm4gYFxuICAgICAgICA8dHIgZGF0YS1xcGs9XCIke2lzcy5xdW90ZVBhcnRLZXkgPz8gJyd9XCIgZGF0YS1ydWxlPVwiJHtTdHJpbmcoaXNzLmtpbmQgfHwgJycpfVwiPlxuICAgICAgICAgIDx0ZD4ke2lzcy5zb3J0T3JkZXIgPz8gJyd9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtpc3MucGFydE5vID8/ICcnfTwvdGQ+XG4gICAgICAgICAgPHRkPiR7cnVsZX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtyZWFzb259PC90ZD5cbiAgICAgICAgPC90cj5gXG4gICAgfSkuam9pbignJyk7XG5cbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdxdHYtbW9kYWwtb3ZlcmxheSc7XG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbC5pZCA9ICdxdHYtbW9kYWwnO1xuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcbiAgPGRpdiBjbGFzcz1cInF0di1oZFwiPlxuICAgIDxoMz5WYWxpZGF0aW9uIERldGFpbHM8L2gzPlxuICAgIDxkaXYgY2xhc3M9XCJxdHYtYWN0aW9uc1wiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIGlkPVwicXR2LWV4cG9ydC1jc3ZcIiB0aXRsZT1cIkV4cG9ydCB2aXNpYmxlIGlzc3VlcyB0byBDU1ZcIj5FeHBvcnQgQ1NWPC9idXR0b24+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCIgaWQ9XCJxdHYtY2xvc2VcIiBzdHlsZT1cImJhY2tncm91bmQ6IzI1NjNlYjsgY29sb3I6I2ZmZjsgYm9yZGVyOjFweCBzb2xpZCAjMWQ0ZWQ4O1wiPkNsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIDwvZGl2PlxuICA8ZGl2IGNsYXNzPVwicXR2LWJkXCI+XG4gICAgPHRhYmxlIGFyaWEtbGFiZWw9XCJWYWxpZGF0aW9uIElzc3Vlc1wiPlxuICAgICAgPHRoZWFkPlxuICA8dHI+XG4gICAgPHRoPlNvcnQmbmJzcDtPcmRlcjwvdGg+XG4gICAgPHRoPlBhcnQgIzwvdGg+XG4gICAgPHRoPlJ1bGU8L3RoPlxuICAgIDx0aD5MZXZlbDwvdGg+XG4gICAgPHRoPlJlYXNvbjwvdGg+XG4gIDwvdHI+XG48L3RoZWFkPlxuICAgICAgPHRib2R5PiR7cm93c0h0bWwgfHwgYDx0cj48dGQgY29sc3Bhbj1cIjVcIiBzdHlsZT1cIm9wYWNpdHk6Ljc7IHBhZGRpbmc6MTJweDtcIj5ObyBpc3N1ZXMuPC90ZD48L3RyPmB9PC90Ym9keT5cbiAgICA8L3RhYmxlPlxuICA8L2Rpdj5cbmA7XG5cbiAgICAvLyBpbnRlcmFjdGlvbnNcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBjbGljayByb3cgdG8gZm9jdXMgKyBoaWdobGlnaHQgKyBzY3JvbGxcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCd0Ym9keScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTsgaWYgKCF0cikgcmV0dXJuO1xuICAgICAgICBjb25zdCBxcGsgPSB0ci5nZXRBdHRyaWJ1dGUoJ2RhdGEtcXBrJyk7XG4gICAgICAgIGlmICghcXBrKSByZXR1cm47XG4gICAgICAgIC8vIGVuc3VyZSBoaWdobGlnaHRzIGV4aXN0LCB0aGVuIGp1bXBcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwayk7XG4gICAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBleHBvcnQgQ1NWXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQtY3N2Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBjc3YgPSBbXG4gICAgICAgICAgICBbJ0xpbmUnLCAnU29ydE9yZGVyJywgJ1BhcnRObycsICdRdW90ZVBhcnRLZXknLCAnUnVsZScsICdMZXZlbCcsICdSZWFzb24nXS5qb2luKCcsJyksXG4gICAgICAgICAgICAuLi5pc3N1ZXMubWFwKGkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodiA/PyAnJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAvW1wiLFxcbl0vLnRlc3QocykgPyBgXCIke3MucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImAgOiBzO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgICAgaS5saW5lTnVtYmVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnNvcnRPcmRlciA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5wYXJ0Tm8gPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucXVvdGVQYXJ0S2V5ID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnJ1bGVMYWJlbCB8fCBpLmtpbmQgfHwgJ1ZhbGlkYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICBpLmxldmVsIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLm1lc3NhZ2UgfHwgJydcbiAgICAgICAgICAgICAgICBdLm1hcChlc2MpLmpvaW4oJywnKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF0uam9pbignXFxuJyk7XG5cbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9ICdxdC12YWxpZGF0aW9uLWlzc3Vlcy5jc3YnOyBhLmNsaWNrKCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICB9KTtcblxuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQobW9kYWwpO1xuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG59XG5cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKSB7XG4gICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQ6ICduYXYnIH0pO1xuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcblxuICAgIC8vIGF2b2lkIGR1cGxpY2F0ZVxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgbGV0IGJ0bkVsID0gbnVsbDtcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICBsYWJlbDogJ1ZhbGlkYXRlIExpbmVzJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcbiAgICAgICAgd2VpZ2h0OiAxMzAsXG4gICAgICAgIG9uQ2xpY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaz8uKCdWYWxpZGF0aW5nXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgb2xkIGhpZ2hsaWdodHNcbiAgICAgICAgICAgICAgICBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpc3N1ZXMgPSBBcnJheS5pc0FycmF5KHJlcz8uaXNzdWVzKSA/IHJlcy5pc3N1ZXMgOiBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb3VudCA9IGlzc3Vlcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29uc3QgaGFzRXJyb3IgPSBpc3N1ZXMuc29tZShpID0+IFN0cmluZyhpLmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnZXJyb3InKTtcblxuICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LignXHUyNzA1IExpbmVzIHZhbGlkJywgJ3N1Y2Nlc3MnLCB7IG1zOiAxODAwIH0pO1xuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignVmFsaWQnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdW1tYXJ5ID0gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyNzRDICR7Y291bnR9IHZhbGlkYXRpb24gJHtjb3VudCA9PT0gMSA/ICdpc3N1ZScgOiAnaXNzdWVzJ31gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBtczogNjUwMCB9XG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYFx1Mjc0QyAke2NvdW50fSBpc3N1ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluZm8vd2FybiBvbmx5IChlLmcuLCBhdXRvLW1hbmFnZSBwb3N0cylcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBcdTIxMzlcdUZFMEYgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBhcHBsaWVkYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaW5mbycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBtczogMzUwMCB9XG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYFx1MjEzOVx1RkUwRiAke2NvdW50fSB1cGRhdGUke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaW5mbycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBzaG93IGRldGFpbHMgd2hlbiB3ZSBoYXZlIGFueSBpc3N1ZXMgKGluZm8vd2Fybi9lcnJvcilcbiAgICAgICAgICAgICAgICAgICAgc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGF1dG9NYW5hZ2UgYWN0dWFsbHkgY2hhbmdlZCBQYXJ0X05vIChsZXZlbD13YXJuaW5nKSwgcmVmcmVzaCB0aGUgZ3JpZCAocXQzMCBwYXR0ZXJuKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZWVkc1JlZnJlc2ggPSBpc3N1ZXMuc29tZShpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ua2luZCB8fCAnJykuaW5jbHVkZXMoJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnd2FybmluZycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGk/Lm1ldGE/LmNoYW5nZWQgPT09IHRydWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobmVlZHNSZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/IGBHcmlkIHJlZnJlc2hlZCAoJHttb2RlfSlgIDogJ0dyaWQgcmVmcmVzaCBhdHRlbXB0ZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyAnc3VjY2VzcycgOiAnaW5mbycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgbXM6IDI1MDAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKCdHcmlkIHJlZnJlc2ggZmFpbGVkJywgJ3dhcm4nLCB7IG1zOiAzMDAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBjYWNoZSBsYXN0IHN0YXR1cyBmb3IgU1BBIHJlZHJhd3NcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0gcmVzO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgbHQuY29yZS5odWIuZXJyb3I/LihgVmFsaWRhdGlvbiBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDYwMDAgfSk7XG4gICAgICAgICAgICAgICAgdGFzay5lcnJvcj8uKCdFcnJvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBHcmFiIGJhY2sgdGhlIHJlYWwgRE9NIGJ1dHRvbiB0byB1cGRhdGUgdGl0bGUgbGF0ZXJcbiAgICBidG5FbCA9IGh1Yi5fc2hhZG93Py5xdWVyeVNlbGVjdG9yPy4oYFtkYXRhLWlkPVwiJHtIVUJfQlROX0lEfVwiXWApO1xuXG4gICAgY29uc3Qgb2ZmU2V0dGluZ3MgPSBvblNldHRpbmdzQ2hhbmdlPy4oKCkgPT4gcmVmcmVzaExhYmVsKGJ0bkVsKSk7XG4gICAgcmVmcmVzaExhYmVsKGJ0bkVsKTtcblxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgIG9mZlNldHRpbmdzPy4oKTtcbiAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZWZyZXNoTGFiZWwoYnRuKSB7XG4gICAgaWYgKCFidG4pIHJldHVybjtcbiAgICBjb25zdCBzID0gZ2V0U2V0dGluZ3MoKTtcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xuICAgIC8vaWYgKHMuZm9yYmlkWmVyb1ByaWNlKSBwYXJ0cy5wdXNoKCdcdTIyNjAkMCcpO1xuICAgIGlmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xuICAgIGlmIChzLm1heFVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjQke3MubWF4VW5pdFByaWNlfWApO1xuICAgIGJ0bi50aXRsZSA9IGBSdWxlczogJHtwYXJ0cy5qb2luKCcsICcpIHx8ICdub25lJ31gO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCkge1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXR2LXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ3F0di1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuLnF0di1yb3ctZmFpbCB7IG91dGxpbmU6IDJweCBzb2xpZCByZ2JhKDIyMCwgMzgsIDM4LCAuODUpICFpbXBvcnRhbnQ7IG91dGxpbmUtb2Zmc2V0OiAtMnB4OyB9XG4ucXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0IHsgYmFja2dyb3VuZDogcmdiYSgyNTQsIDIyNiwgMjI2LCAuNjUpICFpbXBvcnRhbnQ7IH0gIC8qIHJlZC1pc2ggKi9cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDIxOSwgMjM0LCAyNTQsIC42NSkgIWltcG9ydGFudDsgfSAgLyogYmx1ZS1pc2ggKi9cblxuLyogTW9kYWwgc2hlbGwgKi9cbiNxdHYtbW9kYWwtb3ZlcmxheSB7IHBvc2l0aW9uOmZpeGVkOyBpbnNldDowOyBiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsLjM4KTsgei1pbmRleDoxMDAwMDM7IH1cbiNxdHYtbW9kYWwge1xuICBwb3NpdGlvbjphYnNvbHV0ZTsgdG9wOjUwJTsgbGVmdDo1MCU7IHRyYW5zZm9ybTp0cmFuc2xhdGUoLTUwJSwtNTAlKTtcbiAgYmFja2dyb3VuZDojZmZmOyB3aWR0aDptaW4oOTYwcHgsIDk0dncpOyBtYXgtaGVpZ2h0Ojgwdmg7IG92ZXJmbG93OmhpZGRlbjtcbiAgYm9yZGVyLXJhZGl1czoxMnB4OyBib3gtc2hhZG93OjAgMThweCA0MHB4IHJnYmEoMCwwLDAsLjI4KTtcbiAgZm9udC1mYW1pbHk6c3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmO1xufVxuXG4vKiBIZWFkZXIgKi9cbiNxdHYtbW9kYWwgLnF0di1oZCB7XG4gIGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6MTJweDtcbiAgcGFkZGluZzoxNHB4IDE2cHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxODBkZWcsICNmYmZiZmIgMCUsICNmN2Y3ZjcgMTAwJSk7XG59XG4jcXR2LW1vZGFsIC5xdHYtaGQgaDMgeyBtYXJnaW46MDsgZm9udC1zaXplOjE2cHg7IGZvbnQtd2VpZ2h0OjYwMDsgY29sb3I6IzBmMTcyYTsgfVxuI3F0di1tb2RhbCAucXR2LWFjdGlvbnMgeyBtYXJnaW4tbGVmdDphdXRvOyBkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IH1cbiNxdHYtbW9kYWwgLnF0di1hY3Rpb25zIC5idG4geyBib3JkZXItcmFkaXVzOjhweDsgbGluZS1oZWlnaHQ6MS4zOyBwYWRkaW5nOjZweCAxMHB4OyB9XG5cbi8qIEJvZHkgKi9cbiNxdHYtbW9kYWwgLnF0di1iZCB7IHBhZGRpbmc6MTBweCAxNHB4IDE0cHg7IG92ZXJmbG93OmF1dG87IG1heC1oZWlnaHQ6Y2FsYyg4MHZoIC0gNTZweCk7IH1cblxuLyogVGFibGUgKi9cbiNxdHYtbW9kYWwgdGFibGUgeyB3aWR0aDoxMDAlOyBib3JkZXItY29sbGFwc2U6c2VwYXJhdGU7IGJvcmRlci1zcGFjaW5nOjA7IGZvbnQtc2l6ZToxM3B4OyB9XG4jcXR2LW1vZGFsIHRoZWFkIHRoIHtcbiAgcG9zaXRpb246IHN0aWNreTsgdG9wOiAwOyB6LWluZGV4OiAxO1xuICBiYWNrZ3JvdW5kOiNmZmY7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7IHBhZGRpbmc6OHB4IDEwcHg7IHRleHQtYWxpZ246bGVmdDsgY29sb3I6IzQ3NTU2OTtcbn1cbiNxdHYtbW9kYWwgdGJvZHkgdGQgeyBwYWRkaW5nOjhweCAxMHB4OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZjFmNWY5OyB9XG4jcXR2LW1vZGFsIHRib2R5IHRyOm50aC1jaGlsZChvZGQpIHsgYmFja2dyb3VuZDojZmNmZGZmOyB9XG4jcXR2LW1vZGFsIHRib2R5IHRyOmhvdmVyIHsgYmFja2dyb3VuZDojZjFmNWY5OyBjdXJzb3I6cG9pbnRlcjsgfVxuI3F0di1tb2RhbCB0ZDpudGgtY2hpbGQoMSkgeyB3aWR0aDoxMDBweDsgfSAgICAgICAgICAgLyogU29ydCBPcmRlciAqL1xuI3F0di1tb2RhbCB0ZDpudGgtY2hpbGQoMikgeyB3aWR0aDoyMjBweDsgfSAgICAgICAgICAgLyogUGFydCAjICAgICovXG4jcXR2LW1vZGFsIHRkOmxhc3QtY2hpbGQgeyB3b3JkLWJyZWFrOiBicmVhay13b3JkOyB9ICAvKiBSZWFzb24gICAgKi9cblxuLyogUGlsbHMgKi9cbiNxdHYtbW9kYWwgLnF0di1waWxsIHsgZGlzcGxheTppbmxpbmUtYmxvY2s7IHBhZGRpbmc6MnB4IDhweDsgYm9yZGVyOjFweCBzb2xpZCAjZTJlOGYwOyBib3JkZXItcmFkaXVzOjk5OXB4OyBmb250LXNpemU6MTJweDsgfVxuYDtcblxuXG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cblxuLyoqIFRhZyB2aXNpYmxlIGdyaWQgcm93cyB3aXRoIGRhdGEtcXVvdGUtcGFydC1rZXkgYnkgcmVhZGluZyBLTyBjb250ZXh0ICovXG5mdW5jdGlvbiBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gMDtcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xuICAgICk7XG4gICAgbGV0IHRhZ2dlZCA9IDA7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgaWYgKHIuaGFzQXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JykpIHsgdGFnZ2VkKys7IGNvbnRpbnVlOyB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSBLTz8uY29udGV4dEZvcj8uKHIpO1xuICAgICAgICAgICAgY29uc3Qgdm0gPSBjdHg/LiRkYXRhID8/IGN0eD8uJHJvb3QgPz8gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWU/Lih2bSwgJ1F1b3RlUGFydEtleScpO1xuICAgICAgICAgICAgaWYgKHFwayAhPSBudWxsICYmIHFwayAhPT0gJycgJiYgTnVtYmVyKHFwaykgPiAwKSB7XG4gICAgICAgICAgICAgICAgci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknLCBTdHJpbmcocXBrKSk7XG4gICAgICAgICAgICAgICAgdGFnZ2VkKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgcGVyLXJvdyBmYWlsdXJlcyAqLyB9XG4gICAgfVxuICAgIHJldHVybiB0YWdnZWQ7XG59XG5mdW5jdGlvbiBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCkge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCcpO1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBGYXN0IHBhdGg6IGF0dHJpYnV0ZSAocHJlZmVycmVkKVxuICAgIGxldCByb3cgPSBncmlkLnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXF1b3RlLXBhcnQta2V5PVwiJHtDU1MuZXNjYXBlKFN0cmluZyhxcGspKX1cIl1gKTtcbiAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuXG4gICAgLy8gSWYgYXR0cmlidXRlcyBhcmUgbWlzc2luZywgdHJ5IHRvIHRhZyB0aGVtIG9uY2UgdGhlbiByZXRyeVxuICAgIGlmIChlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkgPiAwKSB7XG4gICAgICAgIHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgICAgICBpZiAocm93KSByZXR1cm4gcm93LmNsb3Nlc3QoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93JykgfHwgcm93O1xuICAgIH1cblxuICAgIC8vIExhc3QgcmVzb3J0OiB0ZXh0dWFsIHNjYW4gKGxlc3MgcmVsaWFibGUsIGJ1dCB3b3JrcyB0b2RheSlcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xuICAgICk7XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgY29uc3QgdHh0ID0gKHIudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKHR4dC5pbmNsdWRlcyhTdHJpbmcocXBrKSkpIHJldHVybiByO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xuaWYgKERFVikge1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgPSAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHIHx8IHt9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcudGFnU3RhdHMgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIGNvbnN0IHJvd3MgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnKSA6IFtdO1xuICAgICAgICBjb25zdCB0YWdnZWQgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1xdW90ZS1wYXJ0LWtleV0nKSA6IFtdO1xuICAgICAgICBjb25zb2xlLmxvZygnW1FUVl0gcm93czonLCByb3dzLmxlbmd0aCwgJ3RhZ2dlZDonLCB0YWdnZWQubGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIHsgdG90YWw6IHJvd3MubGVuZ3RoLCB0YWdnZWQ6IHRhZ2dlZC5sZW5ndGggfTtcbiAgICB9O1xuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcuaGlsaVRlc3QgPSAocXBrKSA9PiB7XG4gICAgICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcbiAgICAgICAgY29uc3QgciA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHIpIHsgci5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnLCAncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7IHIuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgfVxuICAgICAgICByZXR1cm4gISFyO1xuICAgIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBc0NPLFdBQVMsY0FBYztBQUMxQixXQUFPO0FBQUEsTUFDSCxTQUFTLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDNUIsMkJBQTJCLE9BQU8sS0FBSyx5QkFBeUI7QUFBQSxNQUNoRSxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsTUFDdEMsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLElBQzFDO0FBQUEsRUFDSjtBQUNPLFdBQVMsaUJBQWlCLElBQUk7QUFDakMsUUFBSSxPQUFPLE9BQU8sV0FBWSxRQUFPLE1BQU07QUFBQSxJQUFF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dEM7QUFBQSxJQUVKO0FBQUEsRUFDSjtBQVFBLFdBQVMsS0FBSyxnQkFBZ0I7QUFFOUIsTUFBTUMsVUFBUyxDQUFDLHNDQUFzQztBQUN0RCxNQUFJLGFBQWE7QUFFakIsV0FBUyxXQUFXO0FBQ2hCLFFBQUksU0FBUyxXQUFZLFFBQU8sQ0FBQyxDQUFDLFFBQVEsV0FBV0EsT0FBTTtBQUMzRCxXQUFPQSxRQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN2RDtBQUVBLFdBQVMsMEJBQTBCO0FBQy9CLFVBQU0sS0FBSyxTQUFTLGNBQWMsZ0hBQWdIO0FBQ2xKLFlBQVEsSUFBSSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxHQUFHO0FBQUEsRUFDN0Q7QUFFQSxXQUFTLHVCQUF1QjtBQUM1QixXQUFPLG9CQUFvQixLQUFLLHdCQUF3QixDQUFDO0FBQUEsRUFDN0Q7QUFFQSxpQkFBZSxZQUFZO0FBQ3ZCLFFBQUksQ0FBQyxTQUFTLEVBQUcsUUFBTyxRQUFRO0FBQ2hDLFFBQUkscUJBQXFCLEdBQUc7QUFDeEIsVUFBSSxDQUFDLFdBQVksY0FBYSxNQUFNLHNCQUFzQixPQUFPO0FBQUEsSUFDckUsT0FBTztBQUNILGNBQVE7QUFBQSxJQUNaO0FBQUEsRUFDSjtBQUVBLFdBQVMsVUFBVTtBQUFFLFFBQUksWUFBWTtBQUFFLGlCQUFXO0FBQUcsbUJBQWE7QUFBQSxJQUFNO0FBQUEsRUFBRTtBQUcxRSxZQUFVO0FBQ1YsV0FBUyxjQUFjLFNBQVM7QUFDaEMsU0FBTyxpQkFBaUIsY0FBYyxTQUFTO0FBQy9DLE1BQU0sTUFBTSxTQUFTLGNBQWMsd0JBQXdCO0FBQzNELE1BQUksSUFBSyxLQUFJLGlCQUFpQixTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsU0FBUyxNQUFNLFlBQVksTUFBTSxXQUFXLEtBQUssQ0FBQzsiLAogICJuYW1lcyI6IFsiZ2V0SHViIiwgImx0IiwgIlRNVXRpbHMiLCAiS08iLCAiS08iLCAiVE1VdGlscyIsICJERVYiLCAiREVWIiwgIktPIiwgInJ1blZhbGlkYXRpb24iLCAiZ2V0U2V0dGluZ3MiLCAiUk9VVEVTIl0KfQo=
