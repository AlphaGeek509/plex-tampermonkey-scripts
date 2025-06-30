// File: lt-plex-tm-utils.user.js
// =================================================================
// ==UserScript==
// @name         TM-Utils
// @namespace    http://tampermonkey.net/
// @version      2.1.11
// @description  Shared helper: API-key fetch, data fetch, UI messages, DOM utilities
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *://*.plex.com
// ==/UserScript==

(function (window) {
    'use strict';
    console.log(
        '🐛 TMUtils loaded:',
        'waitForModel=', typeof waitForModel,
        'observeInsert=', typeof observeInsert,
        'fetchData=', typeof fetchData
    );


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

    // 5) Knockout root-model waiter
    function waitForModel(selector, cb, interval = 100) {
        const el = document.querySelector(selector);
        if (el && window.ko) {
            const vm = ko.dataFor(el);
            if (vm?.model) return cb(vm.model);
        }
        setTimeout(() => waitForModel(selector, cb, interval), interval);
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

    window.TMUtils = {
        getApiKey, fetchData,
        showMessage, hideMessage,
        observeInsert, waitForModel,
        selectOptionByText, selectOptionByValue
    };
})(window);