// ==UserScript==
// @name        QT10
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.1.3
// @description Watches CustomerNo, fetches Catalog Key/Code (DS 319/22696), and stores them in the DRAFT repo. Supports draft→quote promote and small DEV seams for debugging.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=4.1.3
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/lt-plex-auth.user.js?v=4.1.3
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/lt-ui-hub.js?v=4.1.3
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/lt-core.user.js?v=4.1.3
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/lt-data-core.user.js?v=4.1.3
// @resource    THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/qt10.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.3/TamperHost/wwwroot/qt10.user.js
// ==/UserScript==

(()=>{(async function(){"use strict";let o={NAME:"QT10",ROUTES:[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ANCHOR:'[data-val-property-name="CustomerNo"]',DS_CATALOG_BY_CUSTOMER:319,DS_CATALOG_CODE_BY_KEY:22696,GATE_USER_EDIT:!0},w=()=>{};if(!o.ROUTES.some(t=>t.test(location.pathname)))return;await window.ensureLTHub?.({mount:"nav"});let c=null;async function u(){return c||(c=await lt?.core?.qt?.useDraftRepo?.(),c||null)}let T=t=>{let a=lt?.core?.auth?.withFreshAuth;return typeof a=="function"?a(t):t()};async function g(){try{if(await lt.core.auth.getKey())return!0}catch{}return lt.core.hub.notify("Auth looks stale. Retrying\u2026","warn",{toast:!0}),!1}async function C(t,{timeoutMs:a=1e4,pollMs:r=150}={}){let s=Date.now();for(;Date.now()-s<a;){if(document.querySelector(t))return!0;await(TMUtils.sleep?.(r)||new Promise(d=>setTimeout(d,r)))}return!!document.querySelector(t)}let f=!1,y=!1,p=null,A=null;async function h(){if(!(f||y)){y=!0;try{if(!o.ROUTES.some(r=>r.test(location.pathname))||!await C(o.ANCHOR)||!await g())return;let{viewModel:t}=await TMUtils.waitForModelAsync(o.ANCHOR,{pollMs:200,timeoutMs:8e3});if(!t)return;try{await(await u())?.get()}catch{}let a=null;p=TMUtils.watchBySelector({selector:o.ANCHOR,initial:!o.GATE_USER_EDIT,fireOn:"blur",settleMs:350,onChange:async()=>{let r=TMUtils.getObsValue(t,"CustomerNo",{first:!0,trim:!0});!r||r===a||(a=r,await D(r,t))}}),f=!0}catch(t){f=!1,w(`${o.NAME} init failed:`,t)}finally{y=!1}}}async function D(t,a){if(!t)return;let r=lt.core.hub.beginTask("Linking catalog\u2026","info");try{let s=await T(()=>lt.core.plex.dsRows(o.DS_CATALOG_BY_CUSTOMER,{Customer_No:t})),e=(Array.isArray(s)?s[0]:null)?.Catalog_Key||0;if(!e){r.error("No catalog found for this customer.");return}let i=await T(()=>lt.core.plex.dsRows(o.DS_CATALOG_CODE_BY_KEY,{Catalog_Key:e})),l=(Array.isArray(i)?i.map(S=>S?.Catalog_Code).find(Boolean):null)||"";TMUtils.setObsValue(a,"CatalogKey",e),TMUtils.setObsValue(a,"CatalogCode",l),await u()&&E({Customer_No:String(t),Catalog_Key:Number(e),Catalog_Code:String(l||""),Catalog_Fetched_At:Date.now(),Updated_At:Date.now()});let _=typeof l=="string"?l.trim():"",U=_||String(e??""),m=_?`Linked: ${_} (key ${e})`:`Linked: key ${e}`;r.success(m),lt.core.hub.notify(m,"success")}catch(s){r.error("No catalog found for this customer."),w(s)}}let n={queue:null,timer:null};async function E(t,a=120,r=250){let s=e=>{try{let i=lt?.core?.qt?.getQuoteContext?.(),l=Number(i?.quoteKey||0);l>0&&lt.core.qt.promoteDraftToQuote?.({qk:l,strategy:e})}catch{}};try{let e=await u();if(e)return await e.patchHeader(t),s("once"),!0}catch(e){console.debug("QT10: repo not ready now, will retry",e)}if(n.queue={...n.queue||{},...t},n.timer)return!1;let d=a;return n.timer=setInterval(async()=>{try{let e=await u();if(!e){--d<=0&&(clearInterval(n.timer),n.timer=null,console.warn("QT10: repo never became ready; gave up after retries"));return}let i=n.queue;n.queue=null,clearInterval(n.timer),n.timer=null,await e.patchHeader(i),console.debug("QT10: draft persisted after retry",i),s("retry")}catch(e){console.warn("QT10: retry persist error",e)}},r),!1}A=TMUtils.onUrlChange?.(()=>{if(!o.ROUTES.some(t=>t.test(location.pathname))){try{p?.()}catch{}p=null,f=!1,y=!1;return}setTimeout(h,0)}),setTimeout(h,0);let b=typeof unsafeWindow<"u"?unsafeWindow:window})();})();
