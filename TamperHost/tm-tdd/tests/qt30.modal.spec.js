import { describe, it, expect } from 'vitest';
import { getByText } from '@testing-library/dom';
import { attachQuoteModalHandlers, ensureButtons } from '../src/qt30/init.js';

function makeModal(doc) {
    const modal = doc.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('data-modal', 'Quote Part Detail');

    const toolbar = doc.createElement('div');
    toolbar.className = 'modal-toolbar';
    modal.appendChild(toolbar);
    return modal;
}

describe('QT30 modal actions', () => {
    it('adds actions on first open', () => {
        const doc = document;
        const modal = makeModal(doc);

        const { open } = attachQuoteModalHandlers({ root: doc, ensureButtons });
        open(modal);

        const attach = getByText(modal, 'Attach');
        expect(attach).toBeTruthy();
        expect(attach.getAttribute('title')).toMatch(/attach file/i);
    });

    it('does not duplicate on re-open', () => {
        const doc = document;
        const modal = makeModal(doc);

        const { open } = attachQuoteModalHandlers({ root: doc, ensureButtons });
        open(modal);
        open(modal);

        const actions = modal.querySelectorAll('#qt30-actions');
        expect(actions.length).toBe(1);
    });

    it('re-adds after DOM teardown and re-open (new modal instance)', () => {
        const doc = document;
        const modal1 = makeModal(doc);
        const { open } = attachQuoteModalHandlers({ root: doc, ensureButtons });

        open(modal1);
        expect(modal1.querySelector('#qt30-actions')).toBeTruthy();

        // Simulate modal being destroyed
        modal1.remove();

        // New modal instance on next open
        const modal2 = makeModal(doc);
        open(modal2);
        expect(modal2.querySelector('#qt30-actions')).toBeTruthy();
    });
});
