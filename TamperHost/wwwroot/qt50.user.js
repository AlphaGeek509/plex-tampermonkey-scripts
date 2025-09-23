// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.37
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.37-1758668539406
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.37-1758668539406
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.37-1758668539406
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.37-1758668539406
// @require      http://localhost:5000/lt-core.user.js?v=3.8.37-1758668539406
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2luamVjdEJ1dHRvbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbn07XG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbn07XG5jb25zdCBnZXRWYWwgPSBrID0+IHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoaywgREVGW2tdKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBvblRhcmdldCA9IG9uV2l6YXJkICYmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKVxuICAgICAgICAudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IENPTkZJRy53aXphcmRUYXJnZXRQYWdlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zdCBodWIgPSBhd2FpdCAoYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgaCA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGgpIHJldHVybiBoOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pKCk7XG5cbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgIGNvbnN0IElEID0gJ3F0NTAtc2V0dGluZ3MnO1xuICAgIGNvbnN0IGxpc3RlZCA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSUQpO1xuICAgIGlmIChvblRhcmdldCAmJiAhbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbigncmlnaHQnLCB7XG4gICAgICAgICAgICBpZDogSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1ZhbGlkYXRpb24gXHUyNjk5XHVGRTBFJyxcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJyxcbiAgICAgICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgICAgICBvbkNsaWNrOiBzaG93UGFuZWxcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICghb25UYXJnZXQgJiYgbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZW1vdmU/LihJRCk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAvLyBQcmVmZXIgS08gVk0gbmFtZSBvbiB0aGUgYWN0aXZlIHBhZ2VcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZVBhZ2UgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZVBhZ2UpIDogbnVsbDtcbiAgICAgICAgbGV0IG5hbWUgPSB2bSA/IChLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkpIDogJyc7XG4gICAgICAgIGlmIChuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJykgcmV0dXJuIG5hbWUudHJpbSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB0ZXh0IGluIHRoZSB3aXphcmQgbmF2XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBvblRhcmdldCA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWU7XG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBvblRhcmdldCA/ICcnIDogJ25vbmUnO1xuICAgIH07XG5cbiAgICAvLyBPYnNlcnZlIHRoZSB3aXphcmQgbmF2IGZvciBwYWdlIGNoYW5nZXNcbiAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgaWYgKG5hdiAmJiAhbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQpIHtcbiAgICAgICAgbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQgPSB0cnVlO1xuICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcih1cGRhdGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGUoKTtcbn1cblxuXG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcblxuICAgIC8vIEluaXRpYWxpemUgY29udHJvbCBzdGF0ZXNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKSwgZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpLCBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpKTtcblxuICAgIC8vIENoYW5nZSBoYW5kbGVyc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmVuYWJsZWQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcblxuICAgIC8vIEJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSdWxlOiBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXG4vLyBXaGVuIFBhcnRTdGF0dXMgPT09IFwiUXVvdGVcIiwgUE9TVCB0byBEUyAxMzUwOSB1c2luZyB0aGUgUVQzNSBwYXR0ZXJuOlxuLy8gICBRdW90ZV9LZXkgPSB2bVF1b3RlS2V5XG4vLyAgIFBhcnRfS2V5ICA9IHZtUGFydEtleVxuLy8gICBQYXJ0X05vICAgPSBRdW90ZV9ObyB8fCBcIl9cIiB8fCB2bVBhcnRObyAgIChRdW90ZV9ObyByZXNvbHZlZCB2aWEgbHQuY29yZSBRVEY7IHNlc3Npb24gZmFsbGJhY2spXG4vLyAgIE5vdGUgICAgICA9IFwiYXV0byBtYW5hZ2VkXCJcbi8vIFVzZXMgZ2V0UGxleEZhY2FkZSgpICsgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggKyBwbGV4LmRzUm93cyguLi4pLlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBhc3luYyBmdW5jdGlvbiBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgaWYgKCFzZXR0aW5ncz8uYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSkgcmV0dXJuIGlzc3VlcztcblxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuICAgIGNvbnN0IGx0ID0gKFJPT1QubHQgfHwge30pO1xuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcbiAgICAgICAgY29uc3QgaW1wbCA9IGx0Py5jb3JlPy5hdXRoPy53aXRoRnJlc2hBdXRoO1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcbiAgICB9O1xuXG4gICAgLy8gUVRGIChmbGF0IHJlcG8pIGxpa2UgUVQzNVxuICAgIGNvbnN0IFFURiA9IGx0LmNvcmU/LmRhdGE/Lm1ha2VGbGF0U2NvcGVkUmVwb1xuICAgICAgICA/IGx0LmNvcmUuZGF0YS5tYWtlRmxhdFNjb3BlZFJlcG8oeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSlcbiAgICAgICAgOiBudWxsO1xuXG4gICAgY29uc3QgRFNfUVVPVEVfSEVBREVSX0dFVCA9IDMxNTY7ICAgLy8gaHlkcmF0ZSBRdW90ZV9ObyBpZiBtaXNzaW5nXG4gICAgY29uc3QgRFNfTUFOQUdFX1BBUlROTyA9IDEzNTA5OyAgLy8geW91ciB0YXJnZXQgRFMgdG8gcG9zdCBQYXJ0X05vXG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRQbGV4KCkge1xuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBST09ULmdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICA/IGF3YWl0IFJPT1QuZ2V0UGxleEZhY2FkZSgpXG4gICAgICAgICAgICA6IChsdD8uY29yZT8ucGxleCk7XG4gICAgICAgIGlmICghcGxleCkgdGhyb3cgbmV3IEVycm9yKCdQbGV4IGZhY2FkZSBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgIHJldHVybiBwbGV4O1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRvIHNlc3Npb24gc3RvcmFnZSBpZiBRVEYvcGxleCBoeWRyYXRpb24gbm90IHJlYWR5XG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCkge1xuICAgICAgICB0cnkgeyByZXR1cm4gKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ1F1b3RlX05vJykgfHwgJycpLnRyaW0oKTsgfSBjYXRjaCB7IHJldHVybiAnJzsgfVxuICAgIH1cblxuICAgIC8vIFJlc29sdmUgUXVvdGVfTm8gZm9yIGEgZ2l2ZW4gUXVvdGVLZXkgdXNpbmcgUVRGOyBoeWRyYXRlIG9uY2UgZnJvbSBEUyBpZiBuZWVkZWQuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UXVvdGVOb0ZvclF1b3RlS2V5KHFrKSB7XG4gICAgICAgIGNvbnN0IHFLZXkgPSBOdW1iZXIocWspO1xuICAgICAgICBpZiAoIXFLZXkgfHwgIU51bWJlci5pc0Zpbml0ZShxS2V5KSB8fCBxS2V5IDw9IDApIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFRVEYpIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcblxuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSBRVEYudXNlKHFLZXkpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcblxuICAgICAgICAgICAgbGV0IGhlYWQgPSBhd2FpdCByZXBvLmdldEhlYWRlcj8uKCk7XG4gICAgICAgICAgICBpZiAoIWhlYWQ/LlF1b3RlX05vKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGxleCA9IGF3YWl0IGdldFBsZXgoKTtcbiAgICAgICAgICAgICAgICBpZiAocGxleD8uZHNSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKERTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocUtleSkgfSkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaXJzdCA9IEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGggPyByb3dzWzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXVvdGVObyA9IGZpcnN0Py5RdW90ZV9ObyA/PyBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAocXVvdGVObyAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCByZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IHFLZXksIFF1b3RlX05vOiBxdW90ZU5vLCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlYWQgPSBhd2FpdCByZXBvLmdldEhlYWRlcj8uKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBxbiA9IGhlYWQ/LlF1b3RlX05vO1xuICAgICAgICAgICAgcmV0dXJuIChxbiA9PSBudWxsID8gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCkgOiBTdHJpbmcocW4pLnRyaW0oKSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSXRlcmF0ZSBRdW90ZVBhcnQgZ3JvdXBzLCByZXNvbHZlIFF1b3RlX05vIG9uY2UgcGVyIGdyb3VwLCB0aGVuIHBvc3QgcGVyLXJvdyB3aGVuIHN0YXR1cyA9PT0gJ1F1b3RlJ1xuICAgIGZvciAoY29uc3QgW3FwaywgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgYW55ID0gQXJyYXkuaXNBcnJheShncm91cCkgJiYgZ3JvdXAubGVuZ3RoID8gZ3JvdXBbMF0gOiBudWxsO1xuICAgICAgICBjb25zdCBncm91cFF1b3RlS2V5ID0gdXRpbHMuZ2V0KGFueSwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG5cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRRdW90ZU5vID0gYXdhaXQgZ2V0UXVvdGVOb0ZvclF1b3RlS2V5KGdyb3VwUXVvdGVLZXkpO1xuXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCB1bmlxdWUgUGFydEtleSBleGFjdGx5IG9uY2VcbiAgICAgICAgY29uc3QgdW5pcUJ5UGFydEtleSA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCByb3cgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHBrID0gdXRpbHMuZ2V0KHJvdywgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUocGspICYmICF1bmlxQnlQYXJ0S2V5LmhhcyhwaykpIHtcbiAgICAgICAgICAgICAgICB1bmlxQnlQYXJ0S2V5LnNldChwaywgcm93KTsgLy8gZmlyc3Qgcm93IHdpbnNcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgciBvZiB1bmlxQnlQYXJ0S2V5LnZhbHVlcygpKSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXMgPSBTdHJpbmcodXRpbHMuZ2V0KHIsICdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pIHx8ICcnKTtcbiAgICAgICAgICAgIGlmIChzdGF0dXMudG9Mb3dlckNhc2UoKSAhPT0gJ3F1b3RlJykgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHZtUXVvdGVLZXkgPSBncm91cFF1b3RlS2V5ID8/IHV0aWxzLmdldChyLCAnUXVvdGVLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydEtleSA9IHV0aWxzLmdldChyLCAnUGFydEtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3Qgdm1QYXJ0Tm8gPSBTdHJpbmcodXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycpO1xuXG4gICAgICAgICAgICAvLyBJZGVtcG90ZW5jeSBndWFyZDpcbiAgICAgICAgICAgIC8vICAgSWYgd2UgaGF2ZSBRdW90ZV9ObywgZGVzaXJlZCBwcmVmaXggaXMgXCI8UXVvdGVfTm8+X1wiXG4gICAgICAgICAgICAvLyAgIElmIG5vdCwgZGVzaXJlZCBwcmVmaXggaXMgXCJfXCIgKHBlciBvcmlnaW5hbCBzcGVjKS5cbiAgICAgICAgICAgIGNvbnN0IGhhc1F1b3RlTm8gPSAhIXJlc29sdmVkUXVvdGVObztcbiAgICAgICAgICAgIGNvbnN0IGRlc2lyZWRQcmVmaXggPSBoYXNRdW90ZU5vID8gYCR7cmVzb2x2ZWRRdW90ZU5vfV9gIDogYF9gO1xuICAgICAgICAgICAgY29uc3QgYWxyZWFkeU1hbmFnZWQgPSB2bVBhcnROby5zdGFydHNXaXRoKGRlc2lyZWRQcmVmaXgpO1xuXG4gICAgICAgICAgICAvLyBJZiBhbHJlYWR5IG5vcm1hbGl6ZWQsIHNraXAgRFMgY2FsbCBhbmQgbm90ZSBpdCAoc28gdXNlcnMga25vdyBpdCB3YXMgY2hlY2tlZCkuXG4gICAgICAgICAgICBpZiAoYWxyZWFkeU1hbmFnZWQpIHtcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2luZm8nLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwayxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYE5vIGNoYW5nZTogUGFydF9ObyBhbHJlYWR5IG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiBmYWxzZSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEJ1aWxkIHRoZSBkZXNpcmVkIFBhcnRfTm8ganVzdCBvbmNlIChhdm9pZCBkb3VibGUtcHJlZml4aW5nIG9uIHN1YnNlcXVlbnQgcnVucylcbiAgICAgICAgICAgIGNvbnN0IHBhcnROb0ZvclBvc3QgPSBgJHtkZXNpcmVkUHJlZml4fSR7dm1QYXJ0Tm99YDtcblxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHtcbiAgICAgICAgICAgICAgICBRdW90ZV9LZXk6IFN0cmluZyh2bVF1b3RlS2V5ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBQYXJ0X0tleTogU3RyaW5nKHZtUGFydEtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9ObzogU3RyaW5nKHBhcnROb0ZvclBvc3QgPz8gJycpLFxuICAgICAgICAgICAgICAgIE5hbWU6ICdhdXRvIG1hbmFnZWQnLFxuICAgICAgICAgICAgICAgIFVwZGF0ZV9QYXJ0OiB0cnVlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHRocm93IG5ldyBFcnJvcigncGxleC5kc1Jvd3MgdW5hdmFpbGFibGUnKTtcblxuICAgICAgICAgICAgICAgIC8vIFFUMzUtc3R5bGUgRFMgY2FsbCB3aXRoIGF1dGggd3JhcHBlclxuICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgICAgICAgICAgYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19NQU5BR0VfUEFSVE5PLCBib2R5KSk7XG5cbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwayxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFBhcnRfTm8gXHUyMDFDJHtib2R5LlBhcnRfTm99XHUyMDFEIGF1dG8gbWFuYWdlZC5gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IHRydWUgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBEUyAke0RTX01BTkFHRV9QQVJUTk99IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGlzc3Vlcztcbn1cblxuLy8gTGFiZWwgdGhlIHJ1bGUgZm9yIHRoZSBtb2RhbFxuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5tZXRhID0geyBpZDogJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLCBsYWJlbDogJ0F1dG8tTWFuYWdlIExUIFBhcnQgTm8nIH07XG4iLCAiLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSdWxlOiBtaW5Vbml0UHJpY2Vcbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gdGhlIGVmZmVjdGl2ZSB1bml0IHByaWNlIGlzIGJlbG93IHRoZSBjb25maWd1cmVkIG1pbmltdW0uXG4vLyBSZWFkcyBmcm9tIHNldHRpbmdzLm1pblVuaXRQcmljZSAobnVsbGFibGUpLlxuLy8gUHJlY2VkZW5jZSBmb3IgdW5pdCBwcmljZSBmaWVsZHM6XG4vLyAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZSA+IFJ2VW5pdFByaWNlQ29weSA+IFVuaXRQcmljZVxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtaW5Vbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICBjb25zdCBtaW4gPSBOdW1iZXIoc2V0dGluZ3MubWluVW5pdFByaWNlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtaW4pKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdCA9IChuKSA9PiAoTnVtYmVyLmlzRmluaXRlKG4pXG4gICAgICAgICAgICAgICAgICAgID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KVxuICAgICAgICAgICAgICAgICAgICA6IFN0cmluZyhuKSk7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWluVW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9IDwgTWluICR7Zm10KG1pbil9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWluIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcblxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdCA9IChuKSA9PiAoTnVtYmVyLmlzRmluaXRlKG4pID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KSA6IFN0cmluZyhuKSk7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWF4VW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9ID4gTWF4ICR7Zm10KG1heCl9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XG4vL2ltcG9ydCBmb3JiaWRaZXJvUHJpY2UgZnJvbSAnLi9mb3JiaWRaZXJvUHJpY2UnO1xuaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcblxuZXhwb3J0IGRlZmF1bHQgW2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgIC8vcmVxdWlyZVJlc29sdmVkUGFydCwgZm9yYmlkWmVyb1ByaWNlLCBcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcbmltcG9ydCBydWxlcyBmcm9tICcuL3J1bGVzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcbiAgICBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1ncmlkJywgeyByZXF1aXJlS286IHRydWUsIHRpbWVvdXRNczogMTIwMDAgfSk7XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBjb25zdCBndm0gPSBncmlkID8gS08/LmRhdGFGb3I/LihncmlkKSA6IG51bGw7XG5cbiAgICBjb25zdCByb3dzID0gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCBxcCA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ1F1b3RlUGFydEtleScpID8/IC0xO1xuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xuICAgIH1cblxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBjb25zdCBwID0gZ3JvdXAuZmluZChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ0lzVW5pcXVlUXVvdGVQYXJ0JykgPT09IDEpIHx8IGdyb3VwWzBdO1xuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcbiAgICB9XG5cbiAgICBjb25zdCBjdHggPSB7XG4gICAgICAgIHJvd3MsXG4gICAgICAgIGdyb3Vwc0J5UXVvdGVQYXJ0LFxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXG4gICAgICAgIGxhc3RGb3JtOiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZUZvcm0/LigpLFxuICAgICAgICBsYXN0UmVzdWx0OiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZT8uKClcbiAgICB9O1xuXG4gICAgY29uc3QgdXRpbHMgPSB7IGdldDogKG9iaiwgcGF0aCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShvYmosIHBhdGgsIG9wdHMpIH07XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocnVsZXMubWFwKHJ1bGUgPT4gcnVsZShjdHgsIHNldHRpbmdzLCB1dGlscykpKTtcbiAgICBjb25zdCBpc3N1ZXNSYXcgPSByZXN1bHRzLmZsYXQoKTtcbiAgICBjb25zdCBvayA9IGlzc3Vlc1Jhdy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xuXG4gICAgLy8gRW5yaWNoIGlzc3VlcyB3aXRoIFVJLWZhY2luZyBkYXRhIChsaW5lTnVtYmVyLCBwYXJ0Tm8sIHJ1bGVMYWJlbClcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiBOdW1iZXIoU3RyaW5nKHYgPz8gJycpLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgY29uc3QgcnVsZUxhYmVsRnJvbSA9IChpc3MpID0+IHtcbiAgICAgICAgLy8gUHJlZmVycmVkOiBydWxlIGZ1bmN0aW9uIHNldHMgLm1ldGEubGFiZWwgKGUuZy4sIG1heFVuaXRQcmljZS5tZXRhLmxhYmVsKVxuICAgICAgICBpZiAoaXNzPy5tZXRhPy5sYWJlbCkgcmV0dXJuIGlzcy5tZXRhLmxhYmVsO1xuICAgICAgICBpZiAoaXNzPy5raW5kKSB7XG4gICAgICAgICAgICBjb25zdCBrID0gU3RyaW5nKGlzcy5raW5kKTtcbiAgICAgICAgICAgIC8vIHByZXR0aWZ5IFwicHJpY2UubWF4VW5pdFByaWNlXCIgPT4gXCJNYXggVW5pdCBQcmljZVwiXG4gICAgICAgICAgICBjb25zdCB0YWlsID0gay5zcGxpdCgnLicpLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRhaWxcbiAgICAgICAgICAgICAgICA/IHRhaWwucmVwbGFjZSgvKFthLXpdKShbQS1aXSkvZywgJyQxICQyJylcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL14uLywgKGMpID0+IGMudG9VcHBlckNhc2UoKSlcbiAgICAgICAgICAgICAgICA6IGs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICdWYWxpZGF0aW9uJztcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgYSBxdWljayBtYXAgb2Ygcm93IC0+IGluZm9cbiAgICBjb25zdCByb3dJbmZvID0gbmV3IE1hcCgpOyAvLyB2bSAtPiB7IGxpbmVOdW1iZXIsIHBhcnRObyB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdHgucm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCByID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3QgcGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJyc7XG4gICAgICAgIHJvd0luZm8uc2V0KHIsIHsgbGluZU51bWJlciwgcGFydE5vIH0pO1xuICAgIH1cblxuICAgIC8vIEFsc28gbWFwIFFQSyAtPiBcInByaW1hcnlcIiByb3cgZm9yIGNoZWFwIGxvb2t1cFxuICAgIGNvbnN0IHFwa1RvUHJpbWFyeUluZm8gPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBbcXAsIHByaW1hcnldIG9mIGN0eC5wcmltYXJ5QnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IGluZm8gPSByb3dJbmZvLmdldChwcmltYXJ5KSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogdXRpbHMuZ2V0KHByaW1hcnksICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycgfTtcbiAgICAgICAgcXBrVG9QcmltYXJ5SW5mby5zZXQocXAsIGluZm8pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIGEgU29ydE9yZGVyIGxvb2t1cCBieSB2aXN1YWwgcm93IGluZGV4IChmcm9tIHRoZSBWTSwgbm90IHRoZSBET00pXG4gICAgY29uc3Qgc29ydEJ5TGluZSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGN0eC5yb3dzW2ldO1xuICAgICAgICBjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG4gICAgICAgIGNvbnN0IHNvcnRPcmRlciA9IHV0aWxzLmdldChyb3csICdTb3J0T3JkZXInLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgc29ydEJ5TGluZS5zZXQobGluZU51bWJlciwgc29ydE9yZGVyKTtcbiAgICB9XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBpc3N1ZXNSYXcubWFwKGlzcyA9PiB7XG4gICAgICAgIGNvbnN0IHFwayA9IGlzcy5xdW90ZVBhcnRLZXkgPz8gLTE7XG4gICAgICAgIGNvbnN0IGluZm8gPSBxcGtUb1ByaW1hcnlJbmZvLmdldChxcGspIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiAnJyB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uaXNzLFxuICAgICAgICAgICAgbGluZU51bWJlcjogaW5mby5saW5lTnVtYmVyLFxuICAgICAgICAgICAgcGFydE5vOiBpbmZvLnBhcnRObyxcbiAgICAgICAgICAgIHJ1bGVMYWJlbDogcnVsZUxhYmVsRnJvbShpc3MpLFxuICAgICAgICAgICAgc29ydE9yZGVyOiBzb3J0QnlMaW5lLmdldChpbmZvLmxpbmVOdW1iZXIgPz8gLTEpXG4gICAgICAgIH07XG4gICAgfSk7XG5cblxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxuICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSB7IGF0OiBEYXRlLm5vdygpLCBvaywgaXNzdWVzIH07XG5cbiAgICByZXR1cm4geyBvaywgaXNzdWVzIH07XG59XG5cbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cbmlmIChfX0JVSUxEX0RFVl9fKSB7XG4gICAgLy8gTWluaW1hbCBLTy9ncmlkIHJlc29sdmVycyBrZXB0IGxvY2FsIHRvIGRlYnVnIGhlbHBlcnNcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFZNKCkge1xuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICByZXR1cm4gZ3JpZCA/IChLTz8uZGF0YUZvcj8uKGdyaWQpIHx8IG51bGwpIDogbnVsbDtcbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0R3JpZFJvd3MoKSB7XG4gICAgICAgIGNvbnN0IGd2bSA9IGdldEdyaWRWTSgpO1xuICAgICAgICByZXR1cm4gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcGxhaW5Sb3cocikge1xuICAgICAgICBjb25zdCBndiA9IChwLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsIHAsIG9wdHMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgUXVvdGVQYXJ0S2V5OiBndignUXVvdGVQYXJ0S2V5JyksXG4gICAgICAgICAgICBQYXJ0Tm86IGd2KCdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSksXG4gICAgICAgICAgICBQYXJ0U3RhdHVzOiBndignUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFF1YW50aXR5OiBndignUXVhbnRpdHknKSxcbiAgICAgICAgICAgIFVuaXRQcmljZTogZ3YoJ1VuaXRQcmljZScpLFxuICAgICAgICAgICAgUnZVbml0UHJpY2VDb3B5OiBndignUnZVbml0UHJpY2VDb3B5JyksXG4gICAgICAgICAgICBSdkN1c3RvbWl6ZWRVbml0UHJpY2U6IGd2KCdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSxcbiAgICAgICAgICAgIElzVW5pcXVlUXVvdGVQYXJ0OiBndignSXNVbmlxdWVRdW90ZVBhcnQnKVxuICAgICAgICB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0NTVihvYmpzKSB7XG4gICAgICAgIGlmICghb2Jqcz8ubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgICAgIGNvbnN0IGNvbHMgPSBPYmplY3Qua2V5cyhvYmpzWzBdKTtcbiAgICAgICAgY29uc3QgZXNjID0gKHYpID0+ICh2ID09IG51bGwgPyAnJyA6IFN0cmluZyh2KS5pbmNsdWRlcygnLCcpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXCInKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1xcbicpXG4gICAgICAgICAgICA/IGBcIiR7U3RyaW5nKHYpLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgXG4gICAgICAgICAgICA6IFN0cmluZyh2KSk7XG4gICAgICAgIGNvbnN0IGhlYWQgPSBjb2xzLmpvaW4oJywnKTtcbiAgICAgICAgY29uc3QgYm9keSA9IG9ianMubWFwKG8gPT4gY29scy5tYXAoYyA9PiBlc2Mob1tjXSkpLmpvaW4oJywnKSkuam9pbignXFxuJyk7XG4gICAgICAgIHJldHVybiBoZWFkICsgJ1xcbicgKyBib2R5O1xuICAgIH1cbiAgICBmdW5jdGlvbiBkb3dubG9hZChuYW1lLCBibG9iKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9IG5hbWU7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDIwMDApO1xuICAgIH1cblxuICAgIHVuc2FmZVdpbmRvdy5RVFZfREVCVUcgPSB7XG4gICAgICAgIC8vIFNldHRpbmdzIGhlbHBlcnNcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XG4gICAgICAgICAgICBlbmFibGVkOiBHTV9nZXRWYWx1ZSgncXR2LmVuYWJsZWQnKSxcbiAgICAgICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IEdNX2dldFZhbHVlKCdxdHYuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLFxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxuICAgICAgICAgICAgbWF4VW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1heFVuaXRQcmljZScpXG4gICAgICAgIH0pLFxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXG4gICAgICAgIHNldFZhbHVlOiAoa2V5LCB2YWwpID0+IEdNX3NldFZhbHVlKGtleSwgdmFsKSxcblxuICAgICAgICAvLyBHcmlkIGV4cG9ydGVyc1xuICAgICAgICBncmlkOiAoeyBwbGFpbiA9IHRydWUgfSA9IHt9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gZ2V0R3JpZFJvd3MoKTtcbiAgICAgICAgICAgIHJldHVybiBwbGFpbiA/IHJvd3MubWFwKHBsYWluUm93KSA6IHJvd3M7XG4gICAgICAgIH0sXG4gICAgICAgIGdyaWRUYWJsZTogKCkgPT4gY29uc29sZS50YWJsZT8uKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKSxcblxuICAgICAgICAvLyBDU1YvSlNPTiBkb3dubG9hZGVyc1xuICAgICAgICBkb3dubG9hZEdyaWRKU09OOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5qc29uJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pLCBudWxsLCAyKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbZGF0YV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgZG93bmxvYWRHcmlkQ1NWOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5jc3YnKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjc3YgPSB0b0NTVih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSk7XG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gVmFsaWRhdGlvbiBvbi1kZW1hbmQgKHNhbWUgZW5naW5lIGFzIHRoZSBidXR0b24pXG4gICAgICAgIHZhbGlkYXRlTm93OiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHJ1blZhbGlkYXRpb24gfSA9IGF3YWl0IGltcG9ydCgnLi9lbmdpbmUuanMnKTsgLy8gc2FtZSBtb2R1bGUgdXNlZCBieSB0aGUgaHViIGJ1dHRvblxuICAgICAgICAgICAgY29uc3QgeyBnZXRTZXR0aW5ncyB9ID0gYXdhaXQgaW1wb3J0KCcuL2luZGV4LmpzJyk7XG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIGdldFNldHRpbmdzKCkpO1xuICAgICAgICAgICAgY29uc29sZS50YWJsZT8uKHJlcy5pc3N1ZXMgfHwgW10pO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBRdWljayBleHBlY3RhdGlvbiBoZWxwZXI6IFx1MjAxQ3Nob3cgbWUgcm93cyBhYm92ZSBtYXhcdTIwMURcbiAgICAgICAgZXhwZWN0VW5kZXJNYXg6IChtYXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldCA9IE51bWJlcihtYXgpO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIHJvd3NcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKHIgPT4gTnVtYmVyLmlzRmluaXRlKHIuX1VuaXROdW0pICYmIHIuX1VuaXROdW0gPiBzZXQpXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcbiAgICAgICAgfSxcblxuICAgICAgICB1bmRlck1pbjogKG1pbikgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1pbik7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA8IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgfTtcbn1cblxuXG4vLyBFbnN1cmUgdGhlIHNldHRpbmdzIFVJIGxvYWRzIChnZWFyIGJ1dHRvbiwgc3RvcmFnZSBBUEkpXG5pbXBvcnQgJy4vaW5kZXguanMnO1xuLy8gTW91bnRzIHRoZSBWYWxpZGF0ZSBMaW5lcyBidXR0b24gJiB3aXJlcyBjbGljayB0byB0aGUgZW5naW5lXG5pbXBvcnQgeyBtb3VudFZhbGlkYXRpb25CdXR0b24gfSBmcm9tICcuL2luamVjdEJ1dHRvbi5qcyc7XG5cblRNVXRpbHM/Lm5ldD8uZW5zdXJlV2F0Y2hlcj8uKCk7IC8vIG9wdGlvbmFsLCBoYXJtbGVzcyBpZiBtaXNzaW5nXG5cbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG5sZXQgdW5tb3VudEJ0biA9IG51bGw7XG5cbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xuICAgIGlmIChUTVV0aWxzPy5tYXRjaFJvdXRlKSByZXR1cm4gISFUTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKTtcbiAgICByZXR1cm4gUk9VVEVTLnNvbWUocmUgPT4gcmUudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcbiAgICByZXR1cm4gKGxpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbn1cblxuZnVuY3Rpb24gaXNPblRhcmdldFdpemFyZFBhZ2UoKSB7XG4gICAgcmV0dXJuIC9ecGFydFxccypzdW1tYXJ5JC9pLnRlc3QoZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XG4gICAgaWYgKGlzT25UYXJnZXRXaXphcmRQYWdlKCkpIHtcbiAgICAgICAgaWYgKCF1bm1vdW50QnRuKSB1bm1vdW50QnRuID0gYXdhaXQgbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHVubW91bnQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVubW91bnQoKSB7IGlmICh1bm1vdW50QnRuKSB7IHVubW91bnRCdG4oKTsgdW5tb3VudEJ0biA9IG51bGw7IH0gfVxuXG4vLyBpbml0aWFsICsgU1BBIHdpcmluZyAobWlycm9ycyBxdDMwL3F0MzUpXG5yZWNvbmNpbGUoKTtcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlKTtcbmNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuXG4iLCAiLy8gQWRkcyBhIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBhbmQgd2lyZXMgaXQgdG8gdGhlIGVuZ2luZS5cbi8vIEFzc3VtZXMgeW91ciBzZXR0aW5ncyBVSSBleHBvcnRzIGdldFNldHRpbmdzL29uU2V0dGluZ3NDaGFuZ2UuXG5cbmltcG9ydCB7IHJ1blZhbGlkYXRpb24gfSBmcm9tICcuL2VuZ2luZSc7XG5pbXBvcnQgeyBnZXRTZXR0aW5ncywgb25TZXR0aW5nc0NoYW5nZSB9IGZyb20gJy4vaW5kZXgnO1xuXG4vLyAtLS0gS08gc3VyZmFjZSAocXQzMCBwYXR0ZXJuKSAtLS1cbmNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbykgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua287XG5cbi8vIC0tLSBzdW1tYXJpemUgaXNzdWVzIGZvciBzdGF0dXMgcGlsbCAvIHRvYXN0cyAtLS1cbmZ1bmN0aW9uIGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IEFycmF5LmlzQXJyYXkoaXNzdWVzKSA/IGlzc3VlcyA6IFtdO1xuICAgICAgICBjb25zdCBhZ2cgPSBpdGVtcy5yZWR1Y2UoKGFjYywgaXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGx2bCA9IFN0cmluZyhpdD8ubGV2ZWwgfHwgJ2luZm8nKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgYWNjW2x2bF0gPSAoYWNjW2x2bF0gfHwgMCkgKyAxO1xuICAgICAgICAgICAgaWYgKGl0Py5xdW90ZVBhcnRLZXkgIT0gbnVsbCkgYWNjLnBhcnRzLmFkZChpdC5xdW90ZVBhcnRLZXkpO1xuICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSwgeyBlcnJvcjogMCwgd2FybmluZzogMCwgaW5mbzogMCwgcGFydHM6IG5ldyBTZXQoKSB9KTtcblxuICAgICAgICBjb25zdCBwYXJ0c0NvdW50ID0gYWdnLnBhcnRzLnNpemU7XG4gICAgICAgIGNvbnN0IHNlZ3MgPSBbXTtcbiAgICAgICAgaWYgKGFnZy5lcnJvcikgc2Vncy5wdXNoKGAke2FnZy5lcnJvcn0gZXJyb3Ike2FnZy5lcnJvciA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLndhcm5pbmcpIHNlZ3MucHVzaChgJHthZ2cud2FybmluZ30gd2FybmluZyR7YWdnLndhcm5pbmcgPT09IDEgPyAnJyA6ICdzJ31gKTtcbiAgICAgICAgaWYgKGFnZy5pbmZvKSBzZWdzLnB1c2goYCR7YWdnLmluZm99IGluZm9gKTtcbiAgICAgICAgY29uc3QgbGV2ZWxQYXJ0ID0gc2Vncy5qb2luKCcsICcpIHx8ICd1cGRhdGVzJztcblxuICAgICAgICByZXR1cm4gYCR7bGV2ZWxQYXJ0fSBhY3Jvc3MgJHtwYXJ0c0NvdW50IHx8IDB9IHBhcnQke3BhcnRzQ291bnQgPT09IDEgPyAnJyA6ICdzJ31gO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxufVxuXG4vLyAtLS0gUVQzMC1zdHlsZSBncmlkIHJlZnJlc2ggKGNvcGllZCkgLS0tXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoUXVvdGVHcmlkKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGdyaWRFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3QgZ3JpZFZNID0gZ3JpZEVsICYmIEtPPy5kYXRhRm9yPy4oZ3JpZEVsKTtcblxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8uZGF0YXNvdXJjZT8ucmVhZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgYXdhaXQgZ3JpZFZNLmRhdGFzb3VyY2UucmVhZCgpOyAgIC8vIGFzeW5jIHJlLXF1ZXJ5L3JlYmluZFxuICAgICAgICAgICAgcmV0dXJuICdkcy5yZWFkJztcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGdyaWRWTT8ucmVmcmVzaCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgZ3JpZFZNLnJlZnJlc2goKTsgICAgICAgICAgICAgICAgICAvLyBzeW5jIHZpc3VhbCByZWZyZXNoXG4gICAgICAgICAgICByZXR1cm4gJ3ZtLnJlZnJlc2gnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXG4gICAgLy8gRmFsbGJhY2s6IHdpemFyZCBuYXZpZ2F0ZSB0byB0aGUgYWN0aXZlIHBhZ2UgKHJlYmluZClcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXogPSB1bnNhZmVXaW5kb3c/LnBsZXg/LmN1cnJlbnRQYWdlPy5RdW90ZVdpemFyZDtcbiAgICAgICAgaWYgKHdpej8ubmF2aWdhdGVQYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmUgPSAodHlwZW9mIHdpei5hY3RpdmVQYWdlID09PSAnZnVuY3Rpb24nKSA/IHdpei5hY3RpdmVQYWdlKCkgOiB3aXouYWN0aXZlUGFnZTtcbiAgICAgICAgICAgIHdpei5uYXZpZ2F0ZVBhZ2UoYWN0aXZlKTtcbiAgICAgICAgICAgIHJldHVybiAnd2l6Lm5hdmlnYXRlUGFnZSc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuXG5cbmNvbnN0IEhVQl9CVE5fSUQgPSAncXQ1MC12YWxpZGF0ZSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdHJ5IHsgY29uc3QgaHViID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaHViKSByZXR1cm4gaHViOyB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzID0gW10pIHtcbiAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG5cbiAgICAvLyBidWlsZCByb3dzXG4gICAgY29uc3Qgcm93c0h0bWwgPSBpc3N1ZXMubWFwKGlzcyA9PiB7XG4gICAgICAgIGNvbnN0IGx2bCA9IChpc3MubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGx2bFBpbGwgPSBgPHNwYW4gY2xhc3M9XCJxdHYtcGlsbFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiR7bHZsID09PSAnZXJyb3InID8gJyNmY2E1YTUnIDogJyNjYmQ1ZTEnfTsgY29sb3I6JHtsdmwgPT09ICdlcnJvcicgPyAnI2I5MWMxYycgOiAnIzMzNDE1NSd9XCI+JHtsdmwgfHwgJ2luZm8nfTwvc3Bhbj5gO1xuICAgICAgICBjb25zdCByZWFzb24gPSBpc3MubWVzc2FnZSB8fCAnKG5vIG1lc3NhZ2UpJztcbiAgICAgICAgY29uc3QgcnVsZSA9IGlzcy5ydWxlTGFiZWwgfHwgaXNzLmtpbmQgfHwgJ1ZhbGlkYXRpb24nO1xuXG4gICAgICAgIHJldHVybiBgXG4gICAgICAgIDx0ciBkYXRhLXFwaz1cIiR7aXNzLnF1b3RlUGFydEtleSA/PyAnJ31cIiBkYXRhLXJ1bGU9XCIke1N0cmluZyhpc3Mua2luZCB8fCAnJyl9XCI+XG4gICAgICAgICAgPHRkPiR7aXNzLnNvcnRPcmRlciA/PyAnJ308L3RkPlxuICAgICAgICAgIDx0ZD4ke2lzcy5wYXJ0Tm8gPz8gJyd9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtydWxlfTwvdGQ+XG4gICAgICAgICAgPHRkPiR7bHZsUGlsbH08L3RkPlxuICAgICAgICAgIDx0ZD4ke3JlYXNvbn08L3RkPlxuICAgICAgICA8L3RyPmBcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBvdmVybGF5LmlkID0gJ3F0di1tb2RhbC1vdmVybGF5JztcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ3F0di1tb2RhbCc7XG4gICAgbW9kYWwuaW5uZXJIVE1MID0gYFxuICA8ZGl2IGNsYXNzPVwicXR2LWhkXCI+XG4gICAgPGgzPlZhbGlkYXRpb24gRGV0YWlsczwvaDM+XG4gICAgPGRpdiBjbGFzcz1cInF0di1hY3Rpb25zXCI+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCIgaWQ9XCJxdHYtZXhwb3J0LWNzdlwiIHRpdGxlPVwiRXhwb3J0IHZpc2libGUgaXNzdWVzIHRvIENTVlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiBpZD1cInF0di1jbG9zZVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG4gIDxkaXYgY2xhc3M9XCJxdHYtYmRcIj5cbiAgICA8dGFibGUgYXJpYS1sYWJlbD1cIlZhbGlkYXRpb24gSXNzdWVzXCI+XG4gICAgICA8dGhlYWQ+XG4gIDx0cj5cbiAgICA8dGg+U29ydCZuYnNwO09yZGVyPC90aD5cbiAgICA8dGg+UGFydCAjPC90aD5cbiAgICA8dGg+UnVsZTwvdGg+XG4gICAgPHRoPkxldmVsPC90aD5cbiAgICA8dGg+UmVhc29uPC90aD5cbiAgPC90cj5cbjwvdGhlYWQ+XG4gICAgICA8dGJvZHk+JHtyb3dzSHRtbCB8fCBgPHRyPjx0ZCBjb2xzcGFuPVwiNVwiIHN0eWxlPVwib3BhY2l0eTouNzsgcGFkZGluZzoxMnB4O1wiPk5vIGlzc3Vlcy48L3RkPjwvdHI+YH08L3Rib2R5PlxuICAgIDwvdGFibGU+XG4gIDwvZGl2PlxuYDtcblxuICAgIC8vIGludGVyYWN0aW9uc1xuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKTtcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBvdmVybGF5KSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcblxuICAgIC8vIGNsaWNrIHJvdyB0byBmb2N1cyArIGhpZ2hsaWdodCArIHNjcm9sbFxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJ3Rib2R5Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgY29uc3QgdHIgPSBlLnRhcmdldC5jbG9zZXN0KCd0cicpOyBpZiAoIXRyKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHFwayA9IHRyLmdldEF0dHJpYnV0ZSgnZGF0YS1xcGsnKTtcbiAgICAgICAgaWYgKCFxcGspIHJldHVybjtcbiAgICAgICAgLy8gZW5zdXJlIGhpZ2hsaWdodHMgZXhpc3QsIHRoZW4ganVtcFxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG4gICAgICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHJvdykge1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJykpO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcpO1xuICAgICAgICAgICAgcm93LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICdjZW50ZXInLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIGV4cG9ydCBDU1ZcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydC1jc3YnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNzdiA9IFtcbiAgICAgICAgICAgIFsnTGluZScsICdTb3J0T3JkZXInLCAnUGFydE5vJywgJ1F1b3RlUGFydEtleScsICdSdWxlJywgJ0xldmVsJywgJ1JlYXNvbiddLmpvaW4oJywnKSxcbiAgICAgICAgICAgIC4uLmlzc3Vlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXNjID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2ID8/ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIC9bXCIsXFxuXS8udGVzdChzKSA/IGBcIiR7cy5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYCA6IHM7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgICBpLmxpbmVOdW1iZXIgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkuc29ydE9yZGVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnBhcnRObyA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5xdW90ZVBhcnRLZXkgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucnVsZUxhYmVsIHx8IGkua2luZCB8fCAnVmFsaWRhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgIGkubGV2ZWwgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIGkubWVzc2FnZSB8fCAnJ1xuICAgICAgICAgICAgICAgIF0ubWFwKGVzYykuam9pbignLCcpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXS5qb2luKCdcXG4nKTtcblxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24taXNzdWVzLmNzdic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChtb2RhbCk7XG4gICAgKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChvdmVybGF5KTtcbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcbiAgICBjb25zdCBodWIgPSBhd2FpdCBnZXRIdWIoeyBtb3VudDogJ25hdicgfSk7XG4gICAgaWYgKCFodWI/LnJlZ2lzdGVyQnV0dG9uKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgLy8gYXZvaWQgZHVwbGljYXRlXG4gICAgaWYgKGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSFVCX0JUTl9JRCkpIHJldHVybiAoKSA9PiB7IH07XG5cbiAgICBsZXQgYnRuRWwgPSBudWxsO1xuICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgIGxhYmVsOiAnVmFsaWRhdGUgTGluZXMnLFxuICAgICAgICB0aXRsZTogJ1ZhbGlkYXRlIHF1b3RlIGxpbmUgcnVsZXMnLFxuICAgICAgICB3ZWlnaHQ6IDEzMCxcbiAgICAgICAgb25DbGljazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBnZXRTZXR0aW5ncz8uKCkgfHwge307XG4gICAgICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrPy4oJ1ZhbGlkYXRpbmdcdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBvbGQgaGlnaGxpZ2h0c1xuICAgICAgICAgICAgICAgIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzc3VlcyA9IEFycmF5LmlzQXJyYXkocmVzPy5pc3N1ZXMpID8gcmVzLmlzc3VlcyA6IFtdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gaXNzdWVzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb25zdCBoYXNFcnJvciA9IGlzc3Vlcy5zb21lKGkgPT4gU3RyaW5nKGkubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICdlcnJvcicpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKCdcdTI3MDUgTGluZXMgdmFsaWQnLCAnc3VjY2VzcycsIHsgbXM6IDE4MDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHRhc2suZG9uZT8uKCdWYWxpZCcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaGFzRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBcdTI3NEMgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ2lzc3VlJyA6ICdpc3N1ZXMnfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IG1zOiA2NTAwIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyNzRDICR7Y291bnR9IGlzc3VlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IHN0aWNreTogdHJ1ZSB9XG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mby93YXJuIG9ubHkgKGUuZy4sIGF1dG8tbWFuYWdlIHBvc3RzKVxuICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYFx1MjEzOVx1RkUwRiAke2NvdW50fSB1cGRhdGUke2NvdW50ID09PSAxID8gJycgOiAncyd9IGFwcGxpZWRgLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IG1zOiAzNTAwIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXM/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgXHUyMTM5XHVGRTBGICR7Y291bnR9IHVwZGF0ZSR7Y291bnQgPT09IDEgPyAnJyA6ICdzJ30gXHUyMDE0ICR7c3VtbWFyeX1gLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7IHN0aWNreTogdHJ1ZSB9XG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHNob3cgZGV0YWlscyB3aGVuIHdlIGhhdmUgYW55IGlzc3VlcyAoaW5mby93YXJuL2Vycm9yKVxuICAgICAgICAgICAgICAgICAgICBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3Vlcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgYXV0b01hbmFnZSBhY3R1YWxseSBjaGFuZ2VkIFBhcnRfTm8gKGxldmVsPXdhcm5pbmcpLCByZWZyZXNoIHRoZSBncmlkIChxdDMwIHBhdHRlcm4pXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5lZWRzUmVmcmVzaCA9IGlzc3Vlcy5zb21lKGkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIFN0cmluZyhpPy5raW5kIHx8ICcnKS5pbmNsdWRlcygnYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICd3YXJuaW5nJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgaT8ubWV0YT8uY2hhbmdlZCA9PT0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChuZWVkc1JlZnJlc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbW9kZSA9IGF3YWl0IHJlZnJlc2hRdW90ZUdyaWQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlID8gYEdyaWQgcmVmcmVzaGVkICgke21vZGV9KWAgOiAnR3JpZCByZWZyZXNoIGF0dGVtcHRlZCAocmVsb2FkIG1heSBiZSBuZWVkZWQpJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/ICdzdWNjZXNzJyA6ICdpbmZvJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBtczogMjUwMCB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0dyaWQgcmVmcmVzaCBmYWlsZWQnLCAnd2FybicsIHsgbXM6IDMwMDAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNhY2hlIGxhc3Qgc3RhdHVzIGZvciBTUEEgcmVkcmF3c1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSByZXM7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5lcnJvcj8uKGBWYWxpZGF0aW9uIGVycm9yOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgeyBtczogNjAwMCB9KTtcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEdyYWIgYmFjayB0aGUgcmVhbCBET00gYnV0dG9uIHRvIHVwZGF0ZSB0aXRsZSBsYXRlclxuICAgIGJ0bkVsID0gaHViLl9zaGFkb3c/LnF1ZXJ5U2VsZWN0b3I/LihgW2RhdGEtaWQ9XCIke0hVQl9CVE5fSUR9XCJdYCk7XG5cbiAgICBjb25zdCBvZmZTZXR0aW5ncyA9IG9uU2V0dGluZ3NDaGFuZ2U/LigoKSA9PiByZWZyZXNoTGFiZWwoYnRuRWwpKTtcbiAgICByZWZyZXNoTGFiZWwoYnRuRWwpO1xuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgb2ZmU2V0dGluZ3M/LigpO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hMYWJlbChidG4pIHtcbiAgICBpZiAoIWJ0bikgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xuICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgLy9pZiAocy5yZXF1aXJlUmVzb2x2ZWRQYXJ0KSBwYXJ0cy5wdXNoKCdQYXJ0Jyk7XG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XG4gICAgaWYgKHMubWluVW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NSR7cy5taW5Vbml0UHJpY2V9YCk7XG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XG4gICAgYnRuLnRpdGxlID0gYFJ1bGVzOiAke3BhcnRzLmpvaW4oJywgJykgfHwgJ25vbmUnfWA7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKSB7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdHYtc3R5bGVzJykpIHJldHVybjtcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gICAgc3R5bGUuaWQgPSAncXR2LXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4ucXR2LXJvdy1mYWlsIHsgb3V0bGluZTogMnB4IHNvbGlkIHJnYmEoMjIwLCAzOCwgMzgsIC44NSkgIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0ycHg7IH1cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NCwgMjI2LCAyMjYsIC42NSkgIWltcG9ydGFudDsgfSAgLyogcmVkLWlzaCAqL1xuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjE5LCAyMzQsIDI1NCwgLjY1KSAhaW1wb3J0YW50OyB9ICAvKiBibHVlLWlzaCAqL1xuXG4vKiBNb2RhbCBzaGVsbCAqL1xuI3F0di1tb2RhbC1vdmVybGF5IHsgcG9zaXRpb246Zml4ZWQ7IGluc2V0OjA7IGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMzgpOyB6LWluZGV4OjEwMDAwMzsgfVxuI3F0di1tb2RhbCB7XG4gIHBvc2l0aW9uOmFic29sdXRlOyB0b3A6NTAlOyBsZWZ0OjUwJTsgdHJhbnNmb3JtOnRyYW5zbGF0ZSgtNTAlLC01MCUpO1xuICBiYWNrZ3JvdW5kOiNmZmY7IHdpZHRoOm1pbig5NjBweCwgOTR2dyk7IG1heC1oZWlnaHQ6ODB2aDsgb3ZlcmZsb3c6aGlkZGVuO1xuICBib3JkZXItcmFkaXVzOjEycHg7IGJveC1zaGFkb3c6MCAxOHB4IDQwcHggcmdiYSgwLDAsMCwuMjgpO1xuICBmb250LWZhbWlseTpzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIFNlZ29lIFVJLCBSb2JvdG8sIHNhbnMtc2VyaWY7XG59XG5cbi8qIEhlYWRlciAqL1xuI3F0di1tb2RhbCAucXR2LWhkIHtcbiAgZGlzcGxheTpmbGV4OyBhbGlnbi1pdGVtczpjZW50ZXI7IGdhcDoxMnB4O1xuICBwYWRkaW5nOjE0cHggMTZweDsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2VhZWFlYTtcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDE4MGRlZywgI2ZiZmJmYiAwJSwgI2Y3ZjdmNyAxMDAlKTtcbn1cbiNxdHYtbW9kYWwgLnF0di1oZCBoMyB7IG1hcmdpbjowOyBmb250LXNpemU6MTZweDsgZm9udC13ZWlnaHQ6NjAwOyBjb2xvcjojMGYxNzJhOyB9XG4jcXR2LW1vZGFsIC5xdHYtYWN0aW9ucyB7IG1hcmdpbi1sZWZ0OmF1dG87IGRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgfVxuI3F0di1tb2RhbCAucXR2LWFjdGlvbnMgLmJ0biB7IGJvcmRlci1yYWRpdXM6OHB4OyBsaW5lLWhlaWdodDoxLjM7IHBhZGRpbmc6NnB4IDEwcHg7IH1cblxuLyogQm9keSAqL1xuI3F0di1tb2RhbCAucXR2LWJkIHsgcGFkZGluZzoxMHB4IDE0cHggMTRweDsgb3ZlcmZsb3c6YXV0bzsgbWF4LWhlaWdodDpjYWxjKDgwdmggLSA1NnB4KTsgfVxuXG4vKiBUYWJsZSAqL1xuI3F0di1tb2RhbCB0YWJsZSB7IHdpZHRoOjEwMCU7IGJvcmRlci1jb2xsYXBzZTpzZXBhcmF0ZTsgYm9yZGVyLXNwYWNpbmc6MDsgZm9udC1zaXplOjEzcHg7IH1cbiNxdHYtbW9kYWwgdGhlYWQgdGgge1xuICBwb3NpdGlvbjogc3RpY2t5OyB0b3A6IDA7IHotaW5kZXg6IDE7XG4gIGJhY2tncm91bmQ6I2ZmZjsgYm9yZGVyLWJvdHRvbToxcHggc29saWQgI2VhZWFlYTsgcGFkZGluZzo4cHggMTBweDsgdGV4dC1hbGlnbjpsZWZ0OyBjb2xvcjojNDc1NTY5O1xufVxuI3F0di1tb2RhbCB0Ym9keSB0ZCB7IHBhZGRpbmc6OHB4IDEwcHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNmMWY1Zjk7IH1cbiNxdHYtbW9kYWwgdGJvZHkgdHI6bnRoLWNoaWxkKG9kZCkgeyBiYWNrZ3JvdW5kOiNmY2ZkZmY7IH1cbiNxdHYtbW9kYWwgdGJvZHkgdHI6aG92ZXIgeyBiYWNrZ3JvdW5kOiNmMWY1Zjk7IGN1cnNvcjpwb2ludGVyOyB9XG4jcXR2LW1vZGFsIHRkOm50aC1jaGlsZCgxKSB7IHdpZHRoOjEwMHB4OyB9ICAgICAgICAgICAvKiBTb3J0IE9yZGVyICovXG4jcXR2LW1vZGFsIHRkOm50aC1jaGlsZCgyKSB7IHdpZHRoOjIyMHB4OyB9ICAgICAgICAgICAvKiBQYXJ0ICMgICAgKi9cbiNxdHYtbW9kYWwgdGQ6bGFzdC1jaGlsZCB7IHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7IH0gIC8qIFJlYXNvbiAgICAqL1xuXG4vKiBQaWxscyAqL1xuI3F0di1tb2RhbCAucXR2LXBpbGwgeyBkaXNwbGF5OmlubGluZS1ibG9jazsgcGFkZGluZzoycHggOHB4OyBib3JkZXI6MXB4IHNvbGlkICNlMmU4ZjA7IGJvcmRlci1yYWRpdXM6OTk5cHg7IGZvbnQtc2l6ZToxMnB4OyB9XG5gO1xuXG5cbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuXG4vKiogVGFnIHZpc2libGUgZ3JpZCByb3dzIHdpdGggZGF0YS1xdW90ZS1wYXJ0LWtleSBieSByZWFkaW5nIEtPIGNvbnRleHQgKi9cbmZ1bmN0aW9uIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSB7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBpZiAoIWdyaWQpIHJldHVybiAwO1xuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBsZXQgdGFnZ2VkID0gMDtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBpZiAoci5oYXNBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknKSkgeyB0YWdnZWQrKzsgY29udGludWU7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4ocik7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgPz8gY3R4Py4kcm9vdCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgcXBrID0gVE1VdGlscy5nZXRPYnNWYWx1ZT8uKHZtLCAnUXVvdGVQYXJ0S2V5Jyk7XG4gICAgICAgICAgICBpZiAocXBrICE9IG51bGwgJiYgcXBrICE9PSAnJyAmJiBOdW1iZXIocXBrKSA+IDApIHtcbiAgICAgICAgICAgICAgICByLnNldEF0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScsIFN0cmluZyhxcGspKTtcbiAgICAgICAgICAgICAgICB0YWdnZWQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBwZXItcm93IGZhaWx1cmVzICovIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhZ2dlZDtcbn1cbmZ1bmN0aW9uIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCcpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwaykge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIEZhc3QgcGF0aDogYXR0cmlidXRlIChwcmVmZXJyZWQpXG4gICAgbGV0IHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG5cbiAgICAvLyBJZiBhdHRyaWJ1dGVzIGFyZSBtaXNzaW5nLCB0cnkgdG8gdGFnIHRoZW0gb25jZSB0aGVuIHJldHJ5XG4gICAgaWYgKGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSA+IDApIHtcbiAgICAgICAgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XG4gICAgICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG4gICAgfVxuXG4gICAgLy8gTGFzdCByZXNvcnQ6IHRleHR1YWwgc2NhbiAobGVzcyByZWxpYWJsZSwgYnV0IHdvcmtzIHRvZGF5KVxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCB0eHQgPSAoci50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpID8gX19CVUlMRF9ERVZfXyA6IHRydWU7XG5pZiAoREVWKSB7XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyA9ICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgfHwge307XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy50YWdTdGF0cyA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdycpIDogW107XG4gICAgICAgIGNvbnN0IHRhZ2dlZCA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXF1b3RlLXBhcnQta2V5XScpIDogW107XG4gICAgICAgIGNvbnNvbGUubG9nKCdbUVRWXSByb3dzOicsIHJvd3MubGVuZ3RoLCAndGFnZ2VkOicsIHRhZ2dlZC5sZW5ndGgpO1xuICAgICAgICByZXR1cm4geyB0b3RhbDogcm93cy5sZW5ndGgsIHRhZ2dlZDogdGFnZ2VkLmxlbmd0aCB9O1xuICAgIH07XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy5oaWxpVGVzdCA9IChxcGspID0+IHtcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocikgeyByLmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcsICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTsgci5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyB9XG4gICAgICAgIHJldHVybiAhIXI7XG4gICAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBc0NPLFdBQVMsY0FBYztBQUMxQixXQUFPO0FBQUEsTUFDSCxTQUFTLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDNUIsMkJBQTJCLE9BQU8sS0FBSyx5QkFBeUI7QUFBQSxNQUNoRSxjQUFjLE9BQU8sS0FBSyxZQUFZO0FBQUEsTUFDdEMsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLElBQzFDO0FBQUEsRUFDSjtBQUNPLFdBQVMsaUJBQWlCLElBQUk7QUFDakMsUUFBSSxPQUFPLE9BQU8sV0FBWSxRQUFPLE1BQU07QUFBQSxJQUFFO0FBQzdDLFVBQU0sSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQ2hDLFdBQU8saUJBQWlCLDBCQUEwQixDQUFDO0FBQ25ELFdBQU8sTUFBTSxPQUFPLG9CQUFvQiwwQkFBMEIsQ0FBQztBQUFBLEVBQ3ZFO0FBQ0EsV0FBUyxjQUFjO0FB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QyxDQUFDLFFBQVEsV0FBV0EsT0FBTTtBQUMzRCxXQUFPQSxRQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN2RDtBQUVBLFdBQVMsMEJBQTBCO0FBQy9CLFVBQU0sS0FBSyxTQUFTLGNBQWMsZ0hBQWdIO0FBQ2xKLFlBQVEsSUFBSSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxHQUFHO0FBQUEsRUFDN0Q7QUFFQSxXQUFTLHVCQUF1QjtBQUM1QixXQUFPLG9CQUFvQixLQUFLLHdCQUF3QixDQUFDO0FBQUEsRUFDN0Q7QUFFQSxpQkFBZSxZQUFZO0FBQ3ZCLFFBQUksQ0FBQyxTQUFTLEVBQUcsUUFBTyxRQUFRO0FBQ2hDLFFBQUkscUJBQXFCLEdBQUc7QUFDeEIsVUFBSSxDQUFDLFdBQVksY0FBYSxNQUFNLHNCQUFzQixPQUFPO0FBQUEsSUFDckUsT0FBTztBQUNILGNBQVE7QUFBQSxJQUNaO0FBQUEsRUFDSjtBQUVBLFdBQVMsVUFBVTtBQUFFLFFBQUksWUFBWTtBQUFFLGlCQUFXO0FBQUcsbUJBQWE7QUFBQSxJQUFNO0FBQUEsRUFBRTtBQUcxRSxZQUFVO0FBQ1YsV0FBUyxjQUFjLFNBQVM7QUFDaEMsU0FBTyxpQkFBaUIsY0FBYyxTQUFTO0FBQy9DLE1BQU0sTUFBTSxTQUFTLGNBQWMsd0JBQXdCO0FBQzNELE1BQUksSUFBSyxLQUFJLGlCQUFpQixTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsU0FBUyxNQUFNLFlBQVksTUFBTSxXQUFXLEtBQUssQ0FBQzsiLAogICJuYW1lcyI6IFsiZ2V0SHViIiwgImx0IiwgIlRNVXRpbHMiLCAiS08iLCAiS08iLCAiVE1VdGlscyIsICJERVYiLCAiREVWIiwgIktPIiwgInJ1blZhbGlkYXRpb24iLCAiZ2V0U2V0dGluZ3MiLCAiUk9VVEVTIl0KfQo=
