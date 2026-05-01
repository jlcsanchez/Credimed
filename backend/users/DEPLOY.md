# Credimed users Lambda — deploy guide

Patient profile persistence: address, banking, phone (international),
notification preferences. Complements Cognito user attributes — Cognito
holds identity (name, email, US phone, DOB), this Lambda holds
everything else.

| Method | Path        | Auth                   | Purpose                          |
|--------|-------------|------------------------|----------------------------------|
| GET    | `/profile`  | JWT (any signed-in)    | Read the user's profile          |
| PATCH  | `/profile`  | JWT (any signed-in)    | Partial update — only fields in body |

## What was failing before this Lambda existed

- Mexican / international phone numbers couldn't sync to Cognito because
  Cognito's `phone_number` rejects non-US formats. They lived in
  localStorage only and disappeared on every storage clear.
- Mailing address, banking, and notification preferences had no backend
  at all. iOS Safari ITP wipes localStorage after 7 days of inactivity,
  and any sign-out on a new device started fresh.

## One-time AWS setup

### 1. DynamoDB table

The table `credimed-users` already exists with:

- Partition key: `email` (String)
- Billing mode:  On-demand

If you don't have it, create it now (us-west-2). No GSI needed for v1.

### 2. KMS key

Reuse the existing `alias/credimed-phi` key (the same one
`credimed-claims` uses). Banking fields (holder name, routing,
account) are encrypted at rest with this key.

If the key doesn't exist yet, see `backend/claims/DEPLOY.md` step 2b.

### 3. Lambda function

1. AWS Console → Lambda → Create function → Author from scratch
2. Function name: `credimed-users`
3. Runtime: Node.js 20.x (or 22.x)
4. Architecture: arm64
5. Permissions: create new role, then attach the inline policy below

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoRW",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:us-west-2:YOUR_ACCOUNT_ID:table/credimed-users"
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

```bash
cd backend/users
npm install
zip -r credimed-users.zip credimed-users.lambda.js node_modules package.json
```

Upload via Lambda console → Code → Upload from .zip. Set the handler to
`credimed-users.lambda.handler`.

### 5. Environment variables

| Key          | Value                                              | Required |
|--------------|----------------------------------------------------|----------|
| `KMS_KEY_ID` | ARN of `alias/credimed-phi`                        | yes      |

### 6. API Gateway routes

In the existing HTTP API, add two routes — both protected by the
existing JWT authorizer:

- `GET /profile`     → integration: `credimed-users` Lambda
- `PATCH /profile`   → integration: `credimed-users` Lambda
- `OPTIONS /profile` → for CORS preflight

JWT authorization on each route, then deploy the API to the existing
stage. The JWT authorizer must surface both `sub` and `email` claims —
the Lambda needs both (PK lookup and rebind defense).

### 7. Smoke test

```bash
curl -H "Authorization: Bearer $USER_TOKEN" \
     https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com/profile

curl -X PATCH \
     -H "Authorization: Bearer $USER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"phoneRaw":"+52 55 1234 5678","addrCity":"Tijuana"}' \
     https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com/profile
```

Expected:
```json
// GET (first time)
{ "profile": null }

// GET (after PATCH)
{ "profile": { "email": "...", "userId": "...", "phoneRaw": "+52 55 1234 5678", "addrCity": "Tijuana", "updatedAt": "..." } }

// PATCH
{ "ok": true, "email": "...", "updatedAt": "..." }
```

### 8. Email-rebind defense

The Lambda stamps `userId` (Cognito sub) on every write and verifies it
on read. If a user changes their email in Cognito and a different user
later claims the abandoned email, the new user can't see the old
user's profile — `userId` mismatch returns `{ profile: null }`.
Equivalent guard on PATCH returns 409.

## Cost

- DynamoDB on-demand at <10k profiles/month: ~$0.10/month
- Lambda: free tier
- KMS: $1/month for the key + $0.03 per 10k requests
- Effectively rounding error.

## Schema reference

| Field                       | Type   | Encrypted? | Notes                                |
|-----------------------------|--------|------------|--------------------------------------|
| `email` (PK)                | string | no         | Cognito JWT.email, lowercase         |
| `userId`                    | string | no         | Cognito sub, rebind defense          |
| `updatedAt`                 | string | no         | ISO timestamp                        |
| `phoneRaw`                  | string | no         | Free-text, any country format        |
| `addrStreet`                | string | no         | Mailing address line 1               |
| `addrApt`                   | string | no         | Mailing address line 2               |
| `addrCity`                  | string | no         |                                      |
| `addrState`                 | string | no         | US state OR Mexican estado           |
| `addrZip`                   | string | no         | US ZIP / MX código postal            |
| `bankName`                  | string | no         | Bank brand (e.g., "Chase")           |
| `bankType`                  | string | no         | "checking" or "savings"              |
| `bankHolder`                | string | **yes**    | Account holder name                  |
| `bankRouting`               | string | **yes**    | ABA routing number (US) / CLABE (MX) |
| `bankAccount`               | string | **yes**    | Account number                       |
| `notifClaimUpdates`         | bool   | no         |                                      |
| `notifPaymentUpdates`       | bool   | no         |                                      |
| `notifTipsAndGuides`        | bool   | no         |                                      |
