// ==UserScript==
// @name        CRS10
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     2026.06.01.0
// @description Validate certs by OrderNo+PartNo+SerialNo (display), call DS8566 (Heat_Key/Serial_No) then DS14343 by Heat_Key. Show results, require Acknowledgement when issues exist, offer quick email for misses, and provide a small settings GUI.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @homepageURL https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @supportURL  https://github.com/AlphaGeek509/plex-tampermonkey-scripts/issues
// @match       https://lyntron.on.plex.com/SalesAndCRM/SalesReleases*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/SalesReleases*
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/lt-plex-tm-utils.user.js?v=2026.06.01.0
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/lt-plex-auth.user.js?v=2026.06.01.0
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/lt-core.user.js?v=2026.06.01.0
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/lt-data-core.user.js?v=2026.06.01.0
// @require     https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/lt-ui-hub.js?v=2026.06.01.0
// @resource    THEME_CSS https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@v2026.06.01.0/TamperHost/wwwroot/theme.css
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @connect     localhost
// @run-at      document-idle
// @noframes
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @updateURL   https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/CRS10-ValidateCertsBeforeScheduling.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/AlphaGeek509/plex-tampermonkey-scripts@latest/TamperHost/wwwroot/CRS10-ValidateCertsBeforeScheduling.user.js
// ==/UserScript==

