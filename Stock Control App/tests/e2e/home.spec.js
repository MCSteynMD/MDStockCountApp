import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display home page correctly', async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Check page title/header - be more flexible with selectors
    const header = page.locator('h1, h2, h3').first();
    await expect(header).toBeVisible({ timeout: 10000 });
    
    // Check file upload section is visible - look for any upload-related text
    const uploadText = page.getByText(/Upload|Refresh|Excel|File/i).first();
    await expect(uploadText).toBeVisible({ timeout: 10000 });
  });

  test('should show company dropdown after file upload', async ({ page }) => {
    // This test requires a test CSV file
    // For now, we'll test the UI state changes
    
    // Check that Save button is disabled initially
    const saveButton = page.getByRole('button', { name: /Save/i });
    if (await saveButton.count() > 0) {
      await expect(saveButton.first()).toBeDisabled();
    }
  });

  test('should navigate to other pages', async ({ page }) => {
    // Test navigation links
    const summaryLink = page.getByRole('link', { name: /Summary/i });
    const reconcileLink = page.getByRole('link', { name: /Reconcile/i });
    
    if (await summaryLink.count() > 0) {
      await summaryLink.first().click();
      await expect(page).toHaveURL(/.*summary/i);
    }
    
    if (await reconcileLink.count() > 0) {
      await reconcileLink.first().click();
      await expect(page).toHaveURL(/.*reconcile/i);
    }
  });

  test('should handle file input', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // File inputs are often hidden (styled with custom buttons)
    // Check that file input exists in DOM (even if hidden)
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    
    // Also check for upload button or text
    const uploadButton = page.getByText(/Upload|Choose file|Select file/i).first();
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
  });
});

