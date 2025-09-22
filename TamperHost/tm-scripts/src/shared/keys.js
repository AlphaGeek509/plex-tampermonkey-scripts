// src/shared/keys.js
export const key = {
    tab: (tabId) => `lt:tab:${tabId}`,
    scope: (tabId, ns, scopeKey) => `lt:${ns}:tab:${tabId}:scope:${scopeKey}`,
    entity: (tabId, ns, scopeKey, entity, id = 'current') =>
        `lt:${ns}:tab:${tabId}:scope:${scopeKey}:${entity}:${id}`,
};
