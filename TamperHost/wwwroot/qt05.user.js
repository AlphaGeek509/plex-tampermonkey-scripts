// ==UserScript==
// @name        QT05
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.06.01.1
// @description Adds a Hub Bar “New Contact” button on Quote that opens Plex’s Contact form in a new tab. Resolves CustomerNo via KO with DOM fallbacks and guards via SPA-safe observers.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=2026.06.01.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/lt-plex-auth.user.js?v=2026.06.01.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/lt-core.user.js?v=2026.06.01.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/lt-data-core.user.js?v=2026.06.01.1
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/lt-ui-hub.js?v=2026.06.01.1
// @resource    THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.1/TamperHost/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@master/TamperHost/wwwroot/qt05.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@master/TamperHost/wwwroot/qt05.user.js
// ==/UserScript==

(()=>{(async function(){"use strict";let o={NAME:"QT05",ROUTES:[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ANCHOR:'[data-val-property-name="CustomerNo"]',BTN_ID:"qt05-customer-contact",BTN_LABEL:"New Contact",BTN_TITLE:"Open Customer Contact form",BTN_WEIGHT:10};if(!o.ROUTES.some(t=>t.test(location.pathname)))return;await window.ensureLTHub?.({mount:"nav"});function m(){return(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," ")}function d(){let t=document.querySelector('[data-val-property-name="CustomerNo"]');if(!t)return!1;let e=getComputedStyle(t);if(e.display==="none"||e.visibility==="hidden")return!1;let n=t.getBoundingClientRect();return n.width>0||n.height>0}async function a(){try{let e=(await TMUtils.waitForModelAsync(o.ANCHOR,{pollMs:200,timeoutMs:2e3,requireKo:!0}))?.viewModel||null,n=TMUtils.getObsValue(e,"CustomerNo",{first:!0,trim:!0});if(n)return n}catch{}try{let t=document.querySelector(`${o.ANCHOR} input, ${o.ANCHOR} [contenteditable]`),e=(t?.value??t?.textContent??"").trim();if(e)return e}catch{}try{let t=[...document.querySelectorAll('a[href*="CustomerNo="]')].map(e=>e.href.match(/[?&]CustomerNo=([^&\s]+)/)?.[1]).find(Boolean);if(t)return decodeURIComponent(t)}catch{}return null}function s(t){let c=`https://lyntron.${/\.test\.on\.plex\.com$/i.test(location.hostname)?"test.":""}on.plex.com`,u=new URLSearchParams({CustomerNo:String(t||""),ContactType:"Customer"}).toString();return`${c}/Communication/Contact/ContactFormView?${u}`}async function i(){let t=lt?.core?.hub?.beginTask?.("Opening Contact form\u2026","info")||{done(){},error(){}};try{let e=await a();if(!e){lt?.core?.hub?.notify?.("Customer No not found on the page.","warn"),t.error?.("No Customer No");return}let n=s(e);window.open(n,"_blank","noopener,noreferrer"),lt?.core?.hub?.notify?.("Contact form opened...","success")}catch(e){lt?.core?.hub?.error?.(`Open failed: ${e?.message||e}`,"error"),t.error?.("Error")}}await lt?.core?.qt?.ensureHubButton?.({id:o.BTN_ID,label:o.BTN_LABEL,title:o.BTN_TITLE,side:"left",weight:o.BTN_WEIGHT,onClick:i,showWhen:()=>!0,mount:"nav"});function r(){lt?.core?.qt?.ensureHubButton?.({id:o.BTN_ID,label:o.BTN_LABEL,title:o.BTN_TITLE,side:"left",weight:o.BTN_WEIGHT,onClick:i,showWhen:()=>!0,mount:"nav"})}TMUtils?.onUrlChange?.(r);try{window.addEventListener("hashchange",r)}catch{}try{let t=document.querySelector(".plex-wizard-page-list");t&&new MutationObserver(r).observe(t,{subtree:!0,attributes:!0,childList:!0})}catch{}})();})();
