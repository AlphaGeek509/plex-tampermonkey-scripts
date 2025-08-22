// tests/userStart.spec.js
import { describe, it, expect } from 'vitest';
import { createGatedComputed } from '../src/common/computeGate.js';
import { startGateOnFirstUserEdit } from '../src/common/userStart.js';

describe('startGateOnFirstUserEdit', () => {
    it('does not start until user edits, then starts exactly once', () => {
        const { ko } = globalThis;
        const input = document.createElement('input');
        document.body.appendChild(input);

        const src = ko.observable('X');
        let reads = 0;

        const gate = createGatedComputed({
            ko,
            read: () => { reads++; return src(); }
        });

        // ✅ Activate the computed
        const seen = [];
        gate.computed.subscribe(v => seen.push(v));

        startGateOnFirstUserEdit({ gate, inputEl: input });

        // Still gated
        src('A');
        expect(reads).toBe(0);
        expect(seen.length).toBe(0);

        // First user edit → gate.start() → computed evaluates once with latest value
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(reads).toBe(1);
        expect(seen.at(-1)).toBe('A');

        // Subsequent edits don’t re-start; changes still flow normally
        input.dispatchEvent(new Event('input', { bubbles: true })); // no-op for gate
        src('B');
        expect(reads).toBe(2);
        expect(seen.at(-1)).toBe('B');
    });
});
