// ==UserScript==
// @name         QT20_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.17
// @description  DEV-only build; includes user-start gate
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.17-1757634412340
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.17-1757634412340
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.17-1757634412340
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
  // src/quote-tracking/qt20-partStockLevelGet/qt20.index.js
  var DEV = true ? true : true;
  (() => {
    "use strict";
    const dlog = (...a) => DEV && console.debug("QT20", ...a);
    const derr = (...a) => console.error("QT20 \u2716\uFE0F", ...a);
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
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
      TOAST_MS: 3500,
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
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (err) {
        const s = err?.status || (/(\b\d{3}\b)/.exec(err?.message || "") || [])[1];
        if (+s === 419) {
          try {
            await window.lt?.core?.auth?.getKey?.();
          } catch {
            try {
              await window.TMUtils?.getApiKey?.({ force: true });
            } catch {
            }
          }
          return await run();
        }
        throw err;
      }
    }
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
    async function handleClick(btn, modalEl) {
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.5";
      const restore = () => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      };
      try {
        TMUtils.toast("\u23F3 Fetching stock levels\u2026", "info", 5e3);
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
        TMUtils.toast(`\u2705 ${stamp}`, "success", CFG.TOAST_MS);
        dlog("QT20 success", { qk, partNo, basePart, sum, breakdown });
      } catch (err) {
        TMUtils.toast(`\u274C ${err.message || err}`, "error", 8e3);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyA9PT09PSBMb2dnaW5nIC8gS08gPT09PT1cbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDIwJywgLi4uYSk7XG4gICAgY29uc3QgZGVyciA9ICguLi5hKSA9PiBjb25zb2xlLmVycm9yKCdRVDIwIFx1MjcxNlx1RkUwRicsIC4uLmEpO1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XG5cbiAgICAvLyA9PT09PSBSb3V0ZXMgLyBVSSBhbmNob3JzID09PT09XG4gICAgY29uc3QgUk9VVEVTID0gWy9eXFwvU2FsZXNBbmRDUk1cXC9RdW90ZVdpemFyZCg/OlxcL3wkKS9pXTtcbiAgICBpZiAoISh3aW5kb3cuVE1VdGlscyAmJiB3aW5kb3cuVE1VdGlscy5tYXRjaFJvdXRlICYmIHdpbmRvdy5UTVV0aWxzLm1hdGNoUm91dGUoUk9VVEVTKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICBOT1RFX1NFTDogJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyXzAwMCxcbiAgICAgICAgVE9BU1RfTVM6IDM1MDAsXG4gICAgICAgIFNFVFRJTkdTX0tFWTogJ3F0MjBfc2V0dGluZ3NfdjInLFxuICAgICAgICBERUZBVUxUUzogeyBpbmNsdWRlQnJlYWtkb3duOiB0cnVlLCBpbmNsdWRlVGltZXN0YW1wOiB0cnVlIH1cbiAgICB9O1xuXG4gICAgLy8gPT09PT0gS08vV2l6YXJkIGhlbHBlcnNcbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVXaXphcmRWTSgpIHtcbiAgICAgICAgY29uc3QgYW5jaG9yID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpID8gQ0ZHLkdSSURfU0VMIDogQ0ZHLkFDVElPTl9CQVJfU0VMO1xuICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYyhhbmNob3IsIHsgcG9sbE1zOiBDRkcuUE9MTF9NUywgdGltZW91dE1zOiBDRkcuVElNRU9VVF9NUywgcmVxdWlyZUtvOiB0cnVlIH0pID8/IHsgdmlld01vZGVsOiBudWxsIH0pO1xuICAgICAgICByZXR1cm4gdmlld01vZGVsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5HUklEX1NFTCk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBLTz8uZGF0YUZvcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRWTSA9IEtPLmRhdGFGb3IoZ3JpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmF3MCA9IEFycmF5LmlzQXJyYXkoZ3JpZFZNPy5kYXRhc291cmNlPy5yYXcpID8gZ3JpZFZNLmRhdGFzb3VyY2UucmF3WzBdIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gcmF3MCA/IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJhdzAsICdRdW90ZUtleScpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLCAucGxleC1wYWdlJyk7XG4gICAgICAgICAgICBjb25zdCByb290Vk0gPSByb290RWwgPyBLTz8uZGF0YUZvcj8uKHJvb3RFbCkgOiBudWxsO1xuICAgICAgICAgICAgY29uc3QgdiA9IHJvb3RWTSAmJiAod2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGVLZXknKSB8fCB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZS5RdW90ZUtleScpKTtcbiAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IG0gPSAvWz8mXVF1b3RlS2V5PShcXGQrKS9pLmV4ZWMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgICAgcmV0dXJuIG0gPyBOdW1iZXIobVsxXSkgOiBudWxsO1xuICAgIH1cblxuICAgIC8vID09PT09IDQxOSByZS1hdXRoIHdyYXBwZXJcbiAgICBhc3luYyBmdW5jdGlvbiB3aXRoRnJlc2hBdXRoKHJ1bikge1xuICAgICAgICB0cnkgeyByZXR1cm4gYXdhaXQgcnVuKCk7IH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc3QgcyA9IGVycj8uc3RhdHVzIHx8ICgoLyhcXGJcXGR7M31cXGIpLy5leGVjKGVycj8ubWVzc2FnZSB8fCAnJykgfHwgW10pWzFdKTtcbiAgICAgICAgICAgIGlmICgrcyA9PT0gNDE5KSB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93Lmx0Py5jb3JlPy5hdXRoPy5nZXRLZXk/LigpOyB9IGNhdGNoIHsgdHJ5IHsgYXdhaXQgd2luZG93LlRNVXRpbHM/LmdldEFwaUtleT8uKHsgZm9yY2U6IHRydWUgfSk7IH0gY2F0Y2ggeyB9IH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgcnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyA9PT09PSBTZXR0aW5ncyAoR00pXG4gICAgZnVuY3Rpb24gbG9hZFNldHRpbmdzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENGRy5TRVRUSU5HU19LRVksIENGRy5ERUZBVUxUUyk7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnID8geyAuLi5DRkcuREVGQVVMVFMsIC4uLkpTT04ucGFyc2UodikgfSA6IHsgLi4uQ0ZHLkRFRkFVTFRTLCAuLi52IH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DRkcuREVGQVVMVFMgfTsgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzYXZlU2V0dGluZ3MobmV4dCkge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDRkcuU0VUVElOR1NfS0VZLCBuZXh0KTsgfVxuICAgICAgICBjYXRjaCB7IEdNX3NldFZhbHVlKENGRy5TRVRUSU5HU19LRVksIEpTT04uc3RyaW5naWZ5KG5leHQpKTsgfVxuICAgIH1cblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKGJ0biwgbW9kYWxFbCkge1xuICAgICAgICBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgY29uc3QgcmVzdG9yZSA9ICgpID0+IHsgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnJzsgYnRuLnN0eWxlLm9wYWNpdHkgPSAnJzsgfTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgVE1VdGlscy50b2FzdCgnXHUyM0YzIEZldGNoaW5nIHN0b2NrIGxldmVsc1x1MjAyNicsICdpbmZvJywgNTAwMCk7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIFF1b3RlIEtleSAodXNlZCBmb3IgbG9nZ2luZyBvbmx5IG5vdylcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XG4gICAgICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHRocm93IG5ldyBFcnJvcignUXVvdGUgS2V5IG5vdCBmb3VuZCcpO1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIEtPIE5vdGUgZmllbGQgd2l0aGluIHRoZSBzYW1lIG1vZGFsXG4gICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWwucXVlcnlTZWxlY3RvcihDRkcuTk9URV9TRUwpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKTtcbiAgICAgICAgICAgIGlmICghdGEpIHRocm93IG5ldyBFcnJvcignTm90ZU5ldyB0ZXh0YXJlYSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgY29uc3QgY3R4S08gPSBLTz8uY29udGV4dEZvcj8uKHRhKTtcbiAgICAgICAgICAgIGNvbnN0IHZtID0gY3R4S08/LiRyb290Py5kYXRhO1xuICAgICAgICAgICAgaWYgKCF2bSkgdGhyb3cgbmV3IEVycm9yKCdLbm9ja291dCBjb250ZXh0IG5vdCBmb3VuZCcpO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHBhcnQgYW5kIG5vcm1hbGl6ZSB0byBiYXNlXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSByZWFkUGFydEZyb21WTSh2bSk7XG4gICAgICAgICAgICBpZiAoIXBhcnRObykgdGhyb3cgbmV3IEVycm9yKCdQYXJ0Tm8gbm90IGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgY29uc3QgYmFzZVBhcnQgPSB0b0Jhc2VQYXJ0KHBhcnRObyk7XG5cbiAgICAgICAgICAgIC8vIERTIGNhbGwgd2l0aCA0MTkgcmV0cnlcbiAgICAgICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpID8gYXdhaXQgZ2V0UGxleEZhY2FkZSgpIDogd2luZG93Lmx0Py5jb3JlPy5wbGV4ID8/IHdpbmRvdy5UTVV0aWxzO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT5cbiAgICAgICAgICAgICAgICBwbGV4LmRzUm93cyhDRkcuRFNfU1RPQ0ssIHsgUGFydF9ObzogYmFzZVBhcnQsIFNoaXBwYWJsZTogJ1RSVUUnLCBDb250YWluZXJfU3RhdHVzOiAnT0snIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBjb25zdCB7IHN1bSwgYnJlYWtkb3duIH0gPSBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQocm93cyB8fCBbXSwgYmFzZVBhcnQpO1xuXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtgU1RLOiAke2Zvcm1hdEludChzdW0pfSBwY3NgXTtcbiAgICAgICAgICAgIGlmIChTLmluY2x1ZGVCcmVha2Rvd24gJiYgYnJlYWtkb3duLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJrID0gYnJlYWtkb3duLm1hcCgoeyBsb2MsIHF0eSB9KSA9PiBgJHtsb2N9ICR7Zm9ybWF0SW50KHF0eSl9YCkuam9pbignLCAnKTtcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGAoJHtia30pYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlVGltZXN0YW1wKSBwYXJ0cy5wdXNoKGBAJHtmb3JtYXRUaW1lc3RhbXAobmV3IERhdGUoKSl9YCk7XG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IHBhcnRzLmpvaW4oJyAnKTtcblxuICAgICAgICAgICAgLy8gQXBwZW5kIHRvIE5vdGVOZXcgKGNsZWFuIHByZXZpb3VzIHN0YW1wIGlmIHByZXNlbnQpXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICdOb3RlTmV3JywgeyB0cmltOiB0cnVlIH0pIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgYmFzZU5vdGUgPSAoL14obnVsbHx1bmRlZmluZWQpJC9pLnRlc3QoY3VycmVudCkgPyAnJyA6IGN1cnJlbnQpO1xuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKVNUSzpcXHMqW1xcZCxdKyg/OlxccypwY3MpPyg/OlxccypcXChbXildKlxcKSk/KD86XFxzKkBbMC05OlxcLVxcL1xcc10rKT8vZ2ksXG4gICAgICAgICAgICAgICAgJydcbiAgICAgICAgICAgICkudHJpbSgpO1xuICAgICAgICAgICAgY29uc3QgbmV3Tm90ZSA9IGNsZWFuZWQgPyBgJHtjbGVhbmVkfSAke3N0YW1wfWAgOiBzdGFtcDtcbiAgICAgICAgICAgIGNvbnN0IHNldE9rID0gd2luZG93LlRNVXRpbHM/LnNldE9ic1ZhbHVlPy4odm0sICdOb3RlTmV3JywgbmV3Tm90ZSk7XG4gICAgICAgICAgICBpZiAoIXNldE9rICYmIHRhKSB7IHRhLnZhbHVlID0gbmV3Tm90ZTsgdGEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTsgfVxuXG4gICAgICAgICAgICBUTVV0aWxzLnRvYXN0KGBcdTI3MDUgJHtzdGFtcH1gLCAnc3VjY2VzcycsIENGRy5UT0FTVF9NUyk7XG4gICAgICAgICAgICBkbG9nKCdRVDIwIHN1Y2Nlc3MnLCB7IHFrLCBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0sIGJyZWFrZG93biB9KTtcblxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3QoYFx1Mjc0QyAke2Vyci5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCA4MDAwKTtcbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICByZXN0b3JlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZWFkUGFydEZyb21WTSh2bSkge1xuICAgICAgICBjb25zdCBrZXlzID0gWydQYXJ0Tm8nLCAnSXRlbU5vJywgJ1BhcnRfTnVtYmVyJywgJ0l0ZW1fTnVtYmVyJywgJ1BhcnQnLCAnSXRlbSddO1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuICAgICAgICAgICAgY29uc3QgdiA9IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCBrLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlIH0pO1xuICAgICAgICAgICAgaWYgKHYpIHJldHVybiB2O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICAvLyA9PT09PSBNb2RhbCB3aXJpbmcgKGlkZW1wb3RlbnQgcGVyIG1vZGFsKVxuICAgIGZ1bmN0aW9uIG9uTm9kZVJlbW92ZWQobm9kZSwgY2IpIHtcbiAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLm93bmVyRG9jdW1lbnQpIHJldHVybiAoKSA9PiB7IH07XG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbXV0cykgZm9yIChjb25zdCBuIG9mIG0ucmVtb3ZlZE5vZGVzIHx8IFtdKSB7XG4gICAgICAgICAgICAgICAgaWYgKG4gPT09IG5vZGUgfHwgKG4uY29udGFpbnMgJiYgbi5jb250YWlucyhub2RlKSkpIHsgdHJ5IHsgY2IoKTsgfSBmaW5hbGx5IHsgbW8uZGlzY29ubmVjdCgpOyB9IHJldHVybjsgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgbW8ub2JzZXJ2ZShub2RlLm93bmVyRG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIHJldHVybiAoKSA9PiBtby5kaXNjb25uZWN0KCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5qZWN0U3RvY2tDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbW9kYWwgPSB1bC5jbG9zZXN0KCcucGxleC1kaWFsb2cnKTtcbiAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gbW9kYWw/LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy10aXRsZScpPy50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICAgICAgY29uc3QgbG9va3NSaWdodCA9IHRpdGxlID09PSBDRkcuTU9EQUxfVElUTEUgfHwgbW9kYWw/LnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKTtcbiAgICAgICAgICAgIGlmICghbG9va3NSaWdodCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAodWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQpIHJldHVybjtcbiAgICAgICAgICAgIHVsLmRhdGFzZXQucXQyMEluamVjdGVkID0gJzEnO1xuICAgICAgICAgICAgZGxvZygnaW5qZWN0aW5nIGNvbnRyb2xzJyk7XG5cbiAgICAgICAgICAgIC8vIE1haW4gYWN0aW9uXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYnRuLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdMVCBHZXQgU3RvY2sgTGV2ZWxzJztcbiAgICAgICAgICAgIGJ0bi50aXRsZSA9ICdBcHBlbmQgbm9ybWFsaXplZCBzdG9jayBzdW1tYXJ5IHRvIE5vdGUnO1xuICAgICAgICAgICAgYnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdHZXQgc3RvY2sgbGV2ZWxzJyk7XG4gICAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHsgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICdmaWx0ZXIgLjE1cywgdGV4dC1kZWNvcmF0aW9uLWNvbG9yIC4xNXMnIH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJyc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcnOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUNsaWNrKGJ0biwgbW9kYWwpKTtcbiAgICAgICAgICAgIGxpTWFpbi5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gU2V0dGluZ3MgZ2VhclxuICAgICAgICAgICAgY29uc3QgbGlHZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGNvbnN0IGdlYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBnZWFyLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGdlYXIudGV4dENvbnRlbnQgPSAnXHUyNjk5XHVGRTBGJztcbiAgICAgICAgICAgIGdlYXIudGl0bGUgPSAnUVQyMCBTZXR0aW5ncyAoYnJlYWtkb3duIC8gdGltZXN0YW1wKSc7XG4gICAgICAgICAgICBnZWFyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdRVDIwIFNldHRpbmdzJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGdlYXIuc3R5bGUsIHsgbWFyZ2luTGVmdDogJzhweCcsIGZvbnRTaXplOiAnMTZweCcsIGxpbmVIZWlnaHQ6ICcxJywgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0gLjE1cywgZmlsdGVyIC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcGFuZWwuY2xhc3NOYW1lID0gJ3F0MjAtc2V0dGluZ3MnO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwYW5lbC5zdHlsZSwge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICc0MHB4JywgcmlnaHQ6ICcxNnB4JyxcbiAgICAgICAgICAgICAgICBtaW5XaWR0aDogJzIyMHB4JywgcGFkZGluZzogJzEwcHggMTJweCcsXG4gICAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNjY2MnLCBib3JkZXJSYWRpdXM6ICc4cHgnLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgYm94U2hhZG93OiAnMCA2cHggMjBweCByZ2JhKDAsMCwwLDAuMTUpJyxcbiAgICAgICAgICAgICAgICB6SW5kZXg6ICc5OTk5JywgZGlzcGxheTogJ25vbmUnXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgUzAgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OjYwMDsgbWFyZ2luLWJvdHRvbTo4cHg7XCI+UVQyMCBTZXR0aW5nczwvZGl2PlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtYnJlYWtkb3duXCIgJHtTMC5pbmNsdWRlQnJlYWtkb3duID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgYnJlYWtkb3duPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtdGltZXN0YW1wXCIgJHtTMC5pbmNsdWRlVGltZXN0YW1wID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgdGltZXN0YW1wPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4OyBkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGp1c3RpZnktY29udGVudDpmbGV4LWVuZDtcIj5cbiAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBpZD1cInF0MjAtY2xvc2VcIiBzdHlsZT1cInBhZGRpbmc6NHB4IDhweDtcIj5DbG9zZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIGA7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9wZW5QYW5lbCgpIHsgcGFuZWwuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG91dHNpZGVDbG9zZSwgdHJ1ZSk7IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2NDbG9zZSwgdHJ1ZSk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNsb3NlUGFuZWwoKSB7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG91dHNpZGVDbG9zZSwgdHJ1ZSk7IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2NDbG9zZSwgdHJ1ZSk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIG91dHNpZGVDbG9zZShlKSB7IGlmICghcGFuZWwuY29udGFpbnMoZS50YXJnZXQpICYmIGUudGFyZ2V0ICE9PSBnZWFyKSBjbG9zZVBhbmVsKCk7IH1cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVzY0Nsb3NlKGUpIHsgaWYgKGUua2V5ID09PSAnRXNjYXBlJykgY2xvc2VQYW5lbCgpOyB9XG5cbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyA/IG9wZW5QYW5lbCgpIDogY2xvc2VQYW5lbCgpOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgZ2Vhci5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGdlYXIuc3R5bGUudHJhbnNmb3JtID0gJ3JvdGF0ZSgxNWRlZyknOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgZ2Vhci5zdHlsZS5maWx0ZXIgPSAnJzsgZ2Vhci5zdHlsZS50cmFuc2Zvcm0gPSAnJzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBnZWFyLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBnZWFyLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGdlYXIuc3R5bGUub3V0bGluZSA9ICcnOyBnZWFyLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJzsgfSk7XG5cbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLWNsb3NlJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xvc2VQYW5lbCk7XG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC1icmVha2Rvd24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3VyID0gbG9hZFNldHRpbmdzKCk7IHNhdmVTZXR0aW5ncyh7IC4uLmN1ciwgaW5jbHVkZUJyZWFrZG93bjogISFldi50YXJnZXQuY2hlY2tlZCB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtdGltZXN0YW1wJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1ciA9IGxvYWRTZXR0aW5ncygpOyBzYXZlU2V0dGluZ3MoeyAuLi5jdXIsIGluY2x1ZGVUaW1lc3RhbXA6ICEhZXYudGFyZ2V0LmNoZWNrZWQgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGlHZWFyLmFwcGVuZENoaWxkKGdlYXIpO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlHZWFyKTtcbiAgICAgICAgICAgIChtb2RhbC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8IG1vZGFsKS5hcHBlbmRDaGlsZChwYW5lbCk7XG5cbiAgICAgICAgICAgIC8vIExldCBvdGhlciBtb2R1bGVzIHJlZnJlc2ggaWYgdGhleSBjYXJlIChuby1vcCBoZXJlKVxuICAgICAgICAgICAgb25Ob2RlUmVtb3ZlZChtb2RhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IFcgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiAodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsVGhpcyA6IG51bGwpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBDRSA9IChXICYmICgnQ3VzdG9tRXZlbnQnIGluIFcpID8gVy5DdXN0b21FdmVudCA6IGdsb2JhbFRoaXMuQ3VzdG9tRXZlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChXICYmIFcuZGlzcGF0Y2hFdmVudCAmJiBDRSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgVy5kaXNwYXRjaEV2ZW50KG5ldyBDRSgnTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCB7IGRldGFpbDogeyBzb3VyY2U6ICdRVDIwJywgdHM6IERhdGUubm93KCkgfSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZGVycignaW5qZWN0OicsIGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQm9vdCAvIFNQQSB3aXJpbmdcbiAgICBsZXQgc3RvcE9ic2VydmUgPSBudWxsO1xuICAgIGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGxldCBib290ZWQgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICBzdG9wT2JzZXJ2ZT8uKCk7XG4gICAgICAgIHN0b3BPYnNlcnZlID0gd2luZG93LlRNVXRpbHM/Lm9ic2VydmVJbnNlcnRNYW55Py4oQ0ZHLkFDVElPTlNfVUxfU0VMLCBpbmplY3RTdG9ja0NvbnRyb2xzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wTW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSBmaW5hbGx5IHsgc3RvcE9ic2VydmUgPSBudWxsOyB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuICAgICAgICBhd2FpdCByYWYoKTtcbiAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgc3RhcnRNb2RhbE9ic2VydmVyKCk7XG4gICAgICAgIGRsb2coJ2luaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBzdG9wTW9kYWxPYnNlcnZlcigpO1xuICAgIH1cblxuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAod2luZG93LlRNVXRpbHM/Lm1hdGNoUm91dGU/LihST1VURVMpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG4gICAgaW5pdCgpO1xuXG4gICAgLy8gRGV2IHNlYW0gKG9wdGlvbmFsKVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQyMF9fID0geyBpbmplY3RTdG9ja0NvbnRyb2xzLCBoYW5kbGVDbGljaywgc3BsaXRCYXNlQW5kUGFjaywgdG9CYXNlUGFydCwgbm9ybWFsaXplUm93VG9QaWVjZXMsIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZCB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0EsTUFBTSxNQUFPLE9BQXdDLE9BQWdCO0FBRXJFLEdBQUMsTUFBTTtBQUNIO0FBR0EsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxLQUFNLE9BQU8saUJB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
