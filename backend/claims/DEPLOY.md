# Credimed claims Lambda — deploy guide

This Lambda powers all claim endpoints used by the dashboard, the
patient flow, and admin:

| Method | Path                  | Caller       | Auth                  |
|--------|-----------------------|--------------|-----------------------|
| POST   | `/claims`             | Patient      | JWT (any signed-in)   |
| GET    | `/claims`             | Patient      | JWT (any signed-in)   |
| GET    | `/claims/:id`         | Patient      | JWT (must own claim)  |
| GET    | `/admin/claims`       | Admin        | JWT + `admin` group   |
| PATCH  | `/admin/claims/:id`   | Admin        | JWT + `admin` group   |

`POST /claims` is the persistence path: when the patient lands on
`submission-confirmed.html`, the page POSTs the in-memory claim
(localStorage) to this Lambda, which encrypts PHI with KMS and writes
to DynamoDB. Without that POST, the claim only exists on the user's
device and disappears when storage is cleared (iOS Safari ITP purges
localStorage after 7 days of no visit).

## Files

```
backend/claims/
├── credimed-claims.lambda.js   ← entry point (handler())
├── package.json                 ← AWS SDK v3 deps
└── DEPLOY.md                    ← this file
```

## One-time AWS setup

### 1. Cognito groups

Cognito → User pools → `us-west-2_8GgqReC58` → Groups → Create group:

- Group name: **`admin`** (lowercase, exact)
- Precedence: 1
- IAM role: leave blank

Then add admin users to this group (Users tab → click user → Add to group).
Their next-issued ID token will carry `cognito:groups: ["admin"]`.

### 2. DynamoDB table

Create a table named `credimed-claims`:

- Partition key: `claimId` (String)
- Billing mode:  On-demand

For per-user listing (`GET /claims`) add a GSI:

- GSI name: `userId-createdAt-index`
- Partition key: `userId`     (String)  — Cognito `sub`
- Sort key:      `createdAt`  (String)  — ISO timestamp
- Project all attributes

(Admin list path uses Scan — fine until ~500 claims; there's a TODO
in `LAUNCH.md` to add a status-indexed GSI when volume justifies it.)

### 2b. KMS key for PHI

Create a Customer-Managed Key (KMS → Customer managed keys → Create):

- Key type: Symmetric
- Key usage: Encrypt and decrypt
- Alias: `alias/credimed-phi`
- Key administrators: your IAM user
- Key users: leave blank for now (the Lambda role gets access via the
  inline IAM policy in step 3, not via the key policy's "key users"
  field)

Copy the key's ARN — you'll set it as `KMS_KEY_ID` in step 5. The
same key is used by the webhook Lambda to decrypt fields when sending
patient emails, so its ARN must be reachable from both Lambda roles.

### 3. Lambda function

1. AWS Console → Lambda → Create function → Author from scratch
2. Function name: `credimed-claims`
3. Runtime: Node.js 20.x
4. Architecture: arm64 (cheaper)
5. Permissions: create a new role, then attach the inline policy below
   to give it DynamoDB read/write to the claims table:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoRW",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-west-2:YOUR_ACCOUNT_ID:table/credimed-claims",
        "arn:aws:dynamodb:us-west-2:YOUR_ACCOUNT_ID:table/credimed-claims/index/*"
      ]
    },
    {
      "Sid": "KMSPHI",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:us-west-2:YOUR_ACCOUNT_ID:key/YOUR_KMS_KEY_ID"
    }
  ]
}
```

### 4. Bundle and upload

The handler imports `sendEmailSafely` from the shared `email/` module
(used for `adminNewClaimAlert` on every POST and the test-mode
`paymentReceivedAndFiled` to the patient). The zip therefore needs:

- the handler renamed to `index.mjs` at the zip root
- the `email/` folder copied in as a sibling (so the import path
  `../email/sendEmail.js` resolves — see note below)
- a root `package.json` with `"type": "module"` and the `resend` /
  `nodemailer` deps that `sendEmail.js` lazy-imports at runtime

```bash
cd backend/claims
mkdir -p deploy && cp credimed-claims.lambda.js deploy/index.mjs
cp -r ../email deploy/
# Inside index.mjs change "../email/sendEmail.js" → "./email/sendEmail.js"
# (the source uses ../ because that's the repo layout; deployment
#  flattens the handler to the root, so the relative path shifts.)
cd deploy && npm init -y && npm pkg set type=module && npm install \
  @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-kms \
  resend nodemailer
