// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.21.3
// @description Adds “Get Stock Levels” on Quote Part Detail and Hub; queries DS 172, normalizes to pieces, and toasts totals. Optionally stamps NoteNew with “Stock: N pcs”. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.21.3-1779399959839
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.21.3-1779399959839
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.21.3-1779399959839
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.21.3-1779399959839
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.21.3-1779399959839
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICAvLyBQcmltYXJ5IEtPIGFuY2hvciBpcyB0aGUgZm9ybSBjb250YWluZXI7IGZhbGxiYWNrcyByZXRhaW5lZCBmb3Igb2xkZXIgbGF5b3V0c1xuICAgICAgICAvLywgLnBsZXgtZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWJpbmRdLCBpbnB1dFtuYW1lPVwiUGFydE5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydE5vTmV3XCJdLCBpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0sIGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXVxuICAgICAgICBBTkNIT1JfU0VMOiAnLnBsZXgtZm9ybS1jb250ZW50JyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TW9kYWxWTShtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrID0gc2VsID0+IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvciA9XG4gICAgICAgICAgICAgICAgcGljaygnLnBsZXgtZm9ybS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICBwaWNrKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgcGljaygnW2RhdGEtYmluZF0nKSB8fFxuICAgICAgICAgICAgICAgIG1vZGFsRWw7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4oYW5jaG9yKSB8fCBLTz8uY29udGV4dEZvcj8uKG1vZGFsRWwpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgfHwgY3R4Py4kcm9vdD8uZGF0YSB8fCBudWxsO1xuXG4gICAgICAgICAgICAvLyBTb21lIGRpYWxvZ3Mgd3JhcCB0aGUgYWN0dWFsIHJlY29yZCBvbiB2bS5kYXRhIG9yIHZtLm1vZGVsXG4gICAgICAgICAgICByZXR1cm4gKHZtICYmICh2bS5kYXRhIHx8IHZtLm1vZGVsKSkgPyAodm0uZGF0YSB8fCB2bS5tb2RlbCkgOiB2bTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKG1vZGFsRWwpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgXHUyMDI2XG4gICAgICAgICAgICBsZXQgcWsgPSBOdW1iZXIobHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpPy5xdW90ZUtleSB8fCAwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHFrID0gbSA/IE51bWJlcihtWzFdKSA6IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZSBLZXkgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgbW9kYWwgVk0gYW5jaG9yZWQgYXQgLnBsZXgtZm9ybS1jb250ZW50XG4gICAgICAgICAgICAvLyBXYWl0IGJyaWVmbHkgZm9yIEtPIHRvIGJpbmQgdGhpcyBtb2RhbCBiZWZvcmUgZ3JhYmJpbmcgaXRzIFZNXG4gICAgICAgICAgICBsZXQgdm1Nb2RhbCA9IGdldE1vZGFsVk0obW9kYWxFbCk7XG4gICAgICAgICAgICBpZiAoIXZtTW9kYWwgJiYgd2luZG93LlRNVXRpbHM/LndhaXRGb3JNb2RlbEFzeW5jKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtZm9ybS1jb250ZW50Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9sbE1zOiAxMjAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IDE1MDAsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1aXJlS286IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSkgPz8ge307XG4gICAgICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHZtTW9kYWwgPSAodmlld01vZGVsLmRhdGEgfHwgdmlld01vZGVsLm1vZGVsIHx8IHZpZXdNb2RlbCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBhbmQgY29udGludWUgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBhd2FpdCByZXNvbHZlUGFydE5vKG1vZGFsRWwsIHZtTW9kYWwgPz8gcm9vdFZNLCB7IHRpbWVvdXRNczogNTAwMCwgcG9sbE1zOiAxNTAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vKSB0aHJvdyBuZXcgRXJyb3IoJ1BhcnRObyBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlUGFydCA9IHRvQmFzZVBhcnQocGFydE5vKTtcblxuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0gfSA9IHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzIHx8IFtdLCBiYXNlUGFydCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gW2BTVEs6ICR7Zm9ybWF0SW50KHN1bSl9IHBjc2BdO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgdG8gTm90ZU5ldyAoY2xlYW4gcHJldmlvdXMgc3RhbXAgaWYgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIC8vIDIpIHJlbW92ZSBhbnkgcHJpb3Igc3RhbXAgdmFyaWFudHMgKG9sZCBTVEsgdy8gYnJlYWtkb3duL3RpbWVzdGFtcCBPUiBwcmlvciBcIlN0b2NrOiBOIHBjc1wiKVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKSg/OlNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/fFN0b2NrOlxccypcXGRbXFxkLF0qXFxzKnBjcylcXHMqL2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcblxuICAgICAgICAgICAgLy8gMykgYnVpbGQgbWluaW1hbCBzdGFtcCBhbmQgYXBwZW5kXG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYDtcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuXG4gICAgICAgICAgICAvLyA0KSB3cml0ZSBiYWNrIHZpYSBLTzsgZmFsbGJhY2sgdG8gZGlyZWN0IHRleHRhcmVhXG4gICAgICAgICAgICBsZXQgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIG5leHROb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRhKSB7IHRhLnZhbHVlID0gbmV4dE5vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IHNldE9rID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBicmVha2Rvd24sIG5vIHN0YW1wIFx1MjAxNCBqdXN0IGEgc2ltcGxlIHRvYXN0XG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1N0b2NrIHJldHJpZXZlZCcsIDEyMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYCwgJ3N1Y2Nlc3MnLCB7IHRvYXN0OiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBkbG9nKCdRVDIwIHN1Y2Nlc3MnLCB7IHFrLCBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0gfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYFN0b2NrIGNoZWNrIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyBubyB0cmFuc2llbnQgVUkgdG8gcmVzdG9yZSBoZXJlOyBrZWVwIGlkZW1wb3RlbnRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByZWZlciBLTyB2aWEgVE1VdGlscy5nZXRPYnNWYWx1ZTsgd29ya3Mgd2l0aCBWTSBvciBET00gbm9kZSAocmVzb2x2ZXMgS08gY29udGV4dCkuXG4gICAgZnVuY3Rpb24gcmVhZFBhcnRGcm9tQW55KG1vZGFsRWwsIHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gW1xuICAgICAgICAgICAgLy8gZGlyZWN0XG4gICAgICAgICAgICAnUGFydE5vJywgJ0l0ZW1ObycsICdQYXJ0X051bWJlcicsICdJdGVtX051bWJlcicsICdQYXJ0JywgJ0l0ZW0nLFxuICAgICAgICAgICAgJ1BhcnROb05ldycsICdQYXJ0Tm9PbGQnLFxuICAgICAgICAgICAgLy8gbmVzdGVkIGNvbW1vblxuICAgICAgICAgICAgJ1F1b3RlUGFydC5QYXJ0Tm8nLCAnUXVvdGVQYXJ0LlBhcnRfTnVtYmVyJyxcbiAgICAgICAgICAgICdTZWxlY3RlZFJvdy5QYXJ0Tm8nLCAnUm93LlBhcnRObycsICdNb2RlbC5QYXJ0Tm8nLFxuICAgICAgICAgICAgLy8gd2hlbiB2bSBpcyB3cmFwcGVyIG9iamVjdHNcbiAgICAgICAgICAgICdkYXRhLlBhcnRObycsICdkYXRhLkl0ZW1ObycsICdtb2RlbC5QYXJ0Tm8nLCAnbW9kZWwuSXRlbU5vJ1xuICAgICAgICBdO1xuICAgICAgICBjb25zdCBUTVUgPSB3aW5kb3cuVE1VdGlscztcblxuICAgICAgICAvLyAxKSBtb2RhbCBWTSBwcmVmZXJyZWRcbiAgICAgICAgaWYgKHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgICAgICBjb25zdCB2Vk0gPSBUTVU/LmdldE9ic1ZhbHVlPy4odm1DYW5kaWRhdGUsIHBhdGhzLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlLCBhbGxvd1BsZXg6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodlZNKSByZXR1cm4gdlZNO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIpIG1vZGFsIGVsZW1lbnQgS08gY29udGV4dFxuICAgICAgICBjb25zdCB2TW9kYWwgPSBUTVU/LmdldE9ic1ZhbHVlPy4obW9kYWxFbCwgcGF0aHMsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUsIGFsbG93UGxleDogdHJ1ZSB9KTtcbiAgICAgICAgaWYgKHZNb2RhbCkgcmV0dXJuIHZNb2RhbDtcbiAgICAgICAgLy8gMykgRE9NIGlucHV0cyAobGFzdCByZXNvcnQpXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJQYXJ0Tm9cIl0saW5wdXRbbmFtZT1cIlBhcnRfTnVtYmVyXCJdLGlucHV0W25hbWU9XCJJdGVtTm9cIl0saW5wdXRbbmFtZT1cIkl0ZW1fTnVtYmVyXCJdJyk7XG4gICAgICAgICAgICBjb25zdCByYXcgPSAoZWw/LnZhbHVlID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAocmF3KSByZXR1cm4gcmF3O1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgLy8gUm9idXN0IHJlc29sdmVyIHRoYXQgcmV0cmllcyBicmllZmx5IHRvIHN1cnZpdmUgS08vbGF5b3V0IHRpbWluZy5cbiAgICBhc3luYyBmdW5jdGlvbiByZXNvbHZlUGFydE5vKG1vZGFsRWwsIHZtQ2FuZGlkYXRlLCB7IHRpbWVvdXRNcyA9IDUwMDAsIHBvbGxNcyA9IDE1MCB9ID0ge30pIHtcbiAgICAgICAgY29uc3QgZGVhZGxpbmUgPSBEYXRlLm5vdygpICsgTWF0aC5tYXgoNTAwLCB0aW1lb3V0TXMgfCAwKTtcbiAgICAgICAgbGV0IGxhc3QgPSAnJztcblxuICAgICAgICB3aGlsZSAoRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG4gICAgICAgICAgICAvLyAxKSBUcnkgdGhlIGZhc3QgcGF0aCAoZXhpc3RpbmcgbG9naWMpXG4gICAgICAgICAgICBjb25zdCB2ID0gcmVhZFBhcnRGcm9tQW55KG1vZGFsRWwsIHZtQ2FuZGlkYXRlKTtcbiAgICAgICAgICAgIGlmICh2KSByZXR1cm4gdjtcbiAgICAgICAgICAgIGxhc3QgPSB2IHx8IGxhc3Q7XG5cbiAgICAgICAgICAgIC8vIDIpIE51ZGdlIERPTSB0byBjb21taXQgcGVuZGluZyBpbnB1dCBcdTIxOTIgS08gKGJsdXIvY2hhbmdlKVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJQYXJ0Tm9cIl0saW5wdXRbbmFtZT1cIlBhcnRfTnVtYmVyXCJdLGlucHV0W25hbWU9XCJJdGVtTm9cIl0saW5wdXRbbmFtZT1cIkl0ZW1fTnVtYmVyXCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgICAgICAgICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG5cbiAgICAgICAgICAgIC8vIDMpIFlpZWxkICsgc21hbGwgZGVsYXkgdG8gbGV0IEtPIHNldHRsZVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIE1hdGgubWF4KDUwLCBwb2xsTXMgfCAwKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxhc3Q7IC8vIHN0aWxsICcnLCBjYWxsZXIgd2lsbCBoYW5kbGVcbiAgICB9XG5cbiAgICAvLyA9PT09PSBQcmljaW5nIGNvbHVtbnMgbG9ja291dCAoaGlkZSwgZGlzYWJsZSwgYW5kIHJlLWFwcGx5IG9uIHJlLXJlbmRlcilcbiAgICBmdW5jdGlvbiBmaW5kSGVhZGVySW5kZXhlcyhtb2RhbEVsLCBoZWFkZXJUZXh0cykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgaGRyID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkLWNvbnRhaW5lciAucGxleC1ncmlkLWhlYWRlciB0aGVhZCcpO1xuICAgICAgICAgICAgaWYgKCFoZHIpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gWy4uLmhkci5xdWVyeVNlbGVjdG9yQWxsKCd0aCAucGxleC1ncmlkLWhlYWRlci1pbm5lci1jb250ZW50IGFiYnInKV07XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHdhbnQgb2YgaGVhZGVyVGV4dHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZHggPSBjZWxscy5maW5kSW5kZXgoYSA9PiBhICYmIGEudGV4dENvbnRlbnQgJiYgYS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHdhbnQpLnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID49IDApIHNldC5hZGQoaWR4KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbLi4uc2V0XS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gW107IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoaWRlQ29sdW1uc0J5SW5kZXhlcyhtb2RhbEVsLCBpZHhzKSB7XG4gICAgICAgIGlmICghaWR4cyB8fCAhaWR4cy5sZW5ndGgpIHJldHVybjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIDEpIEhlYWRlcnNcbiAgICAgICAgICAgIGNvbnN0IGhkckNlbGxzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLWNvbnRhaW5lciAucGxleC1ncmlkLWhlYWRlciB0aGVhZCB0aCcpO1xuICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4geyBpZiAoaGRyQ2VsbHNbaV0pIGhkckNlbGxzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuXG4gICAgICAgICAgICAvLyAyKSBCb2R5IGNlbGxzXG4gICAgICAgICAgICBjb25zdCBib2R5Um93cyA9IG1vZGFsRWwucXVlcnlTZWxlY3RvckFsbCgnLnBsZXgtZ3JpZC13cmFwcGVyIC5wbGV4LWdyaWQgdGJvZHkgdHInKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiBib2R5Um93cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRkcyA9IHIuY2hpbGRyZW47XG4gICAgICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4geyBpZiAodGRzICYmIHRkc1tpXSkgdGRzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAzKSBDb2xncm91cHMgdG8ga2VlcCB3aWR0aHMgc2FuZVxuICAgICAgICAgICAgY29uc3QgY29sZ3JvdXBzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLWNvbnRhaW5lciBjb2xncm91cCwgLnBsZXgtZ3JpZC13cmFwcGVyIGNvbGdyb3VwJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNnIG9mIGNvbGdyb3Vwcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHMgPSBjZy5xdWVyeVNlbGVjdG9yQWxsKCdjb2wnKTtcbiAgICAgICAgICAgICAgICBpZHhzLmZvckVhY2goaSA9PiB7IGlmIChjb2xzW2ldKSBjb2xzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogbm8tb3AgKi8gfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRpc2FibGVJbnB1dHNJbkxvY2tlZENvbHVtbnMobW9kYWxFbCwgaWR4cykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQWxzbyBkaXJlY3RseSB0YXJnZXQga25vd24gZmllbGQgbmFtZXMgd2UgbmV2ZXIgYWxsb3dcbiAgICAgICAgICAgIGNvbnN0IGhhcmROYW1lcyA9IFsnTmV3VW5pdFByaWNlJywgJ05ld1BlcmNlbnRNYXJrdXAnLCAnUGVyY2VudE1hcmt1cCcsICdNYXJrdXBQZXJjZW50J107XG4gICAgICAgICAgICBjb25zdCBoYXJkU2VsID0gaGFyZE5hbWVzLm1hcChuID0+IGBpbnB1dFtuYW1lPVwiJHtufVwiXSx0ZXh0YXJlYVtuYW1lPVwiJHtufVwiXSxzZWxlY3RbbmFtZT1cIiR7bn1cIl1gKS5qb2luKCcsJyk7XG4gICAgICAgICAgICBjb25zdCBtYXJrUmVhZE9ubHkgPSBlbCA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZWFkT25seScgaW4gZWwpIGVsLnJlYWRPbmx5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdkaXNhYmxlZCcgaW4gZWwpIGVsLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlKCdhcmlhLXJlYWRvbmx5JywgJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgZWwudGl0bGUgPSAnRGlzYWJsZWQgYnkgcG9saWN5JztcbiAgICAgICAgICAgICAgICAgICAgZWwuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gTWFyayBhbnkga25vd24gbmFtZWQgY29udHJvbHMgbm93XG4gICAgICAgICAgICB0cnkgeyBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3JBbGwoaGFyZFNlbCkuZm9yRWFjaChtYXJrUmVhZE9ubHkpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAvLyBFdmVudC1sZXZlbCBoYXJkIGJsb2NrIGZvciBhbnkgaW5wdXQgbGl2aW5nIGluc2lkZSBsb2NrZWQgVERzXG4gICAgICAgICAgICBjb25zdCBpZHhTZXQgPSBuZXcgU2V0KGlkeHMpO1xuICAgICAgICAgICAgY29uc3QgaXNJbkxvY2tlZENlbGwgPSAobm9kZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRkID0gbm9kZT8uY2xvc2VzdD8uKCd0ZCcpO1xuICAgICAgICAgICAgICAgIGlmICghdGQgfHwgdHlwZW9mIHRkLmNlbGxJbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWR4U2V0Lmhhcyh0ZC5jZWxsSW5kZXgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gQXZvaWQgZHVwbGljYXRlIGxpc3RlbmVycyBwZXIgbW9kYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIGlmICghbW9kYWxFbC5kYXRhc2V0LnF0MjBMb2Nrb3V0TGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgICAgbW9kYWxFbC5kYXRhc2V0LnF0MjBMb2Nrb3V0TGlzdGVuZXJzID0gJzEnO1xuXG4gICAgICAgICAgICAgICAgbW9kYWxFbC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c2luJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGUudGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiAoaXNJbkxvY2tlZENlbGwodCkgfHwgKHQubWF0Y2hlcyAmJiB0Lm1hdGNoZXMoaGFyZFNlbCkpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgdC5ibHVyPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/Lm5vdGlmeT8uKCdUaGlzIGZpZWxkIGlzIGNvbnRyb2xsZWQgYnkgcG9saWN5IGFuZCBjYW5ub3QgYmUgZWRpdGVkIGhlcmUuJywgJ3dhcm5pbmcnLCB7IHRvYXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICBtb2RhbEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIChpc0luTG9ja2VkQ2VsbCh0KSB8fCAodC5tYXRjaGVzICYmIHQubWF0Y2hlcyhoYXJkU2VsKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpOyBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgICAgIG1vZGFsRWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIChpc0luTG9ja2VkQ2VsbCh0KSB8fCAodC5tYXRjaGVzICYmIHQubWF0Y2hlcyhoYXJkU2VsKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoJ3ZhbHVlJyBpbiB0KSB0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpOyBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCB0cnVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWxzbyBzd2VlcCBleGlzdGluZyBpbnB1dHMgaW4gdGhvc2UgVERzIGFuZCBtYXJrIHRoZW0gcmVhZC1vbmx5XG4gICAgICAgICAgICBjb25zdCByb3dzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLXdyYXBwZXIgLnBsZXgtZ3JpZCB0Ym9keSB0cicpO1xuICAgICAgICAgICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgICAgICAgICBpZHhzLmZvckVhY2goaSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRkID0gci5jaGlsZHJlbj8uW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHRkLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LHRleHRhcmVhLHNlbGVjdCcpLmZvckVhY2gobWFya1JlYWRPbmx5KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIG5vLW9wICovIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsb2Nrb3V0UHJpY2luZ0NvbHVtbnMobW9kYWxFbCkge1xuICAgICAgICAvLyBDb2x1bW5zIHRvIGhpZGUvbG9jayBieSBoZWFkZXIgdGV4dFxuICAgICAgICBjb25zdCBpZHhzID0gZmluZEhlYWRlckluZGV4ZXMobW9kYWxFbCwgWydVbml0IFByaWNlJywgJyUgTWFya3VwJywgJyQgTWFya3VwJ10pO1xuICAgICAgICAvLyBEaXNhYmxlIGFueSBpbnB1dHMgaW5zaWRlIHRob3NlIGNvbHVtbnMgKGFuZCBrbm93biBmaWVsZCBuYW1lcylcbiAgICAgICAgZGlzYWJsZUlucHV0c0luTG9ja2VkQ29sdW1ucyhtb2RhbEVsLCBpZHhzKTtcbiAgICAgICAgLy8gSGlkZSB0aGUgY29sdW1ucyB2aXN1YWxseVxuICAgICAgICBoaWRlQ29sdW1uc0J5SW5kZXhlcyhtb2RhbEVsLCBpZHhzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YXRjaFByaWNpbmdMb2Nrb3V0KG1vZGFsRWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEFwcGx5IGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBsb2Nrb3V0UHJpY2luZ0NvbHVtbnMobW9kYWxFbCk7XG4gICAgICAgICAgICAvLyBSZS1hcHBseSBvbiBncmlkIHJlLXJlbmRlciAoUGxleCByZWJpbmRpbmcpXG4gICAgICAgICAgICBjb25zdCByb290ID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkLWNvbnRhaW5lcicpIHx8IG1vZGFsRWw7XG4gICAgICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IGxvY2tvdXRQcmljaW5nQ29sdW1ucyhtb2RhbEVsKSk7XG4gICAgICAgICAgICBtby5vYnNlcnZlKHJvb3QsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICAgICAgLy8gU3RvcCB3aGVuIG1vZGFsIGlzIHJlbW92ZWRcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWxFbCwgKCkgPT4gbW8uZGlzY29ubmVjdCgpKTtcbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gTW9kYWwgd2lyaW5nIChpZGVtcG90ZW50IHBlciBtb2RhbClcbiAgICBmdW5jdGlvbiBvbk5vZGVSZW1vdmVkKG5vZGUsIGNiKSB7XG4gICAgICAgIGlmICghbm9kZSB8fCAhbm9kZS5vd25lckRvY3VtZW50KSByZXR1cm4gKCkgPT4geyB9O1xuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBtIG9mIG11dHMpIGZvciAoY29uc3QgbiBvZiBtLnJlbW92ZWROb2RlcyB8fCBbXSkge1xuICAgICAgICAgICAgICAgIGlmIChuID09PSBub2RlIHx8IChuLmNvbnRhaW5zICYmIG4uY29udGFpbnMobm9kZSkpKSB7IHRyeSB7IGNiKCk7IH0gZmluYWxseSB7IG1vLmRpc2Nvbm5lY3QoKTsgfSByZXR1cm47IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG1vLm9ic2VydmUobm9kZS5vd25lckRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICByZXR1cm4gKCkgPT4gbW8uZGlzY29ubmVjdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluamVjdFN0b2NrQ29udHJvbHModWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1vZGFsID0gdWwuY2xvc2VzdCgnLnBsZXgtZGlhbG9nJyk7XG4gICAgICAgICAgICBjb25zdCB0aXRsZSA9IG1vZGFsPy5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctdGl0bGUnKT8udGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgICAgIC8vIG9wdGlvbnMgcmVtb3ZlZDogbWF0Y2ggYnkgdGl0bGUgb25seVxuICAgICAgICAgICAgY29uc3QgbG9va3NSaWdodCA9IHRpdGxlID09PSBDRkcuTU9EQUxfVElUTEU7XG4gICAgICAgICAgICBpZiAoIWxvb2tzUmlnaHQpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKHVsLmRhdGFzZXQucXQyMEluamVjdGVkKSByZXR1cm47XG4gICAgICAgICAgICB1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCA9ICcxJztcbiAgICAgICAgICAgIGRsb2coJ2luamVjdGluZyBjb250cm9scycpO1xuXG4gICAgICAgICAgICAvLyBNYWluIGFjdGlvbiAodGhlbWVkIGFuY2hvciBpbnNpZGUgTEkgdG8gbWF0Y2ggUGxleCBhY3Rpb24gYmFyIHNpemluZylcbiAgICAgICAgICAgIGNvbnN0IGxpTWFpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBsaU1haW4uY2xhc3NOYW1lID0gJ2x0LWFjdGlvbiBsdC1hY3Rpb24tLWJyYW5kJztcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgICAgIGJ0bi5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBidG4uaWQgPSAncXQyMC1zdG9jay1saS1idG4nO1xuICAgICAgICAgICAgYnRuLmNsYXNzTmFtZSA9ICdsdC1idG4gbHQtYnRuLS1naG9zdCc7XG4gICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAnR2V0IFN0b2NrIExldmVscyc7XG4gICAgICAgICAgICBidG4udGl0bGUgPSAnRmV0Y2ggc3RvY2sgZm9yIHRoaXMgcGFydCAobm8gc3RhbXApJztcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgaGFuZGxlQ2xpY2sobW9kYWwpOyB9KTtcbiAgICAgICAgICAgIGxpTWFpbi5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gRW5mb3JjZSBVbml0IFByaWNlIGFuZCAlIE1hcmt1cCBsb2Nrb3V0IGluIHRoaXMgbW9kYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIHdhdGNoUHJpY2luZ0xvY2tvdXQobW9kYWwpO1xuXG4gICAgICAgICAgICAvLyBMZXQgb3RoZXIgbW9kdWxlcyByZWZyZXNoIGlmIHRoZXkgY2FyZSAobm8tb3AgaGVyZSlcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBXID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgQ0UgPSAoVyAmJiAoJ0N1c3RvbUV2ZW50JyBpbiBXKSA/IFcuQ3VzdG9tRXZlbnQgOiBnbG9iYWxUaGlzLkN1c3RvbUV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoVyAmJiBXLmRpc3BhdGNoRXZlbnQgJiYgQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuZGlzcGF0Y2hFdmVudChuZXcgQ0UoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgeyBkZXRhaWw6IHsgc291cmNlOiAnUVQyMCcsIHRzOiBEYXRlLm5vdygpIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRlcnIoJ2luamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQyMC1zdG9jay1idG4nO1xuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlTW9kYWxUaXRsZSgpIHtcbiAgICAgICAgY29uc3QgdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucyAucGxleC1kaWFsb2ctdGl0bGUnKTtcbiAgICAgICAgcmV0dXJuICh0Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1RhcmdldE1vZGFsT3BlbigpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbC1vcGVuJylcbiAgICAgICAgICAgICYmIC9ecXVvdGVcXHMqcGFydFxccypkZXRhaWwkL2kudGVzdChnZXRBY3RpdmVNb2RhbFRpdGxlKCkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsUm9vdCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZycpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgaHViID0gbHQ/LmNvcmU/Lmh1YjtcbiAgICAgICAgaWYgKCFodWIgfHwgIWh1Yi5yZWdpc3RlckJ1dHRvbikgcmV0dXJuOyAvLyBVSSBub3QgcmVhZHkgeWV0XG5cbiAgICAgICAgLy8gRG9uJ3QgZG91YmxlLXJlZ2lzdGVyXG4gICAgICAgIGlmIChodWIuaGFzPy4oSFVCX0JUTl9JRCkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnU3RvY2snLFxuICAgICAgICAgICAgdGl0bGU6ICdGZXRjaCBzdG9jayBmb3IgY3VycmVudCBwYXJ0JyxcbiAgICAgICAgICAgIHdlaWdodDogMjUsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBoYW5kbGVDbGljayhnZXRBY3RpdmVNb2RhbFJvb3QoKSlcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVIdWJCdXR0b24oKSB7XG4gICAgICAgIGNvbnN0IGh1YiA9IGx0Py5jb3JlPy5odWI7XG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVib3VuY2UoZm4sIG1zID0gNTApIHtcbiAgICAgICAgbGV0IGlkID0gbnVsbDtcbiAgICAgICAgcmV0dXJuICguLi5hcmdzKSA9PiB7IGNsZWFyVGltZW91dChpZCk7IGlkID0gc2V0VGltZW91dCgoKSA9PiBmbiguLi5hcmdzKSwgbXMpOyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkgPSBkZWJvdW5jZShhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChpc1RhcmdldE1vZGFsT3BlbigpKSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbW92ZUh1YkJ1dHRvbigpO1xuICAgICAgICB9XG4gICAgfSwgNTApO1xuXG4gICAgLy8gPT09PT0gQm9vdCAvIFNQQSB3aXJpbmdcbiAgICBsZXQgc3RvcE9ic2VydmUgPSBudWxsO1xuICAgIGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGxldCBib290ZWQgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICBzdG9wT2JzZXJ2ZT8uKCk7XG4gICAgICAgIHN0b3BPYnNlcnZlID0gd2luZG93LlRNVXRpbHM/Lm9ic2VydmVJbnNlcnRNYW55Py4oQ0ZHLkFDVElPTlNfVUxfU0VMLCBpbmplY3RTdG9ja0NvbnRyb2xzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wTW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSBmaW5hbGx5IHsgc3RvcE9ic2VydmUgPSBudWxsOyB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuICAgICAgICBhd2FpdCByYWYoKTtcbiAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgc3RhcnRNb2RhbE9ic2VydmVyKCk7XG5cbiAgICAgICAgLy8gU2hvdy9oaWRlIHRoZSBidXR0b24gYXMgdGhlIG1vZGFsIG9wZW5zL2Nsb3NlcyBhbmQgdGl0bGVzIGNoYW5nZVxuICAgICAgICByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgY29uc3QgYm9keU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgaWYgKG11dHMuc29tZShtID0+IG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnKSkgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgYm9keU9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10gfSk7XG5cbiAgICAgICAgLy8gTW9kYWwgdGl0bGUgbWF5IGNoYW5nZSBhZnRlciBvcGVuaW5nXG4gICAgICAgIGNvbnN0IG1vZGFsUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgIGNvbnN0IHRpdGxlT2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgdGl0bGVPYnMub2JzZXJ2ZShtb2RhbFJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG5cbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHN0b3BNb2RhbE9ic2VydmVyKCk7XG4gICAgfVxuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmICh3aW5kb3cuVE1VdGlscz8ubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbiAgICBpbml0KCk7XG5cbiAgICAvLyBEZXYgc2VhbSAob3B0aW9uYWwpXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDIwX18gPSB7IGluamVjdFN0b2NrQ29udHJvbHMsIGhhbmRsZUNsaWNrLCBzcGxpdEJhc2VBbmRQYWNrLCB0b0Jhc2VQYXJ0LCBub3JtYWxpemVSb3dUb1BpZWNlcywgc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLE1BQU0sTUFBTyxPQUNQLE9BQ0Esa0NBQWtDLEtBQUssU0FBUyxRQUFRO0FBRTlELEdBQUMsTUFBTTtBQUNIO0FBR0EsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxLQUFNLE9BQU8saUJBQWlCLGNBQWMsYUFBYSxLQUFLLE9BQU87QUFDM0UsVUFBTSxNQUFNLE1BQU0sSUFBSSxRQUFRLE9BQUssc0JBQXNCLENBQUMsQ0FBQztBQUczRCxRQUFJLEVBQUUsb0JBQW9CLFdBQVcsQ0FBQyxPQUFPLGVBQWdCLFFBQU8saUJBQWlCO0FBQ3JGLEtBQUMsWUFBWTtBQUNULFVBQUk7QUFBRSxjQUFNLE9BQU8sY0FBYyxFQUFFLE9BQU8sT0FBTyxlQUFlLENBQUM7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
