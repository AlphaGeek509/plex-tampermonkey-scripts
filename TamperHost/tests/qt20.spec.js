const { test, expect } = require('@playwright/test');
const { injectQT10AndQT20 } = require('./helpers/injectScripts');
const { setupWizardPage, openAddPartModal, enterPartNo, waitForPartValidated, HUB, hubStatus } = require('./helpers/wizardHelpers');

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
    await waitForPartValidated(page, TEST_PART);
    await page.locator('#qt20-stock-li-btn').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#qt20-stock-li-btn').click();
    await expect(hubStatus(page)).toHaveText(/Stock:.*pcs/, { timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue(/Stock:/, { timeout: 20000 });
  });

  test('form fields accept Customer Part No, Note, and Lead Time', async ({ page }) => {
    test.setTimeout(60000);
    const customerPartNo = `Blah_${Math.floor(Math.random() * 90000) + 10000}`;
    const loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const leadTime = String(Math.floor(Math.random() * 14) + 7); // 7–20

    const partField = page.getByRole('textbox', { name: 'Lyn-Tron Part No.' });
    await partField.fill(TEST_PART);
    await partField.press('Tab');
    await waitForPartValidated(page, TEST_PART);

    await page.getByRole('textbox', { name: 'Customer Part No *' }).fill(customerPartNo);
    await page.getByLabel('Note', { exact: true }).fill(loremIpsum);
    await page.getByLabel('Lead Time').fill(leadTime);

    await expect(page.getByRole('textbox', { name: 'Customer Part No *' })).toHaveValue(customerPartNo);
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue(loremIpsum);
    await expect(page.getByLabel('Lead Time')).toHaveValue(leadTime);
  });

  test('saving part detail adds row to Part Summary grid', async ({ page }) => {
    test.setTimeout(60000);
    const customerPartNo = `Blah_${Math.floor(Math.random() * 90000) + 10000}`;
    const leadTime = String(Math.floor(Math.random() * 14) + 7); // 7–20

    const partField = page.getByRole('textbox', { name: 'Lyn-Tron Part No.' });
    await partField.fill(TEST_PART);
    await partField.press('Tab');
    await waitForPartValidated(page, TEST_PART);

    await page.getByRole('textbox', { name: 'Customer Part No *' }).fill(customerPartNo);
    await page.getByLabel('Lead Time').fill(leadTime);

    await page.getByRole('button', { name: 'Ok' }).click();
    await page.waitForLoadState('networkidle');

    // Modal closes and grid refreshes — unique Customer Part No confirms the row was saved
    await expect(page.getByRole('cell', { name: customerPartNo, exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('cell', { name: TEST_PART, exact: true })).toBeVisible({ timeout: 5000 });
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
