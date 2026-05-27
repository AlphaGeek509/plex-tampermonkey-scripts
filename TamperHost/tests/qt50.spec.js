const { test, expect } = require('@playwright/test');
const { injectQT50 } = require('./helpers/injectScripts');

const WIZARD_URL    = '/SalesAndCRM/QuoteWizard';
const TEST_CUSTOMER = 'BIS200';

const HUB          = '[data-lt-hub="1"]';
const VALIDATE_BTN = '[data-id="qt50-validate"]';
const hubStatus    = (page) => page.locator(HUB).locator('.status');

test.describe('QT50 on QuoteWizard', () => {
  test.beforeEach(async ({ page }) => {
    await injectQT50(page);
    await page.goto(WIZARD_URL);
    await page.waitForLoadState('networkidle');
    await page.getByRole('textbox', { name: 'Customer *' }).fill(TEST_CUSTOMER);
    await page.getByRole('textbox', { name: 'Customer *' }).press('Tab');
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');
  });

  test('hub bar mounts in navbar', async ({ page }) => {
    await expect(page.locator(HUB)).toBeAttached({ timeout: 10000 });
  });

  test('Validate Lines button appears in hub', async ({ page }) => {
    await expect(page.locator(VALIDATE_BTN)).toBeVisible({ timeout: 10000 });
  });

  test('status pill shows result after clicking Validate Lines', async ({ page }) => {
    await page.locator(VALIDATE_BTN).waitFor({ timeout: 10000 });
    // Wait for any customer-entry status to auto-clear before clicking
    await expect(hubStatus(page)).not.toBeVisible({ timeout: 10000 });
    await page.locator(VALIDATE_BTN).click();
    const pill = hubStatus(page);
    await expect(pill).toBeVisible({ timeout: 15000 });
  });
});
