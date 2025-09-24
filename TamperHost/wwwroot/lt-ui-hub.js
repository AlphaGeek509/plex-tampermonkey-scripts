(()=>{(()=>{let o=typeof unsafeWindow<"u"?unsafeWindow:window;o.waitForContainerAndAnchor||(o.waitForContainerAndAnchor=function(b=15e3,h=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"]){return new Promise((w,m)=>{let u=()=>{let g=document.querySelector(".plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content-container")||document.body,a=h.map(f=>document.querySelector(f)).find(Boolean)||null;if(g)return w({container:g,beforeNode:a})};u();let l=new MutationObserver(u);l.observe(document.documentElement,{childList:!0,subtree:!0}),setTimeout(()=>{try{l.disconnect()}catch{}m(new Error("lt-ui-hub: Container/anchor not found"))},b)})});function M(){return document.querySelector("#navBar .navbar-right")||document.querySelector(".plex-navbar-container .navbar-right")}function k(){let H=document.querySelector(".plex-env-persistent-banner-container"),b=document.querySelector(".plex-persistent-banner-container"),h=H?H.offsetHeight:0,w=b?b.offsetHeight:0,m=document.documentElement,u=getComputedStyle(m).getPropertyValue("--side-menu-persistent-banner-height"),l=Number.parseFloat(u)||0;if(h>0){m.style.setProperty("--side-menu-persistent-banner-height",`${h}px`);return}b&&w===0&&l===0&&(b.style.height="50px",m.style.setProperty("--side-menu-persistent-banner-height","50px"))}o.createHub||(o.createHub=function(){let b=document.createElement("div");b.setAttribute("data-lt-hub","1");let h=b.attachShadow({mode:"open"}),w=document.createElement("style");w.textContent=`
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
      `,h.appendChild(w);let m=document.createElement("div");m.className="hub";let u=document.createElement("div");u.className="left";let l=document.createElement("div");l.className="center";let p=document.createElement("div");p.className="right";let g=document.createElement("span");g.className="brand",g.innerHTML='<span class="dot"></span><span class="brand-text">OneMonroe</span>',u.appendChild(g);let a=document.createElement("span");a.className="status-slot",p.appendChild(a),m.append(u,l,p),h.appendChild(m);let f=5e3,S=(r,t)=>{let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");return e.className=`status ${t}`,e.textContent=r||"",n.appendChild(e),n},i={_shadow:h,registerButton(r="left",t){typeof r=="object"&&!t&&(t=r,r=t?.section||"left");let n=r==="right"?p:r==="center"?l:u,e=t?.el;return e?t?.id&&(e.dataset.id=t.id,t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel))):(e=document.createElement("button"),e.type="button",e.className="hbtn",t?.id&&(e.dataset.id=t.id),e.textContent=t?.label??"Action",t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel)),typeof t?.onClick=="function"&&e.addEventListener("click",t.onClick),t?.disabled&&(e.disabled=!0)),n===p?p.insertBefore(e,a):n.appendChild(e),i},updateButton(r,t={}){let n=h.querySelector(`[data-id="${CSS.escape(r)}"]`);if(!n)return i;if(typeof t.label=="string"&&n.tagName==="BUTTON"&&(n.textContent=t.label),typeof t.title=="string"&&(n.title=t.title),typeof t.ariaLabel=="string"&&n.setAttribute("aria-label",t.ariaLabel),"disabled"in t&&n.tagName==="BUTTON"&&(n.disabled=!!t.disabled),typeof t.onClick=="function"&&n.tagName==="BUTTON"){let e=n.cloneNode(!0);e.addEventListener("click",t.onClick),e.dataset.id=r,n.replaceWith(e)}return i},remove(r){if(!r)return i;let t=h.querySelector(`[data-id="${CSS.escape(r)}"]`);return t&&t.parentNode&&t.parentNode.removeChild(t),i},clear(){return u.replaceChildren(),l.replaceChildren(),[...p.children].forEach(r=>{r!==a&&r.remove()}),a.replaceChildren(),i},list(){return[...u.children,...l.children,...p.children].map(t=>t.dataset?.id).filter(Boolean)},setStatus(r,t="info",n={}){a.replaceChildren(S(r,t));let e=!!n?.sticky,c=n?.ms??n?.timeout??f;return!e&&r&&setTimeout(()=>{try{a.isConnected&&a.replaceChildren()}catch{}},c),i},beginTask(r,t="info"){let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");e.className="spinner";let c=document.createElement("span");return c.className=`status ${t}`,c.textContent=r||"Working\u2026",n.append(e,c),a.replaceChildren(n),{update(s){return typeof s=="string"&&(c.textContent=s),this},success(s="Done"){return c.className="status success",c.textContent=s,e.remove(),this},error(s="Error"){return c.className="status danger",c.textContent=s,e.remove(),this},clear(){return a.replaceChildren(),this}}},notify(r,t,{ms:n=f,sticky:e=!1}={}){return i.setStatus(t,r,{ms:n,sticky:e}),i}};return{host:b,left:u,center:l,right:p,api:i}});async function T(H={}){let{timeoutMs:b=15e3,selectors:h=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"],theme:w=null,mount:m=null,disableModalElevate:u=!0}=H;if(o.ltUIHub)return o.ltUIHub;if(o.__ensureLTHubPromise)return o.__ensureLTHubPromise;let l=document.querySelector('[data-lt-hub="1"]');if(l&&o.ltUIHub){let g=(m||o.__LT_HUB_MOUNT||"nav")==="nav",a=l.getAttribute("data-variant")||"";if(g&&a!=="nav"){let f=document.querySelector("#navBar .navbar-right")||document.querySelector(".plex-navbar-container .navbar-right");if(f){let S=f.closest("#navBar, .plex-navbar-container")||document.getElementById("navBar")||document.querySelector(".plex-navbar-container");if(S){let i=S.querySelector(".lt-hub-row");i||(i=document.createElement("div"),i.className="lt-hub-row",i.style.display="block",i.style.boxSizing="border-box",i.style.width="100%",S.appendChild(i)),l.parentNode!==i&&i.appendChild(l),l.setAttribute("data-variant","nav"),Object.assign(l.style,{position:"static",top:"",left:"",right:"",width:"100%",maxWidth:"100%",zIndex:"auto",pointerEvents:"auto"})}}}return o.ltUIHub}let p=m||o.__LT_HUB_MOUNT||"nav";return o.__ensureLTHubPromise=(async()=>{let{container:g}=await o.waitForContainerAndAnchor(b,h),{host:a,api:f}=(o.createHub||createHub)();if(p==="nav"){let n=M();n||await new Promise(d=>{let x=new MutationObserver(()=>{let v=M();v&&(x.disconnect(),n=v,d())});x.observe(document.documentElement,{childList:!0,subtree:!0})});let e=n&&n.closest("nav")||document.getElementById("navBar")||document.querySelector(".plex-navbar-container.navbar");if(!e)throw new Error("lt-ui-hub: navBar not found");let c=e.querySelector(":scope > .plex-navbar-title-container navbar-left")||null,s=e.querySelector(":scope > .lt-hub-row");s||(s=document.createElement("div"),s.className="lt-hub-row",s.style.display="block",s.style.boxSizing="border-box",s.style.width="100%",c?e.insertBefore(s,c):e.appendChild(s));let y=()=>{let d=getComputedStyle(e),x=parseFloat(d.paddingLeft)||0,v=parseFloat(d.paddingRight)||0,C=parseFloat(d.borderLeftWidth)||0,N=parseFloat(d.borderRightWidth)||0;s.style.marginLeft=x+C?`-${x+C}px`:"0",s.style.marginRight=v+N?`-${v+N}px`:"0",s.style.width=x+v+C+N?`calc(100% + ${x+v+C+N}px)`:"100%"};s.dataset.edgeApplied||(y(),window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(e,{attributes:!0,attributeFilter:["style","class"]}),s.dataset.edgeApplied="1"),a.parentNode!==s&&s.appendChild(a),a.setAttribute("data-variant","row"),Object.assign(a.style,{position:"static",top:"",left:"",right:"",width:"100%",maxWidth:"100%",zIndex:"auto",pointerEvents:"auto"}),k();try{let d=a.shadowRoot?.querySelector(".hub");d&&(d.style.width="100%")}catch{}let B=45;e.style.height="auto";let E=()=>{let d=Math.max(0,a.getBoundingClientRect().height||0)};requestAnimationFrame(()=>{E(),requestAnimationFrame(E),k()});try{document.fonts?.ready?.then(E)}catch{}window.addEventListener("resize",E,{passive:!0});try{new ResizeObserver(E).observe(a)}catch{}let _=!!document.querySelector(".plex-env-persistent-banner-container");if(0)var S,i,r,t}else{let n=g.querySelector(":scope > .plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content")||g,e=n.querySelector(":scope > .lt-hub-spacer");e||(e=document.createElement("div"),e.className="lt-hub-spacer",e.style.width="100%",e.style.height="0px",e.style.margin="0",e.style.padding="0",e.style.flex="0 0 auto",n.prepend(e)),e.nextSibling!==a&&(a.parentNode&&a.parentNode.removeChild(a),e.after(a));let c=()=>{let B=Math.max(0,a.getBoundingClientRect().height||0);document.documentElement.style.setProperty("--lt-hub-h",`${B}px`)},s=()=>{let B=document.documentElement,E=getComputedStyle(B),_=parseInt(E.getPropertyValue("--side-menu-persistent-banner-height"))||0,d=document.querySelector("#navBar"),x=d?Math.max(0,d.getBoundingClientRect().height||0):0,v=_+x;B.style.setProperty("--lt-fixed-top",`${v}px`)},y=()=>{c(),s()};requestAnimationFrame(()=>{y(),requestAnimationFrame(y),k()});try{document.fonts?.ready?.then(y)}catch{}window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(document.documentElement,{childList:!0,subtree:!0}),Object.assign(a.style,{position:"sticky",top:"0",left:"0",right:"0",width:"100%",zIndex:"10",pointerEvents:"auto"})}return o.ltUIHub=f,f})().finally(()=>{setTimeout(()=>{o.__ensureLTHubPromise=null},0)}),o.__ensureLTHubPromise}try{o.ensureLTHub=T}catch{}try{Promise.resolve().then(()=>o.ensureLTHub?.({mount:o.__LT_HUB_MOUNT||"nav"}).catch(()=>{}))}catch{}})();})();
;(function(g){try{if(typeof LTHub!=='undefined'){g.LTHub=LTHub;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
