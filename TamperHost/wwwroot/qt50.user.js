// ==UserScript==
// @name        QT50
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.7.8
// @description Production build
// @match       https://lyntron.on.plex.com/SalesAndCRM*
// @match       https://lyntron.on.plex.com/SalesAndCrm*
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/lt-plex-tm-utils.user.js?v=3.7.8
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/lt-plex-auth.user.js?v=3.7.8
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/lt-ui-hub.js?v=3.7.8
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/lt-data-core.user.js?v=3.7.8
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/lt-core.user.js?v=3.7.8
// @resource     THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/qt50.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.7.8/wwwroot/qt50.user.js
// ==/UserScript==
(()=>{var rt={wizardTargetPage:"Part Summary",settingsKey:"qt50_settings_v1",toastMs:3500},vt=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko,A=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],ot=!!TMUtils.matchRoute?.(A),f={enabled:"qtv.enabled",autoManageLtPartNoOnQuote:"qtv.autoManageLtPartNoOnQuote",minUnitPrice:"qtv.minUnitPrice",maxUnitPrice:"qtv.maxUnitPrice"},V={[f.enabled]:!0,[f.autoManageLtPartNoOnQuote]:!0,[f.minUnitPrice]:0,[f.maxUnitPrice]:10},S=t=>{let n=GM_getValue(t,V[t]);return n===void 0?V[t]:n},N=(t,n)=>{GM_setValue(t,n),W()};function U(){return{enabled:S(f.enabled),autoManageLtPartNoOnQuote:S(f.autoManageLtPartNoOnQuote),minUnitPrice:S(f.minUnitPrice),maxUnitPrice:S(f.maxUnitPrice)}}function F(t){if(typeof t!="function")return()=>{};let n=()=>t(U());return window.addEventListener("LT:QTV:SettingsChanged",n),()=>window.removeEventListener("LT:QTV:SettingsChanged",n)}function W(){try{window.dispatchEvent(new CustomEvent("LT:QTV:SettingsChanged",{detail:U()}))}catch{}}GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings",G);ot&&($(),TMUtils?.onUrlChange?.($),setTimeout($,500));async function $(){let n=TMUtils.matchRoute?.(A)&&(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().toLowerCase()===rt.wizardTargetPage.toLowerCase(),e=await(async function(a={mount:"nav"}){for(let u=0;u<50;u++){let i=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof i=="function")try{let g=await i(a);if(g)return g}catch{}await new Promise(g=>setTimeout(g,100))}return null})();if(!e?.registerButton)return;let r="qt50-settings",o=e.list?.()?.includes(r);n&&!o?e.registerButton("right",{id:r,label:"Validation \u2699\uFE0E",title:"Open Quote Validation settings",weight:30,onClick:G}):!n&&o&&e.remove?.(r)}function G(){let t=document.createElement("div");t.id="lt-qtv-overlay",Object.assign(t.style,{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",zIndex:100002});let n=document.createElement("div");Object.assign(n.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",padding:"18px",borderRadius:"12px",boxShadow:"0 10px 30px rgba(0,0,0,.30)",fontFamily:"system-ui, Segoe UI, sans-serif",width:"420px",maxWidth:"92vw"}),t.addEventListener("keydown",e=>{e.key==="Escape"&&t.remove()}),t.tabIndex=-1,t.addEventListener("click",e=>{e.target===t&&t.remove()}),n.addEventListener("click",e=>e.stopPropagation()),n.innerHTML=`
    <h3 style="margin:0 0 10px 0;">Quote Validation Settings</h3>
    <div style="font-size:12px; opacity:.75; margin-bottom:10px;">Applies on the Quote Wizard \u2192 Part Summary page.</div>

    <label style="display:block; margin:10px 0;">
      <input type="checkbox" id="qtv-enabled"> Enable validations
    </label>

    <div style="border-top:1px solid #eee; margin:8px 0 12px;"></div>

    <label title="If Part Status is Quote, the Lyn-Tron Part No is controlled automatically."
           style="display:block; margin:8px 0;">
      <input type="checkbox" id="qtv-autoManageLtPartNoOnQuote">
      Auto-manage Lyn-Tron Part No when Part status is \u201CQuote\u201D.
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
      <button id="qtv-export" class="btn btn-default">Export</button>
      <label class="btn btn-default">Import <input id="qtv-import" type="file" accept="application/json" style="display:none;"></label>
      <span style="flex:1"></span>
      <button id="qtv-reset" class="btn btn-default" style="border-color:#f59e0b; color:#b45309;">Reset</button>
      <button id="qtv-close" class="btn btn-primary" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
    </div>
  `,n.querySelector("#qtv-enabled").checked=S(f.enabled),n.querySelector("#qtv-autoManageLtPartNoOnQuote").checked=S(f.autoManageLtPartNoOnQuote),Q(n.querySelector("#qtv-min"),S(f.minUnitPrice)),Q(n.querySelector("#qtv-max"),S(f.maxUnitPrice)),n.querySelector("#qtv-enabled")?.addEventListener("change",e=>N(f.enabled,!!e.target.checked)),n.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change",e=>N(f.autoManageLtPartNoOnQuote,!!e.target.checked)),n.querySelector("#qtv-min")?.addEventListener("change",e=>{let r=D(e.target.value);N(f.minUnitPrice,r),Q(e.target,r)}),n.querySelector("#qtv-max")?.addEventListener("change",e=>{let r=D(e.target.value);N(f.maxUnitPrice,r),Q(e.target,r)}),n.querySelector("#qtv-close")?.addEventListener("click",()=>t.remove()),n.querySelector("#qtv-reset")?.addEventListener("click",()=>{Object.keys(V).forEach(e=>GM_setValue(e,V[e])),W(),t.remove(),TMUtils.toast?.("Validation settings reset.","info",1800)}),n.querySelector("#qtv-export")?.addEventListener("click",()=>{let e=new Blob([JSON.stringify(U(),null,2)],{type:"application/json"}),r=URL.createObjectURL(e),o=document.createElement("a");o.href=r,o.download="qt-validation-settings.json",o.click(),setTimeout(()=>URL.revokeObjectURL(r),1e3)}),n.querySelector("#qtv-import")?.addEventListener("change",async e=>{try{let r=e.target.files?.[0];if(!r)return;let o=JSON.parse(await r.text());if(o&&typeof o=="object")"enabled"in o&&N(f.enabled,!!o.enabled),"autoManageLtPartNoOnQuote"in o&&N(f.autoManageLtPartNoOnQuote,!!o.autoManageLtPartNoOnQuote),"minUnitPrice"in o&&N(f.minUnitPrice,B(o.minUnitPrice)),"maxUnitPrice"in o&&N(f.maxUnitPrice,B(o.maxUnitPrice)),t.remove(),TMUtils.toast?.("Validation settings imported.","success",1800);else throw new Error("Invalid JSON.")}catch(r){TMUtils.toast?.(`Import failed: ${r?.message||r}`,"error",3e3)}}),t.appendChild(n),(document.body||document.documentElement).appendChild(t),t.focus()}function D(t){let n=Number(String(t).trim());return Number.isFinite(n)?n:null}function B(t){let n=Number(t);return Number.isFinite(n)?n:null}function Q(t,n){t.value=n==null?"":String(n)}async function E(t,n,e){let r=[];if(!n?.autoManageLtPartNoOnQuote)return r;let o=typeof unsafeWindow<"u"?unsafeWindow:window,l=o.lt||{},a=m=>{let v=l?.core?.auth?.withFreshAuth;return typeof v=="function"?v(m):m()},u=l.core?.data?.makeFlatScopedRepo?l.core.data.makeFlatScopedRepo({ns:"QT",entity:"quote",legacyEntity:"QuoteHeader"}):null,i=3156,g=13509;async function y(){let m=typeof o.getPlexFacade=="function"?await o.getPlexFacade():l?.core?.plex;if(!m)throw new Error("Plex facade not available");return m}function p(){try{return(sessionStorage.getItem("Quote_No")||"").trim()}catch{return""}}async function b(m){let v=Number(m);if(!v||!Number.isFinite(v)||v<=0)return p();try{if(!u)return p();let{repo:h}=u.use(v);await h.ensureFromLegacyIfMissing?.();let x=await h.getHeader?.();if(!x?.Quote_No){let P=await y();if(P?.dsRows){let s=await a(()=>P.dsRows(i,{Quote_Key:String(v)})),d=(Array.isArray(s)&&s.length?s[0]:null)?.Quote_No??null;d!=null&&(await h.patchHeader?.({Quote_Key:v,Quote_No:d,Quote_Header_Fetched_At:Date.now()}),x=await h.getHeader?.())}}let q=x?.Quote_No;return q==null?p():String(q).trim()}catch{return p()}}for(let[m,v]of t.groupsByQuotePart.entries()){let h=Array.isArray(v)&&v.length?v[0]:null,x=e.get(h,"QuoteKey",{number:!0}),q=await b(x),P=new Map;for(let s of v){let c=e.get(s,"PartKey",{number:!0});Number.isFinite(c)&&!P.has(c)&&P.set(c,s)}for(let s of P.values()){if(String(e.get(s,"PartStatus",{trim:!0})||"").toLowerCase()!=="quote")continue;let d=x??e.get(s,"QuoteKey",{number:!0}),w=e.get(s,"PartKey",{number:!0}),k=String(e.get(s,"PartNo",{trim:!0})??""),K=!!q?`${q}_`:"_";if(k.startsWith(K)){r.push({kind:"part.autoManageLtPartNoOnQuote",level:"info",quotePartKey:m,message:"No change: Part_No already managed.",meta:{status:"Quote",quoteKey:d,partKey:w,partNo:k,ds:g,changed:!1}});continue}let nt=`${K}${k}`,z={Quote_Key:String(d??""),Part_Key:String(w??""),Part_No:String(nt??""),Name:"auto managed",Update_Part:!0};try{let _=await y();if(!_?.dsRows)throw new Error("plex.dsRows unavailable");await a(()=>_.dsRows(g,z)),r.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:m,message:`Part_No \u201C${z.Part_No}\u201D auto managed.`,meta:{status:"Quote",quoteKey:d,partKey:w,partNo:k,ds:g,changed:!0}})}catch(_){r.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:m,message:`DS ${g} failed: ${_?.message||_}`,meta:{status:"Quote",quoteKey:d,partKey:w,partNo:k,ds:g,changed:!1}})}}}return r}E.meta={id:"autoManageLtPartNoOnQuote",label:"Auto-Manage LT Part No"};function O(t,n,e){let r=Number(n.minUnitPrice);if(!Number.isFinite(r))return[];let o=[],l=a=>{if(a==null)return NaN;let u=String(typeof a=="function"?a():a).trim();return u?Number(u.replace(/[^\d.-]/g,"")):NaN};for(let[a,u]of t.groupsByQuotePart.entries())for(let i of u){let g=e.get(i,"Quantity")??"?",y=e.get(i,"RvCustomizedUnitPrice")??e.get(i,"RvUnitPriceCopy")??e.get(i,"UnitPrice"),p=l(y);if(Number.isFinite(p)&&p<r){let b=m=>Number.isFinite(m)?m.toLocaleString("en-US",{maximumFractionDigits:6}):String(m);o.push({kind:"price.minUnitPrice",level:"error",quotePartKey:a,message:`Unit Price ${b(p)} < Min ${b(r)}`,meta:{unitRaw:y,unitNum:p,min:r}})}}return o}O.meta={id:"minUnitPrice",label:"Min Unit Price"};function M(t,n,e){let r=Number(n.maxUnitPrice);if(!Number.isFinite(r))return[];let o=[],l=a=>{if(a==null)return NaN;let u=String(typeof a=="function"?a():a).trim();return u?Number(u.replace(/[^\d.-]/g,"")):NaN};for(let[a,u]of t.groupsByQuotePart.entries())for(let i of u){let g=e.get(i,"Quantity")??"?",y=e.get(i,"RvCustomizedUnitPrice")??e.get(i,"RvUnitPriceCopy")??e.get(i,"UnitPrice"),p=l(y);if(Number.isFinite(p)&&p>r){let b=m=>Number.isFinite(m)?m.toLocaleString("en-US",{maximumFractionDigits:6}):String(m);o.push({kind:"price.maxUnitPrice",level:"error",quotePartKey:a,message:`Unit Price ${b(p)} > Max ${b(r)}`,meta:{unitRaw:y,unitNum:p,max:r}})}}return o}M.meta={id:"maxUnitPrice",label:"Max Unit Price"};var j=[E,M,O];async function I(t,n){await t.waitForModelAsync(".plex-grid",{requireKo:!0,timeoutMs:12e3});let e=typeof unsafeWindow<"u"?unsafeWindow.ko:window.ko,r=document.querySelector(".plex-grid"),o=r?e?.dataFor?.(r):null,l=o?.datasource?.raw||o?.datasource?.data||[],a=new Map;for(let s of l){let c=t.getObsValue(s,"QuotePartKey")??-1;(a.get(c)||a.set(c,[]).get(c)).push(s)}let u=new Map;for(let[s,c]of a.entries()){let d=c.find(w=>t.getObsValue(w,"IsUniqueQuotePart")===1)||c[0];u.set(s,d)}let i={rows:l,groupsByQuotePart:a,primaryByQuotePart:u,lastForm:t.net?.getLastAddUpdateForm?.(),lastResult:t.net?.getLastAddUpdate?.()},g={get:(s,c,d)=>t.getObsValue(s,c,d)},p=(await Promise.all(j.map(s=>s(i,n,g)))).flat(),b=p.every(s=>s.level!=="error"),m=s=>Number(String(s??"").replace(/[^\d.-]/g,"")),v=s=>{if(s?.meta?.label)return s.meta.label;if(s?.kind){let c=String(s.kind),d=c.split(".").pop();return d?d.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,w=>w.toUpperCase()):c}return"Validation"},h=new Map;for(let s=0;s<i.rows.length;s++){let c=i.rows[s],d=s+1,w=g.get(c,"PartNo",{trim:!0})??"";h.set(c,{lineNumber:d,partNo:w})}let x=new Map;for(let[s,c]of i.primaryByQuotePart.entries()){let d=h.get(c)||{lineNumber:null,partNo:g.get(c,"PartNo",{trim:!0})??""};x.set(s,d)}let q=new Map;for(let s=0;s<i.rows.length;s++){let c=i.rows[s],d=s+1,w=g.get(c,"SortOrder",{number:!0});q.set(d,w)}let P=p.map(s=>{let c=s.quotePartKey??-1,d=x.get(c)||{lineNumber:null,partNo:""};return{...s,lineNumber:d.lineNumber,partNo:d.partNo,ruleLabel:v(s),sortOrder:q.get(d.lineNumber??-1)}});return t.state=t.state||{},t.state.lastValidation={at:Date.now(),ok:b,issues:P},{ok:b,issues:P}}var J=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko;function at(t){try{let e=(Array.isArray(t)?t:[]).reduce((a,u)=>{let i=String(u?.level||"info").toLowerCase();return a[i]=(a[i]||0)+1,u?.quotePartKey!=null&&a.parts.add(u.quotePartKey),a},{error:0,warning:0,info:0,parts:new Set}),r=e.parts.size,o=[];return e.error&&o.push(`${e.error} error${e.error===1?"":"s"}`),e.warning&&o.push(`${e.warning} warning${e.warning===1?"":"s"}`),e.info&&o.push(`${e.info} info`),`${o.join(", ")||"updates"} across ${r||0} part${r===1?"":"s"}`}catch{return""}}async function it(){try{let t=document.querySelector(".plex-grid"),n=t&&J?.dataFor?.(t);if(typeof n?.datasource?.read=="function")return await n.datasource.read(),"ds.read";if(typeof n?.refresh=="function")return n.refresh(),"vm.refresh"}catch{}try{let t=unsafeWindow?.plex?.currentPage?.QuoteWizard;if(t?.navigatePage){let n=typeof t.activePage=="function"?t.activePage():t.activePage;return t.navigatePage(n),"wiz.navigatePage"}}catch{}return null}var R="qt50-validate";async function st(t={mount:"nav"}){for(let n=0;n<50;n++){let e=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof e=="function")try{let r=await e(t);if(r)return r}catch{}await new Promise(r=>setTimeout(r,100))}return null}function ut(t=[]){C();let n=t.map(o=>{let l=(o.level||"").toLowerCase(),a=`<span class="qtv-pill" style="border-color:${l==="error"?"#fca5a5":"#cbd5e1"}; color:${l==="error"?"#b91c1c":"#334155"}">${l||"info"}</span>`,u=o.message||"(no message)",i=o.ruleLabel||o.kind||"Validation";return`
        <tr data-qpk="${o.quotePartKey??""}" data-rule="${String(o.kind||"")}">
          <td>${o.sortOrder??""}</td>
          <td>${o.partNo??""}</td>
          <td>${i}</td>
          <td>${a}</td>
          <td>${u}</td>
        </tr>`}).join(""),e=document.createElement("div");e.id="qtv-modal-overlay";let r=document.createElement("div");r.id="qtv-modal",r.innerHTML=`
  <div class="qtv-hd">
    <h3>Validation Details</h3>
    <div class="qtv-actions">
      <button class="btn btn-default" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="btn btn-primary" id="qtv-close" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Close</button>
    </div>
  </div>
  <div class="qtv-bd">
    <table aria-label="Validation Issues">
      <thead>
  <tr>
    <th>Sort&nbsp;Order</th>
    <th>Part #</th>
    <th>Rule</th>
    <th>Level</th>
    <th>Reason</th>
  </tr>
</thead>
      <tbody>${n||'<tr><td colspan="5" style="opacity:.7; padding:12px;">No issues.</td></tr>'}</tbody>
    </table>
  </div>
`,r.querySelector("#qtv-close")?.addEventListener("click",()=>e.remove()),e.addEventListener("click",o=>{o.target===e&&e.remove()}),r.querySelector("tbody")?.addEventListener("click",o=>{let l=o.target.closest("tr");if(!l)return;let a=l.getAttribute("data-qpk");if(!a)return;C();let u=Z(a);u&&(document.querySelectorAll(".qtv-row-fail").forEach(i=>i.classList.remove("qtv-row-fail")),u.classList.add("qtv-row-fail"),u.scrollIntoView({block:"center",behavior:"smooth"}))}),r.querySelector("#qtv-export-csv")?.addEventListener("click",()=>{let o=[["Line","SortOrder","PartNo","QuotePartKey","Rule","Level","Reason"].join(","),...t.map(i=>{let g=y=>{let p=String(y??"");return/[",\n]/.test(p)?`"${p.replace(/"/g,'""')}"`:p};return[i.lineNumber??"",i.sortOrder??"",i.partNo??"",i.quotePartKey??"",i.ruleLabel||i.kind||"Validation",i.level||"",i.message||""].map(g).join(",")})].join(`
`),l=new Blob([o],{type:"text/csv"}),a=URL.createObjectURL(l),u=document.createElement("a");u.href=a,u.download="qt-validation-issues.csv",u.click(),setTimeout(()=>URL.revokeObjectURL(a),1e3)}),e.appendChild(r),(document.body||document.documentElement).appendChild(e)}async function Y(t){let n=await st({mount:"nav"});if(!n?.registerButton)return()=>{};if(n.list?.()?.includes(R))return()=>{};let e=null;n.registerButton("left",{id:R,label:"Validate Lines",title:"Validate quote line rules",weight:130,onClick:async()=>{let o=U?.()||{},l=lt.core.hub.beginTask?.("Validating\u2026","info")||{done(){},error(){}};try{dt();let a=await I(t,o),u=Array.isArray(a?.issues)?a.issues:[],i=u.length,g=u.some(y=>String(y.level||"").toLowerCase()==="error");if(i===0)lt.core.hub.notify?.("\u2705 Lines valid","success",{ms:1800}),l.done?.("Valid");else{let y=at(u);if(g?(lt.core.hub.notify?.(`\u274C ${i} validation ${i===1?"issue":"issues"}`,"error",{ms:6500}),lt.core.hub.setStatus?.(`\u274C ${i} issue${i===1?"":"s"} \u2014 ${y}`,"error",{sticky:!0})):(lt.core.hub.notify?.(`\u2139\uFE0F ${i} update${i===1?"":"s"} applied`,"info",{ms:3500}),lt.core.hub.setStatus?.(`\u2139\uFE0F ${i} update${i===1?"":"s"} \u2014 ${y}`,"info",{sticky:!0})),ut(u),u.some(b=>String(b?.kind||"").includes("autoManageLtPartNoOnQuote")&&String(b?.level||"").toLowerCase()==="warning"&&b?.meta?.changed===!0))try{let b=await it();lt.core?.hub?.notify?.(b?`Grid refreshed (${b})`:"Grid refresh attempted (reload may be needed)",b?"success":"info",{ms:2500})}catch{lt.core?.hub?.notify?.("Grid refresh failed","warn",{ms:3e3})}}t.state=t.state||{},t.state.lastValidation=a}catch(a){lt.core.hub.error?.(`Validation error: ${a?.message||a}`,"error",{ms:6e3}),l.error?.("Error")}}}),e=n._shadow?.querySelector?.(`[data-id="${R}"]`);let r=F?.(()=>H(e));return H(e),()=>{r?.(),n?.remove?.(R)}}function H(t){if(!t)return;let n=U(),e=[];n.minUnitPrice!=null&&e.push(`\u2265${n.minUnitPrice}`),n.maxUnitPrice!=null&&e.push(`\u2264${n.maxUnitPrice}`),t.title=`Rules: ${e.join(", ")||"none"}`}function C(){if(document.getElementById("qtv-styles"))return;let t=document.createElement("style");t.id="qtv-styles",t.textContent=`
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }  /* red-ish */
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }  /* blue-ish */

