// qt10.gate.spec.js
import { describe, it, expect, vi } from 'vitest';
import { createGatedComputed, startGateOnFirstUserEdit } from '../src/common/index.js';

describe('QT10 gate', () => {
    it('does nothing until user edits, then runs once per change', () => {
        const ko = await import('knockout'); const calls = [];
        const src = ko.observable('');              // simulates CustomerNo
        const gate = createGatedComputed({ ko, read: () => src() });
        const input = document.createElement('input');
        startGateOnFirstUserEdit({ gate, inputEl: input });

        gate.computed.subscribe(v => calls.push(v));
        src('A');                           // programmatic change → ignored pre-start
        expect(calls.length).toBe(0);

        input.dispatchEvent(new Event('input', { bubbles: true })); // start
        src('B'); src('B'); src('C');
        expect(calls).toEqual(['B', 'C']); // no dup for same value
    });
});
