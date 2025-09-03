export function makeKV({ GM }) {
    return {
        async get(key, def = null) { return GM.getValue(key, def); },
        async set(key, val) { await GM.setValue(key, val); return val; }
    };
}
