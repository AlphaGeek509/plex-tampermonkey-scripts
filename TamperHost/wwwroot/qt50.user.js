// ==UserScript==
// @name         QT50_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2.0.19
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
  var KEYS = {
    enabled: "qtv.enabled",
    requireResolvedPart: "qtv.requireResolvedPart",
    forbidZeroPrice: "qtv.forbidZeroPrice",
    minUnitPrice: "qtv.minUnitPrice",
    maxUnitPrice: "qtv.maxUnitPrice",
    blockNextUntilValid: "qtv.blockNextUntilValid",
    highlightFailures: "qtv.highlightFailures"
  };
  var DEF = {
    [KEYS.enabled]: true,
    [KEYS.requireResolvedPart]: true,
    [KEYS.forbidZeroPrice]: true,
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
      requireResolvedPart: getVal(KEYS.requireResolvedPart),
      forbidZeroPrice: getVal(KEYS.forbidZeroPrice),
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
  var ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
  function isWizard() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES);
    return ROUTES.some((re) => re.test(location.pathname));
  }
  GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings", showPanel);
  ensureGearVisibility();
  TMUtils?.onUrlChange?.(ensureGearVisibility);
  if (!TMUtils?.onUrlChange) {
    const iid = setInterval(ensureGearVisibility, 500);
    setTimeout(() => clearInterval(iid), 6e3);
  }
  function ensureGearVisibility() {
    const btn = document.getElementById("lt-qtv-gear");
    if (isWizard()) {
      if (!btn) injectGearButton();
      else btn.style.display = "";
    } else if (btn) {
      btn.style.display = "none";
    }
  }
  function injectGearButton() {
    if (document.getElementById("lt-qtv-gear")) return;
    const btn = document.createElement("button");
    btn.id = "lt-qtv-gear";
    btn.textContent = "\u2699\uFE0F";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      zIndex: 100001,
      padding: "8px 10px",
      borderRadius: "50%",
      fontSize: "18px",
      cursor: "pointer",
      border: "1px solid #bbb",
      background: "#fff",
      boxShadow: "0 4px 14px rgba(0,0,0,.18)"
    });
    btn.title = "QT Validation Settings";
    btn.addEventListener("click", showPanel);
    document.body.appendChild(btn);
  }
  function showPanel() {
    const overlay = document.createElement("div");
    overlay.id = "lt-qtv-overlay";
    Object.assign(overlay.style, { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100002 });
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
    panel.innerHTML = `
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard \u2192 Part Summary page.</div>
    <label style="display:block; margin:10px 0;"><input type="checkbox" id="qtv-enabled"> Enable validations</label>
    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-requireResolved"> Require resolved part (PartStatus \u2260 "Quote")</label>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-forbidZero"> Forbid Unit Price = 0</label>
    <div style="display:flex; gap:10px; margin:8px 0;">
      <label style="flex:1;">Min Unit Price
        <input type="number" step="0.01" id="qtv-min" placeholder="(none)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <label style="flex:1;">Max Unit Price
        <input type="number" step="0.01" id="qtv-max" placeholder="(none)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
    </div>
    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-blockNext"> Block \u201CNext >\u201D until validated</label>
    <label style="display:block; margin:8px 0;"><input type="checkbox" id="qtv-highlight"> Highlight failing rows (when gating is on)</label>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
      <div><button id="qtv-reset" class="btn">Reset Defaults</button></div>
      <div style="display:flex; gap:8px;">
        <button id="qtv-export" class="btn">Export</button>
        <button id="qtv-import" class="btn">Import</button>
        <button id="qtv-close"  class="btn btn-primary">Close</button>
      </div>
    </div>`;
    panel.querySelectorAll(".btn").forEach((b) => Object.assign(b.style, {
      padding: "6px 10px",
      borderRadius: "6px",
      border: "1px solid #bbb",
      background: "#f7f7f7",
      cursor: "pointer"
    }));
    Object.assign(panel.querySelector("#qtv-close").style, { background: "#2563eb", color: "#fff", borderColor: "#1d4ed8" });
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.querySelector("#qtv-enabled").checked = getVal(KEYS.enabled);
    panel.querySelector("#qtv-requireResolved").checked = getVal(KEYS.requireResolvedPart);
    panel.querySelector("#qtv-forbidZero").checked = getVal(KEYS.forbidZeroPrice);
    setNumberOrBlank(panel.querySelector("#qtv-min"), getVal(KEYS.minUnitPrice));
    setNumberOrBlank(panel.querySelector("#qtv-max"), getVal(KEYS.maxUnitPrice));
    panel.querySelector("#qtv-blockNext").checked = getVal(KEYS.blockNextUntilValid);
    panel.querySelector("#qtv-highlight").checked = getVal(KEYS.highlightFailures);
    panel.querySelector("#qtv-enabled").addEventListener("change", (e) => setVal(KEYS.enabled, !!e.target.checked));
    panel.querySelector("#qtv-requireResolved").addEventListener("change", (e) => setVal(KEYS.requireResolvedPart, !!e.target.checked));
    panel.querySelector("#qtv-forbidZero").addEventListener("change", (e) => setVal(KEYS.forbidZeroPrice, !!e.target.checked));
    panel.querySelector("#qtv-blockNext").addEventListener("change", (e) => setVal(KEYS.blockNextUntilValid, !!e.target.checked));
    panel.querySelector("#qtv-highlight").addEventListener("change", (e) => setVal(KEYS.highlightFailures, !!e.target.checked));
    panel.querySelector("#qtv-min").addEventListener("change", (e) => {
      const v = parseNumberOrNull(e.target.value);
      setVal(KEYS.minUnitPrice, v);
      setNumberOrBlank(e.target, v);
    });
    panel.querySelector("#qtv-max").addEventListener("change", (e) => {
      const v = parseNumberOrNull(e.target.value);
      setVal(KEYS.maxUnitPrice, v);
      setNumberOrBlank(e.target, v);
    });
    panel.querySelector("#qtv-close").addEventListener("click", () => overlay.remove());
    panel.querySelector("#qtv-reset").addEventListener("click", () => {
      Object.keys(DEF).forEach((k) => GM_setValue(k, DEF[k]));
      emitChanged();
      overlay.remove();
      TMUtils.toast?.("Validation settings reset.", "info", 1800);
    });
    panel.querySelector("#qtv-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getSettings(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qt-validation-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    panel.querySelector("#qtv-import").addEventListener("click", async () => {
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          const data = JSON.parse(await f.text());
          if (data && typeof data === "object") {
            if ("enabled" in data) setVal(KEYS.enabled, !!data.enabled);
            if ("requireResolvedPart" in data) setVal(KEYS.requireResolvedPart, !!data.requireResolvedPart);
            if ("forbidZeroPrice" in data) setVal(KEYS.forbidZeroPrice, !!data.forbidZeroPrice);
            if ("minUnitPrice" in data) setVal(KEYS.minUnitPrice, toNullOrNumber(data.minUnitPrice));
            if ("maxUnitPrice" in data) setVal(KEYS.maxUnitPrice, toNullOrNumber(data.maxUnitPrice));
            if ("blockNextUntilValid" in data) setVal(KEYS.blockNextUntilValid, !!data.blockNextUntilValid);
            if ("highlightFailures" in data) setVal(KEYS.highlightFailures, !!data.highlightFailures);
            overlay.remove();
            TMUtils.toast?.("Validation settings imported.", "success", 1800);
          } else throw new Error("Invalid JSON.");
        };
        input.click();
      } catch (err) {
        TMUtils.toast?.(`Import failed: ${err?.message || err}`, "error", 3e3);
      }
    });
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
      if (true) {
        const preview = [];
        for (const [qp2, grp] of ctx.groupsByQuotePart.entries()) {
          for (const row of grp) {
            const raw = utils.get(row, "RvCustomizedUnitPrice") ?? utils.get(row, "RvUnitPriceCopy") ?? utils.get(row, "UnitPrice");
            preview.push({
              qp: qp2,
              qty: utils.get(row, "Quantity"),
              unitPrice_raw: raw,
              unitPrice_num: Number(String(raw ?? "").replace(/[^\d.-]/g, "")),
              partNo: utils.get(row, "CustomerPartNo"),
              desc: utils.get(row, "Description")
            });
          }
        }
        console.table(preview);
      }
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
  var rules_default = [maxUnitPrice];

  // src/quote-tracking/validation/engine.js
  async function runValidation(TMUtils2, settings) {
    await TMUtils2.waitForModelAsync(".plex-grid", { requireKo: true, timeoutMs: 12e3 });
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const grid = document.querySelector(".plex-grid");
    const gvm = grid ? KO?.dataFor?.(grid) : null;
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
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  if (true) {
    unsafeWindow.QTV_DEBUG = {
      getValue: (key) => GM_getValue(key),
      setValue: (key, val) => GM_setValue(key, val),
      settings: () => ({
        enabled: GM_getValue("qtv.enabled"),
        maxUnitPrice: GM_getValue("qtv.maxUnitPrice")
      })
    };
  }
  TMUtils?.net?.ensureWatcher?.();
  var ROUTES2 = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
  var PAGE_NAME_RE = /part\s*summary/i;
  var unmountBtn = null;
  function isWizard2() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES2);
    return ROUTES2.some((re) => re.test(location.pathname));
  }
  function onRouteOrDomChange() {
    if (!isWizard2()) return unmount();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL21heFVuaXRQcmljZS5qcyIsICIuLi90bS1zY3JpcHRzL3NyYy9xdW90ZS10cmFja2luZy92YWxpZGF0aW9uL3J1bGVzL2luZGV4LmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vZW5naW5lLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vaW5qZWN0QnV0dG9uLmpzIiwgIi4uL3RtLXNjcmlwdHMvc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcXR2LmVudHJ5LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9pbmRleC5qc1xuLyogZ2xvYmFsIEdNX2dldFZhbHVlLCBHTV9zZXRWYWx1ZSwgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCwgVE1VdGlscywgdW5zYWZlV2luZG93ICovXG5leHBvcnQgY29uc3QgS0VZUyA9IHtcbiAgICBlbmFibGVkOiAncXR2LmVuYWJsZWQnLFxuICAgIHJlcXVpcmVSZXNvbHZlZFBhcnQ6ICdxdHYucmVxdWlyZVJlc29sdmVkUGFydCcsXG4gICAgZm9yYmlkWmVyb1ByaWNlOiAncXR2LmZvcmJpZFplcm9QcmljZScsXG4gICAgbWluVW5pdFByaWNlOiAncXR2Lm1pblVuaXRQcmljZScsXG4gICAgbWF4VW5pdFByaWNlOiAncXR2Lm1heFVuaXRQcmljZScsXG4gICAgYmxvY2tOZXh0VW50aWxWYWxpZDogJ3F0di5ibG9ja05leHRVbnRpbFZhbGlkJyxcbiAgICBoaWdobGlnaHRGYWlsdXJlczogJ3F0di5oaWdobGlnaHRGYWlsdXJlcydcbn07XG5jb25zdCBERUYgPSB7XG4gICAgW0tFWVMuZW5hYmxlZF06IHRydWUsXG4gICAgW0tFWVMucmVxdWlyZVJlc29sdmVkUGFydF06IHRydWUsXG4gICAgW0tFWVMuZm9yYmlkWmVyb1ByaWNlXTogdHJ1ZSxcbiAgICBbS0VZUy5taW5Vbml0UHJpY2VdOiBudWxsLFxuICAgIFtLRVlTLm1heFVuaXRQcmljZV06IDEwLFxuICAgIFtLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWRdOiB0cnVlLFxuICAgIFtLRVlTLmhpZ2hsaWdodEZhaWx1cmVzXTogdHJ1ZVxufTtcbmNvbnN0IGdldFZhbCA9IGsgPT4ge1xuICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShrLCBERUZba10pO1xuICAgIHJldHVybiAodiA9PT0gdW5kZWZpbmVkID8gREVGW2tdIDogdik7XG59O1xuY29uc3Qgc2V0VmFsID0gKGssIHYpID0+IHsgR01fc2V0VmFsdWUoaywgdik7IGVtaXRDaGFuZ2VkKCk7IH07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXR0aW5ncygpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBlbmFibGVkOiBnZXRWYWwoS0VZUy5lbmFibGVkKSxcbiAgICAgICAgcmVxdWlyZVJlc29sdmVkUGFydDogZ2V0VmFsKEtFWVMucmVxdWlyZVJlc29sdmVkUGFydCksXG4gICAgICAgIGZvcmJpZFplcm9QcmljZTogZ2V0VmFsKEtFWVMuZm9yYmlkWmVyb1ByaWNlKSxcbiAgICAgICAgbWluVW5pdFByaWNlOiBnZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UpLFxuICAgICAgICBtYXhVbml0UHJpY2U6IGdldFZhbChLRVlTLm1heFVuaXRQcmljZSksXG4gICAgICAgIGJsb2NrTmV4dFVudGlsVmFsaWQ6IGdldFZhbChLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWQpLFxuICAgICAgICBoaWdobGlnaHRGYWlsdXJlczogZ2V0VmFsKEtFWVMuaGlnaGxpZ2h0RmFpbHVyZXMpXG4gICAgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBvblNldHRpbmdzQ2hhbmdlKGZuKSB7XG4gICAgaWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuICgpID0+IHsgfTtcbiAgICBjb25zdCBoID0gKCkgPT4gZm4oZ2V0U2V0dGluZ3MoKSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCBoKTtcbiAgICByZXR1cm4gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0xUOlFUVjpTZXR0aW5nc0NoYW5nZWQnLCBoKTtcbn1cbmZ1bmN0aW9uIGVtaXRDaGFuZ2VkKCkge1xuICAgIHRyeSB7IHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnTFQ6UVRWOlNldHRpbmdzQ2hhbmdlZCcsIHsgZGV0YWlsOiBnZXRTZXR0aW5ncygpIH0pKTsgfSBjYXRjaCB7IH1cbn1cblxuLy8gLS0tLS0tLS0tLSBVSSAoZ2VhciArIHBhbmVsKSAtLS0tLS0tLS0tXG5jb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuZnVuY3Rpb24gaXNXaXphcmQoKSB7XG4gICAgICAgIGlmIChUTVV0aWxzPy5tYXRjaFJvdXRlKSByZXR1cm4gISFUTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKTtcbiAgICAgICAgcmV0dXJuIFJPVVRFUy5zb21lKHJlID0+IHJlLnRlc3QobG9jYXRpb24ucGF0aG5hbWUpKTtcbiAgICB9XG5HTV9yZWdpc3Rlck1lbnVDb21tYW5kPy4oJ1x1MjY5OVx1RkUwRiBPcGVuIFFUIFZhbGlkYXRpb24gU2V0dGluZ3MnLCBzaG93UGFuZWwpO1xuZW5zdXJlR2VhclZpc2liaWxpdHkoKTtcblRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oZW5zdXJlR2VhclZpc2liaWxpdHkpO1xuaWYgKCFUTVV0aWxzPy5vblVybENoYW5nZSkgeyBjb25zdCBpaWQgPSBzZXRJbnRlcnZhbChlbnN1cmVHZWFyVmlzaWJpbGl0eSwgNTAwKTsgc2V0VGltZW91dCgoKSA9PiBjbGVhckludGVydmFsKGlpZCksIDYwMDApOyB9XG5cbmZ1bmN0aW9uIGVuc3VyZUdlYXJWaXNpYmlsaXR5KCkge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsdC1xdHYtZ2VhcicpO1xuICAgIGlmIChpc1dpemFyZCgpKSB7IGlmICghYnRuKSBpbmplY3RHZWFyQnV0dG9uKCk7IGVsc2UgYnRuLnN0eWxlLmRpc3BsYXkgPSAnJzsgfVxuICAgIGVsc2UgaWYgKGJ0bikgeyBidG4uc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfVxufVxuZnVuY3Rpb24gaW5qZWN0R2VhckJ1dHRvbigpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2x0LXF0di1nZWFyJykpIHJldHVybjtcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBidG4uaWQgPSAnbHQtcXR2LWdlYXInO1xuICAgIGJ0bi50ZXh0Q29udGVudCA9ICdcdTI2OTlcdUZFMEYnO1xuICAgIE9iamVjdC5hc3NpZ24oYnRuLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLCBib3R0b206ICcyMHB4JywgbGVmdDogJzIwcHgnLFxuICAgICAgICB6SW5kZXg6IDEwMDAwMSwgcGFkZGluZzogJzhweCAxMHB4JywgYm9yZGVyUmFkaXVzOiAnNTAlJyxcbiAgICAgICAgZm9udFNpemU6ICcxOHB4JywgY3Vyc29yOiAncG9pbnRlcicsIGJvcmRlcjogJzFweCBzb2xpZCAjYmJiJyxcbiAgICAgICAgYmFja2dyb3VuZDogJyNmZmYnLCBib3hTaGFkb3c6ICcwIDRweCAxNHB4IHJnYmEoMCwwLDAsLjE4KSdcbiAgICB9KTtcbiAgICBidG4udGl0bGUgPSAnUVQgVmFsaWRhdGlvbiBTZXR0aW5ncyc7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgc2hvd1BhbmVsKTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJ0bik7XG59XG5mdW5jdGlvbiBzaG93UGFuZWwoKSB7XG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG92ZXJsYXkuaWQgPSAnbHQtcXR2LW92ZXJsYXknO1xuICAgIE9iamVjdC5hc3NpZ24ob3ZlcmxheS5zdHlsZSwgeyBwb3NpdGlvbjogJ2ZpeGVkJywgaW5zZXQ6IDAsIGJhY2tncm91bmQ6ICdyZ2JhKDAsMCwwLC4zNSknLCB6SW5kZXg6IDEwMDAwMiB9KTtcbiAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzUwJScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwtNTAlKScsXG4gICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzE4cHgnLCBib3JkZXJSYWRpdXM6ICcxMnB4JyxcbiAgICAgICAgYm94U2hhZG93OiAnMCAxMHB4IDMwcHggcmdiYSgwLDAsMCwuMzApJywgZm9udEZhbWlseTogJ3N5c3RlbS11aSwgU2Vnb2UgVUksIHNhbnMtc2VyaWYnLFxuICAgICAgICB3aWR0aDogJzQyMHB4JywgbWF4V2lkdGg6ICc5MnZ3J1xuICAgIH0pO1xuICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8aDMgc3R5bGU9XCJtYXJnaW46MCAwIDEwcHggMDtcIj5RdW90ZSBWYWxpZGF0aW9uIFNldHRpbmdzPC9oMz5cbiAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjEycHg7IG9wYWNpdHk6Ljc1OyBtYXJnaW4tYm90dG9tOjEwcHg7XCI+QXBwbGllcyBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBQYXJ0IFN1bW1hcnkgcGFnZS48L2Rpdj5cbiAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1lbmFibGVkXCI+IEVuYWJsZSB2YWxpZGF0aW9uczwvbGFiZWw+XG4gICAgPGRpdiBzdHlsZT1cImJvcmRlci10b3A6MXB4IHNvbGlkICNlZWU7IG1hcmdpbjo4cHggMCAxMnB4O1wiPjwvZGl2PlxuICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjo4cHggMDtcIj48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdHYtcmVxdWlyZVJlc29sdmVkXCI+IFJlcXVpcmUgcmVzb2x2ZWQgcGFydCAoUGFydFN0YXR1cyBcdTIyNjAgXCJRdW90ZVwiKTwvbGFiZWw+XG4gICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpibG9jazsgbWFyZ2luOjhweCAwO1wiPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1mb3JiaWRaZXJvXCI+IEZvcmJpZCBVbml0IFByaWNlID0gMDwvbGFiZWw+XG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDsgZ2FwOjEwcHg7IG1hcmdpbjo4cHggMDtcIj5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NaW4gVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWluXCIgcGxhY2Vob2xkZXI9XCIobm9uZSlcIiBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImZsZXg6MTtcIj5NYXggVW5pdCBQcmljZVxuICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAxXCIgaWQ9XCJxdHYtbWF4XCIgcGxhY2Vob2xkZXI9XCIobm9uZSlcIiBzdHlsZT1cIndpZHRoOjEwMCU7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IHN0eWxlPVwiYm9yZGVyLXRvcDoxcHggc29saWQgI2VlZTsgbWFyZ2luOjhweCAwIDEycHg7XCI+PC9kaXY+XG4gICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpibG9jazsgbWFyZ2luOjhweCAwO1wiPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1ibG9ja05leHRcIj4gQmxvY2sgXHUyMDFDTmV4dCA+XHUyMDFEIHVudGlsIHZhbGlkYXRlZDwvbGFiZWw+XG4gICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpibG9jazsgbWFyZ2luOjhweCAwO1wiPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0di1oaWdobGlnaHRcIj4gSGlnaGxpZ2h0IGZhaWxpbmcgcm93cyAod2hlbiBnYXRpbmcgaXMgb24pPC9sYWJlbD5cbiAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6Y2VudGVyOyBtYXJnaW4tdG9wOjE0cHg7XCI+XG4gICAgICA8ZGl2PjxidXR0b24gaWQ9XCJxdHYtcmVzZXRcIiBjbGFzcz1cImJ0blwiPlJlc2V0IERlZmF1bHRzPC9idXR0b24+PC9kaXY+XG4gICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4O1wiPlxuICAgICAgICA8YnV0dG9uIGlkPVwicXR2LWV4cG9ydFwiIGNsYXNzPVwiYnRuXCI+RXhwb3J0PC9idXR0b24+XG4gICAgICAgIDxidXR0b24gaWQ9XCJxdHYtaW1wb3J0XCIgY2xhc3M9XCJidG5cIj5JbXBvcnQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBpZD1cInF0di1jbG9zZVwiICBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiPkNsb3NlPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5gO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5idG4nKS5mb3JFYWNoKGIgPT4gT2JqZWN0LmFzc2lnbihiLnN0eWxlLCB7XG4gICAgICAgIHBhZGRpbmc6ICc2cHggMTBweCcsIGJvcmRlclJhZGl1czogJzZweCcsIGJvcmRlcjogJzFweCBzb2xpZCAjYmJiJywgYmFja2dyb3VuZDogJyNmN2Y3ZjcnLCBjdXJzb3I6ICdwb2ludGVyJ1xuICAgIH0pKTtcbiAgICBPYmplY3QuYXNzaWduKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtY2xvc2UnKS5zdHlsZSwgeyBiYWNrZ3JvdW5kOiAnIzI1NjNlYicsIGNvbG9yOiAnI2ZmZicsIGJvcmRlckNvbG9yOiAnIzFkNGVkOCcgfSk7XG4gICAgb3ZlcmxheS5hcHBlbmRDaGlsZChwYW5lbCk7IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWVuYWJsZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMuZW5hYmxlZCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXF1aXJlUmVzb2x2ZWQnKS5jaGVja2VkID0gZ2V0VmFsKEtFWVMucmVxdWlyZVJlc29sdmVkUGFydCk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1mb3JiaWRaZXJvJykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmZvcmJpZFplcm9QcmljZSk7XG4gICAgc2V0TnVtYmVyT3JCbGFuayhwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LW1pbicpLCBnZXRWYWwoS0VZUy5taW5Vbml0UHJpY2UpKTtcbiAgICBzZXROdW1iZXJPckJsYW5rKHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4JyksIGdldFZhbChLRVlTLm1heFVuaXRQcmljZSkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtYmxvY2tOZXh0JykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmJsb2NrTmV4dFVudGlsVmFsaWQpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtaGlnaGxpZ2h0JykuY2hlY2tlZCA9IGdldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzKTtcblxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZW5hYmxlZCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuZW5hYmxlZCwgISFlLnRhcmdldC5jaGVja2VkKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXF1aXJlUmVzb2x2ZWQnKS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLnJlcXVpcmVSZXNvbHZlZFBhcnQsICEhZS50YXJnZXQuY2hlY2tlZCkpO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtZm9yYmlkWmVybycpLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuZm9yYmlkWmVyb1ByaWNlLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXR2LWJsb2NrTmV4dCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc2V0VmFsKEtFWVMuYmxvY2tOZXh0VW50aWxWYWxpZCwgISFlLnRhcmdldC5jaGVja2VkKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1oaWdobGlnaHQnKS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHNldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzLCAhIWUudGFyZ2V0LmNoZWNrZWQpKTtcblxuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWluJykuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdHYtbWF4JykuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHYgPSBwYXJzZU51bWJlck9yTnVsbChlLnRhcmdldC52YWx1ZSk7IHNldFZhbChLRVlTLm1heFVuaXRQcmljZSwgdik7IHNldE51bWJlck9yQmxhbmsoZS50YXJnZXQsIHYpO1xuICAgIH0pO1xuXG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1jbG9zZScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1yZXNldCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhERUYpLmZvckVhY2goayA9PiBHTV9zZXRWYWx1ZShrLCBERUZba10pKTsgZW1pdENoYW5nZWQoKTsgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgICAgVE1VdGlscy50b2FzdD8uKCdWYWxpZGF0aW9uIHNldHRpbmdzIHJlc2V0LicsICdpbmZvJywgMTgwMCk7XG4gICAgfSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1leHBvcnQnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtKU09OLnN0cmluZ2lmeShnZXRTZXR0aW5ncygpLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7IGEuZG93bmxvYWQgPSAncXQtdmFsaWRhdGlvbi1zZXR0aW5ncy5qc29uJzsgYS5jbGljaygpOyBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSwgMTAwMCk7XG4gICAgfSk7XG4gICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0di1pbXBvcnQnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTsgaW5wdXQudHlwZSA9ICdmaWxlJzsgaW5wdXQuYWNjZXB0ID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuICAgICAgICAgICAgaW5wdXQub25jaGFuZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZiA9IGlucHV0LmZpbGVzPy5bMF07IGlmICghZikgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGF3YWl0IGYudGV4dCgpKTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdlbmFibGVkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5lbmFibGVkLCAhIWRhdGEuZW5hYmxlZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgncmVxdWlyZVJlc29sdmVkUGFydCcgaW4gZGF0YSkgc2V0VmFsKEtFWVMucmVxdWlyZVJlc29sdmVkUGFydCwgISFkYXRhLnJlcXVpcmVSZXNvbHZlZFBhcnQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJ2ZvcmJpZFplcm9QcmljZScgaW4gZGF0YSkgc2V0VmFsKEtFWVMuZm9yYmlkWmVyb1ByaWNlLCAhIWRhdGEuZm9yYmlkWmVyb1ByaWNlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdtaW5Vbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1pblVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5taW5Vbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdtYXhVbml0UHJpY2UnIGluIGRhdGEpIHNldFZhbChLRVlTLm1heFVuaXRQcmljZSwgdG9OdWxsT3JOdW1iZXIoZGF0YS5tYXhVbml0UHJpY2UpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdibG9ja05leHRVbnRpbFZhbGlkJyBpbiBkYXRhKSBzZXRWYWwoS0VZUy5ibG9ja05leHRVbnRpbFZhbGlkLCAhIWRhdGEuYmxvY2tOZXh0VW50aWxWYWxpZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgnaGlnaGxpZ2h0RmFpbHVyZXMnIGluIGRhdGEpIHNldFZhbChLRVlTLmhpZ2hsaWdodEZhaWx1cmVzLCAhIWRhdGEuaGlnaGxpZ2h0RmFpbHVyZXMpO1xuICAgICAgICAgICAgICAgICAgICBvdmVybGF5LnJlbW92ZSgpOyBUTVV0aWxzLnRvYXN0Py4oJ1ZhbGlkYXRpb24gc2V0dGluZ3MgaW1wb3J0ZWQuJywgJ3N1Y2Nlc3MnLCAxODAwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT04uJyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaW5wdXQuY2xpY2soKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7IFRNVXRpbHMudG9hc3Q/LihgSW1wb3J0IGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIDMwMDApOyB9XG4gICAgfSk7XG59XG5mdW5jdGlvbiBwYXJzZU51bWJlck9yTnVsbChzKSB7IGNvbnN0IHYgPSBOdW1iZXIoU3RyaW5nKHMpLnRyaW0oKSk7IHJldHVybiBOdW1iZXIuaXNGaW5pdGUodikgPyB2IDogbnVsbDsgfVxuZnVuY3Rpb24gdG9OdWxsT3JOdW1iZXIodikgeyBjb25zdCBuID0gTnVtYmVyKHYpOyByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7IH1cbmZ1bmN0aW9uIHNldE51bWJlck9yQmxhbmsoaW5wdXQsIHZhbCkgeyBpbnB1dC52YWx1ZSA9ICh2YWwgPT0gbnVsbCA/ICcnIDogU3RyaW5nKHZhbCkpOyB9XG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vcnVsZXMvbWF4VW5pdFByaWNlLmpzXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIG1heFVuaXRQcmljZShjdHgsIHNldHRpbmdzLCB1dGlscykge1xyXG4gICAgLy8gR3VhcmQgaWYgbm90IGNvbmZpZ3VyZWRcclxuICAgIGNvbnN0IG1heCA9IE51bWJlcihzZXR0aW5ncy5tYXhVbml0UHJpY2UpO1xyXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWF4KSkgcmV0dXJuIFtdO1xyXG5cclxuICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xyXG5cclxuICAgIC8vIFNpbXBsZSBjdXJyZW5jeS9udW1iZXIgc2FuaXRpemVyXHJcbiAgICBjb25zdCB0b051bSA9ICh2KSA9PiB7XHJcbiAgICAgICAgaWYgKHYgPT0gbnVsbCkgcmV0dXJuIE5hTjtcclxuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHR5cGVvZiB2ID09PSAnZnVuY3Rpb24nID8gdigpIDogdikudHJpbSgpO1xyXG4gICAgICAgIGlmICghcykgcmV0dXJuIE5hTjtcclxuICAgICAgICByZXR1cm4gTnVtYmVyKHMucmVwbGFjZSgvW15cXGQuLV0vZywgJycpKTtcclxuICAgIH07XHJcblxyXG5cclxuICAgIGZvciAoY29uc3QgW3FwLCBncm91cF0gb2YgY3R4Lmdyb3Vwc0J5UXVvdGVQYXJ0LmVudHJpZXMoKSkge1xyXG4gICAgICAgIGlmIChfX0JVSUxEX0RFVl9fKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZpZXcgPSBbXTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBbcXAyLCBncnBdIG9mIGN0eC5ncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgcm93IG9mIGdycCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV0aWxzLmdldChyb3csICdSdkN1c3RvbWl6ZWRVbml0UHJpY2UnKSA/P1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dGlscy5nZXQocm93LCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgICAgICAgICAgdXRpbHMuZ2V0KHJvdywgJ1VuaXRQcmljZScpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBwcmV2aWV3LnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBxcDogcXAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBxdHk6IHV0aWxzLmdldChyb3csICdRdWFudGl0eScpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1bml0UHJpY2VfcmF3OiByYXcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRQcmljZV9udW06IE51bWJlcihTdHJpbmcocmF3ID8/ICcnKS5yZXBsYWNlKC9bXlxcZC4tXS9nLCAnJykpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJ0Tm86IHV0aWxzLmdldChyb3csICdDdXN0b21lclBhcnRObycpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjOiB1dGlscy5nZXQocm93LCAnRGVzY3JpcHRpb24nKVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnNvbGUudGFibGUocHJldmlldyk7XHJcbiAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgZm9yIChjb25zdCByIG9mIGdyb3VwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHF0eSA9IHV0aWxzLmdldChyLCAnUXVhbnRpdHknKSA/PyAnPyc7XHJcblxyXG4gICAgICAgICAgICAvLyBwcmVjZWRlbmNlOiBjdXN0b21pemVkID4gY29weSA+IGJhc2VcclxuICAgICAgICAgICAgY29uc3QgcmF3ID1cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZDdXN0b21pemVkVW5pdFByaWNlJykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnUnZVbml0UHJpY2VDb3B5JykgPz9cclxuICAgICAgICAgICAgICAgIHV0aWxzLmdldChyLCAnVW5pdFByaWNlJyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBudW0gPSB0b051bShyYXcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShudW0pICYmIG51bSA+IG1heCkge1xyXG4gICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdwcmljZS5tYXhVbml0UHJpY2UnLFxyXG4gICAgICAgICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InLFxyXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlUGFydEtleTogcXAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFFQICR7cXB9IFF0eSAke3F0eX06IFVuaXQgUHJpY2UgJHtyYXd9ID4gTWF4ICR7bWF4fWAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWV0YTogeyB1bml0UmF3OiByYXcsIHVuaXROdW06IG51bSwgbWF4IH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBpc3N1ZXM7XHJcbn1cclxuXHJcbm1heFVuaXRQcmljZS5tZXRhID0geyBpZDogJ21heFVuaXRQcmljZScsIGxhYmVsOiAnTWF4IFVuaXQgUHJpY2UnIH07XHJcbiIsICIvLyBzcmMvcXVvdGUtdHJhY2tpbmcvdmFsaWRhdGlvbi9ydWxlcy9pbmRleC5qc1xyXG4vL2ltcG9ydCByZXF1aXJlUmVzb2x2ZWRQYXJ0IGZyb20gJy4vcmVxdWlyZVJlc29sdmVkUGFydCc7XHJcbi8vaW1wb3J0IGZvcmJpZFplcm9QcmljZSBmcm9tICcuL2ZvcmJpZFplcm9QcmljZSc7XHJcbi8vaW1wb3J0IG1pblVuaXRQcmljZSBmcm9tICcuL21pblVuaXRQcmljZSc7XHJcbmltcG9ydCBtYXhVbml0UHJpY2UgZnJvbSAnLi9tYXhVbml0UHJpY2UnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgW21heFVuaXRQcmljZV07ICAvL3JlcXVpcmVSZXNvbHZlZFBhcnQsIGZvcmJpZFplcm9QcmljZSwgbWluVW5pdFByaWNlLFxyXG4iLCAiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3ZhbGlkYXRpb24vZW5naW5lLmpzXHJcbmltcG9ydCBydWxlcyBmcm9tICcuL3J1bGVzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5WYWxpZGF0aW9uKFRNVXRpbHMsIHNldHRpbmdzKSB7XHJcbiAgICBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1ncmlkJywgeyByZXF1aXJlS286IHRydWUsIHRpbWVvdXRNczogMTIwMDAgfSk7XHJcblxyXG4gICAgY29uc3QgS08gPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cua28gOiB3aW5kb3cua28pO1xyXG4gICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWdyaWQnKTtcclxuICAgIGNvbnN0IGd2bSA9IGdyaWQgPyBLTz8uZGF0YUZvcj8uKGdyaWQpIDogbnVsbDtcclxuXHJcbiAgICBjb25zdCByb3dzID0gKGd2bT8uZGF0YXNvdXJjZT8ucmF3KSB8fCAoZ3ZtPy5kYXRhc291cmNlPy5kYXRhKSB8fCBbXTtcclxuICAgIGNvbnN0IGdyb3Vwc0J5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xyXG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcclxuICAgICAgICBjb25zdCBxcCA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ1F1b3RlUGFydEtleScpID8/IC0xO1xyXG4gICAgICAgIChncm91cHNCeVF1b3RlUGFydC5nZXQocXApIHx8IGdyb3Vwc0J5UXVvdGVQYXJ0LnNldChxcCwgW10pLmdldChxcCkpLnB1c2gocik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcHJpbWFyeUJ5UXVvdGVQYXJ0ID0gbmV3IE1hcCgpO1xyXG4gICAgZm9yIChjb25zdCBbcXAsIGdyb3VwXSBvZiBncm91cHNCeVF1b3RlUGFydC5lbnRyaWVzKCkpIHtcclxuICAgICAgICBjb25zdCBwID0gZ3JvdXAuZmluZChyID0+IFRNVXRpbHMuZ2V0T2JzVmFsdWUociwgJ0lzVW5pcXVlUXVvdGVQYXJ0JykgPT09IDEpIHx8IGdyb3VwWzBdO1xyXG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydC5zZXQocXAsIHApO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGN0eCA9IHtcclxuICAgICAgICByb3dzLFxyXG4gICAgICAgIGdyb3Vwc0J5UXVvdGVQYXJ0LFxyXG4gICAgICAgIHByaW1hcnlCeVF1b3RlUGFydCxcclxuICAgICAgICBsYXN0Rm9ybTogVE1VdGlscy5uZXQ/LmdldExhc3RBZGRVcGRhdGVGb3JtPy4oKSxcclxuICAgICAgICBsYXN0UmVzdWx0OiBUTVV0aWxzLm5ldD8uZ2V0TGFzdEFkZFVwZGF0ZT8uKClcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgdXRpbHMgPSB7IGdldDogKG9iaiwgcGF0aCwgb3B0cykgPT4gVE1VdGlscy5nZXRPYnNWYWx1ZShvYmosIHBhdGgsIG9wdHMpIH07XHJcblxyXG4gICAgY29uc3QgaXNzdWVzID0gcnVsZXMuZmxhdE1hcChydWxlID0+IHJ1bGUoY3R4LCBzZXR0aW5ncywgdXRpbHMpKTtcclxuICAgIGNvbnN0IG9rID0gaXNzdWVzLmV2ZXJ5KGkgPT4gaS5sZXZlbCAhPT0gJ2Vycm9yJyk7XHJcblxyXG4gICAgLy8gc3Rhc2ggaWYgeW91IHdhbnQgb3RoZXIgbW9kdWxlcyB0byByZWFkIGl0IGxhdGVyXHJcbiAgICBUTVV0aWxzLnN0YXRlID0gVE1VdGlscy5zdGF0ZSB8fCB7fTtcclxuICAgIFRNVXRpbHMuc3RhdGUubGFzdFZhbGlkYXRpb24gPSB7IGF0OiBEYXRlLm5vdygpLCBvaywgaXNzdWVzIH07XHJcblxyXG4gICAgcmV0dXJuIHsgb2ssIGlzc3VlcyB9O1xyXG59XHJcbiIsICIvLyBBZGRzIGEgXHUyMDFDVmFsaWRhdGUgTGluZXNcdTIwMUQgYnV0dG9uIGFuZCB3aXJlcyBpdCB0byB0aGUgZW5naW5lLlxyXG4vLyBBc3N1bWVzIHlvdXIgc2V0dGluZ3MgVUkgZXhwb3J0cyBnZXRTZXR0aW5ncy9vblNldHRpbmdzQ2hhbmdlLlxyXG5cclxuaW1wb3J0IHsgcnVuVmFsaWRhdGlvbiB9IGZyb20gJy4vZW5naW5lJztcclxuaW1wb3J0IHsgZ2V0U2V0dGluZ3MsIG9uU2V0dGluZ3NDaGFuZ2UgfSBmcm9tICcuL2luZGV4JztcclxuXHJcbmNvbnN0IENGRyA9IHtcclxuICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcclxuICAgIE5FWFRfU0VMOiAnI05leHRXaXphcmRQYWdlJyxcclxuICAgIEJVVFRPTl9JRDogJ2x0LXZhbGlkYXRlLWxpbmVzJ1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50VmFsaWRhdGlvbkJ1dHRvbihUTVV0aWxzKSB7XHJcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoQ0ZHLkJVVFRPTl9JRCkpIHJldHVybiAoKSA9PiB7IH07XHJcblxyXG4gICAgY29uc3QgbmV4dEJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5FWFRfU0VMKTtcclxuICAgIGNvbnN0IGFjdGlvbkJhciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkFDVElPTl9CQVJfU0VMKTtcclxuXHJcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcclxuICAgIGJ0bi5pZCA9IENGRy5CVVRUT05fSUQ7XHJcbiAgICBidG4udHlwZSA9ICdidXR0b24nO1xyXG4gICAgYnRuLmNsYXNzTmFtZSA9ICdidG4gYnRuLXNtIGJ0bi1zZWNvbmRhcnknO1xyXG4gICAgYnRuLnRleHRDb250ZW50ID0gJ1ZhbGlkYXRlIExpbmVzJztcclxuXHJcbiAgICBpZiAobmV4dEJ0biAmJiBuZXh0QnRuLnBhcmVudE5vZGUpIHtcclxuICAgICAgICBuZXh0QnRuLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGJ0biwgbmV4dEJ0bik7XHJcbiAgICB9IGVsc2UgaWYgKGFjdGlvbkJhcikge1xyXG4gICAgICAgIGFjdGlvbkJhci5hcHBlbmRDaGlsZChidG4pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBmYWxsYmFjayBwb3NpdGlvbiBpZiBhY3Rpb24gYmFyIGlzbid0IHByZXNlbnQgeWV0XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHsgcG9zaXRpb246ICdmaXhlZCcsIGJvdHRvbTogJzgwcHgnLCBsZWZ0OiAnMjBweCcsIHpJbmRleDogMTAwMDAwIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYnRuKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvZmZTZXR0aW5ncyA9IG9uU2V0dGluZ3NDaGFuZ2U/LigoKSA9PiByZWZyZXNoTGFiZWwoYnRuKSk7XHJcbiAgICByZWZyZXNoTGFiZWwoYnRuKTtcclxuXHJcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBnZXRTZXR0aW5ncygpO1xyXG4gICAgICAgIGJ0bi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgY29uc3QgcHJpb3IgPSBidG4udGV4dENvbnRlbnQ7XHJcbiAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1ZhbGlkYXRpbmdcdTIwMjYnO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCB7IG9rLCBpc3N1ZXMgfSA9IGF3YWl0IHJ1blZhbGlkYXRpb24oVE1VdGlscywgc2V0dGluZ3MpO1xyXG4gICAgICAgICAgICBpZiAob2spIHtcclxuICAgICAgICAgICAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdidG4tc2Vjb25kYXJ5JywgJ2J0bi1kYW5nZXInKTtcclxuICAgICAgICAgICAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKCdidG4tc3VjY2VzcycpO1xyXG4gICAgICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1ZhbGlkIFx1MjcxMyc7XHJcbiAgICAgICAgICAgICAgICBUTVV0aWxzLnRvYXN0Py4oJ1x1MjcwNSBMaW5lcyB2YWxpZCcsICdzdWNjZXNzJywgMTgwMCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZSgnYnRuLXNlY29uZGFyeScsICdidG4tc3VjY2VzcycpO1xyXG4gICAgICAgICAgICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2J0bi1kYW5nZXInKTtcclxuICAgICAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdGaXggSXNzdWVzJztcclxuICAgICAgICAgICAgICAgIFRNVXRpbHMudG9hc3Q/LignXHUyNzRDIFZhbGlkYXRpb24gZmFpbGVkOlxcbicgKyBpc3N1ZXMubWFwKGkgPT4gYFx1MjAyMiAke2kubWVzc2FnZX1gKS5qb2luKCdcXG4nKSwgJ2Vycm9yJywgNjAwMCk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLnRhYmxlPy4oaXNzdWVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZSgnYnRuLXNlY29uZGFyeScpO1xyXG4gICAgICAgICAgICBidG4uY2xhc3NMaXN0LmFkZCgnYnRuLWRhbmdlcicpO1xyXG4gICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAnRXJyb3InO1xyXG4gICAgICAgICAgICBUTVV0aWxzLnRvYXN0Py4oYFZhbGlkYXRpb24gZXJyb3I6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCA1MDAwKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICBidG4uZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGJ0bi50ZXh0Q29udGVudCA9IHByaW9yOyByZWZyZXNoTGFiZWwoYnRuKTsgfSwgMjUwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuICgpID0+IHtcclxuICAgICAgICBvZmZTZXR0aW5ncz8uKCk7XHJcbiAgICAgICAgYnRuLnJlbW92ZSgpO1xyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVmcmVzaExhYmVsKGJ0bikge1xyXG4gICAgY29uc3QgcyA9IGdldFNldHRpbmdzKCk7XHJcbiAgICBjb25zdCBwYXJ0cyA9IFtdO1xyXG4gICAgLy9pZiAocy5yZXF1aXJlUmVzb2x2ZWRQYXJ0KSBwYXJ0cy5wdXNoKCdQYXJ0Jyk7XHJcbiAgICAvL2lmIChzLmZvcmJpZFplcm9QcmljZSkgcGFydHMucHVzaCgnXHUyMjYwJDAnKTtcclxuICAgIC8vaWYgKHMubWluVW5pdFByaWNlICE9IG51bGwpIHBhcnRzLnB1c2goYFx1MjI2NSR7cy5taW5Vbml0UHJpY2V9YCk7XHJcbiAgICBpZiAocy5tYXhVbml0UHJpY2UgIT0gbnVsbCkgcGFydHMucHVzaChgXHUyMjY0JHtzLm1heFVuaXRQcmljZX1gKTtcclxuICAgIGJ0bi50aXRsZSA9IGBSdWxlczogJHtwYXJ0cy5qb2luKCcsICcpIHx8ICdub25lJ31gO1xyXG59XHJcbiIsICIvLyBRVFYgZW50cnlwb2ludDogbW91bnRzIHRoZSBcdTIwMUNWYWxpZGF0ZSBMaW5lc1x1MjAxRCBidXR0b24gb24gUGFydCBTdW1tYXJ5XHJcbmNvbnN0IERFViA9ICh0eXBlb2YgX19CVUlMRF9ERVZfXyAhPT0gJ3VuZGVmaW5lZCcpXHJcbiAgICA/IF9fQlVJTERfREVWX19cclxuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XHJcblxyXG5pZiAoX19CVUlMRF9ERVZfXykge1xyXG4gICAgdW5zYWZlV2luZG93LlFUVl9ERUJVRyA9IHtcclxuICAgICAgICBnZXRWYWx1ZToga2V5ID0+IEdNX2dldFZhbHVlKGtleSksXHJcbiAgICAgICAgc2V0VmFsdWU6IChrZXksIHZhbCkgPT4gR01fc2V0VmFsdWUoa2V5LCB2YWwpLFxyXG4gICAgICAgIHNldHRpbmdzOiAoKSA9PiAoe1xyXG4gICAgICAgICAgICBlbmFibGVkOiBHTV9nZXRWYWx1ZSgncXR2LmVuYWJsZWQnKSxcclxuICAgICAgICAgICAgbWF4VW5pdFByaWNlOiBHTV9nZXRWYWx1ZSgncXR2Lm1heFVuaXRQcmljZScpLFxyXG4gICAgICAgIH0pXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuLy8gRW5zdXJlIHRoZSBzZXR0aW5ncyBVSSBsb2FkcyAoZ2VhciBidXR0b24sIHN0b3JhZ2UgQVBJKVxyXG5pbXBvcnQgJy4vaW5kZXguanMnO1xyXG4vLyBNb3VudHMgdGhlIFZhbGlkYXRlIExpbmVzIGJ1dHRvbiAmIHdpcmVzIGNsaWNrIHRvIHRoZSBlbmdpbmVcclxuaW1wb3J0IHsgbW91bnRWYWxpZGF0aW9uQnV0dG9uIH0gZnJvbSAnLi9pbmplY3RCdXR0b24uanMnO1xyXG5cclxuVE1VdGlscz8ubmV0Py5lbnN1cmVXYXRjaGVyPy4oKTsgLy8gb3B0aW9uYWwsIGhhcm1sZXNzIGlmIG1pc3NpbmdcclxuXHJcbi8vIEdvb2RcclxuY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcclxuY29uc3QgUEFHRV9OQU1FX1JFID0gL3BhcnRcXHMqc3VtbWFyeS9pO1xyXG5sZXQgdW5tb3VudEJ0biA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBpc1dpemFyZCgpIHtcclxuICAgIGlmIChUTVV0aWxzPy5tYXRjaFJvdXRlKSByZXR1cm4gISFUTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKTtcclxuICAgIHJldHVybiBST1VURVMuc29tZShyZSA9PiByZS50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uUm91dGVPckRvbUNoYW5nZSgpIHtcclxuICAgIGlmICghaXNXaXphcmQoKSkgcmV0dXJuIHVubW91bnQoKTtcclxuICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCBbYXJpYS1jdXJyZW50PVwicGFnZVwiXScpO1xyXG4gICAgY29uc3QgbmFtZSA9IChuYXY/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XHJcbiAgICBpZiAoUEFHRV9OQU1FX1JFLnRlc3QobmFtZSkpIHtcclxuICAgICAgICBpZiAoIXVubW91bnRCdG4pIHVubW91bnRCdG4gPSBtb3VudFZhbGlkYXRpb25CdXR0b24oVE1VdGlscyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHVubW91bnQoKTtcclxuICAgIH1cclxufVxyXG5mdW5jdGlvbiB1bm1vdW50KCkgeyBpZiAodW5tb3VudEJ0bikgeyB1bm1vdW50QnRuKCk7IHVubW91bnRCdG4gPSBudWxsOyB9IH1cclxuXHJcbm9uUm91dGVPckRvbUNoYW5nZSgpO1xyXG5UTVV0aWxzPy5vblVybENoYW5nZT8uKG9uUm91dGVPckRvbUNoYW5nZSk7XHJcblRNVXRpbHM/Lm9ic2VydmVJbnNlcnQ/LignI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJywgb25Sb3V0ZU9yRG9tQ2hhbmdlKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRU8sTUFBTSxPQUFPO0FBQUEsSUFDaEIsU0FBUztBQUFBLElBQ1QscUJBQXFCO0FBQUEs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
