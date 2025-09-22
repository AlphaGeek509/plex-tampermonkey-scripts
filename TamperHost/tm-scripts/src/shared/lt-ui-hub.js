
(() => {
    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

    // ---------------------------------------------------------------------------
    // Hoisted, shared helpers (single source of truth)
    // ---------------------------------------------------------------------------

    if (!ROOT.waitForContainerAndAnchor) {
        ROOT.waitForContainerAndAnchor = function waitForContainerAndAnchor(
            ms = 15000,
            sels = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper']
        ) {
            return new Promise((resolve, reject) => {
                const tryFind = () => {
                    // Prefer page content; fall back to wrapper; last resort body
                    const content = document.querySelector('.plex-sidetabs-menu-page-content');
                    const container =
                        content ||
                        document.querySelector('.plex-sidetabs-menu-page-content-container') ||
                        document.body;

                    // Back-compat: expose an anchor if one exists (not used by modern insert)
                    const beforeNode = sels.map(s => document.querySelector(s)).find(Boolean) || null;

                    if (container) return resolve({ container, beforeNode });
                };

                tryFind();
                const obs = new MutationObserver(tryFind);
                obs.observe(document.documentElement, { childList: true, subtree: true });

                setTimeout(() => {
                    try { obs.disconnect(); } catch { }
                    reject(new Error('lt-ui-hub: Container/anchor not found'));
                }, ms);
            });
        };
    }

    function findNavbarRight() {
        return (
            document.querySelector('#navBar .navbar-right') ||
            document.querySelector('.plex-navbar-container .navbar-right')
        );
    }

    // Normalize persistent banner height at runtime so PROD matches TEST.
    // TEST: .plex-env-persistent-banner-container ≈ 50px
    // PROD: .plex-persistent-banner-container exists but is often 0px
    function normalizePersistentBanner() {
        const envBanner = document.querySelector('.plex-env-persistent-banner-container'); // TEST
        const liveBanner = document.querySelector('.plex-persistent-banner-container');     // PROD

        const envH = envBanner ? envBanner.offsetHeight : 0;
        const liveH = liveBanner ? liveBanner.offsetHeight : 0;

        // Read current CSS var (framework sets 0 by default in both themes).
        const root = document.documentElement;
        const cssVarStr = getComputedStyle(root).getPropertyValue('--side-menu-persistent-banner-height');
        const cssVar = Number.parseFloat(cssVarStr) || 0;

        // If TEST already has a real banner, mirror that value into the CSS var and exit.
        if (envH > 0) {
            root.style.setProperty('--side-menu-persistent-banner-height', `${envH}px`);
            return;
        }

        // If PROD banner exists but contributes 0 and the var is 0, lift it to 50 (observed TEST baseline).
        if (liveBanner && liveH === 0 && cssVar === 0) {
            const FALLBACK = 50;
            liveBanner.style.height = `${FALLBACK}px`;
            root.style.setProperty('--side-menu-persistent-banner-height', `${FALLBACK}px`);
        }
    }


    if (!ROOT.createHub) {
        ROOT.createHub = function createHub() {
            // Host element (+shadow)
            const host = document.createElement('div');
            host.setAttribute('data-lt-hub', '1');
            const root = host.attachShadow({ mode: 'open' });

            // Styles (valid CSS only)
            const style = document.createElement('style');
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

            // Structure
            const wrap = document.createElement('div'); wrap.className = 'hub';
            const left = document.createElement('div'); left.className = 'left';
            const center = document.createElement('div'); center.className = 'center';
            const right = document.createElement('div'); right.className = 'right';

            // Branding pill
            const brand = document.createElement('span');
            brand.className = 'brand';
            brand.innerHTML = '<span class="dot"></span><span class="brand-text">OneMonroe</span>';
            left.appendChild(brand);

            // Dedicated status slot that must always be the last child in "right"
            const statusSlot = document.createElement('span');
            statusSlot.className = 'status-slot';
            right.appendChild(statusSlot);

            wrap.append(left, center, right);
            root.appendChild(wrap);

            // API expected by lt.core facade
            const DEFAULT_PILL_RESET_MS = 5000; // 5 seconds
            const mkStatus = (text, tone) => {
                const w = document.createElement('span'); w.className = 'status-wrap';
                const s = document.createElement('span'); s.className = `status ${tone}`;
                s.textContent = text || '';
                w.appendChild(s);
                return w;
            };

            const api = {
                _shadow: root,
                registerButton(side = 'left', def) {
                    const target = (side === 'right') ? right : (side === 'center' ? center : left);
                    let el = def?.el;
                    if (!el) {
                        el = document.createElement('button');
                        el.type = 'button';
                        el.className = 'hbtn'; // default = primary brand
                        // To render a ghost button, pass { className: 'hbtn hbtn--ghost' } via def.el or patch later.
                        if (def?.id) el.dataset.id = def.id;
                        el.textContent = def?.label ?? 'Action';
                        if (def?.title) el.title = String(def.title);
                        if (def?.ariaLabel) el.setAttribute('aria-label', String(def.ariaLabel));
                        if (typeof def?.onClick === 'function') el.addEventListener('click', def.onClick);
                        if (def?.disabled) el.disabled = true;
                    } else if (def?.id) {
                        el.dataset.id = def.id;
                        if (def?.title) el.title = String(def.title);
                        if (def?.ariaLabel) el.setAttribute('aria-label', String(def.ariaLabel));
                    }

                    // Keep status pill at the far right: insert new right-side items BEFORE statusSlot
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

                    if (typeof patch.label === 'string' && n.tagName === 'BUTTON') {
                        n.textContent = patch.label;
                    }
                    if (typeof patch.title === 'string') n.title = patch.title;
                    if (typeof patch.ariaLabel === 'string') n.setAttribute('aria-label', patch.ariaLabel);
                    if ('disabled' in patch && n.tagName === 'BUTTON') {
                        n.disabled = !!patch.disabled;
                    }
                    if (typeof patch.onClick === 'function' && n.tagName === 'BUTTON') {
                        const clone = n.cloneNode(true);
                        clone.addEventListener('click', patch.onClick);
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
                    // Preserve statusSlot at the far right; remove other right children
                    [...right.children].forEach(n => { if (n !== statusSlot) n.remove(); });
                    statusSlot.replaceChildren(); // clear the pill content
                    return api;
                },
                list() {
                    const all = [...left.children, ...center.children, ...right.children];
                    return all.map(n => n.dataset?.id).filter(Boolean);
                },
                setStatus(text, tone = 'info', opts = {}) {
                    statusSlot.replaceChildren(mkStatus(text, tone));
                    const sticky = !!opts?.sticky;
                    const ms = (opts?.ms ?? opts?.timeout ?? DEFAULT_PILL_RESET_MS);
                    if (!sticky && text) {
                        setTimeout(() => {
                            try { if (statusSlot.isConnected) statusSlot.replaceChildren(); } catch { }
                        }, ms);
                    }
                    return api;
                },
                beginTask(label, tone = 'info') {
                    const wrapNode = document.createElement('span'); wrapNode.className = 'status-wrap';
                    const spin = document.createElement('span'); spin.className = 'spinner';
                    const lab = document.createElement('span'); lab.className = `status ${tone}`; lab.textContent = label || 'Working…';
                    wrapNode.append(spin, lab);
                    statusSlot.replaceChildren(wrapNode);
                    return {
                        update(text) { if (typeof text === 'string') lab.textContent = text; return this; },
                        success(text = 'Done') { lab.className = 'status success'; lab.textContent = text; spin.remove(); return this; },
                        error(text = 'Error') { lab.className = 'status danger'; lab.textContent = text; spin.remove(); return this; },
                        clear() { statusSlot.replaceChildren(); return this; }
                    };
                },
                notify(kind, text, { ms = DEFAULT_PILL_RESET_MS, sticky = false } = {}) {
                    // Reuse setStatus behavior so sticky/ms work the same
                    api.setStatus(text, kind, { ms, sticky });
                    return api;
                },
            };

            return { host, left, center, right, api };
        };
    }

    // ---------------------------------------------------------------------------
    // ensureLTHub: singleton mount (nav/body)
    // ---------------------------------------------------------------------------

    async function _ensureLTHubInternal(opts = {}) {
        const {
            timeoutMs = 15000,
            selectors = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper'],
            theme = null,               // reserved for future theme injection
            mount: mountOpt = null,     // 'nav' | 'body' | null
            disableModalElevate = true  // reserved for legacy behavior we removed
        } = opts;

        // If an API already exists, reuse it.
        if (ROOT.ltUIHub) return ROOT.ltUIHub;

        // Reuse an in-flight promise if present
        if (ROOT.__ensureLTHubPromise) return ROOT.__ensureLTHubPromise;

        // If there's already a host in DOM, try to reuse it – but align its variant to requested mount.
        const preExistingHost = document.querySelector('[data-lt-hub="1"]');
        if (preExistingHost && ROOT.ltUIHub) {
            const wantNav = (mountOpt || ROOT.__LT_HUB_MOUNT || 'nav') === 'nav';
            const cur = preExistingHost.getAttribute('data-variant') || '';

            if (wantNav && cur !== 'nav') {
                // Remount the existing host into the navbar as a full-width row
                let navRight =
                    document.querySelector('#navBar .navbar-right') ||
                    document.querySelector('.plex-navbar-container .navbar-right');

                if (navRight) {
                    const navBar =
                        navRight.closest('#navBar, .plex-navbar-container') ||
                        document.getElementById('navBar') ||
                        document.querySelector('.plex-navbar-container');

                    if (navBar) {
                        let row = navBar.querySelector('.lt-hub-row');
                        if (!row) {
                            row = document.createElement('div');
                            row.className = 'lt-hub-row';
                            row.style.display = 'block';
                            row.style.boxSizing = 'border-box';
                            row.style.width = '100%';
                            navBar.appendChild(row);
                        }

                        if (preExistingHost.parentNode !== row) row.appendChild(preExistingHost);
                        preExistingHost.setAttribute('data-variant', 'nav');
                        Object.assign(preExistingHost.style, {
                            position: 'static',
                            top: '', left: '', right: '',
                            width: '100%',
                            maxWidth: '100%',
                            zIndex: 'auto',
                            pointerEvents: 'auto'
                        });
                    }
                }
            }

            return ROOT.ltUIHub;
        }

        // Determine desired mount
        const desiredMount = (mountOpt || ROOT.__LT_HUB_MOUNT || 'nav');

        ROOT.__ensureLTHubPromise = (async () => {
            const { container } = await ROOT.waitForContainerAndAnchor(timeoutMs, selectors);
            const { host, api } = (ROOT.createHub || createHub)();

            if (desiredMount === 'nav') {
                // Wait for navbar; never fall back to body
                let navRight = findNavbarRight();
                if (!navRight) {
                    await new Promise(resolve => {
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

                // Resolve the actual <nav> container
                const navBar =
                    (navRight && navRight.closest('nav')) ||
                    document.getElementById('navBar') ||
                    document.querySelector('.plex-navbar-container.navbar');

                if (!navBar) throw new Error('lt-ui-hub: navBar not found');

                // Create (or reuse) a dedicated full-width row inside <nav>,
                // inserted before the normal Plex navbar content wrapper.
                const beforeNode = navBar.querySelector(':scope > .plex-navbar-title-container navbar-left') || null;

                let row = navBar.querySelector(':scope > .lt-hub-row');
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'lt-hub-row';

                    // Minimal inline style; hub handles its own inner layout.
                    row.style.display = 'block';
                    row.style.boxSizing = 'border-box';
                    row.style.width = '100%';

                    // Optional thin divider to mimic native rows:
                    // row.style.borderBottom = '1px solid rgba(0,0,0,.08)';

                    if (beforeNode) navBar.insertBefore(row, beforeNode);
                    else navBar.appendChild(row);
                }

                // --- Full-bleed: cancel nav's L/R padding and borders for our row only ---
                const applyEdgeToEdge = () => {
                    const cs = getComputedStyle(navBar);
                    const pl = parseFloat(cs.paddingLeft) || 0;
                    const pr = parseFloat(cs.paddingRight) || 0;
                    const bl = parseFloat(cs.borderLeftWidth) || 0;
                    const br = parseFloat(cs.borderRightWidth) || 0;

                    // Extend across padding + borders
                    row.style.marginLeft = (pl + bl) ? `-${pl + bl}px` : '0';
                    row.style.marginRight = (pr + br) ? `-${pr + br}px` : '0';
                    row.style.width = (pl + pr + bl + br) ? `calc(100% + ${pl + pr + bl + br}px)` : '100%';
                };

                // Avoid duplicate listeners on route changes
                if (!row.dataset.edgeApplied) {
                    applyEdgeToEdge();
                    window.addEventListener('resize', applyEdgeToEdge, { passive: true });
                    new MutationObserver(applyEdgeToEdge)
                        .observe(navBar, { attributes: true, attributeFilter: ['style', 'class'] });
                    row.dataset.edgeApplied = '1';
                }


                // Move the hub host into our row (full-width)
                if (host.parentNode !== row) row.appendChild(host);

                // Use hub’s default (full-width) look — not compact "nav" inline
                host.setAttribute('data-variant', 'row');
                Object.assign(host.style, {
                    position: 'static',
                    top: '', left: '', right: '',
                    width: '100%',
                    maxWidth: '100%',
                    zIndex: 'auto',
                    pointerEvents: 'auto'
                });

                // Align PROD with TEST’s banner baseline if needed.
                normalizePersistentBanner();

                // Ensure the shadow root's top-level .hub respects full width
                try {
                    const hubRoot = host.shadowRoot?.querySelector('.hub');
                    if (hubRoot) hubRoot.style.width = '100%';
                } catch { }


                // Let the navbar grow naturally. Some skins force a fixed height (≈45px).
                // Override to "auto" and keep a sensible minimum = 45px + hub-row height.
                const BASE_H = 45; // native Plex top bar
                navBar.style.height = 'auto';

                // Track hub height and adjust min-height so the second row is fully visible.
                const updateMinHeight = () => {
                    const h = Math.max(0, host.getBoundingClientRect().height || 0);
                    //navBar.style.minHeight = `${BASE_H + h}px`;
                };

                // Initial + reactive sizing
                requestAnimationFrame(() => { updateMinHeight(); requestAnimationFrame(updateMinHeight); normalizePersistentBanner(); });
                try { document.fonts?.ready?.then(updateMinHeight); } catch { }
                window.addEventListener('resize', updateMinHeight, { passive: true });

                // React to hub content changes
                try {
                    const ro = new ResizeObserver(updateMinHeight);
                    ro.observe(host);
                } catch { }

                // --- Production-only shortfall fix (no persistent banner) ---
                // Apply only when there is NO persistent banner (TEST has one; PROD typically does not).
                const hasPersistentBanner = !!document.querySelector('.plex-env-persistent-banner-container');
                if (false) {
                    const BASE_NAV_H = 45; // baseline Plex navbar height

                    const PAGE_SEL = [
                        '.plex-sidetabs-menu-page',
                        '.plex-sidetabs-menu-page-content-container',
                        '.plex-sidetabs-menu-page-content'
                    ];

                    function getPx(v) {
                        if (!v) return null;
                        const n = parseFloat(v);
                        return Number.isFinite(n) ? n : null;
                    }

                    function captureBase(el) {
                        // Store the original inline values once so we can re-derive later
                        const ds = el.dataset;
                        if (!ds.ltBaseH && el.style.height) ds.ltBaseH = el.style.height;
                        if (!ds.ltBaseMax && el.style.maxHeight) ds.ltBaseMax = el.style.maxHeight;
                        if (!ds.ltBaseMin && el.style.minHeight) ds.ltBaseMin = el.style.minHeight;
                    }

                    function applyExtra(el, extra) {
                        captureBase(el);
                        const ds = el.dataset;

                        // From base inline values (or current computed), add 'extra'
                        const baseH = getPx(ds.ltBaseH) ?? getPx(el.style.height);
                        const baseMax = getPx(ds.ltBaseMax) ?? getPx(el.style.maxHeight);
                        const baseMin = getPx(ds.ltBaseMin) ?? getPx(el.style.minHeight);

                        if (baseH != null) el.style.height = `${Math.max(0, baseH + extra)}px`;
                        if (baseMax != null) el.style.maxHeight = `${Math.max(0, baseMax + extra)}px`;
                        if (baseMin != null) el.style.minHeight = `${Math.max(0, baseMin + extra)}px`;
                    }

                    function adjustPageHeights() {
                        // Compute how much taller than the baseline Plex nav we are
                        const navH = Math.max(0, navBar.getBoundingClientRect().height || 0);
                        const extra = Math.max(0, navH - BASE_NAV_H);
                        if (!extra) return; // Nothing to do when no extra row

                        PAGE_SEL.forEach(sel => {
                            document.querySelectorAll(sel).forEach(el => applyExtra(el, extra));
                        });
                    }

                    // Initial + reactive applications
                    requestAnimationFrame(() => { adjustPageHeights(); requestAnimationFrame(adjustPageHeights); normalizePersistentBanner(); });
                    window.addEventListener('resize', adjustPageHeights, { passive: true });

                    // Observe nav height changes (e.g., if hub content grows/shrinks)
                    try {
                        const r2 = new ResizeObserver(adjustPageHeights);
                        r2.observe(navBar);
                    } catch { }

                    // If Plex rewrites inline heights later, re-apply our adjustment
                    const mo = new MutationObserver(muts => {
                        let hit = false;
                        for (const m of muts) {
                            if (m.type === 'attributes' && m.attributeName === 'style') { hit = true; break; }
                            if (m.type === 'childList') { hit = true; break; }
                        }
                        if (hit) adjustPageHeights();
                    });
                    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
                }

            } else {
                // Body variant (non-overlay): insert a spacer ahead of the hub equal to
                // Plex's fixed chrome (banner + navbar). Then make the hub sticky at top:0.
                const contentNode =
                    container.querySelector(':scope > .plex-sidetabs-menu-page-content') ||
                    document.querySelector('.plex-sidetabs-menu-page-content') ||
                    container;

                // Ensure a spacer exists as the first child
                let spacer = contentNode.querySelector(':scope > .lt-hub-spacer');
                if (!spacer) {
                    spacer = document.createElement('div');
                    spacer.className = 'lt-hub-spacer';
                    spacer.style.width = '100%';
                    spacer.style.height = '0px';     // sized dynamically
                    spacer.style.margin = '0';
                    spacer.style.padding = '0';
                    spacer.style.flex = '0 0 auto';
                    contentNode.prepend(spacer);
                }

                // Place the hub immediately after the spacer
                if (spacer.nextSibling !== host) {
                    if (host.parentNode) host.parentNode.removeChild(host);
                    spacer.after(host);
                }

                // Track hub height (for consumers/metrics only)
                const setHubH = () => {
                    const h = Math.max(0, host.getBoundingClientRect().height || 0);
                    document.documentElement.style.setProperty('--lt-hub-h', `${h}px`);
                };

                // Compute Plex chrome height: persistent banner + main nav
                const computeChromeTop = () => {
                    const doc = document.documentElement;
                    const css = getComputedStyle(doc);
                    const bannerH = parseInt(css.getPropertyValue('--side-menu-persistent-banner-height')) || 0;
                    const nav = document.querySelector('#navBar');
                    const navH = nav ? Math.max(0, nav.getBoundingClientRect().height || 0) : 0;
                    const chromeTop = bannerH + navH;
                    doc.style.setProperty('--lt-fixed-top', `${chromeTop}px`);
                    //spacer.style.height = `${chromeTop}px`;
                };

                // Recalc on layout/DOM changes
                const recalc = () => { setHubH(); computeChromeTop(); };
                requestAnimationFrame(() => { recalc(); requestAnimationFrame(recalc); normalizePersistentBanner(); });
                try { document.fonts?.ready?.then(recalc); } catch { }
                window.addEventListener('resize', recalc, { passive: true });
                new MutationObserver(recalc).observe(document.documentElement, { childList: true, subtree: true });

                // Make the hub sticky at the local top (no double-offset)
                Object.assign(host.style, {
                    position: 'sticky',
                    top: '0',
                    left: '0',
                    right: '0',
                    width: '100%',
                    zIndex: '10',          // above content, below modals
                    pointerEvents: 'auto'
                });

            }

            ROOT.ltUIHub = api;
            return api;
        })().finally(() => {
            // allow new ensure calls later (but ROOT.ltUIHub persists)
            setTimeout(() => { ROOT.__ensureLTHubPromise = null; }, 0);
        });

        return ROOT.__ensureLTHubPromise;
    }

    // Expose ensureLTHub publicly
    try { ROOT.ensureLTHub = _ensureLTHubInternal; } catch { }

    // Optional: lazy auto-mount (safe—won’t error if not used)
    try {
        Promise.resolve().then(() => ROOT.ensureLTHub?.({ mount: (ROOT.__LT_HUB_MOUNT || 'nav') }).catch(() => { }));
    } catch { }

})();
