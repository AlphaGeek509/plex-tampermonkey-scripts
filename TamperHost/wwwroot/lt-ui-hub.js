(() => {
  // src/shared/lt-ui-hub.js
  (() => {
    const ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (!ROOT.waitForContainerAndAnchor) {
      ROOT.waitForContainerAndAnchor = function waitForContainerAndAnchor(ms = 15e3, sels = [".plex-actions-wrapper.plex-grid-actions", ".plex-actions-wrapper"]) {
        return new Promise((resolve, reject) => {
          const tryFind = () => {
            const content = document.querySelector(".plex-sidetabs-menu-page-content");
            const container = content || document.querySelector(".plex-sidetabs-menu-page-content-container") || document.body;
            const beforeNode = sels.map((s) => document.querySelector(s)).find(Boolean) || null;
            if (container) return resolve({ container, beforeNode });
          };
          tryFind();
          const obs = new MutationObserver(tryFind);
          obs.observe(document.documentElement, { childList: true, subtree: true });
          setTimeout(() => {
            try {
              obs.disconnect();
            } catch {
            }
            reject(new Error("lt-ui-hub: Container/anchor not found"));
          }, ms);
        });
      };
    }
    function findNavbarRight() {
      return document.querySelector("#navBar .navbar-right") || document.querySelector(".plex-navbar-container .navbar-right");
    }
    function normalizePersistentBanner() {
      const envBanner = document.querySelector(".plex-env-persistent-banner-container");
      const liveBanner = document.querySelector(".plex-persistent-banner-container");
      const envH = envBanner ? envBanner.offsetHeight : 0;
      const liveH = liveBanner ? liveBanner.offsetHeight : 0;
      const root = document.documentElement;
      const cssVarStr = getComputedStyle(root).getPropertyValue("--side-menu-persistent-banner-height");
      const cssVar = Number.parseFloat(cssVarStr) || 0;
      if (envH > 0) {
        root.style.setProperty("--side-menu-persistent-banner-height", `${envH}px`);
        return;
      }
      if (liveBanner && liveH === 0 && cssVar === 0) {
        const FALLBACK = 50;
        liveBanner.style.height = `${FALLBACK}px`;
        root.style.setProperty("--side-menu-persistent-banner-height", `${FALLBACK}px`);
      }
    }
    if (!ROOT.createHub) {
      ROOT.createHub = function createHub2() {
        const host = document.createElement("div");
        host.setAttribute("data-lt-hub", "1");
        const root = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
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
      `;
        root.appendChild(style);
        const wrap = document.createElement("div");
        wrap.className = "hub";
        const left = document.createElement("div");
        left.className = "left";
        const center = document.createElement("div");
        center.className = "center";
        const right = document.createElement("div");
        right.className = "right";
        const brand = document.createElement("span");
        brand.className = "brand";
        brand.innerHTML = '<span class="dot"></span><span class="brand-text">OneMonroe</span>';
        left.appendChild(brand);
        const statusSlot = document.createElement("span");
        statusSlot.className = "status-slot";
        right.appendChild(statusSlot);
        wrap.append(left, center, right);
        root.appendChild(wrap);
        const DEFAULT_PILL_RESET_MS = 5e3;
        const mkStatus = (text, tone) => {
          const w = document.createElement("span");
          w.className = "status-wrap";
          const s = document.createElement("span");
          s.className = `status ${tone}`;
          s.textContent = text || "";
          w.appendChild(s);
          return w;
        };
        const api = {
          _shadow: root,
          registerButton(side = "left", def) {
            if (typeof side === "object" && !def) {
              def = side;
              side = def?.section || "left";
            }
            const target = side === "right" ? right : side === "center" ? center : left;
            let el = def?.el;
            if (!el) {
              el = document.createElement("button");
              el.type = "button";
              el.className = "hbtn";
              if (def?.id) el.dataset.id = def.id;
              el.textContent = def?.label ?? "Action";
              if (def?.title) el.title = String(def.title);
              if (def?.ariaLabel) el.setAttribute("aria-label", String(def.ariaLabel));
              if (typeof def?.onClick === "function") el.addEventListener("click", def.onClick);
              if (def?.disabled) el.disabled = true;
            } else if (def?.id) {
              el.dataset.id = def.id;
              if (def?.title) el.title = String(def.title);
              if (def?.ariaLabel) el.setAttribute("aria-label", String(def.ariaLabel));
            }
            if (target === right) {
              right.insertBefore(el, statusSlot);
            } else {
              target.appendChild(el);
            }
            return api;
          },
          updateButton(id, patch = {}) {
            const n = root.querySelector(`[data-id="${CSS.escape(id)}"]`);
            if (!n) return api;
            if (typeof patch.label === "string" && n.tagName === "BUTTON") {
              n.textContent = patch.label;
            }
            if (typeof patch.title === "string") n.title = patch.title;
            if (typeof patch.ariaLabel === "string") n.setAttribute("aria-label", patch.ariaLabel);
            if ("disabled" in patch && n.tagName === "BUTTON") {
              n.disabled = !!patch.disabled;
            }
            if (typeof patch.onClick === "function" && n.tagName === "BUTTON") {
              const clone = n.cloneNode(true);
              clone.addEventListener("click", patch.onClick);
              clone.dataset.id = id;
              n.replaceWith(clone);
            }
            return api;
          },
          remove(id) {
            if (!id) return api;
            const n = root.querySelector(`[data-id="${CSS.escape(id)}"]`);
            if (n && n.parentNode) n.parentNode.removeChild(n);
            return api;
          },
          clear() {
            left.replaceChildren();
            center.replaceChildren();
            [...right.children].forEach((n) => {
              if (n !== statusSlot) n.remove();
            });
            statusSlot.replaceChildren();
            return api;
          },
          list() {
            const all = [...left.children, ...center.children, ...right.children];
            return all.map((n) => n.dataset?.id).filter(Boolean);
          },
          setStatus(text, tone = "info", opts = {}) {
            statusSlot.replaceChildren(mkStatus(text, tone));
            const sticky = !!opts?.sticky;
            const ms = opts?.ms ?? opts?.timeout ?? DEFAULT_PILL_RESET_MS;
            if (!sticky && text) {
              setTimeout(() => {
                try {
                  if (statusSlot.isConnected) statusSlot.replaceChildren();
                } catch {
                }
              }, ms);
            }
            return api;
          },
          beginTask(label, tone = "info") {
            const wrapNode = document.createElement("span");
            wrapNode.className = "status-wrap";
            const spin = document.createElement("span");
            spin.className = "spinner";
            const lab = document.createElement("span");
            lab.className = `status ${tone}`;
            lab.textContent = label || "Working\u2026";
            wrapNode.append(spin, lab);
            statusSlot.replaceChildren(wrapNode);
            return {
              update(text) {
                if (typeof text === "string") lab.textContent = text;
                return this;
              },
              success(text = "Done") {
                lab.className = "status success";
                lab.textContent = text;
                spin.remove();
                return this;
              },
              error(text = "Error") {
                lab.className = "status error";
                lab.textContent = text;
                spin.remove();
                return this;
              },
              clear() {
                statusSlot.replaceChildren();
                return this;
              }
            };
          },
          notify(kind, text, { ms = DEFAULT_PILL_RESET_MS, sticky = false } = {}) {
            api.setStatus(text, kind, { ms, sticky });
            return api;
          }
        };
        return { host, left, center, right, api };
      };
    }
    async function _ensureLTHubInternal(opts = {}) {
      const {
        timeoutMs = 15e3,
        selectors = [".plex-actions-wrapper.plex-grid-actions", ".plex-actions-wrapper"],
        theme = null,
        // reserved for future theme injection
        mount: mountOpt = null,
        // 'nav' | 'body' | null
        disableModalElevate = true
        // reserved for legacy behavior we removed
      } = opts;
      if (ROOT.ltUIHub) return ROOT.ltUIHub;
      if (ROOT.__ensureLTHubPromise) return ROOT.__ensureLTHubPromise;
      const preExistingHost = document.querySelector('[data-lt-hub="1"]');
      if (preExistingHost && ROOT.ltUIHub) {
        const wantNav = (mountOpt || ROOT.__LT_HUB_MOUNT || "nav") === "nav";
        const cur = preExistingHost.getAttribute("data-variant") || "";
        if (wantNav && cur !== "nav") {
          let navRight = document.querySelector("#navBar .navbar-right") || document.querySelector(".plex-navbar-container .navbar-right");
          if (navRight) {
            const navBar = navRight.closest("#navBar, .plex-navbar-container") || document.getElementById("navBar") || document.querySelector(".plex-navbar-container");
            if (navBar) {
              let row = navBar.querySelector(".lt-hub-row");
              if (!row) {
                row = document.createElement("div");
                row.className = "lt-hub-row";
                row.style.display = "block";
                row.style.boxSizing = "border-box";
                row.style.width = "100%";
                navBar.appendChild(row);
              }
              if (preExistingHost.parentNode !== row) row.appendChild(preExistingHost);
              preExistingHost.setAttribute("data-variant", "nav");
              Object.assign(preExistingHost.style, {
                position: "static",
                top: "",
                left: "",
                right: "",
                width: "100%",
                maxWidth: "100%",
                zIndex: "auto",
                pointerEvents: "auto"
              });
            }
          }
        }
        return ROOT.ltUIHub;
      }
      const desiredMount = mountOpt || ROOT.__LT_HUB_MOUNT || "nav";
      ROOT.__ensureLTHubPromise = (async () => {
        const { container } = await ROOT.waitForContainerAndAnchor(timeoutMs, selectors);
        const { host, api } = (ROOT.createHub || createHub)();
        try {
          const rootBrand = getComputedStyle(document.documentElement).getPropertyValue("--brand-600").trim().toLowerCase();
          if (!rootBrand || rootBrand === "#0b5fff") {
            host.style.setProperty("--brand-600", "#8b0b04");
            host.style.setProperty("--brand-700", "#5c0a0a");
            host.style.setProperty("--ok", "#28a745");
            host.style.setProperty("--warn", "#ffc107");
            host.style.setProperty("--err", "#dc3545");
          }
        } catch {
        }
        if (desiredMount === "nav") {
          let navRight = findNavbarRight();
          if (!navRight) {
            await new Promise((resolve) => {
              const obs = new MutationObserver(() => {
                const nr = findNavbarRight();
                if (!nr) return;
                obs.disconnect();
                navRight = nr;
                resolve();
              });
              obs.observe(document.documentElement, { childList: true, subtree: true });
            });
          }
          const navBar = navRight && navRight.closest("nav") || document.getElementById("navBar") || document.querySelector(".plex-navbar-container.navbar");
          if (!navBar) throw new Error("lt-ui-hub: navBar not found");
          const beforeNode = navBar.querySelector(":scope > .plex-navbar-title-container navbar-left") || null;
          let row = navBar.querySelector(":scope > .lt-hub-row");
          if (!row) {
            row = document.createElement("div");
            row.className = "lt-hub-row";
            row.style.display = "block";
            row.style.boxSizing = "border-box";
            row.style.width = "100%";
            if (beforeNode) navBar.insertBefore(row, beforeNode);
            else navBar.appendChild(row);
          }
          const applyEdgeToEdge = () => {
            const cs = getComputedStyle(navBar);
            const pl = parseFloat(cs.paddingLeft) || 0;
            const pr = parseFloat(cs.paddingRight) || 0;
            const bl = parseFloat(cs.borderLeftWidth) || 0;
            const br = parseFloat(cs.borderRightWidth) || 0;
            row.style.marginLeft = pl + bl ? `-${pl + bl}px` : "0";
            row.style.marginRight = pr + br ? `-${pr + br}px` : "0";
            row.style.width = pl + pr + bl + br ? `calc(100% + ${pl + pr + bl + br}px)` : "100%";
          };
          if (!row.dataset.edgeApplied) {
            applyEdgeToEdge();
            window.addEventListener("resize", applyEdgeToEdge, { passive: true });
            new MutationObserver(applyEdgeToEdge).observe(navBar, { attributes: true, attributeFilter: ["style", "class"] });
            row.dataset.edgeApplied = "1";
          }
          if (host.parentNode !== row) row.appendChild(host);
          host.setAttribute("data-variant", "row");
          Object.assign(host.style, {
            position: "static",
            top: "",
            left: "",
            right: "",
            width: "100%",
            maxWidth: "100%",
            zIndex: "auto",
            pointerEvents: "auto"
          });
          normalizePersistentBanner();
          try {
            const hubRoot = host.shadowRoot?.querySelector(".hub");
            if (hubRoot) hubRoot.style.width = "100%";
          } catch {
          }
          const BASE_H = 45;
          navBar.style.height = "auto";
          const updateMinHeight = () => {
            const h = Math.max(0, host.getBoundingClientRect().height || 0);
          };
          requestAnimationFrame(() => {
            updateMinHeight();
            requestAnimationFrame(updateMinHeight);
            normalizePersistentBanner();
          });
          try {
            document.fonts?.ready?.then(updateMinHeight);
          } catch {
          }
          window.addEventListener("resize", updateMinHeight, { passive: true });
          try {
            const ro = new ResizeObserver(updateMinHeight);
            ro.observe(host);
          } catch {
          }
          const hasPersistentBanner = !!document.querySelector(".plex-env-persistent-banner-container");
          if (false) {
            let getPx2 = function(v) {
              if (!v) return null;
              const n = parseFloat(v);
              return Number.isFinite(n) ? n : null;
            }, captureBase2 = function(el) {
              const ds = el.dataset;
              if (!ds.ltBaseH && el.style.height) ds.ltBaseH = el.style.height;
              if (!ds.ltBaseMax && el.style.maxHeight) ds.ltBaseMax = el.style.maxHeight;
              if (!ds.ltBaseMin && el.style.minHeight) ds.ltBaseMin = el.style.minHeight;
            }, applyExtra2 = function(el, extra) {
              captureBase2(el);
              const ds = el.dataset;
              const baseH = getPx2(ds.ltBaseH) ?? getPx2(el.style.height);
              const baseMax = getPx2(ds.ltBaseMax) ?? getPx2(el.style.maxHeight);
              const baseMin = getPx2(ds.ltBaseMin) ?? getPx2(el.style.minHeight);
              if (baseH != null) el.style.height = `${Math.max(0, baseH + extra)}px`;
              if (baseMax != null) el.style.maxHeight = `${Math.max(0, baseMax + extra)}px`;
              if (baseMin != null) el.style.minHeight = `${Math.max(0, baseMin + extra)}px`;
            }, adjustPageHeights2 = function() {
              const navH = Math.max(0, navBar.getBoundingClientRect().height || 0);
              const extra = Math.max(0, navH - BASE_NAV_H);
              if (!extra) return;
              PAGE_SEL.forEach((sel) => {
                document.querySelectorAll(sel).forEach((el) => applyExtra2(el, extra));
              });
            };
            var getPx = getPx2, captureBase = captureBase2, applyExtra = applyExtra2, adjustPageHeights = adjustPageHeights2;
            const BASE_NAV_H = 45;
            const PAGE_SEL = [
              ".plex-sidetabs-menu-page",
              ".plex-sidetabs-menu-page-content-container",
              ".plex-sidetabs-menu-page-content"
            ];
            requestAnimationFrame(() => {
              adjustPageHeights2();
              requestAnimationFrame(adjustPageHeights2);
              normalizePersistentBanner();
            });
            window.addEventListener("resize", adjustPageHeights2, { passive: true });
            try {
              const r2 = new ResizeObserver(adjustPageHeights2);
              r2.observe(navBar);
            } catch {
            }
            const mo = new MutationObserver((muts) => {
              let hit = false;
              for (const m of muts) {
                if (m.type === "attributes" && m.attributeName === "style") {
                  hit = true;
                  break;
                }
                if (m.type === "childList") {
                  hit = true;
                  break;
                }
              }
              if (hit) adjustPageHeights2();
            });
            mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
          }
        } else {
          const contentNode = container.querySelector(":scope > .plex-sidetabs-menu-page-content") || document.querySelector(".plex-sidetabs-menu-page-content") || container;
          let spacer = contentNode.querySelector(":scope > .lt-hub-spacer");
          if (!spacer) {
            spacer = document.createElement("div");
            spacer.className = "lt-hub-spacer";
            spacer.style.width = "100%";
            spacer.style.height = "0px";
            spacer.style.margin = "0";
            spacer.style.padding = "0";
            spacer.style.flex = "0 0 auto";
            contentNode.prepend(spacer);
          }
          if (spacer.nextSibling !== host) {
            if (host.parentNode) host.parentNode.removeChild(host);
            spacer.after(host);
          }
          const setHubH = () => {
            const h = Math.max(0, host.getBoundingClientRect().height || 0);
            document.documentElement.style.setProperty("--lt-hub-h", `${h}px`);
          };
          const computeChromeTop = () => {
            const doc = document.documentElement;
            const css = getComputedStyle(doc);
            const bannerH = parseInt(css.getPropertyValue("--side-menu-persistent-banner-height")) || 0;
            const nav = document.querySelector("#navBar");
            const navH = nav ? Math.max(0, nav.getBoundingClientRect().height || 0) : 0;
            const chromeTop = bannerH + navH;
            doc.style.setProperty("--lt-fixed-top", `${chromeTop}px`);
          };
          const recalc = () => {
            setHubH();
            computeChromeTop();
          };
          requestAnimationFrame(() => {
            recalc();
            requestAnimationFrame(recalc);
            normalizePersistentBanner();
          });
          try {
            document.fonts?.ready?.then(recalc);
          } catch {
          }
          window.addEventListener("resize", recalc, { passive: true });
          new MutationObserver(recalc).observe(document.documentElement, { childList: true, subtree: true });
          Object.assign(host.style, {
            position: "sticky",
            top: "0",
            left: "0",
            right: "0",
            width: "100%",
            zIndex: "10",
            // above content, below modals
            pointerEvents: "auto"
          });
        }
        ROOT.ltUIHub = api;
        return api;
      })().finally(() => {
        setTimeout(() => {
          ROOT.__ensureLTHubPromise = null;
        }, 0);
      });
      return ROOT.__ensureLTHubPromise;
    }
    try {
      ROOT.ensureLTHub = _ensureLTHubInternal;
    } catch {
    }
    try {
      Promise.resolve().then(() => ROOT.ensureLTHub?.({ mount: ROOT.__LT_HUB_MOUNT || "nav" }).catch(() => {
      }));
    } catch {
    }
  })();
})();
;(function(g){try{if(typeof LTHub!=='undefined'){g.LTHub=LTHub;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXVpLWh1Yi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXG4oKCkgPT4ge1xuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gSG9pc3RlZCwgc2hhcmVkIGhlbHBlcnMgKHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBpZiAoIVJPT1Qud2FpdEZvckNvbnRhaW5lckFuZEFuY2hvcikge1xuICAgICAgICBST09ULndhaXRGb3JDb250YWluZXJBbmRBbmNob3IgPSBmdW5jdGlvbiB3YWl0Rm9yQ29udGFpbmVyQW5kQW5jaG9yKFxuICAgICAgICAgICAgbXMgPSAxNTAwMCxcbiAgICAgICAgICAgIHNlbHMgPSBbJy5wbGV4LWFjdGlvbnMtd3JhcHBlci5wbGV4LWdyaWQtYWN0aW9ucycsICcucGxleC1hY3Rpb25zLXdyYXBwZXInXVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHJ5RmluZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUHJlZmVyIHBhZ2UgY29udGVudDsgZmFsbCBiYWNrIHRvIHdyYXBwZXI7IGxhc3QgcmVzb3J0IGJvZHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50IHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBCYWNrLWNvbXBhdDogZXhwb3NlIGFuIGFuY2hvciBpZiBvbmUgZXhpc3RzIChub3QgdXNlZCBieSBtb2Rlcm4gaW5zZXJ0KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWZvcmVOb2RlID0gc2Vscy5tYXAocyA9PiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHMpKS5maW5kKEJvb2xlYW4pIHx8IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRhaW5lcikgcmV0dXJuIHJlc29sdmUoeyBjb250YWluZXIsIGJlZm9yZU5vZGUgfSk7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHRyeUZpbmQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0cnlGaW5kKTtcbiAgICAgICAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IG9icy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2x0LXVpLWh1YjogQ29udGFpbmVyL2FuY2hvciBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfSwgbXMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE5hdmJhclJpZ2h0KCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gTm9ybWFsaXplIHBlcnNpc3RlbnQgYmFubmVyIGhlaWdodCBhdCBydW50aW1lIHNvIFBST0QgbWF0Y2hlcyBURVNULlxuICAgIC8vIFRFU1Q6IC5wbGV4LWVudi1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgXHUyMjQ4IDUwcHhcbiAgICAvLyBQUk9EOiAucGxleC1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgZXhpc3RzIGJ1dCBpcyBvZnRlbiAwcHhcbiAgICBmdW5jdGlvbiBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCkge1xuICAgICAgICBjb25zdCBlbnZCYW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1lbnYtcGVyc2lzdGVudC1iYW5uZXItY29udGFpbmVyJyk7IC8vIFRFU1RcbiAgICAgICAgY29uc3QgbGl2ZUJhbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXBlcnNpc3RlbnQtYmFubmVyLWNvbnRhaW5lcicpOyAgICAgLy8gUFJPRFxuXG4gICAgICAgIGNvbnN0IGVudkggPSBlbnZCYW5uZXIgPyBlbnZCYW5uZXIub2Zmc2V0SGVpZ2h0IDogMDtcbiAgICAgICAgY29uc3QgbGl2ZUggPSBsaXZlQmFubmVyID8gbGl2ZUJhbm5lci5vZmZzZXRIZWlnaHQgOiAwO1xuXG4gICAgICAgIC8vIFJlYWQgY3VycmVudCBDU1MgdmFyIChmcmFtZXdvcmsgc2V0cyAwIGJ5IGRlZmF1bHQgaW4gYm90aCB0aGVtZXMpLlxuICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgICAgICBjb25zdCBjc3NWYXJTdHIgPSBnZXRDb21wdXRlZFN0eWxlKHJvb3QpLmdldFByb3BlcnR5VmFsdWUoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcpO1xuICAgICAgICBjb25zdCBjc3NWYXIgPSBOdW1iZXIucGFyc2VGbG9hdChjc3NWYXJTdHIpIHx8IDA7XG5cbiAgICAgICAgLy8gSWYgVEVTVCBhbHJlYWR5IGhhcyBhIHJlYWwgYmFubmVyLCBtaXJyb3IgdGhhdCB2YWx1ZSBpbnRvIHRoZSBDU1MgdmFyIGFuZCBleGl0LlxuICAgICAgICBpZiAoZW52SCA+IDApIHtcbiAgICAgICAgICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcsIGAke2Vudkh9cHhgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIFBST0QgYmFubmVyIGV4aXN0cyBidXQgY29udHJpYnV0ZXMgMCBhbmQgdGhlIHZhciBpcyAwLCBsaWZ0IGl0IHRvIDUwIChvYnNlcnZlZCBURVNUIGJhc2VsaW5lKS5cbiAgICAgICAgaWYgKGxpdmVCYW5uZXIgJiYgbGl2ZUggPT09IDAgJiYgY3NzVmFyID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBGQUxMQkFDSyA9IDUwO1xuICAgICAgICAgICAgbGl2ZUJhbm5lci5zdHlsZS5oZWlnaHQgPSBgJHtGQUxMQkFDS31weGA7XG4gICAgICAgICAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXNpZGUtbWVudS1wZXJzaXN0ZW50LWJhbm5lci1oZWlnaHQnLCBgJHtGQUxMQkFDS31weGApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBpZiAoIVJPT1QuY3JlYXRlSHViKSB7XG4gICAgICAgIFJPT1QuY3JlYXRlSHViID0gZnVuY3Rpb24gY3JlYXRlSHViKCkge1xuICAgICAgICAgICAgLy8gSG9zdCBlbGVtZW50ICgrc2hhZG93KVxuICAgICAgICAgICAgY29uc3QgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgaG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbHQtaHViJywgJzEnKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBob3N0LmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdvcGVuJyB9KTtcblxuICAgICAgICAgICAgLy8gU3R5bGVzICh2YWxpZCBDU1Mgb25seSlcbiAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICA6aG9zdCB7IGFsbDogaW5pdGlhbDsgfVxuICAgICAgICAuaHViIHtcbiAgICAgICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgICAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgICAgIGJhY2tncm91bmQ6IHZhcigtLWx0LWh1Yi1iZywgI2ZmZmZmZik7IC8qIGRlZmF1bHQgd2hpdGUsIHRva2VuaXplZCAqL1xuICAgICAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtaW5rLCAjMjIyKSA4JSwgdHJhbnNwYXJlbnQpO1xuICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDhweCByZ2JhKDAsMCwwLC4wNik7XG4gICAgICAgICAgcGFkZGluZzogOHB4IDEycHg7XG4gICAgICAgICAgZGlzcGxheTogZ3JpZDtcbiAgICAgICAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciBhdXRvIDFmcjtcbiAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgIGdhcDogOHB4O1xuICAgICAgICAgIGZvbnQ6IDEzcHggc3lzdGVtLXVpLC1hcHBsZS1zeXN0ZW0sU2Vnb2UgVUksUm9ib3RvLHNhbnMtc2VyaWY7XG4gICAgICAgIH1cbiAgICAgICAgOmhvc3QoW2RhdGEtZWxldmF0ZWQ9XCIxXCJdKSAuaHViIHsgYm94LXNoYWRvdzogMCA2cHggMThweCByZ2JhKDAsMCwwLC4xOCk7IH1cblxuICAgICAgICAubGVmdCwgLmNlbnRlciwgLnJpZ2h0IHsgZGlzcGxheTogaW5saW5lLWZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyB9XG4gICAgICAgIC5sZWZ0ICAgeyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtc3RhcnQ7IH1cbiAgICAgICAgLmNlbnRlciB7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBmbGV4LXdyYXA6IHdyYXA7IH1cbiAgICAgICAgLnJpZ2h0ICB7IGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7IH1cblxuICAgICAgICAvKiBOYXZiYXIgdmFyaWFudCByZW5kZXJzIGlubGluZTsgbm8gcGFnZSBsYXlvdXQgYWRqdXN0bWVudHMgKi9cbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLmh1YiB7XG4gICAgICAgICAgYm9yZGVyOiAwOyBib3gtc2hhZG93OiBub25lOyBwYWRkaW5nOiAwO1xuICAgICAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4OyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IG5vbmU7IGdhcDogOHB4O1xuICAgICAgICB9XG4gICAgICAgIDpob3N0KFtkYXRhLXZhcmlhbnQ9XCJuYXZcIl0pIC5sZWZ0LFxuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSAuY2VudGVyLFxuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSAucmlnaHQgeyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgfVxuICAgICAgICAvKiBLZWVwIGJyYW5kIHZpc2libGUgaW4gbmF2IHRvbyAoY2hhbmdlIHRvICdub25lJyB0byBoaWRlKSAqL1xuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSAuYnJhbmQgeyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgfVxuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSBidXR0b24uaGJ0biB7IHBhZGRpbmc6IDRweCAxMHB4OyB9XG4gICAgICAgIC5icmFuZCB7XG4gICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4O1xuICAgICAgICAgIHBhZGRpbmc6IDRweCA4cHg7XG4gICAgICAgICAgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWluaywgIzIyMikgMTIlLCB0cmFuc3BhcmVudCk7XG4gICAgICAgICAgYmFja2dyb3VuZDogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kLCAjOGIwYjA0KSA2JSwgd2hpdGUpO1xuICAgICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAuMThzIGVhc2UsIGJveC1zaGFkb3cgLjE4cyBlYXNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLyogRGFyay1vbi1ob3ZlciAoY29ycG9yYXRlLXJlZCB0aW50KSAqL1xuICAgICAgICAuYnJhbmQ6aG92ZXIge1xuICAgICAgICAgIGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1sdC1icmFuZCwgIzhiMGIwNCkgMTIlLCB3aGl0ZSk7XG4gICAgICAgICAgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQsICM4YjBiMDQpIDI0JSwgd2hpdGUpO1xuICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDZweCByZ2JhKDAsMCwwLC4wOCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBLZXlib2FyZCBhY2Nlc3NpYmlsaXR5IGhpZ2hsaWdodCBpZiB0aGUgY2hpcCBldmVyIGJlY29tZXMgZm9jdXNhYmxlICovXG4gICAgICAgIC5icmFuZDpmb2N1cy12aXNpYmxlIHtcbiAgICAgICAgICBvdXRsaW5lOiAycHggc29saWQgY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kLCAjOGIwYjA0KSAzNSUsIHdoaXRlKTtcbiAgICAgICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgICAgICB9XG5cbiAgICAgICAgLyogTWFwIGdsb2JhbCB0aGVtZSB2YXJzIChmcm9tIDpyb290IGluIHRoZW1lLmNzcykgaW50byB0aGUgc2hhZG93IHRyZWUgKi9cbiAgICAgICAgOmhvc3Qge1xuICAgICAgICAgIC0tbHQtYnJhbmQ6IHZhcigtLWJyYW5kLTYwMCk7XG4gICAgICAgICAgLS1sdC1icmFuZC03MDA6IHZhcigtLWJyYW5kLTcwMCk7XG4gICAgICAgICAgLS1sdC1pbms6IHZhcigtLWluayk7XG4gICAgICAgICAgLS1sdC1pbmstbXV0ZWQ6IHZhcigtLWluay1tdXRlZCk7XG4gICAgICAgICAgLS1sdC1vazogdmFyKC0tb2spO1xuICAgICAgICAgIC0tbHQtd2FybjogdmFyKC0td2Fybik7XG4gICAgICAgICAgLS1sdC1lcnI6IHZhcigtLWVycik7XG4gICAgICAgICAgLS1sdC1odWItYmc6IHZhcigtLWh1Yi1iZywgI2ZmZmZmZik7IC8qIG9wdGlvbmFsOiBvdmVycmlkZSBmcm9tIDpyb290IGlmIG5lZWRlZCAqL1xuICAgICAgICAgIC0tbHQtYnJhbmQtaWNvbjogdmFyKC0tYnJhbmQtaWNvbiwgdXJsKCdodHRwczovL21vbnJvZWVuZ2luZWVyaW5nLmNvbS9pbWcvZmF2aWNvbi5pY28nKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBCcmFuZCBtYXJrOiBwcmVmZXIgYW4gaWNvbiBpbWFnZTsgZmFsbCBiYWNrIHRvIGEgY29sb3JlZCBkb3QgKi9cbiAgICAgICAgLmRvdCB7XG4gICAgICAgICAgd2lkdGg6IDE2cHg7IGhlaWdodDogMTZweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQ7XG4gICAgICAgICAgYmFja2dyb3VuZC1pbWFnZTogdmFyKC0tbHQtYnJhbmQtaWNvbiwgdXJsKCdodHRwczovL21vbnJvZWVuZ2luZWVyaW5nLmNvbS9pbWcvZmF2aWNvbi5pY28nKSk7XG4gICAgICAgICAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtcbiAgICAgICAgICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiBjZW50ZXI7XG4gICAgICAgICAgYmFja2dyb3VuZC1zaXplOiBjb250YWluO1xuICAgICAgICAgIHRyYW5zaXRpb246IGZpbHRlciAuMThzIGVhc2UsIGJveC1zaGFkb3cgLjE4cyBlYXNlLCBiYWNrZ3JvdW5kLWNvbG9yIC4xOHMgZWFzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFNsaWdodCBlbXBoYXNpcyBvbiBob3ZlcjogdGlueSB0aW50IGFuZCBjcmlzcGVyIGljb24gKi9cbiAgICAgICAgLmJyYW5kOmhvdmVyIC5kb3Qge1xuICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1sdC1icmFuZCwgIzhiMGIwNCkgMTAlLCB0cmFuc3BhcmVudCk7XG4gICAgICAgICAgZmlsdGVyOiBzYXR1cmF0ZSgxLjA4KSBjb250cmFzdCgxLjA2KTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDFweCAycHggcmdiYSgwLDAsMCwuMTApO1xuICAgICAgICB9XG5cbiAgICAgICAgLyogSWYgeW91IHdhbnQgYSBwdXJlbHkgY2lyY3VsYXIgdGludCBiZWhpbmQgdGhlIGljb24sIHVuY29tbWVudDpcbiAgICAgICAgLmRvdCB7IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBiYWNrZ3JvdW5kLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDE2JSwgdHJhbnNwYXJlbnQpOyB9XG4gICAgICAgICovXG5cbiAgICAgICAgLyogQnV0dG9uIHN5c3RlbTogcHJpbWFyeSAvIGdob3N0LCB3aXRoIGFjY2Vzc2libGUgZm9jdXMgKyBob3ZlciBzdGF0ZXMgKi9cbiAgICAgICAgYnV0dG9uLmhidG4ge1xuICAgICAgICAgIGFsbDogdW5zZXQ7XG4gICAgICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgICAgICBwYWRkaW5nOiA4cHggMTJweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgICAgIGJhY2tncm91bmQ6IHZhcigtLWx0LWJyYW5kKTtcbiAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDFweCAzcHggcmdiYSgwLDAsMCwuMDgpO1xuICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIC4xOHMgZWFzZSwgdHJhbnNmb3JtIC4wNnMgZWFzZSwgYm94LXNoYWRvdyAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAuMThzIGVhc2UsIGNvbG9yIC4xOHMgZWFzZTtcbiAgICAgICAgfVxuICAgICAgICBidXR0b24uaGJ0bjpob3ZlciB7XG4gICAgICAgICAgYmFja2dyb3VuZDogdmFyKC0tbHQtYnJhbmQtNzAwKTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwuMTIpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwLjVweCk7IH1cblxuICAgICAgICBidXR0b24uaGJ0bjpmb2N1cy12aXNpYmxlIHtcbiAgICAgICAgICBvdXRsaW5lOiAycHggc29saWQgY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kKSA0MCUsIHdoaXRlKTtcbiAgICAgICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgICAgICAgIGJveC1zaGFkb3c6IDAgMCAwIDNweCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDI1JSwgdHJhbnNwYXJlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnV0dG9uLmhidG5bZGlzYWJsZWRdIHtcbiAgICAgICAgICBvcGFjaXR5OiAuNjtcbiAgICAgICAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICAgICAgICAgIGJveC1zaGFkb3c6IG5vbmU7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBHaG9zdCB2YXJpYW50IChvcHRpb25hbCk6IGFkZCB2aWEgY2xhc3NMaXN0IHdoaWxlIHJlZ2lzdGVyaW5nICovXG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0IHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgICBjb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICAgIGJvcmRlci1jb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0OmhvdmVyIHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDglLCB0cmFuc3BhcmVudCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC5zZXAgeyB3aWR0aDogMXB4OyBoZWlnaHQ6IDIwcHg7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjEyKTsgfVxuICAgICAgICAgICAgICAgIC5zdGF0dXMge1xuICAgICAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDtcbiAgICAgICAgICBwYWRkaW5nOiA1cHggMTJweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwwLDAsLjE2KTtcbiAgICAgICAgICBhbmltYXRpb246IGx0LXBvcC1pbiAuMTRzIGVhc2Utb3V0O1xuICAgICAgICB9XG4gICAgICAgIC5zdGF0dXMuc3VjY2VzcyB7IGJhY2tncm91bmQ6IHZhcigtLWx0LW9rKTsgICBjb2xvcjogI2ZmZjsgIGJvcmRlci1jb2xvcjogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LW9rKSAgIDcwJSwgYmxhY2spOyB9XG4gICAgICAgIC5zdGF0dXMuaW5mbyAgICB7IGJhY2tncm91bmQ6IHZhcigtLWx0LWJyYW5kKTtjb2xvcjogI2ZmZjsgIGJvcmRlci1jb2xvcjogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kKTcwJSwgYmxhY2spOyB9XG4gICAgICAgIC5zdGF0dXMud2FybiAgICB7IGJhY2tncm91bmQ6IHZhcigtLWx0LXdhcm4pOyBjb2xvcjogIzExMTsgIGJvcmRlci1jb2xvcjogY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LXdhcm4pIDUwJSwgYmxhY2spOyBhbmltYXRpb246IGx0LXBvcC1pbiAuMTRzIGVhc2Utb3V0LCBsdC1wdWxzZSAxLjFzIGVhc2UtaW4tb3V0IDI7IH1cbiAgICAgICAgLnN0YXR1cy5lcnJvciAgIHsgYmFja2dyb3VuZDogdmFyKC0tbHQtZXJyKTsgIGNvbG9yOiAjZmZmOyAgYm9yZGVyLWNvbG9yOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtZXJyKSAgNzAlLCBibGFjayk7IGFuaW1hdGlvbjogbHQtcG9wLWluIC4xNHMgZWFzZS1vdXQsIGx0LXB1bHNlIDEuMXMgZWFzZS1pbi1vdXQgMjsgfVxuXG4gICAgICAgIC5zdGF0dXMuc3VjY2Vzczo6YmVmb3JlIHsgY29udGVudDogXCJcdTI3MTNcIjsgZm9udC13ZWlnaHQ6IDkwMDsgZmlsdGVyOiBkcm9wLXNoYWRvdygwIDFweCAwIHJnYmEoMCwwLDAsLjIpKTsgfVxuICAgICAgICAuc3RhdHVzLmluZm86OmJlZm9yZSAgICB7IGNvbnRlbnQ6IFwiXHUyMTM5XCI7IGZvbnQtd2VpZ2h0OiA5MDA7IGZpbHRlcjogZHJvcC1zaGFkb3coMCAxcHggMCByZ2JhKDAsMCwwLC4yKSk7IH1cbiAgICAgICAgLnN0YXR1cy53YXJuOjpiZWZvcmUgICAgeyBjb250ZW50OiBcIlx1MjZBMFwiOyBmb250LXdlaWdodDogOTAwOyB9XG4gICAgICAgIC5zdGF0dXMuZXJyb3I6OmJlZm9yZSAgIHsgY29udGVudDogXCJcdTI3MTZcIjsgZm9udC13ZWlnaHQ6IDkwMDsgZmlsdGVyOiBkcm9wLXNoYWRvdygwIDFweCAwIHJnYmEoMCwwLDAsLjIpKTsgfVxuXG4gICAgICAgIC5zdGF0dXMtd3JhcCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgfVxuXG4gICAgICAgIEBrZXlmcmFtZXMgbHQtcG9wLWluIHsgZnJvbSB7IHRyYW5zZm9ybTogc2NhbGUoLjk4KTsgb3BhY2l0eTouMDsgfSB0byB7IHRyYW5zZm9ybTogc2NhbGUoMSk7IG9wYWNpdHk6MTsgfSB9XG4gICAgICAgIEBrZXlmcmFtZXMgbHQtcHVsc2UgeyAwJSwxMDAlIHsgYm94LXNoYWRvdzogMCAwIDAgMCByZ2JhKDAsMCwwLC4wKTt9IDUwJSB7IGJveC1zaGFkb3c6IDAgMCAwIDZweCByZ2JhKDAsMCwwLC4wNik7fSB9XG5cbiAgICAgICAgLnNwaW5uZXIge1xuICAgICAgICAgIHdpZHRoOiAxNnB4OyBoZWlnaHQ6IDE2cHg7IGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgICAgICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDAsMCwwLC4xNSk7IGJvcmRlci10b3AtY29sb3I6IHZhcigtLWx0LWJyYW5kKTtcbiAgICAgICAgICBhbmltYXRpb246IHNwaW4gODAwbXMgbGluZWFyIGluZmluaXRlO1xuICAgICAgICB9XG4gICAgICAgIEBrZXlmcmFtZXMgc3BpbiB7IHRvIHsgdHJhbnNmb3JtOiByb3RhdGUoMzYwZGVnKTsgfSB9XG5cbiAgICAgICAgLyogQm9keSBtb3VudDogcGFnZSBwYWRkaW5nIGhhbmRsZWQgd2l0aCBDU1MgdmFyIChzZXQgYnkgSlMpICovXG4gICAgICAgIGh0bWwsIGJvZHkgeyAtLWx0LWh1Yi1oOiAwcHg7IH1cbiAgICAgICAgYm9keS5sdC1odWItcGFkZGVkIHsgcGFkZGluZy10b3A6IHZhcigtLWx0LWh1Yi1oKSAhaW1wb3J0YW50OyB9XG4gICAgICBgO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAgICAgICAgIC8vIFN0cnVjdHVyZVxuICAgICAgICAgICAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyB3cmFwLmNsYXNzTmFtZSA9ICdodWInO1xuICAgICAgICAgICAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBsZWZ0LmNsYXNzTmFtZSA9ICdsZWZ0JztcbiAgICAgICAgICAgIGNvbnN0IGNlbnRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBjZW50ZXIuY2xhc3NOYW1lID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyByaWdodC5jbGFzc05hbWUgPSAncmlnaHQnO1xuXG4gICAgICAgICAgICAvLyBCcmFuZGluZyBwaWxsXG4gICAgICAgICAgICBjb25zdCBicmFuZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgIGJyYW5kLmNsYXNzTmFtZSA9ICdicmFuZCc7XG4gICAgICAgICAgICBicmFuZC5pbm5lckhUTUwgPSAnPHNwYW4gY2xhc3M9XCJkb3RcIj48L3NwYW4+PHNwYW4gY2xhc3M9XCJicmFuZC10ZXh0XCI+T25lTW9ucm9lPC9zcGFuPic7XG4gICAgICAgICAgICBsZWZ0LmFwcGVuZENoaWxkKGJyYW5kKTtcblxuICAgICAgICAgICAgLy8gRGVkaWNhdGVkIHN0YXR1cyBzbG90IHRoYXQgbXVzdCBhbHdheXMgYmUgdGhlIGxhc3QgY2hpbGQgaW4gXCJyaWdodFwiXG4gICAgICAgICAgICBjb25zdCBzdGF0dXNTbG90ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgc3RhdHVzU2xvdC5jbGFzc05hbWUgPSAnc3RhdHVzLXNsb3QnO1xuICAgICAgICAgICAgcmlnaHQuYXBwZW5kQ2hpbGQoc3RhdHVzU2xvdCk7XG5cbiAgICAgICAgICAgIHdyYXAuYXBwZW5kKGxlZnQsIGNlbnRlciwgcmlnaHQpO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZCh3cmFwKTtcblxuICAgICAgICAgICAgLy8gQVBJIGV4cGVjdGVkIGJ5IGx0LmNvcmUgZmFjYWRlXG4gICAgICAgICAgICBjb25zdCBERUZBVUxUX1BJTExfUkVTRVRfTVMgPSA1MDAwOyAvLyA1IHNlY29uZHNcbiAgICAgICAgICAgIGNvbnN0IG1rU3RhdHVzID0gKHRleHQsIHRvbmUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyB3LmNsYXNzTmFtZSA9ICdzdGF0dXMtd3JhcCc7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgcy5jbGFzc05hbWUgPSBgc3RhdHVzICR7dG9uZX1gO1xuICAgICAgICAgICAgICAgIHMudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIHcuYXBwZW5kQ2hpbGQocyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBhcGkgPSB7XG4gICAgICAgICAgICAgICAgX3NoYWRvdzogcm9vdCxcbiAgICAgICAgICAgICAgICByZWdpc3RlckJ1dHRvbihzaWRlID0gJ2xlZnQnLCBkZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9ybWFsaXplIHNpZ25hdHVyZTogYWxsb3cgcmVnaXN0ZXJCdXR0b24oZGVmKSBPUiByZWdpc3RlckJ1dHRvbihzaWRlLCBkZWYpXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygc2lkZSA9PT0gJ29iamVjdCcgJiYgIWRlZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmID0gc2lkZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpZGUgPSBkZWY/LnNlY3Rpb24gfHwgJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IChzaWRlID09PSAncmlnaHQnKSA/IHJpZ2h0IDogKHNpZGUgPT09ICdjZW50ZXInID8gY2VudGVyIDogbGVmdCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBlbCA9IGRlZj8uZWw7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgPSAnaGJ0bic7IC8vIGRlZmF1bHQgPSBwcmltYXJ5IGJyYW5kXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUbyByZW5kZXIgYSBnaG9zdCBidXR0b24sIHBhc3MgeyBjbGFzc05hbWU6ICdoYnRuIGhidG4tLWdob3N0JyB9IHZpYSBkZWYuZWwgb3IgcGF0Y2ggbGF0ZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5pZCkgZWwuZGF0YXNldC5pZCA9IGRlZi5pZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gZGVmPy5sYWJlbCA/PyAnQWN0aW9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWY/LnRpdGxlKSBlbC50aXRsZSA9IFN0cmluZyhkZWYudGl0bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8uYXJpYUxhYmVsKSBlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBTdHJpbmcoZGVmLmFyaWFMYWJlbCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZWY/Lm9uQ2xpY2sgPT09ICdmdW5jdGlvbicpIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZGVmLm9uQ2xpY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8uZGlzYWJsZWQpIGVsLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkZWY/LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5kYXRhc2V0LmlkID0gZGVmLmlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8udGl0bGUpIGVsLnRpdGxlID0gU3RyaW5nKGRlZi50aXRsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5hcmlhTGFiZWwpIGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIFN0cmluZyhkZWYuYXJpYUxhYmVsKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBLZWVwIHN0YXR1cyBwaWxsIGF0IHRoZSBmYXIgcmlnaHQ6IGluc2VydCBuZXcgcmlnaHQtc2lkZSBpdGVtcyBCRUZPUkUgc3RhdHVzU2xvdFxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSByaWdodCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmlnaHQuaW5zZXJ0QmVmb3JlKGVsLCBzdGF0dXNTbG90KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZChlbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHVwZGF0ZUJ1dHRvbihpZCwgcGF0Y2ggPSB7fSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcm9vdC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1pZD1cIiR7Q1NTLmVzY2FwZShpZCl9XCJdYCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghbikgcmV0dXJuIGFwaTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhdGNoLmxhYmVsID09PSAnc3RyaW5nJyAmJiBuLnRhZ05hbWUgPT09ICdCVVRUT04nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuLnRleHRDb250ZW50ID0gcGF0Y2gubGFiZWw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXRjaC50aXRsZSA9PT0gJ3N0cmluZycpIG4udGl0bGUgPSBwYXRjaC50aXRsZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXRjaC5hcmlhTGFiZWwgPT09ICdzdHJpbmcnKSBuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHBhdGNoLmFyaWFMYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgnZGlzYWJsZWQnIGluIHBhdGNoICYmIG4udGFnTmFtZSA9PT0gJ0JVVFRPTicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG4uZGlzYWJsZWQgPSAhIXBhdGNoLmRpc2FibGVkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGF0Y2gub25DbGljayA9PT0gJ2Z1bmN0aW9uJyAmJiBuLnRhZ05hbWUgPT09ICdCVVRUT04nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9uZSA9IG4uY2xvbmVOb2RlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBwYXRjaC5vbkNsaWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsb25lLmRhdGFzZXQuaWQgPSBpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG4ucmVwbGFjZVdpdGgoY2xvbmUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICByZW1vdmUoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpZCkgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbiA9IHJvb3QucXVlcnlTZWxlY3RvcihgW2RhdGEtaWQ9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAobiAmJiBuLnBhcmVudE5vZGUpIG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGNsZWFyKCkge1xuICAgICAgICAgICAgICAgICAgICBsZWZ0LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgICAgICAgICAgICAgICAgICBjZW50ZXIucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFByZXNlcnZlIHN0YXR1c1Nsb3QgYXQgdGhlIGZhciByaWdodDsgcmVtb3ZlIG90aGVyIHJpZ2h0IGNoaWxkcmVuXG4gICAgICAgICAgICAgICAgICAgIFsuLi5yaWdodC5jaGlsZHJlbl0uZm9yRWFjaChuID0+IHsgaWYgKG4gIT09IHN0YXR1c1Nsb3QpIG4ucmVtb3ZlKCk7IH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbigpOyAvLyBjbGVhciB0aGUgcGlsbCBjb250ZW50XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBsaXN0KCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGwgPSBbLi4ubGVmdC5jaGlsZHJlbiwgLi4uY2VudGVyLmNoaWxkcmVuLCAuLi5yaWdodC5jaGlsZHJlbl07XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhbGwubWFwKG4gPT4gbi5kYXRhc2V0Py5pZCkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbihta1N0YXR1cyh0ZXh0LCB0b25lKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0aWNreSA9ICEhb3B0cz8uc3RpY2t5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtcyA9IChvcHRzPy5tcyA/PyBvcHRzPy50aW1lb3V0ID8/IERFRkFVTFRfUElMTF9SRVNFVF9NUyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RpY2t5ICYmIHRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGlmIChzdGF0dXNTbG90LmlzQ29ubmVjdGVkKSBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgbXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBiZWdpblRhc2sobGFiZWwsIHRvbmUgPSAnaW5mbycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd3JhcE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IHdyYXBOb2RlLmNsYXNzTmFtZSA9ICdzdGF0dXMtd3JhcCc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNwaW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IHNwaW4uY2xhc3NOYW1lID0gJ3NwaW5uZXInO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYWIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IGxhYi5jbGFzc05hbWUgPSBgc3RhdHVzICR7dG9uZX1gOyBsYWIudGV4dENvbnRlbnQgPSBsYWJlbCB8fCAnV29ya2luZ1x1MjAyNic7XG4gICAgICAgICAgICAgICAgICAgIHdyYXBOb2RlLmFwcGVuZChzcGluLCBsYWIpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbih3cmFwTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGUodGV4dCkgeyBpZiAodHlwZW9mIHRleHQgPT09ICdzdHJpbmcnKSBsYWIudGV4dENvbnRlbnQgPSB0ZXh0OyByZXR1cm4gdGhpczsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3ModGV4dCA9ICdEb25lJykgeyBsYWIuY2xhc3NOYW1lID0gJ3N0YXR1cyBzdWNjZXNzJzsgbGFiLnRleHRDb250ZW50ID0gdGV4dDsgc3Bpbi5yZW1vdmUoKTsgcmV0dXJuIHRoaXM7IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcih0ZXh0ID0gJ0Vycm9yJykgeyBsYWIuY2xhc3NOYW1lID0gJ3N0YXR1cyBlcnJvcic7IGxhYi50ZXh0Q29udGVudCA9IHRleHQ7IHNwaW4ucmVtb3ZlKCk7IHJldHVybiB0aGlzOyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYXIoKSB7IHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKCk7IHJldHVybiB0aGlzOyB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBub3RpZnkoa2luZCwgdGV4dCwgeyBtcyA9IERFRkFVTFRfUElMTF9SRVNFVF9NUywgc3RpY2t5ID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJldXNlIHNldFN0YXR1cyBiZWhhdmlvciBzbyBzdGlja3kvbXMgd29yayB0aGUgc2FtZVxuICAgICAgICAgICAgICAgICAgICBhcGkuc2V0U3RhdHVzKHRleHQsIGtpbmQsIHsgbXMsIHN0aWNreSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgaG9zdCwgbGVmdCwgY2VudGVyLCByaWdodCwgYXBpIH07XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZW5zdXJlTFRIdWI6IHNpbmdsZXRvbiBtb3VudCAobmF2L2JvZHkpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBhc3luYyBmdW5jdGlvbiBfZW5zdXJlTFRIdWJJbnRlcm5hbChvcHRzID0ge30pIHtcbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgdGltZW91dE1zID0gMTUwMDAsXG4gICAgICAgICAgICBzZWxlY3RvcnMgPSBbJy5wbGV4LWFjdGlvbnMtd3JhcHBlci5wbGV4LWdyaWQtYWN0aW9ucycsICcucGxleC1hY3Rpb25zLXdyYXBwZXInXSxcbiAgICAgICAgICAgIHRoZW1lID0gbnVsbCwgICAgICAgICAgICAgICAvLyByZXNlcnZlZCBmb3IgZnV0dXJlIHRoZW1lIGluamVjdGlvblxuICAgICAgICAgICAgbW91bnQ6IG1vdW50T3B0ID0gbnVsbCwgICAgIC8vICduYXYnIHwgJ2JvZHknIHwgbnVsbFxuICAgICAgICAgICAgZGlzYWJsZU1vZGFsRWxldmF0ZSA9IHRydWUgIC8vIHJlc2VydmVkIGZvciBsZWdhY3kgYmVoYXZpb3Igd2UgcmVtb3ZlZFxuICAgICAgICB9ID0gb3B0cztcblxuICAgICAgICAvLyBJZiBhbiBBUEkgYWxyZWFkeSBleGlzdHMsIHJldXNlIGl0LlxuICAgICAgICBpZiAoUk9PVC5sdFVJSHViKSByZXR1cm4gUk9PVC5sdFVJSHViO1xuXG4gICAgICAgIC8vIFJldXNlIGFuIGluLWZsaWdodCBwcm9taXNlIGlmIHByZXNlbnRcbiAgICAgICAgaWYgKFJPT1QuX19lbnN1cmVMVEh1YlByb21pc2UpIHJldHVybiBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlO1xuXG4gICAgICAgIC8vIElmIHRoZXJlJ3MgYWxyZWFkeSBhIGhvc3QgaW4gRE9NLCB0cnkgdG8gcmV1c2UgaXQgXHUyMDEzIGJ1dCBhbGlnbiBpdHMgdmFyaWFudCB0byByZXF1ZXN0ZWQgbW91bnQuXG4gICAgICAgIGNvbnN0IHByZUV4aXN0aW5nSG9zdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWx0LWh1Yj1cIjFcIl0nKTtcbiAgICAgICAgaWYgKHByZUV4aXN0aW5nSG9zdCAmJiBST09ULmx0VUlIdWIpIHtcbiAgICAgICAgICAgIGNvbnN0IHdhbnROYXYgPSAobW91bnRPcHQgfHwgUk9PVC5fX0xUX0hVQl9NT1VOVCB8fCAnbmF2JykgPT09ICduYXYnO1xuICAgICAgICAgICAgY29uc3QgY3VyID0gcHJlRXhpc3RpbmdIb3N0LmdldEF0dHJpYnV0ZSgnZGF0YS12YXJpYW50JykgfHwgJyc7XG5cbiAgICAgICAgICAgIGlmICh3YW50TmF2ICYmIGN1ciAhPT0gJ25hdicpIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdW50IHRoZSBleGlzdGluZyBob3N0IGludG8gdGhlIG5hdmJhciBhcyBhIGZ1bGwtd2lkdGggcm93XG4gICAgICAgICAgICAgICAgbGV0IG5hdlJpZ2h0ID1cbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtbmF2YmFyLWNvbnRhaW5lciAubmF2YmFyLXJpZ2h0Jyk7XG5cbiAgICAgICAgICAgICAgICBpZiAobmF2UmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmF2QmFyID1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5hdlJpZ2h0LmNsb3Nlc3QoJyNuYXZCYXIsIC5wbGV4LW5hdmJhci1jb250YWluZXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1uYXZiYXItY29udGFpbmVyJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5hdkJhcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJvdyA9IG5hdkJhci5xdWVyeVNlbGVjdG9yKCcubHQtaHViLXJvdycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuY2xhc3NOYW1lID0gJ2x0LWh1Yi1yb3cnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYXZCYXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZUV4aXN0aW5nSG9zdC5wYXJlbnROb2RlICE9PSByb3cpIHJvdy5hcHBlbmRDaGlsZChwcmVFeGlzdGluZ0hvc3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlRXhpc3RpbmdIb3N0LnNldEF0dHJpYnV0ZSgnZGF0YS12YXJpYW50JywgJ25hdicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwcmVFeGlzdGluZ0hvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ3N0YXRpYycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9wOiAnJywgbGVmdDogJycsIHJpZ2h0OiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heFdpZHRoOiAnMTAwJScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgekluZGV4OiAnYXV0bycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ2F1dG8nXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIFJPT1QubHRVSUh1YjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSBkZXNpcmVkIG1vdW50XG4gICAgICAgIGNvbnN0IGRlc2lyZWRNb3VudCA9IChtb3VudE9wdCB8fCBST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKTtcblxuICAgICAgICBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlID0gKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY29udGFpbmVyIH0gPSBhd2FpdCBST09ULndhaXRGb3JDb250YWluZXJBbmRBbmNob3IodGltZW91dE1zLCBzZWxlY3RvcnMpO1xuICAgICAgICAgICAgY29uc3QgeyBob3N0LCBhcGkgfSA9IChST09ULmNyZWF0ZUh1YiB8fCBjcmVhdGVIdWIpKCk7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSBwYWdlIGlzIHN0aWxsIG9uIHRoZSBvbGQgYmx1ZSB0b2tlbnMsIHNldCBNb25yb2UgdG9rZW5zIG9uIHRoZSBodWIgaG9zdCBvbmx5LlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByb290QnJhbmQgPSBnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgLmdldFByb3BlcnR5VmFsdWUoJy0tYnJhbmQtNjAwJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyb290QnJhbmQgfHwgcm9vdEJyYW5kID09PSAnIzBiNWZmZicpIHtcbiAgICAgICAgICAgICAgICAgICAgaG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1icmFuZC02MDAnLCAnIzhiMGIwNCcpOyAvLyBNb25yb2UgcHJpbWFyeVxuICAgICAgICAgICAgICAgICAgICBob3N0LnN0eWxlLnNldFByb3BlcnR5KCctLWJyYW5kLTcwMCcsICcjNWMwYTBhJyk7IC8vIE1vbnJvZSBob3Zlci9hY3RpdmVcbiAgICAgICAgICAgICAgICAgICAgaG9zdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1vaycsICcjMjhhNzQ1Jyk7XG4gICAgICAgICAgICAgICAgICAgIGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0td2FybicsICcjZmZjMTA3Jyk7XG4gICAgICAgICAgICAgICAgICAgIGhvc3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tZXJyJywgJyNkYzM1NDUnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHsgfVxuXG5cbiAgICAgICAgICAgIGlmIChkZXNpcmVkTW91bnQgPT09ICduYXYnKSB7XG4gICAgICAgICAgICAgICAgLy8gV2FpdCBmb3IgbmF2YmFyOyBuZXZlciBmYWxsIGJhY2sgdG8gYm9keVxuICAgICAgICAgICAgICAgIGxldCBuYXZSaWdodCA9IGZpbmROYXZiYXJSaWdodCgpO1xuICAgICAgICAgICAgICAgIGlmICghbmF2UmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnIgPSBmaW5kTmF2YmFyUmlnaHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5yKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYXZSaWdodCA9IG5yO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgb2JzLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgYWN0dWFsIDxuYXY+IGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIGNvbnN0IG5hdkJhciA9XG4gICAgICAgICAgICAgICAgICAgIChuYXZSaWdodCAmJiBuYXZSaWdodC5jbG9zZXN0KCduYXYnKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIubmF2YmFyJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIW5hdkJhcikgdGhyb3cgbmV3IEVycm9yKCdsdC11aS1odWI6IG5hdkJhciBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSAob3IgcmV1c2UpIGEgZGVkaWNhdGVkIGZ1bGwtd2lkdGggcm93IGluc2lkZSA8bmF2PixcbiAgICAgICAgICAgICAgICAvLyBpbnNlcnRlZCBiZWZvcmUgdGhlIG5vcm1hbCBQbGV4IG5hdmJhciBjb250ZW50IHdyYXBwZXIuXG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlTm9kZSA9IG5hdkJhci5xdWVyeVNlbGVjdG9yKCc6c2NvcGUgPiAucGxleC1uYXZiYXItdGl0bGUtY29udGFpbmVyIG5hdmJhci1sZWZ0JykgfHwgbnVsbDtcblxuICAgICAgICAgICAgICAgIGxldCByb3cgPSBuYXZCYXIucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLmx0LWh1Yi1yb3cnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJvdykge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdsdC1odWItcm93JztcblxuICAgICAgICAgICAgICAgICAgICAvLyBNaW5pbWFsIGlubGluZSBzdHlsZTsgaHViIGhhbmRsZXMgaXRzIG93biBpbm5lciBsYXlvdXQuXG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94JztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsIHRoaW4gZGl2aWRlciB0byBtaW1pYyBuYXRpdmUgcm93czpcbiAgICAgICAgICAgICAgICAgICAgLy8gcm93LnN0eWxlLmJvcmRlckJvdHRvbSA9ICcxcHggc29saWQgcmdiYSgwLDAsMCwuMDgpJztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoYmVmb3JlTm9kZSkgbmF2QmFyLmluc2VydEJlZm9yZShyb3csIGJlZm9yZU5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBlbHNlIG5hdkJhci5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIC0tLSBGdWxsLWJsZWVkOiBjYW5jZWwgbmF2J3MgTC9SIHBhZGRpbmcgYW5kIGJvcmRlcnMgZm9yIG91ciByb3cgb25seSAtLS1cbiAgICAgICAgICAgICAgICBjb25zdCBhcHBseUVkZ2VUb0VkZ2UgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShuYXZCYXIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwbCA9IHBhcnNlRmxvYXQoY3MucGFkZGluZ0xlZnQpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByID0gcGFyc2VGbG9hdChjcy5wYWRkaW5nUmlnaHQpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsID0gcGFyc2VGbG9hdChjcy5ib3JkZXJMZWZ0V2lkdGgpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJyID0gcGFyc2VGbG9hdChjcy5ib3JkZXJSaWdodFdpZHRoKSB8fCAwO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEV4dGVuZCBhY3Jvc3MgcGFkZGluZyArIGJvcmRlcnNcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLm1hcmdpbkxlZnQgPSAocGwgKyBibCkgPyBgLSR7cGwgKyBibH1weGAgOiAnMCc7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5tYXJnaW5SaWdodCA9IChwciArIGJyKSA/IGAtJHtwciArIGJyfXB4YCA6ICcwJztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLndpZHRoID0gKHBsICsgcHIgKyBibCArIGJyKSA/IGBjYWxjKDEwMCUgKyAke3BsICsgcHIgKyBibCArIGJyfXB4KWAgOiAnMTAwJSc7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIEF2b2lkIGR1cGxpY2F0ZSBsaXN0ZW5lcnMgb24gcm91dGUgY2hhbmdlc1xuICAgICAgICAgICAgICAgIGlmICghcm93LmRhdGFzZXQuZWRnZUFwcGxpZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlFZGdlVG9FZGdlKCk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBhcHBseUVkZ2VUb0VkZ2UsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoYXBwbHlFZGdlVG9FZGdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLm9ic2VydmUobmF2QmFyLCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydzdHlsZScsICdjbGFzcyddIH0pO1xuICAgICAgICAgICAgICAgICAgICByb3cuZGF0YXNldC5lZGdlQXBwbGllZCA9ICcxJztcbiAgICAgICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgICAgIC8vIE1vdmUgdGhlIGh1YiBob3N0IGludG8gb3VyIHJvdyAoZnVsbC13aWR0aClcbiAgICAgICAgICAgICAgICBpZiAoaG9zdC5wYXJlbnROb2RlICE9PSByb3cpIHJvdy5hcHBlbmRDaGlsZChob3N0KTtcblxuICAgICAgICAgICAgICAgIC8vIFVzZSBodWJcdTIwMTlzIGRlZmF1bHQgKGZ1bGwtd2lkdGgpIGxvb2sgXHUyMDE0IG5vdCBjb21wYWN0IFwibmF2XCIgaW5saW5lXG4gICAgICAgICAgICAgICAgaG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdmFyaWFudCcsICdyb3cnKTtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGhvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246ICdzdGF0aWMnLFxuICAgICAgICAgICAgICAgICAgICB0b3A6ICcnLCBsZWZ0OiAnJywgcmlnaHQ6ICcnLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICB6SW5kZXg6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ2F1dG8nXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBBbGlnbiBQUk9EIHdpdGggVEVTVFx1MjAxOXMgYmFubmVyIGJhc2VsaW5lIGlmIG5lZWRlZC5cbiAgICAgICAgICAgICAgICBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgdGhlIHNoYWRvdyByb290J3MgdG9wLWxldmVsIC5odWIgcmVzcGVjdHMgZnVsbCB3aWR0aFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1YlJvb3QgPSBob3N0LnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3IoJy5odWInKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGh1YlJvb3QpIGh1YlJvb3Quc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cblxuXG4gICAgICAgICAgICAgICAgLy8gTGV0IHRoZSBuYXZiYXIgZ3JvdyBuYXR1cmFsbHkuIFNvbWUgc2tpbnMgZm9yY2UgYSBmaXhlZCBoZWlnaHQgKFx1MjI0ODQ1cHgpLlxuICAgICAgICAgICAgICAgIC8vIE92ZXJyaWRlIHRvIFwiYXV0b1wiIGFuZCBrZWVwIGEgc2Vuc2libGUgbWluaW11bSA9IDQ1cHggKyBodWItcm93IGhlaWdodC5cbiAgICAgICAgICAgICAgICBjb25zdCBCQVNFX0ggPSA0NTsgLy8gbmF0aXZlIFBsZXggdG9wIGJhclxuICAgICAgICAgICAgICAgIG5hdkJhci5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cbiAgICAgICAgICAgICAgICAvLyBUcmFjayBodWIgaGVpZ2h0IGFuZCBhZGp1c3QgbWluLWhlaWdodCBzbyB0aGUgc2Vjb25kIHJvdyBpcyBmdWxseSB2aXNpYmxlLlxuICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZU1pbkhlaWdodCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaCA9IE1hdGgubWF4KDAsIGhvc3QuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApO1xuICAgICAgICAgICAgICAgICAgICAvL25hdkJhci5zdHlsZS5taW5IZWlnaHQgPSBgJHtCQVNFX0ggKyBofXB4YDtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gSW5pdGlhbCArIHJlYWN0aXZlIHNpemluZ1xuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7IHVwZGF0ZU1pbkhlaWdodCgpOyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodXBkYXRlTWluSGVpZ2h0KTsgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpOyB9KTtcbiAgICAgICAgICAgICAgICB0cnkgeyBkb2N1bWVudC5mb250cz8ucmVhZHk/LnRoZW4odXBkYXRlTWluSGVpZ2h0KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdXBkYXRlTWluSGVpZ2h0LCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZWFjdCB0byBodWIgY29udGVudCBjaGFuZ2VzXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm8gPSBuZXcgUmVzaXplT2JzZXJ2ZXIodXBkYXRlTWluSGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgcm8ub2JzZXJ2ZShob3N0KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAgICAgLy8gLS0tIFByb2R1Y3Rpb24tb25seSBzaG9ydGZhbGwgZml4IChubyBwZXJzaXN0ZW50IGJhbm5lcikgLS0tXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgb25seSB3aGVuIHRoZXJlIGlzIE5PIHBlcnNpc3RlbnQgYmFubmVyIChURVNUIGhhcyBvbmU7IFBST0QgdHlwaWNhbGx5IGRvZXMgbm90KS5cbiAgICAgICAgICAgICAgICBjb25zdCBoYXNQZXJzaXN0ZW50QmFubmVyID0gISFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1lbnYtcGVyc2lzdGVudC1iYW5uZXItY29udGFpbmVyJyk7XG4gICAgICAgICAgICAgICAgaWYgKGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IEJBU0VfTkFWX0ggPSA0NTsgLy8gYmFzZWxpbmUgUGxleCBuYXZiYXIgaGVpZ2h0XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgUEFHRV9TRUwgPSBbXG4gICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50J1xuICAgICAgICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldFB4KHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcGFyc2VGbG9hdCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGNhcHR1cmVCYXNlKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGUgb3JpZ2luYWwgaW5saW5lIHZhbHVlcyBvbmNlIHNvIHdlIGNhbiByZS1kZXJpdmUgbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRzID0gZWwuZGF0YXNldDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZHMubHRCYXNlSCAmJiBlbC5zdHlsZS5oZWlnaHQpIGRzLmx0QmFzZUggPSBlbC5zdHlsZS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRzLmx0QmFzZU1heCAmJiBlbC5zdHlsZS5tYXhIZWlnaHQpIGRzLmx0QmFzZU1heCA9IGVsLnN0eWxlLm1heEhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZHMubHRCYXNlTWluICYmIGVsLnN0eWxlLm1pbkhlaWdodCkgZHMubHRCYXNlTWluID0gZWwuc3R5bGUubWluSGVpZ2h0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gYXBwbHlFeHRyYShlbCwgZXh0cmEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVCYXNlKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRzID0gZWwuZGF0YXNldDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRnJvbSBiYXNlIGlubGluZSB2YWx1ZXMgKG9yIGN1cnJlbnQgY29tcHV0ZWQpLCBhZGQgJ2V4dHJhJ1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZUggPSBnZXRQeChkcy5sdEJhc2VIKSA/PyBnZXRQeChlbC5zdHlsZS5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZU1heCA9IGdldFB4KGRzLmx0QmFzZU1heCkgPz8gZ2V0UHgoZWwuc3R5bGUubWF4SGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VNaW4gPSBnZXRQeChkcy5sdEJhc2VNaW4pID8/IGdldFB4KGVsLnN0eWxlLm1pbkhlaWdodCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlSCAhPSBudWxsKSBlbC5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLm1heCgwLCBiYXNlSCArIGV4dHJhKX1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZU1heCAhPSBudWxsKSBlbC5zdHlsZS5tYXhIZWlnaHQgPSBgJHtNYXRoLm1heCgwLCBiYXNlTWF4ICsgZXh0cmEpfXB4YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlTWluICE9IG51bGwpIGVsLnN0eWxlLm1pbkhlaWdodCA9IGAke01hdGgubWF4KDAsIGJhc2VNaW4gKyBleHRyYSl9cHhgO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gYWRqdXN0UGFnZUhlaWdodHMoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGhvdyBtdWNoIHRhbGxlciB0aGFuIHRoZSBiYXNlbGluZSBQbGV4IG5hdiB3ZSBhcmVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hdkggPSBNYXRoLm1heCgwLCBuYXZCYXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0cmEgPSBNYXRoLm1heCgwLCBuYXZIIC0gQkFTRV9OQVZfSCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWV4dHJhKSByZXR1cm47IC8vIE5vdGhpbmcgdG8gZG8gd2hlbiBubyBleHRyYSByb3dcblxuICAgICAgICAgICAgICAgICAgICAgICAgUEFHRV9TRUwuZm9yRWFjaChzZWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsKS5mb3JFYWNoKGVsID0+IGFwcGx5RXh0cmEoZWwsIGV4dHJhKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEluaXRpYWwgKyByZWFjdGl2ZSBhcHBsaWNhdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHsgYWRqdXN0UGFnZUhlaWdodHMoKTsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFkanVzdFBhZ2VIZWlnaHRzKTsgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGFkanVzdFBhZ2VIZWlnaHRzLCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gT2JzZXJ2ZSBuYXYgaGVpZ2h0IGNoYW5nZXMgKGUuZy4sIGlmIGh1YiBjb250ZW50IGdyb3dzL3Nocmlua3MpXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByMiA9IG5ldyBSZXNpemVPYnNlcnZlcihhZGp1c3RQYWdlSGVpZ2h0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByMi5vYnNlcnZlKG5hdkJhcik7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgUGxleCByZXdyaXRlcyBpbmxpbmUgaGVpZ2h0cyBsYXRlciwgcmUtYXBwbHkgb3VyIGFkanVzdG1lbnRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBoaXQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnICYmIG0uYXR0cmlidXRlTmFtZSA9PT0gJ3N0eWxlJykgeyBoaXQgPSB0cnVlOyBicmVhazsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtLnR5cGUgPT09ICdjaGlsZExpc3QnKSB7IGhpdCA9IHRydWU7IGJyZWFrOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGl0KSBhZGp1c3RQYWdlSGVpZ2h0cygpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgbW8ub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnc3R5bGUnXSB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQm9keSB2YXJpYW50IChub24tb3ZlcmxheSk6IGluc2VydCBhIHNwYWNlciBhaGVhZCBvZiB0aGUgaHViIGVxdWFsIHRvXG4gICAgICAgICAgICAgICAgLy8gUGxleCdzIGZpeGVkIGNocm9tZSAoYmFubmVyICsgbmF2YmFyKS4gVGhlbiBtYWtlIHRoZSBodWIgc3RpY2t5IGF0IHRvcDowLlxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnROb2RlID1cbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlLWNvbnRlbnQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXI7XG5cbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgYSBzcGFjZXIgZXhpc3RzIGFzIHRoZSBmaXJzdCBjaGlsZFxuICAgICAgICAgICAgICAgIGxldCBzcGFjZXIgPSBjb250ZW50Tm9kZS5xdWVyeVNlbGVjdG9yKCc6c2NvcGUgPiAubHQtaHViLXNwYWNlcicpO1xuICAgICAgICAgICAgICAgIGlmICghc3BhY2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuY2xhc3NOYW1lID0gJ2x0LWh1Yi1zcGFjZXInO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5oZWlnaHQgPSAnMHB4JzsgICAgIC8vIHNpemVkIGR5bmFtaWNhbGx5XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5tYXJnaW4gPSAnMCc7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5wYWRkaW5nID0gJzAnO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUuZmxleCA9ICcwIDAgYXV0byc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnROb2RlLnByZXBlbmQoc3BhY2VyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBQbGFjZSB0aGUgaHViIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBzcGFjZXJcbiAgICAgICAgICAgICAgICBpZiAoc3BhY2VyLm5leHRTaWJsaW5nICE9PSBob3N0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChob3N0LnBhcmVudE5vZGUpIGhvc3QucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChob3N0KTtcbiAgICAgICAgICAgICAgICAgICAgc3BhY2VyLmFmdGVyKGhvc3QpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRyYWNrIGh1YiBoZWlnaHQgKGZvciBjb25zdW1lcnMvbWV0cmljcyBvbmx5KVxuICAgICAgICAgICAgICAgIGNvbnN0IHNldEh1YkggPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCBob3N0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodCB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWx0LWh1Yi1oJywgYCR7aH1weGApO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBDb21wdXRlIFBsZXggY2hyb21lIGhlaWdodDogcGVyc2lzdGVudCBiYW5uZXIgKyBtYWluIG5hdlxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXB1dGVDaHJvbWVUb3AgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRvYyA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3NzID0gZ2V0Q29tcHV0ZWRTdHlsZShkb2MpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYW5uZXJIID0gcGFyc2VJbnQoY3NzLmdldFByb3BlcnR5VmFsdWUoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcpKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbmF2QmFyJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hdkggPSBuYXYgPyBNYXRoLm1heCgwLCBuYXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApIDogMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hyb21lVG9wID0gYmFubmVySCArIG5hdkg7XG4gICAgICAgICAgICAgICAgICAgIGRvYy5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1sdC1maXhlZC10b3AnLCBgJHtjaHJvbWVUb3B9cHhgKTtcbiAgICAgICAgICAgICAgICAgICAgLy9zcGFjZXIuc3R5bGUuaGVpZ2h0ID0gYCR7Y2hyb21lVG9wfXB4YDtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gUmVjYWxjIG9uIGxheW91dC9ET00gY2hhbmdlc1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlY2FsYyA9ICgpID0+IHsgc2V0SHViSCgpOyBjb21wdXRlQ2hyb21lVG9wKCk7IH07XG4gICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHsgcmVjYWxjKCk7IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZWNhbGMpOyBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCk7IH0pO1xuICAgICAgICAgICAgICAgIHRyeSB7IGRvY3VtZW50LmZvbnRzPy5yZWFkeT8udGhlbihyZWNhbGMpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZWNhbGMsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWNhbGMpLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgIC8vIE1ha2UgdGhlIGh1YiBzdGlja3kgYXQgdGhlIGxvY2FsIHRvcCAobm8gZG91YmxlLW9mZnNldClcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGhvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246ICdzdGlja3knLFxuICAgICAgICAgICAgICAgICAgICB0b3A6ICcwJyxcbiAgICAgICAgICAgICAgICAgICAgbGVmdDogJzAnLFxuICAgICAgICAgICAgICAgICAgICByaWdodDogJzAnLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICB6SW5kZXg6ICcxMCcsICAgICAgICAgIC8vIGFib3ZlIGNvbnRlbnQsIGJlbG93IG1vZGFsc1xuICAgICAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnRzOiAnYXV0bydcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBST09ULmx0VUlIdWIgPSBhcGk7XG4gICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICB9KSgpLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgICAgLy8gYWxsb3cgbmV3IGVuc3VyZSBjYWxscyBsYXRlciAoYnV0IFJPT1QubHRVSUh1YiBwZXJzaXN0cylcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlID0gbnVsbDsgfSwgMCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlO1xuICAgIH1cblxuICAgIC8vIEV4cG9zZSBlbnN1cmVMVEh1YiBwdWJsaWNseVxuICAgIHRyeSB7IFJPT1QuZW5zdXJlTFRIdWIgPSBfZW5zdXJlTFRIdWJJbnRlcm5hbDsgfSBjYXRjaCB7IH1cblxuICAgIC8vIE9wdGlvbmFsOiBsYXp5IGF1dG8tbW91bnQgKHNhZmVcdTIwMTR3b25cdTIwMTl0IGVycm9yIGlmIG5vdCB1c2VkKVxuICAgIHRyeSB7XG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gUk9PVC5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IChST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKSB9KS5jYXRjaCgoKSA9PiB7IH0pKTtcbiAgICB9IGNhdGNoIHsgfVxuXG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFDQSxHQUFDLE1BQU07QUFDSCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBTW5FLFFBQUksQ0FBQyxLQUFLLDJCQUEyQjtBQUNqQyxXQUFLLDRCQUE0QixTQUFTLDBCQUN0QyxLQUFLLE1BQ0wsT0FBTyxDQUFDLDJDQUEyQyx1QkFBdUIsR0FDNUU7QUFDRSxlQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUNwQyxnQkFBTSxVQUFVLE1BQU07QUFFbEIsa0JBQU0sVUFBVSxTQUFTLGNBQWMsa0NBQWtDO0FBQ3pFLGtCQUFNLFlBQ0YsV0FDQSxTQUFTLGNBQWMsNENBQTRDLEtBQ25FLFNBQVM7QUFHYixrQkFBTSxhQUFhLEtBQUssSUFBSSxPQUFLLFNBQVMsY0FBYyxDQUFDLENBQUMsRUFBRSxLQUFLLE9BQU8sS0FBSztBQUU3RSxnQkFBSSxVQUFXLFFBQU8sUUFBUSxFQUFFLFdBQVcsV0FBVyxDQUFDO0FBQUEsVUFDM0Q7QUFFQSxrQkFBUTtBQUNSLGdCQUFNLE1BQU0sSUFBSSxpQkFBaUIsT0FBTztBQUN4QyxjQUFJLFFBQVEsU0FBUyxpQkFBaUIsRUFBRSxXQUFXLE1BQU0sU0FBUyxLQUFLLENBQUM7QUFFeEUscUJBQVcsTUFBTTtBQUNiLGdCQUFJO0FBQUUsa0JBQUksV0FBVztBQUFBLFlBQUcsUUFBUTtBQUFBLFlBQUU7QUFDbEMsbUJBQU8sSUFBSSxNQUFNLHVDQUF1QyxDQUFDO0FBQUEsVUFDN0QsR0FBRyxFQUFFO0FBQUEsUUFDVCxDQUFDO0FBQUEsTUFDTDtBQUFBLElBQ0o7QUFFQSxhQUFTLGtCQUFrQjtBQUN2QixhQUNJLFNBQVMsY0FBYyx1QkFBdUIsS0FDOUMsU0FBUyxjQUFjLHNDQUFzQztBQUFBLElBRXJFO0FBS0EsYUFBUyw0QkFBNEI7QUFDakMsWUFBTSxZQUFZLFNBQVMsY0FBYyx1Q0FBdUM7QUFDaEYsWUFBTSxhQUFhLFNBQVMsY0FBYyxtQ0FBbUM7QUFFN0UsWUFBTSxPQUFPLFlBQVksVUFBVSxlQUFlO0FBQ2xELFlBQU0sUUFBUSxhQUFhLFdBQVcsZUFBZTtBQUdyRCxZQUFNLE9BQU8sU0FBUztBQUN0QixZQUFNLFlBQVksaUJBQWlCLElBQUksRUFBRSxpQkFBaUIsc0NBQXNDO0FBQ2hHLFlBQU0sU0FBUyxPQUFPLFdBQVcsU0FBUyxLQUFLO0FBRy9DLFVBQUksT0FBTyxHQUFHO0FBQ1YsYUFBSyxNQUFNLFlBQVksd0NBQXdDLEdBQUcsSUFBSSxJQUFJO0FBQzFFO0FBQUEsTUFDSjtBQUdBLFVBQUksY0FBYyxVQUFVLEtBQUssV0FBVyxHQUFHO0FBQzNDLGNBQU0sV0FBVztBQUNqQixtQkFBVyxNQUFNLFNBQVMsR0FBRyxRQUFRO0FBQ3JDLGFBQUssTUFBTSxZQUFZLHdDQUF3QyxHQUFHLFFBQVEsSUFBSTtBQUFBLE1BQ2xGO0FBQUEsSUFDSjtBQUdBLFFBQUksQ0FBQyxLQUFLLFdBQVc7QUFDakIsV0FBSyxZQUFZLFNBQVNBLGFBQVk7QUFFbEMsY0FBTSxPQUFPLFNBQVMsY0FBYyxLQUFLO0FBQ3pDLGFBQUssYUFBYSxlQUFlLEdBQUc7QUFDcEMsY0FBTSxPQUFPLEtBQUssYUFBYSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBRy9DLGNBQU0sUUFBUSxTQUFTLGNBQWMsT0FBTztBQUM1QyxjQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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
