
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
        .dot { width: 8px; height: 8px; border-radius: 999px; background: #0ea5e9; }

        button.hbtn {
          all: unset; font: inherit; padding: 6px 12px; border-radius: 8px;
          border: 1px solid rgba(0,0,0,.15); background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08);
          cursor: pointer;
        }
        button.hbtn:focus { outline: 2px solid rgba(0,102,204,.35); outline-offset: 2px; }
        button.hbtn[disabled] { opacity: .55; cursor: not-allowed; }

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
                        el.className = 'hbtn';
                        if (def?.id) el.dataset.id = def.id;
                        el.textContent = def?.label ?? 'Action';
                        if (typeof def?.onClick === 'function') el.addEventListener('click', def.onClick);
                        if (def?.disabled) el.disabled = true;
                    } else if (def?.id) {
                        el.dataset.id = def.id;
                    }

                    // Keep status pill at the far right: insert new right-side items BEFORE statusSlot
                    if (target === right) {
                        right.insertBefore(el, statusSlot);
                    } else {
                        target.appendChild(el);
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

        // If there's already a host in DOM, try to reuse it
        const preExistingHost = document.querySelector('[data-lt-hub="1"]');
        if (preExistingHost && ROOT.ltUIHub) return ROOT.ltUIHub;

        // Determine desired mount
        const desiredMount = (ROOT.__LT_HUB_MOUNT || mountOpt || 'body'); // default to 'nav'

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

                const li = document.createElement('li');
                li.className = 'lt-hub-nav';
                li.style.display = 'inline-flex';
                li.style.alignItems = 'center';
                li.style.gap = '8px';
                navRight.prepend(li);
                li.appendChild(host);

                // Nav variant: no page padding or fixed positioning
                host.setAttribute('data-variant', 'nav');
                Object.assign(host.style, {
                    position: 'static',
                    top: '', left: '', right: '',
                    width: 'auto', zIndex: 'auto', pointerEvents: 'auto'
                });
            } else {
                // Body variant: insert at top of content, add page padding
                const contentNode =
                    container.querySelector(':scope > .plex-sidetabs-menu-page-content') ||
                    document.querySelector('.plex-sidetabs-menu-page-content');

                if (contentNode) {
                    const first = contentNode.firstElementChild;
                    first ? contentNode.insertBefore(host, first) : contentNode.appendChild(host);
                } else {
                    container.prepend(host);
                }

                // Make sure body gets top padding based on hub height
                document.body.classList.add('lt-hub-padded');
                const setPad = () => {
                    const h = Math.max(0, host.getBoundingClientRect().height || 0);
                    document.documentElement.style.setProperty('--lt-hub-h', `${h}px`);
                };
                requestAnimationFrame(() => { setPad(); requestAnimationFrame(setPad); });
                try { document.fonts?.ready?.then(setPad); } catch { }
                window.addEventListener('resize', setPad, { passive: true });

                // Keep fixed positioning for body variant
                Object.assign(host.style, {
                    position: 'fixed',
                    top: '0', left: '0', right: '0',
                    width: 'auto',
                    zIndex: '2147483000',
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
        Promise.resolve().then(() => ROOT.ensureLTHub?.({ mount: (ROOT.__LT_HUB_MOUNT || 'body') }).catch(() => { }));
    } catch { }

})();
