// ==UserScript==
// @name        QT50_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.70
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.70-1758730211946
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.70-1758730211946
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.70-1758730211946
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.70-1758730211946
// @require      http://localhost:5000/lt-core.user.js?v=3.8.70-1758730211946
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
      <button id="qtv-close" class="btn btn-primary" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Save &amp; Close</button>
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
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.38)";
    overlay.style.zIndex = "2147483647";
    const modal = document.createElement("div");
    modal.id = "qtv-modal";
    modal.style.position = "absolute";
    modal.style.top = "50%";
    modal.style.left = "50%";
    modal.style.transform = "translate(-50%,-50%)";
    modal.style.background = "#fff";
    modal.style.width = "min(960px, 94vw)";
    modal.style.maxHeight = "80vh";
    modal.style.overflow = "hidden";
    modal.style.borderRadius = "12px";
    modal.style.boxShadow = "0 18px 40px rgba(0,0,0,.28)";
    modal.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
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
    modal.innerHTML = `
  <div class="qtv-hd">
    <h3>Validation Details</h3>
    <div class="qtv-actions">
      <button class="btn btn-default" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="btn btn-primary" id="qtv-close" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Save &amp; Close</button>
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
    if (document.getElementById("qtv-styles")) return;
    const style = document.createElement("style");
    style.id = "qtv-styles";
    style.textContent = `
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }  /* red-ish */
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }  /* blue-ish */

