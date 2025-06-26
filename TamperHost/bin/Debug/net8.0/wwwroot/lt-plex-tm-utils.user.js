// ==UserScript==
// @name         TM-Utils
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Shared helper: API-key fetch, messaging, DOM observers
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/*––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––*/
// 1) API-key helper
async function getApiKey() {
  try {
    const key = await PlexAPI.getKey();
    if (!key) throw new Error('No API key');
    return key;
  } catch (e) {
    console.error('LT-Plex-TM-Utils ▶️ getApiKey failed', e);
    throw e;
  }
}

/*––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––*/
// 2) Floating message UI
function hideMessage() {
  document.getElementById('tm-msg')?.remove();
}
function showMessage(text, { type = 'info', autoClear = 4000 } = {}) {
  hideMessage();
  const colors = {
    info:    { bg: '#d9edf7', fg: '#31708f' },
    success: { bg: '#dff0d8', fg: '#3c763d' },
    warning: { bg: '#fcf8e3', fg: '#8a6d3b' },
    error:   { bg: '#f2dede', fg: '#a94442' }
  }[type] || colors.info;
  const box = document.createElement('div');
  box.id = 'tm-msg';
  Object.assign(box.style, {
    position:       'fixed',
    top:            '10px',
    right:          '10px',
    padding:        '8px 12px',
    backgroundColor: colors.bg,
    color:          colors.fg,
    border:         `1px solid ${colors.fg}`,
    borderRadius:   '4px',
    boxShadow:      '0 2px 6px rgba(0,0,0,0.2)',
    zIndex:         10000,
    fontSize:       '0.9em',
    maxWidth:       '80%',
    whiteSpace:     'pre-line'
  });
  box.textContent = text;
  document.body.appendChild(box);
  if (autoClear) setTimeout(hideMessage, autoClear);
}

/*––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––*/
// 3) Simple DOM-insert observer
function observeInsert(selector, fn) {
  const obs = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (el) {
      obs.disconnect();
      fn(el);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  // in case it’s already there:
  const existing = document.querySelector(selector);
  if (existing) {
    obs.disconnect();
    fn(existing);
  }
}

// expose to global
window.TMUtils = { getApiKey, showMessage, hideMessage, observeInsert };
