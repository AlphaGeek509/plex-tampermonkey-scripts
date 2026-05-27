const { test, expect } = require('@playwright/test');
const { injectQT10 } = require('./helpers/injectScripts');

const WIZARD_URL    = '/SalesAndCRM/QuoteWizard';
const TEST_CUSTOMER = 'BIS200';

const HUB       = '[data-lt-hub="1"]';
// Status pill: scoped through hub host to avoid matching Plex's own .status elements
const hubStatus = (page) => page.locator(HUB).locator('.status');

async function enterCustomer(page) {
  await page.getByRole('textbox', { name: 'Customer *' }).fill(TEST_CUSTOMER);
  await page.getByRole('textbox', { name: 'Customer *' }).press('Tab');
}

test.describe('QT10 on QuoteWizard', () => {
  test.beforeEach(async ({ page }) => {
    await injectQT10(page);
    await page.goto(WIZARD_URL);
    await page.waitForLoadState('networkidle');
  });

  test('hub bar mounts in navbar', async ({ page }) => {
    await expect(page.locator(HUB)).toBeAttached({ timeout: 10000 });
  });

  test('status pill shows catalog linked after customer entry', async ({ page }) => {
    test.setTimeout(30000);
    await enterCustomer(page);
    // BIS200 → 'Distributor'; DS 319 + DS 22696 are sequential — allow up to 20s
    await expect(hubStatus(page)).toHaveText(/Linked:.*Distributor/, { timeout: 20000 });
  });

});

