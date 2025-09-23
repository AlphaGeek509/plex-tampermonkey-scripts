// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.40
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.40-1758669610015
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.40-1758669610015
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.40-1758669610015
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.40-1758669610015
// @require      http://localhost:5000/lt-core.user.js?v=3.8.40-1758669610015
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
    const QT_CTX = lt?.core?.qt?.getQuoteContext();
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
        const qk = QT_CTX?.quoteKey;
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
      hub.registerButton("left", {
        id: HUB_BTN_ID,
        label: "Stock",
        title: "Fetch stock for current part",
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICBOT1RFX1NFTDogJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwLFxuICAgICAgICBTRVRUSU5HU19LRVk6ICdxdDIwX3NldHRpbmdzX3YyJyxcbiAgICAgICAgREVGQVVMVFM6IHsgaW5jbHVkZUJyZWFrZG93bjogdHJ1ZSwgaW5jbHVkZVRpbWVzdGFtcDogdHJ1ZSB9XG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgLy8gVXNlIGNlbnRyYWxpemVkIHF1b3RlIGNvbnRleHRcbiAgICBjb25zdCBRVF9DVFggPSBsdD8uY29yZT8ucXQ/LmdldFF1b3RlQ29udGV4dCgpO1xuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuXG4gICAgLy8gPT09PT0gU2V0dGluZ3MgKEdNKVxuICAgIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IEdNX2dldFZhbHVlKENGRy5TRVRUSU5HU19LRVksIG51bGwpO1xuICAgICAgICAgICAgaWYgKCFyYXcpIHJldHVybiB7IC4uLkNGRy5ERUZBVUxUUyB9O1xuICAgICAgICAgICAgY29uc3Qgb2JqID0gKHR5cGVvZiByYXcgPT09ICdzdHJpbmcnKSA/IEpTT04ucGFyc2UocmF3KSA6IHJhdztcbiAgICAgICAgICAgIHJldHVybiB7IC4uLkNGRy5ERUZBVUxUUywgLi4ub2JqIH07XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4geyAuLi5DRkcuREVGQVVMVFMgfTsgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzYXZlU2V0dGluZ3MobmV4dCkge1xuICAgICAgICB0cnkgeyBHTV9zZXRWYWx1ZShDRkcuU0VUVElOR1NfS0VZLCBKU09OLnN0cmluZ2lmeShuZXh0KSk7IH0gY2F0Y2ggeyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gU3RvY2sgaGVscGVyc1xuICAgIGZ1bmN0aW9uIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKSB7XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcocGFydE5vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IG0gPSBzLm1hdGNoKC9eKC4qPyktKFxcZCspXFxzKihCQUd8Qk9YfFBBQ0t8UEtHKSQvaSk7XG4gICAgICAgIGlmIChtKSByZXR1cm4geyBiYXNlOiBtWzFdLCBwYWNrU2l6ZTogTnVtYmVyKG1bMl0pLCBwYWNrVW5pdDogbVszXS50b1VwcGVyQ2FzZSgpIH07XG4gICAgICAgIHJldHVybiB7IGJhc2U6IHMsIHBhY2tTaXplOiBudWxsLCBwYWNrVW5pdDogbnVsbCB9O1xuICAgIH1cbiAgICBmdW5jdGlvbiB0b0Jhc2VQYXJ0KHBhcnRObykgeyByZXR1cm4gc3BsaXRCYXNlQW5kUGFjayhwYXJ0Tm8pLmJhc2U7IH1cbiAgICBmdW5jdGlvbiBub3JtYWxpemVSb3dUb1BpZWNlcyhyb3csIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3Qgcm93UGFydCA9IFN0cmluZyhyb3c/LlBhcnRfTm8gfHwgJycpLnRyaW0oKTtcbiAgICAgICAgY29uc3QgeyBiYXNlLCBwYWNrU2l6ZSB9ID0gc3BsaXRCYXNlQW5kUGFjayhyb3dQYXJ0KTtcbiAgICAgICAgaWYgKCFiYXNlIHx8IGJhc2UgIT09IHRhcmdldEJhc2UpIHJldHVybiAwO1xuICAgICAgICBjb25zdCB1bml0ID0gU3RyaW5nKHJvdz8uVW5pdCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcXR5ID0gTnVtYmVyKHJvdz8uUXVhbnRpdHkpIHx8IDA7XG4gICAgICAgIGlmICh1bml0ID09PSAnJyB8fCB1bml0ID09PSAncGNzJyB8fCB1bml0ID09PSAncGllY2UnIHx8IHVuaXQgPT09ICdwaWVjZXMnKSByZXR1cm4gcXR5O1xuICAgICAgICBpZiAocGFja1NpemUpIHJldHVybiBxdHkgKiBwYWNrU2l6ZTtcbiAgICAgICAgcmV0dXJuIHF0eTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MsIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3QgYnlMb2MgPSBuZXcgTWFwKCk7IGxldCB0b3RhbCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiAocm93cyB8fCBbXSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHBjcyA9IG5vcm1hbGl6ZVJvd1RvUGllY2VzKHIsIHRhcmdldEJhc2UpO1xuICAgICAgICAgICAgaWYgKCFwY3MpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgbG9jID0gU3RyaW5nKHI/LkxvY2F0aW9uIHx8IHI/LldhcmVob3VzZSB8fCByPy5TaXRlIHx8ICdVTksnKS50cmltKCk7XG4gICAgICAgICAgICB0b3RhbCArPSBwY3M7XG4gICAgICAgICAgICBieUxvYy5zZXQobG9jLCAoYnlMb2MuZ2V0KGxvYykgfHwgMCkgKyBwY3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJyZWFrZG93biA9IFsuLi5ieUxvY10ubWFwKChbbG9jLCBxdHldKSA9PiAoeyBsb2MsIHF0eSB9KSkuc29ydCgoYSwgYikgPT4gYi5xdHkgLSBhLnF0eSk7XG4gICAgICAgIHJldHVybiB7IHN1bTogdG90YWwsIGJyZWFrZG93biB9O1xuICAgIH1cbiAgICBjb25zdCBmb3JtYXRJbnQgPSAobikgPT4gTnVtYmVyKG4pLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuICAgIGZ1bmN0aW9uIGZvcm1hdFRpbWVzdGFtcChkKSB7XG4gICAgICAgIGNvbnN0IHBhZCA9IHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIHJldHVybiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7cGFkKGQuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChkLmdldERhdGUoKSl9ICR7cGFkKGQuZ2V0SG91cnMoKSl9OiR7cGFkKGQuZ2V0TWludXRlcygpKX1gO1xuICAgIH1cblxuXG4gICAgLy8gPT09PT0gQ2xpY2sgaGFuZGxlciAobm8gcmVwbyB3cml0ZXMpXG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ2xpY2sobW9kYWxFbCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQuY29yZS5odWIuYmVnaW5UYXNrKCdGZXRjaGluZyBzdG9ja1x1MjAyNicsICdpbmZvJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xuXG4gICAgICAgICAgICAvLyBSZXNvbHZlIFF1b3RlIEtleSAodXNlZCBmb3IgbG9nZ2luZyBvbmx5IG5vdylcbiAgICAgICAgICAgIGNvbnN0IHFrID0gKFFUX0NUWD8ucXVvdGVLZXkpO1xuICAgICAgICAgICAgaWYgKCFxayB8fCAhTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ1F1b3RlIEtleSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBLTyBOb3RlIGZpZWxkIHdpdGhpbiB0aGUgc2FtZSBtb2RhbFxuICAgICAgICAgICAgY29uc3QgdGEgPSBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3IoQ0ZHLk5PVEVfU0VMKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKENGRy5OT1RFX1NFTCk7XG4gICAgICAgICAgICBpZiAoIXRhKSB0aHJvdyBuZXcgRXJyb3IoJ05vdGVOZXcgdGV4dGFyZWEgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eEtPID0gS08/LmNvbnRleHRGb3I/Lih0YSk7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eEtPPy4kcm9vdD8uZGF0YTtcbiAgICAgICAgICAgIGlmICghdm0pIHRocm93IG5ldyBFcnJvcignS25vY2tvdXQgY29udGV4dCBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgLy8gUmVhZCBwYXJ0IGFuZCBub3JtYWxpemUgdG8gYmFzZVxuICAgICAgICAgICAgY29uc3QgcGFydE5vID0gcmVhZFBhcnRGcm9tVk0odm0pO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm8pIHRocm93IG5ldyBFcnJvcignUGFydE5vIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VQYXJ0ID0gdG9CYXNlUGFydChwYXJ0Tm8pO1xuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0sIGJyZWFrZG93biB9ID0gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MgfHwgW10sIGJhc2VQYXJ0KTtcblxuICAgICAgICAgICAgY29uc3QgUyA9IGxvYWRTZXR0aW5ncygpO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBbYFNUSzogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYF07XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlQnJlYWtkb3duICYmIGJyZWFrZG93bi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiayA9IGJyZWFrZG93bi5tYXAoKHsgbG9jLCBxdHkgfSkgPT4gYCR7bG9jfSAke2Zvcm1hdEludChxdHkpfWApLmpvaW4oJywgJyk7XG4gICAgICAgICAgICAgICAgcGFydHMucHVzaChgKCR7Ymt9KWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFMuaW5jbHVkZVRpbWVzdGFtcCkgcGFydHMucHVzaChgQCR7Zm9ybWF0VGltZXN0YW1wKG5ldyBEYXRlKCkpfWApO1xuICAgICAgICAgICAgY29uc3Qgc3RhbXAgPSBwYXJ0cy5qb2luKCcgJyk7XG5cbiAgICAgICAgICAgIC8vIEFwcGVuZCB0byBOb3RlTmV3IChjbGVhbiBwcmV2aW91cyBzdGFtcCBpZiBwcmVzZW50KVxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHdpbmRvdy5UTVV0aWxzPy5nZXRPYnNWYWx1ZT8uKHZtLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuZWQgPSBiYXNlTm90ZS5yZXBsYWNlKFxuICAgICAgICAgICAgICAgIC8oPzpefFxccylTVEs6XFxzKlxcZFtcXGQsXSooPzpcXHMqcGNzKT8oPzpcXHMqXFwoW14oKV0qXFwpKT8oPzpcXHMqQFxcZHs0fS1cXGR7Mn0tXFxkezJ9XFxzK1xcZHsyfTpcXGR7Mn0pPy9naSxcbiAgICAgICAgICAgICAgICAnJ1xuICAgICAgICAgICAgKS50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBuZXdOb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuICAgICAgICAgICAgY29uc3Qgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bSwgJ05vdGVOZXcnLCBuZXdOb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2sgJiYgdGEpIHsgdGEudmFsdWUgPSBuZXdOb3RlOyB0YS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpOyB9XG5cbiAgICAgICAgICAgIHRhc2suc3VjY2VzcygnU3RvY2sgdXBkYXRlZCcsIDE1MDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KCdTdG9jayByZXN1bHRzIGNvcGllZCB0byBOb3RlJywgJ3N1Y2Nlc3MnLCB7IG1zOiAyNTAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGxvZygnUVQyMCBzdWNjZXNzJywgeyBxaywgcGFydE5vLCBiYXNlUGFydCwgc3VtLCBicmVha2Rvd24gfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICB0YXNrLmVycm9yKCdGYWlsZWQnKTtcbiAgICAgICAgICAgIGx0LmNvcmUuaHViLm5vdGlmeShgU3RvY2sgY2hlY2sgZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgeyBtczogNDAwMCwgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyBubyB0cmFuc2llbnQgVUkgdG8gcmVzdG9yZSBoZXJlOyBrZWVwIGlkZW1wb3RlbnRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlYWRQYXJ0RnJvbVZNKHZtKSB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBbJ1BhcnRObycsICdJdGVtTm8nLCAnUGFydF9OdW1iZXInLCAnSXRlbV9OdW1iZXInLCAnUGFydCcsICdJdGVtJ107XG4gICAgICAgIGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gd2luZG93LlRNVXRpbHM/LmdldE9ic1ZhbHVlPy4odm0sIGssIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodikgcmV0dXJuIHY7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8vID09PT09IE1vZGFsIHdpcmluZyAoaWRlbXBvdGVudCBwZXIgbW9kYWwpXG4gICAgZnVuY3Rpb24gb25Ob2RlUmVtb3ZlZChub2RlLCBjYikge1xuICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUub3duZXJEb2N1bWVudCkgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSBmb3IgKGNvbnN0IG4gb2YgbS5yZW1vdmVkTm9kZXMgfHwgW10pIHtcbiAgICAgICAgICAgICAgICBpZiAobiA9PT0gbm9kZSB8fCAobi5jb250YWlucyAmJiBuLmNvbnRhaW5zKG5vZGUpKSkgeyB0cnkgeyBjYigpOyB9IGZpbmFsbHkgeyBtby5kaXNjb25uZWN0KCk7IH0gcmV0dXJuOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmplY3RTdG9ja0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtb2RhbCA9IHVsLmNsb3Nlc3QoJy5wbGV4LWRpYWxvZycpO1xuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBtb2RhbD8ucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLXRpdGxlJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBsb29rc1JpZ2h0ID0gdGl0bGUgPT09IENGRy5NT0RBTF9USVRMRSB8fCBtb2RhbD8ucXVlcnlTZWxlY3RvcihDRkcuTk9URV9TRUwpO1xuICAgICAgICAgICAgaWYgKCFsb29rc1JpZ2h0KSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQgPSAnMSc7XG4gICAgICAgICAgICBkbG9nKCdpbmplY3RpbmcgY29udHJvbHMnKTtcblxuICAgICAgICAgICAgLy8gTWFpbiBhY3Rpb25cbiAgICAgICAgICAgIGNvbnN0IGxpTWFpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBidG4uaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ0xUIEdldCBTdG9jayBMZXZlbHMnO1xuICAgICAgICAgICAgYnRuLnRpdGxlID0gJ0FwcGVuZCBub3JtYWxpemVkIHN0b2NrIHN1bW1hcnkgdG8gTm90ZSc7XG4gICAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0dldCBzdG9jayBsZXZlbHMnKTtcbiAgICAgICAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGJ0bi5zdHlsZSwgeyBjdXJzb3I6ICdwb2ludGVyJywgdHJhbnNpdGlvbjogJ2ZpbHRlciAuMTVzLCB0ZXh0LWRlY29yYXRpb24tY29sb3IgLjE1cycgfSk7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgYnRuLnN0eWxlLmZpbHRlciA9ICdicmlnaHRuZXNzKDEuMDgpJzsgYnRuLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGJ0bi5zdHlsZS5maWx0ZXIgPSAnJzsgYnRuLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJyc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcycHggc29saWQgIzRhOTBlMic7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5vdXRsaW5lID0gJyc7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gaGFuZGxlQ2xpY2sobW9kYWwpKTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IGhhbmRsZUNsaWNrKG1vZGFsKTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBsaU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cbiAgICAgICAgICAgIC8vIFNldHRpbmdzIGdlYXJcbiAgICAgICAgICAgIGNvbnN0IGxpR2VhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBjb25zdCBnZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgZ2Vhci5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBnZWFyLnRleHRDb250ZW50ID0gJ1x1MjY5OVx1RkUwRic7XG4gICAgICAgICAgICBnZWFyLnRpdGxlID0gJ1FUMjAgU2V0dGluZ3MgKGJyZWFrZG93biAvIHRpbWVzdGFtcCknO1xuICAgICAgICAgICAgZ2Vhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnUVQyMCBTZXR0aW5ncycpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihnZWFyLnN0eWxlLCB7IG1hcmdpbkxlZnQ6ICc4cHgnLCBmb250U2l6ZTogJzE2cHgnLCBsaW5lSGVpZ2h0OiAnMScsIGN1cnNvcjogJ3BvaW50ZXInLCB0cmFuc2l0aW9uOiAndHJhbnNmb3JtIC4xNXMsIGZpbHRlciAuMTVzJyB9KTtcblxuICAgICAgICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHBhbmVsLmNsYXNzTmFtZSA9ICdxdDIwLXNldHRpbmdzJztcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnNDBweCcsIHJpZ2h0OiAnMTZweCcsXG4gICAgICAgICAgICAgICAgbWluV2lkdGg6ICcyMjBweCcsIHBhZGRpbmc6ICcxMHB4IDEycHgnLFxuICAgICAgICAgICAgICAgIGJvcmRlcjogJzFweCBzb2xpZCAjY2NjJywgYm9yZGVyUmFkaXVzOiAnOHB4JyxcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAnI2ZmZicsIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwwLjE1KScsXG4gICAgICAgICAgICAgICAgekluZGV4OiAnOTk5OScsIGRpc3BsYXk6ICdub25lJ1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IFMwID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDo2MDA7IG1hcmdpbi1ib3R0b206OHB4O1wiPlFUMjAgU2V0dGluZ3M8L2Rpdj5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLWJyZWFrZG93blwiICR7UzAuaW5jbHVkZUJyZWFrZG93biA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIGJyZWFrZG93bjwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGxhYmVsIHN0eWxlPVwiZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBhbGlnbi1pdGVtczpjZW50ZXI7IG1hcmdpbjo2cHggMDtcIj5cbiAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJxdDIwLXRpbWVzdGFtcFwiICR7UzAuaW5jbHVkZVRpbWVzdGFtcCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICA8c3Bhbj5JbmNsdWRlIHRpbWVzdGFtcDwvc3Bhbj5cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweDsgZGlzcGxheTpmbGV4OyBnYXA6OHB4OyBqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQ7XCI+XG4gICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgaWQ9XCJxdDIwLWNsb3NlXCIgc3R5bGU9XCJwYWRkaW5nOjRweCA4cHg7XCI+Q2xvc2U8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICBgO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvcGVuUGFuZWwoKSB7IHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBjbG9zZVBhbmVsKCkgeyBwYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpOyBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBvdXRzaWRlQ2xvc2UoZSkgeyBpZiAoIXBhbmVsLmNvbnRhaW5zKGUudGFyZ2V0KSAmJiBlLnRhcmdldCAhPT0gZ2VhcikgY2xvc2VQYW5lbCgpOyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBlc2NDbG9zZShlKSB7IGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIGNsb3NlUGFuZWwoKTsgfVxuXG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBwYW5lbC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyBvcGVuUGFuZWwoKSA6IGNsb3NlUGFuZWwoKTsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBnZWFyLnN0eWxlLnRyYW5zZm9ybSA9ICdyb3RhdGUoMTVkZWcpJzsgfSk7XG4gICAgICAgICAgICBnZWFyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGdlYXIuc3R5bGUuZmlsdGVyID0gJyc7IGdlYXIuc3R5bGUudHJhbnNmb3JtID0gJyc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgZ2Vhci5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjNGE5MGUyJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBnZWFyLnN0eWxlLm91dGxpbmUgPSAnJzsgZ2Vhci5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuXG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC1jbG9zZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsb3NlUGFuZWwpO1xuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtYnJlYWtkb3duJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1ciA9IGxvYWRTZXR0aW5ncygpOyBzYXZlU2V0dGluZ3MoeyAuLi5jdXIsIGluY2x1ZGVCcmVha2Rvd246ICEhZXYudGFyZ2V0LmNoZWNrZWQgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLXRpbWVzdGFtcCcpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXIgPSBsb2FkU2V0dGluZ3MoKTsgc2F2ZVNldHRpbmdzKHsgLi4uY3VyLCBpbmNsdWRlVGltZXN0YW1wOiAhIWV2LnRhcmdldC5jaGVja2VkIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxpR2Vhci5hcHBlbmRDaGlsZChnZWFyKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpR2Vhcik7XG4gICAgICAgICAgICAobW9kYWwucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWNvbnRlbnQnKSB8fCBtb2RhbCkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuXG4gICAgICAgICAgICAvLyBMZXQgb3RoZXIgbW9kdWxlcyByZWZyZXNoIGlmIHRoZXkgY2FyZSAobm8tb3AgaGVyZSlcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBXID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgQ0UgPSAoVyAmJiAoJ0N1c3RvbUV2ZW50JyBpbiBXKSA/IFcuQ3VzdG9tRXZlbnQgOiBnbG9iYWxUaGlzLkN1c3RvbUV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoVyAmJiBXLmRpc3BhdGNoRXZlbnQgJiYgQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuZGlzcGF0Y2hFdmVudChuZXcgQ0UoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgeyBkZXRhaWw6IHsgc291cmNlOiAnUVQyMCcsIHRzOiBEYXRlLm5vdygpIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRlcnIoJ2luamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQyMC1zdG9jay1idG4nO1xuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlTW9kYWxUaXRsZSgpIHtcbiAgICAgICAgY29uc3QgdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucyAucGxleC1kaWFsb2ctdGl0bGUnKTtcbiAgICAgICAgcmV0dXJuICh0Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1RhcmdldE1vZGFsT3BlbigpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbC1vcGVuJylcbiAgICAgICAgICAgICYmIC9ecXVvdGVcXHMqcGFydFxccypkZXRhaWwkL2kudGVzdChnZXRBY3RpdmVNb2RhbFRpdGxlKCkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsUm9vdCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZycpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgaHViID0gbHQ/LmNvcmU/Lmh1YjtcbiAgICAgICAgaWYgKCFodWIgfHwgIWh1Yi5yZWdpc3RlckJ1dHRvbikgcmV0dXJuOyAvLyBVSSBub3QgcmVhZHkgeWV0XG5cbiAgICAgICAgLy8gRG9uJ3QgZG91YmxlLXJlZ2lzdGVyXG4gICAgICAgIGlmIChodWIuaGFzPy4oSFVCX0JUTl9JRCkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnU3RvY2snLFxuICAgICAgICAgICAgdGl0bGU6ICdGZXRjaCBzdG9jayBmb3IgY3VycmVudCBwYXJ0JyxcbiAgICAgICAgICAgIHdlaWdodDogMTEwLFxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gaGFuZGxlQ2xpY2soZ2V0QWN0aXZlTW9kYWxSb290KCkpXG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlSHViQnV0dG9uKCkge1xuICAgICAgICBjb25zdCBodWIgPSBsdD8uY29yZT8uaHViO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlYm91bmNlKGZuLCBtcyA9IDUwKSB7XG4gICAgICAgIGxldCBpZCA9IG51bGw7XG4gICAgICAgIHJldHVybiAoLi4uYXJncykgPT4geyBjbGVhclRpbWVvdXQoaWQpOyBpZCA9IHNldFRpbWVvdXQoKCkgPT4gZm4oLi4uYXJncyksIG1zKTsgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5ID0gZGVib3VuY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoaXNUYXJnZXRNb2RhbE9wZW4oKSkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZW1vdmVIdWJCdXR0b24oKTtcbiAgICAgICAgfVxuICAgIH0sIDUwKTtcblxuICAgIC8vID09PT09IEJvb3QgLyBTUEEgd2lyaW5nXG4gICAgbGV0IHN0b3BPYnNlcnZlID0gbnVsbDtcbiAgICBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0TW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgc3RvcE9ic2VydmU/LigpO1xuICAgICAgICBzdG9wT2JzZXJ2ZSA9IHdpbmRvdy5UTVV0aWxzPy5vYnNlcnZlSW5zZXJ0TWFueT8uKENGRy5BQ1RJT05TX1VMX1NFTCwgaW5qZWN0U3RvY2tDb250cm9scyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcE1vZGFsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIHRyeSB7IHN0b3BPYnNlcnZlPy4oKTsgfSBjYXRjaCB7IH0gZmluYWxseSB7IHN0b3BPYnNlcnZlID0gbnVsbDsgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgYXdhaXQgcmFmKCk7XG4gICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgIHN0YXJ0TW9kYWxPYnNlcnZlcigpO1xuXG4gICAgICAgIC8vIFNob3cvaGlkZSB0aGUgYnV0dG9uIGFzIHRoZSBtb2RhbCBvcGVucy9jbG9zZXMgYW5kIHRpdGxlcyBjaGFuZ2VcbiAgICAgICAgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuXG4gICAgICAgIGNvbnN0IGJvZHlPYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGlmIChtdXRzLnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJykpIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJvZHlPYnMub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydjbGFzcyddIH0pO1xuXG4gICAgICAgIC8vIE1vZGFsIHRpdGxlIG1heSBjaGFuZ2UgYWZ0ZXIgb3BlbmluZ1xuICAgICAgICBjb25zdCBtb2RhbFJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMnKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICBjb25zdCB0aXRsZU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKSk7XG4gICAgICAgIHRpdGxlT2JzLm9ic2VydmUobW9kYWxSb290LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuXG4gICAgICAgIGRsb2coJ2luaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBzdG9wTW9kYWxPYnNlcnZlcigpO1xuICAgIH1cblxuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAod2luZG93LlRNVXRpbHM/Lm1hdGNoUm91dGU/LihST1VURVMpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG4gICAgaW5pdCgpO1xuXG4gICAgLy8gRGV2IHNlYW0gKG9wdGlvbmFsKVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQyMF9fID0geyBpbmplY3RTdG9ja0NvbnRyb2xzLCBoYW5kbGVDbGljaywgc3BsaXRCYXNlQW5kUGFjaywgdG9CYXNlUGFydCwgbm9ybWFsaXplUm93VG9QaWVjZXMsIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZCB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0EsTUFBTSxNQUFPLE9BQ1AsT0FDQSxrQ0FBa0MsS0FBSyxTQUFTLFFBQVE7QUFFOUQsR0FBQyxNQUFNO0FBQ0g7QUFHQSxVQUFNLE9BQU8sSUFBSSxNQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQ3hELFVBQU0sT0FBTyxJQUFJLE1BQU0sUUFBUSxNQUFNLHFCQUFXLEdBQUcsQ0FBQztBQUNwRCxVQUFNLEtBQU0sT0FBTyxpQkFBaUIsY0FBYyxhQUFhLEtBQUssT0FBTztBQUMzRSxVQUFNLE1BQU0sTUFBTSxJQUFJLFFBQVEsT0FBSyxzQkFBc0IsQ0FBQyxDQUFDO0FBRzNELFFBQUksRUFBRSxvQkFBb0IsV0FBVyxDQUFDLE9BQU8sZUFBZ0IsUUFBTyxpQkFBaUI7QUFDckYsS0FBQyxZQUFZO0FBQ1QsVUFBSTtBQUFFLGNBQU0sT0FBTyxjQUFjLEVBQUUsT0FBTyxPQUFPLGVBQWUsQ0FBQztBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUU7QUFBQSxJQUVsRixHQUFHO0FBR0gsVUFBTSxTQUFTLENBQUMsc0NBQXNDO0FBQ3RELFFBQUksQ0FBQyxPQUFPLEtBQUssUUFBTSxHQUFHLEtBQUssU0FBUyxRQUFRLENBQUMsRUFBRztBQUVwRCxVQUFNLE1BQU07QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGFBQWE7QUFBQSxNQUNiLFVBQVU7QUFBQSxNQUNWLFVBQVU7QUFBQSxNQUNWLGdCQUFnQjtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxNQUNkLFVBQVUsRUFBRSxrQkFBa0IsTUFBTSxrQkFBa0IsS0FBSztBQUFBLElBQy9EO0FBR0EsbUJBQWUsaUJBQWlCO0FBQzVCLFlBQU0sU0FBUyxTQUFTLGNBQWMsSUFB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
