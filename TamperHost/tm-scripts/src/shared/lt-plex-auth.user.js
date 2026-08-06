// ==UserScript==
// @name         LT › Plex Auth Helper
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2026.08.06.1
// @description  Shared helper for storing and retrieving Plex API key
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

// Credential storage model
// ------------------------
// Plex's Data Source API mandates HTTP Basic with base64(utf8(user:pass)) — there is no token,
// API-key, or session-cookie alternative — so the credential must be recoverable in plaintext on
// every DS call. Encryption at rest would be obfuscation only (the key would sit beside it), so the
// two levers that actually exist are WHERE it is stored and HOW LONG it persists.
//
// This helper is @require'd into each QT script, so N independent instances run per page, each bound
// to its own isolated GM store. They previously shared state through a mirror in page-readable
// localStorage. That mirror is gone: instances now discover each other through a page-level peer
// registry and provision each other's GM stores, so the user still enters the credential once while
// nothing persists outside extension-isolated storage.
//
// The credential is scoped to a DS-only Plex account, separate from the interactive/UX login, which
// is never touched or stored here.

(function () {
    'use strict';

    const STORAGE_KEY = 'PlexApiKey';
    const PEERS_PROP = '__LT_AUTH_PEERS__';
    const PROMPT_PROP = '__LT_AUTH_PROMPTING__';

    // Credential age before we force re-entry. 0 disables expiry.
    const TTL_DAYS = 90;
    const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

    const ROOT = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    function normalize(raw) {
        if (!raw) return '';
        if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
        if (!raw.includes(':')) throw new Error('Credentials must be in "username:password" format');
        // Unicode-safe base64 encoding — matches Plex's documented utf8GetBytes -> base64Encode
        return `Basic ${btoa(unescape(encodeURIComponent(raw.trim())))}`;
    }

    function normalizeSafe(raw) {
        try { return normalize(raw); } catch { return ''; }
    }

    // ---------------------------------------------------------------------
    // Own GM store — records are { v: <normalized>, ts: <epoch ms first set> }
    // ---------------------------------------------------------------------

    function writeOwn(normalized, ts) {
        try { GM_setValue(STORAGE_KEY, { v: normalized, ts: ts || Date.now() }); } catch { }
    }

    function wipeOwn() {
        try { GM_setValue(STORAGE_KEY, ''); } catch { }
    }

    function expired(ts) {
        return TTL_MS > 0 && (Date.now() - (ts || 0)) > TTL_MS;
    }

    // Returns { v, ts } or null. Upgrades legacy plain-string records in place.
    function readOwnRecord() {
        let rec;
        try { rec = GM_getValue(STORAGE_KEY, ''); } catch { return null; }
        if (!rec) return null;

        if (typeof rec === 'string') {
            const v = normalizeSafe(rec);
            if (!v) { wipeOwn(); return null; }
            const ts = Date.now();   // no history for legacy values; start the clock now
            writeOwn(v, ts);
            return { v, ts };
        }

        if (typeof rec === 'object' && rec.v) {
            if (expired(rec.ts)) { wipeOwn(); return null; }
            const v = normalizeSafe(rec.v);
            if (!v) { wipeOwn(); return null; }
            return { v, ts: rec.ts };
        }

        wipeOwn();
        return null;
    }

    // ---------------------------------------------------------------------
    // Peer registry — sibling instances of this helper on the same page
    // ---------------------------------------------------------------------

    const peers = ROOT[PEERS_PROP] || (ROOT[PEERS_PROP] = []);

    const self = {
        id: (typeof GM_info !== 'undefined' && GM_info?.script?.name) || 'lt-plex-auth',
        // Offer carries the original timestamp so adoption cannot refresh the TTL clock —
        // otherwise instances would renew each other indefinitely and expiry would never fire.
        offer() { return readOwnRecord(); },
        adopt(rec) {
            if (!rec || !rec.v) return;
            const v = normalizeSafe(rec.v);
            if (v) writeOwn(v, rec.ts);
        },
        wipe() { wipeOwn(); }
    };
    peers.push(self);

    function askPeers() {
        for (const p of peers) {
            if (p === self) continue;
            try {
                const rec = p.offer && p.offer();
                if (rec && rec.v) return rec;
            } catch { }
        }
        return null;
    }

    function broadcast(rec) {
        for (const p of peers) {
            if (p === self) continue;
            try { rec ? p.adopt(rec) : p.wipe(); } catch { }
        }
    }

    // ---------------------------------------------------------------------
    // One-time migration off the page-readable localStorage mirror
    // ---------------------------------------------------------------------

    function migrateLegacyMirror() {
        let raw = '';
        try { raw = localStorage.getItem(STORAGE_KEY) || ''; } catch { return null; }
        if (!raw) return null;

        // Remove the page-readable copy first, so a failure below still leaves us safe.
        try { localStorage.removeItem(STORAGE_KEY); } catch { }

        const v = normalizeSafe(raw);
        if (!v) return null;

        const rec = { v, ts: Date.now() };
        writeOwn(rec.v, rec.ts);
        broadcast(rec);
        return rec;
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    // Never prompts. Returns a normalized Authorization value, or ''.
    function getKey() {
        const own = readOwnRecord();
        if (own) return own.v;

        const fromPeer = askPeers();
        if (fromPeer) {
            writeOwn(fromPeer.v, fromPeer.ts);   // provision this sandbox, preserving age
            return fromPeer.v;
        }

        return '';
    }

    async function setKey() {
        // Six instances share one page; only one modal should ever render.
        if (ROOT[PROMPT_PROP]) return;
        ROOT[PROMPT_PROP] = true;

        let input;
        try { input = await promptModal(); }
        finally { ROOT[PROMPT_PROP] = false; }

        if (!input) return;
        const v = normalizeSafe(input);
        if (!v) return;

        const rec = { v, ts: Date.now() };
        writeOwn(rec.v, rec.ts);
        broadcast(rec);
        alert('🔐 Plex API Key saved');
    }

    function clearKey() {
        wipeOwn();
        broadcast(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch { }   // belt-and-braces for un-migrated tabs
        alert('🔐 Plex API Key cleared');
    }

    function promptModal() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed;inset:0;z-index:2147483647',
                'background:rgba(0,0,0,.65)',
                'display:flex;align-items:center;justify-content:center',
            ].join(';');

            const box = document.createElement('div');
            box.style.cssText = [
                'background:#1e1e2e;color:#cdd6f4',
                'border-radius:8px;padding:24px;min-width:380px;max-width:90vw',
                'font:14px system-ui,sans-serif',
                'box-shadow:0 8px 32px rgba(0,0,0,.5)',
            ].join(';');

            const heading = document.createElement('div');
            heading.textContent = '🔐 Set Plex API Key';
            heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';

            const hint = document.createElement('div');
            hint.textContent = 'Enter the username:password for your Plex Data Source account (not your Plex sign-in), or paste a full Basic <base64> string.';
            hint.style.cssText = 'font-size:12px;color:#a6adc8;margin-bottom:10px';

            const input = document.createElement('input');
            input.type = 'password';
            input.placeholder = 'username:password';
            input.autocomplete = 'current-password';
            input.style.cssText = [
                'width:100%;box-sizing:border-box',
                'background:#313244;color:#cdd6f4;border:1px solid #45475a',
                'border-radius:4px;padding:8px 10px;font-size:13px;margin-bottom:6px',
            ].join(';');

            const errMsg = document.createElement('div');
            errMsg.style.cssText = 'color:#f38ba8;font-size:12px;min-height:18px;margin-bottom:10px';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = [
                'padding:6px 16px;border-radius:4px',
                'border:1px solid #45475a;background:transparent;color:#cdd6f4;cursor:pointer',
            ].join(';');

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = [
                'padding:6px 16px;border-radius:4px',
                'border:none;background:#89b4fa;color:#1e1e2e;cursor:pointer;font-weight:600',
            ].join(';');

            function showError(msg) { errMsg.textContent = msg || ''; }

            function dismiss(value) { overlay.remove(); resolve(value ?? null); }

            function attemptSave() {
                const val = input.value.trim();
                if (!val) { showError('Please enter your credentials.'); return; }
                try { normalize(val); } catch (e) { showError(e.message); return; }
                dismiss(val);
            }

            cancelBtn.addEventListener('click', () => dismiss(null));
            saveBtn.addEventListener('click', attemptSave);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') attemptSave();
                if (e.key === 'Escape') dismiss(null);
            });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(null); });

            btnRow.append(cancelBtn, saveBtn);
            box.append(heading, hint, input, errMsg, btnRow);
            overlay.appendChild(box);
            (document.body || document.documentElement).appendChild(overlay);
            input.focus();
        });
    }

    const api = { getKey, setKey, clearKey };
    window.PlexAPI = api;
    window.PlexAuth = api;
    try { unsafeWindow.PlexAuth = api; } catch { }
    try { unsafeWindow.PlexAPI = api; } catch { }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Set Plex API Key', setKey);
        GM_registerMenuCommand('🧹 Clear Plex API Key', clearKey);
    }

    // Startup: drop the legacy mirror, then pull from peers. Instances register at document-start in
    // arbitrary order, so re-check on later ticks to catch peers that registered after us.
    migrateLegacyMirror();
    setTimeout(getKey, 0);
    setTimeout(getKey, 3000);
})();
