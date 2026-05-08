# Stripe webhook — deploy guide

End-to-end setup for `credimed-stripe-webhook` Lambda. Once deployed,
every successful or failed payment in Stripe automatically updates
the corresponding claim in DynamoDB and (if SES is wired) emails the
patient.

## Why this matters

Today the payment flow ends at `submission-confirmed.html`. The user
sees a success screen but the **backend never finds out the payment
went through**. The claim sits in `submitted` status forever; you
have no record that money came in. This Lambda is the missing
acknowledgment.

## Prerequisites

Before starting, confirm:

- ✅ `credimed-payment` Lambda exists and creates Stripe PaymentIntents
- ✅ DynamoDB table `credimed-claims` exists in us-west-2
- ✅ AWS CLI access OR access to the AWS Console
- ✅ Stripe Dashboard access for the Credimed account

---

## Step 1 — Verify the payment Lambda sets `metadata.claimId`

This is the single most critical prerequisite. Without it the webhook
receives events but can't link them to claims.

1. AWS Console → Lambda → `credimed-payment` (or whatever your payment
   Lambda is called) → **Code**
2. Search for `paymentIntents.create` (Cmd/Ctrl+F)
3. Confirm the call includes `metadata.claimId`. It should look like:

   ```js
   stripe.paymentIntents.create({
     amount: 4900,
     currency: 'usd',
     metadata: { claimId: claimId }   // ← REQUIRED
   })
   ```

4. **If `metadata` is missing or doesn't include `claimId`:**
   - Add it. The `claimId` value should come from the request body
     (the frontend sends it in `backend.js` line 276).
   - Click **Implementar** to deploy.

5. Test once it's deployed: trigger a payment from the frontend,
   then in Stripe Dashboard → Payments → click the latest PaymentIntent
   → scroll to **Metadata**. You should see `claimId: CMX-...`.

If you skip this step, the webhook will work but every payment will
log `webhook_unmatched_payment` and require manual reconciliation.

---

## Step 2 — Create the webhook Lambda

