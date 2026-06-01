const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');

const TM_PATH = path.resolve(
  process.env.LOCALAPPDATA,
  'Google/Chrome/User Data/Default/Extensions/dhdgffkkebhmkfjojejmpbldmpobfkfo/5.5.0_0'
);
const PROFILE_DIR = path.resolve(__dirname, '.chrome-profile');

// Worker-scoped so one Chrome instance stays open across all tests.
const test = base.extend({
  _tmContext: [async ({}, use) => {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: 'chrome',
      baseURL: 'https://lyntron.test.on.plex.com',
      args: [
        `--disable-extensions-except=${TM_PATH}`,
        `--load-extension=${TM_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  }, { scope: 'worker' }],

  page: async ({ _tmContext }, use) => {
    const page = await _tmContext.newPage();
    await use(page);
    await page.close();
  },
});

module.exports = { test, expect };
