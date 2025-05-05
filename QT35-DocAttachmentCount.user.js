// ==UserScript==
// @name         QT35 › Doc Attachment Count
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Inject read-only "Attachment (N)" label next to LT Apply Catalog Pricing button (Datasource 11713), polling until fetched
// @match        *://*.plex.com/SalesAndCrm/QuoteWizard*
// @require      https://gist.githubusercontent.com/AlphaGeek509/c8a8aec394d2906fcc559dd70b679786/raw/871917c17a169d2ee839b2e1050eb0c71d431440/lt-plex-tm-utils.user.js
// @require      https://gist.githubusercontent.com/AlphaGeek509/1f0b6287c1f0e7e97cac1d079bd0935b/raw/78d3ea2f4829b51e8676d57affcd26ed5d917325/lt-plex-auth.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(async function(window) {
    'use strict';
    console.log('🚀 QT35 › Doc Attachment Count loaded');

    // 1) Retrieve PlexAPI key
    let apiKey;
    try {
        apiKey = await TMUtils.getApiKey();
        console.log('✔️ PlexAPI key retrieved');
    } catch (e) {
        console.error('❌ Unable to retrieve API key', e);
        return;
    }

    // 2) Polling control
    let lastKey = null;
    let intervalId = null;

    async function fetchAttachmentCount(key) {
        try {
            const resp = await fetch(
                `${location.origin}/api/datasources/11713/execute?format=2`,
                {
                    method: 'POST',
                    headers: {
                        'Accept':       'application/json',
                        'Content-Type': 'application/json;charset=utf-8',
                        'Authorization': apiKey
                    },
                    body: JSON.stringify({
                        Attachment_Group_Key: 11,
                        Record_Key_Value:     key
                    })
                }
            );
            if (!resp.ok) throw `11713 → ${resp.status}`;
            const { rows = [] } = await resp.json();
            return rows.length;
        } catch (err) {
            console.error('❌ fetchAttachmentCount failed', err);
            return null;
        }
    }

    function updateAttachmentLabel(count) {
        const span = document.getElementById('lt-attachment-count');
        if (span && typeof count === 'number') {
            span.textContent = `Attachment (${count})`;
        }
    }

    async function checkAndFetch() {
        const pricingLi = document.getElementById('lt-catalog-pricing-button');
        const span = document.getElementById('lt-attachment-count');
        if (!pricingLi || !span) return;

        // only when visible
        if (getComputedStyle(pricingLi).display === 'none') return;

        const grid = document.querySelector('.plex-grid');
        const raw = grid && ko.dataFor(grid)?.datasource.raw;
        if (!raw?.length) return;

        const key = ko.unwrap(raw[0].QuoteKey).toString();
        if (key !== lastKey) {
            lastKey = key;
            // indicate loading
            span.textContent = 'Attachment (...)';
            const count = await fetchAttachmentCount(key);
            if (typeof count === 'number') updateAttachmentLabel(count);
            // stop polling once fetched
            clearInterval(intervalId);
            intervalId = null;
            console.log('🛑 Stopped polling after fetch');
        }
    }

    // 3) Inject label next to pricing button
    function injectAttachmentLabel() {
        const pricingLi = document.getElementById('lt-catalog-pricing-button');
        if (!pricingLi || pricingLi.dataset.attachInjected) return;
        pricingLi.dataset.attachInjected = '1';
        console.log('🔌 Injecting Attachment label');

        const li = document.createElement('li');
        li.id = 'lt-attachment-count-item';

        const span = document.createElement('span');
        span.id = 'lt-attachment-count';
        span.textContent = 'Attachment (0)';
        span.style.paddingLeft = '0.5em';
        li.appendChild(span);

        pricingLi.parentNode.insertBefore(li, pricingLi.nextSibling);
    }

    // 4) Start polling when pricing button appears
    function startPolling() {
        if (!intervalId) {
            intervalId = setInterval(checkAndFetch, 1000);
            console.log('✅ Started polling attachment count');
        }
    }

    TMUtils.observeInsert('#lt-catalog-pricing-button', () => {
        injectAttachmentLabel();
        startPolling();
    });

    // also attempt immediately
    injectAttachmentLabel();
    startPolling();

    console.log('✅ QT35 › Doc Attachment Count initialized');
})(window);
