(() => {
  // src/shared/lt-plex-auth.user.js
  (function() {
    const STORAGE_KEY = "PlexApiKey";
    function normalize(raw) {
      if (!raw) return "";
      if (/^(Basic|Bearer)\s/i.test(raw)) return raw.trim();
      if (!raw.includes(":")) throw new Error('Credentials must be in "username:password" format');
      return `Basic ${btoa(unescape(encodeURIComponent(raw.trim())))}`;
    }
    function save(raw) {
      GM_setValue(STORAGE_KEY, raw);
      try {
        localStorage.setItem(STORAGE_KEY, raw);
      } catch {
      }
    }
    function getKey() {
      const raw = GM_getValue(STORAGE_KEY, "");
      if (raw) return normalize(raw);
      try {
        const ls = localStorage.getItem(STORAGE_KEY) || "";
        if (ls) {
          save(ls);
          return normalize(ls);
        }
      } catch {
      }
      return "";
    }
    function promptModal() {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = [
          "position:fixed;inset:0;z-index:2147483647",
          "background:rgba(0,0,0,.65)",
          "display:flex;align-items:center;justify-content:center"
        ].join(";");
        const box = document.createElement("div");
        box.style.cssText = [
          "background:#1e1e2e;color:#cdd6f4",
          "border-radius:8px;padding:24px;min-width:380px;max-width:90vw",
          "font:14px system-ui,sans-serif",
          "box-shadow:0 8px 32px rgba(0,0,0,.5)"
        ].join(";");
        const heading = document.createElement("div");
        heading.textContent = "\u{1F510} Set Plex API Key";
        heading.style.cssText = "font-size:16px;font-weight:600;margin-bottom:16px";
        const hint = document.createElement("div");
        hint.textContent = "Enter username:password, or paste a full Basic <base64> or Bearer <token> string.";
        hint.style.cssText = "font-size:12px;color:#a6adc8;margin-bottom:10px";
        const input = document.createElement("input");
        input.type = "password";
        input.placeholder = "username:password";
        input.autocomplete = "current-password";
        input.style.cssText = [
          "width:100%;box-sizing:border-box",
          "background:#313244;color:#cdd6f4;border:1px solid #45475a",
          "border-radius:4px;padding:8px 10px;font-size:13px;margin-bottom:6px"
        ].join(";");
        const errMsg = document.createElement("div");
        errMsg.style.cssText = "color:#f38ba8;font-size:12px;min-height:18px;margin-bottom:10px";
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = [
          "padding:6px 16px;border-radius:4px",
          "border:1px solid #45475a;background:transparent;color:#cdd6f4;cursor:pointer"
        ].join(";");
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.textContent = "Save";
        saveBtn.style.cssText = [
          "padding:6px 16px;border-radius:4px",
          "border:none;background:#89b4fa;color:#1e1e2e;cursor:pointer;font-weight:600"
        ].join(";");
        function showError(msg) {
          errMsg.textContent = msg || "";
        }
        function dismiss(value) {
          overlay.remove();
          resolve(value ?? null);
        }
        function attemptSave() {
          const val = input.value.trim();
          if (!val) {
            showError("Please enter your credentials.");
            return;
          }
          try {
            normalize(val);
          } catch (e) {
            showError(e.message);
            return;
          }
          dismiss(val);
        }
        cancelBtn.addEventListener("click", () => dismiss(null));
        saveBtn.addEventListener("click", attemptSave);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") attemptSave();
          if (e.key === "Escape") dismiss(null);
        });
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) dismiss(null);
        });
        btnRow.append(cancelBtn, saveBtn);
        box.append(heading, hint, input, errMsg, btnRow);
        overlay.appendChild(box);
        (document.body || document.documentElement).appendChild(overlay);
        input.focus();
      });
    }
    async function setKey() {
      const input = await promptModal();
      if (!input) return;
      save(normalize(input));
      alert("\u{1F510} Plex API Key saved");
    }
    function clearKey() {
      GM_setValue(STORAGE_KEY, "");
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
      }
      alert("\u{1F510} Plex API Key cleared");
    }
    const api = { getKey, setKey, clearKey };
    window.PlexAPI = api;
    window.PlexAuth = api;
    try {
      unsafeWindow.PlexAuth = api;
    } catch {
    }
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("\u2699\uFE0F Set Plex API Key", setKey);
      GM_registerMenuCommand("\u{1F9F9} Clear Plex API Key", clearKey);
    }
  })();
})();
;(function(g){try{if(typeof LTPlexAuth!=='undefined'){g.LTPlexAuth=LTPlexAuth;}}catch(e){}})(typeof unsafeWindow!=='undefined'?unsafeWindow:window);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXBsZXgtYXV0aC51c2VyLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyA9PVVzZXJTY3JpcHQ9PVxuLy8gQG5hbWUgICAgICAgICBMVCBcdTIwM0EgUGxleCBBdXRoIEhlbHBlclxuLy8gQG5hbWVzcGFjZSAgICBodHRwczovL2dpdGh1Yi5jb20vQWxwaGFHZWVrNTA5L3BsZXgtdGFtcGVybW9ua2V5LXNjcmlwdHNcbi8vIEB2ZXJzaW9uICAgICAgMjAyNi4wNS4xOS41XG4vLyBAZGVzY3JpcHRpb24gIFNoYXJlZCBoZWxwZXIgZm9yIHN0b3JpbmcgYW5kIHJldHJpZXZpbmcgUGxleCBBUEkga2V5XG4vLyBAbWF0Y2ggICAgICAgIGh0dHBzOi8vKi5vbi5wbGV4LmNvbS8qXG4vLyBAbWF0Y2ggICAgICAgIGh0dHBzOi8vKi5wbGV4LmNvbS8qXG4vLyBAZ3JhbnQgICAgICAgIEdNX2dldFZhbHVlXG4vLyBAZ3JhbnQgICAgICAgIEdNX3NldFZhbHVlXG4vLyBAZ3JhbnQgICAgICAgIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmRcbi8vID09L1VzZXJTY3JpcHQ9PVxuXG4oZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IFNUT1JBR0VfS0VZID0gJ1BsZXhBcGlLZXknO1xuXG4gICAgZnVuY3Rpb24gbm9ybWFsaXplKHJhdykge1xuICAgICAgICBpZiAoIXJhdykgcmV0dXJuICcnO1xuICAgICAgICBpZiAoL14oQmFzaWN8QmVhcmVyKVxccy9pLnRlc3QocmF3KSkgcmV0dXJuIHJhdy50cmltKCk7XG4gICAgICAgIGlmICghcmF3LmluY2x1ZGVzKCc6JykpIHRocm93IG5ldyBFcnJvcignQ3JlZGVudGlhbHMgbXVzdCBiZSBpbiBcInVzZXJuYW1lOnBhc3N3b3JkXCIgZm9ybWF0Jyk7XG4gICAgICAgIC8vIFVuaWNvZGUtc2FmZSBiYXNlNjQgZW5jb2RpbmdcbiAgICAgICAgcmV0dXJuIGBCYXNpYyAke2J0b2EodW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHJhdy50cmltKCkpKSl9YDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzYXZlKHJhdykge1xuICAgICAgICBHTV9zZXRWYWx1ZShTVE9SQUdFX0tFWSwgcmF3KTtcbiAgICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9LRVksIHJhdyk7IH0gY2F0Y2ggeyB9XG4gICAgfVxuXG4gICAgLy8gXHUyNzA1IE5ldmVyIHByb21wdHMuIFJldHVybnMgc3RyaW5nIG9yICcnLlxuICAgIGZ1bmN0aW9uIGdldEtleSgpIHtcbiAgICAgICAgLy8gMSkgR00gc3RvcmUgKGF1dGhvcml0YXRpdmUpXG4gICAgICAgIGNvbnN0IHJhdyA9IEdNX2dldFZhbHVlKFNUT1JBR0VfS0VZLCAnJyk7XG4gICAgICAgIGlmIChyYXcpIHJldHVybiBub3JtYWxpemUocmF3KTtcblxuICAgICAgICAvLyAyKSBGYWxsYmFjayAvIG1pZ3JhdGlvbiBmcm9tIGxvY2FsU3RvcmFnZSAoc2hhcmVkIGFjcm9zcyBzY3JpcHRzKVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgbHMgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgfHwgJyc7XG4gICAgICAgICAgICBpZiAobHMpIHtcbiAgICAgICAgICAgICAgICBzYXZlKGxzKTsgICAgICAgICAgIC8vIHBvcHVsYXRlIHRoaXMgc2NyaXB0J3MgR00gbmFtZXNwYWNlOyBrZWVwIGxvY2FsU3RvcmFnZSBtaXJyb3JcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGxzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IH1cblxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJvbXB0TW9kYWwoKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgb3ZlcmxheS5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgICAgICAgICAgICdwb3NpdGlvbjpmaXhlZDtpbnNldDowO3otaW5kZXg6MjE0NzQ4MzY0NycsXG4gICAgICAgICAgICAgICAgJ2JhY2tncm91bmQ6cmdiYSgwLDAsMCwuNjUpJyxcbiAgICAgICAgICAgICAgICAnZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyJyxcbiAgICAgICAgICAgIF0uam9pbignOycpO1xuXG4gICAgICAgICAgICBjb25zdCBib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJveC5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgICAgICAgICAgICdiYWNrZ3JvdW5kOiMxZTFlMmU7Y29sb3I6I2NkZDZmNCcsXG4gICAgICAgICAgICAgICAgJ2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MjRweDttaW4td2lkdGg6MzgwcHg7bWF4LXdpZHRoOjkwdncnLFxuICAgICAgICAgICAgICAgICdmb250OjE0cHggc3lzdGVtLXVpLHNhbnMtc2VyaWYnLFxuICAgICAgICAgICAgICAgICdib3gtc2hhZG93OjAgOHB4IDMycHggcmdiYSgwLDAsMCwuNSknLFxuICAgICAgICAgICAgXS5qb2luKCc7Jyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGhlYWRpbmcudGV4dENvbnRlbnQgPSAnXHVEODNEXHVERDEwIFNldCBQbGV4IEFQSSBLZXknO1xuICAgICAgICAgICAgaGVhZGluZy5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtc2l6ZToxNnB4O2ZvbnQtd2VpZ2h0OjYwMDttYXJnaW4tYm90dG9tOjE2cHgnO1xuXG4gICAgICAgICAgICBjb25zdCBoaW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBoaW50LnRleHRDb250ZW50ID0gJ0VudGVyIHVzZXJuYW1lOnBhc3N3b3JkLCBvciBwYXN0ZSBhIGZ1bGwgQmFzaWMgPGJhc2U2ND4gb3IgQmVhcmVyIDx0b2tlbj4gc3RyaW5nLic7XG4gICAgICAgICAgICBoaW50LnN0eWxlLmNzc1RleHQgPSAnZm9udC1zaXplOjEycHg7Y29sb3I6I2E2YWRjODttYXJnaW4tYm90dG9tOjEwcHgnO1xuXG4gICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG4gICAgICAgICAgICBpbnB1dC50eXBlID0gJ3Bhc3N3b3JkJztcbiAgICAgICAgICAgIGlucHV0LnBsYWNlaG9sZGVyID0gJ3VzZXJuYW1lOnBhc3N3b3JkJztcbiAgICAgICAgICAgIGlucHV0LmF1dG9jb21wbGV0ZSA9ICdjdXJyZW50LXBhc3N3b3JkJztcbiAgICAgICAgICAgIGlucHV0LnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICAgICAgICAgICAgJ3dpZHRoOjEwMCU7Ym94LXNpemluZzpib3JkZXItYm94JyxcbiAgICAgICAgICAgICAgICAnYmFja2dyb3VuZDojMzEzMjQ0O2NvbG9yOiNjZGQ2ZjQ7Ym9yZGVyOjFweCBzb2xpZCAjNDU0NzVhJyxcbiAgICAgICAgICAgICAgICAnYm9yZGVyLXJhZGl1czo0cHg7cGFkZGluZzo4cHggMTBweDtmb250LXNpemU6MTNweDttYXJnaW4tYm90dG9tOjZweCcsXG4gICAgICAgICAgICBdLmpvaW4oJzsnKTtcblxuICAgICAgICAgICAgY29uc3QgZXJyTXNnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBlcnJNc2cuc3R5bGUuY3NzVGV4dCA9ICdjb2xvcjojZjM4YmE4O2ZvbnQtc2l6ZToxMnB4O21pbi1oZWlnaHQ6MThweDttYXJnaW4tYm90dG9tOjEwcHgnO1xuXG4gICAgICAgICAgICBjb25zdCBidG5Sb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGJ0blJvdy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtnYXA6OHB4O2p1c3RpZnktY29udGVudDpmbGV4LWVuZCc7XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbmNlbEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICAgICAgY2FuY2VsQnRuLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIGNhbmNlbEJ0bi50ZXh0Q29udGVudCA9ICdDYW5jZWwnO1xuICAgICAgICAgICAgY2FuY2VsQnRuLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICAgICAgICAgICAgJ3BhZGRpbmc6NnB4IDE2cHg7Ym9yZGVyLXJhZGl1czo0cHgnLFxuICAgICAgICAgICAgICAgICdib3JkZXI6MXB4IHNvbGlkICM0NTQ3NWE7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjojY2RkNmY0O2N1cnNvcjpwb2ludGVyJyxcbiAgICAgICAgICAgIF0uam9pbignOycpO1xuXG4gICAgICAgICAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICBzYXZlQnRuLnR5cGUgPSAnYnV0dG9uJztcbiAgICAgICAgICAgIHNhdmVCdG4udGV4dENvbnRlbnQgPSAnU2F2ZSc7XG4gICAgICAgICAgICBzYXZlQnRuLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICAgICAgICAgICAgJ3BhZGRpbmc6NnB4IDE2cHg7Ym9yZGVyLXJhZGl1czo0cHgnLFxuICAgICAgICAgICAgICAgICdib3JkZXI6bm9uZTtiYWNrZ3JvdW5kOiM4OWI0ZmE7Y29sb3I6IzFlMWUyZTtjdXJzb3I6cG9pbnRlcjtmb250LXdlaWdodDo2MDAnLFxuICAgICAgICAgICAgXS5qb2luKCc7Jyk7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHNob3dFcnJvcihtc2cpIHsgZXJyTXNnLnRleHRDb250ZW50ID0gbXNnIHx8ICcnOyB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGRpc21pc3ModmFsdWUpIHsgb3ZlcmxheS5yZW1vdmUoKTsgcmVzb2x2ZSh2YWx1ZSA/PyBudWxsKTsgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBhdHRlbXB0U2F2ZSgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSBpbnB1dC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICAgICAgaWYgKCF2YWwpIHsgc2hvd0Vycm9yKCdQbGVhc2UgZW50ZXIgeW91ciBjcmVkZW50aWFscy4nKTsgcmV0dXJuOyB9XG4gICAgICAgICAgICAgICAgdHJ5IHsgbm9ybWFsaXplKHZhbCk7IH0gY2F0Y2ggKGUpIHsgc2hvd0Vycm9yKGUubWVzc2FnZSk7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgIGRpc21pc3ModmFsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gZGlzbWlzcyhudWxsKSk7XG4gICAgICAgICAgICBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXR0ZW1wdFNhdmUpO1xuICAgICAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSBhdHRlbXB0U2F2ZSgpO1xuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIGRpc21pc3MobnVsbCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4geyBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIGRpc21pc3MobnVsbCk7IH0pO1xuXG4gICAgICAgICAgICBidG5Sb3cuYXBwZW5kKGNhbmNlbEJ0biwgc2F2ZUJ0bik7XG4gICAgICAgICAgICBib3guYXBwZW5kKGhlYWRpbmcsIGhpbnQsIGlucHV0LCBlcnJNc2csIGJ0blJvdyk7XG4gICAgICAgICAgICBvdmVybGF5LmFwcGVuZENoaWxkKGJveCk7XG4gICAgICAgICAgICAoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuICAgICAgICAgICAgaW5wdXQuZm9jdXMoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gc2V0S2V5KCkge1xuICAgICAgICBjb25zdCBpbnB1dCA9IGF3YWl0IHByb21wdE1vZGFsKCk7XG4gICAgICAgIGlmICghaW5wdXQpIHJldHVybjtcbiAgICAgICAgc2F2ZShub3JtYWxpemUoaW5wdXQpKTtcbiAgICAgICAgYWxlcnQoJ1x1RDgzRFx1REQxMCBQbGV4IEFQSSBLZXkgc2F2ZWQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhcktleSgpIHtcbiAgICAgICAgR01fc2V0VmFsdWUoU1RPUkFHRV9LRVksICcnKTtcbiAgICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9LRVkpOyB9IGNhdGNoIHsgfVxuICAgICAgICBhbGVydCgnXHVEODNEXHVERDEwIFBsZXggQVBJIEtleSBjbGVhcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgYXBpID0geyBnZXRLZXksIHNldEtleSwgY2xlYXJLZXkgfTtcbiAgICB3aW5kb3cuUGxleEFQSSA9IGFwaTtcbiAgICB3aW5kb3cuUGxleEF1dGggPSBhcGk7XG4gICAgdHJ5IHsgdW5zYWZlV2luZG93LlBsZXhBdXRoID0gYXBpOyB9IGNhdGNoIHsgfVxuXG4gICAgaWYgKHR5cGVvZiBHTV9yZWdpc3Rlck1lbnVDb21tYW5kID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQoJ1x1MjY5OVx1RkUwRiBTZXQgUGxleCBBUEkgS2V5Jywgc2V0S2V5KTtcbiAgICAgICAgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCgnXHVEODNFXHVEREY5IENsZWFyIFBsZXggQVBJIEtleScsIGNsZWFyS2V5KTtcbiAgICB9XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFZQSxHQUFDLFdBQVk7QUFDVCxVQUFNLGNBQWM7QUFFcEIsYUFBUyxVQUFVLEtBQUs7QUFDcEIsVUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixVQUFJLHFCQUFxQixLQUFLLEdBQUcsRUFBRyxRQUFPLElBQUksS0FBSztBQUNwRCxVQUFJLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRyxPQUFNLElBQUksTUFBTSxtREFBbUQ7QUFFM0YsYUFBTyxTQUFTLEtBQUssU0FBUyxtQkFBbUIsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUNsRTtBQUVBLGFBQVMsS0FBSyxLQUFLO0FBQ2Ysa0JBQVksYUFBYSxHQUFHO0FBQzVCLFVBQUk7QUFBRSxxQkFBYSxRQUFRLGFBQWEsR0FBRztBQUFBLE1BQUcsUUFBUTtBQUFBLE1BQUU7QUFBQSxJQUM1RDtBQUdBLGFBQVMsU0FBUztBQUVkLFlBQU0sTUFBTSxZQUFZLGFBQWEsRUFBRTtBQUN2QyxVQUFJLElBQUssUUFBTyxVQUFVLEdBQUc7QUFHN0IsVUFBSTtBQUNBLGNBQU0sS0FBSyxhQUFhLFFBQVEsV0FBVyxLQUFLO0FBQ2hELFlBQUksSUFBSTtBQUNKLGVBQUssRUFBRTtBQUNQLGlCQUFPLFVBQVUsRUFBRTtBQUFBLFFBQ3ZCO0FBQUEsTUFDSixRQUFRO0FBQUEsTUFBRTtBQUVWLGFBQU87QUFBQSxJQUNYO0FBRUEsYUFBUyxjQUFjO0FBQ25CLGFBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM1QixjQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsZ0JBQVEsTUFBTSxVQUFVO0FBQUEsVUFDcEI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0osRUFBRSxLQUFLLEdBQUc7QUFFVixjQUFNLE1BQU0sU0FBUyxjQUFjLEtBQUs7QUFDeEMsWUFBSSxNQUFNLFVBQVU7QUFBQSxVQUNoQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0osRUFBRSxLQUFLLEdBQUc7QUFFVixjQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsZ0JBQVEsY0FBYztBQUN0QixnQkFBUSxNQUFNLFVBQVU7QUFFeEIsY0FBTSxPQUFPLFNBQVMsY0FBYyxLQUFLO0FBQ3pDLGFBQUssY0FBYztBQUNuQixhQUFLLE1BQU0sVUFBVTtBQUVyQixjQUFNLFFBQVEsU0FBUyxjQUFjLE9BQU87QUFDNUMsY0FBTSxPQUFPO0FBQ2IsY0FBTSxjQUFjO0FBQ3BCLGNBQU0sZUFBZTtBQUNyQixjQUFNLE1BQU0sVUFBVTtBQUFBLFVBQ2xCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNKLEVBQUUsS0FBSyxHQUFHO0FBRVYsY0FBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLGVBQU8sTUFBTSxVQUFVO0FBRXZCLGNBQU0sU0FBUyxTQUFTLGNBQWMsS0FBSztBQUMzQyxlQUFPLE1BQU0sVUFBVTtBQUV2QixjQUFNLFlBQVksU0FBUyxjQUFjLFFBQVE7QUFDakQsa0JBQVUsT0FBTztBQUNqQixrQkFBVSxjQUFjO0FBQ3hCLGtCQUFVLE1BQU0sVUFBVTtBQUFBLFVBQ3RCO0FBQUEsVUFDQTtBQUFBLFFBQ0osRUFBRSxLQUFLLEdBQUc7QUFFVixjQUFNLFVBQVUsU0FBUyxjQUFjLFFBQVE7QUFDL0MsZ0JBQVEsT0FBTztBQUNmLGdCQUFRLGNBQWM7QUFDdEIsZ0JBQVEsTUFBTSxVQUFVO0FBQUEsVUFDcEI7QUFBQSxVQUNBO0FBQUEsUUFDSixFQUFFLEtBQUssR0FBRztBQUVWLGlCQUFTLFVBQVUsS0FBSztBQUFFLGlCQUFPLGNBQWMsT0FBTztBQUFBLFFBQUk7QUFFMUQsaUJBQVMsUUFBUSxPQUFPO0FBQUUsa0JBQVEsT0FBTztBQUFHLGtCQUFRLFNBQVMsSUFBSTtBQUFBLFFBQUc7QUFFcEUsaUJBQVMsY0FBYztBQUNuQixnQkFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQzdCLGNBQUksQ0FBQyxLQUFLO0FBQUUsc0JBQVUsZ0NBQWdDO0FBQUc7QUFBQSxVQUFRO0FBQ2pFLGNBQUk7QUFBRSxzQkFBVSxHQUFHO0FBQUEsVUFBRyxTQUFTLEdBQUc7QUFBRSxzQkFBVSxFQUFFLE9BQU87QUFBRztBQUFBLFVBQVE7QUFDbEUsa0JBQVEsR0FBRztBQUFBLFFBQ2Y7QUFFQSxrQkFBVSxpQkFBaUIsU0FBUyxNQUFNLFFBQVEsSUFBSSxDQUFDO0FBQ3ZELGdCQUFRLGlCQUFpQixTQUFTLFdBQVc7QUFDN0MsY0FBTSxpQkFBaUIsV0FBVyxDQUFDLE1BQU07QUFDckMsY0FBSSxFQUFFLFFBQVEsUUFBUyxhQUFZO0FBQ25DLGNBQUksRUFBRSxRQUFRLFNBQVUsU0FBUSxJQUFJO0FBQUEsUUFDeEMsQ0FBQztBQUNELGdCQUFRLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUFFLGNBQUksRUFBRSxXQUFXLFFBQVMsU0FBUSxJQUFJO0FBQUEsUUFBRyxDQUFDO0FBRXJGLGVBQU8sT0FBTyxXQUFXLE9BQU87QUFDaEMsWUFBSSxPQUFPLFNBQVMsTUFBTSxPQUFPLFFBQVEsTUFBTTtBQUMvQyxnQkFBUSxZQUFZLEdBQUc7QUFDdkIsU0FBQyxTQUFTLFFBQVEsU0FBUyxpQkFBaUIsWUFBWSxPQUFPO0FBQy9ELGNBQU0sTUFBTTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNMO0FBRUEsbUJBQWUsU0FBUztBQUNwQixZQUFNLFFBQVEsTUFBTSxZQUFZO0FBQ2hDLFVBQUksQ0FBQyxNQUFPO0FBQ1osV0FBSyxVQUFVLEtBQUssQ0FBQztBQUNyQixZQUFNLDhCQUF1QjtBQUFBLElBQ2pDO0FBRUEsYUFBUyxXQUFXO0FBQ2hCLGtCQUFZLGFBQWEsRUFBRTtBQUMzQixVQUFJO0FBQUUscUJBQWEsV0FBVyxXQUFXO0FBQUEsTUFBRyxRQUFRO0FBQUEsTUFBRTtBQUN0RCxZQUFNLGdDQUF5QjtBQUFBLElBQ25DO0FBRUEsVUFBTSxNQUFNLEVBQUUsUUFBUSxRQUFRLFNBQVM7QUFDdkMsV0FBTyxVQUFVO0FBQ2pCLFdBQU8sV0FBVztBQUNsQixRQUFJO0FBQUUsbUJBQWEsV0FBVztBQUFBLElBQUssUUFBUTtBQUFBLElBQUU7QUFFN0MsUUFBSSxPQUFPLDJCQUEyQixZQUFZO0FBQzlDLDZCQUF1QixpQ0FBdUIsTUFBTTtBQUNwRCw2QkFBdUIsZ0NBQXlCLFFBQVE7QUFBQSxJQUM1RDtBQUFBLEVBQ0osR0FBRzsiLAogICJuYW1lcyI6IFtdCn0K
