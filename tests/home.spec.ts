import { test, expect } from '@playwright/test';

// Bypass password gate
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('hill-chart-authed', 'true'));
});

// Helper to create a hill and navigate to it
async function createHill(page: any, title: string) {
  await page.goto('/');
  await page.getByText('New hill').click();
  await page.getByPlaceholder('Hill title...').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('button', { name: 'Add a scope' })).toBeVisible();
}

// Helper to add a scope to the current hill
async function addScope(page: any, name: string) {
  await page.getByRole('button', { name: 'Add a scope' }).click();
  await page.getByPlaceholder('Scope name...').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();
}

// --- Hills Grid ---

test('homepage loads with hills heading', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/hill chart/i);
  await expect(page.getByRole('heading', { name: 'Hills' })).toBeVisible();
});

test('shows new hill button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('New hill')).toBeVisible();
});

test('can create a new hill and navigate to it', async ({ page }) => {
  await createHill(page, 'Test Hill');
  await expect(page.getByText('All hills')).toBeVisible();
});

test('can navigate back to hills grid', async ({ page }) => {
  await createHill(page, 'Nav Test');
  await page.getByText('All hills').click();
  await expect(page.getByRole('heading', { name: 'Hills' })).toBeVisible();
  await expect(page.getByText('Nav Test').first()).toBeVisible();
});

test('can cancel creating a new hill', async ({ page }) => {
  await page.goto('/');
  await page.getByText('New hill').click();
  await expect(page.getByPlaceholder('Hill title...')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('New hill')).toBeVisible();
});

// --- Hill Options Menu ---

test('hill card shows three-dot menu with duplicate and delete', async ({ page }) => {
  await createHill(page, 'Menu Test');
  await page.getByText('All hills').click();
  await page.getByLabel('Hill options').first().click();
  await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
});

test('can duplicate a hill via menu', async ({ page }) => {
  await createHill(page, 'To Duplicate');
  await page.getByText('All hills').click();
  // Click the menu on any hill card with our title
  const heading = page.getByRole('heading', { name: 'To Duplicate' }).first();
  const card = heading.locator('..');
  await card.getByLabel('Hill options').click();
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByText('To Duplicate (copy)').first()).toBeVisible({ timeout: 10000 });
});

test('delete hill shows confirmation modal', async ({ page }) => {
  await createHill(page, 'Delete Modal Test');
  await page.getByText('All hills').click();
  await page.getByLabel('Hill options').first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('This cannot be undone')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Delete Modal Test').first()).toBeVisible();
});

// --- Scopes ---

test('can add a scope to a hill', async ({ page }) => {
  await createHill(page, 'Scope Hill');
  await addScope(page, 'Test Scope');
  await expect(page.getByText('Test Scope').first()).toBeVisible();
  await expect(page.locator('svg').getByText('Test Scope')).toBeVisible();
});

test('can add multiple scopes', async ({ page }) => {
  await createHill(page, 'Multi Scope');
  await addScope(page, 'Scope One');
  await addScope(page, 'Scope Two');
  await expect(page.getByText('Scope One').first()).toBeVisible();
  await expect(page.getByText('Scope Two').first()).toBeVisible();
});

test('can delete a scope', async ({ page }) => {
  await createHill(page, 'Delete Scope Hill');
  await addScope(page, 'To Delete');
  await expect(page.getByText('To Delete').first()).toBeVisible();
  await page.getByRole('button', { name: 'To Delete options' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('To Delete')).not.toBeVisible();
});

test('can cancel adding a scope', async ({ page }) => {
  await createHill(page, 'Cancel Scope');
  await page.getByRole('button', { name: 'Add a scope' }).click();
  await expect(page.getByPlaceholder('Scope name...')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Add a scope' })).toBeVisible();
});

// --- Scope Color ---

test('can change scope color', async ({ page }) => {
  await createHill(page, 'Color Hill');
  await addScope(page, 'Colored');
  await page.getByLabel('Change color').click();
  await expect(page.getByLabel(/Select color/)).toHaveCount(12);
  await page.getByLabel(/Select color/).nth(2).click();
});

// --- Scope Description ---

test('scope description is visible by default', async ({ page }) => {
  await createHill(page, 'Desc Hill');
  await addScope(page, 'With Desc');
  await expect(page.getByPlaceholder('Add a description...')).toBeVisible();
});

test('can type a scope description', async ({ page }) => {
  await createHill(page, 'Desc Type Hill');
  await addScope(page, 'Desc Scope');
  await page.getByPlaceholder('Add a description...').fill('Test description');
  await expect(page.getByPlaceholder('Add a description...')).toHaveValue('Test description');
});

// --- Hill Chart ---

test('hill chart displays figuring it out and making it happen labels', async ({ page }) => {
  await createHill(page, 'Labels Hill');
  await expect(page.locator('svg').getByText('Figuring it out')).toBeVisible();
  await expect(page.locator('svg').getByText('Making it happen')).toBeVisible();
});

test('scope dot appears on hill chart', async ({ page }) => {
  await createHill(page, 'Dot Hill');
  await addScope(page, 'Dot Scope');
  const circles = page.locator('svg circle');
  await expect(circles.first()).toBeVisible();
});

// --- Hill Description ---

test('can edit hill description', async ({ page }) => {
  await createHill(page, 'Desc Edit Hill');
  await page.getByPlaceholder('Describe your hill...').fill('A test description');
  await expect(page.getByPlaceholder('Describe your hill...')).toHaveValue('A test description');
});
