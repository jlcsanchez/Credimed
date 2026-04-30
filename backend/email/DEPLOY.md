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
| `FROM_EMAIL` | `Credimed <ceo@credimed.us>` *(switch to `hello@credimed.us` once that alias exists in Google Workspace)* |
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
   (`ceo@credimed.us`), then in the admin dashboard change a
   claim's status. You should receive an email within 30 seconds.

2. **Production test** — once SES is out of sandbox, change the status
   of a real test claim. Check CloudWatch logs of `credimed-claims`
   for the `email_sent` audit log entry.

3. **Webhook test** — in the Stripe Dashboard → Webhooks → click your
   endpoint → **Send test webhook** → choose `payment_intent.succeeded`.
   Check `credimed-stripe-webhook` logs.

## Step 7 — EventBridge Scheduler (24h "in review" follow-up)

The Stripe webhook now creates a one-time scheduled task each time a
payment succeeds: 24 hours later the scheduler invokes
`credimed-status-followup` which sends the "in review" email. Setup is
a one-time AWS console exercise.

### 7a. Create the schedule group

EventBridge → Scheduler → **Schedule groups** → **Create**
- Name: `credimed-claim-followups`
- Tags: `app=credimed`

The group is a logical container so you can list / wipe schedules in
bulk later if you ever need to re-test.

### 7b. Create the IAM role the scheduler assumes

IAM → Roles → **Create role**
- Trusted entity: **Custom trust policy**, paste:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "scheduler.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }
  ```
- Permissions policy (inline), name it `invoke-status-followup`:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-west-2:*:function:credimed-status-followup"
    }]
  }
  ```
- Role name: `credimed-scheduler-invoke-role`
- Copy the role ARN — needed for the webhook env var.

### 7c. Deploy the `credimed-status-followup` Lambda

Lambda → Create function
- Name: `credimed-status-followup`
- Runtime: Node.js 20.x
- Architecture: arm64
- Execution role: create new with these inline permissions:
  - `dynamodb:GetItem` on `arn:aws:dynamodb:us-west-2:*:table/credimed-claims`
  - `kms:Decrypt` on the customer-managed KMS key used to encrypt PII
  - `ses:SendEmail`, `ses:SendRawEmail` on the verified domain
  - `logs:CreateLogStream`, `logs:PutLogEvents`

In the code editor:
1. Paste `backend/email/credimed-status-followup.js` into `index.mjs`
2. Add `email/` folder with `sendEmail.js` and `templates.js` (same as Step 5 Option A)
3. Update the import in `index.mjs`: `from './sendEmail.js'` → `from './email/sendEmail.js'`
4. Deploy

Env vars on this Lambda:
- `AWS_REGION` = `us-west-2`
- `FROM_EMAIL` = `Credimed <ceo@credimed.us>` (or whichever verified sender)

### 7d. Wire the webhook to the scheduler

Add three env vars to `credimed-stripe-webhook`:
- `IN_REVIEW_LAMBDA_ARN` — full ARN of `credimed-status-followup`
- `SCHEDULER_ROLE_ARN`   — ARN of `credimed-scheduler-invoke-role`
- `SCHEDULER_GROUP`      — `credimed-claim-followups`

Add to the webhook's IAM role:
```json
{
  "Effect": "Allow",
  "Action": "scheduler:CreateSchedule",
  "Resource": "arn:aws:scheduler:us-west-2:*:schedule/credimed-claim-followups/*"
},
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "<ARN of credimed-scheduler-invoke-role>"
}
```

### 7e. Test end-to-end

1. Run a `payment_intent.succeeded` test from the Stripe dashboard
2. EventBridge → Scheduler → Schedules → `credimed-claim-followups` → confirm
   one schedule appears named `inreview-<claimId>` with fire time = now + 24h
3. To shortcut testing, edit that schedule's fire time to `now + 2 minutes`,
   then watch CloudWatch logs of `credimed-status-followup`
4. Email should arrive shortly after fire time

The schedule auto-deletes after firing (`ActionAfterCompletion: DELETE`).

### Cost

EventBridge Scheduler: $1.00 per million scheduled events. At 1k claims/mo
the scheduler bill is well under $0.01/mo.

---

## Step 8 — DMARC / SPF / DKIM (anti-spam)

Once the SES domain is verified, also add to credimed.us DNS:

```
TXT  _dmarc.credimed.us     "v=DMARC1; p=none; rua=mailto:dmarc-reports@credimed.us"
TXT  credimed.us            "v=spf1 include:amazonses.com ~all"
```

Without these, ~30% of your emails land in spam folders. With them,
inbox delivery is reliable.

---

## What gets sent and when

| Trigger                                                          | Template                  | Subject                                      |
| ---------------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| Cognito Post-Confirmation (signup)                               | `welcome`                 | Welcome to Credimed — your account is ready  |
| Patient completes payment (Stripe webhook)                       | `paymentReceivedAndFiled` | Payment received and claim filed · {claimId} |
| 24h after payment (EventBridge Scheduler → status-followup λ)    | `statusInReview`          | Your claim is in review · {claimId}          |
| Admin marks claim as `needs-docs`                                | `needMoreDocs`            | Action needed — please upload {what} · {id}  |
| Admin marks claim `approved` (manual, after EOB arrives by fax)  | `statusApproved`          | Claim approved · {claimId}                   |
| Admin marks claim `paid` (manual)                                | `statusPaid`              | Refund issued · {claimId}                    |
| Admin marks claim `denied` (manual)                              | `statusDenied`            | Update on your claim · {claimId}             |
| Admin marks claim `refunded` (money-back guarantee triggered)    | `refundIssued`            | Money-back refund processed · {claimId}      |

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
