// File: lt-plex-auth.user.js
// =================================================================
// ==UserScript==
// @name         lt-plex-auth
// @namespace    http://tampermonkey.net/
// @version      3.5.55
// @description  PlexAPI helper: prompt for user:pass or full token, Base64-encode & prefix "Basic "
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function (window) {
    'use strict';
    if (window.PlexAPI) return;

    const STORAGE_KEY = 'LT_PLEX_API_KEY';

    // 1️⃣ Read or prompt for raw stored credentials/token
    async function getRaw() {
        let raw = await GM_getValue(STORAGE_KEY, '')
            || localStorage.getItem(STORAGE_KEY)
            || '';
        return raw;
    }

    // 2️⃣ Normalize: ensure prefix and Base64 encoding
    async function normalize(raw) {
        if (!raw) return '';
        if (raw.startsWith('Basic ') && raw.length > 6) return raw;
        // contains colon => user:pass
        if (raw.includes(':')) return 'Basic ' + btoa(raw);
        // assume already Base64
        return 'Basic ' + raw;
    }

    // 3️⃣ Store in both GM and localStorage
    async function save(raw) {
        await GM_setValue(STORAGE_KEY, raw);
        localStorage.setItem(STORAGE_KEY, raw);
    }

    async function getKey() {
        let raw = await getRaw();
        raw = await normalize(raw);
        if (!raw) {
            const entered = prompt(
                'Enter Plex credentials as "username:password",\n' +
                'or paste a full "Basic <base64>" token:'
            );
            raw = await normalize(entered || '');
            if (raw) await save(raw);
        }
        return raw;
    }

    async function setKey() {
        const current = await getKey();
        const entered = prompt('Enter new Plex cred or full token:', current);
        const raw = await normalize(entered || '');
        if (raw) {
            await save(raw);
            alert('✅ Plex API Key updated');
        }
    }

    window.PlexAPI = { getKey, setKey };
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Set Plex API Key', setKey);
    }
})(window);