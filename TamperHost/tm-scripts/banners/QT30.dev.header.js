// ==UserScript==
// @name         QT30_DEV
// @namespace    https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version      3.6.2
// @description  Shell that loads QT30 from the tm-tdd dev server bundle
// @match        https://lyntron.on.plex.com/SalesAndCRM/QuoteWizard*
// @match        https://lyntron.on.plex.com/SalesAndCrm/QuoteWizard*
// @match        https://lyntron.test.on.plex.com/SalesAndCRM/QuoteWizard*
// @match        https://lyntron.test.on.plex.com/SalesAndCrm/QuoteWizard*
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