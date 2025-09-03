// Start a gate the first time a user edits an input.
// No-op if already started; removes both listeners after first fire.
export function startGateOnFirstUserEdit({ gate, inputEl }) {
    const isStarted = () =>
        typeof gate.isStarted === 'function' ? !!gate.isStarted() : !!gate.isStarted;

    const once = () => {
        if (!isStarted()) gate.start();
        inputEl.removeEventListener('input', once);
        inputEl.removeEventListener('change', once);
    };

    inputEl.addEventListener('input', once);
    inputEl.addEventListener('change', once);
}
