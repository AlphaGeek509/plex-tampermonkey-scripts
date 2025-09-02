// ==UserScript==
// @name         QT20_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.233
// @description  DEV-only build; includes user-start gate
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  // src/qt20/main.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  (() => {
    const CONFIG = {
      DS_STOCK: 172,
      toastMs: 3500,
      modalTitle: "Quote Part Detail",
      settingsKey: "qt20_settings_v1",
      defaults: { includeBreakdown: true, includeTimestamp: true }
    };
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.("QT20");
    const dlog = (...a) => {
      if (DEV || IS_TEST_ENV) L?.log?.(...a);
    };
    const dwarn = (...a) => {
      if (DEV || IS_TEST_ENV) L?.warn?.(...a);
    };
    const derror = (...a) => {
      if (DEV || IS_TEST_ENV) L?.error?.(...a);
    };
    const KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
      dlog("QT20: wrong route, skipping");
      return;
    }
    function loadSettings() {
      try {
        const v = GM_getValue(CONFIG.settingsKey, CONFIG.defaults);
        return typeof v === "string" ? { ...CONFIG.defaults, ...JSON.parse(v) } : { ...CONFIG.defaults, ...v };
      } catch {
        return { ...CONFIG.defaults };
      }
    }
    function saveSettings(next) {
      try {
        GM_setValue(CONFIG.settingsKey, next);
      } catch {
        GM_setValue(CONFIG.settingsKey, JSON.stringify(next));
      }
    }
    function devToast(msg, level = "info", ms = CONFIG.toastMs) {
      try {
        if (typeof TMUtils?.toast === "function") {
          TMUtils.toast(msg, level, ms);
          if (DEV) console.debug("[QT20 DEV] toast via TMUtils:", level, msg);
          return;
        }
      } catch (e) {
        if (DEV) console.debug("[QT20 DEV] TMUtils.toast threw", e);
      }
      if (!DEV) return;
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 2147483647,
        padding: "10px 12px",
        borderRadius: "8px",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        font: "14px/1.3 system-ui, Segoe UI, Arial",
        color: "#fff",
        background: level === "success" ? "#1b5e20" : level === "warn" ? "#7f6000" : level === "error" ? "#b71c1c" : "#424242",
        whiteSpace: "pre-wrap",
        maxWidth: "36ch"
      });
      el.textContent = String(msg);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), ms || 3500);
    }
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (err) {
        const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || "") || [])[1];
        if (+status === 419) {
          await TMUtils.getApiKey({ force: true });
          return await run();
        }
        throw err;
      }
    }
    async function ensureAuthOrToast() {
      try {
        const key = await TMUtils.getApiKey({ wait: true, timeoutMs: 3e3, pollMs: 150 });
        if (key) return true;
      } catch {
      }
      devToast("Sign-in required. Please log in, then click again.", "warn", 5e3);
      return false;
    }
    const stopObserve = TMUtils.observeInsertMany(
      ".plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions",
      injectStockControls
    );
    TMUtils.onUrlChange?.(() => {
      if (!TMUtils.matchRoute?.(ROUTES)) {
        try {
          stopObserve?.();
        } catch {
        }
      }
    });
    GM_registerMenuCommand?.(
      "QT20 DEV \u2014 Diagnostics",
      () => devToast(`Route: ${location.pathname}`, "info")
    );
    GM_registerMenuCommand?.("QT20 DEV \u2014 Refresh API Key", async () => {
      const k = await TMUtils.getApiKey({ force: true });
      console.debug("[QT20 DEV] API key length:", k?.length || 0);
    });
    function injectStockControls(ul) {
      try {
        let openPanel = function() {
          panel.style.display = "block";
          document.addEventListener("mousedown", outsideClose, true);
          document.addEventListener("keydown", escClose, true);
        }, closePanel = function() {
          panel.style.display = "none";
          document.removeEventListener("mousedown", outsideClose, true);
          document.removeEventListener("keydown", escClose, true);
        }, outsideClose = function(e) {
          if (!panel.contains(e.target) && e.target !== gear) closePanel();
        }, escClose = function(e) {
          if (e.key === "Escape") closePanel();
        };
        const modal = ul.closest(".plex-dialog");
        const title = modal?.querySelector(".plex-dialog-title")?.textContent?.trim();
        const looksRight = title === CONFIG.modalTitle || modal?.querySelector('textarea[name="NoteNew"]');
        if (!looksRight) return;
        if (ul.dataset.qt20Injected) return;
        ul.dataset.qt20Injected = "1";
        dlog("QT20: injecting controls");
        const liMain = document.createElement("li");
        const btn = document.createElement("a");
        btn.href = "javascript:void(0)";
        btn.textContent = "LT Get Stock Levels";
        btn.title = "Append normalized stock summary to Note";
        btn.setAttribute("aria-label", "Get stock levels");
        btn.setAttribute("role", "button");
        Object.assign(btn.style, { cursor: "pointer", transition: "filter .15s, text-decoration-color .15s" });
        btn.addEventListener("mouseenter", () => {
          btn.style.filter = "brightness(1.08)";
          btn.style.textDecoration = "underline";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.filter = "";
          btn.style.textDecoration = "";
        });
        btn.addEventListener("focus", () => {
          btn.style.outline = "2px solid #4a90e2";
          btn.style.outlineOffset = "2px";
        });
        btn.addEventListener("blur", () => {
          btn.style.outline = "";
          btn.style.outlineOffset = "";
        });
        btn.addEventListener("click", () => handleClick(btn, modal));
        liMain.appendChild(btn);
        ul.appendChild(liMain);
        const liGear = document.createElement("li");
        const gear = document.createElement("a");
        gear.href = "javascript:void(0)";
        gear.textContent = "\u2699\uFE0F";
        gear.title = "QT20 Settings (breakdown / timestamp)";
        gear.setAttribute("aria-label", "QT20 Settings");
        Object.assign(gear.style, { marginLeft: "8px", fontSize: "16px", lineHeight: "1", cursor: "pointer", transition: "transform .15s, filter .15s" });
        const panel = document.createElement("div");
        panel.className = "qt20-settings";
        Object.assign(panel.style, {
          position: "absolute",
          top: "40px",
          right: "16px",
          minWidth: "220px",
          padding: "10px 12px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          background: "#fff",
          boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
          zIndex: "9999",
          display: "none"
        });
        const S0 = loadSettings();
        panel.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px;">QT20 Settings</div>
        <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
          <input type="checkbox" id="qt20-breakdown" ${S0.includeBreakdown ? "checked" : ""}>
          <span>Include breakdown</span>
        </label>
        <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
          <input type="checkbox" id="qt20-timestamp" ${S0.includeTimestamp ? "checked" : ""}>
          <span>Include timestamp</span>
        </label>
        <div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end;">
          <button type="button" id="qt20-close" style="padding:4px 8px;">Close</button>
        </div>
      `;
        gear.addEventListener("click", (e) => {
          e.preventDefault();
          panel.style.display === "none" ? openPanel() : closePanel();
        });
        gear.addEventListener("mouseenter", () => {
          gear.style.filter = "brightness(1.08)";
          gear.style.transform = "rotate(15deg)";
        });
        gear.addEventListener("mouseleave", () => {
          gear.style.filter = "";
          gear.style.transform = "";
        });
        gear.addEventListener("focus", () => {
          gear.style.outline = "2px solid #4a90e2";
          gear.style.outlineOffset = "2px";
        });
        gear.addEventListener("blur", () => {
          gear.style.outline = "";
          gear.style.outlineOffset = "";
        });
        panel.querySelector("#qt20-close")?.addEventListener("click", closePanel);
        panel.querySelector("#qt20-breakdown")?.addEventListener("change", (ev) => {
          const cur = loadSettings();
          saveSettings({ ...cur, includeBreakdown: !!ev.target.checked });
        });
        panel.querySelector("#qt20-timestamp")?.addEventListener("change", (ev) => {
          const cur = loadSettings();
          saveSettings({ ...cur, includeTimestamp: !!ev.target.checked });
        });
        liGear.appendChild(gear);
        ul.appendChild(liGear);
        (modal.querySelector(".plex-dialog-content") || modal).appendChild(panel);
        onNodeRemoved(modal, () => {
          const W = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null;
          const CE = W && "CustomEvent" in W ? W.CustomEvent : globalThis.CustomEvent;
          if (W && W.dispatchEvent && CE) {
            try {
              W.dispatchEvent(new CE("LT:AttachmentRefreshRequested", { detail: { source: "QT20", ts: Date.now() } }));
            } catch {
            }
          }
        });
      } catch (e) {
        derror("QT20 inject:", e);
      }
    }
    async function handleClick(btn, modalEl) {
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.5";
      const restore = () => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      };
      try {
        devToast("\u23F3 Fetching stock levels\u2026", "info", 5e3);
        if (!await ensureAuthOrToast()) throw new Error("No API key/session");
        const ta = modalEl.querySelector('textarea[name="NoteNew"]') || document.querySelector('textarea[name="NoteNew"]');
        if (!ta) throw new Error("NoteNew textarea not found");
        const ctx = KO?.contextFor?.(ta);
        const vm = ctx?.$root?.data;
        if (!vm) throw new Error("Knockout context not found");
        const partNo = readPartFromVM(vm, KO);
        if (!partNo) throw new Error("PartNo not available");
        const basePart = toBasePart(partNo);
        const canWrite = true;
        const rows = await withFreshAuth(() => TMUtils.dsRows(CONFIG.DS_STOCK, {
          Part_No: basePart,
          Shippable: "TRUE",
          Container_Status: "OK"
        }));
        const { sum, breakdown } = summarizeStockNormalized(rows || [], basePart);
        const S = loadSettings();
        const parts = [`STK: ${formatInt(sum)} pcs`];
        if (S.includeBreakdown && breakdown.length) {
          const bk = breakdown.map(({ loc, qty }) => `${loc} ${formatInt(qty)}`).join(", ");
          parts.push(`(${bk})`);
        }
        if (S.includeTimestamp) parts.push(`@${formatTimestamp(/* @__PURE__ */ new Date())}`);
        const stamp = parts.join(" ");
        let rawNote;
        if (unsafeWindow.plex?.data?.getObservableOrValue) {
          rawNote = unsafeWindow.plex.data.getObservableOrValue(vm, "NoteNew");
        } else if (typeof vm.NoteNew === "function") {
          rawNote = vm.NoteNew.call(vm);
        } else {
          rawNote = vm.NoteNew;
        }
        const current = TMUtils.getObsValue(vm, "NoteNew", { trim: true }) || "";
        const baseNote = /^(null|undefined)$/i.test(current) ? "" : current;
        const cleaned = baseNote.replace(
          /(?:^|\s)STK:\s*[\d,]+(?:\s*pcs)?(?:\s*\([^)]*\))?(?:\s*@[0-9:\-\/\s]+)?/gi,
          ""
        ).trim();
        const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
        TMUtils.setObsValue(vm, "NoteNew", newNote);
        devToast(`\u2705 ${stamp}`, "success", CONFIG.toastMs);
        dlog("QT20 success", { partNo, basePart, sum, breakdown, newNote });
      } catch (err) {
        devToast(`\u274C ${err.message || err}`, "error", 8e3);
        derror("QT20:", err);
      } finally {
        restore();
      }
    }
    function readPartFromVM(vm, KOref) {
      const keys = ["PartNo", "ItemNo", "Part_Number", "Item_Number", "Part", "Item"];
      for (const k of keys) {
        const v = TMUtils.getObsValue(vm, k, { first: true, trim: true });
        if (v) return v;
      }
      return "";
    }
    function splitBaseAndPack(partNo) {
      const s = String(partNo || "").trim();
      const m = s.match(/^(.*?)-(\d+)\s*(BAG|BOX|PACK|PKG)$/i);
      if (m) return { base: m[1], packSize: Number(m[2]), packUnit: m[3].toUpperCase() };
      return { base: s, packSize: null, packUnit: null };
    }
    function toBasePart(partNo) {
      return splitBaseAndPack(partNo).base;
    }
    function normalizeRowToPieces(row, targetBase) {
      const rowPart = String(row?.Part_No || "").trim();
      const { base, packSize } = splitBaseAndPack(rowPart);
      if (!base || base !== targetBase) return 0;
      const unit = String(row?.Unit || "").toLowerCase();
      const qty = Number(row?.Quantity) || 0;
      if (unit === "" || unit === "pcs" || unit === "piece" || unit === "pieces") return qty;
      if (packSize) return qty * packSize;
      return qty;
    }
    function summarizeStockNormalized(rows, targetBase) {
      const byLoc = /* @__PURE__ */ new Map();
      let total = 0;
      for (const r of rows || []) {
        const pcs = normalizeRowToPieces(r, targetBase);
        if (!pcs) continue;
        const loc = String(r?.Location || r?.Warehouse || r?.Site || "UNK").trim();
        total += pcs;
        byLoc.set(loc, (byLoc.get(loc) || 0) + pcs);
      }
      const breakdown = [...byLoc].map(([loc, qty]) => ({ loc, qty })).sort((a, b) => b.qty - a.qty);
      return { sum: total, breakdown };
    }
    function formatInt(n) {
      return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    function formatTimestamp(d) {
      const pad = (x) => String(x).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function onNodeRemoved(node, cb) {
      if (!node || !node.ownerDocument) return () => {
      };
      const mo = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.removedNodes || []) {
          if (n === node || n.contains && n.contains(node)) {
            try {
              cb();
            } finally {
              mo.disconnect();
            }
            return;
          }
        }
      });
      mo.observe(node.ownerDocument.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    if (DEV && typeof window !== "undefined") {
      window.__QT20__ = {
        injectStockControls,
        splitBaseAndPack,
        toBasePart,
        normalizeRowToPieces,
        summarizeStockNormalized,
        handleClick
      };
    }
  })();
})();
