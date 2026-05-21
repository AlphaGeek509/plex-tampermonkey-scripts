// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.05.21.3
// @description Adds a Hub Bar “New Contact” button on Quote that opens Plex’s Contact form in a new tab. Resolves CustomerNo via KO with DOM fallbacks and guards via SPA-safe observers. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=2026.05.21.3-1779399959676
// @require     http://localhost:5000/lt-plex-auth.user.js?v=2026.05.21.3-1779399959676
// @require     http://localhost:5000/lt-core.user.js?v=2026.05.21.3-1779399959676
// @require     http://localhost:5000/lt-data-core.user.js?v=2026.05.21.3-1779399959676
// @require     http://localhost:5000/lt-ui-hub.js?v=2026.05.21.3-1779399959676
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
      BTN_WEIGHT: 10
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
        const res = await TMUtils.waitForModelAsync(CFG.ANCHOR, { pollMs: 200, timeoutMs: 2e3, requireKo: true });
        const vm = res?.viewModel || null;
        const cn = TMUtils.getObsValue(vm, "CustomerNo", { first: true, trim: true });
        if (cn) return cn;
      } catch {
      }
      try {
        const inp = document.querySelector(`${CFG.ANCHOR} input, ${CFG.ANCHOR} [contenteditable]`);
        const txt = (inp?.value ?? inp?.textContent ?? "").trim();
        if (txt) return txt;
      } catch {
      }
      try {
        const m = [...document.querySelectorAll('a[href*="CustomerNo="]')].map((a) => a.href.match(/[?&]CustomerNo=([^&\s]+)/)?.[1]).find(Boolean);
        if (m) return decodeURIComponent(m);
      } catch {
      }
      return null;
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
      (unsafeWindow || window).QT05_debug = { makeContactUrl, resolveCustomerNo };
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQwNS1jdXN0b21lckNvbnRhY3RBZGQvcXQwNS5pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3F0MDUtY3VzdG9tZXJDb250YWN0QWRkL3F0MDUuaW5kZXguanNcbi8vIEluamVjdHMgYSBIdWIgQmFyIGJ1dHRvbiBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBcIlF1b3RlXCIgcGFnZSB0aGF0IG9wZW5zIHRoZSBDdXN0b21lciBDb250YWN0IGZvcm0uXG4vLyBGb2xsb3dzIHRoZSBzYW1lIHJvdXRlL0h1YiBjb252ZW50aW9ucyB1c2VkIGFjcm9zcyBRVCBtb2R1bGVzLlxuXG4oYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vID09PT09IERldiBmbGFnIChidWlsZC10aW1lIHdpdGggcnVudGltZSBmYWxsYmFjaykgPT09PT1cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgICAgICA/IF9fQlVJTERfREVWX19cbiAgICAgICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuICAgIC8vID09PT09IENvbmZpZyA9PT09PVxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgTkFNRTogJ1FUMDUnLFxuICAgICAgICBST1VURVM6IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV0sXG4gICAgICAgIEFOQ0hPUjogJ1tkYXRhLXZhbC1wcm9wZXJ0eS1uYW1lPVwiQ3VzdG9tZXJOb1wiXScsXG4gICAgICAgIEJUTl9JRDogJ3F0MDUtY3VzdG9tZXItY29udGFjdCcsXG4gICAgICAgIEJUTl9MQUJFTDogJ05ldyBDb250YWN0JyxcbiAgICAgICAgQlROX1RJVExFOiAnT3BlbiBDdXN0b21lciBDb250YWN0IGZvcm0nLFxuICAgICAgICBCVE5fV0VJR0hUOiAxMCxcbiAgICB9O1xuXG4gICAgLy8gUm91dGUgYWxsb3dsaXN0XG4gICAgaWYgKCFDRkcuUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XG5cbiAgICAvLyBFbnN1cmUgSHViIGlzIHJlYWR5XG4gICAgYXdhaXQgKHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6ICduYXYnIH0pKTtcblxuICAgIC8vID09PT09IEhlbHBlcnMgPT09PT1cbiAgICAvL2Z1bmN0aW9uIG9uUXVvdGVQYWdlKGN0eCkge1xuICAgIC8vICAgIC8vIDEpIEh1YiBjb250ZXh0IChtb3N0IHJlbGlhYmxlIHdoZW4gYXZhaWxhYmxlKVxuICAgIC8vICAgIGlmICh0eXBlb2YgY3R4Py5pc1BhZ2UgPT09ICdmdW5jdGlvbicgJiYgY3R4LmlzUGFnZSgnUXVvdGUnKSkgcmV0dXJuIHRydWU7XG5cbiAgICAvLyAgICAvLyAyKSBBY3RpdmUgd2l6YXJkIHRhYiB0ZXh0ICh0b2xlcmFudCBvZiB3aGl0ZXNwYWNlL2Nhc2UpXG4gICAgLy8gICAgY29uc3QgdGFiTmFtZSA9IFN0cmluZyhjdHg/LnBhZ2VOYW1lIHx8IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpXG4gICAgLy8gICAgICAgIC50cmltKClcbiAgICAvLyAgICAgICAgLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICAvLyAgICBpZiAoL15xdW90ZSQvaS50ZXN0KHRhYk5hbWUpKSByZXR1cm4gdHJ1ZTtcblxuICAgIC8vICAgIC8vIDMpIERPTTogdGhlIEN1c3RvbWVyTm8gYW5jaG9yIGlzIHZpc2libGUgb25seSB3aGVuIFF1b3RlIGNvbnRlbnQgaXMgYWN0aXZlXG4gICAgLy8gICAgcmV0dXJuIGlzUXVvdGVBbmNob3JWaXNpYmxlKCk7XG4gICAgLy99XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgICAgICAgJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzUXVvdGVBbmNob3JWaXNpYmxlKCkge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXZhbC1wcm9wZXJ0eS1uYW1lPVwiQ3VzdG9tZXJOb1wiXScpO1xuICAgICAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XG4gICAgICAgIGlmIChjcy5kaXNwbGF5ID09PSAnbm9uZScgfHwgY3MudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgciA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICByZXR1cm4gKHIud2lkdGggPiAwIHx8IHIuaGVpZ2h0ID4gMCk7XG4gICAgfVxuXG5cbiAgICBhc3luYyBmdW5jdGlvbiByZXNvbHZlQ3VzdG9tZXJObygpIHtcbiAgICAgICAgLy8gMSkgS08tYm91bmQgVk0gZnJvbSB0aGUgYW5jaG9yIGZpZWxkXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKENGRy5BTkNIT1IsIHsgcG9sbE1zOiAyMDAsIHRpbWVvdXRNczogMjAwMCwgcmVxdWlyZUtvOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3Qgdm0gPSByZXM/LnZpZXdNb2RlbCB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgY24gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHZtLCAnQ3VzdG9tZXJObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoY24pIHJldHVybiBjbjtcbiAgICAgICAgfSBjYXRjaCB7fVxuXG4gICAgICAgIC8vIDIpIFJhdyBpbnB1dCB2YWx1ZSAocHJlc2VudCB3aGVuIHBpY2tlciBoYXNuJ3QgdG9rZW5pemVkIHlldClcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGlucCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYCR7Q0ZHLkFOQ0hPUn0gaW5wdXQsICR7Q0ZHLkFOQ0hPUn0gW2NvbnRlbnRlZGl0YWJsZV1gKTtcbiAgICAgICAgICAgIGNvbnN0IHR4dCA9IChpbnA/LnZhbHVlID8/IGlucD8udGV4dENvbnRlbnQgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICh0eHQpIHJldHVybiB0eHQ7XG4gICAgICAgIH0gY2F0Y2gge31cblxuICAgICAgICAvLyAzKSBDdXN0b21lck5vIGZyb20gUGxleC1yZW5kZXJlZCBwYWdlIGxpbmtzIChlLmcuIEN1c3RvbWVyIEFkZHJlc3NlcyBzaWRlYmFyIGxpbmspLlxuICAgICAgICAvLyAgICBQbGV4IHBvcHVsYXRlcyB0aGVzZSBsaW5rcyBhZnRlciBjdXN0b21lciBzZWxlY3Rpb24gZXZlbiB3aGVuIHRoZSBLTyBwaWNrZXJcbiAgICAgICAgLy8gICAgb2JzZXJ2YWJsZSBoYXNuJ3QgYmVlbiB1cGRhdGVkIChlLmcuIGZpbGwrVGFiIGlucHV0IHZzLiBkcm9wZG93biBzZWxlY3Rpb24pLlxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbSA9IFsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdhW2hyZWYqPVwiQ3VzdG9tZXJObz1cIl0nKV1cbiAgICAgICAgICAgICAgICAubWFwKGEgPT4gYS5ocmVmLm1hdGNoKC9bPyZdQ3VzdG9tZXJObz0oW14mXFxzXSspLyk/LlsxXSlcbiAgICAgICAgICAgICAgICAuZmluZChCb29sZWFuKTtcbiAgICAgICAgICAgIGlmIChtKSByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KG0pO1xuICAgICAgICB9IGNhdGNoIHt9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbWFrZUNvbnRhY3RVcmwoY3VzdG9tZXJObykge1xuICAgICAgICAvLyBQcmVzZXJ2ZSB0ZXN0L25vbi10ZXN0IGVudmlyb25tZW50IHBlciBjdXJyZW50IGhvc3RuYW1lXG4gICAgICAgIGNvbnN0IGlzVGVzdCA9IC9cXC50ZXN0XFwub25cXC5wbGV4XFwuY29tJC9pLnRlc3QobG9jYXRpb24uaG9zdG5hbWUpO1xuICAgICAgICBjb25zdCBlbnZQYXJ0ID0gaXNUZXN0ID8gJ3Rlc3QuJyA6ICcnO1xuICAgICAgICBjb25zdCBiYXNlID0gYGh0dHBzOi8vbHludHJvbi4ke2VudlBhcnR9b24ucGxleC5jb21gO1xuICAgICAgICBjb25zdCBxID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG4gICAgICAgICAgICBDdXN0b21lck5vOiBTdHJpbmcoY3VzdG9tZXJObyB8fCAnJyksXG4gICAgICAgICAgICBDb250YWN0VHlwZTogJ0N1c3RvbWVyJ1xuICAgICAgICB9KS50b1N0cmluZygpO1xuICAgICAgICByZXR1cm4gYCR7YmFzZX0vQ29tbXVuaWNhdGlvbi9Db250YWN0L0NvbnRhY3RGb3JtVmlldz8ke3F9YDtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBvbkNsaWNrKCkge1xuICAgICAgICBjb25zdCB0YXNrID0gbHQ/LmNvcmU/Lmh1Yj8uYmVnaW5UYXNrPy4oJ09wZW5pbmcgQ29udGFjdCBmb3JtXHUyMDI2JywgJ2luZm8nKSB8fCB7IGRvbmUoKSB7IH0sIGVycm9yKCkgeyB9IH07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21lck5vID0gYXdhaXQgcmVzb2x2ZUN1c3RvbWVyTm8oKTtcbiAgICAgICAgICAgIGlmICghY3VzdG9tZXJObykge1xuICAgICAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/Lm5vdGlmeT8uKCdDdXN0b21lciBObyBub3QgZm91bmQgb24gdGhlIHBhZ2UuJywgJ3dhcm4nKTtcbiAgICAgICAgICAgICAgICB0YXNrLmVycm9yPy4oJ05vIEN1c3RvbWVyIE5vJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdXJsID0gbWFrZUNvbnRhY3RVcmwoY3VzdG9tZXJObyk7XG4gICAgICAgICAgICB3aW5kb3cub3Blbih1cmwsICdfYmxhbmsnLCAnbm9vcGVuZXIsbm9yZWZlcnJlcicpO1xuICAgICAgICAgICAgbHQ/LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0NvbnRhY3QgZm9ybSBvcGVuZWQuLi4nLCAnc3VjY2VzcycpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGx0Py5jb3JlPy5odWI/LmVycm9yPy4oYE9wZW4gZmFpbGVkOiAke2Vycj8ubWVzc2FnZSB8fCBlcnJ9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB0YXNrLmVycm9yPy4oJ0Vycm9yJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyA9PT09PSBSZWdpc3RlciBIdWIgYnV0dG9uIChTUEEtc2FmZSB2aWEgc2hvd1doZW4pID09PT09XG4gICAgYXdhaXQgbHQ/LmNvcmU/LnF0Py5lbnN1cmVIdWJCdXR0b24/Lih7XG4gICAgICAgIGlkOiBDRkcuQlROX0lELFxuICAgICAgICBsYWJlbDogQ0ZHLkJUTl9MQUJFTCxcbiAgICAgICAgdGl0bGU6IENGRy5CVE5fVElUTEUsXG4gICAgICAgIHNpZGU6ICdsZWZ0JyxcbiAgICAgICAgd2VpZ2h0OiBDRkcuQlROX1dFSUdIVCxcbiAgICAgICAgb25DbGljayxcbiAgICAgICAgc2hvd1doZW46ICgpID0+IHRydWUsXG4gICAgICAgIG1vdW50OiAnbmF2J1xuICAgIH0pO1xuXG4gICAgLy8gUmVjb25jaWxlIG9uIFNQQSBjaGFuZ2VzIGFzIGEgc2FmZXR5IG5ldCAoZW5zdXJlSHViQnV0dG9uIGFsc28gcmVjb25jaWxlcylcbiAgICBmdW5jdGlvbiByZWNvbmNpbGUoKSB7XG4gICAgICAgIGx0Py5jb3JlPy5xdD8uZW5zdXJlSHViQnV0dG9uPy4oe1xuICAgICAgICAgICAgaWQ6IENGRy5CVE5fSUQsXG4gICAgICAgICAgICBsYWJlbDogQ0ZHLkJUTl9MQUJFTCxcbiAgICAgICAgICAgIHRpdGxlOiBDRkcuQlROX1RJVExFLFxuICAgICAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICAgICAgd2VpZ2h0OiBDRkcuQlROX1dFSUdIVCxcbiAgICAgICAgICAgIG9uQ2xpY2ssXG4gICAgICAgICAgICBzaG93V2hlbjogKCkgPT4gdHJ1ZSxcbiAgICAgICAgICAgIG1vdW50OiAnbmF2J1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBUTVV0aWxzPy5vblVybENoYW5nZT8uKHJlY29uY2lsZSk7XG4gICAgdHJ5IHsgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCByZWNvbmNpbGUpOyB9IGNhdGNoIHsgfVxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QnKTtcbiAgICAgICAgaWYgKG5hdikgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb25jaWxlKS5vYnNlcnZlKG5hdiwgeyBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG4gICAgfSBjYXRjaCB7IH1cblxuXG5cbiAgICBpZiAoREVWKSB7XG4gICAgICAgICh1bnNhZmVXaW5kb3cgfHwgd2luZG93KS5RVDA1X2RlYnVnID0geyBtYWtlQ29udGFjdFVybCwg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
