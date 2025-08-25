import { describe, it, expect } from 'vitest';
import ko from 'knockout';
import { createGatedComputed, startGateOnFirstUserEdit } from '../src/common/index.js';

describe('QT10 gate', () => {
    it('does nothing while stopped; on start emits current value, then changes', () => {
        const calls = [];
        const src = ko.observable('');

        const gate = createGatedComputed({ ko, read: () => src() });
        const input = document.createElement('input');
        startGateOnFirstUserEdit({ gate, inputEl: input });

        gate.computed.subscribe(v => { if (v !== undefined) calls.push(v); });

        // Pre-start programmatic value → no emission yet
        src('A');
        expect(calls).toEqual([]);

        // First real user edit starts the gate → emits current value ('A')
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(calls).toEqual(['A']);

        // After start: emits on value changes; duplicate 'B' is de-duped by KO
        src('B'); src('B'); src('C');
        expect(calls).toEqual(['A', 'B', 'C']);
    });
});
