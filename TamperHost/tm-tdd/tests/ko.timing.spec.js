import { describe, it, expect } from 'vitest';
import { createGatedComputed } from '../src/common/computeGate.js';

describe('KO timing: gated computed', () => {
    it('does not evaluate until started, then tracks changes, and stops cleanly', () => {
        const { ko } = globalThis;
        const src = ko.observable('init');
        let calls = 0;

        const gate = createGatedComputed({
            ko,
            read: () => { calls++; return src(); }
        });

        // Subscribing before start should not trigger `read`
        const seen = [];
        gate.computed.subscribe(v => seen.push(v));

        expect(calls).toBe(0);
        src('A');
        expect(calls).toBe(0);          // still gated

        gate.start();                    // begins evaluation
        expect(calls).toBe(1);
        expect(seen.at(-1)).toBe('A');

        src('B');
        expect(calls).toBe(2);
        expect(seen.at(-1)).toBe('B');

        gate.stop();
        src('C');                        // no new evaluations while stopped
        expect(calls).toBe(2);
        expect(seen.at(-1)).toBe('B');
    });
});
