# credimed-translation — deploy guide

Translates a Spanish factura to English so the carrier's reviewer can
read it. Independent of the submitter Lambda — runs early (after OCR)
so the translation PDF is already in S3 when the submitter Lambda
goes to bundle. If translation fails, the submitter still works
(it'll fax without the translation page).

## Prerequisites

- DynamoDB table `credimed-claims` already exists ✓
- S3 bucket `credimed-edi-archive` already exists ✓
- Amazon Translate is automatically available in us-west-2; no setup.
  HIPAA eligibility is covered by the AWS BAA (signed at account level).

## Lambda function

1. AWS Console → Lambda → Create function
2. Name: `credimed-translation`
3. Runtime: Node.js 22.x
4. Architecture: arm64
5. Memory: **256 MB** (Translate calls are network-bound)
6. Timeout: **30 seconds**
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
      "Sid": "TranslateInvoke",
      "Effect": "Allow",
      "Action": "translate:TranslateText",
      "Resource": "*"
    },
    {
      "Sid": "S3Archive",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::credimed-edi-archive/*"
    }
  ]
}
```

## Bundle and upload (CloudShell)

```bash
mkdir -p ~/cs && cd ~/cs && rm -rf translation && mkdir translation && cd translation
curl -sL -o index.mjs    https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/translation/credimed-translation.lambda.js
curl -sL -o package.json https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/translation/package.json
sed -i 's|"main": "credimed-translation.lambda.js"|"main": "index.mjs"|' package.json
npm install --silent
zip -qr - . > pkg
aws lambda update-function-code --function-name credimed-translation --zip-file fileb://pkg
```

For the first deploy, swap `update-function-code` for `create-function`
with the same flags as the submitter Lambda (runtime, role, etc.).

## Environment variables

| Key              | Required | Value |
|------------------|----------|-------|
| `ARCHIVE_BUCKET` | no       | default `credimed-edi-archive` |

That's it. Translate uses the Lambda's IAM role, no API key needed.

## Wiring options (decide at deploy time)

### Option A — direct invoke from credimed-ocr (recommended)
Modify the existing OCR Lambda to invoke this one async after writing
the factura text. One line:

```js
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
const lambda = new LambdaClient({ region: "us-west-2" });
await lambda.send(new InvokeCommand({
  FunctionName: "credimed-translation",
  InvocationType: "Event",  // async, fire and forget
  Payload: Buffer.from(JSON.stringify({ claimId, facturaText }))
}));
```

OCR's IAM role needs `lambda:InvokeFunction` on this Lambda's ARN.

### Option B — EventBridge schedule (catch-up path)
Create a rule that runs every 6 hours, lists claims in DynamoDB
where `facturaText` is set but `translationS3Key` is not, and invokes
this Lambda for each. Catches misses from option A.

Both options can coexist. A is the happy path; B is the safety net.

## Smoke test

```bash
aws lambda invoke \
  --function-name credimed-translation \
  --payload '{"claimId":"CMX-2026-DEMO01","facturaText":"Endodoncia molar superior. Resina MOD. Total: $9000 MXN."}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/out.json
cat /tmp/out.json
# Expected: { "ok": true, "claimId": "CMX-2026-DEMO01", "s3Key": "CMX-2026-DEMO01/translation.pdf" }
aws s3 cp s3://credimed-edi-archive/CMX-2026-DEMO01/translation.pdf /tmp/translation.pdf
open /tmp/translation.pdf
```

You should see two pages: page 1 English (Translate output, with
the dental glossary applied), page 2 Spanish original.

## Cost

Amazon Translate: $15.00 per million characters. A typical Mexican
factura is ~500 characters → $0.0075 per claim. Negligible.
