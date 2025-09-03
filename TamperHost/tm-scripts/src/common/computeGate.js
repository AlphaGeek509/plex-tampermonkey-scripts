// A tiny gate around a computed: it won’t evaluate until start() is called.
// While stopped, it returns the last value (no notifications, no reads).
export function createGatedComputed({ ko, read }) {
    const started = ko.observable(false);
    let last;
    let hasLast = false;

    const comp = ko.pureComputed(() => {
        if (!started()) {
            return hasLast ? last : undefined; // before first start → undefined, after → last
        }
        const value = read();   // only read when started
        last = value;
        hasLast = true;
        return value;
    });

    function start() { started(true); }
    function stop() { started(false); }

    return { computed: comp, start, stop, isStarted: started };
}
