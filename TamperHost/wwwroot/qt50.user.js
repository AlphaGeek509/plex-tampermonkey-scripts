// ==UserScript==
// @name        QT50
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     4.1.2
// @description Runs rule-based checks on quote lines for lead time, unit price limits, and part number management. Adds a Hub Bar “Validate Lines” button with settings, a details modal, and CSV export. Highlights issues directly in the grid with optional auto-fixes.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=4.1.2
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/lt-plex-auth.user.js?v=4.1.2
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/lt-ui-hub.js?v=4.1.2
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/lt-core.user.js?v=4.1.2
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/lt-data-core.user.js?v=4.1.2
// @resource    THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/qt50.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v4.1.2/TamperHost/wwwroot/qt50.user.js
// ==/UserScript==

(()=>{var Pt=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko,A=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ot=!!TMUtils.matchRoute?.(A),h={enabled:"qt50.enabled",autoManageLtPartNoOnQuote:"qt50.autoManageLtPartNoOnQuote",minUnitPrice:"qt50.minUnitPrice",maxUnitPrice:"qt50.maxUnitPrice",leadtimeZeroWeeks:"qt50.leadtimeZeroWeeks"},at={enabled:"qtv.enabled",autoManageLtPartNoOnQuote:"qtv.autoManageLtPartNoOnQuote",minUnitPrice:"qtv.minUnitPrice",maxUnitPrice:"qtv.maxUnitPrice",leadtimeZeroWeeks:"qt50.leadtimeZeroWeeks"},W={[h.enabled]:!0,[h.autoManageLtPartNoOnQuote]:!0,[h.minUnitPrice]:0,[h.maxUnitPrice]:10,[h.leadtimeZeroWeeks]:!0};function it(r){let t=GM_getValue(r);if(t!==void 0)return t;let e=Object.values(at).find(a=>a.endsWith(r.split(".").pop())),o=e?GM_getValue(e):void 0;return o!==void 0?o:void 0}var q=r=>{let t=it(r);return t===void 0?W[r]:t},N=(r,t)=>{GM_setValue(r,t),j()};function S(){return{enabled:q(h.enabled),autoManageLtPartNoOnQuote:q(h.autoManageLtPartNoOnQuote),minUnitPrice:q(h.minUnitPrice),maxUnitPrice:q(h.maxUnitPrice),leadtimeZeroWeeks:q(h.leadtimeZeroWeeks)}}function G(r){if(typeof r!="function")return()=>{};let t=()=>r(S());return window.addEventListener("LT:QTV:SettingsChanged",t),()=>window.removeEventListener("LT:QTV:SettingsChanged",t)}function j(){try{window.dispatchEvent(new CustomEvent("LT:QTV:SettingsChanged",{detail:S()}))}catch{}}GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings",z);ot&&($(),TMUtils?.onUrlChange?.($),setTimeout($,500));async function $(){let r=TMUtils.matchRoute?.(A),e=(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," "),o=!0,a=await(async function(n={mount:"nav"}){for(let u=0;u<50;u++){let g=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof g=="function")try{let c=await g(n);if(c)return c}catch{}await new Promise(c=>setTimeout(c,100))}return null})();if(!a?.registerButton)return;let d="qt50-settings",i=a.list?.()?.includes(d);o&&!i?a.registerButton("right",{id:d,label:"Validation \u2699\uFE0E",title:"Open Quote Validation settings",weight:30,onClick:z}):!o&&i&&a.remove?.(d)}function z(){let r=document.createElement("div");r.id="lt-qtv-overlay",Object.assign(r.style,{position:"fixed",inset:0,background:"var(--lt-overlay, rgba(0,0,0,.36))",zIndex:100002});let t=document.createElement("div");t.id="lt-qtv-panel",t.className="lt-card lt-modal",Object.assign(t.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"520px",maxWidth:"min(92vw, 560px)"}),r.addEventListener("keydown",e=>{e.key==="Escape"&&r.remove()}),r.tabIndex=-1,r.addEventListener("click",e=>{e.target===r&&r.remove()}),t.addEventListener("click",e=>e.stopPropagation()),t.innerHTML=`
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard \u2192 Part Summary page.</div>

    <label style="display:block; margin:10px 0;">
      <input type="checkbox" id="qtv-enabled"> Enable validations
    </label>

    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

    <label title="If Part Status is Quote, the Lyn-Tron Part No is controlled automatically."
           style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-autoManageLtPartNoOnQuote">
      Auto-manage omitted Lyn-Tron Part No.
    </label>

    <label style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-leadtimeZeroWeeks">
      Alert when Leadtime is 0 weeks
    </label>

    <div style="display:flex; gap:10px; margin:8px 0;">
      <label style="flex:1;">Min Unit Price
        <input type="number" step="0.01" id="qtv-min" placeholder="(none)"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <label style="flex:1;">Max Unit Price
        <input type="number" step="0.01" id="qtv-max" placeholder="10.00"
               style="width:100%; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
    </div>

    <div style="border-top:1px solid #eee; margin:12px 0 10px;"></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button id="qtv-export" class="lt-btn lt-btn--ghost">Export</button>
      <button id="qtv-import-btn" class="lt-btn lt-btn--ghost" type="button">Import</button>
        <input id="qtv-import" type="file" accept="application/json" style="display:none;">
      <span style="flex:1"></span>
      <button id="qtv-reset" class="lt-btn lt-btn--warn">Reset</button>
      <button id="qtv-close" class="lt-btn lt-btn--primary">Save &amp; Close</button>
    </div>
  `,t.querySelector("#qtv-enabled").checked=q(h.enabled),t.querySelector("#qtv-autoManageLtPartNoOnQuote").checked=q(h.autoManageLtPartNoOnQuote),t.querySelector("#qtv-leadtimeZeroWeeks").checked=q(h.leadtimeZeroWeeks),Q(t.querySelector("#qtv-min"),q(h.minUnitPrice)),Q(t.querySelector("#qtv-max"),q(h.maxUnitPrice)),t.querySelector("#qtv-enabled")?.addEventListener("change",e=>N(h.enabled,!!e.target.checked)),t.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change",e=>N(h.autoManageLtPartNoOnQuote,!!e.target.checked)),t.querySelector("#qtv-leadtimeZeroWeeks")?.addEventListener("change",e=>N(h.leadtimeZeroWeeks,!!e.target.checked)),t.querySelector("#qtv-min")?.addEventListener("change",e=>{let o=D(e.target.value);N(h.minUnitPrice,o),Q(e.target,o)}),t.querySelector("#qtv-max")?.addEventListener("change",e=>{let o=D(e.target.value);N(h.maxUnitPrice,o),Q(e.target,o)}),t.querySelector("#qtv-close")?.addEventListener("click",()=>{r.remove(),TMUtils.toast?.("Validation settings saved.","success",1600)}),t.querySelector("#qtv-reset")?.addEventListener("click",()=>{Object.keys(W).forEach(e=>GM_setValue(e,W[e])),j(),r.remove(),TMUtils.toast?.("Validation settings reset.","info",1800)}),t.querySelector("#qtv-export")?.addEventListener("click",()=>{let e=new Blob([JSON.stringify(S(),null,2)],{type:"application/json"}),o=URL.createObjectURL(e),a=document.createElement("a");a.href=o,a.download="qt-validation-settings.json",a.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}),t.querySelector("#qtv-import-btn")?.addEventListener("change",async e=>{try{let o=e.target.files?.[0];if(!o)return;let a=JSON.parse(await o.text());if(a&&typeof a=="object")"enabled"in a&&N(h.enabled,!!a.enabled),"autoManageLtPartNoOnQuote"in a&&N(h.autoManageLtPartNoOnQuote,!!a.autoManageLtPartNoOnQuote),"minUnitPrice"in a&&N(h.minUnitPrice,I(a.minUnitPrice)),"maxUnitPrice"in a&&N(h.maxUnitPrice,I(a.maxUnitPrice)),r.remove(),TMUtils.toast?.("Validation settings imported.","success",1800);else throw new Error("Invalid JSON.")}catch(o){TMUtils.toast?.(`Import failed: ${o?.message||o}`,"error",3e3)}}),st(),r.appendChild(t),(document.body||document.documentElement).appendChild(r),r.focus()}function D(r){let t=Number(String(r).trim());return Number.isFinite(t)?t:null}function I(r){let t=Number(r);return Number.isFinite(t)?t:null}function Q(r,t){r.value=t==null?"":String(t)}function st(){if(document.getElementById("lt-qtv-panel-styles"))return;let r=document.createElement("style");r.id="lt-qtv-panel-styles",r.textContent=`
#lt-qtv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.36); z-index: 100002; }
#lt-qtv-panel.lt-card {
  /* Local Monroe palette (independent of page tokens) */
  --brand-600: #8b0b04;
  --brand-700: #5c0a0a;
  --ok: #28a745;
  --warn: #ffc107;
  --err: #dc3545;

  background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.30);
  overflow: hidden; padding: 16px;
}
#lt-qtv-panel h3 { margin: 0 0 10px 0; font: 600 16px/1.2 system-ui, Segoe UI, sans-serif; }
#lt-qtv-panel .lt-btn,
#lt-qtv-panel label.lt-btn {
  display:inline-flex; align-items:center; gap:6px; padding:6px 10px;
  border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; cursor:pointer;
}
#lt-qtv-panel .lt-btn--primary { background: var(--brand-600); border-color: color-mix(in srgb, var(--brand-600) 70%, black); color:#fff; }
#lt-qtv-panel .lt-btn--primary:hover { background: var(--brand-700); }
#lt-qtv-panel .lt-btn--ghost   { background: transparent; color: var(--brand-600); border-color: var(--brand-600); }
#lt-qtv-panel .lt-btn--ghost:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }
#lt-qtv-panel .lt-btn--warn    { background: var(--warn); color:#111; border-color: color-mix(in srgb, var(--warn) 50%, black); }
#lt-qtv-panel .lt-btn--error   { background: var(--err);  color:#fff; border-color: color-mix(in srgb, var(--err) 70%, black); }
#lt-qtv-panel .lt-btn--ok      { background: var(--ok);   color:#fff; border-color: color-mix(in srgb, var(--ok) 70%, black); }

