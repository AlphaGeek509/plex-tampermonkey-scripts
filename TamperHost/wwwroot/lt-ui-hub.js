(()=>{(()=>{let s=typeof unsafeWindow<"u"?unsafeWindow:window;s.waitForContainerAndAnchor||(s.waitForContainerAndAnchor=function(p=15e3,h=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"]){return new Promise((w,m)=>{let u=()=>{let g=document.querySelector(".plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content-container")||document.body,r=h.map(f=>document.querySelector(f)).find(Boolean)||null;if(g)return w({container:g,beforeNode:r})};u();let l=new MutationObserver(u);l.observe(document.documentElement,{childList:!0,subtree:!0}),setTimeout(()=>{try{l.disconnect()}catch{}m(new Error("lt-ui-hub: Container/anchor not found"))},p)})});function P(){return document.querySelector("#navBar .navbar-right")||document.querySelector(".plex-navbar-container .navbar-right")}function A(){let E=document.querySelector(".plex-env-persistent-banner-container"),p=document.querySelector(".plex-persistent-banner-container"),h=E?E.offsetHeight:0,w=p?p.offsetHeight:0,m=document.documentElement,u=getComputedStyle(m).getPropertyValue("--side-menu-persistent-banner-height"),l=Number.parseFloat(u)||0;if(h>0){m.style.setProperty("--side-menu-persistent-banner-height",`${h}px`);return}p&&w===0&&l===0&&(p.style.height="50px",m.style.setProperty("--side-menu-persistent-banner-height","50px"))}s.createHub||(s.createHub=function(){let p=document.createElement("div");p.setAttribute("data-lt-hub","1");let h=p.attachShadow({mode:"open"}),w=document.createElement("style");w.textContent=`
        :host { all: initial; }
        .hub {
          box-sizing: border-box;
          width: 100%;
          background: var(--lt-hub-bg, #ffffff); /* default white, tokenized */
          border-bottom: 1px solid color-mix(in srgb, var(--lt-ink, #222) 8%, transparent);
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
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--lt-ink, #222) 12%, transparent);
          background: color-mix(in srgb, var(--lt-brand, #8b0b04) 6%, white);
          font-weight: 600;
          transition: background .18s ease, border-color .18s ease, box-shadow .18s ease;
        }

        /* Dark-on-hover (corporate-red tint) */
        .brand:hover {
          background: color-mix(in srgb, var(--lt-brand, #8b0b04) 12%, white);
          border-color: color-mix(in srgb, var(--lt-brand, #8b0b04) 24%, white);
          box-shadow: 0 2px 6px rgba(0,0,0,.08);
        }

        /* Keyboard accessibility highlight if the chip ever becomes focusable */
        .brand:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--lt-brand, #8b0b04) 35%, white);
          outline-offset: 2px;
        }

        /* Map global theme vars (from :root in theme.css) into the shadow tree */
        :host {
          --lt-brand: var(--brand-600);
          --lt-brand-700: var(--brand-700);
          --lt-ink: var(--ink);
          --lt-ink-muted: var(--ink-muted);
          --lt-ok: var(--ok);
          --lt-warn: var(--warn);
          --lt-err: var(--err);
          --lt-hub-bg: var(--hub-bg, #ffffff); /* optional: override from :root if needed */
          --lt-brand-icon: var(--brand-icon, url('https://monroeengineering.com/img/favicon.ico'));
        }

        /* Brand mark: prefer an icon image; fall back to a colored dot */
        .dot {
          width: 16px; height: 16px;
          border-radius: 4px;
          background-color: transparent;
          background-image: var(--lt-brand-icon, url('https://monroeengineering.com/img/favicon.ico'));
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          transition: filter .18s ease, box-shadow .18s ease, background-color .18s ease;
        }

        /* Slight emphasis on hover: tiny tint and crisper icon */
        .brand:hover .dot {
          background-color: color-mix(in srgb, var(--lt-brand, #8b0b04) 10%, transparent);
          filter: saturate(1.08) contrast(1.06);
          box-shadow: 0 1px 2px rgba(0,0,0,.10);
        }

        /* If you want a purely circular tint behind the icon, uncomment:
        .dot { border-radius: 999px; background-color: color-mix(in srgb, var(--lt-brand) 16%, transparent); }
        */

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
          display: inline-flex; align-items: center; gap: 8px;
          padding: 5px 12px;
          border-radius: 999px;
          font-weight: 600;
          font-size: 12px;
          border: 1px solid transparent;
          box-shadow: 0 4px 12px rgba(0,0,0,.16);
          animation: lt-pop-in .14s ease-out;
        }
        .status.success { background: var(--lt-ok);   color: #fff;  border-color: color-mix(in srgb, var(--lt-ok)   70%, black); }
        .status.info    { background: var(--lt-brand);color: #fff;  border-color: color-mix(in srgb, var(--lt-brand)70%, black); }
        .status.warn    { background: var(--lt-warn); color: #111;  border-color: color-mix(in srgb, var(--lt-warn) 50%, black); animation: lt-pop-in .14s ease-out, lt-pulse 1.1s ease-in-out 2; }
        .status.error   { background: var(--lt-err);  color: #fff;  border-color: color-mix(in srgb, var(--lt-err)  70%, black); animation: lt-pop-in .14s ease-out, lt-pulse 1.1s ease-in-out 2; }

        .status.success::before { content: "\u2713"; font-weight: 900; filter: drop-shadow(0 1px 0 rgba(0,0,0,.2)); }
        .status.info::before    { content: "\u2139"; font-weight: 900; filter: drop-shadow(0 1px 0 rgba(0,0,0,.2)); }
        .status.warn::before    { content: "\u26A0"; font-weight: 900; }
        .status.error::before   { content: "\u2716"; font-weight: 900; filter: drop-shadow(0 1px 0 rgba(0,0,0,.2)); }

        .status-wrap { display: inline-flex; align-items: center; gap: 8px; }

        @keyframes lt-pop-in { from { transform: scale(.98); opacity:.0; } to { transform: scale(1); opacity:1; } }
        @keyframes lt-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,.0);} 50% { box-shadow: 0 0 0 6px rgba(0,0,0,.06);} }

        .spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(0,0,0,.15); border-top-color: var(--lt-brand);
          animation: spin 800ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Body mount: page padding handled with CSS var (set by JS) */
        html, body { --lt-hub-h: 0px; }
        body.lt-hub-padded { padding-top: var(--lt-hub-h) !important; }
      `,h.appendChild(w);let m=document.createElement("div");m.className="hub";let u=document.createElement("div");u.className="left";let l=document.createElement("div");l.className="center";let b=document.createElement("div");b.className="right";let g=document.createElement("span");g.className="brand",g.innerHTML='<span class="dot"></span><span class="brand-text">OneMonroe</span>',u.appendChild(g);let r=document.createElement("span");r.className="status-slot",b.appendChild(r),m.append(u,l,b),h.appendChild(m);let f=5e3,H=(a,t)=>{let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");return e.className=`status ${t}`,e.textContent=a||"",n.appendChild(e),n},i={_shadow:h,registerButton(a="left",t){typeof a=="object"&&!t&&(t=a,a=t?.section||"left");let n=a==="right"?b:a==="center"?l:u,e=t?.el;return e?t?.id&&(e.dataset.id=t.id,t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel))):(e=document.createElement("button"),e.type="button",e.className="hbtn",t?.id&&(e.dataset.id=t.id),e.textContent=t?.label??"Action",t?.title&&(e.title=String(t.title)),t?.ariaLabel&&e.setAttribute("aria-label",String(t.ariaLabel)),typeof t?.onClick=="function"&&e.addEventListener("click",t.onClick),t?.disabled&&(e.disabled=!0)),n===b?b.insertBefore(e,r):n.appendChild(e),i},updateButton(a,t={}){let n=h.querySelector(`[data-id="${CSS.escape(a)}"]`);if(!n)return i;if(typeof t.label=="string"&&n.tagName==="BUTTON"&&(n.textContent=t.label),typeof t.title=="string"&&(n.title=t.title),typeof t.ariaLabel=="string"&&n.setAttribute("aria-label",t.ariaLabel),"disabled"in t&&n.tagName==="BUTTON"&&(n.disabled=!!t.disabled),typeof t.onClick=="function"&&n.tagName==="BUTTON"){let e=n.cloneNode(!0);e.addEventListener("click",t.onClick),e.dataset.id=a,n.replaceWith(e)}return i},remove(a){if(!a)return i;let t=h.querySelector(`[data-id="${CSS.escape(a)}"]`);return t&&t.parentNode&&t.parentNode.removeChild(t),i},clear(){return u.replaceChildren(),l.replaceChildren(),[...b.children].forEach(a=>{a!==r&&a.remove()}),r.replaceChildren(),i},list(){return[...u.children,...l.children,...b.children].map(t=>t.dataset?.id).filter(Boolean)},setStatus(a,t="info",n={}){r.replaceChildren(H(a,t));let e=!!n?.sticky,c=n?.ms??n?.timeout??f;return!e&&a&&setTimeout(()=>{try{r.isConnected&&r.replaceChildren()}catch{}},c),i},beginTask(a,t="info"){let n=document.createElement("span");n.className="status-wrap";let e=document.createElement("span");e.className="spinner";let c=document.createElement("span");return c.className=`status ${t}`,c.textContent=a||"Working\u2026",n.append(e,c),r.replaceChildren(n),{update(o){return typeof o=="string"&&(c.textContent=o),this},success(o="Done"){return c.className="status success",c.textContent=o,e.remove(),this},error(o="Error"){return c.className="status error",c.textContent=o,e.remove(),this},clear(){return r.replaceChildren(),this}}},notify(a,t,{ms:n=f,sticky:e=!1}={}){return i.setStatus(t,a,{ms:n,sticky:e}),i}};return{host:p,left:u,center:l,right:b,api:i}});async function T(E={}){let{timeoutMs:p=15e3,selectors:h=[".plex-actions-wrapper.plex-grid-actions",".plex-actions-wrapper"],theme:w=null,mount:m=null,disableModalElevate:u=!0}=E;if(s.ltUIHub)return s.ltUIHub;if(s.__ensureLTHubPromise)return s.__ensureLTHubPromise;let l=document.querySelector('[data-lt-hub="1"]');if(l&&s.ltUIHub){let g=(m||s.__LT_HUB_MOUNT||"nav")==="nav",r=l.getAttribute("data-variant")||"";if(g&&r!=="nav"){let f=document.querySelector("#navBar .navbar-right")||document.querySelector(".plex-navbar-container .navbar-right");if(f){let H=f.closest("#navBar, .plex-navbar-container")||document.getElementById("navBar")||document.querySelector(".plex-navbar-container");if(H){let i=H.querySelector(".lt-hub-row");i||(i=document.createElement("div"),i.className="lt-hub-row",i.style.display="block",i.style.boxSizing="border-box",i.style.width="100%",H.appendChild(i)),l.parentNode!==i&&i.appendChild(l),l.setAttribute("data-variant","nav"),Object.assign(l.style,{position:"static",top:"",left:"",right:"",width:"100%",maxWidth:"100%",zIndex:"auto",pointerEvents:"auto"})}}}return s.ltUIHub}let b=m||s.__LT_HUB_MOUNT||"nav";return s.__ensureLTHubPromise=(async()=>{let{container:g}=await s.waitForContainerAndAnchor(p,h),{host:r,api:f}=(s.createHub||createHub)();try{let n=getComputedStyle(document.documentElement).getPropertyValue("--brand-600").trim().toLowerCase();(!n||n==="#0b5fff")&&(r.style.setProperty("--brand-600","#8b0b04"),r.style.setProperty("--brand-700","#5c0a0a"),r.style.setProperty("--ok","#28a745"),r.style.setProperty("--warn","#ffc107"),r.style.setProperty("--err","#dc3545"))}catch{}if(b==="nav"){let n=P();n||await new Promise(d=>{let x=new MutationObserver(()=>{let v=P();v&&(x.disconnect(),n=v,d())});x.observe(document.documentElement,{childList:!0,subtree:!0})});let e=n&&n.closest("nav")||document.getElementById("navBar")||document.querySelector(".plex-navbar-container.navbar");if(!e)throw new Error("lt-ui-hub: navBar not found");let c=e.querySelector(":scope > .plex-navbar-title-container navbar-left")||null,o=e.querySelector(":scope > .lt-hub-row");o||(o=document.createElement("div"),o.className="lt-hub-row",o.style.display="block",o.style.boxSizing="border-box",o.style.width="100%",c?e.insertBefore(o,c):e.appendChild(o));let y=()=>{let d=getComputedStyle(e),x=parseFloat(d.paddingLeft)||0,v=parseFloat(d.paddingRight)||0,B=parseFloat(d.borderLeftWidth)||0,C=parseFloat(d.borderRightWidth)||0;o.style.marginLeft=x+B?`-${x+B}px`:"0",o.style.marginRight=v+C?`-${v+C}px`:"0",o.style.width=x+v+B+C?`calc(100% + ${x+v+B+C}px)`:"100%"};o.dataset.edgeApplied||(y(),window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(e,{attributes:!0,attributeFilter:["style","class"]}),o.dataset.edgeApplied="1"),r.parentNode!==o&&o.appendChild(r),r.setAttribute("data-variant","row"),Object.assign(r.style,{position:"static",top:"",left:"",right:"",width:"100%",maxWidth:"100%",zIndex:"auto",pointerEvents:"auto"}),A();try{let d=r.shadowRoot?.querySelector(".hub");d&&(d.style.width="100%")}catch{}let S=45;e.style.height="auto";let k=()=>{let d=Math.max(0,r.getBoundingClientRect().height||0)};requestAnimationFrame(()=>{k(),requestAnimationFrame(k),A()});try{document.fonts?.ready?.then(k)}catch{}window.addEventListener("resize",k,{passive:!0});try{new ResizeObserver(k).observe(r)}catch{}let M=!!document.querySelector(".plex-env-persistent-banner-container");if(0)var H,i,a,t}else{let n=g.querySelector(":scope > .plex-sidetabs-menu-page-content")||document.querySelector(".plex-sidetabs-menu-page-content")||g,e=n.querySelector(":scope > .lt-hub-spacer");e||(e=document.createElement("div"),e.className="lt-hub-spacer",e.style.width="100%",e.style.height="0px",e.style.margin="0",e.style.padding="0",e.style.flex="0 0 auto",n.prepend(e)),e.nextSibling!==r&&(r.parentNode&&r.parentNode.removeChild(r),e.after(r));let c=()=>{let S=Math.max(0,r.getBoundingClientRect().height||0);document.documentElement.style.setProperty("--lt-hub-h",`${S}px`)},o=()=>{let S=document.documentElement,k=getComputedStyle(S),M=parseInt(k.getPropertyValue("--side-menu-persistent-banner-height"))||0,d=document.querySelector("#navBar"),x=d?Math.max(0,d.getBoundingClientRect().height||0):0,v=M+x;S.style.setProperty("--lt-fixed-top",`${v}px`)},y=()=>{c(),o()};requestAnimationFrame(()=>{y(),requestAnimationFrame(y),A()});try{document.fonts?.ready?.then(y)}catch{}window.addEventListener("resize",y,{passive:!0}),new MutationObserver(y).observe(document.documentElement,{childList:!0,subtree:!0}),Object.assign(r.style,{position:"sticky",top:"0",left:"0",right:"0",width:"100%",zIndex:"10",pointerEvents:"auto"})}return s.ltUIHub=f,f})().finally(()=>{setTimeout(()=>{s.__ensureLTHubPromise=null},0)}),s.__ensureLTHubPromise}try{s.ensureLTHub=T}catch{}try{Promise.resolve().then(()=>s.ensureLTHub?.({mount:s.__LT_HUB_MOUNT||"nav"}).catch(()=>{}))}catch{}})();})();
;(function(g){try{if(typeof LTHub!=='undefined'){g.LTHub=LTHub;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
