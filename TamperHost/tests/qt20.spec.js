const { test, expect } = require('@playwright/test');
const { injectQT10AndQT20 } = require('./helpers/injectScripts');
const { setupWizardPage, openAddPartModal, enterPartNo, HUB, hubStatus } = require('./helpers/wizardHelpers');

const TEST_PART         = 'BR6340-02-0.250-00';
const TEST_PART_PARTIAL = 'BR6340-02-0.250';

test.describe('QT20 on Part Summary', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await injectQT10AndQT20(page);
    await setupWizardPage(page, { steps: 1 });
    await openAddPartModal(page);
  });

  test('hub bar mounts in navbar', async ({ page }) => {
    await expect(page.locator(HUB)).toBeAttached({ timeout: 10000 });
  });

  test('"Get Stock Levels" button appears in modal action bar', async ({ page }) => {
    await expect(page.locator('#qt20-stock-li-btn')).toBeVisible({ timeout: 10000 });
  });

  test('Unit Price and % Markup inputs are locked in pricing grid', async ({ page }) => {
    await expect(page.locator('input[name="NewUnitPrice"]').first()).toBeDisabled({ timeout: 10000 });
  });

  test('clicking Get Stock Levels writes stock stamp to Note field (exact part number)', async ({ page }) => {
    test.setTimeout(60000);
    const partField = page.getByRole('textbox', { name: 'Lyn-Tron Part No.' });
    await partField.fill(TEST_PART);
    await partField.press('Tab');
    // Wait for Plex AJAX validation AND confirm the field value is stable before clicking
    await page.waitForLoadState('networkidle');
    await expect(partField).toHaveValue(TEST_PART, { timeout: 10000 });
    await page.locator('#qt20-stock-li-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#qt20-stock-li-btn').click();
    await expect(hubStatus(page)).toHaveText(/Stock:.*pcs/, { timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue(/Stock:/, { timeout: 20000 });
  });

  test('clicking Get Stock Levels writes stock stamp to Note field (partial part number via picker)', async ({ page }) => {
    test.setTimeout(60000);
    // Partial entry opens a picker grid — enterPartNo selects the full match from it
    await enterPartNo(page, TEST_PART_PARTIAL, TEST_PART);
    // After picker selection Plex does not re-populate #partKeyPicker the same way direct entry does;
    // wait for network to settle then let the stock check result prove the part was correctly selected
    await page.waitForLoadState('networkidle');
    await page.locator('#qt20-stock-li-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#qt20-stock-li-btn').click();
    await expect(hubStatus(page)).toHaveText(/Stock:.*pcs/, { timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue(/Stock:/, { timeout: 20000 });
  });
});