#lt-qtv-panel input[type="number"], #lt-qtv-panel input[type="text"] {
  width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff;
}
  `,document.head.appendChild(r)}async function E(r,t,e){let o=[];if(!t?.autoManageLtPartNoOnQuote)return o;let a=typeof unsafeWindow<"u"?unsafeWindow:window,d=a.lt||{},i=m=>{let s=d?.core?.auth?.withFreshAuth;return typeof s=="function"?s(m):m()},p=d.core?.data?.makeFlatScopedRepo?d.core.data.makeFlatScopedRepo({ns:"QT",entity:"quote",legacyEntity:"QuoteHeader"}):null,n=3156,u=13509;async function g(){let m=typeof a.getPlexFacade=="function"?await a.getPlexFacade():d?.core?.plex;if(!m)throw new Error("Plex facade not available");return m}function c(){try{return(sessionStorage.getItem("Quote_No")||"").trim()}catch{return""}}async function f(m){let s=Number(m);if(!s||!Number.isFinite(s)||s<=0)return c();try{if(!p)return c();let{repo:y}=p.use(s);await y.ensureFromLegacyIfMissing?.();let v=await y.getHeader?.();if(!v?.Quote_No){let k=await g();if(k?.dsRows){let l=await i(()=>k.dsRows(n,{Quote_Key:String(s)})),w=(Array.isArray(l)&&l.length?l[0]:null)?.Quote_No??null;w!=null&&(await y.patchHeader?.({Quote_Key:s,Quote_No:w,Quote_Header_Fetched_At:Date.now()}),v=await y.getHeader?.())}}let x=v?.Quote_No;return x==null?c():String(x).trim()}catch{return c()}}for(let[m,s]of r.groupsByQuotePart.entries()){let y=Array.isArray(s)&&s.length?s[0]:null,v=e.get(y,"QuoteKey",{number:!0}),x=await f(v),k=new Map;for(let l of s){let b=e.get(l,"PartKey",{number:!0});Number.isFinite(b)&&!k.has(b)&&k.set(b,l)}for(let l of k.values()){if(String(e.get(l,"PartStatus",{trim:!0})||"").toLowerCase()!=="quote")continue;let w=v??e.get(l,"QuoteKey",{number:!0}),P=e.get(l,"PartKey",{number:!0}),U=String(e.get(l,"PartNo",{trim:!0})??""),F=!!x?`${x}_`:"_";if(U.startsWith(F)){o.push({kind:"part.autoManageLtPartNoOnQuote",level:"info",quotePartKey:m,message:"No change: Part_No already managed.",meta:{status:"Quote",quoteKey:w,partKey:P,partNo:U,ds:u,changed:!1}});continue}let nt=`${F}${U}`,K={Quote_Key:String(w??""),Part_Key:String(P??""),Part_No:String(nt??""),Update_Part:!0};try{let _=await g();if(!_?.dsRows)throw new Error("plex.dsRows unavailable");await i(()=>_.dsRows(u,K)),o.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:m,message:`Part_No \u201C${K.Part_No}\u201D auto managed.`,meta:{status:"Quote",quoteKey:w,partKey:P,partNo:U,ds:u,changed:!0}})}catch(_){o.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:m,message:`DS ${u} failed: ${_?.message||_}`,meta:{status:"Quote",quoteKey:w,partKey:P,partNo:U,ds:u,changed:!1}})}}}return o}E.meta={id:"autoManageLtPartNoOnQuote",label:"Auto-Manage LT Part No"};function O(r,t,e){if(!t?.leadtimeZeroWeeks)return[];let o=[],a=d=>{if(d==null)return NaN;let i=String(typeof d=="function"?d():d).trim();return i?Number(i.replace(/[^\d.-]/g,"")):NaN};for(let[d,i]of r.groupsByQuotePart.entries())for(let p of i){let n=e.get(p,"LeadTime"),u=a(n);Number.isFinite(u)&&u===0&&o.push({kind:"time.leadtimeZeroWeeks",level:"error",quotePartKey:d,message:"Leadtime is 0 weeks (must be > 0).",meta:{leadtimeRaw:n,leadtimeNum:u}})}return o}O.meta={id:"leadtimeZeroWeeks",label:"Leadtime Zero Weeks"};function V(r,t,e){let o=Number(t.minUnitPrice);if(!Number.isFinite(o))return[];let a=[],d=i=>{if(i==null)return NaN;let p=String(typeof i=="function"?i():i).trim();return p?Number(p.replace(/[^\d.-]/g,"")):NaN};for(let[i,p]of r.groupsByQuotePart.entries())for(let n of p){let u=e.get(n,"Quantity")??"?",g=e.get(n,"RvCustomizedUnitPrice")??e.get(n,"RvUnitPriceCopy")??e.get(n,"UnitPrice"),c=d(g),m=(v=>{let x=String(typeof v=="function"?v():v||"");return/\$/.test(x)?"USD":/€/.test(x)?"EUR":/£/.test(x)?"GBP":t?.currencyCode||"USD"})(g),s=new Intl.NumberFormat("en-US",{style:"currency",currency:m,maximumFractionDigits:6}),y=new Intl.NumberFormat("en-US",{maximumFractionDigits:6});if(Number.isFinite(c)&&c<o){let v=x=>Number.isFinite(x)?s.format(x):String(x);a.push({kind:"price.minUnitPrice",level:"error",quotePartKey:i,message:`Unit Price ${v(c)} < Min ${v(o)}`,meta:{unitRaw:g,unitNum:c,min:o,currency:m}})}}return a}V.meta={id:"minUnitPrice",label:"Min Unit Price"};function M(r,t,e){let o=Number(t.maxUnitPrice);if(!Number.isFinite(o))return[];let a=[],d=i=>{if(i==null)return NaN;let p=String(typeof i=="function"?i():i).trim();return p?Number(p.replace(/[^\d.-]/g,"")):NaN};for(let[i,p]of r.groupsByQuotePart.entries())for(let n of p){let u=e.get(n,"Quantity")??"?",g=e.get(n,"RvCustomizedUnitPrice")??e.get(n,"RvUnitPriceCopy")??e.get(n,"UnitPrice"),c=d(g),m=(y=>{let v=String(typeof y=="function"?y():y??"").trim();return/\$/.test(v)?"USD":/€/.test(v)?"EUR":/£/.test(v)?"GBP":t?.currencyCode||"USD"})(g),s=new Intl.NumberFormat("en-US",{style:"currency",currency:m,maximumFractionDigits:6});if(Number.isFinite(c)&&c>o){let y=v=>Number.isFinite(v)?s.format(v):String(v);a.push({kind:"price.maxUnitPrice",level:"error",quotePartKey:i,message:`Unit Price ${y(c)} > Max ${y(o)}`,meta:{unitRaw:g,unitNum:c,max:o,currency:m}})}}return a}M.meta={id:"maxUnitPrice",label:"Max Unit Price"};var Z=[E,O,M,V];async function H(r,t){await r.waitForModelAsync(".plex-grid",{requireKo:!0,timeoutMs:12e3});let e=typeof unsafeWindow<"u"?unsafeWindow.ko:window.ko,o=document.querySelector(".plex-grid"),a=o&&e&&typeof e.dataFor=="function"?e.dataFor(o):null;if(!a)return{ok:!0,issues:[]};let d=a?.datasource?.raw||a?.datasource?.data||[],i=new Map;for(let l of d){let b=r.getObsValue(l,"QuotePartKey")??-1;(i.get(b)||i.set(b,[]).get(b)).push(l)}let p=new Map;for(let[l,b]of i.entries()){let w=b.find(P=>r.getObsValue(P,"IsUniqueQuotePart")===1)||b[0];p.set(l,w)}let n={rows:d,groupsByQuotePart:i,primaryByQuotePart:p,lastForm:r.net?.getLastAddUpdateForm?.(),lastResult:r.net?.getLastAddUpdate?.()},u={get:(l,b,w)=>r.getObsValue(l,b,w)},c=(await Promise.all(Z.map(l=>l(n,t,u)))).flat(),f=c.every(l=>l.level!=="error"),m=l=>Number(String(l??"").replace(/[^\d.-]/g,"")),s=l=>{if(l?.meta?.label)return l.meta.label;if(l?.kind){let b=String(l.kind),w=b.split(".").pop();return w?w.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,P=>P.toUpperCase()):b}return"Validation"},y=new Map;for(let l=0;l<n.rows.length;l++){let b=n.rows[l],w=l+1,P=u.get(b,"PartNo",{trim:!0})??"";y.set(b,{lineNumber:w,partNo:P})}let v=new Map;for(let[l,b]of n.primaryByQuotePart.entries()){let w=y.get(b)||{lineNumber:null,partNo:u.get(b,"PartNo",{trim:!0})??""};v.set(l,w)}let x=new Map;for(let l=0;l<n.rows.length;l++){let b=n.rows[l],w=l+1,P=u.get(b,"SortOrder",{number:!0});x.set(w,P)}let k=c.map(l=>{let b=l.quotePartKey??-1,w=v.get(b)||{lineNumber:null,partNo:""};return{...l,lineNumber:w.lineNumber,partNo:w.partNo,ruleLabel:s(l),sortOrder:x.get(w.lineNumber??-1)}});return r.state=r.state||{},r.state.lastValidation={at:Date.now(),ok:f,issues:k},{ok:f,issues:k}}var Y=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko;function ct(r){try{let e=(Array.isArray(r)?r:[]).reduce((i,p)=>{let n=String(p?.level||"info").toLowerCase();return i[n]=(i[n]||0)+1,p?.quotePartKey!=null&&i.parts.add(p.quotePartKey),i},{error:0,warning:0,info:0,parts:new Set}),o=e.parts.size,a=[];return e.error&&a.push(`${e.error} error${e.error===1?"":"s"}`),e.warning&&a.push(`${e.warning} warning${e.warning===1?"":"s"}`),e.info&&a.push(`${e.info} info`),`${a.join(", ")||"updates"} across ${o||0} part${o===1?"":"s"}`}catch{return""}}async function ut(){try{let r=document.querySelector(".plex-grid"),t=r&&Y?.dataFor?.(r);if(typeof t?.datasource?.read=="function")return await t.datasource.read(),"ds.read";if(typeof t?.refresh=="function")return t.refresh(),"vm.refresh"}catch{}try{let r=unsafeWindow?.plex?.currentPage?.QuoteWizard;if(r?.navigatePage){let t=typeof r.activePage=="function"?r.activePage():r.activePage;return r.navigatePage(t),"wiz.navigatePage"}}catch{}return null}var C="qt50-validate";async function dt(r={mount:"nav"}){for(let t=0;t<50;t++){let e=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof e=="function")try{let o=await e(r);if(o)return o}catch{}await new Promise(o=>setTimeout(o,100))}return null}function pt(r=[]){T();let t=document.createElement("div");t.id="qtv-modal-overlay",Object.assign(t.style,{position:"fixed",inset:0,background:"var(--lt-overlay, rgba(0,0,0,.36))",zIndex:100002});let e=document.createElement("div");e.id="qtv-modal",e.className="lt-card",Object.assign(e.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:"min(900px, 92vw)"});let o=[...r].sort((n,u)=>{let g=n.sortOrder??Number.POSITIVE_INFINITY,c=u.sortOrder??Number.POSITIVE_INFINITY;if(g!==c)return g-c;let f=String(n.partNo??""),m=String(u.partNo??"");if(f!==m)return f.localeCompare(m);let s=String(n.ruleLabel??n.kind??""),y=String(u.ruleLabel??u.kind??"");return s.localeCompare(y)}),a=null,d=null,i=null,p=o.map(n=>{let u=(n.level||"").toLowerCase(),c=`<span class="qtv-pill ${u==="error"?"qtv-pill--error":u==="warn"||u==="warning"?"qtv-pill--warn":"qtv-pill--info"}">${u||"info"}</span>`,f=n.message||"(no message)",m=String(n.ruleLabel||n.kind||"Validation"),s=n.sortOrder!==a?n.sortOrder??"":"",y=s!==""||n.partNo!==d?n.partNo??"":"",x=!(s===""&&y==="")||m!==i?m:"";return a=n.sortOrder,d=n.partNo,i=m,`
  <tr data-qpk="${n.quotePartKey??""}" data-rule="${String(n.kind||"")}">
    <td>${s}</td>
    <td>${y}</td>
    <td>${x}</td>
    <td>${c}</td>
    <td>${f}</td>
  </tr>`}).join("");e.innerHTML=`
  <div class="qtv-hd lt-card__header">
    <h3 class="lt-card__title">Validation Details</h3>
    <div class="qtv-actions lt-card__spacer">
      <button class="lt-btn lt-btn--ghost" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="lt-btn lt-btn--primary" id="qtv-close">Close</button>
    </div>
  </div>
  <div class="qtv-bd lt-card__body">
    <table class="lt-table" aria-label="Validation Issues">
      <thead>
        <tr>
          <th>Sort&nbsp;Order</th>
          <th>Part #</th>
          <th>Rule</th>
          <th>Level</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${p||'<tr><td colspan="5" style="opacity:.7; padding:12px;">No issues.</td></tr>'}</tbody>
    </table>
  </div>
