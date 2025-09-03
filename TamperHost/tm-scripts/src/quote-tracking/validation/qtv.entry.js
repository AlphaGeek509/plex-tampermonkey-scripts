// QTV entrypoint: mounts the “Validate Lines” button on Part Summary
const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

if (__BUILD_DEV__) {
    unsafeWindow.QTV_DEBUG = {
        getValue: key => GM_getValue(key),
        setValue: (key, val) => GM_setValue(key, val),
        settings: () => ({
            enabled: GM_getValue('qtv.enabled'),
            maxUnitPrice: GM_getValue('qtv.maxUnitPrice'),
        })
    };
}


// Ensure the settings UI loads (gear button, storage API)
import './index.js';
// Mounts the Validate Lines button & wires click to the engine
import { mountValidationButton } from './injectButton.js';

TMUtils?.net?.ensureWatcher?.(); // optional, harmless if missing

// Good
const ROUTES = [/^\/SalesAndCRM\/QuoteWizard(?:\/|$)/i];
const PAGE_NAME_RE = /part\s*summary/i;
let unmountBtn = null;

function isWizard() {
    if (TMUtils?.matchRoute) return !!TMUtils.matchRoute(ROUTES);
    return ROUTES.some(re => re.test(location.pathname));
}

function onRouteOrDomChange() {
    if (!isWizard()) return unmount();
    const nav = document.querySelector('.plex-wizard-page-list .active, .plex-wizard-page-list [aria-current="page"]');
    const name = (nav?.textContent || '').trim();
    if (PAGE_NAME_RE.test(name)) {
        if (!unmountBtn) unmountBtn = mountValidationButton(TMUtils);
    } else {
        unmount();
    }
}
function unmount() { if (unmountBtn) { unmountBtn(); unmountBtn = null; } }

onRouteOrDomChange();
TMUtils?.onUrlChange?.(onRouteOrDomChange);
TMUtils?.observeInsert?.('#QuoteWizardSharedActionBar', onRouteOrDomChange);
