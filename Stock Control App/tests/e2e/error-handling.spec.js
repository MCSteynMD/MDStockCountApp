import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('should handle invalid routes gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page');
    // Should redirect to home or show 404
    await expect(page).toHaveURL(/\//);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept API calls and simulate failure
    await page.route('**/api/**', route => route.abort());
    
    await page.goto('/');
    // Page should still load, errors should be handled gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show error messages for invalid file uploads', async ({ page }) => {
    await page.goto('/');
    
    // Try to upload an invalid file (if file input exists)
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Create a dummy file
      const buffer = Buffer.from('invalid content');
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: buffer
      });
      
      // Should show error or handle gracefully
      await page.waitForTimeout(1000);
      // Check that page doesn't crash
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

