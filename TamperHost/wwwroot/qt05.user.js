// ==UserScript==
// @name        QT05
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.0.1
// @description Adds a Hub Bar “New Contact” button on Quote that opens Plex’s Contact form in a new tab. Resolves CustomerNo via KO with DOM fallbacks and guards via SPA-safe observers.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=4.0.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/lt-plex-auth.user.js?v=4.0.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/lt-ui-hub.js?v=4.0.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/lt-data-core.user.js?v=4.0.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/lt-core.user.js?v=4.0.1
// @resource    THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.0.1/TamperHost/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/qt05.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/qt05.user.js
// ==/UserScript==

(()=>{(async function(){"use strict";let e={NAME:"QT05",ROUTES:[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ANCHOR:'[data-val-property-name="CustomerNo"]',BTN_ID:"qt05-customer-contact",BTN_LABEL:"New Contact",BTN_TITLE:"Open Customer Contact form",BTN_WEIGHT:70};if(!e.ROUTES.some(t=>t.test(location.pathname)))return;await window.ensureLTHub?.({mount:"nav"});function d(){return(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," ")}function m(){let t=document.querySelector('[data-val-property-name="CustomerNo"]');if(!t)return!1;let n=getComputedStyle(t);if(n.display==="none"||n.visibility==="hidden")return!1;let o=t.getBoundingClientRect();return o.width>0||o.height>0}async function c(){try{let n=(await TMUtils.waitForModelAsync(e.ANCHOR,{pollMs:200,timeoutMs:8e3,requireKo:!0}))?.viewModel||null,o=TMUtils.getObsValue(n,"CustomerNo",{first:!0,trim:!0});if(o)return o;let r=document.querySelector(`${e.ANCHOR} input, ${e.ANCHOR} [contenteditable]`),i=(r?.value??r?.textContent??"").trim();return i||null}catch{return null}}function u(t){let r=`https://lyntron.${/\.test\.on\.plex\.com$/i.test(location.hostname)?"test.":""}on.plex.com`,i=new URLSearchParams({CustomerNo:String(t||""),ContactType:"Customer"}).toString();return`${r}/Communication/Contact/ContactFormView?${i}`}async function s(){let t=lt?.core?.hub?.beginTask?.("Opening Contact form\u2026","info")||{done(){},error(){}};try{let n=await c();if(!n){lt?.core?.hub?.notify?.("Customer No not found on the page.","warn"),t.error?.("No Customer No");return}let o=u(n);window.open(o,"_blank","noopener,noreferrer"),lt?.core?.hub?.notify?.("Contact form opened...","success")}catch(n){lt?.core?.hub?.error?.(`Open failed: ${n?.message||n}`,"error"),t.error?.("Error")}}await lt?.core?.qt?.ensureHubButton?.({id:e.BTN_ID,label:e.BTN_LABEL,title:e.BTN_TITLE,side:"left",weight:e.BTN_WEIGHT,onClick:s,showWhen:()=>!0,mount:"nav"});function a(){lt?.core?.qt?.ensureHubButton?.({id:e.BTN_ID,label:e.BTN_LABEL,title:e.BTN_TITLE,side:"left",weight:e.BTN_WEIGHT,onClick:s,showWhen:()=>!0,mount:"nav"})}TMUtils?.onUrlChange?.(a);try{window.addEventListener("hashchange",a)}catch{}try{let t=document.querySelector(".plex-wizard-page-list");t&&new MutationObserver(a).observe(t,{subtree:!0,attributes:!0,childList:!0})}catch{}})();})();
