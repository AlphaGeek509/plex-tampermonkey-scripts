// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.1.10
// @description Adds “Get Stock Levels” on Quote Part Detail and Hub; queries DS 172, normalizes to pieces, and toasts totals. Optionally stamps NoteNew with “Stock: N pcs”. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=4.1.10-1761845775538
// @require     http://localhost:5000/lt-plex-auth.user.js?v=4.1.10-1761845775538
// @require     http://localhost:5000/lt-ui-hub.js?v=4.1.10-1761845775538
// @require     http://localhost:5000/lt-core.user.js?v=4.1.10-1761845775538
// @require     http://localhost:5000/lt-data-core.user.js?v=4.1.10-1761845775538
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICAvLyBQcmltYXJ5IEtPIGFuY2hvciBpcyB0aGUgZm9ybSBjb250YWluZXI7IGZhbGxiYWNrcyByZXRhaW5lZCBmb3Igb2xkZXIgbGF5b3V0c1xuICAgICAgICAvLywgLnBsZXgtZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWJpbmRdLCBpbnB1dFtuYW1lPVwiUGFydE5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydE5vTmV3XCJdLCBpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0sIGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXVxuICAgICAgICBBTkNIT1JfU0VMOiAnLnBsZXgtZm9ybS1jb250ZW50JyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TW9kYWxWTShtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrID0gc2VsID0+IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvciA9XG4gICAgICAgICAgICAgICAgcGljaygnLnBsZXgtZm9ybS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICBwaWNrKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgcGljaygnW2RhdGEtYmluZF0nKSB8fFxuICAgICAgICAgICAgICAgIG1vZGFsRWw7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4oYW5jaG9yKSB8fCBLTz8uY29udGV4dEZvcj8uKG1vZGFsRWwpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgfHwgY3R4Py4kcm9vdD8uZGF0YSB8fCBudWxsO1xuXG4gICAgICAgICAgICAvLyBTb21lIGRpYWxvZ3Mgd3JhcCB0aGUgYWN0dWFsIHJlY29yZCBvbiB2bS5kYXRhIG9yIHZtLm1vZGVsXG4gICAgICAgICAgICByZXR1cm4gKHZtICYmICh2bS5kYXRhIHx8IHZtLm1vZGVsKSkgPyAodm0uZGF0YSB8fCB2bS5tb2RlbCkgOiB2bTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKG1vZGFsRWwpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgXHUyMDI2XG4gICAgICAgICAgICBsZXQgcWsgPSBOdW1iZXIobHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpPy5xdW90ZUtleSB8fCAwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHFrID0gbSA/IE51bWJlcihtWzFdKSA6IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZSBLZXkgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgbW9kYWwgVk0gYW5jaG9yZWQgYXQgLnBsZXgtZm9ybS1jb250ZW50XG4gICAgICAgICAgICAvLyBXYWl0IGJyaWVmbHkgZm9yIEtPIHRvIGJpbmQgdGhpcyBtb2RhbCBiZWZvcmUgZ3JhYmJpbmcgaXRzIFZNXG4gICAgICAgICAgICBsZXQgdm1Nb2RhbCA9IGdldE1vZGFsVk0obW9kYWxFbCk7XG4gICAgICAgICAgICBpZiAoIXZtTW9kYWwgJiYgd2luZG93LlRNVXRpbHM/LndhaXRGb3JNb2RlbEFzeW5jKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtZm9ybS1jb250ZW50Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9sbE1zOiAxMjAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IDE1MDAsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1aXJlS286IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSkgPz8ge307XG4gICAgICAgICAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHZtTW9kYWwgPSAodmlld01vZGVsLmRhdGEgfHwgdmlld01vZGVsLm1vZGVsIHx8IHZpZXdNb2RlbCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBhbmQgY29udGludWUgKi8gfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSBhd2FpdCByZXNvbHZlUGFydE5vKG1vZGFsRWwsIHZtTW9kYWwgPz8gcm9vdFZNLCB7IHRpbWVvdXRNczogNTAwMCwgcG9sbE1zOiAxNTAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vKSB0aHJvdyBuZXcgRXJyb3IoJ1BhcnRObyBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlUGFydCA9IHRvQmFzZVBhcnQocGFydE5vKTtcblxuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0gfSA9IHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzIHx8IFtdLCBiYXNlUGFydCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gW2BTVEs6ICR7Zm9ybWF0SW50KHN1bSl9IHBjc2BdO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgdG8gTm90ZU5ldyAoY2xlYW4gcHJldmlvdXMgc3RhbXAgaWYgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIC8vIDIpIHJlbW92ZSBhbnkgcHJpb3Igc3RhbXAgdmFyaWFudHMgKG9sZCBTVEsgdy8gYnJlYWtkb3duL3RpbWVzdGFtcCBPUiBwcmlvciBcIlN0b2NrOiBOIHBjc1wiKVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKSg/OlNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/fFN0b2NrOlxccypcXGRbXFxkLF0qXFxzKnBjcylcXHMqL2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcblxuICAgICAgICAgICAgLy8gMykgYnVpbGQgbWluaW1hbCBzdGFtcCBhbmQgYXBwZW5kXG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYDtcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuXG4gICAgICAgICAgICAvLyA0KSB3cml0ZSBiYWNrIHZpYSBLTzsgZmFsbGJhY2sgdG8gZGlyZWN0IHRleHRhcmVhXG4gICAgICAgICAgICBsZXQgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIG5leHROb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRhKSB7IHRhLnZhbHVlID0gbmV4dE5vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IHNldE9rID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBicmVha2Rvd24sIG5vIHN0YW1wIFx1MjAxNCBqdXN0IGEgc2ltcGxlIHRvYXN0XG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1N0b2NrIHJldHJpZXZlZCcsIDEyMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYCwgJ3N1Y2Nlc3MnLCB7IHRvYXN0OiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBkbG9nKCdRVDIwIHN1Y2Nlc3MnLCB7IHFrLCBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0gfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGFzay5lcnJvcignRmFpbGVkJyk7XG4gICAgICAgICAgICBsdC5jb3JlLmh1Yi5ub3RpZnkoYFN0b2NrIGNoZWNrIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgdG9hc3Q6IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGRlcnIoJ2hhbmRsZUNsaWNrOicsIGVycik7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAvLyBubyB0cmFuc2llbnQgVUkgdG8gcmVzdG9yZSBoZXJlOyBrZWVwIGlkZW1wb3RlbnRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByZWZlciBLTyB2aWEgVE1VdGlscy5nZXRPYnNWYWx1ZTsgd29ya3Mgd2l0aCBWTSBvciBET00gbm9kZSAocmVzb2x2ZXMgS08gY29udGV4dCkuXG4gICAgZnVuY3Rpb24gcmVhZFBhcnRGcm9tQW55KG1vZGFsRWwsIHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gW1xuICAgICAgICAgICAgLy8gZGlyZWN0XG4gICAgICAgICAgICAnUGFydE5vJywgJ0l0ZW1ObycsICdQYXJ0X051bWJlcicsICdJdGVtX051bWJlcicsICdQYXJ0JywgJ0l0ZW0nLFxuICAgICAgICAgICAgJ1BhcnROb05ldycsICdQYXJ0Tm9PbGQnLFxuICAgICAgICAgICAgLy8gbmVzdGVkIGNvbW1vblxuICAgICAgICAgICAgJ1F1b3RlUGFydC5QYXJ0Tm8nLCAnUXVvdGVQYXJ0LlBhcnRfTnVtYmVyJyxcbiAgICAgICAgICAgICdTZWxlY3RlZFJvdy5QYXJ0Tm8nLCAnUm93LlBhcnRObycsICdNb2RlbC5QYXJ0Tm8nLFxuICAgICAgICAgICAgLy8gd2hlbiB2bSBpcyB3cmFwcGVyIG9iamVjdHNcbiAgICAgICAgICAgICdkYXRhLlBhcnRObycsICdkYXRhLkl0ZW1ObycsICdtb2RlbC5QYXJ0Tm8nLCAnbW9kZWwuSXRlbU5vJ1xuICAgICAgICBdO1xuICAgICAgICBjb25zdCBUTVUgPSB3aW5kb3cuVE1VdGlscztcblxuICAgICAgICAvLyAxKSBtb2RhbCBWTSBwcmVmZXJyZWRcbiAgICAgICAgaWYgKHZtQ2FuZGlkYXRlKSB7XG4gICAgICAgICAgICBjb25zdCB2Vk0gPSBUTVU/LmdldE9ic1ZhbHVlPy4odm1DYW5kaWRhdGUsIHBhdGhzLCB7IGZpcnN0OiB0cnVlLCB0cmltOiB0cnVlLCBhbGxvd1BsZXg6IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodlZNKSByZXR1cm4gdlZNO1xuICAgICAgICB9XG4gICAgICAgIC8vIDIpIG1vZGFsIGVsZW1lbnQgS08gY29udGV4dFxuICAgICAgICBjb25zdCB2TW9kYWwgPSBUTVU/LmdldE9ic1ZhbHVlPy4obW9kYWxFbCwgcGF0aHMsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUsIGFsbG93UGxleDogdHJ1ZSB9KTtcbiAgICAgICAgaWYgKHZNb2RhbCkgcmV0dXJuIHZNb2RhbDtcbiAgICAgICAgLy8gMykgRE9NIGlucHV0cyAobGFzdCByZXNvcnQpXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJQYXJ0Tm9cIl0saW5wdXRbbmFtZT1cIlBhcnRfTnVtYmVyXCJdLGlucHV0W25hbWU9XCJJdGVtTm9cIl0saW5wdXRbbmFtZT1cIkl0ZW1fTnVtYmVyXCJdJyk7XG4gICAgICAgICAgICBjb25zdCByYXcgPSAoZWw/LnZhbHVlID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAocmF3KSByZXR1cm4gcmF3O1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgLy8gUm9idXN0IHJlc29sdmVyIHRoYXQgcmV0cmllcyBicmllZmx5IHRvIHN1cnZpdmUgS08vbGF5b3V0IHRpbWluZy5cbiAgICBhc3luYyBmdW5jdGlvbiByZXNvbHZlUGFydE5vKG1vZGFsRWwsIHZtQ2FuZGlkYXRlLCB7IHRpbWVvdXRNcyA9IDUwMDAsIHBvbGxNcyA9IDE1MCB9ID0ge30pIHtcbiAgICAgICAgY29uc3QgZGVhZGxpbmUgPSBEYXRlLm5vdygpICsgTWF0aC5tYXgoNTAwLCB0aW1lb3V0TXMgfCAwKTtcbiAgICAgICAgbGV0IGxhc3QgPSAnJztcblxuICAgICAgICB3aGlsZSAoRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG4gICAgICAgICAgICAvLyAxKSBUcnkgdGhlIGZhc3QgcGF0aCAoZXhpc3RpbmcgbG9naWMpXG4gICAgICAgICAgICBjb25zdCB2ID0gcmVhZFBhcnRGcm9tQW55KG1vZGFsRWwsIHZtQ2FuZGlkYXRlKTtcbiAgICAgICAgICAgIGlmICh2KSByZXR1cm4gdjtcbiAgICAgICAgICAgIGxhc3QgPSB2IHx8IGxhc3Q7XG5cbiAgICAgICAgICAgIC8vIDIpIE51ZGdlIERPTSB0byBjb21taXQgcGVuZGluZyBpbnB1dCBcdTIxOTIgS08gKGJsdXIvY2hhbmdlKVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJQYXJ0Tm9cIl0saW5wdXRbbmFtZT1cIlBhcnRfTnVtYmVyXCJdLGlucHV0W25hbWU9XCJJdGVtTm9cIl0saW5wdXRbbmFtZT1cIkl0ZW1fTnVtYmVyXCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgICAgICAgICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5vbi1mYXRhbCAqLyB9XG5cbiAgICAgICAgICAgIC8vIDMpIFlpZWxkICsgc21hbGwgZGVsYXkgdG8gbGV0IEtPIHNldHRsZVxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIE1hdGgubWF4KDUwLCBwb2xsTXMgfCAwKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxhc3Q7IC8vIHN0aWxsICcnLCBjYWxsZXIgd2lsbCBoYW5kbGVcbiAgICB9XG5cbiAgICAvLyA9PT09PSBQcmljaW5nIGNvbHVtbnMgbG9ja291dCAoaGlkZSwgZGlzYWJsZSwgYW5kIHJlLWFwcGx5IG9uIHJlLXJlbmRlcilcbiAgICBmdW5jdGlvbiBmaW5kSGVhZGVySW5kZXhlcyhtb2RhbEVsLCBoZWFkZXJUZXh0cykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgaGRyID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkLWNvbnRhaW5lciAucGxleC1ncmlkLWhlYWRlciB0aGVhZCcpO1xuICAgICAgICAgICAgaWYgKCFoZHIpIHJldHVybiBbXTtcbiAgICAgICAgICAgIGNvbnN0IGNlbGxzID0gWy4uLmhkci5xdWVyeVNlbGVjdG9yQWxsKCd0aCAucGxleC1ncmlkLWhlYWRlci1pbm5lci1jb250ZW50IGFiYnInKV07XG4gICAgICAgICAgICBjb25zdCBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHdhbnQgb2YgaGVhZGVyVGV4dHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpZHggPSBjZWxscy5maW5kSW5kZXgoYSA9PiBhICYmIGEudGV4dENvbnRlbnQgJiYgYS50ZXh0Q29udGVudC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gU3RyaW5nKHdhbnQpLnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgICAgICBpZiAoaWR4ID49IDApIHNldC5hZGQoaWR4KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbLi4uc2V0XS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gW107IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoaWRlQ29sdW1uc0J5SW5kZXhlcyhtb2RhbEVsLCBpZHhzKSB7XG4gICAgICAgIGlmICghaWR4cyB8fCAhaWR4cy5sZW5ndGgpIHJldHVybjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIDEpIEhlYWRlcnNcbiAgICAgICAgICAgIGNvbnN0IGhkckNlbGxzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLWNvbnRhaW5lciAucGxleC1ncmlkLWhlYWRlciB0aGVhZCB0aCcpO1xuICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4geyBpZiAoaGRyQ2VsbHNbaV0pIGhkckNlbGxzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuXG4gICAgICAgICAgICAvLyAyKSBCb2R5IGNlbGxzXG4gICAgICAgICAgICBjb25zdCBib2R5Um93cyA9IG1vZGFsRWwucXVlcnlTZWxlY3RvckFsbCgnLnBsZXgtZ3JpZC13cmFwcGVyIC5wbGV4LWdyaWQgdGJvZHkgdHInKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgciBvZiBib2R5Um93cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRkcyA9IHIuY2hpbGRyZW47XG4gICAgICAgICAgICAgICAgaWR4cy5mb3JFYWNoKGkgPT4geyBpZiAodGRzICYmIHRkc1tpXSkgdGRzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAzKSBDb2xncm91cHMgdG8ga2VlcCB3aWR0aHMgc2FuZVxuICAgICAgICAgICAgY29uc3QgY29sZ3JvdXBzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLWNvbnRhaW5lciBjb2xncm91cCwgLnBsZXgtZ3JpZC13cmFwcGVyIGNvbGdyb3VwJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGNnIG9mIGNvbGdyb3Vwcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHMgPSBjZy5xdWVyeVNlbGVjdG9yQWxsKCdjb2wnKTtcbiAgICAgICAgICAgICAgICBpZHhzLmZvckVhY2goaSA9PiB7IGlmIChjb2xzW2ldKSBjb2xzW2ldLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogbm8tb3AgKi8gfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRpc2FibGVJbnB1dHNJbkxvY2tlZENvbHVtbnMobW9kYWxFbCwgaWR4cykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQWxzbyBkaXJlY3RseSB0YXJnZXQga25vd24gZmllbGQgbmFtZXMgd2UgbmV2ZXIgYWxsb3dcbiAgICAgICAgICAgIGNvbnN0IGhhcmROYW1lcyA9IFsnTmV3VW5pdFByaWNlJywgJ05ld1BlcmNlbnRNYXJrdXAnLCAnUGVyY2VudE1hcmt1cCcsICdNYXJrdXBQZXJjZW50J107XG4gICAgICAgICAgICBjb25zdCBoYXJkU2VsID0gaGFyZE5hbWVzLm1hcChuID0+IGBpbnB1dFtuYW1lPVwiJHtufVwiXSx0ZXh0YXJlYVtuYW1lPVwiJHtufVwiXSxzZWxlY3RbbmFtZT1cIiR7bn1cIl1gKS5qb2luKCcsJyk7XG4gICAgICAgICAgICBjb25zdCBtYXJrUmVhZE9ubHkgPSBlbCA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdyZWFkT25seScgaW4gZWwpIGVsLnJlYWRPbmx5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdkaXNhYmxlZCcgaW4gZWwpIGVsLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlKCdhcmlhLXJlYWRvbmx5JywgJ3RydWUnKTtcbiAgICAgICAgICAgICAgICAgICAgZWwudGl0bGUgPSAnRGlzYWJsZWQgYnkgcG9saWN5JztcbiAgICAgICAgICAgICAgICAgICAgZWwuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gTWFyayBhbnkga25vd24gbmFtZWQgY29udHJvbHMgbm93XG4gICAgICAgICAgICB0cnkgeyBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3JBbGwoaGFyZFNlbCkuZm9yRWFjaChtYXJrUmVhZE9ubHkpOyB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAvLyBFdmVudC1sZXZlbCBoYXJkIGJsb2NrIGZvciBhbnkgaW5wdXQgbGl2aW5nIGluc2lkZSBsb2NrZWQgVERzXG4gICAgICAgICAgICBjb25zdCBpZHhTZXQgPSBuZXcgU2V0KGlkeHMpO1xuICAgICAgICAgICAgY29uc3QgaXNJbkxvY2tlZENlbGwgPSAobm9kZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRkID0gbm9kZT8uY2xvc2VzdD8uKCd0ZCcpO1xuICAgICAgICAgICAgICAgIGlmICghdGQgfHwgdHlwZW9mIHRkLmNlbGxJbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gaWR4U2V0Lmhhcyh0ZC5jZWxsSW5kZXgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gQXZvaWQgZHVwbGljYXRlIGxpc3RlbmVycyBwZXIgbW9kYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIGlmICghbW9kYWxFbC5kYXRhc2V0LnF0MjBMb2Nrb3V0TGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgICAgbW9kYWxFbC5kYXRhc2V0LnF0MjBMb2Nrb3V0TGlzdGVuZXJzID0gJzEnO1xuXG4gICAgICAgICAgICAgICAgbW9kYWxFbC5hZGRFdmVudExpc3RlbmVyKCdmb2N1c2luJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGUudGFyZ2V0O1xuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiAoaXNJbkxvY2tlZENlbGwodCkgfHwgKHQubWF0Y2hlcyAmJiB0Lm1hdGNoZXMoaGFyZFNlbCkpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgdC5ibHVyPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/Lm5vdGlmeT8uKCdUaGlzIGZpZWxkIGlzIGNvbnRyb2xsZWQgYnkgcG9saWN5IGFuZCBjYW5ub3QgYmUgZWRpdGVkIGhlcmUuJywgJ3dhcm5pbmcnLCB7IHRvYXN0OiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICBtb2RhbEVsLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIChpc0luTG9ja2VkQ2VsbCh0KSB8fCAodC5tYXRjaGVzICYmIHQubWF0Y2hlcyhoYXJkU2VsKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpOyBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICAgICAgICAgIG1vZGFsRWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gZS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ICYmIChpc0luTG9ja2VkQ2VsbCh0KSB8fCAodC5tYXRjaGVzICYmIHQubWF0Y2hlcyhoYXJkU2VsKSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoJ3ZhbHVlJyBpbiB0KSB0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpOyBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCB0cnVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWxzbyBzd2VlcCBleGlzdGluZyBpbnB1dHMgaW4gdGhvc2UgVERzIGFuZCBtYXJrIHRoZW0gcmVhZC1vbmx5XG4gICAgICAgICAgICBjb25zdCByb3dzID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yQWxsKCcucGxleC1ncmlkLXdyYXBwZXIgLnBsZXgtZ3JpZCB0Ym9keSB0cicpO1xuICAgICAgICAgICAgZm9yIChjb25zdCByIG9mIHJvd3MpIHtcbiAgICAgICAgICAgICAgICBpZHhzLmZvckVhY2goaSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRkID0gci5jaGlsZHJlbj8uW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHRkLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LHRleHRhcmVhLHNlbGVjdCcpLmZvckVhY2gobWFya1JlYWRPbmx5KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIG5vLW9wICovIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsb2Nrb3V0UHJpY2luZ0NvbHVtbnMobW9kYWxFbCkge1xuICAgICAgICAvLyBDb2x1bW5zIHRvIGhpZGUvbG9jayBieSBoZWFkZXIgdGV4dFxuICAgICAgICBjb25zdCBpZHhzID0gZmluZEhlYWRlckluZGV4ZXMobW9kYWxFbCwgWydVbml0IFByaWNlJywgJyUgTWFya3VwJywgJyQgTWFya3VwJ10pO1xuICAgICAgICAvLyBEaXNhYmxlIGFueSBpbnB1dHMgaW5zaWRlIHRob3NlIGNvbHVtbnMgKGFuZCBrbm93biBmaWVsZCBuYW1lcylcbiAgICAgICAgZGlzYWJsZUlucHV0c0luTG9ja2VkQ29sdW1ucyhtb2RhbEVsLCBpZHhzKTtcbiAgICAgICAgLy8gSGlkZSB0aGUgY29sdW1ucyB2aXN1YWxseVxuICAgICAgICBoaWRlQ29sdW1uc0J5SW5kZXhlcyhtb2RhbEVsLCBpZHhzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YXRjaFByaWNpbmdMb2Nrb3V0KG1vZGFsRWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEFwcGx5IGltbWVkaWF0ZWx5XG4gICAgICAgICAgICBsb2Nrb3V0UHJpY2luZ0NvbHVtbnMobW9kYWxFbCk7XG4gICAgICAgICAgICAvLyBSZS1hcHBseSBvbiBncmlkIHJlLXJlbmRlciAoUGxleCByZWJpbmRpbmcpXG4gICAgICAgICAgICBjb25zdCByb290ID0gbW9kYWxFbC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkLWNvbnRhaW5lcicpIHx8IG1vZGFsRWw7XG4gICAgICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IGxvY2tvdXRQcmljaW5nQ29sdW1ucyhtb2RhbEVsKSk7XG4gICAgICAgICAgICBtby5vYnNlcnZlKHJvb3QsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICAgICAgLy8gU3RvcCB3aGVuIG1vZGFsIGlzIHJlbW92ZWRcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWxFbCwgKCkgPT4gbW8uZGlzY29ubmVjdCgpKTtcbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gTW9kYWwgd2lyaW5nIChpZGVtcG90ZW50IHBlciBtb2RhbClcbiAgICBmdW5jdGlvbiBvbk5vZGVSZW1vdmVkKG5vZGUsIGNiKSB7XG4gICAgICAgIGlmICghbm9kZSB8fCAhbm9kZS5vd25lckRvY3VtZW50KSByZXR1cm4gKCkgPT4geyB9O1xuICAgICAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBtIG9mIG11dHMpIGZvciAoY29uc3QgbiBvZiBtLnJlbW92ZWROb2RlcyB8fCBbXSkge1xuICAgICAgICAgICAgICAgIGlmIChuID09PSBub2RlIHx8IChuLmNvbnRhaW5zICYmIG4uY29udGFpbnMobm9kZSkpKSB7IHRyeSB7IGNiKCk7IH0gZmluYWxseSB7IG1vLmRpc2Nvbm5lY3QoKTsgfSByZXR1cm47IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG1vLm9ic2VydmUobm9kZS5vd25lckRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICByZXR1cm4gKCkgPT4gbW8uZGlzY29ubmVjdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluamVjdFN0b2NrQ29udHJvbHModWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1vZGFsID0gdWwuY2xvc2VzdCgnLnBsZXgtZGlhbG9nJyk7XG4gICAgICAgICAgICBjb25zdCB0aXRsZSA9IG1vZGFsPy5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctdGl0bGUnKT8udGV4dENvbnRlbnQ/LnRyaW0oKTtcbiAgICAgICAgICAgIC8vIG9wdGlvbnMgcmVtb3ZlZDogbWF0Y2ggYnkgdGl0bGUgb25seVxuICAgICAgICAgICAgY29uc3QgbG9va3NSaWdodCA9IHRpdGxlID09PSBDRkcuTU9EQUxfVElUTEU7XG4gICAgICAgICAgICBpZiAoIWxvb2tzUmlnaHQpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKHVsLmRhdGFzZXQucXQyMEluamVjdGVkKSByZXR1cm47XG4gICAgICAgICAgICB1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCA9ICcxJztcbiAgICAgICAgICAgIGRsb2coJ2luamVjdGluZyBjb250cm9scycpO1xuXG4gICAgICAgICAgICAvLyBNYWluIGFjdGlvbiAodGhlbWVkIGFuY2hvciBpbnNpZGUgTEkgdG8gbWF0Y2ggUGxleCBhY3Rpb24gYmFyIHNpemluZylcbiAgICAgICAgICAgIGNvbnN0IGxpTWFpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgICAgICAgICBsaU1haW4uY2xhc3NOYW1lID0gJ2x0LWFjdGlvbiBsdC1hY3Rpb24tLWJyYW5kJztcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgICAgIGJ0bi5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICBidG4uaWQgPSAncXQyMC1zdG9jay1saS1idG4nO1xuICAgICAgICAgICAgYnRuLmNsYXNzTmFtZSA9ICdsdC1idG4gbHQtYnRuLS1naG9zdCc7XG4gICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAnR2V0IFN0b2NrIExldmVscyc7XG4gICAgICAgICAgICBidG4udGl0bGUgPSAnRmV0Y2ggc3RvY2sgZm9yIHRoaXMgcGFydCAobm8gc3RhbXApJztcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgaGFuZGxlQ2xpY2sobW9kYWwpOyB9KTtcbiAgICAgICAgICAgIGxpTWFpbi5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gRW5mb3JjZSBVbml0IFByaWNlIGFuZCAlIE1hcmt1cCBsb2Nrb3V0IGluIHRoaXMgbW9kYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIHdhdGNoUHJpY2luZ0xvY2tvdXQobW9kYWwpO1xuXG4gICAgICAgICAgICAvLyBMZXQgb3RoZXIgbW9kdWxlcyByZWZyZXNoIGlmIHRoZXkgY2FyZSAobm8tb3AgaGVyZSlcbiAgICAgICAgICAgIG9uTm9kZVJlbW92ZWQobW9kYWwsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBXID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbFRoaXMgOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgQ0UgPSAoVyAmJiAoJ0N1c3RvbUV2ZW50JyBpbiBXKSA/IFcuQ3VzdG9tRXZlbnQgOiBnbG9iYWxUaGlzLkN1c3RvbUV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoVyAmJiBXLmRpc3BhdGNoRXZlbnQgJiYgQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFcuZGlzcGF0Y2hFdmVudChuZXcgQ0UoJ0xUOkF0dGFjaG1lbnRSZWZyZXNoUmVxdWVzdGVkJywgeyBkZXRhaWw6IHsgc291cmNlOiAnUVQyMCcsIHRzOiBEYXRlLm5vdygpIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGRlcnIoJ2luamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IEhVQl9CVE5fSUQgPSAncXQyMC1zdG9jay1idG4nO1xuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlTW9kYWxUaXRsZSgpIHtcbiAgICAgICAgY29uc3QgdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucyAucGxleC1kaWFsb2ctdGl0bGUnKTtcbiAgICAgICAgcmV0dXJuICh0Py50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1RhcmdldE1vZGFsT3BlbigpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbC1vcGVuJylcbiAgICAgICAgICAgICYmIC9ecXVvdGVcXHMqcGFydFxccypkZXRhaWwkL2kudGVzdChnZXRBY3RpdmVNb2RhbFRpdGxlKCkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsUm9vdCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZycpO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGVuc3VyZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgY29uc3QgaHViID0gbHQ/LmNvcmU/Lmh1YjtcbiAgICAgICAgaWYgKCFodWIgfHwgIWh1Yi5yZWdpc3RlckJ1dHRvbikgcmV0dXJuOyAvLyBVSSBub3QgcmVhZHkgeWV0XG5cbiAgICAgICAgLy8gRG9uJ3QgZG91YmxlLXJlZ2lzdGVyXG4gICAgICAgIGlmIChodWIuaGFzPy4oSFVCX0JUTl9JRCkpIHJldHVybjtcblxuICAgICAgICBodWIucmVnaXN0ZXJCdXR0b24oJ2xlZnQnLCB7XG4gICAgICAgICAgICBpZDogSFVCX0JUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiAnU3RvY2snLFxuICAgICAgICAgICAgdGl0bGU6ICdGZXRjaCBzdG9jayBmb3IgY3VycmVudCBwYXJ0JyxcbiAgICAgICAgICAgIHdlaWdodDogMTEwLFxuICAgICAgICAgICAgb25DbGljazogKCkgPT4gaGFuZGxlQ2xpY2soZ2V0QWN0aXZlTW9kYWxSb290KCkpXG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlSHViQnV0dG9uKCkge1xuICAgICAgICBjb25zdCBodWIgPSBsdD8uY29yZT8uaHViO1xuICAgICAgICBodWI/LnJlbW92ZT8uKEhVQl9CVE5fSUQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlYm91bmNlKGZuLCBtcyA9IDUwKSB7XG4gICAgICAgIGxldCBpZCA9IG51bGw7XG4gICAgICAgIHJldHVybiAoLi4uYXJncykgPT4geyBjbGVhclRpbWVvdXQoaWQpOyBpZCA9IHNldFRpbWVvdXQoKCkgPT4gZm4oLi4uYXJncyksIG1zKTsgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5ID0gZGVib3VuY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoaXNUYXJnZXRNb2RhbE9wZW4oKSkge1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlSHViQnV0dG9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZW1vdmVIdWJCdXR0b24oKTtcbiAgICAgICAgfVxuICAgIH0sIDUwKTtcblxuICAgIC8vID09PT09IEJvb3QgLyBTUEEgd2lyaW5nXG4gICAgbGV0IHN0b3BPYnNlcnZlID0gbnVsbDtcbiAgICBsZXQgb2ZmVXJsID0gbnVsbDtcbiAgICBsZXQgYm9vdGVkID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiB3aXJlTmF2KGhhbmRsZXIpIHsgb2ZmVXJsPy4oKTsgb2ZmVXJsID0gd2luZG93LlRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4oaGFuZGxlcik7IH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0TW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgc3RvcE9ic2VydmU/LigpO1xuICAgICAgICBzdG9wT2JzZXJ2ZSA9IHdpbmRvdy5UTVV0aWxzPy5vYnNlcnZlSW5zZXJ0TWFueT8uKENGRy5BQ1RJT05TX1VMX1NFTCwgaW5qZWN0U3RvY2tDb250cm9scyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcE1vZGFsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIHRyeSB7IHN0b3BPYnNlcnZlPy4oKTsgfSBjYXRjaCB7IH0gZmluYWxseSB7IHN0b3BPYnNlcnZlID0gbnVsbDsgfVxuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XG4gICAgICAgIGlmIChib290ZWQpIHJldHVybjtcbiAgICAgICAgYm9vdGVkID0gdHJ1ZTtcbiAgICAgICAgYXdhaXQgcmFmKCk7XG4gICAgICAgIGF3YWl0IGVuc3VyZVdpemFyZFZNKCk7XG4gICAgICAgIHN0YXJ0TW9kYWxPYnNlcnZlcigpO1xuXG4gICAgICAgIC8vIFNob3cvaGlkZSB0aGUgYnV0dG9uIGFzIHRoZSBtb2RhbCBvcGVucy9jbG9zZXMgYW5kIHRpdGxlcyBjaGFuZ2VcbiAgICAgICAgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuXG4gICAgICAgIGNvbnN0IGJvZHlPYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGlmIChtdXRzLnNvbWUobSA9PiBtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJykpIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJvZHlPYnMub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydjbGFzcyddIH0pO1xuXG4gICAgICAgIC8vIE1vZGFsIHRpdGxlIG1heSBjaGFuZ2UgYWZ0ZXIgb3BlbmluZ1xuICAgICAgICBjb25zdCBtb2RhbFJvb3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMnKSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICBjb25zdCB0aXRsZU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKSk7XG4gICAgICAgIHRpdGxlT2JzLm9ic2VydmUobW9kYWxSb290LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuXG4gICAgICAgIGRsb2coJ2luaXRpYWxpemVkJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVhcmRvd24oKSB7XG4gICAgICAgIGJvb3RlZCA9IGZhbHNlO1xuICAgICAgICBzdG9wTW9kYWxPYnNlcnZlcigpO1xuICAgIH1cblxuICAgIHdpcmVOYXYoKCkgPT4geyBpZiAod2luZG93LlRNVXRpbHM/Lm1hdGNoUm91dGU/LihST1VURVMpKSBpbml0KCk7IGVsc2UgdGVhcmRvd24oKTsgfSk7XG4gICAgaW5pdCgpO1xuXG4gICAgLy8gRGV2IHNlYW0gKG9wdGlvbmFsKVxuICAgIGlmIChERVYgJiYgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgd2luZG93Ll9fUVQyMF9fID0geyBpbmplY3RTdG9ja0NvbnRyb2xzLCBoYW5kbGVDbGljaywgc3BsaXRCYXNlQW5kUGFjaywgdG9CYXNlUGFydCwgbm9ybWFsaXplUm93VG9QaWVjZXMsIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZCB9O1xuICAgIH1cbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxNQUFNLE1BQU8sT0FDUCxPQUNBLGtDQUFrQyxLQUFLLFNBQVMsUUFBUTtBQUU5RCxHQUFDLE1BQU07QUFDSDtBQUdBLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUksUUFBUSxPQUFLLHNCQUFzQixDQUFDLENBQUM7QUFHM0QsUUFBSSxFQUFFLG9CQUFvQixXQUFXLENBQUMsT0FBTyxlQUFnQixRQUFPLGlCQUFpQjtBQUNyRixLQUFDLFlBQVk7QUFDVCxVQUFJO0FBQUUsY0FBTSxPQUFPLGNBQWMsRUFBRSxPQUFPLE9BQU8sZUFBZSxDQUFD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
