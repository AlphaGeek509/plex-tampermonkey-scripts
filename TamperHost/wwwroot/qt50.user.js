// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.45
// @description  Gear + settings and a Validate Lines button on Quote Wizard Part Summary.
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=2.0.45-1758147883210
// @require      http://localhost:5000/lt-plex-auth.user.js?v=2.0.45-1758147883210
// @require      http://localhost:5000/lt-ui-hub.js?v=2.0.45-1758147883210
// @require      http://localhost:5000/lt-core.user.js?v=2.0.45-1758147883210
// @require      http://localhost:5000/lt-data-core.user.js?v=2.0.45-1758147883210
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
      maxUnitPrice: getVal(KEYS.maxUnitPrice),
      blockNextUntilValid: getVal(KEYS.blockNextUntilValid),
      highlightFailures: getVal(KEYS.highlightFailures)
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

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-blockNext"> Block Next until all validations pass
    </label>

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-highlight"> Highlight failures on the grid
    </label>

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
    panel.querySelector("#qtv-blockNext").checked = getVal(KEYS.blockNextUntilValid);
    panel.querySelector("#qtv-highlight").checked = getVal(KEYS.highlightFailures);
    panel.querySelector("#qtv-enabled")?.addEventListener("change", (e) => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change", (e) => setVal(KEYS.autoManageLtPartNoOnQuote, !!e.target.checked));
    panel.querySelector("#qtv-blockNext")?.addEventListener("change", (e) => setVal(KEYS.blockNextUntilValid, !!e.target.checked));
    panel.querySelector("#qtv-highlight")?.addEventListener("change", (e) => setVal(KEYS.highlightFailures, !!e.target.checked));
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
          if ("blockNextUntilValid" in data) setVal(KEYS.blockNextUntilValid, !!data.blockNextUntilValid);
          if ("highlightFailures" in data) setVal(KEYS.highlightFailures, !!data.highlightFailures);
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
        maxUnitPrice: "qtv.maxUnitPrice",
        blockNextUntilValid: "qtv.blockNextUntilValid",
        highlightFailures: "qtv.highlightFailures"
      };
      DEF = {
        [KEYS.enabled]: true,
        [KEYS.autoManageLtPartNoOnQuote]: true,
        [KEYS.minUnitPrice]: null,
        [KEYS.maxUnitPrice]: 10,
        [KEYS.blockNextUntilValid]: true,
        [KEYS.highlightFailures]: true
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
  function autoManageLtPartNoOnQuote(ctx, settings, utils) {
    const issues = [];
    if (!settings.autoManageLtPartNoOnQuote) return issues;
    for (const [qp, group] of ctx.groupsByQuotePart.entries()) {
      for (const r of group) {
        const status = utils.get(r, "PartStatus");
        const ltPartNo = utils.get(r, "PartNo");
        if (status === "Quote") {
          issues.push({
            kind: "part.autoManageLtPartNoOnQuote",
            level: "info",
            quotePartKey: qp,
            message: `QP ${qp}: auto-manage Lyn-Tron Part No = ${ltPartNo} (status=Quote).`,
            meta: { status, ltPartNo }
          });
        }
      }
    }
    return issues;
  }
  var init_autoManageLtPartNoOnQuote = __esm({
    "src/quote-tracking/qt50/rules/autoManageLtPartNoOnQuote.js"() {
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
            message: `QP ${qp} Qty ${qty}: Unit Price ${fmt(num)} > Max ${fmt(max)}`,
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
      init_maxUnitPrice();
      rules_default = [maxUnitPrice, autoManageLtPartNoOnQuote];
    }
  });

  // src/quote-tracking/qt50/engine.js
  var engine_exports = {};
  __export(engine_exports, {
    runValidation: () => runValidation
  });
  async function runValidation(TMUtils2, settings) {
    await TMUtils2.waitForModelAsync(".plex-grid", { requireKo: true, timeoutMs: 12e3 });
    const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const grid = document.querySelector(".plex-grid");
    const gvm = grid ? KO2?.dataFor?.(grid) : null;
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
    const issues = rules_default.flatMap((rule) => rule(ctx, settings, utils));
    const ok = issues.every((i) => i.level !== "error");
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
          if (res?.ok) {
            lt.core.hub.notify?.("\u2705 Lines valid", "success", { ms: 1800 });
            task.done?.("Valid");
            if (settings.blockNextUntilValid) setNextDisabled(false);
          } else {
            const issues = Array.isArray(res?.issues) ? res.issues : [];
            const count = issues.length;
            const summary = buildIssuesSummary(issues);
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
          }
          TMUtils2.state = TMUtils2.state || {};
          TMUtils2.state.lastValidation = res;
          if (settings.blockNextUntilValid) {
            let ticks = 0;
            const timer = setInterval(() => {
              const last = TMUtils2?.state?.lastValidation;
              const shouldBlock = !!(last && last.ok === false);
              syncNextButtonDisabled(shouldBlock);
              if (++ticks >= 8) clearInterval(timer);
            }, 750);
          }
        } catch (err) {
          lt.core.hub.notify?.(`Validation error: ${err?.message || err}`, "error", { ms: 6e3 });
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
  function syncNextButtonDisabled(disabled) {
    const next = document.querySelector("#NextWizardPage");
    if (next) next.disabled = !!disabled;
  }
  function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    if (s.maxUnitPrice != null) parts.push(`\u2264${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(", ") || "none"}`;
  }
  function clearValidationHighlights() {
    document.querySelectorAll(".qtv-row-fail").forEach((el) => el.classList.remove("qtv-row-fail"));
  }
  function buildIssuesSummary(issues, { maxGroups = 4, maxQpks = 5 } = {}) {
    const grouped = (issues || []).reduce((m, it) => {
      const k = it.kind || "other";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it.quotePartKey);
      return m;
    }, /* @__PURE__ */ new Map());
    const parts = [];
    let gIndex = 0;
    for (const [kind, qpks] of grouped) {
      if (gIndex++ >= maxGroups) {
        parts.push("\u2026");
        break;
      }
      const list = [...new Set(qpks)].slice(0, maxQpks).join(", ");
      parts.push(`${kind}: QPK ${list}${qpks.length > maxQpks ? ", \u2026" : ""}`);
    }
    return parts.join(" \u2022 ") || "See details";
  }

  // src/quote-tracking/qt50/qtv.entry.js
  var DEV2 = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  if (true) {
    let getGridVM = function() {
      const grid = document.querySelector(".plex-grid");
      return grid ? KO2?.dataFor?.(grid) || null : null;
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
    const KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    unsafeWindow.QTV_DEBUG = {
      // Settings helpers
      settings: () => ({
        enabled: GM_getValue("qtv.enabled"),
        autoManageLtPartNoOnQuote: GM_getValue("qtv.autoManageLtPartNoOnQuote"),
        minUnitPrice: GM_getValue("qtv.minUnitPrice"),
        maxUnitPrice: GM_getValue("qtv.maxUnitPrice"),
        blockNextUntilValid: GM_getValue("qtv.blockNextUntilValid"),
        highlightFailures: GM_getValue("qtv.highlightFailures")
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2luamVjdEJ1dHRvbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbiAgICBibG9ja05leHRVbnRpbFZhbGlkOiAncXR2LmJsb2NrTmV4dFVudGlsVmFsaWQnLFxuICAgIGhpZ2hsaWdodEZhaWx1cmVzOiAncXR2LmhpZ2hsaWdodEZhaWx1cmVzJ1xufTtcbmNvbnN0IERFRiA9IHtcbiAgICBbS0VZUy5lbmFibGVkXTogdHJ1ZSxcbiAgICBbS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXTogdHJ1ZSxcbiAgICBbS0VZUy5taW5Vbml0UHJpY2VdOiBudWxsLFxuICAgIFtLRVlTLm1heFVuaXRQcmljZV06IDEwLFxuICAgIFtLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWRdOiB0cnVlLFxuICAgIFtLRVlTLmhpZ2hsaWdodEZhaWx1cmVzXTogdHJ1ZVxufTtcbmNvbnN0IGdldFZhbCA9IGsgPT4ge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrLCBERUZba10pO1xuICAgIHJldHVybiAodiA9PT0gdW5kZWZpbmVkID8gREVGW2tdIDogdik7XG59O1xuY29uc3Qgc2V0VmFsID0gKGssIHYpID0+IHsgR01fc2V0VmFsdWUoaywgdik7IGVtaXRDaGFuZ2VkKCk7IH07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXR0aW5ncygpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBlbmFibGVkOiBnZXRWYWwoS0VZUy5lbmFibGVkKSxcbiAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogZ2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSksXG4gICAgICAgIG1pblVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSxcbiAgICAgICAgbWF4VW5pdFByaWNlOiBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpLFxuICAgICAgICBibG9ja05leHRVbnRpbFZhbGlkOiBnZXRWYWwoS0VZUy5ibG9ja05leHRVbnRpbFZhbGlkKSxcbiAgICAgICAgaGlnaGxpZ2h0RmFpbHVyZXM6IGdldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBvblRhcmdldCA9IG9uV2l6YXJkICYmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKVxuICAgICAgICAudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IENPTkZJRy53aXphcmRUYXJnZXRQYWdlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zdCBodWIgPSBhd2FpdCAoYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgaCA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGgpIHJldHVybiBoOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pKCk7XG5cbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgIGNvbnN0IElEID0gJ3F0NTAtc2V0dGluZ3MnO1xuICAgIGNvbnN0IGxpc3RlZCA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSUQpO1xuICAgIGlmIChvblRhcmdldCAmJiAhbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbigncmlnaHQnLCB7XG4gICAgICAgICAgICBpZDogSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1ZhbGlkYXRpb24gXHUyNjk5XHVGRTBFJyxcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJyxcbiAgICAgICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgICAgICBvbkNsaWNrOiBzaG93UGFuZWxcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICghb25UYXJnZXQgJiYgbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZW1vdmU/LihJRCk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAvLyBQcmVmZXIgS08gVk0gbmFtZSBvbiB0aGUgYWN0aXZlIHBhZ2VcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZVBhZ2UgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZVBhZ2UpIDogbnVsbDtcbiAgICAgICAgbGV0IG5hbWUgPSB2bSA/IChLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkpIDogJyc7XG4gICAgICAgIGlmIChuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJykgcmV0dXJuIG5hbWUudHJpbSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB0ZXh0IGluIHRoZSB3aXphcmQgbmF2XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBvblRhcmdldCA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWU7XG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBvblRhcmdldCA/ICcnIDogJ25vbmUnO1xuICAgIH07XG5cbiAgICAvLyBPYnNlcnZlIHRoZSB3aXphcmQgbmF2IGZvciBwYWdlIGNoYW5nZXNcbiAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgaWYgKG5hdiAmJiAhbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQpIHtcbiAgICAgICAgbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQgPSB0cnVlO1xuICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcih1cGRhdGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGUoKTtcbn1cblxuXG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1ibG9ja05leHRcIj4gQmxvY2sgTmV4dCB1bnRpbCBhbGwgdmFsaWRhdGlvbnMgcGFzc1xuICAgIDwvbGFiZWw+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtaGlnaGxpZ2h0XCI+IEhpZ2hsaWdodCBmYWlsdXJlcyBvbiB0aGUgZ3JpZFxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiYm9yZGVyLXRvcDoxcHggc29saWQgI2VlZTsgbWFyZ2luOjEycHggMCAxMHB4O1wiPjwvZGl2PlxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGZsZXgtd3JhcDp3cmFwO1wiPlxuICAgICAgPGJ1dHRvbiBpZD1cInF0di1leHBvcnRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiPkV4cG9ydDwvYnV0dG9uPlxuICAgICAgPGxhYmVsIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+SW1wb3J0IDxpbnB1dCBpZD1cInF0di1pbXBvcnRcIiB0eXBlPVwiZmlsZVwiIGFjY2VwdD1cImFwcGxpY2F0aW9uL2pzb25cIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj48L2xhYmVsPlxuICAgICAgPHNwYW4gc3R5bGU9XCJmbGV4OjFcIj48L3NwYW4+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LXJlc2V0XCIgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIiBzdHlsZT1cImJvcmRlci1jb2xvcjojZjU5ZTBiOyBjb2xvcjojYjQ1MzA5O1wiPlJlc2V0PC9idXR0b24+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWNsb3NlXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiBzdHlsZT1cImJhY2tncm91bmQ6IzI1NjNlYjsgY29sb3I6I2ZmZjsgYm9yZGVyOjFweCBzb2xpZCAjMWQ0ZWQ4O1wiPkNsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgICAvLyBJbml0aWFsaXplIGNvbnRyb2wgc3RhdGVzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmVuYWJsZWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyksIGdldFZhbChLRVlTLm1pblVuaXRQcmljZSkpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKSwgZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1ibG9ja05leHQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuYmxvY2tOZXh0VW50aWxWYWxpZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1oaWdobGlnaHQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuaGlnaGxpZ2h0RmFpbHVyZXMpO1xuXG4gICAgLy8gQ2hhbmdlIGhhbmRsZXJzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuZW5hYmxlZCwgISFlLnRhcmdldC5jaGVja2VkKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSwgISFlLnRhcmdldC5jaGVja2VkKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1ibG9ja05leHQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5ibG9ja05leHRVbnRpbFZhbGlkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWhpZ2hsaWdodCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcblxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG5cbiAgICAvLyBCdXR0b25zXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG92ZXJsYXkucmVtb3ZlKCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtcmVzZXQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIE9iamVjdC5rZXlzKERFRikuZm9yRWFjaChrID0+IEdNX3NldFZhbHVlKGssIERFRltrXSkpO1xuICAgICAgICBlbWl0Q2hhbmdlZCgpOyBvdmVybGF5LnJlbW92ZSgpO1xuICAgICAgICBUTVV0aWxzLnRvYXN0Py4oJ1ZhbGlkYXRpb24gc2V0dGluZ3MgcmVzZXQuJywgJ2luZm8nLCAxODAwKTtcbiAgICB9KTtcblxuICAgIC8vIEV4cG9ydFxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZXhwb3J0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW0pTT04uc3RyaW5naWZ5KGdldFNldHRpbmdzKCksIG51bGwsIDIpXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7IGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9ICdxdC12YWxpZGF0aW9uLXNldHRpbmdzLmpzb24nOyBhLmNsaWNrKCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpLCAxMDAwKTtcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydFxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtaW1wb3J0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChldikgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZiA9IGV2LnRhcmdldC5maWxlcz8uWzBdOyBpZiAoIWYpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGF3YWl0IGYudGV4dCgpKTtcbiAgICAgICAgICAgIGlmIChkYXRhICYmIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIGlmICgnZW5hYmxlZCcgaW4gZGF0YSkgc2V0VmFsKEtFWVMuZW5hYmxlZCwgISFkYXRhLmVuYWJsZWQpO1xuICAgICAgICAgICAgICAgIGlmICgnYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSwgISFkYXRhLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgICAgICAgICAgICAgIGlmICgnbWluVW5pdFByaWNlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UsIHRvTnVsbE9yTnVtYmVyKGRhdGEubWluVW5pdFByaWNlKSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtYXhVbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1heFVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5tYXhVbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ2Jsb2NrTmV4dFVudGlsVmFsaWQnIGluIGRhdGEpIHNldFZhbChLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWQsICEhZGF0YS5ibG9ja05leHRVbnRpbFZhbGlkKTtcbiAgICAgICAgICAgICAgICBpZiAoJ2hpZ2hsaWdodEZhaWx1cmVzJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5oaWdobGlnaHRGYWlsdXJlcywgISFkYXRhLmhpZ2hsaWdodEZhaWx1cmVzKTtcbiAgICAgICAgICAgICAgICBvdmVybGF5LnJlbW92ZSgpOyBUTVV0aWxzLnRvYXN0Py4oJ1ZhbGlkYXRpb24gc2V0dGluZ3MgaW1wb3J0ZWQuJywgJ3N1Y2Nlc3MnLCAxODAwKTtcbiAgICAgICAgICAgIH0gZWxzZSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTi4nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBUTVV0aWxzLnRvYXN0Py4oYEltcG9ydCBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCAzMDAwKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gICAgKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICAgIC8vIEZvY3VzIEFGVEVSIGFwcGVuZGluZyBzbyBFU0Mgd29ya3MgaW1tZWRpYXRlbHlcbiAgICBvdmVybGF5LmZvY3VzKCk7XG59XG5cblxuZnVuY3Rpb24gcGFyc2VOdW1iZXJPck51bGwocykgeyBjb25zdCB2ID0gTnVtYmVyKFN0cmluZyhzKS50cmltKCkpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHYpID8gdiA6IG51bGw7IH1cbmZ1bmN0aW9uIHRvTnVsbE9yTnVtYmVyKHYpIHsgY29uc3QgbiA9IE51bWJlcih2KTsgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShuKSA/IG4gOiBudWxsOyB9XG5mdW5jdGlvbiBzZXROdW1iZXJPckJsYW5rKGlucHV0LCB2YWwpIHsgaW5wdXQudmFsdWUgPSAodmFsID09IG51bGwgPyAnJyA6IFN0cmluZyh2YWwpKTsgfVxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanNcclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbi8vIFJ1bGU6IGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGVcclxuLy8gUHVycG9zZTogSWYgUGFydCBTdGF0dXMgaXMgXCJRdW90ZVwiLCBhdXRvLW1hbmFnZSAobG9jay9jb250cm9sKVxyXG4vLyAgICAgICAgICB0aGUgTHluLVRyb24gUGFydCBObyBmaWVsZCBmb3IgdGhhdCByb3cuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuXHJcbiAgICAvLyBTa2lwIGVudGlyZWx5IGlmIHNldHRpbmcgZGlzYWJsZWRcclxuICAgIGlmICghc2V0dGluZ3MuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSkgcmV0dXJuIGlzc3VlcztcclxuXHJcbiAgICAvLyBQbGFjZWhvbGRlciBsb2dpYzoganVzdCBkdW1wIGNvbnRleHQgZm9yIG5vd1xyXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IHV0aWxzLmdldChyLCAnUGFydFN0YXR1cycpO1xyXG4gICAgICAgICAgICBjb25zdCBsdFBhcnRObyA9IHV0aWxzLmdldChyLCAnUGFydE5vJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBUT0RPOiBpbXBsZW1lbnQgYWN0dWFsIFwiYXV0by1tYW5hZ2VcIiBlbmZvcmNlbWVudFxyXG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSAnUXVvdGUnKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50IHdlIG1pZ2h0IGxvY2sgdGhlIFVJLCBvciBwdXNoIGFuIGluZm9ybWF0aW9uYWwgaXNzdWVcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2luZm8nLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFFQICR7cXB9OiBhdXRvLW1hbmFnZSBMeW4tVHJvbiBQYXJ0IE5vID0gJHtsdFBhcnROb30gKHN0YXR1cz1RdW90ZSkuYCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1cywgbHRQYXJ0Tm8gfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGlzc3VlcztcclxufVxyXG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIG1heFVuaXRQcmljZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xyXG4gICAgLy8gR3VhcmQgaWYgbm90IGNvbmZpZ3VyZWRcclxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xyXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWF4KSkgcmV0dXJuIFtdO1xyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG5cclxuICAgIC8vIFNpbXBsZSBjdXJyZW5jeS9udW1iZXIgc2FuaXRpemVyXHJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XHJcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xyXG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcclxuICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcclxuICAgIH07XHJcblxyXG5cclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xyXG4gICAgICAgICAgICBjb25zdCBxdHkgPSB1dGlscy5nZXQociwgJ1F1YW50aXR5JykgPz8gJz8nO1xyXG5cclxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9XHJcbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpID8/XHJcbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XHJcbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1VuaXRQcmljZScpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobnVtKSAmJiBudW0gPiBtYXgpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZtdCA9IChuKSA9PiAoTnVtYmVyLmlzRmluaXRlKG4pID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KSA6IFN0cmluZyhuKSk7XHJcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1heFVuaXRQcmljZScsXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUVAgJHtxcH0gUXR5ICR7cXR5fTogVW5pdCBQcmljZSAke2ZtdChudW0pfSA+IE1heCAke2ZtdChtYXgpfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4IH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9pbmRleC5qc1xyXG5pbXBvcnQgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSBmcm9tICcuL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnO1xyXG4vL2ltcG9ydCBmb3JiaWRaZXJvUHJpY2UgZnJvbSAnLi9mb3JiaWRaZXJvUHJpY2UnO1xyXG4vL2ltcG9ydCBtaW5Vbml0UHJpY2UgZnJvbSAnLi9taW5Vbml0UHJpY2UnO1xyXG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IFttYXhVbml0UHJpY2UsIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGVdOyAgLy9yZXF1aXJlUmVzb2x2ZWRQYXJ0LCBmb3JiaWRaZXJvUHJpY2UsIG1pblVuaXRQcmljZSxcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2VuZ2luZS5qc1xyXG5pbXBvcnQgcnVsZXMgZnJvbSAnLi9ydWxlcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncykge1xyXG4gICAgYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHsgcmVxdWlyZUtvOiB0cnVlLCB0aW1lb3V0TXM6IDEyMDAwIH0pO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICBjb25zdCBndm0gPSBncmlkID8gS08/LmRhdGFGb3I/LihncmlkKSA6IG51bGw7XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XHJcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgcXAgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdRdW90ZVBhcnRLZXknKSA/PyAtMTtcclxuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgcCA9IGdyb3VwLmZpbmQociA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdJc1VuaXF1ZVF1b3RlUGFydCcpID09PSAxKSB8fCBncm91cFswXTtcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdHggPSB7XHJcbiAgICAgICAgcm93cyxcclxuICAgICAgICBncm91cHNCeVF1b3RlUGFydCxcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXHJcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXHJcbiAgICAgICAgbGFzdFJlc3VsdDogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGU/LigpXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHV0aWxzID0geyBnZXQ6IChvYmosIHBhdGgsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUob2JqLCBwYXRoLCBvcHRzKSB9O1xyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IHJ1bGVzLmZsYXRNYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSk7XHJcbiAgICBjb25zdCBvayA9IGlzc3Vlcy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xyXG5cclxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XHJcbiAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0geyBhdDogRGF0ZS5ub3coKSwgb2ssIGlzc3VlcyB9O1xyXG5cclxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcclxufVxyXG4iLCAiLy8gUVRWIGVudHJ5cG9pbnQ6IG1vdW50cyB0aGUgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIG9uIFBhcnQgU3VtbWFyeVxyXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxyXG4gICAgPyBfX0JVSUxEX0RFVl9fXHJcbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xyXG5cclxuaWYgKF9fQlVJTERfREVWX18pIHtcclxuICAgIC8vIE1pbmltYWwgS08vZ3JpZCByZXNvbHZlcnMga2VwdCBsb2NhbCB0byBkZWJ1ZyBoZWxwZXJzXHJcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcbiAgICBmdW5jdGlvbiBnZXRHcmlkVk0oKSB7XHJcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcclxuICAgICAgICByZXR1cm4gZ3JpZCA/IChLTz8uZGF0YUZvcj8uKGdyaWQpIHx8IG51bGwpIDogbnVsbDtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIGdldEdyaWRSb3dzKCkge1xyXG4gICAgICAgIGNvbnN0IGd2bSA9IGdldEdyaWRWTSgpO1xyXG4gICAgICAgIHJldHVybiAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gcGxhaW5Sb3cocikge1xyXG4gICAgICAgIGNvbnN0IGd2ID0gKHAsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgcCwgb3B0cyk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgUXVvdGVQYXJ0S2V5OiBndignUXVvdGVQYXJ0S2V5JyksXHJcbiAgICAgICAgICAgIFBhcnRObzogZ3YoJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSxcclxuICAgICAgICAgICAgUGFydFN0YXR1czogZ3YoJ1BhcnRTdGF0dXMnLCB7IHRyaW06IHRydWUgfSksXHJcbiAgICAgICAgICAgIFF1YW50aXR5OiBndignUXVhbnRpdHknKSxcclxuICAgICAgICAgICAgVW5pdFByaWNlOiBndignVW5pdFByaWNlJyksXHJcbiAgICAgICAgICAgIFJ2VW5pdFByaWNlQ29weTogZ3YoJ1J2VW5pdFByaWNlQ29weScpLFxyXG4gICAgICAgICAgICBSdkN1c3RvbWl6ZWRVbml0UHJpY2U6IGd2KCdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSxcclxuICAgICAgICAgICAgSXNVbmlxdWVRdW90ZVBhcnQ6IGd2KCdJc1VuaXF1ZVF1b3RlUGFydCcpXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGZ1bmN0aW9uIHRvQ1NWKG9ianMpIHtcclxuICAgICAgICBpZiAoIW9ianM/Lmxlbmd0aCkgcmV0dXJuICcnO1xyXG4gICAgICAgIGNvbnN0IGNvbHMgPSBPYmplY3Qua2V5cyhvYmpzWzBdKTtcclxuICAgICAgICBjb25zdCBlc2MgPSAodikgPT4gKHYgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHYpLmluY2x1ZGVzKCcsJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcIicpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXFxuJylcclxuICAgICAgICAgICAgPyBgXCIke1N0cmluZyh2KS5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYFxyXG4gICAgICAgICAgICA6IFN0cmluZyh2KSk7XHJcbiAgICAgICAgY29uc3QgaGVhZCA9IGNvbHMuam9pbignLCcpO1xyXG4gICAgICAgIGNvbnN0IGJvZHkgPSBvYmpzLm1hcChvID0+IGNvbHMubWFwKGMgPT4gZXNjKG9bY10pKS5qb2luKCcsJykpLmpvaW4oJ1xcbicpO1xyXG4gICAgICAgIHJldHVybiBoZWFkICsgJ1xcbicgKyBib2R5O1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gZG93bmxvYWQobmFtZSwgYmxvYikge1xyXG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XHJcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcclxuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSBuYW1lOyBhLmNsaWNrKCk7XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDIwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHVuc2FmZVdpbmRvdy5RVFZfREVCVUcgPSB7XHJcbiAgICAgICAgLy8gU2V0dGluZ3MgaGVscGVyc1xyXG4gICAgICAgIHNldHRpbmdzOiAoKSA9PiAoe1xyXG4gICAgICAgICAgICBlbmFibGVkOiBHTV9nZXRWYWx1ZSgncXR2LmVuYWJsZWQnKSxcclxuICAgICAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogR01fZ2V0VmFsdWUoJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyksXHJcbiAgICAgICAgICAgIG1pblVuaXRQcmljZTogR01fZ2V0VmFsdWUoJ3F0di5taW5Vbml0UHJpY2UnKSxcclxuICAgICAgICAgICAgbWF4VW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1heFVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBibG9ja05leHRVbnRpbFZhbGlkOiBHTV9nZXRWYWx1ZSgncXR2LmJsb2NrTmV4dFVudGlsVmFsaWQnKSxcclxuICAgICAgICAgICAgaGlnaGxpZ2h0RmFpbHVyZXM6IEdNX2dldFZhbHVlKCdxdHYuaGlnaGxpZ2h0RmFpbHVyZXMnKVxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIGdldFZhbHVlOiBrZXkgPT4gR01fZ2V0VmFsdWUoa2V5KSxcclxuICAgICAgICBzZXRWYWx1ZTogKGtleSwgdmFsKSA9PiBHTV9zZXRWYWx1ZShrZXksIHZhbCksXHJcblxyXG4gICAgICAgIC8vIEdyaWQgZXhwb3J0ZXJzXHJcbiAgICAgICAgZ3JpZDogKHsgcGxhaW4gPSB0cnVlIH0gPSB7fSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCByb3dzID0gZ2V0R3JpZFJvd3MoKTtcclxuICAgICAgICAgICAgcmV0dXJuIHBsYWluID8gcm93cy5tYXAocGxhaW5Sb3cpIDogcm93cztcclxuICAgICAgICB9LFxyXG4gICAgICAgIGdyaWRUYWJsZTogKCkgPT4gY29uc29sZS50YWJsZT8uKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKSxcclxuXHJcbiAgICAgICAgLy8gQ1NWL0pTT04gZG93bmxvYWRlcnNcclxuICAgICAgICBkb3dubG9hZEdyaWRKU09OOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5qc29uJykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSksIG51bGwsIDIpO1xyXG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2RhdGFdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBkb3dubG9hZEdyaWRDU1Y6IChmaWxlbmFtZSA9ICdxdC1ncmlkLmNzdicpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY3N2ID0gdG9DU1YodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBkb3dubG9hZChmaWxlbmFtZSwgbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KSk7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLy8gVmFsaWRhdGlvbiBvbi1kZW1hbmQgKHNhbWUgZW5naW5lIGFzIHRoZSBidXR0b24pXHJcbiAgICAgICAgdmFsaWRhdGVOb3c6IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyBydW5WYWxpZGF0aW9uIH0gPSBhd2FpdCBpbXBvcnQoJy4vZW5naW5lLmpzJyk7IC8vIHNhbWUgbW9kdWxlIHVzZWQgYnkgdGhlIGh1YiBidXR0b25cclxuICAgICAgICAgICAgY29uc3QgeyBnZXRTZXR0aW5ncyB9ID0gYXdhaXQgaW1wb3J0KCcuL2luZGV4LmpzJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgZ2V0U2V0dGluZ3MoKSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUudGFibGU/LihyZXMuaXNzdWVzIHx8IFtdKTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlcztcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICAvLyBRdWljayBleHBlY3RhdGlvbiBoZWxwZXI6IFx1MjAxQ3Nob3cgbWUgcm93cyBhYm92ZSBtYXhcdTIwMURcclxuICAgICAgICBleHBlY3RVbmRlck1heDogKG1heCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWF4KTtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2KS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgcmV0dXJuIHJvd3NcclxuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtID4gc2V0KVxyXG4gICAgICAgICAgICAgICAgLm1hcCgoeyBfVW5pdE51bSwgLi4uciB9KSA9PiByKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuLy8gRW5zdXJlIHRoZSBzZXR0aW5ncyBVSSBsb2FkcyAoZ2VhciBidXR0b24sIHN0b3JhZ2UgQVBJKVxyXG5pbXBvcnQgJy4vaW5kZXguanMnO1xyXG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcclxuaW1wb3J0IHsgbW91bnRWYWxpZGF0aW9uQnV0dG9uIH0gZnJvbSAnLi9pbmplY3RCdXR0b24uanMnO1xyXG5cclxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcclxuXHJcbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XHJcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xyXG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xyXG4gICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcclxuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcclxuICAgIHJldHVybiAvXnBhcnRcXHMqc3VtbWFyeSQvaS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XHJcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XHJcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xyXG4gICAgICAgIGlmICghdW5tb3VudEJ0bikgdW5tb3VudEJ0biA9IGF3YWl0IG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdW5tb3VudCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB1bm1vdW50KCkgeyBpZiAodW5tb3VudEJ0bikgeyB1bm1vdW50QnRuKCk7IHVubW91bnRCdG4gPSBudWxsOyB9IH1cclxuXHJcbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcclxucmVjb25jaWxlKCk7XHJcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcclxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xyXG5jb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XHJcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xyXG5cclxuIiwgIi8vIEFkZHMgYSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gYW5kIHdpcmVzIGl0IHRvIHRoZSBlbmdpbmUuXHJcbi8vIEFzc3VtZXMgeW91ciBzZXR0aW5ncyBVSSBleHBvcnRzIGdldFNldHRpbmdzL29uU2V0dGluZ3NDaGFuZ2UuXHJcblxyXG5pbXBvcnQgeyBydW5WYWxpZGF0aW9uIH0gZnJvbSAnLi9lbmdpbmUnO1xyXG5pbXBvcnQgeyBnZXRTZXR0aW5ncywgb25TZXR0aW5nc0NoYW5nZSB9IGZyb20gJy4vaW5kZXgnO1xyXG5cclxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcclxuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcclxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiAnbmF2JyB9KTtcclxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcclxuXHJcbiAgICAvLyBhdm9pZCBkdXBsaWNhdGVcclxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xyXG5cclxuICAgIGxldCBidG5FbCA9IG51bGw7XHJcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XHJcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXHJcbiAgICAgICAgbGFiZWw6ICdWYWxpZGF0ZSBMaW5lcycsXHJcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcclxuICAgICAgICB3ZWlnaHQ6IDEzMCxcclxuICAgICAgICBvbkNsaWNrOiBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xyXG4gICAgICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrPy4oJ1ZhbGlkYXRpbmdcdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBvbGQgaGlnaGxpZ2h0c1xyXG4gICAgICAgICAgICAgICAgY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChyZXM/Lm9rKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oJ1x1MjcwNSBMaW5lcyB2YWxpZCcsICdzdWNjZXNzJywgeyBtczogMTgwMCB9KTtcclxuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignVmFsaWQnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoc2V0dGluZ3MuYmxvY2tOZXh0VW50aWxWYWxpZCkgc2V0TmV4dERpc2FibGVkKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gU2hvdyBzdW1tYXJ5XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBpc3N1ZXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBcdTI3NEMgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ2lzc3VlJyA6ICdpc3N1ZXMnfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgbXM6IDY1MDAgfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBcdTI3NEMgJHtjb3VudH0gaXNzdWUke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gY2FjaGUgbGFzdCBzdGF0dXMgZm9yIFNQQSByZWRyYXdzXHJcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcclxuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSByZXM7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gS2VlcCBcIk5leHRcIiBidXR0b24gc3RhdGUgc3RpY2t5IGZvciBhIGZldyBTUEEgdGlja3MgaWYgZW5hYmxlZFxyXG4gICAgICAgICAgICAgICAgaWYgKHNldHRpbmdzLmJsb2NrTmV4dFVudGlsVmFsaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgdGlja3MgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0ID0gVE1VdGlscz8uc3RhdGU/Lmxhc3RWYWxpZGF0aW9uO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzaG91bGRCbG9jayA9ICEhKGxhc3QgJiYgbGFzdC5vayA9PT0gZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzeW5jTmV4dEJ1dHRvbkRpc2FibGVkKHNob3VsZEJsb2NrKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCsrdGlja3MgPj0gOCkgY2xlYXJJbnRlcnZhbCh0aW1lcik7IC8vIH42cyB0b3RhbFxyXG4gICAgICAgICAgICAgICAgICAgIH0sIDc1MCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG5cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgVmFsaWRhdGlvbiBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDYwMDAgfSk7XHJcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG5cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYWIgYmFjayB0aGUgcmVhbCBET00gYnV0dG9uIHRvIHVwZGF0ZSB0aXRsZSBsYXRlclxyXG4gICAgYnRuRWwgPSBodWIuX3NoYWRvdz8ucXVlcnlTZWxlY3Rvcj8uKGBbZGF0YS1pZD1cIiR7SFVCX0JUTl9JRH1cIl1gKTtcclxuXHJcbiAgICBjb25zdCBvZmZTZXR0aW5ncyA9IG9uU2V0dGluZ3NDaGFuZ2U/LigoKSA9PiByZWZyZXNoTGFiZWwoYnRuRWwpKTtcclxuICAgIHJlZnJlc2hMYWJlbChidG5FbCk7XHJcblxyXG4gICAgcmV0dXJuICgpID0+IHtcclxuICAgICAgICBvZmZTZXR0aW5ncz8uKCk7XHJcbiAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN5bmNOZXh0QnV0dG9uRGlzYWJsZWQoZGlzYWJsZWQpIHtcclxuICAgIGNvbnN0IG5leHQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjTmV4dFdpemFyZFBhZ2UnKTtcclxuICAgIGlmIChuZXh0KSBuZXh0LmRpc2FibGVkID0gISFkaXNhYmxlZDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVmcmVzaExhYmVsKGJ0bikge1xyXG4gICAgaWYgKCFidG4pIHJldHVybjtcclxuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xyXG4gICAgY29uc3QgcGFydHMgPSBbXTtcclxuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xyXG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XHJcbiAgICAvL2lmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xyXG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XHJcbiAgICBidG4udGl0bGUgPSBgUnVsZXM6ICR7cGFydHMuam9pbignLCAnKSB8fCAnbm9uZSd9YDtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpIHtcclxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdHYtcm93LWZhaWwnKS5mb3JFYWNoKGVsID0+IGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspIHtcclxuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICBpZiAoIWdyaWQpIHJldHVybiBudWxsO1xyXG5cclxuICAgIC8vIDEpIGF0dHJpYnV0ZS1iYXNlZCBmYXN0IHBhdGggKGlmIHlvdSBhZGQgZGF0YS1xdW90ZS1wYXJ0LWtleSB0byByb3dzIGxhdGVyKVxyXG4gICAgY29uc3QgYnlBdHRyID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7cXBrfVwiXWApO1xyXG4gICAgaWYgKGJ5QXR0cikgcmV0dXJuIGJ5QXR0ci5jbG9zZXN0KCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdycpIHx8IGJ5QXR0cjtcclxuXHJcbiAgICAvLyAyKSBmYWxsYmFjazogc2NhbiByb3dzIGFuZCBtYXRjaCB0ZXh0ICh3b3JrcyB0b2RheSB3aXRob3V0IGFkZGluZyBhdHRyaWJ1dGVzKVxyXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKTtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdHh0ID0gKHIudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcclxuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gaGlnaGxpZ2h0SXNzdWVzKGlzc3Vlcykge1xyXG4gICAgZm9yIChjb25zdCBpc3Mgb2YgKGlzc3VlcyB8fCBbXSkpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KGlzcy5xdW90ZVBhcnRLZXkpO1xyXG4gICAgICAgIGlmIChyb3cpIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwnKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2Nyb2xsVG9GaXJzdElzc3VlKGlzc3Vlcykge1xyXG4gICAgY29uc3QgZmlyc3QgPSAoaXNzdWVzIHx8IFtdKVswXTtcclxuICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkoZmlyc3QucXVvdGVQYXJ0S2V5KTtcclxuICAgIGlmIChyb3cgJiYgdHlwZW9mIHJvdy5zY3JvbGxJbnRvVmlldyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzLCB7IG1heEdyb3VwcyA9IDQsIG1heFFwa3MgPSA1IH0gPSB7fSkge1xyXG4gICAgY29uc3QgZ3JvdXBlZCA9IChpc3N1ZXMgfHwgW10pLnJlZHVjZSgobSwgaXQpID0+IHtcclxuICAgICAgICBjb25zdCBrID0gaXQua2luZCB8fCAnb3RoZXInO1xyXG4gICAgICAgIGlmICghbS5oYXMoaykpIG0uc2V0KGssIFtdKTtcclxuICAgICAgICBtLmdldChrKS5wdXNoKGl0LnF1b3RlUGFydEtleSk7XHJcbiAgICAgICAgcmV0dXJuIG07XHJcbiAgICB9LCBuZXcgTWFwKCkpO1xyXG5cclxuICAgIGNvbnN0IHBhcnRzID0gW107XHJcbiAgICBsZXQgZ0luZGV4ID0gMDtcclxuICAgIGZvciAoY29uc3QgW2tpbmQsIHFwa3NdIG9mIGdyb3VwZWQpIHtcclxuICAgICAgICBpZiAoZ0luZGV4KysgPj0gbWF4R3JvdXBzKSB7IHBhcnRzLnB1c2goJ1x1MjAyNicpOyBicmVhazsgfVxyXG4gICAgICAgIGNvbnN0IGxpc3QgPSBbLi4ubmV3IFNldChxcGtzKV0uc2xpY2UoMCwgbWF4UXBrcykuam9pbignLCAnKTtcclxuICAgICAgICBwYXJ0cy5wdXNoKGAke2tpbmR9OiBRUEsgJHtsaXN0fSR7cXBrcy5sZW5ndGggPiBtYXhRcGtzID8gJywgXHUyMDI2JyA6ICcnfWApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJyBcdTIwMjIgJykgfHwgJ1NlZSBkZXRhaWxzJztcclxufVxyXG5cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTBDTyxXQUFTLGNBQWM7QUFDMUIsV0FBTztBQUFBLE1BQ0gsU0FBUyxPQUFPLEtBQUssT0FBTztBQUFBLE1BQzVCLDJCQUEyQixPQUFPLEtBQUsseUJBQXlCO0FBQUEsTUFDaEUsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLE1BQ3RDLGNBQWMsT0FBTyxLQUFLLFlBQVk7QUFBQSxNQUN0QyxxQkFBcUIsT0FBTyxLQUFLLG1CQUFtQjtBQUFBLE1BQ3BELG1CQUFtQixPQUFPLEtBQUssaUJBQWlCO0FBQUEsSUFDcEQ7QUFBQSxFQUNKO0FBQ08sV0FBUyxpQkFBaUIsSUFBSTtBQUNqQyxRQUFJLE9BQU8sT0FBTyxXQUFZLFFBQU8sTUFBTTtBQUFBLElBQUU7QUFDN0MsVUFBTSxJ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QUMsU0FBUyxFQUFHLFFBQU8sUUFBUTtBQUNoQyxRQUFJLHFCQUFxQixHQUFHO0FBQ3hCLFVBQUksQ0FBQyxXQUFZLGNBQWEsTUFBTSxzQkFBc0IsT0FBTztBQUFBLElBQ3JFLE9BQU87QUFDSCxjQUFRO0FBQUEsSUFDWjtBQUFBLEVBQ0o7QUFFQSxXQUFTLFVBQVU7QUFBRSxRQUFJLFlBQVk7QUFBRSxpQkFBVztBQUFHLG1CQUFhO0FBQUEsSUFBTTtBQUFBLEVBQUU7QUFHMUUsWUFBVTtBQUNWLFdBQVMsY0FBYyxTQUFTO0FBQ2hDLFNBQU8saUJBQWlCLGNBQWMsU0FBUztBQUMvQyxNQUFNLE1BQU0sU0FBUyxjQUFjLHdCQUF3QjtBQUMzRCxNQUFJLElBQUssS0FBSSxpQkFBaUIsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLFNBQVMsTUFBTSxZQUFZLE1BQU0sV0FBVyxLQUFLLENBQUM7IiwKICAibmFtZXMiOiBbImdldEh1YiIsICJUTVV0aWxzIiwgIktPIiwgIlRNVXRpbHMiLCAiREVWIiwgIktPIiwgInJ1blZhbGlkYXRpb24iLCAiZ2V0U2V0dGluZ3MiLCAiUk9VVEVTIl0KfQo=
