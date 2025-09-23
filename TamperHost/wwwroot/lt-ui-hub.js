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
                lab.className = "status danger";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXVpLWh1Yi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXG4oKCkgPT4ge1xuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gSG9pc3RlZCwgc2hhcmVkIGhlbHBlcnMgKHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBpZiAoIVJPT1Qud2FpdEZvckNvbnRhaW5lckFuZEFuY2hvcikge1xuICAgICAgICBST09ULndhaXRGb3JDb250YWluZXJBbmRBbmNob3IgPSBmdW5jdGlvbiB3YWl0Rm9yQ29udGFpbmVyQW5kQW5jaG9yKFxuICAgICAgICAgICAgbXMgPSAxNTAwMCxcbiAgICAgICAgICAgIHNlbHMgPSBbJy5wbGV4LWFjdGlvbnMtd3JhcHBlci5wbGV4LWdyaWQtYWN0aW9ucycsICcucGxleC1hY3Rpb25zLXdyYXBwZXInXVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHJ5RmluZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUHJlZmVyIHBhZ2UgY29udGVudDsgZmFsbCBiYWNrIHRvIHdyYXBwZXI7IGxhc3QgcmVzb3J0IGJvZHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50IHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBCYWNrLWNvbXBhdDogZXhwb3NlIGFuIGFuY2hvciBpZiBvbmUgZXhpc3RzIChub3QgdXNlZCBieSBtb2Rlcm4gaW5zZXJ0KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWZvcmVOb2RlID0gc2Vscy5tYXAocyA9PiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHMpKS5maW5kKEJvb2xlYW4pIHx8IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRhaW5lcikgcmV0dXJuIHJlc29sdmUoeyBjb250YWluZXIsIGJlZm9yZU5vZGUgfSk7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHRyeUZpbmQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0cnlGaW5kKTtcbiAgICAgICAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IG9icy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2x0LXVpLWh1YjogQ29udGFpbmVyL2FuY2hvciBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfSwgbXMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE5hdmJhclJpZ2h0KCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gTm9ybWFsaXplIHBlcnNpc3RlbnQgYmFubmVyIGhlaWdodCBhdCBydW50aW1lIHNvIFBST0QgbWF0Y2hlcyBURVNULlxuICAgIC8vIFRFU1Q6IC5wbGV4LWVudi1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgXHUyMjQ4IDUwcHhcbiAgICAvLyBQUk9EOiAucGxleC1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgZXhpc3RzIGJ1dCBpcyBvZnRlbiAwcHhcbiAgICBmdW5jdGlvbiBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCkge1xuICAgICAgICBjb25zdCBlbnZCYW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1lbnYtcGVyc2lzdGVudC1iYW5uZXItY29udGFpbmVyJyk7IC8vIFRFU1RcbiAgICAgICAgY29uc3QgbGl2ZUJhbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXBlcnNpc3RlbnQtYmFubmVyLWNvbnRhaW5lcicpOyAgICAgLy8gUFJPRFxuXG4gICAgICAgIGNvbnN0IGVudkggPSBlbnZCYW5uZXIgPyBlbnZCYW5uZXIub2Zmc2V0SGVpZ2h0IDogMDtcbiAgICAgICAgY29uc3QgbGl2ZUggPSBsaXZlQmFubmVyID8gbGl2ZUJhbm5lci5vZmZzZXRIZWlnaHQgOiAwO1xuXG4gICAgICAgIC8vIFJlYWQgY3VycmVudCBDU1MgdmFyIChmcmFtZXdvcmsgc2V0cyAwIGJ5IGRlZmF1bHQgaW4gYm90aCB0aGVtZXMpLlxuICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgICAgICBjb25zdCBjc3NWYXJTdHIgPSBnZXRDb21wdXRlZFN0eWxlKHJvb3QpLmdldFByb3BlcnR5VmFsdWUoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcpO1xuICAgICAgICBjb25zdCBjc3NWYXIgPSBOdW1iZXIucGFyc2VGbG9hdChjc3NWYXJTdHIpIHx8IDA7XG5cbiAgICAgICAgLy8gSWYgVEVTVCBhbHJlYWR5IGhhcyBhIHJlYWwgYmFubmVyLCBtaXJyb3IgdGhhdCB2YWx1ZSBpbnRvIHRoZSBDU1MgdmFyIGFuZCBleGl0LlxuICAgICAgICBpZiAoZW52SCA+IDApIHtcbiAgICAgICAgICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcsIGAke2Vudkh9cHhgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIFBST0QgYmFubmVyIGV4aXN0cyBidXQgY29udHJpYnV0ZXMgMCBhbmQgdGhlIHZhciBpcyAwLCBsaWZ0IGl0IHRvIDUwIChvYnNlcnZlZCBURVNUIGJhc2VsaW5lKS5cbiAgICAgICAgaWYgKGxpdmVCYW5uZXIgJiYgbGl2ZUggPT09IDAgJiYgY3NzVmFyID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBGQUxMQkFDSyA9IDUwO1xuICAgICAgICAgICAgbGl2ZUJhbm5lci5zdHlsZS5oZWlnaHQgPSBgJHtGQUxMQkFDS31weGA7XG4gICAgICAgICAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXNpZGUtbWVudS1wZXJzaXN0ZW50LWJhbm5lci1oZWlnaHQnLCBgJHtGQUxMQkFDS31weGApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBpZiAoIVJPT1QuY3JlYXRlSHViKSB7XG4gICAgICAgIFJPT1QuY3JlYXRlSHViID0gZnVuY3Rpb24gY3JlYXRlSHViKCkge1xuICAgICAgICAgICAgLy8gSG9zdCBlbGVtZW50ICgrc2hhZG93KVxuICAgICAgICAgICAgY29uc3QgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgaG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbHQtaHViJywgJzEnKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBob3N0LmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdvcGVuJyB9KTtcblxuICAgICAgICAgICAgLy8gU3R5bGVzICh2YWxpZCBDU1Mgb25seSlcbiAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICA6aG9zdCB7IGFsbDogaW5pdGlhbDsgfVxuICAgICAgICAuaHViIHtcbiAgICAgICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgICAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgICAgIGJhY2tncm91bmQ6ICNmZmZmZmY7XG4gICAgICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMCwwLDAsLjA4KTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwuMDYpO1xuICAgICAgICAgIHBhZGRpbmc6IDhweCAxMnB4O1xuICAgICAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnIgYXV0byAxZnI7XG4gICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICBnYXA6IDhweDtcbiAgICAgICAgICBmb250OiAxM3B4IHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLFNlZ29lIFVJLFJvYm90byxzYW5zLXNlcmlmO1xuICAgICAgICB9XG4gICAgICAgIDpob3N0KFtkYXRhLWVsZXZhdGVkPVwiMVwiXSkgLmh1YiB7IGJveC1zaGFkb3c6IDAgNnB4IDE4cHggcmdiYSgwLDAsMCwuMTgpOyB9XG5cbiAgICAgICAgLmxlZnQsIC5jZW50ZXIsIC5yaWdodCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgfVxuICAgICAgICAubGVmdCAgIHsganVzdGlmeS1jb250ZW50OiBmbGV4LXN0YXJ0OyB9XG4gICAgICAgIC5jZW50ZXIgeyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZmxleC13cmFwOiB3cmFwOyB9XG4gICAgICAgIC5yaWdodCAgeyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kOyB9XG5cbiAgICAgICAgLyogTmF2YmFyIHZhcmlhbnQgcmVuZGVycyBpbmxpbmU7IG5vIHBhZ2UgbGF5b3V0IGFkanVzdG1lbnRzICovXG4gICAgICAgIDpob3N0KFtkYXRhLXZhcmlhbnQ9XCJuYXZcIl0pIC5odWIge1xuICAgICAgICAgIGJvcmRlcjogMDsgYm94LXNoYWRvdzogbm9uZTsgcGFkZGluZzogMDtcbiAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiBub25lOyBnYXA6IDhweDtcbiAgICAgICAgfVxuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSAubGVmdCxcbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLmNlbnRlcixcbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLnJpZ2h0IHsgZGlzcGxheTogaW5saW5lLWZsZXg7IH1cbiAgICAgICAgLyogS2VlcCBicmFuZCB2aXNpYmxlIGluIG5hdiB0b28gKGNoYW5nZSB0byAnbm9uZScgdG8gaGlkZSkgKi9cbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLmJyYW5kIHsgZGlzcGxheTogaW5saW5lLWZsZXg7IH1cbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgYnV0dG9uLmhidG4geyBwYWRkaW5nOiA0cHggMTBweDsgfVxuXG4gICAgICAgIC5icmFuZCB7XG4gICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4O1xuICAgICAgICAgIHBhZGRpbmc6IDRweCA4cHg7IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsMCwwLC4xMik7XG4gICAgICAgICAgYmFja2dyb3VuZDogI2Y3ZjlmYjsgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgfVxuICAgICAgICAvKiBNYXAgZ2xvYmFsIHRoZW1lIHZhcnMgKGZyb20gOnJvb3QgaW4gdGhlbWUuY3NzKSBpbnRvIHRoZSBzaGFkb3cgdHJlZSAqL1xuICAgICAgICA6aG9zdCB7XG4gICAgICAgICAgLS1sdC1icmFuZDogdmFyKC0tYnJhbmQtNjAwLCAjMGI1ZmZmKTtcbiAgICAgICAgICAtLWx0LWJyYW5kLTcwMDogdmFyKC0tYnJhbmQtNzAwLCAjMGE0ZmQ2KTtcbiAgICAgICAgICAtLWx0LWluazogdmFyKC0taW5rLCAjMjIyKTtcbiAgICAgICAgICAtLWx0LWluay1tdXRlZDogdmFyKC0taW5rLW11dGVkLCAjNjY2KTtcbiAgICAgICAgICAtLWx0LW9rOiB2YXIoLS1vaywgIzE1ODAzZCk7XG4gICAgICAgICAgLS1sdC13YXJuOiB2YXIoLS13YXJuLCAjYjQ1MzA5KTtcbiAgICAgICAgICAtLWx0LWVycjogdmFyKC0tZXJyLCAjYjkxYzFjKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIEJyYW5kIHRva2VuIHRvdWNoZXMgKi9cbiAgICAgICAgLmRvdCB7IHdpZHRoOiA4cHg7IGhlaWdodDogOHB4OyBib3JkZXItcmFkaXVzOiA5OTlweDsgYmFja2dyb3VuZDogdmFyKC0tbHQtYnJhbmQpOyB9XG5cbiAgICAgICAgLyogQnV0dG9uIHN5c3RlbTogcHJpbWFyeSAvIGdob3N0LCB3aXRoIGFjY2Vzc2libGUgZm9jdXMgKyBob3ZlciBzdGF0ZXMgKi9cbiAgICAgICAgYnV0dG9uLmhidG4ge1xuICAgICAgICAgIGFsbDogdW5zZXQ7XG4gICAgICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgICAgICBwYWRkaW5nOiA4cHggMTJweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgICAgIGJhY2tncm91bmQ6IHZhcigtLWx0LWJyYW5kKTtcbiAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDFweCAzcHggcmdiYSgwLDAsMCwuMDgpO1xuICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIC4xOHMgZWFzZSwgdHJhbnNmb3JtIC4wNnMgZWFzZSwgYm94LXNoYWRvdyAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAuMThzIGVhc2UsIGNvbG9yIC4xOHMgZWFzZTtcbiAgICAgICAgfVxuICAgICAgICBidXR0b24uaGJ0bjpob3ZlciB7XG4gICAgICAgICAgYmFja2dyb3VuZDogdmFyKC0tbHQtYnJhbmQtNzAwKTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwuMTIpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwLjVweCk7IH1cblxuICAgICAgICBidXR0b24uaGJ0bjpmb2N1cy12aXNpYmxlIHtcbiAgICAgICAgICBvdXRsaW5lOiAycHggc29saWQgY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kKSA0MCUsIHdoaXRlKTtcbiAgICAgICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgICAgICAgIGJveC1zaGFkb3c6IDAgMCAwIDNweCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDI1JSwgdHJhbnNwYXJlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnV0dG9uLmhidG5bZGlzYWJsZWRdIHtcbiAgICAgICAgICBvcGFjaXR5OiAuNjtcbiAgICAgICAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICAgICAgICAgIGJveC1zaGFkb3c6IG5vbmU7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBHaG9zdCB2YXJpYW50IChvcHRpb25hbCk6IGFkZCB2aWEgY2xhc3NMaXN0IHdoaWxlIHJlZ2lzdGVyaW5nICovXG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0IHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgICBjb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICAgIGJvcmRlci1jb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0OmhvdmVyIHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDglLCB0cmFuc3BhcmVudCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC5zZXAgeyB3aWR0aDogMXB4OyBoZWlnaHQ6IDIwcHg7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjEyKTsgfVxuICAgICAgICAuc3RhdHVzIHtcbiAgICAgICAgICBwYWRkaW5nOiAzcHggMTBweDsgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDAsMCwuMTUpOyBiYWNrZ3JvdW5kOiAjZjhmYWZjOyBmb250LXNpemU6IDEycHg7XG4gICAgICAgIH1cbiAgICAgICAgLnN0YXR1cy5zdWNjZXNzIHsgYmFja2dyb3VuZDojZWNmZGY1OyBib3JkZXItY29sb3I6I2QxZmFlNTsgfVxuICAgICAgICAuc3RhdHVzLmluZm8gICAgeyBiYWNrZ3JvdW5kOiNlZmY2ZmY7IGJvcmRlci1jb2xvcjojZGJlYWZlOyB9XG4gICAgICAgIC5zdGF0dXMud2FybiAgICB7IGJhY2tncm91bmQ6I2ZmZmJlYjsgYm9yZGVyLWNvbG9yOiNmZWYzYzc7IH1cbiAgICAgICAgLnN0YXR1cy5kYW5nZXIgIHsgYmFja2dyb3VuZDojZmVmMmYyOyBib3JkZXItY29sb3I6I2ZlZTJlMjsgfVxuXG4gICAgICAgIC5zdGF0dXMtd3JhcCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgfVxuICAgICAgICAuc3Bpbm5lciB7XG4gICAgICAgICAgd2lkdGg6IDE2cHg7IGhlaWdodDogMTZweDsgYm9yZGVyLXJhZGl1czogNTAlO1xuICAgICAgICAgIGJvcmRlcjogMnB4IHNvbGlkIHJnYmEoMCwwLDAsLjE1KTsgYm9yZGVyLXRvcC1jb2xvcjogIzBlYTVlOTtcbiAgICAgICAgICBhbmltYXRpb246IHNwaW4gODAwbXMgbGluZWFyIGluZmluaXRlO1xuICAgICAgICB9XG4gICAgICAgIEBrZXlmcmFtZXMgc3BpbiB7IHRvIHsgdHJhbnNmb3JtOiByb3RhdGUoMzYwZGVnKTsgfSB9XG5cbiAgICAgICAgLyogQm9keSBtb3VudDogcGFnZSBwYWRkaW5nIGhhbmRsZWQgd2l0aCBDU1MgdmFyIChzZXQgYnkgSlMpICovXG4gICAgICAgIGh0bWwsIGJvZHkgeyAtLWx0LWh1Yi1oOiAwcHg7IH1cbiAgICAgICAgYm9keS5sdC1odWItcGFkZGVkIHsgcGFkZGluZy10b3A6IHZhcigtLWx0LWh1Yi1oKSAhaW1wb3J0YW50OyB9XG4gICAgICBgO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAgICAgICAgIC8vIFN0cnVjdHVyZVxuICAgICAgICAgICAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyB3cmFwLmNsYXNzTmFtZSA9ICdodWInO1xuICAgICAgICAgICAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBsZWZ0LmNsYXNzTmFtZSA9ICdsZWZ0JztcbiAgICAgICAgICAgIGNvbnN0IGNlbnRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBjZW50ZXIuY2xhc3NOYW1lID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyByaWdodC5jbGFzc05hbWUgPSAncmlnaHQnO1xuXG4gICAgICAgICAgICAvLyBCcmFuZGluZyBwaWxsXG4gICAgICAgICAgICBjb25zdCBicmFuZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgIGJyYW5kLmNsYXNzTmFtZSA9ICdicmFuZCc7XG4gICAgICAgICAgICBicmFuZC5pbm5lckhUTUwgPSAnPHNwYW4gY2xhc3M9XCJkb3RcIj48L3NwYW4+PHNwYW4gY2xhc3M9XCJicmFuZC10ZXh0XCI+T25lTW9ucm9lPC9zcGFuPic7XG4gICAgICAgICAgICBsZWZ0LmFwcGVuZENoaWxkKGJyYW5kKTtcblxuICAgICAgICAgICAgLy8gRGVkaWNhdGVkIHN0YXR1cyBzbG90IHRoYXQgbXVzdCBhbHdheXMgYmUgdGhlIGxhc3QgY2hpbGQgaW4gXCJyaWdodFwiXG4gICAgICAgICAgICBjb25zdCBzdGF0dXNTbG90ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgc3RhdHVzU2xvdC5jbGFzc05hbWUgPSAnc3RhdHVzLXNsb3QnO1xuICAgICAgICAgICAgcmlnaHQuYXBwZW5kQ2hpbGQoc3RhdHVzU2xvdCk7XG5cbiAgICAgICAgICAgIHdyYXAuYXBwZW5kKGxlZnQsIGNlbnRlciwgcmlnaHQpO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZCh3cmFwKTtcblxuICAgICAgICAgICAgLy8gQVBJIGV4cGVjdGVkIGJ5IGx0LmNvcmUgZmFjYWRlXG4gICAgICAgICAgICBjb25zdCBERUZBVUxUX1BJTExfUkVTRVRfTVMgPSA1MDAwOyAvLyA1IHNlY29uZHNcbiAgICAgICAgICAgIGNvbnN0IG1rU3RhdHVzID0gKHRleHQsIHRvbmUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyB3LmNsYXNzTmFtZSA9ICdzdGF0dXMtd3JhcCc7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgcy5jbGFzc05hbWUgPSBgc3RhdHVzICR7dG9uZX1gO1xuICAgICAgICAgICAgICAgIHMudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIHcuYXBwZW5kQ2hpbGQocyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBhcGkgPSB7XG4gICAgICAgICAgICAgICAgX3NoYWRvdzogcm9vdCxcbiAgICAgICAgICAgICAgICByZWdpc3RlckJ1dHRvbihzaWRlID0gJ2xlZnQnLCBkZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm9ybWFsaXplIHNpZ25hdHVyZTogYWxsb3cgcmVnaXN0ZXJCdXR0b24oZGVmKSBPUiByZWdpc3RlckJ1dHRvbihzaWRlLCBkZWYpXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygc2lkZSA9PT0gJ29iamVjdCcgJiYgIWRlZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmID0gc2lkZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpZGUgPSBkZWY/LnNlY3Rpb24gfHwgJ2xlZnQnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IChzaWRlID09PSAncmlnaHQnKSA/IHJpZ2h0IDogKHNpZGUgPT09ICdjZW50ZXInID8gY2VudGVyIDogbGVmdCk7XG4gICAgICAgICAgICAgICAgICAgIGxldCBlbCA9IGRlZj8uZWw7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgPSAnaGJ0bic7IC8vIGRlZmF1bHQgPSBwcmltYXJ5IGJyYW5kXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUbyByZW5kZXIgYSBnaG9zdCBidXR0b24sIHBhc3MgeyBjbGFzc05hbWU6ICdoYnRuIGhidG4tLWdob3N0JyB9IHZpYSBkZWYuZWwgb3IgcGF0Y2ggbGF0ZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5pZCkgZWwuZGF0YXNldC5pZCA9IGRlZi5pZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gZGVmPy5sYWJlbCA/PyAnQWN0aW9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWY/LnRpdGxlKSBlbC50aXRsZSA9IFN0cmluZyhkZWYudGl0bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8uYXJpYUxhYmVsKSBlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBTdHJpbmcoZGVmLmFyaWFMYWJlbCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZWY/Lm9uQ2xpY2sgPT09ICdmdW5jdGlvbicpIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZGVmLm9uQ2xpY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8uZGlzYWJsZWQpIGVsLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkZWY/LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5kYXRhc2V0LmlkID0gZGVmLmlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8udGl0bGUpIGVsLnRpdGxlID0gU3RyaW5nKGRlZi50aXRsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5hcmlhTGFiZWwpIGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIFN0cmluZyhkZWYuYXJpYUxhYmVsKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBLZWVwIHN0YXR1cyBwaWxsIGF0IHRoZSBmYXIgcmlnaHQ6IGluc2VydCBuZXcgcmlnaHQtc2lkZSBpdGVtcyBCRUZPUkUgc3RhdHVzU2xvdFxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSByaWdodCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmlnaHQuaW5zZXJ0QmVmb3JlKGVsLCBzdGF0dXNTbG90KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZChlbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHVwZGF0ZUJ1dHRvbihpZCwgcGF0Y2ggPSB7fSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcm9vdC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1pZD1cIiR7Q1NTLmVzY2FwZShpZCl9XCJdYCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghbikgcmV0dXJuIGFwaTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhdGNoLmxhYmVsID09PSAnc3RyaW5nJyAmJiBuLnRhZ05hbWUgPT09ICdCVVRUT04nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuLnRleHRDb250ZW50ID0gcGF0Y2gubGFiZWw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXRjaC50aXRsZSA9PT0gJ3N0cmluZycpIG4udGl0bGUgPSBwYXRjaC50aXRsZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXRjaC5hcmlhTGFiZWwgPT09ICdzdHJpbmcnKSBuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHBhdGNoLmFyaWFMYWJlbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgnZGlzYWJsZWQnIGluIHBhdGNoICYmIG4udGFnTmFtZSA9PT0gJ0JVVFRPTicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG4uZGlzYWJsZWQgPSAhIXBhdGNoLmRpc2FibGVkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGF0Y2gub25DbGljayA9PT0gJ2Z1bmN0aW9uJyAmJiBuLnRhZ05hbWUgPT09ICdCVVRUT04nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9uZSA9IG4uY2xvbmVOb2RlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBwYXRjaC5vbkNsaWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsb25lLmRhdGFzZXQuaWQgPSBpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG4ucmVwbGFjZVdpdGgoY2xvbmUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICByZW1vdmUoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpZCkgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbiA9IHJvb3QucXVlcnlTZWxlY3RvcihgW2RhdGEtaWQ9XCIke0NTUy5lc2NhcGUoaWQpfVwiXWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAobiAmJiBuLnBhcmVudE5vZGUpIG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGNsZWFyKCkge1xuICAgICAgICAgICAgICAgICAgICBsZWZ0LnJlcGxhY2VDaGlsZHJlbigpO1xuICAgICAgICAgICAgICAgICAgICBjZW50ZXIucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFByZXNlcnZlIHN0YXR1c1Nsb3QgYXQgdGhlIGZhciByaWdodDsgcmVtb3ZlIG90aGVyIHJpZ2h0IGNoaWxkcmVuXG4gICAgICAgICAgICAgICAgICAgIFsuLi5yaWdodC5jaGlsZHJlbl0uZm9yRWFjaChuID0+IHsgaWYgKG4gIT09IHN0YXR1c1Nsb3QpIG4ucmVtb3ZlKCk7IH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbigpOyAvLyBjbGVhciB0aGUgcGlsbCBjb250ZW50XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBsaXN0KCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGwgPSBbLi4ubGVmdC5jaGlsZHJlbiwgLi4uY2VudGVyLmNoaWxkcmVuLCAuLi5yaWdodC5jaGlsZHJlbl07XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhbGwubWFwKG4gPT4gbi5kYXRhc2V0Py5pZCkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKHRleHQsIHRvbmUgPSAnaW5mbycsIG9wdHMgPSB7fSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbihta1N0YXR1cyh0ZXh0LCB0b25lKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0aWNreSA9ICEhb3B0cz8uc3RpY2t5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtcyA9IChvcHRzPy5tcyA/PyBvcHRzPy50aW1lb3V0ID8/IERFRkFVTFRfUElMTF9SRVNFVF9NUyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RpY2t5ICYmIHRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IGlmIChzdGF0dXNTbG90LmlzQ29ubmVjdGVkKSBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbigpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgbXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBiZWdpblRhc2sobGFiZWwsIHRvbmUgPSAnaW5mbycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd3JhcE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IHdyYXBOb2RlLmNsYXNzTmFtZSA9ICdzdGF0dXMtd3JhcCc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNwaW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IHNwaW4uY2xhc3NOYW1lID0gJ3NwaW5uZXInO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYWIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7IGxhYi5jbGFzc05hbWUgPSBgc3RhdHVzICR7dG9uZX1gOyBsYWIudGV4dENvbnRlbnQgPSBsYWJlbCB8fCAnV29ya2luZ1x1MjAyNic7XG4gICAgICAgICAgICAgICAgICAgIHdyYXBOb2RlLmFwcGVuZChzcGluLCBsYWIpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbih3cmFwTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGUodGV4dCkgeyBpZiAodHlwZW9mIHRleHQgPT09ICdzdHJpbmcnKSBsYWIudGV4dENvbnRlbnQgPSB0ZXh0OyByZXR1cm4gdGhpczsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3ModGV4dCA9ICdEb25lJykgeyBsYWIuY2xhc3NOYW1lID0gJ3N0YXR1cyBzdWNjZXNzJzsgbGFiLnRleHRDb250ZW50ID0gdGV4dDsgc3Bpbi5yZW1vdmUoKTsgcmV0dXJuIHRoaXM7IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcih0ZXh0ID0gJ0Vycm9yJykgeyBsYWIuY2xhc3NOYW1lID0gJ3N0YXR1cyBkYW5nZXInOyBsYWIudGV4dENvbnRlbnQgPSB0ZXh0OyBzcGluLnJlbW92ZSgpOyByZXR1cm4gdGhpczsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFyKCkgeyBzdGF0dXNTbG90LnJlcGxhY2VDaGlsZHJlbigpOyByZXR1cm4gdGhpczsgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbm90aWZ5KGtpbmQsIHRleHQsIHsgbXMgPSBERUZBVUxUX1BJTExfUkVTRVRfTVMsIHN0aWNreSA9IGZhbHNlIH0gPSB7fSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXVzZSBzZXRTdGF0dXMgYmVoYXZpb3Igc28gc3RpY2t5L21zIHdvcmsgdGhlIHNhbWVcbiAgICAgICAgICAgICAgICAgICAgYXBpLnNldFN0YXR1cyh0ZXh0LCBraW5kLCB7IG1zLCBzdGlja3kgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiB7IGhvc3QsIGxlZnQsIGNlbnRlciwgcmlnaHQsIGFwaSB9O1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIGVuc3VyZUxUSHViOiBzaW5nbGV0b24gbW91bnQgKG5hdi9ib2R5KVxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gX2Vuc3VyZUxUSHViSW50ZXJuYWwob3B0cyA9IHt9KSB7XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgIHRpbWVvdXRNcyA9IDE1MDAwLFxuICAgICAgICAgICAgc2VsZWN0b3JzID0gWycucGxleC1hY3Rpb25zLXdyYXBwZXIucGxleC1ncmlkLWFjdGlvbnMnLCAnLnBsZXgtYWN0aW9ucy13cmFwcGVyJ10sXG4gICAgICAgICAgICB0aGVtZSA9IG51bGwsICAgICAgICAgICAgICAgLy8gcmVzZXJ2ZWQgZm9yIGZ1dHVyZSB0aGVtZSBpbmplY3Rpb25cbiAgICAgICAgICAgIG1vdW50OiBtb3VudE9wdCA9IG51bGwsICAgICAvLyAnbmF2JyB8ICdib2R5JyB8IG51bGxcbiAgICAgICAgICAgIGRpc2FibGVNb2RhbEVsZXZhdGUgPSB0cnVlICAvLyByZXNlcnZlZCBmb3IgbGVnYWN5IGJlaGF2aW9yIHdlIHJlbW92ZWRcbiAgICAgICAgfSA9IG9wdHM7XG5cbiAgICAgICAgLy8gSWYgYW4gQVBJIGFscmVhZHkgZXhpc3RzLCByZXVzZSBpdC5cbiAgICAgICAgaWYgKFJPT1QubHRVSUh1YikgcmV0dXJuIFJPT1QubHRVSUh1YjtcblxuICAgICAgICAvLyBSZXVzZSBhbiBpbi1mbGlnaHQgcHJvbWlzZSBpZiBwcmVzZW50XG4gICAgICAgIGlmIChST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlKSByZXR1cm4gUk9PVC5fX2Vuc3VyZUxUSHViUHJvbWlzZTtcblxuICAgICAgICAvLyBJZiB0aGVyZSdzIGFscmVhZHkgYSBob3N0IGluIERPTSwgdHJ5IHRvIHJldXNlIGl0IFx1MjAxMyBidXQgYWxpZ24gaXRzIHZhcmlhbnQgdG8gcmVxdWVzdGVkIG1vdW50LlxuICAgICAgICBjb25zdCBwcmVFeGlzdGluZ0hvc3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1sdC1odWI9XCIxXCJdJyk7XG4gICAgICAgIGlmIChwcmVFeGlzdGluZ0hvc3QgJiYgUk9PVC5sdFVJSHViKSB7XG4gICAgICAgICAgICBjb25zdCB3YW50TmF2ID0gKG1vdW50T3B0IHx8IFJPT1QuX19MVF9IVUJfTU9VTlQgfHwgJ25hdicpID09PSAnbmF2JztcbiAgICAgICAgICAgIGNvbnN0IGN1ciA9IHByZUV4aXN0aW5nSG9zdC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmFyaWFudCcpIHx8ICcnO1xuXG4gICAgICAgICAgICBpZiAod2FudE5hdiAmJiBjdXIgIT09ICduYXYnKSB7XG4gICAgICAgICAgICAgICAgLy8gUmVtb3VudCB0aGUgZXhpc3RpbmcgaG9zdCBpbnRvIHRoZSBuYXZiYXIgYXMgYSBmdWxsLXdpZHRoIHJvd1xuICAgICAgICAgICAgICAgIGxldCBuYXZSaWdodCA9XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNuYXZCYXIgLm5hdmJhci1yaWdodCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpO1xuXG4gICAgICAgICAgICAgICAgaWYgKG5hdlJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hdkJhciA9XG4gICAgICAgICAgICAgICAgICAgICAgICBuYXZSaWdodC5jbG9zZXN0KCcjbmF2QmFyLCAucGxleC1uYXZiYXItY29udGFpbmVyJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYXZCYXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtbmF2YmFyLWNvbnRhaW5lcicpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChuYXZCYXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCByb3cgPSBuYXZCYXIucXVlcnlTZWxlY3RvcignLmx0LWh1Yi1yb3cnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdsdC1odWItcm93JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmF2QmFyLmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVFeGlzdGluZ0hvc3QucGFyZW50Tm9kZSAhPT0gcm93KSByb3cuYXBwZW5kQ2hpbGQocHJlRXhpc3RpbmdIb3N0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZUV4aXN0aW5nSG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdmFyaWFudCcsICduYXYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24ocHJlRXhpc3RpbmdIb3N0LnN0eWxlLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246ICdzdGF0aWMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogJycsIGxlZnQ6ICcnLCByaWdodDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHpJbmRleDogJ2F1dG8nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudHM6ICdhdXRvJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBST09ULmx0VUlIdWI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZXRlcm1pbmUgZGVzaXJlZCBtb3VudFxuICAgICAgICBjb25zdCBkZXNpcmVkTW91bnQgPSAobW91bnRPcHQgfHwgUk9PVC5fX0xUX0hVQl9NT1VOVCB8fCAnbmF2Jyk7XG5cbiAgICAgICAgUk9PVC5fX2Vuc3VyZUxUSHViUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGNvbnRhaW5lciB9ID0gYXdhaXQgUk9PVC53YWl0Rm9yQ29udGFpbmVyQW5kQW5jaG9yKHRpbWVvdXRNcywgc2VsZWN0b3JzKTtcbiAgICAgICAgICAgIGNvbnN0IHsgaG9zdCwgYXBpIH0gPSAoUk9PVC5jcmVhdGVIdWIgfHwgY3JlYXRlSHViKSgpO1xuXG4gICAgICAgICAgICBpZiAoZGVzaXJlZE1vdW50ID09PSAnbmF2Jykge1xuICAgICAgICAgICAgICAgIC8vIFdhaXQgZm9yIG5hdmJhcjsgbmV2ZXIgZmFsbCBiYWNrIHRvIGJvZHlcbiAgICAgICAgICAgICAgICBsZXQgbmF2UmlnaHQgPSBmaW5kTmF2YmFyUmlnaHQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIW5hdlJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5yID0gZmluZE5hdmJhclJpZ2h0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFucikgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmF2UmlnaHQgPSBucjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFJlc29sdmUgdGhlIGFjdHVhbCA8bmF2PiBjb250YWluZXJcbiAgICAgICAgICAgICAgICBjb25zdCBuYXZCYXIgPVxuICAgICAgICAgICAgICAgICAgICAobmF2UmlnaHQgJiYgbmF2UmlnaHQuY2xvc2VzdCgnbmF2JykpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYXZCYXInKSB8fFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1uYXZiYXItY29udGFpbmVyLm5hdmJhcicpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFuYXZCYXIpIHRocm93IG5ldyBFcnJvcignbHQtdWktaHViOiBuYXZCYXIgbm90IGZvdW5kJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgKG9yIHJldXNlKSBhIGRlZGljYXRlZCBmdWxsLXdpZHRoIHJvdyBpbnNpZGUgPG5hdj4sXG4gICAgICAgICAgICAgICAgLy8gaW5zZXJ0ZWQgYmVmb3JlIHRoZSBub3JtYWwgUGxleCBuYXZiYXIgY29udGVudCB3cmFwcGVyLlxuICAgICAgICAgICAgICAgIGNvbnN0IGJlZm9yZU5vZGUgPSBuYXZCYXIucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLnBsZXgtbmF2YmFyLXRpdGxlLWNvbnRhaW5lciBuYXZiYXItbGVmdCcpIHx8IG51bGw7XG5cbiAgICAgICAgICAgICAgICBsZXQgcm93ID0gbmF2QmFyLnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5sdC1odWItcm93Jyk7XG4gICAgICAgICAgICAgICAgaWYgKCFyb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnbHQtaHViLXJvdyc7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTWluaW1hbCBpbmxpbmUgc3R5bGU7IGh1YiBoYW5kbGVzIGl0cyBvd24gaW5uZXIgbGF5b3V0LlxuICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS53aWR0aCA9ICcxMDAlJztcblxuICAgICAgICAgICAgICAgICAgICAvLyBPcHRpb25hbCB0aGluIGRpdmlkZXIgdG8gbWltaWMgbmF0aXZlIHJvd3M6XG4gICAgICAgICAgICAgICAgICAgIC8vIHJvdy5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkIHJnYmEoMCwwLDAsLjA4KSc7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGJlZm9yZU5vZGUpIG5hdkJhci5pbnNlcnRCZWZvcmUocm93LCBiZWZvcmVOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBuYXZCYXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyAtLS0gRnVsbC1ibGVlZDogY2FuY2VsIG5hdidzIEwvUiBwYWRkaW5nIGFuZCBib3JkZXJzIGZvciBvdXIgcm93IG9ubHkgLS0tXG4gICAgICAgICAgICAgICAgY29uc3QgYXBwbHlFZGdlVG9FZGdlID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjcyA9IGdldENvbXB1dGVkU3R5bGUobmF2QmFyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGwgPSBwYXJzZUZsb2F0KGNzLnBhZGRpbmdMZWZ0KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwciA9IHBhcnNlRmxvYXQoY3MucGFkZGluZ1JpZ2h0KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBibCA9IHBhcnNlRmxvYXQoY3MuYm9yZGVyTGVmdFdpZHRoKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiciA9IHBhcnNlRmxvYXQoY3MuYm9yZGVyUmlnaHRXaWR0aCkgfHwgMDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBFeHRlbmQgYWNyb3NzIHBhZGRpbmcgKyBib3JkZXJzXG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5tYXJnaW5MZWZ0ID0gKHBsICsgYmwpID8gYC0ke3BsICsgYmx9cHhgIDogJzAnO1xuICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUubWFyZ2luUmlnaHQgPSAocHIgKyBicikgPyBgLSR7cHIgKyBicn1weGAgOiAnMCc7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS53aWR0aCA9IChwbCArIHByICsgYmwgKyBicikgPyBgY2FsYygxMDAlICsgJHtwbCArIHByICsgYmwgKyBicn1weClgIDogJzEwMCUnO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBBdm9pZCBkdXBsaWNhdGUgbGlzdGVuZXJzIG9uIHJvdXRlIGNoYW5nZXNcbiAgICAgICAgICAgICAgICBpZiAoIXJvdy5kYXRhc2V0LmVkZ2VBcHBsaWVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5RWRnZVRvRWRnZSgpO1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgYXBwbHlFZGdlVG9FZGdlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBNdXRhdGlvbk9ic2VydmVyKGFwcGx5RWRnZVRvRWRnZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5vYnNlcnZlKG5hdkJhciwgeyBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnc3R5bGUnLCAnY2xhc3MnXSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcm93LmRhdGFzZXQuZWRnZUFwcGxpZWQgPSAnMSc7XG4gICAgICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgICAgICAvLyBNb3ZlIHRoZSBodWIgaG9zdCBpbnRvIG91ciByb3cgKGZ1bGwtd2lkdGgpXG4gICAgICAgICAgICAgICAgaWYgKGhvc3QucGFyZW50Tm9kZSAhPT0gcm93KSByb3cuYXBwZW5kQ2hpbGQoaG9zdCk7XG5cbiAgICAgICAgICAgICAgICAvLyBVc2UgaHViXHUyMDE5cyBkZWZhdWx0IChmdWxsLXdpZHRoKSBsb29rIFx1MjAxNCBub3QgY29tcGFjdCBcIm5hdlwiIGlubGluZVxuICAgICAgICAgICAgICAgIGhvc3Quc2V0QXR0cmlidXRlKCdkYXRhLXZhcmlhbnQnLCAncm93Jyk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihob3N0LnN0eWxlLCB7XG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiAnc3RhdGljJyxcbiAgICAgICAgICAgICAgICAgICAgdG9wOiAnJywgbGVmdDogJycsIHJpZ2h0OiAnJyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgICAgICAgICAgICAgbWF4V2lkdGg6ICcxMDAlJyxcbiAgICAgICAgICAgICAgICAgICAgekluZGV4OiAnYXV0bycsXG4gICAgICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudHM6ICdhdXRvJ1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gQWxpZ24gUFJPRCB3aXRoIFRFU1RcdTIwMTlzIGJhbm5lciBiYXNlbGluZSBpZiBuZWVkZWQuXG4gICAgICAgICAgICAgICAgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpO1xuXG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBzaGFkb3cgcm9vdCdzIHRvcC1sZXZlbCAuaHViIHJlc3BlY3RzIGZ1bGwgd2lkdGhcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBodWJSb290ID0gaG9zdC5zaGFkb3dSb290Py5xdWVyeVNlbGVjdG9yKCcuaHViJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChodWJSb290KSBodWJSb290LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG5cblxuICAgICAgICAgICAgICAgIC8vIExldCB0aGUgbmF2YmFyIGdyb3cgbmF0dXJhbGx5LiBTb21lIHNraW5zIGZvcmNlIGEgZml4ZWQgaGVpZ2h0IChcdTIyNDg0NXB4KS5cbiAgICAgICAgICAgICAgICAvLyBPdmVycmlkZSB0byBcImF1dG9cIiBhbmQga2VlcCBhIHNlbnNpYmxlIG1pbmltdW0gPSA0NXB4ICsgaHViLXJvdyBoZWlnaHQuXG4gICAgICAgICAgICAgICAgY29uc3QgQkFTRV9IID0gNDU7IC8vIG5hdGl2ZSBQbGV4IHRvcCBiYXJcbiAgICAgICAgICAgICAgICBuYXZCYXIuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXG4gICAgICAgICAgICAgICAgLy8gVHJhY2sgaHViIGhlaWdodCBhbmQgYWRqdXN0IG1pbi1oZWlnaHQgc28gdGhlIHNlY29uZCByb3cgaXMgZnVsbHkgdmlzaWJsZS5cbiAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVNaW5IZWlnaHQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCBob3N0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodCB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgLy9uYXZCYXIuc3R5bGUubWluSGVpZ2h0ID0gYCR7QkFTRV9IICsgaH1weGA7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIEluaXRpYWwgKyByZWFjdGl2ZSBzaXppbmdcbiAgICAgICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4geyB1cGRhdGVNaW5IZWlnaHQoKTsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHVwZGF0ZU1pbkhlaWdodCk7IG5vcm1hbGl6ZVBlcnNpc3RlbnRCYW5uZXIoKTsgfSk7XG4gICAgICAgICAgICAgICAgdHJ5IHsgZG9jdW1lbnQuZm9udHM/LnJlYWR5Py50aGVuKHVwZGF0ZU1pbkhlaWdodCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHVwZGF0ZU1pbkhlaWdodCwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gUmVhY3QgdG8gaHViIGNvbnRlbnQgY2hhbmdlc1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvID0gbmV3IFJlc2l6ZU9ic2VydmVyKHVwZGF0ZU1pbkhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIHJvLm9ic2VydmUoaG9zdCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICAgICAgICAgIC8vIC0tLSBQcm9kdWN0aW9uLW9ubHkgc2hvcnRmYWxsIGZpeCAobm8gcGVyc2lzdGVudCBiYW5uZXIpIC0tLVxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IG9ubHkgd2hlbiB0aGVyZSBpcyBOTyBwZXJzaXN0ZW50IGJhbm5lciAoVEVTVCBoYXMgb25lOyBQUk9EIHR5cGljYWxseSBkb2VzIG5vdCkuXG4gICAgICAgICAgICAgICAgY29uc3QgaGFzUGVyc2lzdGVudEJhbm5lciA9ICEhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtZW52LXBlcnNpc3RlbnQtYmFubmVyLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgICAgIGlmIChmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBCQVNFX05BVl9IID0gNDU7IC8vIGJhc2VsaW5lIFBsZXggbmF2YmFyIGhlaWdodFxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IFBBR0VfU0VMID0gW1xuICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlLWNvbnRlbnQtY29udGFpbmVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudCdcbiAgICAgICAgICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXRQeCh2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXYpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbiA9IHBhcnNlRmxvYXQodik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gbiA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBjYXB0dXJlQmFzZShlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RvcmUgdGhlIG9yaWdpbmFsIGlubGluZSB2YWx1ZXMgb25jZSBzbyB3ZSBjYW4gcmUtZGVyaXZlIGxhdGVyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkcyA9IGVsLmRhdGFzZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRzLmx0QmFzZUggJiYgZWwuc3R5bGUuaGVpZ2h0KSBkcy5sdEJhc2VIID0gZWwuc3R5bGUuaGVpZ2h0O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFkcy5sdEJhc2VNYXggJiYgZWwuc3R5bGUubWF4SGVpZ2h0KSBkcy5sdEJhc2VNYXggPSBlbC5zdHlsZS5tYXhIZWlnaHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRzLmx0QmFzZU1pbiAmJiBlbC5zdHlsZS5taW5IZWlnaHQpIGRzLmx0QmFzZU1pbiA9IGVsLnN0eWxlLm1pbkhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGFwcGx5RXh0cmEoZWwsIGV4dHJhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlQmFzZShlbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkcyA9IGVsLmRhdGFzZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZyb20gYmFzZSBpbmxpbmUgdmFsdWVzIChvciBjdXJyZW50IGNvbXB1dGVkKSwgYWRkICdleHRyYSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VIID0gZ2V0UHgoZHMubHRCYXNlSCkgPz8gZ2V0UHgoZWwuc3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VNYXggPSBnZXRQeChkcy5sdEJhc2VNYXgpID8/IGdldFB4KGVsLnN0eWxlLm1heEhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlTWluID0gZ2V0UHgoZHMubHRCYXNlTWluKSA/PyBnZXRQeChlbC5zdHlsZS5taW5IZWlnaHQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZUggIT0gbnVsbCkgZWwuc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5tYXgoMCwgYmFzZUggKyBleHRyYSl9cHhgO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhc2VNYXggIT0gbnVsbCkgZWwuc3R5bGUubWF4SGVpZ2h0ID0gYCR7TWF0aC5tYXgoMCwgYmFzZU1heCArIGV4dHJhKX1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZU1pbiAhPSBudWxsKSBlbC5zdHlsZS5taW5IZWlnaHQgPSBgJHtNYXRoLm1heCgwLCBiYXNlTWluICsgZXh0cmEpfXB4YDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGFkanVzdFBhZ2VIZWlnaHRzKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBob3cgbXVjaCB0YWxsZXIgdGhhbiB0aGUgYmFzZWxpbmUgUGxleCBuYXYgd2UgYXJlXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuYXZIID0gTWF0aC5tYXgoMCwgbmF2QmFyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodCB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dHJhID0gTWF0aC5tYXgoMCwgbmF2SCAtIEJBU0VfTkFWX0gpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFleHRyYSkgcmV0dXJuOyAvLyBOb3RoaW5nIHRvIGRvIHdoZW4gbm8gZXh0cmEgcm93XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIFBBR0VfU0VMLmZvckVhY2goc2VsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbCkuZm9yRWFjaChlbCA9PiBhcHBseUV4dHJhKGVsLCBleHRyYSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBJbml0aWFsICsgcmVhY3RpdmUgYXBwbGljYXRpb25zXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7IGFkanVzdFBhZ2VIZWlnaHRzKCk7IHJlcXVlc3RBbmltYXRpb25GcmFtZShhZGp1c3RQYWdlSGVpZ2h0cyk7IG5vcm1hbGl6ZVBlcnNpc3RlbnRCYW5uZXIoKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBhZGp1c3RQYWdlSGVpZ2h0cywgeyBwYXNzaXZlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE9ic2VydmUgbmF2IGhlaWdodCBjaGFuZ2VzIChlLmcuLCBpZiBodWIgY29udGVudCBncm93cy9zaHJpbmtzKVxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcjIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoYWRqdXN0UGFnZUhlaWdodHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcjIub2JzZXJ2ZShuYXZCYXIpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIFBsZXggcmV3cml0ZXMgaW5saW5lIGhlaWdodHMgbGF0ZXIsIHJlLWFwcGx5IG91ciBhZGp1c3RtZW50XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgaGl0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbXV0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtLnR5cGUgPT09ICdhdHRyaWJ1dGVzJyAmJiBtLmF0dHJpYnV0ZU5hbWUgPT09ICdzdHlsZScpIHsgaGl0ID0gdHJ1ZTsgYnJlYWs7IH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobS50eXBlID09PSAnY2hpbGRMaXN0JykgeyBoaXQgPSB0cnVlOyBicmVhazsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhpdCkgYWRqdXN0UGFnZUhlaWdodHMoKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIG1vLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSwgYXR0cmlidXRlczogdHJ1ZSwgYXR0cmlidXRlRmlsdGVyOiBbJ3N0eWxlJ10gfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEJvZHkgdmFyaWFudCAobm9uLW92ZXJsYXkpOiBpbnNlcnQgYSBzcGFjZXIgYWhlYWQgb2YgdGhlIGh1YiBlcXVhbCB0b1xuICAgICAgICAgICAgICAgIC8vIFBsZXgncyBmaXhlZCBjaHJvbWUgKGJhbm5lciArIG5hdmJhcikuIFRoZW4gbWFrZSB0aGUgaHViIHN0aWNreSBhdCB0b3A6MC5cbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50Tm9kZSA9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCc6c2NvcGUgPiAucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudCcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyO1xuXG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIGEgc3BhY2VyIGV4aXN0cyBhcyB0aGUgZmlyc3QgY2hpbGRcbiAgICAgICAgICAgICAgICBsZXQgc3BhY2VyID0gY29udGVudE5vZGUucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLmx0LWh1Yi1zcGFjZXInKTtcbiAgICAgICAgICAgICAgICBpZiAoIXNwYWNlcikge1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgc3BhY2VyLmNsYXNzTmFtZSA9ICdsdC1odWItc3BhY2VyJztcbiAgICAgICAgICAgICAgICAgICAgc3BhY2VyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUuaGVpZ2h0ID0gJzBweCc7ICAgICAvLyBzaXplZCBkeW5hbWljYWxseVxuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUubWFyZ2luID0gJzAnO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUucGFkZGluZyA9ICcwJztcbiAgICAgICAgICAgICAgICAgICAgc3BhY2VyLnN0eWxlLmZsZXggPSAnMCAwIGF1dG8nO1xuICAgICAgICAgICAgICAgICAgICBjb250ZW50Tm9kZS5wcmVwZW5kKHNwYWNlcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUGxhY2UgdGhlIGh1YiBpbW1lZGlhdGVseSBhZnRlciB0aGUgc3BhY2VyXG4gICAgICAgICAgICAgICAgaWYgKHNwYWNlci5uZXh0U2libGluZyAhPT0gaG9zdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaG9zdC5wYXJlbnROb2RlKSBob3N0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoaG9zdCk7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5hZnRlcihob3N0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUcmFjayBodWIgaGVpZ2h0IChmb3IgY29uc3VtZXJzL21ldHJpY3Mgb25seSlcbiAgICAgICAgICAgICAgICBjb25zdCBzZXRIdWJIID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoID0gTWF0aC5tYXgoMCwgaG9zdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5oZWlnaHQgfHwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1sdC1odWItaCcsIGAke2h9cHhgKTtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBQbGV4IGNocm9tZSBoZWlnaHQ6IHBlcnNpc3RlbnQgYmFubmVyICsgbWFpbiBuYXZcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wdXRlQ2hyb21lVG9wID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkb2MgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNzcyA9IGdldENvbXB1dGVkU3R5bGUoZG9jKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFubmVySCA9IHBhcnNlSW50KGNzcy5nZXRQcm9wZXJ0eVZhbHVlKCctLXNpZGUtbWVudS1wZXJzaXN0ZW50LWJhbm5lci1oZWlnaHQnKSkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhcicpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuYXZIID0gbmF2ID8gTWF0aC5tYXgoMCwgbmF2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodCB8fCAwKSA6IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNocm9tZVRvcCA9IGJhbm5lckggKyBuYXZIO1xuICAgICAgICAgICAgICAgICAgICBkb2Muc3R5bGUuc2V0UHJvcGVydHkoJy0tbHQtZml4ZWQtdG9wJywgYCR7Y2hyb21lVG9wfXB4YCk7XG4gICAgICAgICAgICAgICAgICAgIC8vc3BhY2VyLnN0eWxlLmhlaWdodCA9IGAke2Nocm9tZVRvcH1weGA7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIFJlY2FsYyBvbiBsYXlvdXQvRE9NIGNoYW5nZXNcbiAgICAgICAgICAgICAgICBjb25zdCByZWNhbGMgPSAoKSA9PiB7IHNldEh1YkgoKTsgY29tcHV0ZUNocm9tZVRvcCgpOyB9O1xuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7IHJlY2FsYygpOyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocmVjYWxjKTsgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpOyB9KTtcbiAgICAgICAgICAgICAgICB0cnkgeyBkb2N1bWVudC5mb250cz8ucmVhZHk/LnRoZW4ocmVjYWxjKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVjYWxjLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjYWxjKS5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBNYWtlIHRoZSBodWIgc3RpY2t5IGF0IHRoZSBsb2NhbCB0b3AgKG5vIGRvdWJsZS1vZmZzZXQpXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihob3N0LnN0eWxlLCB7XG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiAnc3RpY2t5JyxcbiAgICAgICAgICAgICAgICAgICAgdG9wOiAnMCcsXG4gICAgICAgICAgICAgICAgICAgIGxlZnQ6ICcwJyxcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQ6ICcwJyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgICAgICAgICAgICAgekluZGV4OiAnMTAnLCAgICAgICAgICAvLyBhYm92ZSBjb250ZW50LCBiZWxvdyBtb2RhbHNcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ2F1dG8nXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgUk9PVC5sdFVJSHViID0gYXBpO1xuICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgfSkoKS5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICAgIC8vIGFsbG93IG5ldyBlbnN1cmUgY2FsbHMgbGF0ZXIgKGJ1dCBST09ULmx0VUlIdWIgcGVyc2lzdHMpXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgUk9PVC5fX2Vuc3VyZUxUSHViUHJvbWlzZSA9IG51bGw7IH0sIDApO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gUk9PVC5fX2Vuc3VyZUxUSHViUHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBFeHBvc2UgZW5zdXJlTFRIdWIgcHVibGljbHlcbiAgICB0cnkgeyBST09ULmVuc3VyZUxUSHViID0gX2Vuc3VyZUxUSHViSW50ZXJuYWw7IH0gY2F0Y2ggeyB9XG5cbiAgICAvLyBPcHRpb25hbDogbGF6eSBhdXRvLW1vdW50IChzYWZlXHUyMDE0d29uXHUyMDE5dCBlcnJvciBpZiBub3QgdXNlZClcbiAgICB0cnkge1xuICAgICAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IFJPT1QuZW5zdXJlTFRIdWI/Lih7IG1vdW50OiAoUk9PVC5fX0xUX0hVQl9NT1VOVCB8fCAnbmF2JykgfSkuY2F0Y2goKCkgPT4geyB9KSk7XG4gICAgfSBjYXRjaCB7IH1cblxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBQ0EsR0FBQyxNQUFNO0FBQ0gsVUFBTSxPQUFRLE9BQU8saUJBQWlCLGNBQWMsZUFBZTtBQU1uRSxRQUFJLENBQUMsS0FBSywyQkFBMkI7QUFDakMsV0FBSyw0QkFBNEIsU0FBUywwQkFDdEMsS0FBSyxNQUNMLE9BQU8sQ0FBQywyQ0FBMkMsdUJBQXVCLEdBQzVFO0FBQ0UsZUFBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDcEMsZ0JBQU0sVUFBVSxNQUFNO0FBRWxCLGtCQUFNLFVBQVUsU0FBUyxjQUFjLGtDQUFrQztBQUN6RSxrQkFBTSxZQUNGLFdBQ0EsU0FBUyxjQUFjLDRDQUE0QyxLQUNuRSxTQUFTO0FBR2Isa0JBQU0sYUFBYSxLQUFLLElBQUksT0FBSyxTQUFTLGNBQWMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxPQUFPLEtBQUs7QUFFN0UsZ0JBQUksVUFBVyxRQUFPLFFBQVEsRUFBRSxXQUFXLFdBQVcsQ0FBQztBQUFBLFVBQzNEO0FBRUEsa0JBQVE7QUFDUixnQkFBTSxNQUFNLElBQUksaUJBQWlCLE9BQU87QUFDeEMsY0FBSSxRQUFRLFNBQVMsaUJBQWlCLEVBQUUsV0FBVyxNQUFNLFNBQVMsS0FBSyxDQUFDO0FBRXhFLHFCQUFXLE1BQU07QUFDYixnQkFBSTtBQUFFLGtCQUFJLFdBQVc7QUFBQSxZQUFHLFFBQVE7QUFBQSxZQUFFO0FBQ2xDLG1CQUFPLElBQUksTUFBTSx1Q0FBdUMsQ0FBQztBQUFBLFVBQzdELEdBQUcsRUFBRTtBQUFBLFFBQ1QsQ0FBQztBQUFBLE1BQ0w7QUFBQSxJQUNKO0FBRUEsYUFBUyxrQkFBa0I7QUFDdkIsYUFDSSxTQUFTLGNBQWMsdUJBQXVCLEtBQzlDLFNBQVMsY0FBYyxzQ0FBc0M7QUFBQSxJQUVyRTtBQUtBLGFBQVMsNEJBQTRCO0FBQ2pDLFlB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
