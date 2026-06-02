import { test, expect, type Page } from '@playwright/test';

// Drives the core logging loop: Home → start trip → create item "Liempo" →
// dami + unit → presyo 320 → save → finish. Leaves the page on the trip
// summary. Each test runs in a fresh browser context, which means a fresh
// anonymous Firebase user (distinct uid) with an empty /users/{uid} subtree —
// so every test must create its own data via the UI rather than relying on
// data left behind by another test.
async function logTripWithLiempo(page: Page) {
  await page.goto('/');
  // Anonymous sign-in + Home render
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });

  // Start a trip — wait for the route to actually change before asserting the UI
  await page.getByRole('button', { name: /Bagong biyahe/ }).click();
  await page.waitForURL(/#\/log\//, { timeout: 10000 });

  // Step 1: create a brand-new item by typing then tapping "Bagong item"
  await expect(page.getByText('Anong idadagdag?')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('Hanapin o pumili…').fill('Liempo');
  await page.getByRole('button', { name: /Bagong item/ }).click();

  // Step 2: dami — bump the stepper, pick a unit
  await expect(page.getByText(/Ilang/)).toBeVisible();
  await page.getByRole('button', { name: 'Dagdagan' }).click();
  await page.getByRole('button', { name: 'kg', exact: true }).click();
  await page.getByRole('button', { name: /Susunod/ }).click();

  // Step 3: presyo
  await expect(page.getByText(/Magkano/)).toBeVisible();
  await page.getByRole('spinbutton').fill('320');
  await page.screenshot({ path: 'e2e/__screens__/log-presyo.png' });
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // After saving we land on the trip overview: the item + running total show,
  // and an explicit finish button is available.
  await expect(page.getByText('Liempo')).toBeVisible();
  await expect(page.locator('.totalband .total')).toHaveText('₱320');

  // Finish the trip → summary
  await page.getByRole('button', { name: /Tapos/ }).click();
  await expect(page.getByText('Kabuuang gastos')).toBeVisible();
}

test('core logging loop: start trip → log an item → finish → summary', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'e2e/__screens__/home.png' });

  await logTripWithLiempo(page);

  // The trip-summary hero total reflects the single ₱320 item (the line-item
  // price is also ₱320, so scope the assertion to the summary card hero).
  await expect(page.locator('.card .hero')).toHaveText('₱320');
  await page.screenshot({ path: 'e2e/__screens__/summary.png' });
});

test('delete trip shows the single confirmation and returns home', async ({ page }) => {
  // Create a trip first so this test owns its data (fresh anonymous uid).
  await logTripWithLiempo(page);

  // We are on the trip summary. Delete it via the single confirmation dialog.
  await page.getByRole('button', { name: /Burahin ang biyahe/ }).click();
  await expect(page.getByText('Hindi na ito maibabalik.')).toBeVisible();
  await page.getByRole('button', { name: 'Oo, burahin' }).click();

  // Back on Home.
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 20000 });
});
