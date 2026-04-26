# Email notifications — deploy guide

End-to-end setup for HIPAA-safe transactional emails using AWS SES,
called from `credimed-claims` (status updates) and `credimed-stripe-webhook`
(payment success).

## Architecture

```
admin updates status         Stripe sends webhook
        │                            │
        ▼                            ▼
credimed-claims         credimed-stripe-webhook
        │                            │
        └──────────┬─────────────────┘
                   │
                   ▼
        sendEmailSafely() helper
        (backend/email/sendEmail.js)
                   │
                   ▼
              AWS SES
                   │
                   ▼
              patient inbox
```

No new Lambda. Each existing Lambda imports the email helper.

---

## Step 1 — Verify the sender domain in SES

1. AWS Console → **SES** (region: us-west-2)
2. Left menu → **Verified identities** → **Create identity**
3. Identity type: **Domain**
4. Domain: `credimed.us`
5. Easy DKIM: leave default (RSA 2048)
6. Click **Create identity**
7. AWS shows you 3 CNAME records — add them to your DNS provider
   (GoDaddy / Cloudflare / wherever credimed.us lives)
8. Wait 5–30 minutes for verification. Status will go to **Verified**.

> **Why a domain (not just an email)?** Verifying the whole domain lets
> you send from any address (`hello@`, `support@`, `noreply@`) without
> verifying each one separately. You also unlock DMARC alignment which
> reduces spam-folder rates.

## Step 2 — Move SES out of sandbox

By default SES is in **sandbox mode**: you can only send to
*verified* recipients (i.e. yourself). To send to real patients you
need production access.

1. SES → **Account dashboard** → **Request production access**
2. Use case: Transactional
3. Mail type: Transactional
4. Website URL: `https://www.credimed.us`
5. Use-case description (paste this):
   > Credimed is a US dental insurance reimbursement service. We send
   > transactional emails to patients confirming claim submission,
   > payment receipt, and insurer status updates. Recipients are
   > authenticated users who created an account on credimed.us. We
   > follow CAN-SPAM and HIPAA-safe practices: emails contain no PHI,
   > only a generic claim ID and a link to the authenticated app.
6. Submit. AWS approves within 24 hours typically.

## Step 3 — Wire IAM permissions

Both Lambdas need permission to send mail. Add this inline policy to
the IAM role of `credimed-claims` AND `credimed-stripe-webhook`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESSendFromCredimed",
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": [
      "arn:aws:ses:us-west-2:*:identity/credimed.us",
      "arn:aws:ses:us-west-2:*:identity/*@credimed.us"
    ]
  }]
}
```

## Step 4 — Set Lambda env vars

For both Lambdas (`credimed-claims` and `credimed-stripe-webhook`):

| Key          | Value                                |
| ------------ | ------------------------------------ |
| `FROM_EMAIL` | `Credimed <hello@credimed.us>`       |
| `AWS_REGION` | `us-west-2` (already set)            |

## Step 5 — Deploy the email helper alongside each Lambda

The helper lives in `backend/email/`. Both Lambdas `import` it
relatively (`../email/sendEmail.js`). For Lambda console deploys
you have two options:

### Option A — Add as files in the Lambda console (recommended)

The Lambda console editor lets you create folders and additional files.

For `credimed-claims`:

1. Lambda → `credimed-claims` → Code
2. In the file tree on the left, click **"+"** → **New folder** → name it `email`
3. Inside `email/`, create `templates.js` → paste contents of `backend/email/templates.js`
4. Inside `email/`, create `sendEmail.js` → paste contents of `backend/email/sendEmail.js`
5. The folder structure must look like:
   ```
   ├── index.mjs            (the main Lambda — paste credimed-claims.lambda.js here)
   └── email/
       ├── templates.js
       └── sendEmail.js
   ```
6. **Important:** the import path in the main file is
   `from "../email/sendEmail.js"` — but since `index.mjs` is at the
   ROOT (not in a subfolder), change it to `from "./email/sendEmail.js"`.
   Same for the templates import.
7. Click **Deploy** (orange button)

Repeat the same steps for `credimed-stripe-webhook`.

### Option B — Zip deploy

If you prefer not to manually create files in the console:

```bash
cd backend
zip -r credimed-claims.zip claims/credimed-claims.lambda.js email/
# Upload the zip via Lambda console → Code → Upload from .zip
```

## Step 6 — Test the wiring

1. **Self-test (sandbox)** — verify your own email in SES first
   (`jlcsanchezavila@gmail.com`), then in the admin dashboard change a
   claim's status. You should receive an email within 30 seconds.

2. **Production test** — once SES is out of sandbox, change the status
   of a real test claim. Check CloudWatch logs of `credimed-claims`
   for the `email_sent` audit log entry.

3. **Webhook test** — in the Stripe Dashboard → Webhooks → click your
   endpoint → **Send test webhook** → choose `payment_intent.succeeded`.
   Check `credimed-stripe-webhook` logs.

## Step 7 — DMARC / SPF / DKIM (anti-spam)

Once the SES domain is verified, also add to credimed.us DNS:

```
TXT  _dmarc.credimed.us     "v=DMARC1; p=none; rua=mailto:dmarc-reports@credimed.us"
TXT  credimed.us            "v=spf1 include:amazonses.com ~all"
```

Without these, ~30% of your emails land in spam folders. With them,
inbox delivery is reliable.

---

## What gets sent and when

| Trigger                                                          | Template          | Subject                              |
| ---------------------------------------------------------------- | ----------------- | ------------------------------------ |
| Patient completes payment (Stripe webhook)                       | `paymentReceived` | Payment received · {claimId}         |
| Admin changes status to `submitted` (rare — usually auto on save)| `claimSubmitted`  | We received your claim · {claimId}   |
| Admin changes status to `in-review`                              | `statusInReview`  | Your claim is in review · {claimId}  |
| Admin changes status to `approved`                               | `statusApproved`  | Claim approved · {claimId}           |
| Admin changes status to `paid`                                   | `statusPaid`      | Refund issued · {claimId}            |
| Admin changes status to `denied`                                 | `statusDenied`    | Update on your claim · {claimId}     |

All emails contain only:
- Patient's first name (already known to them)
- The opaque `claimId` (e.g. `CMX-2026-D008` — no clinical meaning)
- A link to the authenticated app where the detail lives

PHI never enters the email body. This is the HIPAA-safe pattern.

## Monitoring

CloudWatch Logs Insights query to see email activity across both Lambdas:

```
filter event = "email_sent" or event = "email_failed"
| stats count(*) by eventType, bin(1h)
```

## Cost

SES pricing (us-west-2, April 2026):
- $0.10 per 1,000 emails sent
- First 62,000 emails/month free if Lambda sends them

For 1,000 patients/month getting ~3 emails each (3,000 emails):
**$0.30/month**. Negligible.
