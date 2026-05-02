# credimed-claim-submitter — deploy guide

Sends a paid+reviewed claim to the patient's insurer by fax. Generates
the ADA J430D PDF, bundles it with factura + translation + POA, and
posts to a HIPAA-BAA fax provider (WestFax recommended).

| Method | Path                              | Auth                |
|--------|-----------------------------------|---------------------|
| POST   | `/admin/claims/{id}/submit`       | JWT + admin group   |

## Local test (no AWS)

```bash
cd backend/fax
npm install
node test/render-sample.mjs
open /tmp/credimed-sample-bundle.pdf
```

This renders the ADA + POA from the synthetic Maria Gonzalez claim
into `/tmp/`. Use it to iterate on `ada-coordinates.js` until the
text lands inside the form's printed boxes. Coordinates are in PDF
user units from the bottom-left.

## Prerequisites in AWS

### 1. KMS key
Reuse `alias/credimed-phi` (same key the credimed-claims Lambda already
uses). The submitter needs `kms:Decrypt` only — encryption stays in
the credimed-claims write path.

### 2. S3 bucket: `credimed-edi-archive`
Already in use by the legacy clearinghouse Lambda. Confirm it exists.
The submitter writes the bundled PDF to
`s3://credimed-edi-archive/{claimId}/bundle.pdf` for HIPAA's 6-year
audit-log retention. Enable bucket-level SSE (AES256) and versioning.

### 3. Fax provider account
Pick one of: **WestFax** (recommended), Documo, or Notifyre. All three
offer HIPAA BAAs. Pricing: $0.05–$0.10 per page sent. Typical claim
bundle is 4–7 pages, so $0.20–$0.70 per claim.

Sign the BAA with whichever provider you pick before sending the
first real fax. Without a BAA, faxing PHI = HIPAA violation.

### 4. Lambda function
1. AWS Console → Lambda → Create function
2. Name: `credimed-claim-submitter`
3. Runtime: Node.js 22.x (or 20.x)
4. Architecture: arm64
5. Memory: **512 MB** (PDF assembly needs more than the default 128)
6. Timeout: **30 seconds** (PDF gen + fax + S3 round-trip)
7. Permissions: create new role, then attach the inline policy below

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoRW",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:us-west-2:*:table/credimed-claims"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-west-2:*:key/YOUR_KMS_KEY_ID"
    },
    {
      "Sid": "S3Archive",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::credimed-edi-archive/*"
    },
    {
      "Sid": "SES",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:us-west-2:*:identity/credimed.us"
    }
  ]
}
```

### 5. Bundle and upload (CloudShell)

```bash
mkdir -p ~/cs && cd ~/cs && rm -rf submitter && mkdir submitter && cd submitter
curl -sL -o credimed-claim-submitter.lambda.js https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/credimed-claim-submitter.lambda.js
curl -sL -o ada-pdf-generator.js https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/ada-pdf-generator.js
curl -sL -o ada-coordinates.js   https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/ada-coordinates.js
curl -sL -o poa-pdf-generator.js https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/poa-pdf-generator.js
curl -sL -o fax-client.js        https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/fax-client.js
curl -sL -o package.json         https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/package.json
curl -sL -o carrier-fax-numbers.json https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/fax/carrier-fax-numbers.json
mkdir -p templates
curl -sL -o templates/ada-j430d-2024.pdf https://github.com/jlcsanchez/credimed/raw/main/backend/fax/templates/ada-j430d-2024.pdf
sed -i 's|"main": "credimed-claim-submitter.lambda.js"|"main": "index.mjs"|' package.json
mv credimed-claim-submitter.lambda.js index.mjs
npm install --silent
zip -qr - . > pkg
aws lambda update-function-code --function-name credimed-claim-submitter --zip-file fileb://pkg
```

(For the very first deploy, swap `update-function-code` for `create-function`
and pass `--runtime nodejs22.x --architectures arm64 --role <role-arn>
--handler index.handler --timeout 30 --memory-size 512`.)

### 6. Environment variables

| Key                    | Required | Value |
|------------------------|----------|-------|
| `KMS_KEY_ID`           | yes      | ARN of `alias/credimed-phi` |
| `ARCHIVE_BUCKET`       | no       | default `credimed-edi-archive` |
| `FROM_EMAIL`           | yes      | `Credimed <support@credimed.us>` |
| `FAX_PROVIDER`         | yes      | `westfax` / `documo` / `notifyre` (default `stub` = no-send) |
| `FAX_API_KEY`          | yes (when going live) | from your fax provider |
| `FAX_USERNAME`         | westfax only | account username |
| `FAX_PASSWORD`         | westfax only | optional |
| `FAX_SENDER_NUMBER`    | yes (live) | E.164 of your account's fax line |
| `FAX_FEEDBACK_EMAIL`   | no       | provider sends per-fax delivery reports here |

While `FAX_PROVIDER=stub`, the Lambda generates + bundles + S3-archives
the PDF but does NOT send the fax. Use this for end-to-end testing
without spending fax credits.

### 7. API Gateway route

```bash
API_ID=0xosu4ifj5
ACCOUNT_ID=525237381183
INTEGRATION_ID=$(aws apigatewayv2 create-integration --api-id $API_ID --integration-type AWS_PROXY --integration-uri "arn:aws:lambda:us-west-2:$ACCOUNT_ID:function:credimed-claim-submitter" --payload-format-version 2.0 --query 'IntegrationId' --output text)
AUTHORIZER_ID=$(aws apigatewayv2 get-authorizers --api-id $API_ID --query 'Items[0].AuthorizerId' --output text)
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /admin/claims/{id}/submit" --target "integrations/$INTEGRATION_ID" --authorizer-id "$AUTHORIZER_ID" --authorization-type JWT
PRINC=$(echo "YXBpZ2F0ZXdheS5hbWF6b25hd3MuY29t" | base64 -d)
aws lambda add-permission --function-name credimed-claim-submitter --statement-id apigw-invoke --action lambda:InvokeFunction --principal "$PRINC" --source-arn "arn:aws:execute-api:us-west-2:$ACCOUNT_ID:$API_ID/*/*/admin/claims/*/submit"
```

### 8. Smoke test

```bash
# Stub mode (no fax sent, but full pipeline runs):
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com/admin/claims/CMX-2026-XXXX/submit
# Expected: 502 with faxStatus=stub_no_send, bundleS3 path populated.
# Open the bundleS3 path in S3 console to inspect the PDF.

# After flipping FAX_PROVIDER=westfax with real creds:
curl -X POST ... # same call, expect 200 with faxConfirmationId
```

## What's still missing (post-deploy follow-ups)

- POA template authored by counsel → drop into `templates/poa.pdf` and
  rewrite `poa-pdf-generator.js` to fill it instead of generating a
  placeholder.
- Carrier fax numbers for Delta / Cigna / BCBS / Guardian / United /
  Humana / Anthem → call each carrier's provider line and update
  `carrier-fax-numbers.json` (and redeploy).
- Frontend: an admin "Submit to insurer" button on the claim detail
  page that calls `POST /admin/claims/{id}/submit`. Until that lands,
  trigger via `curl` from CloudShell.
- Translation Lambda (`backend/translation/`) deploy — independent,
  see its own DEPLOY.md.
