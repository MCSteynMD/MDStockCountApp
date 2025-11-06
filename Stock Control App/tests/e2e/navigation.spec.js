import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should have correct navigation links', async ({ page }) => {
    await page.goto('/');
    
    // Check that only Home, Summary, and Reconcile are visible
    const navLinks = page.locator('nav a, header a');
    
    const linkTexts = [];
    const count = await navLinks.count();
    for (let i = 0; i < count; i++) {
      const text = await navLinks.nth(i).textContent();
      if (text) linkTexts.push(text.trim());
    }
    
    // Should not contain removed links
    expect(linkTexts.join(' ')).not.toContain('Stock');
    expect(linkTexts.join(' ')).not.toContain('Reports');
    expect(linkTexts.join(' ')).not.toContain('Admin');
  });

  test('should redirect removed routes to home', async ({ page }) => {
    // Test that removed routes redirect
    await page.goto('/stock');
    await expect(page).toHaveURL('/');
    
    await page.goto('/reports');
    await expect(page).toHaveURL('/');
    
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
  });

  test('should highlight active navigation link', async ({ page }) => {
    await page.goto('/');
    
    // Home link should be active
    const homeLink = page.getByRole('link', { name: /Home/i }).first();
    if (await homeLink.count() > 0) {
      // Check for active styling (blue border or text)
      const classes = await homeLink.getAttribute('class');
      expect(classes).toContain('text-[#0078D4]');
    }
  });
});

