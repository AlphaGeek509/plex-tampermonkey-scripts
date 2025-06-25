// ==UserScript==
// @name         lt-plex-auth
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  PlexAPI helper: prompt for user:pass or full token, automatically Base64-encode & prefix "Basic " if needed.
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function(window){
  'use strict';
  if (window.PlexAPI) return;  // only once

  const STORAGE_KEY = 'LT_PLEX_API_KEY';

  window.PlexAPI = {
    /**
     * Returns a fully formed "Basic <base64>" string, prompting & encoding if necessary.
     * @returns {Promise<string>}
     */
    async getKey() {
      // 1️⃣ Read stored value (GM storage first, then localStorage fallback)
      let raw = await GM_getValue(STORAGE_KEY, '') ||
                localStorage.getItem(STORAGE_KEY) ||
                '';

      // 2️⃣ If it looks like unencoded credentials (contains ':' but no "Basic ")
      if (raw && !raw.startsWith('Basic ') && raw.includes(':')) {
        const b64 = btoa(raw);
        raw = 'Basic ' + b64;
        await GM_setValue(STORAGE_KEY, raw);
        localStorage.setItem(STORAGE_KEY, raw);
      }

      // 3️⃣ If still empty, prompt the user for credentials or token
      if (!raw) {
        const entered = prompt(
          'Enter your Plex credentials as "username:password",\n' +
          'or paste a full "Basic <base64>" token:'
        );
        if (entered) {
          if (entered.startsWith('Basic ')) {
            raw = entered;
          } else if (entered.includes(':')) {
            raw = 'Basic ' + btoa(entered);
          } else {
            // assume they pasted raw base64 without prefix
            raw = 'Basic ' + entered;
          }
          await GM_setValue(STORAGE_KEY, raw);
          localStorage.setItem(STORAGE_KEY, raw);
        }
      }

      return raw;
    },

    /**
     * Force the user to re-enter or override their stored key.
     */
    async setKey() {
      const existing = await this.getKey();
      const entered = prompt(
        'Enter new Plex credentials (user:pass) or full token:',
        existing
      );
      if (entered !== null) {
        let raw;
        if (entered.startsWith('Basic ')) {
          raw = entered;
        } else if (entered.includes(':')) {
          raw = 'Basic ' + btoa(entered);
        } else {
          raw = 'Basic ' + entered;
        }
        await GM_setValue(STORAGE_KEY, raw);
        localStorage.setItem(STORAGE_KEY, raw);
        alert('✅ Plex API Key updated');
      }
    }
  };

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('⚙️ Set Plex API Key', () => PlexAPI.setKey());
  }

})(window);
