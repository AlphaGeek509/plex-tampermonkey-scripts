// ==UserScript==
// @name         LT › Plex Auth Helper
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.5.150
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
        // Accept "user:pass", "Basic ....", or "Bearer ...."
        if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
        return `Basic ${btoa(raw.trim())}`;
    }

    async function save(raw) {
        await GM_setValue(STORAGE_KEY, raw);
        try { localStorage.setItem(STORAGE_KEY, raw); } catch { }
    }

    // ✅ Never prompts. Returns string or ''.
    function getKey() {
        // 1) GM store (authoritative)
        let raw = GM_getValue(STORAGE_KEY, '');
        if (raw) return normalize(raw);

        // 2) Migrate from localStorage (older scripts) if available
        try {
            const ls = localStorage.getItem(STORAGE_KEY) || '';
            if (ls) {
                // silent migration to GM store
                GM_setValue(STORAGE_KEY, ls);
                return normalize(ls);
            }
        } catch { }

        return ''; // no auto-prompt
    }

    // Prompt only when user asks from the menu
    async function setKey() {
        const input = prompt('Enter Plex credentials as "username:password", or paste a full "Basic <base64>" token:');
        if (!input) return;
        const norm = normalize(input);
        await save(norm);
        alert('🔐 Plex API Key saved');
    }

    async function clearKey() {
        await GM_setValue(STORAGE_KEY, '');
        try { localStorage.removeItem(STORAGE_KEY); } catch { }
        alert('🔐 Plex API Key cleared');
    }

    // Expose API (back-compat + new alias)
    const api = { getKey, setKey, clearKey };
    window.PlexAPI = api;
    window.PlexAuth = api;
    try { unsafeWindow.PlexAuth = api; } catch { }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Set Plex API Key', setKey);
        GM_registerMenuCommand('🧹 Clear Plex API Key', clearKey);
    }
})();