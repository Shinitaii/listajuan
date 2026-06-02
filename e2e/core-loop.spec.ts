import { test, expect, type Page, type Locator } from '@playwright/test';

// Drives the market-chip + QuickAdjust trip flow plus the management screens.
//
// Each test runs in a fresh browser context = a fresh anonymous Firebase user
// (distinct uid) with an empty /users/{uid} subtree, so every test creates its
// own items/markets via the UI rather than relying on another test's data.

// Build an exact-match regex from a literal string (escapes regex metachars like parens).
const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// Home → "Bagong biyahe" → a brand-new empty trip opens on the Trip *view*
// (market chip + "＋ Magdagdag ng item"), NOT directly in the item picker.
async function startTrip(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/trip\//, { timeout: 10000 });
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

// The two QuickAdjust blocks (.qa) on the AddItem detail: Dami first, Presyo second.
const damiQA = (page: Page) => page.locator('.add .qa').nth(0);
const presyoQA = (page: Page) => page.locator('.add .qa').nth(1);

// Within a QuickAdjust block, the value spinbutton, a step chip by text, and the apply buttons.
const qaValue = (qa: Locator) => qa.getByRole('spinbutton');
const qaChip = (qa: Locator, text: string) => qa.locator('.chip', { hasText: exact(text) });
const qaAdd = (qa: Locator) => qa.getByRole('button', { name: 'Dagdag' });
const qaSub = (qa: Locator) => qa.getByRole('button', { name: 'Bawas' });
const qaDouble = (qa: Locator) => qa.getByRole('button', { name: 'Doblehin' });

test('core: market chip + QuickAdjust → log a line under the chosen market', async ({ page }) => {
  await startTrip(page);

  // Lands on the Trip view: market chip + add-item button visible; item picker NOT shown.
  await expect(page.getByRole('button', { name: /Tindahan:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Magdagdag ng item/ })).toBeVisible();
  await expect(page.getByPlaceholder('Hanapin o pumili…')).toHaveCount(0);

  // Set the market via the trip chip → MarketPicker → create "Palengke".
  await page.getByRole('button', { name: /Tindahan:/ }).click();
  await page.getByRole('button', { name: /Bagong tindahan/ }).click();
  await page.getByPlaceholder('Pangalan ng tindahan').fill('Palengke');
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Tindahan: Palengke/ })).toBeVisible();

  // Add an item — AddItem (add mode) has NO market step.
  await page.getByRole('button', { name: /Magdagdag ng item/ }).click();
  await createItemInline(page, 'Itlog', 'Bilang (piraso)', 'Iba pa');
  await expect(page.getByText('Saang tindahan?')).toHaveCount(0);

  // Dami: qty starts at 1 → select the "2" chip → press Dagdag once → 1 + 2 = 3.
  const dami = damiQA(page);
  await qaChip(dami, '2').click();
  await qaAdd(dami).click();
  await expect(qaValue(dami)).toHaveValue('3');

  // Presyo: select the ₱50 chip → press Dagdag once → total ₱50.
  const presyo = presyoQA(page);
  await qaChip(presyo, '₱50').click();
  await qaAdd(presyo).click();
  await expect(qaValue(presyo)).toHaveValue('50');

  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // Back on the trip list: line under "Palengke" with the right amounts.
  await expect(page.getByText('Palengke')).toBeVisible();
  await expect(page.getByText('Itlog')).toBeVisible();
  await expect(page.locator('.card .hero')).toHaveText('₱50');
  await page.screenshot({ path: 'e2e/__screens__/trip.png' });
});

test('QuickAdjust scaling: timbang chips relabel on ×2 (Doblehin)', async ({ page }) => {
  await startTrip(page);

  await page.getByRole('button', { name: /Magdagdag ng item/ }).click();
  await createItemInline(page, 'Bigas', 'Timbang (kg)', 'Bigas');

  const dami = damiQA(page);
  // Base timbang steps: 250g / 500g / 1kg.
  await expect(qaChip(dami, '250g')).toBeVisible();
  await expect(qaChip(dami, '500g')).toBeVisible();
  await expect(qaChip(dami, '1kg')).toBeVisible();

  // ×2 → 500g / 1kg / 2kg.
  await qaDouble(dami).click();
  await expect(qaChip(dami, '500g')).toBeVisible();
  await expect(qaChip(dami, '1kg')).toBeVisible();
  await expect(qaChip(dami, '2kg')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/quickadjust.png' });
});

test('edit a line: editor keeps the market control; change price via QuickAdjust', async ({ page }) => {
  await startTrip(page);

  // Set a market via the chip.
  await page.getByRole('button', { name: /Tindahan:/ }).click();
  await page.getByRole('button', { name: /Bagong tindahan/ }).click();
  await page.getByPlaceholder('Pangalan ng tindahan').fill('Tindahan');
  await page.getByRole('button', { name: 'I-save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Tindahan: Tindahan/ })).toBeVisible();

  // Add a ₱50 line.
  await page.getByRole('button', { name: /Magdagdag ng item/ }).click();
  await createItemInline(page, 'Mantika', 'Bilang (piraso)', 'Iba pa');
  const presyo = presyoQA(page);
  await qaChip(presyo, '₱50').click();
  await qaAdd(presyo).click();
  await expect(qaValue(presyo)).toHaveValue('50');
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  await expect(page.locator('.card .hero')).toHaveText('₱50');

  // Edit the line → editor (edit mode) still shows a market control.
  await page.getByRole('button', { name: 'I-edit' }).click();
  await expect(page.getByRole('heading', { name: 'Mantika' })).toBeVisible();
  await expect(page.getByText('Saang tindahan?')).toBeVisible();

  // Change the price via QuickAdjust: ₱50 + ₱25 = ₱75.
  const editPresyo = presyoQA(page);
  await qaChip(editPresyo, '₱25').click();
  await qaAdd(editPresyo).click();
  await expect(qaValue(editPresyo)).toHaveValue('75');
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  await expect(page.locator('.card .hero')).toHaveText('₱75');
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

test('settings default market preselects the trip market chip', async ({ page }) => {
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

  // Home → Bagong biyahe → trip market chip is preselected to "SM".
  await page.getByRole('button', { name: 'Home' }).click();
  await page.waitForURL(/#\/$/, { timeout: 10000 });
  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/trip\//, { timeout: 10000 });

  await expect(page.getByRole('button', { name: /Tindahan: SM/ })).toBeVisible();
});
