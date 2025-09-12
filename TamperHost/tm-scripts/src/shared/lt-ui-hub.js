/* lt-ui-hub : full-width LT hub bar injected directly above Plex actions
   Policy: Anchor + Spacer (no touching Plex styles)
   - Inserts hub before .plex-actions-wrapper
   - If the anchor is out-of-flow (absolute/fixed/sticky), add a spacer AFTER the anchor sized to hub height
   - KO re-render resilient; idempotent per tab
   - THEME: design tokens + runtime applyTheme()
*/

// ---------- DESIGN TOKENS ----------
const DEFAULT_THEME = {
    brandName: 'LT Hub',
    colors: {
        brand: '#0e4b8e', // deep blue (placeholder)
        accent: '#f59e0b', // warm industrial amber (placeholder)
        surface: '#ffffff',
        surfaceAlt: '#f7f9fb',
        border: 'rgba(0,0,0,.12)',
        text: '#0f172a',
        textMuted: '#475569',
        status: {
            infoBg: '#eff6ff', infoBorder: '#dbeafe',
            successBg: '#ecfdf5', successBorder: '#d1fae5',
            warnBg: '#fffbeb', warnBorder: '#fde68a',
            dangerBg: '#fef2f2', dangerBorder: '#fee2e2',
        }
    },
    radius: { sm: 8, pill: 999 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
    shadow: { sm: '0 1px 3px rgba(0,0,0,.08)', md: '0 1px 4px rgba(0,0,0,.06)' },
    font: '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
};

// Draft palette you can refine with official Monroe/OneMonroe hex codes
export const MONROE_THEME_DRAFT = {
    ...DEFAULT_THEME,
    brandName: 'OneMonroe Tools',
    colors: {
        ...DEFAULT_THEME.colors,
        brand: '#0b4c8c',   // tweak once you have official primary
        accent: '#f6a800',   // tweak once you have official accent
    }
};

// Utility: write CSS vars into a <style> inside the Shadow DOM
function injectThemeCSS(shadowRoot, theme) {
    const t = (k, d) => k ?? d;
    const sel = 'style[data-lt-theme]';
    let tag = shadowRoot.querySelector(sel);
    if (!tag) { tag = document.createElement('style'); tag.setAttribute('data-lt-theme', '1'); shadowRoot.append(tag); }
    const c = theme.colors;
    const r = theme.radius;
    const s = theme.spacing;
    const sh = theme.shadow;

    tag.textContent = `
    :host { --lt-font: ${theme.font}; }

    :host {
      --lt-brand: ${c.brand};
      --lt-accent: ${c.accent};
      --lt-surface: ${c.surface};
      --lt-surface-alt: ${c.surfaceAlt};
      --lt-border: ${c.border};
      --lt-text: ${c.text};
      --lt-text-muted: ${c.textMuted};
      --lt-status-info-bg: ${c.status.infoBg};
      --lt-status-info-bd: ${c.status.infoBorder};
      --lt-status-success-bg: ${c.status.successBg};
      --lt-status-success-bd: ${c.status.successBorder};
      --lt-status-warn-bg: ${c.status.warnBg};
      --lt-status-warn-bd: ${c.status.warnBorder};
      --lt-status-danger-bg: ${c.status.dangerBg};
      --lt-status-danger-bd: ${c.status.dangerBorder};

      --lt-r-sm: ${r.sm}px; --lt-r-pill: ${r.pill}px;
      --lt-space-xs: ${s.xs}px; --lt-space-sm: ${s.sm}px; --lt-space-md: ${s.md}px; --lt-space-lg: ${s.lg}px;
      --lt-shadow-sm: ${sh.sm}; --lt-shadow-md: ${sh.md};
    }
  `;
}

// ---------- HUB CORE (kept short here — same Anchor+Spacer logic you have) ----------
function isOutOfFlow(el) {
    const p = getComputedStyle(el).position;
    return p === 'absolute' || p === 'fixed' || p === 'sticky';
}

function buildHub(shadowRoot, theme = DEFAULT_THEME) {
    // Apply theme vars
    injectThemeCSS(shadowRoot, theme);

    const style = document.createElement('style');
    style.textContent = `
    :host { all: initial; font: var(--lt-font); }
    .hub {
      box-sizing: border-box; width: 100%;
      background: var(--lt-surface);
      border-bottom: 1px solid var(--lt-border);
      box-shadow: var(--lt-shadow-md);
      padding: var(--lt-space-sm) var(--lt-space-md);
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--lt-space-sm);
      color: var(--lt-text);
    }
    .left,.center,.right { display: inline-flex; gap: var(--lt-space-sm); align-items: center; }
    .left { justify-content: flex-start; }
    .center { justify-content: center; flex-wrap: wrap; }
    .right { justify-content: flex-end; }

    .brand {
      display:inline-flex; align-items:center; gap: var(--lt-space-xs);
      padding: 4px 10px; border-radius: var(--lt-r-pill);
      border: 1px solid var(--lt-border);
      background: var(--lt-surface-alt); font-weight: 600;
    }
    .dot { width: 8px; height: 8px; border-radius: var(--lt-r-pill); background: var(--lt-brand); }

    button.hbtn {
      all: unset; font: inherit; color: var(--lt-text);
      padding: 6px 12px; border-radius: var(--lt-r-sm);
      border: 1px solid var(--lt-border); background: #fff;
      box-shadow: var(--lt-shadow-sm); cursor: pointer;
    }
    button.hbtn:hover { border-color: var(--lt-brand); }
    button.hbtn:focus { outline: 2px solid color-mix(in oklab, var(--lt-brand) 35%, white); outline-offset: 2px; }
    button.hbtn[disabled] { opacity:.55; cursor:not-allowed; }

    .sep { width:1px; height:20px; background: var(--lt-border); }
    .status { padding: 3px 10px; border-radius: var(--lt-r-pill); font-size: 12px; }
    .status.info    { background: var(--lt-status-info-bg);    border:1px solid var(--lt-status-info-bd); }
    .status.success { background: var(--lt-status-success-bg); border:1px solid var(--lt-status-success-bd); }
    .status.warn    { background: var(--lt-status-warn-bg);    border:1px solid var(--lt-status-warn-bd); }
    .status.danger  { background: var(--lt-status-danger-bg);  border:1px solid var(--lt-status-danger-bd); }
  `;

    const wrap = document.createElement('div'); wrap.className = 'hub';
    const left = document.createElement('div'); left.className = 'left';
    const center = document.createElement('div'); center.className = 'center';
    const right = document.createElement('div'); right.className = 'right';

    // Brand chip
    const brand = document.createElement('div'); brand.className = 'brand';
    const dot = document.createElement('div'); dot.className = 'dot';
    const brandText = document.createElement('span'); brandText.textContent = theme.brandName || 'LT Hub';
    brand.append(dot, brandText); left.appendChild(brand);

    wrap.append(left, center, right);
    shadowRoot.append(style, wrap);

    const registry = new Map();
    const api = {
        registerButton(def) { if (!def?.id) throw new Error('ltUIHub.registerButton requires id'); registry.set(def.id, def); render(); return this; },
        remove(id) { registry.delete(id); render(); return this; },
        clear() { registry.clear(); render(); return this; },
        list() { return Array.from(registry.values()); },
        setTitle(text) { brandText.textContent = text || (theme.brandName || 'LT Hub'); return this; },
        setStatus(text, tone = 'info') {
            if (!api._statusEl) { api._statusEl = document.createElement('div'); right.prepend(api._statusEl); }
            api._statusEl.className = `status ${tone}`; api._statusEl.textContent = text ?? ''; return this;
        },
        applyTheme(nextTheme) { injectThemeCSS(shadowRoot, nextTheme); api.setTitle(nextTheme.brandName || theme.brandName); render(); return this; },
        _el: shadowRoot.host, _shadow: shadowRoot
    };

    function addTo(section, el) {
        const target = section === 'left' ? left : section === 'right' ? right : center;
        target.appendChild(el);
    }

    function render() {
        // clear dynamic zones (keep brand/status)
        for (const sec of [left, center, right]) {
            for (const ch of Array.from(sec.children)) {
                if (sec === left && ch === brand) continue;
                if (sec === right && ch === api._statusEl) continue;
                sec.removeChild(ch);
            }
        }
        const items = Array.from(registry.values())
            .sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100) || String(a.label).localeCompare(String(b.label)));
        for (const it of items) {
            if (it.type === 'separator') { addTo(it.section, Object.assign(document.createElement('div'), { className: 'sep' })); continue; }
            const btn = document.createElement('button'); btn.className = 'hbtn'; btn.type = 'button';
            btn.title = it.title || it.label; btn.textContent = it.label;
            if (typeof it.onClick === 'function') btn.addEventListener('click', e => it.onClick(e));
            if (it.disabled) btn.setAttribute('disabled', '');
            addTo(it.section, btn);
        }
    }

    return { api };
}

