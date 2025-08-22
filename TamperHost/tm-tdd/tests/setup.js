import ko from 'knockout';

const store = new Map();
globalThis.GM = {
    getValue: async (k, d) => (store.has(k) ? store.get(k) : d),
    setValue: async (k, v) => { store.set(k, v); },
    addStyle: () => { }
};

globalThis.ko = ko;
