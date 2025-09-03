// ==UserScript==
// @name         QT20_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.6
// @description  DEV-only build; includes user-start gate
// @match        https://*.plex.com/*
// @match        https://*.on.plex.com/*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js
// @require      http://localhost:5000/lt-plex-auth.user.js
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
  // src/quote-tracking/PartStockLevelGet/index.js
  var DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
  (() => {
    const CONFIG = {
      DS_STOCK: 172,
      toastMs: 3500,
      modalTitle: "Quote Part Detail",
      settingsKey: "qt20_settings_v1",
      defaults: { includeBreakdown: true, includeTimestamp: true }
    };
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.("QT20");
    const dlog = (...a) => {
      if (DEV || IS_TEST_ENV) L?.log?.(...a);
    };
    const dwarn = (...a) => {
      if (DEV || IS_TEST_ENV) L?.warn?.(...a);
    };
    const derror = (...a) => {
      if (DEV || IS_TEST_ENV) L?.error?.(...a);
    };
    const KO = typeof unsafeWindow !== "undefined" && unsafeWindow.ko ? unsafeWindow.ko : window.ko;
    const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
      dlog("QT20: wrong route, skipping");
      return;
    }
    function loadSettings() {
      try {
        const v = GM_getValue(CONFIG.settingsKey, CONFIG.defaults);
        return typeof v === "string" ? { ...CONFIG.defaults, ...JSON.parse(v) } : { ...CONFIG.defaults, ...v };
      } catch {
        return { ...CONFIG.defaults };
      }
    }
    function saveSettings(next) {
      try {
        GM_setValue(CONFIG.settingsKey, next);
      } catch {
        GM_setValue(CONFIG.settingsKey, JSON.stringify(next));
      }
    }
    function devToast(msg, level = "info", ms = CONFIG.toastMs) {
      try {
        if (typeof TMUtils?.toast === "function") {
          TMUtils.toast(msg, level, ms);
          if (DEV) console.debug("[QT20 DEV] toast via TMUtils:", level, msg);
          return;
        }
      } catch (e) {
        if (DEV) console.debug("[QT20 DEV] TMUtils.toast threw", e);
      }
      if (!DEV) return;
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 2147483647,
        padding: "10px 12px",
        borderRadius: "8px",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        font: "14px/1.3 system-ui, Segoe UI, Arial",
        color: "#fff",
        background: level === "success" ? "#1b5e20" : level === "warn" ? "#7f6000" : level === "error" ? "#b71c1c" : "#424242",
        whiteSpace: "pre-wrap",
        maxWidth: "36ch"
      });
      el.textContent = String(msg);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), ms || 3500);
    }
    async function withFreshAuth(run) {
      try {
        return await run();
      } catch (err) {
        const status = err?.status || (/\b(\d{3})\b/.exec(err?.message || "") || [])[1];
        if (+status === 419) {
          await TMUtils.getApiKey({ force: true });
          return await run();
        }
        throw err;
      }
    }
    async function ensureAuthOrToast() {
      try {
        const key = await TMUtils.getApiKey({ wait: true, timeoutMs: 3e3, pollMs: 150 });
        if (key) return true;
      } catch {
      }
      devToast("Sign-in required. Please log in, then click again.", "warn", 5e3);
      return false;
    }
    const stopObserve = TMUtils.observeInsertMany(
      ".plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions",
      injectStockControls
    );
    TMUtils.onUrlChange?.(() => {
      if (!TMUtils.matchRoute?.(ROUTES)) {
        try {
          stopObserve?.();
        } catch {
        }
      }
    });
    function injectStockControls(ul) {
      try {
        let openPanel2 = function() {
          panel.style.display = "block";
          document.addEventListener("mousedown", outsideClose2, true);
          document.addEventListener("keydown", escClose2, true);
        }, closePanel2 = function() {
          panel.style.display = "none";
          document.removeEventListener("mousedown", outsideClose2, true);
          document.removeEventListener("keydown", escClose2, true);
        }, outsideClose2 = function(e) {
          if (!panel.contains(e.target) && e.target !== gear) closePanel2();
        }, escClose2 = function(e) {
          if (e.key === "Escape") closePanel2();
        };
        var openPanel = openPanel2, closePanel = closePanel2, outsideClose = outsideClose2, escClose = escClose2;
        const modal = ul.closest(".plex-dialog");
        const title = modal?.querySelector(".plex-dialog-title")?.textContent?.trim();
        const looksRight = title === CONFIG.modalTitle || modal?.querySelector('textarea[name="NoteNew"]');
        if (!looksRight) return;
        if (ul.dataset.qt20Injected) return;
        ul.dataset.qt20Injected = "1";
        dlog("QT20: injecting controls");
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
          panel.style.display === "none" ? openPanel2() : closePanel2();
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
        panel.querySelector("#qt20-close")?.addEventListener("click", closePanel2);
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
        derror("QT20 inject:", e);
      }
    }
    async function handleClick(btn, modalEl) {
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.5";
      const restore = () => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      };
      try {
        devToast("\u23F3 Fetching stock levels\u2026", "info", 5e3);
        if (!await ensureAuthOrToast()) throw new Error("No API key/session");
        const ta = modalEl.querySelector('textarea[name="NoteNew"]') || document.querySelector('textarea[name="NoteNew"]');
        if (!ta) throw new Error("NoteNew textarea not found");
        const ctx = KO?.contextFor?.(ta);
        const vm = ctx?.$root?.data;
        if (!vm) throw new Error("Knockout context not found");
        const partNo = readPartFromVM(vm, KO);
        if (!partNo) throw new Error("PartNo not available");
        const basePart = toBasePart(partNo);
        const canWrite = true;
        const rows = await withFreshAuth(() => TMUtils.dsRows(CONFIG.DS_STOCK, {
          Part_No: basePart,
          Shippable: "TRUE",
          Container_Status: "OK"
        }));
        const { sum, breakdown } = summarizeStockNormalized(rows || [], basePart);
        const S = loadSettings();
        const parts = [`STK: ${formatInt(sum)} pcs`];
        if (S.includeBreakdown && breakdown.length) {
          const bk = breakdown.map(({ loc, qty }) => `${loc} ${formatInt(qty)}`).join(", ");
          parts.push(`(${bk})`);
        }
        if (S.includeTimestamp) parts.push(`@${formatTimestamp(/* @__PURE__ */ new Date())}`);
        const stamp = parts.join(" ");
        let rawNote;
        if (unsafeWindow.plex?.data?.getObservableOrValue) {
          rawNote = unsafeWindow.plex.data.getObservableOrValue(vm, "NoteNew");
        } else if (typeof vm.NoteNew === "function") {
          rawNote = vm.NoteNew.call(vm);
        } else {
          rawNote = vm.NoteNew;
        }
        const current = TMUtils.getObsValue(vm, "NoteNew", { trim: true }) || "";
        const baseNote = /^(null|undefined)$/i.test(current) ? "" : current;
        const cleaned = baseNote.replace(
          /(?:^|\s)STK:\s*[\d,]+(?:\s*pcs)?(?:\s*\([^)]*\))?(?:\s*@[0-9:\-\/\s]+)?/gi,
          ""
        ).trim();
        const newNote = cleaned ? `${cleaned} ${stamp}` : stamp;
        TMUtils.setObsValue(vm, "NoteNew", newNote);
        devToast(`\u2705 ${stamp}`, "success", CONFIG.toastMs);
        dlog("QT20 success", { partNo, basePart, sum, breakdown, newNote });
      } catch (err) {
        devToast(`\u274C ${err.message || err}`, "error", 8e3);
        derror("QT20:", err);
      } finally {
        restore();
      }
    }
    function readPartFromVM(vm, KOref) {
      const keys = ["PartNo", "ItemNo", "Part_Number", "Item_Number", "Part", "Item"];
      for (const k of keys) {
        const v = TMUtils.getObsValue(vm, k, { first: true, trim: true });
        if (v) return v;
      }
      return "";
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
    function formatInt(n) {
      return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    function formatTimestamp(d) {
      const pad = (x) => String(x).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    if (DEV && typeof window !== "undefined") {
      window.__QT20__ = {
        injectStockControls,
        splitBaseAndPack,
        toBasePart,
        normalizeRowToPieces,
        summarizeStockNormalized,
        handleClick
      };
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvUGFydFN0b2NrTGV2ZWxHZXQvaW5kZXguanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIHRtLXNjcmlwdHMvc3JjL3F0MjAvaW5kZXguanNcbi8qIEJ1aWxkLXRpbWUgZGV2IGZsYWcgKGVzYnVpbGQgc2V0cyBfX0JVSUxEX0RFVl9fKSwgd2l0aCBhIHJ1bnRpbWUgZmFsbGJhY2sgZm9yIHRlc3RzICovXG5jb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgID8gX19CVUlMRF9ERVZfX1xuICAgIDogISEodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRoaXMuX19UTV9ERVZfXyk7XG5cblxuKCgpID0+IHtcbiAgICAvLyAtLS0tLS0tLS0tIENvbmZpZyAtLS0tLS0tLS0tXG4gICAgY29uc3QgQ09ORklHID0ge1xuICAgICAgICBEU19TVE9DSzogMTcyLFxuICAgICAgICB0b2FzdE1zOiAzNTAwLFxuICAgICAgICBtb2RhbFRpdGxlOiAnUXVvdGUgUGFydCBEZXRhaWwnLFxuICAgICAgICBzZXR0aW5nc0tleTogJ3F0MjBfc2V0dGluZ3NfdjEnLFxuICAgICAgICBkZWZhdWx0czogeyBpbmNsdWRlQnJlYWtkb3duOiB0cnVlLCBpbmNsdWRlVGltZXN0YW1wOiB0cnVlIH0sXG4gICAgfTtcblxuICAgIC8vIC0tLS0tLS0tLS0gQm9vdHN0cmFwIC0tLS0tLS0tLS1cbiAgICBjb25zdCBJU19URVNUX0VOViA9IC90ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xuICAgIFRNVXRpbHMuc2V0RGVidWc/LihJU19URVNUX0VOVik7XG4gICAgY29uc3QgTCA9IFRNVXRpbHMuZ2V0TG9nZ2VyPy4oJ1FUMjAnKTtcbiAgICBjb25zdCBkbG9nID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUX0VOVikgTD8ubG9nPy4oLi4uYSk7IH07XG4gICAgY29uc3QgZHdhcm4gPSAoLi4uYSkgPT4geyBpZiAoREVWIHx8IElTX1RFU1RfRU5WKSBMPy53YXJuPy4oLi4uYSk7IH07XG4gICAgY29uc3QgZGVycm9yID0gKC4uLmEpID0+IHsgaWYgKERFViB8fCBJU19URVNUX0VOVikgTD8uZXJyb3I/LiguLi5hKTsgfTtcblxuICAgIGNvbnN0IEtPID0gKHR5cGVvZiB1bnNhZmVXaW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHVuc2FmZVdpbmRvdy5rbylcbiAgICAgICAgPyB1bnNhZmVXaW5kb3cua29cbiAgICAgICAgOiB3aW5kb3cua287XG5cbiAgICBjb25zdCBST1VURVMgPSBbL15cXC9TYWxlc0FuZENSTVxcL1F1b3RlV2l6YXJkKD86XFwvfCQpL2ldO1xuICAgIGlmICghVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkgeyBkbG9nKCdRVDIwOiB3cm9uZyByb3V0ZSwgc2tpcHBpbmcnKTsgcmV0dXJuOyB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIChHTSBzdG9yYWdlKSAtLS0tLS0tLS0tXG4gICAgZnVuY3Rpb24gbG9hZFNldHRpbmdzKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdiA9IEdNX2dldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgQ09ORklHLmRlZmF1bHRzKTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB7IC4uLkNPTkZJRy5kZWZhdWx0cywgLi4uSlNPTi5wYXJzZSh2KSB9IDogeyAuLi5DT05GSUcuZGVmYXVsdHMsIC4uLnYgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiB7IC4uLkNPTkZJRy5kZWZhdWx0cyB9OyB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNhdmVTZXR0aW5ncyhuZXh0KSB7XG4gICAgICAgIHRyeSB7IEdNX3NldFZhbHVlKENPTkZJRy5zZXR0aW5nc0tleSwgbmV4dCk7IH1cbiAgICAgICAgY2F0Y2ggeyBHTV9zZXRWYWx1ZShDT05GSUcuc2V0dGluZ3NLZXksIEpTT04uc3RyaW5naWZ5KG5leHQpKTsgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gVG9hc3QgKHJvYnVzdCBpbiBERVYpIC0tLS0tLS0tLS1cbiAgICBmdW5jdGlvbiBkZXZUb2FzdChtc2csIGxldmVsID0gJ2luZm8nLCBtcyA9IENPTkZJRy50b2FzdE1zKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIFRNVXRpbHM/LnRvYXN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgVE1VdGlscy50b2FzdChtc2csIGxldmVsLCBtcyk7XG4gICAgICAgICAgICAgICAgaWYgKERFVikgY29uc29sZS5kZWJ1ZygnW1FUMjAgREVWXSB0b2FzdCB2aWEgVE1VdGlsczonLCBsZXZlbCwgbXNnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGlmIChERVYpIGNvbnNvbGUuZGVidWcoJ1tRVDIwIERFVl0gVE1VdGlscy50b2FzdCB0aHJldycsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghREVWKSByZXR1cm47IC8vIGluIFBST0QsIHNpbGVudGx5IHNraXAgZmFsbGJhY2tcbiAgICAgICAgLy8gREVWLW9ubHkgZmFsbGJhY2sgdG9hc3RcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihlbC5zdHlsZSwge1xuICAgICAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsIHJpZ2h0OiAnMTZweCcsIGJvdHRvbTogJzE2cHgnLFxuICAgICAgICAgICAgekluZGV4OiAyMTQ3NDgzNjQ3LCBwYWRkaW5nOiAnMTBweCAxMnB4JywgYm9yZGVyUmFkaXVzOiAnOHB4JyxcbiAgICAgICAgICAgIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwuMjUpJywgZm9udDogJzE0cHgvMS4zIHN5c3RlbS11aSwgU2Vnb2UgVUksIEFyaWFsJyxcbiAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsIGJhY2tncm91bmQ6IGxldmVsID09PSAnc3VjY2VzcycgPyAnIzFiNWUyMCcgOiBsZXZlbCA9PT0gJ3dhcm4nID8gJyM3ZjYwMDAnIDogbGV2ZWwgPT09ICdlcnJvcicgPyAnI2I3MWMxYycgOiAnIzQyNDI0MicsXG4gICAgICAgICAgICB3aGl0ZVNwYWNlOiAncHJlLXdyYXAnLCBtYXhXaWR0aDogJzM2Y2gnXG4gICAgICAgIH0pO1xuICAgICAgICBlbC50ZXh0Q29udGVudCA9IFN0cmluZyhtc2cpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBlbC5yZW1vdmUoKSwgbXMgfHwgMzUwMCk7XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBBdXRoIGhlbHBlcnMgLS0tLS0tLS0tLVxuICAgIGFzeW5jIGZ1bmN0aW9uIHdpdGhGcmVzaEF1dGgocnVuKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgcnVuKCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gZXJyPy5zdGF0dXMgfHwgKC9cXGIoXFxkezN9KVxcYi8uZXhlYyhlcnI/Lm1lc3NhZ2UgfHwgJycpIHx8IFtdKVsxXTtcbiAgICAgICAgICAgIGlmICgrc3RhdHVzID09PSA0MTkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBUTVV0aWxzLmdldEFwaUtleSh7IGZvcmNlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhc3luYyBmdW5jdGlvbiBlbnN1cmVBdXRoT3JUb2FzdCgpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IFRNVXRpbHMuZ2V0QXBpS2V5KHsgd2FpdDogdHJ1ZSwgdGltZW91dE1zOiAzMDAwLCBwb2xsTXM6IDE1MCB9KTtcbiAgICAgICAgICAgIGlmIChrZXkpIHJldHVybiB0cnVlO1xuICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICBkZXZUb2FzdCgnU2lnbi1pbiByZXF1aXJlZC4gUGxlYXNlIGxvZyBpbiwgdGhlbiBjbGljayBhZ2Fpbi4nLCAnd2FybicsIDUwMDApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gPT09PT09PT09IEVOVFJZIFBPSU5UUyA9PT09PT09PT1cbiAgICAvLyBJbmplY3QgYnV0dG9ucyB3aGVuZXZlciBhIG1vZGFsIGFjdGlvbnMgbGlzdCBhcHBlYXJzXG4gICAgY29uc3Qgc3RvcE9ic2VydmUgPSBUTVV0aWxzLm9ic2VydmVJbnNlcnRNYW55KFxuICAgICAgICAnLnBsZXgtZGlhbG9nLWhhcy1idXR0b25zIC5wbGV4LWFjdGlvbnMtd3JhcHBlciB1bC5wbGV4LWFjdGlvbnMnLFxuICAgICAgICBpbmplY3RTdG9ja0NvbnRyb2xzXG4gICAgKTtcblxuICAgIC8vIERldGFjaCBvYnNlcnZlciB3aGVuIGxlYXZpbmcgdGhlIHdpemFyZFxuICAgIFRNVXRpbHMub25VcmxDaGFuZ2U/LigoKSA9PiB7XG4gICAgICAgIGlmICghVE1VdGlscy5tYXRjaFJvdXRlPy4oUk9VVEVTKSkge1xuICAgICAgICAgICAgdHJ5IHsgc3RvcE9ic2VydmU/LigpOyB9IGNhdGNoIHsgfVxuICAgICAgICB9XG4gICAgfSk7XG5cblxuICAgIC8vID09PT09PT09PSBVSSBJTkpFQ1RJT04gPT09PT09PT09XG4gICAgZnVuY3Rpb24gaW5qZWN0U3RvY2tDb250cm9scyh1bCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbW9kYWwgPSB1bC5jbG9zZXN0KCcucGxleC1kaWFsb2cnKTtcbiAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gbW9kYWw/LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy10aXRsZScpPy50ZXh0Q29udGVudD8udHJpbSgpO1xuICAgICAgICAgICAgY29uc3QgbG9va3NSaWdodCA9IHRpdGxlID09PSBDT05GSUcubW9kYWxUaXRsZSB8fCBtb2RhbD8ucXVlcnlTZWxlY3RvcigndGV4dGFyZWFbbmFtZT1cIk5vdGVOZXdcIl0nKTtcbiAgICAgICAgICAgIGlmICghbG9va3NSaWdodCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAodWwuZGF0YXNldC5xdDIwSW5qZWN0ZWQpIHJldHVybjsgLy8gaWRlbXBvdGVudCBwZXIgbW9kYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIHVsLmRhdGFzZXQucXQyMEluamVjdGVkID0gJzEnO1xuICAgICAgICAgICAgZGxvZygnUVQyMDogaW5qZWN0aW5nIGNvbnRyb2xzJyk7XG5cbiAgICAgICAgICAgIC8vIE1haW4gYWN0aW9uXG4gICAgICAgICAgICBjb25zdCBsaU1haW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgYnRuLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICdMVCBHZXQgU3RvY2sgTGV2ZWxzJztcbiAgICAgICAgICAgIGJ0bi50aXRsZSA9ICdBcHBlbmQgbm9ybWFsaXplZCBzdG9jayBzdW1tYXJ5IHRvIE5vdGUnO1xuICAgICAgICAgICAgYnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdHZXQgc3RvY2sgbGV2ZWxzJyk7XG4gICAgICAgICAgICBidG4uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHsgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICdmaWx0ZXIgLjE1cywgdGV4dC1kZWNvcmF0aW9uLWNvbG9yIC4xNXMnIH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7IGJ0bi5zdHlsZS5maWx0ZXIgPSAnYnJpZ2h0bmVzcygxLjA4KSc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBidG4uc3R5bGUuZmlsdGVyID0gJyc7IGJ0bi5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsICgpID0+IHsgYnRuLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICM0YTkwZTInOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgKCkgPT4geyBidG4uc3R5bGUub3V0bGluZSA9ICcnOyBidG4uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnOyB9KTtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhhbmRsZUNsaWNrKGJ0biwgbW9kYWwpKTtcbiAgICAgICAgICAgIGxpTWFpbi5hcHBlbmRDaGlsZChidG4pO1xuICAgICAgICAgICAgdWwuYXBwZW5kQ2hpbGQobGlNYWluKTtcblxuICAgICAgICAgICAgLy8gU2V0dGluZ3MgZ2VhclxuICAgICAgICAgICAgY29uc3QgbGlHZWFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgICAgICAgIGNvbnN0IGdlYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICBnZWFyLmhyZWYgPSAnamF2YXNjcmlwdDp2b2lkKDApJztcbiAgICAgICAgICAgIGdlYXIudGV4dENvbnRlbnQgPSAnXHUyNjk5XHVGRTBGJztcbiAgICAgICAgICAgIGdlYXIudGl0bGUgPSAnUVQyMCBTZXR0aW5ncyAoYnJlYWtkb3duIC8gdGltZXN0YW1wKSc7XG4gICAgICAgICAgICBnZWFyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdRVDIwIFNldHRpbmdzJyk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGdlYXIuc3R5bGUsIHsgbWFyZ2luTGVmdDogJzhweCcsIGZvbnRTaXplOiAnMTZweCcsIGxpbmVIZWlnaHQ6ICcxJywgY3Vyc29yOiAncG9pbnRlcicsIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0gLjE1cywgZmlsdGVyIC4xNXMnIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcGFuZWwuY2xhc3NOYW1lID0gJ3F0MjAtc2V0dGluZ3MnO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwYW5lbC5zdHlsZSwge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICc0MHB4JywgcmlnaHQ6ICcxNnB4JyxcbiAgICAgICAgICAgICAgICBtaW5XaWR0aDogJzIyMHB4JywgcGFkZGluZzogJzEwcHggMTJweCcsXG4gICAgICAgICAgICAgICAgYm9yZGVyOiAnMXB4IHNvbGlkICNjY2MnLCBib3JkZXJSYWRpdXM6ICc4cHgnLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgYm94U2hhZG93OiAnMCA2cHggMjBweCByZ2JhKDAsMCwwLDAuMTUpJyxcbiAgICAgICAgICAgICAgICB6SW5kZXg6ICc5OTk5JywgZGlzcGxheTogJ25vbmUnXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgUzAgPSBsb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OjYwMDsgbWFyZ2luLWJvdHRvbTo4cHg7XCI+UVQyMCBTZXR0aW5nczwvZGl2PlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtYnJlYWtkb3duXCIgJHtTMC5pbmNsdWRlQnJlYWtkb3duID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgYnJlYWtkb3duPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGFsaWduLWl0ZW1zOmNlbnRlcjsgbWFyZ2luOjZweCAwO1wiPlxuICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInF0MjAtdGltZXN0YW1wXCIgJHtTMC5pbmNsdWRlVGltZXN0YW1wID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgIDxzcGFuPkluY2x1ZGUgdGltZXN0YW1wPC9zcGFuPlxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4OyBkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGp1c3RpZnktY29udGVudDpmbGV4LWVuZDtcIj5cbiAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBpZD1cInF0MjAtY2xvc2VcIiBzdHlsZT1cInBhZGRpbmc6NHB4IDhweDtcIj5DbG9zZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIGA7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9wZW5QYW5lbCgpIHtcbiAgICAgICAgICAgICAgICBwYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvdXRzaWRlQ2xvc2UsIHRydWUpO1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2NDbG9zZSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbiBjbG9zZVBhbmVsKCkge1xuICAgICAgICAgICAgICAgIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb3V0c2lkZUNsb3NlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZXNjQ2xvc2UsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVuY3Rpb24gb3V0c2lkZUNsb3NlKGUpIHsgaWYgKCFwYW5lbC5jb250YWlucyhlLnRhcmdldCkgJiYgZS50YXJnZXQgIT09IGdlYXIpIGNsb3NlUGFuZWwoKTsgfVxuICAgICAgICAgICAgZnVuY3Rpb24gZXNjQ2xvc2UoZSkgeyBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSBjbG9zZVBhbmVsKCk7IH1cblxuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgcGFuZWwuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnID8gb3BlblBhbmVsKCkgOiBjbG9zZVBhbmVsKCk7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4geyBnZWFyLnN0eWxlLmZpbHRlciA9ICdicmlnaHRuZXNzKDEuMDgpJzsgZ2Vhci5zdHlsZS50cmFuc2Zvcm0gPSAncm90YXRlKDE1ZGVnKSc7IH0pO1xuICAgICAgICAgICAgZ2Vhci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4geyBnZWFyLnN0eWxlLmZpbHRlciA9ICcnOyBnZWFyLnN0eWxlLnRyYW5zZm9ybSA9ICcnOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXMnLCAoKSA9PiB7IGdlYXIuc3R5bGUub3V0bGluZSA9ICcycHggc29saWQgIzRhOTBlMic7IGdlYXIuc3R5bGUub3V0bGluZU9mZnNldCA9ICcycHgnOyB9KTtcbiAgICAgICAgICAgIGdlYXIuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHsgZ2Vhci5zdHlsZS5vdXRsaW5lID0gJyc7IGdlYXIuc3R5bGUub3V0bGluZU9mZnNldCA9ICcnOyB9KTtcblxuICAgICAgICAgICAgcGFuZWwucXVlcnlTZWxlY3RvcignI3F0MjAtY2xvc2UnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbG9zZVBhbmVsKTtcbiAgICAgICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNxdDIwLWJyZWFrZG93bicpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXIgPSBsb2FkU2V0dGluZ3MoKTsgc2F2ZVNldHRpbmdzKHsgLi4uY3VyLCBpbmNsdWRlQnJlYWtkb3duOiAhIWV2LnRhcmdldC5jaGVja2VkIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjcXQyMC10aW1lc3RhbXAnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3VyID0gbG9hZFNldHRpbmdzKCk7IHNhdmVTZXR0aW5ncyh7IC4uLmN1ciwgaW5jbHVkZVRpbWVzdGFtcDogISFldi50YXJnZXQuY2hlY2tlZCB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsaUdlYXIuYXBwZW5kQ2hpbGQoZ2Vhcik7XG4gICAgICAgICAgICB1bC5hcHBlbmRDaGlsZChsaUdlYXIpO1xuICAgICAgICAgICAgKG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LWRpYWxvZy1jb250ZW50JykgfHwgbW9kYWwpLmFwcGVuZENoaWxkKHBhbmVsKTtcblxuICAgICAgICAgICAgLy8gV2hlbiB0aGUgbW9kYWwgY2xvc2VzLCBsZXQgb3RoZXJzIHJlZnJlc2ggKGUuZy4sIGF0dGFjaG1lbnRzKVxuICAgICAgICAgICAgb25Ob2RlUmVtb3ZlZChtb2RhbCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IFcgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiAodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsVGhpcyA6IG51bGwpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBDRSA9IChXICYmICgnQ3VzdG9tRXZlbnQnIGluIFcpID8gVy5DdXN0b21FdmVudCA6IGdsb2JhbFRoaXMuQ3VzdG9tRXZlbnQpO1xuICAgICAgICAgICAgICAgIGlmIChXICYmIFcuZGlzcGF0Y2hFdmVudCAmJiBDRSkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgVy5kaXNwYXRjaEV2ZW50KG5ldyBDRSgnTFQ6QXR0YWNobWVudFJlZnJlc2hSZXF1ZXN0ZWQnLCB7IGRldGFpbDogeyBzb3VyY2U6ICdRVDIwJywgdHM6IERhdGUubm93KCkgfSB9KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZGVycm9yKCdRVDIwIGluamVjdDonLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vID09PT09PT09PSBDT1JFIEhBTkRMRVIgPT09PT09PT09XG4gICAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ2xpY2soYnRuLCBtb2RhbEVsKSB7XG4gICAgICAgIGJ0bi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuICAgICAgICBidG4uc3R5bGUub3BhY2l0eSA9ICcwLjUnO1xuICAgICAgICBjb25zdCByZXN0b3JlID0gKCkgPT4geyBidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnOyBidG4uc3R5bGUub3BhY2l0eSA9ICcnOyB9O1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBkZXZUb2FzdCgnXHUyM0YzIEZldGNoaW5nIHN0b2NrIGxldmVsc1x1MjAyNicsICdpbmZvJywgNTAwMCk7XG5cbiAgICAgICAgICAgIC8vIE1ha2Ugc3VyZSB3ZSBoYXZlIGF1dGhcbiAgICAgICAgICAgIGlmICghKGF3YWl0IGVuc3VyZUF1dGhPclRvYXN0KCkpKSB0aHJvdyBuZXcgRXJyb3IoJ05vIEFQSSBrZXkvc2Vzc2lvbicpO1xuXG4gICAgICAgICAgICAvLyBGaW5kIEtPIFZNIHZpYSBOb3RlTmV3IHRleHRhcmVhIHdpdGhpbiB0aGUgc2FtZSBtb2RhbFxuICAgICAgICAgICAgY29uc3QgdGEgPSBtb2RhbEVsLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhW25hbWU9XCJOb3RlTmV3XCJdJykgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcigndGV4dGFyZWFbbmFtZT1cIk5vdGVOZXdcIl0nKTtcbiAgICAgICAgICAgIGlmICghdGEpIHRocm93IG5ldyBFcnJvcignTm90ZU5ldyB0ZXh0YXJlYSBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgY29uc3QgY3R4ID0gS08/LmNvbnRleHRGb3I/Lih0YSk7XG4gICAgICAgICAgICBjb25zdCB2bSA9IGN0eD8uJHJvb3Q/LmRhdGE7XG4gICAgICAgICAgICBpZiAoIXZtKSB0aHJvdyBuZXcgRXJyb3IoJ0tub2Nrb3V0IGNvbnRleHQgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgIC8vIFJlc29sdmUgcGFydCBmcm9tIFZNLCB0aGVuIG5vcm1hbGl6ZSB0byBiYXNlXG4gICAgICAgICAgICBjb25zdCBwYXJ0Tm8gPSByZWFkUGFydEZyb21WTSh2bSwgS08pO1xuICAgICAgICAgICAgaWYgKCFwYXJ0Tm8pIHRocm93IG5ldyBFcnJvcignUGFydE5vIG5vdCBhdmFpbGFibGUnKTtcbiAgICAgICAgICAgIGNvbnN0IGJhc2VQYXJ0ID0gdG9CYXNlUGFydChwYXJ0Tm8pO1xuXG4gICAgICAgICAgICAvLyBXcml0YWJsZSBOb3RlTmV3IHNldHRlclxuICAgICAgICAgICAgY29uc3QgY2FuV3JpdGUgPSB0cnVlOyAvLyBUTVV0aWxzLnNldE9ic1ZhbHVlIHdpbGwgbm8tb3AgaWYgaXQgY2FuJ3QgZmluZCBhIHNldHRlclxuXG4gICAgICAgICAgICAvLyBEUyBjYWxscyAocmV0cnkgb25jZSBvbiA0MTkpXG4gICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgd2l0aEZyZXNoQXV0aCgoKSA9PiBUTVV0aWxzLmRzUm93cyhDT05GSUcuRFNfU1RPQ0ssIHtcbiAgICAgICAgICAgICAgICBQYXJ0X05vOiBiYXNlUGFydCxcbiAgICAgICAgICAgICAgICBTaGlwcGFibGU6ICdUUlVFJyxcbiAgICAgICAgICAgICAgICBDb250YWluZXJfU3RhdHVzOiAnT0snXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgIC8vIE5vcm1hbGl6ZSBhbmQgc3VtbWFyaXplXG4gICAgICAgICAgICBjb25zdCB7IHN1bSwgYnJlYWtkb3duIH0gPSBzdW1tYXJpemVTdG9ja05vcm1hbGl6ZWQocm93cyB8fCBbXSwgYmFzZVBhcnQpO1xuXG4gICAgICAgICAgICAvLyBCdWlsZCBzdGFtcCBmcm9tIHNldHRpbmdzXG4gICAgICAgICAgICBjb25zdCBTID0gbG9hZFNldHRpbmdzKCk7XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtgU1RLOiAke2Zvcm1hdEludChzdW0pfSBwY3NgXTtcbiAgICAgICAgICAgIGlmIChTLmluY2x1ZGVCcmVha2Rvd24gJiYgYnJlYWtkb3duLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJrID0gYnJlYWtkb3duLm1hcCgoeyBsb2MsIHF0eSB9KSA9PiBgJHtsb2N9ICR7Zm9ybWF0SW50KHF0eSl9YCkuam9pbignLCAnKTtcbiAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKGAoJHtia30pYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoUy5pbmNsdWRlVGltZXN0YW1wKSBwYXJ0cy5wdXNoKGBAJHtmb3JtYXRUaW1lc3RhbXAobmV3IERhdGUoKSl9YCk7XG4gICAgICAgICAgICBjb25zdCBzdGFtcCA9IHBhcnRzLmpvaW4oJyAnKTtcblxuICAgICAgICAgICAgLy8gUmVhZCBhbmQgc2FuaXRpemUgZXhpc3Rpbmcgbm90ZSwgdGhlbiBhcHBlbmRcbiAgICAgICAgICAgIGxldCByYXdOb3RlO1xuICAgICAgICAgICAgaWYgKHVuc2FmZVdpbmRvdy5wbGV4Py5kYXRhPy5nZXRPYnNlcnZhYmxlT3JWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHJhd05vdGUgPSB1bnNhZmVXaW5kb3cucGxleC5kYXRhLmdldE9ic2VydmFibGVPclZhbHVlKHZtLCAnTm90ZU5ldycpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygdm0uTm90ZU5ldyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHJhd05vdGUgPSB2bS5Ob3RlTmV3LmNhbGwodm0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYXdOb3RlID0gdm0uTm90ZU5ldztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUodm0sICdOb3RlTmV3JywgeyB0cmltOiB0cnVlIH0pIHx8ICcnO1xuICAgICAgICAgICAgY29uc3QgYmFzZU5vdGUgPSAoL14obnVsbHx1bmRlZmluZWQpJC9pLnRlc3QoY3VycmVudCkgPyAnJyA6IGN1cnJlbnQpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgcHJpb3IgU1RLOlx1MjAyNiBmcmFnbWVudCBhbnl3aGVyZSBpbiB0aGUgbm90ZVxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZCA9IGJhc2VOb3RlLnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgLyg/Ol58XFxzKVNUSzpcXHMqW1xcZCxdKyg/OlxccypwY3MpPyg/OlxccypcXChbXildKlxcKSk/KD86XFxzKkBbMC05OlxcLVxcL1xcc10rKT8vZ2ksXG4gICAgICAgICAgICAgICAgJydcbiAgICAgICAgICAgICkudHJpbSgpO1xuXG4gICAgICAgICAgICBjb25zdCBuZXdOb3RlID0gY2xlYW5lZCA/IGAke2NsZWFuZWR9ICR7c3RhbXB9YCA6IHN0YW1wO1xuICAgICAgICAgICAgVE1VdGlscy5zZXRPYnNWYWx1ZSh2bSwgJ05vdGVOZXcnLCBuZXdOb3RlKTtcblxuICAgICAgICAgICAgZGV2VG9hc3QoYFx1MjcwNSAke3N0YW1wfWAsICdzdWNjZXNzJywgQ09ORklHLnRvYXN0TXMpO1xuICAgICAgICAgICAgZGxvZygnUVQyMCBzdWNjZXNzJywgeyBwYXJ0Tm8sIGJhc2VQYXJ0LCBzdW0sIGJyZWFrZG93biwgbmV3Tm90ZSB9KTtcblxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGRldlRvYXN0KGBcdTI3NEMgJHtlcnIubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJywgODAwMCk7XG4gICAgICAgICAgICBkZXJyb3IoJ1FUMjA6JywgZXJyKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHJlc3RvcmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vID09PT09PT09PSBIZWxwZXJzID09PT09PT09PVxuICAgIGZ1bmN0aW9uIHJlYWRQYXJ0RnJvbVZNKHZtLCBLT3JlZikge1xuICAgICAgICBjb25zdCBrZXlzID0gWydQYXJ0Tm8nLCAnSXRlbU5vJywgJ1BhcnRfTnVtYmVyJywgJ0l0ZW1fTnVtYmVyJywgJ1BhcnQnLCAnSXRlbSddO1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2Yga2V5cykge1xuICAgICAgICAgICAgY29uc3QgdiA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUodm0sIGssIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAodikgcmV0dXJuIHY7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIC8vIFBhcnNlIFwiQUE1MDAzLTMwLTA1LjAtMDAtMTBCQUdcIiBcdTIxOTIgeyBiYXNlOlwiQUE1MDAzLTMwLTA1LjAtMDBcIiwgcGFja1NpemU6MTAsIHBhY2tVbml0OlwiQkFHXCIgfVxuICAgIGZ1bmN0aW9uIHNwbGl0QmFzZUFuZFBhY2socGFydE5vKSB7XG4gICAgICAgIGNvbnN0IHMgPSBTdHJpbmcocGFydE5vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IG0gPSBzLm1hdGNoKC9eKC4qPyktKFxcZCspXFxzKihCQUd8Qk9YfFBBQ0t8UEtHKSQvaSk7XG4gICAgICAgIGlmIChtKSByZXR1cm4geyBiYXNlOiBtWzFdLCBwYWNrU2l6ZTogTnVtYmVyKG1bMl0pLCBwYWNrVW5pdDogbVszXS50b1VwcGVyQ2FzZSgpIH07XG4gICAgICAgIHJldHVybiB7IGJhc2U6IHMsIHBhY2tTaXplOiBudWxsLCBwYWNrVW5pdDogbnVsbCB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvQmFzZVBhcnQocGFydE5vKSB7XG4gICAgICAgIHJldHVybiBzcGxpdEJhc2VBbmRQYWNrKHBhcnRObykuYmFzZTtcbiAgICB9XG5cbiAgICAvLyBOb3JtYWxpemUgb25lIERTIHJvdyB0byBwaWVjZXMgZm9yIHRhcmdldCBiYXNlXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplUm93VG9QaWVjZXMocm93LCB0YXJnZXRCYXNlKSB7XG4gICAgICAgIGNvbnN0IHJvd1BhcnQgPSBTdHJpbmcocm93Py5QYXJ0X05vIHx8ICcnKS50cmltKCk7XG4gICAgICAgIGNvbnN0IHsgYmFzZSwgcGFja1NpemUgfSA9IHNwbGl0QmFzZUFuZFBhY2socm93UGFydCk7XG4gICAgICAgIGlmICghYmFzZSB8fCBiYXNlICE9PSB0YXJnZXRCYXNlKSByZXR1cm4gMDtcblxuICAgICAgICBjb25zdCB1bml0ID0gU3RyaW5nKHJvdz8uVW5pdCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcXR5ID0gTnVtYmVyKHJvdz8uUXVhbnRpdHkpIHx8IDA7XG5cbiAgICAgICAgaWYgKHVuaXQgPT09ICcnIHx8IHVuaXQgPT09ICdwY3MnIHx8IHVuaXQgPT09ICdwaWVjZScgfHwgdW5pdCA9PT0gJ3BpZWNlcycpIHJldHVybiBxdHk7XG4gICAgICAgIGlmIChwYWNrU2l6ZSkgcmV0dXJuIHF0eSAqIHBhY2tTaXplOyAvLyBjb252ZXJ0IGJhZ3MvYm94ZXMvZXRjLiB0byBwY3NcbiAgICAgICAgcmV0dXJuIHF0eTsgLy8gZmFsbGJhY2sgKGV4dGVuZCBydWxlcyBhcyBuZWVkZWQpXG4gICAgfVxuXG4gICAgLy8gU3VtICsgcGVyLWxvY2F0aW9uIGJyZWFrZG93biAoc29ydGVkIGRlc2MpXG4gICAgZnVuY3Rpb24gc3VtbWFyaXplU3RvY2tOb3JtYWxpemVkKHJvd3MsIHRhcmdldEJhc2UpIHtcbiAgICAgICAgY29uc3QgYnlMb2MgPSBuZXcgTWFwKCk7XG4gICAgICAgIGxldCB0b3RhbCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgciBvZiAocm93cyB8fCBbXSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHBjcyA9IG5vcm1hbGl6ZVJvd1RvUGllY2VzKHIsIHRhcmdldEJhc2UpO1xuICAgICAgICAgICAgaWYgKCFwY3MpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgbG9jID0gU3RyaW5nKHI/LkxvY2F0aW9uIHx8IHI/LldhcmVob3VzZSB8fCByPy5TaXRlIHx8ICdVTksnKS50cmltKCk7XG4gICAgICAgICAgICB0b3RhbCArPSBwY3M7XG4gICAgICAgICAgICBieUxvYy5zZXQobG9jLCAoYnlMb2MuZ2V0KGxvYykgfHwgMCkgKyBwY3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJyZWFrZG93biA9IFsuLi5ieUxvY10ubWFwKChbbG9jLCBxdHldKSA9PiAoeyBsb2MsIHF0eSB9KSlcbiAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnF0eSAtIGEucXR5KTtcbiAgICAgICAgcmV0dXJuIHsgc3VtOiB0b3RhbCwgYnJlYWtkb3duIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9ybWF0SW50KG4pIHtcbiAgICAgICAgcmV0dXJuIE51bWJlcihuKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb3JtYXRUaW1lc3RhbXAoZCkge1xuICAgICAgICBjb25zdCBwYWQgPSAoeCkgPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIHJldHVybiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7cGFkKGQuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChkLmdldERhdGUoKSl9ICR7cGFkKGQuZ2V0SG91cnMoKSl9OiR7cGFkKGQuZ2V0TWludXRlcygpKX1gO1xuICAgIH1cblxuICAgIC8vIEZpcmUgb25jZSB3aGVuIGEgbm9kZSBsZWF2ZXMgdGhlIERPTTsgcmV0dXJucyBkaXNwb3NlclxuICAgIGZ1bmN0aW9uIG9uTm9kZVJlbW92ZWQobm9kZSwgY2IpIHtcbiAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLm93bmVyRG9jdW1lbnQpIHJldHVybiAoKSA9PiB7IH07XG4gICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbXV0cykgZm9yIChjb25zdCBuIG9mIG0ucmVtb3ZlZE5vZGVzIHx8IFtdKSB7XG4gICAgICAgICAgICAgICAgaWYgKG4gPT09IG5vZGUgfHwgKG4uY29udGFpbnMgJiYgbi5jb250YWlucyhub2RlKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHsgY2IoKTsgfSBmaW5hbGx5IHsgbW8uZGlzY29ubmVjdCgpOyB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtby5vYnNlcnZlKG5vZGUub3duZXJEb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuICgpID0+IG1vLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICAvLyBFeHBvc2UgYSB0aW55IHRlc3Qgc2VhbSBpbiBERVYvdGVzdHMgKG5vIGVmZmVjdCBpbiBQUk9EIHJ1bnRpbWUpXG4gICAgaWYgKERFViAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuX19RVDIwX18gPSB7XG4gICAgICAgICAgICBpbmplY3RTdG9ja0NvbnRyb2xzLFxuICAgICAgICAgICAgc3BsaXRCYXNlQW5kUGFjayxcbiAgICAgICAgICAgIHRvQmFzZVBhcnQsXG4gICAgICAgICAgICBub3JtYWxpemVSb3dUb1BpZWNlcyxcbiAgICAgICAgICAgIHN1bW1hcml6ZVN0b2NrTm9ybWFsaXplZCxcbiAgICAgICAgICAgIGhhbmRsZUNsaWNrLFxuICAgICAgICB9O1xuICAgIH1cblxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU0sTUFBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFHekQsR0FBQyxNQUFNO0FBRUgsVUFBTSxTQUFTO0FBQUEsTUFDWCxVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWixhQUFhO0FBQUEsTUFDYixVQUFVLEVBQUUsa0JBQWtCLE1BQU0sa0JBQWtCLEtBQUs7QUFBQSxJQUMvRDtB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QyxHQUFHO0FBQ3hELGNBQUksTUFBTSxRQUFTLEVBQUUsWUFBWSxFQUFFLFNBQVMsSUFBSSxHQUFJO0FBQ2hELGdCQUFJO0FBQUUsaUJBQUc7QUFBQSxZQUFHLFVBQUU7QUFBVSxpQkFBRyxXQUFXO0FBQUEsWUFBRztBQUN6QztBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQUEsTUFDSixDQUFDO0FBQ0QsU0FBRyxRQUFRLEtBQUssY0FBYyxNQUFNLEVBQUUsV0FBVyxNQUFNLFNBQVMsS0FBSyxDQUFDO0FBQ3RFLGFBQU8sTUFBTSxHQUFHLFdBQVc7QUFBQSxJQUMvQjtBQUdBLFFBQUksT0FBTyxPQUFPLFdBQVcsYUFBYTtBQUN0QyxhQUFPLFdBQVc7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUFBLEVBRUosR0FBRzsiLAogICJuYW1lcyI6IFsib3BlblBhbmVsIiwgIm91dHNpZGVDbG9zZSIsICJlc2NDbG9zZSIsICJjbG9zZVBhbmVsIl0KfQo=
