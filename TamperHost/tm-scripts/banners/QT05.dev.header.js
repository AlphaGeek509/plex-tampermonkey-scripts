// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.6.5
// @description Customer Contact Add: Adds a Hub Bar button (“New Contact”) on the Quote page that opens the Plex Contact form in a new tab, preserving test vs. prod based on the current host. It resolves CustomerNo via KO (with DOM fallbacks) and is SPA-safe via ensureHubButton and URL/mutation observers.
// @match       https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match       https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
__REQUIRES__
__RESOURCES__
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.plex.com
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==
