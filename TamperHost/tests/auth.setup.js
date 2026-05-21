const { test: setup } = require('@playwright/test');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '.auth/plex-session.json');

// Navigates to the Plex test environment, lets it redirect to accounts.plex.com,
// completes login, then saves the authenticated session for all other tests.
// Re-run when session expires: npx playwright test --project=setup
setup('authenticate against Plex test', async ({ page }) => {
  await page.goto('https://lyntron.test.on.plex.com');

  await page.getByRole('textbox', { name: 'Username' }).fill(process.env.PLEX_USER);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PLEX_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/lyntron\.test\.on\.plex\.com/, { timeout: 15000 });
  await page.context().storageState({ path: SESSION_FILE });
});
