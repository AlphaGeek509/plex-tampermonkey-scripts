(() => {
  // tm-scripts/src/shared/lt-plex-auth.user.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vdG0tc2NyaXB0cy9zcmMvc2hhcmVkL2x0LXBsZXgtYXV0aC51c2VyLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyA9PVVzZXJTY3JpcHQ9PVxuLy8gQG5hbWUgICAgICAgICBMVCBcdTIwM0EgUGxleCBBdXRoIEhlbHBlclxuLy8gQG5hbWVzcGFjZSAgICBodHRwczovL2dpdGh1Yi5jb20vQWxwaGFHZWVrNTA5L3BsZXgtdGFtcGVybW9ua2V5LXNjcmlwdHNcbi8vIEB2ZXJzaW9uICAgICAgMjAyNi4wNS4xOS4yMVxuLy8gQGRlc2NyaXB0aW9uICBTaGFyZWQgaGVscGVyIGZvciBzdG9yaW5nIGFuZCByZXRyaWV2aW5nIFBsZXggQVBJIGtleVxuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoub24ucGxleC5jb20vKlxuLy8gQG1hdGNoICAgICAgICBodHRwczovLyoucGxleC5jb20vKlxuLy8gQGdyYW50ICAgICAgICBHTV9nZXRWYWx1ZVxuLy8gQGdyYW50ICAgICAgICBHTV9zZXRWYWx1ZVxuLy8gQGdyYW50ICAgICAgICBHTV9yZWdpc3Rlck1lbnVDb21tYW5kXG4vLyA9PS9Vc2VyU2NyaXB0PT1cblxuKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBTVE9SQUdFX0tFWSA9ICdQbGV4QXBpS2V5JztcblxuICAgIGZ1bmN0aW9uIG5vcm1hbGl6ZShyYXcpIHtcbiAgICAgICAgaWYgKCFyYXcpIHJldHVybiAnJztcbiAgICAgICAgaWYgKC9eKEJhc2ljfEJlYXJlcilcXHMvaS50ZXN0KHJhdykpIHJldHVybiByYXcudHJpbSgpO1xuICAgICAgICBpZiAoIXJhdy5pbmNsdWRlcygnOicpKSB0aHJvdyBuZXcgRXJyb3IoJ0NyZWRlbnRpYWxzIG11c3QgYmUgaW4gXCJ1c2VybmFtZTpwYXNzd29yZFwiIGZvcm1hdCcpO1xuICAgICAgICAvLyBVbmljb2RlLXNhZmUgYmFzZTY0IGVuY29kaW5nXG4gICAgICAgIHJldHVybiBgQmFzaWMgJHtidG9hKHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChyYXcudHJpbSgpKSkpfWA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2F2ZShyYXcpIHtcbiAgICAgICAgR01fc2V0VmFsdWUoU1RPUkFHRV9LRVksIHJhdyk7XG4gICAgICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCByYXcpOyB9IGNhdGNoIHsgfVxuICAgIH1cblxuICAgIC8vIFx1MjcwNSBOZXZlciBwcm9tcHRzLiBSZXR1cm5zIHN0cmluZyBvciAnJy5cbiAgICBmdW5jdGlvbiBnZXRLZXkoKSB7XG4gICAgICAgIC8vIDEpIEdNIHN0b3JlIChhdXRob3JpdGF0aXZlKVxuICAgICAgICBjb25zdCByYXcgPSBHTV9nZXRWYWx1ZShTVE9SQUdFX0tFWSwgJycpO1xuICAgICAgICBpZiAocmF3KSByZXR1cm4gbm9ybWFsaXplKHJhdyk7XG5cbiAgICAgICAgLy8gMikgRmFsbGJhY2sgLyBtaWdyYXRpb24gZnJvbSBsb2NhbFN0b3JhZ2UgKHNoYXJlZCBhY3Jvc3Mgc2NyaXB0cylcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGxzID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpIHx8ICcnO1xuICAgICAgICAgICAgaWYgKGxzKSB7XG4gICAgICAgICAgICAgICAgc2F2ZShscyk7ICAgICAgICAgICAvLyBwb3B1bGF0ZSB0aGlzIHNjcmlwdCdzIEdNIG5hbWVzcGFjZTsga2VlcCBsb2NhbFN0b3JhZ2UgbWlycm9yXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShscyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyB9XG5cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb21wdE1vZGFsKCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIG92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9IFtcbiAgICAgICAgICAgICAgICAncG9zaXRpb246Zml4ZWQ7aW5zZXQ6MDt6LWluZGV4OjIxNDc0ODM2NDcnLFxuICAgICAgICAgICAgICAgICdiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsLjY1KScsXG4gICAgICAgICAgICAgICAgJ2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcicsXG4gICAgICAgICAgICBdLmpvaW4oJzsnKTtcblxuICAgICAgICAgICAgY29uc3QgYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBib3guc3R5bGUuY3NzVGV4dCA9IFtcbiAgICAgICAgICAgICAgICAnYmFja2dyb3VuZDojMWUxZTJlO2NvbG9yOiNjZGQ2ZjQnLFxuICAgICAgICAgICAgICAgICdib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjI0cHg7bWluLXdpZHRoOjM4MHB4O21heC13aWR0aDo5MHZ3JyxcbiAgICAgICAgICAgICAgICAnZm9udDoxNHB4IHN5c3RlbS11aSxzYW5zLXNlcmlmJyxcbiAgICAgICAgICAgICAgICAnYm94LXNoYWRvdzowIDhweCAzMnB4IHJnYmEoMCwwLDAsLjUpJyxcbiAgICAgICAgICAgIF0uam9pbignOycpO1xuXG4gICAgICAgICAgICBjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBoZWFkaW5nLnRleHRDb250ZW50ID0gJ1x1RDgzRFx1REQxMCBTZXQgUGxleCBBUEkgS2V5JztcbiAgICAgICAgICAgIGhlYWRpbmcuc3R5bGUuY3NzVGV4dCA9ICdmb250LXNpemU6MTZweDtmb250LXdlaWdodDo2MDA7bWFyZ2luLWJvdHRvbToxNnB4JztcblxuICAgICAgICAgICAgY29uc3QgaGludCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgaGludC50ZXh0Q29udGVudCA9ICdFbnRlciB1c2VybmFtZTpwYXNzd29yZCwgb3IgcGFzdGUgYSBmdWxsIEJhc2ljIDxiYXNlNjQ+IG9yIEJlYXJlciA8dG9rZW4+IHN0cmluZy4nO1xuICAgICAgICAgICAgaGludC5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtc2l6ZToxMnB4O2NvbG9yOiNhNmFkYzg7bWFyZ2luLWJvdHRvbToxMHB4JztcblxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgICAgaW5wdXQudHlwZSA9ICdwYXNzd29yZCc7XG4gICAgICAgICAgICBpbnB1dC5wbGFjZWhvbGRlciA9ICd1c2VybmFtZTpwYXNzd29yZCc7XG4gICAgICAgICAgICBpbnB1dC5hdXRvY29tcGxldGUgPSAnY3VycmVudC1wYXNzd29yZCc7XG4gICAgICAgICAgICBpbnB1dC5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgICAgICAgICAgICd3aWR0aDoxMDAlO2JveC1zaXppbmc6Ym9yZGVyLWJveCcsXG4gICAgICAgICAgICAgICAgJ2JhY2tncm91bmQ6IzMxMzI0NDtjb2xvcjojY2RkNmY0O2JvcmRlcjoxcHggc29saWQgIzQ1NDc1YScsXG4gICAgICAgICAgICAgICAgJ2JvcmRlci1yYWRpdXM6NHB4O3BhZGRpbmc6OHB4IDEwcHg7Zm9udC1zaXplOjEzcHg7bWFyZ2luLWJvdHRvbTo2cHgnLFxuICAgICAgICAgICAgXS5qb2luKCc7Jyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGVyck1zZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgZXJyTXNnLnN0eWxlLmNzc1RleHQgPSAnY29sb3I6I2YzOGJhODtmb250LXNpemU6MTJweDttaW4taGVpZ2h0OjE4cHg7bWFyZ2luLWJvdHRvbToxMHB4JztcblxuICAgICAgICAgICAgY29uc3QgYnRuUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBidG5Sb3cuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7Z2FwOjhweDtqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQnO1xuXG4gICAgICAgICAgICBjb25zdCBjYW5jZWxCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIGNhbmNlbEJ0bi50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICBjYW5jZWxCdG4udGV4dENvbnRlbnQgPSAnQ2FuY2VsJztcbiAgICAgICAgICAgIGNhbmNlbEJ0bi5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgICAgICAgICAgICdwYWRkaW5nOjZweCAxNnB4O2JvcmRlci1yYWRpdXM6NHB4JyxcbiAgICAgICAgICAgICAgICAnYm9yZGVyOjFweCBzb2xpZCAjNDU0NzVhO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6I2NkZDZmNDtjdXJzb3I6cG9pbnRlcicsXG4gICAgICAgICAgICBdLmpvaW4oJzsnKTtcblxuICAgICAgICAgICAgY29uc3Qgc2F2ZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICAgICAgc2F2ZUJ0bi50eXBlID0gJ2J1dHRvbic7XG4gICAgICAgICAgICBzYXZlQnRuLnRleHRDb250ZW50ID0gJ1NhdmUnO1xuICAgICAgICAgICAgc2F2ZUJ0bi5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgICAgICAgICAgICdwYWRkaW5nOjZweCAxNnB4O2JvcmRlci1yYWRpdXM6NHB4JyxcbiAgICAgICAgICAgICAgICAnYm9yZGVyOm5vbmU7YmFja2dyb3VuZDojODliNGZhO2NvbG9yOiMxZTFlMmU7Y3Vyc29yOnBvaW50ZXI7Zm9udC13ZWlnaHQ6NjAwJyxcbiAgICAgICAgICAgIF0uam9pbignOycpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBzaG93RXJyb3IobXNnKSB7IGVyck1zZy50ZXh0Q29udGVudCA9IG1zZyB8fCAnJzsgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBkaXNtaXNzKHZhbHVlKSB7IG92ZXJsYXkucmVtb3ZlKCk7IHJlc29sdmUodmFsdWUgPz8gbnVsbCk7IH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gYXR0ZW1wdFNhdmUoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICghdmFsKSB7IHNob3dFcnJvcignUGxlYXNlIGVudGVyIHlvdXIgY3JlZGVudGlhbHMuJyk7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgIHRyeSB7IG5vcm1hbGl6ZSh2YWwpOyB9IGNhdGNoIChlKSB7IHNob3dFcnJvcihlLm1lc3NhZ2UpOyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICBkaXNtaXNzKHZhbCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGRpc21pc3MobnVsbCkpO1xuICAgICAgICAgICAgc2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGF0dGVtcHRTYXZlKTtcbiAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykgYXR0ZW1wdFNhdmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSBkaXNtaXNzKG51bGwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBvdmVybGF5KSBkaXNtaXNzKG51bGwpOyB9KTtcblxuICAgICAgICAgICAgYnRuUm93LmFwcGVuZChjYW5jZWxCdG4sIHNhdmVCdG4pO1xuICAgICAgICAgICAgYm94LmFwcGVuZChoZWFkaW5nLCBoaW50LCBpbnB1dCwgZXJyTXNnLCBidG5Sb3cpO1xuICAgICAgICAgICAgb3ZlcmxheS5hcHBlbmRDaGlsZChib3gpO1xuICAgICAgICAgICAgKGRvY3VtZW50LmJvZHkgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChvdmVybGF5KTtcbiAgICAgICAgICAgIGlucHV0LmZvY3VzKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIHNldEtleSgpIHtcbiAgICAgICAgY29uc3QgaW5wdXQgPSBhd2FpdCBwcm9tcHRNb2RhbCgpO1xuICAgICAgICBpZiAoIWlucHV0KSByZXR1cm47XG4gICAgICAgIHNhdmUobm9ybWFsaXplKGlucHV0KSk7XG4gICAgICAgIGFsZXJ0KCdcdUQ4M0RcdUREMTAgUGxleCBBUEkgS2V5IHNhdmVkJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJLZXkoKSB7XG4gICAgICAgIEdNX3NldFZhbHVlKFNUT1JBR0VfS0VZLCAnJyk7XG4gICAgICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTsgfSBjYXRjaCB7IH1cbiAgICAgICAgYWxlcnQoJ1x1RDgzRFx1REQxMCBQbGV4IEFQSSBLZXkgY2xlYXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGFwaSA9IHsgZ2V0S2V5LCBzZXRLZXksIGNsZWFyS2V5IH07XG4gICAgd2luZG93LlBsZXhBUEkgPSBhcGk7XG4gICAgd2luZG93LlBsZXhBdXRoID0gYXBpO1xuICAgIHRyeSB7IHVuc2FmZVdpbmRvdy5QbGV4QXV0aCA9IGFwaTsgfSBjYXRjaCB7IH1cblxuICAgIGlmICh0eXBlb2YgR01fcmVnaXN0ZXJNZW51Q29tbWFuZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBHTV9yZWdpc3Rlck1lbnVDb21tYW5kKCdcdTI2OTlcdUZFMEYgU2V0IFBsZXggQVBJIEtleScsIHNldEtleSk7XG4gICAgICAgIEdNX3JlZ2lzdGVyTWVudUNvbW1hbmQoJ1x1RDgzRVx1RERGOSBDbGVhciBQbGV4IEFQSSBLZXknLCBjbGVhcktleSk7XG4gICAgfVxufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBWUEsR0FBQyxXQUFZO0FBQ1QsVUFBTSxjQUFjO0FBRXBCLGFBQVMsVUFBVSxLQUFLO0FBQ3BCLFVBQUksQ0FBQyxJQUFLLFFBQU87QUFDakIsVUFBSSxxQkFBcUIsS0FBSyxHQUFHLEVBQUcsUUFBTyxJQUFJLEtBQUs7QUFDcEQsVUFBSSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUcsT0FBTSxJQUFJLE1BQU0sbURBQW1EO0FBRTNGLGFBQU8sU0FBUyxLQUFLLFNBQVMsbUJBQW1CLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDbEU7QUFFQSxhQUFTLEtBQUssS0FBSztBQUNmLGtCQUFZLGFBQWEsR0FBRztBQUM1QixVQUFJO0FBQUUscUJBQWEsUUFBUSxhQUFhLEdBQUc7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUFFO0FBQUEsSUFDNUQ7QUFHQSxhQUFTLFNBQVM7QUFFZCxZQUFNLE1BQU0sWUFBWSxhQUFhLEVBQUU7QUFDdkMsVUFBSSxJQUFLLFFBQU8sVUFBVSxHQUFHO0FBRzdCLFVBQUk7QUFDQSxjQUFNLEtBQUssYUFBYSxRQUFRLFdBQVcsS0FBSztBQUNoRCxZQUFJLElBQUk7QUFDSixlQUFLLEVBQUU7QUFDUCxpQkFBTyxVQUFVLEVBQUU7QUFBQSxRQUN2QjtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQUU7QUFFVixhQUFPO0FBQUEsSUFDWDtBQUVBLGFBQVMsY0FBYztBQUNuQixhQUFPLElBQUksUUFBUSxDQUFDLFlBQVk7QUFDNUIsY0FBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLGdCQUFRLE1BQU0sVUFBVTtBQUFBLFVBQ3BCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNKLEVBQUUsS0FBSyxHQUFHO0FBRVYsY0FBTSxNQUFNLFNBQVMsY0FB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
