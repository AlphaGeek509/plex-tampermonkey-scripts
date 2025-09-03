// ==UserScript==
// @name        QT20 — Get Stock Levels
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     3.5.173
// @description Production build (no DEV helpers). Adds stock-level action and appends normalized summary to Note.
//              Will have to add access to TMUtils and LTAuth libraries via @require in future.
// @match       https://*.plex.com/*
// @match       https://*.on.plex.com/*
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlHttpRequest
// @grant       unsafeWindow
// @connect     *.plex.com
// @run-at      document-idle
// @noframes
// ==/UserScript==
