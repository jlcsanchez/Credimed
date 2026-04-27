# Availity Clearinghouse Integration — Setup & Operations Playbook

**Last updated:** April 27, 2026
**Owner:** Juan Luis Sanchez (`jlcsanchezavila@gmail.com`)
**Lambda:** `credimed-clearinghouse` (region: us-west-2)
**Status:** ⚠️ Code is built. Awaiting Trading Partner Agreement + payer enrollment to go live.

---

## What this Lambda does

For every Credimed claim that is paid by the patient, this Lambda:

1. **Loads** the claim from DynamoDB and decrypts PHI (KMS).
2. **Generates** an EDI 837D (Health Care Claim: Dental) X12 file from the claim data.
3. **Submits** that 837D to Availity via the Availity Essentials API.
4. **Archives** the outbound 837D to S3 (`credimed-edi-archive`) for HIPAA's 6-year audit-log requirement.
5. **Receives** the 999 (functional ack) inline from Availity's submit response.
6. **Polls** Availity's `/status` endpoint for the 277CA (claim status from payer) on a schedule.
7. **Polls** Availity's `/remittance` endpoint for the 835 (remittance advice) once the payer pays.
8. **Updates** DynamoDB with the new clearinghouse status and any payer-assigned claim ID.
9. **Sends** SES emails to the patient on key transitions (`accepted`, `payer_paid`, `payer_denied`).

The patient's dashboard shows the resulting status pipeline:
`Claim ready → Accepted → With your insurer → In review → Refund paid` (or `Denied`).

---

## One-time setup (you do this once, then we're live)

### Step 1 — Create Availity account (15 min)