// ⬇️ add near the top
const PAGE_ROOT_SELECTORS = ['#plexSidetabsMenuPage', '.plex-sidetabs-menu-page'];

// helper to find the page root and its parent (so we can insertBefore)
function waitForPageRoot(timeoutMs = 15000, sels = PAGE_ROOT_SELECTORS) {
    return new Promise((resolve, reject) => {
        const find = () => sels.map(s => document.querySelector(s)).find(Boolean) || null;
        const hit = find(); if (hit) return resolve(hit);
        const obs = new MutationObserver(() => { const el = find(); if (el) { obs.disconnect(); resolve(el); } });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error('lt-ui-hub: page root not found')); }, timeoutMs);
    });
}


// --- Anchor + Spacer mounting (unchanged idea, condensed) ---
function mountHubAtAnchor(anchorEl, { stick, gap, theme }) {
    const container = anchorEl.parentElement;
    // host
    let host = container.querySelector(':scope > [data-lt-hub]');
    if (!host) {
        host = document.createElement('div'); host.setAttribute('data-lt-hub', '1');
        Object.assign(host.style, stick ? { position: 'sticky', top: '0', zIndex: '999' }
            : { position: 'relative', zIndex: '1', marginBottom: `${gap}px` });
        container.insertBefore(host, anchorEl);
        const root = host.attachShadow({ mode: 'open' });
        const { api } = buildHub(root, theme || DEFAULT_THEME);
        host._api = api;
    }
    // spacer after anchor
    let spacer = anchorEl.nextElementSibling?.getAttribute('data-lt-hub-spacer') === '1'
        ? anchorEl.nextElementSibling
        : null;
    if (!spacer) {
        spacer = document.createElement('div'); spacer.setAttribute('data-lt-hub-spacer', '1');
        spacer.style.height = '0px'; spacer.style.pointerEvents = 'none';
        container.insertBefore(spacer, anchorEl.nextSibling);
    }

    const adjust = () => {
        const hubH = host.getBoundingClientRect().height || 0;
        if (isOutOfFlow(anchorEl)) {
            spacer.style.height = `${hubH + gap}px`;
            if (!stick) host.style.marginBottom = '0px';
        } else {
            spacer.style.height = '0px';
            if (!stick) host.style.marginBottom = `${gap}px`;
        }
    };
    const ro = new ResizeObserver(adjust); ro.observe(host); ro.observe(anchorEl);
    window.addEventListener('resize', adjust, { passive: true });
    queueMicrotask(adjust);

    // KO re-render guard
    const mo = new MutationObserver(() => {
        if (!host.isConnected || !anchorEl.isConnected) { mo.disconnect(); /* re-mount handled by caller */ }
    });
    mo.observe(container, { childList: true });

    return host._api;
}

