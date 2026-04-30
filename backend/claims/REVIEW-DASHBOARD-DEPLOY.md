# Admin review dashboard — deploy guide

End-to-end setup for the **training-data capture** flow added to
`/app/admin.html`. Every claim review the founder does today logs:
- What the AI extracted (`aiExtraction`)
- What the reviewer corrected (`humanCorrection`)
- The structured `decision` + `decisionReason` (+ optional free-text note)
- Time spent on the review
- Which documents the reviewer actually opened

These rows live in a new DynamoDB table and feed Stage-2 (AI-assisted)
and Stage-3 (auto-approve) automation when there are 50+ labeled
examples.

---

## Architecture

```
admin opens claim drawer
         │
         ▼
clicks "Review & capture decision"
         │
         ▼
Review modal hydrates with current claim fields (the AI snapshot)
         │
   reviewer edits any wrong fields
         │
   reviewer picks decision + reason
         │
         ▼
POST /admin/claims/{id}/review
         │
         ▼
credimed-claims Lambda
  - validates admin group
  - validates decision + reason (allowlists)
  - computes fieldDiff (server-side)
  - PutItem → credimed-review-decisions
         │
         ▼
DynamoDB table credimed-review-decisions
  PK = reviewId (S)
```

---

## Step 1 — Create the DynamoDB table

AWS Console → **DynamoDB** → **Tables** → **Create table**

| Field                | Value                                         |
| -------------------- | --------------------------------------------- |
| Table name           | `credimed-review-decisions`                   |
| Partition key        | `reviewId` (String)                           |
| Sort key             | *(none)*                                      |
| Settings             | **Customize settings**                        |
| Capacity mode        | **On-demand** (no traffic forecast yet)       |
| Encryption at rest   | **Owned by AWS** (or your CMK if HIPAA-strict)|
| Point-in-time recovery (PITR) | **On**                               |
| Tags                 | `app=credimed`, `purpose=training-data`       |

Click **Create table**. Wait ~30 seconds for `Active` status.

### Optional: Global Secondary Indexes (only when you have data)

Skip these on day 1 — they have a cost and won't matter until you have
hundreds of decisions to query. Add later when needed:

- **claimId-reviewedAt-index** — find all reviews for one claim (replays)
- **decision-reviewedAt-index** — count approvals/rejections by week
- **decisionReason-reviewedAt-index** — what's the most-common rejection reason?

When you get there: DynamoDB → table → **Indexes** → **Create index**.

---

## Step 2 — Update credimed-claims Lambda IAM

The Lambda already has `dynamodb:UpdateItem` on `credimed-claims`. It
now needs `dynamodb:PutItem` on the new table.

IAM → Roles → find the role attached to `credimed-claims` → **Permissions**
→ click the inline policy that grants DynamoDB access → **Edit**.

Add this statement (or extend the existing one):

```json
{
  "Sid": "AllowReviewDecisionWrites",
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem"
  ],
  "Resource": "arn:aws:dynamodb:us-west-2:*:table/credimed-review-decisions"
}
```

Save the policy.

---

## Step 3 — Redeploy credimed-claims Lambda code

The Lambda gained:
- `PutItemCommand` import from `@aws-sdk/client-dynamodb` (already in
  the same SDK package — no new dependency needed)
- New `REVIEW_TABLE` constant + `ALLOWED_REVIEW_DECISIONS` and
  `ALLOWED_DECISION_REASONS` allowlists
- New `saveReviewDecision()` helper
- New route handler: `POST /admin/claims/{id}/review`

Deploy via the same path you use today (Lambda console paste-and-deploy
or zip upload). File: `backend/claims/credimed-claims.lambda.js`.

---

## Step 4 — Add the new route to API Gateway / HTTP API

If you're using a HTTP API in front of the Lambda:

API Gateway → your API → **Routes** → **Create**
- Method: **POST**
- Path: `/admin/claims/{id}/review`
- Integration: existing `credimed-claims` Lambda integration
- Auth: same Cognito JWT authorizer as the other admin routes

If you're using a Lambda Function URL directly (no API Gateway), no
config change needed — the handler already path-matches the new route
via regex.

---

## Step 5 — Test the flow

1. Open `https://www.credimed.us/app/admin.html` while signed in as
   an admin user (Cognito group `admin`).
2. Click any claim row → drawer slides in.
3. Click **"Review & capture decision →"** → modal opens.
4. Edit one field (watch it turn amber to flag the change).
5. Pick **Approve — ready to file** + **OK as-is**.
6. Click **Save decision**.
7. Verify in DynamoDB → `credimed-review-decisions` → **Explore items**:
   - One row exists, `reviewId` starts with `rev-…`
   - `fieldDiff` JSON shows the field you changed with `[aiValue, humanValue]`
   - `timeSpentSeconds` ≈ how long you sat on the modal
8. Verify in CloudWatch → `/aws/lambda/credimed-claims` log stream:
   - `admin_review_decision` event with `diffFieldCount` matching what you edited

If decision was `approved`, the claim status also flipped to `approved`
via the existing PATCH endpoint — confirm the patient got a
`statusApproved` email (once you redeploy the email Lambdas).

---

## Step 6 — Query the data after a few decisions

Once you have ~10 decisions logged, this query (CloudWatch Logs Insights
on `/aws/lambda/credimed-claims`) shows what the AI most often gets
wrong:

```
filter event = "admin_review_decision"
| stats count() as n by decisionReason
| sort n desc
```

And in DynamoDB (Explore items → filter):
- `decisionReason = "missing_xray"` → which claims most need x-rays?
- `decision = "rejected_fraud_suspicion"` → audit trail
- Project the `fieldDiff` column, JSON-parse offline → most edited fields

For larger-scale analysis later, set up a scheduled DynamoDB → S3 export
+ Athena query (or just dump to CSV monthly while volumes are tiny).

---

## What's NOT in this milestone

The dashboard captures decisions but does NOT yet:
- Render PDFs / images inline in the modal (S3 presigned URLs are a
  separate task — the file links open in a new tab today)
- Show an "AI confidence score" alongside each field (depends on the
  OCR Lambda writing `aiExtraction.confidence` onto the claim — when
  that ships, the modal already reads `claim.aiExtraction` and the
  confidence can be added with no Lambda changes)
- Auto-suggest decisions based on past patterns (Stage 2 — needs ~50
  reviews of training data first)

These are the natural next steps once you've reviewed your first batch
of real claims and have signal about which fields the AI most often
misses.
