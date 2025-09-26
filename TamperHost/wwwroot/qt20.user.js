// ==UserScript==
// @name        QT20_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.130
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.130-1758921588174
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.130-1758921588174
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.130-1758921588174
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.130-1758921588174
// @require      http://localhost:5000/lt-core.user.js?v=3.8.130-1758921588174
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQyMC1wYXJ0U3RvY2tMZXZlbEdldC9xdDIwLmluZGV4LmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyB0bS1zY3JpcHRzL3NyYy9xdDIwLXBhcnRTdG9ja0xldmVsR2V0L3F0MjAuaW5kZXguanNcblxuLyogQnVpbGQtdGltZSBkZXYgZmxhZyAoZXNidWlsZCBzZXRzIF9fQlVJTERfREVWX18pLCB3aXRoIGEgcnVudGltZSBmYWxsYmFjayAqL1xuY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcbiAgICA/IF9fQlVJTERfREVWX19cbiAgICA6IC9sb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC4xfF50ZXN0XFwuL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG5cbigoKSA9PiB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gPT09PT0gTG9nZ2luZyAvIEtPID09PT09XG4gICAgY29uc3QgZGxvZyA9ICguLi5hKSA9PiBERVYgJiYgY29uc29sZS5kZWJ1ZygnUVQyMCcsIC4uLmEpO1xuICAgIGNvbnN0IGRlcnIgPSAoLi4uYSkgPT4gY29uc29sZS5lcnJvcignUVQyMCBcdTI3MTZcdUZFMEYnLCAuLi5hKTtcbiAgICBjb25zdCBLTyA9ICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHVuc2FmZVdpbmRvdy5rbyA6IHdpbmRvdy5rbyk7XG4gICAgY29uc3QgcmFmID0gKCkgPT4gbmV3IFByb21pc2UociA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpO1xuXG4gICAgLy8gR3VhcmQgYWdhaW5zdCBkb3VibGUtbW91bnQ7IHF0MTAvcXQzNSBhbHJlYWR5IGRvIHRoaXNcbiAgICBpZiAoISgnX19MVF9IVUJfTU9VTlQnIGluIHdpbmRvdykgfHwgIXdpbmRvdy5fX0xUX0hVQl9NT1VOVCkgd2luZG93Ll9fTFRfSFVCX01PVU5UID0gJ25hdic7XG4gICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgd2luZG93LmVuc3VyZUxUSHViPy4oeyBtb3VudDogd2luZG93Ll9fTFRfSFVCX01PVU5UIH0pOyB9IGNhdGNoIHsgfVxuICAgICAgICAvLyBcIlJlYWR5XCIgaGFuZGxlZCBieSBxdDEwIHRvIGF2b2lkIGR1cGxpY2F0ZSBzdGlja3kgcGlsbHNcbiAgICB9KSgpO1xuXG4gICAgLy8gPT09PT0gUm91dGVzIC8gVUkgYW5jaG9ycyA9PT09PVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV07XG4gICAgaWYgKCFST1VURVMuc29tZShyeCA9PiByeC50ZXN0KGxvY2F0aW9uLnBhdGhuYW1lKSkpIHJldHVybjtcblxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgQUNUSU9OU19VTF9TRUw6ICcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtYWN0aW9ucy13cmFwcGVyIHVsLnBsZXgtYWN0aW9ucycsXG4gICAgICAgIE1PREFMX1RJVExFOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICAvLyBQcmltYXJ5IEtPIGFuY2hvciBpcyB0aGUgZm9ybSBjb250YWluZXI7IGZhbGxiYWNrcyByZXRhaW5lZCBmb3Igb2xkZXIgbGF5b3V0c1xuICAgICAgICAvLywgLnBsZXgtZGlhbG9nLWNvbnRlbnQsIFtkYXRhLWJpbmRdLCBpbnB1dFtuYW1lPVwiUGFydE5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydE5vTmV3XCJdLCBpbnB1dFtuYW1lPVwiSXRlbU5vXCJdLCBpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0sIGlucHV0W25hbWU9XCJJdGVtX051bWJlclwiXVxuICAgICAgICBBTkNIT1JfU0VMOiAnLnBsZXgtZm9ybS1jb250ZW50JyxcbiAgICAgICAgRFNfU1RPQ0s6IDE3MixcbiAgICAgICAgQUNUSU9OX0JBUl9TRUw6ICcjUXVvdGVXaXphcmRTaGFyZWRBY3Rpb25CYXInLFxuICAgICAgICBHUklEX1NFTDogJy5wbGV4LWdyaWQnLFxuICAgICAgICBQT0xMX01TOiAyMDAsXG4gICAgICAgIFRJTUVPVVRfTVM6IDEyMDAwXG4gICAgfTtcblxuICAgIC8vID09PT09IEtPL1dpemFyZCBoZWxwZXJzXG4gICAgYXN5bmMgZnVuY3Rpb24gZW5zdXJlV2l6YXJkVk0oKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoQ0ZHLkdSSURfU0VMKSA/IENGRy5HUklEX1NFTCA6IENGRy5BQ1RJT05fQkFSX1NFTDtcbiAgICAgICAgaWYgKHdpbmRvdy5UTVV0aWxzPy53YWl0Rm9yTW9kZWxBc3luYykge1xuICAgICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IGF3YWl0IHdpbmRvdy5UTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKGFuY2hvciwge1xuICAgICAgICAgICAgICAgIHBvbGxNczogQ0ZHLlBPTExfTVMsIHRpbWVvdXRNczogQ0ZHLlRJTUVPVVRfTVMsIHJlcXVpcmVLbzogdHJ1ZVxuICAgICAgICAgICAgfSkgPz8geyB2aWV3TW9kZWw6IG51bGwgfTtcbiAgICAgICAgICAgIGlmICh2aWV3TW9kZWwpIHJldHVybiB2aWV3TW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmFsbGJhY2s6IHRyeSBLTyByb290IG5lYXIgdGhlIHdpemFyZC9wYWdlXG4gICAgICAgIGNvbnN0IHJvb3RFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZCwgLnBsZXgtcGFnZScpO1xuICAgICAgICByZXR1cm4gcm9vdEVsICYmIChLTz8uZGF0YUZvcj8uKHJvb3RFbCkgfHwgbnVsbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TW9kYWxWTShtb2RhbEVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrID0gc2VsID0+IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGNvbnN0IGFuY2hvciA9XG4gICAgICAgICAgICAgICAgcGljaygnLnBsZXgtZm9ybS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICBwaWNrKCcucGxleC1kaWFsb2ctY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgcGljaygnW2RhdGEtYmluZF0nKSB8fFxuICAgICAgICAgICAgICAgIG1vZGFsRWw7XG5cbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IEtPPy5jb250ZXh0Rm9yPy4oYW5jaG9yKSB8fCBLTz8uY29udGV4dEZvcj8uKG1vZGFsRWwpIHx8IG51bGw7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJGRhdGEgfHwgY3R4Py4kcm9vdD8uZGF0YSB8fCBudWxsO1xuXG4gICAgICAgICAgICAvLyBTb21lIGRpYWxvZ3Mgd3JhcCB0aGUgYWN0dWFsIHJlY29yZCBvbiB2bS5kYXRhIG9yIHZtLm1vZGVsXG4gICAgICAgICAgICByZXR1cm4gKHZtICYmICh2bS5kYXRhIHx8IHZtLm1vZGVsKSkgPyAodm0uZGF0YSB8fCB2bS5tb2RlbCkgOiB2bTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gPT09PT0gQXV0aCB3cmFwcGVyIChwcmVmZXJzIGx0LmNvcmUuYXV0aC53aXRoRnJlc2hBdXRoOyBmYWxscyBiYWNrIHRvIHBsYWluIHJ1bilcbiAgICBjb25zdCB3aXRoRnJlc2hBdXRoID0gKGZuKSA9PiB7XG4gICAgICAgIGNvbnN0IGltcGwgPSBsdD8uY29yZT8uYXV0aD8ud2l0aEZyZXNoQXV0aDtcbiAgICAgICAgcmV0dXJuICh0eXBlb2YgaW1wbCA9PT0gJ2Z1bmN0aW9uJykgPyBpbXBsKGZuKSA6IGZuKCk7XG4gICAgfTtcblxuICAgIC8vID09PT09IFN0b2NrIGhlbHBlcnNcbiAgICBmdW5jdGlvbiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykge1xuICAgICAgICBjb25zdCBzID0gU3RyaW5nKHBhcnRObyB8fCAnJykudHJpbSgpO1xuICAgICAgICBjb25zdCBtID0gcy5tYXRjaCgvXiguKj8pLShcXGQrKVxccyooQkFHfEJPWHxQQUNLfFBLRykkL2kpO1xuICAgICAgICBpZiAobSkgcmV0dXJuIHsgYmFzZTogbVsxXSwgcGFja1NpemU6IE51bWJlcihtWzJdKSwgcGFja1VuaXQ6IG1bM10udG9VcHBlckNhc2UoKSB9O1xuICAgICAgICByZXR1cm4geyBiYXNlOiBzLCBwYWNrU2l6ZTogbnVsbCwgcGFja1VuaXQ6IG51bGwgfTtcbiAgICB9XG4gICAgZnVuY3Rpb24gdG9CYXNlUGFydChwYXJ0Tm8pIHsgcmV0dXJuIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKS5iYXNlOyB9XG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcbiAgICAgICAgY29uc3QgdW5pdCA9IFN0cmluZyhyb3c/LlVuaXQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IHF0eSA9IE51bWJlcihyb3c/LlF1YW50aXR5KSB8fCAwO1xuICAgICAgICBpZiAodW5pdCA9PT0gJycgfHwgdW5pdCA9PT0gJ3BjcycgfHwgdW5pdCA9PT0gJ3BpZWNlJyB8fCB1bml0ID09PSAncGllY2VzJykgcmV0dXJuIHF0eTtcbiAgICAgICAgaWYgKHBhY2tTaXplKSByZXR1cm4gcXR5ICogcGFja1NpemU7XG4gICAgICAgIHJldHVybiBxdHk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzLCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IGJ5TG9jID0gbmV3IE1hcCgpOyBsZXQgdG90YWwgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHIgb2YgKHJvd3MgfHwgW10pKSB7XG4gICAgICAgICAgICBjb25zdCBwY3MgPSBub3JtYWxpemVSb3dUb1BpZWNlcyhyLCB0YXJnZXRCYXNlKTtcbiAgICAgICAgICAgIGlmICghcGNzKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGxvYyA9IFN0cmluZyhyPy5Mb2NhdGlvbiB8fCByPy5XYXJlaG91c2UgfHwgcj8uU2l0ZSB8fCAnVU5LJykudHJpbSgpO1xuICAgICAgICAgICAgdG90YWwgKz0gcGNzO1xuICAgICAgICAgICAgYnlMb2Muc2V0KGxvYywgKGJ5TG9jLmdldChsb2MpIHx8IDApICsgcGNzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBicmVha2Rvd24gPSBbLi4uYnlMb2NdLm1hcCgoW2xvYywgcXR5XSkgPT4gKHsgbG9jLCBxdHkgfSkpLnNvcnQoKGEsIGIpID0+IGIucXR5IC0gYS5xdHkpO1xuICAgICAgICByZXR1cm4geyBzdW06IHRvdGFsLCBicmVha2Rvd24gfTtcbiAgICB9XG4gICAgY29uc3QgZm9ybWF0SW50ID0gKG4pID0+IE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSB4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICByZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke3BhZChkLmdldE1vbnRoKCkgKyAxKX0tJHtwYWQoZC5nZXREYXRlKCkpfSAke3BhZChkLmdldEhvdXJzKCkpfToke3BhZChkLmdldE1pbnV0ZXMoKSl9YDtcbiAgICB9XG5cblxuICAgIC8vID09PT09IENsaWNrIGhhbmRsZXIgKG5vIHJlcG8gd3JpdGVzKVxuICAgIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsaWNrKG1vZGFsRWwpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IGx0LmNvcmUuaHViLmJlZ2luVGFzaygnRmV0Y2hpbmcgc3RvY2tcdTIwMjYnLCAnaW5mbycpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZNID0gYXdhaXQgZW5zdXJlV2l6YXJkVk0oKTtcblxuICAgICAgICAgICAgLy8gUmVzb2x2ZSBRdW90ZSBLZXkgXHUyMDI2XG4gICAgICAgICAgICBsZXQgcWsgPSBOdW1iZXIobHQ/LmNvcmU/LnF0Py5nZXRRdW90ZUNvbnRleHQ/LigpPy5xdW90ZUtleSB8fCAwKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHFrKSB8fCBxayA8PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IC9bPyZdUXVvdGVLZXk9KFxcZCspL2kuZXhlYyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgICAgICAgICAgIHFrID0gbSA/IE51bWJlcihtWzFdKSA6IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShxaykgfHwgcWsgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdRdW90ZSBLZXkgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFByZWZlciB0aGUgbW9kYWwgVk0gYW5jaG9yZWQgYXQgLnBsZXgtZm9ybS1jb250ZW50XG4gICAgICAgICAgICBjb25zdCB2bU1vZGFsID0gZ2V0TW9kYWxWTShtb2RhbEVsKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRObyA9IHJlYWRQYXJ0RnJvbUFueShtb2RhbEVsLCB2bU1vZGFsID8/IHJvb3RWTSk7XG5cbiAgICAgICAgICAgIGlmICghcGFydE5vKSB0aHJvdyBuZXcgRXJyb3IoJ1BhcnRObyBub3QgYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlUGFydCA9IHRvQmFzZVBhcnQocGFydE5vKTtcblxuXG4gICAgICAgICAgICAvLyBEUyBjYWxsIHdpdGggNDE5IHJldHJ5XG4gICAgICAgICAgICBjb25zdCBwbGV4ID0gKHR5cGVvZiBnZXRQbGV4RmFjYWRlID09PSAnZnVuY3Rpb24nKSA/IGF3YWl0IGdldFBsZXhGYWNhZGUoKSA6IHdpbmRvdy5sdD8uY29yZT8ucGxleCA/PyB3aW5kb3cuVE1VdGlscztcbiAgICAgICAgICAgIGNvbnN0IHJvd3MgPSBhd2FpdCB3aXRoRnJlc2hBdXRoKCgpID0+XG4gICAgICAgICAgICAgICAgcGxleC5kc1Jvd3MoQ0ZHLkRTX1NUT0NLLCB7IFBhcnRfTm86IGJhc2VQYXJ0LCBTaGlwcGFibGU6ICdUUlVFJywgQ29udGFpbmVyX1N0YXR1czogJ09LJyB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgeyBzdW0gfSA9IHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZChyb3dzIHx8IFtdLCBiYXNlUGFydCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gW2BTVEs6ICR7Zm9ybWF0SW50KHN1bSl9IHBjc2BdO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgdG8gTm90ZU5ldyAoY2xlYW4gcHJldmlvdXMgc3RhbXAgaWYgcHJlc2VudClcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW5kb3cuVE1VdGlscz8uZ2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIHsgdHJpbTogdHJ1ZSB9KSB8fCAnJztcbiAgICAgICAgICAgIGNvbnN0IGJhc2VOb3RlID0gKC9eKG51bGx8dW5kZWZpbmVkKSQvaS50ZXN0KGN1cnJlbnQpID8gJycgOiBjdXJyZW50KTtcbiAgICAgICAgICAgIC8vIDIpIHJlbW92ZSBhbnkgcHJpb3Igc3RhbXAgdmFyaWFudHMgKG9sZCBTVEsgdy8gYnJlYWtkb3duL3RpbWVzdGFtcCBPUiBwcmlvciBcIlN0b2NrOiBOIHBjc1wiKVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKSg/OlNUSzpcXHMqXFxkW1xcZCxdKig/OlxccypwY3MpPyg/OlxccypcXChbXigpXSpcXCkpPyg/OlxccypAXFxkezR9LVxcZHsyfS1cXGR7Mn1cXHMrXFxkezJ9OlxcZHsyfSk/fFN0b2NrOlxccypcXGRbXFxkLF0qXFxzKnBjcylcXHMqL2dpLFxuICAgICAgICAgICAgICAgICcnXG4gICAgICAgICAgICApLnRyaW0oKTtcblxuICAgICAgICAgICAgLy8gMykgYnVpbGQgbWluaW1hbCBzdGFtcCBhbmQgYXBwZW5kXG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYDtcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuXG4gICAgICAgICAgICAvLyA0KSB3cml0ZSBiYWNrIHZpYSBLTzsgZmFsbGJhY2sgdG8gZGlyZWN0IHRleHRhcmVhXG4gICAgICAgICAgICBsZXQgc2V0T2sgPSB3aW5kb3cuVE1VdGlscz8uc2V0T2JzVmFsdWU/Lih2bU1vZGFsLCAnTm90ZU5ldycsIG5leHROb3RlKTtcbiAgICAgICAgICAgIGlmICghc2V0T2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YSA9IG1vZGFsRWw/LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRhKSB7IHRhLnZhbHVlID0gbmV4dE5vdGU7IHRhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7IHNldE9rID0gdHJ1ZTsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBObyBicmVha2Rvd24sIG5vIHN0YW1wIFx1MjAxNCBqdXN0IGEgc2ltcGxlIHRvYXN0XG4gICAgICAgICAgICB0YXNrLnN1Y2Nlc3MoJ1N0b2NrIHJldHJpZXZlZCcsIDEyMDApO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jazogJHtmb3JtYXRJbnQoc3VtKX0gcGNzYCwgJ3N1Y2Nlc3MnLCB7IG1zOiAyNTAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGxvZygnUVQyMCBzdWNjZXNzJywgeyBxaywgcGFydE5vLCBiYXNlUGFydCwgc3VtIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHRhc2suZXJyb3IoJ0ZhaWxlZCcpO1xuICAgICAgICAgICAgbHQuY29yZS5odWIubm90aWZ5KGBTdG9jayBjaGVjayBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InLCB7IG1zOiA0MDAwLCB0b2FzdDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgZGVycignaGFuZGxlQ2xpY2s6JywgZXJyKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIC8vIG5vIHRyYW5zaWVudCBVSSB0byByZXN0b3JlIGhlcmU7IGtlZXAgaWRlbXBvdGVudFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJlZmVyIEtPIHZpYSBUTVV0aWxzLmdldE9ic1ZhbHVlOyB3b3JrcyB3aXRoIFZNIG9yIERPTSBub2RlIChyZXNvbHZlcyBLTyBjb250ZXh0KS5cbiAgICBmdW5jdGlvbiByZWFkUGFydEZyb21BbnkobW9kYWxFbCwgdm1DYW5kaWRhdGUpIHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSBbXG4gICAgICAgICAgICAvLyBkaXJlY3RcbiAgICAgICAgICAgICdQYXJ0Tm8nLCAnSXRlbU5vJywgJ1BhcnRfTnVtYmVyJywgJ0l0ZW1fTnVtYmVyJywgJ1BhcnQnLCAnSXRlbScsXG4gICAgICAgICAgICAnUGFydE5vTmV3JywgJ1BhcnROb09sZCcsXG4gICAgICAgICAgICAvLyBuZXN0ZWQgY29tbW9uXG4gICAgICAgICAgICAnUXVvdGVQYXJ0LlBhcnRObycsICdRdW90ZVBhcnQuUGFydF9OdW1iZXInLFxuICAgICAgICAgICAgJ1NlbGVjdGVkUm93LlBhcnRObycsICdSb3cuUGFydE5vJywgJ01vZGVsLlBhcnRObycsXG4gICAgICAgICAgICAvLyB3aGVuIHZtIGlzIHdyYXBwZXIgb2JqZWN0c1xuICAgICAgICAgICAgJ2RhdGEuUGFydE5vJywgJ2RhdGEuSXRlbU5vJywgJ21vZGVsLlBhcnRObycsICdtb2RlbC5JdGVtTm8nXG4gICAgICAgIF07XG4gICAgICAgIGNvbnN0IFRNVSA9IHdpbmRvdy5UTVV0aWxzO1xuXG4gICAgICAgIC8vIDEpIG1vZGFsIFZNIHByZWZlcnJlZFxuICAgICAgICBpZiAodm1DYW5kaWRhdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHZWTSA9IFRNVT8uZ2V0T2JzVmFsdWU/Lih2bUNhbmRpZGF0ZSwgcGF0aHMsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUsIGFsbG93UGxleDogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGlmICh2Vk0pIHJldHVybiB2Vk07XG4gICAgICAgIH1cbiAgICAgICAgLy8gMikgbW9kYWwgZWxlbWVudCBLTyBjb250ZXh0XG4gICAgICAgIGNvbnN0IHZNb2RhbCA9IFRNVT8uZ2V0T2JzVmFsdWU/Lihtb2RhbEVsLCBwYXRocywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSwgYWxsb3dQbGV4OiB0cnVlIH0pO1xuICAgICAgICBpZiAodk1vZGFsKSByZXR1cm4gdk1vZGFsO1xuICAgICAgICAvLyAzKSBET00gaW5wdXRzIChsYXN0IHJlc29ydClcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gbW9kYWxFbD8ucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT1cIlBhcnROb1wiXSxpbnB1dFtuYW1lPVwiUGFydF9OdW1iZXJcIl0saW5wdXRbbmFtZT1cIkl0ZW1Ob1wiXSxpbnB1dFtuYW1lPVwiSXRlbV9OdW1iZXJcIl0nKTtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IChlbD8udmFsdWUgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmIChyYXcpIHJldHVybiByYXc7XG4gICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cblxuICAgIC8vID09PT09IE1vZGFsIHdpcmluZyAoaWRlbXBvdGVudCBwZXIgbW9kYWwpXG4gICAgZnVuY3Rpb24gb25Ob2RlUmVtb3ZlZChub2RlLCBjYikge1xuICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUub3duZXJEb2N1bWVudCkgcmV0dXJuICgpID0+IHsgfTtcbiAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSBmb3IgKGNvbnN0IG4gb2YgbS5yZW1vdmVkTm9kZXMgfHwgW10pIHtcbiAgICAgICAgICAgICAgICBpZiAobiA9PT0gbm9kZSB8fCAobi5jb250YWlucyAmJiBuLmNvbnRhaW5zKG5vZGUpKSkgeyB0cnkgeyBjYigpOyB9IGZpbmFsbHkgeyBtby5kaXNjb25uZWN0KCk7IH0gcmV0dXJuOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmplY3RTdG9ja0NvbnRyb2xzKHVsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBtb2RhbCA9IHVsLmNsb3Nlc3QoJy5wbGV4LWRpYWxvZycpO1xuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBtb2RhbD8ucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLXRpdGxlJyk/LnRleHRDb250ZW50Py50cmltKCk7XG4gICAgICAgICAgICAvLyBvcHRpb25zIHJlbW92ZWQ6IG1hdGNoIGJ5IHRpdGxlIG9ubHlcbiAgICAgICAgICAgIGNvbnN0IGxvb2tzUmlnaHQgPSB0aXRsZSA9PT0gQ0ZHLk1PREFMX1RJVExFO1xuICAgICAgICAgICAgaWYgKCFsb29rc1JpZ2h0KSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh1bC5kYXRhc2V0LnF0MjBJbmplY3RlZCkgcmV0dXJuO1xuICAgICAgICAgICAgdWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQgPSAnMSc7XG4gICAgICAgICAgICBkbG9nKCdpbmplY3RpbmcgY29udHJvbHMnKTtcblxuICAgICAgICAgICAgLy8gTWFpbiBhY3Rpb24gKHRoZW1lZCBhbmNob3IgaW5zaWRlIExJIHRvIG1hdGNoIFBsZXggYWN0aW9uIGJhciBzaXppbmcpXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgbGlNYWluLmNsYXNzTmFtZSA9ICdsdC1hY3Rpb24gbHQtYWN0aW9uLS1icmFuZCc7XG4gICAgICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBidG4uaHJlZiA9ICdqYXZhc2NyaXB0OnZvaWQoMCknO1xuICAgICAgICAgICAgYnRuLmlkID0gJ3F0MjAtc3RvY2stbGktYnRuJztcbiAgICAgICAgICAgIGJ0bi5jbGFzc05hbWUgPSAnbHQtYnRuIGx0LWJ0bi0tZ2hvc3QnO1xuICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ0dldCBTdG9jayBMZXZlbHMnO1xuICAgICAgICAgICAgYnRuLnRpdGxlID0gJ0ZldGNoIHN0b2NrIGZvciB0aGlzIHBhcnQgKG5vIHN0YW1wKSc7XG4gICAgICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGhhbmRsZUNsaWNrKG1vZGFsKTsgfSk7XG4gICAgICAgICAgICBsaU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIHVsLmFwcGVuZENoaWxkKGxpTWFpbik7XG5cblxuICAgICAgICAgICAgLy8vLyBNYWluIGFjdGlvblxuICAgICAgICAgICAgLy9jb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgLy9jb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICAvL2J0bi5ocmVmID0gJ2phdmFzY3JpcHQ6dm9pZCgwKSc7XG4gICAgICAgICAgICAvL2J0bi50ZXh0Q29udGVudCA9ICdMVCBHZXQgU3RvY2sgTGV2ZWxzJztcbiAgICAgICAgICAgIC8vYnRuLnRpdGxlID0gJ1Nob3cgdG90YWwgc3RvY2sgKG5vIHN0YW1wKSc7XG4gICAgICAgICAgICAvL2J0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnR2V0IHN0b2NrIGxldmVscycpO1xuICAgICAgICAgICAgLy9idG4uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgLy9PYmplY3QuYXNzaWduKGJ0bi5zdHlsZSwgeyBjdXJzb3I6ICdwb2ludGVyJywgdHJhbnNpdGlvbjogJ2ZpbHRlciAuMTVzLCB0ZXh0LWRlY29yYXRpb24tY29sb3IgLjE1cycgfSk7XG4gICAgICAgICAgICAvL2J0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJ2JyaWdodG5lc3MoMS4wOCknOyBidG4uc3R5bGUudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJzsgfSk7XG4gICAgICAgICAgICAvL2J0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJyc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgIC8vYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcycHggc29saWQgIzRhOTBlMic7IGJ0bi5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7IH0pO1xuICAgICAgICAgICAgLy9idG4uYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnJzsgYnRuLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJzsgfSk7XG4gICAgICAgICAgICAvL2J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUNsaWNrKG1vZGFsKSk7XG4gICAgICAgICAgICAvL2J0bi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgIC8vICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7IGUucHJldmVudERlZmF1bHQoKTsgaGFuZGxlQ2xpY2sobW9kYWwpOyB9XG4gICAgICAgICAgICAvL30pO1xuICAgICAgICAgICAgLy9saU1haW4uYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICAgICAgICAgIC8vdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gTGV0IG90aGVyIG1vZHVsZXMgcmVmcmVzaCBpZiB0aGV5IGNhcmUgKG5vLW9wIGhlcmUpXG4gICAgICAgICAgICBvbk5vZGVSZW1vdmVkKG1vZGFsLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgVyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6ICh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgPyBnbG9iYWxUaGlzIDogbnVsbCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IENFID0gKFcgJiYgKCdDdXN0b21FdmVudCcgaW4gVykgPyBXLkN1c3RvbUV2ZW50IDogZ2xvYmFsVGhpcy5DdXN0b21FdmVudCk7XG4gICAgICAgICAgICAgICAgaWYgKFcgJiYgVy5kaXNwYXRjaEV2ZW50ICYmIENFKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBXLmRpc3BhdGNoRXZlbnQobmV3IENFKCdMVDpBdHRhY2htZW50UmVmcmVzaFJlcXVlc3RlZCcsIHsgZGV0YWlsOiB7IHNvdXJjZTogJ1FUMjAnLCB0czogRGF0ZS5ub3coKSB9IH0pKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBkZXJyKCdpbmplY3Q6JywgZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBIVUJfQlROX0lEID0gJ3F0MjAtc3RvY2stYnRuJztcblxuICAgIGZ1bmN0aW9uIGdldEFjdGl2ZU1vZGFsVGl0bGUoKSB7XG4gICAgICAgIGNvbnN0IHQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMgLnBsZXgtZGlhbG9nLXRpdGxlJyk7XG4gICAgICAgIHJldHVybiAodD8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNUYXJnZXRNb2RhbE9wZW4oKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbW9kYWwtb3BlbicpXG4gICAgICAgICAgICAmJiAvXnF1b3RlXFxzKnBhcnRcXHMqZGV0YWlsJC9pLnRlc3QoZ2V0QWN0aXZlTW9kYWxUaXRsZSgpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVNb2RhbFJvb3QoKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2ctaGFzLWJ1dHRvbnMnKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1kaWFsb2cnKTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVIdWJCdXR0b24oKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IHdpbmRvdy5lbnN1cmVMVEh1Yj8uKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgIGNvbnN0IGh1YiA9IGx0Py5jb3JlPy5odWI7XG4gICAgICAgIGlmICghaHViIHx8ICFodWIucmVnaXN0ZXJCdXR0b24pIHJldHVybjsgLy8gVUkgbm90IHJlYWR5IHlldFxuXG4gICAgICAgIC8vIERvbid0IGRvdWJsZS1yZWdpc3RlclxuICAgICAgICBpZiAoaHViLmhhcz8uKEhVQl9CVE5fSUQpKSByZXR1cm47XG5cbiAgICAgICAgaHViLnJlZ2lzdGVyQnV0dG9uKCdsZWZ0Jywge1xuICAgICAgICAgICAgaWQ6IEhVQl9CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogJ1N0b2NrJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRmV0Y2ggc3RvY2sgZm9yIGN1cnJlbnQgcGFydCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IDExMCxcbiAgICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IGhhbmRsZUNsaWNrKGdldEFjdGl2ZU1vZGFsUm9vdCgpKVxuICAgICAgICB9KTtcblxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUh1YkJ1dHRvbigpIHtcbiAgICAgICAgY29uc3QgaHViID0gbHQ/LmNvcmU/Lmh1YjtcbiAgICAgICAgaHViPy5yZW1vdmU/LihIVUJfQlROX0lEKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWJvdW5jZShmbiwgbXMgPSA1MCkge1xuICAgICAgICBsZXQgaWQgPSBudWxsO1xuICAgICAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHsgY2xlYXJUaW1lb3V0KGlkKTsgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGZuKC4uLmFyZ3MpLCBtcyk7IH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVjb25jaWxlSHViQnV0dG9uVmlzaWJpbGl0eSA9IGRlYm91bmNlKGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGlzVGFyZ2V0TW9kYWxPcGVuKCkpIHtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUh1YkJ1dHRvbigpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVtb3ZlSHViQnV0dG9uKCk7XG4gICAgICAgIH1cbiAgICB9LCA1MCk7XG5cbiAgICAvLyA9PT09PSBCb290IC8gU1BBIHdpcmluZ1xuICAgIGxldCBzdG9wT2JzZXJ2ZSA9IG51bGw7XG4gICAgbGV0IG9mZlVybCA9IG51bGw7XG4gICAgbGV0IGJvb3RlZCA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gd2lyZU5hdihoYW5kbGVyKSB7IG9mZlVybD8uKCk7IG9mZlVybCA9IHdpbmRvdy5UTVV0aWxzPy5vblVybENoYW5nZT8uKGhhbmRsZXIpOyB9XG5cbiAgICBmdW5jdGlvbiBzdGFydE1vZGFsT2JzZXJ2ZXIoKSB7XG4gICAgICAgIHN0b3BPYnNlcnZlPy4oKTtcbiAgICAgICAgc3RvcE9ic2VydmUgPSB3aW5kb3cuVE1VdGlscz8ub2JzZXJ2ZUluc2VydE1hbnk/LihDRkcuQUNUSU9OU19VTF9TRUwsIGluamVjdFN0b2NrQ29udHJvbHMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0b3BNb2RhbE9ic2VydmVyKCkge1xuICAgICAgICB0cnkgeyBzdG9wT2JzZXJ2ZT8uKCk7IH0gY2F0Y2ggeyB9IGZpbmFsbHkgeyBzdG9wT2JzZXJ2ZSA9IG51bGw7IH1cbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICBpZiAoYm9vdGVkKSByZXR1cm47XG4gICAgICAgIGJvb3RlZCA9IHRydWU7XG4gICAgICAgIGF3YWl0IHJhZigpO1xuICAgICAgICBhd2FpdCBlbnN1cmVXaXphcmRWTSgpO1xuICAgICAgICBzdGFydE1vZGFsT2JzZXJ2ZXIoKTtcblxuICAgICAgICAvLyBTaG93L2hpZGUgdGhlIGJ1dHRvbiBhcyB0aGUgbW9kYWwgb3BlbnMvY2xvc2VzIGFuZCB0aXRsZXMgY2hhbmdlXG4gICAgICAgIHJlY29uY2lsZUh1YkJ1dHRvblZpc2liaWxpdHkoKTtcblxuICAgICAgICBjb25zdCBib2R5T2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICBpZiAobXV0cy5zb21lKG0gPT4gbS50eXBlID09PSAnYXR0cmlidXRlcycpKSByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCk7XG4gICAgICAgIH0pO1xuICAgICAgICBib2R5T2JzLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnY2xhc3MnXSB9KTtcblxuICAgICAgICAvLyBNb2RhbCB0aXRsZSBtYXkgY2hhbmdlIGFmdGVyIG9wZW5pbmdcbiAgICAgICAgY29uc3QgbW9kYWxSb290ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zJykgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgICAgY29uc3QgdGl0bGVPYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiByZWNvbmNpbGVIdWJCdXR0b25WaXNpYmlsaXR5KCkpO1xuICAgICAgICB0aXRsZU9icy5vYnNlcnZlKG1vZGFsUm9vdCwgeyBzdWJ0cmVlOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cblxuICAgICAgICBkbG9nKCdpbml0aWFsaXplZCcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRlYXJkb3duKCkge1xuICAgICAgICBib290ZWQgPSBmYWxzZTtcbiAgICAgICAgc3RvcE1vZGFsT2JzZXJ2ZXIoKTtcbiAgICB9XG5cbiAgICB3aXJlTmF2KCgpID0+IHsgaWYgKHdpbmRvdy5UTVV0aWxzPy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkgaW5pdCgpOyBlbHNlIHRlYXJkb3duKCk7IH0pO1xuICAgIGluaXQoKTtcblxuICAgIC8vIERldiBzZWFtIChvcHRpb25hbClcbiAgICBpZiAoREVWICYmIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHdpbmRvdy5fX1FUMjBfXyA9IHsgaW5qZWN0U3RvY2tDb250cm9scywgaGFuZGxlQ2xpY2ssIHNwbGl0QmFzZUFuZFBhY2ssIHRvQmFzZVBhcnQsIG5vcm1hbGl6ZVJvd1RvUGllY2VzLCBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLE1BQU0sTUFBTyxPQUNQLE9BQ0Esa0NBQWtDLEtBQUssU0FBUyxRQUFRO0FBRTlELEdBQUMsTUFBTTtBQUNIO0FBR0EsVUFBTSxPQUFPLElBQUksTUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUN4RCxVQUFNLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxxQkFBVyxHQUFHLENBQUM7QUFDcEQsVUFBTSxLQUFNLE9BQU8saUJBQWlCLGNBQWMsYUFBYSxLQUFLLE9BQU87QUFDM0UsVUFBTSxNQUFNLE1BQU0sSUFBSSxRQUFRLE9BQUssc0JBQXNCLENBQUMsQ0FBQztBQUczRCxRQUFJLEVBQUUsb0JBQW9CLFdBQVcsQ0FBQyxPQUFPLGVBQWdCLFFBQU8saUJBQWlCO0FBQ3JGLEtBQUMsWUFBWTtBQUNULFVBQUk7QUFBRSxjQUFNLE9BQU8sY0FBYyxFQUFFLE9BQU8sT0FBTyxlQUFlLENBQUM7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUFFO0FBQUEsSUFFbEYsR0FBRztBQUdILFVBQU0sU0FBUyxDQUFDLHNDQUFzQztBQUN0RCxRQUFJLENBQUMsT0FBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDLEVBQUc7QUFFcEQsVUFBTSxNQUFNO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixhQUFhO0FBQUE7QUFBQTtBQUFBLE1BR2IsWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1YsZ0JBQWdCO0FBQUEsTUFDaEIsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFB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
