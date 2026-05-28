const { test, expect } = require('@playwright/test');
const { injectQT10AndQT20AndQT30 } = require('./helpers/injectScripts');
const { setupWizardPage, openAddPartModal, waitForPartValidated, HUB, hubStatus } = require('./helpers/wizardHelpers');

const TEST_PART  = 'BR6340-02-0.250-00';
const APPLY_BTN  = '[data-id="qt30-apply-pricing"]';
const QUANTITIES = [100, 250, 500, 1000, 2500];

test.describe('QT30 on Part Summary', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await injectQT10AndQT20AndQT30(page);
    await setupWizardPage(page, { steps: 1 });
  });

  test('hub bar mounts in navbar', async ({ page }) => {
    await expect(page.locator(HUB)).toBeAttached({ timeout: 10000 });
  });

  test('"Ready" status pill appears in hub bar', async ({ page }) => {
    await expect(hubStatus(page)).toHaveText('Ready', { timeout: 10000 });
  });

  test('"Apply Pricing" button appears in hub bar', async ({ page }) => {
    await expect(page.locator(APPLY_BTN)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('QT30 — Part entry workflow', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120000);
    await injectQT10AndQT20AndQT30(page);
    await setupWizardPage(page, { steps: 1 });
    await openAddPartModal(page);
  });

  test('adds part with stock levels and quantity breaks then saves to Part Summary grid', async ({ page }) => {
    test.setTimeout(120000);
    const customerPartNo = `Blah_${Math.floor(Math.random() * 90000) + 10000}`;
    const leadTime = String(Math.floor(Math.random() * 14) + 7); // 7–20

    // Enter and validate the part number
    const partField = page.getByRole('textbox', { name: 'Lyn-Tron Part No.' });
    await partField.fill(TEST_PART);
    await partField.press('Tab');
    await waitForPartValidated(page);

    // Click Get Stock Levels and wait for the hub stamp and Note field to confirm
    await page.locator('#qt20-stock-li-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#qt20-stock-li-btn').click();
    await expect(hubStatus(page)).toHaveText(/Stock:.*pcs/, { timeout: 20000 });

    // Fill required header fields
    await page.getByRole('textbox', { name: 'Customer Part No *' }).fill(customerPartNo);
    await page.getByLabel('Lead Time').fill(leadTime);

    // Fill quantity breaks — Tab after the last row to trigger KO numericValue blur formatting
    await page.locator('input[name="NewQuantity"]').first().scrollIntoViewIfNeeded();
    for (let i = 0; i < QUANTITIES.length; i++) {
      await page.locator('input[name="NewQuantity"]').nth(i).fill(String(QUANTITIES[i]));
    }
    await page.locator('input[name="NewQuantity"]').nth(QUANTITIES.length - 1).press('Tab');

    // Submit and wait for the grid to refresh with the new row
    await page.getByRole('button', { name: 'Ok' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('cell', { name: customerPartNo, exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('cell', { name: TEST_PART, exact: true })).toBeVisible({ timeout: 5000 });
  });
});
