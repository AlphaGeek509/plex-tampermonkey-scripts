// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.08.06.0
// @description Adds “Get Stock Levels” on Quote Part Detail and Hub; queries DS 172, normalizes to pieces, and toasts totals. Optionally stamps NoteNew with “Stock: N pcs”. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.08.06.0-1786031273229
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.08.06.0-1786031273229
// @require     http://localhost:5000/lt-core.user.js?v=2026.08.06.0-1786031273229
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.08.06.0-1786031273229
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.08.06.0-1786031273229
// @resource    THEME_CSS http://localhost:5000/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @connect     cdn.jsdelivr.net
// @run-at      document-start
// @noframes
// @grant       GM_addStyle
// @grant       GM_getResourceText
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
      // Primary KO anchor is the form container; fallbacks retained for older layouts
      //, .plex-dialog-content, [data-bind], input[name="PartNo"], input[name="PartNoNew"], input[name="ItemNo"], input[name="Part_Number"], input[name="Item_Number"]
      ANCHOR_SEL: ".plex-form-content",
      DS_STOCK: 172,
      ACTION_BAR_SEL: "#QuoteWizardSharedActionBar",
      GRID_SEL: ".plex-grid",
      POLL_MS: 200,
      TIMEOUT_MS: 12e3
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
    function getModalVM(modalEl) {
      try {
        const pick = (sel) => modalEl?.querySelector(sel);
        const anchor = pick(".plex-form-content") || pick(".plex-dialog-content") || pick("[data-bind]") || modalEl;
        const ctx = KO?.contextFor?.(anchor) || KO?.contextFor?.(modalEl) || null;
        const vm = ctx?.$data || ctx?.$root?.data || null;
        return vm && (vm.data || vm.model) ? vm.data || vm.model : vm;
      } catch {
        return null;
      }
    }
    const withFreshAuth = (fn) => {
      const impl = lt?.core?.auth?.withFreshAuth;
      return typeof impl === "function" ? impl(fn) : fn();
    };
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
        const rootVM = await ensureWizardVM();
        let qk = Number(lt?.core?.qt?.getQuoteContext?.()?.quoteKey || 0);
        if (!Number.isFinite(qk) || qk <= 0) {
          const m = /[?&]QuoteKey=(\d+)/i.exec(location.search);
          qk = m ? Number(m[1]) : 0;
        }
        if (!Number.isFinite(qk) || qk <= 0) throw new Error("Quote Key not found");
        let vmModal = getModalVM(modalEl);
        if (!vmModal && window.TMUtils?.waitForModelAsync) {
          try {
            const { viewModel } = await window.TMUtils.waitForModelAsync(".plex-dialog-has-buttons .plex-form-content", {
              pollMs: 120,
              timeoutMs: 1500,
              requireKo: true
            }) ?? {};
            if (viewModel) vmModal = viewModel.data || viewModel.model || viewModel;
          } catch {
          }
        }
        const partNo = await resolvePartNo(modalEl, vmModal ?? rootVM, { timeoutMs: 5e3, pollMs: 150 });
        if (!partNo) throw new Error("PartNo not available");
        const basePart = toBasePart(partNo);
        const plex = typeof getPlexFacade === "function" ? await getPlexFacade() : window.lt?.core?.plex ?? window.TMUtils;
        const rows = await withFreshAuth(
          () => plex.dsRows(CFG.DS_STOCK, { Part_No: basePart, Shippable: "TRUE", Container_Status: "OK" })
        );
        const { sum } = summarizeStockNormalized(rows || [], basePart);
        const parts = [`STK: ${formatInt(sum)} pcs`];
        const current = window.TMUtils?.getObsValue?.(vmModal, "NoteNew", { trim: true }) || "";
        const baseNote = /^(null|undefined)$/i.test(current) ? "" : current;
        const cleaned = baseNote.replace(
          /(?:^|\s)(?:STK:\s*\d[\d,]*(?:\s*pcs)?(?:\s*\([^()]*\))?(?:\s*@\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?|Stock:\s*\d[\d,]*\s*pcs)\s*/gi,
          ""
        ).trim();
        const stamp = `Stock: ${formatInt(sum)} pcs`;
        const nextNote = cleaned ? `${cleaned} ${stamp}` : stamp;
        let setOk = window.TMUtils?.setObsValue?.(vmModal, "NoteNew", nextNote);
        if (!setOk) {
          const ta = modalEl?.querySelector('textarea[name="NoteNew"]');
          if (ta) {
            ta.value = nextNote;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
            setOk = true;
          }
        }
        task.success("Stock retrieved", 1200);
        lt.core.hub.notify(`Stock: ${formatInt(sum)} pcs`, "success", { toast: true });
        dlog("QT20 success", { qk, partNo, basePart, sum });
      } catch (err) {
        task.error("Failed");
        lt.core.hub.notify(`Stock check failed: ${err?.message || err}`, "error", { toast: true });
        derr("handleClick:", err);
      } finally {
      }
    }
    function readPartFromAny(modalEl, vmCandidate) {
      const paths = [
        // direct
        "PartNo",
        "ItemNo",
        "Part_Number",
        "Item_Number",
        "Part",
        "Item",
        "PartNoNew",
        "PartNoOld",
        // nested common
        "QuotePart.PartNo",
        "QuotePart.Part_Number",
        "SelectedRow.PartNo",
        "Row.PartNo",
        "Model.PartNo",
        // when vm is wrapper objects
        "data.PartNo",
        "data.ItemNo",
        "model.PartNo",
        "model.ItemNo"
      ];
      const TMU = window.TMUtils;
      if (vmCandidate) {
        const vVM = TMU?.getObsValue?.(vmCandidate, paths, { first: true, trim: true, allowPlex: true });
        if (vVM) return vVM;
      }
      const vModal = TMU?.getObsValue?.(modalEl, paths, { first: true, trim: true, allowPlex: true });
      if (vModal) return vModal;
      try {
        const el = modalEl?.querySelector('input[name="PartNo"],input[name="Part_Number"],input[name="ItemNo"],input[name="Item_Number"]');
        const raw = (el?.value ?? "").trim();
        if (raw) return raw;
      } catch {
      }
      try {
        const ctx = KO?.contextFor?.(modalEl);
        const root = ctx?.$root;
        if (root?.elements) {
          for (const key of Object.keys(root.elements)) {
            if (!/part/i.test(key)) continue;
            const v = KO?.unwrap?.(root.elements[key]?.boundDisplayValue);
            if (v && typeof v === "string" && v.trim()) return v.trim();
          }
        }
      } catch {
      }
      return "";
    }
    async function resolvePartNo(modalEl, vmCandidate, { timeoutMs = 5e3, pollMs = 150 } = {}) {
      const deadline = Date.now() + Math.max(500, timeoutMs | 0);
      let last = "";
      while (Date.now() < deadline) {
        const v = readPartFromAny(modalEl, vmCandidate);
        if (v) return v;
        last = v || last;
        try {
          const el = modalEl?.querySelector('input[name="PartNo"],input[name="Part_Number"],input[name="ItemNo"],input[name="Item_Number"]');
          if (el) {
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
          }
        } catch {
        }
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => setTimeout(r, Math.max(50, pollMs | 0)));
      }
      return last;
    }
    function findHeaderIndexes(modalEl, headerTexts) {
      try {
        const hdr = modalEl.querySelector(".plex-grid-container .plex-grid-header thead");
        if (!hdr) return [];
        const cells = [...hdr.querySelectorAll("th .plex-grid-header-inner-content abbr")];
        const set = /* @__PURE__ */ new Set();
        for (const want of headerTexts) {
          const idx = cells.findIndex((a) => a && a.textContent && a.textContent.trim().toLowerCase() === String(want).trim().toLowerCase());
          if (idx >= 0) set.add(idx);
        }
        return [...set].sort((a, b) => a - b);
      } catch {
        return [];
      }
    }
    function hideColumnsByIndexes(modalEl, idxs) {
      if (!idxs || !idxs.length) return;
      try {
        const hdrCells = modalEl.querySelectorAll(".plex-grid-container .plex-grid-header thead th");
        idxs.forEach((i) => {
          if (hdrCells[i]) hdrCells[i].style.display = "none";
        });
        const bodyRows = modalEl.querySelectorAll(".plex-grid-wrapper .plex-grid tbody tr");
        for (const r of bodyRows) {
          const tds = r.children;
          idxs.forEach((i) => {
            if (tds && tds[i]) tds[i].style.display = "none";
          });
        }
        const colgroups = modalEl.querySelectorAll(".plex-grid-container colgroup, .plex-grid-wrapper colgroup");
        for (const cg of colgroups) {
          const cols = cg.querySelectorAll("col");
          idxs.forEach((i) => {
            if (cols[i]) cols[i].style.display = "none";
          });
        }
      } catch {
      }
    }
    function disableInputsInLockedColumns(modalEl, idxs) {
      try {
        const hardNames = ["NewUnitPrice", "NewPercentMarkup", "PercentMarkup", "MarkupPercent"];
        const hardSel = hardNames.map((n) => `input[name="${n}"],textarea[name="${n}"],select[name="${n}"]`).join(",");
        const markReadOnly = (el) => {
          try {
            if ("readOnly" in el) el.readOnly = true;
            if ("disabled" in el) el.disabled = true;
            el.setAttribute("aria-readonly", "true");
            el.title = "Disabled by policy";
            el.style.pointerEvents = "none";
          } catch {
          }
        };
        try {
          modalEl.querySelectorAll(hardSel).forEach(markReadOnly);
        } catch {
        }
        const idxSet = new Set(idxs);
        const isInLockedCell = (node) => {
          const td = node?.closest?.("td");
          if (!td || typeof td.cellIndex !== "number") return false;
          return idxSet.has(td.cellIndex);
        };
        if (!modalEl.dataset.qt20LockoutListeners) {
          modalEl.dataset.qt20LockoutListeners = "1";
          modalEl.addEventListener("focusin", (e) => {
            const t = e.target;
            if (t && (isInLockedCell(t) || t.matches && t.matches(hardSel))) {
              try {
                t.blur?.();
              } catch {
              }
              lt?.core?.hub?.notify?.("This field is controlled by policy and cannot be edited here.", "warning", { toast: true });
            }
          }, true);
          modalEl.addEventListener("keydown", (e) => {
            const t = e.target;
            if (t && (isInLockedCell(t) || t.matches && t.matches(hardSel))) {
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          }, true);
          modalEl.addEventListener("input", (e) => {
            const t = e.target;
            if (t && (isInLockedCell(t) || t.matches && t.matches(hardSel))) {
              if ("value" in t) t.value = "";
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          }, true);
        }
        const rows = modalEl.querySelectorAll(".plex-grid-wrapper .plex-grid tbody tr");
        for (const r of rows) {
          idxs.forEach((i) => {
            const td = r.children?.[i];
            if (!td) return;
            td.querySelectorAll("input,textarea,select").forEach(markReadOnly);
          });
        }
      } catch {
      }
    }
    function lockoutPricingColumns(modalEl) {
      const idxs = findHeaderIndexes(modalEl, ["Unit Price", "% Markup", "$ Markup"]);
      disableInputsInLockedColumns(modalEl, idxs);
      hideColumnsByIndexes(modalEl, idxs);
    }
    function watchPricingLockout(modalEl) {
      try {
        lockoutPricingColumns(modalEl);
        const root = modalEl.querySelector(".plex-grid-container") || modalEl;
        const mo = new MutationObserver(() => lockoutPricingColumns(modalEl));
        mo.observe(root, { childList: true, subtree: true });
        onNodeRemoved(modalEl, () => mo.disconnect());
      } catch {
      }
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
        const modal = ul.closest(".plex-dialog");
        const title = modal?.querySelector(".plex-dialog-title")?.textContent?.trim();
        const looksRight = title === CFG.MODAL_TITLE;
        if (!looksRight) return;
        if (ul.dataset.qt20Injected) return;
        ul.dataset.qt20Injected = "1";
        dlog("injecting controls");
        const liMain = document.createElement("li");
        liMain.className = "lt-action lt-action--brand";
        const btn = document.createElement("a");
        btn.href = "javascript:void(0)";
        btn.id = "qt20-stock-li-btn";
        btn.className = "lt-btn lt-btn--ghost";
        btn.textContent = "Get Stock Levels";
        btn.title = "Fetch stock for this part (no stamp)";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          handleClick(modal);
        });
        liMain.appendChild(btn);
        ul.appendChild(liMain);
        watchPricingLockout(modal);
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
        weight: 25,
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICAvLyBQcmltYXJ5IEtPIGFuY2hvciBpcyB0aGUgZm9ybSBjb250YWluZXI7IGZhbGxiYWNrcyByZXRhaW5lZCBmb3Igb2xkZXIgbGF5b3V0c1xuICAgICAgICAvLywgLnBsZXgtZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWJpbmRdLCBpbnB1dFtuYW1lPVwiUGFydE5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydE5vTmV3XCJdLCBpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0sIGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXVxuICAgICAgICBBTkNIT1JfU0VMOiAnLnBsZXgtZm9ybS1jb250ZW50JyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TW9kYWxWTShtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrID0gc2VsID0+IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvciA9XG4gICAgICAgICAgICAgICAgcGljaygnLnBsZXgtZm9ybS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICBwaWNrKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgcGljaygnW2RhdGEtYmluZF0nKSB8fFxuICAgICAgICAgICAgICAgIG1vZGFsRWw7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4oYW5jaG9yKSB8fCBLTz8uY29udGV4dEZvcj8uKG1vZGFsRWwpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgfHwgY3R4Py4kcm9vdD8uZGF0YSB8fCBudWxsO1xuXG4gICAgICAgICAgICAvLyBTb21lIGRpYWxvZ3Mgd3JhcCB0aGUgYWN0dWFsIHJlY29yZCBvbiB2bS5kYXRhIG9yIHZtLm1vZGVsXG4gICAgICAgICAgICByZXR1cm4gKHZtICYmICh2bS5kYXRhIHx8IHZtLm1vZGVsKSkgPyAodm0uZGF0YSB8fCB2bS5tb2RlbCkgOiB2bTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKG1vZGFsRWwpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgXHUyMDI2XG4gICAgICAgICAgICBsZXQgcWsgPSBOdW1iZXIobHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpPy5xdW90ZUtleSB8fCAwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHFrID0gbSA/IE51bWJlcihtWzFdKSA6IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZSBLZXkgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgbW9kYWwgVk0gYW5jaG9yZWQgYXQgLnBsZXgtZm9ybS1jb250ZW50XG4gICAgICAgICAgICAvLyBXYWl0IGJyaWVmbHkgZm9yIEtPIHRvIGJpbmQgdGhpcyBtb2RhbCBiZWZvcmUgZ3JhYmJpbmcgaXRzIFZNXG4gICAgICAgICAgICBsZXQgdm1Nb2RhbCA9IGdldE1vZGFsVk0obW9kYWxFbCk7XG4gICAgICAgICAgICBpZiAoIXZtTW9kYWwgJiYgd2luZG93LlRNVXRpbHM/LndhaXRGb3JNb2RlbEFzeW5jKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtZm9ybS1jb250ZW50Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9sbE1zOiAxMjAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IDE1MDAsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1aXJlS286IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSkgPz8ge307XG4gICAgICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHZtTW9kYWwgPSAodmlld01vZGVsLmRhdGEgfHwgdmlld01vZGVsLm1vZGVsIHx8IHZpZXdNb2RlbCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBhbmQgY29udGludWUgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBhd2FpdCByZXNvbHZlUGFydE5vKG1vZGFsRWwsIHZtTW9kYWwgPz8gcm9vdFZNLCB7IHRpbWVvdXRNczogNTAwMCwgcG9sbE1zOiAxNTAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vKSB0aHJvdyBuZXcgRXJyb3IoJ1BhcnRObyBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlUGFydCA9IHRvQmFzZVBhcnQocGFydE5vKTtcblxuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0gfSA9IHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzIHx8IFtdLCBiYXNlUGFydCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gW2BTVEs6ICR7Zm9ybWF0SW50KHN1bSl9IHBjc2BdO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgdG8gTm90ZU5ldyAoY2xlYW4gcHJldmlvdXMgc3RhbXAgaWYgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIC8vIDIpIHJlbW92ZSBhbnkgcHJpb3Igc3RhbXAgdmFyaWFudHMgKG9sZCBTVEsgdy8gYnJlYWtkb3duL3RpbWVzdGFtcCBPUiBwcmlvciBcIlN0b2NrOiBOIHBjc1wiKVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKSg/OlNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/fFN0b2NrOlxccypcXGRbXFxkLF0qXFxzKnBjcylcXHMqL2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcblxuICAgICAgICAgICAgLy8gMykgYnVpbGQgbWluaW1hbCBzdGFtcCBhbmQgYXBwZW5kXG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYDtcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuXG4gICAgICAgICAgICAvLyA0KSB3cml0ZSBiYWNrIHZpYSBLTzsgZmFsbGJhY2sgdG8gZGlyZWN0IHRleHRhcmVhXG4gICAgICAgICAgICBsZXQgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIG5leHROb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRhKSB7IHRhLnZhbHVlID0gbmV4dE5vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IHNldE9rID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBicmVha2Rvd24sIG5vIHN0YW1wIFx1MjAxNCBqdXN0IGEgc2ltcGxlIHRvYXN0XG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1N0b2NrIHJldHJpZXZlZCcsIDEyMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYCwgJ3N1Y2Nlc3MnLCB7IHRvYXN0OiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBkbG9nKCdRVDIwIHN1Y2Nlc3MnLCB7IHFrLCBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0gfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYFN0b2NrIGNoZWNrIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyBubyB0cmFuc2llbnQgVUkgdG8gcmVzdG9yZSBoZXJlOyBrZWVwIGlkZW1wb3RlbnRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByZWZlciBLTyB2aWEgVE1VdGlscy5nZXRPYnNWYWx1ZTsgd29ya3Mgd2l0aCBWTSBvciBET00gbm9kZSAocmVzb2x2ZXMgS08gY29udGV4dCkuXG4gICAgZnVuY3Rpb24gcmVhZFBhcnRGcm9tQW55KG1vZGFsRWwsIHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gW1xuICAgICAgICAgICAgLy8gZGlyZWN0XG4gICAgICAgICAgICAnUGFydE5vJywgJ0l0ZW1ObycsICdQYXJ0X051bWJlcicsICdJdGVtX051bWJlcicsICdQYXJ0JywgJ0l0ZW0nLFxuICAgICAgICAgICAgJ1BhcnROb05ldycsICdQYXJ0Tm9PbGQnLFxuICAgICAgICAgICAgLy8gbmVzdGVkIGNvbW1vblxuICAgICAgICAgICAgJ1F1b3RlUGFydC5QYXJ0Tm8nLCAnUXVvdGVQYXJ0LlBhcnRfTnVtYmVyJyxcbiAgICAgICAgICAgICdTZWxlY3RlZFJvdy5QYXJ0Tm8nLCAnUm93LlBhcnRObycsICdNb2RlbC5QYXJ0Tm8nLFxuICAgICAgICAgICAgLy8gd2hlbiB2bSBpcyB3cmFwcGVyIG9iamVjdHNcbiAgICAgICAgICAgICdkYXRhLlBhcnRObycsICdkYXRhLkl0ZW1ObycsICdtb2RlbC5QYXJ0Tm8nLCAnbW9kZWwuSXRlbU5vJ1xuICAgICAgICBdO1xuICAgICAgICBjb25zdCBUTVUgPSB3aW5kb3cuVE1VdGlscztcblxuICAgICAgICAvLyAxKSBtb2RhbCBWTSBwcmVmZXJyZWRcbiAgICAgICAgaWYgKHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgICAgICBjb25zdCB2Vk0gPSBUTVU/LmdldE9ic1ZhbHVlPy4odm1DYW5kaWRhdGUsIHBhdGhzLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlLCBhbGxvd1BsZXg6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodlZNKSByZXR1cm4gdlZNO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIpIG1vZGFsIGVsZW1lbnQgS08gY29udGV4dFxuICAgICAgICBjb25zdCB2TW9kYWwgPSBUTVU/LmdldE9ic1ZhbHVlPy4obW9kYWxFbCwgcGF0aHMsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUsIGFsbG93UGxleDogdHJ1ZSB9KTtcbiAgICAgICAgaWYgKHZNb2RhbCkgcmV0dXJuIHZNb2RhbDtcbiAgICAgICAgLy8gMykgRE9NIGlucHV0cyAobGFzdCByZXNvcnQpXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJQYXJ0Tm9cIl0saW5wdXRbbmFtZT1cIlBhcnRfTnVtYmVyXCJdLGlucHV0W25hbWU9XCJJdGVtTm9cIl0saW5wdXRbbmFtZT1cIkl0ZW1fTnVtYmVyXCJdJyk7XG4gICAgICAgICAgICBjb25zdCByYXcgPSAoZWw/LnZhbHVlID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAocmF3KSByZXR1cm4gcmF3O1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAvLyA0KSBQbGV4IHBpY2tlcjogYm91bmREaXNwbGF5VmFsdWUgbGl2ZXMgb24gJHJvb3QuZWxlbWVudHMsIG5vdCAkZGF0YSBcdTIwMTQgY2hlY2sgYW55IHBhcnQta2V5ZWQgZWxlbWVudFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/Lihtb2RhbEVsKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBjdHg/LiRyb290O1xuICAgICAgICAgICAgaWYgKHJvb3Q/LmVsZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocm9vdC5lbGVtZW50cykpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEvcGFydC9pLnRlc3Qoa2V5KSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBLTz8udW53cmFwPy4ocm9vdC5lbGVtZW50c1trZXldPy5ib3VuZERpc3BsYXlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiB2LnRyaW0oKSkgcmV0dXJuIHYudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8vIFJvYnVzdCByZXNvbHZlciB0aGF0IHJldHJpZXMgYnJpZWZseSB0byBzdXJ2aXZlIEtPL2xheW91dCB0aW1pbmcuXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVBhcnRObyhtb2RhbEVsLCB2bUNhbmRpZGF0ZSwgeyB0aW1lb3V0TXMgPSA1MDAwLCBwb2xsTXMgPSAxNTAgfSA9IHt9KSB7XG4gICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIE1hdGgubWF4KDUwMCwgdGltZW91dE1zIHwgMCk7XG4gICAgICAgIGxldCBsYXN0ID0gJyc7XG5cbiAgICAgICAgd2hpbGUgKERhdGUubm93KCkgPCBkZWFkbGluZSkge1xuICAgICAgICAgICAgLy8gMSkgVHJ5IHRoZSBmYXN0IHBhdGggKGV4aXN0aW5nIGxvZ2ljKVxuICAgICAgICAgICAgY29uc3QgdiA9IHJlYWRQYXJ0RnJvbUFueShtb2RhbEVsLCB2bUNhbmRpZGF0ZSk7XG4gICAgICAgICAgICBpZiAodikgcmV0dXJuIHY7XG4gICAgICAgICAgICBsYXN0ID0gdiB8fCBsYXN0O1xuXG4gICAgICAgICAgICAvLyAyKSBOdWRnZSBET00gdG8gY29tbWl0IHBlbmRpbmcgaW5wdXQgXHUyMTkyIEtPIChibHVyL2NoYW5nZSlcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBtb2RhbEVsPy5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPVwiUGFydE5vXCJdLGlucHV0W25hbWU9XCJQYXJ0X051bWJlclwiXSxpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXScpO1xuICAgICAgICAgICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgICAgICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2JsdXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBub24tZmF0YWwgKi8gfVxuXG4gICAgICAgICAgICAvLyAzKSBZaWVsZCArIHNtYWxsIGRlbGF5IHRvIGxldCBLTyBzZXR0bGVcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHIpKTtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBNYXRoLm1heCg1MCwgcG9sbE1zIHwgMCkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsYXN0OyAvLyBzdGlsbCAnJywgY2FsbGVyIHdpbGwgaGFuZGxlXG4gICAgfVxuXG4gICAgLy8gPT09PT0gUHJpY2luZyBjb2x1bW5zIGxvY2tvdXQgKGhpZGUsIGRpc2FibGUsIGFuZCByZS1hcHBseSBvbiByZS1yZW5kZXIpXG4gICAgZnVuY3Rpb24gZmluZEhlYWRlckluZGV4ZXMobW9kYWxFbCwgaGVhZGVyVGV4dHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGhkciA9IG1vZGFsRWwucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZC1jb250YWluZXIgLnBsZXgtZ3JpZC1oZWFkZXIgdGhlYWQnKTtcbiAgICAgICAgICAgIGlmICghaGRyKSByZXR1cm4gW107XG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IFsuLi5oZHIucXVlcnlTZWxlY3RvckFsbCgndGggLnBsZXgtZ3JpZC1oZWFkZXItaW5uZXItY29udGVudCBhYmJyJyldO1xuICAgICAgICAgICAgY29uc3Qgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB3YW50IG9mIGhlYWRlclRleHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gY2VsbHMuZmluZEluZGV4KGEgPT4gYSAmJiBhLnRleHRDb250ZW50ICYmIGEudGV4dENvbnRlbnQudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IFN0cmluZyh3YW50KS50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgaWYgKGlkeCA+PSAwKSBzZXQuYWRkKGlkeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gWy4uLnNldF0uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIFtdOyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGlkZUNvbHVtbnNCeUluZGV4ZXMobW9kYWxFbCwgaWR4cykge1xuICAgICAgICBpZiAoIWlkeHMgfHwgIWlkeHMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyAxKSBIZWFkZXJzXG4gICAgICAgICAgICBjb25zdCBoZHJDZWxscyA9IG1vZGFsRWwucXVlcnlTZWxlY3RvckFsbCgnLnBsZXgtZ3JpZC1jb250YWluZXIgLnBsZXgtZ3JpZC1oZWFkZXIgdGhlYWQgdGgnKTtcbiAgICAgICAgICAgIGlkeHMuZm9yRWFjaChpID0+IHsgaWYgKGhkckNlbGxzW2ldKSBoZHJDZWxsc1tpXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9KTtcblxuICAgICAgICAgICAgLy8gMikgQm9keSBjZWxsc1xuICAgICAgICAgICAgY29uc3QgYm9keVJvd3MgPSBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5wbGV4LWdyaWQtd3JhcHBlciAucGxleC1ncmlkIHRib2R5IHRyJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHIgb2YgYm9keVJvd3MpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZHMgPSByLmNoaWxkcmVuO1xuICAgICAgICAgICAgICAgIGlkeHMuZm9yRWFjaChpID0+IHsgaWYgKHRkcyAmJiB0ZHNbaV0pIHRkc1tpXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gMykgQ29sZ3JvdXBzIHRvIGtlZXAgd2lkdGhzIHNhbmVcbiAgICAgICAgICAgIGNvbnN0IGNvbGdyb3VwcyA9IG1vZGFsRWwucXVlcnlTZWxlY3RvckFsbCgnLnBsZXgtZ3JpZC1jb250YWluZXIgY29sZ3JvdXAsIC5wbGV4LWdyaWQtd3JhcHBlciBjb2xncm91cCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBjZyBvZiBjb2xncm91cHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xzID0gY2cucXVlcnlTZWxlY3RvckFsbCgnY29sJyk7XG4gICAgICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4geyBpZiAoY29sc1tpXSkgY29sc1tpXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIG5vLW9wICovIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkaXNhYmxlSW5wdXRzSW5Mb2NrZWRDb2x1bW5zKG1vZGFsRWwsIGlkeHMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEFsc28gZGlyZWN0bHkgdGFyZ2V0IGtub3duIGZpZWxkIG5hbWVzIHdlIG5ldmVyIGFsbG93XG4gICAgICAgICAgICBjb25zdCBoYXJkTmFtZXMgPSBbJ05ld1VuaXRQcmljZScsICdOZXdQZXJjZW50TWFya3VwJywgJ1BlcmNlbnRNYXJrdXAnLCAnTWFya3VwUGVyY2VudCddO1xuICAgICAgICAgICAgY29uc3QgaGFyZFNlbCA9IGhhcmROYW1lcy5tYXAobiA9PiBgaW5wdXRbbmFtZT1cIiR7bn1cIl0sdGV4dGFyZWFbbmFtZT1cIiR7bn1cIl0sc2VsZWN0W25hbWU9XCIke259XCJdYCkuam9pbignLCcpO1xuICAgICAgICAgICAgY29uc3QgbWFya1JlYWRPbmx5ID0gZWwgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICgncmVhZE9ubHknIGluIGVsKSBlbC5yZWFkT25seSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGlmICgnZGlzYWJsZWQnIGluIGVsKSBlbC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1yZWFkb25seScsICd0cnVlJyk7XG4gICAgICAgICAgICAgICAgICAgIGVsLnRpdGxlID0gJ0Rpc2FibGVkIGJ5IHBvbGljeSc7XG4gICAgICAgICAgICAgICAgICAgIGVsLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIE1hcmsgYW55IGtub3duIG5hbWVkIGNvbnRyb2xzIG5vd1xuICAgICAgICAgICAgdHJ5IHsgbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKGhhcmRTZWwpLmZvckVhY2gobWFya1JlYWRPbmx5KTsgfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgLy8gRXZlbnQtbGV2ZWwgaGFyZCBibG9jayBmb3IgYW55IGlucHV0IGxpdmluZyBpbnNpZGUgbG9ja2VkIFREc1xuICAgICAgICAgICAgY29uc3QgaWR4U2V0ID0gbmV3IFNldChpZHhzKTtcbiAgICAgICAgICAgIGNvbnN0IGlzSW5Mb2NrZWRDZWxsID0gKG5vZGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZCA9IG5vZGU/LmNsb3Nlc3Q/LigndGQnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXRkIHx8IHR5cGVvZiB0ZC5jZWxsSW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlkeFNldC5oYXModGQuY2VsbEluZGV4KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIEF2b2lkIGR1cGxpY2F0ZSBsaXN0ZW5lcnMgcGVyIG1vZGFsIGluc3RhbmNlXG4gICAgICAgICAgICBpZiAoIW1vZGFsRWwuZGF0YXNldC5xdDIwTG9ja291dExpc3RlbmVycykge1xuICAgICAgICAgICAgICAgIG1vZGFsRWwuZGF0YXNldC5xdDIwTG9ja291dExpc3RlbmVycyA9ICcxJztcblxuICAgICAgICAgICAgICAgIG1vZGFsRWwuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNpbicsIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSBlLnRhcmdldDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHQgJiYgKGlzSW5Mb2NrZWRDZWxsKHQpIHx8ICh0Lm1hdGNoZXMgJiYgdC5tYXRjaGVzKGhhcmRTZWwpKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IHQuYmx1cj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgICAgICBsdD8uY29yZT8uaHViPy5ub3RpZnk/LignVGhpcyBmaWVsZCBpcyBjb250cm9sbGVkIGJ5IHBvbGljeSBhbmQgY2Fubm90IGJlIGVkaXRlZCBoZXJlLicsICd3YXJuaW5nJywgeyB0b2FzdDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgICAgICAgICAgbW9kYWxFbC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGUudGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiAoaXNJbkxvY2tlZENlbGwodCkgfHwgKHQubWF0Y2hlcyAmJiB0Lm1hdGNoZXMoaGFyZFNlbCkpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTsgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICBtb2RhbEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGUudGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiAoaXNJbkxvY2tlZENlbGwodCkgfHwgKHQubWF0Y2hlcyAmJiB0Lm1hdGNoZXMoaGFyZFNlbCkpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCd2YWx1ZScgaW4gdCkgdC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTsgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFsc28gc3dlZXAgZXhpc3RpbmcgaW5wdXRzIGluIHRob3NlIFREcyBhbmQgbWFyayB0aGVtIHJlYWQtb25seVxuICAgICAgICAgICAgY29uc3Qgcm93cyA9IG1vZGFsRWwucXVlcnlTZWxlY3RvckFsbCgnLnBsZXgtZ3JpZC13cmFwcGVyIC5wbGV4LWdyaWQgdGJvZHkgdHInKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiByb3dzKSB7XG4gICAgICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZCA9IHIuY2hpbGRyZW4/LltpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0ZCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB0ZC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCx0ZXh0YXJlYSxzZWxlY3QnKS5mb3JFYWNoKG1hcmtSZWFkT25seSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBuby1vcCAqLyB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9ja291dFByaWNpbmdDb2x1bW5zKG1vZGFsRWwpIHtcbiAgICAgICAgLy8gQ29sdW1ucyB0byBoaWRlL2xvY2sgYnkgaGVhZGVyIHRleHRcbiAgICAgICAgY29uc3QgaWR4cyA9IGZpbmRIZWFkZXJJbmRleGVzKG1vZGFsRWwsIFsnVW5pdCBQcmljZScsICclIE1hcmt1cCcsICckIE1hcmt1cCddKTtcbiAgICAgICAgLy8gRGlzYWJsZSBhbnkgaW5wdXRzIGluc2lkZSB0aG9zZSBjb2x1bW5zIChhbmQga25vd24gZmllbGQgbmFtZXMpXG4gICAgICAgIGRpc2FibGVJbnB1dHNJbkxvY2tlZENvbHVtbnMobW9kYWxFbCwgaWR4cyk7XG4gICAgICAgIC8vIEhpZGUgdGhlIGNvbHVtbnMgdmlzdWFsbHlcbiAgICAgICAgaGlkZUNvbHVtbnNCeUluZGV4ZXMobW9kYWxFbCwgaWR4cyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2F0Y2hQcmljaW5nTG9ja291dChtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBBcHBseSBpbW1lZGlhdGVseVxuICAgICAgICAgICAgbG9ja291dFByaWNpbmdDb2x1bW5zKG1vZGFsRWwpO1xuICAgICAgICAgICAgLy8gUmUtYXBwbHkgb24gZ3JpZCByZS1yZW5kZXIgKFBsZXggcmViaW5kaW5nKVxuICAgICAgICAgICAgY29uc3Qgcm9vdCA9IG1vZGFsRWwucXVlcnlTZWxlY3RvcignLnBsZXgtZ3JpZC1jb250YWluZXInKSB8fCBtb2RhbEVsO1xuICAgICAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiBsb2Nrb3V0UHJpY2luZ0NvbHVtbnMobW9kYWxFbCkpO1xuICAgICAgICAgICAgbW8ub2JzZXJ2ZShyb290LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIC8vIFN0b3Agd2hlbiBtb2RhbCBpcyByZW1vdmVkXG4gICAgICAgICAgICBvbk5vZGVSZW1vdmVkKG1vZGFsRWwsICgpID0+IG1vLmRpc2Nvbm5lY3QoKSk7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cblxuICAgIC8vID09PT09IE1vZGFsIHdpcmluZyAoaWRlbXBvdGVudCBwZXIgbW9kYWwpXG4gICAgZnVuY3Rpb24gb25Ob2RlUmVtb3ZlZChub2RlLCBjYikge1xuICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUub3duZXJEb2N1bWVudCkgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSBmb3IgKGNvbnN0IG4gb2YgbS5yZW1vdmVkTm9kZXMgfHwgW10pIHtcbiAgICAgICAgICAgICAgICBpZiAobiA9PT0gbm9kZSB8fCAobi5jb250YWlucyAmJiBuLmNvbnRhaW5zKG5vZGUpKSkgeyB0cnkgeyBjYigpOyB9IGZpbmFsbHkgeyBtby5kaXNjb25uZWN0KCk7IH0gcmV0dXJuOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmplY3RTdG9ja0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtb2RhbCA9IHVsLmNsb3Nlc3QoJy5wbGV4LWRpYWxvZycpO1xuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBtb2RhbD8ucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLXRpdGxlJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICAvLyBvcHRpb25zIHJlbW92ZWQ6IG1hdGNoIGJ5IHRpdGxlIG9ubHlcbiAgICAgICAgICAgIGNvbnN0IGxvb2tzUmlnaHQgPSB0aXRsZSA9PT0gQ0ZHLk1PREFMX1RJVExFO1xuICAgICAgICAgICAgaWYgKCFsb29rc1JpZ2h0KSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQgPSAnMSc7XG4gICAgICAgICAgICBkbG9nKCdpbmplY3RpbmcgY29udHJvbHMnKTtcblxuICAgICAgICAgICAgLy8gTWFpbiBhY3Rpb24gKHRoZW1lZCBhbmNob3IgaW5zaWRlIExJIHRvIG1hdGNoIFBsZXggYWN0aW9uIGJhciBzaXppbmcpXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgbGlNYWluLmNsYXNzTmFtZSA9ICdsdC1hY3Rpb24gbHQtYWN0aW9uLS1icmFuZCc7XG4gICAgICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBidG4uaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgYnRuLmlkID0gJ3F0MjAtc3RvY2stbGktYnRuJztcbiAgICAgICAgICAgIGJ0bi5jbGFzc05hbWUgPSAnbHQtYnRuIGx0LWJ0bi0tZ2hvc3QnO1xuICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ0dldCBTdG9jayBMZXZlbHMnO1xuICAgICAgICAgICAgYnRuLnRpdGxlID0gJ0ZldGNoIHN0b2NrIGZvciB0aGlzIHBhcnQgKG5vIHN0YW1wKSc7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGhhbmRsZUNsaWNrKG1vZGFsKTsgfSk7XG4gICAgICAgICAgICBsaU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cbiAgICAgICAgICAgIC8vIEVuZm9yY2UgVW5pdCBQcmljZSBhbmQgJSBNYXJrdXAgbG9ja291dCBpbiB0aGlzIG1vZGFsIGluc3RhbmNlXG4gICAgICAgICAgICB3YXRjaFByaWNpbmdMb2Nrb3V0KG1vZGFsKTtcblxuICAgICAgICAgICAgLy8gTGV0IG90aGVyIG1vZHVsZXMgcmVmcmVzaCBpZiB0aGV5IGNhcmUgKG5vLW9wIGhlcmUpXG4gICAgICAgICAgICBvbk5vZGVSZW1vdmVkKG1vZGFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgVyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6ICh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgPyBnbG9iYWxUaGlzIDogbnVsbCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IENFID0gKFcgJiYgKCdDdXN0b21FdmVudCcgaW4gVykgPyBXLkN1c3RvbUV2ZW50IDogZ2xvYmFsVGhpcy5DdXN0b21FdmVudCk7XG4gICAgICAgICAgICAgICAgaWYgKFcgJiYgVy5kaXNwYXRjaEV2ZW50ICYmIENFKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBXLmRpc3BhdGNoRXZlbnQobmV3IENFKCdMVDpBdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCcsIHsgZGV0YWlsOiB7IHNvdXJjZTogJ1FUMjAnLCB0czogRGF0ZS5ub3coKSB9IH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBkZXJyKCdpbmplY3Q6JywgZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBIVUJfQlROX0lEID0gJ3F0MjAtc3RvY2stYnRuJztcblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsVGl0bGUoKSB7XG4gICAgICAgIGNvbnN0IHQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtZGlhbG9nLXRpdGxlJyk7XG4gICAgICAgIHJldHVybiAodD8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNUYXJnZXRNb2RhbE9wZW4oKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwtb3BlbicpXG4gICAgICAgICAgICAmJiAvXnF1b3RlXFxzKnBhcnRcXHMqZGV0YWlsJC9pLnRlc3QoZ2V0QWN0aXZlTW9kYWxUaXRsZSgpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVNb2RhbFJvb3QoKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMnKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2cnKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJCdXR0b24oKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IGh1YiA9IGx0Py5jb3JlPy5odWI7XG4gICAgICAgIGlmICghaHViIHx8ICFodWIucmVnaXN0ZXJCdXR0b24pIHJldHVybjsgLy8gVUkgbm90IHJlYWR5IHlldFxuXG4gICAgICAgIC8vIERvbid0IGRvdWJsZS1yZWdpc3RlclxuICAgICAgICBpZiAoaHViLmhhcz8uKEhVQl9CVE5fSUQpKSByZXR1cm47XG5cbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1N0b2NrJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRmV0Y2ggc3RvY2sgZm9yIGN1cnJlbnQgcGFydCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IDI1LFxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gaGFuZGxlQ2xpY2soZ2V0QWN0aXZlTW9kYWxSb290KCkpXG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlSHViQnV0dG9uKCkge1xuICAgICAgICBjb25zdCBodWIgPSBsdD8uY29yZT8uaHViO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlYm91bmNlKGZuLCBtcyA9IDUwKSB7XG4gICAgICAgIGxldCBpZCA9IG51bGw7XG4gICAgICAgIHJldHVybiAoLi4uYXJncykgPT4geyBjbGVhclRpbWVvdXQoaWQpOyBpZCA9IHNldFRpbWVvdXQoKCkgPT4gZm4oLi4uYXJncyksIG1zKTsgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5ID0gZGVib3VuY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoaXNUYXJnZXRNb2RhbE9wZW4oKSkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZW1vdmVIdWJCdXR0b24oKTtcbiAgICAgICAgfVxuICAgIH0sIDUwKTtcblxuICAgIC8vID09PT09IEJvb3QgLyBTUEEgd2lyaW5nXG4gICAgbGV0IHN0b3BPYnNlcnZlID0gbnVsbDtcbiAgICBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0TW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgc3RvcE9ic2VydmU/LigpO1xuICAgICAgICBzdG9wT2JzZXJ2ZSA9IHdpbmRvdy5UTVV0aWxzPy5vYnNlcnZlSW5zZXJ0TWFueT8uKENGRy5BQ1RJT05TX1VMX1NFTCwgaW5qZWN0U3RvY2tDb250cm9scyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcE1vZGFsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIHRyeSB7IHN0b3BPYnNlcnZlPy4oKTsgfSBjYXRjaCB7IH0gZmluYWxseSB7IHN0b3BPYnNlcnZlID0gbnVsbDsgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgYXdhaXQgcmFmKCk7XG4gICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgIHN0YXJ0TW9kYWxPYnNlcnZlcigpO1xuXG4gICAgICAgIC8vIFNob3cvaGlkZSB0aGUgYnV0dG9uIGFzIHRoZSBtb2RhbCBvcGVucy9jbG9zZXMgYW5kIHRpdGxlcyBjaGFuZ2VcbiAgICAgICAgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuXG4gICAgICAgIGNvbnN0IGJvZHlPYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGlmIChtdXRzLnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJykpIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJvZHlPYnMub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydjbGFzcyddIH0pO1xuXG4gICAgICAgIC8vIE1vZGFsIHRpdGxlIG1heSBjaGFuZ2UgYWZ0ZXIgb3BlbmluZ1xuICAgICAgICBjb25zdCBtb2RhbFJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMnKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICBjb25zdCB0aXRsZU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKSk7XG4gICAgICAgIHRpdGxlT2JzLm9ic2VydmUobW9kYWxSb290LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuXG4gICAgICAgIGRsb2coJ2luaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBzdG9wTW9kYWxPYnNlcnZlcigpO1xuICAgIH1cblxuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAod2luZG93LlRNVXRpbHM/Lm1hdGNoUm91dGU/LihST1VURVMpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG4gICAgaW5pdCgpO1xuXG4gICAgLy8gRGV2IHNlYW0gKG9wdGlvbmFsKVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQyMF9fID0geyBpbmplY3RTdG9ja0NvbnRyb2xzLCBoYW5kbGVDbGljaywgc3BsaXRCYXNlQW5kUGFjaywgdG9CYXNlUGFydCwgbm9ybWFsaXplUm93VG9QaWVjZXMsIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZCB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxNQUFNLE1BQU8sT0FDUCxPQUNBLGtDQUFrQyxLQUFLLFNBQVMsUUFBUTtBQUU5RCxHQUFDLE1BQU07QUFDSDtBQUdBLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUksUUFBUSxPQUFLLHNCQUFzQixDQUFDLENBQUM7QUFHM0QsUUFBSSxFQUFFLG9CQUFvQixXQUFXLENBQUMsT0FBTyxlQUFnQixRQUFPLGlCQUFpQjtBQUNyRixLQUFDLFlBQVk7QUFDVCxVQUFJO0FBQUUsY0FBTSxPQUFPLGNBQWMsRUFBRSxPQUFPLE9BQU8sZUFBZSxDQUFDO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUFBLElBRWxGLEdBQUc7QUFHSCxVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFNLEdBQUcsS0FBSyxTQUFTLFFBQVEsQ0FBQyxFQUFHO0FBRXBELFVBQU0sTUFBTTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsYUFBYTtBQUFBO0FBQUE7QUFBQSxNQUdiLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLGdCQUFnQjtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxJQUNoQjtBQUdBLG1CQUFl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
