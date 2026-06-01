// One-time script to configure TamperMonkey in the Playwright Chrome profile.
// Run: npm run tm:setup-profile
//
// Steps:
//   1. Chrome opens with TamperMonkey loaded
//   2. TM options page opens automatically
//   3. Set Config Mode to Advanced, save settings
//   4. Press Enter in this terminal when done
const { chromium } = require('@playwright/test');
const path = require('path');
const readline = require('readline');

const TM_PATH = path.resolve(
  process.env.LOCALAPPDATA,
  'Google/Chrome/User Data/Default/Extensions/dhdgffkkebhmkfjojejmpbldmpobfkfo/5.5.0_0'
);
const PROFILE_DIR = path.resolve(__dirname, '.chrome-profile');

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
  await page.goto('about:blank');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question(
      '\nChrome is open with TamperMonkey loaded.\n' +
      '  1. Click the TamperMonkey icon in the toolbar (or the puzzle-piece Extensions menu)\n' +
      '  2. Select "Options" or "Dashboard"\n' +
      '  3. Go to the Settings tab\n' +
      '  4. Set "Config Mode" to "Advanced" and click Save\n' +
      '  5. Press Enter here when done...\n',
      resolve
    );
  });
  rl.close();
  await context.close();
})();
