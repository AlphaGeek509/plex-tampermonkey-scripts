// One-time script to install TamperMonkey scripts into the Playwright Chrome profile.
// Run: npm run tm:install
// Requires the dev server to be running (npm run dev in a separate terminal).
const { chromium } = require('@playwright/test');
const path = require('path');
const readline = require('readline');

const TM_PATH = path.resolve(
  process.env.LOCALAPPDATA,
  'Google/Chrome/User Data/Default/Extensions/dhdgffkkebhmkfjojejmpbldmpobfkfo/5.5.0_0'
);
const PROFILE_DIR = path.resolve(__dirname, '.chrome-profile');

const SCRIPTS = [
  'http://localhost:5000/lt-plex-tm-utils.user.js',
  'http://localhost:5000/lt-plex-auth.user.js',
  'http://localhost:5000/lt-core.user.js',
  'http://localhost:5000/lt-data-core.user.js',
  'http://localhost:5000/lt-ui-hub.js',
  'http://localhost:5000/qt05.user.js',
];

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: [
      `--disable-extensions-except=${TM_PATH}`,
      `--load-extension=${TM_PATH}`,
    ],
  });

  const page = await context.newPage();

  for (const url of SCRIPTS) {
    console.log(`Opening: ${url}`);
    try {
      await page.goto(url);
    } catch (e) {
      if (!e.message.includes('Download is starting')) throw e;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question('\nInstall each script in TamperMonkey, then press Enter to close...\n', resolve);
  });
  rl.close();
  await context.close();
})();
