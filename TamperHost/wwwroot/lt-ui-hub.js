const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

// === LT Hub: hoisted helpers (single source of truth) ===
(() => {
    const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

    // ---- Wait for container/anchor (shared across @require scopes)
    if (!ROOT.waitForContainerAndAnchor) {
        ROOT.waitForContainerAndAnchor = function waitForContainerAndAnchor(
            ms = 15000,
            sels = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper']
        ) {
            return new Promise((resolve, reject) => {
                const tryFind = () => {
                    // Prefer page content; fall back to content container; last resort body
                    const content = document.querySelector('.plex-sidetabs-menu-page-content');
                    const container =
                        content ||
                        document.querySelector('.plex-sidetabs-menu-page-content-container') ||
                        document.body;

                    // Legacy: surface a "beforeNode" if one of the selectors exists (optional)
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

    // ---- Create Hub host + API (shared across @require scopes)
    if (!ROOT.createHub) {
        ROOT.createHub = function createHub() {
            // Host
            const host = document.createElement('div');
            host.setAttribute('data-lt-hub', '1');
            // NOTE: position is controlled by the mount variant:
            // - 'body' mount will set fixed positioning when inserted
            // - 'nav' mount will set position:static via attribute [data-variant="nav"]

            // Shadow DOM
            const root = host.attachShadow({ mode: 'open' });

            // Styles (valid CSS only; no rgba(...,08) typos)
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

        /* Sections */
        .left, .center, .right { display: inline-flex; gap: 8px; align-items: center; }
        .left   { justify-content: flex-start; }
        .center { justify-content: center; flex-wrap: wrap; }
        .right  { justify-content: flex-end; }

        /* Navbar variant renders inline and avoids page layout changes */
        :host([data-variant="nav"]) .hub {
          border: 0; box-shadow: none; padding: 0;
          display: inline-flex; grid-template-columns: none; gap: 8px;
        }
        :host([data-variant="nav"]) .left,
        :host([data-variant="nav"]) .center,
        :host([data-variant="nav"]) .right { display: inline-flex; }
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
        .status { padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.15); background: #f8fafc; font-size: 12px; }
        .status.success { background:#ecfdf5; border-color:#d1fae5; }
        .status.info    { background:#eff6ff; border-color:#dbeafe; }
        .status.warn    { background:#fffbeb; border-color:#fef3c7; }
        .status.danger  { background:#fef2f2; border-color:#fee2e2; }

        .status-wrap { display: inline-flex; align-items: center; gap: 8px; }
        .spinner { width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(0,0,0,.15); border-top-color: #0ea5e9; animation: spin 800ms linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `;
            root.appendChild(style);

            // Sections
            const wrap = document.createElement('div'); wrap.className = 'hub';
            const left = document.createElement('div'); left.className = 'left';
            const center = document.createElement('div'); center.className = 'center';
            const right = document.createElement('div'); right.className = 'right';

            // Branding pill (shows in body mount; hidden in nav by :host([data-variant="nav"]) .brand { display:none; })
            const brand = document.createElement('span');
            brand.className = 'brand';
            brand.innerHTML = '<span class="dot"></span><span class="brand-text">OneMonroe</span>';
            left.appendChild(brand);

            wrap.append(left, center, right);
            root.appendChild(wrap);


            // Helpers
            const mkStatus = (text, tone) => {
                const w = document.createElement('span'); w.className = 'status-wrap';
                const s = document.createElement('span'); s.className = `status ${tone}`;
                s.textContent = text || '';
                w.appendChild(s);
                return w;
            };

            // Public API expected by lt.core.hub facade
            const api = {
                _shadow: root,
                registerButton(side = 'left', def) {
                    // def can be { id, el } or { id, label, onClick, disabled }
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
                    target.appendChild(el);
                    return api;
                },
                remove(id) {
                    if (!id) return api;
                    const n = root.querySelector(`[data-id="${CSS.escape(id)}"]`);
                    if (n && n.parentNode) n.parentNode.removeChild(n);
                    return api;
                },
                clear() {
                    left.replaceChildren(); center.replaceChildren(); right.replaceChildren();
                    return api;
                },
                list() {
                    const all = [...left.children, ...center.children, ...right.children];
                    return all.map(n => n.dataset?.id).filter(Boolean);
                },
                setStatus(text, tone = 'info', opts = {}) {
                    const node = mkStatus(text, tone);
                    center.replaceChildren(node);
                    return api;
                },
                beginTask(label, tone = 'info') {
                    const wrapNode = document.createElement('span'); wrapNode.className = 'status-wrap';
                    const spin = document.createElement('span'); spin.className = 'spinner';
                    const lab = document.createElement('span'); lab.className = `status ${tone}`; lab.textContent = label || 'Working…';
                    wrapNode.append(spin, lab);
                    center.replaceChildren(wrapNode);
                    return {
                        update(text) { if (typeof text === 'string') lab.textContent = text; return this; },
                        success(text = 'Done') { lab.className = 'status success'; lab.textContent = text; spin.remove(); return this; },
                        error(text = 'Error') { lab.className = 'status danger'; lab.textContent = text; spin.remove(); return this; },
                        clear() { center.replaceChildren(); return this; }
                    };
                },
                notify(level = 'info', text = '', { ms = 2500, sticky = false } = {}) {
                    api.setStatus(text, level);
                    if (!sticky) setTimeout(() => { center.replaceChildren(); }, ms);
                    return api;
                }
            };

            return { host, left, center, right, api };
        };
    }
})();

// === Modal elevation support (reparent hub above Plex modals) ===

//let _hubOriginalParent = null;
//let _hubPlaceholder = null;
//let _hubElevated = false;


const LT_TOP_BAR_SELECTORS = [
    // Nav + common bars
    '#navBar', '.plex-navbar-container.navbar',
    '.navbar-fixed-top', '.plex-app-banner',
    '.test-environment-banner', '.env-banner', '.plex-top-banner',
    // Persistent env banner (and its wrapper)
    '.plex-env-persistent-banner-container',
    '.fixed-element-wrapper .plex-env-persistent-banner',
    '.fixed-element-wrapper'
];

// Nav/info bar z-index
function getNavInfo() {
    let maxZ = 0, any = null;
    LT_TOP_BAR_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (!ltIsVisibleTop(el)) return;
            const z = parseInt(getComputedStyle(el).zIndex || '0', 10);
            if (z >= maxZ) { maxZ = z; any = el; }
        });
    });
    return { el: any, z: maxZ };
}



// Utility: is element visible & in flow (or fixed at top)
function ltIsVisibleTop(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    // Anything at or near the top that contributes to vertical offset
    return (rect.height > 0) && (rect.bottom > 0) && (rect.top <= (rect.height + 2));
}


/* lt-ui-hub : full-width sticky action bar inside the page content
   - Mounts as the FIRST child of `.plex-sidetabs-menu-page-content`
     (fallback: top of `.plex-sidetabs-menu-page-content-container`)
   - Shadow DOM isolation; KO re-render resilient
   - API: registerButton, remove, clear, setStatus, setBusy, setTitle
*/
const OM_DEFAULT_THEME = {
    name: 'OneMonroe',
    primary: '#8B0902',
    primaryHi: '#890F10',
    primaryLo: '#5C0A0A',
    onPrimary: '#ffffff',
    surface: '#ffffff',
    surfaceAlt: '#f7f7f7',
    border: 'rgba(0,0,0,0.12)',
    chipBg: '#f7f9fb',
    // Back-compat keys some bundles expect:
    brand: { primary: '#8B0902', hi: '#890F10', lo: '#5C0A0A', on: '#ffffff' }
};

// --- helper hoisted to module scope so external callers can use it ---
function waitForContainerAndAnchor(ms = 15000, sels = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper']) {
    return new Promise((resolve, reject) => {
        const tryFind = () => {
            // Prefer actual content node; fall back to container; last resort body
            const content = document.querySelector('.plex-sidetabs-menu-page-content');
            const container =
                content ||
                document.querySelector('.plex-sidetabs-menu-page-content-container') ||
                document.body;

            // Back-compat: keep a beforeNode if a selector exists (new logic doesn’t need it)
            const beforeNode = sels.map(s => document.querySelector(s)).find(Boolean) || null;

            if (container) return resolve({ container, beforeNode });
        };

        // fast path, then observe
        tryFind();
        const obs = new MutationObserver(() => tryFind());
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { try { obs.disconnect(); } catch { } reject(new Error('lt-ui-hub: Container/anchor not found')); }, ms);
    });
}

async function ensureLTHub(opts = {}) {

    const {
        timeoutMs = 15000,
        selectors = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper'],
        theme: rawTheme = null,
        mount = 'body',
        disableModalElevate = true
    } = opts;

    const theme = rawTheme ? normalizeTheme(rawTheme) : null;

    // Reuse existing API or in-flight promise
    if (ROOT.ltUIHub) return ROOT.ltUIHub;
    if (ROOT.__ensureLTHubPromise) return ROOT.__ensureLTHubPromise;

    // If a host is already in the DOM, reuse it (don’t create a second)
    const existingHost = document.querySelector('[data-lt-hub="1"]');
    if (existingHost) {
        const reuse = Promise.resolve(ROOT.ltUIHub || { _el: existingHost });
        ROOT.__ensureLTHubPromise = reuse;
        return reuse;
    }

    // Create a single in-flight promise so concurrent callers share it
    ROOT.__ensureLTHubPromise = (async () => {
        ROOT.__ltHubMounting = true;
        try {
            const wf = (ROOT.waitForContainerAndAnchor || waitForContainerAndAnchor);
            const { container, beforeNode } = await wf(timeoutMs, selectors);

            const { host, left, center, right, api } = (ROOT.createHub || createHub)();

            // Mount strategy (nav vs body) exactly as before
            const contentNode =
                container.querySelector(':scope > .plex-sidetabs-menu-page-content') ||
                document.querySelector('.plex-sidetabs-menu-page-content');

            if (mount === 'nav') {
                const navRight =
                    document.querySelector('#navBar .navbar-right') ||
                    document.querySelector('.plex-navbar-container .navbar-right');
                if (!navRight) {
                    // Defer mounting until the navbar exists to avoid breaking Plex layout.
                    const obs = new MutationObserver(() => {
                        const nr =
                            document.querySelector('#navBar .navbar-right') ||
                            document.querySelector('.plex-navbar-container .navbar-right');
                        if (!nr) return;

                        obs.disconnect();

                        const li = document.createElement('li');
                        li.className = 'lt-hub-nav';
                        li.style.display = 'inline-flex';
                        li.style.alignItems = 'center';
                        li.style.gap = '8px';
                        nr.prepend(li);
                        li.appendChild(host);

                        host.setAttribute('data-variant', 'nav');
                        Object.assign(host.style, {
                            position: 'static',
                            top: '', left: '', right: '',
                            width: 'auto', zIndex: 'auto', pointerEvents: 'auto'
                        });
                    });
                    obs.observe(document.documentElement, { childList: true, subtree: true });
                } else {
                    const li = document.createElement('li');
                    li.className = 'lt-hub-nav';
                    li.style.display = 'inline-flex';
                    li.style.alignItems = 'center';
                    li.style.gap = '8px';
                    navRight.prepend(li);
                    li.appendChild(host);

                    host.setAttribute('data-variant', 'nav');
                    Object.assign(host.style, {
                        position: 'static',
                        top: '', left: '', right: '',
                        width: 'auto', zIndex: 'auto', pointerEvents: 'auto'
                    });
                }

            } else {
                if (contentNode) {
                    const first = contentNode.firstElementChild;
                    first ? contentNode.insertBefore(host, first) : contentNode.appendChild(host);
                } else {
                    container.prepend(host);
                }
            }

            // Theme + KO re-render guard (unchanged)
            const themeToUse = theme || window.LT_DEFAULT_THEME || OM_DEFAULT_THEME;
            injectTheme(api._shadow, themeToUse);
            const mo = new MutationObserver(() => {
                if (!host.isConnected) {
                    mo.disconnect();
                    ensureLTHub(opts).catch(() => { });
                }
            });
            mo.observe(container, { childList: true });

            ROOT.ltUIHub = api;
            return api;
        } finally {
            ROOT.__ltHubMounting = false;
            // Keep the promise for anyone awaiting, then clear for the next call
            const done = ROOT.__ensureLTHubPromise;
            setTimeout(() => { if (ROOT.__ensureLTHubPromise === done) ROOT.__ensureLTHubPromise = null; });
        }
    })();

    return ROOT.__ensureLTHubPromise;
}


function injectTheme(root, t) {
    if (!root) return;
    const pick = (a, b, c) => (a ?? b ?? c);
    const resolved = {
        primary: pick(t?.primary, t?.brand?.primary, '#8B0902'),
        primaryHi: pick(t?.primaryHi, t?.brand?.hi, '#890F10'),
        primaryLo: pick(t?.primaryLo, t?.brand?.lo, '#5C0A0A'),
        onPrimary: pick(t?.onPrimary, t?.brand?.on, '#ffffff'),
        surface: pick(t?.surface, undefined, '#ffffff'),
        surfaceAlt: pick(t?.surfaceAlt, undefined, '#f7f7f7'),
        border: pick(t?.border, undefined, 'rgba(0,0,0,0.12)'),
        chipBg: pick(t?.chipBg, undefined, '#f7f9fb'),
    };
    const s = document.createElement('style');
    s.textContent = `
      :host{
        --om-primary:${resolved.primary};
        --om-primary-hi:${resolved.primaryHi};
        --om-primary-lo:${resolved.primaryLo};
        --om-on-primary:${resolved.onPrimary};
        --om-surface:${resolved.surface};
        --om-surface-alt:${resolved.surfaceAlt};
        --om-border:${resolved.border};
        --om-chip-bg:${resolved.chipBg};
      }
      .hub { background: var(--om-surface) !important; border-bottom: 1px solid var(--om-border) !important; }
      .brand { background: var(--om-chip-bg) !important; }
      .dot { background: var(--om-primary) !important; }
      button.hbtn:hover {
        border-color: var(--om-primary) !important;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--om-primary) 18%, transparent) !important;
      }
      .status.info   { border-color: color-mix(in srgb, var(--om-primary) 20%, #dbeafe) !important; }
      .status.warn   { border-color: color-mix(in srgb, var(--om-primary) 25%, #fef3c7) !important; }
      .status.danger { border-color: color-mix(in srgb, var(--om-primary) 25%, #fee2e2) !important; }
      .spinner { border-top-color: var(--om-primary) !important; }
    `;
    root.appendChild(s);
}

/** Back-compat: some bundles still call a legacy function name. */
function injectThemeCSS(theme) {
    try {
        const hub = window.ltUIHub;
        if (!hub?._shadow) return;
        injectTheme(hub._shadow, theme);
    } catch { /* no-op */ }
}

// lt-ui-hub.js — core idea (already in your uploaded file; keep it)
function normalizeTheme(t) {
    const defaults = {
        brandName: "LT",
        colors: {
            brand: "#0ea5e9", accent: "#38bdf8",
            surface: "#ffffff", surfaceAlt: "#f7f7f7", border: "rgba(0,0,0,.1)",
            text: "#0f172a", textMuted: "#475569",
            status: {
                infoBg: "#eff6ff", infoBorder: "#dbeafe",
                successBg: "#ecfdf5", successBorder: "#d1fae5",
                warnBg: "#fffbeb", warnBorder: "#fde68a",
                dangerBg: "#fef2f2", dangerBorder: "#fee2e2"
            }
        },
        radius: { sm: 8, pill: 999 },
        spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
        shadow: { sm: "0 1px 3px rgba(0,0,0,0.08)", md: "0 1px 4px rgba(0,0,0,0.06)" },
        font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    };
    if (!t) return defaults;
    const c = t.colors || {};
    return {
        brandName: t.brandName || t.name || defaults.brandName,
        colors: {
            brand: c.brand ?? t.primary ?? defaults.colors.brand,
            accent: c.accent ?? t.accent ?? t.primaryHi ?? c.brand ?? defaults.colors.accent,
            surface: c.surface ?? t.surface ?? defaults.colors.surface,
            surfaceAlt: c.surfaceAlt ?? t.surfaceAlt ?? defaults.colors.surfaceAlt,
            border: c.border ?? t.border ?? defaults.colors.border,
            text: c.text ?? t.text ?? defaults.colors.text,
            textMuted: c.textMuted ?? t.textMuted ?? defaults.colors.textMuted,
            status: {
                infoBg: c.status?.infoBg ?? defaults.colors.status.infoBg,
                infoBorder: c.status?.infoBorder ?? defaults.colors.status.infoBorder,
                successBg: c.status?.successBg ?? defaults.colors.status.successBg,
                successBorder: c.status?.successBorder ?? defaults.colors.status.successBorder,
                warnBg: c.status?.warnBg ?? defaults.colors.status.warnBg,
                warnBorder: c.status?.warnBorder ?? defaults.colors.status.warnBorder,
                dangerBg: c.status?.dangerBg ?? defaults.colors.status.dangerBg,
                dangerBorder: c.status?.dangerBorder ?? defaults.colors.status.dangerBorder,
            }
        },
        radius: t.radius ?? defaults.radius,
        spacing: t.spacing ?? defaults.spacing,
        shadow: t.shadow ?? defaults.shadow,
        font: t.font ?? defaults.font,
    };
}

// Convenience: expose a global for console testing in DEV
if (!ROOT.ensureLTHub) ROOT.ensureLTHub = (...a) => ensureLTHub(...a);

/** Back-compat shim for older bundles that call `injectThemeCSS(theme)` */
if (!ROOT.injectThemeCSS) ROOT.injectThemeCSS = (theme) => {
    try {
        const t = theme || window.LT_DEFAULT_THEME || OM_DEFAULT_THEME;
        const root = ROOT.ltUIHub?._shadow || null;
        if (root) injectTheme(root, t);
    } catch (_) { /* non-fatal */ }
};

// Expose ensureLTHub to page/window so other scripts can request a mount.
if (typeof window !== 'undefined' && !ROOT.ensureLTHub) {
    ROOT.ensureLTHub = ensureLTHub;
}

/* === Facade passthrough for lt.core.hub.* (registerButton, remove, clear, list, setStatus, beginTask, notify)
      Also auto-mount hub on first facade call. === */
try {
    ROOT.lt = ROOT.lt || { core: {} };
    const facade = (ROOT.lt.core.hub = ROOT.lt.core.hub || {});
    facade._q = facade._q || [];

    const delegate = (fn, args) => {
        const hub = ROOT.ltUIHub;
        if (hub && typeof hub[fn] === 'function') {
            try { return hub[fn](...args); } catch { /* non-fatal */ }
        } else {
            // ensure hub tries to mount, then queue the call
            try { ROOT.ensureLTHub?.(); } catch { /* non-fatal */ }
            facade._q.push([fn, args]);
        }
        return facade;
    };

    if (typeof facade.registerButton !== 'function') {
        facade.registerButton = function registerButton(def) { return delegate('registerButton', [def]); };
    }
    if (typeof facade.remove !== 'function') {
        facade.remove = function remove(id) { return delegate('remove', [id]); };
    }
    if (typeof facade.clear !== 'function') {
        facade.clear = function clear() { return delegate('clear', []); };
    }
    if (typeof facade.list !== 'function') {
        facade.list = function list() { const hub = ROOT.ltUIHub; return hub?.list?.() ?? []; };
    }
    if (typeof facade.setStatus !== 'function') {
        facade.setStatus = function setStatus(text, tone = 'info', opts = {}) { return delegate('setStatus', [text, tone, opts]); };
    }
    if (typeof facade.beginTask !== 'function') {
        facade.beginTask = function beginTask(label, tone = 'info') {
            const hub = ROOT.ltUIHub; return hub?.beginTask?.(label, tone) ?? { update() { }, success() { }, error() { }, clear() { } };
        };
    }
    if (typeof facade.notify !== 'function') {
        facade.notify = function notify(level, text, opts = {}) { return delegate('notify', [level, text, opts]); };
    }

    // Drain any queued facade calls once the hub is mounted
    const drain = () => {
        const hub = ROOT.ltUIHub;
        if (!hub || !Array.isArray(facade._q) || !facade._q.length) return;
        const q = facade._q.splice(0);
        for (const [fn, args] of q) { try { hub[fn]?.(...args); } catch { } }
    };
    // Try now and on the next tick
    drain(); Promise.resolve().then(drain);
} catch { /* non-fatal */ }

// Export ensureLTHub + helpers onto ROOT for cross-@require scope.
try { ROOT.ensureLTHub = ensureLTHub; } catch { }
try { ROOT.waitForContainerAndAnchor = waitForContainerAndAnchor; } catch { }


// Try to mount the hub once on load; it will also auto-mount on first facade call.
try { Promise.resolve().then(() => ROOT.ensureLTHub?.().catch(() => { })); } catch { }


