const ROOT = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

// === Modal elevation support (reparent hub above Plex modals) ===
let _hubOriginalParent = null;
let _hubPlaceholder = null;
let _hubElevated = false;

function elevateForModal(host) {
    if (!host || _hubElevated) return;
    try {
        _hubOriginalParent = host.parentNode || _hubOriginalParent;
        if (!_hubPlaceholder) _hubPlaceholder = document.createComment('lt-hub-placeholder');
        if (_hubOriginalParent && host.previousSibling !== _hubPlaceholder) {
            _hubOriginalParent.insertBefore(_hubPlaceholder, host);
        }
        document.body.prepend(host);
        const nav = getNavInfo();
        Object.assign(host.style, {
            position: 'fixed',
            top: `${nav.height}px`,          // sit *under* the navbar
            left: '0',
            right: '0',
            width: '100%',
            zIndex: String(Math.max(1, nav.z - 1))  // keep hub below navbar/dropdowns
        });

        host.setAttribute('data-elevated', '1'); // optional, for styling
        _hubElevated = true;
    } catch { }
}

function restoreAfterModal(host) {
    if (!host || !_hubElevated) return;
    try {
        if (_hubOriginalParent && _hubPlaceholder) {
            _hubOriginalParent.insertBefore(host, _hubPlaceholder);
        }
        host.removeAttribute('data-elevated');
        const nav = getNavInfo();
        Object.assign(host.style, {
            position: 'sticky',
            top: '0',
            left: '',
            right: '',
            width: '',
            zIndex: String(Math.max(1, nav.z - 1))
        });

        _hubElevated = false;
    } catch { }
}

function getNavInfo() {
    const nav = document.getElementById('navBar') || document.querySelector('.plex-navbar-container.navbar');
    if (!nav) return { height: 0, z: 1000 };
    const cs = getComputedStyle(nav);
    const z = parseInt(cs.zIndex, 10);
    const h = nav.offsetHeight || parseInt(cs.height, 10) || 0;
    return { height: h, z: Number.isFinite(z) ? z : 1000 };
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
    border: 'rgba(0,0,0,.12)',
    chipBg: '#f7f9fb',
    // Back-compat keys some bundles expect:
    brand: { primary: '#8B0902', hi: '#890F10', lo: '#5C0A0A', on: '#ffffff' }
};

