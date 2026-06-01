// ==UserScript==
// @name        QT10
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.06.01.1
// @description Watches CustomerNo, fetches Catalog Key/Code (DS 319/22696), and stores them in the DRAFT repo. Supports draft→quote promote and small DEV seams for debugging.
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@master/TamperHost/wwwroot/qt10.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@master/TamperHost/wwwroot/qt10.user.js
// ==/UserScript==

(()=>{(async function(){"use strict";let a={NAME:"QT10",ROUTES:[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ANCHOR:'[data-val-property-name="CustomerNo"]',DS_CATALOG_BY_CUSTOMER:319,DS_CATALOG_CODE_BY_KEY:22696,GATE_USER_EDIT:!0},b=()=>{};if(!a.ROUTES.some(t=>t.test(location.pathname)))return;await window.ensureLTHub?.({mount:"nav"});let p=null;async function y(){return p||(p=await lt?.core?.qt?.useDraftRepo?.(),p||null)}let D=t=>{let r=lt?.core?.auth?.withFreshAuth;return typeof r=="function"?r(t):t()};async function M(){try{if(await lt.core.auth.getKey())return!0}catch{}return lt.core.hub.notify("Auth looks stale. Retrying\u2026","warn",{toast:!0}),!1}async function Q(t,{timeoutMs:r=1e4,pollMs:o=150}={}){let s=Date.now();for(;Date.now()-s<r;){if(document.querySelector(t))return!0;await(TMUtils.sleep?.(o)||new Promise(m=>setTimeout(m,o)))}return!!document.querySelector(t)}let w=!1,g=!1,T=null,k=null;async function A(){if(!(w||g)){g=!0;try{if(!a.ROUTES.some(o=>o.test(location.pathname))||!await Q(a.ANCHOR)||!await M())return;let{viewModel:t}=await TMUtils.waitForModelAsync(a.ANCHOR,{pollMs:200,timeoutMs:8e3});if(!t)return;try{await(await y())?.get()}catch{}let r=null;T=TMUtils.watchBySelector({selector:a.ANCHOR,initial:!a.GATE_USER_EDIT,fireOn:"blur",settleMs:350,onChange:async()=>{let o=TMUtils.getObsValue(t,"CustomerNo",{first:!0,trim:!0});!o||o===r||(r=o,await K(o,t))}}),w=!0}catch(t){w=!1,b(`${a.NAME} init failed:`,t)}finally{g=!1}}}async function K(t,r){if(!t)return;let o=lt.core.hub.beginTask("Linking catalog\u2026","info");try{let s=await D(()=>lt.core.plex.dsRows(a.DS_CATALOG_BY_CUSTOMER,{Customer_No:t})),e=(Array.isArray(s)?s[0]:null)?.Catalog_Key||0;if(!e){o.error("No catalog found for this customer.");return}let c=await D(()=>lt.core.plex.dsRows(a.DS_CATALOG_CODE_BY_KEY,{Catalog_Key:e})),l=(Array.isArray(c)?c.map(i=>i?.Catalog_Code).find(Boolean):null)||"";TMUtils.setObsValue(r,"CatalogKey",e),TMUtils.setObsValue(r,"CatalogCode",l);try{let i=(typeof unsafeWindow<"u"?unsafeWindow:window).ko,_=document.getElementById("QuoteCatalogDropDown");if(i&&_){let S=i.dataFor(_),R=i.unwrap(S?.data);if(Array.isArray(R)&&R.find(h=>Number(h.CatalogKey)===Number(e))){let h=()=>{let f=i.bindingHandlers?.options?.optionValueDomDataKey,d=!1;for(let u of _.options){let U=f?i.utils.domData.get(u,f):null,N=U?Number(U.CatalogKey)===Number(e):u.text.includes(String(e));u.selected=N,N&&(d=!0)}d&&_.dispatchEvent(new Event("change",{bubbles:!0}))};h();let O=S?.config?.selected;if(typeof O?.subscribe=="function"){let f=!1,d=O.subscribe(u=>{!f&&Array.isArray(u)&&u.length===0&&(f=!0,d.dispose(),setTimeout(h,50))});setTimeout(()=>d.dispose(),5e3)}}}}catch(i){console.error("[QT10] dropdown binding error:",i)}await y()&&q({Customer_No:String(t),Catalog_Key:Number(e),Catalog_Code:String(l||""),Catalog_Fetched_At:Date.now(),Updated_At:Date.now()});let C=typeof l=="string"?l.trim():"",v=C||String(e??""),E=C?`Linked: ${C} (key ${e})`:`Linked: key ${e}`;o.success(E),lt.core.hub.notify(E,"success")}catch(s){o.error("No catalog found for this customer."),b(s)}}let n={queue:null,timer:null};async function q(t,r=120,o=250){let s=e=>{try{let c=lt?.core?.qt?.getQuoteContext?.(),l=Number(c?.quoteKey||0);l>0&&lt.core.qt.promoteDraftToQuote?.({qk:l,strategy:e})}catch{}};try{let e=await y();if(e)return await e.patchHeader(t),s("once"),!0}catch(e){console.debug("QT10: repo not ready now, will retry",e)}if(n.queue={...n.queue||{},...t},n.timer)return!1;let m=r;return n.timer=setInterval(async()=>{try{let e=await y();if(!e){--m<=0&&(clearInterval(n.timer),n.timer=null,console.warn("QT10: repo never became ready; gave up after retries"));return}let c=n.queue;n.queue=null,clearInterval(n.timer),n.timer=null,await e.patchHeader(c),console.debug("QT10: draft persisted after retry",c),s("retry")}catch(e){console.warn("QT10: retry persist error",e)}},o),!1}k=TMUtils.onUrlChange?.(()=>{if(!a.ROUTES.some(t=>t.test(location.pathname))){try{T?.()}catch{}T=null,w=!1,g=!1;return}setTimeout(A,0)}),setTimeout(A,0);let L=typeof unsafeWindow<"u"?unsafeWindow:window})();})();