1. Go to <https://www.availity.com/essentials>
2. Click **Register** and fill in business info:
   - Business name: **Credimed, Inc.**
   - Business type: **Billing service**
   - Tax ID (EIN): your Credimed federal EIN
   - Type 2 NPI: your organizational NPI (see Step 2 if you don't have one)
   - Primary contact: you, with `jlcsanchezavila@gmail.com`
3. Availity emails you within ~1 business day with login credentials.

### Step 2 — Get a Type 2 NPI for Credimed Inc. (1-2 weeks)

If you don't already have an organizational NPI:

1. Go to <https://nppes.cms.hhs.gov/#/>
2. Click **Apply for an NPI**
3. Choose **Entity Type 2** (Organization Health Care Provider)
4. Pick taxonomy: **302F00000X** (Specialist) or **193200000X** (Multi-Specialty group). Either works for a billing-service role.
5. Submit. NPPES emails the NPI within 5-15 business days. Save it — you'll plug it into env vars below.

### Step 3 — Sign Availity's Trading Partner Agreement (3-5 business days)

Once your Availity account is approved:

1. Log in to Availity Essentials.
2. Navigate to **Payer Connections → Manage Trading Partner Agreement**.
3. Sign the standard TPA. This authorizes Credimed to submit EDI 837 transactions through Availity to participating payers.
4. Availity emails you confirmation + your **submitter ID** (e.g. `CRED01`). Save this.

### Step 4 — Get API credentials (15 min)

1. In Availity Essentials, navigate to **My Account → API Access**.
2. Click **Create new application**:
   - Name: `Credimed Production` (or `Credimed Sandbox` for the test env)
   - Scopes: **HIPAA Transactions**, **EDI Submit**, **EDI Status**, **EDI Remittance**
3. Availity gives you a **Client ID** and **Client Secret**. Treat the secret like a password — never commit to git.

### Step 5 — Enroll Credimed with each payer (2-6 weeks per payer, in parallel)

This is the slow step. For each US dental insurer your patients use, you need to register Credimed as an authorized billing service. Availity has a pre-built form for most:

1. In Availity Essentials, navigate to **Payer Spaces**.
2. For each payer (Aetna, Cigna, Delta, MetLife, Guardian, Humana, etc.):
   - Click **Enroll** under their Payer Space.
   - Fill in the form (Credimed's NPI, EIN, address, contact info).
   - Some payers approve in 24h. Others take 2-6 weeks. There's nothing you can do to speed this up.
3. Track approval status in **Payer Connections → Enrollment Status**. Mark each payer as enrolled here:

  | Payer | Availity payer ID | Enrollment status | Date approved |
  |---|---|---|---|
  | Aetna Dental | 60054 | ⬜ Pending | — |
  | Cigna Dental | 62308 | ⬜ Pending | — |
  | Delta Dental of CA | 94276 | ⬜ Pending | — |
  | MetLife Dental | 65978 | ⬜ Pending | — |
  | Guardian | 64246 | ⬜ Pending | — |
  | Humana Dental | 73288 | ⬜ Pending | — |
  | United Concordia | CX014 | ⬜ Pending | — |
  | Principal | 61271 | ⬜ Pending | — |
  | Ameritas | 47009 | ⬜ Pending | — |

  Update this table as enrollments are approved. Until a payer is enrolled, claims to that payer will be rejected by Availity (status: 'rejected' with friendly error in the dashboard).

### Step 6 — Wire env vars into the Lambda (5 min)

Once you have credentials + submitter ID, set these env vars on the `credimed-clearinghouse` Lambda:

```
AVAILITY_CLIENT_ID         = <client ID from Step 4>
AVAILITY_CLIENT_SECRET     = <client secret from Step 4>
AVAILITY_SUBMITTER_ID      = <submitter ID from Step 3>     (e.g. CRED01)
AVAILITY_API_BASE          = https://api.availity.com       (or sandbox URL)
AVAILITY_PROD              = false                          (flip to "true" only when going live)
CREDIMED_NPI               = <Type 2 NPI from Step 2>
CREDIMED_EIN               = <Federal EIN, format: 12-3456789>
SUBMITTER_ADDRESS1         = <Boston street address>
SUBMITTER_CITY             = BOSTON
SUBMITTER_STATE            = MA
SUBMITTER_ZIP              = 02101
SUBMITTER_PHONE            = <Credimed support phone>
EDI_ARCHIVE_BUCKET         = credimed-edi-archive
FROM_EMAIL                 = Credimed <support@credimed.us>
```

⚠️ Set `AVAILITY_PROD=false` while testing. With `false`, the EDI ISA15 field is `T` (test mode) and Availity routes to sandbox payer endpoints. Flip to `true` only after the smoke test in Step 8 passes.

### Step 7 — Create the S3 archive bucket + IAM permissions (5 min)

```bash
# 1. Create the bucket (private, KMS-encrypted)
aws s3 mb s3://credimed-edi-archive --region us-west-2
aws s3api put-bucket-encryption \
  --bucket credimed-edi-archive \
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]
  }'
aws s3api put-public-access-block \
  --bucket credimed-edi-archive \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 2. Lifecycle: keep all objects for 6 years (HIPAA), then move to Glacier Deep Archive
aws s3api put-bucket-lifecycle-configuration \
  --bucket credimed-edi-archive \
  --lifecycle-configuration '{
    "Rules":[{
      "ID":"hipaa-6yr-then-archive",
      "Status":"Enabled",
      "Filter":{"Prefix":""},
      "Transitions":[{"Days":2190,"StorageClass":"DEEP_ARCHIVE"}]
    }]
  }'
```

Add this inline IAM policy to the Lambda role `credimed-clearinghouse-role`:

```json
{
  "Version":"2012-10-17",
  "Statement":[
    { "Effect":"Allow",
      "Action":["dynamodb:GetItem","dynamodb:UpdateItem"],
      "Resource":"arn:aws:dynamodb:us-west-2:*:table/credimed-claims" },
    { "Effect":"Allow",
      "Action":["kms:Decrypt"],
      "Resource":"arn:aws:kms:us-west-2:*:key/<your PHI KMS key ID>" },
    { "Effect":"Allow",
      "Action":["s3:PutObject","s3:GetObject"],
      "Resource":"arn:aws:s3:::credimed-edi-archive/*" },
    { "Effect":"Allow",
      "Action":["ses:SendEmail","ses:SendRawEmail"],
      "Resource":"*" }
  ]
}
```

### Step 8 — Smoke test in sandbox (10 min)

Before flipping production:

1. Make sure `AVAILITY_PROD=false`.
2. Use the sample claim:

   ```bash
   # From your laptop, deploy first then invoke:
   aws lambda invoke \
     --function-name credimed-clearinghouse \
     --payload '{"requestContext":{"http":{"method":"POST","path":"/clearinghouse/submit/CMX-2026-DEMO01"},"authorizer":{"jwt":{"claims":{"cognito:groups":"admin"}}}}}' \
     --cli-binary-format raw-in-base64-out \
     /tmp/out.json && cat /tmp/out.json
   ```

3. Expected response:

   ```json
   {
     "claimId": "CMX-2026-DEMO01",
     "submissionId": "<some Availity tracking ID>",
     "accepted": true,
     "submittedAt": "2026-04-27T16:30:00Z",
     "ackSummary": { "allAccepted": true, "transactions": [...] }
   }
   ```

4. Check `s3://credimed-edi-archive/CMX-2026-DEMO01/` — should have one `.edi` file ending in `-837D.edi`. Open it; should be valid X12.

5. After ~1 minute, poll for status:

   ```bash
   aws lambda invoke \
     --function-name credimed-clearinghouse \
     --payload '{"requestContext":{"http":{"method":"POST","path":"/clearinghouse/poll/CMX-2026-DEMO01"},"authorizer":{"jwt":{"claims":{"cognito:groups":"admin"}}}}}' \
     --cli-binary-format raw-in-base64-out \
     /tmp/out.json && cat /tmp/out.json
   ```

   Should return either `pending: true` (Availity hasn't propagated) or a parsed 277 with status `accepted_by_clearinghouse`.

6. If both succeed: flip `AVAILITY_PROD=true` and you're live for real claims.

---

## Operations

### Monitoring

CloudWatch metrics to watch:

- **`credimed-clearinghouse` invocation errors** — alarm if > 5/min
- **`credimed-clearinghouse` duration p99** — alarm if > 10s (Availity should respond in 2-5s)
- **`s3://credimed-edi-archive` bucket size** — informational; expect linear growth ~5 KB/claim

### Daily poll cron

Set up an EventBridge schedule to poll all `submitted` claims daily for status updates:

```
Schedule expression:  cron(0 14 * * ? *)        # 14:00 UTC = 9 AM ET
Target:               credimed-clearinghouse
Input:                {"source":"poll-cron"}
```

The Lambda's main handler doesn't currently handle `source:'poll-cron'` — to wire this, add a branch at the top of the handler that scans for claims with status in (`submitted`, `accepted_by_clearinghouse`, `forwarded_to_payer`, `payer_in_review`, `pending_info`) and calls `handlePoll()` for each. Implementing in next iteration.

### Common errors

| Error in CloudWatch | Cause | Fix |
|---|---|---|
| `Availity credentials missing` | Env vars not set | Set per Step 6 above |
| `Availity submission failed: HTTP 401` | Token expired or invalid | Token cache will refresh; if persistent, regenerate client secret |
| `Availity submission failed: HTTP 404` | Wrong API base URL or sandbox/prod mismatch | Check `AVAILITY_API_BASE` and `AVAILITY_PROD` |
| `No Availity payer ID known for insurer "X"` | Payer not in our PAYER_IDS map | Add to `availity/client.js` PAYER_IDS or set `claim.payerId` directly |
| `claim.<field> required for EDI 837D` | Claim record missing required data (often DOB, providerName) | Update claim in DynamoDB before retrying |
| `KMS decrypt failed` | KMS permission missing | Add `kms:Decrypt` to Lambda role |

### When a claim is rejected

If Availity returns `accepted: false` with a 999 reject, the segment errors in the response indicate WHAT was wrong (e.g., "NM1 — Required data element missing"). The dashboard pill changes to `'rejected'` and the claim is held for manual review.

To re-submit after fixing the underlying data:
1. Admin updates the claim in DynamoDB.
2. Calls `POST /clearinghouse/submit/{claimId}` again. The same `claimId` is OK — Availity treats it as a corrected submission.

---

## What's NOT YET wired

These are intentionally deferred and tracked here for v2:

- ❌ **EventBridge cron poller** — currently you have to manually trigger `/clearinghouse/poll/{id}` per claim. v2: scan all open claims every 24h.
- ❌ **Webhook receiver** — Availity does push notifications for status updates; we currently poll. v2: Function URL endpoint for Availity webhook with HMAC verification.
- ❌ **Multi-payer routing** — currently we look up one payer ID from the insurer name. v2: handle multi-insurer claims (primary + secondary).
- ❌ **Auto-resubmission** — Premium plan promises unlimited resubmissions; we'd need an automated retry on `pending_info` or `rejected` after operator review. v2.
- ❌ **Money-back guarantee auto-trigger** — when 835 comes back as `payer_denied_outright` and `isOutrightDenial()` is true, we should trigger a Stripe refund automatically. Currently surfaces in the admin panel for manual action.

---

## File map

```
backend/clearinghouse/
├── AVAILITY_INTEGRATION.md           — this file
├── package.json                      — ESM package metadata
├── credimed-clearinghouse.lambda.js  — main Lambda handler
├── edi/
│   ├── generator.js                  — 837D X12 generator
│   ├── parser-999.js                 — Functional Acknowledgment parser
│   ├── parser-277.js                 — Claim Status parser
│   └── parser-835.js                 — Remittance Advice parser
├── availity/
│   └── client.js                     — Availity API client (OAuth, submit, status, remittance)
└── test/
    ├── sample-claim.json             — Synthetic test claim
    └── test.js                       — Smoke tests (no test framework, plain Node)
```

Run tests: `cd backend/clearinghouse && npm test`

---

## Questions for legal counsel before going live

These are open in the legal review bundle (`legal/COUNSEL_REVIEW_BUNDLE.md`):

1. As a billing service submitting claims through a clearinghouse, are we a HIPAA Business Associate to Availity, to the payer, to both, or to neither?
2. Does Availity require Credimed to sign a separate BAA, or does the TPA cover BA obligations?
3. Are there state-specific licensing requirements for billing services (e.g., MA requires registration as a "third-party administrator" in some scenarios)?
4. The 837D includes the patient's DOB and full name in plain text within the EDI envelope. Availity transmits it via TLS to the payer. Is this acceptable PHI handling under HIPAA's minimum-necessary standard?

Don't go live with real claims until counsel signs off on these.
