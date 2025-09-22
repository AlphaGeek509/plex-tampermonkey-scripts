// ==UserScript==
// @name        QT05_DEV
// @namespace   https://github.com/AlphaGeek509/plex-tampermonkey-scripts
// @version     1.0.1
// @description DEV-only build; includes user-start gate
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

(() => {
  // src/quote-tracking/quoteNo-stash.js
  (function() {
    "use strict";
    const KEY = "QT_WIZARD/QuoteNo";
    const safeSet = (k, v) => {
      try {
        sessionStorage.setItem(k, v);
      } catch {
      }
    };
    const safeGet = (k) => {
      try {
        return sessionStorage.getItem(k);
      } catch {
        return null;
      }
    };
    const safeDel = (k) => {
      try {
        sessionStorage.removeItem(k);
      } catch {
      }
    };
    const QuoteNoStash = {
      /** Persist the given QuoteNo (string|number) for this tab */
      set(value) {
        const v = value == null ? "" : String(value).trim();
        safeSet(KEY, JSON.stringify({ v, t: Date.now() }));
      },
      /** Retrieve the last stored QuoteNo, or null */
      get() {
        const raw = safeGet(KEY);
        if (!raw) return null;
        try {
          return JSON.parse(raw).v || null;
        } catch {
          return null;
        }
      },
      /** Clear the stored QuoteNo (good hygiene once consumed) */
      clear() {
        safeDel(KEY);
      },
      /** For debugging in console */
      debugPeek() {
        const raw = safeGet(KEY);
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      _key: () => KEY
    };
    try {
      const w = (
        /** @type {any} */
        window
      );
      w.lt = w.lt || {};
      w.lt.QT = w.lt.QT || {};
      w.lt.QT.QuoteNoStash = QuoteNoStash;
    } catch {
    }
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvcXVvdGUtdHJhY2tpbmcvcXVvdGVOby1zdGFzaC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gPT1Vc2VyU2NyaXB0PT1cclxuLy8gQG5hbWUgICAgICAgICBRVCBTaGFyZWQ6IFF1b3RlTm8gU3Rhc2hcclxuLy8gQG5hbWVzcGFjZSAgICBsdFxyXG4vLyBAdmVyc2lvbiAgICAgIDEuMC4yXHJcbi8vIEBkZXNjcmlwdGlvbiAgVGFiLXNjb3BlZCBRdW90ZU5vIHN0b3JhZ2UgZm9yIHRoZSBQbGV4IFF1b3RlIFdpemFyZCAoc2Vzc2lvblN0b3JhZ2UtYmFja2VkKVxyXG4vLyBAYXV0aG9yICAgICAgIExUXHJcbi8vIEBtYXRjaCAgICAgICAgaHR0cHM6Ly8qLnBsZXguY29tLypcclxuLy8gQGdyYW50ICAgICAgICBub25lXHJcbi8vID09L1VzZXJTY3JpcHQ9PVxyXG4vKiBnbG9iYWwgd2luZG93LCBzZXNzaW9uU3RvcmFnZSAqL1xyXG4oZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGNvbnN0IEtFWSA9ICdRVF9XSVpBUkQvUXVvdGVObyc7XHJcblxyXG4gICAgY29uc3Qgc2FmZVNldCA9IChrLCB2KSA9PiB7IHRyeSB7IHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oaywgdik7IH0gY2F0Y2ggeyB9IH07XHJcbiAgICBjb25zdCBzYWZlR2V0ID0gKGspID0+IHsgdHJ5IHsgcmV0dXJuIHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oayk7IH0gY2F0Y2ggeyByZXR1cm4gbnVsbDsgfSB9O1xyXG4gICAgY29uc3Qgc2FmZURlbCA9IChrKSA9PiB7IHRyeSB7IHNlc3Npb25TdG9yYWdlLnJlbW92ZUl0ZW0oayk7IH0gY2F0Y2ggeyB9IH07XHJcblxyXG4gICAgY29uc3QgUXVvdGVOb1N0YXNoID0ge1xyXG4gICAgICAgIC8qKiBQZXJzaXN0IHRoZSBnaXZlbiBRdW90ZU5vIChzdHJpbmd8bnVtYmVyKSBmb3IgdGhpcyB0YWIgKi9cclxuICAgICAgICBzZXQodmFsdWUpIHtcclxuICAgICAgICAgICAgY29uc3QgdiA9ICh2YWx1ZSA9PSBudWxsKSA/ICcnIDogU3RyaW5nKHZhbHVlKS50cmltKCk7XHJcbiAgICAgICAgICAgIHNhZmVTZXQoS0VZLCBKU09OLnN0cmluZ2lmeSh7IHYsIHQ6IERhdGUubm93KCkgfSkpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLyoqIFJldHJpZXZlIHRoZSBsYXN0IHN0b3JlZCBRdW90ZU5vLCBvciBudWxsICovXHJcbiAgICAgICAgZ2V0KCkge1xyXG4gICAgICAgICAgICBjb25zdCByYXcgPSBzYWZlR2V0KEtFWSk7XHJcbiAgICAgICAgICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgdHJ5IHsgcmV0dXJuIChKU09OLnBhcnNlKHJhdykudiB8fCBudWxsKTsgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvKiogQ2xlYXIgdGhlIHN0b3JlZCBRdW90ZU5vIChnb29kIGh5Z2llbmUgb25jZSBjb25zdW1lZCkgKi9cclxuICAgICAgICBjbGVhcigpIHsgc2FmZURlbChLRVkpOyB9LFxyXG4gICAgICAgIC8qKiBGb3IgZGVidWdnaW5nIGluIGNvbnNvbGUgKi9cclxuICAgICAgICBkZWJ1Z1BlZWsoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IHNhZmVHZXQoS0VZKTtcclxuICAgICAgICAgICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShyYXcpOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIF9rZXk6ICgpID0+IEtFWSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gRXhwb3NlIGZvciBvdGhlciBRVCBzY3JpcHRzIChRVDEwL1FUNTApIHdpdGhvdXQgaW1wb3J0c1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB3ID0gLyoqIEB0eXBlIHthbnl9ICovICh3aW5kb3cpO1xyXG4gICAgICAgIHcubHQgPSB3Lmx0IHx8IHt9O1xyXG4gICAgICAgIHcubHQuUVQgPSB3Lmx0LlFUIHx8IHt9O1xyXG4gICAgICAgIHcubHQuUVQuUXVvdGVOb1N0YXNoID0gUXVvdGVOb1N0YXNoO1xyXG4gICAgfSBjYXRjaCB7IH1cclxufSkoKTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVVBLEdBQUMsV0FBWTtBQUNUO0FBRUEsVUFBTSxNQUFNO0FBRVosVUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNO0FBQUUsVUFBSTtBQUFFLHVCQUFlLFFBQVEsR0FBRyxDQUFDO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUFBLElBQUU7QUFDNUUsVUFBTSxVQUFVLENBQUMsTUFBTTtBQUFFLFVBQUk7QUFBRSxlQUFPLGVBQWUsUUFBUSxDQUFDO0FBQUEsTUFBRyxRQUFRO0FBQUUsZUFBTztBQUFBLE1BQU07QUFBQSxJQUFFO0FBQzFGLFVBQU0sVUFBVSxDQUFDLE1BQU07QUFBRSxVQUFJO0FBQUUsdUJBQWUsV0FBVyxDQUFDO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUFBLElBQUU7QUFFekUsVUFBTSxlQUFlO0FBQUE7QUFBQSxNQUVqQixJQUFJLE9BQU87QUFDUCxjQUFNLElBQUssU0FBUyxPQUFRLEtBQUssT0FBTyxLQUFLLEVBQUUsS0FBSztBQUNwRCxnQkFBUSxLQUFLLEtBQUssVUFBVSxFQUFFLEdBQUcsR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7QUFBQSxNQUNyRDtBQUFBO0FBQUEsTUFFQSxNQUFNO0FBQ0YsY0FBTSxNQUFNLFFBQVEsR0FBRztBQUN2QixZQUFJLENBQUMsSUFBSyxRQUFPO0FBQ2pCLFlBQUk7QUFBRSxpQkFBUSxLQUFLLE1BQU0sR0FBRyxFQUFFLEtBQUs7QUFBQSxRQUFPLFFBQVE7QUFBRSxpQkFBTztBQUFBLFFBQU07QUFBQSxNQUNyRTtBQUFBO0FBQUEsTUFFQSxRQUFRO0FBQUUsZ0JBQVEsR0FBRztBQUFBLE1BQUc7QUFBQTtBQUFBLE1BRXhCLFlBQVk7QUFDUixjQUFNLE1BQU0sUUFBUSxHQUFHO0FBQ3ZCLFlBQUksQ0FBQyxJQUFLLFFBQU87QUFDakIsWUFBSTtBQUFFLGlCQUFPLEtBQUssTUFBTSxHQUFHO0FBQUEsUUFBRyxRQUFRO0FBQUUsaUJBQU87QUFBQSxRQUFNO0FBQUEsTUFDekQ7QUFBQSxNQUNBLE1BQU0sTUFBTTtBQUFBLElBQ2hCO0FBR0EsUUFBSTtBQUNBLFlBQU07QUFBQTtBQUFBLFFBQXdCO0FBQUE7QUFDOUIsUUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDO0FBQ2hCLFFBQUUsR0FBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLENBQUM7QUFDdEIsUUFBRSxHQUFHLEdBQUcsZUFBZTtBQUFBLElBQzNCLFFBQVE7QUFBQSxJQUFFO0FBQUEsRUFDZCxHQUFHOyIsCiAgIm5hbWVzIjogW10KfQo=
