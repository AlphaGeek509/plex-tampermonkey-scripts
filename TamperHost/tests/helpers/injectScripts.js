const fs = require('fs');
const path = require('path');
const { gmPolyfill } = require('./gmPolyfill');

const wwwroot = path.resolve(__dirname, '../../wwwroot');

function read(filename) {
  return fs.readFileSync(path.join(wwwroot, filename), 'utf8');
}

// Injects shared libs in @require order, then the feature script.
// Must be called before page.goto() so addInitScript fires at document-start.
async function injectQT05(page) {
  await page.addInitScript({ content: gmPolyfill });
  await page.addInitScript({ content: read('lt-plex-tm-utils.user.js') });
  await page.addInitScript({ content: read('lt-plex-auth.user.js') });
  await page.addInitScript({ content: read('lt-core.user.js') });
  await page.addInitScript({ content: read('lt-data-core.user.js') });
  await page.addInitScript({ content: read('lt-ui-hub.js') });
  await page.addInitScript({ content: read('qt05.user.js') });
}

module.exports = { injectQT05 };
