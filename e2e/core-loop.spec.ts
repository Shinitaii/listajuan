import { test, expect, type Page } from '@playwright/test';

// Drives the new single-page logging flow: Home → start trip → create a brand-new
// item (form + category) → pick/create a market → dami + unit → presyo → assert
// the normalized "/ <base-unit>" readout → save → finish → summary.
//
// Each test runs in a fresh browser context = a fresh anonymous Firebase user
// (distinct uid) with an empty /users/{uid} subtree, so every test must create
// its own item + market via the UI rather than relying on another test's data.

async function startTripAtAddItem(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/log\//, { timeout: 10000 });

  // Empty new trip lands in 'adding' mode → ItemPicker is shown.
  await expect(page.getByPlaceholder('Hanapin o pumili…')).toBeVisible({ timeout: 10000 });
}

// Create a new item via the ItemPicker → form/category pickers → "Gumawa".
async function createItem(page: Page, name: string, formLabel: string, categoryLabel: string) {
  await page.getByPlaceholder('Hanapin o pumili…').fill(name);
  await page.getByRole('button', { name: /Bagong item/ }).click();

  // form + category pickers
  await page.getByRole('button', { name: formLabel, exact: true }).click();
  await page.getByRole('button', { name: categoryLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Gumawa', exact: true }).click();

  // Item detail now shows (header = canonical name).
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

// Create + select a market from the MarketPicker.
async function pickNewMarket(page: Page, name: string) {
  await page.getByRole('button', { name: /Pumili ng tindahan/ }).click();
  await page.getByRole('button', { name: /Bagong tindahan/ }).click();
  await page.getByPlaceholder('Pangalan ng tindahan').fill(name);
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  // Market chip now reflects the chosen market.
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

test('count item: create item + market, normalized /piraso readout, finish → summary', async ({ page }) => {
  await startTripAtAddItem(page);
  await page.screenshot({ path: 'e2e/__screens__/home.png' });

  await createItem(page, 'Itlog', 'Bilang (piraso)', 'Iba pa');
  await pickNewMarket(page, 'Palengke');

  // Dami: bilang → Stepper. Bump once (1 → 2 is fine; leave at default works too,
  // but exercise the stepper to prove it renders).
  await page.getByRole('button', { name: 'Dagdagan' }).click();
  // Unit chip "piraso" is the default; click it to be explicit.
  await page.getByRole('button', { name: 'piraso', exact: true }).click();

  // Presyo (kabuuan).
  await page.getByRole('spinbutton').fill('8');

  // Normalized readout — scope to the readout element to avoid strict-mode
  // collisions with other ₱8 text. qty=2, price=8 → ₱4/piraso.
  await expect(page.locator('.readout')).toHaveText('= ₱4 / piraso');

  await page.screenshot({ path: 'e2e/__screens__/add-item-detail.png' });
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // Back on the overview: item + market group visible.
  await expect(page.getByText('Itlog')).toBeVisible();
  await expect(page.getByText('Palengke')).toBeVisible();

  // Finish → summary.
  await page.getByRole('button', { name: /Tapos/ }).click();
  await expect(page.getByText('Kabuuang gastos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.card .hero')).toHaveText('₱8');
  await page.screenshot({ path: 'e2e/__screens__/summary.png' });
});

test('weight item: timbang qty as number input, normalized /kg readout, finish → summary', async ({ page }) => {
  await startTripAtAddItem(page);

  await createItem(page, 'Liempo', 'Timbang (kg)', 'Karne');
  await pickNewMarket(page, 'SM');

  // Dami: timbang → number input (NOT a stepper). Scope to the QtyField .num input.
  await page.locator('input.num').fill('1');
  // Unit "kg" is the default for timbang; click it to be explicit.
  await page.getByRole('button', { name: 'kg', exact: true }).click();

  // Presyo.
  await page.getByRole('spinbutton').last().fill('150');

  // Normalized readout: 150 / (1 * 1) = ₱150 / kg.
  await expect(page.locator('.readout')).toHaveText('= ₱150 / kg');

  await page.getByRole('button', { name: /I-save ang item/ }).click();

  await expect(page.getByText('Liempo')).toBeVisible();
  await expect(page.getByText('SM')).toBeVisible();

  await page.getByRole('button', { name: /Tapos/ }).click();
  await expect(page.getByText('Kabuuang gastos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.card .hero')).toHaveText('₱150');
});