(()=>{(async function(){"use strict";let f=/test\.on\.plex\.com$/i.test(location.hostname);TMUtils.setDebug?.(f);let x=TMUtils.getLogger?.("CRS10"),C=(...e)=>{f&&x?.log?.(...e)},Y=(...e)=>{f&&x?.warn?.(...e)},S=(...e)=>{f&&x?.error?.(...e)},L=[/^\/SalesAndCRM\/SalesReleases(?:\/|$)/i];if(!TMUtils.matchRoute?.(L)){C("Skipping route:",location.pathname);return}let N=Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype,"cssRules");N?.get&&Object.defineProperty(CSSStyleSheet.prototype,"cssRules",{get(){try{return N.get.call(this)}catch{return[]}}});let U=Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype,"rules");U?.get&&Object.defineProperty(CSSStyleSheet.prototype,"rules",{get(){try{return U.get.call(this)}catch{return[]}}});let $="crs10.showMissingOnly",K="crs10.missingToAddress",j="crs10.limitMCM199Only",M=GM_getValue($,!1),w=GM_getValue(K,""),k=GM_getValue(j,!1);function V(){let e=document.createElement("button");e.textContent="\u2699\uFE0F",Object.assign(e.style,{position:"fixed",bottom:"20px",right:"20px",zIndex:100001,padding:"6px",borderRadius:"50%",fontSize:"18px",cursor:"pointer"}),e.title="CR&S10 Settings",e.addEventListener("click",G),document.body.appendChild(e)}function G(){let e=document.createElement("div");Object.assign(e.style,{position:"fixed",inset:"0",background:"rgba(0,0,0,0.35)",zIndex:100002});let o=document.createElement("div");Object.assign(o.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",padding:"20px",borderRadius:"10px",boxShadow:"0 6px 20px rgba(0,0,0,0.25)",fontFamily:"system-ui, sans-serif",width:"360px",maxWidth:"90vw"}),o.innerHTML=`
      <h3 style="margin:0 0 12px 0;">CR&S10 Settings</h3>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-missing-only"> Show missing certs only
      </label>
      <label style="display:block; margin:10px 0;">
        <input type="checkbox" id="cb-limit-mcm"> Limit results to customer MCM199 only
      </label>
      <label style="display:block; margin:10px 0;">
        Missing Cert To Address:<br>
        <input type="email" id="input-missing-to"
               placeholder="user@example.com"
               style="width:100%; box-sizing:border-box; padding:6px; border:1px solid #ccc; border-radius:6px;">
      </label>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button id="btn-close">Close</button>
      </div>
    `,e.appendChild(o),document.body.appendChild(e);let s=o.querySelector("#cb-missing-only");s.checked=M,s.addEventListener("change",()=>{M=s.checked,GM_setValue($,M)});let r=o.querySelector("#cb-limit-mcm");r.checked=k,r.addEventListener("change",()=>{k=r.checked,GM_setValue(j,k)});let i=o.querySelector("#input-missing-to");i.value=w,i.addEventListener("change",()=>{w=i.value.trim(),GM_setValue(K,w)}),o.querySelector("#btn-close").addEventListener("click",()=>e.remove())}if(V(),typeof TMUtils>"u"){S("TMUtils helper not found; check @require URLs.");return}let O=unsafeWindow.ko;if(!O){S("Knockout not found.");return}let b=e=>typeof O.unwrap=="function"?O.unwrap(e):typeof e=="function"?e():e;function F({orderNo:e,partNo:o,serialNo:s}){let r=encodeURIComponent(w||""),i="",d=encodeURIComponent(`Missing Attachment: Order ${e}`),c=`OrderNo: ${e}
PartNo: ${o}
SerialNo: ${s}

Missing attachment detected. Please investigate.
`,l=`mailto:${r}?cc=${encodeURIComponent(i)}&subject=${d}&body=${encodeURIComponent(c)}`;window.open(l,"_blank")}function D(e,o){let s=document.createElement("div");Object.assign(s.style,{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1e5});let r=document.createElement("div");Object.assign(r.style,{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",padding:"20px",borderRadius:"10px",maxWidth:"90%",maxHeight:"80%",overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.35)",fontFamily:"system-ui, sans-serif"});let i=e.length,d=e.filter(n=>n.error||n.count===0).length,c=document.createElement("div");c.innerHTML=`<h3 style="margin:0 0 10px 0;">Attachment Check</h3>
      <div style="opacity:.8; font-size:12px; margin-bottom:10px;">
        Checked <b>${i}</b> entries \u2022 Issues: <b>${d}</b>
      </div>`,r.appendChild(c);let l=document.createElement("table");l.style.width="100%",l.style.borderCollapse="collapse";let g=document.createElement("thead"),E=document.createElement("tr");["OrderNo","PartNo","SerialNo","Has Attachments","Email"].forEach(n=>{let a=document.createElement("th");a.textContent=n,Object.assign(a.style,{border:"1px solid #ccc",padding:"8px",background:"#f6f6f6",textAlign:"left"}),E.appendChild(a)}),g.appendChild(E),l.appendChild(g);let _=document.createElement("tbody"),t=null,u=null;e.forEach(n=>{let a=document.createElement("tr"),v=n.orderNo!==t?n.orderNo:"",T=n.partNo!==u?n.partNo:"";t=n.orderNo,u=n.partNo;let W=n.error?"\u26A0\uFE0F":n.count>0?"\u2705":"\u274C";[v,T,n.serialNo,W].forEach((y,I)=>{let A=document.createElement("td");A.textContent=y,Object.assign(A.style,{border:"1px solid #ddd",padding:"6px",textAlign:I<3?"left":"center"}),a.appendChild(A)});let P=document.createElement("td");if(Object.assign(P.style,{border:"1px solid #ddd",padding:"6px",textAlign:"center"}),n.error||n.count===0){let y=document.createElement("span");y.textContent="\u2709\uFE0F",y.title="Email this missing cert",y.style.cursor="pointer",y.addEventListener("click",I=>{I.stopPropagation(),F(n)}),P.appendChild(y)}a.appendChild(P),_.appendChild(a)}),l.appendChild(_),r.appendChild(l);let p=document.createElement("div");p.style.textAlign="center",p.style.marginTop="14px";let m=document.createElement("button");m.textContent="Acknowledged",m.addEventListener("click",()=>{s.remove(),o()}),p.appendChild(m),r.appendChild(p),s.appendChild(r),document.body.appendChild(s)}async function q(){if(typeof TMUtils.waitForModelAsync=="function"){let{viewModel:e}=await TMUtils.waitForModelAsync(".plex-grid",{pollMs:250,timeoutMs:3e4,logger:f?x:null});return e||null}return new Promise(e=>{let o=()=>typeof window<"u"&&window.ko||typeof unsafeWindow<"u"&&unsafeWindow.ko||null,s=()=>{let r=document.querySelector(".plex-grid"),i=o(),d=null;if(r&&i&&typeof i.contextFor=="function"){let c=i.contextFor(r);d=c?.$root?.data||c?.$root||null}if(d)return e(d);setTimeout(s,250)};s()})}function h(e,o){TMUtils?.showMessage?TMUtils.showMessage(e,o):C(e)}let R=await q();if(!R){S?.("Could not resolve root VM under .plex-grid");return}function z(e){let o=e?.closest?.('a,button,input[type="button"],input[type="submit"]');if(!o)return null;let s=(o.innerText||o.textContent||o.value||"").trim();return/^schedule(?:\s*\.\.\.)?$/i.test(s)?o:null}async function H(e){if(!await TMUtils.getApiKey({wait:!0,timeoutMs:8e3})){TMUtils.toast("\u{1F510} No Plex API key found. Use \u201C\u2699\uFE0F Set Plex API Key\u201D in the Tampermonkey menu.","error",4e3);return}let s=z(e.target);if(s&&e.isTrusted){e.stopImmediatePropagation(),e.stopPropagation(),e.preventDefault(),C("Intercepted Schedule click:",s),h("\u23F3 Validating certificates\u2026",{type:"info",autoClear:!1});try{if(!R){S("Could not resolve root VM under .plex-grid"),h("\u274C Could not resolve grid VM.",{type:"error",autoClear:3500});return}let i=(b(R.results)||[]).filter(t=>b(t.IsScheduleShipment)).map(t=>({orderNo:b(t.OrderNo),partNo:b(t.PartNo),partKey:b(t.PartKey),customerCode:b(t.CustomerCode)}));if(k&&(i=i.filter(t=>t.customerCode==="MCM199")),i.length===0)return h("\u26A0\uFE0F No shipments flagged",{type:"warning",autoClear:2500}),s.click();if(f){let t=(await TMUtils.getApiKey()).toString();x?.info?.("CRS10 auth present:",!!t,"prefix:",t.slice(0,10))}let d=await Promise.all(i.map(t=>TMUtils.ds(8566,{Part_Key:t.partKey}).catch(u=>({rows:[],error:String(u)})))),c=[],l=new Set;d.forEach((t,u)=>{let{orderNo:p,partNo:m}=i[u];(t.rows||[]).forEach(n=>{let a=n.Heat_Key,v=n.Serial_No,T=`${p}|${m}|${a}|${v}`;l.has(T)||(l.add(T),c.push({orderNo:p,partNo:m,heatKey:a,serialNo:v}))})});let g=await Promise.all(c.map(async({orderNo:t,partNo:u,heatKey:p,serialNo:m})=>{try{let{rows:n}=await TMUtils.ds(14343,{Record_Key_Value:String(p),Attachment_Group_Key:45});return{orderNo:t,partNo:u,serialNo:m,count:(n??[]).length}}catch(n){return{orderNo:t,partNo:u,serialNo:m,error:String(n)}}}));C("Final status:",g),h(`\u{1F50D} Checked ${g.length} entries`,{type:"info",autoClear:2e3});let E=M?g.filter(t=>t.error||t.count===0):g;if(!g.some(t=>t.error||t.count===0))return h("\u2705 All attachments present. Proceeding\u2026",{type:"success",autoClear:1800}),s.click();D(E,()=>{h("\u2705 Acknowledged",{type:"success",autoClear:1800}),s.click()})}catch(r){S("Schedule validation failed:",r),h(`\u274C ${r?.message||r}`,{type:"error",autoClear:4e3}),s.click()}}}document.addEventListener("click",H,!0),C("Schedule interceptor attached (delegated)"),GM_registerMenuCommand("\u{1F527} Re-hook CR&S10 Schedule",()=>location.reload())})();})();