1. AWS Console → **Lambda** (us-west-2)
2. **Crear función** (Create function)
3. Choose **Author from scratch**
4. **Function name:** `credimed-stripe-webhook`
5. **Runtime:** Node.js 20.x (or 22.x)
6. **Architecture:** x86_64
7. Permissions → **Create a new role with basic Lambda permissions**
   (we'll add more permissions in Step 4)
8. Click **Create function**

## Step 3 — Add the code

The webhook needs the main handler PLUS the shared `email/` module.

### File structure inside the Lambda

```
├── index.mjs              ← main handler
├── package.json           ← deps: stripe + AWS SDK + this is bundled
└── email/
    ├── templates.js
    └── sendEmail.js
```

### How to add files in the console

1. Lambda → `credimed-stripe-webhook` → **Code**
2. In the file tree on the left:
   - Right-click → **New file** → name it `index.mjs`
   - Paste contents of `backend/webhooks/credimed-stripe-webhook.lambda.js`
   - **Important**: change the imports from
     `'../email/sendEmail.js'` to `'./email/sendEmail.js'`
     (because `index.mjs` is at the root, not in `webhooks/`)
3. Right-click root → **New folder** → name `email`
4. Inside `email/`:
   - New file `templates.js` → paste from `backend/email/templates.js`
   - New file `sendEmail.js` → paste from `backend/email/sendEmail.js`
5. Click **Implementar** (orange Deploy button)

### Add the `stripe` dependency

The Lambda console doesn't `npm install` automatically. Two ways:

**Option A (easier) — use a Lambda Layer**

1. AWS Console → Lambda → **Layers** (left menu) → **Create layer**
2. Name: `stripe-node`
3. Upload a zip with `node_modules/stripe` inside
   (or use a public layer like
   `arn:aws:lambda:us-west-2:770693421928:layer:Klayers-p20-stripe:1`
   — verify ARN is current)
4. Compatible runtimes: Node.js 20.x
5. Save the layer
6. Back to your Lambda → **Layers** section → **Add a layer** → choose `stripe-node`

**Option B (more setup) — zip-deploy from local**

```bash
cd backend/webhooks
mkdir -p deploy && cp credimed-stripe-webhook.lambda.js deploy/index.mjs
cp -r ../email deploy/
cd deploy && npm init -y && npm install \
  stripe \
  @aws-sdk/client-dynamodb @aws-sdk/client-kms @aws-sdk/client-ses \
  resend nodemailer
zip -r ../webhook-deploy.zip .
# Upload webhook-deploy.zip via Lambda console → Code → Upload from .zip
```

`resend` and `nodemailer` are required by `email/sendEmail.js` because
it lazy-imports whichever provider `EMAIL_PROVIDER` selects at runtime.
Without them in the zip the dynamic `import('resend')` throws a module-
not-found error that `sendEmailSafely` swallows — the webhook returns
200 to Stripe but no patient email ever goes out. (Same trap applies
to `credimed-claims`; check its DEPLOY.md too.)

For Option B, fix the `package.json` to include `"type": "module"` so
ESM imports work.

## Step 4 — IAM permissions

The Lambda needs to:
- Update DynamoDB
- Decrypt the email/firstName fields (KMS)
- Send via SES

Go to Lambda → `credimed-stripe-webhook` → **Configuration** →
**Permissions** → click the role name → **Add permissions** →
**Create inline policy** → JSON tab. Paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoUpdate",
      "Effect": "Allow",
      "Action": ["dynamodb:UpdateItem", "dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:us-west-2:*:table/credimed-claims"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-west-2:*:key/*"
    },
    {
      "Sid": "SESSend",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:us-west-2:*:identity/credimed.us"
    }
  ]
}
```

Name it `credimed-webhook-permissions` and create.

## Step 5 — Set environment variables

Lambda → `credimed-stripe-webhook` → **Configuration** →
**Environment variables** → **Edit** → **Add environment variable**:

| Key                     | Value                                       |
| ----------------------- | ------------------------------------------- |
| `STRIPE_SECRET_KEY`     | same `sk_test_*` or `sk_live_*` as payment Lambda |
| `STRIPE_WEBHOOK_SECRET` | leave blank for now — added in Step 7       |
| `EMAIL_PROVIDER`        | `resend` (or `smtp` / `ses` — must match the welcome Lambda) |
| `RESEND_API_KEY`        | `re_...` (only when `EMAIL_PROVIDER=resend`) |
| `FROM_EMAIL`            | `Credimed <ceo@credimed.us>`                |

The email vars must match what the welcome Lambda already uses,
otherwise the patient gets the welcome email through Resend on
signup but no payment-received email after paying — which is the
exact discrepancy this guide is trying to prevent.

Save.

## Step 6 — Create the Function URL

1. Lambda → `credimed-stripe-webhook` → **Configuration** →
   **Function URL** → **Create function URL**
2. **Auth type:** `NONE` (Stripe verifies via signature, not IAM)
3. **CORS:** leave disabled (Stripe doesn't need CORS)
4. **Invoke mode:** `BUFFERED`
5. Click **Save**
6. Copy the URL — looks like
   `https://abc123xyz.lambda-url.us-west-2.on.aws/`

## Step 7 — Register the webhook in Stripe

1. Open Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add an endpoint**
3. **Endpoint URL:** paste the Function URL from Step 6
4. **Description:** `Credimed claim payment events`
5. **Events to send:** click **Select events** → check:
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
6. Click **Add endpoint**
7. On the endpoint detail page → **Signing secret** → **Reveal** →
   copy the value (starts with `whsec_`)
8. Go back to Lambda → Environment variables → set
   `STRIPE_WEBHOOK_SECRET` = the `whsec_...` value
9. Save and **Implementar**

## Step 8 — Test the webhook

In Stripe Dashboard → your webhook endpoint → **Send test webhook**:

1. Choose `payment_intent.succeeded`
2. Click **Send test webhook**
3. The dashboard shows a 200 response

Then in CloudWatch → log group `/aws/lambda/credimed-stripe-webhook`:

You should see:
```
{"event":"webhook_received","type":"payment_intent.succeeded",...}
{"event":"webhook_unmatched_payment",...}
```

Unmatched is expected for the test event because the test PaymentIntent
doesn't have a real `claimId`. That's fine — what matters is the
signature verification passed.

## Step 9 — Real end-to-end test

1. From the frontend, make a real payment with the test card
   `4242 4242 4242 4242 · 12/29 · 123`
2. Wait 5 seconds
3. CloudWatch → check `webhook_payment_succeeded` event with the
   real `claimId`
4. DynamoDB → table `credimed-claims` → find the claim → confirm:
   - `paymentStatus = "paid"`
   - `paidAt` is set
   - `stripePaymentIntentId` matches the Stripe PI
5. Patient inbox → confirm "Payment received" email arrived
   (only if Step 5 of `email/DEPLOY.md` is done)

## What's logged

Every webhook event produces structured CloudWatch JSON. Useful queries
in CloudWatch Logs Insights:

```
filter event = "webhook_payment_succeeded"
| stats count(*) by bin(1d)
```

```
filter event = "webhook_signature_invalid"
| limit 50
```

```
filter event = "webhook_unmatched_payment"
| sort @timestamp desc
| limit 20
```

The third query is critical — every result here is a payment whose
metadata.claimId was missing. Either the payment Lambda regressed, or
someone hit the URL directly without going through the proper flow.

## Troubleshooting

| Symptom                                   | Fix                                                            |
| ----------------------------------------- | -------------------------------------------------------------- |
| Stripe shows 401/403 on test webhook      | Function URL auth type is wrong — should be NONE               |
| `webhook_signature_invalid` in logs       | `STRIPE_WEBHOOK_SECRET` env var is wrong (copy/paste mistake)  |
| `webhook_unmatched_payment` always        | Payment Lambda not setting `metadata.claimId` (Step 1)         |
| `Cannot find module 'stripe'`             | Stripe layer not attached or zip didn't include node_modules   |
| Email never arrives                       | SES sandbox / SES IAM / FROM_EMAIL not verified                |
| 500 on every event                        | Check IAM — DynamoDB or KMS permission missing                 |

## Cost

- Lambda: free tier covers thousands of webhook invocations/month
- Stripe: free, webhook delivery is included
- Bandwidth: negligible

Effectively $0 until you do millions of payments.

---

## Order of operations for tomorrow

If you have 30 minutes, do them in this order:

1. **Step 1** (5 min) — verify metadata.claimId in payment Lambda
2. **Steps 2–6** (15 min) — create Lambda, add code, IAM, env, Function URL
3. **Step 7** (3 min) — register in Stripe + grab webhook secret
4. **Step 8** (2 min) — Stripe test webhook → check CloudWatch
5. **Step 9** (5 min) — real payment with 4242 card → verify all flows

If something goes sideways, mándame screenshot del CloudWatch log y
seguimos.
