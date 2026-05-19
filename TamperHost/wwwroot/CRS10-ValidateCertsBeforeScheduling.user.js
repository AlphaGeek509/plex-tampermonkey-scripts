// ==UserScript==
// @name        CRS10_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.19.13
// @description Validate certs by OrderNo+PartNo+SerialNo (display), call DS8566 (Heat_Key/Serial_No) then DS14343 by Heat_Key. Show results, require Acknowledgement when issues exist, offer quick email for misses, and provide a small settings GUI. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/SalesReleases*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/SalesReleases*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.19.13-1779228585819
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.19.13-1779228585819
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.19.13-1779228585819
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.19.13-1779228585819
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.19.13-1779228585819
// @resource    THEME_CSS http://localhost:5000/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @connect     localhost
// @run-at      document-idle
// @noframes
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @updateURL   http://localhost:5000/CRS10-ValidateCertsBeforeScheduling.user.js
// @downloadURL http://localhost:5000/CRS10-ValidateCertsBeforeScheduling.user.js
// ==/UserScript==

(() => {
  // src/cust-rel-sch/crs10-validateCertsBeforeScheduling/CRS10-ValidateCertsBeforeScheduling.user.js
  (async function() {
    "use strict";
    const IS_TEST_ENV = /test\.on\.plex\.com$/i.test(location.hostname);
    TMUtils.setDebug?.(IS_TEST_ENV);
    const L = TMUtils.getLogger?.("CRS10");
    const dlog = (...a) => {
      if (IS_TEST_ENV) L?.log?.(...a);
    };
    const dwarn = (...a) => {
      if (IS_TEST_ENV) L?.warn?.(...a);
    };
    const derror = (...a) => {
      if (IS_TEST_ENV) L?.error?.(...a);
    };
    const ROUTES = [/^\/SalesAndCRM\/SalesReleases(?:\/|$)/i];
    if (!TMUtils.matchRoute?.(ROUTES)) {
      dlog("Skipping route:", location.pathname);
      return;
    }
    const _cssRulesDesc = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "cssRules");
    if (_cssRulesDesc?.get) {
      Object.defineProperty(CSSStyleSheet.prototype, "cssRules", {
        get() {
          try {
            return _cssRulesDesc.get.call(this);
          } catch {
            return [];
          }
        }
      });
    }
    const _rulesDesc = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "rules");
    if (_rulesDesc?.get) {
      Object.defineProperty(CSSStyleSheet.prototype, "rules", {
        get() {
          try {
            return _rulesDesc.get.call(this);
          } catch {
            return [];
          }
        }
      });
    }
    const SHOW_MISSING_KEY = "crs10.showMissingOnly";
    const MISSING_TO_KEY = "crs10.missingToAddress";
    const LIMIT_CUSTOMER_KEY = "crs10.limitMCM199Only";
    let showMissingOnly = GM_getValue(SHOW_MISSING_KEY, false);
    let missingToAddress = GM_getValue(MISSING_TO_KEY, "");
    let limitMCM199Only = GM_getValue(LIMIT_CUSTOMER_KEY, false);
    function injectSettingsButton() {
      const btn = document.createElement("button");
      btn.textContent = "\u2699\uFE0F";
      Object.assign(btn.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 100001,
        padding: "6px",
        borderRadius: "50%",
        fontSize: "18px",
        cursor: "pointer"
      });
      btn.title = "CR&S10 Settings";
      btn.addEventListener("click", showSettingsPanel);
      document.body.appendChild(btn);
    }
    function showSettingsPanel() {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.35)",
        zIndex: 100002
      });
      const panel = document.createElement("div");
      Object.assign(panel.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        background: "#fff",
        padding: "20px",
        borderRadius: "10px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        fontFamily: "system-ui, sans-serif",
        width: "360px",
        maxWidth: "90vw"
      });
      panel.innerHTML = `
      <h3 style="margin:0 0 12px 0;">CR&S10 Settings</h3>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-missing-only"> Show missing certs only
      </label>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-limit-mcm"> Limit results to customer MCM199 only
      </label>
      <label style="display:block; margin:10px 0;">
        Missing Cert To Address:<br>
        <input type="email" id="input-missing-to"
               placeholder="user@example.com"
               style="width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button id="btn-close">Close</button>
      </div>
    `;
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      const cbMissing = panel.querySelector("#cb-missing-only");
      cbMissing.checked = showMissingOnly;
      cbMissing.addEventListener("change", () => {
        showMissingOnly = cbMissing.checked;
        GM_setValue(SHOW_MISSING_KEY, showMissingOnly);
      });
      const cbLimit = panel.querySelector("#cb-limit-mcm");
      cbLimit.checked = limitMCM199Only;
      cbLimit.addEventListener("change", () => {
        limitMCM199Only = cbLimit.checked;
        GM_setValue(LIMIT_CUSTOMER_KEY, limitMCM199Only);
      });
      const emailInput = panel.querySelector("#input-missing-to");
      emailInput.value = missingToAddress;
      emailInput.addEventListener("change", () => {
        missingToAddress = emailInput.value.trim();
        GM_setValue(MISSING_TO_KEY, missingToAddress);
      });
      panel.querySelector("#btn-close").addEventListener("click", () => overlay.remove());
    }
    injectSettingsButton();
    if (typeof TMUtils === "undefined") {
      derror("TMUtils helper not found; check @require URLs.");
      return;
    }
    const ko = unsafeWindow.ko;
    if (!ko) {
      derror("Knockout not found.");
      return;
    }
    const unwrap = (v) => typeof ko.unwrap === "function" ? ko.unwrap(v) : typeof v === "function" ? v() : v;
    function launchMailtoRow({ orderNo, partNo, serialNo }) {
      const to = encodeURIComponent(missingToAddress || "");
      const cc = "";
      const subject = encodeURIComponent(`Missing Attachment: Order ${orderNo}`);
      let body = `OrderNo: ${orderNo}
PartNo: ${partNo}
SerialNo: ${serialNo}

Missing attachment detected. Please investigate.
`;
      const uri = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${subject}&body=${encodeURIComponent(body)}`;
      window.open(uri, "_blank");
    }
    function showDecisionTable(statusArray, onAck) {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1e5
      });
      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        background: "#fff",
        padding: "20px",
        borderRadius: "10px",
        maxWidth: "90%",
        maxHeight: "80%",
        overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontFamily: "system-ui, sans-serif"
      });
      const total = statusArray.length;
      const issues = statusArray.filter((x) => x.error || x.count === 0).length;
      const title = document.createElement("div");
      title.innerHTML = `<h3 style="margin:0 0 10px 0;">Attachment Check</h3>
      <div style="opacity:.8; font-size:12px; margin-bottom:10px;">
        Checked <b>${total}</b> entries \u2022 Issues: <b>${issues}</b>
      </div>`;
      box.appendChild(title);
      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["OrderNo", "PartNo", "SerialNo", "Has Attachments", "Email"].forEach((text) => {
        const th = document.createElement("th");
        th.textContent = text;
        Object.assign(th.style, { border: "1px solid #ccc", padding: "8px", background: "#f6f6f6", textAlign: "left" });
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      let prevOrder = null, prevPart = null;
      statusArray.forEach((item) => {
        const tr = document.createElement("tr");
        const showOrder = item.orderNo !== prevOrder ? item.orderNo : "";
        const showPart = item.partNo !== prevPart ? item.partNo : "";
        prevOrder = item.orderNo;
        prevPart = item.partNo;
        const hasAttach = item.error ? "\u26A0\uFE0F" : item.count > 0 ? "\u2705" : "\u274C";
        [showOrder, showPart, item.serialNo, hasAttach].forEach((val, idx) => {
          const td = document.createElement("td");
          td.textContent = val;
          Object.assign(td.style, { border: "1px solid #ddd", padding: "6px", textAlign: idx < 3 ? "left" : "center" });
          tr.appendChild(td);
        });
        const tdEmail = document.createElement("td");
        Object.assign(tdEmail.style, { border: "1px solid #ddd", padding: "6px", textAlign: "center" });
        if (item.error || item.count === 0) {
          const mail = document.createElement("span");
          mail.textContent = "\u2709\uFE0F";
          mail.title = "Email this missing cert";
          mail.style.cursor = "pointer";
          mail.addEventListener("click", (e) => {
            e.stopPropagation();
            launchMailtoRow(item);
          });
          tdEmail.appendChild(mail);
        }
        tr.appendChild(tdEmail);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
      const footer = document.createElement("div");
      footer.style.textAlign = "center";
      footer.style.marginTop = "14px";
      const btnAck = document.createElement("button");
      btnAck.textContent = "Acknowledged";
      btnAck.addEventListener("click", () => {
        overlay.remove();
        onAck();
      });
      footer.appendChild(btnAck);
      box.appendChild(footer);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }
    async function waitForRootVM() {
      if (typeof TMUtils.waitForModelAsync === "function") {
        const { viewModel } = await TMUtils.waitForModelAsync(".plex-grid", {
          pollMs: 250,
          timeoutMs: 3e4,
          logger: IS_TEST_ENV ? L : null
        });
        return viewModel || null;
      }
      return new Promise((resolve) => {
        const getKo = () => typeof window !== "undefined" && window.ko || typeof unsafeWindow !== "undefined" && unsafeWindow.ko || null;
        const tick = () => {
          const el = document.querySelector(".plex-grid");
          const koObj = getKo();
          let vm2 = null;
          if (el && koObj && typeof koObj.contextFor === "function") {
            const ctx = koObj.contextFor(el);
            vm2 = ctx?.$root?.data || ctx?.$root || null;
          }
          if (vm2) return resolve(vm2);
          setTimeout(tick, 250);
        };
        tick();
      });
    }
    function showMsg(msg, opts) {
      if (TMUtils?.showMessage) TMUtils.showMessage(msg, opts);
      else dlog(msg);
    }
    const vm = await waitForRootVM();
    if (!vm) {
      derror?.("Could not resolve root VM under .plex-grid");
      return;
    }
    function isScheduleControl(el) {
      const btn = el?.closest?.('a,button,input[type="button"],input[type="submit"]');
      if (!btn) return null;
      const label = (btn.innerText || btn.textContent || btn.value || "").trim();
      if (/^schedule(?:\s*\.\.\.)?$/i.test(label)) return btn;
      return null;
    }
    async function onScheduleClick(e) {
      const apiKey = await TMUtils.getApiKey({ wait: true, timeoutMs: 8e3 });
      if (!apiKey) {
        TMUtils.toast("\u{1F510} No Plex API key found. Use \u201C\u2699\uFE0F Set Plex API Key\u201D in the Tampermonkey menu.", "error", 4e3);
        return;
      }
      const btn = isScheduleControl(e.target);
      if (!btn) return;
      if (!e.isTrusted) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      dlog("Intercepted Schedule click:", btn);
      showMsg("\u23F3 Validating certificates\u2026", { type: "info", autoClear: false });
      try {
        if (!vm) {
          derror("Could not resolve root VM under .plex-grid");
          showMsg("\u274C Could not resolve grid VM.", { type: "error", autoClear: 3500 });
          return;
        }
        const results = unwrap(vm.results) || [];
        let flagged = results.filter((r) => unwrap(r.IsScheduleShipment)).map((r) => ({
          orderNo: unwrap(r.OrderNo),
          partNo: unwrap(r.PartNo),
          partKey: unwrap(r.PartKey),
          customerCode: unwrap(r.CustomerCode)
        }));
        if (limitMCM199Only) flagged = flagged.filter((r) => r.customerCode === "MCM199");
        if (flagged.length === 0) {
          showMsg("\u26A0\uFE0F No shipments flagged", { type: "warning", autoClear: 2500 });
          return btn.click();
        }
        if (IS_TEST_ENV) {
          const peek = (await TMUtils.getApiKey()).toString();
          L?.info?.("CRS10 auth present:", !!peek, "prefix:", peek.slice(0, 10));
        }
        const res8566 = await Promise.all(
          flagged.map(
            (item) => TMUtils.ds(8566, { Part_Key: item.partKey }).catch((err) => ({ rows: [], error: String(err) }))
          )
        );
        const combos = [];
        const seen = /* @__PURE__ */ new Set();
        res8566.forEach((data, idx) => {
          const { orderNo, partNo } = flagged[idx];
          (data.rows || []).forEach((r) => {
            const hk = r.Heat_Key, sn = r.Serial_No;
            const key = `${orderNo}|${partNo}|${hk}|${sn}`;
            if (!seen.has(key)) {
              seen.add(key);
              combos.push({ orderNo, partNo, heatKey: hk, serialNo: sn });
            }
          });
        });
        const statusArray = await Promise.all(
          combos.map(async ({ orderNo, partNo, heatKey, serialNo }) => {
            try {
              const { rows } = await TMUtils.ds(14343, {
                Record_Key_Value: String(heatKey),
                Attachment_Group_Key: 45
              });
              return { orderNo, partNo, serialNo, count: (rows ?? []).length };
            } catch (err) {
              return { orderNo, partNo, serialNo, error: String(err) };
            }
          })
        );
        dlog("Final status:", statusArray);
        showMsg(`\u{1F50D} Checked ${statusArray.length} entries`, { type: "info", autoClear: 2e3 });
        const issuesOnly = showMissingOnly ? statusArray.filter((x) => x.error || x.count === 0) : statusArray;
        const hasIssues = statusArray.some((x) => x.error || x.count === 0);
        if (!hasIssues) {
          showMsg("\u2705 All attachments present. Proceeding\u2026", { type: "success", autoClear: 1800 });
          return btn.click();
        }
        showDecisionTable(issuesOnly, () => {
          showMsg("\u2705 Acknowledged", { type: "success", autoClear: 1800 });
          btn.click();
        });
      } catch (err) {
        derror("Schedule validation failed:", err);
        showMsg(`\u274C ${err?.message || err}`, { type: "error", autoClear: 4e3 });
        btn.click();
      }
    }
    document.addEventListener("click", onScheduleClick, true);
    dlog("Schedule interceptor attached (delegated)");
    GM_registerMenuCommand("\u{1F527} Re-hook CR&S10 Schedule", () => location.reload());
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvY3VzdC1yZWwtc2NoL2NyczEwLXZhbGlkYXRlQ2VydHNCZWZvcmVTY2hlZHVsaW5nL0NSUzEwLVZhbGlkYXRlQ2VydHNCZWZvcmVTY2hlZHVsaW5nLnVzZXIuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlx1RkVGRlxuKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyAtLS0tLS0tLS0tIFN0YW5kYXJkIGJvb3RzdHJhcCAtLS0tLS0tLS0tXG4gICAgY29uc3QgSVNfVEVTVF9FTlYgPSAvdGVzdFxcLm9uXFwucGxleFxcLmNvbSQvaS50ZXN0KGxvY2F0aW9uLmhvc3RuYW1lKTtcbiAgICBUTVV0aWxzLnNldERlYnVnPy4oSVNfVEVTVF9FTlYpO1xuXG4gICAgY29uc3QgTCA9IFRNVXRpbHMuZ2V0TG9nZ2VyPy4oJ0NSUzEwJyk7IC8vIHJlbmFtZSBwZXIgZmlsZTogUVQyMCwgUVQzMCwgUVQzNVxuICAgIGNvbnN0IGRsb2cgPSAoLi4uYSkgPT4geyBpZiAoSVNfVEVTVF9FTlYpIEw/LmxvZz8uKC4uLmEpOyB9O1xuICAgIGNvbnN0IGR3YXJuID0gKC4uLmEpID0+IHsgaWYgKElTX1RFU1RfRU5WKSBMPy53YXJuPy4oLi4uYSk7IH07XG4gICAgY29uc3QgZGVycm9yID0gKC4uLmEpID0+IHsgaWYgKElTX1RFU1RfRU5WKSBMPy5lcnJvcj8uKC4uLmEpOyB9O1xuXG4gICAgLy8gUm91dGUgYWxsb3dsaXN0IChDQVNFLUlOU0VOU0lUSVZFKVxuICAgIGNvbnN0IFJPVVRFUyA9IFsvXlxcL1NhbGVzQW5kQ1JNXFwvU2FsZXNSZWxlYXNlcyg/OlxcL3wkKS9pXTtcbiAgICBpZiAoIVRNVXRpbHMubWF0Y2hSb3V0ZT8uKFJPVVRFUykpIHtcbiAgICAgICAgZGxvZygnU2tpcHBpbmcgcm91dGU6JywgbG9jYXRpb24ucGF0aG5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLSBHdWFyZCBjcm9zcy1vcmlnaW4gQ1NTIGFjY2VzcyAoU2VjdXJpdHlFcnJvcikgLS0tLS0tLS0tLVxuICAgIGNvbnN0IF9jc3NSdWxlc0Rlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKENTU1N0eWxlU2hlZXQucHJvdG90eXBlLCAnY3NzUnVsZXMnKTtcbiAgICBpZiAoX2Nzc1J1bGVzRGVzYz8uZ2V0KSB7XG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShDU1NTdHlsZVNoZWV0LnByb3RvdHlwZSwgJ2Nzc1J1bGVzJywge1xuICAgICAgICAgICAgZ2V0KCkgeyB0cnkgeyByZXR1cm4gX2Nzc1J1bGVzRGVzYy5nZXQuY2FsbCh0aGlzKTsgfSBjYXRjaCB7IHJldHVybiBbXTsgfSB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBfcnVsZXNEZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihDU1NTdHlsZVNoZWV0LnByb3RvdHlwZSwgJ3J1bGVzJyk7XG4gICAgaWYgKF9ydWxlc0Rlc2M/LmdldCkge1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQ1NTU3R5bGVTaGVldC5wcm90b3R5cGUsICdydWxlcycsIHtcbiAgICAgICAgICAgIGdldCgpIHsgdHJ5IHsgcmV0dXJuIF9ydWxlc0Rlc2MuZ2V0LmNhbGwodGhpcyk7IH0gY2F0Y2ggeyByZXR1cm4gW107IH0gfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIFNldHRpbmdzIGtleXMgLyBsb2FkIC0tLS0tLS0tLS1cbiAgICBjb25zdCBTSE9XX01JU1NJTkdfS0VZID0gJ2NyczEwLnNob3dNaXNzaW5nT25seSc7XG4gICAgY29uc3QgTUlTU0lOR19UT19LRVkgPSAnY3JzMTAubWlzc2luZ1RvQWRkcmVzcyc7XG4gICAgY29uc3QgTElNSVRfQ1VTVE9NRVJfS0VZID0gJ2NyczEwLmxpbWl0TUNNMTk5T25seSc7XG5cbiAgICBsZXQgc2hvd01pc3NpbmdPbmx5ID0gR01fZ2V0VmFsdWUoU0hPV19NSVNTSU5HX0tFWSwgZmFsc2UpO1xuICAgIGxldCBtaXNzaW5nVG9BZGRyZXNzID0gR01fZ2V0VmFsdWUoTUlTU0lOR19UT19LRVksICcnKTtcbiAgICBsZXQgbGltaXRNQ00xOTlPbmx5ID0gR01fZ2V0VmFsdWUoTElNSVRfQ1VTVE9NRVJfS0VZLCBmYWxzZSk7XG5cblxuICAgIC8vIC0tLS0tLS0tLS0gU2V0dGluZ3MgYnV0dG9uIC8gcGFuZWwgLS0tLS0tLS0tLVxuICAgIGZ1bmN0aW9uIGluamVjdFNldHRpbmdzQnV0dG9uKCkge1xuICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1x1MjY5OVx1RkUwRic7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oYnRuLnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgYm90dG9tOiAnMjBweCcsIHJpZ2h0OiAnMjBweCcsXG4gICAgICAgICAgICB6SW5kZXg6IDEwMDAwMSwgcGFkZGluZzogJzZweCcsIGJvcmRlclJhZGl1czogJzUwJScsXG4gICAgICAgICAgICBmb250U2l6ZTogJzE4cHgnLCBjdXJzb3I6ICdwb2ludGVyJ1xuICAgICAgICB9KTtcbiAgICAgICAgYnRuLnRpdGxlID0gJ0NSJlMxMCBTZXR0aW5ncyc7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHNob3dTZXR0aW5nc1BhbmVsKTtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChidG4pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNob3dTZXR0aW5nc1BhbmVsKCkge1xuICAgICAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24ob3ZlcmxheS5zdHlsZSwge1xuICAgICAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsIGluc2V0OiAnMCcsIGJhY2tncm91bmQ6ICdyZ2JhKDAsMCwwLDAuMzUpJywgekluZGV4OiAxMDAwMDJcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24ocGFuZWwuc3R5bGUsIHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJyxcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLC01MCUpJyxcbiAgICAgICAgICAgIGJhY2tncm91bmQ6ICcjZmZmJywgcGFkZGluZzogJzIwcHgnLCBib3JkZXJSYWRpdXM6ICcxMHB4JyxcbiAgICAgICAgICAgIGJveFNoYWRvdzogJzAgNnB4IDIwcHggcmdiYSgwLDAsMCwwLjI1KScsIGZvbnRGYW1pbHk6ICdzeXN0ZW0tdWksIHNhbnMtc2VyaWYnLFxuICAgICAgICAgICAgd2lkdGg6ICczNjBweCcsIG1heFdpZHRoOiAnOTB2dydcbiAgICAgICAgfSk7XG4gICAgICAgIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICAgIDxoMyBzdHlsZT1cIm1hcmdpbjowIDAgMTJweCAwO1wiPkNSJlMxMCBTZXR0aW5nczwvaDM+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJjYi1taXNzaW5nLW9ubHlcIj4gU2hvdyBtaXNzaW5nIGNlcnRzIG9ubHlcbiAgICAgIDwvbGFiZWw+XG4gICAgICA8bGFiZWwgc3R5bGU9XCJkaXNwbGF5OmJsb2NrOyBtYXJnaW46MTBweCAwO1wiPlxuICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJjYi1saW1pdC1tY21cIj4gTGltaXQgcmVzdWx0cyB0byBjdXN0b21lciBNQ00xOTkgb25seVxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6YmxvY2s7IG1hcmdpbjoxMHB4IDA7XCI+XG4gICAgICAgIE1pc3NpbmcgQ2VydCBUbyBBZGRyZXNzOjxicj5cbiAgICAgICAgPGlucHV0IHR5cGU9XCJlbWFpbFwiIGlkPVwiaW5wdXQtbWlzc2luZy10b1wiXG4gICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cInVzZXJAZXhhbXBsZS5jb21cIlxuICAgICAgICAgICAgICAgc3R5bGU9XCJ3aWR0aDoxMDAlOyBib3gtc2l6aW5nOmJvcmRlci1ib3g7IHBhZGRpbmc6NnB4OyBib3JkZXI6MXB4IHNvbGlkICNjY2M7IGJvcmRlci1yYWRpdXM6NnB4O1wiPlxuICAgICAgPC9sYWJlbD5cbiAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7IGdhcDo4cHg7IGp1c3RpZnktY29udGVudDpmbGV4LWVuZDsgbWFyZ2luLXRvcDoxNHB4O1wiPlxuICAgICAgICA8YnV0dG9uIGlkPVwiYnRuLWNsb3NlXCI+Q2xvc2U8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgICAgIGNvbnN0IGNiTWlzc2luZyA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNjYi1taXNzaW5nLW9ubHknKTtcbiAgICAgICAgY2JNaXNzaW5nLmNoZWNrZWQgPSBzaG93TWlzc2luZ09ubHk7XG4gICAgICAgIGNiTWlzc2luZy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBzaG93TWlzc2luZ09ubHkgPSBjYk1pc3NpbmcuY2hlY2tlZDtcbiAgICAgICAgICAgIEdNX3NldFZhbHVlKFNIT1dfTUlTU0lOR19LRVksIHNob3dNaXNzaW5nT25seSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGNiTGltaXQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjY2ItbGltaXQtbWNtJyk7XG4gICAgICAgIGNiTGltaXQuY2hlY2tlZCA9IGxpbWl0TUNNMTk5T25seTtcbiAgICAgICAgY2JMaW1pdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBsaW1pdE1DTTE5OU9ubHkgPSBjYkxpbWl0LmNoZWNrZWQ7XG4gICAgICAgICAgICBHTV9zZXRWYWx1ZShMSU1JVF9DVVNUT01FUl9LRVksIGxpbWl0TUNNMTk5T25seSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGVtYWlsSW5wdXQgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcjaW5wdXQtbWlzc2luZy10bycpO1xuICAgICAgICBlbWFpbElucHV0LnZhbHVlID0gbWlzc2luZ1RvQWRkcmVzcztcbiAgICAgICAgZW1haWxJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBtaXNzaW5nVG9BZGRyZXNzID0gZW1haWxJbnB1dC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBHTV9zZXRWYWx1ZShNSVNTSU5HX1RPX0tFWSwgbWlzc2luZ1RvQWRkcmVzcyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJyNidG4tY2xvc2UnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG92ZXJsYXkucmVtb3ZlKCkpO1xuICAgIH1cblxuICAgIGluamVjdFNldHRpbmdzQnV0dG9uKCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tIEVuc3VyZSBUTVV0aWxzICsgS08gLS0tLS0tLS0tLVxuICAgIGlmICh0eXBlb2YgVE1VdGlscyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVycm9yKCdUTVV0aWxzIGhlbHBlciBub3QgZm91bmQ7IGNoZWNrIEByZXF1aXJlIFVSTHMuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qga28gPSB1bnNhZmVXaW5kb3cua287XG4gICAgaWYgKCFrbykge1xuICAgICAgICBkZXJyb3IoJ0tub2Nrb3V0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuXG4gICAgLy8gLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS1cbiAgICBjb25zdCB1bndyYXAgPSAodikgPT4gKHR5cGVvZiBrby51bndyYXAgPT09ICdmdW5jdGlvbicgPyBrby51bndyYXAodikgOiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicgPyB2KCkgOiB2KSk7XG5cbiAgICBmdW5jdGlvbiBsYXVuY2hNYWlsdG9Sb3coeyBvcmRlck5vLCBwYXJ0Tm8sIHNlcmlhbE5vIH0pIHtcbiAgICAgICAgY29uc3QgdG8gPSBlbmNvZGVVUklDb21wb25lbnQobWlzc2luZ1RvQWRkcmVzcyB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGNjID0gJyc7XG4gICAgICAgIGNvbnN0IHN1YmplY3QgPSBlbmNvZGVVUklDb21wb25lbnQoYE1pc3NpbmcgQXR0YWNobWVudDogT3JkZXIgJHtvcmRlck5vfWApO1xuICAgICAgICBsZXQgYm9keSA9IGBPcmRlck5vOiAke29yZGVyTm99XFxuUGFydE5vOiAke3BhcnROb31cXG5TZXJpYWxObzogJHtzZXJpYWxOb31cXG5cXG5NaXNzaW5nIGF0dGFjaG1lbnQgZGV0ZWN0ZWQuIFBsZWFzZSBpbnZlc3RpZ2F0ZS5cXG5gO1xuICAgICAgICBjb25zdCB1cmkgPSBgbWFpbHRvOiR7dG99P2NjPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGNjKX0mc3ViamVjdD0ke3N1YmplY3R9JmJvZHk9JHtlbmNvZGVVUklDb21wb25lbnQoYm9keSl9YDtcbiAgICAgICAgd2luZG93Lm9wZW4odXJpLCAnX2JsYW5rJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2hvd0RlY2lzaW9uVGFibGUoc3RhdHVzQXJyYXksIG9uQWNrKSB7XG4gICAgICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihvdmVybGF5LnN0eWxlLCB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywgaW5zZXQ6IDAsIGJhY2tncm91bmQ6ICdyZ2JhKDAsMCwwLDAuNSknLCB6SW5kZXg6IDEwMDAwMFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihib3guc3R5bGUsIHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICc1MCUnLCBsZWZ0OiAnNTAlJywgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsLTUwJSknLFxuICAgICAgICAgICAgYmFja2dyb3VuZDogJyNmZmYnLCBwYWRkaW5nOiAnMjBweCcsIGJvcmRlclJhZGl1czogJzEwcHgnLFxuICAgICAgICAgICAgbWF4V2lkdGg6ICc5MCUnLCBtYXhIZWlnaHQ6ICc4MCUnLCBvdmVyZmxvd1k6ICdhdXRvJyxcbiAgICAgICAgICAgIGJveFNoYWRvdzogJzAgOHB4IDI0cHggcmdiYSgwLDAsMCwwLjM1KScsIGZvbnRGYW1pbHk6ICdzeXN0ZW0tdWksIHNhbnMtc2VyaWYnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRvdGFsID0gc3RhdHVzQXJyYXkubGVuZ3RoO1xuICAgICAgICBjb25zdCBpc3N1ZXMgPSBzdGF0dXNBcnJheS5maWx0ZXIoeCA9PiB4LmVycm9yIHx8IHguY291bnQgPT09IDApLmxlbmd0aDtcblxuICAgICAgICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICB0aXRsZS5pbm5lckhUTUwgPSBgPGgzIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4IDA7XCI+QXR0YWNobWVudCBDaGVjazwvaDM+XG4gICAgICA8ZGl2IHN0eWxlPVwib3BhY2l0eTouODsgZm9udC1zaXplOjEycHg7IG1hcmdpbi1ib3R0b206MTBweDtcIj5cbiAgICAgICAgQ2hlY2tlZCA8Yj4ke3RvdGFsfTwvYj4gZW50cmllcyBcdTIwMjIgSXNzdWVzOiA8Yj4ke2lzc3Vlc308L2I+XG4gICAgICA8L2Rpdj5gO1xuICAgICAgICBib3guYXBwZW5kQ2hpbGQodGl0bGUpO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGFibGUnKTtcbiAgICAgICAgdGFibGUuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIHRhYmxlLnN0eWxlLmJvcmRlckNvbGxhcHNlID0gJ2NvbGxhcHNlJztcblxuICAgICAgICBjb25zdCB0aGVhZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RoZWFkJyk7XG4gICAgICAgIGNvbnN0IGhlYWRSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuICAgICAgICBbJ09yZGVyTm8nLCAnUGFydE5vJywgJ1NlcmlhbE5vJywgJ0hhcyBBdHRhY2htZW50cycsICdFbWFpbCddLmZvckVhY2godGV4dCA9PiB7XG4gICAgICAgICAgICBjb25zdCB0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RoJyk7XG4gICAgICAgICAgICB0aC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoLnN0eWxlLCB7IGJvcmRlcjogJzFweCBzb2xpZCAjY2NjJywgcGFkZGluZzogJzhweCcsIGJhY2tncm91bmQ6ICcjZjZmNmY2JywgdGV4dEFsaWduOiAnbGVmdCcgfSk7XG4gICAgICAgICAgICBoZWFkUm93LmFwcGVuZENoaWxkKHRoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoZWFkLmFwcGVuZENoaWxkKGhlYWRSb3cpO1xuICAgICAgICB0YWJsZS5hcHBlbmRDaGlsZCh0aGVhZCk7XG5cbiAgICAgICAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0Ym9keScpO1xuICAgICAgICBsZXQgcHJldk9yZGVyID0gbnVsbCwgcHJldlBhcnQgPSBudWxsO1xuICAgICAgICBzdGF0dXNBcnJheS5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgY29uc3QgdHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXG4gICAgICAgICAgICBjb25zdCBzaG93T3JkZXIgPSBpdGVtLm9yZGVyTm8gIT09IHByZXZPcmRlciA/IGl0ZW0ub3JkZXJObyA6ICcnO1xuICAgICAgICAgICAgY29uc3Qgc2hvd1BhcnQgPSBpdGVtLnBhcnRObyAhPT0gcHJldlBhcnQgPyBpdGVtLnBhcnRObyA6ICcnO1xuICAgICAgICAgICAgcHJldk9yZGVyID0gaXRlbS5vcmRlck5vO1xuICAgICAgICAgICAgcHJldlBhcnQgPSBpdGVtLnBhcnRObztcblxuICAgICAgICAgICAgY29uc3QgaGFzQXR0YWNoID0gaXRlbS5lcnJvciA/ICdcdTI2QTBcdUZFMEYnIDogKGl0ZW0uY291bnQgPiAwID8gJ1x1MjcwNScgOiAnXHUyNzRDJyk7XG5cbiAgICAgICAgICAgIFtzaG93T3JkZXIsIHNob3dQYXJ0LCBpdGVtLnNlcmlhbE5vLCBoYXNBdHRhY2hdLmZvckVhY2goKHZhbCwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICAgICAgICAgIHRkLnRleHRDb250ZW50ID0gdmFsO1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGQuc3R5bGUsIHsgYm9yZGVyOiAnMXB4IHNvbGlkICNkZGQnLCBwYWRkaW5nOiAnNnB4JywgdGV4dEFsaWduOiBpZHggPCAzID8gJ2xlZnQnIDogJ2NlbnRlcicgfSk7XG4gICAgICAgICAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHRkRW1haWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0ZEVtYWlsLnN0eWxlLCB7IGJvcmRlcjogJzFweCBzb2xpZCAjZGRkJywgcGFkZGluZzogJzZweCcsIHRleHRBbGlnbjogJ2NlbnRlcicgfSk7XG4gICAgICAgICAgICBpZiAoaXRlbS5lcnJvciB8fCBpdGVtLmNvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICAgICBtYWlsLnRleHRDb250ZW50ID0gJ1x1MjcwOVx1RkUwRic7XG4gICAgICAgICAgICAgICAgbWFpbC50aXRsZSA9ICdFbWFpbCB0aGlzIG1pc3NpbmcgY2VydCc7XG4gICAgICAgICAgICAgICAgbWFpbC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG4gICAgICAgICAgICAgICAgbWFpbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4geyBlLnN0b3BQcm9wYWdhdGlvbigpOyBsYXVuY2hNYWlsdG9Sb3coaXRlbSk7IH0pO1xuICAgICAgICAgICAgICAgIHRkRW1haWwuYXBwZW5kQ2hpbGQobWFpbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZEVtYWlsKTtcblxuICAgICAgICAgICAgdGJvZHkuYXBwZW5kQ2hpbGQodHIpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0YWJsZS5hcHBlbmRDaGlsZCh0Ym9keSk7XG4gICAgICAgIGJveC5hcHBlbmRDaGlsZCh0YWJsZSk7XG5cbiAgICAgICAgY29uc3QgZm9vdGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGZvb3Rlci5zdHlsZS50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgZm9vdGVyLnN0eWxlLm1hcmdpblRvcCA9ICcxNHB4JztcbiAgICAgICAgY29uc3QgYnRuQWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgIGJ0bkFjay50ZXh0Q29udGVudCA9ICdBY2tub3dsZWRnZWQnO1xuICAgICAgICBidG5BY2suYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IG92ZXJsYXkucmVtb3ZlKCk7IG9uQWNrKCk7IH0pO1xuICAgICAgICBmb290ZXIuYXBwZW5kQ2hpbGQoYnRuQWNrKTtcbiAgICAgICAgYm94LmFwcGVuZENoaWxkKGZvb3Rlcik7XG5cbiAgICAgICAgb3ZlcmxheS5hcHBlbmRDaGlsZChib3gpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gQ29yZTogaG9vayBTY2hlZHVsZSBidXR0b24gKG9uY2UpIGFuZCB2YWxpZGF0ZSAtLS0tLS0tLS0tXG4gICAgYXN5bmMgZnVuY3Rpb24gd2FpdEZvclJvb3RWTSgpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYygnLnBsZXgtZ3JpZCcsIHtcbiAgICAgICAgICAgICAgICBwb2xsTXM6IDI1MCxcbiAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IDMwMDAwLFxuICAgICAgICAgICAgICAgIGxvZ2dlcjogSVNfVEVTVF9FTlYgPyBMIDogbnVsbFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdmlld01vZGVsIHx8IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYWxsYmFjayAoaWYgdXRpbHMgbm90IGxvYWRlZCk6IHBvbGwgRE9NICsgS08gc2FmZWx5XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGdldEtvID0gKCkgPT5cbiAgICAgICAgICAgICAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmtvKSB8fFxuICAgICAgICAgICAgICAgICh0eXBlb2YgdW5zYWZlV2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB1bnNhZmVXaW5kb3cua28pIHx8IG51bGw7XG5cbiAgICAgICAgICAgIGNvbnN0IHRpY2sgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1ncmlkJyk7XG4gICAgICAgICAgICAgICAgY29uc3Qga29PYmogPSBnZXRLbygpO1xuICAgICAgICAgICAgICAgIGxldCB2bSA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKGVsICYmIGtvT2JqICYmIHR5cGVvZiBrb09iai5jb250ZXh0Rm9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN0eCA9IGtvT2JqLmNvbnRleHRGb3IoZWwpO1xuICAgICAgICAgICAgICAgICAgICB2bSA9IGN0eD8uJHJvb3Q/LmRhdGEgfHwgY3R4Py4kcm9vdCB8fCBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodm0pIHJldHVybiByZXNvbHZlKHZtKTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KHRpY2ssIDI1MCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGljaygpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzaG93TXNnKG1zZywgb3B0cykge1xuICAgICAgICBpZiAoVE1VdGlscz8uc2hvd01lc3NhZ2UpIFRNVXRpbHMuc2hvd01lc3NhZ2UobXNnLCBvcHRzKTtcbiAgICAgICAgZWxzZSBkbG9nKG1zZyk7XG4gICAgfVxuXG4gICAgY29uc3Qgdm0gPSBhd2FpdCB3YWl0Rm9yUm9vdFZNKCk7XG4gICAgaWYgKCF2bSkge1xuICAgICAgICBkZXJyb3I/LignQ291bGQgbm90IHJlc29sdmUgcm9vdCBWTSB1bmRlciAucGxleC1ncmlkJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIENvcmU6IHJvYnVzdCBcIlNjaGVkdWxlXCIgaW50ZXJjZXB0aW9uIChkZWxlZ2F0ZWQpIC0tLS0tLS0tLS1cblxuICAgIC8vIE1hdGNoIGJvdGggPGE+IGFuZCA8YnV0dG9uPiAodGV4dC1iYXNlZClcbiAgICBmdW5jdGlvbiBpc1NjaGVkdWxlQ29udHJvbChlbCkge1xuICAgICAgICBjb25zdCBidG4gPSBlbD8uY2xvc2VzdD8uKCdhLGJ1dHRvbixpbnB1dFt0eXBlPVwiYnV0dG9uXCJdLGlucHV0W3R5cGU9XCJzdWJtaXRcIl0nKTtcbiAgICAgICAgaWYgKCFidG4pIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBsYWJlbCA9IChidG4uaW5uZXJUZXh0IHx8IGJ0bi50ZXh0Q29udGVudCB8fCBidG4udmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgLy8gYWxsb3cgXCJTY2hlZHVsZVwiIGFuZCBcIlNjaGVkdWxlLi4uXCIgKGNhc2UtaW5zZW5zaXRpdmUpXG4gICAgICAgIGlmICgvXnNjaGVkdWxlKD86XFxzKlxcLlxcLlxcLik/JC9pLnRlc3QobGFiZWwpKSByZXR1cm4gYnRuO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBvblNjaGVkdWxlQ2xpY2soZSkge1xuICAgICAgICAvLyAtLS0tLS0tLS0tIEFQSSBrZXkgLS0tLS0tLS0tLVxuICAgICAgICAvLyBXYXJtIHRoZSBrZXk7IGlmIHdlIGRvblx1MjAxOXQgaGF2ZSBvbmUsIHByb21wdCB0aGUgdXNlciB0byBzZXQgaXRcbiAgICAgICAgY29uc3QgYXBpS2V5ID0gYXdhaXQgVE1VdGlscy5nZXRBcGlLZXkoeyB3YWl0OiB0cnVlLCB0aW1lb3V0TXM6IDgwMDAgfSk7XG4gICAgICAgIGlmICghYXBpS2V5KSB7XG4gICAgICAgICAgICBUTVV0aWxzLnRvYXN0KCdcdUQ4M0RcdUREMTAgTm8gUGxleCBBUEkga2V5IGZvdW5kLiBVc2UgXHUyMDFDXHUyNjk5XHVGRTBGIFNldCBQbGV4IEFQSSBLZXlcdTIwMUQgaW4gdGhlIFRhbXBlcm1vbmtleSBtZW51LicsICdlcnJvcicsIDQwMDApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnRuID0gaXNTY2hlZHVsZUNvbnRyb2woZS50YXJnZXQpO1xuICAgICAgICBpZiAoIWJ0bikgcmV0dXJuOyAgICAgICAgICAvLyBub3Qgb3VyIGNvbnRyb2xcbiAgICAgICAgaWYgKCFlLmlzVHJ1c3RlZCkgcmV0dXJuOyAgLy8gaWdub3JlIHByb2dyYW1tYXRpYyBjbGlja3MgKGxldHMgb3VyIGxhdGVyIGJ0bi5jbGljaygpIHBhc3MgdGhyb3VnaClcblxuICAgICAgICAvLyBpbnRlcmNlcHQgbmF0aXZlIGNsaWNrXG4gICAgICAgIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBkbG9nKCdJbnRlcmNlcHRlZCBTY2hlZHVsZSBjbGljazonLCBidG4pO1xuICAgICAgICBzaG93TXNnKCdcdTIzRjMgVmFsaWRhdGluZyBjZXJ0aWZpY2F0ZXNcdTIwMjYnLCB7IHR5cGU6ICdpbmZvJywgYXV0b0NsZWFyOiBmYWxzZSB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2UgYWxyZWFkeSByZXNvbHZlZCB0aGUgcm9vdCBWTSBhYm92ZTpcbiAgICAgICAgICAgIC8vICAgY29uc3Qgdm0gPSBhd2FpdCB3YWl0Rm9yUm9vdFZNKCk7XG4gICAgICAgICAgICBpZiAoIXZtKSB7XG4gICAgICAgICAgICAgICAgZGVycm9yKCdDb3VsZCBub3QgcmVzb2x2ZSByb290IFZNIHVuZGVyIC5wbGV4LWdyaWQnKTtcbiAgICAgICAgICAgICAgICBzaG93TXNnKCdcdTI3NEMgQ291bGQgbm90IHJlc29sdmUgZ3JpZCBWTS4nLCB7IHR5cGU6ICdlcnJvcicsIGF1dG9DbGVhcjogMzUwMCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdhdGhlciByZXN1bHRzXG4gICAgICAgICAgICBjb25zdCByZXN1bHRzID0gdW53cmFwKHZtLnJlc3VsdHMpIHx8IFtdO1xuXG4gICAgICAgICAgICAvLyBGaWx0ZXIgXHUyMDFDZmxhZ2dlZCBmb3Igc2NoZWR1bGVcdTIwMURcbiAgICAgICAgICAgIGxldCBmbGFnZ2VkID0gcmVzdWx0c1xuICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PiB1bndyYXAoci5Jc1NjaGVkdWxlU2hpcG1lbnQpKVxuICAgICAgICAgICAgICAgIC5tYXAociA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBvcmRlck5vOiB1bndyYXAoci5PcmRlck5vKSxcbiAgICAgICAgICAgICAgICAgICAgcGFydE5vOiB1bndyYXAoci5QYXJ0Tm8pLFxuICAgICAgICAgICAgICAgICAgICBwYXJ0S2V5OiB1bndyYXAoci5QYXJ0S2V5KSxcbiAgICAgICAgICAgICAgICAgICAgY3VzdG9tZXJDb2RlOiB1bndyYXAoci5DdXN0b21lckNvZGUpLFxuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgaWYgKGxpbWl0TUNNMTk5T25seSkgZmxhZ2dlZCA9IGZsYWdnZWQuZmlsdGVyKHIgPT4gci5jdXN0b21lckNvZGUgPT09ICdNQ00xOTknKTtcblxuICAgICAgICAgICAgaWYgKGZsYWdnZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgc2hvd01zZygnXHUyNkEwXHVGRTBGIE5vIHNoaXBtZW50cyBmbGFnZ2VkJywgeyB0eXBlOiAnd2FybmluZycsIGF1dG9DbGVhcjogMjUwMCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnRuLmNsaWNrKCk7IC8vIHBhc3MtdGhyb3VnaCB0byBuYXRpdmUgU2NoZWR1bGVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKElTX1RFU1RfRU5WKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGVlayA9IChhd2FpdCBUTVV0aWxzLmdldEFwaUtleSgpKS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgIEw/LmluZm8/LignQ1JTMTAgYXV0aCBwcmVzZW50OicsICEhcGVlaywgJ3ByZWZpeDonLCBwZWVrLnNsaWNlKDAsIDEwKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERTODU2NjogSGVhdF9LZXkgKyBTZXJpYWxfTm8gcGVyIGZsYWdnZWQgcGFydFxuICAgICAgICAgICAgY29uc3QgcmVzODU2NiA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIGZsYWdnZWQubWFwKGl0ZW0gPT5cbiAgICAgICAgICAgICAgICAgICAgVE1VdGlscy5kcyg4NTY2LCB7IFBhcnRfS2V5OiBpdGVtLnBhcnRLZXkgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gKHsgcm93czogW10sIGVycm9yOiBTdHJpbmcoZXJyKSB9KSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvLyBGbGF0dGVuIHVuaXF1ZSBjb21ib3NcbiAgICAgICAgICAgIGNvbnN0IGNvbWJvcyA9IFtdO1xuICAgICAgICAgICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIHJlczg1NjYuZm9yRWFjaCgoZGF0YSwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBvcmRlck5vLCBwYXJ0Tm8gfSA9IGZsYWdnZWRbaWR4XTtcbiAgICAgICAgICAgICAgICAoZGF0YS5yb3dzIHx8IFtdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoayA9IHIuSGVhdF9LZXksIHNuID0gci5TZXJpYWxfTm87XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke29yZGVyTm99fCR7cGFydE5vfXwke2hrfXwke3NufWA7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc2Vlbi5oYXMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbWJvcy5wdXNoKHsgb3JkZXJObywgcGFydE5vLCBoZWF0S2V5OiBoaywgc2VyaWFsTm86IHNuIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRFMxNDM0MzogYXR0YWNobWVudHMgYnkgSGVhdF9LZXlcbiAgICAgICAgICAgIGNvbnN0IHN0YXR1c0FycmF5ID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICAgICAgY29tYm9zLm1hcChhc3luYyAoeyBvcmRlck5vLCBwYXJ0Tm8sIGhlYXRLZXksIHNlcmlhbE5vIH0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgcm93cyB9ID0gYXdhaXQgVE1VdGlscy5kcygxNDM0Mywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlY29yZF9LZXlfVmFsdWU6IFN0cmluZyhoZWF0S2V5KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBBdHRhY2htZW50X0dyb3VwX0tleTogNDVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgb3JkZXJObywgcGFydE5vLCBzZXJpYWxObywgY291bnQ6IChyb3dzID8/IFtdKS5sZW5ndGggfTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBvcmRlck5vLCBwYXJ0Tm8sIHNlcmlhbE5vLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBkbG9nKCdGaW5hbCBzdGF0dXM6Jywgc3RhdHVzQXJyYXkpO1xuICAgICAgICAgICAgc2hvd01zZyhgXHVEODNEXHVERDBEIENoZWNrZWQgJHtzdGF0dXNBcnJheS5sZW5ndGh9IGVudHJpZXNgLCB7IHR5cGU6ICdpbmZvJywgYXV0b0NsZWFyOiAyMDAwIH0pO1xuXG4gICAgICAgICAgICAvLyBEZWNpZGUgd2hhdCB0byBkaXNwbGF5XG4gICAgICAgICAgICBjb25zdCBpc3N1ZXNPbmx5ID0gc2hvd01pc3NpbmdPbmx5XG4gICAgICAgICAgICAgICAgPyBzdGF0dXNBcnJheS5maWx0ZXIoeCA9PiB4LmVycm9yIHx8IHguY291bnQgPT09IDApXG4gICAgICAgICAgICAgICAgOiBzdGF0dXNBcnJheTtcblxuICAgICAgICAgICAgY29uc3QgaGFzSXNzdWVzID0gc3RhdHVzQXJyYXkuc29tZSh4ID0+IHguZXJyb3IgfHwgeC5jb3VudCA9PT0gMCk7XG4gICAgICAgICAgICBpZiAoIWhhc0lzc3Vlcykge1xuICAgICAgICAgICAgICAgIHNob3dNc2coJ1x1MjcwNSBBbGwgYXR0YWNobWVudHMgcHJlc2VudC4gUHJvY2VlZGluZ1x1MjAyNicsIHsgdHlwZTogJ3N1Y2Nlc3MnLCBhdXRvQ2xlYXI6IDE4MDAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ0bi5jbGljaygpOyAvLyBjb250aW51ZSB0byBuYXRpdmUgU2NoZWR1bGVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVxdWlyZSBhY2tub3dsZWRnZW1lbnQgaWYgYW55IGlzc3Vlc1xuICAgICAgICAgICAgc2hvd0RlY2lzaW9uVGFibGUoaXNzdWVzT25seSwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNob3dNc2coJ1x1MjcwNSBBY2tub3dsZWRnZWQnLCB7IHR5cGU6ICdzdWNjZXNzJywgYXV0b0NsZWFyOiAxODAwIH0pO1xuICAgICAgICAgICAgICAgIGJ0bi5jbGljaygpOyAvLyBwcm9ncmFtbWF0aWMgY2xpY2sgXHUyMTkyIG5vdCByZS1pbnRlcmNlcHRlZCAod2UgaWdub3JlICFlLmlzVHJ1c3RlZClcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZGVycm9yKCdTY2hlZHVsZSB2YWxpZGF0aW9uIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgc2hvd01zZyhgXHUyNzRDICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCB7IHR5cGU6ICdlcnJvcicsIGF1dG9DbGVhcjogNDAwMCB9KTtcbiAgICAgICAgICAgIC8vIEZhaWwtb3BlbiBzbyBvcHMgYXJlblx1MjAxOXQgYmxvY2tlZFxuICAgICAgICAgICAgYnRuLmNsaWNrKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBdHRhY2ggb25jZSwgY2FwdHVyZSBwaGFzZSBzbyB3ZSBydW4gYmVmb3JlIEtPXHUyMDE5cyBoYW5kbGVyc1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25TY2hlZHVsZUNsaWNrLCB0cnVlKTtcbiAgICBkbG9nKCdTY2hlZHVsZSBpbnRlcmNlcHRvciBhdHRhY2hlZCAoZGVsZWdhdGVkKScpO1xuXG5cbiAgICAvLyAtLS0tLS0tLS0tIE1lbnUgY29tbWFuZCAtLS0tLS0tLS0tXG4gICAgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCgnXHVEODNEXHVERDI3IFJlLWhvb2sgQ1ImUzEwIFNjaGVkdWxlJywgKCkgPT4gbG9jYXRpb24ucmVsb2FkKCkpO1xufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxHQUFDLGlCQUFrQjtBQUNmO0FBR0EsVUFBTSxjQUFjLHdCQUF3QixLQUFLLFNBQVMsUUFBUTtBQUNsRSxZQUFRLFdB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
