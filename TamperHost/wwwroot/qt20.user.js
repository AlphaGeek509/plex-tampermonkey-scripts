// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.121
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.121-1758912627479
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.121-1758912627479
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.121-1758912627479
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.121-1758912627479
// @require      http://localhost:5000/lt-core.user.js?v=3.8.121-1758912627479
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
        const vmModal = getModalVM(modalEl);
        const partNo = readPartFromAny(modalEl, vmModal ?? rootVM);
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
        lt.core.hub.notify(`Stock: ${formatInt(sum)} pcs`, "success", { ms: 2500, toast: true });
        dlog("QT20 success", { qk, partNo, basePart, sum });
      } catch (err) {
        task.error("Failed");
        lt.core.hub.notify(`Stock check failed: ${err?.message || err}`, "error", { ms: 4e3, toast: true });
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
        liMain.className = "lt-action";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICAvLyBQcmltYXJ5IEtPIGFuY2hvciBpcyB0aGUgZm9ybSBjb250YWluZXI7IGZhbGxiYWNrcyByZXRhaW5lZCBmb3Igb2xkZXIgbGF5b3V0c1xuICAgICAgICAvLywgLnBsZXgtZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWJpbmRdLCBpbnB1dFtuYW1lPVwiUGFydE5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydE5vTmV3XCJdLCBpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0sIGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXVxuICAgICAgICBBTkNIT1JfU0VMOiAnLnBsZXgtZm9ybS1jb250ZW50JyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TW9kYWxWTShtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrID0gc2VsID0+IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvciA9XG4gICAgICAgICAgICAgICAgcGljaygnLnBsZXgtZm9ybS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICBwaWNrKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgcGljaygnW2RhdGEtYmluZF0nKSB8fFxuICAgICAgICAgICAgICAgIG1vZGFsRWw7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4oYW5jaG9yKSB8fCBLTz8uY29udGV4dEZvcj8uKG1vZGFsRWwpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgfHwgY3R4Py4kcm9vdD8uZGF0YSB8fCBudWxsO1xuXG4gICAgICAgICAgICAvLyBTb21lIGRpYWxvZ3Mgd3JhcCB0aGUgYWN0dWFsIHJlY29yZCBvbiB2bS5kYXRhIG9yIHZtLm1vZGVsXG4gICAgICAgICAgICByZXR1cm4gKHZtICYmICh2bS5kYXRhIHx8IHZtLm1vZGVsKSkgPyAodm0uZGF0YSB8fCB2bS5tb2RlbCkgOiB2bTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKG1vZGFsRWwpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgXHUyMDI2XG4gICAgICAgICAgICBsZXQgcWsgPSBOdW1iZXIobHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpPy5xdW90ZUtleSB8fCAwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHFrID0gbSA/IE51bWJlcihtWzFdKSA6IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZSBLZXkgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgbW9kYWwgVk0gYW5jaG9yZWQgYXQgLnBsZXgtZm9ybS1jb250ZW50XG4gICAgICAgICAgICBjb25zdCB2bU1vZGFsID0gZ2V0TW9kYWxWTShtb2RhbEVsKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IHJlYWRQYXJ0RnJvbUFueShtb2RhbEVsLCB2bU1vZGFsID8/IHJvb3RWTSk7XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vKSB0aHJvdyBuZXcgRXJyb3IoJ1BhcnRObyBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlUGFydCA9IHRvQmFzZVBhcnQocGFydE5vKTtcblxuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0gfSA9IHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzIHx8IFtdLCBiYXNlUGFydCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gW2BTVEs6ICR7Zm9ybWF0SW50KHN1bSl9IHBjc2BdO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgdG8gTm90ZU5ldyAoY2xlYW4gcHJldmlvdXMgc3RhbXAgaWYgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIC8vIDIpIHJlbW92ZSBhbnkgcHJpb3Igc3RhbXAgdmFyaWFudHMgKG9sZCBTVEsgdy8gYnJlYWtkb3duL3RpbWVzdGFtcCBPUiBwcmlvciBcIlN0b2NrOiBOIHBjc1wiKVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKSg/OlNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/fFN0b2NrOlxccypcXGRbXFxkLF0qXFxzKnBjcylcXHMqL2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcblxuICAgICAgICAgICAgLy8gMykgYnVpbGQgbWluaW1hbCBzdGFtcCBhbmQgYXBwZW5kXG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYDtcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuXG4gICAgICAgICAgICAvLyA0KSB3cml0ZSBiYWNrIHZpYSBLTzsgZmFsbGJhY2sgdG8gZGlyZWN0IHRleHRhcmVhXG4gICAgICAgICAgICBsZXQgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIG5leHROb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRhKSB7IHRhLnZhbHVlID0gbmV4dE5vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IHNldE9rID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBicmVha2Rvd24sIG5vIHN0YW1wIFx1MjAxNCBqdXN0IGEgc2ltcGxlIHRvYXN0XG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1N0b2NrIHJldHJpZXZlZCcsIDEyMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYCwgJ3N1Y2Nlc3MnLCB7IG1zOiAyNTAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGxvZygnUVQyMCBzdWNjZXNzJywgeyBxaywgcGFydE5vLCBiYXNlUGFydCwgc3VtIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHRhc2suZXJyb3IoJ0ZhaWxlZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jayBjaGVjayBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA0MDAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGVycignaGFuZGxlQ2xpY2s6JywgZXJyKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIC8vIG5vIHRyYW5zaWVudCBVSSB0byByZXN0b3JlIGhlcmU7IGtlZXAgaWRlbXBvdGVudFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJlZmVyIEtPIHZpYSBUTVV0aWxzLmdldE9ic1ZhbHVlOyB3b3JrcyB3aXRoIFZNIG9yIERPTSBub2RlIChyZXNvbHZlcyBLTyBjb250ZXh0KS5cbiAgICBmdW5jdGlvbiByZWFkUGFydEZyb21BbnkobW9kYWxFbCwgdm1DYW5kaWRhdGUpIHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSBbXG4gICAgICAgICAgICAvLyBkaXJlY3RcbiAgICAgICAgICAgICdQYXJ0Tm8nLCAnSXRlbU5vJywgJ1BhcnRfTnVtYmVyJywgJ0l0ZW1fTnVtYmVyJywgJ1BhcnQnLCAnSXRlbScsXG4gICAgICAgICAgICAnUGFydE5vTmV3JywgJ1BhcnROb09sZCcsXG4gICAgICAgICAgICAvLyBuZXN0ZWQgY29tbW9uXG4gICAgICAgICAgICAnUXVvdGVQYXJ0LlBhcnRObycsICdRdW90ZVBhcnQuUGFydF9OdW1iZXInLFxuICAgICAgICAgICAgJ1NlbGVjdGVkUm93LlBhcnRObycsICdSb3cuUGFydE5vJywgJ01vZGVsLlBhcnRObycsXG4gICAgICAgICAgICAvLyB3aGVuIHZtIGlzIHdyYXBwZXIgb2JqZWN0c1xuICAgICAgICAgICAgJ2RhdGEuUGFydE5vJywgJ2RhdGEuSXRlbU5vJywgJ21vZGVsLlBhcnRObycsICdtb2RlbC5JdGVtTm8nXG4gICAgICAgIF07XG4gICAgICAgIGNvbnN0IFRNVSA9IHdpbmRvdy5UTVV0aWxzO1xuXG4gICAgICAgIC8vIDEpIG1vZGFsIFZNIHByZWZlcnJlZFxuICAgICAgICBpZiAodm1DYW5kaWRhdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHZWTSA9IFRNVT8uZ2V0T2JzVmFsdWU/Lih2bUNhbmRpZGF0ZSwgcGF0aHMsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUsIGFsbG93UGxleDogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGlmICh2Vk0pIHJldHVybiB2Vk07XG4gICAgICAgIH1cbiAgICAgICAgLy8gMikgbW9kYWwgZWxlbWVudCBLTyBjb250ZXh0XG4gICAgICAgIGNvbnN0IHZNb2RhbCA9IFRNVT8uZ2V0T2JzVmFsdWU/Lihtb2RhbEVsLCBwYXRocywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSwgYWxsb3dQbGV4OiB0cnVlIH0pO1xuICAgICAgICBpZiAodk1vZGFsKSByZXR1cm4gdk1vZGFsO1xuICAgICAgICAvLyAzKSBET00gaW5wdXRzIChsYXN0IHJlc29ydClcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gbW9kYWxFbD8ucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT1cIlBhcnROb1wiXSxpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0saW5wdXRbbmFtZT1cIkl0ZW1Ob1wiXSxpbnB1dFtuYW1lPVwiSXRlbV9OdW1iZXJcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IChlbD8udmFsdWUgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmIChyYXcpIHJldHVybiByYXc7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cblxuICAgIC8vID09PT09IE1vZGFsIHdpcmluZyAoaWRlbXBvdGVudCBwZXIgbW9kYWwpXG4gICAgZnVuY3Rpb24gb25Ob2RlUmVtb3ZlZChub2RlLCBjYikge1xuICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUub3duZXJEb2N1bWVudCkgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSBmb3IgKGNvbnN0IG4gb2YgbS5yZW1vdmVkTm9kZXMgfHwgW10pIHtcbiAgICAgICAgICAgICAgICBpZiAobiA9PT0gbm9kZSB8fCAobi5jb250YWlucyAmJiBuLmNvbnRhaW5zKG5vZGUpKSkgeyB0cnkgeyBjYigpOyB9IGZpbmFsbHkgeyBtby5kaXNjb25uZWN0KCk7IH0gcmV0dXJuOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmplY3RTdG9ja0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtb2RhbCA9IHVsLmNsb3Nlc3QoJy5wbGV4LWRpYWxvZycpO1xuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBtb2RhbD8ucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLXRpdGxlJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICAvLyBvcHRpb25zIHJlbW92ZWQ6IG1hdGNoIGJ5IHRpdGxlIG9ubHlcbiAgICAgICAgICAgIGNvbnN0IGxvb2tzUmlnaHQgPSB0aXRsZSA9PT0gQ0ZHLk1PREFMX1RJVExFO1xuICAgICAgICAgICAgaWYgKCFsb29rc1JpZ2h0KSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQgPSAnMSc7XG4gICAgICAgICAgICBkbG9nKCdpbmplY3RpbmcgY29udHJvbHMnKTtcblxuICAgICAgICAgICAgLy8gTWFpbiBhY3Rpb24gKHRoZW1lZCBhbmNob3IgaW5zaWRlIExJIHRvIG1hdGNoIFBsZXggYWN0aW9uIGJhciBzaXppbmcpXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgbGlNYWluLmNsYXNzTmFtZSA9ICdsdC1hY3Rpb24nO1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYnRuLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGJ0bi5pZCA9ICdxdDIwLXN0b2NrLWxpLWJ0bic7XG4gICAgICAgICAgICBidG4uY2xhc3NOYW1lID0gJ2x0LWJ0biBsdC1idG4tLWdob3N0JztcbiAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdHZXQgU3RvY2sgTGV2ZWxzJztcbiAgICAgICAgICAgIGJ0bi50aXRsZSA9ICdGZXRjaCBzdG9jayBmb3IgdGhpcyBwYXJ0IChubyBzdGFtcCknO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBoYW5kbGVDbGljayhtb2RhbCk7IH0pO1xuICAgICAgICAgICAgbGlNYWluLmFwcGVuZENoaWxkKGJ0bik7XG4gICAgICAgICAgICB1bC5hcHBlbmRDaGlsZChsaU1haW4pO1xuXG5cbiAgICAgICAgICAgIC8vLy8gTWFpbiBhY3Rpb25cbiAgICAgICAgICAgIC8vY29uc3QgbGlNYWluID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIC8vY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgLy9idG4uaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgLy9idG4udGV4dENvbnRlbnQgPSAnTFQgR2V0IFN0b2NrIExldmVscyc7XG4gICAgICAgICAgICAvL2J0bi50aXRsZSA9ICdTaG93IHRvdGFsIHN0b2NrIChubyBzdGFtcCknO1xuICAgICAgICAgICAgLy9idG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0dldCBzdG9jayBsZXZlbHMnKTtcbiAgICAgICAgICAgIC8vYnRuLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcbiAgICAgICAgICAgIC8vT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHsgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICdmaWx0ZXIgLjE1cywgdGV4dC1kZWNvcmF0aW9uLWNvbG9yIC4xNXMnIH0pO1xuICAgICAgICAgICAgLy9idG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHsgYnRuLnN0eWxlLmZpbHRlciA9ICdicmlnaHRuZXNzKDEuMDgpJzsgYnRuLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7IH0pO1xuICAgICAgICAgICAgLy9idG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHsgYnRuLnN0eWxlLmZpbHRlciA9ICcnOyBidG4uc3R5bGUudGV4dERlY29yYXRpb24gPSAnJzsgfSk7XG4gICAgICAgICAgICAvL2J0bi5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgIC8vYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5vdXRsaW5lID0gJyc7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7IH0pO1xuICAgICAgICAgICAgLy9idG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBoYW5kbGVDbGljayhtb2RhbCkpO1xuICAgICAgICAgICAgLy9idG4uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IGhhbmRsZUNsaWNrKG1vZGFsKTsgfVxuICAgICAgICAgICAgLy99KTtcbiAgICAgICAgICAgIC8vbGlNYWluLmFwcGVuZENoaWxkKGJ0bik7XG4gICAgICAgICAgICAvL3VsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cbiAgICAgICAgICAgIC8vIExldCBvdGhlciBtb2R1bGVzIHJlZnJlc2ggaWYgdGhleSBjYXJlIChuby1vcCBoZXJlKVxuICAgICAgICAgICAgb25Ob2RlUmVtb3ZlZChtb2RhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IFcgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiAodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsVGhpcyA6IG51bGwpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBDRSA9IChXICYmICgnQ3VzdG9tRXZlbnQnIGluIFcpID8gVy5DdXN0b21FdmVudCA6IGdsb2JhbFRoaXMuQ3VzdG9tRXZlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChXICYmIFcuZGlzcGF0Y2hFdmVudCAmJiBDRSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgVy5kaXNwYXRjaEV2ZW50KG5ldyBDRSgnTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCB7IGRldGFpbDogeyBzb3VyY2U6ICdRVDIwJywgdHM6IERhdGUubm93KCkgfSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZGVycignaW5qZWN0OicsIGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgSFVCX0JUTl9JRCA9ICdxdDIwLXN0b2NrLWJ0bic7XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVNb2RhbFRpdGxlKCkge1xuICAgICAgICBjb25zdCB0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zIC5wbGV4LWRpYWxvZy10aXRsZScpO1xuICAgICAgICByZXR1cm4gKHQ/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzVGFyZ2V0TW9kYWxPcGVuKCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsLW9wZW4nKVxuICAgICAgICAgICAgJiYgL15xdW90ZVxccypwYXJ0XFxzKmRldGFpbCQvaS50ZXN0KGdldEFjdGl2ZU1vZGFsVGl0bGUoKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlTW9kYWxSb290KCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zJykgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nJyk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSHViQnV0dG9uKCkge1xuICAgICAgICB0cnkgeyBhd2FpdCB3aW5kb3cuZW5zdXJlTFRIdWI/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICBjb25zdCBodWIgPSBsdD8uY29yZT8uaHViO1xuICAgICAgICBpZiAoIWh1YiB8fCAhaHViLnJlZ2lzdGVyQnV0dG9uKSByZXR1cm47IC8vIFVJIG5vdCByZWFkeSB5ZXRcblxuICAgICAgICAvLyBEb24ndCBkb3VibGUtcmVnaXN0ZXJcbiAgICAgICAgaWYgKGh1Yi5oYXM/LihIVUJfQlROX0lEKSkgcmV0dXJuO1xuXG4gICAgICAgIGh1Yi5yZWdpc3RlckJ1dHRvbignbGVmdCcsIHtcbiAgICAgICAgICAgIGlkOiBIVUJfQlROX0lELFxuICAgICAgICAgICAgbGFiZWw6ICdTdG9jaycsXG4gICAgICAgICAgICB0aXRsZTogJ0ZldGNoIHN0b2NrIGZvciBjdXJyZW50IHBhcnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiAxMTAsXG4gICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBoYW5kbGVDbGljayhnZXRBY3RpdmVNb2RhbFJvb3QoKSlcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVIdWJCdXR0b24oKSB7XG4gICAgICAgIGNvbnN0IGh1YiA9IGx0Py5jb3JlPy5odWI7XG4gICAgICAgIGh1Yj8ucmVtb3ZlPy4oSFVCX0JUTl9JRCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVib3VuY2UoZm4sIG1zID0gNTApIHtcbiAgICAgICAgbGV0IGlkID0gbnVsbDtcbiAgICAgICAgcmV0dXJuICguLi5hcmdzKSA9PiB7IGNsZWFyVGltZW91dChpZCk7IGlkID0gc2V0VGltZW91dCgoKSA9PiBmbiguLi5hcmdzKSwgbXMpOyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkgPSBkZWJvdW5jZShhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChpc1RhcmdldE1vZGFsT3BlbigpKSB7XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVIdWJCdXR0b24oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbW92ZUh1YkJ1dHRvbigpO1xuICAgICAgICB9XG4gICAgfSwgNTApO1xuXG4gICAgLy8gPT09PT0gQm9vdCAvIFNQQSB3aXJpbmdcbiAgICBsZXQgc3RvcE9ic2VydmUgPSBudWxsO1xuICAgIGxldCBvZmZVcmwgPSBudWxsO1xuICAgIGxldCBib290ZWQgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIHdpcmVOYXYoaGFuZGxlcikgeyBvZmZVcmw/LigpOyBvZmZVcmwgPSB3aW5kb3cuVE1VdGlscz8ub25VcmxDaGFuZ2U/LihoYW5kbGVyKTsgfVxuXG4gICAgZnVuY3Rpb24gc3RhcnRNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICBzdG9wT2JzZXJ2ZT8uKCk7XG4gICAgICAgIHN0b3BPYnNlcnZlID0gd2luZG93LlRNVXRpbHM/Lm9ic2VydmVJbnNlcnRNYW55Py4oQ0ZHLkFDVElPTlNfVUxfU0VMLCBpbmplY3RTdG9ja0NvbnRyb2xzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9wTW9kYWxPYnNlcnZlcigpIHtcbiAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfSBmaW5hbGx5IHsgc3RvcE9ic2VydmUgPSBudWxsOyB9XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgaWYgKGJvb3RlZCkgcmV0dXJuO1xuICAgICAgICBib290ZWQgPSB0cnVlO1xuICAgICAgICBhd2FpdCByYWYoKTtcbiAgICAgICAgYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcbiAgICAgICAgc3RhcnRNb2RhbE9ic2VydmVyKCk7XG5cbiAgICAgICAgLy8gU2hvdy9oaWRlIHRoZSBidXR0b24gYXMgdGhlIG1vZGFsIG9wZW5zL2Nsb3NlcyBhbmQgdGl0bGVzIGNoYW5nZVxuICAgICAgICByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG5cbiAgICAgICAgY29uc3QgYm9keU9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dHMgPT4ge1xuICAgICAgICAgICAgaWYgKG11dHMuc29tZShtID0+IG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnKSkgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgYm9keU9icy5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10gfSk7XG5cbiAgICAgICAgLy8gTW9kYWwgdGl0bGUgbWF5IGNoYW5nZSBhZnRlciBvcGVuaW5nXG4gICAgICAgIGNvbnN0IG1vZGFsUm9vdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1oYXMtYnV0dG9ucycpIHx8IGRvY3VtZW50LmJvZHk7XG4gICAgICAgIGNvbnN0IHRpdGxlT2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4gcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSgpKTtcbiAgICAgICAgdGl0bGVPYnMub2JzZXJ2ZShtb2RhbFJvb3QsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG5cbiAgICAgICAgZGxvZygnaW5pdGlhbGl6ZWQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZWFyZG93bigpIHtcbiAgICAgICAgYm9vdGVkID0gZmFsc2U7XG4gICAgICAgIHN0b3BNb2RhbE9ic2VydmVyKCk7XG4gICAgfVxuXG4gICAgd2lyZU5hdigoKSA9PiB7IGlmICh3aW5kb3cuVE1VdGlscz8ubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIGluaXQoKTsgZWxzZSB0ZWFyZG93bigpOyB9KTtcbiAgICBpbml0KCk7XG5cbiAgICAvLyBEZXYgc2VhbSAob3B0aW9uYWwpXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDIwX18gPSB7IGluamVjdFN0b2NrQ29udHJvbHMsIGhhbmRsZUNsaWNrLCBzcGxpdEJhc2VBbmRQYWNrLCB0b0Jhc2VQYXJ0LCBub3JtYWxpemVSb3dUb1BpZWNlcywgc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkIH07XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxNQUFNLE1BQU8sT0FDUCxPQUNBLGtDQUFrQyxLQUFLLFNBQVMsUUFBUTtBQUU5RCxHQUFDLE1BQU07QUFDSDtBQUdBLFVBQU0sT0FBTyxJQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFDeEQsVUFBTSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU0scUJBQVcsR0FBRyxDQUFDO0FBQ3BELFVBQU0sS0FBTSxPQUFPLGlCQUFpQixjQUFjLGFBQWEsS0FBSyxPQUFPO0FBQzNFLFVBQU0sTUFBTSxNQUFNLElBQUksUUFBUSxPQUFLLHNCQUFzQixDQUFDLENBQUM7QUFHM0QsUUFBSSxFQUFFLG9CQUFvQixXQUFXLENBQUMsT0FBTyxlQUFnQixRQUFPLGlCQUFpQjtBQUNyRixLQUFDLFlBQVk7QUFDVCxVQUFJO0FBQUUsY0FBTSxPQUFPLGNBQWMsRUFBRSxPQUFPLE9BQU8sZUFBZSxDQUFDO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUFBLElBRWxGLEdBQUc7QUFHSCxVQUFNLFNBQVMsQ0FBQyxzQ0FBc0M7QUFDdEQsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFNLEdBQUcsS0FBSyxTQUFTLFFBQVEsQ0FBQyxFQUFHO0FBRXBELFVBQU0sTUFBTTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsYUFBYTtBQUFBO0FBQUE7QUFBQSxNQUdiLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLGdCQUFnQjtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxJQUNoQjtBQUdBLG1CQUFl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
