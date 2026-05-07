# Credimed — Project notes for Claude

## AWS Lambda function names (us-west-2)

The Lambda function names in AWS DO NOT match the source filenames in
this repo. Always use the AWS function name when calling
`aws lambda update-function-code` / `update-function-configuration`,
not the filename. Confirmed via
`aws lambda list-functions --query 'Functions[?contains(FunctionName, \`credimed\`)].FunctionName'`.

| AWS Function Name                         | Source file in repo                                                | Handles                                                            |
|-------------------------------------------|--------------------------------------------------------------------|--------------------------------------------------------------------|
| `credimed-save-claim`                     | `backend/claims/credimed-claims.lambda.js`                         | **POST /claims** — creates claim row + fires `adminNewClaimAlert` (and `paymentReceivedAndFiled` in test mode). This is where the admin notification email originates. |
| `credimed-get-claims`                     | `backend/claims/credimed-claims.lambda.js` (same source, different routes) | GET /claims, GET /claims/:id, GET /admin/claims, PATCH /admin/claims/:id |
| `credimed-stripe-webhook`                 | `backend/webhooks/credimed-stripe-webhook.lambda.js`               | Stripe `payment_intent.succeeded` / `.payment_failed` → marks claim paid + fires `paymentReceivedAndFiled` to patient |
| `credimed-payment`                        | (not in repo — managed in console)                                  | Creates Stripe PaymentIntent with `metadata.claimId`               |
| `credimed-claim-submitter`                | `backend/fax/credimed-claim-submitter.lambda.js`                   | Fax / clearinghouse submission to insurer                          |
| `credimed-ocr`                            | (not in repo — managed in console)                                  | Receipt OCR pre-fill                                               |
| `credimed-users`                          | `backend/users/credimed-users.lambda.js`                           | User profile read/update                                           |
| `credimed-cognito-presignup-autoconfirm`  | `backend/email/credimed-cognito-presignup-autoconfirm.js`          | Cognito Pre-Sign-Up trigger — auto-confirms users                  |
| `credimed-cognito-postconfirmation-welcome` | `backend/email/credimed-cognito-postconfirmation-welcome.js`     | Cognito Post-Confirmation trigger — sends `welcome` email          |
| `credimed-cognito-custom-message`         | `backend/email/credimed-cognito-custom-message.js`                 | Cognito Custom Message trigger — branded reset/verification emails |

**Common mistake to avoid:** the source file is `credimed-claims.lambda.js`
but **there is no `credimed-claims` Lambda** — the routes are split
across `credimed-save-claim` (POST) and `credimed-get-claims` (GET/PATCH).
Deploying only one of them leaves the other on stale code.

## Email-sending Lambdas — required env vars

All three of these Lambdas must have IDENTICAL email config or the
patient sees inconsistent behavior (welcome arrives, payment-received
disappears, etc.):

- `credimed-cognito-postconfirmation-welcome`
- `credimed-stripe-webhook`
- `credimed-save-claim` (and ideally `credimed-get-claims` too if it
  ever ends up sending mail in the future)

Required env vars on each:
- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY=re_...`
- `FROM_EMAIL=Credimed <ceo@credimed.us>`

`credimed-save-claim` additionally needs:
- `ADMIN_NOTIFY_EMAIL=ceo@credimed.us` (without it the admin alert is silently skipped — see line 390 of `credimed-claims.lambda.js`)
- `KMS_KEY_ID=arn:aws:kms:us-west-2:...:key/...` (PHI encryption)

## Email Lambda zip-deploy gotcha

`backend/email/sendEmail.js` lazy-imports whichever provider
`EMAIL_PROVIDER` selects (`resend` / `nodemailer` / `@aws-sdk/client-ses`).
The deploy zip MUST install all three or the dynamic `import()` throws
module-not-found, `sendEmailSafely` swallows the error, and emails
silently disappear while the rest of the Lambda still returns 200.

When zip-deploying any of the email-sending Lambdas, run:
```bash
npm install resend nodemailer  # plus the per-Lambda deps
```

This bit us once already (May 2026) — Stripe sent its own receipt but
our branded "Payment received + claim filed" never arrived because
`credimed-stripe-webhook` and `credimed-save-claim` had been bundled
without `resend` in their `node_modules`.

## Repo branch context

Active feature branches as of latest session:
- `claude/clinics-tijuana-cabos` — current working branch (clinic
  directory v3 + email plumbing fixes)
- `main` — production; deploys to GitHub Pages