`,e.querySelector("#qtv-close")?.addEventListener("click",()=>t.remove()),t.addEventListener("click",n=>{n.target===t&&t.remove()}),e.querySelector("tbody")?.addEventListener("click",n=>{let u=n.target.closest("tr");if(!u)return;let g=u.getAttribute("data-qpk");if(!g)return;T();let c=B(g);c&&(document.querySelectorAll(".qtv-row-fail").forEach(f=>f.classList.remove("qtv-row-fail")),c.classList.add("qtv-row-fail"),c.scrollIntoView({block:"center",behavior:"smooth"}))}),e.querySelector("#qtv-export-csv")?.addEventListener("click",()=>{let n=[["Line","SortOrder","PartNo","QuotePartKey","Rule","Level","Reason"].join(","),...r.map(f=>{let m=s=>{let y=String(s??"");return/[",\n]/.test(y)?`"${y.replace(/"/g,'""')}"`:y};return[f.lineNumber??"",f.sortOrder??"",f.partNo??"",f.quotePartKey??"",f.ruleLabel||f.kind||"Validation",f.level||"",f.message||""].map(m).join(",")})].join(`
`),u=new Blob([n],{type:"text/csv"}),g=URL.createObjectURL(u),c=document.createElement("a");c.href=g,c.download="qt-validation-issues.csv",c.click(),setTimeout(()=>URL.revokeObjectURL(g),1e3)}),t.appendChild(e),(document.body||document.documentElement).appendChild(t);try{t.setAttribute("tabindex","-1"),t.focus()}catch{}t.addEventListener("keydown",n=>{n.key==="Escape"&&t.remove()})}async function X(r){let t=await dt({mount:"nav"});if(!t?.registerButton)return()=>{};if(t.list?.()?.includes(C))return()=>{};let e=null;t.registerButton("left",{id:C,label:"Validate Lines",title:"Validate quote line rules",weight:130,onClick:async()=>{let a=S?.()||{},d=lt.core.hub.beginTask?.("Validating\u2026","info")||{done(){},error(){}};try{ft(),T();let i=await H(r,a),p=Array.isArray(i?.issues)?i.issues:[],n=p.length;try{for(let u of p){let g=u?.quotePartKey;if(!g)continue;let c=B(g);if(!c)continue;let f="qtv-row-fail",m=bt(u);c.classList.add(f),m&&c.classList.add(m)}}catch{}if(n===0)lt.core.hub.notify?.("Lines valid","success"),lt.core.hub.setStatus?.("All clear","success",{sticky:!1}),setBadgeCount?.(0),d.done?.("Valid");else{let u=p.map(s=>String(s?.level||"").toLowerCase()),g=u.some(s=>s==="error"||s==="fail"||s==="critical")||p.some(s=>/price\.(?:maxunitprice|minunitprice)/i.test(String(s?.kind||""))),c=!g&&u.some(s=>s==="warn"||s==="warning"),f=ct(p);try{g?(lt.core.hub.notify?.(`\u274C ${n} validation ${n===1?"issue":"issues"}`,"error"),lt.core.hub.setStatus?.(`\u274C ${n} issue${n===1?"":"s"} \u2014 ${f}`,"error",{sticky:!0}),setBadgeCount?.(n)):c?(lt.core.hub.notify?.(`\u26A0\uFE0F ${n} validation ${n===1?"warning":"warnings"}`,"warn"),lt.core.hub.setStatus?.(`\u26A0\uFE0F ${n} warning${n===1?"":"s"} \u2014 ${f}`,"warn",{sticky:!0}),setBadgeCount?.(n)):(lt.core.hub.notify?.(`${n} update${n===1?"":"s"} applied`,"info"),lt.core.hub.setStatus?.(`${n} update${n===1?"":"s"} \u2014 ${f}`,"info",{sticky:!0}),setBadgeCount?.(n))}catch{}if(pt(p),p.some(s=>String(s?.kind||"").includes("autoManageLtPartNoOnQuote")&&String(s?.level||"").toLowerCase()==="warning"&&s?.meta?.changed===!0))try{let s=await ut();lt.core?.hub?.notify?.(s?`Grid refreshed (${s})`:"Grid refresh attempted (reload may be needed)",s?"success":"info")}catch{lt.core?.hub?.notify?.("Grid refresh failed","warn")}d.done?.("Checked")}r.state=r.state||{},r.state.lastValidation=i}catch(i){lt.core.hub.error?.(`Validation error: ${i?.message||i}`,"error",{ms:6e3}),d.error?.("Error")}}}),e=t._shadow?.querySelector?.(`[data-id="${C}"]`);let o=G?.(()=>J(e));return J(e),()=>{o?.(),t?.remove?.(C)}}function J(r){if(!r)return;let t=S(),e=[];t.minUnitPrice!=null&&e.push(`\u2265${t.minUnitPrice}`),t.maxUnitPrice!=null&&e.push(`\u2264${t.maxUnitPrice}`),r.title=`Rules: ${e.join(", ")||"none"}`}function T(){if((()=>{try{let e=document.createElement("div");e.className="qtv-pill",document.body.appendChild(e);let o=getComputedStyle(e),a=!!o&&(o.borderRadius||"").includes("999px");return e.remove(),a}catch{return!1}})()||document.getElementById("qtv-styles"))return;let t=document.createElement("style");t.id="qtv-styles",t.textContent=`
/* Minimal scaffolding when theme.css isn't ready */
#qtv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.36); z-index: 100002; }
#qtv-modal {
  /* Local Monroe palette (independent of page tokens) */
  --brand-600: #8b0b04;
  --brand-700: #5c0a0a;
  --ok: #28a745;
  --warn: #ffc107;
  --err: #dc3545;

  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(900px,92vw);
}