/* Modal shell */
#qtv-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.38); z-index:100003; }
#qtv-modal {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  background:#fff; width:min(960px, 94vw); max-height:80vh; overflow:hidden;
  border-radius:12px; box-shadow:0 18px 40px rgba(0,0,0,.28);
  font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

/* Header */
#qtv-modal .qtv-hd {
  display:flex; align-items:center; gap:12px;
  padding:14px 16px; border-bottom:1px solid #eaeaea;
  background: linear-gradient(180deg, #fbfbfb 0%, #f7f7f7 100%);
}
#qtv-modal .qtv-hd h3 { margin:0; font-size:16px; font-weight:600; color:#0f172a; }
#qtv-modal .qtv-actions { margin-left:auto; display:flex; gap:8px; }
#qtv-modal .qtv-actions .btn { border-radius:8px; line-height:1.3; padding:6px 10px; }

/* Body */
#qtv-modal .qtv-bd { padding:10px 14px 14px; overflow:auto; max-height:calc(80vh - 56px); }

/* Table */
#qtv-modal table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
#qtv-modal thead th {
  position: sticky; top: 0; z-index: 1;
  background:#fff; border-bottom:1px solid #eaeaea; padding:8px 10px; text-align:left; color:#475569;
}
#qtv-modal tbody td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
#qtv-modal tbody tr:nth-child(odd) { background:#fcfdff; }
#qtv-modal tbody tr:hover { background:#f1f5f9; cursor:pointer; }
#qtv-modal td:nth-child(1) { width:100px; }           /* Sort Order */
#qtv-modal td:nth-child(2) { width:220px; }           /* Part #    */
#qtv-modal td:last-child { word-break: break-word; }  /* Reason    */

