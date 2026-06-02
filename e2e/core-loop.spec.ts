import { test, expect, type Page } from '@playwright/test';

// Drives the unified, always-editable trip flow plus the new management screens.
//
// Each test runs in a fresh browser context = a fresh anonymous Firebase user
// (distinct uid) with an empty /users/{uid} subtree, so every test creates its
// own items/markets via the UI rather than relying on another test's data.

// Build an exact-match regex from a literal string (escapes regex metachars like parens).
const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// Home → "Bagong biyahe" → a brand-new empty trip opens AddItem directly.
async function startTripAtAddItem(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/trip\//, { timeout: 10000 });

  // Empty new trip lands in 'add' mode → ItemPicker is shown.
  await expect(page.getByPlaceholder('Hanapin o pumili…')).toBeVisible({ timeout: 10000 });
}

// Create a new item via the ItemPicker → form/category pickers → "Gumawa".
async function createItemInline(page: Page, name: string, formLabel: string, categoryLabel: string) {
  await page.getByPlaceholder('Hanapin o pumili…').fill(name);
  await page.getByRole('button', { name: new RegExp(`Bagong item`) }).click();

  // Scope to .grid tiles (exact text) to avoid colliding with the bottom-nav "Iba pa" tab.
  await page.locator('.grid .tile', { hasText: exact(formLabel) }).click();
  await page.locator('.grid .tile', { hasText: exact(categoryLabel) }).click();
  await page.getByRole('button', { name: 'Gumawa', exact: true }).click();

  // Item detail now shows (header = canonical name).
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

// Create + select a market from the MarketPicker (opened via the market button).
async function pickNewMarket(page: Page, name: string) {
  await page.getByRole('button', { name: /Pumili ng tindahan/ }).click();
  await page.getByRole('button', { name: /Bagong tindahan/ }).click();
  await page.getByPlaceholder('Pangalan ng tindahan').fill(name);
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  // Market button now reflects the chosen market.
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

test('core + always-editable: log a trip, save, then re-open the saved trip and add another item', async ({ page }) => {
  await startTripAtAddItem(page);

  await createItemInline(page, 'Itlog', 'Bilang (piraso)', 'Iba pa');
  await pickNewMarket(page, 'Palengke');

  // Dami: bilang → Stepper. 1 → 2.
  await page.getByRole('button', { name: 'Dagdagan' }).click();
  await page.getByRole('button', { name: 'piraso', exact: true }).click();

  // Presyo (kabuuan) = 8 over qty 2 → ₱4 / piraso.
  await page.getByRole('spinbutton').fill('8');
  await expect(page.locator('.readout')).toHaveText('= ₱4 / piraso');

  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // Back on the trip list view: market group + line + total.
  await expect(page.getByText('Palengke')).toBeVisible();
  await expect(page.getByText('Itlog')).toBeVisible();
  await expect(page.locator('.card .hero')).toHaveText('₱8');
  await page.screenshot({ path: 'e2e/__screens__/trip.png' });

  // Finish the draft → back on Home.
  await page.getByRole('button', { name: /Tapos/ }).click();
  await page.waitForURL(/#\/$/, { timeout: 10000 });
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible();

  // Re-open the saved trip from the Biyahe list — proves saved trips are editable.
  await page.getByRole('navigation').getByRole('button', { name: 'Biyahe' }).click();
  await page.waitForURL(/#\/biyahe/, { timeout: 10000 });
  // The saved trip row lives under "Mga naitalang biyahe" (.row, not .draft).
  await page.locator('.list .row:not(.draft)').first().click();
  await page.waitForURL(/#\/trip\//, { timeout: 10000 });

  // Saved trip opens in view mode (it already has items). Total is ₱8.
  await expect(page.locator('.card .hero')).toHaveText('₱8');

  // Add a second item to the saved trip.
  await page.getByRole('button', { name: /Magdagdag ng item/ }).click();
  await createItemInline(page, 'Tinapay', 'Bilang (piraso)', 'Iba pa');
  // Re-use the same market.
  await page.getByRole('button', { name: /Pumili ng tindahan|Palengke/ }).click();
  await page.getByRole('button', { name: 'Palengke', exact: true }).click();
  await page.getByRole('spinbutton').fill('20');
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // Total increased from ₱8 → ₱28.
  await expect(page.locator('.card .hero')).toHaveText('₱28');
});

test('edit + remove a line', async ({ page }) => {
  await startTripAtAddItem(page);

  await createItemInline(page, 'Mantika', 'Bilang (piraso)', 'Iba pa');
  await pickNewMarket(page, 'Tindahan');
  await page.getByRole('spinbutton').fill('50');
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  await expect(page.locator('.card .hero')).toHaveText('₱50');

  // Edit the line → change the price in the AddItem editor.
  await page.getByRole('button', { name: 'I-edit' }).click();
  await expect(page.getByRole('heading', { name: 'Mantika' })).toBeVisible();
  await page.getByRole('spinbutton').fill('75');
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  await expect(page.locator('.card .hero')).toHaveText('₱75');

  // Remove the line.
  await page.getByRole('button', { name: 'Tanggalin' }).click();
  await expect(page.getByText('Mantika')).toHaveCount(0);
});

test('items CRUD: create, rename, delete from the Items tab', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Items' }).click();
  await page.waitForURL(/#\/items/, { timeout: 10000 });

  // Create "Bigas" (Timbang / Bigas).
  await page.getByRole('button', { name: /Bagong item/ }).click();
  await page.getByPlaceholder('Pangalan ng item').fill('Bigas');
  await page.locator('.grid .tile', { hasText: exact('Timbang (kg)') }).click();
  await page.locator('.grid .tile', { hasText: exact('Bigas') }).click();
  await page.getByRole('button', { name: 'Gumawa', exact: true }).click();

  await expect(page.locator('.item .name', { hasText: 'Bigas' })).toBeVisible();

  // Rename to "Bigas (sako)".
  await page.getByRole('button', { name: 'I-edit' }).click();
  // Edit-panel input has no placeholder (the create-panel one does).
  const nameInput = page.locator('.editor input.name-input:not([placeholder])');
  await nameInput.fill('Bigas (sako)');
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  await expect(page.locator('.item .name', { hasText: 'Bigas (sako)' })).toBeVisible();

  // Delete → confirm dialog.
  await page.getByRole('button', { name: 'Burahin' }).click();
  await expect(page.getByText('Burahin ang item?')).toBeVisible();
  await page.getByRole('button', { name: 'Oo, burahin' }).click();
  await expect(page.locator('.item .name', { hasText: 'Bigas (sako)' })).toHaveCount(0);
});

test('settings default market preselects in AddItem', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  // Iba pa → Mga setting (scope to the bottom-nav tab).
  await page.getByRole('navigation').getByRole('button', { name: 'Iba pa' }).click();
  await page.waitForURL(/#\/more/, { timeout: 10000 });
  await page.getByRole('button', { name: /Mga setting/ }).click();
  await page.waitForURL(/#\/settings/, { timeout: 10000 });

  // Create "SM" via the MarketPicker → setting it as default.
  await page.getByRole('button', { name: /Bagong tindahan/ }).click();
  await page.getByPlaceholder('Pangalan ng tindahan').fill('SM');
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  // Default-market readout reflects the choice.
  await expect(page.locator('.current')).toHaveText('SM');

  // Home → Bagong biyahe → AddItem market button is preselected to "SM".
  await page.getByRole('button', { name: 'Home' }).click();
  await page.waitForURL(/#\/$/, { timeout: 10000 });
  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/trip\//, { timeout: 10000 });

  // Create an item so the detail (with the market button) renders.
  await createItemInline(page, 'Asukal', 'Bilang (piraso)', 'Iba pa');
  await expect(page.getByRole('button', { name: /SM/ })).toBeVisible();
});
