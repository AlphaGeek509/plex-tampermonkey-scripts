const { test, expect } = require('@playwright/test');
const { injectQT10AndQT30 } = require('./helpers/injectScripts');
const { setupWizardPage, HUB, hubStatus } = require('./helpers/wizardHelpers');

const APPLY_BTN = '[data-id="qt30-apply-pricing"]';

test.describe('QT30 on Part Summary', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await injectQT10AndQT30(page);
    await setupWizardPage(page, { steps: 1 });
  });

  test('hub bar mounts in navbar', async ({ page }) => {
    await expect(page.locator(HUB)).toBeAttached({ timeout: 10000 });
  });

  test('"Ready" sticky pill appears after load', async ({ page }) => {
    await expect(hubStatus(page)).toHaveText('Ready', { timeout: 10000 });
  });

  test('"Apply Pricing" button appears in hub', async ({ page }) => {
    await expect(page.locator(APPLY_BTN)).toBeVisible({ timeout: 10000 });
  });

  test('clicking Apply Pricing shows success pill', async ({ page }) => {
    test.setTimeout(60000);
    await page.locator(APPLY_BTN).waitFor({ timeout: 10000 });
    // Wait for any existing status to clear before clicking
    await expect(hubStatus(page)).not.toHaveText(/Fetching|Applying|Loading/, { timeout: 10000 });
    await page.locator(APPLY_BTN).click();
    await expect(hubStatus(page)).toHaveText(/Pricing applied/, { timeout: 30000 });
  });
});