zip -r ../credimed-claims.zip .
```

Upload `credimed-claims.zip` via the Lambda Code section. Set the
handler to `index.handler`.

> Why `resend` + `nodemailer` even though `EMAIL_PROVIDER=resend`?
> `sendEmail.js` lazy-imports whichever provider the env var picks.
> If the package isn't in the zip, the dynamic `import('resend')`
> throws module-not-found, `sendEmailSafely` swallows it, and the
> patient + admin emails silently disappear while the claim still
> writes to DynamoDB.

### 5. Environment variables

Configuration → Environment variables:

| Key                       | Value                                         | Required |
|---------------------------|-----------------------------------------------|----------|
| `KMS_KEY_ID`              | ARN of the `alias/credimed-phi` key (step 2b) | yes — POST fails without it |
| `ADMIN_NOTIFY_EMAIL`      | `ceo@credimed.us`                             | yes — required for `adminNewClaimAlert` to fire |
| `EMAIL_PROVIDER`          | `resend` (must match the welcome Lambda)      | yes — defaults to `ses` (sandboxed) without it |
| `RESEND_API_KEY`          | `re_…` (only when `EMAIL_PROVIDER=resend`)    | yes when provider=resend |
| `FROM_EMAIL`              | `Credimed <ceo@credimed.us>`                  | yes — must be a verified sender |
| `STRIPE_REFUND_ENABLED`   | `false` (flip to `true` on)                   | no — defaults off |
| `STRIPE_SECRET_KEY`       | `sk_test_…` or `sk_live_…`                    | only when `STRIPE_REFUND_ENABLED=true` |

The email vars must match the welcome Lambda's vars exactly —
otherwise welcome arrives via Resend at signup but the admin alert
on a real claim gets lost in the SES sandbox.

(The AWS_REGION env var is auto-set by Lambda — don't override it.)

**Stripe Refund — money-back guarantee path.** When admin marks a
claim `refunded`:

- `STRIPE_REFUND_ENABLED=false` (default): the function updates DynamoDB
  + sends the patient the refund email, but **does not move money**.
  Identical to today's behavior. Safe to leave on while you test the
  rest of the flow.
- `STRIPE_REFUND_ENABLED=true`: the function calls Stripe's `/v1/refunds`
  with idempotency-key `refund_<claimId>` (so a double-click never
  charges twice), and only proceeds with the DB update + email if
  Stripe accepts the refund. If Stripe rejects, the admin sees a 502
  and nothing changes — re-try after fixing the issue.

**Pre-flip checklist (before setting STRIPE_REFUND_ENABLED=true):**
1. Wire the same `STRIPE_SECRET_KEY` value already used by the payment
   Lambda. They must match — refunds need the secret key from the
   account that originally charged.
2. Test with a single sandbox claim end-to-end: pay $1 with a test
   card → admin marks `refunded` → confirm Stripe Dashboard shows the
   refund + the claim record gets `stripeRefundId`.
3. Confirm the patient dashboard shows the refund correctly.

### 6. API Gateway routes

Use your existing HTTP API. Add the routes below, all protected by
the existing JWT authorizer:

- `POST /claims`             → integration: `credimed-claims` Lambda  ← NEW (the disappearing-claim fix)
- `GET /claims`              → integration: `credimed-claims` Lambda
- `GET /claims/{id}`         → integration: `credimed-claims` Lambda
- `GET /admin/claims`        → integration: `credimed-claims` Lambda
- `PATCH /admin/claims/{id}` → integration: `credimed-claims` Lambda
- `OPTIONS /claims`          → for CORS preflight (or enable CORS at the API level)
- `OPTIONS /admin/claims`    → for CORS preflight

For each, **enable JWT authorization** and select your User Pool. Save
each route, then deploy the API to your existing stage.

If `POST /claims` is missing, the patient flow appears to succeed
(submission-confirmed.html shows the confirmation screen) but the
claim never reaches DynamoDB. The frontend logs a warning to the
browser console; nothing is shown to the user. The next time
localStorage gets cleared, the claim is gone forever — that's the
exact bug this Lambda's POST route fixes.

### 7. Smoke test

```bash
# As a regular signed-in user (replace TOKEN):
curl -H "Authorization: Bearer $USER_TOKEN" \
     https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com/claims/CMX-2026-XXXX

# As an admin user:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com/admin/claims
```

Expected shapes:

```json
// GET /claims/:id
{ "claim": { "id": "CMX-2026-XXXX", "status": "submitted", … } }

// GET /admin/claims
{ "claims": [ { … }, { … } ], "count": 2 }
```

## Frontend wiring

Once the routes return 200:

- `app/dashboard.html` → `hydrateClaimFromState()` already prefers
  `claim.*` over `receipt.*`. Add an `authFetch(API + '/claims/' + id)`
  call inside it that overrides CredimedState.claim with the backend
  response. Cache the response for 30s so refresh button works smoothly.
- `app/admin.html` → already does `authFetch(API + '/claims?admin=1')`.
  Update that string to `'/admin/claims'` to match the new route.

## Cost (rough)

DynamoDB on-demand at <10k claims/month: ~$1/month.
Lambda invocations: free tier covers it for years.
Total: rounding error.

## Future

- Replace the Scan in the admin update path with a Query against the
  `claimId-index` GSI once the table is set up.
- Add `/admin/insurers` PUT for the Insurers panel — the storage model
  is already in admin.html, just swap CredimedState for authFetch.
- SES/SNS notification trigger on status changes (mark approved →
  email patient).
