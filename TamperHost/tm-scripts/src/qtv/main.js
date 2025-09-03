// QTV entrypoint: mounts the “Validate Lines” button on Part Summary
// and loads your settings UI so the gear is available.

const DEV = (typeof __BUILD_DEV__ !== 'undefined')
    ? __BUILD_DEV__
    : !!(typeof globalThis !== 'undefined' && globalThis.__TM_DEV__);

import '../quote-tracking/validation/index.js';               // your existing UI module (gear + settings)
import { mountValidationButton } from '../quote-tracking/validation/injectButton'; // button wrapper

// Optional: if you want the network watcher available everywhere
TMUtils?.net?.ensureWatcher?.();

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

function unmount() {
    if (unmountBtn) { unmountBtn(); unmountBtn = null; }
}

// Arm once + respond to SPA/DOM changes
onRouteOrDomChange();
TMUtils?.onUrlChange?.(onRouteOrDomChange);
TMUtils?.observeInsert?.('#QuoteWizardSharedActionBar', onRouteOrDomChange);
