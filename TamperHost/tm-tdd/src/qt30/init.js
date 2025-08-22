// Core functions designed for TDD (no GM.*, no network).
export function attachQuoteModalHandlers({ root, ensureButtons }) {
    // Return an interface that the userscript shell can call on real modal opens.
    return {
        open(modalEl) {
            ensureButtons({ modalEl, root });
        }
    };
}

export function ensureButtons({ modalEl }) {
    const id = 'qt30-actions';
    if (modalEl.querySelector(`#${id}`)) return; // no duplicates

    const doc = modalEl.ownerDocument || document;
    const bar = modalEl.querySelector('.modal-toolbar') ?? modalEl;

    const wrapper = doc.createElement('div');
    wrapper.id = id;

    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Attach';
    btn.setAttribute('title', 'Attach file to quote');

    wrapper.appendChild(btn);
    bar.appendChild(wrapper);
}
