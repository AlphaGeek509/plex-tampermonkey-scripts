const { test, expect } = require('@playwright/test');
const { injectQT05 } = require('./helpers/injectScripts');

// Replace with a real QuoteWizard URL from your Plex test environment.
const QUOTE_URL = '/SalesAndCRM/QuoteWizard/REPLACE_WITH_REAL_QUOTE_KEY';

test.beforeEach(async ({ page }) => {
  await injectQT05(page);
  await page.goto(QUOTE_URL);
  await page.waitForSelector('#lt-hub', { timeout: 10000 });
});

test('New Contact button appears in hub bar', async ({ page }) => {
  await expect(page.locator('#qt05-customer-contact')).toBeVisible();
});

test('clicking New Contact opens contact form with correct CustomerNo', async ({ page }) => {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#qt05-customer-contact').click()
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain('CustomerNo=');
  expect(popup.url()).toContain('/Communication/Contact/ContactFormView');
});

test('button is absent on non-QuoteWizard pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#qt05-customer-contact')).not.toBeAttached();
});
