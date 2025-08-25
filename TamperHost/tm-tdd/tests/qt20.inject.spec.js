import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
    global.TMUtils = {
        matchRoute: () => true,
        observeInsertMany: () => () => { },
        onUrlChange: () => { }
    };
    global.GM_getValue = () => ({});
    global.GM_setValue = () => { };
    global.unsafeWindow = {};
    global.window = global;
    global.ko = { unwrap: (x) => (typeof x === 'function' ? x() : x) };

    // Create a minimal modal DOM
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

    global.__TM_DEV__ = true;
    await import('../src/qt20/main.js');
});

describe('QT20 injection', () => {
    it('adds the button and settings gear only once', () => {
        const ul = document.querySelector('ul.plex-actions');
        window.__QT20__.injectStockControls(ul);
        window.__QT20__.injectStockControls(ul); // idempotent

        const btns = [...ul.querySelectorAll('a')].map(a => a.textContent.trim());
        expect(btns).toContain('LT Get Stock Levels');
        // two anchors total: main button + gear
        expect(ul.querySelectorAll('a').length).toBe(2);
    });
});
