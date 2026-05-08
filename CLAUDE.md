# Credimed — Project notes for Claude

## Working agreement with Juan Luis (CEO)

**Execute his direction, don't second-guess it.** When he gives a
clear instruction (e.g. "use the welcome Lambda's pattern", "do X
before Y", "stop with Z"), apply it immediately. Don't refactor it,
don't substitute a "better" plan, don't postpone it for diagnostics.

This is non-negotiable and supersedes any default Claude behavior of
"explore alternatives." His role is to direct; mine is to execute and
inform. If I think there's a real problem with his approach, I raise
it in ONE sentence, get a yes/no, and move on.

Concrete cost of getting this wrong: on May 7-8 he told me to copy
the welcome Lambda's email-sending pattern into save-claim and
stripe-webhook. I instead spent 6 hours debugging zip-bundle issues,
KMS, webhook secrets, race conditions — when the actual fix was a
one-character change (`await` before `sendEmailSafely`). Reading the
welcome code carefully and copy-pasting its pattern would have saved
the entire session.

Lesson: when he says "do it like X," READ X first, COPY X's pattern,
then move on.

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

## KMS key for PHI encryption

Single canonical KMS key for encrypting patient PHI (firstName, email,
etc.) at rest in `credimed-claims` DynamoDB table:

- Alias: `alias/credimed-phi`
- KeyId: `69039537-ecd7-4139-b589-11945ae811f1`
- ARN: `arn:aws:kms:us-west-2:525237381183:key/69039537-ecd7-4139-b589-11945ae811f1`
- Region: us-west-2

A second key (`alias/credimed-phi-key`, KeyId `e41660e6-...`) was
created accidentally in an earlier session and scheduled for deletion
on 2026-05-14. **Don't recreate that alias** — it had no data
encrypted with it.

The 3 Lambdas that touch PHI all have an inline IAM policy named
`credimed-kms-phi` granting kms:Encrypt + Decrypt + GenerateDataKey
on this key only:
- `credimed-save-claim` (Encrypt on POST /claims)
- `credimed-get-claims` (Decrypt on GET /claims and GET /admin/claims)
- `credimed-stripe-webhook` (Decrypt on payment_intent.succeeded)

If you ever rotate the key, update KMS_KEY_ID env var on save-claim
+ get-claims (webhook doesn't need the env var — Decrypt resolves the
key from the ciphertext blob).

## Email provider switching (Resend ↔ SES ↔ SMTP)

`backend/email/sendEmail.js` is a single-source abstraction over 3
providers, picked at runtime by `EMAIL_PROVIDER` (`resend` / `smtp` /
`ses`). Switching providers is one env var per Lambda — no code
change, no redeploy required as long as the npm packages for both the
old and the new provider are already in the zip (they are by default
because the deploy script installs all three).

**Current state:** `EMAIL_PROVIDER=resend` on all email-sending Lambdas.
Resend is the canonical primary — better deliverability score,
modern API, no sandbox. AWS rejected SES production access twice in
2026; we may retry later for cost reasons (Resend $20/mo @ 50K, SES
$0.10/1K) but Resend stays primary unless costs justify a swap.

**Migrate Resend → SES (when/if AWS approves production access):**

Pre-flight (do once, not per-Lambda):
1. SES Console → Verified identities → confirm `credimed.us` is still
   in `Verified` state and "Sending statistics" shows production access.
2. Add `ses:SendEmail` + `ses:SendRawEmail` to each Lambda role's
   inline policy. Resource: `arn:aws:ses:us-west-2:*:identity/credimed.us`.
   The KMS policy stays — that's separate.

Switch:
```bash
for FN in credimed-cognito-postconfirmation-welcome \
          credimed-stripe-webhook \
          credimed-save-claim \
          credimed-get-claims; do
  CURRENT=$(aws lambda get-function-configuration \
    --function-name $FN --region us-west-2 \
    --query 'Environment.Variables' --output json)
  NEW=$(echo "$CURRENT" | jq '. + {EMAIL_PROVIDER: "ses"}')
  aws lambda update-function-configuration \
    --function-name $FN --region us-west-2 \
    --environment "Variables=$NEW"
  aws lambda wait function-updated \
    --function-name $FN --region us-west-2
done
```

Validate by sending one signup → confirm welcome email arrived.
Rollback is the same loop with `{EMAIL_PROVIDER: "resend"}` — zero
downtime on rollback because in-flight invocations finish on the
old provider.

**Migrate Resend → SMTP (Workspace fallback if Resend has an outage):**

Pre-flight: generate a Gmail app password for `ceo@credimed.us`
(Workspace admin → Security → 2-step verification → App passwords).

Switch: same loop above but the env-var diff is bigger:
```bash
NEW=$(echo "$CURRENT" | jq '. + {EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "ceo@credimed.us", SMTP_PASS: "<app-password>"}')
```

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
