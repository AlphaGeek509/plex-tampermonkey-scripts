// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.138
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.138-1759273268203
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.138-1759273268203
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.138-1759273268203
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.138-1759273268203
// @require      http://localhost:5000/lt-core.user.js?v=3.8.138-1759273268203
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
// @updateURL   http://localhost:5000/qt05.user.js
// @downloadURL http://localhost:5000/qt05.user.js
// ==/UserScript==

(() => {
  // src/quote-tracking/qt05-customerContactAdd/qt05.index.js
  (async function() {
    "use strict";
    const DEV = true ? true : !!(typeof globalThis !== "undefined" && globalThis.__TM_DEV__);
    const CFG = {
      NAME: "QT05",
      ROUTES: [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],
      ANCHOR: '[data-val-property-name="CustomerNo"]',
      BTN_ID: "qt05-customer-contact",
      BTN_LABEL: "New Contact",
      BTN_TITLE: "Open Customer Contact form",
      BTN_WEIGHT: 70
    };
    if (!CFG.ROUTES.some((rx) => rx.test(location.pathname))) return;
    await window.ensureLTHub?.({ mount: "nav" });
    function getActiveWizardPageName() {
      const li = document.querySelector(
        '.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]'
      );
      return (li?.textContent || "").trim().replace(/\s+/g, " ");
    }
    function isQuoteAnchorVisible() {
      const el = document.querySelector('[data-val-property-name="CustomerNo"]');
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    }
    async function resolveCustomerNo() {
      try {
        const res = await TMUtils.waitForModelAsync(CFG.ANCHOR, { pollMs: 200, timeoutMs: 8e3, requireKo: true });
        const vm = res?.viewModel || null;
        const cn = TMUtils.getObsValue(vm, "CustomerNo", { first: true, trim: true });
        if (cn) return cn;
        const inp = document.querySelector(`${CFG.ANCHOR} input, ${CFG.ANCHOR} [contenteditable]`);
        const txt = (inp?.value ?? inp?.textContent ?? "").trim();
        if (txt) return txt;
        return null;
      } catch {
        return null;
      }
    }
    function makeContactUrl(customerNo) {
      const isTest = /\.test\.on\.plex\.com$/i.test(location.hostname);
      const envPart = isTest ? "test." : "";
      const base = `https://lyntron.${envPart}on.plex.com`;
      const q = new URLSearchParams({
        CustomerNo: String(customerNo || ""),
        ContactType: "Customer"
      }).toString();
      return `${base}/Communication/Contact/ContactFormView?${q}`;
    }
    async function onClick() {
      const task = lt?.core?.hub?.beginTask?.("Opening Contact form\u2026", "info") || { done() {
      }, error() {
      } };
      try {
        const customerNo = await resolveCustomerNo();
        if (!customerNo) {
          lt?.core?.hub?.notify?.("Customer No not found on the page.", "warn");
          task.error?.("No Customer No");
          return;
        }
        const url = makeContactUrl(customerNo);
        window.open(url, "_blank", "noopener,noreferrer");
        lt?.core?.hub?.notify?.("Contact form opened...", "success");
      } catch (err) {
        lt?.core?.hub?.error?.(`Open failed: ${err?.message || err}`, "error");
        task.error?.("Error");
      }
    }
    await lt?.core?.qt?.ensureHubButton?.({
      id: CFG.BTN_ID,
      label: CFG.BTN_LABEL,
      title: CFG.BTN_TITLE,
      side: "left",
      weight: CFG.BTN_WEIGHT,
      onClick,
      showWhen: () => true,
      mount: "nav"
    });
    function reconcile() {
      lt?.core?.qt?.ensureHubButton?.({
        id: CFG.BTN_ID,
        label: CFG.BTN_LABEL,
        title: CFG.BTN_TITLE,
        side: "left",
        weight: CFG.BTN_WEIGHT,
        onClick,
        showWhen: () => true,
        mount: "nav"
      });
    }
    TMUtils?.onUrlChange?.(reconcile);
    try {
      window.addEventListener("hashchange", reconcile);
    } catch {
    }
    try {
      const nav = document.querySelector(".plex-wizard-page-list");
      if (nav) new MutationObserver(reconcile).observe(nav, { subtree: true, attributes: true, childList: true });
    } catch {
    }
    if (DEV) {
      (unsafeWindow || window).QT05_debug = { makeContactUrl, resolveCustomerNo, onQuotePage };
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQwNS1jdXN0b21lckNvbnRhY3RBZGQvcXQwNS5pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3F0MDUtY3VzdG9tZXJDb250YWN0QWRkL3F0MDUuaW5kZXguanNcclxuLy8gSW5qZWN0cyBhIEh1YiBCYXIgYnV0dG9uIG9uIHRoZSBRdW90ZSBXaXphcmQgXHUyMTkyIFwiUXVvdGVcIiBwYWdlIHRoYXQgb3BlbnMgdGhlIEN1c3RvbWVyIENvbnRhY3QgZm9ybS5cclxuLy8gRm9sbG93cyB0aGUgc2FtZSByb3V0ZS9IdWIgY29udmVudGlvbnMgdXNlZCBhY3Jvc3MgUVQgbW9kdWxlcy5cclxuXHJcbihhc3luYyBmdW5jdGlvbiAoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcblxyXG4gICAgLy8gPT09PT0gRGV2IGZsYWcgKGJ1aWxkLXRpbWUgd2l0aCBydW50aW1lIGZhbGxiYWNrKSA9PT09PVxyXG4gICAgY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcclxuICAgICAgICA/IF9fQlVJTERfREVWX19cclxuICAgICAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xyXG5cclxuICAgIC8vID09PT09IENvbmZpZyA9PT09PVxyXG4gICAgY29uc3QgQ0ZHID0ge1xyXG4gICAgICAgIE5BTUU6ICdRVDA1JyxcclxuICAgICAgICBST1VURVM6IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV0sXHJcbiAgICAgICAgQU5DSE9SOiAnW2RhdGEtdmFsLXByb3BlcnR5LW5hbWU9XCJDdXN0b21lck5vXCJdJyxcclxuICAgICAgICBCVE5fSUQ6ICdxdDA1LWN1c3RvbWVyLWNvbnRhY3QnLFxyXG4gICAgICAgIEJUTl9MQUJFTDogJ05ldyBDb250YWN0JyxcclxuICAgICAgICBCVE5fVElUTEU6ICdPcGVuIEN1c3RvbWVyIENvbnRhY3QgZm9ybScsXHJcbiAgICAgICAgQlROX1dFSUdIVDogNzAsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFJvdXRlIGFsbG93bGlzdFxyXG4gICAgaWYgKCFDRkcuUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XHJcblxyXG4gICAgLy8gRW5zdXJlIEh1YiBpcyByZWFkeVxyXG4gICAgYXdhaXQgKHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6ICduYXYnIH0pKTtcclxuXHJcbiAgICAvLyA9PT09PSBIZWxwZXJzID09PT09XHJcbiAgICAvL2Z1bmN0aW9uIG9uUXVvdGVQYWdlKGN0eCkge1xyXG4gICAgLy8gICAgLy8gMSkgSHViIGNvbnRleHQgKG1vc3QgcmVsaWFibGUgd2hlbiBhdmFpbGFibGUpXHJcbiAgICAvLyAgICBpZiAodHlwZW9mIGN0eD8uaXNQYWdlID09PSAnZnVuY3Rpb24nICYmIGN0eC5pc1BhZ2UoJ1F1b3RlJykpIHJldHVybiB0cnVlO1xyXG5cclxuICAgIC8vICAgIC8vIDIpIEFjdGl2ZSB3aXphcmQgdGFiIHRleHQgKHRvbGVyYW50IG9mIHdoaXRlc3BhY2UvY2FzZSlcclxuICAgIC8vICAgIGNvbnN0IHRhYk5hbWUgPSBTdHJpbmcoY3R4Py5wYWdlTmFtZSB8fCBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpKVxyXG4gICAgLy8gICAgICAgIC50cmltKClcclxuICAgIC8vICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG4gICAgLy8gICAgaWYgKC9ecXVvdGUkL2kudGVzdCh0YWJOYW1lKSkgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgLy8gICAgLy8gMykgRE9NOiB0aGUgQ3VzdG9tZXJObyBhbmNob3IgaXMgdmlzaWJsZSBvbmx5IHdoZW4gUXVvdGUgY29udGVudCBpcyBhY3RpdmVcclxuICAgIC8vICAgIHJldHVybiBpc1F1b3RlQW5jaG9yVmlzaWJsZSgpO1xyXG4gICAgLy99XHJcblxyXG4gICAgZnVuY3Rpb24gZ2V0QWN0aXZlV2l6YXJkUGFnZU5hbWUoKSB7XHJcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxyXG4gICAgICAgICAgICAnLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZS5hY3RpdmUsIC5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2VbYXJpYS1jdXJyZW50PVwicGFnZVwiXSdcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGlzUXVvdGVBbmNob3JWaXNpYmxlKCkge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtdmFsLXByb3BlcnR5LW5hbWU9XCJDdXN0b21lck5vXCJdJyk7XHJcbiAgICAgICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XHJcbiAgICAgICAgaWYgKGNzLmRpc3BsYXkgPT09ICdub25lJyB8fCBjcy52aXNpYmlsaXR5ID09PSAnaGlkZGVuJykgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICByZXR1cm4gKHIud2lkdGggPiAwIHx8IHIuaGVpZ2h0ID4gMCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVDdXN0b21lck5vKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIFByZWZlciBLTy1ib3VuZCBWTSBmcm9tIHRoZSBhbmNob3IgZmllbGQgKHNhbWUgcGF0dGVybiB1c2VkIGluIFFUMTApXHJcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IFRNVXRpbHMud2FpdEZvck1vZGVsQXN5bmMoQ0ZHLkFOQ0hPUiwgeyBwb2xsTXM6IDIwMCwgdGltZW91dE1zOiA4MDAwLCByZXF1aXJlS286IHRydWUgfSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZtID0gcmVzPy52aWV3TW9kZWwgfHwgbnVsbDtcclxuICAgICAgICAgICAgY29uc3QgY24gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHZtLCAnQ3VzdG9tZXJObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XHJcbiAgICAgICAgICAgIGlmIChjbikgcmV0dXJuIGNuO1xyXG5cclxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHJlYWQgZnJvbSB0aGUgaW5wdXQgKGlmIGFueSlcclxuICAgICAgICAgICAgY29uc3QgaW5wID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgJHtDRkcuQU5DSE9SfSBpbnB1dCwgJHtDRkcuQU5DSE9SfSBbY29udGVudGVkaXRhYmxlXWApO1xyXG4gICAgICAgICAgICBjb25zdCB0eHQgPSAoaW5wPy52YWx1ZSA/PyBpbnA/LnRleHRDb250ZW50ID8/ICcnKS50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh0eHQpIHJldHVybiB0eHQ7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBtYWtlQ29udGFjdFVybChjdXN0b21lck5vKSB7XHJcbiAgICAgICAgLy8gUHJlc2VydmUgdGVzdC9ub24tdGVzdCBlbnZpcm9ubWVudCBwZXIgY3VycmVudCBob3N0bmFtZVxyXG4gICAgICAgIGNvbnN0IGlzVGVzdCA9IC9cXC50ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xyXG4gICAgICAgIGNvbnN0IGVudlBhcnQgPSBpc1Rlc3QgPyAndGVzdC4nIDogJyc7XHJcbiAgICAgICAgY29uc3QgYmFzZSA9IGBodHRwczovL2x5bnRyb24uJHtlbnZQYXJ0fW9uLnBsZXguY29tYDtcclxuICAgICAgICBjb25zdCBxID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh7XHJcbiAgICAgICAgICAgIEN1c3RvbWVyTm86IFN0cmluZyhjdXN0b21lck5vIHx8ICcnKSxcclxuICAgICAgICAgICAgQ29udGFjdFR5cGU6ICdDdXN0b21lcidcclxuICAgICAgICB9KS50b1N0cmluZygpO1xyXG4gICAgICAgIHJldHVybiBgJHtiYXNlfS9Db21tdW5pY2F0aW9uL0NvbnRhY3QvQ29udGFjdEZvcm1WaWV3PyR7cX1gO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIG9uQ2xpY2soKSB7XHJcbiAgICAgICAgY29uc3QgdGFzayA9IGx0Py5jb3JlPy5odWI/LmJlZ2luVGFzaz8uKCdPcGVuaW5nIENvbnRhY3QgZm9ybVx1MjAyNicsICdpbmZvJykgfHwgeyBkb25lKCkgeyB9LCBlcnJvcigpIHsgfSB9O1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbWVyTm8gPSBhd2FpdCByZXNvbHZlQ3VzdG9tZXJObygpO1xyXG4gICAgICAgICAgICBpZiAoIWN1c3RvbWVyTm8pIHtcclxuICAgICAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/Lm5vdGlmeT8uKCdDdXN0b21lciBObyBub3QgZm91bmQgb24gdGhlIHBhZ2UuJywgJ3dhcm4nKTtcclxuICAgICAgICAgICAgICAgIHRhc2suZXJyb3I/LignTm8gQ3VzdG9tZXIgTm8nKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCB1cmwgPSBtYWtlQ29udGFjdFVybChjdXN0b21lck5vKTtcclxuICAgICAgICAgICAgd2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyLG5vcmVmZXJyZXInKTtcclxuICAgICAgICAgICAgbHQ/LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0NvbnRhY3QgZm9ybSBvcGVuZWQuLi4nLCAnc3VjY2VzcycpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBsdD8uY29yZT8uaHViPy5lcnJvcj8uKGBPcGVuIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicpO1xyXG4gICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09IFJlZ2lzdGVyIEh1YiBidXR0b24gKFNQQS1zYWZlIHZpYSBzaG93V2hlbikgPT09PT1cclxuICAgIGF3YWl0IGx0Py5jb3JlPy5xdD8uZW5zdXJlSHViQnV0dG9uPy4oe1xyXG4gICAgICAgIGlkOiBDRkcuQlROX0lELFxyXG4gICAgICAgIGxhYmVsOiBDRkcuQlROX0xBQkVMLFxyXG4gICAgICAgIHRpdGxlOiBDRkcuQlROX1RJVExFLFxyXG4gICAgICAgIHNpZGU6ICdsZWZ0JyxcclxuICAgICAgICB3ZWlnaHQ6IENGRy5CVE5fV0VJR0hULFxyXG4gICAgICAgIG9uQ2xpY2ssXHJcbiAgICAgICAgc2hvd1doZW46ICgpID0+IHRydWUsXHJcbiAgICAgICAgbW91bnQ6ICduYXYnXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZWNvbmNpbGUgb24gU1BBIGNoYW5nZXMgYXMgYSBzYWZldHkgbmV0IChlbnN1cmVIdWJCdXR0b24gYWxzbyByZWNvbmNpbGVzKVxyXG4gICAgZnVuY3Rpb24gcmVjb25jaWxlKCkge1xyXG4gICAgICAgIGx0Py5jb3JlPy5xdD8uZW5zdXJlSHViQnV0dG9uPy4oe1xyXG4gICAgICAgICAgICBpZDogQ0ZHLkJUTl9JRCxcclxuICAgICAgICAgICAgbGFiZWw6IENGRy5CVE5fTEFCRUwsXHJcbiAgICAgICAgICAgIHRpdGxlOiBDRkcuQlROX1RJVExFLFxyXG4gICAgICAgICAgICBzaWRlOiAnbGVmdCcsXHJcbiAgICAgICAgICAgIHdlaWdodDogQ0ZHLkJUTl9XRUlHSFQsXHJcbiAgICAgICAgICAgIG9uQ2xpY2ssXHJcbiAgICAgICAgICAgIHNob3dXaGVuOiAoKSA9PiB0cnVlLFxyXG4gICAgICAgICAgICBtb3VudDogJ25hdidcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBUTVV0aWxzPy5vblVybENoYW5nZT8uKHJlY29uY2lsZSk7XHJcbiAgICB0cnkgeyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZSk7IH0gY2F0Y2ggeyB9XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcclxuICAgICAgICBpZiAobmF2KSBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWNvbmNpbGUpLm9ic2VydmUobmF2LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcclxuICAgIH0gY2F0Y2ggeyB9XHJcblxyXG5cclxuXHJcbiAgICBpZiAoREVWKSB7XHJcbiAgICAgICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUMDVfZGVidWcgPSB7IG1ha2VDb250YWN0VXJsLCByZXNvbHZlQ3VzdG9tZXJObywgb25RdW90ZVBhZ2UgfTtcclxuICAgIH1cclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUlBLEdBQUMsaUJBQWtCO0FBQ2Y7QUFHQSxVQUFNLE1BQU8sT0FDUCxPQUNBLENBQUMsRUFBRSxPQUFPLGVBQWUsZUFBZSxXQUFXO0FBR3pELFVBQU0sTUFBTTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sUUFBUSxDQUFDLHNDQUFzQztBQUFBLE1BQy9DLFFBQVE7QUFBQSxNQUNSLFFB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