/* Modal shell */
#qtv-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.38); z-index:2147483647; }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9ydWxlcy9taW5Vbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL3J1bGVzL21heFVuaXRQcmljZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcnVsZXMvaW5kZXguanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQ1MC12YWxpZGF0aW9uL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy9xdDUwLXZhbGlkYXRpb24vcXR2LmVudHJ5LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3F0NTAtdmFsaWRhdGlvbi9pbmplY3RCdXR0b24uanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2luZGV4LmpzXG4vLyAtLS0tLS0tLS0tIEJvb3RzdHJhcCAvIHJvdXRlIGd1YXJkIC0tLS0tLS0tLS1cbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuY29uc3QgQ09ORklHID0ge1xuICAgIHdpemFyZFRhcmdldFBhZ2U6ICdQYXJ0IFN1bW1hcnknLFxuICAgIHNldHRpbmdzS2V5OiAncXQ1MF9zZXR0aW5nc192MScsXG4gICAgdG9hc3RNczogMzUwMFxufTtcblxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcbmNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG5cbi8vIEluc3RlYWQgb2YgYHJldHVybmAgYXQgdG9wLWxldmVsLCBjb21wdXRlIGEgZmxhZzpcbmNvbnN0IE9OX1JPVVRFID0gISFUTVV0aWxzLm1hdGNoUm91dGU/LihST1VURVMpO1xuaWYgKERFViAmJiAhT05fUk9VVEUpIGNvbnNvbGUuZGVidWcoJ1FUNTA6IHdyb25nIHJvdXRlLCBza2lwcGluZyBib290c3RyYXAnKTtcblxuLyogZ2xvYmFsIEdNX2dldFZhbHVlLCBHTV9zZXRWYWx1ZSwgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCwgVE1VdGlscywgdW5zYWZlV2luZG93ICovXG5leHBvcnQgY29uc3QgS0VZUyA9IHtcbiAgICBlbmFibGVkOiAncXQ1MC5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXQ1MC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdDUwLm1pblVuaXRQcmljZScsXG4gICAgbWF4VW5pdFByaWNlOiAncXQ1MC5tYXhVbml0UHJpY2UnLFxufTtcblxuY29uc3QgTEVHQUNZX0tFWVMgPSB7XG4gICAgZW5hYmxlZDogJ3F0di5lbmFibGVkJyxcbiAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiAncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgIG1pblVuaXRQcmljZTogJ3F0di5taW5Vbml0UHJpY2UnLFxuICAgIG1heFVuaXRQcmljZTogJ3F0di5tYXhVbml0UHJpY2UnLFxufTtcblxuY29uc3QgREVGID0ge1xuICAgIFtLRVlTLmVuYWJsZWRdOiB0cnVlLFxuICAgIFtLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGVdOiB0cnVlLFxuICAgIFtLRVlTLm1pblVuaXRQcmljZV06IDAsXG4gICAgW0tFWVMubWF4VW5pdFByaWNlXTogMTAsXG59O1xuZnVuY3Rpb24gcmVhZE9yTGVnYWN5KGspIHtcbiAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoayk7XG4gICAgaWYgKHYgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHY7XG4gICAgLy8gb25lLXRpbWUgbGVnYWN5IHJlYWRcbiAgICBjb25zdCBsZWdhY3lLZXkgPSBPYmplY3QudmFsdWVzKExFR0FDWV9LRVlTKS5maW5kKGxrID0+IGxrLmVuZHNXaXRoKGsuc3BsaXQoJy4nKS5wb3AoKSkpO1xuICAgIGNvbnN0IGx2ID0gbGVnYWN5S2V5ID8gR01fZ2V0VmFsdWUobGVnYWN5S2V5KSA6IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gKGx2ICE9PSB1bmRlZmluZWQpID8gbHYgOiB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IGdldFZhbCA9IGsgPT4ge1xuICAgIGNvbnN0IHYgPSByZWFkT3JMZWdhY3koayk7XG4gICAgcmV0dXJuICh2ID09PSB1bmRlZmluZWQgPyBERUZba10gOiB2KTtcbn07XG5jb25zdCBzZXRWYWwgPSAoaywgdikgPT4geyBHTV9zZXRWYWx1ZShrLCB2KTsgZW1pdENoYW5nZWQoKTsgfTtcblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZ2V0VmFsKEtFWVMuZW5hYmxlZCksXG4gICAgICAgIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGU6IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpLFxuICAgICAgICBtaW5Vbml0UHJpY2U6IGdldFZhbChLRVlTLm1pblVuaXRQcmljZSksXG4gICAgICAgIG1heFVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWF4VW5pdFByaWNlKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlSHViR2VhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlSHViR2Vhcik7XG4gICAgc2V0VGltZW91dChlbnN1cmVIdWJHZWFyLCA1MDApOyAvLyBnZW50bGUgcmV0cnkgZHVyaW5nIFNQQSBsb2Fkc1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJHZWFyKCkge1xuICAgIC8vIG9ubHkgc2hvdyBnZWFyIG9uIHRoZSBQYXJ0IFN1bW1hcnkgcGFnZVxuICAgIGNvbnN0IG9uV2l6YXJkID0gVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKTtcbiAgICBjb25zdCBhY3RpdmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgY29uc3QgbmFtZSA9IChhY3RpdmU/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIGNvbnN0IG9uVGFyZ2V0ID0gb25XaXphcmQgJiYgL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChuYW1lKTtcblxuICAgIGNvbnN0IGh1YiA9IGF3YWl0IChhc3luYyBmdW5jdGlvbiBnZXRIdWIob3B0cyA9IHsgbW91bnQ6ICduYXYnIH0pIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBlbnN1cmUgPSAod2luZG93LmVuc3VyZUxUSHViIHx8IHVuc2FmZVdpbmRvdz8uZW5zdXJlTFRIdWIpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnN1cmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICB0cnkgeyBjb25zdCBoID0gYXdhaXQgZW5zdXJlKG9wdHMpOyBpZiAoaCkgcmV0dXJuIGg7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSkoKTtcblxuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgSUQgPSAncXQ1MC1zZXR0aW5ncyc7XG4gICAgY29uc3QgbGlzdGVkID0gaHViLmxpc3Q/LigpPy5pbmNsdWRlcyhJRCk7XG4gICAgaWYgKG9uVGFyZ2V0ICYmICFsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdyaWdodCcsIHtcbiAgICAgICAgICAgIGlkOiBJRCxcbiAgICAgICAgICAgIGxhYmVsOiAnVmFsaWRhdGlvbiBcdTI2OTlcdUZFMEUnLFxuICAgICAgICAgICAgdGl0bGU6ICdPcGVuIFF1b3RlIFZhbGlkYXRpb24gc2V0dGluZ3MnLFxuICAgICAgICAgICAgd2VpZ2h0OiAzMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6IHNob3dQYW5lbFxuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvblRhcmdldCAmJiBsaXN0ZWQpIHtcbiAgICAgICAgaHViLnJlbW92ZT8uKElEKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNob3dQYW5lbCgpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgb3ZlcmxheS5pZCA9ICdsdC1xdHYtb3ZlcmxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBpbnNldDogMCwgYmFja2dyb3VuZDogJ3JnYmEoMCwwLDAsLjM1KScsIHpJbmRleDogMTAwMDAyXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvc2Ugb24gRVNDICh3b3JrcyB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSBvdmVybGF5KVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuICAgIG92ZXJsYXkudGFiSW5kZXggPSAtMTsgLy8gbWFrZSBvdmVybGF5IGZvY3VzYWJsZVxuXG4gICAgLy8gQ2xpY2stb3V0c2lkZS10by1jbG9zZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG4gICAgLy8gUHJldmVudCBpbm5lciBjbGlja3MgZnJvbSBidWJibGluZyB0byBvdmVybGF5IChleHRyYSBzYWZldHkpXG4gICAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cbiAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+UXVvdGUgVmFsaWRhdGlvbiBTZXR0aW5nczwvaDM+XG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4OyBvcGFjaXR5Oi43NTsgbWFyZ2luLWJvdHRvbToxMHB4O1wiPkFwcGxpZXMgb24gdGhlIFF1b3RlIFdpemFyZCBcdTIxOTIgUGFydCBTdW1tYXJ5IHBhZ2UuPC9kaXY+XG5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWVuYWJsZWRcIj4gRW5hYmxlIHZhbGlkYXRpb25zXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46OHB4IDAgMTJweDtcIj48L2Rpdj5cblxuICAgIDxsYWJlbCB0aXRsZT1cIklmIFBhcnQgU3RhdHVzIGlzIFF1b3RlLCB0aGUgTHluLVRyb24gUGFydCBObyBpcyBjb250cm9sbGVkIGF1dG9tYXRpY2FsbHkuXCJcbiAgICAgICAgICAgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVwiPlxuICAgICAgQXV0by1tYW5hZ2UgTHluLVRyb24gUGFydCBObyB3aGVuIFBhcnQgc3RhdHVzIGlzIFx1MjAxQ1F1b3RlXHUyMDFELlxuICAgIDwvbGFiZWw+XG5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6MTBweDsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1pbiBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1taW5cIiBwbGFjZWhvbGRlcj1cIihub25lKVwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIxMC4wMFwiXG4gICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+U2F2ZSAmYW1wOyBDbG9zZTwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICBgO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBjb250cm9sIHN0YXRlc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5lbmFibGVkKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1pbicpLCBnZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UpKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4JyksIGdldFZhbChLRVlTLm1heFVuaXRQcmljZSkpO1xuXG4gICAgLy8gQ2hhbmdlIGhhbmRsZXJzXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1lbmFibGVkJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuZW5hYmxlZCwgISFlLnRhcmdldC5jaGVja2VkKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSwgISFlLnRhcmdldC5jaGVja2VkKSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1pbicpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgdiA9IHBhcnNlTnVtYmVyT3JOdWxsKGUudGFyZ2V0LnZhbHVlKTsgc2V0VmFsKEtFWVMubWluVW5pdFByaWNlLCB2KTsgc2V0TnVtYmVyT3JCbGFuayhlLnRhcmdldCwgdik7XG4gICAgfSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1tYXgnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1heFVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuXG4gICAgLy8gQnV0dG9uc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBzYXZlZC4nLCAnc3VjY2VzcycsIDE2MDApO1xuICAgIH0pO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSdWxlOiBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXG4vLyBXaGVuIFBhcnRTdGF0dXMgPT09IFwiUXVvdGVcIiwgUE9TVCB0byBEUyAxMzUwOSB1c2luZyB0aGUgUVQzNSBwYXR0ZXJuOlxuLy8gICBRdW90ZV9LZXkgPSB2bVF1b3RlS2V5XG4vLyAgIFBhcnRfS2V5ICA9IHZtUGFydEtleVxuLy8gICBQYXJ0X05vICAgPSBRdW90ZV9ObyB8fCBcIl9cIiB8fCB2bVBhcnRObyAgIChRdW90ZV9ObyByZXNvbHZlZCB2aWEgbHQuY29yZSBRVEY7IHNlc3Npb24gZmFsbGJhY2spXG4vLyAgIE5vdGUgICAgICA9IFwiYXV0byBtYW5hZ2VkXCJcbi8vIFVzZXMgZ2V0UGxleEZhY2FkZSgpICsgbHQuY29yZS5hdXRoLndpdGhGcmVzaEF1dGggKyBwbGV4LmRzUm93cyguLi4pLlxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBhc3luYyBmdW5jdGlvbiBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XG4gICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgaWYgKCFzZXR0aW5ncz8uYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSkgcmV0dXJuIGlzc3VlcztcblxuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuICAgIGNvbnN0IGx0ID0gKFJPT1QubHQgfHwge30pO1xuICAgIGNvbnN0IHdpdGhGcmVzaEF1dGggPSAoZm4pID0+IHtcbiAgICAgICAgY29uc3QgaW1wbCA9IGx0Py5jb3JlPy5hdXRoPy53aXRoRnJlc2hBdXRoO1xuICAgICAgICByZXR1cm4gKHR5cGVvZiBpbXBsID09PSAnZnVuY3Rpb24nKSA/IGltcGwoZm4pIDogZm4oKTtcbiAgICB9O1xuXG4gICAgLy8gUVRGIChmbGF0IHJlcG8pIGxpa2UgUVQzNVxuICAgIGNvbnN0IFFURiA9IGx0LmNvcmU/LmRhdGE/Lm1ha2VGbGF0U2NvcGVkUmVwb1xuICAgICAgICA/IGx0LmNvcmUuZGF0YS5tYWtlRmxhdFNjb3BlZFJlcG8oeyBuczogJ1FUJywgZW50aXR5OiAncXVvdGUnLCBsZWdhY3lFbnRpdHk6ICdRdW90ZUhlYWRlcicgfSlcbiAgICAgICAgOiBudWxsO1xuXG4gICAgY29uc3QgRFNfUVVPVEVfSEVBREVSX0dFVCA9IDMxNTY7ICAgLy8gaHlkcmF0ZSBRdW90ZV9ObyBpZiBtaXNzaW5nXG4gICAgY29uc3QgRFNfTUFOQUdFX1BBUlROTyA9IDEzNTA5OyAgLy8geW91ciB0YXJnZXQgRFMgdG8gcG9zdCBQYXJ0X05vXG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRQbGV4KCkge1xuICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBST09ULmdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICA/IGF3YWl0IFJPT1QuZ2V0UGxleEZhY2FkZSgpXG4gICAgICAgICAgICA6IChsdD8uY29yZT8ucGxleCk7XG4gICAgICAgIGlmICghcGxleCkgdGhyb3cgbmV3IEVycm9yKCdQbGV4IGZhY2FkZSBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgIHJldHVybiBwbGV4O1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRvIHNlc3Npb24gc3RvcmFnZSBpZiBRVEYvcGxleCBoeWRyYXRpb24gbm90IHJlYWR5XG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCkge1xuICAgICAgICB0cnkgeyByZXR1cm4gKHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ1F1b3RlX05vJykgfHwgJycpLnRyaW0oKTsgfSBjYXRjaCB7IHJldHVybiAnJzsgfVxuICAgIH1cblxuICAgIC8vIFJlc29sdmUgUXVvdGVfTm8gZm9yIGEgZ2l2ZW4gUXVvdGVLZXkgdXNpbmcgUVRGOyBoeWRyYXRlIG9uY2UgZnJvbSBEUyBpZiBuZWVkZWQuXG4gICAgYXN5bmMgZnVuY3Rpb24gZ2V0UXVvdGVOb0ZvclF1b3RlS2V5KHFrKSB7XG4gICAgICAgIGNvbnN0IHFLZXkgPSBOdW1iZXIocWspO1xuICAgICAgICBpZiAoIXFLZXkgfHwgIU51bWJlci5pc0Zpbml0ZShxS2V5KSB8fCBxS2V5IDw9IDApIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFRVEYpIHJldHVybiBnZXRRdW90ZU5vRnJvbVNlc3Npb24oKTtcblxuICAgICAgICAgICAgY29uc3QgeyByZXBvIH0gPSBRVEYudXNlKHFLZXkpO1xuICAgICAgICAgICAgYXdhaXQgcmVwby5lbnN1cmVGcm9tTGVnYWN5SWZNaXNzaW5nPy4oKTtcblxuICAgICAgICAgICAgbGV0IGhlYWQgPSBhd2FpdCByZXBvLmdldEhlYWRlcj8uKCk7XG4gICAgICAgICAgICBpZiAoIWhlYWQ/LlF1b3RlX05vKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGxleCA9IGF3YWl0IGdldFBsZXgoKTtcbiAgICAgICAgICAgICAgICBpZiAocGxleD8uZHNSb3dzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+IHBsZXguZHNSb3dzKERTX1FVT1RFX0hFQURFUl9HRVQsIHsgUXVvdGVfS2V5OiBTdHJpbmcocUtleSkgfSkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaXJzdCA9IEFycmF5LmlzQXJyYXkocm93cykgJiYgcm93cy5sZW5ndGggPyByb3dzWzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcXVvdGVObyA9IGZpcnN0Py5RdW90ZV9ObyA/PyBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAocXVvdGVObyAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCByZXBvLnBhdGNoSGVhZGVyPy4oeyBRdW90ZV9LZXk6IHFLZXksIFF1b3RlX05vOiBxdW90ZU5vLCBRdW90ZV9IZWFkZXJfRmV0Y2hlZF9BdDogRGF0ZS5ub3coKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlYWQgPSBhd2FpdCByZXBvLmdldEhlYWRlcj8uKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBxbiA9IGhlYWQ/LlF1b3RlX05vO1xuICAgICAgICAgICAgcmV0dXJuIChxbiA9PSBudWxsID8gZ2V0UXVvdGVOb0Zyb21TZXNzaW9uKCkgOiBTdHJpbmcocW4pLnRyaW0oKSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIGdldFF1b3RlTm9Gcm9tU2Vzc2lvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSXRlcmF0ZSBRdW90ZVBhcnQgZ3JvdXBzLCByZXNvbHZlIFF1b3RlX05vIG9uY2UgcGVyIGdyb3VwLCB0aGVuIHBvc3QgcGVyLXJvdyB3aGVuIHN0YXR1cyA9PT0gJ1F1b3RlJ1xuICAgIGZvciAoY29uc3QgW3FwaywgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgYW55ID0gQXJyYXkuaXNBcnJheShncm91cCkgJiYgZ3JvdXAubGVuZ3RoID8gZ3JvdXBbMF0gOiBudWxsO1xuICAgICAgICBjb25zdCBncm91cFF1b3RlS2V5ID0gdXRpbHMuZ2V0KGFueSwgJ1F1b3RlS2V5JywgeyBudW1iZXI6IHRydWUgfSk7XG5cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWF3YWl0LWluLWxvb3BcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRRdW90ZU5vID0gYXdhaXQgZ2V0UXVvdGVOb0ZvclF1b3RlS2V5KGdyb3VwUXVvdGVLZXkpO1xuXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCB1bmlxdWUgUGFydEtleSBleGFjdGx5IG9uY2VcbiAgICAgICAgY29uc3QgdW5pcUJ5UGFydEtleSA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCByb3cgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHBrID0gdXRpbHMuZ2V0KHJvdywgJ1BhcnRLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUocGspICYmICF1bmlxQnlQYXJ0S2V5LmhhcyhwaykpIHtcbiAgICAgICAgICAgICAgICB1bmlxQnlQYXJ0S2V5LnNldChwaywgcm93KTsgLy8gZmlyc3Qgcm93IHdpbnNcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgciBvZiB1bmlxQnlQYXJ0S2V5LnZhbHVlcygpKSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXMgPSBTdHJpbmcodXRpbHMuZ2V0KHIsICdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pIHx8ICcnKTtcbiAgICAgICAgICAgIGlmIChzdGF0dXMudG9Mb3dlckNhc2UoKSAhPT0gJ3F1b3RlJykgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHZtUXVvdGVLZXkgPSBncm91cFF1b3RlS2V5ID8/IHV0aWxzLmdldChyLCAnUXVvdGVLZXknLCB7IG51bWJlcjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHZtUGFydEtleSA9IHV0aWxzLmdldChyLCAnUGFydEtleScsIHsgbnVtYmVyOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3Qgdm1QYXJ0Tm8gPSBTdHJpbmcodXRpbHMuZ2V0KHIsICdQYXJ0Tm8nLCB7IHRyaW06IHRydWUgfSkgPz8gJycpO1xuXG4gICAgICAgICAgICAvLyBJZGVtcG90ZW5jeSBndWFyZDpcbiAgICAgICAgICAgIC8vICAgSWYgd2UgaGF2ZSBRdW90ZV9ObywgZGVzaXJlZCBwcmVmaXggaXMgXCI8UXVvdGVfTm8+X1wiXG4gICAgICAgICAgICAvLyAgIElmIG5vdCwgZGVzaXJlZCBwcmVmaXggaXMgXCJfXCIgKHBlciBvcmlnaW5hbCBzcGVjKS5cbiAgICAgICAgICAgIGNvbnN0IGhhc1F1b3RlTm8gPSAhIXJlc29sdmVkUXVvdGVObztcbiAgICAgICAgICAgIGNvbnN0IGRlc2lyZWRQcmVmaXggPSBoYXNRdW90ZU5vID8gYCR7cmVzb2x2ZWRRdW90ZU5vfV9gIDogYF9gO1xuICAgICAgICAgICAgY29uc3QgYWxyZWFkeU1hbmFnZWQgPSB2bVBhcnROby5zdGFydHNXaXRoKGRlc2lyZWRQcmVmaXgpO1xuXG4gICAgICAgICAgICAvLyBJZiBhbHJlYWR5IG5vcm1hbGl6ZWQsIHNraXAgRFMgY2FsbCBhbmQgbm90ZSBpdCAoc28gdXNlcnMga25vdyBpdCB3YXMgY2hlY2tlZCkuXG4gICAgICAgICAgICBpZiAoYWxyZWFkeU1hbmFnZWQpIHtcbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ2luZm8nLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwayxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYE5vIGNoYW5nZTogUGFydF9ObyBhbHJlYWR5IG1hbmFnZWQuYCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyBzdGF0dXM6ICdRdW90ZScsIHF1b3RlS2V5OiB2bVF1b3RlS2V5LCBwYXJ0S2V5OiB2bVBhcnRLZXksIHBhcnRObzogdm1QYXJ0Tm8sIGRzOiBEU19NQU5BR0VfUEFSVE5PLCBjaGFuZ2VkOiBmYWxzZSB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEJ1aWxkIHRoZSBkZXNpcmVkIFBhcnRfTm8ganVzdCBvbmNlIChhdm9pZCBkb3VibGUtcHJlZml4aW5nIG9uIHN1YnNlcXVlbnQgcnVucylcbiAgICAgICAgICAgIGNvbnN0IHBhcnROb0ZvclBvc3QgPSBgJHtkZXNpcmVkUHJlZml4fSR7dm1QYXJ0Tm99YDtcblxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHtcbiAgICAgICAgICAgICAgICBRdW90ZV9LZXk6IFN0cmluZyh2bVF1b3RlS2V5ID8/ICcnKSxcbiAgICAgICAgICAgICAgICBQYXJ0X0tleTogU3RyaW5nKHZtUGFydEtleSA/PyAnJyksXG4gICAgICAgICAgICAgICAgUGFydF9ObzogU3RyaW5nKHBhcnROb0ZvclBvc3QgPz8gJycpLFxuICAgICAgICAgICAgICAgIE5hbWU6ICdhdXRvIG1hbmFnZWQnLFxuICAgICAgICAgICAgICAgIFVwZGF0ZV9QYXJ0OiB0cnVlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBsZXggPSBhd2FpdCBnZXRQbGV4KCk7XG4gICAgICAgICAgICAgICAgaWYgKCFwbGV4Py5kc1Jvd3MpIHRocm93IG5ldyBFcnJvcigncGxleC5kc1Jvd3MgdW5hdmFpbGFibGUnKTtcblxuICAgICAgICAgICAgICAgIC8vIFFUMzUtc3R5bGUgRFMgY2FsbCB3aXRoIGF1dGggd3JhcHBlclxuICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hd2FpdC1pbi1sb29wXG4gICAgICAgICAgICAgICAgYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBwbGV4LmRzUm93cyhEU19NQU5BR0VfUEFSVE5PLCBib2R5KSk7XG5cbiAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxuICAgICAgICAgICAgICAgICAgICBsZXZlbDogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgICAgICAgICBxdW90ZVBhcnRLZXk6IHFwayxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFBhcnRfTm8gXHUyMDFDJHtib2R5LlBhcnRfTm99XHUyMDFEIGF1dG8gbWFuYWdlZC5gLFxuICAgICAgICAgICAgICAgICAgICBtZXRhOiB7IHN0YXR1czogJ1F1b3RlJywgcXVvdGVLZXk6IHZtUXVvdGVLZXksIHBhcnRLZXk6IHZtUGFydEtleSwgcGFydE5vOiB2bVBhcnRObywgZHM6IERTX01BTkFHRV9QQVJUTk8sIGNoYW5nZWQ6IHRydWUgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncGFydC5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICd3YXJuaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcGssXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBEUyAke0RTX01BTkFHRV9QQVJUTk99IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzOiAnUXVvdGUnLCBxdW90ZUtleTogdm1RdW90ZUtleSwgcGFydEtleTogdm1QYXJ0S2V5LCBwYXJ0Tm86IHZtUGFydE5vLCBkczogRFNfTUFOQUdFX1BBUlROTywgY2hhbmdlZDogZmFsc2UgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGlzc3Vlcztcbn1cblxuLy8gTGFiZWwgdGhlIHJ1bGUgZm9yIHRoZSBtb2RhbFxuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5tZXRhID0geyBpZDogJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLCBsYWJlbDogJ0F1dG8tTWFuYWdlIExUIFBhcnQgTm8nIH07XG4iLCAiLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBSdWxlOiBtaW5Vbml0UHJpY2Vcbi8vIFB1cnBvc2U6IEVycm9yIHdoZW4gdGhlIGVmZmVjdGl2ZSB1bml0IHByaWNlIGlzIGJlbG93IHRoZSBjb25maWd1cmVkIG1pbmltdW0uXG4vLyBSZWFkcyBmcm9tIHNldHRpbmdzLm1pblVuaXRQcmljZSAobnVsbGFibGUpLlxuLy8gUHJlY2VkZW5jZSBmb3IgdW5pdCBwcmljZSBmaWVsZHM6XG4vLyAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZSA+IFJ2VW5pdFByaWNlQ29weSA+IFVuaXRQcmljZVxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtaW5Vbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICBjb25zdCBtaW4gPSBOdW1iZXIoc2V0dGluZ3MubWluVW5pdFByaWNlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtaW4pKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA8IG1pbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdCA9IChuKSA9PiAoTnVtYmVyLmlzRmluaXRlKG4pXG4gICAgICAgICAgICAgICAgICAgID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KVxuICAgICAgICAgICAgICAgICAgICA6IFN0cmluZyhuKSk7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWluVW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9IDwgTWluICR7Zm10KG1pbil9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWluIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1pblVuaXRQcmljZS5tZXRhID0geyBpZDogJ21pblVuaXRQcmljZScsIGxhYmVsOiAnTWluIFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXhVbml0UHJpY2UoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1heCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHJldHVybiBOYU47XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcbiAgICAgICAgcmV0dXJuIE51bWJlcihzLnJlcGxhY2UoL1teXFxkLi1dL2csICcnKSk7XG4gICAgfTtcblxuXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiBncm91cCkge1xuICAgICAgICAgICAgY29uc3QgcXR5ID0gdXRpbHMuZ2V0KHIsICdRdWFudGl0eScpID8/ICc/JztcblxuICAgICAgICAgICAgLy8gcHJlY2VkZW5jZTogY3VzdG9taXplZCA+IGNvcHkgPiBiYXNlXG4gICAgICAgICAgICBjb25zdCByYXcgPVxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cbiAgICAgICAgICAgICAgICB1dGlscy5nZXQociwgJ1J2VW5pdFByaWNlQ29weScpID8/XG4gICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHIsICdVbml0UHJpY2UnKTtcblxuICAgICAgICAgICAgY29uc3QgbnVtID0gdG9OdW0ocmF3KTtcblxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZtdCA9IChuKSA9PiAoTnVtYmVyLmlzRmluaXRlKG4pID8gbi50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogNiB9KSA6IFN0cmluZyhuKSk7XG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBraW5kOiAncHJpY2UubWF4VW5pdFByaWNlJyxcbiAgICAgICAgICAgICAgICAgICAgbGV2ZWw6ICdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBVbml0IFByaWNlICR7Zm10KG51bSl9ID4gTWF4ICR7Zm10KG1heCl9YCxcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4IH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpc3N1ZXM7XG59XG5cbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvaW5kZXguanNcbmltcG9ydCBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlIGZyb20gJy4vYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSc7XG4vL2ltcG9ydCBmb3JiaWRaZXJvUHJpY2UgZnJvbSAnLi9mb3JiaWRaZXJvUHJpY2UnO1xuaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcblxuZXhwb3J0IGRlZmF1bHQgW2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUsIG1heFVuaXRQcmljZSwgbWluVW5pdFByaWNlXTsgIC8vcmVxdWlyZVJlc29sdmVkUGFydCwgZm9yYmlkWmVyb1ByaWNlLCBcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9lbmdpbmUuanNcbmltcG9ydCBydWxlcyBmcm9tICcuL3J1bGVzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpIHtcbiAgICBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1ncmlkJywgeyByZXF1aXJlS286IHRydWUsIHRpbWVvdXRNczogMTIwMDAgfSk7XG5cbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICBjb25zdCBndm0gPSAoZ3JpZCAmJiBLTyAmJiB0eXBlb2YgS08uZGF0YUZvciA9PT0gJ2Z1bmN0aW9uJykgPyBLTy5kYXRhRm9yKGdyaWQpIDogbnVsbDtcbiAgICBpZiAoIWd2bSkgcmV0dXJuIHsgb2s6IHRydWUsIGlzc3VlczogW10gfTsgLy8gbm90aGluZyB0byB2YWxpZGF0ZSB5ZXRcblxuICAgIGNvbnN0IHJvd3MgPSAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIGNvbnN0IGdyb3Vwc0J5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGNvbnN0IHFwID0gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnUXVvdGVQYXJ0S2V5JykgPz8gLTE7XG4gICAgICAgIChncm91cHNCeVF1b3RlUGFydC5nZXQocXApIHx8IGdyb3Vwc0J5UXVvdGVQYXJ0LnNldChxcCwgW10pLmdldChxcCkpLnB1c2gocik7XG4gICAgfVxuXG4gICAgY29uc3QgcHJpbWFyeUJ5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XG4gICAgICAgIGNvbnN0IHAgPSBncm91cC5maW5kKHIgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShyLCAnSXNVbmlxdWVRdW90ZVBhcnQnKSA9PT0gMSkgfHwgZ3JvdXBbMF07XG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydC5zZXQocXAsIHApO1xuICAgIH1cblxuICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgcm93cyxcbiAgICAgICAgZ3JvdXBzQnlRdW90ZVBhcnQsXG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydCxcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXG4gICAgICAgIGxhc3RSZXN1bHQ6IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlPy4oKVxuICAgIH07XG5cbiAgICBjb25zdCB1dGlscyA9IHsgZ2V0OiAob2JqLCBwYXRoLCBvcHRzKSA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKG9iaiwgcGF0aCwgb3B0cykgfTtcblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChydWxlcy5tYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSkpO1xuICAgIGNvbnN0IGlzc3Vlc1JhdyA9IHJlc3VsdHMuZmxhdCgpO1xuICAgIGNvbnN0IG9rID0gaXNzdWVzUmF3LmV2ZXJ5KGkgPT4gaS5sZXZlbCAhPT0gJ2Vycm9yJyk7XG5cbiAgICAvLyBFbnJpY2ggaXNzdWVzIHdpdGggVUktZmFjaW5nIGRhdGEgKGxpbmVOdW1iZXIsIHBhcnRObywgcnVsZUxhYmVsKVxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IE51bWJlcihTdHJpbmcodiA/PyAnJykucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICBjb25zdCBydWxlTGFiZWxGcm9tID0gKGlzcykgPT4ge1xuICAgICAgICAvLyBQcmVmZXJyZWQ6IHJ1bGUgZnVuY3Rpb24gc2V0cyAubWV0YS5sYWJlbCAoZS5nLiwgbWF4VW5pdFByaWNlLm1ldGEubGFiZWwpXG4gICAgICAgIGlmIChpc3M/Lm1ldGE/LmxhYmVsKSByZXR1cm4gaXNzLm1ldGEubGFiZWw7XG4gICAgICAgIGlmIChpc3M/LmtpbmQpIHtcbiAgICAgICAgICAgIGNvbnN0IGsgPSBTdHJpbmcoaXNzLmtpbmQpO1xuICAgICAgICAgICAgLy8gcHJldHRpZnkgXCJwcmljZS5tYXhVbml0UHJpY2VcIiA9PiBcIk1heCBVbml0IFByaWNlXCJcbiAgICAgICAgICAgIGNvbnN0IHRhaWwgPSBrLnNwbGl0KCcuJykucG9wKCk7XG4gICAgICAgICAgICByZXR1cm4gdGFpbFxuICAgICAgICAgICAgICAgID8gdGFpbC5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEgJDInKVxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXi4vLCAoYykgPT4gYy50b1VwcGVyQ2FzZSgpKVxuICAgICAgICAgICAgICAgIDogaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJ1ZhbGlkYXRpb24nO1xuICAgIH07XG5cbiAgICAvLyBCdWlsZCBhIHF1aWNrIG1hcCBvZiByb3cgLT4gaW5mb1xuICAgIGNvbnN0IHJvd0luZm8gPSBuZXcgTWFwKCk7IC8vIHZtIC0+IHsgbGluZU51bWJlciwgcGFydE5vIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5yb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHIgPSBjdHgucm93c1tpXTtcbiAgICAgICAgY29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuICAgICAgICBjb25zdCBwYXJ0Tm8gPSB1dGlscy5nZXQociwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJztcbiAgICAgICAgcm93SW5mby5zZXQociwgeyBsaW5lTnVtYmVyLCBwYXJ0Tm8gfSk7XG4gICAgfVxuXG4gICAgLy8gQWxzbyBtYXAgUVBLIC0+IFwicHJpbWFyeVwiIHJvdyBmb3IgY2hlYXAgbG9va3VwXG4gICAgY29uc3QgcXBrVG9QcmltYXJ5SW5mbyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtxcCwgcHJpbWFyeV0gb2YgY3R4LnByaW1hcnlCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcbiAgICAgICAgY29uc3QgaW5mbyA9IHJvd0luZm8uZ2V0KHByaW1hcnkpIHx8IHsgbGluZU51bWJlcjogbnVsbCwgcGFydE5vOiB1dGlscy5nZXQocHJpbWFyeSwgJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSA/PyAnJyB9O1xuICAgICAgICBxcGtUb1ByaW1hcnlJbmZvLnNldChxcCwgaW5mbyk7XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgYSBTb3J0T3JkZXIgbG9va3VwIGJ5IHZpc3VhbCByb3cgaW5kZXggKGZyb20gdGhlIFZNLCBub3QgdGhlIERPTSlcbiAgICBjb25zdCBzb3J0QnlMaW5lID0gbmV3IE1hcCgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgcm93ID0gY3R4LnJvd3NbaV07XG4gICAgICAgIGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcbiAgICAgICAgY29uc3Qgc29ydE9yZGVyID0gdXRpbHMuZ2V0KHJvdywgJ1NvcnRPcmRlcicsIHsgbnVtYmVyOiB0cnVlIH0pO1xuICAgICAgICBzb3J0QnlMaW5lLnNldChsaW5lTnVtYmVyLCBzb3J0T3JkZXIpO1xuICAgIH1cblxuICAgIGNvbnN0IGlzc3VlcyA9IGlzc3Vlc1Jhdy5tYXAoaXNzID0+IHtcbiAgICAgICAgY29uc3QgcXBrID0gaXNzLnF1b3RlUGFydEtleSA/PyAtMTtcbiAgICAgICAgY29uc3QgaW5mbyA9IHFwa1RvUHJpbWFyeUluZm8uZ2V0KHFwaykgfHwgeyBsaW5lTnVtYmVyOiBudWxsLCBwYXJ0Tm86ICcnIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5pc3MsXG4gICAgICAgICAgICBsaW5lTnVtYmVyOiBpbmZvLmxpbmVOdW1iZXIsXG4gICAgICAgICAgICBwYXJ0Tm86IGluZm8ucGFydE5vLFxuICAgICAgICAgICAgcnVsZUxhYmVsOiBydWxlTGFiZWxGcm9tKGlzcyksXG4gICAgICAgICAgICBzb3J0T3JkZXI6IHNvcnRCeUxpbmUuZ2V0KGluZm8ubGluZU51bWJlciA/PyAtMSlcbiAgICAgICAgfTtcbiAgICB9KTtcblxuXG4gICAgLy8gc3Rhc2ggaWYgeW91IHdhbnQgb3RoZXIgbW9kdWxlcyB0byByZWFkIGl0IGxhdGVyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XG4gICAgVE1VdGlscy5zdGF0ZS5sYXN0VmFsaWRhdGlvbiA9IHsgYXQ6IERhdGUubm93KCksIG9rLCBpc3N1ZXMgfTtcblxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcbn1cblxuIiwgIi8vIFFUViBlbnRyeXBvaW50OiBtb3VudHMgdGhlIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBvbiBQYXJ0IFN1bW1hcnlcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBfX0JVSUxEX0RFVl9fXG4gICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuaWYgKF9fQlVJTERfREVWX18pIHtcbiAgICAvLyBNaW5pbWFsIEtPL2dyaWQgcmVzb2x2ZXJzIGtlcHQgbG9jYWwgdG8gZGVidWcgaGVscGVyc1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBmdW5jdGlvbiBnZXRHcmlkVk0oKSB7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgIHJldHVybiBncmlkID8gKEtPPy5kYXRhRm9yPy4oZ3JpZCkgfHwgbnVsbCkgOiBudWxsO1xuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRHcmlkUm93cygpIHtcbiAgICAgICAgY29uc3QgZ3ZtID0gZ2V0R3JpZFZNKCk7XG4gICAgICAgIHJldHVybiAoZ3ZtPy5kYXRhc291cmNlPy5yYXcpIHx8IChndm0/LmRhdGFzb3VyY2U/LmRhdGEpIHx8IFtdO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwbGFpblJvdyhyKSB7XG4gICAgICAgIGNvbnN0IGd2ID0gKHAsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgcCwgb3B0cyk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBRdW90ZVBhcnRLZXk6IGd2KCdRdW90ZVBhcnRLZXknKSxcbiAgICAgICAgICAgIFBhcnRObzogZ3YoJ1BhcnRObycsIHsgdHJpbTogdHJ1ZSB9KSxcbiAgICAgICAgICAgIFBhcnRTdGF0dXM6IGd2KCdQYXJ0U3RhdHVzJywgeyB0cmltOiB0cnVlIH0pLFxuICAgICAgICAgICAgUXVhbnRpdHk6IGd2KCdRdWFudGl0eScpLFxuICAgICAgICAgICAgVW5pdFByaWNlOiBndignVW5pdFByaWNlJyksXG4gICAgICAgICAgICBSdlVuaXRQcmljZUNvcHk6IGd2KCdSdlVuaXRQcmljZUNvcHknKSxcbiAgICAgICAgICAgIFJ2Q3VzdG9taXplZFVuaXRQcmljZTogZ3YoJ1J2Q3VzdG9taXplZFVuaXRQcmljZScpLFxuICAgICAgICAgICAgSXNVbmlxdWVRdW90ZVBhcnQ6IGd2KCdJc1VuaXF1ZVF1b3RlUGFydCcpXG4gICAgICAgIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvQ1NWKG9ianMpIHtcbiAgICAgICAgaWYgKCFvYmpzPy5sZW5ndGgpIHJldHVybiAnJztcbiAgICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKG9ianNbMF0pO1xuICAgICAgICBjb25zdCBlc2MgPSAodikgPT4gKHYgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHYpLmluY2x1ZGVzKCcsJykgfHwgU3RyaW5nKHYpLmluY2x1ZGVzKCdcIicpIHx8IFN0cmluZyh2KS5pbmNsdWRlcygnXFxuJylcbiAgICAgICAgICAgID8gYFwiJHtTdHJpbmcodikucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cImBcbiAgICAgICAgICAgIDogU3RyaW5nKHYpKTtcbiAgICAgICAgY29uc3QgaGVhZCA9IGNvbHMuam9pbignLCcpO1xuICAgICAgICBjb25zdCBib2R5ID0gb2Jqcy5tYXAobyA9PiBjb2xzLm1hcChjID0+IGVzYyhvW2NdKSkuam9pbignLCcpKS5qb2luKCdcXG4nKTtcbiAgICAgICAgcmV0dXJuIGhlYWQgKyAnXFxuJyArIGJvZHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGRvd25sb2FkKG5hbWUsIGJsb2IpIHtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gbmFtZTsgYS5jbGljaygpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMjAwMCk7XG4gICAgfVxuXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcbiAgICAgICAgLy8gU2V0dGluZ3MgaGVscGVyc1xuICAgICAgICBzZXR0aW5nczogKCkgPT4gKHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxuICAgICAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogR01fZ2V0VmFsdWUoJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyksXG4gICAgICAgICAgICBtaW5Vbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWluVW5pdFByaWNlJyksXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJylcbiAgICAgICAgfSksXG4gICAgICAgIGdldFZhbHVlOiBrZXkgPT4gR01fZ2V0VmFsdWUoa2V5KSxcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxuXG4gICAgICAgIC8vIEdyaWQgZXhwb3J0ZXJzXG4gICAgICAgIGdyaWQ6ICh7IHBsYWluID0gdHJ1ZSB9ID0ge30pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBnZXRHcmlkUm93cygpO1xuICAgICAgICAgICAgcmV0dXJuIHBsYWluID8gcm93cy5tYXAocGxhaW5Sb3cpIDogcm93cztcbiAgICAgICAgfSxcbiAgICAgICAgZ3JpZFRhYmxlOiAoKSA9PiBjb25zb2xlLnRhYmxlPy4odW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSkpLFxuXG4gICAgICAgIC8vIENTVi9KU09OIGRvd25sb2FkZXJzXG4gICAgICAgIGRvd25sb2FkR3JpZEpTT046IChmaWxlbmFtZSA9ICdxdC1ncmlkLmpzb24nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5zdHJpbmdpZnkodW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSksIG51bGwsIDIpO1xuICAgICAgICAgICAgZG93bmxvYWQoZmlsZW5hbWUsIG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSkpO1xuICAgICAgICB9LFxuICAgICAgICBkb3dubG9hZEdyaWRDU1Y6IChmaWxlbmFtZSA9ICdxdC1ncmlkLmNzdicpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNzdiA9IHRvQ1NWKHVuc2FmZVdpbmRvdy5RVFZfREVCVUcuZ3JpZCh7IHBsYWluOiB0cnVlIH0pKTtcbiAgICAgICAgICAgIGRvd25sb2FkKGZpbGVuYW1lLCBuZXcgQmxvYihbY3N2XSwgeyB0eXBlOiAndGV4dC9jc3YnIH0pKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBWYWxpZGF0aW9uIG9uLWRlbWFuZCAoc2FtZSBlbmdpbmUgYXMgdGhlIGJ1dHRvbilcbiAgICAgICAgdmFsaWRhdGVOb3c6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgcnVuVmFsaWRhdGlvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2VuZ2luZS5qcycpOyAvLyBzYW1lIG1vZHVsZSB1c2VkIGJ5IHRoZSBodWIgYnV0dG9uXG4gICAgICAgICAgICBjb25zdCB7IGdldFNldHRpbmdzIH0gPSBhd2FpdCBpbXBvcnQoJy4vaW5kZXguanMnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgZ2V0U2V0dGluZ3MoKSk7XG4gICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4ocmVzLmlzc3VlcyB8fCBbXSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFF1aWNrIGV4cGVjdGF0aW9uIGhlbHBlcjogXHUyMDFDc2hvdyBtZSByb3dzIGFib3ZlIG1heFx1MjAxRFxuICAgICAgICBleHBlY3RVbmRlck1heDogKG1heCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gTnVtYmVyKG1heCk7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gdW5zYWZlV2luZG93LlFUVl9ERUJVRy5ncmlkKHsgcGxhaW46IHRydWUgfSk7XG4gICAgICAgICAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gU3RyaW5nKHYpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcm93c1xuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoeyAuLi5yLCBfVW5pdE51bTogdG9OdW0oci5SdkN1c3RvbWl6ZWRVbml0UHJpY2UgPz8gci5SdlVuaXRQcmljZUNvcHkgPz8gci5Vbml0UHJpY2UpIH0pKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiBOdW1iZXIuaXNGaW5pdGUoci5fVW5pdE51bSkgJiYgci5fVW5pdE51bSA+IHNldClcbiAgICAgICAgICAgICAgICAubWFwKCh7IF9Vbml0TnVtLCAuLi5yIH0pID0+IHIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHVuZGVyTWluOiAobWluKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBOdW1iZXIobWluKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSB1bnNhZmVXaW5kb3cuUVRWX0RFQlVHLmdyaWQoeyBwbGFpbjogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodikudHJpbSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiByb3dzXG4gICAgICAgICAgICAgICAgLm1hcChyID0+ICh7IC4uLnIsIF9Vbml0TnVtOiB0b051bShyLlJ2Q3VzdG9taXplZFVuaXRQcmljZSA/PyByLlJ2VW5pdFByaWNlQ29weSA/PyByLlVuaXRQcmljZSkgfSkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IE51bWJlci5pc0Zpbml0ZShyLl9Vbml0TnVtKSAmJiByLl9Vbml0TnVtIDwgc2V0KVxuICAgICAgICAgICAgICAgIC5tYXAoKHsgX1VuaXROdW0sIC4uLnIgfSkgPT4gcik7XG4gICAgICAgIH0sXG5cbiAgICB9O1xufVxuXG5cbi8vIEVuc3VyZSB0aGUgc2V0dGluZ3MgVUkgbG9hZHMgKGdlYXIgYnV0dG9uLCBzdG9yYWdlIEFQSSlcbmltcG9ydCAnLi9pbmRleC5qcyc7XG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcbmltcG9ydCB7IG1vdW50VmFsaWRhdGlvbkJ1dHRvbiB9IGZyb20gJy4vaW5qZWN0QnV0dG9uLmpzJztcblxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcblxuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcblxuZnVuY3Rpb24gaXNXaXphcmQoKSB7XG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xuICAgIHJldHVybiBST1VURVMuc29tZShyZSA9PiByZS50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSk7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkge1xuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xuICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xufVxuXG5mdW5jdGlvbiBpc09uVGFyZ2V0V2l6YXJkUGFnZSgpIHtcbiAgICByZXR1cm4gL15wYXJ0XFxzKnN1bW1hcnkkL2kudGVzdChnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xuICAgIGlmICghaXNXaXphcmQoKSkgcmV0dXJuIHVubW91bnQoKTtcbiAgICBpZiAoaXNPblRhcmdldFdpemFyZFBhZ2UoKSkge1xuICAgICAgICBpZiAoIXVubW91bnRCdG4pIHVubW91bnRCdG4gPSBhd2FpdCBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5tb3VudCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5tb3VudCgpIHsgaWYgKHVubW91bnRCdG4pIHsgdW5tb3VudEJ0bigpOyB1bm1vdW50QnRuID0gbnVsbDsgfSB9XG5cbi8vIGluaXRpYWwgKyBTUEEgd2lyaW5nIChtaXJyb3JzIHF0MzAvcXQzNSlcbnJlY29uY2lsZSgpO1xuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihyZWNvbmNpbGUpO1xud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpO1xuY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xuaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb25jaWxlKS5vYnNlcnZlKG5hdiwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG5cbiIsICIvLyBBZGRzIGEgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIGFuZCB3aXJlcyBpdCB0byB0aGUgZW5naW5lLlxuLy8gQXNzdW1lcyB5b3VyIHNldHRpbmdzIFVJIGV4cG9ydHMgZ2V0U2V0dGluZ3Mvb25TZXR0aW5nc0NoYW5nZS5cblxuaW1wb3J0IHsgcnVuVmFsaWRhdGlvbiB9IGZyb20gJy4vZW5naW5lJztcbmltcG9ydCB7IGdldFNldHRpbmdzLCBvblNldHRpbmdzQ2hhbmdlIH0gZnJvbSAnLi9pbmRleCc7XG5cbi8vIC0tLSBLTyBzdXJmYWNlIChxdDMwIHBhdHRlcm4pIC0tLVxuY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgdW5zYWZlV2luZG93LmtvKSA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbztcblxuLy8gLS0tIHN1bW1hcml6ZSBpc3N1ZXMgZm9yIHN0YXR1cyBwaWxsIC8gdG9hc3RzIC0tLVxuZnVuY3Rpb24gYnVpbGRJc3N1ZXNTdW1tYXJ5KGlzc3Vlcykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuaXNBcnJheShpc3N1ZXMpID8gaXNzdWVzIDogW107XG4gICAgICAgIGNvbnN0IGFnZyA9IGl0ZW1zLnJlZHVjZSgoYWNjLCBpdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbHZsID0gU3RyaW5nKGl0Py5sZXZlbCB8fCAnaW5mbycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBhY2NbbHZsXSA9IChhY2NbbHZsXSB8fCAwKSArIDE7XG4gICAgICAgICAgICBpZiAoaXQ/LnF1b3RlUGFydEtleSAhPSBudWxsKSBhY2MucGFydHMuYWRkKGl0LnF1b3RlUGFydEtleSk7XG4gICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCB7IGVycm9yOiAwLCB3YXJuaW5nOiAwLCBpbmZvOiAwLCBwYXJ0czogbmV3IFNldCgpIH0pO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzQ291bnQgPSBhZ2cucGFydHMuc2l6ZTtcbiAgICAgICAgY29uc3Qgc2VncyA9IFtdO1xuICAgICAgICBpZiAoYWdnLmVycm9yKSBzZWdzLnB1c2goYCR7YWdnLmVycm9yfSBlcnJvciR7YWdnLmVycm9yID09PSAxID8gJycgOiAncyd9YCk7XG4gICAgICAgIGlmIChhZ2cud2FybmluZykgc2Vncy5wdXNoKGAke2FnZy53YXJuaW5nfSB3YXJuaW5nJHthZ2cud2FybmluZyA9PT0gMSA/ICcnIDogJ3MnfWApO1xuICAgICAgICBpZiAoYWdnLmluZm8pIHNlZ3MucHVzaChgJHthZ2cuaW5mb30gaW5mb2ApO1xuICAgICAgICBjb25zdCBsZXZlbFBhcnQgPSBzZWdzLmpvaW4oJywgJykgfHwgJ3VwZGF0ZXMnO1xuXG4gICAgICAgIHJldHVybiBgJHtsZXZlbFBhcnR9IGFjcm9zcyAke3BhcnRzQ291bnQgfHwgMH0gcGFydCR7cGFydHNDb3VudCA9PT0gMSA/ICcnIDogJ3MnfWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG59XG5cbi8vIC0tLSBRVDMwLXN0eWxlIGdyaWQgcmVmcmVzaCAoY29waWVkKSAtLS1cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hRdW90ZUdyaWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ3JpZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgICAgICBjb25zdCBncmlkVk0gPSBncmlkRWwgJiYgS08/LmRhdGFGb3I/LihncmlkRWwpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5kYXRhc291cmNlPy5yZWFkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBhd2FpdCBncmlkVk0uZGF0YXNvdXJjZS5yZWFkKCk7ICAgLy8gYXN5bmMgcmUtcXVlcnkvcmViaW5kXG4gICAgICAgICAgICByZXR1cm4gJ2RzLnJlYWQnO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgZ3JpZFZNPy5yZWZyZXNoID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBncmlkVk0ucmVmcmVzaCgpOyAgICAgICAgICAgICAgICAgIC8vIHN5bmMgdmlzdWFsIHJlZnJlc2hcbiAgICAgICAgICAgIHJldHVybiAndm0ucmVmcmVzaCc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cbiAgICAvLyBGYWxsYmFjazogd2l6YXJkIG5hdmlnYXRlIHRvIHRoZSBhY3RpdmUgcGFnZSAocmViaW5kKVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpeiA9IHVuc2FmZVdpbmRvdz8ucGxleD8uY3VycmVudFBhZ2U/LlF1b3RlV2l6YXJkO1xuICAgICAgICBpZiAod2l6Py5uYXZpZ2F0ZVBhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZSA9ICh0eXBlb2Ygd2l6LmFjdGl2ZVBhZ2UgPT09ICdmdW5jdGlvbicpID8gd2l6LmFjdGl2ZVBhZ2UoKSA6IHdpei5hY3RpdmVQYWdlO1xuICAgICAgICAgICAgd2l6Lm5hdmlnYXRlUGFnZShhY3RpdmUpO1xuICAgICAgICAgICAgcmV0dXJuICd3aXoubmF2aWdhdGVQYWdlJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblxuICAgIHJldHVybiBudWxsO1xufVxuXG5cblxuY29uc3QgSFVCX0JUTl9JRCA9ICdxdDUwLXZhbGlkYXRlJztcblxuYXN5bmMgZnVuY3Rpb24gZ2V0SHViKG9wdHMgPSB7IG1vdW50OiAnbmF2JyB9KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGVuc3VyZSA9ICh3aW5kb3cuZW5zdXJlTFRIdWIgfHwgdW5zYWZlV2luZG93Py5lbnN1cmVMVEh1Yik7XG4gICAgICAgIGlmICh0eXBlb2YgZW5zdXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB0cnkgeyBjb25zdCBodWIgPSBhd2FpdCBlbnN1cmUob3B0cyk7IGlmIChodWIpIHJldHVybiBodWI7IH0gY2F0Y2ggeyB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMgPSBbXSkge1xuICAgIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKTtcblxuICAgIC8vIGVsZW1lbnRzXG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG92ZXJsYXkuaWQgPSAncXR2LW1vZGFsLW92ZXJsYXknO1xuICAgIC8vIElubGluZSBmYWxsYmFjayBzdHlsZXMgdG8gYmVhdCBhbnkgaG9zdGlsZSBzdGFja2luZyBjb250ZXh0XG4gICAgb3ZlcmxheS5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG4gICAgb3ZlcmxheS5zdHlsZS5pbnNldCA9ICcwJztcbiAgICBvdmVybGF5LnN0eWxlLmJhY2tncm91bmQgPSAncmdiYSgwLDAsMCwuMzgpJztcbiAgICBvdmVybGF5LnN0eWxlLnpJbmRleCA9ICcyMTQ3NDgzNjQ3JzsgLy8gaGlnaGVzdCBzYW5lIHpcblxuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9kYWwuaWQgPSAncXR2LW1vZGFsJztcbiAgICBtb2RhbC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgbW9kYWwuc3R5bGUudG9wID0gJzUwJSc7XG4gICAgbW9kYWwuc3R5bGUubGVmdCA9ICc1MCUnO1xuICAgIG1vZGFsLnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwtNTAlKSc7XG4gICAgbW9kYWwuc3R5bGUuYmFja2dyb3VuZCA9ICcjZmZmJztcbiAgICBtb2RhbC5zdHlsZS53aWR0aCA9ICdtaW4oOTYwcHgsIDk0dncpJztcbiAgICBtb2RhbC5zdHlsZS5tYXhIZWlnaHQgPSAnODB2aCc7XG4gICAgbW9kYWwuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcbiAgICBtb2RhbC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnMTJweCc7XG4gICAgbW9kYWwuc3R5bGUuYm94U2hhZG93ID0gJzAgMThweCA0MHB4IHJnYmEoMCwwLDAsLjI4KSc7XG4gICAgbW9kYWwuc3R5bGUuZm9udEZhbWlseSA9ICdzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIFNlZ29lIFVJLCBSb2JvdG8sIHNhbnMtc2VyaWYnO1xuXG4gICAgLy8gYnVpbGQgcm93c1xuICAgIGNvbnN0IHJvd3NIdG1sID0gaXNzdWVzLm1hcChpc3MgPT4ge1xuICAgICAgICBjb25zdCBsdmwgPSAoaXNzLmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBsdmxQaWxsID0gYDxzcGFuIGNsYXNzPVwicXR2LXBpbGxcIiBzdHlsZT1cImJvcmRlci1jb2xvcjoke2x2bCA9PT0gJ2Vycm9yJyA/ICcjZmNhNWE1JyA6ICcjY2JkNWUxJ307IGNvbG9yOiR7bHZsID09PSAnZXJyb3InID8gJyNiOTFjMWMnIDogJyMzMzQxNTUnfVwiPiR7bHZsIHx8ICdpbmZvJ308L3NwYW4+YDtcbiAgICAgICAgY29uc3QgcmVhc29uID0gaXNzLm1lc3NhZ2UgfHwgJyhubyBtZXNzYWdlKSc7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBpc3MucnVsZUxhYmVsIHx8IGlzcy5raW5kIHx8ICdWYWxpZGF0aW9uJztcblxuICAgICAgICByZXR1cm4gYFxuICAgICAgICA8dHIgZGF0YS1xcGs9XCIke2lzcy5xdW90ZVBhcnRLZXkgPz8gJyd9XCIgZGF0YS1ydWxlPVwiJHtTdHJpbmcoaXNzLmtpbmQgfHwgJycpfVwiPlxuICAgICAgICAgIDx0ZD4ke2lzcy5zb3J0T3JkZXIgPz8gJyd9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtpc3MucGFydE5vID8/ICcnfTwvdGQ+XG4gICAgICAgICAgPHRkPiR7cnVsZX08L3RkPlxuICAgICAgICAgIDx0ZD4ke2x2bFBpbGx9PC90ZD5cbiAgICAgICAgICA8dGQ+JHtyZWFzb259PC90ZD5cbiAgICAgICAgPC90cj5gXG4gICAgfSkuam9pbignJyk7XG5cbiAgICBtb2RhbC5pbm5lckhUTUwgPSBgXG4gIDxkaXYgY2xhc3M9XCJxdHYtaGRcIj5cbiAgICA8aDM+VmFsaWRhdGlvbiBEZXRhaWxzPC9oMz5cbiAgICA8ZGl2IGNsYXNzPVwicXR2LWFjdGlvbnNcIj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIiBpZD1cInF0di1leHBvcnQtY3N2XCIgdGl0bGU9XCJFeHBvcnQgdmlzaWJsZSBpc3N1ZXMgdG8gQ1NWXCI+RXhwb3J0IENTVjwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGlkPVwicXR2LWNsb3NlXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiMyNTYzZWI7IGNvbG9yOiNmZmY7IGJvcmRlcjoxcHggc29saWQgIzFkNGVkODtcIj5TYXZlICZhbXA7IENsb3NlPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIDwvZGl2PlxuICA8ZGl2IGNsYXNzPVwicXR2LWJkXCI+XG4gICAgPHRhYmxlIGFyaWEtbGFiZWw9XCJWYWxpZGF0aW9uIElzc3Vlc1wiPlxuICAgICAgPHRoZWFkPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgPHRoPlNvcnQmbmJzcDtPcmRlcjwvdGg+XG4gICAgICAgICAgPHRoPlBhcnQgIzwvdGg+XG4gICAgICAgICAgPHRoPlJ1bGU8L3RoPlxuICAgICAgICAgIDx0aD5MZXZlbDwvdGg+XG4gICAgICAgICAgPHRoPlJlYXNvbjwvdGg+XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RoZWFkPlxuICAgICAgPHRib2R5PiR7cm93c0h0bWwgfHwgYDx0cj48dGQgY29sc3Bhbj1cIjVcIiBzdHlsZT1cIm9wYWNpdHk6Ljc7IHBhZGRpbmc6MTJweDtcIj5ObyBpc3N1ZXMuPC90ZD48L3RyPmB9PC90Ym9keT5cbiAgICA8L3RhYmxlPlxuICA8L2Rpdj5cbmA7XG5cblxuICAgIC8vIGludGVyYWN0aW9uc1xuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKTtcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBvdmVybGF5KSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcblxuICAgIC8vIGNsaWNrIHJvdyB0byBmb2N1cyArIGhpZ2hsaWdodCArIHNjcm9sbFxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJ3Rib2R5Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgY29uc3QgdHIgPSBlLnRhcmdldC5jbG9zZXN0KCd0cicpOyBpZiAoIXRyKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHFwayA9IHRyLmdldEF0dHJpYnV0ZSgnZGF0YS1xcGsnKTtcbiAgICAgICAgaWYgKCFxcGspIHJldHVybjtcbiAgICAgICAgLy8gZW5zdXJlIGhpZ2hsaWdodHMgZXhpc3QsIHRoZW4ganVtcFxuICAgICAgICBlbnN1cmVWYWxpZGF0aW9uU3R5bGVzKCk7XG4gICAgICAgIGNvbnN0IHJvdyA9IGZpbmRHcmlkUm93QnlRdW90ZVBhcnRLZXkocXBrKTtcbiAgICAgICAgaWYgKHJvdykge1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsJykpO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcpO1xuICAgICAgICAgICAgcm93LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICdjZW50ZXInLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIGV4cG9ydCBDU1ZcbiAgICBtb2RhbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWV4cG9ydC1jc3YnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNzdiA9IFtcbiAgICAgICAgICAgIFsnTGluZScsICdTb3J0T3JkZXInLCAnUGFydE5vJywgJ1F1b3RlUGFydEtleScsICdSdWxlJywgJ0xldmVsJywgJ1JlYXNvbiddLmpvaW4oJywnKSxcbiAgICAgICAgICAgIC4uLmlzc3Vlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXNjID0gKHYpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IFN0cmluZyh2ID8/ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIC9bXCIsXFxuXS8udGVzdChzKSA/IGBcIiR7cy5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYCA6IHM7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgICAgICAgICBpLmxpbmVOdW1iZXIgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkuc29ydE9yZGVyID8/ICcnLFxuICAgICAgICAgICAgICAgICAgICBpLnBhcnRObyA/PyAnJyxcbiAgICAgICAgICAgICAgICAgICAgaS5xdW90ZVBhcnRLZXkgPz8gJycsXG4gICAgICAgICAgICAgICAgICAgIGkucnVsZUxhYmVsIHx8IGkua2luZCB8fCAnVmFsaWRhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgIGkubGV2ZWwgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIGkubWVzc2FnZSB8fCAnJ1xuICAgICAgICAgICAgICAgIF0ubWFwKGVzYykuam9pbignLCcpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXS5qb2luKCdcXG4nKTtcblxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2Nzdl0sIHsgdHlwZTogJ3RleHQvY3N2JyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24taXNzdWVzLmNzdic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChtb2RhbCk7XG4gICAgKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChvdmVybGF5KTtcbiAgICB0cnkgeyBvdmVybGF5LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTsgb3ZlcmxheS5mb2N1cygpOyB9IGNhdGNoIHsgfVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIG92ZXJsYXkucmVtb3ZlKCk7IH0pO1xuXG59XG5cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKSB7XG4gICAgY29uc3QgaHViID0gYXdhaXQgZ2V0SHViKHsgbW91bnQ6ICduYXYnIH0pO1xuICAgIGlmICghaHViPy5yZWdpc3RlckJ1dHRvbikgcmV0dXJuICgpID0+IHsgfTtcblxuICAgIC8vIGF2b2lkIGR1cGxpY2F0ZVxuICAgIGlmIChodWIubGlzdD8uKCk/LmluY2x1ZGVzKEhVQl9CVE5fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xuXG4gICAgbGV0IGJ0bkVsID0gbnVsbDtcbiAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICBsYWJlbDogJ1ZhbGlkYXRlIExpbmVzJyxcbiAgICAgICAgdGl0bGU6ICdWYWxpZGF0ZSBxdW90ZSBsaW5lIHJ1bGVzJyxcbiAgICAgICAgd2VpZ2h0OiAxMzAsXG4gICAgICAgIG9uQ2xpY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3M/LigpIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaz8uKCdWYWxpZGF0aW5nXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgb2xkIGhpZ2hsaWdodHMgYW5kIGVuc3VyZSBzdHlsZXMgYXJlIHByZXNlbnQgdXAtZnJvbnRcbiAgICAgICAgICAgICAgICBjbGVhclZhbGlkYXRpb25IaWdobGlnaHRzKCk7XG4gICAgICAgICAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncyk7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gQXJyYXkuaXNBcnJheShyZXM/Lmlzc3VlcykgPyByZXMuaXNzdWVzIDogW107XG4gICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSBpc3N1ZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gQXV0by1oaWdobGlnaHQgYWxsIGVycm9yIHJvd3MgaW1tZWRpYXRlbHkgKGJlZm9yZSBtb2RhbClcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGlzcyBvZiBpc3N1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHFwayA9IGlzcz8ucXVvdGVQYXJ0S2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFxcGspIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyb3cpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZSA9ICdxdHYtcm93LWZhaWwnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xzID0gY2xhc3NGb3JJc3N1ZShpc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5hZGQoYmFzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xzKSByb3cuY2xhc3NMaXN0LmFkZChjbHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5Py4oJ1x1MjcwNSBMaW5lcyB2YWxpZCcsICdzdWNjZXNzJywgeyBtczogMTgwMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oJ1x1MjcwNSBBbGwgY2xlYXInLCAnc3VjY2VzcycsIHsgc3RpY2t5OiBmYWxzZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKDApO1xuICAgICAgICAgICAgICAgICAgICB0YXNrLmRvbmU/LignVmFsaWQnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBUYWxseSBvdXRjb21lcyAoaGFuZGxlcyBtaXNzaW5nIGxldmVsIGdyYWNlZnVsbHkpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxldmVscyA9IGlzc3Vlcy5tYXAoaSA9PiBTdHJpbmcoaT8ubGV2ZWwgfHwgJycpLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNFcnJvciA9IGxldmVscy5zb21lKGwgPT4gbCA9PT0gJ2Vycm9yJyB8fCBsID09PSAnZmFpbCcgfHwgbCA9PT0gJ2NyaXRpY2FsJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHx8IGlzc3Vlcy5zb21lKGkgPT4gL3ByaWNlXFwuKD86bWF4dW5pdHByaWNlfG1pbnVuaXRwcmljZSkvaS50ZXN0KFN0cmluZyhpPy5raW5kIHx8ICcnKSkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNXYXJuID0gIWhhc0Vycm9yICYmIGxldmVscy5zb21lKGwgPT4gbCA9PT0gJ3dhcm4nIHx8IGwgPT09ICd3YXJuaW5nJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3VtbWFyeSA9IGJ1aWxkSXNzdWVzU3VtbWFyeShpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEd1YXJkIHRvIGVuc3VyZSBVSSBwcm9ibGVtcyBuZXZlciBibG9jayB0aGUgbW9kYWxcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoYXNFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKGBcXHUyNzRDICR7Y291bnR9IHZhbGlkYXRpb24gJHtjb3VudCA9PT0gMSA/ICdpc3N1ZScgOiAnaXNzdWVzJ31gLCAnZXJyb3InLCB7IG1zOiA2NTAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcXHUyNzRDICR7Y291bnR9IGlzc3VlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdlcnJvcicsIHsgc3RpY2t5OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldEJhZGdlQ291bnQ/Lihjb3VudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhhc1dhcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnk/LihgXFx1MjZBMFxcdUZFMEYgJHtjb3VudH0gdmFsaWRhdGlvbiAke2NvdW50ID09PSAxID8gJ3dhcm5pbmcnIDogJ3dhcm5pbmdzJ31gLCAnd2FybicsIHsgbXM6IDUwMDAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZS5odWIuc2V0U3RhdHVzPy4oYFxcdTI2QTBcXHVGRTBGICR7Y291bnR9IHdhcm5pbmcke2NvdW50ID09PSAxID8gJycgOiAncyd9IFx1MjAxNCAke3N1bW1hcnl9YCwgJ3dhcm4nLCB7IHN0aWNreTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRCYWRnZUNvdW50Py4oY291bnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJbmZvLW9ubHkgdXBkYXRlcyAoZS5nLiwgYXV0by1tYW5hZ2UgcG9zdHMgd2l0aCBsZXZlbD1pbmZvKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeT8uKGBcdTIxMzlcdUZFMEYgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBhcHBsaWVkYCwgJ2luZm8nLCB7IG1zOiAzNTAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0LmNvcmUuaHViLnNldFN0YXR1cz8uKGBcdTIxMzlcdUZFMEYgJHtjb3VudH0gdXBkYXRlJHtjb3VudCA9PT0gMSA/ICcnIDogJ3MnfSBcdTIwMTQgJHtzdW1tYXJ5fWAsICdpbmZvJywgeyBzdGlja3k6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0QmFkZ2VDb3VudD8uKGNvdW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5ldmVyIGJsb2NrIHRoZSBtb2RhbCAqLyB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHNob3cgdGhlIGRldGFpbHMgd2hlbiBjb3VudCA+IDBcbiAgICAgICAgICAgICAgICAgICAgc2hvd1ZhbGlkYXRpb25Nb2RhbChpc3N1ZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIGF1dG9NYW5hZ2UgYWN0dWFsbHkgY2hhbmdlZCBQYXJ0X05vIChsZXZlbD13YXJuaW5nKSwgcmVmcmVzaCB0aGUgZ3JpZCAocXQzMCBwYXR0ZXJuKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZWVkc1JlZnJlc2ggPSBpc3N1ZXMuc29tZShpID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBTdHJpbmcoaT8ua2luZCB8fCAnJykuaW5jbHVkZXMoJ2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgU3RyaW5nKGk/LmxldmVsIHx8ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnd2FybmluZycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGk/Lm1ldGE/LmNoYW5nZWQgPT09IHRydWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobmVlZHNSZWZyZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBhd2FpdCByZWZyZXNoUXVvdGVHcmlkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQuY29yZT8uaHViPy5ub3RpZnk/LihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZSA/IGBHcmlkIHJlZnJlc2hlZCAoJHttb2RlfSlgIDogJ0dyaWQgcmVmcmVzaCBhdHRlbXB0ZWQgKHJlbG9hZCBtYXkgYmUgbmVlZGVkKScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGUgPyAnc3VjY2VzcycgOiAnaW5mbycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsgbXM6IDI1MDAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdC5jb3JlPy5odWI/Lm5vdGlmeT8uKCdHcmlkIHJlZnJlc2ggZmFpbGVkJywgJ3dhcm4nLCB7IG1zOiAzMDAwIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGFzay5kb25lPy4oJ0NoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBjYWNoZSBsYXN0IHN0YXR1cyBmb3IgU1BBIHJlZHJhd3NcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0gcmVzO1xuXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBsdC5jb3JlLmh1Yi5lcnJvcj8uKGBWYWxpZGF0aW9uIGVycm9yOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgeyBtczogNjAwMCB9KTtcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEdyYWIgYmFjayB0aGUgcmVhbCBET00gYnV0dG9uIHRvIHVwZGF0ZSB0aXRsZSBsYXRlclxuICAgIGJ0bkVsID0gaHViLl9zaGFkb3c/LnF1ZXJ5U2VsZWN0b3I/LihgW2RhdGEtaWQ9XCIke0hVQl9CVE5fSUR9XCJdYCk7XG5cbiAgICBjb25zdCBvZmZTZXR0aW5ncyA9IG9uU2V0dGluZ3NDaGFuZ2U/LigoKSA9PiByZWZyZXNoTGFiZWwoYnRuRWwpKTtcbiAgICByZWZyZXNoTGFiZWwoYnRuRWwpO1xuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgb2ZmU2V0dGluZ3M/LigpO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hMYWJlbChidG4pIHtcbiAgICBpZiAoIWJ0bikgcmV0dXJuO1xuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xuICAgIGNvbnN0IHBhcnRzID0gW107XG4gICAgLy9pZiAocy5yZXF1aXJlUmVzb2x2ZWRQYXJ0KSBwYXJ0cy5wdXNoKCdQYXJ0Jyk7XG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XG4gICAgaWYgKHMubWluVW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NSR7cy5taW5Vbml0UHJpY2V9YCk7XG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XG4gICAgYnRuLnRpdGxlID0gYFJ1bGVzOiAke3BhcnRzLmpvaW4oJywgJykgfHwgJ25vbmUnfWA7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVZhbGlkYXRpb25TdHlsZXMoKSB7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdHYtc3R5bGVzJykpIHJldHVybjtcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gICAgc3R5bGUuaWQgPSAncXR2LXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4ucXR2LXJvdy1mYWlsIHsgb3V0bGluZTogMnB4IHNvbGlkIHJnYmEoMjIwLCAzOCwgMzgsIC44NSkgIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0ycHg7IH1cbi5xdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NCwgMjI2LCAyMjYsIC42NSkgIWltcG9ydGFudDsgfSAgLyogcmVkLWlzaCAqL1xuLnF0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCB7IGJhY2tncm91bmQ6IHJnYmEoMjE5LCAyMzQsIDI1NCwgLjY1KSAhaW1wb3J0YW50OyB9ICAvKiBibHVlLWlzaCAqL1xuXG4vKiBNb2RhbCBzaGVsbCAqL1xuI3F0di1tb2RhbC1vdmVybGF5IHsgcG9zaXRpb246Zml4ZWQ7IGluc2V0OjA7IGJhY2tncm91bmQ6cmdiYSgwLDAsMCwuMzgpOyB6LWluZGV4OjIxNDc0ODM2NDc7IH1cbiNxdHYtbW9kYWwge1xuICBwb3NpdGlvbjphYnNvbHV0ZTsgdG9wOjUwJTsgbGVmdDo1MCU7IHRyYW5zZm9ybTp0cmFuc2xhdGUoLTUwJSwtNTAlKTtcbiAgYmFja2dyb3VuZDojZmZmOyB3aWR0aDptaW4oOTYwcHgsIDk0dncpOyBtYXgtaGVpZ2h0Ojgwdmg7IG92ZXJmbG93OmhpZGRlbjtcbiAgYm9yZGVyLXJhZGl1czoxMnB4OyBib3gtc2hhZG93OjAgMThweCA0MHB4IHJnYmEoMCwwLDAsLjI4KTtcbiAgZm9udC1mYW1pbHk6c3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBTZWdvZSBVSSwgUm9ib3RvLCBzYW5zLXNlcmlmO1xufVxuXG4vKiBIZWFkZXIgKi9cbiNxdHYtbW9kYWwgLnF0di1oZCB7XG4gIGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBnYXA6MTJweDtcbiAgcGFkZGluZzoxNHB4IDE2cHg7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxODBkZWcsICNmYmZiZmIgMCUsICNmN2Y3ZjcgMTAwJSk7XG59XG4jcXR2LW1vZGFsIC5xdHYtaGQgaDMgeyBtYXJnaW46MDsgZm9udC1zaXplOjE2cHg7IGZvbnQtd2VpZ2h0OjYwMDsgY29sb3I6IzBmMTcyYTsgfVxuI3F0di1tb2RhbCAucXR2LWFjdGlvbnMgeyBtYXJnaW4tbGVmdDphdXRvOyBkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IH1cbiNxdHYtbW9kYWwgLnF0di1hY3Rpb25zIC5idG4geyBib3JkZXItcmFkaXVzOjhweDsgbGluZS1oZWlnaHQ6MS4zOyBwYWRkaW5nOjZweCAxMHB4OyB9XG5cbi8qIEJvZHkgKi9cbiNxdHYtbW9kYWwgLnF0di1iZCB7IHBhZGRpbmc6MTBweCAxNHB4IDE0cHg7IG92ZXJmbG93OmF1dG87IG1heC1oZWlnaHQ6Y2FsYyg4MHZoIC0gNTZweCk7IH1cblxuLyogVGFibGUgKi9cbiNxdHYtbW9kYWwgdGFibGUgeyB3aWR0aDoxMDAlOyBib3JkZXItY29sbGFwc2U6c2VwYXJhdGU7IGJvcmRlci1zcGFjaW5nOjA7IGZvbnQtc2l6ZToxM3B4OyB9XG4jcXR2LW1vZGFsIHRoZWFkIHRoIHtcbiAgcG9zaXRpb246IHN0aWNreTsgdG9wOiAwOyB6LWluZGV4OiAxO1xuICBiYWNrZ3JvdW5kOiNmZmY7IGJvcmRlci1ib3R0b206MXB4IHNvbGlkICNlYWVhZWE7IHBhZGRpbmc6OHB4IDEwcHg7IHRleHQtYWxpZ246bGVmdDsgY29sb3I6IzQ3NTU2OTtcbn1cbiNxdHYtbW9kYWwgdGJvZHkgdGQgeyBwYWRkaW5nOjhweCAxMHB4OyBib3JkZXItYm90dG9tOjFweCBzb2xpZCAjZjFmNWY5OyB9XG4jcXR2LW1vZGFsIHRib2R5IHRyOm50aC1jaGlsZChvZGQpIHsgYmFja2dyb3VuZDojZmNmZGZmOyB9XG4jcXR2LW1vZGFsIHRib2R5IHRyOmhvdmVyIHsgYmFja2dyb3VuZDojZjFmNWY5OyBjdXJzb3I6cG9pbnRlcjsgfVxuI3F0di1tb2RhbCB0ZDpudGgtY2hpbGQoMSkgeyB3aWR0aDoxMDBweDsgfSAgICAgICAgICAgLyogU29ydCBPcmRlciAqL1xuI3F0di1tb2RhbCB0ZDpudGgtY2hpbGQoMikgeyB3aWR0aDoyMjBweDsgfSAgICAgICAgICAgLyogUGFydCAjICAgICovXG4jcXR2LW1vZGFsIHRkOmxhc3QtY2hpbGQgeyB3b3JkLWJyZWFrOiBicmVhay13b3JkOyB9ICAvKiBSZWFzb24gICAgKi9cblxuLyogUGlsbHMgKi9cbiNxdHYtbW9kYWwgLnF0di1waWxsIHsgZGlzcGxheTppbmxpbmUtYmxvY2s7IHBhZGRpbmc6MnB4IDhweDsgYm9yZGVyOjFweCBzb2xpZCAjZTJlOGYwOyBib3JkZXItcmFkaXVzOjk5OXB4OyBmb250LXNpemU6MTJweDsgfVxuYDtcblxuXG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbi8vIGluc2VydCBhYm92ZSBlbnN1cmVSb3dLZXlBdHRyaWJ1dGVzKClcbmZ1bmN0aW9uIGdldE9ic1ZhbCh2bSwgcHJvcCkge1xuICAgIHRyeSB7IGNvbnN0IHYgPSB2bT8uW3Byb3BdOyByZXR1cm4gKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nKSA/IHYoKSA6IHY7IH0gY2F0Y2ggeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbi8qKiBUYWcgdmlzaWJsZSBncmlkIHJvd3Mgd2l0aCBkYXRhLXF1b3RlLXBhcnQta2V5IGJ5IHJlYWRpbmcgS08gY29udGV4dCAqL1xuZnVuY3Rpb24gZW5zdXJlUm93S2V5QXR0cmlidXRlcygpIHtcbiAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZCcpO1xuICAgIGlmICghZ3JpZCkgcmV0dXJuIDA7XG4gICAgY29uc3Qgcm93cyA9IGdyaWQucXVlcnlTZWxlY3RvckFsbChcbiAgICAgICAgJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdydcbiAgICApO1xuICAgIGxldCB0YWdnZWQgPSAwO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgIGlmIChyLmhhc0F0dHJpYnV0ZSgnZGF0YS1xdW90ZS1wYXJ0LWtleScpKSB7IHRhZ2dlZCsrOyBjb250aW51ZTsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/LihyKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd1ZNID0gY3R4Py4kZGF0YSA/PyBjdHg/LiRyb290ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBxcGsgPSAodHlwZW9mIFRNVXRpbHM/LmdldE9ic1ZhbHVlID09PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgID8gVE1VdGlscy5nZXRPYnNWYWx1ZShyb3dWTSwgJ1F1b3RlUGFydEtleScpXG4gICAgICAgICAgICAgICAgOiBnZXRPYnNWYWwocm93Vk0sICdRdW90ZVBhcnRLZXknKTtcblxuICAgICAgICAgICAgaWYgKHFwayAhPSBudWxsICYmIHFwayAhPT0gJycgJiYgTnVtYmVyKHFwaykgPiAwKSB7XG4gICAgICAgICAgICAgICAgci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcXVvdGUtcGFydC1rZXknLCBTdHJpbmcocXBrKSk7XG4gICAgICAgICAgICAgICAgdGFnZ2VkKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBwZXItcm93IGZhaWx1cmVzICovIH1cbiAgICB9XG4gICAgcmV0dXJuIHRhZ2dlZDtcbn1cbmZ1bmN0aW9uIGNsZWFyVmFsaWRhdGlvbkhpZ2hsaWdodHMoKSB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF0di1yb3ctZmFpbCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdxdHYtcm93LWZhaWwnKTtcbiAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgncXR2LXJvdy1mYWlsLS1wcmljZS1tYXh1bml0Jyk7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F0di1yb3ctZmFpbC0tcHJpY2UtbWludW5pdCcpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kR3JpZFJvd0J5UXVvdGVQYXJ0S2V5KHFwaykge1xuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgaWYgKCFncmlkKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIEZhc3QgcGF0aDogYXR0cmlidXRlIChwcmVmZXJyZWQpXG4gICAgbGV0IHJvdyA9IGdyaWQucXVlcnlTZWxlY3RvcihgW2RhdGEtcXVvdGUtcGFydC1rZXk9XCIke0NTUy5lc2NhcGUoU3RyaW5nKHFwaykpfVwiXWApO1xuICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG5cbiAgICAvLyBJZiBhdHRyaWJ1dGVzIGFyZSBtaXNzaW5nLCB0cnkgdG8gdGFnIHRoZW0gb25jZSB0aGVuIHJldHJ5XG4gICAgaWYgKGVuc3VyZVJvd0tleUF0dHJpYnV0ZXMoKSA+IDApIHtcbiAgICAgICAgcm93ID0gZ3JpZC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1xdW90ZS1wYXJ0LWtleT1cIiR7Q1NTLmVzY2FwZShTdHJpbmcocXBrKSl9XCJdYCk7XG4gICAgICAgIGlmIChyb3cpIHJldHVybiByb3cuY2xvc2VzdCgndHIsIC5rLWdyaWQtY29udGVudCB0ciwgLnBsZXgtZ3JpZC1yb3cnKSB8fCByb3c7XG4gICAgfVxuXG4gICAgLy8gTGFzdCByZXNvcnQ6IHRleHR1YWwgc2NhbiAobGVzcyByZWxpYWJsZSwgYnV0IHdvcmtzIHRvZGF5KVxuICAgIGNvbnN0IHJvd3MgPSBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoXG4gICAgICAgICd0ciwgLmstZ3JpZC1jb250ZW50IHRyLCAucGxleC1ncmlkLXJvdywgLmstdGFibGUtcm93LCAuay1ncmlkIC5rLWdyaWQtY29udGVudCAuay10YWJsZS1yb3cnXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHIgb2Ygcm93cykge1xuICAgICAgICBjb25zdCB0eHQgPSAoci50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAodHh0LmluY2x1ZGVzKFN0cmluZyhxcGspKSkgcmV0dXJuIHI7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjbGFzc0Zvcklzc3VlKGlzcykge1xuICAgIGNvbnN0IGtpbmQgPSBTdHJpbmcoaXNzPy5raW5kIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5tYXh1bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnO1xuICAgIGlmIChraW5kLmluY2x1ZGVzKCdwcmljZS5taW51bml0cHJpY2UnKSkgcmV0dXJuICdxdHYtcm93LWZhaWwtLXByaWNlLW1pbnVuaXQnO1xuICAgIHJldHVybiAnJztcbn1cblxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuXG5pZiAoREVWKSB7XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRyA9ICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVFZfREVCVUcgfHwge307XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy50YWdTdGF0cyA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcbiAgICAgICAgY29uc3Qgcm93cyA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyLCAuay1ncmlkLWNvbnRlbnQgdHIsIC5wbGV4LWdyaWQtcm93LCAuay10YWJsZS1yb3csIC5rLWdyaWQgLmstZ3JpZC1jb250ZW50IC5rLXRhYmxlLXJvdycpIDogW107XG4gICAgICAgIGNvbnN0IHRhZ2dlZCA9IGdyaWQgPyBncmlkLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXF1b3RlLXBhcnQta2V5XScpIDogW107XG4gICAgICAgIGNvbnNvbGUubG9nKCdbUVRWXSByb3dzOicsIHJvd3MubGVuZ3RoLCAndGFnZ2VkOicsIHRhZ2dlZC5sZW5ndGgpO1xuICAgICAgICByZXR1cm4geyB0b3RhbDogcm93cy5sZW5ndGgsIHRhZ2dlZDogdGFnZ2VkLmxlbmd0aCB9O1xuICAgIH07XG4gICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUVl9ERUJVRy5oaWxpVGVzdCA9IChxcGspID0+IHtcbiAgICAgICAgZW5zdXJlVmFsaWRhdGlvblN0eWxlcygpO1xuICAgICAgICBjb25zdCByID0gZmluZEdyaWRSb3dCeVF1b3RlUGFydEtleShxcGspO1xuICAgICAgICBpZiAocikgeyByLmNsYXNzTGlzdC5hZGQoJ3F0di1yb3ctZmFpbCcsICdxdHYtcm93LWZhaWwtLXByaWNlLW1heHVuaXQnKTsgci5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnY2VudGVyJywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyB9XG4gICAgICAgIHJldHVybiAhIXI7XG4gICAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBd0NBLFdBQVMsYUFBYSxHQUFHO0FBQ3JCLFVBQU0sSUFBSSxZQUFZLENBQUM7QUFDdkIsUUFBSSxNQUFNLE9BQVcsUUFBTztBQUU1QixVQUFNLFlBQVksT0FBTyxPQUFPLFdBQVcsRUFBRSxLQUFLLFFBQU0sR0FBRyxTQUFTLEVBQUUsTUFBTSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkYsVUFBTSxLQUFLLFlBQVksWUFBWSxTQUFTLElBQUk7QUFDaEQsV0FBUSxPQUFPLFNBQWEsS0FBSztBQUFBLEVBQ3JDO0FBU08sV0FBUyxjQUFjO0FBQzFCLFdBQU87QUFBQSxNQUNILFNBQVMsT0FBTyxLQUFLLE9BQU87QUFBQSxN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QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUNqRyxPQUFPLE9BQUssT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsV0FBVyxHQUFHLEVBQzNELElBQUksQ0FBQyxFQUFFLFVBQVUsR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ3RDO0FBQUEsSUFFSjtBQUFBLEVBQ0o7QUFRQSxXQUFTLEtBQUssZ0JBQWdCO0FBRTlCLE1BQU1DLFVBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsTUFBSSxhQUFhO0FBRWpCLFdBQVMsV0FBVztBQUNoQixRQUFJLFNBQVMsV0FBWSxRQUFPLENBQUMsQ0FBQyxRQUFRLFdBQVdBLE9BQU07QUFDM0QsV0FBT0EsUUFBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdkQ7QUFFQSxXQUFTLDBCQUEwQjtBQUMvQixVQUFNLEtBQUssU0FBUyxjQUFjLGdIQUFnSDtBQUNsSixZQUFRLElBQUksZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsR0FBRztBQUFBLEVBQzdEO0FBRUEsV0FBUyx1QkFBdUI7QUFDNUIsV0FBTyxvQkFBb0IsS0FBSyx3QkFBd0IsQ0FBQztBQUFBLEVBQzdEO0FBRUEsaUJBQWUsWUFBWTtBQUN2QixRQUFJLENBQUMsU0FBUyxFQUFHLFFBQU8sUUFBUTtBQUNoQyxRQUFJLHFCQUFxQixHQUFHO0FBQ3hCLFVBQUksQ0FBQyxXQUFZLGNBQWEsTUFBTSxzQkFBc0IsT0FBTztBQUFBLElBQ3JFLE9BQU87QUFDSCxjQUFRO0FBQUEsSUFDWjtBQUFBLEVBQ0o7QUFFQSxXQUFTLFVBQVU7QUFBRSxRQUFJLFlBQVk7QUFBRSxpQkFBVztBQUFHLG1CQUFhO0FBQUEsSUFBTTtBQUFBLEVBQUU7QUFHMUUsWUFBVTtBQUNWLFdBQVMsY0FBYyxTQUFTO0FBQ2hDLFNBQU8saUJBQWlCLGNBQWMsU0FBUztBQUMvQyxNQUFNLE1BQU0sU0FBUyxjQUFjLHdCQUF3QjtBQUMzRCxNQUFJLElBQUssS0FBSSxpQkFBaUIsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLFNBQVMsTUFBTSxZQUFZLE1BQU0sV0FBVyxLQUFLLENBQUM7IiwKICAibmFtZXMiOiBbImdldEh1YiIsICJsdCIsICJUTVV0aWxzIiwgIktPIiwgIktPIiwgIlRNVXRpbHMiLCAiREVWIiwgIkRFViIsICJLTyIsICJydW5WYWxpZGF0aW9uIiwgImdldFNldHRpbmdzIiwgIlJPVVRFUyJdCn0K