.lt-card { background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.30); overflow: hidden; }
.lt-card__header { display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,.08); }
.lt-card__title { margin: 0; font: 600 16px/1.2 system-ui, Segoe UI, sans-serif; }
.lt-card__spacer { margin-left: auto; }
.lt-card__body { padding: 12px 16px; max-height: min(70vh,680px); overflow: auto; }

.lt-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid #d1d5db; border-radius:8px; background:#f9fafb; cursor:pointer; }
.lt-btn--primary { background: var(--brand-600); border-color: color-mix(in srgb, var(--brand-600) 70%, black); color:#fff; }
.lt-btn--primary:hover { background: var(--brand-700); }
.lt-btn--ghost { background:transparent; color: var(--brand-600); border-color: var(--brand-600); }
.lt-btn--ghost:hover { background: color-mix(in srgb, var(--brand-600) 12%, transparent); }

.lt-table { width:100%; border-collapse: separate; border-spacing: 0; font: 400 13px/1.35 system-ui, Segoe UI, sans-serif; }
.lt-table th { text-align:left; padding:8px 10px; background:#f3f4f6; border-bottom:1px solid #e5e7eb; position:sticky; top:0; }
.lt-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
.lt-table tbody tr:hover { background:#f8fafc; }

.qtv-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-weight:600; font-size:12px; border:1px solid transparent; }
.qtv-pill--error { background:#dc2626; color:#fff; }
.qtv-pill--warn  { background:#f59e0b; color:#111; }
.qtv-pill--info  { background:#3b82f6; color:#fff; }

/* Row highlights */
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }
`,document.head.appendChild(t)}function mt(r,t){try{let e=r?.[t];return typeof e=="function"?e():e}catch{return}}function gt(){let r=document.querySelector(".plex-grid");if(!r)return 0;let t=r.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"),e=0;for(let o of t){if(o.hasAttribute("data-quote-part-key")){e++;continue}try{let a=Y?.contextFor?.(o),d=a?.$data??a?.$root??null,i=typeof TMUtils?.getObsValue=="function"?TMUtils.getObsValue(d,"QuotePartKey"):mt(d,"QuotePartKey");i!=null&&i!==""&&Number(i)>0&&(o.setAttribute("data-quote-part-key",String(i)),e++)}catch{}}return e}function ft(){document.querySelectorAll(".qtv-row-fail").forEach(r=>{r.classList.remove("qtv-row-fail"),r.classList.remove("qtv-row-fail--price-maxunit"),r.classList.remove("qtv-row-fail--price-minunit")})}function B(r){let t=document.querySelector(".plex-grid");if(!t)return null;let e=t.querySelector(`[data-quote-part-key="${CSS.escape(String(r))}"]`);if(e||gt()>0&&(e=t.querySelector(`[data-quote-part-key="${CSS.escape(String(r))}"]`),e))return e.closest("tr, .k-grid-content tr, .plex-grid-row")||e;let o=t.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row");for(let a of o)if((a.textContent||"").trim().includes(String(r)))return a;return null}function bt(r){let t=String(r?.kind||"").toLowerCase();return t.includes("price.maxunitprice")?"qtv-row-fail--price-maxunit":t.includes("price.minunitprice")?"qtv-row-fail--price-minunit":""}var yt=!1;yt&&((unsafeWindow||window).QTV_DEBUG=(unsafeWindow||window).QTV_DEBUG||{},(unsafeWindow||window).QTV_DEBUG.tagStats=()=>{let r=document.querySelector(".plex-grid"),t=r?r.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"):[],e=r?r.querySelectorAll("[data-quote-part-key]"):[];return console.log("[QTV] rows:",t.length,"tagged:",e.length),{total:t.length,tagged:e.length}},(unsafeWindow||window).QTV_DEBUG.hiliTest=r=>{T();let t=B(r);return t&&(t.classList.add("qtv-row-fail","qtv-row-fail--price-maxunit"),t.scrollIntoView({block:"center",behavior:"smooth"})),!!t});TMUtils?.net?.ensureWatcher?.();var tt=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],L=null;function vt(){return TMUtils?.matchRoute?!!TMUtils.matchRoute(tt):tt.some(r=>r.test(location.pathname))}function wt(){return!0}async function R(){if(!vt())return et();wt()?L||(L=await X(TMUtils)):et()}function et(){L&&(L(),L=null)}R();TMUtils?.onUrlChange?.(R);window.addEventListener("hashchange",R);var rt=document.querySelector(".plex-wizard-page-list");rt&&new MutationObserver(R).observe(rt,{subtree:!0,attributes:!0,childList:!0});})();
