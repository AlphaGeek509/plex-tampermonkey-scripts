// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.11
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.11-1758584936413
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.11-1758584936413
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.11-1758584936413
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.11-1758584936413
// @require      http://localhost:5000/lt-core.user.js?v=3.8.11-1758584936413
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
// @updateURL   http://localhost:5000/qt20.user.js
// @downloadURL http://localhost:5000/qt20.user.js
// ==/UserScript==

(() => {
  // src/quote-tracking/qt20-partStockLevelGet/qt20.index.js
  var DEV = true ? true : /localhost|127\.0\.0\.1|^test\./i.test(location.hostname);
  (() => {
    "use strict";
    const dlog = (...a) => DEV && console.debug("QT20", ...a);
    const derr = (...a) => console.error("QT20 \u2716\uFE0F", ...a);
    const KO = typeof unsafeWindow !== "undefined" ? unsafeWindow.ko : window.ko;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    if (!("__LT_HUB_MOUNT" in window) || !window.__LT_HUB_MOUNT) window.__LT_HUB_MOUNT = "nav";
    (async () => {
      try {
        await window.ensureLTHub?.({ mount: window.__LT_HUB_MOUNT });
      } catch {
      }
    })();
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!ROUTES.some((rx) => rx.test(location.pathname))) return;
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
      if (window.TMUtils?.waitForModelAsync) {
        const { viewModel } = await window.TMUtils.waitForModelAsync(anchor, {
          pollMs: CFG.POLL_MS,
          timeoutMs: CFG.TIMEOUT_MS,
          requireKo: true
        }) ?? { viewModel: null };
        if (viewModel) return viewModel;
      }
      const rootEl = document.querySelector(".plex-wizard, .plex-page");
      return rootEl && (KO?.dataFor?.(rootEl) || null);
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
        const raw = GM_getValue(CFG.SETTINGS_KEY, null);
        if (!raw) return { ...CFG.DEFAULTS };
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        return { ...CFG.DEFAULTS, ...obj };
      } catch {
        return { ...CFG.DEFAULTS };
      }
    }
    function saveSettings(next) {
      try {
        GM_setValue(CFG.SETTINGS_KEY, JSON.stringify(next));
      } catch {
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
    async function handleClick(modalEl) {
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
          /(?:^|\s)STK:\s*\d[\d,]*(?:\s*pcs)?(?:\s*\([^()]*\))?(?:\s*@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?/gi,
          ""
        ).trim();
        const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
        const setOk = window.TMUtils?.setObsValue?.(vm, "NoteNew", newNote);
        if (!setOk && ta) {
          ta.value = newNote;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
        task.success("Stock updated", 1500);
        lt.core.hub.notify("Stock results copied to Note", "success", { ms: 2500, toast: true });
        dlog("QT20 success", { qk, partNo, basePart, sum, breakdown });
      } catch (err) {
        task.error("Failed");
        lt.core.hub.notify(`Stock check failed: ${err?.message || err}`, "error", { ms: 4e3, toast: true });
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
        btn.addEventListener("click", () => handleClick(modal));
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(modal);
          }
        });
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
    function getActiveModalRoot() {
      return document.querySelector(".plex-dialog-has-buttons") || document.querySelector(".plex-dialog");
    }
    async function ensureHubButton() {
      try {
        await window.ensureLTHub?.();
      } catch {
      }
      const hub = lt?.core?.hub;
      if (!hub || !hub.registerButton) return;
      if (hub.has?.(HUB_BTN_ID)) return;
      hub.registerButton({
        id: HUB_BTN_ID,
        label: "Stock",
        title: "Fetch stock for current part",
        section: "left",
        weight: 110,
        onClick: () => handleClick(getActiveModalRoot())
      });
    }
    function removeHubButton() {
      const hub = lt?.core?.hub;
      hub?.remove?.(HUB_BTN_ID);
    }
    function debounce(fn, ms = 50) {
      let id = null;
      return (...args) => {
        clearTimeout(id);
        id = setTimeout(() => fn(...args), ms);
      };
    }
    const reconcileHubButtonVisibility = debounce(async () => {
      if (isTargetModalOpen()) {
        await ensureHubButton();
      } else {
        removeHubButton();
      }
    }, 50);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICBOT1RFX1NFTDogJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwLFxuICAgICAgICBTRVRUSU5HU19LRVk6ICdxdDIwX3NldHRpbmdzX3YyJyxcbiAgICAgICAgREVGQVVMVFM6IHsgaW5jbHVkZUJyZWFrZG93bjogdHJ1ZSwgaW5jbHVkZVRpbWVzdGFtcDogdHJ1ZSB9XG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKTtcbiAgICAgICAgICAgIGlmIChncmlkICYmIEtPPy5kYXRhRm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZFZNID0gS08uZGF0YUZvcihncmlkKTtcbiAgICAgICAgICAgICAgICBjb25zdCByYXcwID0gQXJyYXkuaXNBcnJheShncmlkVk0/LmRhdGFzb3VyY2U/LnJhdykgPyBncmlkVk0uZGF0YXNvdXJjZS5yYXdbMF0gOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSByYXcwID8gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4ocmF3MCwgJ1F1b3RlS2V5JykgOiBudWxsO1xuICAgICAgICAgICAgICAgIGlmICh2ICE9IG51bGwpIHJldHVybiBOdW1iZXIodik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByb290RWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC13aXphcmQsIC5wbGV4LXBhZ2UnKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RWTSA9IHJvb3RFbCA/IEtPPy5kYXRhRm9yPy4ocm9vdEVsKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2ID0gcm9vdFZNICYmICh3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lihyb290Vk0sICdRdW90ZUtleScpIHx8IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHJvb3RWTSwgJ1F1b3RlLlF1b3RlS2V5JykpO1xuICAgICAgICAgICAgaWYgKHYgIT0gbnVsbCkgcmV0dXJuIE51bWJlcih2KTtcbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICByZXR1cm4gbSA/IE51bWJlcihtWzFdKSA6IG51bGw7XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuXG4gICAgLy8gPT09PT0gU2V0dGluZ3MgKEdNKVxuICAgIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IEdNX2dldFZhbHVlKENGRy5TRVRUSU5HU19LRVksIG51bGwpO1xuICAgICAgICAgICAgaWYgKCFyYXcpIHJldHVybiB7IC4uLkNGRy5ERUZBVUxUUyB9O1xuICAgICAgICAgICAgY29uc3Qgb2JqID0gKHR5cGVvZiByYXcgPT09ICdzdHJpbmcnKSA/IEpTT04ucGFyc2UocmF3KSA6IHJhdztcbiAgICAgICAgICAgIHJldHVybiB7IC4uLkNGRy5ERUZBVUxUUywgLi4ub2JqIH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DRkcuREVGQVVMVFMgfTsgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzYXZlU2V0dGluZ3MobmV4dCkge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDRkcuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH0gY2F0Y2ggeyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU3RvY2sgaGVscGVyc1xuICAgIGZ1bmN0aW9uIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKSB7XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcocGFydE5vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IG0gPSBzLm1hdGNoKC9eKC4qPyktKFxcZCspXFxzKihCQUd8Qk9YfFBBQ0t8UEtHKSQvaSk7XG4gICAgICAgIGlmIChtKSByZXR1cm4geyBiYXNlOiBtWzFdLCBwYWNrU2l6ZTogTnVtYmVyKG1bMl0pLCBwYWNrVW5pdDogbVszXS50b1VwcGVyQ2FzZSgpIH07XG4gICAgICAgIHJldHVybiB7IGJhc2U6IHMsIHBhY2tTaXplOiBudWxsLCBwYWNrVW5pdDogbnVsbCB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0Jhc2VQYXJ0KHBhcnRObykgeyByZXR1cm4gc3BsaXRCYXNlQW5kUGFjayhwYXJ0Tm8pLmJhc2U7IH1cbiAgICBmdW5jdGlvbiBub3JtYWxpemVSb3dUb1BpZWNlcyhyb3csIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3Qgcm93UGFydCA9IFN0cmluZyhyb3c/LlBhcnRfTm8gfHwgJycpLnRyaW0oKTtcbiAgICAgICAgY29uc3QgeyBiYXNlLCBwYWNrU2l6ZSB9ID0gc3BsaXRCYXNlQW5kUGFjayhyb3dQYXJ0KTtcbiAgICAgICAgaWYgKCFiYXNlIHx8IGJhc2UgIT09IHRhcmdldEJhc2UpIHJldHVybiAwO1xuICAgICAgICBjb25zdCB1bml0ID0gU3RyaW5nKHJvdz8uVW5pdCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcXR5ID0gTnVtYmVyKHJvdz8uUXVhbnRpdHkpIHx8IDA7XG4gICAgICAgIGlmICh1bml0ID09PSAnJyB8fCB1bml0ID09PSAncGNzJyB8fCB1bml0ID09PSAncGllY2UnIHx8IHVuaXQgPT09ICdwaWVjZXMnKSByZXR1cm4gcXR5O1xuICAgICAgICBpZiAocGFja1NpemUpIHJldHVybiBxdHkgKiBwYWNrU2l6ZTtcbiAgICAgICAgcmV0dXJuIHF0eTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MsIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3QgYnlMb2MgPSBuZXcgTWFwKCk7IGxldCB0b3RhbCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiAocm93cyB8fCBbXSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHBjcyA9IG5vcm1hbGl6ZVJvd1RvUGllY2VzKHIsIHRhcmdldEJhc2UpO1xuICAgICAgICAgICAgaWYgKCFwY3MpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgbG9jID0gU3RyaW5nKHI/LkxvY2F0aW9uIHx8IHI/LldhcmVob3VzZSB8fCByPy5TaXRlIHx8ICdVTksnKS50cmltKCk7XG4gICAgICAgICAgICB0b3RhbCArPSBwY3M7XG4gICAgICAgICAgICBieUxvYy5zZXQobG9jLCAoYnlMb2MuZ2V0KGxvYykgfHwgMCkgKyBwY3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJyZWFrZG93biA9IFsuLi5ieUxvY10ubWFwKChbbG9jLCBxdHldKSA9PiAoeyBsb2MsIHF0eSB9KSkuc29ydCgoYSwgYikgPT4gYi5xdHkgLSBhLnF0eSk7XG4gICAgICAgIHJldHVybiB7IHN1bTogdG90YWwsIGJyZWFrZG93biB9O1xuICAgIH1cbiAgICBjb25zdCBmb3JtYXRJbnQgPSAobikgPT4gTnVtYmVyKG4pLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuICAgIGZ1bmN0aW9uIGZvcm1hdFRpbWVzdGFtcChkKSB7XG4gICAgICAgIGNvbnN0IHBhZCA9IHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIHJldHVybiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7cGFkKGQuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChkLmdldERhdGUoKSl9ICR7cGFkKGQuZ2V0SG91cnMoKSl9OiR7cGFkKGQuZ2V0TWludXRlcygpKX1gO1xuICAgIH1cblxuXG4gICAgLy8gPT09PT0gQ2xpY2sgaGFuZGxlciAobm8gcmVwbyB3cml0ZXMpXG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ2xpY2sobW9kYWxFbCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKCdGZXRjaGluZyBzdG9ja1x1MjAyNicsICdpbmZvJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIFF1b3RlIEtleSAodXNlZCBmb3IgbG9nZ2luZyBvbmx5IG5vdylcbiAgICAgICAgICAgIGNvbnN0IHFrID0gZ2V0UXVvdGVLZXlEZXRlcm1pbmlzdGljKCk7XG4gICAgICAgICAgICBpZiAoIXFrIHx8ICFOdW1iZXIuaXNGaW5pdGUocWspIHx8IHFrIDw9IDApIHRocm93IG5ldyBFcnJvcignUXVvdGUgS2V5IG5vdCBmb3VuZCcpO1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIEtPIE5vdGUgZmllbGQgd2l0aGluIHRoZSBzYW1lIG1vZGFsXG4gICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWwucXVlcnlTZWxlY3RvcihDRkcuTk9URV9TRUwpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKTtcbiAgICAgICAgICAgIGlmICghdGEpIHRocm93IG5ldyBFcnJvcignTm90ZU5ldyB0ZXh0YXJlYSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgY29uc3QgY3R4S08gPSBLTz8uY29udGV4dEZvcj8uKHRhKTtcbiAgICAgICAgICAgIGNvbnN0IHZtID0gY3R4S08/LiRyb290Py5kYXRhO1xuICAgICAgICAgICAgaWYgKCF2bSkgdGhyb3cgbmV3IEVycm9yKCdLbm9ja291dCBjb250ZXh0IG5vdCBmb3VuZCcpO1xuXG4gICAgICAgICAgICAvLyBSZWFkIHBhcnQgYW5kIG5vcm1hbGl6ZSB0byBiYXNlXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSByZWFkUGFydEZyb21WTSh2bSk7XG4gICAgICAgICAgICBpZiAoIXBhcnRObykgdGhyb3cgbmV3IEVycm9yKCdQYXJ0Tm8gbm90IGF2YWlsYWJsZScpO1xuICAgICAgICAgICAgY29uc3QgYmFzZVBhcnQgPSB0b0Jhc2VQYXJ0KHBhcnRObyk7XG5cbiAgICAgICAgICAgIC8vIERTIGNhbGwgd2l0aCA0MTkgcmV0cnlcbiAgICAgICAgICAgIGNvbnN0IHBsZXggPSAodHlwZW9mIGdldFBsZXhGYWNhZGUgPT09ICdmdW5jdGlvbicpID8gYXdhaXQgZ2V0UGxleEZhY2FkZSgpIDogd2luZG93Lmx0Py5jb3JlPy5wbGV4ID8/IHdpbmRvdy5UTVV0aWxzO1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHdpdGhGcmVzaEF1dGgoKCkgPT5cbiAgICAgICAgICAgICAgICBwbGV4LmRzUm93cyhDRkcuRFNfU1RPQ0ssIHsgUGFydF9ObzogYmFzZVBhcnQsIFNoaXBwYWJsZTogJ1RSVUUnLCBDb250YWluZXJfU3RhdHVzOiAnT0snIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBjb25zdCB7IHN1bSwgYnJlYWtkb3duIH0gPSBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQocm93cyB8fCBbXSwgYmFzZVBhcnQpO1xuXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtgU1RLOiAke2Zvcm1hdEludChzdW0pfSBwY3NgXTtcbiAgICAgICAgICAgIGlmIChTLmluY2x1ZGVCcmVha2Rvd24gJiYgYnJlYWtkb3duLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJrID0gYnJlYWtkb3duLm1hcCgoeyBsb2MsIHF0eSB9KSA9PiBgJHtsb2N9ICR7Zm9ybWF0SW50KHF0eSl9YCkuam9pbignLCAnKTtcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGAoJHtia30pYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlVGltZXN0YW1wKSBwYXJ0cy5wdXNoKGBAJHtmb3JtYXRUaW1lc3RhbXAobmV3IERhdGUoKSl9YCk7XG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IHBhcnRzLmpvaW4oJyAnKTtcblxuICAgICAgICAgICAgLy8gQXBwZW5kIHRvIE5vdGVOZXcgKGNsZWFuIHByZXZpb3VzIHN0YW1wIGlmIHByZXNlbnQpXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sICdOb3RlTmV3JywgeyB0cmltOiB0cnVlIH0pIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgYmFzZU5vdGUgPSAoL14obnVsbHx1bmRlZmluZWQpJC9pLnRlc3QoY3VycmVudCkgPyAnJyA6IGN1cnJlbnQpO1xuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKVNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/L2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IG5ld05vdGUgPSBjbGVhbmVkID8gYCR7Y2xlYW5lZH0gJHtzdGFtcH1gIDogc3RhbXA7XG4gICAgICAgICAgICBjb25zdCBzZXRPayA9IHdpbmRvdy5UTVV0aWxzPy5zZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIG5ld05vdGUpO1xuICAgICAgICAgICAgaWYgKCFzZXRPayAmJiB0YSkgeyB0YS52YWx1ZSA9IG5ld05vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IH1cblxuICAgICAgICAgICAgdGFzay5zdWNjZXNzKCdTdG9jayB1cGRhdGVkJywgMTUwMCk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoJ1N0b2NrIHJlc3VsdHMgY29waWVkIHRvIE5vdGUnLCAnc3VjY2VzcycsIHsgbXM6IDI1MDAsIHRvYXN0OiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBkbG9nKCdRVDIwIHN1Y2Nlc3MnLCB7IHFrLCBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0sIGJyZWFrZG93biB9KTtcblxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHRhc2suZXJyb3IoJ0ZhaWxlZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jayBjaGVjayBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA0MDAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGVycignaGFuZGxlQ2xpY2s6JywgZXJyKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHJlc3RvcmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlYWRQYXJ0RnJvbVZNKHZtKSB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBbJ1BhcnRObycsICdJdGVtTm8nLCAnUGFydF9OdW1iZXInLCAnSXRlbV9OdW1iZXInLCAnUGFydCcsICdJdGVtJ107XG4gICAgICAgIGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sIGssIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodikgcmV0dXJuIHY7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8vID09PT09IE1vZGFsIHdpcmluZyAoaWRlbXBvdGVudCBwZXIgbW9kYWwpXG4gICAgZnVuY3Rpb24gb25Ob2RlUmVtb3ZlZChub2RlLCBjYikge1xuICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUub3duZXJEb2N1bWVudCkgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSBmb3IgKGNvbnN0IG4gb2YgbS5yZW1vdmVkTm9kZXMgfHwgW10pIHtcbiAgICAgICAgICAgICAgICBpZiAobiA9PT0gbm9kZSB8fCAobi5jb250YWlucyAmJiBuLmNvbnRhaW5zKG5vZGUpKSkgeyB0cnkgeyBjYigpOyB9IGZpbmFsbHkgeyBtby5kaXNjb25uZWN0KCk7IH0gcmV0dXJuOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmplY3RTdG9ja0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtb2RhbCA9IHVsLmNsb3Nlc3QoJy5wbGV4LWRpYWxvZycpO1xuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBtb2RhbD8ucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLXRpdGxlJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBsb29rc1JpZ2h0ID0gdGl0bGUgPT09IENGRy5NT0RBTF9USVRMRSB8fCBtb2RhbD8ucXVlcnlTZWxlY3RvcihDRkcuTk9URV9TRUwpO1xuICAgICAgICAgICAgaWYgKCFsb29rc1JpZ2h0KSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQgPSAnMSc7XG4gICAgICAgICAgICBkbG9nKCdpbmplY3RpbmcgY29udHJvbHMnKTtcblxuICAgICAgICAgICAgLy8gTWFpbiBhY3Rpb25cbiAgICAgICAgICAgIGNvbnN0IGxpTWFpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBidG4uaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ0xUIEdldCBTdG9jayBMZXZlbHMnO1xuICAgICAgICAgICAgYnRuLnRpdGxlID0gJ0FwcGVuZCBub3JtYWxpemVkIHN0b2NrIHN1bW1hcnkgdG8gTm90ZSc7XG4gICAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0dldCBzdG9jayBsZXZlbHMnKTtcbiAgICAgICAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGJ0bi5zdHlsZSwgeyBjdXJzb3I6ICdwb2ludGVyJywgdHJhbnNpdGlvbjogJ2ZpbHRlciAuMTVzLCB0ZXh0LWRlY29yYXRpb24tY29sb3IgLjE1cycgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgYnRuLnN0eWxlLmZpbHRlciA9ICdicmlnaHRuZXNzKDEuMDgpJzsgYnRuLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGJ0bi5zdHlsZS5maWx0ZXIgPSAnJzsgYnRuLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJyc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcycHggc29saWQgIzRhOTBlMic7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5vdXRsaW5lID0gJyc7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gaGFuZGxlQ2xpY2sobW9kYWwpKTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IGhhbmRsZUNsaWNrKG1vZGFsKTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBsaU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cbiAgICAgICAgICAgIC8vIFNldHRpbmdzIGdlYXJcbiAgICAgICAgICAgIGNvbnN0IGxpR2VhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBjb25zdCBnZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgZ2Vhci5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBnZWFyLnRleHRDb250ZW50ID0gJ1x1MjY5OVx1RkUwRic7XG4gICAgICAgICAgICBnZWFyLnRpdGxlID0gJ1FUMjAgU2V0dGluZ3MgKGJyZWFrZG93biAvIHRpbWVzdGFtcCknO1xuICAgICAgICAgICAgZ2Vhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnUVQyMCBTZXR0aW5ncycpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihnZWFyLnN0eWxlLCB7IG1hcmdpbkxlZnQ6ICc4cHgnLCBmb250U2l6ZTogJzE2cHgnLCBsaW5lSGVpZ2h0OiAnMScsIGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAndHJhbnNmb3JtIC4xNXMsIGZpbHRlciAuMTVzJyB9KTtcblxuICAgICAgICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdxdDIwLXNldHRpbmdzJztcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnNDBweCcsIHJpZ2h0OiAnMTZweCcsXG4gICAgICAgICAgICAgICAgbWluV2lkdGg6ICcyMjBweCcsIHBhZGRpbmc6ICcxMHB4IDEycHgnLFxuICAgICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCAjY2NjJywgYm9yZGVyUmFkaXVzOiAnOHB4JyxcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2ZmZicsIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwwLjE1KScsXG4gICAgICAgICAgICAgICAgekluZGV4OiAnOTk5OScsIGRpc3BsYXk6ICdub25lJ1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IFMwID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDo2MDA7IG1hcmdpbi1ib3R0b206OHB4O1wiPlFUMjAgU2V0dGluZ3M8L2Rpdj5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLWJyZWFrZG93blwiICR7UzAuaW5jbHVkZUJyZWFrZG93biA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIGJyZWFrZG93bjwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLXRpbWVzdGFtcFwiICR7UzAuaW5jbHVkZVRpbWVzdGFtcCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIHRpbWVzdGFtcDwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweDsgZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQ7XCI+XG4gICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgaWQ9XCJxdDIwLWNsb3NlXCIgc3R5bGU9XCJwYWRkaW5nOjRweCA4cHg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICBgO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvcGVuUGFuZWwoKSB7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBjbG9zZVBhbmVsKCkgeyBwYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBvdXRzaWRlQ2xvc2UoZSkgeyBpZiAoIXBhbmVsLmNvbnRhaW5zKGUudGFyZ2V0KSAmJiBlLnRhcmdldCAhPT0gZ2VhcikgY2xvc2VQYW5lbCgpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBlc2NDbG9zZShlKSB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIGNsb3NlUGFuZWwoKTsgfVxuXG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBwYW5lbC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyBvcGVuUGFuZWwoKSA6IGNsb3NlUGFuZWwoKTsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBnZWFyLnN0eWxlLnRyYW5zZm9ybSA9ICdyb3RhdGUoMTVkZWcpJzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJyc7IGdlYXIuc3R5bGUudHJhbnNmb3JtID0gJyc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgZ2Vhci5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjNGE5MGUyJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBnZWFyLnN0eWxlLm91dGxpbmUgPSAnJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuXG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsb3NlUGFuZWwpO1xuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtYnJlYWtkb3duJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1ciA9IGxvYWRTZXR0aW5ncygpOyBzYXZlU2V0dGluZ3MoeyAuLi5jdXIsIGluY2x1ZGVCcmVha2Rvd246ICEhZXYudGFyZ2V0LmNoZWNrZWQgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLXRpbWVzdGFtcCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXIgPSBsb2FkU2V0dGluZ3MoKTsgc2F2ZVNldHRpbmdzKHsgLi4uY3VyLCBpbmNsdWRlVGltZXN0YW1wOiAhIWV2LnRhcmdldC5jaGVja2VkIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxpR2Vhci5hcHBlbmRDaGlsZChnZWFyKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpR2Vhcik7XG4gICAgICAgICAgICAobW9kYWwucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWNvbnRlbnQnKSB8fCBtb2RhbCkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuXG4gICAgICAgICAgICAvLyBMZXQgb3RoZXIgbW9kdWxlcyByZWZyZXNoIGlmIHRoZXkgY2FyZSAobm8tb3AgaGVyZSlcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBXID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgQ0UgPSAoVyAmJiAoJ0N1c3RvbUV2ZW50JyBpbiBXKSA/IFcuQ3VzdG9tRXZlbnQgOiBnbG9iYWxUaGlzLkN1c3RvbUV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoVyAmJiBXLmRpc3BhdGNoRXZlbnQgJiYgQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuZGlzcGF0Y2hFdmVudChuZXcgQ0UoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgeyBkZXRhaWw6IHsgc291cmNlOiAnUVQyMCcsIHRzOiBEYXRlLm5vdygpIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRlcnIoJ2luamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQyMC1zdG9jay1idG4nO1xuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlTW9kYWxUaXRsZSgpIHtcbiAgICAgICAgY29uc3QgdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucyAucGxleC1kaWFsb2ctdGl0bGUnKTtcbiAgICAgICAgcmV0dXJuICh0Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1RhcmdldE1vZGFsT3BlbigpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbC1vcGVuJylcbiAgICAgICAgICAgICYmIC9ecXVvdGVcXHMqcGFydFxccypkZXRhaWwkL2kudGVzdChnZXRBY3RpdmVNb2RhbFRpdGxlKCkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsUm9vdCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZycpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgaHViID0gbHQ/LmNvcmU/Lmh1YjtcbiAgICAgICAgaWYgKCFodWIgfHwgIWh1Yi5yZWdpc3RlckJ1dHRvbikgcmV0dXJuOyAvLyBVSSBub3QgcmVhZHkgeWV0XG5cbiAgICAgICAgLy8gRG9uJ3QgZG91YmxlLXJlZ2lzdGVyXG4gICAgICAgIGlmIChodWIuaGFzPy4oSFVCX0JUTl9JRCkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oe1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1N0b2NrJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRmV0Y2ggc3RvY2sgZm9yIGN1cnJlbnQgcGFydCcsXG4gICAgICAgICAgICBzZWN0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IDExMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IGhhbmRsZUNsaWNrKGdldEFjdGl2ZU1vZGFsUm9vdCgpKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVIdWJCdXR0b24oKSB7XG4gICAgICAgIGNvbnN0IGh1YiA9IGx0Py5jb3JlPy5odWI7XG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVib3VuY2UoZm4sIG1zID0gNTApIHtcbiAgICAgICAgbGV0IGlkID0gbnVsbDtcbiAgICAgICAgcmV0dXJuICguLi5hcmdzKSA9PiB7IGNsZWFyVGltZW91dChpZCk7IGlkID0gc2V0VGltZW91dCgoKSA9PiBmbiguLi5hcmdzKSwgbXMpOyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkgPSBkZWJvdW5jZShhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChpc1RhcmdldE1vZGFsT3BlbigpKSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbW92ZUh1YkJ1dHRvbigpO1xuICAgICAgICB9XG4gICAgfSwgNTApO1xuXG4gICAgLy8gPT09PT0gQm9vdCAvIFNQQSB3aXJpbmdcbiAgICBsZXQgc3RvcE9ic2VydmUgPSBudWxsO1xuICAgIGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGxldCBib290ZWQgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICBzdG9wT2JzZXJ2ZT8uKCk7XG4gICAgICAgIHN0b3BPYnNlcnZlID0gd2luZG93LlRNVXRpbHM/Lm9ic2VydmVJbnNlcnRNYW55Py4oQ0ZHLkFDVElPTlNfVUxfU0VMLCBpbmplY3RTdG9ja0NvbnRyb2xzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wTW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSBmaW5hbGx5IHsgc3RvcE9ic2VydmUgPSBudWxsOyB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuICAgICAgICBhd2FpdCByYWYoKTtcbiAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgc3RhcnRNb2RhbE9ic2VydmVyKCk7XG5cbiAgICAgICAgLy8gU2hvdy9oaWRlIHRoZSBidXR0b24gYXMgdGhlIG1vZGFsIG9wZW5zL2Nsb3NlcyBhbmQgdGl0bGVzIGNoYW5nZVxuICAgICAgICByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgY29uc3QgYm9keU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgaWYgKG11dHMuc29tZShtID0+IG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnKSkgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgYm9keU9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10gfSk7XG5cbiAgICAgICAgLy8gTW9kYWwgdGl0bGUgbWF5IGNoYW5nZSBhZnRlciBvcGVuaW5nXG4gICAgICAgIGNvbnN0IG1vZGFsUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgIGNvbnN0IHRpdGxlT2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgdGl0bGVPYnMub2JzZXJ2ZShtb2RhbFJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG5cbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHN0b3BNb2RhbE9ic2VydmVyKCk7XG4gICAgfVxuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmICh3aW5kb3cuVE1VdGlscz8ubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbiAgICBpbml0KCk7XG5cbiAgICAvLyBEZXYgc2VhbSAob3B0aW9uYWwpXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDIwX18gPSB7IGluamVjdFN0b2NrQ29udHJvbHMsIGhhbmRsZUNsaWNrLCBzcGxpdEJhc2VBbmRQYWNrLCB0b0Jhc2VQYXJ0LCBub3JtYWxpemVSb3dUb1BpZWNlcywgc3VtbWFyaXpl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
