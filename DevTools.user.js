// ==UserScript==
// @name         zDev Tools > Dump Any ViewModel
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Inspect Knockout viewmodels on Plex pages via menu or floating panel
// @match        *://*.plex.com/*
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const ko = unsafeWindow.ko;

    function isObservable(v) { return ko?.isObservable?.(v); }
    function isComputed(v)   { return isObservable(v) && v.__ko_isComputed; }

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
                    val = '[function]';   label = '🛠 function';
                } else if (typeof raw === 'object') {
                    val = raw;            label = '📁 object';
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

    function dumpShallow() {
        const vm = getRootViewModel();
        if (vm) {
            console.log('%c🧾 Shallow ViewModel Dump:', 'color:teal;font-weight:bold', vm);
            logViewModelShallow(vm);
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

    function createFloatingPanel() {
        if (document.getElementById('ko-debug-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'ko-debug-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '20px',
            left:   '20px',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #999',
            borderRadius: '8px',
            boxShadow: '0 0 8px rgba(0,0,0,0.3)',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '13px',
            minWidth: '220px'
        });
        panel.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;">KO Debug Tools</div>
      <button id="ko-btn-root">🔍 Dump Root</button>
      <button id="ko-btn-capture">🧲 Capture Element</button>
      <button id="ko-btn-dump">🧱 Dump Inspected</button>
      <button id="ko-btn-expand">🔍 Expand Prop</button>
      <button id="ko-btn-close">🧹 Close</button>
      <div style="font-size:11px;margin-top:5px;color:#666;">
        After Capture, click any element. Then use Dump Inspected or Expand Prop.
      </div>
    `;
        document.body.appendChild(panel);

        panel.querySelector('#ko-btn-root')
            .addEventListener('click', dumpShallow);

        panel.querySelector('#ko-btn-capture')
            .addEventListener('click', () => {
            console.log('🧲 Click any element on the page to capture it…');
            const handler = ev => {
                if (ev.target.closest('#ko-debug-panel')) return;
                ev.preventDefault(); ev.stopPropagation();
                unsafeWindow._lastInspected = ev.target;
                console.log('✅ Captured:', ev.target);
                document.removeEventListener('click', handler, true);
            };
            document.addEventListener('click', handler, true);
        });

        panel.querySelector('#ko-btn-dump')
            .addEventListener('click', dumpSelected);

        panel.querySelector('#ko-btn-expand')
            .addEventListener('click', () => {
            const ctxEl = unsafeWindow._lastInspected;
            if (!ctxEl) {
                console.warn('⚠️ No element captured. Use Capture first.');
                return;
            }
            const vm = ko.contextFor(ctxEl)?.$data;
            if (!vm) {
                console.warn('⚠️ No KO context on captured element.');
                return;
            }

            // prompt for a property path, e.g. "config" or "$$controller.elements"
            const path = prompt('Enter property to expand (dot-separated):');
            if (!path) return;

            // resolve vm[path1][path2]...
            let target = vm;
            for (const key of path.split('.')) {
                if (target == null) break;
                const raw = target[key];
                target = isObservable(raw) ? ko.unwrap(raw) : raw;
            }

            console.log(`🔍 Expanding "${path}":`, target);
            if (typeof target === 'object') {
                logViewModelShallow(target);
            } else {
                console.log(target);
            }
        });

        panel.querySelector('#ko-btn-close')
            .addEventListener('click', () => panel.remove());
    }


    function onReady(cb) {
        if (['interactive','complete'].includes(document.readyState)) {
            requestAnimationFrame(cb);
        } else {
            document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(cb));
        }
    }

    // Register manual menu commands
    GM_registerMenuCommand('🔍 Dump KO ViewModel (shallow)', dumpShallow);
    GM_registerMenuCommand('🧱 Dump inspected element', dumpSelected);
    GM_registerMenuCommand('🧪 Show KO Debug Panel', () => onReady(createFloatingPanel));

    // Auto-open panel on any host containing "test"
    onReady(() => {
        if (/test/.test(location.host)) {
            createFloatingPanel();
        }
    });

})();
