// ==UserScript==
// @name         QT20_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.29
// @description  DEV-only build; includes user-start gate
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.29-1758044365646
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.29-1758044365646
// @require      http://localhost:5000/lt-ui-hub.js?v=3.6.29-1758044365646
// @require      http://localhost:5000/lt-core.user.js?v=3.6.29-1758044365646
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.29-1758044365646
// @resource     THEME_CSS http://localhost:5000/theme.css
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

(() => {
  // src/quote-tracking/qt20-partStockLevelGet/qt20.index.js
  var DEV = true ? true : true;
  (() => {
    "use strict";
    const dlog = (...a) => DEV && console.debug("QT20", ...a);
    const derr = (...a) => console.error("QT20 \u2716\uFE0F", ...a);
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    (async () => {
      try {
        await window.ensureLTHub?.();
      } catch {
      }
      lt.core.hub.setStatus("Ready", "info");
    })();
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!(window.TMUtils && window.TMUtils.matchRoute && window.TMUtils.matchRoute(ROUTES))) return;
    const CFG = {
      ACTIONS_UL_SEL: ".plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions",
      MODAL_TITLE: "Quote Part Detail",
      NOTE_SEL: 'textarea[name="NoteNew"]',
      DS_STOCK: 172,
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      POLL_MS: 200,
      TIMEOUT_MS: 12e3,
      SETTINGS_KEY: "qt20_settings_v2",
      DEFAULTS: { includeBreakdown: true, includeTimestamp: true }
    };
    async function ensureWizardVM() {
      const anchor = document.querySelector(CFG.GRID_SEL) ? CFG.GRID_SEL : CFG.ACTION_BAR_SEL;
      const { viewModel } = await (window.TMUtils?.waitForModelAsync(anchor, { pollMs: CFG.POLL_MS, timeoutMs: CFG.TIMEOUT_MS, requireKo: true }) ?? { viewModel: null });
      return viewModel;
    }
    function getQuoteKeyDeterministic() {
      try {
        const grid = document.querySelector(CFG.GRID_SEL);
        if (grid && KO?.dataFor) {
          const gridVM = KO.dataFor(grid);
          const raw0 = Array.isArray(gridVM?.datasource?.raw) ? gridVM.datasource.raw[0] : null;
          const v = raw0 ? window.TMUtils?.getObsValue?.(raw0, "QuoteKey") : null;
          if (v != null) return Number(v);
        }
      } catch {
      }
      try {
        const rootEl = document.querySelector(".plex-wizard, .plex-page");
        const rootVM = rootEl ? KO?.dataFor?.(rootEl) : null;
        const v = rootVM && (window.TMUtils?.getObsValue?.(rootVM, "QuoteKey") || window.TMUtils?.getObsValue?.(rootVM, "Quote.QuoteKey"));
        if (v != null) return Number(v);
      } catch {
      }
      const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
      return m ? Number(m[1]) : null;
    }
    const withFreshAuth = (fn) => {
      const impl = lt?.core?.auth?.withFreshAuth;
      return typeof impl === "function" ? impl(fn) : fn();
    };
    function loadSettings() {
      try {
        const v = GM_getValue(CFG.SETTINGS_KEY, CFG.DEFAULTS);
        return typeof v === "string" ? { ...CFG.DEFAULTS, ...JSON.parse(v) } : { ...CFG.DEFAULTS, ...v };
      } catch {
        return { ...CFG.DEFAULTS };
      }
    }
    function saveSettings(next) {
      try {
        GM_setValue(CFG.SETTINGS_KEY, next);
      } catch {
        GM_setValue(CFG.SETTINGS_KEY, JSON.stringify(next));
      }
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
    const formatInt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
    function formatTimestamp(d) {
      const pad = (x) => String(x).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    async function runStockFetchFromModal() {
      const task = lt.core.hub.beginTask("Fetching stock\u2026", "info");
      try {
        await ensureWizardVM();
        const qk = getQuoteKeyDeterministic();
        if (!qk || !Number.isFinite(qk) || qk <= 0) throw new Error("Quote Key not found");
        const ta = modalEl.querySelector(CFG.NOTE_SEL) || document.querySelector(CFG.NOTE_SEL);
        if (!ta) throw new Error("NoteNew textarea not found");
        const ctxKO = KO?.contextFor?.(ta);
        const vm = ctxKO?.$root?.data;
        if (!vm) throw new Error("Knockout context not found");
        const partNo = readPartFromVM(vm);
        if (!partNo) throw new Error("PartNo not available");
        const basePart = toBasePart(partNo);
        const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : window.lt?.core?.plex ?? window.TMUtils;
        const rows = await withFreshAuth(
          () => plex.dsRows(CFG.DS_STOCK, { Part_No: basePart, Shippable: "TRUE", Container_Status: "OK" })
        );
        const { sum, breakdown } = summarizeStockNormalized(rows || [], basePart);
        const S = loadSettings();
        const parts = [`STK: ${formatInt(sum)} pcs`];
        if (S.includeBreakdown && breakdown.length) {
          const bk = breakdown.map(({ loc, qty }) => `${loc} ${formatInt(qty)}`).join(", ");
          parts.push(`(${bk})`);
        }
        if (S.includeTimestamp) parts.push(`@${formatTimestamp(/* @__PURE__ */ new Date())}`);
        const stamp = parts.join(" ");
        const current = window.TMUtils?.getObsValue?.(vm, "NoteNew", { trim: true }) || "";
        const baseNote = /^(null|undefined)$/i.test(current) ? "" : current;
        const cleaned = baseNote.replace(
          /(?:^|\s)STK:\s*[\d,]+(?:\s*pcs)?(?:\s*\([^)]*\))?(?:\s*@[0-9:\-\/\s]+)?/gi,
          ""
        ).trim();
        const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
        const setOk = window.TMUtils?.setObsValue?.(vm, "NoteNew", newNote);
        if (!setOk && ta) {
          ta.value = newNote;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
        task.success("Stock updated", 1500);
        lt.core.hub.notify("success", "Stock results copied to Note", { timeout: 2500, toast: true });
        dlog("QT20 success", { qk, partNo, basePart, sum, breakdown });
      } catch (err) {
        task.error("Failed");
        lt.core.hub.notify("error", `Stock check failed: ${err?.message || err}`, { timeout: 4e3, toast: true });
        derr("handleClick:", err);
      } finally {
        restore();
      }
    }
    function readPartFromVM(vm) {
      const keys = ["PartNo", "ItemNo", "Part_Number", "Item_Number", "Part", "Item"];
      for (const k of keys) {
        const v = window.TMUtils?.getObsValue?.(vm, k, { first: true, trim: true });
        if (v) return v;
      }
      return "";
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
        const looksRight = title === CFG.MODAL_TITLE || modal?.querySelector(CFG.NOTE_SEL);
        if (!looksRight) return;
        if (ul.dataset.qt20Injected) return;
        ul.dataset.qt20Injected = "1";
        dlog("injecting controls");
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
        derr("inject:", e);
      }
    }
    const HUB_BTN_ID = "qt20-stock-btn";
    function getActiveModalTitle() {
      const t = document.querySelector(".plex-dialog-has-buttons .plex-dialog-title");
      return (t?.textContent || "").trim().replace(/\s+/g, " ");
    }
    function isTargetModalOpen() {
      return document.body.classList.contains("modal-open") && /^quote\s*part\s*detail$/i.test(getActiveModalTitle());
    }
    async function ensureHubButton() {
      try {
        await window.ensureLTHub?.();
      } catch {
      }
      lt.core.hub.registerButton({
        id: HUB_BTN_ID,
        label: "Stock",
        title: "Fetch stock for current part",
        section: "left",
        weight: 110,
        onClick: () => runStockFetchFromModal()
      });
    }
    function removeHubButton() {
      lt.core.hub.remove?.(HUB_BTN_ID);
    }
    async function reconcileHubButtonVisibility() {
      if (isTargetModalOpen()) {
        await ensureHubButton();
      } else {
        removeHubButton();
      }
    }
    let stopObserve = null;
    let offUrl = null;
    let booted = false;
    function wireNav(handler) {
      offUrl?.();
      offUrl = window.TMUtils?.onUrlChange?.(handler);
    }
    function startModalObserver() {
      stopObserve?.();
      stopObserve = window.TMUtils?.observeInsertMany?.(CFG.ACTIONS_UL_SEL, injectStockControls);
    }
    function stopModalObserver() {
      try {
        stopObserve?.();
      } catch {
      } finally {
        stopObserve = null;
      }
    }
    async function init() {
      if (booted) return;
      booted = true;
      await raf();
      await ensureWizardVM();
      startModalObserver();
      reconcileHubButtonVisibility();
      const bodyObs = new MutationObserver((muts) => {
        if (muts.some((m) => m.type === "attributes")) reconcileHubButtonVisibility();
      });
      bodyObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      const modalRoot = document.querySelector(".plex-dialog-has-buttons") || document.body;
      const titleObs = new MutationObserver(() => reconcileHubButtonVisibility());
      titleObs.observe(modalRoot, { subtree: true, childList: true, characterData: true });
      dlog("initialized");
    }
    function teardown() {
      booted = false;
      stopModalObserver();
    }
    wireNav(() => {
      if (window.TMUtils?.matchRoute?.(ROUTES)) init();
      else teardown();
    });
    init();
    if (DEV && typeof window !== "undefined") {
      window.__QT20__ = { injectStockControls, handleClick, splitBaseAndPack, toBasePart, normalizeRowToPieces, summarizeStockNormalized };
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyA9PT09PSBMb2dnaW5nIC8gS08gPT09PT1cbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDIwJywgLi4uYSk7XG4gICAgY29uc3QgZGVyciA9ICguLi5hKSA9PiBjb25zb2xlLmVycm9yKCdRVDIwIFx1MjcxNlx1RkUwRicsIC4uLmEpO1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XG5cbiAgICAvLyBFbnN1cmUgdGhlIGh1YiBtb3VudHMgZWFybHk7IFFUMjAgcnVucyBpbnNpZGUgYSBtb2RhbCBjb250ZXh0XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgKHdpbmRvdy5lbnN1cmVMVEh1Yj8uKCkpOyB9IGNhdGNoIHsgfVxuICAgICAgICBsdC5jb3JlLmh1Yi5zZXRTdGF0dXMoJ1JlYWR5JywgJ2luZm8nKTtcbiAgICB9KSgpO1xuXG5cblxuICAgIC8vID09PT09IFJvdXRlcyAvIFVJIGFuY2hvcnMgPT09PT1cbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghKHdpbmRvdy5UTVV0aWxzICYmIHdpbmRvdy5UTVV0aWxzLm1hdGNoUm91dGUgJiYgd2luZG93LlRNVXRpbHMubWF0Y2hSb3V0ZShST1VURVMpKSkgcmV0dXJuO1xuXG4gICAgY29uc3QgQ0ZHID0ge1xuICAgICAgICBBQ1RJT05TX1VMX1NFTDogJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucyAucGxleC1hY3Rpb25zLXdyYXBwZXIgdWwucGxleC1hY3Rpb25zJyxcbiAgICAgICAgTU9EQUxfVElUTEU6ICdRdW90ZSBQYXJ0IERldGFpbCcsXG4gICAgICAgIE5PVEVfU0VMOiAndGV4dGFyZWFbbmFtZT1cIk5vdGVOZXdcIl0nLFxuICAgICAgICBEU19TVE9DSzogMTcyLFxuICAgICAgICBBQ1RJT05fQkFSX1NFTDogJyNRdW90ZVdpemFyZFNoYXJlZEFjdGlvbkJhcicsXG4gICAgICAgIEdSSURfU0VMOiAnLnBsZXgtZ3JpZCcsXG4gICAgICAgIFBPTExfTVM6IDIwMCxcbiAgICAgICAgVElNRU9VVF9NUzogMTIwMDAsXG4gICAgICAgIFNFVFRJTkdTX0tFWTogJ3F0MjBfc2V0dGluZ3NfdjInLFxuICAgICAgICBERUZBVUxUUzogeyBpbmNsdWRlQnJlYWtkb3duOiB0cnVlLCBpbmNsdWRlVGltZXN0YW1wOiB0cnVlIH1cbiAgICB9O1xuXG4gICAgLy8gPT09PT0gS08vV2l6YXJkIGhlbHBlcnNcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVXaXphcmRWTSgpIHtcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpID8gQ0ZHLkdSSURfU0VMIDogQ0ZHLkFDVElPTl9CQVJfU0VMO1xuICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYyhhbmNob3IsIHsgcG9sbE1zOiBDRkcuUE9MTF9NUywgdGltZW91dE1zOiBDRkcuVElNRU9VVF9NUywgcmVxdWlyZUtvOiB0cnVlIH0pID8/IHsgdmlld01vZGVsOiBudWxsIH0pO1xuICAgICAgICByZXR1cm4gdmlld01vZGVsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xuICAgIH1cblxuICAgIC8vID09PT09IEF1dGggd3JhcHBlciAocHJlZmVycyBsdC5jb3JlLmF1dGgud2l0aEZyZXNoQXV0aDsgZmFsbHMgYmFjayB0byBwbGFpbiBydW4pXG4gICAgY29uc3Qgd2l0aEZyZXNoQXV0aCA9IChmbikgPT4ge1xuICAgICAgICBjb25zdCBpbXBsID0gbHQ/LmNvcmU/LmF1dGg/LndpdGhGcmVzaEF1dGg7XG4gICAgICAgIHJldHVybiAodHlwZW9mIGltcGwgPT09ICdmdW5jdGlvbicpID8gaW1wbChmbikgOiBmbigpO1xuICAgIH07XG5cblxuICAgIC8vID09PT09IFNldHRpbmdzIChHTSlcbiAgICBmdW5jdGlvbiBsb2FkU2V0dGluZ3MoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gR01fZ2V0VmFsdWUoQ0ZHLlNFVFRJTkdTX0tFWSwgQ0ZHLkRFRkFVTFRTKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNGRy5ERUZBVUxUUywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DRkcuREVGQVVMVFMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNGRy5ERUZBVUxUUyB9OyB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNhdmVTZXR0aW5ncyhuZXh0KSB7XG4gICAgICAgIHRyeSB7IEdNX3NldFZhbHVlKENGRy5TRVRUSU5HU19LRVksIG5leHQpOyB9XG4gICAgICAgIGNhdGNoIHsgR01fc2V0VmFsdWUoQ0ZHLlNFVFRJTkdTX0tFWSwgSlNPTi5zdHJpbmdpZnkobmV4dCkpOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU3RvY2sgaGVscGVyc1xuICAgIGZ1bmN0aW9uIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKSB7XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcocGFydE5vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IG0gPSBzLm1hdGNoKC9eKC4qPyktKFxcZCspXFxzKihCQUd8Qk9YfFBBQ0t8UEtHKSQvaSk7XG4gICAgICAgIGlmIChtKSByZXR1cm4geyBiYXNlOiBtWzFdLCBwYWNrU2l6ZTogTnVtYmVyKG1bMl0pLCBwYWNrVW5pdDogbVszXS50b1VwcGVyQ2FzZSgpIH07XG4gICAgICAgIHJldHVybiB7IGJhc2U6IHMsIHBhY2tTaXplOiBudWxsLCBwYWNrVW5pdDogbnVsbCB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0Jhc2VQYXJ0KHBhcnRObykgeyByZXR1cm4gc3BsaXRCYXNlQW5kUGFjayhwYXJ0Tm8pLmJhc2U7IH1cbiAgICBmdW5jdGlvbiBub3JtYWxpemVSb3dUb1BpZWNlcyhyb3csIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3Qgcm93UGFydCA9IFN0cmluZyhyb3c/LlBhcnRfTm8gfHwgJycpLnRyaW0oKTtcbiAgICAgICAgY29uc3QgeyBiYXNlLCBwYWNrU2l6ZSB9ID0gc3BsaXRCYXNlQW5kUGFjayhyb3dQYXJ0KTtcbiAgICAgICAgaWYgKCFiYXNlIHx8IGJhc2UgIT09IHRhcmdldEJhc2UpIHJldHVybiAwO1xuICAgICAgICBjb25zdCB1bml0ID0gU3RyaW5nKHJvdz8uVW5pdCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcXR5ID0gTnVtYmVyKHJvdz8uUXVhbnRpdHkpIHx8IDA7XG4gICAgICAgIGlmICh1bml0ID09PSAnJyB8fCB1bml0ID09PSAncGNzJyB8fCB1bml0ID09PSAncGllY2UnIHx8IHVuaXQgPT09ICdwaWVjZXMnKSByZXR1cm4gcXR5O1xuICAgICAgICBpZiAocGFja1NpemUpIHJldHVybiBxdHkgKiBwYWNrU2l6ZTtcbiAgICAgICAgcmV0dXJuIHF0eTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MsIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3QgYnlMb2MgPSBuZXcgTWFwKCk7IGxldCB0b3RhbCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiAocm93cyB8fCBbXSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHBjcyA9IG5vcm1hbGl6ZVJvd1RvUGllY2VzKHIsIHRhcmdldEJhc2UpO1xuICAgICAgICAgICAgaWYgKCFwY3MpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgbG9jID0gU3RyaW5nKHI/LkxvY2F0aW9uIHx8IHI/LldhcmVob3VzZSB8fCByPy5TaXRlIHx8ICdVTksnKS50cmltKCk7XG4gICAgICAgICAgICB0b3RhbCArPSBwY3M7XG4gICAgICAgICAgICBieUxvYy5zZXQobG9jLCAoYnlMb2MuZ2V0KGxvYykgfHwgMCkgKyBwY3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJyZWFrZG93biA9IFsuLi5ieUxvY10ubWFwKChbbG9jLCBxdHldKSA9PiAoeyBsb2MsIHF0eSB9KSkuc29ydCgoYSwgYikgPT4gYi5xdHkgLSBhLnF0eSk7XG4gICAgICAgIHJldHVybiB7IHN1bTogdG90YWwsIGJyZWFrZG93biB9O1xuICAgIH1cbiAgICBjb25zdCBmb3JtYXRJbnQgPSAobikgPT4gTnVtYmVyKG4pLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuICAgIGZ1bmN0aW9uIGZvcm1hdFRpbWVzdGFtcChkKSB7XG4gICAgICAgIGNvbnN0IHBhZCA9IHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIHJldHVybiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7cGFkKGQuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChkLmdldERhdGUoKSl9ICR7cGFkKGQuZ2V0SG91cnMoKSl9OiR7cGFkKGQuZ2V0TWludXRlcygpKX1gO1xuICAgIH1cblxuXG4gICAgLy8gPT09PT0gQ2xpY2sgaGFuZGxlciAobm8gcmVwbyB3cml0ZXMpXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuU3RvY2tGZXRjaEZyb21Nb2RhbCgpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgKHVzZWQgZm9yIGxvZ2dpbmcgb25seSBub3cpXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlIEtleSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBLTyBOb3RlIGZpZWxkIHdpdGhpbiB0aGUgc2FtZSBtb2RhbFxuICAgICAgICAgICAgY29uc3QgdGEgPSBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5OT1RFX1NFTCk7XG4gICAgICAgICAgICBpZiAoIXRhKSB0aHJvdyBuZXcgRXJyb3IoJ05vdGVOZXcgdGV4dGFyZWEgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eEtPID0gS08/LmNvbnRleHRGb3I/Lih0YSk7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eEtPPy4kcm9vdD8uZGF0YTtcbiAgICAgICAgICAgIGlmICghdm0pIHRocm93IG5ldyBFcnJvcignS25vY2tvdXQgY29udGV4dCBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVhZCBwYXJ0IGFuZCBub3JtYWxpemUgdG8gYmFzZVxuICAgICAgICAgICAgY29uc3QgcGFydE5vID0gcmVhZFBhcnRGcm9tVk0odm0pO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm8pIHRocm93IG5ldyBFcnJvcignUGFydE5vIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VQYXJ0ID0gdG9CYXNlUGFydChwYXJ0Tm8pO1xuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0sIGJyZWFrZG93biB9ID0gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MgfHwgW10sIGJhc2VQYXJ0KTtcblxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBbYFNUSzogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYF07XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlQnJlYWtkb3duICYmIGJyZWFrZG93bi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiayA9IGJyZWFrZG93bi5tYXAoKHsgbG9jLCBxdHkgfSkgPT4gYCR7bG9jfSAke2Zvcm1hdEludChxdHkpfWApLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgKCR7Ymt9KWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFMuaW5jbHVkZVRpbWVzdGFtcCkgcGFydHMucHVzaChgQCR7Zm9ybWF0VGltZXN0YW1wKG5ldyBEYXRlKCkpfWApO1xuICAgICAgICAgICAgY29uc3Qgc3RhbXAgPSBwYXJ0cy5qb2luKCcgJyk7XG5cbiAgICAgICAgICAgIC8vIEFwcGVuZCB0byBOb3RlTmV3IChjbGVhbiBwcmV2aW91cyBzdGFtcCBpZiBwcmVzZW50KVxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuZWQgPSBiYXNlTm90ZS5yZXBsYWNlKFxuICAgICAgICAgICAgICAgIC8oPzpefFxccylTVEs6XFxzKltcXGQsXSsoPzpcXHMqcGNzKT8oPzpcXHMqXFwoW14pXSpcXCkpPyg/OlxccypAWzAtOTpcXC1cXC9cXHNdKyk/L2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IG5ld05vdGUgPSBjbGVhbmVkID8gYCR7Y2xlYW5lZH0gJHtzdGFtcH1gIDogc3RhbXA7XG4gICAgICAgICAgICBjb25zdCBzZXRPayA9IHdpbmRvdy5UTVV0aWxzPy5zZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIG5ld05vdGUpO1xuICAgICAgICAgICAgaWYgKCFzZXRPayAmJiB0YSkgeyB0YS52YWx1ZSA9IG5ld05vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IH1cblxuICAgICAgICAgICAgdGFzay5zdWNjZXNzKCdTdG9jayB1cGRhdGVkJywgMTUwMCk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoJ3N1Y2Nlc3MnLCAnU3RvY2sgcmVzdWx0cyBjb3BpZWQgdG8gTm90ZScsIHsgdGltZW91dDogMjUwMCwgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRsb2coJ1FUMjAgc3VjY2VzcycsIHsgcWssIHBhcnRObywgYmFzZVBhcnQsIHN1bSwgYnJlYWtkb3duIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoJ2Vycm9yJywgYFN0b2NrIGNoZWNrIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsIHsgdGltZW91dDogNDAwMCwgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICByZXN0b3JlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZWFkUGFydEZyb21WTSh2bSkge1xuICAgICAgICBjb25zdCBrZXlzID0gWydQYXJ0Tm8nLCAnSXRlbU5vJywgJ1BhcnRfTnVtYmVyJywgJ0l0ZW1fTnVtYmVyJywgJ1BhcnQnLCAnSXRlbSddO1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuICAgICAgICAgICAgY29uc3QgdiA9IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCBrLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgaWYgKHYpIHJldHVybiB2O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICAvLyA9PT09PSBNb2RhbCB3aXJpbmcgKGlkZW1wb3RlbnQgcGVyIG1vZGFsKVxuICAgIGZ1bmN0aW9uIG9uTm9kZVJlbW92ZWQobm9kZSwgY2IpIHtcbiAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLm93bmVyRG9jdW1lbnQpIHJldHVybiAoKSA9PiB7IH07XG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbXV0cykgZm9yIChjb25zdCBuIG9mIG0ucmVtb3ZlZE5vZGVzIHx8IFtdKSB7XG4gICAgICAgICAgICAgICAgaWYgKG4gPT09IG5vZGUgfHwgKG4uY29udGFpbnMgJiYgbi5jb250YWlucyhub2RlKSkpIHsgdHJ5IHsgY2IoKTsgfSBmaW5hbGx5IHsgbW8uZGlzY29ubmVjdCgpOyB9IHJldHVybjsgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgbW8ub2JzZXJ2ZShub2RlLm93bmVyRG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIHJldHVybiAoKSA9PiBtby5kaXNjb25uZWN0KCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5qZWN0U3RvY2tDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbW9kYWwgPSB1bC5jbG9zZXN0KCcucGxleC1kaWFsb2cnKTtcbiAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gbW9kYWw/LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy10aXRsZScpPy50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICAgICAgY29uc3QgbG9va3NSaWdodCA9IHRpdGxlID09PSBDRkcuTU9EQUxfVElUTEUgfHwgbW9kYWw/LnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKTtcbiAgICAgICAgICAgIGlmICghbG9va3NSaWdodCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAodWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQpIHJldHVybjtcbiAgICAgICAgICAgIHVsLmRhdGFzZXQucXQyMEluamVjdGVkID0gJzEnO1xuICAgICAgICAgICAgZGxvZygnaW5qZWN0aW5nIGNvbnRyb2xzJyk7XG5cbiAgICAgICAgICAgIC8vIE1haW4gYWN0aW9uXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYnRuLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdMVCBHZXQgU3RvY2sgTGV2ZWxzJztcbiAgICAgICAgICAgIGJ0bi50aXRsZSA9ICdBcHBlbmQgbm9ybWFsaXplZCBzdG9jayBzdW1tYXJ5IHRvIE5vdGUnO1xuICAgICAgICAgICAgYnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdHZXQgc3RvY2sgbGV2ZWxzJyk7XG4gICAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHsgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICdmaWx0ZXIgLjE1cywgdGV4dC1kZWNvcmF0aW9uLWNvbG9yIC4xNXMnIH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJyc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcnOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUNsaWNrKGJ0biwgbW9kYWwpKTtcbiAgICAgICAgICAgIGxpTWFpbi5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gU2V0dGluZ3MgZ2VhclxuICAgICAgICAgICAgY29uc3QgbGlHZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGNvbnN0IGdlYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBnZWFyLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGdlYXIudGV4dENvbnRlbnQgPSAnXHUyNjk5XHVGRTBGJztcbiAgICAgICAgICAgIGdlYXIudGl0bGUgPSAnUVQyMCBTZXR0aW5ncyAoYnJlYWtkb3duIC8gdGltZXN0YW1wKSc7XG4gICAgICAgICAgICBnZWFyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdRVDIwIFNldHRpbmdzJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGdlYXIuc3R5bGUsIHsgbWFyZ2luTGVmdDogJzhweCcsIGZvbnRTaXplOiAnMTZweCcsIGxpbmVIZWlnaHQ6ICcxJywgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0gLjE1cywgZmlsdGVyIC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcGFuZWwuY2xhc3NOYW1lID0gJ3F0MjAtc2V0dGluZ3MnO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwYW5lbC5zdHlsZSwge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICc0MHB4JywgcmlnaHQ6ICcxNnB4JyxcbiAgICAgICAgICAgICAgICBtaW5XaWR0aDogJzIyMHB4JywgcGFkZGluZzogJzEwcHggMTJweCcsXG4gICAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNjY2MnLCBib3JkZXJSYWRpdXM6ICc4cHgnLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgYm94U2hhZG93OiAnMCA2cHggMjBweCByZ2JhKDAsMCwwLDAuMTUpJyxcbiAgICAgICAgICAgICAgICB6SW5kZXg6ICc5OTk5JywgZGlzcGxheTogJ25vbmUnXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgUzAgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OjYwMDsgbWFyZ2luLWJvdHRvbTo4cHg7XCI+UVQyMCBTZXR0aW5nczwvZGl2PlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtYnJlYWtkb3duXCIgJHtTMC5pbmNsdWRlQnJlYWtkb3duID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgYnJlYWtkb3duPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtdGltZXN0YW1wXCIgJHtTMC5pbmNsdWRlVGltZXN0YW1wID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgdGltZXN0YW1wPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4OyBkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGp1c3RpZnktY29udGVudDpmbGV4LWVuZDtcIj5cbiAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBpZD1cInF0MjAtY2xvc2VcIiBzdHlsZT1cInBhZGRpbmc6NHB4IDhweDtcIj5DbG9zZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIGA7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9wZW5QYW5lbCgpIHsgcGFuZWwuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG91dHNpZGVDbG9zZSwgdHJ1ZSk7IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2NDbG9zZSwgdHJ1ZSk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNsb3NlUGFuZWwoKSB7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG91dHNpZGVDbG9zZSwgdHJ1ZSk7IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2NDbG9zZSwgdHJ1ZSk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIG91dHNpZGVDbG9zZShlKSB7IGlmICghcGFuZWwuY29udGFpbnMoZS50YXJnZXQpICYmIGUudGFyZ2V0ICE9PSBnZWFyKSBjbG9zZVBhbmVsKCk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVzY0Nsb3NlKGUpIHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgY2xvc2VQYW5lbCgpOyB9XG5cbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyA/IG9wZW5QYW5lbCgpIDogY2xvc2VQYW5lbCgpOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgZ2Vhci5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGdlYXIuc3R5bGUudHJhbnNmb3JtID0gJ3JvdGF0ZSgxNWRlZyknOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgZ2Vhci5zdHlsZS5maWx0ZXIgPSAnJzsgZ2Vhci5zdHlsZS50cmFuc2Zvcm0gPSAnJzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBnZWFyLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBnZWFyLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGdlYXIuc3R5bGUub3V0bGluZSA9ICcnOyBnZWFyLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJzsgfSk7XG5cbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xvc2VQYW5lbCk7XG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC1icmVha2Rvd24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3VyID0gbG9hZFNldHRpbmdzKCk7IHNhdmVTZXR0aW5ncyh7IC4uLmN1ciwgaW5jbHVkZUJyZWFrZG93bjogISFldi50YXJnZXQuY2hlY2tlZCB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtdGltZXN0YW1wJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1ciA9IGxvYWRTZXR0aW5ncygpOyBzYXZlU2V0dGluZ3MoeyAuLi5jdXIsIGluY2x1ZGVUaW1lc3RhbXA6ICEhZXYudGFyZ2V0LmNoZWNrZWQgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGlHZWFyLmFwcGVuZENoaWxkKGdlYXIpO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlHZWFyKTtcbiAgICAgICAgICAgIChtb2RhbC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8IG1vZGFsKS5hcHBlbmRDaGlsZChwYW5lbCk7XG5cbiAgICAgICAgICAgIC8vIExldCBvdGhlciBtb2R1bGVzIHJlZnJlc2ggaWYgdGhleSBjYXJlIChuby1vcCBoZXJlKVxuICAgICAgICAgICAgb25Ob2RlUmVtb3ZlZChtb2RhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IFcgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiAodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsVGhpcyA6IG51bGwpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBDRSA9IChXICYmICgnQ3VzdG9tRXZlbnQnIGluIFcpID8gVy5DdXN0b21FdmVudCA6IGdsb2JhbFRoaXMuQ3VzdG9tRXZlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChXICYmIFcuZGlzcGF0Y2hFdmVudCAmJiBDRSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgVy5kaXNwYXRjaEV2ZW50KG5ldyBDRSgnTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCB7IGRldGFpbDogeyBzb3VyY2U6ICdRVDIwJywgdHM6IERhdGUubm93KCkgfSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZGVycignaW5qZWN0OicsIGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgSFVCX0JUTl9JRCA9ICdxdDIwLXN0b2NrLWJ0bic7XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVNb2RhbFRpdGxlKCkge1xuICAgICAgICBjb25zdCB0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zIC5wbGV4LWRpYWxvZy10aXRsZScpO1xuICAgICAgICByZXR1cm4gKHQ/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzVGFyZ2V0TW9kYWxPcGVuKCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsLW9wZW4nKVxuICAgICAgICAgICAgJiYgL15xdW90ZVxccypwYXJ0XFxzKmRldGFpbCQvaS50ZXN0KGdldEFjdGl2ZU1vZGFsVGl0bGUoKSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSHViQnV0dG9uKCkge1xuICAgICAgICB0cnkgeyBhd2FpdCAod2luZG93LmVuc3VyZUxUSHViPy4oKSk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGx0LmNvcmUuaHViLnJlZ2lzdGVyQnV0dG9uKHtcbiAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgbGFiZWw6ICdTdG9jaycsXG4gICAgICAgICAgICB0aXRsZTogJ0ZldGNoIHN0b2NrIGZvciBjdXJyZW50IHBhcnQnLFxuICAgICAgICAgICAgc2VjdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMTAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBydW5TdG9ja0ZldGNoRnJvbU1vZGFsKClcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlSHViQnV0dG9uKCkge1xuICAgICAgICBsdC5jb3JlLmh1Yi5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCkge1xuICAgICAgICBpZiAoaXNUYXJnZXRNb2RhbE9wZW4oKSkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZW1vdmVIdWJCdXR0b24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLy8gPT09PT0gQm9vdCAvIFNQQSB3aXJpbmdcbiAgICBsZXQgc3RvcE9ic2VydmUgPSBudWxsO1xuICAgIGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGxldCBib290ZWQgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICBzdG9wT2JzZXJ2ZT8uKCk7XG4gICAgICAgIHN0b3BPYnNlcnZlID0gd2luZG93LlRNVXRpbHM/Lm9ic2VydmVJbnNlcnRNYW55Py4oQ0ZHLkFDVElPTlNfVUxfU0VMLCBpbmplY3RTdG9ja0NvbnRyb2xzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wTW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSBmaW5hbGx5IHsgc3RvcE9ic2VydmUgPSBudWxsOyB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuICAgICAgICBhd2FpdCByYWYoKTtcbiAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgc3RhcnRNb2RhbE9ic2VydmVyKCk7XG5cbiAgICAgICAgLy8gU2hvdy9oaWRlIHRoZSBidXR0b24gYXMgdGhlIG1vZGFsIG9wZW5zL2Nsb3NlcyBhbmQgdGl0bGVzIGNoYW5nZVxuICAgICAgICByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgY29uc3QgYm9keU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgaWYgKG11dHMuc29tZShtID0+IG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnKSkgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgYm9keU9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10gfSk7XG5cbiAgICAgICAgLy8gTW9kYWwgdGl0bGUgbWF5IGNoYW5nZSBhZnRlciBvcGVuaW5nXG4gICAgICAgIGNvbnN0IG1vZGFsUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgIGNvbnN0IHRpdGxlT2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgdGl0bGVPYnMub2JzZXJ2ZShtb2RhbFJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG5cbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHN0b3BNb2RhbE9ic2VydmVyKCk7XG4gICAgfVxuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmICh3aW5kb3cuVE1VdGlscz8ubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbiAgICBpbml0KCk7XG5cbiAgICAvLyBEZXYgc2VhbSAob3B0aW9uYWwpXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDIwX18gPSB7IGluamVjdFN0b2NrQ29udHJvbHMsIGhhbmRsZUNsaWNrLCBzcGxpdEJhc2VBbmRQYWNrLCB0b0Jhc2VQYXJ0LCBub3JtYWxpemVSb3dUb1BpZWNlcywgc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLE1BQU0sTUFBTyxPQUF3QyxPQUFnQjtBQUVyRSxHQUFDLE1BQU07QUFDSDtBQUdBLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUks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
