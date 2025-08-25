// tests/qt20.authRetry.spec.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(async () => {
    global.__TM_DEV__ = true;

    document.body.innerHTML = `
    <div class="plex-dialog plex-dialog-has-buttons">
      <div class="plex-dialog-title">Quote Part Detail</div>
      <div class="plex-dialog-content">
        <textarea name="NoteNew"></textarea>
      </div>
      <div class="plex-actions-wrapper">
        <ul class="plex-actions"></ul>
      </div>
    </div>`;

    const vm = {
        PartNo: () => 'AA-01-02',
        NoteNew: vi.fn(function (v) { if (v === undefined) return this._note || ''; this._note = v; }),
    };

    global.ko = {
        unwrap: (x) => (typeof x === 'function' ? x() : x),
        contextFor: () => ({ $root: { data: vm } }),
    };
    global.unsafeWindow = global;

    global.GM_registerMenuCommand = () => { };
    global.GM_getValue = () => ({});
    global.GM_setValue = () => { };
    global.GM_xmlHttpRequest = () => { };

    const err419 = Object.assign(new Error('419'), { status: 419 });

    global.TMUtils = {
        matchRoute: () => true,
        observeInsertMany: () => () => { },
        onUrlChange: () => { },
        toast: vi.fn(),
        getApiKey: vi.fn().mockResolvedValue('k'),
        dsRows: vi.fn()
            .mockRejectedValueOnce(err419)               // first call → 419
            .mockResolvedValueOnce([{ Part_No: 'AA-01-02', Quantity: 3, Unit: 'pcs', Location: 'M1' }]),
    };

    window.ko = global.ko;             // so code can find KO via window.ko
    global.unsafeWindow = window;      // so code can find KO via unsafeWindow.ko

    await import('../src/qt20/main.js');
});

it('retries once on 419 and succeeds', async () => {
    const ul = document.querySelector('ul.plex-actions');
    window.__QT20__.injectStockControls(ul);

    const btn = [...ul.querySelectorAll('a')].find(a => a.textContent.includes('Get Stock Levels'));
    const modal = ul.closest('.plex-dialog');

    await window.__QT20__.handleClick(btn, modal);   // ← await handler

    expect(TMUtils.getApiKey).toHaveBeenCalled();    // force refresh after 419
    expect(TMUtils.dsRows).toHaveBeenCalledTimes(2); // reject once, succeed once

    const noteSpy = ko.contextFor(document.querySelector('textarea[name="NoteNew"]')).$root.data.NoteNew;
    const calls = noteSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // pick the last setter call (arg !== undefined)
    let lastSetArg;
    for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i] && calls[i][0] !== undefined) { lastSetArg = calls[i][0]; break; }
    }
    expect(lastSetArg, 'expected a setter call with a value').toBeDefined();
    expect(String(lastSetArg)).toMatch(/STK:\s*3\s*pcs/);

    const note = ko.contextFor(document.querySelector('textarea[name="NoteNew"]')).$root.data.NoteNew();
    expect(note).toMatch(/STK:\s*3\s*pcs/);
    expect(TMUtils.toast).toHaveBeenCalled();
});
