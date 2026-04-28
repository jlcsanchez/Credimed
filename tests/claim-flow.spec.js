// @ts-check
/**
 * Claim flow tests — full happy-path through documents → estimate →
 * plan → before-sign → agreement → payment → submission-confirmed.
 *
 * Requires a TEST_USER_EMAIL + TEST_USER_PASSWORD env var and a
 * Cognito user in your dev pool with that credential. Stripe must be
 * in TEST mode (uses card 4242 4242 4242 4242).
 *
 * Skipped by default in CI until those secrets are set.
 *
 * To run:
 *   TEST_USER_EMAIL=test@credimed.us TEST_USER_PASSWORD=Test12345! \
 *     npx playwright test tests/claim-flow.spec.js
 */

const { test, expect } = require('@playwright/test');

const HAS_CREDS = !!(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);

test.describe('Authenticated claim flow', () => {

  test.skip(!HAS_CREDS, 'Set TEST_USER_EMAIL + TEST_USER_PASSWORD to run');

  test.beforeEach(async ({ page }) => {
    await page.goto('/app/login.html');
    /* Wait for the login form to be ready */
    await page.waitForSelector('#email, [type="email"]', { timeout: 10_000 });
    /* Click Sign in tab if needed (default is signup) */
    const signinTab = page.locator('a, button').filter({ hasText: /^Sign in$/i }).first();
    if (await signinTab.isVisible().catch(() => false)) {
      await signinTab.click();
    }
    await page.fill('[type="email"]', process.env.TEST_USER_EMAIL);
    await page.fill('[type="password"]', process.env.TEST_USER_PASSWORD);
    const submit = page.locator('button[type="submit"], button').filter({ hasText: /Sign in|Log in/i }).first();
    await submit.click();
    /* Welcome-back interstitial or direct redirect */
    await page.waitForURL(/\/app\/(dashboard|documents)/, { timeout: 15_000 });
  });

  test('dashboard renders user state', async ({ page }) => {
    await page.goto('/app/dashboard.html');
    /* Welcome-back greeting with first name. After our Apr 27-28 fixes,
       this is hydrated from Cognito attributes — never the demo
       'Lupita' fallback. */
    await expect(page.locator('body')).not.toContainText(/Lupita/);
    /* Either has claims (real data) or shows the empty state CTA */
    const hasEmpty = await page.locator('body').filter({ hasText: /No claims yet|Start a claim/i }).count();
    const hasClaims = await page.locator('[id^="pc-claim-id"], #dh-claim-id').count();
    expect(hasEmpty + hasClaims).toBeGreaterThan(0);
  });

  test('claims page renders without demo data', async ({ page }) => {
    await page.goto('/app/claims.html');
    /* Demo claim CMX-2026-0A4B29 / CMX-2026-DEMO9 must NOT appear */
    await expect(page.locator('body')).not.toContainText(/CMX-2026-0A4B29/);
    await expect(page.locator('body')).not.toContainText(/CMX-2026-DEMO9/);
  });

  test('profile renders Cognito identity', async ({ page }) => {
    await page.goto('/app/profile.html');
    /* Email from env should appear on the page */
    await expect(page.locator('body')).toContainText(process.env.TEST_USER_EMAIL);
    /* Demo founder placeholder must NOT appear */
    await expect(page.locator('body')).not.toContainText(/Juan Luis Sanchez/);
  });

  test('documents page upload dropzones render', async ({ page }) => {
    await page.goto('/app/documents.html');
    /* Three required dropzones */
    await expect(page.locator('label.dropzone[data-card="insurance"]')).toBeVisible();
    await expect(page.locator('label.dropzone[data-card="receipt"]')).toBeVisible();
    await expect(page.locator('label.dropzone[data-card="supporting"]')).toBeVisible();
  });

  /* TODO: full flow with file upload via setInputFiles, OCR mock,
     Stripe test card 4242 4242 4242 4242, and verifying
     submission-confirmed renders. Needs Cognito test user with
     persistent state we can reset, and either a real OCR mock or
     accepting the live OCR roundtrip. */

});
