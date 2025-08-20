// ==UserScript==
// @name         Plex Loader
// @namespace    http://tampermonkey.net/
// @version      3.5.114
// @description  Bootstrap loader for Plex TM scripts (dev toggle enabled)
// @match        *://*.plex.com/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    const DEV_KEY = 'tm_dev';

    // Helper: Check current dev mode
    const isDev = localStorage.getItem(DEV_KEY) === '1';

    // Helper: Toggle dev mode
    function toggleDevMode() {
        if (isDev) {
            localStorage.removeItem(DEV_KEY);
            alert('🚀 Dev mode DISABLED. Scripts will load from GitHub.');
        } else {
            localStorage.setItem(DEV_KEY, '1');
            alert('🔧 Dev mode ENABLED. Scripts will load from localhost.');
        }
        location.reload();
    }

    // Register toggle in Tampermonkey menu
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand(
            isDev ? '🔧 Disable Dev Mode' : '🚀 Enable Dev Mode',
            toggleDevMode
        );
    }

    const base = isDev
        ? 'http://localhost:5000'
        : 'https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master';

    const scripts = [
        'lt-plex-auth.user.js',
        'lt-plex-tm-utils.user.js',
        'QT10-GetCatalogByCustomer.user.js'
    ];

    scripts.forEach(src => {
        const s = document.createElement('script');
        s.src = `${base}/${src}`;
        s.type = 'text/javascript';
        document.body.appendChild(s);
    });

    console.log(`🧠 Plex Loader: ${isDev ? 'DEV' : 'PROD'} mode → ${base}`);
})();
