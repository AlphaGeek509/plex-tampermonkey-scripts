// File: lt-plex-tm-utils.user.js
// =================================================================
// ==UserScript==
// @name         TM-Utils
// @namespace    http://tampermonkey.net/
// @version      3.5.55
// @description  Shared helper: API-key fetch, data fetch, UI messages, DOM utilities
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *://*.plex.com
// ==/UserScript==

(function (window) {
    'use strict';

    // 1) Fetch PlexAPI key
    async function getApiKey() {
        return PlexAPI.getKey();
    }

    // 2) Generic data fetch from Plex datasource
    async function fetchData(sourceId, payload) {
        const key = await getApiKey();
        const resp = await fetch(
            `${location.origin}/api/datasources/${sourceId}/execute?format=2`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json;charset=UTF-8',
                'Authorization': key
            },
            body: JSON.stringify(payload)
        }
        );
        if (!resp.ok) throw new Error(`Fetch ${sourceId} failed: ${resp.status}`);
        const { rows = [] } = await resp.json();
        return rows;
    }

    // 3) Floating message UI
    function hideMessage() {
        document.getElementById('tm-msg')?.remove();
    }
    function showMessage(text, { type = 'info', autoClear = 4000 } = {}) {
        hideMessage();
        const colors = {
            info: { bg: '#d9edf7', fg: '#31708f' },
            success: { bg: '#dff0d8', fg: '#3c763d' },
            warning: { bg: '#fcf8e3', fg: '#8a6d3b' },
            error: { bg: '#f2dede', fg: '#a94442' }
        }[type] || { bg: '#fff', fg: '#000' };
        const box = document.createElement('div');
        box.id = 'tm-msg';
        Object.assign(box.style, {
            position: 'fixed', top: '10px', right: '10px',
            padding: '8px 12px', backgroundColor: colors.bg,
            color: colors.fg, border: `1px solid ${colors.fg}`,
            borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            zIndex: 10000, fontSize: '0.9em', maxWidth: '80%',
            whiteSpace: 'pre-line'
        });
        box.textContent = text;
        document.body.appendChild(box);
        if (autoClear) setTimeout(hideMessage, autoClear);
    }

    // 4) DOM insertion observer
    function observeInsert(selector, callback) {
        const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect(); callback(el);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        const existing = document.querySelector(selector);
        if (existing) { obs.disconnect(); callback(existing); }
    }

    function waitForModel(selector, cb, interval = 100, maxAttempts = 100) {
        waitForModelAsync(selector, interval, maxAttempts)
            .then(cb)
            .catch(e => console.error('waitForModel error:', e));
    }


    // 5) Knockout controller + VM waiter
    async function waitForModelAsync(sel, interval = 250, max = 10000) {
        return new Promise((resolve, reject) => {
            let tries = 0;
            function go() {
                const el = document.querySelector(sel);
                if (!el || typeof ko.contextFor !== 'function') return next();

                const ctrl = ko.contextFor(el).$data;      // FormattedAddressController
                const vm = ctrl && ctrl.model;           // QuoteWizard VM

                console.groupCollapsed('🔍 waitForModelAsync');
                console.log('selector →', sel);
                console.log('controller →', ctrl);
                console.log('vm →', vm);
                console.groupEnd();

                if (vm) return resolve({ controller: ctrl, viewModel: vm });
                next();
            }
            function next() {
                if (++tries >= max) {
                    console.warn(`⌛ waitForModelAsync timed out`);
                    return reject(new Error('Timed out'));
                }
                setTimeout(go, interval);
            }
            go();
        });
    }


    // 6) Select <option> by visible text or by numeric value
    function selectOptionByText(selectEl, text) {
        const opt = Array.from(selectEl.options)
            .find(o => o.textContent.trim() === text);
        if (opt) { selectEl.value = opt.value; selectEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function selectOptionByValue(selectEl, value) {
        const opt = Array.from(selectEl.options)
            .find(o => o.value == value);
        if (opt) { selectEl.value = opt.value; selectEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    // 🔁 Global exposure for TamperMonkey sandbox
    const TMUtils = {
        getApiKey,
        fetchData,
        showMessage,
        hideMessage,
        observeInsert,
        waitForModel,
        waitForModelAsync,
        selectOptionByText,
        selectOptionByValue
    };

    window.TMUtils = TMUtils;
    unsafeWindow.TMUtils = TMUtils;

    console.log('🐛 TMUtils loaded from local build:', {
        waitForModelAsync: typeof waitForModelAsync,
        observeInsert: typeof observeInsert,
        fetchData: typeof fetchData
    });


})(window);