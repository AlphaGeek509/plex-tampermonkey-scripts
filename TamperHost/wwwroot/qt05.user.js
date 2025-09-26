// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.136
// @description DEV-only build; includes user-start gate
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      http://localhost:5000/lt-plex-tm-utils.user.js?v=3.8.136-1758927204454
// @require      http://localhost:5000/lt-plex-auth.user.js?v=3.8.136-1758927204454
// @require      http://localhost:5000/lt-ui-hub.js?v=3.8.136-1758927204454
// @require      http://localhost:5000/lt-data-core.user.js?v=3.8.136-1758927204454
// @require      http://localhost:5000/lt-core.user.js?v=3.8.136-1758927204454
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
    function onQuotePage(ctx) {
      if (typeof ctx?.isPage === "function" && ctx.isPage("Quote")) return true;
      const tabName = String(ctx?.pageName || getActiveWizardPageName()).trim().replace(/\s+/g, " ");
      if (/^quote$/i.test(tabName)) return true;
      return isQuoteAnchorVisible();
    }
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
          lt?.core?.hub?.notify?.("Customer No not found on the page.", "warn", { ms: 4e3 });
          task.error?.("No Customer No");
          return;
        }
        const url = makeContactUrl(customerNo);
        window.open(url, "_blank", "noopener,noreferrer");
        lt?.core?.hub?.notify?.("Contact form opened...", "success", { ms: 4e3 });
      } catch (err) {
        lt?.core?.hub?.error?.(`Open failed: ${err?.message || err}`, "error", { ms: 5e3 });
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
      showWhen: (ctx) => onQuotePage(ctx),
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
        showWhen: (ctx) => onQuotePage(ctx),
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQwNS1jdXN0b21lckNvbnRhY3RBZGQvcXQwNS5pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3F0MDUtY3VzdG9tZXJDb250YWN0QWRkL3F0MDUuaW5kZXguanNcclxuLy8gSW5qZWN0cyBhIEh1YiBCYXIgYnV0dG9uIG9uIHRoZSBRdW90ZSBXaXphcmQgXHUyMTkyIFwiUXVvdGVcIiBwYWdlIHRoYXQgb3BlbnMgdGhlIEN1c3RvbWVyIENvbnRhY3QgZm9ybS5cclxuLy8gRm9sbG93cyB0aGUgc2FtZSByb3V0ZS9IdWIgY29udmVudGlvbnMgdXNlZCBhY3Jvc3MgUVQgbW9kdWxlcy5cclxuXHJcbihhc3luYyBmdW5jdGlvbiAoKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcblxyXG4gICAgLy8gPT09PT0gRGV2IGZsYWcgKGJ1aWxkLXRpbWUgd2l0aCBydW50aW1lIGZhbGxiYWNrKSA9PT09PVxyXG4gICAgY29uc3QgREVWID0gKHR5cGVvZiBfX0JVSUxEX0RFVl9fICE9PSAndW5kZWZpbmVkJylcclxuICAgICAgICA/IF9fQlVJTERfREVWX19cclxuICAgICAgICA6ICEhKHR5cGVvZiBnbG9iYWxUaGlzICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUaGlzLl9fVE1fREVWX18pO1xyXG5cclxuICAgIC8vID09PT09IENvbmZpZyA9PT09PVxyXG4gICAgY29uc3QgQ0ZHID0ge1xyXG4gICAgICAgIE5BTUU6ICdRVDA1JyxcclxuICAgICAgICBST1VURVM6IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV0sXHJcbiAgICAgICAgQU5DSE9SOiAnW2RhdGEtdmFsLXByb3BlcnR5LW5hbWU9XCJDdXN0b21lck5vXCJdJyxcclxuICAgICAgICBCVE5fSUQ6ICdxdDA1LWN1c3RvbWVyLWNvbnRhY3QnLFxyXG4gICAgICAgIEJUTl9MQUJFTDogJ05ldyBDb250YWN0JyxcclxuICAgICAgICBCVE5fVElUTEU6ICdPcGVuIEN1c3RvbWVyIENvbnRhY3QgZm9ybScsXHJcbiAgICAgICAgQlROX1dFSUdIVDogNzAsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFJvdXRlIGFsbG93bGlzdFxyXG4gICAgaWYgKCFDRkcuUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XHJcblxyXG4gICAgLy8gRW5zdXJlIEh1YiBpcyByZWFkeVxyXG4gICAgYXdhaXQgKHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6ICduYXYnIH0pKTtcclxuXHJcbiAgICAvLyA9PT09PSBIZWxwZXJzID09PT09XHJcbiAgICBmdW5jdGlvbiBvblF1b3RlUGFnZShjdHgpIHtcclxuICAgICAgICAvLyAxKSBIdWIgY29udGV4dCAobW9zdCByZWxpYWJsZSB3aGVuIGF2YWlsYWJsZSlcclxuICAgICAgICBpZiAodHlwZW9mIGN0eD8uaXNQYWdlID09PSAnZnVuY3Rpb24nICYmIGN0eC5pc1BhZ2UoJ1F1b3RlJykpIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICAvLyAyKSBBY3RpdmUgd2l6YXJkIHRhYiB0ZXh0ICh0b2xlcmFudCBvZiB3aGl0ZXNwYWNlL2Nhc2UpXHJcbiAgICAgICAgY29uc3QgdGFiTmFtZSA9IFN0cmluZyhjdHg/LnBhZ2VOYW1lIHx8IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpXHJcbiAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccysvZywgJyAnKTtcclxuICAgICAgICBpZiAoL15xdW90ZSQvaS50ZXN0KHRhYk5hbWUpKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gMykgRE9NOiB0aGUgQ3VzdG9tZXJObyBhbmNob3IgaXMgdmlzaWJsZSBvbmx5IHdoZW4gUXVvdGUgY29udGVudCBpcyBhY3RpdmVcclxuICAgICAgICByZXR1cm4gaXNRdW90ZUFuY2hvclZpc2libGUoKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcclxuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXHJcbiAgICAgICAgICAgICcucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlLmFjdGl2ZSwgLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCAucGxleC13aXphcmQtcGFnZVthcmlhLWN1cnJlbnQ9XCJwYWdlXCJdJ1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIChsaT8udGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaXNRdW90ZUFuY2hvclZpc2libGUoKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS12YWwtcHJvcGVydHktbmFtZT1cIkN1c3RvbWVyTm9cIl0nKTtcclxuICAgICAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgY3MgPSBnZXRDb21wdXRlZFN0eWxlKGVsKTtcclxuICAgICAgICBpZiAoY3MuZGlzcGxheSA9PT0gJ25vbmUnIHx8IGNzLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgciA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIHJldHVybiAoci53aWR0aCA+IDAgfHwgci5oZWlnaHQgPiAwKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUN1c3RvbWVyTm8oKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gUHJlZmVyIEtPLWJvdW5kIFZNIGZyb20gdGhlIGFuY2hvciBmaWVsZCAoc2FtZSBwYXR0ZXJuIHVzZWQgaW4gUVQxMClcclxuICAgICAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgVE1VdGlscy53YWl0Rm9yTW9kZWxBc3luYyhDRkcuQU5DSE9SLCB7IHBvbGxNczogMjAwLCB0aW1lb3V0TXM6IDgwMDAsIHJlcXVpcmVLbzogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29uc3Qgdm0gPSByZXM/LnZpZXdNb2RlbCB8fCBudWxsO1xyXG4gICAgICAgICAgICBjb25zdCBjbiA9IFRNVXRpbHMuZ2V0T2JzVmFsdWUodm0sICdDdXN0b21lck5vJywgeyBmaXJzdDogdHJ1ZSwgdHJpbTogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgaWYgKGNuKSByZXR1cm4gY247XHJcblxyXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogcmVhZCBmcm9tIHRoZSBpbnB1dCAoaWYgYW55KVxyXG4gICAgICAgICAgICBjb25zdCBpbnAgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGAke0NGRy5BTkNIT1J9IGlucHV0LCAke0NGRy5BTkNIT1J9IFtjb250ZW50ZWRpdGFibGVdYCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHR4dCA9IChpbnA/LnZhbHVlID8/IGlucD8udGV4dENvbnRlbnQgPz8gJycpLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHR4dCkgcmV0dXJuIHR4dDtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG1ha2VDb250YWN0VXJsKGN1c3RvbWVyTm8pIHtcclxuICAgICAgICAvLyBQcmVzZXJ2ZSB0ZXN0L25vbi10ZXN0IGVudmlyb25tZW50IHBlciBjdXJyZW50IGhvc3RuYW1lXHJcbiAgICAgICAgY29uc3QgaXNUZXN0ID0gL1xcLnRlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XHJcbiAgICAgICAgY29uc3QgZW52UGFydCA9IGlzVGVzdCA/ICd0ZXN0LicgOiAnJztcclxuICAgICAgICBjb25zdCBiYXNlID0gYGh0dHBzOi8vbHludHJvbi4ke2VudlBhcnR9b24ucGxleC5jb21gO1xyXG4gICAgICAgIGNvbnN0IHEgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgICAgICAgQ3VzdG9tZXJObzogU3RyaW5nKGN1c3RvbWVyTm8gfHwgJycpLFxyXG4gICAgICAgICAgICBDb250YWN0VHlwZTogJ0N1c3RvbWVyJ1xyXG4gICAgICAgIH0pLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgcmV0dXJuIGAke2Jhc2V9L0NvbW11bmljYXRpb24vQ29udGFjdC9Db250YWN0Rm9ybVZpZXc/JHtxfWA7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gb25DbGljaygpIHtcclxuICAgICAgICBjb25zdCB0YXNrID0gbHQ/LmNvcmU/Lmh1Yj8uYmVnaW5UYXNrPy4oJ09wZW5pbmcgQ29udGFjdCBmb3JtXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgY3VzdG9tZXJObyA9IGF3YWl0IHJlc29sdmVDdXN0b21lck5vKCk7XHJcbiAgICAgICAgICAgIGlmICghY3VzdG9tZXJObykge1xyXG4gICAgICAgICAgICAgICAgbHQ/LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0N1c3RvbWVyIE5vIG5vdCBmb3VuZCBvbiB0aGUgcGFnZS4nLCAnd2FybicsIHsgbXM6IDQwMDAgfSk7XHJcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ05vIEN1c3RvbWVyIE5vJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgdXJsID0gbWFrZUNvbnRhY3RVcmwoY3VzdG9tZXJObyk7XHJcbiAgICAgICAgICAgIHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcixub3JlZmVycmVyJyk7XHJcbiAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/Lm5vdGlmeT8uKCdDb250YWN0IGZvcm0gb3BlbmVkLi4uJywgJ3N1Y2Nlc3MnLCB7IG1zOiA0MDAwIH0pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBsdD8uY29yZT8uaHViPy5lcnJvcj8uKGBPcGVuIGZhaWxlZDogJHtlcnI/Lm1lc3NhZ2UgfHwgZXJyfWAsICdlcnJvcicsIHsgbXM6IDUwMDAgfSk7XHJcbiAgICAgICAgICAgIHRhc2suZXJyb3I/LignRXJyb3InKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT0gUmVnaXN0ZXIgSHViIGJ1dHRvbiAoU1BBLXNhZmUgdmlhIHNob3dXaGVuKSA9PT09PVxyXG4gICAgYXdhaXQgbHQ/LmNvcmU/LnF0Py5lbnN1cmVIdWJCdXR0b24/Lih7XHJcbiAgICAgICAgaWQ6IENGRy5CVE5fSUQsXHJcbiAgICAgICAgbGFiZWw6IENGRy5CVE5fTEFCRUwsXHJcbiAgICAgICAgdGl0bGU6IENGRy5CVE5fVElUTEUsXHJcbiAgICAgICAgc2lkZTogJ2xlZnQnLFxyXG4gICAgICAgIHdlaWdodDogQ0ZHLkJUTl9XRUlHSFQsXHJcbiAgICAgICAgb25DbGljayxcclxuICAgICAgICBzaG93V2hlbjogKGN0eCkgPT4gb25RdW90ZVBhZ2UoY3R4KSxcclxuICAgICAgICBtb3VudDogJ25hdidcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFJlY29uY2lsZSBvbiBTUEEgY2hhbmdlcyBhcyBhIHNhZmV0eSBuZXQgKGVuc3VyZUh1YkJ1dHRvbiBhbHNvIHJlY29uY2lsZXMpXHJcbiAgICBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XHJcbiAgICAgICAgbHQ/LmNvcmU/LnF0Py5lbnN1cmVIdWJCdXR0b24/Lih7XHJcbiAgICAgICAgICAgIGlkOiBDRkcuQlROX0lELFxyXG4gICAgICAgICAgICBsYWJlbDogQ0ZHLkJUTl9MQUJFTCxcclxuICAgICAgICAgICAgdGl0bGU6IENGRy5CVE5fVElUTEUsXHJcbiAgICAgICAgICAgIHNpZGU6ICdsZWZ0JyxcclxuICAgICAgICAgICAgd2VpZ2h0OiBDRkcuQlROX1dFSUdIVCxcclxuICAgICAgICAgICAgb25DbGljayxcclxuICAgICAgICAgICAgc2hvd1doZW46IChjdHgpID0+IG9uUXVvdGVQYWdlKGN0eCksXHJcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcclxuICAgIHRyeSB7IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcmVjb25jaWxlKTsgfSBjYXRjaCB7IH1cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xyXG4gICAgICAgIGlmIChuYXYpIG5ldyBNdXRhdGlvbk9ic2VydmVyKHJlY29uY2lsZSkub2JzZXJ2ZShuYXYsIHsgc3VidHJlZTogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xyXG4gICAgfSBjYXRjaCB7IH1cclxuXHJcblxyXG5cclxuICAgIGlmIChERVYpIHtcclxuICAgICAgICAodW5zYWZlV2luZG93IHx8IHdpbmRvdykuUVQwNV9kZWJ1ZyA9IHsgbWFrZUNvbnRhY3RVcmwsIHJlc29sdmVDdXN0b21lck5vLCBvblF1b3RlUGFnZSB9O1xyXG4gICAgfVxyXG59KSgpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBSUEsR0FBQyxpQkFBa0I7QUFDZjtBQUdBLFVBQU0sTUFBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFHekQsVUFBTSxNQUFNO0FBQUEsTUFDUixNQUFNO0FBQUEs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