/* Pills */
#qtv-modal .qtv-pill { display:inline-block; padding:2px 8px; border:1px solid #e2e8f0; border-radius:999px; font-size:12px; }
`,document.head.appendChild(t)}function ct(){let t=document.querySelector(".plex-grid");if(!t)return 0;let n=t.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"),e=0;for(let r of n){if(r.hasAttribute("data-quote-part-key")){e++;continue}try{let o=J?.contextFor?.(r),l=o?.$data??o?.$root??null,a=TMUtils.getObsValue?.(l,"QuotePartKey");a!=null&&a!==""&&Number(a)>0&&(r.setAttribute("data-quote-part-key",String(a)),e++)}catch{}}return e}function dt(){document.querySelectorAll(".qtv-row-fail").forEach(t=>{t.classList.remove("qtv-row-fail"),t.classList.remove("qtv-row-fail--price-maxunit"),t.classList.remove("qtv-row-fail--price-minunit")})}function Z(t){let n=document.querySelector(".plex-grid");if(!n)return null;let e=n.querySelector(`[data-quote-part-key="${CSS.escape(String(t))}"]`);if(e||ct()>0&&(e=n.querySelector(`[data-quote-part-key="${CSS.escape(String(t))}"]`),e))return e.closest("tr, .k-grid-content tr, .plex-grid-row")||e;let r=n.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row");for(let o of r)if((o.textContent||"").trim().includes(String(t)))return o;return null}var pt=!1;pt&&((unsafeWindow||window).QTV_DEBUG=(unsafeWindow||window).QTV_DEBUG||{},(unsafeWindow||window).QTV_DEBUG.tagStats=()=>{let t=document.querySelector(".plex-grid"),n=t?t.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"):[],e=t?t.querySelectorAll("[data-quote-part-key]"):[];return console.log("[QTV] rows:",n.length,"tagged:",e.length),{total:n.length,tagged:e.length}},(unsafeWindow||window).QTV_DEBUG.hiliTest=t=>{C();let n=Z(t);return n&&(n.classList.add("qtv-row-fail","qtv-row-fail--price-maxunit"),n.scrollIntoView({block:"center",behavior:"smooth"})),!!n});TMUtils?.net?.ensureWatcher?.();var X=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],L=null;function gt(){return TMUtils?.matchRoute?!!TMUtils.matchRoute(X):X.some(t=>t.test(location.pathname))}function mt(){return(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," ")}function ft(){return/^part\s*summary$/i.test(mt())}async function T(){if(!gt())return tt();ft()?L||(L=await Y(TMUtils)):tt()}function tt(){L&&(L(),L=null)}T();TMUtils?.onUrlChange?.(T);window.addEventListener("hashchange",T);var et=document.querySelector(".plex-wizard-page-list");et&&new MutationObserver(T).observe(et,{subtree:!0,attributes:!0,childList:!0});})();
