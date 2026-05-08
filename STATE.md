# Credimed — Production state snapshot

**Last updated:** 2026-05-08 (this is the file to read at the start of
a new Claude session — paste it back to me if I seem to have forgotten
context. It captures the exact deployed state so we don't waste time
rediscovering it.)

---

## AWS account + region

- Account: `525237381183`
- Region: `us-west-2` (Oregon) — single-region setup
- IAM admin user: `jlcsanchez` (you)

## Lambda functions (all in us-west-2)

| Function name | Source file | Purpose |
|---|---|---|
| `credimed-save-claim` | `backend/claims/credimed-claims.lambda.js` | POST /claims (creates row + admin alert + test-mode patient email) |
| `credimed-get-claims` | `backend/claims/credimed-claims.lambda.js` | GET /claims, GET /claims/:id, admin GET/PATCH |
| `credimed-stripe-webhook` | `backend/webhooks/credimed-stripe-webhook.lambda.js` | Stripe payment_intent events → marks paid + patient email |
| `credimed-payment` | (managed in console) | Creates Stripe PaymentIntent with metadata.claimId |
| `credimed-cognito-postconfirmation-welcome` | `backend/email/credimed-cognito-postconfirmation-welcome.js` | Welcome email after Cognito confirms signup |
| `credimed-cognito-presignup-autoconfirm` | `backend/email/credimed-cognito-presignup-autoconfirm.js` | Auto-confirms users at signup |
| `credimed-cognito-custom-message` | `backend/email/credimed-cognito-custom-message.js` | Branded password-reset / verification emails |
| `credimed-claim-submitter` | `backend/fax/credimed-claim-submitter.lambda.js` | Faxes the claim PDF to the carrier (no longer sends patient email — removed in commit b757493) |
| `credimed-users` | `backend/users/credimed-users.lambda.js` | User profile read/update |
| `credimed-ocr` | (managed in console) | Receipt OCR pre-fill |
| `credimed-clearinghouse` | `backend/clearinghouse/credimed-clearinghouse.lambda.js` | Future: insurer clearinghouse integration |
| `credimed-agents` | `backend/agents/credimed-agents.lambda.js` | (purpose TBD — verify before touching) |
| `credimed-status-followup` | `backend/email/credimed-status-followup.js` | 24h-after-payment "in review" follow-up email |

**Critical:** there is NO Lambda named `credimed-claims` — the routes
are split across `credimed-save-claim` (POST) and `credimed-get-claims`
(GET/PATCH/admin). Both share the same source file.

## Cognito

- User pool: `us-west-2_8GgqReC58`
- Admin group: `admin` (lowercase)
- Admin users: `ceo@credimed.us`, `ceo+test1@credimed.us` (and any
  others added via `aws cognito-idp admin-add-user-to-group`)
- Lambda triggers wired:
  - Pre-Sign-Up → `credimed-cognito-presignup-autoconfirm`
  - Post-Confirmation → `credimed-cognito-postconfirmation-welcome`
  - Custom Message → `credimed-cognito-custom-message`

## DynamoDB

- Table: `credimed-claims`
- PK: `claimId` (String, format `CMX-YYYY-XXXXXX`)
- GSI: `userId-createdAt-index` for per-user listing
- Currently 4 rows (all test data) as of 2026-05-08
- PHI fields encrypted at rest with KMS (see below)

## KMS — PHI encryption

- **Canonical key:**
  - Alias: `alias/credimed-phi`
  - KeyId: `69039537-ecd7-4139-b589-11945ae811f1`
  - ARN: `arn:aws:kms:us-west-2:525237381183:key/69039537-ecd7-4139-b589-11945ae811f1`
- A second key (`alias/credimed-phi-key`, KeyId `e41660e6-…`) was
  scheduled for deletion on **2026-05-14** (created by accident, no
  data was ever encrypted with it). Don't recreate that alias.
- IAM inline policy `credimed-kms-phi` granting Encrypt/Decrypt/
  GenerateDataKey is attached to:
  - `credimed-save-claim-role-5pvwsklc`
  - `credimed-get-claims-role-eildljn3`
  - `credimed-stripe-webhook-role-bde0hmdv`

## Stripe

- Mode: **LIVE** (no longer test)
- Live secret key: `sk_live_51TKqaEIuuxQyzILr...` (in payment +
  save-claim + stripe-webhook Lambda env vars)
- Webhook endpoint:
  - ID: `we_1TUcCSIuuxQyzILrfOBW6UZ0` (rotated 2026-05-08, replaces
    the original `we_1TSjt4...` whose secret got lost mid-session)
  - URL: `https://ghb6a2atbkzwxyzktxk5da5w7y0llegr.lambda-url.us-west-2.on.aws/`
  - Listening to: `payment_intent.succeeded`, `payment_intent.payment_failed`
  - Signing secret: applied to `credimed-stripe-webhook` env var
    `STRIPE_WEBHOOK_SECRET` — value starts with `whsec_nqWjLL...`
- Public business profile: needs cleanup (support email →
  support@credimed.us, statement descriptor, etc.) — open todo

## Email — Resend

