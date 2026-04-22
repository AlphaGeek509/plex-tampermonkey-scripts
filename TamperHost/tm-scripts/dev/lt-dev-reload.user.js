// ==UserScript==
// @name        LynTron Dev Reload
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     1.1.0
// @description Connects to the local dev server and reloads the page when a build completes. Install manually for local development only — never part of a production build.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @grant       GM_openInTab
// @run-at      document-start
// ==/UserScript==

(function () {
    const WS_URL = 'ws://localhost:5000/ws';
    const DEV_BASE = 'http://localhost:5000';
    const RECONNECT_DELAY_MS = 3000;
    const PAGE_RELOAD_DELAY_MS = 1500;

    function connect() {
        let ws;
        try {
            ws = new WebSocket(WS_URL);
        } catch (_) {
            return;
        }

        ws.onmessage = (e) => {
            if (!e.data.startsWith('reload')) return;

            const filename = e.data.includes(':') ? e.data.split(':')[1] : null;
            console.log(`[DevReload] Build complete${filename ? ` (${filename})` : ''} — updating...`);

            if (filename) {
                // Opening a .user.js URL causes TM to surface the update dialog immediately
                GM_openInTab(`${DEV_BASE}/${filename}`, { active: false, insert: true });
            }

            // Reload the main page after a short delay to give TM time to register the update
            setTimeout(() => location.reload(), PAGE_RELOAD_DELAY_MS);
        };

        ws.onclose = () => {
            setTimeout(connect, RECONNECT_DELAY_MS);
        };

        ws.onerror = () => {
            ws.close();
        };
    }

    connect();
})();
