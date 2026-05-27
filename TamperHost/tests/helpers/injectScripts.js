const fs = require('fs');
const path = require('path');
const { gmPolyfill } = require('./gmPolyfill');

const wwwroot = path.resolve(__dirname, '../../wwwroot');

function read(filename) {
  return fs.readFileSync(path.join(wwwroot, filename), 'utf8');
}

// Seeds GM_* credentials into localStorage so scripts that call GM_getValue
// for PlexApiKey (QT10, QT20, etc.) find them without TamperMonkey.
function credentialSeed() {
  const apiKey = process.env.PLEX_API_KEY || '';
  if (!apiKey) return '';
  return `localStorage.setItem('GM_PlexApiKey', JSON.stringify(${JSON.stringify(apiKey)}));`;
}

// Injects shared libs in @require order, then the feature script.
// Must be called before page.goto() so addInitScript fires at document-start.
async function injectSharedLibs(page) {
  await page.addInitScript({ content: gmPolyfill });
  const seed = credentialSeed();
  if (seed) await page.addInitScript({ content: seed });
  await page.addInitScript({ content: read('lt-plex-tm-utils.user.js') });
  await page.addInitScript({ content: read('lt-plex-auth.user.js') });
  await page.addInitScript({ content: read('lt-core.user.js') });
  await page.addInitScript({ content: read('lt-data-core.user.js') });
  await page.addInitScript({ content: read('lt-ui-hub.js') });
}

async function injectQT05(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt05.user.js') });
}

async function injectQT10(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt10.user.js') });
}

async function injectQT20(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt20.user.js') });
}

async function injectQT30(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt30.user.js') });
}

async function injectQT50(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt50.user.js') });
}

async function injectQT05AndQT50(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt05.user.js') });
  await page.addInitScript({ content: read('qt50.user.js') });
}

async function injectQT10AndQT20(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt10.user.js') });
  await page.addInitScript({ content: read('qt20.user.js') });
}

async function injectQT10AndQT30(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt10.user.js') });
  await page.addInitScript({ content: read('qt30.user.js') });
}

async function injectQT10AndQT20AndQT30(page) {
  await injectSharedLibs(page);
  await page.addInitScript({ content: read('qt10.user.js') });
  await page.addInitScript({ content: read('qt20.user.js') });
  await page.addInitScript({ content: read('qt30.user.js') });
}

module.exports = { injectQT05, injectQT10, injectQT20, injectQT30, injectQT50, injectQT05AndQT50, injectQT10AndQT20, injectQT10AndQT30, injectQT10AndQT20AndQT30 };
