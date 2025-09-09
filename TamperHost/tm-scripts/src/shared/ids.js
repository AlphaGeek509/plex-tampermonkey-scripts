// src/shared/ids.js
export const getTabId = () => {
    let id = sessionStorage.getItem('lt.tabId');
    if (!id) { id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); sessionStorage.setItem('lt.tabId', id); }
    return id;
};