function injectTheme(root, t) {
    if (!root) return;
    const s = document.createElement('style');
    s.textContent = `
      :host{
        --om-primary:${t.primary ?? '#8B0902'};
        --om-primary-hi:${t.primaryHi ?? '#890F10'};
        --om-primary-lo:${t.primaryLo ?? '#5C0A0A'};
        --om-on-primary:${t.onPrimary ?? '#ffffff'};
        --om-surface:${t.surface ?? '#ffffff'};
        --om-surface-alt:${t.surfaceAlt ?? '#f7f7f7'};
        --om-border:${t.border ?? 'rgba(0,0,0,.12)'};
        --om-chip-bg:${t.chipBg ?? '#f7f9fb'};
      }
      /* override key surfaces */
      .hub { background: var(--om-surface) !important; border-bottom: 1px solid var(--om-border) !important; }
      .brand { background: var(--om-chip-bg) !important; }
      .dot { background: var(--om-primary) !important; }

      /* hover/interaction accents */
      button.hbtn:hover {
        border-color: var(--om-primary) !important;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--om-primary) 18%, transparent) !important;
      }

      /* statuses blend with brand hue */
      .status.info   { border-color: color-mix(in srgb, var(--om-primary) 20%, #dbeafe) !important; }
      .status.warn   { border-color: color-mix(in srgb, var(--om-primary) 25%, #fef3c7) !important; }
      .status.danger { border-color: color-mix(in srgb, var(--om-primary) 25%, #fee2e2) !important; }

      /* spinner accent */
      .spinner { border-top-color: var(--om-primary) !important; }
    `;
    root.appendChild(s);
}

