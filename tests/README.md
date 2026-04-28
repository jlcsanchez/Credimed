# Credimed tests

Playwright tests against the live `credimed.us` deployment.

## Quick start

```bash
# One-time setup
npm install
npm run install-browsers

# Run all smoke tests against credimed.us
npm run test:smoke

# Run with browser UI visible (debug)
npm run test:headed

# Open the test runner UI for interactive debugging
npm run test:ui

# View the HTML report after a run
npm run test:report
```

## Layered tests

### `tests/smoke.spec.js` — runs anywhere, no credentials

Visits public pages (landing, about, FAQ, legal docs, login screen) and
authenticated routes (dashboard, claims, profile, payment) WITHOUT a
session — those should redirect to login. Catches deploy regressions
like 404s, broken HTML, missing assets, JS errors that block render.

Runs in CI on every push.

### `tests/claim-flow.spec.js` — needs Cognito test user

Logs in with a real Cognito user, validates the dashboard / claims /
profile / documents pages render with that user's state. Skipped if
`TEST_USER_EMAIL` + `TEST_USER_PASSWORD` env vars aren't set.

```bash
TEST_USER_EMAIL=test@credimed.us \
TEST_USER_PASSWORD='Test12345!' \
  npm run test
```

To create a test user: sign up via `credimed.us/app/login.html` with
a known email + password, complete the OTP step, leave the account
empty (no claims). The claim-flow tests don't submit a real payment so
the user can be re-used indefinitely.

## CI

`.github/workflows/test.yml` runs the smoke tests on every push to
`main` and on every PR. Test user credentials live in repo secrets
`PLAYWRIGHT_TEST_USER_EMAIL` / `PLAYWRIGHT_TEST_USER_PASSWORD` —
gated to the `production` environment so PRs from forks can't read
them.

## Adding a new test

For a UI regression: add an assertion in the matching `describe` block
of `smoke.spec.js`. Keep it under 10 seconds, with a clear failure
message.

For a flow change: extend `claim-flow.spec.js` with the full sequence
(login → action → assert side effect on dashboard / claims). If the
flow involves Stripe, use card `4242 4242 4242 4242` (Stripe test mode
must be on).

For a backend integration test (Lambda response shape, EDI parser,
clearinghouse): write a Node test in `backend/<service>/test/` — those
run separately from Playwright and don't need the browser.

## Local server (optional)

To run the tests against a local copy of the site instead of
production, serve the repo on `http://localhost:8080` (Python
`python3 -m http.server 8080` works) and:

```bash
CREDIMED_BASE_URL=http://localhost:8080 npm test
```

Note: anything that talks to AWS (Cognito, Lambda, S3, Stripe) still
hits the real services — local serving only avoids the production
GitHub Pages build.
