// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.39
// @description  Gear + settings and a Validate Lines button on Quote Wizard Part Summary.
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  // src/quote-tracking/validation/index.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  var CONFIG = {
    wizardTargetPage: "Part Summary",
    settingsKey: "qt50_settings_v1",
    toastMs: 3500
  };
  var KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
  var ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
  var ON_ROUTE = !!TMUtils.matchRoute?.(ROUTES);
  if (DEV && !ON_ROUTE) console.debug("QT50: wrong route, skipping bootstrap");
  var KEYS = {
    enabled: "qtv.enabled",
    autoManageLtPartNoOnQuote: "qtv.autoManageLtPartNoOnQuote",
    minUnitPrice: "qtv.minUnitPrice",
    maxUnitPrice: "qtv.maxUnitPrice",
    blockNextUntilValid: "qtv.blockNextUntilValid",
    highlightFailures: "qtv.highlightFailures"
  };
  var DEF = {
    [KEYS.enabled]: true,
    [KEYS.autoManageLtPartNoOnQuote]: true,
    [KEYS.minUnitPrice]: null,
    [KEYS.maxUnitPrice]: 10,
    [KEYS.blockNextUntilValid]: true,
    [KEYS.highlightFailures]: true
  };
  var getVal = (k) => {
    const v = GM_getValue(k, DEF[k]);
    return v === void 0 ? DEF[k] : v;
  };
  var setVal = (k, v) => {
    GM_setValue(k, v);
    emitChanged();
  };
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
  GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings", showPanel);
  if (ON_ROUTE) {
    ensureGearOnToolbar();
    TMUtils?.onUrlChange?.(ensureGearOnToolbar);
    if (!TMUtils?.onUrlChange) {
      const iid = setInterval(ensureGearOnToolbar, 500);
      setTimeout(() => clearInterval(iid), 6e3);
    }
  }
  function ensureGearOnToolbar() {
    if (!TMUtils.matchRoute?.(ROUTES)) {
      document.querySelectorAll("#lt-qtv-gear-host").forEach((li) => li.style.display = "none");
      return;
    }
    const bars = document.querySelectorAll("#QuoteWizardSharedActionBar");
    if (!bars.length) return;
    bars.forEach((bar) => injectGearIntoActionBar(bar));
  }
  function injectGearIntoActionBar(ul) {
    try {
      if (!ul) return;
      if (ul.querySelector("#lt-qtv-gear-host")) {
        const li2 = ul.querySelector("#lt-qtv-gear-host");
        showOnlyOnPartSummary(li2, CONFIG.wizardTargetPage);
        return;
      }
      const li = document.createElement("li");
      li.id = "lt-qtv-gear-host";
      li.style.display = "none";
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.textContent = "LT Validation Settings";
      a.title = "Open Quote Validation settings";
      a.setAttribute("aria-label", "Quote Validation settings");
      a.setAttribute("role", "button");
      a.style.cursor = "pointer";
      a.addEventListener("click", showPanel);
      li.appendChild(a);
      ul.appendChild(li);
      showOnlyOnPartSummary(li, CONFIG.wizardTargetPage);
    } catch (e) {
      if (DEV) console.warn("QT50: injectGearIntoActionBar error", e);
    }
  }
  function showOnlyOnPartSummary(li, targetName) {
    const getActiveWizardPageName = () => {
      const activePage = document.querySelector('.plex-wizard-page.active, .plex-wizard-page[aria-current="page"]');
      const vm = activePage ? KO?.dataFor?.(activePage) : null;
      let name = vm ? KO?.unwrap?.(vm.name) ?? (typeof vm.name === "function" ? vm.name() : vm.name) : "";
      if (name && typeof name === "string") return name.trim();
      const nav2 = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
      return (nav2?.textContent || "").trim();
    };
    const update = () => {
      const onTarget = getActiveWizardPageName() === targetName;
      li.style.display = onTarget ? "" : "none";
    };
    const nav = document.querySelector(".plex-wizard-page-list");
    if (nav && !li._qtvObserverAttached) {
      li._qtvObserverAttached = true;
      new MutationObserver(update).observe(nav, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    update();
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

  // src/quote-tracking/validation/rules/autoManageLtPartNoOnQuote.js
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

  // src/quote-tracking/validation/rules/maxUnitPrice.js
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
          issues.push({
            kind: "price.maxUnitPrice",
            level: "error",
            quotePartKey: qp,
            message: `QP ${qp} Qty ${qty}: Unit Price ${raw} > Max ${max}`,
            meta: { unitRaw: raw, unitNum: num, max }
          });
        }
      }
    }
    return issues;
  }
  maxUnitPrice.meta = { id: "maxUnitPrice", label: "Max Unit Price" };

  // src/quote-tracking/validation/rules/index.js
  var rules_default = [maxUnitPrice, autoManageLtPartNoOnQuote];

  // src/quote-tracking/validation/engine.js
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

  // src/quote-tracking/validation/injectButton.js
  var CFG = {
    ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
    NEXT_SEL: "#NextWizardPage",
    BUTTON_ID: "lt-validate-lines"
  };
  function mountValidationButton(TMUtils2) {
    if (document.getElementById(CFG.BUTTON_ID)) return () => {
    };
    const nextBtn = document.querySelector(CFG.NEXT_SEL);
    const actionBar = document.querySelector(CFG.ACTION_BAR_SEL);
    const btn = document.createElement("button");
    btn.id = CFG.BUTTON_ID;
    btn.type = "button";
    btn.className = "btn btn-sm btn-secondary";
    btn.textContent = "Validate Lines";
    if (nextBtn && nextBtn.parentNode) {
      nextBtn.parentNode.insertBefore(btn, nextBtn);
    } else if (actionBar) {
      actionBar.appendChild(btn);
    } else {
      Object.assign(btn.style, { position: "fixed", bottom: "80px", left: "20px", zIndex: 1e5 });
      document.body.appendChild(btn);
    }
    const offSettings = onSettingsChange?.(() => refreshLabel(btn));
    refreshLabel(btn);
    btn.addEventListener("click", async () => {
      const settings = getSettings();
      btn.disabled = true;
      const prior = btn.textContent;
      btn.textContent = "Validating\u2026";
      try {
        const { ok, issues } = await runValidation(TMUtils2, settings);
        if (ok) {
          btn.classList.remove("btn-secondary", "btn-danger");
          btn.classList.add("btn-success");
          btn.textContent = "Valid \u2713";
          TMUtils2.toast?.("\u2705 Lines valid", "success", 1800);
        } else {
          btn.classList.remove("btn-secondary", "btn-success");
          btn.classList.add("btn-danger");
          btn.textContent = "Fix Issues";
          TMUtils2.toast?.("\u274C Validation failed:\n" + issues.map((i) => `\u2022 ${i.message}`).join("\n"), "error", 6e3);
          console.table?.(issues);
        }
      } catch (err) {
        btn.classList.remove("btn-secondary");
        btn.classList.add("btn-danger");
        btn.textContent = "Error";
        TMUtils2.toast?.(`Validation error: ${err?.message || err}`, "error", 5e3);
      } finally {
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = prior;
          refreshLabel(btn);
        }, 2500);
      }
    });
    return () => {
      offSettings?.();
      btn.remove();
    };
  }
  function refreshLabel(btn) {
    const s = getSettings();
    const parts = [];
    if (s.maxUnitPrice != null) parts.push(`\u2264${s.maxUnitPrice}`);
    btn.title = `Rules: ${parts.join(", ") || "none"}`;
  }

  // src/quote-tracking/validation/qtv.entry.js
  var DEV2 = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  if (true) {
    unsafeWindow.QTV_DEBUG = {
      settings: () => ({
        enabled: GM_getValue("qtv.enabled"),
        autoManageLtPartNoOnQuote: GM_getValue("qtv.autoManageLtPartNoOnQuote"),
        minUnitPrice: GM_getValue("qtv.minUnitPrice"),
        maxUnitPrice: GM_getValue("qtv.maxUnitPrice"),
        blockNextUntilValid: GM_getValue("qtv.blockNextUntilValid"),
        highlightFailures: GM_getValue("qtv.highlightFailures")
      }),
      getValue: (key) => GM_getValue(key),
      setValue: (key, val) => GM_setValue(key, val)
    };
  }
  TMUtils?.net?.ensureWatcher?.();
  var ROUTES2 = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
  var PAGE_NAME_RE = /part\s*summary/i;
  var unmountBtn = null;
  function isWizard() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES2);
    return ROUTES2.some((re) => re.test(location.pathname));
  }
  function onRouteOrDomChange() {
    if (!isWizard()) return unmount();
    const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
    const name = (nav?.textContent || "").trim();
    if (PAGE_NAME_RE.test(name)) {
      if (!unmountBtn) unmountBtn = mountValidationButton(TMUtils);
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
  onRouteOrDomChange();
  TMUtils?.onUrlChange?.(onRouteOrDomChange);
  TMUtils?.observeInsert?.("#QuoteWizardSharedActionBar", onRouteOrDomChange);
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanMiLCAiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2VuZ2luZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2luamVjdEJ1dHRvbi5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3F0di5lbnRyeS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5kZXguanNcbi8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC8gcm91dGUgZ3VhcmQgLS0tLS0tLS0tLVxuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xuXG5jb25zdCBDT05GSUcgPSB7XG4gICAgd2l6YXJkVGFyZ2V0UGFnZTogJ1BhcnQgU3VtbWFyeScsXG4gICAgc2V0dGluZ3NLZXk6ICdxdDUwX3NldHRpbmdzX3YxJyxcbiAgICB0b2FzdE1zOiAzNTAwXG59O1xuXG5jb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvO1xuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcblxuLy8gSW5zdGVhZCBvZiBgcmV0dXJuYCBhdCB0b3AtbGV2ZWwsIGNvbXB1dGUgYSBmbGFnOlxuY29uc3QgT05fUk9VVEUgPSAhIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUyk7XG5pZiAoREVWICYmICFPTl9ST1VURSkgY29uc29sZS5kZWJ1ZygnUVQ1MDogd3Jvbmcgcm91dGUsIHNraXBwaW5nIGJvb3RzdHJhcCcpO1xuXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUsIEdNX3NldFZhbHVlLCBHTV9yZWdpc3Rlck1lbnVDb21tYW5kLCBUTVV0aWxzLCB1bnNhZmVXaW5kb3cgKi9cbmV4cG9ydCBjb25zdCBLRVlTID0ge1xuICAgIGVuYWJsZWQ6ICdxdHYuZW5hYmxlZCcsXG4gICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogJ3F0di5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyxcbiAgICBtaW5Vbml0UHJpY2U6ICdxdHYubWluVW5pdFByaWNlJyxcbiAgICBtYXhVbml0UHJpY2U6ICdxdHYubWF4VW5pdFByaWNlJyxcbiAgICBibG9ja05leHRVbnRpbFZhbGlkOiAncXR2LmJsb2NrTmV4dFVudGlsVmFsaWQnLFxuICAgIGhpZ2hsaWdodEZhaWx1cmVzOiAncXR2LmhpZ2hsaWdodEZhaWx1cmVzJ1xufTtcbmNvbnN0IERFRiA9IHtcbiAgICBbS0VZUy5lbmFibGVkXTogdHJ1ZSxcbiAgICBbS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXTogdHJ1ZSxcbiAgICBbS0VZUy5taW5Vbml0UHJpY2VdOiBudWxsLFxuICAgIFtLRVlTLm1heFVuaXRQcmljZV06IDEwLFxuICAgIFtLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWRdOiB0cnVlLFxuICAgIFtLRVlTLmhpZ2hsaWdodEZhaWx1cmVzXTogdHJ1ZVxufTtcbmNvbnN0IGdldFZhbCA9IGsgPT4ge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrLCBERUZba10pO1xuICAgIHJldHVybiAodiA9PT0gdW5kZWZpbmVkID8gREVGW2tdIDogdik7XG59O1xuY29uc3Qgc2V0VmFsID0gKGssIHYpID0+IHsgR01fc2V0VmFsdWUoaywgdik7IGVtaXRDaGFuZ2VkKCk7IH07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXR0aW5ncygpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBlbmFibGVkOiBnZXRWYWwoS0VZUy5lbmFibGVkKSxcbiAgICAgICAgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZTogZ2V0VmFsKEtFWVMuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSksXG4gICAgICAgIG1pblVuaXRQcmljZTogZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSxcbiAgICAgICAgbWF4VW5pdFByaWNlOiBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpLFxuICAgICAgICBibG9ja05leHRVbnRpbFZhbGlkOiBnZXRWYWwoS0VZUy5ibG9ja05leHRVbnRpbFZhbGlkKSxcbiAgICAgICAgaGlnaGxpZ2h0RmFpbHVyZXM6IGdldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzKVxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gb25TZXR0aW5nc0NoYW5nZShmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHJldHVybiAoKSA9PiB7IH07XG4gICAgY29uc3QgaCA9ICgpID0+IGZuKGdldFNldHRpbmdzKCkpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG4gICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdMVDpRVFY6U2V0dGluZ3NDaGFuZ2VkJywgaCk7XG59XG5mdW5jdGlvbiBlbWl0Q2hhbmdlZCgpIHtcbiAgICB0cnkgeyB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCB7IGRldGFpbDogZ2V0U2V0dGluZ3MoKSB9KSk7IH0gY2F0Y2ggeyB9XG59XG5cbi8vIC0tLS0tLS0tLS0gVUkgKGdlYXIgKyBwYW5lbCkgLS0tLS0tLS0tLVxuR01fcmVnaXN0ZXJNZW51Q29tbWFuZD8uKCdcdTI2OTlcdUZFMEYgT3BlbiBRVCBWYWxpZGF0aW9uIFNldHRpbmdzJywgc2hvd1BhbmVsKTtcblxuLy8gT25seSBzZXQgdXAgdGhlIGdlYXIvb2JzZXJ2ZXJzIHdoZW4gd2UncmUgYWN0dWFsbHkgb24gdGhlIHdpemFyZCByb3V0ZVxuaWYgKE9OX1JPVVRFKSB7XG4gICAgZW5zdXJlR2Vhck9uVG9vbGJhcigpO1xuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlR2Vhck9uVG9vbGJhcik7XG4gICAgaWYgKCFUTVV0aWxzPy5vblVybENoYW5nZSkge1xuICAgICAgICBjb25zdCBpaWQgPSBzZXRJbnRlcnZhbChlbnN1cmVHZWFyT25Ub29sYmFyLCA1MDApO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGNsZWFySW50ZXJ2YWwoaWlkKSwgNjAwMCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVHZWFyT25Ub29sYmFyKCkge1xuICAgIC8vIE9ubHkgb24gdGhlIFF1b3RlIFdpemFyZCByb3V0ZVxuICAgIGlmICghVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkge1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjbHQtcXR2LWdlYXItaG9zdCcpLmZvckVhY2gobGkgPT4gKGxpLnN0eWxlLmRpc3BsYXkgPSAnbm9uZScpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEluamVjdCBpbnRvIGV2ZXJ5IHZpc2libGUgYWN0aW9uIGJhciAod2l6YXJkIHJlbmRlcnMgb25lIHBlciBwYWdlKVxuICAgIGNvbnN0IGJhcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInKTtcbiAgICBpZiAoIWJhcnMubGVuZ3RoKSByZXR1cm47XG5cbiAgICBiYXJzLmZvckVhY2goYmFyID0+IGluamVjdEdlYXJJbnRvQWN0aW9uQmFyKGJhcikpO1xufVxuXG5mdW5jdGlvbiBpbmplY3RHZWFySW50b0FjdGlvbkJhcih1bCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICghdWwpIHJldHVybjtcbiAgICAgICAgLy8gQXZvaWQgZHVwbGljYXRlIGluamVjdGlvblxuICAgICAgICBpZiAodWwucXVlcnlTZWxlY3RvcignI2x0LXF0di1nZWFyLWhvc3QnKSkge1xuICAgICAgICAgICAgLy8gRW5zdXJlIHZpc2liaWxpdHkgaXMgYWNjdXJhdGUgZm9yIHRoZSBjdXJyZW50IHBhZ2VcbiAgICAgICAgICAgIGNvbnN0IGxpID0gdWwucXVlcnlTZWxlY3RvcignI2x0LXF0di1nZWFyLWhvc3QnKTtcbiAgICAgICAgICAgIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgQ09ORklHLndpemFyZFRhcmdldFBhZ2UpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICBsaS5pZCA9ICdsdC1xdHYtZ2Vhci1ob3N0JztcbiAgICAgICAgbGkuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgLy8gaGlkZGVuIHVubGVzcyBvbiB0aGUgdGFyZ2V0IHdpemFyZCBwYWdlXG5cbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgIGEudGV4dENvbnRlbnQgPSAnTFQgVmFsaWRhdGlvbiBTZXR0aW5ncyc7XG4gICAgICAgIGEudGl0bGUgPSAnT3BlbiBRdW90ZSBWYWxpZGF0aW9uIHNldHRpbmdzJztcbiAgICAgICAgYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnUXVvdGUgVmFsaWRhdGlvbiBzZXR0aW5ncycpO1xuICAgICAgICBhLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcbiAgICAgICAgYS5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICAgIGEuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBzaG93UGFuZWwpO1xuXG4gICAgICAgIGxpLmFwcGVuZENoaWxkKGEpO1xuICAgICAgICB1bC5hcHBlbmRDaGlsZChsaSk7XG5cbiAgICAgICAgLy8gU2hvdy9oaWRlIGJhc2VkIG9uIGFjdGl2ZSB3aXphcmQgcGFnZSBuYW1lXG4gICAgICAgIHNob3dPbmx5T25QYXJ0U3VtbWFyeShsaSwgQ09ORklHLndpemFyZFRhcmdldFBhZ2UpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKERFVikgY29uc29sZS53YXJuKCdRVDUwOiBpbmplY3RHZWFySW50b0FjdGlvbkJhciBlcnJvcicsIGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gc2hvd09ubHlPblBhcnRTdW1tYXJ5KGxpLCB0YXJnZXROYW1lKSB7XG4gICAgY29uc3QgZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUgPSAoKSA9PiB7XG4gICAgICAgIC8vIFByZWZlciBLTyBWTSBuYW1lIG9uIHRoZSBhY3RpdmUgcGFnZVxuICAgICAgICBjb25zdCBhY3RpdmVQYWdlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgIGNvbnN0IHZtID0gYWN0aXZlUGFnZSA/IEtPPy5kYXRhRm9yPy4oYWN0aXZlUGFnZSkgOiBudWxsO1xuICAgICAgICBsZXQgbmFtZSA9IHZtID8gKEtPPy51bndyYXA/Lih2bS5uYW1lKSA/PyAodHlwZW9mIHZtLm5hbWUgPT09ICdmdW5jdGlvbicgPyB2bS5uYW1lKCkgOiB2bS5uYW1lKSkgOiAnJztcbiAgICAgICAgaWYgKG5hbWUgJiYgdHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnKSByZXR1cm4gbmFtZS50cmltKCk7XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRleHQgaW4gdGhlIHdpemFyZCBuYXZcbiAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XG4gICAgICAgIHJldHVybiAobmF2Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgIH07XG5cbiAgICBjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IG9uVGFyZ2V0ID0gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSA9PT0gdGFyZ2V0TmFtZTtcbiAgICAgICAgbGkuc3R5bGUuZGlzcGxheSA9IG9uVGFyZ2V0ID8gJycgOiAnbm9uZSc7XG4gICAgfTtcblxuICAgIC8vIE9ic2VydmUgdGhlIHdpemFyZCBuYXYgZm9yIHBhZ2UgY2hhbmdlc1xuICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICBpZiAobmF2ICYmICFsaS5fcXR2T2JzZXJ2ZXJBdHRhY2hlZCkge1xuICAgICAgICBsaS5fcXR2T2JzZXJ2ZXJBdHRhY2hlZCA9IHRydWU7XG4gICAgICAgIG5ldyBNdXRhdGlvbk9ic2VydmVyKHVwZGF0ZSkub2JzZXJ2ZShuYXYsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIHVwZGF0ZSgpO1xufVxuXG5cblxuZnVuY3Rpb24gc2hvd1BhbmVsKCkge1xuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBvdmVybGF5LmlkID0gJ2x0LXF0di1vdmVybGF5JztcbiAgICBPYmplY3QuYXNzaWduKG92ZXJsYXkuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsIGluc2V0OiAwLCBiYWNrZ3JvdW5kOiAncmdiYSgwLDAsMCwuMzUpJywgekluZGV4OiAxMDAwMDJcbiAgICB9KTtcblxuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgT2JqZWN0LmFzc2lnbihwYW5lbC5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnNTAlJywgbGVmdDogJzUwJScsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLC01MCUpJyxcbiAgICAgICAgYmFja2dyb3VuZDogJyNmZmYnLCBwYWRkaW5nOiAnMThweCcsIGJvcmRlclJhZGl1czogJzEycHgnLFxuICAgICAgICBib3hTaGFkb3c6ICcwIDEwcHggMzBweCByZ2JhKDAsMCwwLC4zMCknLCBmb250RmFtaWx5OiAnc3lzdGVtLXVpLCBTZWdvZSBVSSwgc2Fucy1zZXJpZicsXG4gICAgICAgIHdpZHRoOiAnNDIwcHgnLCBtYXhXaWR0aDogJzkydncnXG4gICAgfSk7XG5cbiAgICAvLyBDbG9zZSBvbiBFU0MgKHdvcmtzIHdoZW4gZm9jdXMgaXMgYW55d2hlcmUgaW5zaWRlIG92ZXJsYXkpXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG4gICAgb3ZlcmxheS50YWJJbmRleCA9IC0xOyAvLyBtYWtlIG92ZXJsYXkgZm9jdXNhYmxlXG5cbiAgICAvLyBDbGljay1vdXRzaWRlLXRvLWNsb3NlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTsgfSk7XG5cbiAgICAvLyBQcmV2ZW50IGlubmVyIGNsaWNrcyBmcm9tIGJ1YmJsaW5nIHRvIG92ZXJsYXkgKGV4dHJhIHNhZmV0eSlcbiAgICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKTtcblxuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtZW5hYmxlZFwiPiBFbmFibGUgdmFsaWRhdGlvbnNcbiAgICA8L2xhYmVsPlxuXG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuXG4gICAgPGxhYmVsIHRpdGxlPVwiSWYgUGFydCBTdGF0dXMgaXMgUXVvdGUsIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGlzIGNvbnRyb2xsZWQgYXV0b21hdGljYWxseS5cIlxuICAgICAgICAgICBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlXCI+XG4gICAgICBBdXRvLW1hbmFnZSBMeW4tVHJvbiBQYXJ0IE5vIHdoZW4gUGFydCBzdGF0dXMgaXMgXHUyMDFDUXVvdGVcdTIwMUQuXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDoxMHB4OyBtYXJnaW46OHB4IDA7XCI+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJmbGV4OjE7XCI+TWluIFVuaXQgUHJpY2VcbiAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIGlkPVwicXR2LW1pblwiIHBsYWNlaG9sZGVyPVwiKG5vbmUpXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgICAgPGxhYmVsIHN0eWxlPVwiZmxleDoxO1wiPk1heCBVbml0IFByaWNlXG4gICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMDFcIiBpZD1cInF0di1tYXhcIiBwbGFjZWhvbGRlcj1cIjEwLjAwXCJcbiAgICAgICAgICAgICAgIHN0eWxlPVwid2lkdGg6MTAwJTsgcGFkZGluZzo2cHg7IGJvcmRlcjoxcHggc29saWQgI2NjYzsgYm9yZGVyLXJhZGl1czo2cHg7XCI+XG4gICAgICA8L2xhYmVsPlxuICAgIDwvZGl2PlxuXG4gICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpibG9jazsgbWFyZ2luOjhweCAwO1wiPlxuICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwicXR2LWJsb2NrTmV4dFwiPiBCbG9jayBOZXh0IHVudGlsIGFsbCB2YWxpZGF0aW9ucyBwYXNzXG4gICAgPC9sYWJlbD5cblxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1oaWdobGlnaHRcIj4gSGlnaGxpZ2h0IGZhaWx1cmVzIG9uIHRoZSBncmlkXG4gICAgPC9sYWJlbD5cblxuICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOjFweCBzb2xpZCAjZWVlOyBtYXJnaW46MTJweCAwIDEwcHg7XCI+PC9kaXY+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjhweDsgZmxleC13cmFwOndyYXA7XCI+XG4gICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuIGJ0bi1kZWZhdWx0XCI+RXhwb3J0PC9idXR0b24+XG4gICAgICA8bGFiZWwgY2xhc3M9XCJidG4gYnRuLWRlZmF1bHRcIj5JbXBvcnQgPGlucHV0IGlkPVwicXR2LWltcG9ydFwiIHR5cGU9XCJmaWxlXCIgYWNjZXB0PVwiYXBwbGljYXRpb24vanNvblwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPjwvbGFiZWw+XG4gICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdFwiIHN0eWxlPVwiYm9yZGVyLWNvbG9yOiNmNTllMGI7IGNvbG9yOiNiNDUzMDk7XCI+UmVzZXQ8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gaWQ9XCJxdHYtY2xvc2VcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIHN0eWxlPVwiYmFja2dyb3VuZDojMjU2M2ViOyBjb2xvcjojZmZmOyBib3JkZXI6MXB4IHNvbGlkICMxZDRlZDg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgYDtcblxuICAgIC8vIEluaXRpYWxpemUgY29udHJvbCBzdGF0ZXNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUpO1xuICAgIHNldE51bWJlck9yQmxhbmsocGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKSwgZ2V0VmFsKEtFWVMubWluVW5pdFByaWNlKSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1heCcpLCBnZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWJsb2NrTmV4dCcpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5ibG9ja05leHRVbnRpbFZhbGlkKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWhpZ2hsaWdodCcpLmNoZWNrZWQgPSBnZXRWYWwoS0VZUy5oaWdobGlnaHRGYWlsdXJlcyk7XG5cbiAgICAvLyBDaGFuZ2UgaGFuZGxlcnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWJsb2NrTmV4dCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtaGlnaGxpZ2h0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuaGlnaGxpZ2h0RmFpbHVyZXMsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1taW4nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4ge1xuICAgICAgICBjb25zdCB2ID0gcGFyc2VOdW1iZXJPck51bGwoZS50YXJnZXQudmFsdWUpOyBzZXRWYWwoS0VZUy5tYXhVbml0UHJpY2UsIHYpOyBzZXROdW1iZXJPckJsYW5rKGUudGFyZ2V0LCB2KTtcbiAgICB9KTtcblxuICAgIC8vIEJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoREVGKS5mb3JFYWNoKGsgPT4gR01fc2V0VmFsdWUoaywgREVGW2tdKSk7XG4gICAgICAgIGVtaXRDaGFuZ2VkKCk7IG92ZXJsYXkucmVtb3ZlKCk7XG4gICAgICAgIFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyByZXNldC4nLCAnaW5mbycsIDE4MDApO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoZ2V0U2V0dGluZ3MoKSwgbnVsbCwgMildLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsOyBhLmRvd25sb2FkID0gJ3F0LXZhbGlkYXRpb24tc2V0dGluZ3MuanNvbic7IGEuY2xpY2soKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCksIDEwMDApO1xuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGV2KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmID0gZXYudGFyZ2V0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZi50ZXh0KCkpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgaWYgKCdhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlLCAhIWRhdGEuYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSk7XG4gICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAoJ21heFVuaXRQcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMubWF4VW5pdFByaWNlLCB0b051bGxPck51bWJlcihkYXRhLm1heFVuaXRQcmljZSkpO1xuICAgICAgICAgICAgICAgIGlmICgnYmxvY2tOZXh0VW50aWxWYWxpZCcgaW4gZGF0YSkgc2V0VmFsKEtFWVMuYmxvY2tOZXh0VW50aWxWYWxpZCwgISFkYXRhLmJsb2NrTmV4dFVudGlsVmFsaWQpO1xuICAgICAgICAgICAgICAgIGlmICgnaGlnaGxpZ2h0RmFpbHVyZXMnIGluIGRhdGEpIHNldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzLCAhIWRhdGEuaGlnaGxpZ2h0RmFpbHVyZXMpO1xuICAgICAgICAgICAgICAgIG92ZXJsYXkucmVtb3ZlKCk7IFRNVXRpbHMudG9hc3Q/LignVmFsaWRhdGlvbiBzZXR0aW5ncyBpbXBvcnRlZC4nLCAnc3VjY2VzcycsIDE4MDApO1xuICAgICAgICAgICAgfSBlbHNlIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OLicpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBvdmVybGF5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gRm9jdXMgQUZURVIgYXBwZW5kaW5nIHNvIEVTQyB3b3JrcyBpbW1lZGlhdGVseVxuICAgIG92ZXJsYXkuZm9jdXMoKTtcbn1cblxuXG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZS5qc1xyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuLy8gUnVsZTogYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZVxyXG4vLyBQdXJwb3NlOiBJZiBQYXJ0IFN0YXR1cyBpcyBcIlF1b3RlXCIsIGF1dG8tbWFuYWdlIChsb2NrL2NvbnRyb2wpXHJcbi8vICAgICAgICAgIHRoZSBMeW4tVHJvbiBQYXJ0IE5vIGZpZWxkIGZvciB0aGF0IHJvdy5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpIHtcclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG5cclxuICAgIC8vIFNraXAgZW50aXJlbHkgaWYgc2V0dGluZyBkaXNhYmxlZFxyXG4gICAgaWYgKCFzZXR0aW5ncy5hdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlKSByZXR1cm4gaXNzdWVzO1xyXG5cclxuICAgIC8vIFBsYWNlaG9sZGVyIGxvZ2ljOiBqdXN0IGR1bXAgY29udGV4dCBmb3Igbm93XHJcbiAgICBmb3IgKGNvbnN0IFtxcCwgZ3JvdXBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgZ3JvdXApIHtcclxuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gdXRpbHMuZ2V0KHIsICdQYXJ0U3RhdHVzJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGx0UGFydE5vID0gdXRpbHMuZ2V0KHIsICdQYXJ0Tm8nKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFRPRE86IGltcGxlbWVudCBhY3R1YWwgXCJhdXRvLW1hbmFnZVwiIGVuZm9yY2VtZW50XHJcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09ICdRdW90ZScpIHtcclxuICAgICAgICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQgd2UgbWlnaHQgbG9jayB0aGUgVUksIG9yIHB1c2ggYW4gaW5mb3JtYXRpb25hbCBpc3N1ZVxyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwYXJ0LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnaW5mbycsXHJcbiAgICAgICAgICAgICAgICAgICAgcXVvdGVQYXJ0S2V5OiBxcCxcclxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUVAgJHtxcH06IGF1dG8tbWFuYWdlIEx5bi1Ucm9uIFBhcnQgTm8gPSAke2x0UGFydE5vfSAoc3RhdHVzPVF1b3RlKS5gLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGE6IHsgc3RhdHVzLCBsdFBhcnRObyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaXNzdWVzO1xyXG59XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9tYXhVbml0UHJpY2UuanNcclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWF4VW5pdFByaWNlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSB7XHJcbiAgICAvLyBHdWFyZCBpZiBub3QgY29uZmlndXJlZFxyXG4gICAgY29uc3QgbWF4ID0gTnVtYmVyKHNldHRpbmdzLm1heFVuaXRQcmljZSk7XHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShtYXgpKSByZXR1cm4gW107XHJcblxyXG4gICAgY29uc3QgaXNzdWVzID0gW107XHJcblxyXG4gICAgLy8gU2ltcGxlIGN1cnJlbmN5L251bWJlciBzYW5pdGl6ZXJcclxuICAgIGNvbnN0IHRvTnVtID0gKHYpID0+IHtcclxuICAgICAgICBpZiAodiA9PSBudWxsKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFzKSByZXR1cm4gTmFOO1xyXG4gICAgICAgIHJldHVybiBOdW1iZXIocy5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpO1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBjdHguZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XHJcblxyXG4gICAgICAgICAgICAvLyBwcmVjZWRlbmNlOiBjdXN0b21pemVkID4gY29weSA+IGJhc2VcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwcmljZS5tYXhVbml0UHJpY2UnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFFQICR7cXB9IFF0eSAke3F0eX06IFVuaXQgUHJpY2UgJHtyYXd9ID4gTWF4ICR7bWF4fWAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4IH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9pbmRleC5qc1xyXG5pbXBvcnQgYXV0b01hbmFnZUx0UGFydE5vT25RdW90ZSBmcm9tICcuL2F1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnO1xyXG4vL2ltcG9ydCBmb3JiaWRaZXJvUHJpY2UgZnJvbSAnLi9mb3JiaWRaZXJvUHJpY2UnO1xyXG4vL2ltcG9ydCBtaW5Vbml0UHJpY2UgZnJvbSAnLi9taW5Vbml0UHJpY2UnO1xyXG5pbXBvcnQgbWF4VW5pdFByaWNlIGZyb20gJy4vbWF4VW5pdFByaWNlJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IFttYXhVbml0UHJpY2UsIGF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGVdOyAgLy9yZXF1aXJlUmVzb2x2ZWRQYXJ0LCBmb3JiaWRaZXJvUHJpY2UsIG1pblVuaXRQcmljZSxcclxuIiwgIi8vIHNyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL2VuZ2luZS5qc1xyXG5pbXBvcnQgcnVsZXMgZnJvbSAnLi9ydWxlcyc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVmFsaWRhdGlvbihUTVV0aWxzLCBzZXR0aW5ncykge1xyXG4gICAgYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHsgcmVxdWlyZUtvOiB0cnVlLCB0aW1lb3V0TXM6IDEyMDAwIH0pO1xyXG5cclxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcclxuICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XHJcbiAgICBjb25zdCBndm0gPSBncmlkID8gS08/LmRhdGFGb3I/LihncmlkKSA6IG51bGw7XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IChndm0/LmRhdGFzb3VyY2U/LnJhdykgfHwgKGd2bT8uZGF0YXNvdXJjZT8uZGF0YSkgfHwgW107XHJcbiAgICBjb25zdCBncm91cHNCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XHJcbiAgICAgICAgY29uc3QgcXAgPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdRdW90ZVBhcnRLZXknKSA/PyAtMTtcclxuICAgICAgICAoZ3JvdXBzQnlRdW90ZVBhcnQuZ2V0KHFwKSB8fCBncm91cHNCeVF1b3RlUGFydC5zZXQocXAsIFtdKS5nZXQocXApKS5wdXNoKHIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHByaW1hcnlCeVF1b3RlUGFydCA9IG5ldyBNYXAoKTtcclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgZ3JvdXBzQnlRdW90ZVBhcnQuZW50cmllcygpKSB7XHJcbiAgICAgICAgY29uc3QgcCA9IGdyb3VwLmZpbmQociA9PiBUTVV0aWxzLmdldE9ic1ZhbHVlKHIsICdJc1VuaXF1ZVF1b3RlUGFydCcpID09PSAxKSB8fCBncm91cFswXTtcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQuc2V0KHFwLCBwKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdHggPSB7XHJcbiAgICAgICAgcm93cyxcclxuICAgICAgICBncm91cHNCeVF1b3RlUGFydCxcclxuICAgICAgICBwcmltYXJ5QnlRdW90ZVBhcnQsXHJcbiAgICAgICAgbGFzdEZvcm06IFRNVXRpbHMubmV0Py5nZXRMYXN0QWRkVXBkYXRlRm9ybT8uKCksXHJcbiAgICAgICAgbGFzdFJlc3VsdDogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGU/LigpXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHV0aWxzID0geyBnZXQ6IChvYmosIHBhdGgsIG9wdHMpID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUob2JqLCBwYXRoLCBvcHRzKSB9O1xyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IHJ1bGVzLmZsYXRNYXAocnVsZSA9PiBydWxlKGN0eCwgc2V0dGluZ3MsIHV0aWxzKSk7XHJcbiAgICBjb25zdCBvayA9IGlzc3Vlcy5ldmVyeShpID0+IGkubGV2ZWwgIT09ICdlcnJvcicpO1xyXG5cclxuICAgIC8vIHN0YXNoIGlmIHlvdSB3YW50IG90aGVyIG1vZHVsZXMgdG8gcmVhZCBpdCBsYXRlclxyXG4gICAgVE1VdGlscy5zdGF0ZSA9IFRNVXRpbHMuc3RhdGUgfHwge307XHJcbiAgICBUTVV0aWxzLnN0YXRlLmxhc3RWYWxpZGF0aW9uID0geyBhdDogRGF0ZS5ub3coKSwgb2ssIGlzc3VlcyB9O1xyXG5cclxuICAgIHJldHVybiB7IG9rLCBpc3N1ZXMgfTtcclxufVxyXG4iLCAiLy8gQWRkcyBhIFx1MjAxQ1ZhbGlkYXRlIExpbmVzXHUyMDFEIGJ1dHRvbiBhbmQgd2lyZXMgaXQgdG8gdGhlIGVuZ2luZS5cclxuLy8gQXNzdW1lcyB5b3VyIHNldHRpbmdzIFVJIGV4cG9ydHMgZ2V0U2V0dGluZ3Mvb25TZXR0aW5nc0NoYW5nZS5cclxuXHJcbmltcG9ydCB7IHJ1blZhbGlkYXRpb24gfSBmcm9tICcuL2VuZ2luZSc7XHJcbmltcG9ydCB7IGdldFNldHRpbmdzLCBvblNldHRpbmdzQ2hhbmdlIH0gZnJvbSAnLi9pbmRleCc7XHJcblxyXG5jb25zdCBDRkcgPSB7XHJcbiAgICBBQ1RJT05fQkFSX1NFTDogJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsXHJcbiAgICBORVhUX1NFTDogJyNOZXh0V2l6YXJkUGFnZScsXHJcbiAgICBCVVRUT05fSUQ6ICdsdC12YWxpZGF0ZS1saW5lcydcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscykge1xyXG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKENGRy5CVVRUT05fSUQpKSByZXR1cm4gKCkgPT4geyB9O1xyXG5cclxuICAgIGNvbnN0IG5leHRCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5ORVhUX1NFTCk7XHJcbiAgICBjb25zdCBhY3Rpb25CYXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5BQ1RJT05fQkFSX1NFTCk7XHJcblxyXG4gICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XHJcbiAgICBidG4uaWQgPSBDRkcuQlVUVE9OX0lEO1xyXG4gICAgYnRuLnR5cGUgPSAnYnV0dG9uJztcclxuICAgIGJ0bi5jbGFzc05hbWUgPSAnYnRuIGJ0bi1zbSBidG4tc2Vjb25kYXJ5JztcclxuICAgIGJ0bi50ZXh0Q29udGVudCA9ICdWYWxpZGF0ZSBMaW5lcyc7XHJcblxyXG4gICAgaWYgKG5leHRCdG4gJiYgbmV4dEJ0bi5wYXJlbnROb2RlKSB7XHJcbiAgICAgICAgbmV4dEJ0bi5wYXJlbnROb2RlLmluc2VydEJlZm9yZShidG4sIG5leHRCdG4pO1xyXG4gICAgfSBlbHNlIGlmIChhY3Rpb25CYXIpIHtcclxuICAgICAgICBhY3Rpb25CYXIuYXBwZW5kQ2hpbGQoYnRuKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gZmFsbGJhY2sgcG9zaXRpb24gaWYgYWN0aW9uIGJhciBpc24ndCBwcmVzZW50IHlldFxyXG4gICAgICAgIE9iamVjdC5hc3NpZ24oYnRuLnN0eWxlLCB7IHBvc2l0aW9uOiAnZml4ZWQnLCBib3R0b206ICc4MHB4JywgbGVmdDogJzIwcHgnLCB6SW5kZXg6IDEwMDAwMCB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJ0bik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb2ZmU2V0dGluZ3MgPSBvblNldHRpbmdzQ2hhbmdlPy4oKCkgPT4gcmVmcmVzaExhYmVsKGJ0bikpO1xyXG4gICAgcmVmcmVzaExhYmVsKGJ0bik7XHJcblxyXG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3MoKTtcclxuICAgICAgICBidG4uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IHByaW9yID0gYnRuLnRleHRDb250ZW50O1xyXG4gICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdWYWxpZGF0aW5nXHUyMDI2JztcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgeyBvaywgaXNzdWVzIH0gPSBhd2FpdCBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKTtcclxuICAgICAgICAgICAgaWYgKG9rKSB7XHJcbiAgICAgICAgICAgICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZSgnYnRuLXNlY29uZGFyeScsICdidG4tZGFuZ2VyJyk7XHJcbiAgICAgICAgICAgICAgICBidG4uY2xhc3NMaXN0LmFkZCgnYnRuLXN1Y2Nlc3MnKTtcclxuICAgICAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdWYWxpZCBcdTI3MTMnO1xyXG4gICAgICAgICAgICAgICAgVE1VdGlscy50b2FzdD8uKCdcdTI3MDUgTGluZXMgdmFsaWQnLCAnc3VjY2VzcycsIDE4MDApO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2J0bi1zZWNvbmRhcnknLCAnYnRuLXN1Y2Nlc3MnKTtcclxuICAgICAgICAgICAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKCdidG4tZGFuZ2VyJyk7XHJcbiAgICAgICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAnRml4IElzc3Vlcyc7XHJcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnRvYXN0Py4oJ1x1Mjc0QyBWYWxpZGF0aW9uIGZhaWxlZDpcXG4nICsgaXNzdWVzLm1hcChpID0+IGBcdTIwMjIgJHtpLm1lc3NhZ2V9YCkuam9pbignXFxuJyksICdlcnJvcicsIDYwMDApO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS50YWJsZT8uKGlzc3Vlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2J0bi1zZWNvbmRhcnknKTtcclxuICAgICAgICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2J0bi1kYW5nZXInKTtcclxuICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ0Vycm9yJztcclxuICAgICAgICAgICAgVE1VdGlscy50b2FzdD8uKGBWYWxpZGF0aW9uIGVycm9yOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgNTAwMCk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgYnRuLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBidG4udGV4dENvbnRlbnQgPSBwcmlvcjsgcmVmcmVzaExhYmVsKGJ0bik7IH0sIDI1MDApO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgICAgb2ZmU2V0dGluZ3M/LigpO1xyXG4gICAgICAgIGJ0bi5yZW1vdmUoKTtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZnJlc2hMYWJlbChidG4pIHtcclxuICAgIGNvbnN0IHMgPSBnZXRTZXR0aW5ncygpO1xyXG4gICAgY29uc3QgcGFydHMgPSBbXTtcclxuICAgIC8vaWYgKHMucmVxdWlyZVJlc29sdmVkUGFydCkgcGFydHMucHVzaCgnUGFydCcpO1xyXG4gICAgLy9pZiAocy5mb3JiaWRaZXJvUHJpY2UpIHBhcnRzLnB1c2goJ1x1MjI2MCQwJyk7XHJcbiAgICAvL2lmIChzLm1pblVuaXRQcmljZSAhPSBudWxsKSBwYXJ0cy5wdXNoKGBcdTIyNjUke3MubWluVW5pdFByaWNlfWApO1xyXG4gICAgaWYgKHMubWF4VW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NCR7cy5tYXhVbml0UHJpY2V9YCk7XHJcbiAgICBidG4udGl0bGUgPSBgUnVsZXM6ICR7cGFydHMuam9pbignLCAnKSB8fCAnbm9uZSd9YDtcclxufVxyXG4iLCAiLy8gUVRWIGVudHJ5cG9pbnQ6IG1vdW50cyB0aGUgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIG9uIFBhcnQgU3VtbWFyeVxyXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxyXG4gICAgPyBfX0JVSUxEX0RFVl9fXHJcbiAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xyXG5cclxuaWYgKF9fQlVJTERfREVWX18pIHtcclxuICAgIHVuc2FmZVdpbmRvdy5RVFZfREVCVUcgPSB7XHJcbiAgICAgICAgc2V0dGluZ3M6ICgpID0+ICh7XHJcbiAgICAgICAgICAgIGVuYWJsZWQ6IEdNX2dldFZhbHVlKCdxdHYuZW5hYmxlZCcpLFxyXG4gICAgICAgICAgICBhdXRvTWFuYWdlTHRQYXJ0Tm9PblF1b3RlOiBHTV9nZXRWYWx1ZSgncXR2LmF1dG9NYW5hZ2VMdFBhcnROb09uUXVvdGUnKSxcclxuICAgICAgICAgICAgbWluVW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1pblVuaXRQcmljZScpLFxyXG4gICAgICAgICAgICBtYXhVbml0UHJpY2U6IEdNX2dldFZhbHVlKCdxdHYubWF4VW5pdFByaWNlJyksXHJcbiAgICAgICAgICAgIGJsb2NrTmV4dFVudGlsVmFsaWQ6IEdNX2dldFZhbHVlKCdxdHYuYmxvY2tOZXh0VW50aWxWYWxpZCcpLFxyXG4gICAgICAgICAgICBoaWdobGlnaHRGYWlsdXJlczogR01fZ2V0VmFsdWUoJ3F0di5oaWdobGlnaHRGYWlsdXJlcycpXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgZ2V0VmFsdWU6IGtleSA9PiBHTV9nZXRWYWx1ZShrZXkpLFxyXG4gICAgICAgIHNldFZhbHVlOiAoa2V5LCB2YWwpID0+IEdNX3NldFZhbHVlKGtleSwgdmFsKVxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG4vLyBFbnN1cmUgdGhlIHNldHRpbmdzIFVJIGxvYWRzIChnZWFyIGJ1dHRvbiwgc3RvcmFnZSBBUEkpXHJcbmltcG9ydCAnLi9pbmRleC5qcyc7XHJcbi8vIE1vdW50cyB0aGUgVmFsaWRhdGUgTGluZXMgYnV0dG9uICYgd2lyZXMgY2xpY2sgdG8gdGhlIGVuZ2luZVxyXG5pbXBvcnQgeyBtb3VudFZhbGlkYXRpb25CdXR0b24gfSBmcm9tICcuL2luamVjdEJ1dHRvbi5qcyc7XHJcblxyXG5UTVV0aWxzPy5uZXQ/LmVuc3VyZVdhdGNoZXI/LigpOyAvLyBvcHRpb25hbCwgaGFybWxlc3MgaWYgbWlzc2luZ1xyXG5cclxuLy8gR29vZFxyXG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xyXG5jb25zdCBQQUdFX05BTUVfUkUgPSAvcGFydFxccypzdW1tYXJ5L2k7XHJcbmxldCB1bm1vdW50QnRuID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGlzV2l6YXJkKCkge1xyXG4gICAgaWYgKFRNVXRpbHM/Lm1hdGNoUm91dGUpIHJldHVybiAhIVRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpO1xyXG4gICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gb25Sb3V0ZU9yRG9tQ2hhbmdlKCkge1xyXG4gICAgaWYgKCFpc1dpemFyZCgpKSByZXR1cm4gdW5tb3VudCgpO1xyXG4gICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IFthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJyk7XHJcbiAgICBjb25zdCBuYW1lID0gKG5hdj8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcclxuICAgIGlmIChQQUdFX05BTUVfUkUudGVzdChuYW1lKSkge1xyXG4gICAgICAgIGlmICghdW5tb3VudEJ0bikgdW5tb3VudEJ0biA9IG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdW5tb3VudCgpO1xyXG4gICAgfVxyXG59XHJcbmZ1bmN0aW9uIHVubW91bnQoKSB7IGlmICh1bm1vdW50QnRuKSB7IHVubW91bnRCdG4oKTsgdW5tb3VudEJ0biA9IG51bGw7IH0gfVxyXG5cclxub25Sb3V0ZU9yRG9tQ2hhbmdlKCk7XHJcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ob25Sb3V0ZU9yRG9tQ2hhbmdlKTtcclxuVE1VdGlscz8ub2JzZXJ2ZUluc2VydD8uKCcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLCBvblJvdXRlT3JEb21DaGFuZ2UpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBRXpELE1BQU0sU0FBUztBQUFBLElBQ1gsa0JBQWtCO0FBQUEsSUFDbEIsYUFBYTtBQUFBLElBQ2IsU0FBUztBQUFBLEVBQ2I7QUFFQSxNQUFNLEtBQU0sT0FBTyxpQkFBaUIsZUFBZSxhQUFhLEtBQU0sYUFBYSxLQUFLLE9BQU87QUFDL0YsTUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBR3RELE1BQU0sV0FBVyxDQUFDLENB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QUFFakIsV0FBUyxXQUFXO0FBQ2hCLFFBQUksU0FBUyxXQUFZLFFBQU8sQ0FBQyxDQUFDLFFBQVEsV0FBV0EsT0FBTTtBQUMzRCxXQUFPQSxRQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN2RDtBQUVBLFdBQVMscUJBQXFCO0FBQzFCLFFBQUksQ0FBQyxTQUFTLEVBQUcsUUFBTyxRQUFRO0FBQ2hDLFVBQU0sTUFBTSxTQUFTLGNBQWMsOEVBQThFO0FBQ2pILFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxLQUFLO0FBQzNDLFFBQUksYUFBYSxLQUFLLElBQUksR0FBRztBQUN6QixVQUFJLENBQUMsV0FBWSxjQUFhLHNCQUFzQixPQUFPO0FBQUEsSUFDL0QsT0FBTztBQUNILGNBQVE7QUFBQSxJQUNaO0FBQUEsRUFDSjtBQUNBLFdBQVMsVUFBVTtBQUFFLFFBQUksWUFBWTtBQUFFLGlCQUFXO0FBQUcsbUJBQWE7QUFBQSxJQUFNO0FBQUEsRUFBRTtBQUUxRSxxQkFBbUI7QUFDbkIsV0FBUyxjQUFjLGtCQUFrQjtBQUN6QyxXQUFTLGdCQUFnQiwrQkFBK0Isa0JBQWtCOyIsCiAgIm5hbWVzIjogWyJsaSIsICJuYXYiLCAiVE1VdGlscyIsICJLTyIsICJUTVV0aWxzIiwgIkRFViIsICJST1VURVMiXQp9Cg==
