// Polyfills GM_* APIs so built userscripts can run outside TamperMonkey.
// Injected via page.addInitScript() before any script content.
const gmPolyfill = `
  window.unsafeWindow = window;

  window.GM_getValue = (key, def) => {
    try {
      const v = localStorage.getItem('GM_' + key);
      return v !== null ? JSON.parse(v) : def;
    } catch { return def; }
  };

  window.GM_setValue = (key, val) => {
    try { localStorage.setItem('GM_' + key, JSON.stringify(val)); } catch {}
  };

  window.GM_registerMenuCommand = () => {};

  window.GM_xmlhttpRequest = ({ method = 'GET', url, headers, data, onload, onerror }) => {
    fetch(url, { method, headers, body: data })
      .then(r => r.text().then(t => onload?.({ status: r.status, responseText: t })))
      .catch(e => onerror?.(e));
  };
`;

module.exports = { gmPolyfill };
