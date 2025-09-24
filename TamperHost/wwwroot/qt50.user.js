// ==UserScript==
// @name        QT50
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.8.100
// @description Production build
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=3.8.100
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/lt-plex-auth.user.js?v=3.8.100
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/lt-ui-hub.js?v=3.8.100
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/lt-data-core.user.js?v=3.8.100
// @require      https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/lt-core.user.js?v=3.8.100
// @resource     THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v3.8.100/TamperHost/wwwroot/theme.css
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
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/qt50.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/qt50.user.js
// ==/UserScript==

(()=>{var xt=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko,W=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],rt=!!TMUtils.matchRoute?.(W),b={enabled:"qt50.enabled",autoManageLtPartNoOnQuote:"qt50.autoManageLtPartNoOnQuote",minUnitPrice:"qt50.minUnitPrice",maxUnitPrice:"qt50.maxUnitPrice"},ot={enabled:"qtv.enabled",autoManageLtPartNoOnQuote:"qtv.autoManageLtPartNoOnQuote",minUnitPrice:"qtv.minUnitPrice",maxUnitPrice:"qtv.maxUnitPrice"},C={[b.enabled]:!0,[b.autoManageLtPartNoOnQuote]:!0,[b.minUnitPrice]:0,[b.maxUnitPrice]:10};function at(e){let n=GM_getValue(e);if(n!==void 0)return n;let t=Object.values(ot).find(r=>r.endsWith(e.split(".").pop())),o=t?GM_getValue(t):void 0;return o!==void 0?o:void 0}var S=e=>{let n=at(e);return n===void 0?C[e]:n},N=(e,n)=>{GM_setValue(e,n),z()};function U(){return{enabled:S(b.enabled),autoManageLtPartNoOnQuote:S(b.autoManageLtPartNoOnQuote),minUnitPrice:S(b.minUnitPrice),maxUnitPrice:S(b.maxUnitPrice)}}function G(e){if(typeof e!="function")return()=>{};let n=()=>e(U());return window.addEventListener("LT:QTV:SettingsChanged",n),()=>window.removeEventListener("LT:QTV:SettingsChanged",n)}function z(){try{window.dispatchEvent(new CustomEvent("LT:QTV:SettingsChanged",{detail:U()}))}catch{}}GM_registerMenuCommand?.("\u2699\uFE0F Open QT Validation Settings",I);rt&&($(),TMUtils?.onUrlChange?.($),setTimeout($,500));async function $(){let e=TMUtils.matchRoute?.(W),t=(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," "),o=e&&/^part\s*summary$/i.test(t),r=await(async function(a={mount:"nav"}){for(let f=0;f<50;f++){let y=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof y=="function")try{let d=await y(a);if(d)return d}catch{}await new Promise(d=>setTimeout(d,100))}return null})();if(!r?.registerButton)return;let c="qt50-settings",i=r.list?.()?.includes(c);o&&!i?r.registerButton("right",{id:c,label:"Validation \u2699\uFE0E",title:"Open Quote Validation settings",weight:30,onClick:I}):!o&&i&&r.remove?.(c)}function I(){let e=document.createElement("div");e.id="lt-qtv-overlay",Object.assign(e.style,{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",zIndex:100002});let n=document.createElement("div");Object.assign(n.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",padding:"18px",borderRadius:"12px",boxShadow:"0 10px 30px rgba(0,0,0,.30)",fontFamily:"system-ui, Segoe UI, sans-serif",width:"420px",maxWidth:"92vw"}),e.addEventListener("keydown",t=>{t.key==="Escape"&&e.remove()}),e.tabIndex=-1,e.addEventListener("click",t=>{t.target===e&&e.remove()}),n.addEventListener("click",t=>t.stopPropagation()),n.innerHTML=`
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
      <button id="qtv-close" class="btn btn-primary" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Save &amp; Close</button>
    </div>
  `,n.querySelector("#qtv-enabled").checked=S(b.enabled),n.querySelector("#qtv-autoManageLtPartNoOnQuote").checked=S(b.autoManageLtPartNoOnQuote),Q(n.querySelector("#qtv-min"),S(b.minUnitPrice)),Q(n.querySelector("#qtv-max"),S(b.maxUnitPrice)),n.querySelector("#qtv-enabled")?.addEventListener("change",t=>N(b.enabled,!!t.target.checked)),n.querySelector("#qtv-autoManageLtPartNoOnQuote")?.addEventListener("change",t=>N(b.autoManageLtPartNoOnQuote,!!t.target.checked)),n.querySelector("#qtv-min")?.addEventListener("change",t=>{let o=D(t.target.value);N(b.minUnitPrice,o),Q(t.target,o)}),n.querySelector("#qtv-max")?.addEventListener("change",t=>{let o=D(t.target.value);N(b.maxUnitPrice,o),Q(t.target,o)}),n.querySelector("#qtv-close")?.addEventListener("click",()=>{e.remove(),TMUtils.toast?.("Validation settings saved.","success",1600)}),n.querySelector("#qtv-reset")?.addEventListener("click",()=>{Object.keys(C).forEach(t=>GM_setValue(t,C[t])),z(),e.remove(),TMUtils.toast?.("Validation settings reset.","info",1800)}),n.querySelector("#qtv-export")?.addEventListener("click",()=>{let t=new Blob([JSON.stringify(U(),null,2)],{type:"application/json"}),o=URL.createObjectURL(t),r=document.createElement("a");r.href=o,r.download="qt-validation-settings.json",r.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}),n.querySelector("#qtv-import")?.addEventListener("change",async t=>{try{let o=t.target.files?.[0];if(!o)return;let r=JSON.parse(await o.text());if(r&&typeof r=="object")"enabled"in r&&N(b.enabled,!!r.enabled),"autoManageLtPartNoOnQuote"in r&&N(b.autoManageLtPartNoOnQuote,!!r.autoManageLtPartNoOnQuote),"minUnitPrice"in r&&N(b.minUnitPrice,A(r.minUnitPrice)),"maxUnitPrice"in r&&N(b.maxUnitPrice,A(r.maxUnitPrice)),e.remove(),TMUtils.toast?.("Validation settings imported.","success",1800);else throw new Error("Invalid JSON.")}catch(o){TMUtils.toast?.(`Import failed: ${o?.message||o}`,"error",3e3)}}),e.appendChild(n),(document.body||document.documentElement).appendChild(e),e.focus()}function D(e){let n=Number(String(e).trim());return Number.isFinite(n)?n:null}function A(e){let n=Number(e);return Number.isFinite(n)?n:null}function Q(e,n){e.value=n==null?"":String(n)}async function E(e,n,t){let o=[];if(!n?.autoManageLtPartNoOnQuote)return o;let r=typeof unsafeWindow<"u"?unsafeWindow:window,c=r.lt||{},i=g=>{let l=c?.core?.auth?.withFreshAuth;return typeof l=="function"?l(g):g()},u=c.core?.data?.makeFlatScopedRepo?c.core.data.makeFlatScopedRepo({ns:"QT",entity:"quote",legacyEntity:"QuoteHeader"}):null,a=3156,f=13509;async function y(){let g=typeof r.getPlexFacade=="function"?await r.getPlexFacade():c?.core?.plex;if(!g)throw new Error("Plex facade not available");return g}function d(){try{return(sessionStorage.getItem("Quote_No")||"").trim()}catch{return""}}async function v(g){let l=Number(g);if(!l||!Number.isFinite(l)||l<=0)return d();try{if(!u)return d();let{repo:h}=u.use(l);await h.ensureFromLegacyIfMissing?.();let x=await h.getHeader?.();if(!x?.Quote_No){let P=await y();if(P?.dsRows){let s=await i(()=>P.dsRows(a,{Quote_Key:String(l)})),m=(Array.isArray(s)&&s.length?s[0]:null)?.Quote_No??null;m!=null&&(await h.patchHeader?.({Quote_Key:l,Quote_No:m,Quote_Header_Fetched_At:Date.now()}),x=await h.getHeader?.())}}let q=x?.Quote_No;return q==null?d():String(q).trim()}catch{return d()}}for(let[g,l]of e.groupsByQuotePart.entries()){let h=Array.isArray(l)&&l.length?l[0]:null,x=t.get(h,"QuoteKey",{number:!0}),q=await v(x),P=new Map;for(let s of l){let p=t.get(s,"PartKey",{number:!0});Number.isFinite(p)&&!P.has(p)&&P.set(p,s)}for(let s of P.values()){if(String(t.get(s,"PartStatus",{trim:!0})||"").toLowerCase()!=="quote")continue;let m=x??t.get(s,"QuoteKey",{number:!0}),w=t.get(s,"PartKey",{number:!0}),k=String(t.get(s,"PartNo",{trim:!0})??""),B=!!q?`${q}_`:"_";if(k.startsWith(B)){o.push({kind:"part.autoManageLtPartNoOnQuote",level:"info",quotePartKey:g,message:"No change: Part_No already managed.",meta:{status:"Quote",quoteKey:m,partKey:w,partNo:k,ds:f,changed:!1}});continue}let nt=`${B}${k}`,F={Quote_Key:String(m??""),Part_Key:String(w??""),Part_No:String(nt??""),Update_Part:!0};try{let L=await y();if(!L?.dsRows)throw new Error("plex.dsRows unavailable");await i(()=>L.dsRows(f,F)),o.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:g,message:`Part_No \u201C${F.Part_No}\u201D auto managed.`,meta:{status:"Quote",quoteKey:m,partKey:w,partNo:k,ds:f,changed:!0}})}catch(L){o.push({kind:"part.autoManageLtPartNoOnQuote",level:"warning",quotePartKey:g,message:`DS ${f} failed: ${L?.message||L}`,meta:{status:"Quote",quoteKey:m,partKey:w,partNo:k,ds:f,changed:!1}})}}}return o}E.meta={id:"autoManageLtPartNoOnQuote",label:"Auto-Manage LT Part No"};function V(e,n,t){let o=Number(n.minUnitPrice);if(!Number.isFinite(o))return[];let r=[],c=i=>{if(i==null)return NaN;let u=String(typeof i=="function"?i():i).trim();return u?Number(u.replace(/[^\d.-]/g,"")):NaN};for(let[i,u]of e.groupsByQuotePart.entries())for(let a of u){let f=t.get(a,"Quantity")??"?",y=t.get(a,"RvCustomizedUnitPrice")??t.get(a,"RvUnitPriceCopy")??t.get(a,"UnitPrice"),d=c(y);if(Number.isFinite(d)&&d<o){let v=g=>Number.isFinite(g)?g.toLocaleString("en-US",{maximumFractionDigits:6}):String(g);r.push({kind:"price.minUnitPrice",level:"error",quotePartKey:i,message:`Unit Price ${v(d)} < Min ${v(o)}`,meta:{unitRaw:y,unitNum:d,min:o}})}}return r}V.meta={id:"minUnitPrice",label:"Min Unit Price"};function O(e,n,t){let o=Number(n.maxUnitPrice);if(!Number.isFinite(o))return[];let r=[],c=i=>{if(i==null)return NaN;let u=String(typeof i=="function"?i():i).trim();return u?Number(u.replace(/[^\d.-]/g,"")):NaN};for(let[i,u]of e.groupsByQuotePart.entries())for(let a of u){let f=t.get(a,"Quantity")??"?",y=t.get(a,"RvCustomizedUnitPrice")??t.get(a,"RvUnitPriceCopy")??t.get(a,"UnitPrice"),d=c(y);if(Number.isFinite(d)&&d>o){let v=g=>Number.isFinite(g)?g.toLocaleString("en-US",{maximumFractionDigits:6}):String(g);r.push({kind:"price.maxUnitPrice",level:"error",quotePartKey:i,message:`Unit Price ${v(d)} > Max ${v(o)}`,meta:{unitRaw:y,unitNum:d,max:o}})}}return r}O.meta={id:"maxUnitPrice",label:"Max Unit Price"};var j=[E,O,V];async function H(e,n){await e.waitForModelAsync(".plex-grid",{requireKo:!0,timeoutMs:12e3});let t=typeof unsafeWindow<"u"?unsafeWindow.ko:window.ko,o=document.querySelector(".plex-grid"),r=o&&t&&typeof t.dataFor=="function"?t.dataFor(o):null;if(!r)return{ok:!0,issues:[]};let c=r?.datasource?.raw||r?.datasource?.data||[],i=new Map;for(let s of c){let p=e.getObsValue(s,"QuotePartKey")??-1;(i.get(p)||i.set(p,[]).get(p)).push(s)}let u=new Map;for(let[s,p]of i.entries()){let m=p.find(w=>e.getObsValue(w,"IsUniqueQuotePart")===1)||p[0];u.set(s,m)}let a={rows:c,groupsByQuotePart:i,primaryByQuotePart:u,lastForm:e.net?.getLastAddUpdateForm?.(),lastResult:e.net?.getLastAddUpdate?.()},f={get:(s,p,m)=>e.getObsValue(s,p,m)},d=(await Promise.all(j.map(s=>s(a,n,f)))).flat(),v=d.every(s=>s.level!=="error"),g=s=>Number(String(s??"").replace(/[^\d.-]/g,"")),l=s=>{if(s?.meta?.label)return s.meta.label;if(s?.kind){let p=String(s.kind),m=p.split(".").pop();return m?m.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,w=>w.toUpperCase()):p}return"Validation"},h=new Map;for(let s=0;s<a.rows.length;s++){let p=a.rows[s],m=s+1,w=f.get(p,"PartNo",{trim:!0})??"";h.set(p,{lineNumber:m,partNo:w})}let x=new Map;for(let[s,p]of a.primaryByQuotePart.entries()){let m=h.get(p)||{lineNumber:null,partNo:f.get(p,"PartNo",{trim:!0})??""};x.set(s,m)}let q=new Map;for(let s=0;s<a.rows.length;s++){let p=a.rows[s],m=s+1,w=f.get(p,"SortOrder",{number:!0});q.set(m,w)}let P=d.map(s=>{let p=s.quotePartKey??-1,m=x.get(p)||{lineNumber:null,partNo:""};return{...s,lineNumber:m.lineNumber,partNo:m.partNo,ruleLabel:l(s),sortOrder:q.get(m.lineNumber??-1)}});return e.state=e.state||{},e.state.lastValidation={at:Date.now(),ok:v,issues:P},{ok:v,issues:P}}var Y=typeof unsafeWindow<"u"&&unsafeWindow.ko?unsafeWindow.ko:window.ko;function it(e){try{let t=(Array.isArray(e)?e:[]).reduce((i,u)=>{let a=String(u?.level||"info").toLowerCase();return i[a]=(i[a]||0)+1,u?.quotePartKey!=null&&i.parts.add(u.quotePartKey),i},{error:0,warning:0,info:0,parts:new Set}),o=t.parts.size,r=[];return t.error&&r.push(`${t.error} error${t.error===1?"":"s"}`),t.warning&&r.push(`${t.warning} warning${t.warning===1?"":"s"}`),t.info&&r.push(`${t.info} info`),`${r.join(", ")||"updates"} across ${o||0} part${o===1?"":"s"}`}catch{return""}}async function st(){try{let e=document.querySelector(".plex-grid"),n=e&&Y?.dataFor?.(e);if(typeof n?.datasource?.read=="function")return await n.datasource.read(),"ds.read";if(typeof n?.refresh=="function")return n.refresh(),"vm.refresh"}catch{}try{let e=unsafeWindow?.plex?.currentPage?.QuoteWizard;if(e?.navigatePage){let n=typeof e.activePage=="function"?e.activePage():e.activePage;return e.navigatePage(n),"wiz.navigatePage"}}catch{}return null}var M="qt50-validate";async function ut(e={mount:"nav"}){for(let n=0;n<50;n++){let t=window.ensureLTHub||unsafeWindow?.ensureLTHub;if(typeof t=="function")try{let o=await t(e);if(o)return o}catch{}await new Promise(o=>setTimeout(o,100))}return null}function ct(e=[]){R();let n=document.createElement("div");n.id="qtv-modal-overlay",n.style.position="fixed",n.style.inset="0",n.style.background="rgba(0,0,0,.38)",n.style.zIndex="2147483647";let t=document.createElement("div");t.id="qtv-modal",t.style.position="absolute",t.style.top="50%",t.style.left="50%",t.style.transform="translate(-50%,-50%)",t.style.background="#fff",t.style.width="min(960px, 94vw)",t.style.maxHeight="80vh",t.style.overflow="hidden",t.style.borderRadius="12px",t.style.boxShadow="0 18px 40px rgba(0,0,0,.28)",t.style.fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif";let o=e.map(r=>{let c=(r.level||"").toLowerCase(),i=`<span class="qtv-pill" style="border-color:${c==="error"?"#fca5a5":"#cbd5e1"}; color:${c==="error"?"#b91c1c":"#334155"}">${c||"info"}</span>`,u=r.message||"(no message)",a=r.ruleLabel||r.kind||"Validation";return`
        <tr data-qpk="${r.quotePartKey??""}" data-rule="${String(r.kind||"")}">
          <td>${r.sortOrder??""}</td>
          <td>${r.partNo??""}</td>
          <td>${a}</td>
          <td>${i}</td>
          <td>${u}</td>
        </tr>`}).join("");t.innerHTML=`
  <div class="qtv-hd">
    <h3>Validation Details</h3>
    <div class="qtv-actions">
      <button class="btn btn-default" id="qtv-export-csv" title="Export visible issues to CSV">Export CSV</button>
      <button class="btn btn-primary" id="qtv-close" style="background:#2563eb; color:#fff; border:1px solid #1d4ed8;">Save &amp; Close</button>
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
      <tbody>${o||'<tr><td colspan="5" style="opacity:.7; padding:12px;">No issues.</td></tr>'}</tbody>
    </table>
  </div>
`,t.querySelector("#qtv-close")?.addEventListener("click",()=>n.remove()),n.addEventListener("click",r=>{r.target===n&&n.remove()}),t.querySelector("tbody")?.addEventListener("click",r=>{let c=r.target.closest("tr");if(!c)return;let i=c.getAttribute("data-qpk");if(!i)return;R();let u=K(i);u&&(document.querySelectorAll(".qtv-row-fail").forEach(a=>a.classList.remove("qtv-row-fail")),u.classList.add("qtv-row-fail"),u.scrollIntoView({block:"center",behavior:"smooth"}))}),t.querySelector("#qtv-export-csv")?.addEventListener("click",()=>{let r=[["Line","SortOrder","PartNo","QuotePartKey","Rule","Level","Reason"].join(","),...e.map(a=>{let f=y=>{let d=String(y??"");return/[",\n]/.test(d)?`"${d.replace(/"/g,'""')}"`:d};return[a.lineNumber??"",a.sortOrder??"",a.partNo??"",a.quotePartKey??"",a.ruleLabel||a.kind||"Validation",a.level||"",a.message||""].map(f).join(",")})].join(`
`),c=new Blob([r],{type:"text/csv"}),i=URL.createObjectURL(c),u=document.createElement("a");u.href=i,u.download="qt-validation-issues.csv",u.click(),setTimeout(()=>URL.revokeObjectURL(i),1e3)}),n.appendChild(t),(document.body||document.documentElement).appendChild(n);try{n.setAttribute("tabindex","-1"),n.focus()}catch{}n.addEventListener("keydown",r=>{r.key==="Escape"&&n.remove()})}async function Z(e){let n=await ut({mount:"nav"});if(!n?.registerButton)return()=>{};if(n.list?.()?.includes(M))return()=>{};let t=null;n.registerButton("left",{id:M,label:"Validate Lines",title:"Validate quote line rules",weight:130,onClick:async()=>{let r=U?.()||{},c=lt.core.hub.beginTask?.("Validating\u2026","info")||{done(){},error(){}};try{gt(),R();let i=await H(e,r),u=Array.isArray(i?.issues)?i.issues:[],a=u.length;try{for(let f of u){let y=f?.quotePartKey;if(!y)continue;let d=K(y);if(!d)continue;let v="qtv-row-fail",g=mt(f);d.classList.add(v),g&&d.classList.add(g)}}catch{}if(a===0)lt.core.hub.notify?.("\u2705 Lines valid","success",{ms:1800}),lt.core.hub.setStatus?.("\u2705 All clear","success",{sticky:!1}),setBadgeCount?.(0),c.done?.("Valid");else{let f=u.map(l=>String(l?.level||"").toLowerCase()),y=f.some(l=>l==="error"||l==="fail"||l==="critical")||u.some(l=>/price\.(?:maxunitprice|minunitprice)/i.test(String(l?.kind||""))),d=!y&&f.some(l=>l==="warn"||l==="warning"),v=it(u);try{y?(lt.core.hub.notify?.(`\u274C ${a} validation ${a===1?"issue":"issues"}`,"error",{ms:6500}),lt.core.hub.setStatus?.(`\u274C ${a} issue${a===1?"":"s"} \u2014 ${v}`,"error",{sticky:!0}),setBadgeCount?.(a)):d?(lt.core.hub.notify?.(`\u26A0\uFE0F ${a} validation ${a===1?"warning":"warnings"}`,"warn",{ms:5e3}),lt.core.hub.setStatus?.(`\u26A0\uFE0F ${a} warning${a===1?"":"s"} \u2014 ${v}`,"warn",{sticky:!0}),setBadgeCount?.(a)):(lt.core.hub.notify?.(`\u2139\uFE0F ${a} update${a===1?"":"s"} applied`,"info",{ms:3500}),lt.core.hub.setStatus?.(`\u2139\uFE0F ${a} update${a===1?"":"s"} \u2014 ${v}`,"info",{sticky:!0}),setBadgeCount?.(a))}catch{}if(ct(u),u.some(l=>String(l?.kind||"").includes("autoManageLtPartNoOnQuote")&&String(l?.level||"").toLowerCase()==="warning"&&l?.meta?.changed===!0))try{let l=await st();lt.core?.hub?.notify?.(l?`Grid refreshed (${l})`:"Grid refresh attempted (reload may be needed)",l?"success":"info",{ms:2500})}catch{lt.core?.hub?.notify?.("Grid refresh failed","warn",{ms:3e3})}c.done?.("Checked")}e.state=e.state||{},e.state.lastValidation=i}catch(i){lt.core.hub.error?.(`Validation error: ${i?.message||i}`,"error",{ms:6e3}),c.error?.("Error")}}}),t=n._shadow?.querySelector?.(`[data-id="${M}"]`);let o=G?.(()=>J(t));return J(t),()=>{o?.(),n?.remove?.(M)}}function J(e){if(!e)return;let n=U(),t=[];n.minUnitPrice!=null&&t.push(`\u2265${n.minUnitPrice}`),n.maxUnitPrice!=null&&t.push(`\u2264${n.maxUnitPrice}`),e.title=`Rules: ${t.join(", ")||"none"}`}function R(){if(document.getElementById("qtv-styles"))return;let e=document.createElement("style");e.id="qtv-styles",e.textContent=`
.qtv-row-fail { outline: 2px solid rgba(220, 38, 38, .85) !important; outline-offset: -2px; }
.qtv-row-fail--price-maxunit { background: rgba(254, 226, 226, .65) !important; }  /* red-ish */
.qtv-row-fail--price-minunit { background: rgba(219, 234, 254, .65) !important; }  /* blue-ish */

