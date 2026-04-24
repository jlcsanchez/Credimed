# Credimed claims Lambda — deploy guide

This Lambda powers three endpoints used by the dashboard and admin:

| Method | Path                  | Caller       | Auth                  |
|--------|-----------------------|--------------|-----------------------|
| GET    | `/claims`             | Patient      | JWT (any signed-in)   |
| GET    | `/claims/:id`         | Patient      | JWT (must own claim)  |
| GET    | `/admin/claims`       | Admin        | JWT + `admin` group   |
| PATCH  | `/admin/claims/:id`   | Admin        | JWT + `admin` group   |

`POST /claims` (the existing endpoint that submission-confirmed.html
uses to write a new claim into DynamoDB) is **not** in this file —
keep whatever Lambda you already have for it. This file adds the
read + admin update side.

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

Create a table named `credimed-claims` (or set `DYNAMO_TABLE` env var
to whatever you already have):

- Partition key: `userSub` (String)
- Sort key:      `claimId` (String)
- Billing mode:  On-demand

If you want fast `claimId`-only lookups for the admin update endpoint,
add a GSI:

- GSI name: `claimId-index`
- Partition key: `claimId` (String)
- Project all attributes

(The handler currently uses Scan as a fallback — fine for early volumes.)

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
    }
  ]
}
```

### 4. Bundle and upload

From `backend/claims/`:

```bash
cd backend/claims
npm install
zip -r credimed-claims.zip credimed-claims.lambda.js node_modules package.json
```

Upload the zip in the Lambda Code section. Set the handler to
`credimed-claims.lambda.handler`.

### 5. Environment variables

Configuration → Environment variables:

| Key            | Value             |
|----------------|-------------------|
| `DYNAMO_TABLE` | `credimed-claims` |
| `ADMIN_GROUP`  | `admin`           |

(The AWS_REGION env var is auto-set by Lambda — don't override it.)

### 6. API Gateway routes

Use your existing HTTP API (the one that already has `POST /claims`).
Add four routes, all protected by the existing JWT authorizer:

- `GET /claims`              → integration: `credimed-claims` Lambda
- `GET /claims/{id}`         → integration: `credimed-claims` Lambda
- `GET /admin/claims`        → integration: `credimed-claims` Lambda
- `PATCH /admin/claims/{id}` → integration: `credimed-claims` Lambda
- `OPTIONS /admin/claims`    → for CORS preflight (or enable CORS at the API level)

For each, **enable JWT authorization** and select your User Pool. Save
each route, then deploy the API to your existing stage.

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
