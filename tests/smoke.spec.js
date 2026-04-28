// @ts-check
/**
 * Smoke tests — does the site render?
 *
 * These tests do NOT log in, do NOT upload files, do NOT touch Stripe
 * or Cognito. They just visit each public page and assert that the
 * expected content rendered. If any of these fail, the deploy is
 * fundamentally broken (404, JS error blocking render, missing asset).
 *
 * Authenticated-flow tests live in `tests/claim-flow.spec.js` and
 * require a TEST_USER_EMAIL + TEST_USER_PASSWORD env var.
 */

const { test, expect } = require('@playwright/test');

test.describe('Public pages render', () => {

  test('landing page loads with hero and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Credimed/i);
    /* Hero copy that should be present on every deploy */
    await expect(page.locator('body')).toContainText(/dental/i);
    /* Primary CTA must exist */
    const cta = page.locator('a, button').filter({ hasText: /Start|Get started|File|Estimate/i }).first();
    await expect(cta).toBeVisible();
  });

  test('about page loads with founder section', async ({ page }) => {
    await page.goto('/about.html');
    await expect(page).toHaveTitle(/About|Credimed/i);
    await expect(page.locator('body')).toContainText(/Juan Luis Sanchez/);
    /* Don't leak the personal email */
    await expect(page.locator('body')).not.toContainText(/jlcsanchezavila@gmail/);
  });

  test('FAQ page loads', async ({ page }) => {
    await page.goto('/faq.html');
    await expect(page.locator('body')).toContainText(/dental/i);
  });

  test('how-it-works page loads', async ({ page }) => {
    await page.goto('/how-it-works.html');
    await expect(page.locator('body')).toContainText(/upload|file|claim/i);
  });

  test('contact page loads', async ({ page }) => {
    await page.goto('/contact.html');
    await expect(page.locator('body')).toContainText(/support@credimed\.us/);
  });

  test('404 page renders for unknown URLs', async ({ page }) => {
    const resp = await page.goto('/this-page-does-not-exist.html');
    /* GitHub Pages serves 404.html with HTTP 404 status */
    expect(resp?.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/not found|404/i);
  });

});

test.describe('Legal pages render and are current versions', () => {

  test('Privacy policy v1.2 loads', async ({ page }) => {
    await page.goto('/legal/privacy.html');
    await expect(page.locator('body')).toContainText(/Privacy Policy/i);
  });

  test('Terms of Service v1.4 loads', async ({ page }) => {
    await page.goto('/legal/terms.html');
    await expect(page.locator('body')).toContainText(/Terms/i);
    /* Class-action waiver must be present */
    await expect(page.locator('body')).toContainText(/class action|class-action/i);
  });

  test('Notice of Privacy Practices loads', async ({ page }) => {
    await page.goto('/legal/notice-of-privacy-practices.html');
    await expect(page.locator('body')).toContainText(/HIPAA|Privacy Practices/i);
  });

  test('Cookie Policy loads', async ({ page }) => {
    await page.goto('/legal/cookies.html');
    await expect(page.locator('body')).toContainText(/cookie/i);
  });

  test('Disclosures loads', async ({ page }) => {
    await page.goto('/legal/disclosures.html');
    await expect(page.locator('body')).toContainText(/disclosure/i);
  });

  test('Service Agreement v1.9 loads (canonical)', async ({ page }) => {
    await page.goto('/legal/AGREEMENT_v1.9.html');
    await expect(page.locator('body')).toContainText(/Service Agreement/i);
    /* Version stamp visible */
    await expect(page.locator('body')).toContainText(/v1\.9/i);
  });

});

test.describe('Authenticated routes redirect when logged out', () => {

  /* require-auth.js bounces these to login.html if no Cognito session.
     We don't have a session in test, so visiting them should redirect
     us to /app/login.html. */
  const protectedRoutes = [
    /* documents.html will become public after Fase 1 funnel refactor —
       update this list when that ships. */
    '/app/dashboard.html',
    '/app/claims.html',
    '/app/profile.html',
    '/app/payment.html',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      /* Wait for require-auth.js to make the redirect decision */
      await page.waitForURL(/\/app\/login\.html/, { timeout: 10_000 });
      expect(page.url()).toContain('/app/login.html');
    });
  }

});

test.describe('Login screen', () => {

  test('login screen renders signup form by default', async ({ page }) => {
    await page.goto('/app/login.html');
    /* Both signup and signin tabs should be reachable */
    await expect(page.locator('body')).toContainText(/Create.*account|Sign up|Get started/i);
  });

  test('login screen has links to legal docs', async ({ page }) => {
    await page.goto('/app/login.html');
    /* Service Agreement + Privacy Policy must be linked at signup */
    const links = page.locator('a[href*="/legal/"]');
    expect(await links.count()).toBeGreaterThan(0);
  });

});
