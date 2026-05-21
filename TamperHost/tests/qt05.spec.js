const { test, expect } = require('@playwright/test');
const { injectQT05 } = require('./helpers/injectScripts');

const WIZARD_URL = '/SalesAndCRM/QuoteWizard';
const TEST_CUSTOMER = 'BIS200';

// Hub host: data-lt-hub="1" (shadow DOM host, Playwright pierces open shadows automatically)
// Button:   data-id="qt05-customer-contact" (inside shadow DOM)
const HUB     = '[data-lt-hub="1"]';
const BTN     = '[data-id="qt05-customer-contact"]';

test.describe('QT05 on QuoteWizard', () => {
  test.beforeEach(async ({ page }) => {
    await injectQT05(page);
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

  test('New Contact button appears after customer entry', async ({ page }) => {
    await expect(page.locator(BTN)).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Contact opens contact form with correct CustomerNo', async ({ page }) => {
    test.setTimeout(60000);
    await page.locator(BTN).waitFor({ timeout: 10000 });

    // Intercept window.open before clicking so we can assert the URL without
    // dealing with popup capture or noopener cross-context issues.
    await page.evaluate(() => {
      window.__lt_openedUrls = [];
      const orig = window.open;
      window.open = (url, ...args) => { window.__lt_openedUrls.push(String(url)); return orig.call(window, url, ...args); };
    });

    await page.locator(BTN).click();

    // resolveCustomerNo is async (polls KO model up to 8s) — wait for the URL to land
    await page.waitForFunction(() => window.__lt_openedUrls.length > 0, { timeout: 15000 });

    const urls = await page.evaluate(() => window.__lt_openedUrls);
    expect(urls[0]).toContain('/Communication/Contact/ContactFormView');
    expect(urls[0]).toContain('CustomerNo=');
  });
});

test.describe('QT05 on other pages', () => {
  test('button is absent on non-QuoteWizard pages', async ({ page }) => {
    await injectQT05(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(BTN)).not.toBeAttached();
  });
});