- Provider: **Resend** (primary). SMTP (Workspace) reserved as
  fallback. SES rejected for production access twice — switching back
  is a 1 env var flip per Lambda (procedure documented in CLAUDE.md).
- API key: `re_TaD3avwN_FA3fgFkLHxk7EpqDkLTH59R8`
- Domain: `credimed.us` verified in Resend (DKIM/SPF auto-set via
  GoDaddy integration)
- FROM: `Credimed <ceo@credimed.us>`
- Templates: `backend/email/templates.js` (welcome, paymentReceivedAndFiled,
  inReview, paymentApproved, paymentDenied, refunded, adminNewClaimAlert,
  needMoreDocs, etc.)

### Email-sending Lambdas — required env vars

All four MUST share these vars (or emails go silently inconsistent —
welcome arrives, payment-received vanishes, etc.):

| Var | Value |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | `re_TaD3avwN_FA3fgFkLHxk7EpqDkLTH59R8` |
| `FROM_EMAIL` | `Credimed <ceo@credimed.us>` |

`credimed-save-claim` additionally needs:
- `KMS_KEY_ID=arn:aws:kms:us-west-2:525237381183:key/69039537-ecd7-4139-b589-11945ae811f1`
- `ADMIN_NOTIFY_EMAIL=ceo@credimed.us`
- `STRIPE_SECRET_KEY=sk_live_…` (for refund path when STRIPE_REFUND_ENABLED=true)

`credimed-get-claims` additionally needs:
- `KMS_KEY_ID=…` (for decrypting PHI on read)

`credimed-stripe-webhook` additionally needs:
- `STRIPE_SECRET_KEY=sk_live_…`
- `STRIPE_WEBHOOK_SECRET=whsec_…` (current: `whsec_nqWjLL…`)

### Zip-deploy gotcha

`backend/email/sendEmail.js` lazy-imports whichever provider is
selected. The deploy zip MUST install all three (`resend`, `nodemailer`,
`@aws-sdk/client-ses`) or `import('resend')` throws module-not-found
and `sendEmailSafely` swallows it silently. Bit us in May 2026; see
`backend/{webhooks,claims}/DEPLOY.md` for the correct npm install line.

## Frontend

- Hosted: GitHub Pages from `main` branch
- Domain: `credimed.us` (GoDaddy → CNAME to GitHub Pages)
- Bundler manifest: `<script type="__bundler/manifest">` in `index.html`
  — gzipped+base64; raw JSON must escape `<>&` to `<` `>`
  `&` to avoid breaking the wrapping script tag

## Active branches

- `claude/clinics-tijuana-cabos` — current working branch (clinic
  directory + email plumbing fixes through May 8)
- `main` — production

## Open todos

1. New claim end-to-end test now that whsec is set — confirm 3 emails:
   welcome (already validated), paymentReceivedAndFiled, adminNewClaimAlert
2. Refund the $19 test charge from Stripe dashboard
3. Apple Pay domain verification in Stripe (separate issue, not
   blocking launch — patient can pay with card)
4. Outreach materials: cold email/WhatsApp templates for partnership
   invitations + Google Sheet of clinic contacts
5. More clinic imports (Mexicali, Ensenada, La Paz, Loreto +
   additional Algodones pages)
6. Stripe public profile cleanup (support email, business name,
   statement descriptor)
7. When SES production access lands: switch EMAIL_PROVIDER=ses on
   the 4 email Lambdas (script in CLAUDE.md)

## Recently fixed (don't redo)

- **save-claim/get-claims ESM import bug** (May 8, evening, two
  rounds): when the handler is renamed to `index.mjs` at the zip
  root + the `email/` folder is copied as a sibling, every import
  pointing at `../email/*.js` resolves to `/var/` and crashes at
  INIT with `Cannot find module`. Two narrow sed passes (one for
  `sendEmail.js`, one for `templates.js`) wasted half a session;
  the durable fix is a SINGLE broad sed that targets the prefix
  `../email/` so every current and future file in that folder is
  caught:
  ```bash
  sed -i 's|"\.\./email/|"./email/|g' deploy/index.mjs
  sed -i "s|'\.\./email/|'./email/|g" deploy/index.mjs
  ```
  Lesson for any future Lambda that imports from a sibling shared
  module: rewrite the prefix, never the full filename.
- **Resend migration** (May 7-8): all email Lambdas now use the shared
  `sendEmail.js` provider abstraction; welcome email validated end-to-end
- **resend npm dep bundling** (May 8): claims-deploy.zip + webhook-deploy.zip
  now include `resend` and `nodemailer` (the missing dep caused silent
  email failures all session)
- **KMS PHI encryption** (May 8): single canonical key, IAM attached
  to 3 Lambdas, env var set on 2 Lambdas, old duplicate scheduled for
  deletion
- **Stripe webhook secret** (May 8): rotated via API, applied to Lambda
- **claim-submitter SES cleanup** (May 8): removed dead `emailPatient`
  function and SES SDK; carrier-response notifications fire from
  credimed-claims/updateStatus instead
- **Live Stripe key on save-claim** (May 8): swapped from `sk_test_` to
  `sk_live_` — refunds now work end-to-end
