// Exploratory stepping-stone spec for page 2 (Part Summary).
// Run headed and use test.pause() to inspect the modal and observe QT20/QT30 behavior.
// This file is NOT part of the permanent suite — rename to qt20.spec.js once the flow is understood.

const { test, expect } = require('@playwright/test');
const { injectQT10AndQT20AndQT30 } = require('./helpers/injectScripts');
const { setupWizardPage, openAddPartModal } = require('./helpers/wizardHelpers');

test.describe('Page 2 exploration – Part Summary', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await injectQT10AndQT20AndQT30(page);
    await setupWizardPage(page, { steps: 1 });
  });

  test('pause on Part Summary with Add modal open', async ({ page }) => {
    test.setTimeout(120000);

    await openAddPartModal(page);

    // Pause here — inspect the modal fields and observe QT20/QT30 behavior in the hub
    await test.step('Modal is open — inspect fields and hub status, then resume', async () => {
      await page.pause();
    });
  });
});
