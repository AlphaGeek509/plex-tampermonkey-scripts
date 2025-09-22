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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXVpLWh1Yi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXG4oKCkgPT4ge1xuICAgIGNvbnN0IFJPT1QgPSAodHlwZW9mIHVuc2FmZVdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB1bnNhZmVXaW5kb3cgOiB3aW5kb3cpO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gSG9pc3RlZCwgc2hhcmVkIGhlbHBlcnMgKHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGgpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBpZiAoIVJPT1Qud2FpdEZvckNvbnRhaW5lckFuZEFuY2hvcikge1xuICAgICAgICBST09ULndhaXRGb3JDb250YWluZXJBbmRBbmNob3IgPSBmdW5jdGlvbiB3YWl0Rm9yQ29udGFpbmVyQW5kQW5jaG9yKFxuICAgICAgICAgICAgbXMgPSAxNTAwMCxcbiAgICAgICAgICAgIHNlbHMgPSBbJy5wbGV4LWFjdGlvbnMtd3JhcHBlci5wbGV4LWdyaWQtYWN0aW9ucycsICcucGxleC1hY3Rpb25zLXdyYXBwZXInXVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHJ5RmluZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUHJlZmVyIHBhZ2UgY29udGVudDsgZmFsbCBiYWNrIHRvIHdyYXBwZXI7IGxhc3QgcmVzb3J0IGJvZHlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50IHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBCYWNrLWNvbXBhdDogZXhwb3NlIGFuIGFuY2hvciBpZiBvbmUgZXhpc3RzIChub3QgdXNlZCBieSBtb2Rlcm4gaW5zZXJ0KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWZvcmVOb2RlID0gc2Vscy5tYXAocyA9PiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHMpKS5maW5kKEJvb2xlYW4pIHx8IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRhaW5lcikgcmV0dXJuIHJlc29sdmUoeyBjb250YWluZXIsIGJlZm9yZU5vZGUgfSk7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHRyeUZpbmQoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0cnlGaW5kKTtcbiAgICAgICAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IG9icy5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2x0LXVpLWh1YjogQ29udGFpbmVyL2FuY2hvciBub3QgZm91bmQnKSk7XG4gICAgICAgICAgICAgICAgfSwgbXMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE5hdmJhclJpZ2h0KCkge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIgLm5hdmJhci1yaWdodCcpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gTm9ybWFsaXplIHBlcnNpc3RlbnQgYmFubmVyIGhlaWdodCBhdCBydW50aW1lIHNvIFBST0QgbWF0Y2hlcyBURVNULlxuICAgIC8vIFRFU1Q6IC5wbGV4LWVudi1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgXHUyMjQ4IDUwcHhcbiAgICAvLyBQUk9EOiAucGxleC1wZXJzaXN0ZW50LWJhbm5lci1jb250YWluZXIgZXhpc3RzIGJ1dCBpcyBvZnRlbiAwcHhcbiAgICBmdW5jdGlvbiBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCkge1xuICAgICAgICBjb25zdCBlbnZCYW5uZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1lbnYtcGVyc2lzdGVudC1iYW5uZXItY29udGFpbmVyJyk7IC8vIFRFU1RcbiAgICAgICAgY29uc3QgbGl2ZUJhbm5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LXBlcnNpc3RlbnQtYmFubmVyLWNvbnRhaW5lcicpOyAgICAgLy8gUFJPRFxuXG4gICAgICAgIGNvbnN0IGVudkggPSBlbnZCYW5uZXIgPyBlbnZCYW5uZXIub2Zmc2V0SGVpZ2h0IDogMDtcbiAgICAgICAgY29uc3QgbGl2ZUggPSBsaXZlQmFubmVyID8gbGl2ZUJhbm5lci5vZmZzZXRIZWlnaHQgOiAwO1xuXG4gICAgICAgIC8vIFJlYWQgY3VycmVudCBDU1MgdmFyIChmcmFtZXdvcmsgc2V0cyAwIGJ5IGRlZmF1bHQgaW4gYm90aCB0aGVtZXMpLlxuICAgICAgICBjb25zdCByb290ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgICAgICBjb25zdCBjc3NWYXJTdHIgPSBnZXRDb21wdXRlZFN0eWxlKHJvb3QpLmdldFByb3BlcnR5VmFsdWUoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcpO1xuICAgICAgICBjb25zdCBjc3NWYXIgPSBOdW1iZXIucGFyc2VGbG9hdChjc3NWYXJTdHIpIHx8IDA7XG5cbiAgICAgICAgLy8gSWYgVEVTVCBhbHJlYWR5IGhhcyBhIHJlYWwgYmFubmVyLCBtaXJyb3IgdGhhdCB2YWx1ZSBpbnRvIHRoZSBDU1MgdmFyIGFuZCBleGl0LlxuICAgICAgICBpZiAoZW52SCA+IDApIHtcbiAgICAgICAgICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcsIGAke2Vudkh9cHhgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIFBST0QgYmFubmVyIGV4aXN0cyBidXQgY29udHJpYnV0ZXMgMCBhbmQgdGhlIHZhciBpcyAwLCBsaWZ0IGl0IHRvIDUwIChvYnNlcnZlZCBURVNUIGJhc2VsaW5lKS5cbiAgICAgICAgaWYgKGxpdmVCYW5uZXIgJiYgbGl2ZUggPT09IDAgJiYgY3NzVmFyID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBGQUxMQkFDSyA9IDUwO1xuICAgICAgICAgICAgbGl2ZUJhbm5lci5zdHlsZS5oZWlnaHQgPSBgJHtGQUxMQkFDS31weGA7XG4gICAgICAgICAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXNpZGUtbWVudS1wZXJzaXN0ZW50LWJhbm5lci1oZWlnaHQnLCBgJHtGQUxMQkFDS31weGApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBpZiAoIVJPT1QuY3JlYXRlSHViKSB7XG4gICAgICAgIFJPT1QuY3JlYXRlSHViID0gZnVuY3Rpb24gY3JlYXRlSHViKCkge1xuICAgICAgICAgICAgLy8gSG9zdCBlbGVtZW50ICgrc2hhZG93KVxuICAgICAgICAgICAgY29uc3QgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgaG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbHQtaHViJywgJzEnKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3QgPSBob3N0LmF0dGFjaFNoYWRvdyh7IG1vZGU6ICdvcGVuJyB9KTtcblxuICAgICAgICAgICAgLy8gU3R5bGVzICh2YWxpZCBDU1Mgb25seSlcbiAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICA6aG9zdCB7IGFsbDogaW5pdGlhbDsgfVxuICAgICAgICAuaHViIHtcbiAgICAgICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgICAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgICAgIGJhY2tncm91bmQ6ICNmZmZmZmY7XG4gICAgICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMCwwLDAsLjA4KTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwuMDYpO1xuICAgICAgICAgIHBhZGRpbmc6IDhweCAxMnB4O1xuICAgICAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnIgYXV0byAxZnI7XG4gICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICBnYXA6IDhweDtcbiAgICAgICAgICBmb250OiAxM3B4IHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLFNlZ29lIFVJLFJvYm90byxzYW5zLXNlcmlmO1xuICAgICAgICB9XG4gICAgICAgIDpob3N0KFtkYXRhLWVsZXZhdGVkPVwiMVwiXSkgLmh1YiB7IGJveC1zaGFkb3c6IDAgNnB4IDE4cHggcmdiYSgwLDAsMCwuMTgpOyB9XG5cbiAgICAgICAgLmxlZnQsIC5jZW50ZXIsIC5yaWdodCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgfVxuICAgICAgICAubGVmdCAgIHsganVzdGlmeS1jb250ZW50OiBmbGV4LXN0YXJ0OyB9XG4gICAgICAgIC5jZW50ZXIgeyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZmxleC13cmFwOiB3cmFwOyB9XG4gICAgICAgIC5yaWdodCAgeyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kOyB9XG5cbiAgICAgICAgLyogTmF2YmFyIHZhcmlhbnQgcmVuZGVycyBpbmxpbmU7IG5vIHBhZ2UgbGF5b3V0IGFkanVzdG1lbnRzICovXG4gICAgICAgIDpob3N0KFtkYXRhLXZhcmlhbnQ9XCJuYXZcIl0pIC5odWIge1xuICAgICAgICAgIGJvcmRlcjogMDsgYm94LXNoYWRvdzogbm9uZTsgcGFkZGluZzogMDtcbiAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiBub25lOyBnYXA6IDhweDtcbiAgICAgICAgfVxuICAgICAgICA6aG9zdChbZGF0YS12YXJpYW50PVwibmF2XCJdKSAubGVmdCxcbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLmNlbnRlcixcbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLnJpZ2h0IHsgZGlzcGxheTogaW5saW5lLWZsZXg7IH1cbiAgICAgICAgLyogS2VlcCBicmFuZCB2aXNpYmxlIGluIG5hdiB0b28gKGNoYW5nZSB0byAnbm9uZScgdG8gaGlkZSkgKi9cbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgLmJyYW5kIHsgZGlzcGxheTogaW5saW5lLWZsZXg7IH1cbiAgICAgICAgOmhvc3QoW2RhdGEtdmFyaWFudD1cIm5hdlwiXSkgYnV0dG9uLmhidG4geyBwYWRkaW5nOiA0cHggMTBweDsgfVxuXG4gICAgICAgIC5icmFuZCB7XG4gICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4O1xuICAgICAgICAgIHBhZGRpbmc6IDRweCA4cHg7IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsMCwwLC4xMik7XG4gICAgICAgICAgYmFja2dyb3VuZDogI2Y3ZjlmYjsgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgfVxuICAgICAgICAvKiBNYXAgZ2xvYmFsIHRoZW1lIHZhcnMgKGZyb20gOnJvb3QgaW4gdGhlbWUuY3NzKSBpbnRvIHRoZSBzaGFkb3cgdHJlZSAqL1xuICAgICAgICA6aG9zdCB7XG4gICAgICAgICAgLS1sdC1icmFuZDogdmFyKC0tYnJhbmQtNjAwLCAjMGI1ZmZmKTtcbiAgICAgICAgICAtLWx0LWJyYW5kLTcwMDogdmFyKC0tYnJhbmQtNzAwLCAjMGE0ZmQ2KTtcbiAgICAgICAgICAtLWx0LWluazogdmFyKC0taW5rLCAjMjIyKTtcbiAgICAgICAgICAtLWx0LWluay1tdXRlZDogdmFyKC0taW5rLW11dGVkLCAjNjY2KTtcbiAgICAgICAgICAtLWx0LW9rOiB2YXIoLS1vaywgIzE1ODAzZCk7XG4gICAgICAgICAgLS1sdC13YXJuOiB2YXIoLS13YXJuLCAjYjQ1MzA5KTtcbiAgICAgICAgICAtLWx0LWVycjogdmFyKC0tZXJyLCAjYjkxYzFjKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIEJyYW5kIHRva2VuIHRvdWNoZXMgKi9cbiAgICAgICAgLmRvdCB7IHdpZHRoOiA4cHg7IGhlaWdodDogOHB4OyBib3JkZXItcmFkaXVzOiA5OTlweDsgYmFja2dyb3VuZDogdmFyKC0tbHQtYnJhbmQpOyB9XG5cbiAgICAgICAgLyogQnV0dG9uIHN5c3RlbTogcHJpbWFyeSAvIGdob3N0LCB3aXRoIGFjY2Vzc2libGUgZm9jdXMgKyBob3ZlciBzdGF0ZXMgKi9cbiAgICAgICAgYnV0dG9uLmhidG4ge1xuICAgICAgICAgIGFsbDogdW5zZXQ7XG4gICAgICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgICAgICBwYWRkaW5nOiA4cHggMTJweDtcbiAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgICAgIGJhY2tncm91bmQ6IHZhcigtLWx0LWJyYW5kKTtcbiAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDFweCAzcHggcmdiYSgwLDAsMCwuMDgpO1xuICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIC4xOHMgZWFzZSwgdHJhbnNmb3JtIC4wNnMgZWFzZSwgYm94LXNoYWRvdyAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAuMThzIGVhc2UsIGNvbG9yIC4xOHMgZWFzZTtcbiAgICAgICAgfVxuICAgICAgICBidXR0b24uaGJ0bjpob3ZlciB7XG4gICAgICAgICAgYmFja2dyb3VuZDogdmFyKC0tbHQtYnJhbmQtNzAwKTtcbiAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwuMTIpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwLjVweCk7IH1cblxuICAgICAgICBidXR0b24uaGJ0bjpmb2N1cy12aXNpYmxlIHtcbiAgICAgICAgICBvdXRsaW5lOiAycHggc29saWQgY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWx0LWJyYW5kKSA0MCUsIHdoaXRlKTtcbiAgICAgICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgICAgICAgIGJveC1zaGFkb3c6IDAgMCAwIDNweCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDI1JSwgdHJhbnNwYXJlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnV0dG9uLmhidG5bZGlzYWJsZWRdIHtcbiAgICAgICAgICBvcGFjaXR5OiAuNjtcbiAgICAgICAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICAgICAgICAgIGJveC1zaGFkb3c6IG5vbmU7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBHaG9zdCB2YXJpYW50IChvcHRpb25hbCk6IGFkZCB2aWEgY2xhc3NMaXN0IHdoaWxlIHJlZ2lzdGVyaW5nICovXG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0IHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgICBjb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICAgIGJvcmRlci1jb2xvcjogdmFyKC0tbHQtYnJhbmQpO1xuICAgICAgICB9XG4gICAgICAgIGJ1dHRvbi5oYnRuLmhidG4tLWdob3N0OmhvdmVyIHtcbiAgICAgICAgICBiYWNrZ3JvdW5kOiBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tbHQtYnJhbmQpIDglLCB0cmFuc3BhcmVudCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC5zZXAgeyB3aWR0aDogMXB4OyBoZWlnaHQ6IDIwcHg7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsLjEyKTsgfVxuICAgICAgICAuc3RhdHVzIHtcbiAgICAgICAgICBwYWRkaW5nOiAzcHggMTBweDsgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDAsMCwuMTUpOyBiYWNrZ3JvdW5kOiAjZjhmYWZjOyBmb250LXNpemU6IDEycHg7XG4gICAgICAgIH1cbiAgICAgICAgLnN0YXR1cy5zdWNjZXNzIHsgYmFja2dyb3VuZDojZWNmZGY1OyBib3JkZXItY29sb3I6I2QxZmFlNTsgfVxuICAgICAgICAuc3RhdHVzLmluZm8gICAgeyBiYWNrZ3JvdW5kOiNlZmY2ZmY7IGJvcmRlci1jb2xvcjojZGJlYWZlOyB9XG4gICAgICAgIC5zdGF0dXMud2FybiAgICB7IGJhY2tncm91bmQ6I2ZmZmJlYjsgYm9yZGVyLWNvbG9yOiNmZWYzYzc7IH1cbiAgICAgICAgLnN0YXR1cy5kYW5nZXIgIHsgYmFja2dyb3VuZDojZmVmMmYyOyBib3JkZXItY29sb3I6I2ZlZTJlMjsgfVxuXG4gICAgICAgIC5zdGF0dXMtd3JhcCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgfVxuICAgICAgICAuc3Bpbm5lciB7XG4gICAgICAgICAgd2lkdGg6IDE2cHg7IGhlaWdodDogMTZweDsgYm9yZGVyLXJhZGl1czogNTAlO1xuICAgICAgICAgIGJvcmRlcjogMnB4IHNvbGlkIHJnYmEoMCwwLDAsLjE1KTsgYm9yZGVyLXRvcC1jb2xvcjogIzBlYTVlOTtcbiAgICAgICAgICBhbmltYXRpb246IHNwaW4gODAwbXMgbGluZWFyIGluZmluaXRlO1xuICAgICAgICB9XG4gICAgICAgIEBrZXlmcmFtZXMgc3BpbiB7IHRvIHsgdHJhbnNmb3JtOiByb3RhdGUoMzYwZGVnKTsgfSB9XG5cbiAgICAgICAgLyogQm9keSBtb3VudDogcGFnZSBwYWRkaW5nIGhhbmRsZWQgd2l0aCBDU1MgdmFyIChzZXQgYnkgSlMpICovXG4gICAgICAgIGh0bWwsIGJvZHkgeyAtLWx0LWh1Yi1oOiAwcHg7IH1cbiAgICAgICAgYm9keS5sdC1odWItcGFkZGVkIHsgcGFkZGluZy10b3A6IHZhcigtLWx0LWh1Yi1oKSAhaW1wb3J0YW50OyB9XG4gICAgICBgO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAgICAgICAgIC8vIFN0cnVjdHVyZVxuICAgICAgICAgICAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyB3cmFwLmNsYXNzTmFtZSA9ICdodWInO1xuICAgICAgICAgICAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBsZWZ0LmNsYXNzTmFtZSA9ICdsZWZ0JztcbiAgICAgICAgICAgIGNvbnN0IGNlbnRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBjZW50ZXIuY2xhc3NOYW1lID0gJ2NlbnRlcic7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyByaWdodC5jbGFzc05hbWUgPSAncmlnaHQnO1xuXG4gICAgICAgICAgICAvLyBCcmFuZGluZyBwaWxsXG4gICAgICAgICAgICBjb25zdCBicmFuZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgIGJyYW5kLmNsYXNzTmFtZSA9ICdicmFuZCc7XG4gICAgICAgICAgICBicmFuZC5pbm5lckhUTUwgPSAnPHNwYW4gY2xhc3M9XCJkb3RcIj48L3NwYW4+PHNwYW4gY2xhc3M9XCJicmFuZC10ZXh0XCI+T25lTW9ucm9lPC9zcGFuPic7XG4gICAgICAgICAgICBsZWZ0LmFwcGVuZENoaWxkKGJyYW5kKTtcblxuICAgICAgICAgICAgLy8gRGVkaWNhdGVkIHN0YXR1cyBzbG90IHRoYXQgbXVzdCBhbHdheXMgYmUgdGhlIGxhc3QgY2hpbGQgaW4gXCJyaWdodFwiXG4gICAgICAgICAgICBjb25zdCBzdGF0dXNTbG90ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgc3RhdHVzU2xvdC5jbGFzc05hbWUgPSAnc3RhdHVzLXNsb3QnO1xuICAgICAgICAgICAgcmlnaHQuYXBwZW5kQ2hpbGQoc3RhdHVzU2xvdCk7XG5cbiAgICAgICAgICAgIHdyYXAuYXBwZW5kKGxlZnQsIGNlbnRlciwgcmlnaHQpO1xuICAgICAgICAgICAgcm9vdC5hcHBlbmRDaGlsZCh3cmFwKTtcblxuICAgICAgICAgICAgLy8gQVBJIGV4cGVjdGVkIGJ5IGx0LmNvcmUgZmFjYWRlXG4gICAgICAgICAgICBjb25zdCBERUZBVUxUX1BJTExfUkVTRVRfTVMgPSA1MDAwOyAvLyA1IHNlY29uZHNcbiAgICAgICAgICAgIGNvbnN0IG1rU3RhdHVzID0gKHRleHQsIHRvbmUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyB3LmNsYXNzTmFtZSA9ICdzdGF0dXMtd3JhcCc7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgcy5jbGFzc05hbWUgPSBgc3RhdHVzICR7dG9uZX1gO1xuICAgICAgICAgICAgICAgIHMudGV4dENvbnRlbnQgPSB0ZXh0IHx8ICcnO1xuICAgICAgICAgICAgICAgIHcuYXBwZW5kQ2hpbGQocyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHc7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBhcGkgPSB7XG4gICAgICAgICAgICAgICAgX3NoYWRvdzogcm9vdCxcbiAgICAgICAgICAgICAgICByZWdpc3RlckJ1dHRvbihzaWRlID0gJ2xlZnQnLCBkZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gKHNpZGUgPT09ICdyaWdodCcpID8gcmlnaHQgOiAoc2lkZSA9PT0gJ2NlbnRlcicgPyBjZW50ZXIgOiBsZWZ0KTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGVsID0gZGVmPy5lbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNsYXNzTmFtZSA9ICdoYnRuJzsgLy8gZGVmYXVsdCA9IHByaW1hcnkgYnJhbmRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRvIHJlbmRlciBhIGdob3N0IGJ1dHRvbiwgcGFzcyB7IGNsYXNzTmFtZTogJ2hidG4gaGJ0bi0tZ2hvc3QnIH0gdmlhIGRlZi5lbCBvciBwYXRjaCBsYXRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWY/LmlkKSBlbC5kYXRhc2V0LmlkID0gZGVmLmlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwudGV4dENvbnRlbnQgPSBkZWY/LmxhYmVsID8/ICdBY3Rpb24nO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZj8udGl0bGUpIGVsLnRpdGxlID0gU3RyaW5nKGRlZi50aXRsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5hcmlhTGFiZWwpIGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIFN0cmluZyhkZWYuYXJpYUxhYmVsKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRlZj8ub25DbGljayA9PT0gJ2Z1bmN0aW9uJykgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBkZWYub25DbGljayk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy5kaXNhYmxlZCkgZWwuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGRlZj8uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmRhdGFzZXQuaWQgPSBkZWYuaWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVmPy50aXRsZSkgZWwudGl0bGUgPSBTdHJpbmcoZGVmLnRpdGxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWY/LmFyaWFMYWJlbCkgZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgU3RyaW5nKGRlZi5hcmlhTGFiZWwpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEtlZXAgc3RhdHVzIHBpbGwgYXQgdGhlIGZhciByaWdodDogaW5zZXJ0IG5ldyByaWdodC1zaWRlIGl0ZW1zIEJFRk9SRSBzdGF0dXNTbG90XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByaWdodC5pbnNlcnRCZWZvcmUoZWwsIHN0YXR1c1Nsb3QpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmFwcGVuZENoaWxkKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgdXBkYXRlQnV0dG9uKGlkLCBwYXRjaCA9IHt9KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSByb290LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLWlkPVwiJHtDU1MuZXNjYXBlKGlkKX1cIl1gKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFuKSByZXR1cm4gYXBpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGF0Y2gubGFiZWwgPT09ICdzdHJpbmcnICYmIG4udGFnTmFtZSA9PT0gJ0JVVFRPTicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG4udGV4dENvbnRlbnQgPSBwYXRjaC5sYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhdGNoLnRpdGxlID09PSAnc3RyaW5nJykgbi50aXRsZSA9IHBhdGNoLnRpdGxlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhdGNoLmFyaWFMYWJlbCA9PT0gJ3N0cmluZycpIG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcGF0Y2guYXJpYUxhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCdkaXNhYmxlZCcgaW4gcGF0Y2ggJiYgbi50YWdOYW1lID09PSAnQlVUVE9OJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbi5kaXNhYmxlZCA9ICEhcGF0Y2guZGlzYWJsZWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwYXRjaC5vbkNsaWNrID09PSAnZnVuY3Rpb24nICYmIG4udGFnTmFtZSA9PT0gJ0JVVFRPTicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsb25lID0gbi5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbG9uZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHBhdGNoLm9uQ2xpY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmUuZGF0YXNldC5pZCA9IGlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgbi5yZXBsYWNlV2l0aChjbG9uZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHJlbW92ZShpZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlkKSByZXR1cm4gYXBpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcm9vdC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1pZD1cIiR7Q1NTLmVzY2FwZShpZCl9XCJdYCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuICYmIG4ucGFyZW50Tm9kZSkgbi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgY2xlYXIoKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlZnQucmVwbGFjZUNoaWxkcmVuKCk7XG4gICAgICAgICAgICAgICAgICAgIGNlbnRlci5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gUHJlc2VydmUgc3RhdHVzU2xvdCBhdCB0aGUgZmFyIHJpZ2h0OyByZW1vdmUgb3RoZXIgcmlnaHQgY2hpbGRyZW5cbiAgICAgICAgICAgICAgICAgICAgWy4uLnJpZ2h0LmNoaWxkcmVuXS5mb3JFYWNoKG4gPT4geyBpZiAobiAhPT0gc3RhdHVzU2xvdCkgbi5yZW1vdmUoKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKCk7IC8vIGNsZWFyIHRoZSBwaWxsIGNvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGxpc3QoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbCA9IFsuLi5sZWZ0LmNoaWxkcmVuLCAuLi5jZW50ZXIuY2hpbGRyZW4sIC4uLnJpZ2h0LmNoaWxkcmVuXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFsbC5tYXAobiA9PiBuLmRhdGFzZXQ/LmlkKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXModGV4dCwgdG9uZSA9ICdpbmZvJywgb3B0cyA9IHt9KSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKG1rU3RhdHVzKHRleHQsIHRvbmUpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RpY2t5ID0gISFvcHRzPy5zdGlja3k7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zID0gKG9wdHM/Lm1zID8/IG9wdHM/LnRpbWVvdXQgPz8gREVGQVVMVF9QSUxMX1JFU0VUX01TKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGlja3kgJiYgdGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgaWYgKHN0YXR1c1Nsb3QuaXNDb25uZWN0ZWQpIHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKCk7IH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBtcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGJlZ2luVGFzayhsYWJlbCwgdG9uZSA9ICdpbmZvJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB3cmFwTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgd3JhcE5vZGUuY2xhc3NOYW1lID0gJ3N0YXR1cy13cmFwJztcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3BpbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgc3Bpbi5jbGFzc05hbWUgPSAnc3Bpbm5lcic7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgbGFiLmNsYXNzTmFtZSA9IGBzdGF0dXMgJHt0b25lfWA7IGxhYi50ZXh0Q29udGVudCA9IGxhYmVsIHx8ICdXb3JraW5nXHUyMDI2JztcbiAgICAgICAgICAgICAgICAgICAgd3JhcE5vZGUuYXBwZW5kKHNwaW4sIGxhYik7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKHdyYXBOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZSh0ZXh0KSB7IGlmICh0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycpIGxhYi50ZXh0Q29udGVudCA9IHRleHQ7IHJldHVybiB0aGlzOyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2Vzcyh0ZXh0ID0gJ0RvbmUnKSB7IGxhYi5jbGFzc05hbWUgPSAnc3RhdHVzIHN1Y2Nlc3MnOyBsYWIudGV4dENvbnRlbnQgPSB0ZXh0OyBzcGluLnJlbW92ZSgpOyByZXR1cm4gdGhpczsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKHRleHQgPSAnRXJyb3InKSB7IGxhYi5jbGFzc05hbWUgPSAnc3RhdHVzIGRhbmdlcic7IGxhYi50ZXh0Q29udGVudCA9IHRleHQ7IHNwaW4ucmVtb3ZlKCk7IHJldHVybiB0aGlzOyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYXIoKSB7IHN0YXR1c1Nsb3QucmVwbGFjZUNoaWxkcmVuKCk7IHJldHVybiB0aGlzOyB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBub3RpZnkoa2luZCwgdGV4dCwgeyBtcyA9IERFRkFVTFRfUElMTF9SRVNFVF9NUywgc3RpY2t5ID0gZmFsc2UgfSA9IHt9KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJldXNlIHNldFN0YXR1cyBiZWhhdmlvciBzbyBzdGlja3kvbXMgd29yayB0aGUgc2FtZVxuICAgICAgICAgICAgICAgICAgICBhcGkuc2V0U3RhdHVzKHRleHQsIGtpbmQsIHsgbXMsIHN0aWNreSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgaG9zdCwgbGVmdCwgY2VudGVyLCByaWdodCwgYXBpIH07XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gZW5zdXJlTFRIdWI6IHNpbmdsZXRvbiBtb3VudCAobmF2L2JvZHkpXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBhc3luYyBmdW5jdGlvbiBfZW5zdXJlTFRIdWJJbnRlcm5hbChvcHRzID0ge30pIHtcbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgdGltZW91dE1zID0gMTUwMDAsXG4gICAgICAgICAgICBzZWxlY3RvcnMgPSBbJy5wbGV4LWFjdGlvbnMtd3JhcHBlci5wbGV4LWdyaWQtYWN0aW9ucycsICcucGxleC1hY3Rpb25zLXdyYXBwZXInXSxcbiAgICAgICAgICAgIHRoZW1lID0gbnVsbCwgICAgICAgICAgICAgICAvLyByZXNlcnZlZCBmb3IgZnV0dXJlIHRoZW1lIGluamVjdGlvblxuICAgICAgICAgICAgbW91bnQ6IG1vdW50T3B0ID0gbnVsbCwgICAgIC8vICduYXYnIHwgJ2JvZHknIHwgbnVsbFxuICAgICAgICAgICAgZGlzYWJsZU1vZGFsRWxldmF0ZSA9IHRydWUgIC8vIHJlc2VydmVkIGZvciBsZWdhY3kgYmVoYXZpb3Igd2UgcmVtb3ZlZFxuICAgICAgICB9ID0gb3B0cztcblxuICAgICAgICAvLyBJZiBhbiBBUEkgYWxyZWFkeSBleGlzdHMsIHJldXNlIGl0LlxuICAgICAgICBpZiAoUk9PVC5sdFVJSHViKSByZXR1cm4gUk9PVC5sdFVJSHViO1xuXG4gICAgICAgIC8vIFJldXNlIGFuIGluLWZsaWdodCBwcm9taXNlIGlmIHByZXNlbnRcbiAgICAgICAgaWYgKFJPT1QuX19lbnN1cmVMVEh1YlByb21pc2UpIHJldHVybiBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlO1xuXG4gICAgICAgIC8vIElmIHRoZXJlJ3MgYWxyZWFkeSBhIGhvc3QgaW4gRE9NLCB0cnkgdG8gcmV1c2UgaXQgXHUyMDEzIGJ1dCBhbGlnbiBpdHMgdmFyaWFudCB0byByZXF1ZXN0ZWQgbW91bnQuXG4gICAgICAgIGNvbnN0IHByZUV4aXN0aW5nSG9zdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWx0LWh1Yj1cIjFcIl0nKTtcbiAgICAgICAgaWYgKHByZUV4aXN0aW5nSG9zdCAmJiBST09ULmx0VUlIdWIpIHtcbiAgICAgICAgICAgIGNvbnN0IHdhbnROYXYgPSAobW91bnRPcHQgfHwgUk9PVC5fX0xUX0hVQl9NT1VOVCB8fCAnbmF2JykgPT09ICduYXYnO1xuICAgICAgICAgICAgY29uc3QgY3VyID0gcHJlRXhpc3RpbmdIb3N0LmdldEF0dHJpYnV0ZSgnZGF0YS12YXJpYW50JykgfHwgJyc7XG5cbiAgICAgICAgICAgIGlmICh3YW50TmF2ICYmIGN1ciAhPT0gJ25hdicpIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdW50IHRoZSBleGlzdGluZyBob3N0IGludG8gdGhlIG5hdmJhciBhcyBhIGZ1bGwtd2lkdGggcm93XG4gICAgICAgICAgICAgICAgbGV0IG5hdlJpZ2h0ID1cbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25hdkJhciAubmF2YmFyLXJpZ2h0JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtbmF2YmFyLWNvbnRhaW5lciAubmF2YmFyLXJpZ2h0Jyk7XG5cbiAgICAgICAgICAgICAgICBpZiAobmF2UmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmF2QmFyID1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5hdlJpZ2h0LmNsb3Nlc3QoJyNuYXZCYXIsIC5wbGV4LW5hdmJhci1jb250YWluZXInKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1uYXZiYXItY29udGFpbmVyJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5hdkJhcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJvdyA9IG5hdkJhci5xdWVyeVNlbGVjdG9yKCcubHQtaHViLXJvdycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuY2xhc3NOYW1lID0gJ2x0LWh1Yi1yb3cnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3cuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYXZCYXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZUV4aXN0aW5nSG9zdC5wYXJlbnROb2RlICE9PSByb3cpIHJvdy5hcHBlbmRDaGlsZChwcmVFeGlzdGluZ0hvc3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlRXhpc3RpbmdIb3N0LnNldEF0dHJpYnV0ZSgnZGF0YS12YXJpYW50JywgJ25hdicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihwcmVFeGlzdGluZ0hvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ3N0YXRpYycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9wOiAnJywgbGVmdDogJycsIHJpZ2h0OiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heFdpZHRoOiAnMTAwJScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgekluZGV4OiAnYXV0bycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ2F1dG8nXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIFJPT1QubHRVSUh1YjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSBkZXNpcmVkIG1vdW50XG4gICAgICAgIGNvbnN0IGRlc2lyZWRNb3VudCA9IChtb3VudE9wdCB8fCBST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKTtcblxuICAgICAgICBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlID0gKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY29udGFpbmVyIH0gPSBhd2FpdCBST09ULndhaXRGb3JDb250YWluZXJBbmRBbmNob3IodGltZW91dE1zLCBzZWxlY3RvcnMpO1xuICAgICAgICAgICAgY29uc3QgeyBob3N0LCBhcGkgfSA9IChST09ULmNyZWF0ZUh1YiB8fCBjcmVhdGVIdWIpKCk7XG5cbiAgICAgICAgICAgIGlmIChkZXNpcmVkTW91bnQgPT09ICduYXYnKSB7XG4gICAgICAgICAgICAgICAgLy8gV2FpdCBmb3IgbmF2YmFyOyBuZXZlciBmYWxsIGJhY2sgdG8gYm9keVxuICAgICAgICAgICAgICAgIGxldCBuYXZSaWdodCA9IGZpbmROYXZiYXJSaWdodCgpO1xuICAgICAgICAgICAgICAgIGlmICghbmF2UmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnIgPSBmaW5kTmF2YmFyUmlnaHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5yKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYXZSaWdodCA9IG5yO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgb2JzLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUmVzb2x2ZSB0aGUgYWN0dWFsIDxuYXY+IGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIGNvbnN0IG5hdkJhciA9XG4gICAgICAgICAgICAgICAgICAgIChuYXZSaWdodCAmJiBuYXZSaWdodC5jbG9zZXN0KCduYXYnKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25hdkJhcicpIHx8XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wbGV4LW5hdmJhci1jb250YWluZXIubmF2YmFyJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIW5hdkJhcikgdGhyb3cgbmV3IEVycm9yKCdsdC11aS1odWI6IG5hdkJhciBub3QgZm91bmQnKTtcblxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSAob3IgcmV1c2UpIGEgZGVkaWNhdGVkIGZ1bGwtd2lkdGggcm93IGluc2lkZSA8bmF2PixcbiAgICAgICAgICAgICAgICAvLyBpbnNlcnRlZCBiZWZvcmUgdGhlIG5vcm1hbCBQbGV4IG5hdmJhciBjb250ZW50IHdyYXBwZXIuXG4gICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlTm9kZSA9IG5hdkJhci5xdWVyeVNlbGVjdG9yKCc6c2NvcGUgPiAucGxleC1uYXZiYXItdGl0bGUtY29udGFpbmVyIG5hdmJhci1sZWZ0JykgfHwgbnVsbDtcblxuICAgICAgICAgICAgICAgIGxldCByb3cgPSBuYXZCYXIucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLmx0LWh1Yi1yb3cnKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJvdykge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdsdC1odWItcm93JztcblxuICAgICAgICAgICAgICAgICAgICAvLyBNaW5pbWFsIGlubGluZSBzdHlsZTsgaHViIGhhbmRsZXMgaXRzIG93biBpbm5lciBsYXlvdXQuXG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94JztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsIHRoaW4gZGl2aWRlciB0byBtaW1pYyBuYXRpdmUgcm93czpcbiAgICAgICAgICAgICAgICAgICAgLy8gcm93LnN0eWxlLmJvcmRlckJvdHRvbSA9ICcxcHggc29saWQgcmdiYSgwLDAsMCwuMDgpJztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoYmVmb3JlTm9kZSkgbmF2QmFyLmluc2VydEJlZm9yZShyb3csIGJlZm9yZU5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBlbHNlIG5hdkJhci5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIC0tLSBGdWxsLWJsZWVkOiBjYW5jZWwgbmF2J3MgTC9SIHBhZGRpbmcgYW5kIGJvcmRlcnMgZm9yIG91ciByb3cgb25seSAtLS1cbiAgICAgICAgICAgICAgICBjb25zdCBhcHBseUVkZ2VUb0VkZ2UgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNzID0gZ2V0Q29tcHV0ZWRTdHlsZShuYXZCYXIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwbCA9IHBhcnNlRmxvYXQoY3MucGFkZGluZ0xlZnQpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByID0gcGFyc2VGbG9hdChjcy5wYWRkaW5nUmlnaHQpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsID0gcGFyc2VGbG9hdChjcy5ib3JkZXJMZWZ0V2lkdGgpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJyID0gcGFyc2VGbG9hdChjcy5ib3JkZXJSaWdodFdpZHRoKSB8fCAwO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEV4dGVuZCBhY3Jvc3MgcGFkZGluZyArIGJvcmRlcnNcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLm1hcmdpbkxlZnQgPSAocGwgKyBibCkgPyBgLSR7cGwgKyBibH1weGAgOiAnMCc7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5zdHlsZS5tYXJnaW5SaWdodCA9IChwciArIGJyKSA/IGAtJHtwciArIGJyfXB4YCA6ICcwJztcbiAgICAgICAgICAgICAgICAgICAgcm93LnN0eWxlLndpZHRoID0gKHBsICsgcHIgKyBibCArIGJyKSA/IGBjYWxjKDEwMCUgKyAke3BsICsgcHIgKyBibCArIGJyfXB4KWAgOiAnMTAwJSc7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIEF2b2lkIGR1cGxpY2F0ZSBsaXN0ZW5lcnMgb24gcm91dGUgY2hhbmdlc1xuICAgICAgICAgICAgICAgIGlmICghcm93LmRhdGFzZXQuZWRnZUFwcGxpZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlFZGdlVG9FZGdlKCk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBhcHBseUVkZ2VUb0VkZ2UsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoYXBwbHlFZGdlVG9FZGdlKVxuICAgICAgICAgICAgICAgICAgICAgICAgLm9ic2VydmUobmF2QmFyLCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydzdHlsZScsICdjbGFzcyddIH0pO1xuICAgICAgICAgICAgICAgICAgICByb3cuZGF0YXNldC5lZGdlQXBwbGllZCA9ICcxJztcbiAgICAgICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgICAgIC8vIE1vdmUgdGhlIGh1YiBob3N0IGludG8gb3VyIHJvdyAoZnVsbC13aWR0aClcbiAgICAgICAgICAgICAgICBpZiAoaG9zdC5wYXJlbnROb2RlICE9PSByb3cpIHJvdy5hcHBlbmRDaGlsZChob3N0KTtcblxuICAgICAgICAgICAgICAgIC8vIFVzZSBodWJcdTIwMTlzIGRlZmF1bHQgKGZ1bGwtd2lkdGgpIGxvb2sgXHUyMDE0IG5vdCBjb21wYWN0IFwibmF2XCIgaW5saW5lXG4gICAgICAgICAgICAgICAgaG9zdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdmFyaWFudCcsICdyb3cnKTtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGhvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246ICdzdGF0aWMnLFxuICAgICAgICAgICAgICAgICAgICB0b3A6ICcnLCBsZWZ0OiAnJywgcmlnaHQ6ICcnLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICBtYXhXaWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICB6SW5kZXg6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ2F1dG8nXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBBbGlnbiBQUk9EIHdpdGggVEVTVFx1MjAxOXMgYmFubmVyIGJhc2VsaW5lIGlmIG5lZWRlZC5cbiAgICAgICAgICAgICAgICBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgdGhlIHNoYWRvdyByb290J3MgdG9wLWxldmVsIC5odWIgcmVzcGVjdHMgZnVsbCB3aWR0aFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGh1YlJvb3QgPSBob3N0LnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3IoJy5odWInKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGh1YlJvb3QpIGh1YlJvb3Quc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7IH1cblxuXG4gICAgICAgICAgICAgICAgLy8gTGV0IHRoZSBuYXZiYXIgZ3JvdyBuYXR1cmFsbHkuIFNvbWUgc2tpbnMgZm9yY2UgYSBmaXhlZCBoZWlnaHQgKFx1MjI0ODQ1cHgpLlxuICAgICAgICAgICAgICAgIC8vIE92ZXJyaWRlIHRvIFwiYXV0b1wiIGFuZCBrZWVwIGEgc2Vuc2libGUgbWluaW11bSA9IDQ1cHggKyBodWItcm93IGhlaWdodC5cbiAgICAgICAgICAgICAgICBjb25zdCBCQVNFX0ggPSA0NTsgLy8gbmF0aXZlIFBsZXggdG9wIGJhclxuICAgICAgICAgICAgICAgIG5hdkJhci5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cbiAgICAgICAgICAgICAgICAvLyBUcmFjayBodWIgaGVpZ2h0IGFuZCBhZGp1c3QgbWluLWhlaWdodCBzbyB0aGUgc2Vjb25kIHJvdyBpcyBmdWxseSB2aXNpYmxlLlxuICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZU1pbkhlaWdodCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaCA9IE1hdGgubWF4KDAsIGhvc3QuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApO1xuICAgICAgICAgICAgICAgICAgICAvL25hdkJhci5zdHlsZS5taW5IZWlnaHQgPSBgJHtCQVNFX0ggKyBofXB4YDtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gSW5pdGlhbCArIHJlYWN0aXZlIHNpemluZ1xuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7IHVwZGF0ZU1pbkhlaWdodCgpOyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodXBkYXRlTWluSGVpZ2h0KTsgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpOyB9KTtcbiAgICAgICAgICAgICAgICB0cnkgeyBkb2N1bWVudC5mb250cz8ucmVhZHk/LnRoZW4odXBkYXRlTWluSGVpZ2h0KTsgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdXBkYXRlTWluSGVpZ2h0LCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZWFjdCB0byBodWIgY29udGVudCBjaGFuZ2VzXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm8gPSBuZXcgUmVzaXplT2JzZXJ2ZXIodXBkYXRlTWluSGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgcm8ub2JzZXJ2ZShob3N0KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuXG4gICAgICAgICAgICAgICAgLy8gLS0tIFByb2R1Y3Rpb24tb25seSBzaG9ydGZhbGwgZml4IChubyBwZXJzaXN0ZW50IGJhbm5lcikgLS0tXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgb25seSB3aGVuIHRoZXJlIGlzIE5PIHBlcnNpc3RlbnQgYmFubmVyIChURVNUIGhhcyBvbmU7IFBST0QgdHlwaWNhbGx5IGRvZXMgbm90KS5cbiAgICAgICAgICAgICAgICBjb25zdCBoYXNQZXJzaXN0ZW50QmFubmVyID0gISFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucGxleC1lbnYtcGVyc2lzdGVudC1iYW5uZXItY29udGFpbmVyJyk7XG4gICAgICAgICAgICAgICAgaWYgKGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IEJBU0VfTkFWX0ggPSA0NTsgLy8gYmFzZWxpbmUgUGxleCBuYXZiYXIgaGVpZ2h0XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgUEFHRV9TRUwgPSBbXG4gICAgICAgICAgICAgICAgICAgICAgICAnLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICcucGxleC1zaWRldGFicy1tZW51LXBhZ2UtY29udGVudC1jb250YWluZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgJy5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50J1xuICAgICAgICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldFB4KHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcGFyc2VGbG9hdCh2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGNhcHR1cmVCYXNlKGVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGUgb3JpZ2luYWwgaW5saW5lIHZhbHVlcyBvbmNlIHNvIHdlIGNhbiByZS1kZXJpdmUgbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRzID0gZWwuZGF0YXNldDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZHMubHRCYXNlSCAmJiBlbC5zdHlsZS5oZWlnaHQpIGRzLmx0QmFzZUggPSBlbC5zdHlsZS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRzLmx0QmFzZU1heCAmJiBlbC5zdHlsZS5tYXhIZWlnaHQpIGRzLmx0QmFzZU1heCA9IGVsLnN0eWxlLm1heEhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZHMubHRCYXNlTWluICYmIGVsLnN0eWxlLm1pbkhlaWdodCkgZHMubHRCYXNlTWluID0gZWwuc3R5bGUubWluSGVpZ2h0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gYXBwbHlFeHRyYShlbCwgZXh0cmEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcHR1cmVCYXNlKGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRzID0gZWwuZGF0YXNldDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRnJvbSBiYXNlIGlubGluZSB2YWx1ZXMgKG9yIGN1cnJlbnQgY29tcHV0ZWQpLCBhZGQgJ2V4dHJhJ1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZUggPSBnZXRQeChkcy5sdEJhc2VIKSA/PyBnZXRQeChlbC5zdHlsZS5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZU1heCA9IGdldFB4KGRzLmx0QmFzZU1heCkgPz8gZ2V0UHgoZWwuc3R5bGUubWF4SGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VNaW4gPSBnZXRQeChkcy5sdEJhc2VNaW4pID8/IGdldFB4KGVsLnN0eWxlLm1pbkhlaWdodCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlSCAhPSBudWxsKSBlbC5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLm1heCgwLCBiYXNlSCArIGV4dHJhKX1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFzZU1heCAhPSBudWxsKSBlbC5zdHlsZS5tYXhIZWlnaHQgPSBgJHtNYXRoLm1heCgwLCBiYXNlTWF4ICsgZXh0cmEpfXB4YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXNlTWluICE9IG51bGwpIGVsLnN0eWxlLm1pbkhlaWdodCA9IGAke01hdGgubWF4KDAsIGJhc2VNaW4gKyBleHRyYSl9cHhgO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gYWRqdXN0UGFnZUhlaWdodHMoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGhvdyBtdWNoIHRhbGxlciB0aGFuIHRoZSBiYXNlbGluZSBQbGV4IG5hdiB3ZSBhcmVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hdkggPSBNYXRoLm1heCgwLCBuYXZCYXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0cmEgPSBNYXRoLm1heCgwLCBuYXZIIC0gQkFTRV9OQVZfSCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWV4dHJhKSByZXR1cm47IC8vIE5vdGhpbmcgdG8gZG8gd2hlbiBubyBleHRyYSByb3dcblxuICAgICAgICAgICAgICAgICAgICAgICAgUEFHRV9TRUwuZm9yRWFjaChzZWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsKS5mb3JFYWNoKGVsID0+IGFwcGx5RXh0cmEoZWwsIGV4dHJhKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEluaXRpYWwgKyByZWFjdGl2ZSBhcHBsaWNhdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHsgYWRqdXN0UGFnZUhlaWdodHMoKTsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFkanVzdFBhZ2VIZWlnaHRzKTsgbm9ybWFsaXplUGVyc2lzdGVudEJhbm5lcigpOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGFkanVzdFBhZ2VIZWlnaHRzLCB7IHBhc3NpdmU6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gT2JzZXJ2ZSBuYXYgaGVpZ2h0IGNoYW5nZXMgKGUuZy4sIGlmIGh1YiBjb250ZW50IGdyb3dzL3Nocmlua3MpXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByMiA9IG5ldyBSZXNpemVPYnNlcnZlcihhZGp1c3RQYWdlSGVpZ2h0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByMi5vYnNlcnZlKG5hdkJhcik7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgUGxleCByZXdyaXRlcyBpbmxpbmUgaGVpZ2h0cyBsYXRlciwgcmUtYXBwbHkgb3VyIGFkanVzdG1lbnRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBoaXQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbSBvZiBtdXRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG0udHlwZSA9PT0gJ2F0dHJpYnV0ZXMnICYmIG0uYXR0cmlidXRlTmFtZSA9PT0gJ3N0eWxlJykgeyBoaXQgPSB0cnVlOyBicmVhazsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtLnR5cGUgPT09ICdjaGlsZExpc3QnKSB7IGhpdCA9IHRydWU7IGJyZWFrOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGl0KSBhZGp1c3RQYWdlSGVpZ2h0cygpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgbW8ub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnc3R5bGUnXSB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQm9keSB2YXJpYW50IChub24tb3ZlcmxheSk6IGluc2VydCBhIHNwYWNlciBhaGVhZCBvZiB0aGUgaHViIGVxdWFsIHRvXG4gICAgICAgICAgICAgICAgLy8gUGxleCdzIGZpeGVkIGNocm9tZSAoYmFubmVyICsgbmF2YmFyKS4gVGhlbiBtYWtlIHRoZSBodWIgc3RpY2t5IGF0IHRvcDowLlxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnROb2RlID1cbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5wbGV4LXNpZGV0YWJzLW1lbnUtcGFnZS1jb250ZW50JykgfHxcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnBsZXgtc2lkZXRhYnMtbWVudS1wYWdlLWNvbnRlbnQnKSB8fFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXI7XG5cbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgYSBzcGFjZXIgZXhpc3RzIGFzIHRoZSBmaXJzdCBjaGlsZFxuICAgICAgICAgICAgICAgIGxldCBzcGFjZXIgPSBjb250ZW50Tm9kZS5xdWVyeVNlbGVjdG9yKCc6c2NvcGUgPiAubHQtaHViLXNwYWNlcicpO1xuICAgICAgICAgICAgICAgIGlmICghc3BhY2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuY2xhc3NOYW1lID0gJ2x0LWh1Yi1zcGFjZXInO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5oZWlnaHQgPSAnMHB4JzsgICAgIC8vIHNpemVkIGR5bmFtaWNhbGx5XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5tYXJnaW4gPSAnMCc7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNlci5zdHlsZS5wYWRkaW5nID0gJzAnO1xuICAgICAgICAgICAgICAgICAgICBzcGFjZXIuc3R5bGUuZmxleCA9ICcwIDAgYXV0byc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnROb2RlLnByZXBlbmQoc3BhY2VyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBQbGFjZSB0aGUgaHViIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBzcGFjZXJcbiAgICAgICAgICAgICAgICBpZiAoc3BhY2VyLm5leHRTaWJsaW5nICE9PSBob3N0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChob3N0LnBhcmVudE5vZGUpIGhvc3QucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChob3N0KTtcbiAgICAgICAgICAgICAgICAgICAgc3BhY2VyLmFmdGVyKGhvc3QpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRyYWNrIGh1YiBoZWlnaHQgKGZvciBjb25zdW1lcnMvbWV0cmljcyBvbmx5KVxuICAgICAgICAgICAgICAgIGNvbnN0IHNldEh1YkggPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCBob3N0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodCB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWx0LWh1Yi1oJywgYCR7aH1weGApO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBDb21wdXRlIFBsZXggY2hyb21lIGhlaWdodDogcGVyc2lzdGVudCBiYW5uZXIgKyBtYWluIG5hdlxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXB1dGVDaHJvbWVUb3AgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRvYyA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3NzID0gZ2V0Q29tcHV0ZWRTdHlsZShkb2MpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYW5uZXJIID0gcGFyc2VJbnQoY3NzLmdldFByb3BlcnR5VmFsdWUoJy0tc2lkZS1tZW51LXBlcnNpc3RlbnQtYmFubmVyLWhlaWdodCcpKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbmF2QmFyJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5hdkggPSBuYXYgPyBNYXRoLm1heCgwLCBuYXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0IHx8IDApIDogMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hyb21lVG9wID0gYmFubmVySCArIG5hdkg7XG4gICAgICAgICAgICAgICAgICAgIGRvYy5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1sdC1maXhlZC10b3AnLCBgJHtjaHJvbWVUb3B9cHhgKTtcbiAgICAgICAgICAgICAgICAgICAgLy9zcGFjZXIuc3R5bGUuaGVpZ2h0ID0gYCR7Y2hyb21lVG9wfXB4YDtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gUmVjYWxjIG9uIGxheW91dC9ET00gY2hhbmdlc1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlY2FsYyA9ICgpID0+IHsgc2V0SHViSCgpOyBjb21wdXRlQ2hyb21lVG9wKCk7IH07XG4gICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHsgcmVjYWxjKCk7IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZWNhbGMpOyBub3JtYWxpemVQZXJzaXN0ZW50QmFubmVyKCk7IH0pO1xuICAgICAgICAgICAgICAgIHRyeSB7IGRvY3VtZW50LmZvbnRzPy5yZWFkeT8udGhlbihyZWNhbGMpOyB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZWNhbGMsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBuZXcgTXV0YXRpb25PYnNlcnZlcihyZWNhbGMpLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgIC8vIE1ha2UgdGhlIGh1YiBzdGlja3kgYXQgdGhlIGxvY2FsIHRvcCAobm8gZG91YmxlLW9mZnNldClcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGhvc3Quc3R5bGUsIHtcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246ICdzdGlja3knLFxuICAgICAgICAgICAgICAgICAgICB0b3A6ICcwJyxcbiAgICAgICAgICAgICAgICAgICAgbGVmdDogJzAnLFxuICAgICAgICAgICAgICAgICAgICByaWdodDogJzAnLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICAgICAgICAgICAgICB6SW5kZXg6ICcxMCcsICAgICAgICAgIC8vIGFib3ZlIGNvbnRlbnQsIGJlbG93IG1vZGFsc1xuICAgICAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnRzOiAnYXV0bydcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBST09ULmx0VUlIdWIgPSBhcGk7XG4gICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICB9KSgpLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgICAgLy8gYWxsb3cgbmV3IGVuc3VyZSBjYWxscyBsYXRlciAoYnV0IFJPT1QubHRVSUh1YiBwZXJzaXN0cylcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlID0gbnVsbDsgfSwgMCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBST09ULl9fZW5zdXJlTFRIdWJQcm9taXNlO1xuICAgIH1cblxuICAgIC8vIEV4cG9zZSBlbnN1cmVMVEh1YiBwdWJsaWNseVxuICAgIHRyeSB7IFJPT1QuZW5zdXJlTFRIdWIgPSBfZW5zdXJlTFRIdWJJbnRlcm5hbDsgfSBjYXRjaCB7IH1cblxuICAgIC8vIE9wdGlvbmFsOiBsYXp5IGF1dG8tbW91bnQgKHNhZmVcdTIwMTR3b25cdTIwMTl0IGVycm9yIGlmIG5vdCB1c2VkKVxuICAgIHRyeSB7XG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gUk9PVC5lbnN1cmVMVEh1Yj8uKHsgbW91bnQ6IChST09ULl9fTFRfSFVCX01PVU5UIHx8ICduYXYnKSB9KS5jYXRjaCgoKSA9PiB7IH0pKTtcbiAgICB9IGNhdGNoIHsgfVxuXG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFDQSxHQUFDLE1BQU07QUFDSCxVQUFNLE9BQVEsT0FBTyxpQkFBaUIsY0FBYyxlQUFlO0FBTW5FLFFBQUksQ0FBQyxLQUFLLDJCQUEyQjtBQUNqQyxXQUFLLDRCQUE0QixTQUFTLDBCQUN0QyxLQUFLLE1BQ0wsT0FBTyxDQUFDLDJDQUEyQyx1QkFBdUIsR0FDNUU7QUFDRSxlQUFPLElB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LENBQUM7QUFDM0QsY0FBSSxpQkFBaUIsTUFBTSxFQUFFLFFBQVEsU0FBUyxpQkFBaUIsRUFBRSxXQUFXLE1BQU0sU0FBUyxLQUFLLENBQUM7QUFHakcsaUJBQU8sT0FBTyxLQUFLLE9BQU87QUFBQSxZQUN0QixVQUFVO0FBQUEsWUFDVixLQUFLO0FBQUEsWUFDTCxNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxPQUFPO0FBQUEsWUFDUCxRQUFRO0FBQUE7QUFBQSxZQUNSLGVBQWU7QUFBQSxVQUNuQixDQUFDO0FBQUEsUUFFTDtBQUVBLGFBQUssVUFBVTtBQUNmLGVBQU87QUFBQSxNQUNYLEdBQUcsRUFBRSxRQUFRLE1BQU07QUFFZixtQkFBVyxNQUFNO0FBQUUsZUFBSyx1QkFBdUI7QUFBQSxRQUFNLEdBQUcsQ0FBQztBQUFBLE1BQzdELENBQUM7QUFFRCxhQUFPLEtBQUs7QUFBQSxJQUNoQjtBQUdBLFFBQUk7QUFBRSxXQUFLLGNBQWM7QUFBQSxJQUFzQixRQUFRO0FBQUEsSUFBRTtBQUd6RCxRQUFJO0FBQ0EsY0FBUSxRQUFRLEVBQUUsS0FBSyxNQUFNLEtBQUssY0FBYyxFQUFFLE9BQVEsS0FBSyxrQkFBa0IsTUFBTyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFBRSxDQUFDLENBQUM7QUFBQSxJQUMvRyxRQUFRO0FBQUEsSUFBRTtBQUFBLEVBRWQsR0FBRzsiLAogICJuYW1lcyI6IFsiY3JlYXRlSHViIiwgImdldFB4IiwgImNhcHR1cmVCYXNlIiwgImFwcGx5RXh0cmEiLCAiYWRqdXN0UGFnZUhlaWdodHMiXQp9Cg==
