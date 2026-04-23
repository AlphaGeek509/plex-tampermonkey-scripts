// ==UserScript==
// @name        LynTron Dev Reload
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     1.2.0
// @description Connects to the local dev server and reloads the page when a build completes. Install manually for local development only — never part of a production build.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @grant       GM_openInTab
// @run-at      document-start
// @noframes
// ==/UserScript==

(function () {
    const WS_URL = 'ws://localhost:5000/ws';
    const DEV_BASE = 'http://localhost:5000';
    const RECONNECT_DELAY_MS = 3000;

    let pendingReload = false;

    function scheduleReloadOnReturn() {
        if (pendingReload) return;
        pendingReload = true;

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                document.removeEventListener('visibilitychange', onVisible);
                pendingReload = false;
                location.reload();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
    }

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
                // Open install/update dialog in the foreground so the user sees it.
                // Reload this tab when they switch back, after accepting the TM update.
                GM_openInTab(`${DEV_BASE}/${filename}`, { active: true, insert: true });
                scheduleReloadOnReturn();
            } else {
                location.reload();
            }
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
