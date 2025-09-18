// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.57
// @description  Gear + settings and a Validate Lines button on Quote Wizard Part Summary.
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=2.0.57-1758202069958
// @require      http://localhost:5000/lt-plex-auth.user.js?v=2.0.57-1758202069958
// @require      http://localhost:5000/lt-ui-hub.js?v=2.0.57-1758202069958
// @require      http://localhost:5000/lt-core.user.js?v=2.0.57-1758202069958
// @require      http://localhost:5000/lt-data-core.user.js?v=2.0.57-1758202069958
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
      rules_default = [maxUnitPrice, minUnitPrice, autoManageLtPartNoOnQuote];
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
    const issuesRaw = rules_default.flatMap((rule) => rule(ctx, settings, utils));
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
          if (res?.ok) {
            lt.core.hub.notify?.("\u2705 Lines valid", "success", { ms: 1800 });
            task.done?.("Valid");
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
            showValidationModal(issues);
          }
          TMUtils2.state = TMUtils2.state || {};
          TMUtils2.state.lastValidation = res;
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
  function refreshLabel(btn) {
    if (!btn) return;
    const s = getSettings();
    const parts = [];
    if (s.minUnitPrice != null) parts.push(`\u2265${s.minUnitPrice}`);
    if (s.maxUnitPrice != null) parts.push(`\u2264${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(", ") || "none"}`;
  }
  var KO2 = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL3F0di5lbnRyeS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwL2luamVjdEJ1dHRvbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbn07XG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV06IHRydWUsXG4gICAgW0tFWVMubWluVW5pdFByaWNlXTogMCxcbiAgICBbS0VZUy5tYXhVbml0UHJpY2VdOiAxMCxcbn07XG5jb25zdCBnZXRWYWwgPSBrID0+IHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoaywgREVGW2tdKTtcbiAgICByZXR1cm4gKHYgPT09IHVuZGVmaW5lZCA/IERFRltrXSA6IHYpO1xufTtcbmNvbnN0IHNldFZhbCA9IChrLCB2KSA9PiB7IEdNX3NldFZhbHVlKGssIHYpOyBlbWl0Q2hhbmdlZCgpOyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBvblRhcmdldCA9IG9uV2l6YXJkICYmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk/LnRleHRDb250ZW50IHx8ICcnKVxuICAgICAgICAudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IENPTkZJRy53aXphcmRUYXJnZXRQYWdlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zdCBodWIgPSBhd2FpdCAoYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgY29uc3QgaCA9IGF3YWl0IGVuc3VyZShvcHRzKTsgaWYgKGgpIHJldHVybiBoOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pKCk7XG5cbiAgICBpZiAoIWh1Yj8ucmVnaXN0ZXJCdXR0b24pIHJldHVybjtcblxuICAgIGNvbnN0IElEID0gJ3F0NTAtc2V0dGluZ3MnO1xuICAgIGNvbnN0IGxpc3RlZCA9IGh1Yi5saXN0Py4oKT8uaW5jbHVkZXMoSUQpO1xuICAgIGlmIChvblRhcmdldCAmJiAhbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbigncmlnaHQnLCB7XG4gICAgICAgICAgICBpZDogSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1ZhbGlkYXRpb24gXHUyNjk5XHVGRTBFJyxcbiAgICAgICAgICAgIHRpdGxlOiAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJyxcbiAgICAgICAgICAgIHdlaWdodDogMzAsXG4gICAgICAgICAgICBvbkNsaWNrOiBzaG93UGFuZWxcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICghb25UYXJnZXQgJiYgbGlzdGVkKSB7XG4gICAgICAgIGh1Yi5yZW1vdmU/LihJRCk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgdGFyZ2V0TmFtZSkge1xuICAgIGNvbnN0IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lID0gKCkgPT4ge1xuICAgICAgICAvLyBQcmVmZXIgS08gVk0gbmFtZSBvbiB0aGUgYWN0aXZlIHBhZ2VcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICBjb25zdCB2bSA9IGFjdGl2ZVBhZ2UgPyBLTz8uZGF0YUZvcj8uKGFjdGl2ZVBhZ2UpIDogbnVsbDtcbiAgICAgICAgbGV0IG5hbWUgPSB2bSA/IChLTz8udW53cmFwPy4odm0ubmFtZSkgPz8gKHR5cGVvZiB2bS5uYW1lID09PSAnZnVuY3Rpb24nID8gdm0ubmFtZSgpIDogdm0ubmFtZSkpIDogJyc7XG4gICAgICAgIGlmIChuYW1lICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJykgcmV0dXJuIG5hbWUudHJpbSgpO1xuXG4gICAgICAgIC8vIEZhbGxiYWNrOiB0ZXh0IGluIHRoZSB3aXphcmQgbmF2XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgICAgICByZXR1cm4gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdXBkYXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBvblRhcmdldCA9IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkgPT09IHRhcmdldE5hbWU7XG4gICAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBvblRhcmdldCA/ICcnIDogJ25vbmUnO1xuICAgIH07XG5cbiAgICAvLyBPYnNlcnZlIHRoZSB3aXphcmQgbmF2IGZvciBwYWdlIGNoYW5nZXNcbiAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XG4gICAgaWYgKG5hdiAmJiAhbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQpIHtcbiAgICAgICAgbGkuX3F0dk9ic2VydmVyQXR0YWNoZWQgPSB0cnVlO1xuICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcih1cGRhdGUpLm9ic2VydmUobmF2LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGUoKTtcbn1cblxuXG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcblxuICAgIC8vIEluaXRpYWxpemUgY29udHJvbCBzdGF0ZXNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKSwgZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpLCBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpKTtcblxuICAgIC8vIENoYW5nZSBoYW5kbGVyc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmVuYWJsZWQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZScpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcblxuICAgIC8vIEJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxyXG4vLyBQdXJwb3NlOiBJZiBQYXJ0IFN0YXR1cyBpcyBcIlF1b3RlXCIsIGF1dG8tbWFuYWdlIChsb2NrL2NvbnRyb2wpXHJcbi8vICAgICAgICAgIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGZpZWxkIGZvciB0aGF0IHJvdy5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG5cclxuICAgIC8vIFNraXAgZW50aXJlbHkgaWYgc2V0dGluZyBkaXNhYmxlZFxyXG4gICAgaWYgKCFzZXR0aW5ncy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKSByZXR1cm4gaXNzdWVzO1xyXG5cclxuICAgIC8vIFBsYWNlaG9sZGVyIGxvZ2ljOiBqdXN0IGR1bXAgY29udGV4dCBmb3Igbm93XHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gdXRpbHMuZ2V0KHIsICdQYXJ0U3RhdHVzJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGx0UGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFRPRE86IGltcGxlbWVudCBhY3R1YWwgXCJhdXRvLW1hbmFnZVwiIGVuZm9yY2VtZW50XHJcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09ICdRdW90ZScpIHtcclxuICAgICAgICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQgd2UgbWlnaHQgbG9jayB0aGUgVUksIG9yIHB1c2ggYW4gaW5mb3JtYXRpb25hbCBpc3N1ZVxyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnaW5mbycsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUVAgJHtxcH06IGF1dG8tbWFuYWdlIEx5bi1Ucm9uIFBhcnQgTm8gPSAke2x0UGFydE5vfSAoc3RhdHVzPVF1b3RlKS5gLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzLCBsdFBhcnRObyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaXNzdWVzO1xyXG59XHJcbiIsICIvLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogbWluVW5pdFByaWNlXHJcbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gdGhlIGVmZmVjdGl2ZSB1bml0IHByaWNlIGlzIGJlbG93IHRoZSBjb25maWd1cmVkIG1pbmltdW0uXHJcbi8vIFJlYWRzIGZyb20gc2V0dGluZ3MubWluVW5pdFByaWNlIChudWxsYWJsZSkuXHJcbi8vIFByZWNlZGVuY2UgZm9yIHVuaXQgcHJpY2UgZmllbGRzOlxyXG4vLyAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZSA+IFJ2VW5pdFByaWNlQ29weSA+IFVuaXRQcmljZVxyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWluVW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICBjb25zdCBtaW4gPSBOdW1iZXIoc2V0dGluZ3MubWluVW5pdFByaWNlKTtcclxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1pbikpIHJldHVybiBbXTtcclxuXHJcbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm10ID0gKG4pID0+IChOdW1iZXIuaXNGaW5pdGUobilcclxuICAgICAgICAgICAgICAgICAgICA/IG4udG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDYgfSlcclxuICAgICAgICAgICAgICAgICAgICA6IFN0cmluZyhuKSk7XHJcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAga2luZDogJ3ByaWNlLm1pblVuaXRQcmljZScsXHJcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgVW5pdCBQcmljZSAke2ZtdChudW0pfSA8IE1pbiAke2ZtdChtaW4pfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWluIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanNcclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWF4VW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxyXG4gICAgY29uc3QgbWF4ID0gTnVtYmVyKHNldHRpbmdzLm1heFVuaXRQcmljZSk7XHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtYXgpKSByZXR1cm4gW107XHJcblxyXG4gICAgY29uc3QgaXNzdWVzID0gW107XHJcblxyXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XHJcblxyXG4gICAgICAgICAgICAvLyBwcmVjZWRlbmNlOiBjdXN0b21pemVkID4gY29weSA+IGJhc2VcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm10ID0gKG4pID0+IChOdW1iZXIuaXNGaW5pdGUobikgPyBuLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiA2IH0pIDogU3RyaW5nKG4pKTtcclxuICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWF4VW5pdFByaWNlJyxcclxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2Vycm9yJyxcclxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9ID4gTWF4ICR7Zm10KG1heCl9YCxcclxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHVuaXRSYXc6IHJhdywgdW5pdE51bTogbnVtLCBtYXggfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGlzc3VlcztcclxufVxyXG5cclxubWF4VW5pdFByaWNlLm1ldGEgPSB7IGlkOiAnbWF4VW5pdFByaWNlJywgbGFiZWw6ICdNYXggVW5pdCBQcmljZScgfTtcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzXHJcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XHJcbi8vaW1wb3J0IGZvcmJpZFplcm9QcmljZSBmcm9tICcuL2ZvcmJpZFplcm9QcmljZSc7XHJcbmltcG9ydCBtaW5Vbml0UHJpY2UgZnJvbSAnLi9taW5Vbml0UHJpY2UnO1xyXG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IFttYXhVbml0UHJpY2UsIG1pblVuaXRQcmljZSwgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZV07ICAvL3JlcXVpcmVSZXNvbHZlZFBhcnQsIGZvcmJpZFplcm9QcmljZSwgXHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcclxuaW1wb3J0IHJ1bGVzIGZyb20gJy4vcnVsZXMnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcclxuICAgIGF3YWl0IFRNVXRpbHMud2FpdEZvck1vZGVsQXN5bmMoJy5wbGV4LWdyaWQnLCB7IHJlcXVpcmVLbzogdHJ1ZSwgdGltZW91dE1zOiAxMjAwMCB9KTtcclxuXHJcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgY29uc3QgZ3ZtID0gZ3JpZCA/IEtPPy5kYXRhRm9yPy4oZ3JpZCkgOiBudWxsO1xyXG5cclxuICAgIGNvbnN0IHJvd3MgPSAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xyXG4gICAgY29uc3QgZ3JvdXBzQnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xyXG4gICAgICAgIGNvbnN0IHFwID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUXVvdGVQYXJ0S2V5JykgPz8gLTE7XHJcbiAgICAgICAgKGdyb3Vwc0J5UXVvdGVQYXJ0LmdldChxcCkgfHwgZ3JvdXBzQnlRdW90ZVBhcnQuc2V0KHFwLCBbXSkuZ2V0KHFwKSkucHVzaChyKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcmltYXJ5QnlRdW90ZVBhcnQgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGNvbnN0IHAgPSBncm91cC5maW5kKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnSXNVbmlxdWVRdW90ZVBhcnQnKSA9PT0gMSkgfHwgZ3JvdXBbMF07XHJcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LnNldChxcCwgcCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY3R4ID0ge1xyXG4gICAgICAgIHJvd3MsXHJcbiAgICAgICAgZ3JvdXBzQnlRdW90ZVBhcnQsXHJcbiAgICAgICAgcHJpbWFyeUJ5UXVvdGVQYXJ0LFxyXG4gICAgICAgIGxhc3RGb3JtOiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZUZvcm0/LigpLFxyXG4gICAgICAgIGxhc3RSZXN1bHQ6IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlPy4oKVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCB1dGlscyA9IHsgZ2V0OiAob2JqLCBwYXRoLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKG9iaiwgcGF0aCwgb3B0cykgfTtcclxuXHJcbiAgICBjb25zdCBpc3N1ZXNSYXcgPSBydWxlcy5mbGF0TWFwKHJ1bGUgPT4gcnVsZShjdHgsIHNldHRpbmdzLCB1dGlscykpO1xyXG4gICAgY29uc3Qgb2sgPSBpc3N1ZXNSYXcuZXZlcnkoaSA9PiBpLmxldmVsICE9PSAnZXJyb3InKTtcclxuXHJcbiAgICAvLyBFbnJpY2ggaXNzdWVzIHdpdGggVUktZmFjaW5nIGRhdGEgKGxpbmVOdW1iZXIsIHBhcnRObywgcnVsZUxhYmVsKVxyXG4gICAgY29uc3QgdG9OdW0gPSAodikgPT4gTnVtYmVyKFN0cmluZyh2ID8/ICcnKS5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgY29uc3QgcnVsZUxhYmVsRnJvbSA9IChpc3MpID0+IHtcclxuICAgICAgICAvLyBQcmVmZXJyZWQ6IHJ1bGUgZnVuY3Rpb24gc2V0cyAubWV0YS5sYWJlbCAoZS5nLiwgbWF4VW5pdFByaWNlLm1ldGEubGFiZWwpXHJcbiAgICAgICAgaWYgKGlzcz8ubWV0YT8ubGFiZWwpIHJldHVybiBpc3MubWV0YS5sYWJlbDtcclxuICAgICAgICBpZiAoaXNzPy5raW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGsgPSBTdHJpbmcoaXNzLmtpbmQpO1xyXG4gICAgICAgICAgICAvLyBwcmV0dGlmeSBcInByaWNlLm1heFVuaXRQcmljZVwiID0+IFwiTWF4IFVuaXQgUHJpY2VcIlxyXG4gICAgICAgICAgICBjb25zdCB0YWlsID0gay5zcGxpdCgnLicpLnBvcCgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGFpbFxyXG4gICAgICAgICAgICAgICAgPyB0YWlsLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpXHJcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL14uLywgKGMpID0+IGMudG9VcHBlckNhc2UoKSlcclxuICAgICAgICAgICAgICAgIDogaztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuICdWYWxpZGF0aW9uJztcclxuICAgIH07XHJcblxyXG4gICAgLy8gQnVpbGQgYSBxdWljayBtYXAgb2Ygcm93IC0+IGluZm9cclxuICAgIGNvbnN0IHJvd0luZm8gPSBuZXcgTWFwKCk7IC8vIHZtIC0+IHsgbGluZU51bWJlciwgcGFydE5vIH1cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCByID0gY3R4LnJvd3NbaV07XHJcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xyXG4gICAgICAgIGNvbnN0IHBhcnRObyA9IHV0aWxzLmdldChyLCAnUGFydE5vJywgeyB0cmltOiB0cnVlIH0pID8/ICcnO1xyXG4gICAgICAgIHJvd0luZm8uc2V0KHIsIHsgbGluZU51bWJlciwgcGFydE5vIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFsc28gbWFwIFFQSyAtPiBcInByaW1hcnlcIiByb3cgZm9yIGNoZWFwIGxvb2t1cFxyXG4gICAgY29uc3QgcXBrVG9QcmltYXJ5SW5mbyA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgW3FwLCBwcmltYXJ5XSBvZiBjdHgucHJpbWFyeUJ5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSByb3dJbmZvLmdldChwcmltYXJ5KSB8fCB7IGxpbmVOdW1iZXI6IG51bGwsIHBhcnRObzogdXRpbHMuZ2V0KHByaW1hcnksICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycgfTtcclxuICAgICAgICBxcGtUb1ByaW1hcnlJbmZvLnNldChxcCwgaW5mbyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQnVpbGQgYSBTb3J0T3JkZXIgbG9va3VwIGJ5IHZpc3VhbCByb3cgaW5kZXggKGZyb20gdGhlIFZNLCBub3QgdGhlIERPTSlcclxuICAgIGNvbnN0IHNvcnRCeUxpbmUgPSBuZXcgTWFwKCk7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gY3R4LnJvd3NbaV07XHJcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xyXG4gICAgICAgIGNvbnN0IHNvcnRPcmRlciA9IHV0aWxzLmdldChyb3csICdTb3J0T3JkZXInLCB7IG51bWJlcjogdHJ1ZSB9KTtcclxuICAgICAgICBzb3J0QnlMaW5lLnNldChsaW5lTnVtYmVyLCBzb3J0T3JkZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IGlzc3Vlc1Jhdy5tYXAoaXNzID0+IHtcclxuICAgICAgICBjb25zdCBxcGsgPSBpc3MucXVvdGVQYXJ0S2V5ID8/IC0xO1xyXG4gICAgICAgIGNvbnN0IGluZm8gPSBxcGtUb1ByaW1hcnlJbmZvLmdldChxcGspIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiAnJyB9O1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIC4uLmlzcyxcclxuICAgICAgICAgICAgbGluZU51bWJlcjogaW5mby5saW5lTnVtYmVyLFxyXG4gICAgICAgICAgICBwYXJ0Tm86IGluZm8ucGFydE5vLFxyXG4gICAgICAgICAgICBydWxlTGFiZWw6IHJ1bGVMYWJlbEZyb20oaXNzKSxcclxuICAgICAgICAgICAgc29ydE9yZGVyOiBzb3J0QnlMaW5lLmdldChpbmZvLmxpbmVOdW1iZXIgPz8gLTEpXHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuXHJcbiAgICAvLyBzdGFzaCBpZiB5b3Ugd2FudCBvdGhlciBtb2R1bGVzIHRvIHJlYWQgaXQgbGF0ZXJcclxuICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xyXG4gICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHsgYXQ6IERhdGUubm93KCksIG9rLCBpc3N1ZXMgfTtcclxuXHJcbiAgICByZXR1cm4geyBvaywgaXNzdWVzIH07XHJcbn1cclxuXHJcbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XHJcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXHJcbiAgICA/IF9fQlVJTERfREVWX19cclxuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XHJcblxyXG5pZiAoX19CVUlMRF9ERVZfXykge1xyXG4gICAgLy8gTWluaW1hbCBLTy9ncmlkIHJlc29sdmVycyBrZXB0IGxvY2FsIHRvIGRlYnVnIGhlbHBlcnNcclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGZ1bmN0aW9uIGdldEdyaWRWTSgpIHtcclxuICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgICAgIHJldHVybiBncmlkID8gKEtPPy5kYXRhRm9yPy4oZ3JpZCkgfHwgbnVsbCkgOiBudWxsO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gZ2V0R3JpZFJvd3MoKSB7XHJcbiAgICAgICAgY29uc3QgZ3ZtID0gZ2V0R3JpZFZNKCk7XHJcbiAgICAgICAgcmV0dXJuIChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBwbGFpblJvdyhyKSB7XHJcbiAgICAgICAgY29uc3QgZ3YgPSAocCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCBwLCBvcHRzKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBRdW90ZVBhcnRLZXk6IGd2KCdRdW90ZVBhcnRLZXknKSxcclxuICAgICAgICAgICAgUGFydE5vOiBndignUGFydE5vJywgeyB0cmltOiB0cnVlIH0pLFxyXG4gICAgICAgICAgICBQYXJ0U3RhdHVzOiBndignUGFydFN0YXR1cycsIHsgdHJpbTogdHJ1ZSB9KSxcclxuICAgICAgICAgICAgUXVhbnRpdHk6IGd2KCdRdWFudGl0eScpLFxyXG4gICAgICAgICAgICBVbml0UHJpY2U6IGd2KCdVbml0UHJpY2UnKSxcclxuICAgICAgICAgICAgUnZVbml0UHJpY2VDb3B5OiBndignUnZVbml0UHJpY2VDb3B5JyksXHJcbiAgICAgICAgICAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZTogZ3YoJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBJc1VuaXF1ZVF1b3RlUGFydDogZ3YoJ0lzVW5pcXVlUXVvdGVQYXJ0JylcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gdG9DU1Yob2Jqcykge1xyXG4gICAgICAgIGlmICghb2Jqcz8ubGVuZ3RoKSByZXR1cm4gJyc7XHJcbiAgICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKG9ianNbMF0pO1xyXG4gICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiAodiA9PSBudWxsID8gJycgOiBTdHJpbmcodikuaW5jbHVkZXMoJywnKSB8fCBTdHJpbmcodikuaW5jbHVkZXMoJ1wiJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcXG4nKVxyXG4gICAgICAgICAgICA/IGBcIiR7U3RyaW5nKHYpLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgXHJcbiAgICAgICAgICAgIDogU3RyaW5nKHYpKTtcclxuICAgICAgICBjb25zdCBoZWFkID0gY29scy5qb2luKCcsJyk7XHJcbiAgICAgICAgY29uc3QgYm9keSA9IG9ianMubWFwKG8gPT4gY29scy5tYXAoYyA9PiBlc2Mob1tjXSkpLmpvaW4oJywnKSkuam9pbignXFxuJyk7XHJcbiAgICAgICAgcmV0dXJuIGhlYWQgKyAnXFxuJyArIGJvZHk7XHJcbiAgICB9XHJcbiAgICBmdW5jdGlvbiBkb3dubG9hZChuYW1lLCBibG9iKSB7XHJcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcclxuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xyXG4gICAgICAgIGEuaHJlZiA9IHVybDsgYS5kb3dubG9hZCA9IG5hbWU7IGEuY2xpY2soKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMjAwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcclxuICAgICAgICAvLyBTZXR0aW5ncyBoZWxwZXJzXHJcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XHJcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxyXG4gICAgICAgICAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiBHTV9nZXRWYWx1ZSgncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSxcclxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJylcclxuICAgICAgICB9KSxcclxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXHJcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxyXG5cclxuICAgICAgICAvLyBHcmlkIGV4cG9ydGVyc1xyXG4gICAgICAgIGdyaWQ6ICh7IHBsYWluID0gdHJ1ZSB9ID0ge30pID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGdldEdyaWRSb3dzKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBwbGFpbiA/IHJvd3MubWFwKHBsYWluUm93KSA6IHJvd3M7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBncmlkVGFibGU6ICgpID0+IGNvbnNvbGUudGFibGU/Lih1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KSksXHJcblxyXG4gICAgICAgIC8vIENTVi9KU09OIGRvd25sb2FkZXJzXHJcbiAgICAgICAgZG93bmxvYWRHcmlkSlNPTjogKGZpbGVuYW1lID0gJ3F0LWdyaWQuanNvbicpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pLCBudWxsLCAyKTtcclxuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSkpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZG93bmxvYWRHcmlkQ1NWOiAoZmlsZW5hbWUgPSAncXQtZ3JpZC5jc3YnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNzdiA9IHRvQ1NWKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKTtcclxuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtjc3ZdLCB7IHR5cGU6ICd0ZXh0L2NzdicgfSkpO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8vIFZhbGlkYXRpb24gb24tZGVtYW5kIChzYW1lIGVuZ2luZSBhcyB0aGUgYnV0dG9uKVxyXG4gICAgICAgIHZhbGlkYXRlTm93OiBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgcnVuVmFsaWRhdGlvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2VuZ2luZS5qcycpOyAvLyBzYW1lIG1vZHVsZSB1c2VkIGJ5IHRoZSBodWIgYnV0dG9uXHJcbiAgICAgICAgICAgIGNvbnN0IHsgZ2V0U2V0dGluZ3MgfSA9IGF3YWl0IGltcG9ydCgnLi9pbmRleC5qcycpO1xyXG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIGdldFNldHRpbmdzKCkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4ocmVzLmlzc3VlcyB8fCBbXSk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXM7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLy8gUXVpY2sgZXhwZWN0YXRpb24gaGVscGVyOiBcdTIwMUNzaG93IG1lIHJvd3MgYWJvdmUgbWF4XHUyMDFEXHJcbiAgICAgICAgZXhwZWN0VW5kZXJNYXg6IChtYXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1heCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzXHJcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA+IHNldClcclxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgdW5kZXJNaW46IChtaW4pID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1pbik7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3QgdG9OdW0gPSAodikgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzXHJcbiAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHsgLi4uciwgX1VuaXROdW06IHRvTnVtKHIuUnZDdXN0b21pemVkVW5pdFByaWNlID8/IHIuUnZVbml0UHJpY2VDb3B5ID8/IHIuVW5pdFByaWNlKSB9KSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA8IHNldClcclxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuLy8gRW5zdXJlIHRoZSBzZXR0aW5ncyBVSSBsb2FkcyAoZ2VhciBidXR0b24sIHN0b3JhZ2UgQVBJKVxyXG5pbXBvcnQgJy4vaW5kZXguanMnO1xyXG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcclxuaW1wb3J0IHsgbW91bnRWYWxpZGF0aW9uQnV0dG9uIH0gZnJvbSAnLi9pbmplY3RCdXR0b24uanMnO1xyXG5cclxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcclxuXHJcbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XHJcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xyXG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xyXG4gICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nKTtcclxuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcclxuICAgIHJldHVybiAvXnBhcnRcXHMqc3VtbWFyeSQvaS50ZXN0KGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XHJcbiAgICBpZiAoIWlzV2l6YXJkKCkpIHJldHVybiB1bm1vdW50KCk7XHJcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xyXG4gICAgICAgIGlmICghdW5tb3VudEJ0bikgdW5tb3VudEJ0biA9IGF3YWl0IG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdW5tb3VudCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB1bm1vdW50KCkgeyBpZiAodW5tb3VudEJ0bikgeyB1bm1vdW50QnRuKCk7IHVubW91bnRCdG4gPSBudWxsOyB9IH1cclxuXHJcbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcclxucmVjb25jaWxlKCk7XHJcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcclxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xyXG5jb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0Jyk7XHJcbmlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xyXG5cclxuIiwgIi8vIEFkZHMgYSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gYW5kIHdpcmVzIGl0IHRvIHRoZSBlbmdpbmUuXHJcbi8vIEFzc3VtZXMgeW91ciBzZXR0aW5ncyBVSSBleHBvcnRzIGdldFNldHRpbmdzL29uU2V0dGluZ3NDaGFuZ2UuXHJcblxyXG5pbXBvcnQgeyBydW5WYWxpZGF0aW9uIH0gZnJvbSAnLi9lbmdpbmUnO1xyXG5pbXBvcnQgeyBnZXRTZXR0aW5ncywgb25TZXR0aW5nc0NoYW5nZSB9IGZyb20gJy4vaW5kZXgnO1xyXG5cclxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEh1YihvcHRzID0geyBtb3VudDogJ25hdicgfSkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgZW5zdXJlID0gKHdpbmRvdy5lbnN1cmVMVEh1YiB8fCB1bnNhZmVXaW5kb3c/LmVuc3VyZUxUSHViKTtcclxuICAgICAgICBpZiAodHlwZW9mIGVuc3VyZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMDApKTtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG93VmFsaWRhdGlvbk1vZGFsKGlzc3VlcyA9IFtdKSB7XHJcbiAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XHJcblxyXG4gICAgLy8gYnVpbGQgcm93c1xyXG4gICAgY29uc3Qgcm93c0h0bWwgPSBpc3N1ZXMubWFwKGlzcyA9PiB7XHJcbiAgICAgICAgY29uc3QgbHZsID0gKGlzcy5sZXZlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGxcIiBzdHlsZT1cImJvcmRlci1jb2xvcjoke2x2bCA9PT0gJ2Vycm9yJyA/ICcjZmNhNWE1JyA6ICcjY2JkNWUxJ307IGNvbG9yOiR7bHZsID09PSAnZXJyb3InID8gJyNiOTFjMWMnIDogJyMzMzQxNTUnfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcclxuICAgICAgICBjb25zdCByZWFzb24gPSBpc3MubWVzc2FnZSB8fCAnKG5vIG1lc3NhZ2UpJztcclxuICAgICAgICBjb25zdCBydWxlID0gaXNzLnJ1bGVMYWJlbCB8fCBpc3Mua2luZCB8fCAnVmFsaWRhdGlvbic7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPHRyIGRhdGEtcXBrPVwiJHtpc3MucXVvdGVQYXJ0S2V5ID8/ICcnfVwiIGRhdGEtcnVsZT1cIiR7U3RyaW5nKGlzcy5raW5kIHx8ICcnKX1cIj5cclxuICAgICAgICAgIDx0ZD4ke2lzcy5zb3J0T3JkZXIgPz8gJyd9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke2lzcy5wYXJ0Tm8gPz8gJyd9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke3J1bGV9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cclxuICAgICAgICAgIDx0ZD4ke3JlYXNvbn08L3RkPlxyXG4gICAgICAgIDwvdHI+YFxyXG4gICAgfSkuam9pbignJyk7XHJcblxyXG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgb3ZlcmxheS5pZCA9ICdxdHYtbW9kYWwtb3ZlcmxheSc7XHJcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgbW9kYWwuaWQgPSAncXR2LW1vZGFsJztcclxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcclxuICA8ZGl2IGNsYXNzPVwicXR2LWhkXCI+XHJcbiAgICA8aDM+VmFsaWRhdGlvbiBEZXRhaWxzPC9oMz5cclxuICAgIDxkaXYgY2xhc3M9XCJxdHYtYWN0aW9uc1wiPlxyXG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCIgaWQ9XCJxdHYtZXhwb3J0LWNzdlwiIHRpdGxlPVwiRXhwb3J0IHZpc2libGUgaXNzdWVzIHRvIENTVlwiPkV4cG9ydCBDU1Y8L2J1dHRvbj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGlkPVwicXR2LWNsb3NlXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMyNTYzZWI7IGNvbG9yOiNmZmY7IGJvcmRlcjoxcHggc29saWQgIzFkNGVkODtcIj5DbG9zZTwvYnV0dG9uPlxyXG4gICAgPC9kaXY+XHJcbiAgPC9kaXY+XHJcbiAgPGRpdiBjbGFzcz1cInF0di1iZFwiPlxyXG4gICAgPHRhYmxlIGFyaWEtbGFiZWw9XCJWYWxpZGF0aW9uIElzc3Vlc1wiPlxyXG4gICAgICA8dGhlYWQ+XHJcbiAgPHRyPlxyXG4gICAgPHRoPlNvcnQmbmJzcDtPcmRlcjwvdGg+XHJcbiAgICA8dGg+UGFydCAjPC90aD5cclxuICAgIDx0aD5SdWxlPC90aD5cclxuICAgIDx0aD5MZXZlbDwvdGg+XHJcbiAgICA8dGg+UmVhc29uPC90aD5cclxuICA8L3RyPlxyXG48L3RoZWFkPlxyXG4gICAgICA8dGJvZHk+JHtyb3dzSHRtbCB8fCBgPHRyPjx0ZCBjb2xzcGFuPVwiNVwiIHN0eWxlPVwib3BhY2l0eTouNzsgcGFkZGluZzoxMnB4O1wiPk5vIGlzc3Vlcy48L3RkPjwvdHI+YH08L3Rib2R5PlxyXG4gICAgPC90YWJsZT5cclxuICA8L2Rpdj5cclxuYDtcclxuXHJcbiAgICAvLyBpbnRlcmFjdGlvbnNcclxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKTtcclxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xyXG5cclxuICAgIC8vIGNsaWNrIHJvdyB0byBmb2N1cyArIGhpZ2hsaWdodCArIHNjcm9sbFxyXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvcigndGJvZHknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTsgaWYgKCF0cikgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHFwayA9IHRyLmdldEF0dHJpYnV0ZSgnZGF0YS1xcGsnKTtcclxuICAgICAgICBpZiAoIXFwaykgcmV0dXJuO1xyXG4gICAgICAgIC8vIGVuc3VyZSBoaWdobGlnaHRzIGV4aXN0LCB0aGVuIGp1bXBcclxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XHJcbiAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xyXG4gICAgICAgIGlmIChyb3cpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJykpO1xyXG4gICAgICAgICAgICByb3cuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJyk7XHJcbiAgICAgICAgICAgIHJvdy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIGV4cG9ydCBDU1ZcclxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZXhwb3J0LWNzdicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICBjb25zdCBjc3YgPSBbXHJcbiAgICAgICAgICAgIFsnTGluZScsICdTb3J0T3JkZXInLCAnUGFydE5vJywgJ1F1b3RlUGFydEtleScsICdSdWxlJywgJ0xldmVsJywgJ1JlYXNvbiddLmpvaW4oJywnKSxcclxuICAgICAgICAgICAgLi4uaXNzdWVzLm1hcChpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVzYyA9ICh2KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2ID8/ICcnKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gL1tcIixcXG5dLy50ZXN0KHMpID8gYFwiJHtzLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCJgIDogcztcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgICAgICAgIGkubGluZU51bWJlciA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnNvcnRPcmRlciA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnBhcnRObyA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnF1b3RlUGFydEtleSA/PyAnJyxcclxuICAgICAgICAgICAgICAgICAgICBpLnJ1bGVMYWJlbCB8fCBpLmtpbmQgfHwgJ1ZhbGlkYXRpb24nLFxyXG4gICAgICAgICAgICAgICAgICAgIGkubGV2ZWwgfHwgJycsXHJcbiAgICAgICAgICAgICAgICAgICAgaS5tZXNzYWdlIHx8ICcnXHJcbiAgICAgICAgICAgICAgICBdLm1hcChlc2MpLmpvaW4oJywnKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xyXG5cclxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KTtcclxuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xyXG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24taXNzdWVzLmNzdic7IGEuY2xpY2soKTtcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKG1vZGFsKTtcclxuICAgIChkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRWYWxpZGF0aW9uQnV0dG9uKFRNVXRpbHMpIHtcclxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IGdldEh1Yih7IG1vdW50OiAnbmF2JyB9KTtcclxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcclxuXHJcbiAgICAvLyBhdm9pZCBkdXBsaWNhdGVcclxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xyXG5cclxuICAgIGxldCBidG5FbCA9IG51bGw7XHJcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XHJcbiAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXHJcbiAgICAgICAgbGFiZWw6ICdWYWxpZGF0ZSBMaW5lcycsXHJcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcclxuICAgICAgICB3ZWlnaHQ6IDEzMCxcclxuICAgICAgICBvbkNsaWNrOiBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xyXG4gICAgICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrPy4oJ1ZhbGlkYXRpbmdcdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBvbGQgaGlnaGxpZ2h0c1xyXG4gICAgICAgICAgICAgICAgY2xlYXJWYWxpZGF0aW9uSGlnaGxpZ2h0cygpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChyZXM/Lm9rKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oJ1x1MjcwNSBMaW5lcyB2YWxpZCcsICdzdWNjZXNzJywgeyBtczogMTgwMCB9KTtcclxuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignVmFsaWQnKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBpc3N1ZXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1bW1hcnkgPSBidWlsZElzc3Vlc1N1bW1hcnkoaXNzdWVzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBcdTI3NEMgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ2lzc3VlJyA6ICdpc3N1ZXMnfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdlcnJvcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgbXM6IDY1MDAgfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBcdTI3NEMgJHtjb3VudH0gaXNzdWUke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBzdGlja3k6IHRydWUgfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE9wZW4gbW9kYWwgd2l0aCBkZXRhaWxzICh3ZSBubyBsb25nZXIgYXV0by1oaWdobGlnaHQgcm93cyBvciBibG9jayBOZXh0KVxyXG4gICAgICAgICAgICAgICAgICAgIHNob3dWYWxpZGF0aW9uTW9kYWwoaXNzdWVzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBjYWNoZSBsYXN0IHN0YXR1cyBmb3IgU1BBIHJlZHJhd3NcclxuICAgICAgICAgICAgICAgIFRNVXRpbHMuc3RhdGUgPSBUTVV0aWxzLnN0YXRlIHx8IHt9O1xyXG4gICAgICAgICAgICAgICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHJlcztcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgVmFsaWRhdGlvbiBlcnJvcjogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDYwMDAgfSk7XHJcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFiIGJhY2sgdGhlIHJlYWwgRE9NIGJ1dHRvbiB0byB1cGRhdGUgdGl0bGUgbGF0ZXJcclxuICAgIGJ0bkVsID0gaHViLl9zaGFkb3c/LnF1ZXJ5U2VsZWN0b3I/LihgW2RhdGEtaWQ9XCIke0hVQl9CVE5fSUR9XCJdYCk7XHJcblxyXG4gICAgY29uc3Qgb2ZmU2V0dGluZ3MgPSBvblNldHRpbmdzQ2hhbmdlPy4oKCkgPT4gcmVmcmVzaExhYmVsKGJ0bkVsKSk7XHJcbiAgICByZWZyZXNoTGFiZWwoYnRuRWwpO1xyXG5cclxuICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgb2ZmU2V0dGluZ3M/LigpO1xyXG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWZyZXNoTGFiZWwoYnRuKSB7XHJcbiAgICBpZiAoIWJ0bikgcmV0dXJuO1xyXG4gICAgY29uc3QgcyA9IGdldFNldHRpbmdzKCk7XHJcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xyXG4gICAgLy9pZiAocy5yZXF1aXJlUmVzb2x2ZWRQYXJ0KSBwYXJ0cy5wdXNoKCdQYXJ0Jyk7XHJcbiAgICAvL2lmIChzLmZvcmJpZFplcm9QcmljZSkgcGFydHMucHVzaCgnXHUyMjYwJDAnKTtcclxuICAgIGlmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xyXG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XHJcbiAgICBidG4udGl0bGUgPSBgUnVsZXM6ICR7cGFydHMuam9pbignLCAnKSB8fCAnbm9uZSd9YDtcclxufVxyXG5cclxuLy8gLS0tIEtPICsgZ3JpZCBoZWxwZXJzIC0tLVxyXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XHJcblxyXG5mdW5jdGlvbiBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCkge1xyXG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdHYtc3R5bGVzJykpIHJldHVybjtcclxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcclxuICAgIHN0eWxlLmlkID0gJ3F0di1zdHlsZXMnO1xyXG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXHJcbi5xdHYtcm93LWZhaWwgeyBvdXRsaW5lOiAycHggc29saWQgcmdiYSgyMjAsIDM4LCAzOCwgLjg1KSAhaW1wb3J0YW50OyBvdXRsaW5lLW9mZnNldDogLTJweDsgfVxyXG4ucXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0IHsgYmFja2dyb3VuZDogcmdiYSgyNTQsIDIyNiwgMjI2LCAuNjUpICFpbXBvcnRhbnQ7IH0gIC8qIHJlZC1pc2ggKi9cclxuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjE5LCAyMzQsIDI1NCwgLjY1KSAhaW1wb3J0YW50OyB9ICAvKiBibHVlLWlzaCAqL1xyXG5cclxuLyogTW9kYWwgc2hlbGwgKi9cclxuI3F0di1tb2RhbC1vdmVybGF5IHsgcG9zaXRpb246Zml4ZWQ7IGluc2V0OjA7IGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMzgpOyB6LWluZGV4OjEwMDAwMzsgfVxyXG4jcXR2LW1vZGFsIHtcclxuICBwb3NpdGlvbjphYnNvbHV0ZTsgdG9wOjUwJTsgbGVmdDo1MCU7IHRyYW5zZm9ybTp0cmFuc2xhdGUoLTUwJSwtNTAlKTtcclxuICBiYWNrZ3JvdW5kOiNmZmY7IHdpZHRoOm1pbig5NjBweCwgOTR2dyk7IG1heC1oZWlnaHQ6ODB2aDsgb3ZlcmZsb3c6aGlkZGVuO1xyXG4gIGJvcmRlci1yYWRpdXM6MTJweDsgYm94LXNoYWRvdzowIDE4cHggNDBweCByZ2JhKDAsMCwwLC4yOCk7XHJcbiAgZm9udC1mYW1pbHk6c3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmO1xyXG59XHJcblxyXG4vKiBIZWFkZXIgKi9cclxuI3F0di1tb2RhbCAucXR2LWhkIHtcclxuICBkaXNwbGF5OmZsZXg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgZ2FwOjEycHg7XHJcbiAgcGFkZGluZzoxNHB4IDE2cHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7XHJcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDE4MGRlZywgI2ZiZmJmYiAwJSwgI2Y3ZjdmNyAxMDAlKTtcclxufVxyXG4jcXR2LW1vZGFsIC5xdHYtaGQgaDMgeyBtYXJnaW46MDsgZm9udC1zaXplOjE2cHg7IGZvbnQtd2VpZ2h0OjYwMDsgY29sb3I6IzBmMTcyYTsgfVxyXG4jcXR2LW1vZGFsIC5xdHYtYWN0aW9ucyB7IG1hcmdpbi1sZWZ0OmF1dG87IGRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgfVxyXG4jcXR2LW1vZGFsIC5xdHYtYWN0aW9ucyAuYnRuIHsgYm9yZGVyLXJhZGl1czo4cHg7IGxpbmUtaGVpZ2h0OjEuMzsgcGFkZGluZzo2cHggMTBweDsgfVxyXG5cclxuLyogQm9keSAqL1xyXG4jcXR2LW1vZGFsIC5xdHYtYmQgeyBwYWRkaW5nOjEwcHggMTRweCAxNHB4OyBvdmVyZmxvdzphdXRvOyBtYXgtaGVpZ2h0OmNhbGMoODB2aCAtIDU2cHgpOyB9XHJcblxyXG4vKiBUYWJsZSAqL1xyXG4jcXR2LW1vZGFsIHRhYmxlIHsgd2lkdGg6MTAwJTsgYm9yZGVyLWNvbGxhcHNlOnNlcGFyYXRlOyBib3JkZXItc3BhY2luZzowOyBmb250LXNpemU6MTNweDsgfVxyXG4jcXR2LW1vZGFsIHRoZWFkIHRoIHtcclxuICBwb3NpdGlvbjogc3RpY2t5OyB0b3A6IDA7IHotaW5kZXg6IDE7XHJcbiAgYmFja2dyb3VuZDojZmZmOyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZWFlYWVhOyBwYWRkaW5nOjhweCAxMHB4OyB0ZXh0LWFsaWduOmxlZnQ7IGNvbG9yOiM0NzU1Njk7XHJcbn1cclxuI3F0di1tb2RhbCB0Ym9keSB0ZCB7IHBhZGRpbmc6OHB4IDEwcHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNmMWY1Zjk7IH1cclxuI3F0di1tb2RhbCB0Ym9keSB0cjpudGgtY2hpbGQob2RkKSB7IGJhY2tncm91bmQ6I2ZjZmRmZjsgfVxyXG4jcXR2LW1vZGFsIHRib2R5IHRyOmhvdmVyIHsgYmFja2dyb3VuZDojZjFmNWY5OyBjdXJzb3I6cG9pbnRlcjsgfVxyXG4jcXR2LW1vZGFsIHRkOm50aC1jaGlsZCgxKSB7IHdpZHRoOjEwMHB4OyB9ICAgICAgICAgICAvKiBTb3J0IE9yZGVyICovXHJcbiNxdHYtbW9kYWwgdGQ6bnRoLWNoaWxkKDIpIHsgd2lkdGg6MjIwcHg7IH0gICAgICAgICAgIC8qIFBhcnQgIyAgICAqL1xyXG4jcXR2LW1vZGFsIHRkOmxhc3QtY2hpbGQgeyB3b3JkLWJyZWFrOiBicmVhay13b3JkOyB9ICAvKiBSZWFzb24gICAgKi9cclxuXHJcbi8qIFBpbGxzICovXHJcbiNxdHYtbW9kYWwgLnF0di1waWxsIHsgZGlzcGxheTppbmxpbmUtYmxvY2s7IHBhZGRpbmc6MnB4IDhweDsgYm9yZGVyOjFweCBzb2xpZCAjZTJlOGYwOyBib3JkZXItcmFkaXVzOjk5OXB4OyBmb250LXNpemU6MTJweDsgfVxyXG5gO1xyXG5cclxuXHJcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcclxufVxyXG5cclxuXHJcbi8qKiBUYWcgdmlzaWJsZSBncmlkIHJvd3Mgd2l0aCBkYXRhLXF1b3RlLXBhcnQta2V5IGJ5IHJlYWRpbmcgS08gY29udGV4dCAqL1xyXG5mdW5jdGlvbiBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKCkge1xyXG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcclxuICAgIGlmICghZ3JpZCkgcmV0dXJuIDA7XHJcbiAgICBjb25zdCByb3dzID0gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKFxyXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXHJcbiAgICApO1xyXG4gICAgbGV0IHRhZ2dlZCA9IDA7XHJcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xyXG4gICAgICAgIGlmIChyLmhhc0F0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScpKSB7IHRhZ2dlZCsrOyBjb250aW51ZTsgfVxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4ocik7XHJcbiAgICAgICAgICAgIGNvbnN0IHZtID0gY3R4Py4kZGF0YSA/PyBjdHg/LiRyb290ID8/IG51bGw7XHJcbiAgICAgICAgICAgIGNvbnN0IHFwayA9IFRNVXRpbHMuZ2V0T2JzVmFsdWU/Lih2bSwgJ1F1b3RlUGFydEtleScpO1xyXG4gICAgICAgICAgICBpZiAocXBrICE9IG51bGwgJiYgcXBrICE9PSAnJyAmJiBOdW1iZXIocXBrKSA+IDApIHtcclxuICAgICAgICAgICAgICAgIHIuc2V0QXR0cmlidXRlKCdkYXRhLXF1b3RlLXBhcnQta2V5JywgU3RyaW5nKHFwaykpO1xyXG4gICAgICAgICAgICAgICAgdGFnZ2VkKys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlIHBlci1yb3cgZmFpbHVyZXMgKi8gfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRhZ2dlZDtcclxufVxyXG5mdW5jdGlvbiBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCkge1xyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbCcpO1xyXG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWF4dW5pdCcpO1xyXG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCcpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKSB7XHJcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xyXG4gICAgaWYgKCFncmlkKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAvLyBGYXN0IHBhdGg6IGF0dHJpYnV0ZSAocHJlZmVycmVkKVxyXG4gICAgbGV0IHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xyXG4gICAgaWYgKHJvdykgcmV0dXJuIHJvdy5jbG9zZXN0KCd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdycpIHx8IHJvdztcclxuXHJcbiAgICAvLyBJZiBhdHRyaWJ1dGVzIGFyZSBtaXNzaW5nLCB0cnkgdG8gdGFnIHRoZW0gb25jZSB0aGVuIHJldHJ5XHJcbiAgICBpZiAoZW5zdXJlUm93S2V5QXR0cmlidXRlcygpID4gMCkge1xyXG4gICAgICAgIHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xyXG4gICAgICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTGFzdCByZXNvcnQ6IHRleHR1YWwgc2NhbiAobGVzcyByZWxpYWJsZSwgYnV0IHdvcmtzIHRvZGF5KVxyXG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgICAndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93J1xyXG4gICAgKTtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgdHh0ID0gKHIudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcclxuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuLyoqIEFkZCBoaWdobGlnaHQgY2xhc3Nlczsgc3BlY2lhbCBjbGFzcyBmb3IgbWF4IHVuaXQgcHJpY2UgKi9cclxuZnVuY3Rpb24gaGlnaGxpZ2h0SXNzdWVzKGlzc3Vlcykge1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGlzc3VlcykgfHwgIWlzc3Vlcy5sZW5ndGgpIHJldHVybjtcclxuXHJcbiAgICAvLyBFbnN1cmUgcm93cyBhcmUgdGFnZ2VkIHRvIG1ha2Ugc2VsZWN0aW9uIGZhc3QgJiBzdGFibGVcclxuICAgIGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGlzcyBvZiBpc3N1ZXMpIHtcclxuICAgICAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KGlzcy5xdW90ZVBhcnRLZXkpO1xyXG4gICAgICAgIGlmICghcm93KSBjb250aW51ZTtcclxuICAgICAgICByb3cuY2xhc3NMaXN0LmFkZCgncXR2LXJvdy1mYWlsJyk7XHJcblxyXG4gICAgICAgIC8vIHJ1bGUtc3BlY2lmaWMgYWNjZW50c1xyXG4gICAgICAgIGNvbnN0IGtpbmQgPSBTdHJpbmcoaXNzLmtpbmQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgaWYgKGtpbmQgPT09ICdwcmljZS5tYXh1bml0cHJpY2UnKSB7XHJcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGtpbmQgPT09ICdwcmljZS5taW51bml0cHJpY2UnKSB7XHJcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNjcm9sbFRvRmlyc3RJc3N1ZShpc3N1ZXMpIHtcclxuICAgIGNvbnN0IGZpcnN0ID0gKGlzc3VlcyB8fCBbXSlbMF07XHJcbiAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcbiAgICBjb25zdCByb3cgPSBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KGZpcnN0LnF1b3RlUGFydEtleSk7XHJcbiAgICBpZiAocm93ICYmIHR5cGVvZiByb3cuc2Nyb2xsSW50b1ZpZXcgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByb3cuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMsIHsgbWF4R3JvdXBzID0gNCwgbWF4UXBrcyA9IDUgfSA9IHt9KSB7XHJcbiAgICBjb25zdCBncm91cGVkID0gKGlzc3VlcyB8fCBbXSkucmVkdWNlKChtLCBpdCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGsgPSBpdC5raW5kIHx8ICdvdGhlcic7XHJcbiAgICAgICAgaWYgKCFtLmhhcyhrKSkgbS5zZXQoaywgW10pO1xyXG4gICAgICAgIG0uZ2V0KGspLnB1c2goaXQucXVvdGVQYXJ0S2V5KTtcclxuICAgICAgICByZXR1cm4gbTtcclxuICAgIH0sIG5ldyBNYXAoKSk7XHJcblxyXG4gICAgY29uc3QgcGFydHMgPSBbXTtcclxuICAgIGxldCBnSW5kZXggPSAwO1xyXG4gICAgZm9yIChjb25zdCBba2luZCwgcXBrc10gb2YgZ3JvdXBlZCkge1xyXG4gICAgICAgIGlmIChnSW5kZXgrKyA+PSBtYXhHcm91cHMpIHsgcGFydHMucHVzaCgnXHUyMDI2Jyk7IGJyZWFrOyB9XHJcbiAgICAgICAgY29uc3QgbGlzdCA9IFsuLi5uZXcgU2V0KHFwa3MpXS5zbGljZSgwLCBtYXhRcGtzKS5qb2luKCcsICcpO1xyXG4gICAgICAgIHBhcnRzLnB1c2goYCR7a2luZH06IFFQSyAke2xpc3R9JHtxcGtzLmxlbmd0aCA+IG1heFFwa3MgPyAnLCBcdTIwMjYnIDogJyd9YCk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFydHMuam9pbignIFx1MjAyMiAnKSB8fCAnU2VlIGRldGFpbHMnO1xyXG59XHJcblxyXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKSA/IF9fQlVJTERfREVWX18gOiB0cnVlO1xyXG5pZiAoREVWKSB7XHJcbiAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVRWX0RFQlVHID0gKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyB8fCB7fTtcclxuICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcudGFnU3RhdHMgPSAoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcclxuICAgICAgICBjb25zdCByb3dzID0gZ3JpZCA/IGdyaWQucXVlcnlTZWxlY3RvckFsbCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3csIC5rLXRhYmxlLXJvdywgLmstZ3JpZCAuay1ncmlkLWNvbnRlbnQgLmstdGFibGUtcm93JykgOiBbXTtcclxuICAgICAgICBjb25zdCB0YWdnZWQgPSBncmlkID8gZ3JpZC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1xdW90ZS1wYXJ0LWtleV0nKSA6IFtdO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbUVRWXSByb3dzOicsIHJvd3MubGVuZ3RoLCAndGFnZ2VkOicsIHRhZ2dlZC5sZW5ndGgpO1xyXG4gICAgICAgIHJldHVybiB7IHRvdGFsOiByb3dzLmxlbmd0aCwgdGFnZ2VkOiB0YWdnZWQubGVuZ3RoIH07XHJcbiAgICB9O1xyXG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy5oaWxpVGVzdCA9IChxcGspID0+IHtcclxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XHJcbiAgICAgICAgY29uc3QgciA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcclxuICAgICAgICBpZiAocikgeyByLmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcsICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTsgci5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyB9XHJcbiAgICAgICAgcmV0dXJuICEhcjtcclxuICAgIH07XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQXNDTyxXQUFTLGNBQWM7QUFDMUIsV0FBTztBQUFBLE1BQ0gsU0FBUyxPQUFPLEtBQUssT0FBTztBQUFBLE1BQzVCLDJCQUEyQixPQUFPLEtBQUsseUJBQXlCO0FBQUEsTUFDaEUsY0FBYyxPQUFPLEtBQUssWUFBWTtBQUFBLE1BQ3RDLGNBQWMsT0FBTyxLQUFLLFlBQVk7QUFBQSxJQUMxQztBQUFBLEVBQ0o7QUFDTyxXQUFTLGlCQUFpQixJQUFJO0FBQ2pDLFFBQUksT0FBTyxPQUFPLFdBQVksUUFBTyxNQUFNO0FBQUEsSUFBRTtBQUM3QyxVQUFNLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQztBQUNoQyxXQUFPLGlCQUFpQiwwQkFBMEIsQ0FBQztBQUNuRCxXQUFPLE1BQU0sT0FBTyxvQkFBb0IsMEJBQTBCLENBQUM7QUFBQSxFQUN2RTtBQUNBLFdBQVMsY0FBYztBQUNuQixRQUFJO0FBQUUsYUFBTyxjQUFjLElBQUksWUFBWSwwQkFBMEIsRUFBRSxRQUFRLFlBQVksRUFBRSxDQUFDLENBQUM7QUFBQSxJQUFHLFFBQVE7QUFBQSxJQUFFO0FBQUEsRUFDaEg7QUFXQSxpQkFBZSxnQkFBZ0I7QUFFM0IsVUFBTSxXQUFXLFFBQVEsYUFBYSxNQUFNO0FBQzVDLFVBQU0sV0FBVyxhQUFhLFNBQVMsY0FBYyxnSEFBZ0gsR0FBRyxlQUFlLElBQ2xMLEtBQUssRUFBRSxZQUFZLE1BQU0sT0FBTyxpQkFBaUIsWUFBWTtBQUVsRSxVQUFNLE1BQU0sT0FBTyxlQUFlQSxRQUFP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QVMsY0FBYyxnSEFBZ0g7QUFDbEosWUFBUSxJQUFJLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLEdBQUc7QUFBQSxFQUM3RDtBQUVBLFdBQVMsdUJBQXVCO0FBQzVCLFdBQU8sb0JBQW9CLEtBQUssd0JBQXdCLENBQUM7QUFBQSxFQUM3RDtBQUVBLGlCQUFlLFlBQVk7QUFDdkIsUUFBSSxDQUFDLFNBQVMsRUFBRyxRQUFPLFFBQVE7QUFDaEMsUUFBSSxxQkFBcUIsR0FBRztBQUN4QixVQUFJLENBQUMsV0FBWSxjQUFhLE1BQU0sc0JBQXNCLE9BQU87QUFBQSxJQUNyRSxPQUFPO0FBQ0gsY0FBUTtBQUFBLElBQ1o7QUFBQSxFQUNKO0FBRUEsV0FBUyxVQUFVO0FBQUUsUUFBSSxZQUFZO0FBQUUsaUJBQVc7QUFBRyxtQkFBYTtBQUFBLElBQU07QUFBQSxFQUFFO0FBRzFFLFlBQVU7QUFDVixXQUFTLGNBQWMsU0FBUztBQUNoQyxTQUFPLGlCQUFpQixjQUFjLFNBQVM7QUFDL0MsTUFBTSxNQUFNLFNBQVMsY0FBYyx3QkFBd0I7QUFDM0QsTUFBSSxJQUFLLEtBQUksaUJBQWlCLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxTQUFTLE1BQU0sWUFBWSxNQUFNLFdBQVcsS0FBSyxDQUFDOyIsCiAgIm5hbWVzIjogWyJnZXRIdWIiLCAiVE1VdGlscyIsICJLTyIsICJUTVV0aWxzIiwgIktPIiwgIkRFViIsICJERVYiLCAiS08iLCAicnVuVmFsaWRhdGlvbiIsICJnZXRTZXR0aW5ncyIsICJST1VURVMiXQp9Cg==
