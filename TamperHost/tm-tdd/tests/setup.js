// tests/setup.js
import ko from 'knockout';

// Enable DEV paths in source modules (our __BUILD_DEV__ fallback)
globalThis.__TM_DEV__ = true;

// Make KO available to modules/tests
globalThis.ko = ko;

// Make unsafeWindow point to the same global in JSDOM (some code probes it)
globalThis.unsafeWindow = globalThis;

// Unified in-memory store used by both GM v4 and GM_* shims
const store = new Map();

// --- GM v4-style (GM.*) shims (you already had these) ---
globalThis.GM = {
    getValue: async (k, d) => (store.has(k) ? store.get(k) : d),
    setValue: async (k, v) => { store.set(k, v); },
    addStyle: () => { },
    xmlHttpRequest: () => { },        // optional, if any code calls GM.xmlHttpRequest
};

// --- Legacy GM_* function shims (what your code/grants use) ---
globalThis.GM_getValue = (k, d) => (store.has(k) ? store.get(k) : d);
globalThis.GM_setValue = (k, v) => { store.set(k, v); };
globalThis.GM_addStyle = () => { };
globalThis.GM_xmlHttpRequest = () => { };
globalThis.GM_registerMenuCommand = () => { };