// Public entry
export async function ensureLTHub(opts = {}) {
    const {
        // NEW: choose where to mount
        mount = 'beforeActions', // 'beforeActions' | 'beforePage'
        anchorSelectors = ['.plex-actions-wrapper', '.plex-actions-wrapper.plex-grid-actions'],
        pageRootSelectors = PAGE_ROOT_SELECTORS,
        timeoutMs = 15000,
        stick = false,
        gap = 8,
        theme = null,
    } = opts;

    if (window.ltUIHub) return window.ltUIHub;

    if (mount === 'beforePage') {
        const pageRoot = await waitForPageRoot(timeoutMs, pageRootSelectors);
        const parent = pageRoot.parentElement;
        // host (idempotent)
        let host = parent.querySelector(':scope > [data-lt-hub]');
        if (!host) {
            host = document.createElement('div'); host.setAttribute('data-lt-hub', '1');
            Object.assign(host.style, stick ? { position: 'sticky', top: '0', zIndex: '999' }
                : { position: 'relative', zIndex: '1', marginBottom: `${gap}px` });
            parent.insertBefore(host, pageRoot);           // <<< inject BEFORE the page root
            const root = host.attachShadow({ mode: 'open' });
            const { api } = buildHub(root, theme);
            host._api = api;
        }
        window.ltUIHub = host._api;

        // Re-attach if Plex swaps out the page root
        const mo = new MutationObserver(() => {
            if (!host.isConnected || !pageRoot.isConnected) {
                mo.disconnect();
                ensureLTHub(opts).catch(() => { });
            }
        });
        mo.observe(parent, { childList: true });
        return window.ltUIHub;
    }

    // default path (what you already had): mount before actions wrapper + spacer logic
    const anchor = await new Promise((resolve, reject) => {
        const find = () => anchorSelectors.map(s => document.querySelector(s)).find(Boolean);
        const hit = find(); if (hit) return resolve(hit);
        const obs = new MutationObserver(() => { const el = find(); if (el) { obs.disconnect(); resolve(el); } });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error('lt-ui-hub: anchor not found')); }, timeoutMs);
    });

    const api = mountHubAtAnchor(anchor, { stick, gap, theme });
    window.ltUIHub = api;
    return api;
}


// DEV convenience
if (!window.ensureLTHub) window.ensureLTHub = (...a) => ensureLTHub(...a);