/* Modal shell */
#qtv-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.38); z-index:2147483647; }
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
`,document.head.appendChild(e)}function dt(e,n){try{let t=e?.[n];return typeof t=="function"?t():t}catch{return}}function pt(){let e=document.querySelector(".plex-grid");if(!e)return 0;let n=e.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"),t=0;for(let o of n){if(o.hasAttribute("data-quote-part-key")){t++;continue}try{let r=Y?.contextFor?.(o),c=r?.$data??r?.$root??null,i=typeof TMUtils?.getObsValue=="function"?TMUtils.getObsValue(c,"QuotePartKey"):dt(c,"QuotePartKey");i!=null&&i!==""&&Number(i)>0&&(o.setAttribute("data-quote-part-key",String(i)),t++)}catch{}}return t}function gt(){document.querySelectorAll(".qtv-row-fail").forEach(e=>{e.classList.remove("qtv-row-fail"),e.classList.remove("qtv-row-fail--price-maxunit"),e.classList.remove("qtv-row-fail--price-minunit")})}function K(e){let n=document.querySelector(".plex-grid");if(!n)return null;let t=n.querySelector(`[data-quote-part-key="${CSS.escape(String(e))}"]`);if(t||pt()>0&&(t=n.querySelector(`[data-quote-part-key="${CSS.escape(String(e))}"]`),t))return t.closest("tr, .k-grid-content tr, .plex-grid-row")||t;let o=n.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row");for(let r of o)if((r.textContent||"").trim().includes(String(e)))return r;return null}function mt(e){let n=String(e?.kind||"").toLowerCase();return n.includes("price.maxunitprice")?"qtv-row-fail--price-maxunit":n.includes("price.minunitprice")?"qtv-row-fail--price-minunit":""}var ft=!1;ft&&((unsafeWindow||window).QTV_DEBUG=(unsafeWindow||window).QTV_DEBUG||{},(unsafeWindow||window).QTV_DEBUG.tagStats=()=>{let e=document.querySelector(".plex-grid"),n=e?e.querySelectorAll("tr, .k-grid-content tr, .plex-grid-row, .k-table-row, .k-grid .k-grid-content .k-table-row"):[],t=e?e.querySelectorAll("[data-quote-part-key]"):[];return console.log("[QTV] rows:",n.length,"tagged:",t.length),{total:n.length,tagged:t.length}},(unsafeWindow||window).QTV_DEBUG.hiliTest=e=>{R();let n=K(e);return n&&(n.classList.add("qtv-row-fail","qtv-row-fail--price-maxunit"),n.scrollIntoView({block:"center",behavior:"smooth"})),!!n});TMUtils?.net?.ensureWatcher?.();var X=[/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i],_=null;function yt(){return TMUtils?.matchRoute?!!TMUtils.matchRoute(X):X.some(e=>e.test(location.pathname))}function bt(){return(document.querySelector('.plex-wizard-page-list .plex-wizard-page.active, .plex-wizard-page-list .plex-wizard-page[aria-current="page"]')?.textContent||"").trim().replace(/\s+/g," ")}function vt(){return/^part\s*summary$/i.test(bt())}async function T(){if(!yt())return tt();vt()?_||(_=await Z(TMUtils)):tt()}function tt(){_&&(_(),_=null)}T();TMUtils?.onUrlChange?.(T);window.addEventListener("hashchange",T);var et=document.querySelector(".plex-wizard-page-list");et&&new MutationObserver(T).observe(et,{subtree:!0,attributes:!0,childList:!0});})();
