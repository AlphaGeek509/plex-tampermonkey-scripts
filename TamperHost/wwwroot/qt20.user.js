// ==UserScript==
// @name         QT20_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.24
// @description  DEV-only build; includes user-start gate
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.6.24-1757638923543
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.6.24-1757638923543
// @require      http://localhost:5000/lt-data-core.user.js?v=3.6.24-1757638923543
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
    (async () => {
      const dock = await window.ensureLTDock?.();
      dock?.register({
        id: "qt35-attachments",
        label: "Attachments",
        title: "Open QT35 Attachments",
        weight: 120,
        onClick: () => openAttachmentsModal()
      });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJykgPyBfX0JVSUxEX0RFVl9fIDogdHJ1ZTtcblxuKCgpID0+IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyA9PT09PSBMb2dnaW5nIC8gS08gPT09PT1cbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IERFViAmJiBjb25zb2xlLmRlYnVnKCdRVDIwJywgLi4uYSk7XG4gICAgY29uc3QgZGVyciA9ICguLi5hKSA9PiBjb25zb2xlLmVycm9yKCdRVDIwIFx1MjcxNlx1RkUwRicsIC4uLmEpO1xuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnID8gdW5zYWZlV2luZG93LmtvIDogd2luZG93LmtvKTtcbiAgICBjb25zdCByYWYgPSAoKSA9PiBuZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSk7XG5cbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBlbnN1cmVMVERvY2sgaXMgcHJvdmlkZWQgYnkgQHJlcXVpcmVcdTIwMTlkIGx0LXVpLWRvY2suanNcbiAgICAgICAgY29uc3QgZG9jayA9IGF3YWl0IHdpbmRvdy5lbnN1cmVMVERvY2s/LigpO1xuICAgICAgICBkb2NrPy5yZWdpc3Rlcih7XG4gICAgICAgICAgICBpZDogJ3F0MzUtYXR0YWNobWVudHMnLFxuICAgICAgICAgICAgbGFiZWw6ICdBdHRhY2htZW50cycsXG4gICAgICAgICAgICB0aXRsZTogJ09wZW4gUVQzNSBBdHRhY2htZW50cycsXG4gICAgICAgICAgICB3ZWlnaHQ6IDEyMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IG9wZW5BdHRhY2htZW50c01vZGFsKClcbiAgICAgICAgfSk7XG4gICAgfSkoKTtcblxuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCEod2luZG93LlRNVXRpbHMgJiYgd2luZG93LlRNVXRpbHMubWF0Y2hSb3V0ZSAmJiB3aW5kb3cuVE1VdGlscy5tYXRjaFJvdXRlKFJPVVRFUykpKSByZXR1cm47XG5cbiAgICBjb25zdCBDRkcgPSB7XG4gICAgICAgIEFDVElPTlNfVUxfU0VMOiAnLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zIC5wbGV4LWFjdGlvbnMtd3JhcHBlciB1bC5wbGV4LWFjdGlvbnMnLFxuICAgICAgICBNT0RBTF9USVRMRTogJ1F1b3RlIFBhcnQgRGV0YWlsJyxcbiAgICAgICAgTk9URV9TRUw6ICd0ZXh0YXJlYVtuYW1lPVwiTm90ZU5ld1wiXScsXG4gICAgICAgIERTX1NUT0NLOiAxNzIsXG4gICAgICAgIEFDVElPTl9CQVJfU0VMOiAnI1F1b3RlV2l6YXJkU2hhcmVkQWN0aW9uQmFyJyxcbiAgICAgICAgR1JJRF9TRUw6ICcucGxleC1ncmlkJyxcbiAgICAgICAgUE9MTF9NUzogMjAwLFxuICAgICAgICBUSU1FT1VUX01TOiAxMl8wMDAsXG4gICAgICAgIFRPQVNUX01TOiAzNTAwLFxuICAgICAgICBTRVRUSU5HU19LRVk6ICdxdDIwX3NldHRpbmdzX3YyJyxcbiAgICAgICAgREVGQVVMVFM6IHsgaW5jbHVkZUJyZWFrZG93bjogdHJ1ZSwgaW5jbHVkZVRpbWVzdGFtcDogdHJ1ZSB9XG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0ICh3aW5kb3cuVE1VdGlscz8ud2FpdEZvck1vZGVsQXN5bmMoYW5jaG9yLCB7IHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZSB9KSA/PyB7IHZpZXdNb2RlbDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHZpZXdNb2RlbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRRdW90ZUtleURldGVybWluaXN0aWMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBncmlkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihDRkcuR1JJRF9TRUwpO1xuICAgICAgICAgICAgaWYgKGdyaWQgJiYgS08/LmRhdGFGb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkVk0gPSBLTy5kYXRhRm9yKGdyaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhdzAgPSBBcnJheS5pc0FycmF5KGdyaWRWTT8uZGF0YXNvdXJjZT8ucmF3KSA/IGdyaWRWTS5kYXRhc291cmNlLnJhd1swXSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHJhdzAgPyB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/LihyYXcwLCAnUXVvdGVLZXknKSA6IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gcm9vdEVsID8gS08/LmRhdGFGb3I/Lihyb290RWwpIDogbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHYgPSByb290Vk0gJiYgKHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlS2V5JykgfHwgd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocm9vdFZNLCAnUXVvdGUuUXVvdGVLZXknKSk7XG4gICAgICAgICAgICBpZiAodiAhPSBudWxsKSByZXR1cm4gTnVtYmVyKHYpO1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICBjb25zdCBtID0gL1s/Jl1RdW90ZUtleT0oXFxkKykvaS5leGVjKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICAgIHJldHVybiBtID8gTnVtYmVyKG1bMV0pIDogbnVsbDtcbiAgICB9XG5cbiAgICAvLyA9PT09PSA0MTkgcmUtYXV0aCB3cmFwcGVyXG4gICAgYXN5bmMgZnVuY3Rpb24gd2l0aEZyZXNoQXV0aChydW4pIHtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIGF3YWl0IHJ1bigpOyB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnN0IHMgPSBlcnI/LnN0YXR1cyB8fCAoKC8oXFxiXFxkezN9XFxiKS8uZXhlYyhlcnI/Lm1lc3NhZ2UgfHwgJycpIHx8IFtdKVsxXSk7XG4gICAgICAgICAgICBpZiAoK3MgPT09IDQxOSkge1xuICAgICAgICAgICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5sdD8uY29yZT8uYXV0aD8uZ2V0S2V5Py4oKTsgfSBjYXRjaCB7IHRyeSB7IGF3YWl0IHdpbmRvdy5UTVV0aWxzPy5nZXRBcGlLZXk/Lih7IGZvcmNlOiB0cnVlIH0pOyB9IGNhdGNoIHsgfSB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU2V0dGluZ3MgKEdNKVxuICAgIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBHTV9nZXRWYWx1ZShDRkcuU0VUVElOR1NfS0VZLCBDRkcuREVGQVVMVFMpO1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHsgLi4uQ0ZHLkRFRkFVTFRTLCAuLi5KU09OLnBhcnNlKHYpIH0gOiB7IC4uLkNGRy5ERUZBVUxUUywgLi4udiB9O1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHsgLi4uQ0ZHLkRFRkFVTFRTIH07IH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2F2ZVNldHRpbmdzKG5leHQpIHtcbiAgICAgICAgdHJ5IHsgR01fc2V0VmFsdWUoQ0ZHLlNFVFRJTkdTX0tFWSwgbmV4dCk7IH1cbiAgICAgICAgY2F0Y2ggeyBHTV9zZXRWYWx1ZShDRkcuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH1cbiAgICB9XG5cbiAgICAvLyA9PT09PSBTdG9jayBoZWxwZXJzXG4gICAgZnVuY3Rpb24gc3BsaXRCYXNlQW5kUGFjayhwYXJ0Tm8pIHtcbiAgICAgICAgY29uc3QgcyA9IFN0cmluZyhwYXJ0Tm8gfHwgJycpLnRyaW0oKTtcbiAgICAgICAgY29uc3QgbSA9IHMubWF0Y2goL14oLio/KS0oXFxkKylcXHMqKEJBR3xCT1h8UEFDS3xQS0cpJC9pKTtcbiAgICAgICAgaWYgKG0pIHJldHVybiB7IGJhc2U6IG1bMV0sIHBhY2tTaXplOiBOdW1iZXIobVsyXSksIHBhY2tVbml0OiBtWzNdLnRvVXBwZXJDYXNlKCkgfTtcbiAgICAgICAgcmV0dXJuIHsgYmFzZTogcywgcGFja1NpemU6IG51bGwsIHBhY2tVbml0OiBudWxsIH07XG4gICAgfVxuICAgIGZ1bmN0aW9uIHRvQmFzZVBhcnQocGFydE5vKSB7IHJldHVybiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykuYmFzZTsgfVxuICAgIGZ1bmN0aW9uIG5vcm1hbGl6ZVJvd1RvUGllY2VzKHJvdywgdGFyZ2V0QmFzZSkge1xuICAgICAgICBjb25zdCByb3dQYXJ0ID0gU3RyaW5nKHJvdz8uUGFydF9ObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCB7IGJhc2UsIHBhY2tTaXplIH0gPSBzcGxpdEJhc2VBbmRQYWNrKHJvd1BhcnQpO1xuICAgICAgICBpZiAoIWJhc2UgfHwgYmFzZSAhPT0gdGFyZ2V0QmFzZSkgcmV0dXJuIDA7XG4gICAgICAgIGNvbnN0IHVuaXQgPSBTdHJpbmcocm93Py5Vbml0IHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBxdHkgPSBOdW1iZXIocm93Py5RdWFudGl0eSkgfHwgMDtcbiAgICAgICAgaWYgKHVuaXQgPT09ICcnIHx8IHVuaXQgPT09ICdwY3MnIHx8IHVuaXQgPT09ICdwaWVjZScgfHwgdW5pdCA9PT0gJ3BpZWNlcycpIHJldHVybiBxdHk7XG4gICAgICAgIGlmIChwYWNrU2l6ZSkgcmV0dXJuIHF0eSAqIHBhY2tTaXplO1xuICAgICAgICByZXR1cm4gcXR5O1xuICAgIH1cbiAgICBmdW5jdGlvbiBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQocm93cywgdGFyZ2V0QmFzZSkge1xuICAgICAgICBjb25zdCBieUxvYyA9IG5ldyBNYXAoKTsgbGV0IHRvdGFsID0gMDtcbiAgICAgICAgZm9yIChjb25zdCByIG9mIChyb3dzIHx8IFtdKSkge1xuICAgICAgICAgICAgY29uc3QgcGNzID0gbm9ybWFsaXplUm93VG9QaWVjZXMociwgdGFyZ2V0QmFzZSk7XG4gICAgICAgICAgICBpZiAoIXBjcykgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBsb2MgPSBTdHJpbmcocj8uTG9jYXRpb24gfHwgcj8uV2FyZWhvdXNlIHx8IHI/LlNpdGUgfHwgJ1VOSycpLnRyaW0oKTtcbiAgICAgICAgICAgIHRvdGFsICs9IHBjcztcbiAgICAgICAgICAgIGJ5TG9jLnNldChsb2MsIChieUxvYy5nZXQobG9jKSB8fCAwKSArIHBjcyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYnJlYWtkb3duID0gWy4uLmJ5TG9jXS5tYXAoKFtsb2MsIHF0eV0pID0+ICh7IGxvYywgcXR5IH0pKS5zb3J0KChhLCBiKSA9PiBiLnF0eSAtIGEucXR5KTtcbiAgICAgICAgcmV0dXJuIHsgc3VtOiB0b3RhbCwgYnJlYWtkb3duIH07XG4gICAgfVxuICAgIGNvbnN0IGZvcm1hdEludCA9IChuKSA9PiBOdW1iZXIobikudG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDAgfSk7XG4gICAgZnVuY3Rpb24gZm9ybWF0VGltZXN0YW1wKGQpIHtcbiAgICAgICAgY29uc3QgcGFkID0geCA9PiBTdHJpbmcoeCkucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgcmV0dXJuIGAke2QuZ2V0RnVsbFllYXIoKX0tJHtwYWQoZC5nZXRNb250aCgpICsgMSl9LSR7cGFkKGQuZ2V0RGF0ZSgpKX0gJHtwYWQoZC5nZXRIb3VycygpKX06JHtwYWQoZC5nZXRNaW51dGVzKCkpfWA7XG4gICAgfVxuXG5cbiAgICAvLyA9PT09PSBDbGljayBoYW5kbGVyIChubyByZXBvIHdyaXRlcylcbiAgICBhc3luYyBmdW5jdGlvbiBoYW5kbGVDbGljayhidG4sIG1vZGFsRWwpIHtcbiAgICAgICAgYnRuLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7IGJ0bi5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgIGNvbnN0IHJlc3RvcmUgPSAoKSA9PiB7IGJ0bi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJyc7IGJ0bi5zdHlsZS5vcGFjaXR5ID0gJyc7IH07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIFRNVXRpbHMudG9hc3QoJ1x1MjNGMyBGZXRjaGluZyBzdG9jayBsZXZlbHNcdTIwMjYnLCAnaW5mbycsIDUwMDApO1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgKHVzZWQgZm9yIGxvZ2dpbmcgb25seSBub3cpXG4gICAgICAgICAgICBjb25zdCBxayA9IGdldFF1b3RlS2V5RGV0ZXJtaW5pc3RpYygpO1xuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlIEtleSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBLTyBOb3RlIGZpZWxkIHdpdGhpbiB0aGUgc2FtZSBtb2RhbFxuICAgICAgICAgICAgY29uc3QgdGEgPSBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5OT1RFX1NFTCk7XG4gICAgICAgICAgICBpZiAoIXRhKSB0aHJvdyBuZXcgRXJyb3IoJ05vdGVOZXcgdGV4dGFyZWEgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eEtPID0gS08/LmNvbnRleHRGb3I/Lih0YSk7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eEtPPy4kcm9vdD8uZGF0YTtcbiAgICAgICAgICAgIGlmICghdm0pIHRocm93IG5ldyBFcnJvcignS25vY2tvdXQgY29udGV4dCBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVhZCBwYXJ0IGFuZCBub3JtYWxpemUgdG8gYmFzZVxuICAgICAgICAgICAgY29uc3QgcGFydE5vID0gcmVhZFBhcnRGcm9tVk0odm0pO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm8pIHRocm93IG5ldyBFcnJvcignUGFydE5vIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VQYXJ0ID0gdG9CYXNlUGFydChwYXJ0Tm8pO1xuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0sIGJyZWFrZG93biB9ID0gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MgfHwgW10sIGJhc2VQYXJ0KTtcblxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBbYFNUSzogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYF07XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlQnJlYWtkb3duICYmIGJyZWFrZG93bi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiayA9IGJyZWFrZG93bi5tYXAoKHsgbG9jLCBxdHkgfSkgPT4gYCR7bG9jfSAke2Zvcm1hdEludChxdHkpfWApLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgKCR7Ymt9KWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFMuaW5jbHVkZVRpbWVzdGFtcCkgcGFydHMucHVzaChgQCR7Zm9ybWF0VGltZXN0YW1wKG5ldyBEYXRlKCkpfWApO1xuICAgICAgICAgICAgY29uc3Qgc3RhbXAgPSBwYXJ0cy5qb2luKCcgJyk7XG5cbiAgICAgICAgICAgIC8vIEFwcGVuZCB0byBOb3RlTmV3IChjbGVhbiBwcmV2aW91cyBzdGFtcCBpZiBwcmVzZW50KVxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuZWQgPSBiYXNlTm90ZS5yZXBsYWNlKFxuICAgICAgICAgICAgICAgIC8oPzpefFxccylTVEs6XFxzKltcXGQsXSsoPzpcXHMqcGNzKT8oPzpcXHMqXFwoW14pXSpcXCkpPyg/OlxccypAWzAtOTpcXC1cXC9cXHNdKyk/L2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IG5ld05vdGUgPSBjbGVhbmVkID8gYCR7Y2xlYW5lZH0gJHtzdGFtcH1gIDogc3RhbXA7XG4gICAgICAgICAgICBjb25zdCBzZXRPayA9IHdpbmRvdy5UTVV0aWxzPy5zZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIG5ld05vdGUpO1xuICAgICAgICAgICAgaWYgKCFzZXRPayAmJiB0YSkgeyB0YS52YWx1ZSA9IG5ld05vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IH1cblxuICAgICAgICAgICAgVE1VdGlscy50b2FzdChgXHUyNzA1ICR7c3RhbXB9YCwgJ3N1Y2Nlc3MnLCBDRkcuVE9BU1RfTVMpO1xuICAgICAgICAgICAgZGxvZygnUVQyMCBzdWNjZXNzJywgeyBxaywgcGFydE5vLCBiYXNlUGFydCwgc3VtLCBicmVha2Rvd24gfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBUTVV0aWxzLnRvYXN0KGBcdTI3NEMgJHtlcnIubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgODAwMCk7XG4gICAgICAgICAgICBkZXJyKCdoYW5kbGVDbGljazonLCBlcnIpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgcmVzdG9yZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVhZFBhcnRGcm9tVk0odm0pIHtcbiAgICAgICAgY29uc3Qga2V5cyA9IFsnUGFydE5vJywgJ0l0ZW1ObycsICdQYXJ0X051bWJlcicsICdJdGVtX051bWJlcicsICdQYXJ0JywgJ0l0ZW0nXTtcbiAgICAgICAgZm9yIChjb25zdCBrIG9mIGtleXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bSwgaywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGlmICh2KSByZXR1cm4gdjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgLy8gPT09PT0gTW9kYWwgd2lyaW5nIChpZGVtcG90ZW50IHBlciBtb2RhbClcbiAgICBmdW5jdGlvbiBvbk5vZGVSZW1vdmVkKG5vZGUsIGNiKSB7XG4gICAgICAgIGlmICghbm9kZSB8fCAhbm9kZS5vd25lckRvY3VtZW50KSByZXR1cm4gKCkgPT4geyB9O1xuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBtIG9mIG11dHMpIGZvciAoY29uc3QgbiBvZiBtLnJlbW92ZWROb2RlcyB8fCBbXSkge1xuICAgICAgICAgICAgICAgIGlmIChuID09PSBub2RlIHx8IChuLmNvbnRhaW5zICYmIG4uY29udGFpbnMobm9kZSkpKSB7IHRyeSB7IGNiKCk7IH0gZmluYWxseSB7IG1vLmRpc2Nvbm5lY3QoKTsgfSByZXR1cm47IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG1vLm9ic2VydmUobm9kZS5vd25lckRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICByZXR1cm4gKCkgPT4gbW8uZGlzY29ubmVjdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluamVjdFN0b2NrQ29udHJvbHModWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1vZGFsID0gdWwuY2xvc2VzdCgnLnBsZXgtZGlhbG9nJyk7XG4gICAgICAgICAgICBjb25zdCB0aXRsZSA9IG1vZGFsPy5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctdGl0bGUnKT8udGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IGxvb2tzUmlnaHQgPSB0aXRsZSA9PT0gQ0ZHLk1PREFMX1RJVExFIHx8IG1vZGFsPy5xdWVyeVNlbGVjdG9yKENGRy5OT1RFX1NFTCk7XG4gICAgICAgICAgICBpZiAoIWxvb2tzUmlnaHQpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKHVsLmRhdGFzZXQucXQyMEluamVjdGVkKSByZXR1cm47XG4gICAgICAgICAgICB1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCA9ICcxJztcbiAgICAgICAgICAgIGRsb2coJ2luamVjdGluZyBjb250cm9scycpO1xuXG4gICAgICAgICAgICAvLyBNYWluIGFjdGlvblxuICAgICAgICAgICAgY29uc3QgbGlNYWluID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgICAgIGJ0bi5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAnTFQgR2V0IFN0b2NrIExldmVscyc7XG4gICAgICAgICAgICBidG4udGl0bGUgPSAnQXBwZW5kIG5vcm1hbGl6ZWQgc3RvY2sgc3VtbWFyeSB0byBOb3RlJztcbiAgICAgICAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnR2V0IHN0b2NrIGxldmVscycpO1xuICAgICAgICAgICAgYnRuLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oYnRuLnN0eWxlLCB7IGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAnZmlsdGVyIC4xNXMsIHRleHQtZGVjb3JhdGlvbi1jb2xvciAuMTVzJyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBidG4uc3R5bGUudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJzsgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgYnRuLnN0eWxlLmZpbHRlciA9ICcnOyBidG4uc3R5bGUudGV4dERlY29yYXRpb24gPSAnJzsgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignZm9jdXMnLCAoKSA9PiB7IGJ0bi5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjNGE5MGUyJzsgYnRuLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnMnB4JzsgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnJzsgYnRuLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJzsgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBoYW5kbGVDbGljayhidG4sIG1vZGFsKSk7XG4gICAgICAgICAgICBsaU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cbiAgICAgICAgICAgIC8vIFNldHRpbmdzIGdlYXJcbiAgICAgICAgICAgIGNvbnN0IGxpR2VhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBjb25zdCBnZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgZ2Vhci5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBnZWFyLnRleHRDb250ZW50ID0gJ1x1MjY5OVx1RkUwRic7XG4gICAgICAgICAgICBnZWFyLnRpdGxlID0gJ1FUMjAgU2V0dGluZ3MgKGJyZWFrZG93biAvIHRpbWVzdGFtcCknO1xuICAgICAgICAgICAgZ2Vhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnUVQyMCBTZXR0aW5ncycpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihnZWFyLnN0eWxlLCB7IG1hcmdpbkxlZnQ6ICc4cHgnLCBmb250U2l6ZTogJzE2cHgnLCBsaW5lSGVpZ2h0OiAnMScsIGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAndHJhbnNmb3JtIC4xNXMsIGZpbHRlciAuMTVzJyB9KTtcblxuICAgICAgICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdxdDIwLXNldHRpbmdzJztcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnNDBweCcsIHJpZ2h0OiAnMTZweCcsXG4gICAgICAgICAgICAgICAgbWluV2lkdGg6ICcyMjBweCcsIHBhZGRpbmc6ICcxMHB4IDEycHgnLFxuICAgICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCAjY2NjJywgYm9yZGVyUmFkaXVzOiAnOHB4JyxcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2ZmZicsIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwwLjE1KScsXG4gICAgICAgICAgICAgICAgekluZGV4OiAnOTk5OScsIGRpc3BsYXk6ICdub25lJ1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IFMwID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDo2MDA7IG1hcmdpbi1ib3R0b206OHB4O1wiPlFUMjAgU2V0dGluZ3M8L2Rpdj5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLWJyZWFrZG93blwiICR7UzAuaW5jbHVkZUJyZWFrZG93biA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIGJyZWFrZG93bjwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLXRpbWVzdGFtcFwiICR7UzAuaW5jbHVkZVRpbWVzdGFtcCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIHRpbWVzdGFtcDwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweDsgZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQ7XCI+XG4gICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgaWQ9XCJxdDIwLWNsb3NlXCIgc3R5bGU9XCJwYWRkaW5nOjRweCA4cHg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICBgO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvcGVuUGFuZWwoKSB7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBjbG9zZVBhbmVsKCkgeyBwYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBvdXRzaWRlQ2xvc2UoZSkgeyBpZiAoIXBhbmVsLmNvbnRhaW5zKGUudGFyZ2V0KSAmJiBlLnRhcmdldCAhPT0gZ2VhcikgY2xvc2VQYW5lbCgpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBlc2NDbG9zZShlKSB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIGNsb3NlUGFuZWwoKTsgfVxuXG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBwYW5lbC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyBvcGVuUGFuZWwoKSA6IGNsb3NlUGFuZWwoKTsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBnZWFyLnN0eWxlLnRyYW5zZm9ybSA9ICdyb3RhdGUoMTVkZWcpJzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJyc7IGdlYXIuc3R5bGUudHJhbnNmb3JtID0gJyc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgZ2Vhci5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjNGE5MGUyJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBnZWFyLnN0eWxlLm91dGxpbmUgPSAnJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuXG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsb3NlUGFuZWwpO1xuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtYnJlYWtkb3duJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1ciA9IGxvYWRTZXR0aW5ncygpOyBzYXZlU2V0dGluZ3MoeyAuLi5jdXIsIGluY2x1ZGVCcmVha2Rvd246ICEhZXYudGFyZ2V0LmNoZWNrZWQgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLXRpbWVzdGFtcCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXIgPSBsb2FkU2V0dGluZ3MoKTsgc2F2ZVNldHRpbmdzKHsgLi4uY3VyLCBpbmNsdWRlVGltZXN0YW1wOiAhIWV2LnRhcmdldC5jaGVja2VkIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxpR2Vhci5hcHBlbmRDaGlsZChnZWFyKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpR2Vhcik7XG4gICAgICAgICAgICAobW9kYWwucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWNvbnRlbnQnKSB8fCBtb2RhbCkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuXG4gICAgICAgICAgICAvLyBMZXQgb3RoZXIgbW9kdWxlcyByZWZyZXNoIGlmIHRoZXkgY2FyZSAobm8tb3AgaGVyZSlcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBXID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgQ0UgPSAoVyAmJiAoJ0N1c3RvbUV2ZW50JyBpbiBXKSA/IFcuQ3VzdG9tRXZlbnQgOiBnbG9iYWxUaGlzLkN1c3RvbUV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoVyAmJiBXLmRpc3BhdGNoRXZlbnQgJiYgQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuZGlzcGF0Y2hFdmVudChuZXcgQ0UoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgeyBkZXRhaWw6IHsgc291cmNlOiAnUVQyMCcsIHRzOiBEYXRlLm5vdygpIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRlcnIoJ2luamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vID09PT09IEJvb3QgLyBTUEEgd2lyaW5nXG4gICAgbGV0IHN0b3BPYnNlcnZlID0gbnVsbDtcbiAgICBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0TW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgc3RvcE9ic2VydmU/LigpO1xuICAgICAgICBzdG9wT2JzZXJ2ZSA9IHdpbmRvdy5UTVV0aWxzPy5vYnNlcnZlSW5zZXJ0TWFueT8uKENGRy5BQ1RJT05TX1VMX1NFTCwgaW5qZWN0U3RvY2tDb250cm9scyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcE1vZGFsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIHRyeSB7IHN0b3BPYnNlcnZlPy4oKTsgfSBjYXRjaCB7IH0gZmluYWxseSB7IHN0b3BPYnNlcnZlID0gbnVsbDsgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgYXdhaXQgcmFmKCk7XG4gICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgIHN0YXJ0TW9kYWxPYnNlcnZlcigpO1xuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgc3RvcE1vZGFsT2JzZXJ2ZXIoKTtcbiAgICB9XG5cbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKHdpbmRvdy5UTVV0aWxzPy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xuICAgIGluaXQoKTtcblxuICAgIC8vIERldiBzZWFtIChvcHRpb25hbClcbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMjBfXyA9IHsgaW5qZWN0U3RvY2tDb250cm9scywgaGFuZGxlQ2xpY2ssIHNwbGl0QmFzZUFuZFBhY2ssIHRvQmFzZVBhcnQsIG5vcm1hbGl6ZVJvd1RvUGllY2VzLCBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLE1BQU0sTUFBTyxPQUF3QyxPQUFnQjtBQUVyRSxHQUFDLE1BQU07QUFDSDtBQUdBLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUksUUFBUSxPQUFLLHNCQUFzQixDQUFDLENBQUM7QUFFM0QsS0FBQyxZQUFZO0FBRVQsWUFBTSxPQUFPLE1BQU0sT0FBTyxlQUFlO0FBQ3pDLFlBQU0sU0FBUztBQUFBLFFBQ1gsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsU0FBUyxNQUFNLHFCQUFxQjtBQUFBLE1BQ3hDLENBQUM7QUFBQSxJQUNMLEdBQUc7QUFJSCxVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxFQUFFLE9BQU8sV0FBVyxPQUFPLFFBQVEsY0FBYyxPQUFPLFFBQVEsV0FBVyxNQUFNLEdBQUk7QUFFekYsVUFBTSxNQUFNO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixhQUFhO0FBQUEsTUFDYixVQUFVO0FBQUEsTUFDVixVQUFVO0FBQUEsTUFDVixnQkFBZ0I7QUFBQSxNQUNoQixVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWixVQUFVO0FB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
