// ==UserScript==
// @downloadURL https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT20-PartDetail-GetStockLevels.user.js  
// @updateURL   https://raw.githubusercontent.com/AlphaGeek509/plex-tampermonkey-scripts/master/QT20-PartDetail-GetStockLevels.user.js
// @name         QT20 > Part Detail > Get Stock Levels
// @namespace    http://tampermonkey.net/
// @version      2.0.3
// @description  Inject “Get Stock Levels” button only in 'Quote Part Detail' modal, use Plex API 172, show banners, and update Note text
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard*
// @require      https://gist.githubusercontent.com/AlphaGeek509/c8a8aec394d2906fcc559dd70b679786/raw/871917c17a169d2ee839b2e1050eb0c71d431440/lt-plex-tm-utils.user.js
// @require      https://gist.githubusercontent.com/AlphaGeek509/1f0b6287c1f0e7e97cac1d079bd0935b/raw/78d3ea2f4829b51e8676d57affcd26ed5d917325/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  function injectStockButtonOnQuotePartDetailModal(ul) {
    const modal = ul.closest('.plex-dialog');
    const title = modal?.querySelector('.plex-dialog-title')?.textContent?.trim();

    if (title !== 'Quote Part Detail') return;
    if (ul.dataset.stockInjected) return;

    ul.dataset.stockInjected = '1';
    console.log('🔌 Injecting LT Get Stock Levels button');

    const li = document.createElement('li');
    const btn = document.createElement('a');
    btn.href = 'javascript:void(0)';
    btn.textContent = 'LT Get Stock Levels';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', async () => {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
      try {
        TMUtils.showMessage('⏳ Fetching stock levels…', { type: 'info', autoClear: false });

        const apiKey = await TMUtils.getApiKey();
        if (!apiKey) throw 'No API Key configured';

        const ta = document.querySelector('textarea[name="NoteNew"]');
        if (!ta) throw 'NoteNew textarea not found';

        const ctx = ko.contextFor(ta);
        if (!ctx) throw 'Knockout context not found';

        const setter = plex.data.getObservableOrValue(ctx.$root.data, 'NoteNew');
        if (typeof setter !== 'function') throw 'NoteNew not writable';

        const partNo = ko.unwrap(ctx.$root.data.PartNo);
        if (!partNo) throw 'PartNo not available';

        const url = `${location.origin}/api/datasources/172/execute?format=2`;
        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': apiKey
          },
          body: JSON.stringify({ Part_No: partNo, Shippable: 'TRUE', Container_Status: 'OK' })
        });

        if (!resp.ok) throw `API error ${resp.status}`;
        const data = await resp.json();

        const qtySum = (data.rows || []).reduce((sum, r) => sum + (Number(r.Quantity) || 0), 0);
        const formatted = qtySum.toLocaleString('en-US', { maximumFractionDigits: 0 });

        const existing = (ko.unwrap(ctx.$root.data.NoteNew) || '').replace(/STK:\s*[\d,]+\s*$/m, '').trim();
        const newNote = existing ? `${existing} STK: ${formatted}` : `STK: ${formatted}`;

        setter(newNote);
        TMUtils.showMessage(`✅ STK: ${formatted}`, { type: 'success' });
      } catch (err) {
        console.error('Stock Level error:', err);
        TMUtils.showMessage(`❌ ${err}`, { type: 'error', autoClear: 7500 });
      } finally {
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
      }
    });

    li.appendChild(btn);
    ul.appendChild(li);
    console.log('✔️ Button injected into Quote Part Detail modal');
  }

  // Initial injection (in case modal already open)
  document.querySelectorAll(
    '.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions'
  ).forEach(injectStockButtonOnQuotePartDetailModal);

  // Observe for future modals
  new MutationObserver(() => {
    document.querySelectorAll(
      '.plex-dialog-has-buttons .plex-actions-wrapper ul.plex-actions'
    ).forEach(injectStockButtonOnQuotePartDetailModal);
  }).observe(document.body, { childList: true, subtree: true });
})();
