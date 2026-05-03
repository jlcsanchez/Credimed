# Credimed deploy checklist (post-launch sprint, May 2026)

Single source of truth for what needs to happen on AWS after merging
the recent batch of PRs. Run this top-down — each step is independently
verifiable, so you can stop and resume any time.

**Last updated:** 2026-05-02 — WestFax BAA fully executed + carrier table expanded to 22 entries.

---

## What state we're in right now

Live on credimed.us (auto-deploys from GitHub Pages):
- ✅ Patient flow with `claim-review.html` (PR #18) — captures sex, DOB, employer, group #, relationship
- ✅ Admin "Submit to insurer" buttons (PR #17) — Generate PDF Bundle + Mark as faxed
- ✅ Status pills + "awaiting fax" counter (PR #19)
- ✅ Email signature in `docs/` (PR #16) — install in Gmail manually
- ✅ Carrier fax table seeded with 22 entries — fax verified for Aetna, Ameritas, Cigna, DentaQuest, Guardian, Humana, Liberty, Lincoln, MetLife, Sun Life, United Concordia. Mailing-only (no fax accepted) for Anthem, all 5 Delta state subsidiaries, BCBS-TX/MA/FEP, Principal, Renaissance, UHC.
- ✅ WestFax HIPAA Basic ($14.99/mo) — fax number `(617) 749-4550`, **BAA signed 2026-05-02**

Pending in AWS — the buttons render but the underlying Lambdas need
deploy or re-deploy:
- ⏳ `credimed-claim-submitter` (new) — generates the bundle PDF, archives to S3
- ⏳ `credimed-translation` (new) — Spanish factura → English
- ⏳ `credimed-claims` re-deploy — PATCH route now accepts faxConfirmationId / faxedAt / submissionNotes
- ⏳ `credimed-users` re-deploy — accepts dob / gender / relationship / groupNumber / employer / subscriber*

Pending vendor work (your side):
- ⏳ WestFax API credentials — check the WestFax dashboard for Product ID + Username. Needed only for step 5 (live mode).
- ⏳ Mercury — waiting on transfer to fund the business card
- ⏳ Email signature — installed minimal "Credimed" text on Gmail iOS app; full HTML version available via Safari + `mail.google.com` desktop view if you want the branded one

---

## Deploy order (do them in this sequence)

Each step assumes you're in **AWS CloudShell** (terminal icon `>_` in the
AWS Console top bar). Switching out of CloudShell loses /tmp; that's
fine, every command starts fresh.

### 1. Re-deploy `credimed-users` (~2 min)

Accepts the new `claim-review.html` fields. Without this, the
`PATCH /profile` call from the new screen silently no-ops on those
fields (data still saved in localStorage, so no patient-facing error,
just less durable).

```bash
cd /tmp && rm -rf cu && mkdir cu && cd cu && \
curl -sL -o index.mjs https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/users/credimed-users.lambda.js && \
curl -sL -o package.json https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/users/package.json && \
sed -i 's|"main": "credimed-users.lambda.js"|"main": "index.mjs"|' package.json && \
npm install --silent && \
zip -qr - . > pkg && \
aws lambda update-function-code --function-name credimed-users --zip-file fileb://pkg && \
echo "===== credimed-users RE-DEPLOY OK ====="
```

**Verify:** in DynamoDB → `credimed-users` table → after a patient
completes claim-review, the row gains `dob`, `gender`, `relationship`,
etc. attributes.

### 2. Re-deploy `credimed-claims` (~2 min)

PATCH route now accepts `faxConfirmationId`, `faxedAt`,
`submissionNotes`. ALLOWED_STATUSES gains `submitted_to_carrier` +
`needs_attention`. Without this, the admin "Mark as faxed" form
fails with HTTP 400 on the new fields.

```bash
cd /tmp && rm -rf cc && mkdir cc && cd cc && \
curl -sL -o index.mjs https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/claims/credimed-claims.lambda.js && \
curl -sL -o package.json https://raw.githubusercontent.com/jlcsanchez/credimed/main/backend/claims/package.json && \
sed -i 's|"main": "credimed-claims.lambda.js"|"main": "index.mjs"|' package.json && \
npm install --silent && \
zip -qr - . > pkg && \
aws lambda update-function-code --function-name credimed-claims --zip-file fileb://pkg && \
echo "===== credimed-claims RE-DEPLOY OK ====="
```

The deployed function in AWS is named `credimed-get-claims`, not
`credimed-claims`. If the above command errors with "function does not
exist", swap the function name in the last `aws lambda` line:

```bash
aws lambda update-function-code --function-name credimed-get-claims --zip-file fileb://pkg
```

**Verify:** in admin claim drawer → "Mark as faxed manually" → enter
fake confirmation → status flips to "Faxed to carrier" without HTTP error.

### 3. Deploy `credimed-translation` (new Lambda, ~10 min)

Independent of submission flow — translates Spanish factura → English
PDF, saves to S3. Optional but improves carrier acceptance rates.

Follow the full guide in `backend/translation/DEPLOY.md`. Summary:
1. Create Lambda named `credimed-translation` (Node 22.x, arm64, 256 MB)
2. Attach IAM policy from `DEPLOY.md` (DynamoDB + Translate + S3)
3. Run the bundle/upload command from the same doc

### 4. Deploy `credimed-claim-submitter` (new Lambda, ~15 min)

The big one — generates ADA + POA + bundles + (in stub mode) does NOT
send fax, just returns the presigned URL.

Follow `backend/fax/DEPLOY.md`. Summary:
1. Create Lambda `credimed-claim-submitter` (Node 22.x, arm64, **512 MB**, **30s timeout**)
2. Attach IAM policy: DynamoDB GetItem/UpdateItem on credimed-claims, KMS Decrypt, S3 GetObject/PutObject on credimed-edi-archive, SES SendEmail
3. Set env vars: `KMS_KEY_ID`, `FROM_EMAIL`. **Do NOT set `FAX_PROVIDER` yet — leave it as `stub`** so no real faxes go out until BAA is signed.
4. Bundle + upload via CloudShell (command in DEPLOY.md)
5. Add API Gateway route `POST /admin/claims/{id}/submit` (command in DEPLOY.md)

**Verify:** in admin → click "Generate PDF bundle" on any paid claim →
returns presigned URL → download the PDF → the bundle contains ADA +
POA pages.

### 5. Switch to live fax sending (WestFax BAA is now active)

BAA was countersigned 2026-05-02. Once `credimed-claim-submitter`
is deployed in stub mode (step 4) and you've test-generated at least
one bundle successfully, flip to live mode. This is **only env var
changes** on the Lambda — no re-bundle, no IAM change.

**Before flipping, get from the WestFax dashboard:**
- **Product ID** (also called "API Key") — Settings → API → "Production Key"
- **Username** — your WestFax login email

Save both into AWS Systems Manager Parameter Store as SecureString,
or paste directly into the env vars below.

```bash
aws lambda update-function-configuration \
  --function-name credimed-claim-submitter \
  --environment "Variables={KMS_KEY_ID=arn:aws:kms:us-west-2:525237381183:key/e41660e6-4357-43d2-9ff3-f6d3c80d80de,FROM_EMAIL=Credimed <support@credimed.us>,FAX_PROVIDER=westfax,FAX_API_KEY=YOUR_PRODUCT_ID,FAX_USERNAME=YOUR_USERNAME,FAX_SENDER_NUMBER=+16177494550,FAX_FEEDBACK_EMAIL=ceo@credimed.us}"
```

Replace `YOUR_PRODUCT_ID` and `YOUR_USERNAME` with the values WestFax
gave you in the activation email.

**Verify:** click "Generate PDF bundle" → in addition to the download
URL, the response includes `faxConfirmationId` and the claim's status
auto-flips to `submitted_to_carrier`. WestFax dashboard shows the
outbound fax under "Sent".

---

## Verification checklist (run after each step)

- [ ] After step 1: complete a claim flow → DynamoDB `credimed-users`
      row has `gender`, `dob`, `relationship`, `groupNumber`, `employer`
- [ ] After step 2: admin → claim drawer → "Mark as faxed manually" →
      paste fake conf ID → status pill flips to "Faxed to carrier"
- [ ] After step 3: send a test factura through OCR Lambda → S3 has
      `{claimId}/translation.pdf`
- [ ] After step 4 (stub mode): admin → "Generate PDF bundle" → PDF
      downloads, contains ADA + POA pages, no fax actually sent
- [ ] After step 5 (live mode): same click → also sends fax via WestFax,
      status auto-flips, WestFax dashboard logs the send

## Rollback if something breaks

| Lambda | Rollback |
|---|---|
| `credimed-users` | AWS Console → Lambda → Versions → use the previous published version. Or re-deploy a known-good commit. |
| `credimed-claims` | Same. |
| `credimed-claim-submitter` | This is a new function — if it misbehaves, set `FAX_PROVIDER=stub` to neuter it (no fax sends). Or delete the function entirely; admin gets a 404 on Generate but no patient impact. |
| `credimed-translation` | Same pattern; deletion just means submitter ships bundles without translation pages, which most carriers still accept. |

---

## What's NOT in this checklist (intentionally)

- **OCR Lambda → translation auto-invoke wiring**: 1-line code change in
  the existing `credimed-ocr` Lambda. Skipped from this checklist
  because that Lambda's source isn't in the repo. Add the snippet from
  `backend/translation/DEPLOY.md` Option A when convenient.
- **POA template authored by counsel**: replace the placeholder in
  `backend/fax/templates/poa.pdf` once your lawyer ships it. Until
  then, the placeholder POA goes in the bundle.
- **Carriers that don't accept fax claims at all**: per the 2026-05-02
  research, Delta Dental (all 5 state subsidiaries), Anthem, BCBS-TX,
  BCBS-MA, BCBS-FEP, UHC, Principal, and Renaissance only accept
  mail or EDI — not fax. The Lambda surfaces "No claims fax on file"
  and the admin must mail the bundle (use the `claimsAddress` from
  `carrier-fax-numbers.json`) or submit via Availity / DentalXChange /
  Vyne. Long-term, wire EDI into the submitter as a second channel.
- **Cognito hardening** (password policy, MFA admin, email
  verification): doc'd in `backend/COGNITO_HARDENING.md`. ~15 min in
  Cognito Console.
- **CloudWatch log retention** (HIPAA wants ≤6 years, default is
  forever). One-liner per log group.
- **DynamoDB Point-in-Time Recovery** on each table. One click each.
