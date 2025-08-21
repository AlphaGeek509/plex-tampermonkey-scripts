// ==UserScript==
// @name         zDev Tools > Dump Any ViewModel
// @namespace    http://tampermonkey.net/
// @version      3.5.159
// @description  Inspect Knockout viewmodels on Plex pages via menu or floating panel (with persistence)
// @match        *://*.plex.com/*
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ko = unsafeWindow.ko;

    // helper to test observables/computeds
    function isObservable(v) { return ko?.isObservable?.(v); }
    function isComputed(v) { return isObservable(v) && v.__ko_isComputed; }

    // find the root VM on the page
    function getRootViewModel() {
        const selectors = [
            '.plex-wizard-page-list',
            '.plex-grid',
            '.plex-form-header',
            'input[name="CustomerNo"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const ctx = ko.contextFor(el);
            if (ctx?.$root) return ctx.$root.data || ctx.$root;
        }
        const bodyCtx = ko.contextFor(document.body);
        if (bodyCtx?.$root) return bodyCtx.$root.data || bodyCtx.$root;
        console.warn('🛑 No KO root viewmodel found');
        return null;
    }

    // shallow-dump an object’s own keys
    function logViewModelShallow(vm) {
        if (!vm || typeof vm !== 'object') return;
        const keys = Object.keys(vm).sort();
        console.groupCollapsed('🔍 KO ViewModel Properties (Shallow)');
        for (const key of keys) {
            let raw = vm[key], val, label = '';
            try {
                if (isComputed(raw)) {
                    val = ko.unwrap(raw); label = '🧠 computed';
                } else if (isObservable(raw)) {
                    val = ko.unwrap(raw); label = '📦 observable';
                } else if (typeof raw === 'function') {
                    val = '[function]'; label = '🛠 function';
                } else if (typeof raw === 'object') {
                    val = raw; label = '📁 object';
                } else {
                    val = raw;
                }
            } catch {
                val = '⚠️ [error accessing]';
            }
            console.log(`%c${key}%c${label}`, 'color:teal', 'color:gray', val);
        }
        console.groupEnd();
    }

    // menu callbacks
    function dumpShallow() {
        const vm = getRootViewModel();
        //         if (vm?.$$controller?.model) {
        //             console.log('%c📦 Controller Model found:', 'color:orange;font-weight:bold');
        //             logViewModelShallow(vm.$$controller.model);
        //         } else if (typeof vm?.$$controller?.model === 'function') {
        //             const model = vm.$$controller.model();
        //             console.log('%c📦 Controller Model (computed) found:', 'color:orange;font-weight:bold');
        //             logViewModelShallow(model);
        //         } else {
        //             console.warn('⚠️ No $$controller.model found yet');
        //         }

        if (!vm) return;

        console.log('%c🧾 Shallow ViewModel Dump (root):', 'color:teal;font-weight:bold', vm);
        logViewModelShallow(vm);

        if (vm?.$$controller?.model) {
            console.log('%c📦 Controller Model:', 'color:orange;font-weight:bold', vm.$$controller.model);
            logViewModelShallow(vm.$$controller.model);
        }
    }


    function dumpSelected() {
        const el = unsafeWindow._lastInspected;
        if (!el || el.nodeType !== 1) {
            console.warn('⚠️ No valid inspected element. Use Capture then click an element to set it.');
            return;
        }
        const ctx = ko.contextFor(el);
        if (!ctx) {
            console.warn('❌ No KO context found for the inspected element');
            return;
        }
        const data = ctx.$data;
        console.log('%c🔎 Dumping KO DataFor inspected element:', 'color:darkgreen;font-weight:bold', data);
        logViewModelShallow(data);
    }

    // build & show the floating panel
    function createFloatingPanel() {
        if (document.getElementById('ko-debug-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'ko-debug-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #999',
            borderRadius: '8px',
            boxShadow: '0 0 8px rgba(0,0,0,0.3)',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '13px',
            minWidth: '240px'
        });

        // inject HTML
        panel.innerHTML = `
            <div style="font-weight:bold; margin-bottom:6px;">KO Debug Tools</div>
            <button id="ko-btn-root">🔍 Dump Root</button>
            <button id="ko-btn-capture">🧲 Capture Element</button>
            <button id="ko-btn-dump">🧱 Dump Inspected</button>
            <button id="ko-btn-close">🧹 Close</button>
            <div style="margin-top:8px; font-size:12px;">
              <label>
                <input type="checkbox" id="ko-opt-auto">
                Auto-open on load
              </label>
            </div>
            <div style="font-size:11px; margin-top:6px; color:#666;">
              After capture, click any element to select it.
            </div>
        `;
        document.body.appendChild(panel);

        // wire buttons
        panel.querySelector('#ko-btn-root')
            .addEventListener('click', dumpShallow);

        panel.querySelector('#ko-btn-capture')
            .addEventListener('click', () => {
                console.log('🧲 Click any element on the page to capture it for KO inspection…');
                const handler = ev => {
                    if (ev.target.closest('#ko-debug-panel')) return;
                    ev.preventDefault(); ev.stopPropagation();
                    unsafeWindow._lastInspected = ev.target;
                    console.log('✅ Captured for inspection:', ev.target);
                    document.removeEventListener('click', handler, true);
                };
                document.addEventListener('click', handler, true);
            });

        panel.querySelector('#ko-btn-dump')
            .addEventListener('click', dumpSelected);

        panel.querySelector('#ko-btn-close')
            .addEventListener('click', () => panel.remove());

        // handle the checkbox persistence
        const autoCB = panel.querySelector('#ko-opt-auto');
        const autoVal = GM_getValue('autoShow', false);
        autoCB.checked = autoVal;
        autoCB.addEventListener('change', () => {
            GM_setValue('autoShow', autoCB.checked);
            console.log('⚙️ KO Debug Panel auto-open set to', autoCB.checked);
        });
    }

    // helper: run on DOM ready
    function onReady(cb) {
        if (['interactive', 'complete'].includes(document.readyState)) {
            requestAnimationFrame(cb);
        } else {
            document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(cb));
        }
    }

    // register menu commands
    GM_registerMenuCommand('🔍 Dump KO ViewModel (shallow)', dumpShallow);
    GM_registerMenuCommand('🧱 Dump inspected element', dumpSelected);
    GM_registerMenuCommand('🧪 Show KO Debug Panel', () => onReady(createFloatingPanel));

    // auto-show panel if user opted in
    onReady(() => {
        if (GM_getValue('autoShow', false)) {
            createFloatingPanel();
        }
    });

})();