async function ensureLTHub(opts = {}) {
    const {
        timeoutMs = 15000,
        selectors = ['.plex-actions-wrapper.plex-grid-actions', '.plex-actions-wrapper'],
        theme: rawTheme = null,
    } = opts;

    const theme = rawTheme ? normalizeTheme(rawTheme) : null;

    if (ROOT.ltUIHub) return ROOT.ltUIHub;

    const { container, beforeNode } = await waitForContainerAndAnchor(timeoutMs, selectors);
    const { host, left, center, right, api } = createHub();

    // Insert as the FIRST child of `.plex-sidetabs-menu-page-content`
    // Fallback: prepend to the container if content node is missing.
    const contentNode =
        container.querySelector(':scope > .plex-sidetabs-menu-page-content') ||
        document.querySelector('.plex-sidetabs-menu-page-content');

    if (contentNode) {
        const first = contentNode.firstElementChild;
        first ? contentNode.insertBefore(host, first) : contentNode.appendChild(host);
    } else {
        container.prepend(host);
    }

    // Watch for Plex modal toggles (adds/removes 'modal-open' on <body>)
    try {
        const body = document.body;
        const chk = () => {
            const isModal = body.classList.contains('modal-open');
            const hubHost = ROOT.ltUIHub?._el || document.querySelector('[data-lt-hub="1"]');
            if (!hubHost) return;
            if (isModal) elevateForModal(hubHost); else restoreAfterModal(hubHost);
        };
        chk(); // run once now
        const modObs = new MutationObserver(muts => {
            if (muts.some(m => m.type === 'attributes')) chk();
        });
        modObs.observe(body, { attributes: true, attributeFilter: ['class'] });
    } catch { }

    // Keep offsets/z-index in sync when navbar height changes (e.g., on resize)
    window.addEventListener('resize', () => {
        const hostNow = ROOT.ltUIHub?._el || document.querySelector('[data-lt-hub="1"]');
        if (!hostNow) return;
        const nav = getNavInfo();

        if (document.body.classList.contains('modal-open')) {
            // Hub is elevated: adjust top & z-index under navbar
            hostNow.style.top = `${nav.height}px`;
            hostNow.style.zIndex = String(Math.max(1, nav.z - 1));
        } else {
            // Hub in sticky mode: ensure it sits below the navbar layer
            hostNow.style.top = '0';
            hostNow.style.zIndex = String(Math.max(1, nav.z - 1));
        }
    });



    // THEME: inject tokens into Shadow DOM (OneMonroe-ready)
    const themeToUse = theme || window.LT_DEFAULT_THEME || OM_DEFAULT_THEME;
    injectTheme(api._shadow, themeToUse);

    // KO re-render guard (if hub host is removed, re-mount)
    const mo = new MutationObserver(() => {
        if (!host.isConnected) {
            mo.disconnect();
            ensureLTHub(opts).catch(() => { });
        }
    });
    mo.observe(container, { childList: true });

    ROOT.ltUIHub = api; // expose singleton for this tab
    return api;

    // ---------- helpers ----------
    function waitForContainerAndAnchor(ms, sels) {
        return new Promise((resolve, reject) => {
            const tryFind = () => {
                // Prefer the actual content node; fall back to the content *container*, then body
                const content = document.querySelector('.plex-sidetabs-menu-page-content');
                const container = content
                    || document.querySelector('.plex-sidetabs-menu-page-content-container')
                    || document.body;

                // Keep `beforeNode` for back-compat (unused in the new insertion logic)
                const beforeNode = sels.map(s => document.querySelector(s)).find(Boolean) || null;

                if (container) return resolve({ container, beforeNode });
            };
            // fast path
            tryFind();
            // observe late renders
            const obs = new MutationObserver(() => tryFind());
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); reject(new Error('lt-ui-hub: Container/anchor not found')); }, ms);
        });
    }

    function createHub() {
        const host = document.createElement('div');
        host.setAttribute('data-lt-hub', '1');
        // Base (sticky) position — keep hub *below* the navbar’s z-index
        const navBase = getNavInfo();
        Object.assign(host.style, {
            position: 'sticky',
            top: '0',
            zIndex: String(Math.max(1, navBase.z - 1)),
        });


        const root = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
      :host { all: initial; }
      :host([data-elevated="1"]) .hub { box-shadow: 0 6px 18px rgba(0,0,0,.18); }
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
        font: 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .left, .center, .right { display: inline-flex; gap: 8px; align-items: center; }
      .left { justify-content: flex-start; }
      .center { justify-content: center; flex-wrap: wrap; }
      .right { justify-content: flex-end; }
      .brand {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(0,0,0,.12);
        background: #f7f9fb;
        font-weight: 600;
      }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: #0ea5e9; }
      button.hbtn {
        all: unset;
        font: inherit;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,.15);
        background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,.08);
        cursor: pointer;
      }
      button.hbtn:focus { outline: 2px solid rgba(0, 102, 204, .35); outline-offset: 2px; }
      button.hbtn[disabled] { opacity: .55; cursor: not-allowed; }
      .sep { width: 1px; height: 20px; background: rgba(0,0,0,.12); }
      .status {
        padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.15);
        background: #f8fafc; font-size: 12px;
      }
      .status.success { background:#ecfdf5; border-color:#d1fae5; }
      .status.info    { background:#eff6ff; border-color:#dbeafe; }
      .status.warn    { background:#fffbeb; border-color:#fef3c7; }
      .status.danger  { background:#fef2f2; border-color:#fee2e2; }
      .status-wrap { display: inline-flex; align-items: center; }
      .spinner {
        width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid rgba(0,0,0,.15); border-top-color: #0ea5e9;
        animation: spin 800ms linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;

        const wrap = document.createElement('div'); wrap.className = 'hub';
        const left = document.createElement('div'); left.className = 'left';
        const center = document.createElement('div'); center.className = 'center';
        const right = document.createElement('div'); right.className = 'right';

        // ⬇️ Attach the sections to the hub container, then attach to ShadowRoot
        wrap.append(left, center, right);
        root.append(style, wrap);

        // Persistent chrome (created once, re-attached on each render)
        const brand = document.createElement('div'); brand.className = 'brand';
        const brandDot = document.createElement('div'); brandDot.className = 'dot';
        const brandText = document.createElement('span'); brandText.textContent = 'LT Hub';
        brand.append(brandDot, brandText);

        // Status pill (created once, re-attached on each render)
        const statusWrap = document.createElement('div'); statusWrap.className = 'status-wrap';
        const statusPill = document.createElement('div'); statusPill.className = 'status info';
        statusPill.textContent = 'Ready';
        statusWrap.appendChild(statusPill);

        // Registry + API
        const registry = new Map();
        function render() {
            // Clear ALL sections before re-render (prevents duplicates)
            const clearChildren = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
            clearChildren(left);
            clearChildren(center);
            clearChildren(right);

            // Re-attach fixed chrome on the left every render
            left.appendChild(brand);
            right.appendChild(statusWrap);

            // Sorted render
            const items = Array.from(registry.values())
                .sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100) || String(a.label).localeCompare(String(b.label)));
            for (const it of items) {
                if (it.type === 'separator') {
                    const sep = document.createElement('div'); sep.className = 'sep';
                    addToSection(sep, it.section); continue;
                }
                const btn = document.createElement('button');
                btn.className = 'hbtn';
                btn.type = 'button';
                btn.title = it.title || it.label;
                btn.textContent = it.label;
                if (typeof it.onClick === 'function') btn.addEventListener('click', e => it.onClick(e));
                if (it.disabled) btn.setAttribute('disabled', '');
                addToSection(btn, it.section);
            }
        }

        function addToSection(el, section) {
            // Reserve the RIGHT section for system status only
            const safeSection = (section === 'right') ? 'center' : section;
            const target = safeSection === 'left' ? left : safeSection === 'right' ? right : center;
            target.appendChild(el);
        }


        const api = {
            /** Register or update a button (or separator).
             * def: { id, label?, title?, onClick?, disabled?, weight?, section?: 'left'|'center'|'right', type?: 'separator' }
             */
            registerButton(def) { if (!def?.id) throw new Error('ltUIHub.registerButton requires id'); registry.set(def.id, def); render(); return this; },
            remove(id) { registry.delete(id); render(); return this; },
            clear() { registry.clear(); render(); return this; },
            list() { return Array.from(registry.values()); },
            setTitle(text) { brandText.textContent = text || 'LT Hub'; return this; },
            setBusy(isBusy) {
                if (isBusy) {
                    if (!api._spin) { api._spin = document.createElement('div'); api._spin.className = 'spinner'; right.append(api._spin); }
                } else if (api._spin) { api._spin.remove(); api._spin = null; }
                return this;
            },
            flash(text, tone = 'info', ms = 3000) {
                api.setStatus(text, tone);
                if (api._flashTimer) clearTimeout(api._flashTimer);
                api._flashTimer = setTimeout(() => api.setStatus('Ready', 'info'), ms);
                return this;
            },
            _el: host, _shadow: root
        };

        // now that api exists, wire helpers created earlier
        api._brandText = brandText;
        api._statusPill = statusPill;

        api.setStatus = function setStatus(text, tone = 'info', opts = {}) {
            try {
                const pill = api._statusPill || statusPill;
                if (!pill) return api;
                // reset tone classes to match Shadow CSS (.status.info|success|warn|danger)
                pill.classList.remove('info', 'success', 'warn', 'danger');
                pill.classList.add(String(tone || 'info'));
                pill.textContent = text || 'Ready';

                if (opts.sticky) {
                    // keep as-is
                } else if (opts.timeout > 0) {
                    setTimeout(() => {
                        pill.classList.remove('success', 'warn', 'danger');
                        pill.classList.add('info');
                        pill.textContent = 'Ready';
                    }, opts.timeout);
                }
            } catch (_) { }
            return api;
        };


        // Auto-clearing status pill (keep if you already added it)
        api.flash = function flash(text, tone = 'info', ms = 2500) {
            api.setStatus(text, tone);
            if (api._flashTimer) clearTimeout(api._flashTimer);
            api._flashTimer = setTimeout(() => api.setStatus('Ready', 'info'), ms);
            return api;
        };

        // Sticky status (persists until cleared or replaced)
        // And UPDATE clearStatus to force-clear sticky:
        api.clearStatus = function clearStatus() {
            api._sticky = false;
            api.setBusy(false);
            api.setStatus('Ready', 'info', { force: true });
            return api;
        };

        // Preferred entry point for all messages
        // level: 'success' | 'info' | 'warn' | 'error'
        // opts:  { ms?:number, sticky?:boolean, toast?:boolean }
        api.notify = function notify(level, text, opts = {}) {
            const { ms = 2500, sticky = false, toast } = opts;
            const tone = (level === 'warn') ? 'warn' : level; // map to hub tones

            if (sticky) {
                api.setStatus(text, tone, { sticky: true });
            } else {
                api.flash(text, tone, ms);
            }

            // Show toast for warn/error or if explicitly requested; fall back if hub isn’t ready
            if (toast === true || level === 'warn' || level === 'error') {
                try { ROOT.TMUtils?.toast?.(text, level); } catch { }
            }
            return api;
        };

        // Long-running operation helper with spinner + sticky status
        api.beginTask = function beginTask(label, tone = 'info') {
            api.setBusy(true);
            api.setStatus(label, tone, { sticky: true });

            const update = (txt, t = tone) => { api.setStatus(txt, t, { sticky: true }); return ctl; };
            const success = (msg = 'Done', ms = 2500) => {
                api.setBusy(false);
                api.clearStatus();                    // drop the sticky guard/text first
                api.notify('success', msg, { ms });   // then show timed flash
                return ctl;
            };
            const error = (msg = 'Failed') => {
                api.setBusy(false);
                api.clearStatus();
                api.notify('error', msg, { toast: true });
                return ctl;
            };
            const fail = error;
            const clear = () => { api.setBusy(false); api.clearStatus(); return ctl; };

            const ctl = { update, success, done: success, error, fail, clear };
            return ctl;
        };

        render(); // initial render
        return { host, left, center, right, api };
    }
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
        border: pick(t?.border, undefined, 'rgba(0,0,0,.12)'),
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
        shadow: { sm: "0 1px 3px rgba(0,0,0,.08)", md: "0 1px 4px rgba(0,0,0,.06)" },
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

// Try to mount the hub once on load; it will also auto-mount on first facade call.
try { Promise.resolve().then(() => ROOT.ensureLTHub?.().catch(() => { })); } catch { }

