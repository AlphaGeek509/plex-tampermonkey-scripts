// ==UserScript==
// @name        LynTron Dev Reload
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     1.0.0
// @description Connects to the local dev server and reloads the page when a build completes. Install manually for local development only — never part of a production build.
// @author      Jeff Nichols (OneMonroe | Lyn-Tron)
// @license     MIT
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
// @grant       none
// @run-at      document-start
// ==/UserScript==

(function () {
    const WS_URL = 'ws://localhost:5000/ws';
    const RECONNECT_DELAY_MS = 3000;

    function connect() {
        let ws;
        try {
            ws = new WebSocket(WS_URL);
        } catch (_) {
            return;
        }

        ws.onmessage = (e) => {
            if (e.data === 'reload') {
                console.log('[DevReload] Build complete — reloading page...');
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
