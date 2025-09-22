(()=>{(()=>{let i=typeof unsafeWindow<"u"?unsafeWindow:window;i.waitForContainerAndAnchor||(i.waitForContainerAndAnchor=function(w=15e3,g=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"]){return new Promise((k,E)=>{let b=()=>{let x=document.querySelector(".plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content-container")||document.body,a=g.map(C=>document.querySelector(C)).find(Boolean)||null;if(x)return k({container:x,beforeNode:a})};b();let f=new MutationObserver(b);f.observe(document.documentElement,{childList:!0,subtree:!0}),setTimeout(()=>{try{f.disconnect()}catch{}E(new Error("lt-ui-hub: Container/anchor not found"))},w)})});function T(){return document.querySelector("#navBar .navbar-right")||document.querySelector(".plex-navbar-container .navbar-right")}i.createHub||(i.createHub=function(){let w=document.createElement("div");w.setAttribute("data-lt-hub","1");let g=w.attachShadow({mode:"open"}),k=document.createElement("style");k.textContent=`
        :host { all: initial; }
        .hub {
          box-sizing: border-box;
          width: 100%;
          background: #ffffff;
          border-bottom: 1px solid rgba(0,0,0,.08);
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
          padding: 8px 12px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 8px;
          font: 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        }
        :host([data-elevated="1"]) .hub { box-shadow: 0 6px 18px rgba(0,0,0,.18); }

        .left, .center, .right { display: inline-flex; gap: 8px; align-items: center; }
        .left   { justify-content: flex-start; }
        .center { justify-content: center; flex-wrap: wrap; }
        .right  { justify-content: flex-end; }

        /* Navbar variant renders inline; no page layout adjustments */
        :host([data-variant="nav"]) .hub {
          border: 0; box-shadow: none; padding: 0;
          display: inline-flex; grid-template-columns: none; gap: 8px;
        }
        :host([data-variant="nav"]) .left,
        :host([data-variant="nav"]) .center,
        :host([data-variant="nav"]) .right { display: inline-flex; }
        /* Keep brand visible in nav too (change to 'none' to hide) */
        :host([data-variant="nav"]) .brand { display: inline-flex; }
        :host([data-variant="nav"]) button.hbtn { padding: 4px 10px; }

        .brand {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(0,0,0,.12);
          background: #f7f9fb; font-weight: 600;
        }
        /* Map global theme vars (from :root in theme.css) into the shadow tree */
        :host {
          --lt-brand: var(--brand-600, #0b5fff);
          --lt-brand-700: var(--brand-700, #0a4fd6);
          --lt-ink: var(--ink, #222);
          --lt-ink-muted: var(--ink-muted, #666);
          --lt-ok: var(--ok, #15803d);
          --lt-warn: var(--warn, #b45309);
          --lt-err: var(--err, #b91c1c);
        }

        /* Brand token touches */
        .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--lt-brand); }

        /* Button system: primary / ghost, with accessible focus + hover states */
        button.hbtn {
          all: unset;
          font: inherit;
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: var(--lt-brand);
          color: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,.08);
          cursor: pointer;
          transition: background .18s ease, transform .06s ease, box-shadow .18s ease, border-color .18s ease, color .18s ease;
        }
        button.hbtn:hover {
          background: var(--lt-brand-700);
          box-shadow: 0 2px 8px rgba(0,0,0,.12);
        }
        button.hbtn:active { transform: translateY(0.5px); }

        button.hbtn:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--lt-brand) 40%, white);
          outline-offset: 2px;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--lt-brand) 25%, transparent);
        }

        button.hbtn[disabled] {
          opacity: .6;
          cursor: not-allowed;
          box-shadow: none;
        }

        /* Ghost variant (optional): add via classList while registering */
        button.hbtn.hbtn--ghost {
          background: transparent;
          color: var(--lt-brand);
          border-color: var(--lt-brand);
        }
        button.hbtn.hbtn--ghost:hover {
          background: color-mix(in srgb, var(--lt-brand) 8%, transparent);
        }


        .sep { width: 1px; height: 20px; background: rgba(0,0,0,.12); }
        .status {
          padding: 3px 10px; border-radius: 999px;
          border: 1px solid rgba(0,0,0,.15); background: #f8fafc; font-size: 12px;
        }
        .status.success { background:#ecfdf5; border-color:#d1fae5; }
        .status.info    { background:#eff6ff; border-color:#dbeafe; }
        .status.warn    { background:#fffbeb; border-color:#fef3c7; }
        .status.danger  { background:#fef2f2; border-color:#fee2e2; }

        .status-wrap { display: inline-flex; align-items: center; gap: 8px; }
        .spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(0,0,0,.15); border-top-color: #0ea5e9;
          animation: spin 800ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Body mount: page padding handled with CSS var (set by JS) */
        html, body { --lt-hub-h: 0px; }
        body.lt-hub-padded { padding-top: var(--lt-hub-h) !important; }
      `,g.appendChild(k);let E=document.createElement("div");E.className="hub";let b=document.createElement("div");b.className="left";let f=document.createElement("div");f.className="center";let p=document.createElement("div");p.className="right";let x=document.createElement("span");x.className="brand",x.innerHTML='<span class="dot"></span><span class="brand-text">OneMonroe</span>',b.appendChild(x);let a=document.createElement("span");a.className="status-slot",p.appendChild(a),E.append(b,f,p),g.appendChild(E);let C=5e3,_=(s,t)=>{let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");return e.className=`status ${t}`,e.textContent=s||"",n.appendChild(e),n},h={_shadow:g,registerButton(s="left",t){let n=s==="right"?p:s==="center"?f:b,e=t?.el;return e?t?.id&&(e.dataset.id=t.id,t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel))):(e=document.createElement("button"),e.type="button",e.className="hbtn",t?.id&&(e.dataset.id=t.id),e.textContent=t?.label??"Action",t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel)),typeof t?.onClick=="function"&&e.addEventListener("click",t.onClick),t?.disabled&&(e.disabled=!0)),n===p?p.insertBefore(e,a):n.appendChild(e),h},updateButton(s,t={}){let n=g.querySelector(`[data-id="${CSS.escape(s)}"]`);if(!n)return h;if(typeof t.label=="string"&&n.tagName==="BUTTON"&&(n.textContent=t.label),typeof t.title=="string"&&(n.title=t.title),typeof t.ariaLabel=="string"&&n.setAttribute("aria-label",t.ariaLabel),"disabled"in t&&n.tagName==="BUTTON"&&(n.disabled=!!t.disabled),typeof t.onClick=="function"&&n.tagName==="BUTTON"){let e=n.cloneNode(!0);e.addEventListener("click",t.onClick),e.dataset.id=s,n.replaceWith(e)}return h},remove(s){if(!s)return h;let t=g.querySelector(`[data-id="${CSS.escape(s)}"]`);return t&&t.parentNode&&t.parentNode.removeChild(t),h},clear(){return b.replaceChildren(),f.replaceChildren(),[...p.children].forEach(s=>{s!==a&&s.remove()}),a.replaceChildren(),h},list(){return[...b.children,...f.children,...p.children].map(t=>t.dataset?.id).filter(Boolean)},setStatus(s,t="info",n={}){a.replaceChildren(_(s,t));let e=!!n?.sticky,d=n?.ms??n?.timeout??C;return!e&&s&&setTimeout(()=>{try{a.isConnected&&a.replaceChildren()}catch{}},d),h},beginTask(s,t="info"){let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");e.className="spinner";let d=document.createElement("span");return d.className=`status ${t}`,d.textContent=s||"Working\u2026",n.append(e,d),a.replaceChildren(n),{update(r){return typeof r=="string"&&(d.textContent=r),this},success(r="Done"){return d.className="status success",d.textContent=r,e.remove(),this},error(r="Error"){return d.className="status danger",d.textContent=r,e.remove(),this},clear(){return a.replaceChildren(),this}}},notify(s,t,{ms:n=C,sticky:e=!1}={}){return h.setStatus(t,s,{ms:n,sticky:e}),h}};return{host:w,left:b,center:f,right:p,api:h}});async function R(A={}){let{timeoutMs:w=15e3,selectors:g=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"],theme:k=null,mount:E=null,disableModalElevate:b=!0}=A;if(i.ltUIHub)return i.ltUIHub;if(i.__ensureLTHubPromise)return i.__ensureLTHubPromise;if(document.querySelector('[data-lt-hub="1"]')&&i.ltUIHub)return i.ltUIHub;let p=E||i.__LT_HUB_MOUNT||"nav";return i.__ensureLTHubPromise=(async()=>{let{container:x}=await i.waitForContainerAndAnchor(w,g),{host:a,api:C}=(i.createHub||createHub)();if(p==="nav"){let n=T();n||await new Promise(u=>{let m=new MutationObserver(()=>{let c=T();c&&(m.disconnect(),n=c,u())});m.observe(document.documentElement,{childList:!0,subtree:!0})});let e=n&&n.closest("nav")||document.getElementById("navBar")||document.querySelector(".plex-navbar-container.navbar");if(!e)throw new Error("lt-ui-hub: navBar not found");let d=e.querySelector(":scope > .plex-navbar-title-container navbar-left")||null,r=e.querySelector(":scope > .lt-hub-row");r||(r=document.createElement("div"),r.className="lt-hub-row",r.style.display="block",r.style.boxSizing="border-box",r.style.width="100%",d?e.insertBefore(r,d):e.appendChild(r));let y=()=>{let u=getComputedStyle(e),m=parseFloat(u.paddingLeft)||0,c=parseFloat(u.paddingRight)||0,H=parseFloat(u.borderLeftWidth)||0,N=parseFloat(u.borderRightWidth)||0;r.style.marginLeft=m+H?`-${m+H}px`:"0",r.style.marginRight=c+N?`-${c+N}px`:"0",r.style.width=m+c+H+N?`calc(100% + ${m+c+H+N}px)`:"100%"};r.dataset.edgeApplied||(y(),window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(e,{attributes:!0,attributeFilter:["style","class"]}),r.dataset.edgeApplied="1"),a.parentNode!==r&&r.appendChild(a),a.setAttribute("data-variant","row"),Object.assign(a.style,{position:"static",top:"",left:"",right:"",width:"100%",maxWidth:"100%",zIndex:"auto",pointerEvents:"auto"});try{let u=a.shadowRoot?.querySelector(".hub");u&&(u.style.width="100%")}catch{}let L=45;e.style.height="auto";let S=()=>{let u=Math.max(0,a.getBoundingClientRect().height||0)};requestAnimationFrame(()=>{S(),requestAnimationFrame(S)});try{document.fonts?.ready?.then(S)}catch{}window.addEventListener("resize",S,{passive:!0});try{new ResizeObserver(S).observe(a)}catch{}if(!!!document.querySelector(".plex-env-persistent-banner-container")){let c=function(o){if(!o)return null;let l=parseFloat(o);return Number.isFinite(l)?l:null},H=function(o){let l=o.dataset;!l.ltBaseH&&o.style.height&&(l.ltBaseH=o.style.height),!l.ltBaseMax&&o.style.maxHeight&&(l.ltBaseMax=o.style.maxHeight),!l.ltBaseMin&&o.style.minHeight&&(l.ltBaseMin=o.style.minHeight)},N=function(o,l){H(o);let v=o.dataset,M=c(v.ltBaseH)??c(o.style.height),F=c(v.ltBaseMax)??c(o.style.maxHeight),O=c(v.ltBaseMin)??c(o.style.minHeight);M!=null&&(o.style.height=`${Math.max(0,M+l)}px`),F!=null&&(o.style.maxHeight=`${Math.max(0,F+l)}px`),O!=null&&(o.style.minHeight=`${Math.max(0,O+l)}px`)},B=function(){let o=Math.max(0,e.getBoundingClientRect().height||0),l=Math.max(0,o-45);l&&m.forEach(v=>{document.querySelectorAll(v).forEach(M=>N(M,l))})};var _=c,h=H,s=N,t=B;let m=[".plex-sidetabs-menu-page",".plex-sidetabs-menu-page-content-container",".plex-sidetabs-menu-page-content"];requestAnimationFrame(()=>{B(),requestAnimationFrame(B)}),window.addEventListener("resize",B,{passive:!0});try{new ResizeObserver(B).observe(e)}catch{}new MutationObserver(o=>{let l=!1;for(let v of o){if(v.type==="attributes"&&v.attributeName==="style"){l=!0;break}if(v.type==="childList"){l=!0;break}}l&&B()}).observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["style"]})}}else{let n=x.querySelector(":scope > .plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content")||x,e=n.querySelector(":scope > .lt-hub-spacer");e||(e=document.createElement("div"),e.className="lt-hub-spacer",e.style.width="100%",e.style.height="0px",e.style.margin="0",e.style.padding="0",e.style.flex="0 0 auto",n.prepend(e)),e.nextSibling!==a&&(a.parentNode&&a.parentNode.removeChild(a),e.after(a));let d=()=>{let L=Math.max(0,a.getBoundingClientRect().height||0);document.documentElement.style.setProperty("--lt-hub-h",`${L}px`)},r=()=>{let L=document.documentElement,S=getComputedStyle(L),q=parseInt(S.getPropertyValue("--side-menu-persistent-banner-height"))||0,u=document.querySelector("#navBar"),m=u?Math.max(0,u.getBoundingClientRect().height||0):0,c=q+m;L.style.setProperty("--lt-fixed-top",`${c}px`)},y=()=>{d(),r()};requestAnimationFrame(()=>{y(),requestAnimationFrame(y)});try{document.fonts?.ready?.then(y)}catch{}window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(document.documentElement,{childList:!0,subtree:!0}),Object.assign(a.style,{position:"sticky",top:"0",left:"0",right:"0",width:"100%",zIndex:"10",pointerEvents:"auto"})}return i.ltUIHub=C,C})().finally(()=>{setTimeout(()=>{i.__ensureLTHubPromise=null},0)}),i.__ensureLTHubPromise}try{i.ensureLTHub=R}catch{}try{Promise.resolve().then(()=>i.ensureLTHub?.({mount:i.__LT_HUB_MOUNT||"nav"}).catch(()=>{}))}catch{}})();})();
;(function(g){try{if(typeof LTHub!=='undefined'){g.LTHub=LTHub;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
