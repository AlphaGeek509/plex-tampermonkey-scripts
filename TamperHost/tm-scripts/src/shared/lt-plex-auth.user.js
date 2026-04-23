// ==UserScript==
// @name         LT › Plex Auth Helper
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      2026.04.23.1
// @description  Shared helper for storing and retrieving Plex API key
// @match        https://*.on.plex.com/*
// @match        https://*.plex.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    const STORAGE_KEY = 'PlexApiKey';

    function normalize(raw) {
        if (!raw) return '';
        if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
        if (!raw.includes(':')) throw new Error('Credentials must be in "username:password" format');
        // Unicode-safe base64 encoding
        return `Basic ${btoa(unescape(encodeURIComponent(raw.trim())))}`;
    }

    function save(raw) {
        GM_setValue(STORAGE_KEY, raw);
        // Never mirror to localStorage — it is readable by page JS and other extensions
    }

    // ✅ Never prompts. Returns string or ''.
    function getKey() {
        // 1) GM store (authoritative)
        const raw = GM_getValue(STORAGE_KEY, '');
        if (raw) return normalize(raw);

        // 2) One-time migration from localStorage (older scripts)
        try {
            const ls = localStorage.getItem(STORAGE_KEY) || '';
            if (ls) {
                GM_setValue(STORAGE_KEY, ls);
                try { localStorage.removeItem(STORAGE_KEY); } catch { }
                return normalize(ls);
            }
        } catch { }

        return '';
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
            hint.textContent = 'Enter username:password, or paste a full Basic <base64> or Bearer <token> string.';
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

    async function setKey() {
        const input = await promptModal();
        if (!input) return;
        save(normalize(input));
        alert('🔐 Plex API Key saved');
    }

    function clearKey() {
        GM_setValue(STORAGE_KEY, '');
        try { localStorage.removeItem(STORAGE_KEY); } catch { }
        alert('🔐 Plex API Key cleared');
    }

    const api = { getKey, setKey, clearKey };
    window.PlexAPI = api;
    window.PlexAuth = api;
    try { unsafeWindow.PlexAuth = api; } catch { }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Set Plex API Key', setKey);
        GM_registerMenuCommand('🧹 Clear Plex API Key', clearKey);
    }
})();
