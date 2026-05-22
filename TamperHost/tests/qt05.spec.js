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

    // resolveCustomerNo is async (polls KO model up to 2s) — wait for the URL to land
    await page.waitForFunction(() => window.__lt_openedUrls.length > 0, { timeout: 15000 });

    const urls = await page.evaluate(() => window.__lt_openedUrls);
    expect(urls[0]).toContain('/Communication/Contact/ContactFormView');
    expect(urls[0]).toContain('CustomerNo=');
  });

  test('contact form can be filled, saved, then contact is selectable as Buyer', async ({ page, context }) => {
    test.setTimeout(120000);
    await page.locator(BTN).waitFor({ timeout: 10000 });

    const suffix = Date.now();
    const firstName = `Test${suffix}`;
    const lastName  = `Contact${suffix}`;
    const fullName  = `${lastName}, ${firstName}`;

    // Open contact form in new tab
    const [contactPage] = await Promise.all([
      context.waitForEvent('page'),
      page.locator(BTN).click()
    ]);

    await contactPage.waitForLoadState('networkidle');

    await contactPage.getByRole('textbox', { name: 'First Name †' }).fill(firstName);
    await contactPage.getByRole('textbox', { name: 'First Name †' }).press('Tab');
    await contactPage.getByRole('textbox', { name: 'Last Name †' }).fill(lastName);
    await contactPage.getByRole('textbox', { name: 'Last Name †' }).press('Tab');
    await contactPage.getByRole('textbox', { name: 'Title' }).fill('Mr');
    await contactPage.getByRole('textbox', { name: 'Email', exact: true }).fill('jnichols@askmonroe.com');
    await contactPage.getByRole('button', { name: 'Ok' }).click();

    // Wait for save to complete — Plex either closes the tab or navigates away
    await Promise.race([
      contactPage.waitForEvent('close', { timeout: 15000 }),
      contactPage.waitForLoadState('networkidle', { timeout: 15000 })
    ]).catch(() => {});

    // Ensure the popup is closed before interacting with the main page.
    // Chrome blocks clicks on an opener while its popup window is still open.
    if (!contactPage.isClosed()) await contactPage.close();

    // Return to quote page and open the Buyer picker
    //await page.bringToFront();
    //await expect(page.locator(HUB)).toBeAttached({ timeout: 5000 });

    // Click the picker icon next to the Buyer field — wait for it to be enabled first
    await page.locator('.plex-picker-control:has(#BuyerPicker) > a.plex-picker-icon:not(.disabled)')
      .waitFor({ timeout: 10000 });
    await page.locator('.plex-picker-control:has(#BuyerPicker) > a.plex-picker-icon').click();

    // Select the newly created contact from the picker grid
    await page.getByRole('cell', { name: fullName }).click();
    await page.getByRole('button', { name: 'Ok' }).click();

    // Buyer field should now show the contact name (Plex renders selection as a token chip, not input value)
    await expect(
      page.locator('.plex-picker-control:has(#BuyerPicker) .plex-picker-item')
    ).toHaveText(fullName);
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
