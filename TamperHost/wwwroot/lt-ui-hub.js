/* lt-ui-hub : full-width sticky action bar above Plex actions
   - Mounts before `.plex-actions-wrapper` when present, else at top of
     `.plex-sidetabs-menu-page-content-container`
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

    if (window.ltUIHub) return window.ltUIHub;

    const { container, beforeNode } = await waitForContainerAndAnchor(timeoutMs, selectors);
    const { host, left, center, right, api } = createHub();

    // Insert *before* the actions wrapper when possible; otherwise at top
    if (beforeNode) container.insertBefore(host, beforeNode);
    else container.prepend(host);

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

    window.ltUIHub = api; // expose singleton for this tab
    return api;

    // ---------- helpers ----------
    function waitForContainerAndAnchor(ms, sels) {
        return new Promise((resolve, reject) => {
            const tryFind = () => {
                const container = document.querySelector('.plex-sidetabs-menu-page-content-container')
                    || document.querySelector('.plex-sidetabs-menu-page-content')
                    || document.body;
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
        // sticky + full width
        Object.assign(host.style, {
            position: 'sticky', top: '0', zIndex: '999',
        });

        const root = host.attachShadow({ mode: 'open' });
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

        // brand chip
        const brand = document.createElement('div'); brand.className = 'brand';
        const dot = document.createElement('div'); dot.className = 'dot';
        const brandText = document.createElement('span'); brandText.textContent = 'LT Hub';
        brand.append(dot, brandText);
        left.appendChild(brand);

        wrap.append(left, center, right);
        root.append(style, wrap);

        // Registry + API
        const registry = new Map();
        function render() {
            // Clear center (buttons live here by default)
            Array.from(center.children).forEach(ch => { if (ch !== center._fixed) ch.remove(); });
            // Sorted render
            const items = Array.from(registry.values())
                .sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100) || String(a.label).localeCompare(String(b.label)));
            for (const it of items) {
                if (it.type === 'separator') { const sep = document.createElement('div'); sep.className = 'sep'; addToSection(sep, it.section); continue; }
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
            const target = section === 'left' ? left : section === 'right' ? right : center;
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
            setStatus(text, tone = 'info') {
                if (!api._statusEl) { api._statusEl = document.createElement('div'); api._statusEl.className = 'status info'; right.prepend(api._statusEl); }
                api._statusEl.className = `status ${tone}`;
                api._statusEl.textContent = text ?? '';
                return this;
            },
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

        // REPLACE your current setStatus(...) with this:
        api.setStatus = function setStatus(text, tone = 'info', opts = {}) {
            // opts: { sticky?: boolean, force?: boolean }
            const stickyReq = !!opts.sticky;
            const force = !!opts.force;

            if (!api._statusEl) {
                api._statusEl = document.createElement('div');
                api._statusEl.className = 'status info';
                right.prepend(api._statusEl);
            }

            // If a sticky status is active, ignore non-sticky updates unless forced
            if (api._sticky && !stickyReq && !force) return api;

            api._sticky = stickyReq && !!text;
            api._statusEl.className = `status ${tone}`;
            api._statusEl.textContent = text ?? '';
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
                try { window.TMUtils?.toast?.(text, level); } catch { }
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
if (!window.ensureLTHub) window.ensureLTHub = (...a) => ensureLTHub(...a);

/** Back-compat shim for older bundles that call `injectThemeCSS(theme)` */
if (!window.injectThemeCSS) window.injectThemeCSS = (theme) => {
    try {
        const t = theme || window.LT_DEFAULT_THEME || OM_DEFAULT_THEME;
        const root = window.ltUIHub?._shadow || null;
        if (root) injectTheme(root, t);
    } catch (_) { /* non-fatal */ }
};

