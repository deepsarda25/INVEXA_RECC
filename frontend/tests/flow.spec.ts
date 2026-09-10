import { test, expect } from "@playwright/test";

test.describe("Invexa Frontend Flow", () => {
  const username = `e2e_user_${Date.now()}`;
  const email = `e2e_${Date.now()}@example.com`;
  const password = "password123";

  test("should allow a user to register and login", async ({ page }) => {
    await page.goto("http://localhost:5173");

    // Switch to Register tab
    await page.click('text="Create Account"');

    // Fill registration form
    await page.fill('placeholder=" architect@sovereign.exchange"', email); // Note the space in placeholder if it's there, or just use label
    await page.fill('placeholder="@username"', username);
    await page.fill('autoComplete="new-password"', password);

    // Submit
    await page.click('text="Initialize Session"');

    // Should be redirected or show dashboard
    await expect(page.locator("text=Invexa")).toBeVisible();
    await expect(page.locator("text=Dashboard")).toBeVisible();
  });

  test("should navigate through tabs", async ({ page }) => {
    // Perform login first (or assume state from previous test if using same page, 
    // but cleaner to login for each)
    await page.goto("http://localhost:5173");
    
    await page.fill('placeholder="@username"', username);
    await page.fill('placeholder="••••••••"', password);
    await page.click('text="Initialize Session"');

    // Switch to Analytics (Portfolio)
    await page.click('text="Analytics"');
    await expect(page.locator("text=Portfolio Value")).toBeVisible();

    // Switch to Terminal (Orders)
    await page.click('text="Terminal"');
    await expect(page.locator("text=Execution Terminal")).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await page.fill('placeholder="@username"', username);
    await page.fill('placeholder="••••••••"', password);
    await page.click('text="Initialize Session"');

    // Click logout
    await page.click('text="Logout"');

    // Should be back at login page
    await expect(page.locator('text="Create Account"')).toBeVisible();
  });
});
