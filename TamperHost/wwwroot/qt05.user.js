// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.2.2
// @description Adds a Hub Bar “New Contact” button on Quote that opens Plex’s Contact form in a new tab. Resolves CustomerNo via KO with DOM fallbacks and guards via SPA-safe observers. (DEV build)
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     http://localhost:5000/lt-plex-tm-utils.user.js?v=4.2.2-1761938961984
// @require     http://localhost:5000/lt-plex-auth.user.js?v=4.2.2-1761938961984
// @require     http://localhost:5000/lt-ui-hub.js?v=4.2.2-1761938961984
// @require     http://localhost:5000/lt-core.user.js?v=4.2.2-1761938961984
// @require     http://localhost:5000/lt-data-core.user.js?v=4.2.2-1761938961984
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXQwNS1jdXN0b21lckNvbnRhY3RBZGQvcXQwNS5pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gc3JjL3F1b3RlLXRyYWNraW5nL3F0MDUtY3VzdG9tZXJDb250YWN0QWRkL3F0MDUuaW5kZXguanNcbi8vIEluamVjdHMgYSBIdWIgQmFyIGJ1dHRvbiBvbiB0aGUgUXVvdGUgV2l6YXJkIFx1MjE5MiBcIlF1b3RlXCIgcGFnZSB0aGF0IG9wZW5zIHRoZSBDdXN0b21lciBDb250YWN0IGZvcm0uXG4vLyBGb2xsb3dzIHRoZSBzYW1lIHJvdXRlL0h1YiBjb252ZW50aW9ucyB1c2VkIGFjcm9zcyBRVCBtb2R1bGVzLlxuXG4oYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vID09PT09IERldiBmbGFnIChidWlsZC10aW1lIHdpdGggcnVudGltZSBmYWxsYmFjaykgPT09PT1cbiAgICBjb25zdCBERVYgPSAodHlwZW9mIF9fQlVJTERfREVWX18gIT09ICd1bmRlZmluZWQnKVxuICAgICAgICA/IF9fQlVJTERfREVWX19cbiAgICAgICAgOiAhISh0eXBlb2YgZ2xvYmFsVGhpcyAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVGhpcy5fX1RNX0RFVl9fKTtcblxuICAgIC8vID09PT09IENvbmZpZyA9PT09PVxuICAgIGNvbnN0IENGRyA9IHtcbiAgICAgICAgTkFNRTogJ1FUMDUnLFxuICAgICAgICBST1VURVM6IFsvXlxcL1NhbGVzQW5kQ1JNXFwvUXVvdGVXaXphcmQoPzpcXC98JCkvaV0sXG4gICAgICAgIEFOQ0hPUjogJ1tkYXRhLXZhbC1wcm9wZXJ0eS1uYW1lPVwiQ3VzdG9tZXJOb1wiXScsXG4gICAgICAgIEJUTl9JRDogJ3F0MDUtY3VzdG9tZXItY29udGFjdCcsXG4gICAgICAgIEJUTl9MQUJFTDogJ05ldyBDb250YWN0JyxcbiAgICAgICAgQlROX1RJVExFOiAnT3BlbiBDdXN0b21lciBDb250YWN0IGZvcm0nLFxuICAgICAgICBCVE5fV0VJR0hUOiA3MCxcbiAgICB9O1xuXG4gICAgLy8gUm91dGUgYWxsb3dsaXN0XG4gICAgaWYgKCFDRkcuUk9VVEVTLnNvbWUocnggPT4gcngudGVzdChsb2NhdGlvbi5wYXRobmFtZSkpKSByZXR1cm47XG5cbiAgICAvLyBFbnN1cmUgSHViIGlzIHJlYWR5XG4gICAgYXdhaXQgKHdpbmRvdy5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6ICduYXYnIH0pKTtcblxuICAgIC8vID09PT09IEhlbHBlcnMgPT09PT1cbiAgICAvL2Z1bmN0aW9uIG9uUXVvdGVQYWdlKGN0eCkge1xuICAgIC8vICAgIC8vIDEpIEh1YiBjb250ZXh0IChtb3N0IHJlbGlhYmxlIHdoZW4gYXZhaWxhYmxlKVxuICAgIC8vICAgIGlmICh0eXBlb2YgY3R4Py5pc1BhZ2UgPT09ICdmdW5jdGlvbicgJiYgY3R4LmlzUGFnZSgnUXVvdGUnKSkgcmV0dXJuIHRydWU7XG5cbiAgICAvLyAgICAvLyAyKSBBY3RpdmUgd2l6YXJkIHRhYiB0ZXh0ICh0b2xlcmFudCBvZiB3aGl0ZXNwYWNlL2Nhc2UpXG4gICAgLy8gICAgY29uc3QgdGFiTmFtZSA9IFN0cmluZyhjdHg/LnBhZ2VOYW1lIHx8IGdldEFjdGl2ZVdpemFyZFBhZ2VOYW1lKCkpXG4gICAgLy8gICAgICAgIC50cmltKClcbiAgICAvLyAgICAgICAgLnJlcGxhY2UoL1xccysvZywgJyAnKTtcbiAgICAvLyAgICBpZiAoL15xdW90ZSQvaS50ZXN0KHRhYk5hbWUpKSByZXR1cm4gdHJ1ZTtcblxuICAgIC8vICAgIC8vIDMpIERPTTogdGhlIEN1c3RvbWVyTm8gYW5jaG9yIGlzIHZpc2libGUgb25seSB3aGVuIFF1b3RlIGNvbnRlbnQgaXMgYWN0aXZlXG4gICAgLy8gICAgcmV0dXJuIGlzUXVvdGVBbmNob3JWaXNpYmxlKCk7XG4gICAgLy99XG5cbiAgICBmdW5jdGlvbiBnZXRBY3RpdmVXaXphcmRQYWdlTmFtZSgpIHtcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgICAgICAgJy5wbGV4LXdpemFyZC1wYWdlLWxpc3QgLnBsZXgtd2l6YXJkLXBhZ2UuYWN0aXZlLCAucGxleC13aXphcmQtcGFnZS1saXN0IC5wbGV4LXdpemFyZC1wYWdlW2FyaWEtY3VycmVudD1cInBhZ2VcIl0nXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiAobGk/LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzUXVvdGVBbmNob3JWaXNpYmxlKCkge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXZhbC1wcm9wZXJ0eS1uYW1lPVwiQ3VzdG9tZXJOb1wiXScpO1xuICAgICAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XG4gICAgICAgIGlmIChjcy5kaXNwbGF5ID09PSAnbm9uZScgfHwgY3MudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgciA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICByZXR1cm4gKHIud2lkdGggPiAwIHx8IHIuaGVpZ2h0ID4gMCk7XG4gICAgfVxuXG5cbiAgICBhc3luYyBmdW5jdGlvbiByZXNvbHZlQ3VzdG9tZXJObygpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFByZWZlciBLTy1ib3VuZCBWTSBmcm9tIHRoZSBhbmNob3IgZmllbGQgKHNhbWUgcGF0dGVybiB1c2VkIGluIFFUMTApXG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBUTVV0aWxzLndhaXRGb3JNb2RlbEFzeW5jKENGRy5BTkNIT1IsIHsgcG9sbE1zOiAyMDAsIHRpbWVvdXRNczogODAwMCwgcmVxdWlyZUtvOiB0cnVlIH0pO1xuICAgICAgICAgICAgY29uc3Qgdm0gPSByZXM/LnZpZXdNb2RlbCB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgY24gPSBUTVV0aWxzLmdldE9ic1ZhbHVlKHZtLCAnQ3VzdG9tZXJObycsIHsgZmlyc3Q6IHRydWUsIHRyaW06IHRydWUgfSk7XG4gICAgICAgICAgICBpZiAoY24pIHJldHVybiBjbjtcblxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHJlYWQgZnJvbSB0aGUgaW5wdXQgKGlmIGFueSlcbiAgICAgICAgICAgIGNvbnN0IGlucCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYCR7Q0ZHLkFOQ0hPUn0gaW5wdXQsICR7Q0ZHLkFOQ0hPUn0gW2NvbnRlbnRlZGl0YWJsZV1gKTtcbiAgICAgICAgICAgIGNvbnN0IHR4dCA9IChpbnA/LnZhbHVlID8/IGlucD8udGV4dENvbnRlbnQgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICh0eHQpIHJldHVybiB0eHQ7XG5cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYWtlQ29udGFjdFVybChjdXN0b21lck5vKSB7XG4gICAgICAgIC8vIFByZXNlcnZlIHRlc3Qvbm9uLXRlc3QgZW52aXJvbm1lbnQgcGVyIGN1cnJlbnQgaG9zdG5hbWVcbiAgICAgICAgY29uc3QgaXNUZXN0ID0gL1xcLnRlc3RcXC5vblxcLnBsZXhcXC5jb20kL2kudGVzdChsb2NhdGlvbi5ob3N0bmFtZSk7XG4gICAgICAgIGNvbnN0IGVudlBhcnQgPSBpc1Rlc3QgPyAndGVzdC4nIDogJyc7XG4gICAgICAgIGNvbnN0IGJhc2UgPSBgaHR0cHM6Ly9seW50cm9uLiR7ZW52UGFydH1vbi5wbGV4LmNvbWA7XG4gICAgICAgIGNvbnN0IHEgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcbiAgICAgICAgICAgIEN1c3RvbWVyTm86IFN0cmluZyhjdXN0b21lck5vIHx8ICcnKSxcbiAgICAgICAgICAgIENvbnRhY3RUeXBlOiAnQ3VzdG9tZXInXG4gICAgICAgIH0pLnRvU3RyaW5nKCk7XG4gICAgICAgIHJldHVybiBgJHtiYXNlfS9Db21tdW5pY2F0aW9uL0NvbnRhY3QvQ29udGFjdEZvcm1WaWV3PyR7cX1gO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIG9uQ2xpY2soKSB7XG4gICAgICAgIGNvbnN0IHRhc2sgPSBsdD8uY29yZT8uaHViPy5iZWdpblRhc2s/LignT3BlbmluZyBDb250YWN0IGZvcm1cdTIwMjYnLCAnaW5mbycpIHx8IHsgZG9uZSgpIHsgfSwgZXJyb3IoKSB7IH0gfTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbWVyTm8gPSBhd2FpdCByZXNvbHZlQ3VzdG9tZXJObygpO1xuICAgICAgICAgICAgaWYgKCFjdXN0b21lck5vKSB7XG4gICAgICAgICAgICAgICAgbHQ/LmNvcmU/Lmh1Yj8ubm90aWZ5Py4oJ0N1c3RvbWVyIE5vIG5vdCBmb3VuZCBvbiB0aGUgcGFnZS4nLCAnd2FybicpO1xuICAgICAgICAgICAgICAgIHRhc2suZXJyb3I/LignTm8gQ3VzdG9tZXIgTm8nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB1cmwgPSBtYWtlQ29udGFjdFVybChjdXN0b21lck5vKTtcbiAgICAgICAgICAgIHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcixub3JlZmVycmVyJyk7XG4gICAgICAgICAgICBsdD8uY29yZT8uaHViPy5ub3RpZnk/LignQ29udGFjdCBmb3JtIG9wZW5lZC4uLicsICdzdWNjZXNzJyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgbHQ/LmNvcmU/Lmh1Yj8uZXJyb3I/LihgT3BlbiBmYWlsZWQ6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIHRhc2suZXJyb3I/LignRXJyb3InKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vID09PT09IFJlZ2lzdGVyIEh1YiBidXR0b24gKFNQQS1zYWZlIHZpYSBzaG93V2hlbikgPT09PT1cbiAgICBhd2FpdCBsdD8uY29yZT8ucXQ/LmVuc3VyZUh1YkJ1dHRvbj8uKHtcbiAgICAgICAgaWQ6IENGRy5CVE5fSUQsXG4gICAgICAgIGxhYmVsOiBDRkcuQlROX0xBQkVMLFxuICAgICAgICB0aXRsZTogQ0ZHLkJUTl9USVRMRSxcbiAgICAgICAgc2lkZTogJ2xlZnQnLFxuICAgICAgICB3ZWlnaHQ6IENGRy5CVE5fV0VJR0hULFxuICAgICAgICBvbkNsaWNrLFxuICAgICAgICBzaG93V2hlbjogKCkgPT4gdHJ1ZSxcbiAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgfSk7XG5cbiAgICAvLyBSZWNvbmNpbGUgb24gU1BBIGNoYW5nZXMgYXMgYSBzYWZldHkgbmV0IChlbnN1cmVIdWJCdXR0b24gYWxzbyByZWNvbmNpbGVzKVxuICAgIGZ1bmN0aW9uIHJlY29uY2lsZSgpIHtcbiAgICAgICAgbHQ/LmNvcmU/LnF0Py5lbnN1cmVIdWJCdXR0b24/Lih7XG4gICAgICAgICAgICBpZDogQ0ZHLkJUTl9JRCxcbiAgICAgICAgICAgIGxhYmVsOiBDRkcuQlROX0xBQkVMLFxuICAgICAgICAgICAgdGl0bGU6IENGRy5CVE5fVElUTEUsXG4gICAgICAgICAgICBzaWRlOiAnbGVmdCcsXG4gICAgICAgICAgICB3ZWlnaHQ6IENGRy5CVE5fV0VJR0hULFxuICAgICAgICAgICAgb25DbGljayxcbiAgICAgICAgICAgIHNob3dXaGVuOiAoKSA9PiB0cnVlLFxuICAgICAgICAgICAgbW91bnQ6ICduYXYnXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIFRNVXRpbHM/Lm9uVXJsQ2hhbmdlPy4ocmVjb25jaWxlKTtcbiAgICB0cnkgeyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHJlY29uY2lsZSk7IH0gY2F0Y2ggeyB9XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtd2l6YXJkLXBhZ2UtbGlzdCcpO1xuICAgICAgICBpZiAobmF2KSBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWNvbmNpbGUpLm9ic2VydmUobmF2LCB7IHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcbiAgICB9IGNhdGNoIHsgfVxuXG5cblxuICAgIGlmIChERVYpIHtcbiAgICAgICAgKHVuc2FmZVdpbmRvdyB8fCB3aW5kb3cpLlFUMDVfZGVidWcgPSB7IG1ha2VDb250YWN0VXJsLCByZXNvbHZlQ3VzdG9tZXJObywgb25RdW90ZVBhZ2UgfTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBSUEsR0FBQyxpQkFBa0I7QUFDZjtBQUdBLFVBQU0sTUFBTyxPQUNQLE9BQ0EsQ0FBQyxFQUFFLE9BQU8sZUFBZSxlQUFlLFdBQVc7QUFHekQsVUFBTSxNQUFNO0FBQUEsTUFDUixNQUFNO0FBQUEsTUFDTixRQUFRLENBQUMsc0NBQXNDO0FBQUEsTUFDL0MsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLElBQ2hCO0FBR0EsUUFBSSxDQUFDLElBQUksT0FBTyxLQUFLLFFBQU0sR0FBRyxLQUFLLFNBQVMsUUFBUSxDQUFDLEVBQUc7QUFHeEQsVUFBTyxPQUFPLGNBQWMsRUFBRSxPQUFPLE1BQU0sQ0FBQztBQWlCNUMsYUFBUywwQkFBMEI7QUFDL0IsWUFBTSxLQUFLLFNBQVM7QUFBQSxRQUNoQjtBQUFBLE1BQ0o7QUFDQSxjQUFRLElBQUksZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsR0FBRztBQUFBLElBQzdEO0FB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
