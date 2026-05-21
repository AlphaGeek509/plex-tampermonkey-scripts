const { test: setup } = require('@playwright/test');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '.auth/plex-session.json');

setup('authenticate against Plex test', async ({ page }) => {
  await page.goto('https://lyntron.test.on.plex.com');

  if (!page.url().includes('accounts.plex.com')) return;

  await page.getByRole('textbox', { name: 'Username' }).fill(process.env.PLEX_USER);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PLEX_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/lyntron\.test\.on\.plex\.com/, { timeout: 15000 });
  await page.context().storageState({ path: SESSION_FILE });
});
