// Shared navigation helpers for multi-page QuoteWizard Playwright tests.
// The wizard is a SPA — page advances don't change the URL, only the DOM content.
const { expect } = require('@playwright/test');

const WIZARD_URL = '/SalesAndCRM/QuoteWizard';
const NEXT_BTN   = '#NextWizardPage';

// Hub host selector (Playwright pierces open shadow DOM automatically)
const HUB        = '[data-lt-hub="1"]';
const hubStatus  = (page) => page.locator(HUB).locator('.status');

/**
 * Click the Next button `steps` times, waiting for networkidle after each click.
 * steps = 0 → stay on the first wizard page (Quote)
 * steps = 1 → advance to the second page (Lines)
 * steps = 2 → advance to the third page, etc.
 */
async function advanceWizard(page, steps = 0) {
  for (let i = 0; i < steps; i++) {
    await page.locator(NEXT_BTN).click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Full QuoteWizard setup used in beforeEach across script specs:
 *   1. Navigate to the QuoteWizard
 *   2. Enter the customer ID and Tab away
 *   3. Wait for QT10's "Linked:" status pill to confirm the catalog resolved
 *   4. Advance the wizard `steps` pages via #NextWizardPage
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ customer?: string, steps?: number, catalogTimeout?: number }} opts
 */
async function setupWizardPage(page, { customer = 'BIS200', steps = 0, catalogTimeout = 20000 } = {}) {
  page.on('console', msg => {
    if (msg.type() === 'error' || /QT\d+:/i.test(msg.text())) {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  await page.goto(WIZARD_URL);
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: 'Customer *' }).fill(customer);
  await page.getByRole('textbox', { name: 'Customer *' }).press('Tab');

  // Wait for QT10 to resolve the catalog before advancing — ensures draft repo is
  // populated and the wizard is in a consistent state for downstream scripts.
  await expect(hubStatus(page)).toHaveText(/^Linked:/, { timeout: catalogTimeout });

  // Allow the page to settle after catalog resolution before advancing.
  await page.waitForTimeout(5000);

  await advanceWizard(page, steps);
}

/**
 * Opens the Quote Part Detail modal on the Part Summary page.
 * ul.plex-subactions is in the DOM from page load but display:none until clicked.
 */
async function openAddPartModal(page) {
  await page.getByRole('link', { name: 'Quote Part ' }).click();
  await page.getByRole('link', { name: 'Add' }).click();
}

/**
 * Waits for Plex AJAX validation to settle after a direct part number entry.
 * For direct fill(), Plex validates via AJAX but does NOT render a display chip —
 * networkidle is the only reliable signal that validation is complete.
 * (Display chips only appear after picker-grid selection, not direct typing.)
 */
async function waitForPartValidated(page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Enters a part number into the Lyn-Tron Part No. field and tabs away.
 * If Plex shows a picker grid (partial match), clicks the cell matching fullPartNo.
 * @param {import('@playwright/test').Page} page
 * @param {string} partNo - value to type (partial or full)
 * @param {string} fullPartNo - exact cell name to click if the picker appears
 */
async function enterPartNo(page, partNo, fullPartNo) {
  await page.getByRole('textbox', { name: 'Lyn-Tron Part No.' }).fill(partNo);
  await page.getByRole('textbox', { name: 'Lyn-Tron Part No.' }).press('Tab');
  // If a picker grid appears, wait for it and select the matching row
  const cell = page.getByRole('cell', { name: fullPartNo, exact: true });
  try {
    await cell.waitFor({ state: 'visible', timeout: 10000 });
    await cell.click();
  } catch {
    // No picker appeared — field already has an exact match
  }
}

// Re-export selectors so specs can use them without re-declaring.
module.exports = { setupWizardPage, advanceWizard, openAddPartModal, enterPartNo, waitForPartValidated, WIZARD_URL, NEXT_BTN, HUB, hubStatus };
