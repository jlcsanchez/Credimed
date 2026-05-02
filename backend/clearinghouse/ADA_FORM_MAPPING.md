# ADA Dental Claim Form — Field Mapping

**Form version:** ADA J430D (2019/2024 revision)
**Purpose:** Generate a filled PDF that gets faxed (along with the
patient's factura, English translation, and signed Power of Attorney)
to the patient's dental carrier as the primary submission path.

**Status:** Mapping is complete. PDF generation Lambda not yet built.
This document is the source of truth for what data each form field
needs, where it comes from in the Credimed flow, and what's missing
today.

---

## Architecture decision (recorded 2026-04-29)

After investigating Availity, EDI 837D, and out-of-country claim
practices, the architecture pivoted from "EDI through Availity" to
"PDF + factura faxed directly to the carrier". Reasons:

1. **EDI 837D requires NPI on the billing/rendering provider lines**.
   Mexican dentists do not have US NPIs. Availity (and other
   clearinghouses) reject claims missing those NPIs. Workarounds
   ("Foreign Provider" designation) are inconsistent across carriers.

2. **US dental carriers route out-of-country claims through paper /
   fax / overseas-online-tool channels by design**. Delta Dental,
   Aetna, Cigna, MetLife all publish a process for foreign-treatment
   reimbursement that explicitly says: pay the dentist, get an
   itemized statement, file a claim with the carrier (fax or mail
   primary; some have a web upload). This is not EDI territory.

3. **Credimed's positioning is administrative service / document
   preparation, NOT a healthcare provider or billing entity**.
   Service Agreement v1.9 §1 explicitly disclaims billing-company
   status. Putting Credimed in box 48-52 of the ADA form (billing
   dentist) would contradict that. The TurboTax model is correct:
   Credimed prepares + transmits, the patient is the filer, the
   foreign dentist is the billing/rendering provider on the form.

4. **Fax is HIPAA-friendly, universally accepted, and 20× cheaper
   than mail**. Pay-per-fax services with HIPAA BAAs (WestFax,
   Documo, Notifyre) cost $0.05–0.10 / page. A typical claim bundle
   (ADA + factura + English translation + POA) is 4–7 pages, so
   ~$0.30–0.70 per claim vs $1.50 for Lob.com mail.

5. **No NPI Type 2 needed for Credimed**. NPI is the Healthcare
   Provider identifier for billing-line use. Credimed never appears
   on the form. The clearinghouse-style EDI submitter ID would only
   matter if we used 837D, which we don't.

The legacy `credimed-clearinghouse.lambda.js` 837D EDI generator stays
in the repo for two reasons: (a) some US-licensed providers may
eventually use Credimed and EDI is the right path for them; (b) it
serves as a structured record of the claim that mirrors the PDF.
But it is no longer the submission path for the Mexico use case.

---

## Submission flow (current architecture)

```
Patient uploads receipt
   ↓
OCR Lambda extracts: procedures, dentist info, amounts, dates
   ↓
Translation Lambda: Spanish factura → English (full document, not just bullets)
   ↓
Patient confirms data + signs ADA form + signs Power of Attorney
   ↓
Pricing engine + payment (existing)
   ↓
ADA PDF Generator Lambda → S3 (s3://credimed-edi-archive/{claimId}/)
   ↓
Bundle Lambda: concatenates [ADA PDF, factura PDF, English translation, POA] into one fax-ready PDF
   ↓
Fax Submission Lambda:
   - Looks up patient.insurer in carrier-fax-numbers.json
   - Sends bundle via WestFax API (HIPAA BAA) to carrier's claims fax
   - Stores fax confirmation ID + transmitted-at timestamp in DynamoDB
   - On retry-able failure: queues for retry; on hard failure: alerts ops
```

The carrier-fax-numbers.json lookup table is per-carrier. Initial
seed (subject to verification by a phone call to each carrier's
provider line):

| Carrier | Claims fax | Notes |
|---|---|---|
| Aetna Dental | +1 859-455-8650 | Verified, public |
| MetLife Dental | +1 315-792-6342 | Verified, public |
| Delta Dental | varies by state subsidiary | Need to call 800-336-8478 |
| Cigna | prefers email at WBGDentalClaims@cigna.com | Email-without-BAA is HIPAA risk; need to call for fax |
| BCBS | varies by state subsidiary | Each Blue plan has its own |
| Guardian | unverified | Call 800-541-7846 |
| United Concordia | unverified | Call 800-332-0366 |
| Humana | unverified | Call 800-833-6917 |
| Anthem | unverified | Call 833-894-1574 |

**Operational task (out of scope for code):** confirm and populate
the missing fax numbers by calling each carrier's provider line.

---

## Why a PDF (and not just the EDI we already have)

For the Mexico use case, the EDI 837D path is **not** the primary
submission. The PDF is. Three reasons it's central:

1. **Carriers want it.** The out-of-country reimbursement flow
   published by Delta Dental, Aetna, Cigna et al. asks for the ADA
   form filled with the foreign treatment details. Faxing the PDF
   matches their existing intake process.

2. **It carries information EDI loses.** The factura, the English
   translation, the signature image, the radiographs — these get
   bundled with the PDF in a single fax. EDI 837D is structured
   data only and cannot transmit binary attachments without
   companion EDI 275 or a separate process.

3. **It's the audit artifact.** When the patient asks "what
   exactly did you submit on my behalf?", the answer is a PDF
   they can read. EDI segments are unreadable to humans.

---

## Field-by-field mapping

Field numbers below match the official ADA 2019 form. Source columns
indicate where the data lives in Credimed today (CredimedState path
or DynamoDB column on `credimed-claims`). Gaps are flagged with ⚠️.

### Header

| # | Field | Source | Status |
|---|---|---|---|
| — | Type of transaction (Statement of Actual Services / Request for Predetermination / EPSDT) | Hardcoded: "Statement of Actual Services" | ✅ |
| — | Predetermination/Preauthorization Number | N/A — out-of-network reimbursement | ✅ |

### 1. Insurance company info (top-left block)

| # | Field | Source | Status |
|---|---|---|---|
| 3 | Company / Plan Name, Address | `claim.insurer` (carrier name) + carrier address lookup | ⚠️ Partial — we capture insurer name but not the carrier's claim mailing address |

**Gap:** need a carrier-address lookup table. Major US dental PPOs:
Aetna, Cigna, Delta Dental (varies by state subsidiary), MetLife,
United Concordia, Guardian, Anthem BCBS, BCBS local plans.

### 2. Pre-authorization

| # | Field | Source | Status |
|---|---|---|---|
| 1 | Predetermination Number | N/A | ✅ skip |
| 2 | Predetermination Date | N/A | ✅ skip |

### 3. Other coverage (secondary insurance)

| # | Field | Source | Status |
|---|---|---|---|
| 4 | Dental? Medical? Both? | Hardcoded: "Dental" | ✅ |
| 5-11 | Other subscriber name, DOB, gender, ID#, plan, employer | `user.secondaryInsurance.*` | ⚠️ Not captured today. Most patients have one plan, so default to "No other coverage" until we add this. |

**Gap:** add an optional "Do you have secondary dental coverage?"
question to the upload flow. Skip if no.

### 4. Patient info

| # | Field | Source | Status |
|---|---|---|---|
| 12 | Policyholder/Subscriber name (last, first, MI, suffix) | `user.firstName`, `user.lastName` | ⚠️ Assumes patient = subscriber. Need a "Are you the policyholder?" flag. |
| 13 | Policyholder/Subscriber DOB | `user.dob` | ✅ Captured in profile.html |
| 14 | Policyholder/Subscriber gender | — | ⚠️ **Not captured.** Required field. |
| 15 | Policyholder/Subscriber ID# (member ID) | `user.memberId` (typed during upload) | ✅ |
| 16 | Plan/Group # | `user.groupNumber` | ⚠️ Sometimes captured from insurance card OCR, sometimes not |
| 17 | Employer Name | `user.employer` | ⚠️ **Not captured.** Optional but commonly required. |
| 18 | Relationship of patient to subscriber | "Self" if patient = subscriber | ⚠️ Need explicit flag |
| 19 | Reserved | — | ✅ skip |

**Gap:** add gender (M/F/X), employer, subscriber-relationship to the
upload flow. Block #14 is the most common rejection reason for our
demographic.

### 5. Patient (if different from subscriber)

| # | Field | Source | Status |
|---|---|---|---|
| 20 | Patient Name | If patient ≠ subscriber | ⚠️ Not captured. Default to subscriber. |
| 21 | Patient DOB | "" | ⚠️ Same |
| 22 | Patient Gender | "" | ⚠️ Same |
| 23 | Patient ID/Account# | Internal: `claim.id` (CMX-...) | ✅ |

### 6. Record of services provided (the actual claim lines)

This is the heart of the form. The ADA form has 10 service line
slots (boxes 24-32, repeated 10 times). Each line has:

| # | Field | Source | Status |
|---|---|---|---|
| 24 | Procedure date (MM/DD/YYYY) | `receipt.treatmentDate` (single date for whole receipt) | ⚠️ Per-procedure dates not captured — most receipts have one date but some span multiple visits |
| 25 | Area of oral cavity | Per-procedure: 00=full mouth, 01=upper right quadrant, etc. | ⚠️ **Not captured.** Required. |
| 26 | Tooth system designation | Hardcoded: "JP" (Universal/National) | ✅ |
| 27 | Tooth number(s) or letter(s) | Per-procedure: "1"-"32" or "A"-"T" | ⚠️ **Not captured.** Required for restorative/endo procedures. |
| 28 | Tooth surface | Per-procedure: M/O/D/L/F/I/B (mesial/occlusal/distal/lingual/facial/incisal/buccal) | ⚠️ **Not captured.** Required for fillings, crowns. |
| 29 | Procedure code (CDT) | OCR'd CDT or our mapper output | ✅ |
| 29a | Diag pointer (A/B/C/D from boxes 33-36) | "" | ✅ skip — diagnoses rarely used in dental |
| 29b | Quantity | Hardcoded: "1" | ✅ |
| 30 | Description | Bilingual procedure name (EN/ES) | ✅ |
| 31 | Fee | `receipt.lineItems[i].amount` (USD) | ✅ |
| 31a | Other fee | "" | ✅ skip |
| 32 | Total fee | Sum of column 31 | ✅ derived |

**Gap (CRITICAL):** boxes 25, 27, 28 are the biggest unknown today.
The OCR Lambda extracts procedure name and amount but doesn't extract
tooth-level data (which tooth, which surface). We need either:
- A post-OCR step where the patient or a Credimed reviewer manually
  enters tooth/surface from the receipt
- Or an enhanced OCR that parses Mexican factura tooth references
  ("diente 14", "Pieza dental #36", etc.)

For Phase 1 (MVP): leave 25/27/28 blank if not extractable, accept
the higher denial rate, and resubmit with manual entry on denial.

### 7. Authorizations (signatures)

| # | Field | Source | Status |
|---|---|---|---|
| 36 | Patient/Guardian signature + date | `claim.signature.dataUrl` + `claim.signedAt` | ✅ Captured in agreement.html |
| 37 | Subscriber signature (Authorization for assignment) | Same as 36 if patient = subscriber | ✅ |

⚠️ The PDF needs to render the signature image into the signature
box, not just text. pdf-lib supports embedded PNG. The Credimed
signature pad already saves as a PNG data URL.

### 8. Ancillary claim/treatment information

| # | Field | Source | Status |
|---|---|---|---|
| 38 | Place of treatment (1=office, 2=hospital, 12=home, etc.) | Hardcoded: "1" (office) | ✅ |
| 39 | Number of enclosures (radiographs, models, narrative) | Count of `claim.attachments[]` | ⚠️ Need to track attachments separately |
| 40 | Is treatment for orthodontics? | Hardcoded: "No" | ✅ skip |
| 41 | Date appliance placed | N/A | ✅ skip |
| 42 | Months of treatment remaining | N/A | ✅ skip |
| 43 | Replacement of prosthesis? | "No" unless flagged | ⚠️ For crowns/dentures, ask the patient |
| 44 | Date of prior placement | N/A | ⚠️ |
| 45 | Treatment resulting from (auto accident / employment / other) | Hardcoded: "None" | ✅ |
| 46 | Date of accident | N/A | ✅ |
| 47 | Auto accident state | N/A | ✅ |

### 9. Billing dentist OR dental entity (boxes 48-52)

This is the **Credimed dental clinic partner** — the Mexico-based
provider who actually performed the work. Not Credimed LLC

| # | Field | Source | Status |
|---|---|---|---|
| 48 | Name, address | `receipt.dentist.name`, `receipt.dentist.address` | ⚠️ Only name today, no address |
| 49 | NPI | `receipt.dentist.npi` | ⚠️ **Not captured.** Mexican dentists usually don't have a US NPI; some carriers waive this for OON, others reject without it. |
| 50 | License # | `receipt.dentist.license` | ⚠️ Mexican cédula profesional — not equivalent to US license. Carriers may accept. |
| 51 | SSN or TIN | — | ⚠️ Skip — Mexican provider, no US tax ID |
| 51a | Type of additional provider ID | Hardcoded: "Foreign provider" | ✅ |
| 52 | Phone, fax, email | `receipt.dentist.phone` | ⚠️ Optional |
| 52a | Additional provider ID | "" | ✅ skip |

**Gap (CRITICAL for OON Mexico):** US carriers' OON rules vary. Some
require a US NPI for the rendering provider, others accept "Foreign
provider" with cédula profesional. The clearinghouse will reject the
claim if NPI is required but blank. We need a per-carrier rule table
or, simpler, fall back to box 53 (Treating Dentist) being Credimed's
admin entity (hypothetical "Credimed Dental Services" with our own
NPI Type 2).

### 10. Treating dentist and treatment location

| # | Field | Source | Status |
|---|---|---|---|
| 53 | Signature, date | Mexican dentist's signature on the receipt + date | ⚠️ Receipt OCR captures date, but signature is the dentist's own — Credimed doesn't sign on their behalf. Some carriers will accept the receipt itself as proof of provider signature; others won't. |
| 54 | NPI | Same as 49 | ⚠️ |
| 55 | License # | Same as 50 | ⚠️ |
| 56 | Address | Same as 48 | ⚠️ |
| 56a | Provider specialty code | Hardcoded: "1223G0001X" (general dental) | ✅ |
| 57 | Phone | Same as 52 | ⚠️ |
| 58 | Additional provider ID | "" | ✅ skip |

---

## Summary of gaps

In rough order of how often a missing field causes a denial:

1. **Tooth number + surface (box 27, 28)** — every restorative claim
2. **Patient gender (box 14)** — required field, blank = auto-reject
3. **Provider NPI (box 49, 54)** — varies by carrier
4. **Carrier mailing address (box 3)** — required for paper claims
5. **Group number (box 16)** — sometimes carrier requires it
6. **Subscriber relationship (box 18)** — required if patient ≠ subscriber
7. **Employer name (box 17)** — commonly required, sometimes optional
8. **Provider address + license (box 48, 50)** — usually OK with what's on the receipt

---

## Implementation plan (Phase 1 MVP — fax-first architecture)

The build is split across four Lambdas plus frontend changes. Each is
independently testable and deployable.

### 1. `credimed-ada-pdf-generator` (Node.js 20.x)

**Trigger:** invoked after the claim is paid + reviewed and the
patient has signed the ADA + POA.

**Input:** claim object (from DynamoDB) + signature image (data URL
or S3 key) + POA signature.

**Output:** filled ADA PDF written to
`s3://credimed-edi-archive/{claimId}/{claimId}-ada.pdf`.

**Dependencies:** `pdf-lib` (Apache 2.0, ~600 KB; pure JS, no native
deps so deploys clean to Lambda). The blank ADA J430D form is bundled
into the Lambda deployment package.

**Field map:** a `FIELD_MAP` constant mapping the ADA PDF's actual
form-field names (enumerated with `pdf-lib`'s `getFields()`) to the
claim-data paths in this document's mapping table.

**IAM:** `s3:PutObject` on the archive bucket; `dynamodb:GetItem` on
`credimed-claims`; `kms:Decrypt` on the PHI key for fields the
webhook lambda already encrypts.

### 2. `credimed-poa-pdf-generator` (Node.js 20.x)

**Trigger:** invoked when patient signs the POA (during agreement
step).

**Output:** filled Power of Attorney PDF written to
`s3://credimed-edi-archive/{claimId}/{claimId}-poa.pdf`.

**Template:** static POA PDF authored by counsel. Authorizes
Credimed Inc to prepare and submit the dental insurance claim on
the patient's behalf, transmit by fax to the carrier, and receive
status updates from the carrier on the patient's behalf. No
authority to receive funds (which already go directly to the
patient per the carrier's process).

**Why a separate Lambda:** the POA template is independent of the
ADA form template and is reused across every claim; clean separation
keeps the ADA generator focused.

### 3. `credimed-translation` (Node.js 20.x)

**Trigger:** invoked after OCR completes, before patient review.

**Input:** Spanish factura text + OCR-extracted procedure list.

**Output:** English translation of the full factura, written to
`s3://credimed-edi-archive/{claimId}/{claimId}-translation.pdf`. Also
updates the claim record with a translated procedure list (so the
claim review page renders English-side-by-side).

**Implementation:** uses Amazon Translate (HIPAA-eligible service,
covered by AWS BAA). Falls back to a static dental-term dictionary
for procedure names where Amazon Translate produces poor results
(e.g. "Endodoncia" → "Endodontics" rather than the more useful
"Root canal therapy"). The dictionary is the same one used by
the OCR Lambda's bilingual procedure naming.

### 4. `credimed-fax-submitter` (Node.js 20.x)

**Trigger:** invoked once all four PDFs are present in S3 (ADA,
factura PDF rebuilt from OCR, English translation, POA) AND the
claim is in a "ready_to_submit" status.

**Input:** claim object + the four S3 keys.

**Process:**
1. Concatenates the four PDFs into a single fax-ready PDF (pdf-lib's
   `mergePdf`).
2. Looks up `claim.insurer` in `carrier-fax-numbers.json` to find
   the destination fax.
3. Calls WestFax (or chosen HIPAA-BAA fax provider) REST API to
   send. Credentials live in AWS Secrets Manager under
   `credimed/fax-provider/credentials`.
4. On 2xx response, stores the provider's fax-id + transmitted-at
   timestamp on the claim record.
5. On 4xx (bad request — likely a missing required field), marks the
   claim "needs_attention" and queues an admin notification.
6. On 5xx (provider issue), retries with exponential backoff up to 3
   times via Lambda retry config; after that, marks "submission_failed"
   and queues admin notification.

**Idempotency:** the WestFax API `client_id` parameter is set to
`{claimId}-{retryAttempt}`, so duplicate sends are deduped by the
provider rather than by Credimed.

### Frontend changes (Phase 1 — capture missing fields)

**New page: `/app/claim-review.html`** between estimate.html and
agreement.html. Renders:

1. **OCR-detected procedures** with editable CDT codes per row.
   Each procedure is a row with: CDT code (dropdown of common
   options, with the OCR pick highlighted), description (Spanish
   from OCR + English autotranslation), tooth number selector
   (1-32 + A-T per Universal/National numbering), surface checkboxes
   (M/O/D/L/F/I/B), fee (read-only from receipt).
2. **Dentist info** (extracted from factura): name, clinic address,
   cédula profesional, phone — all editable in case OCR missed.
3. **Patient confirmation:** gender (M/F/X), confirmed DOB,
   confirmed mailing address.
4. **Service Agreement summary** (collapsed by default with a
   "review" link).
5. **CTA: "Looks correct → continue to sign and pay"**.

**Updates to `/app/agreement.html`:**
- Add the POA signature step alongside the existing ADA signature.
  Both go in one signature pad sequence; UI shows them as two
  required signatures with brief explanations.
- Persist `claim.signature.adaDataUrl` and `claim.signature.poaDataUrl`
  separately.

**Updates to `/app/profile.html` (already done in earlier work):**
- gender, employer, group number — these are now captured during
  claim review per claim, but profile can still hold defaults.

**Frontend changes (Phase 2 — better OCR-driven prefill)**

- Extend the OCR Lambda's parser to detect Spanish patterns:
  - `diente \d+`, `pieza dental #\d+`, `pza\.\s*\d+`, `tooth \d+`
  - Surface keywords: `mesial`, `distal`, `oclusal`, `lingual`,
    `vestibular`, `incisal`
- Best-effort surface inference from the procedure description:
  - `Corona porcelana sobre molar` → all surfaces
  - `Resina MOD` → M, O, D
  - `Endodoncia` → no surface (procedure is whole-tooth)
- The claim-review page still allows override; OCR prefill just
  reduces patient typing.

### Carrier fax lookup table

`backend/clearinghouse/carrier-fax-numbers.json` — static JSON,
loaded into the fax-submitter Lambda on cold start. Initial seed in
the table above. Format:

```json
{
  "aetna": {
    "displayName": "Aetna Dental",
    "claimsFax": "+18594558650",
    "verifiedAt": "2026-04-29",
    "notes": "Public on aetna.com claim form"
  },
  "metlife": { ... }
}
```

Operationally maintained — when a carrier changes its fax (rare but
happens), update the JSON and redeploy. A monthly check against
each carrier's published claim form prevents drift.

### Testing

Golden fixtures, one per major scenario:

1. **Aetna single-procedure** — one filling on tooth #14, $500 USD
   from $9,000 MXN factura, patient is the policyholder.
2. **Delta Dental multi-procedure** — crown #14 + endo #14 +
   bone graft, multi-line, $2,400 USD from $43,000 MXN.
3. **BCBS with dependent patient** — child as patient under
   parent's plan, single procedure.
4. **Cap-walked Micro tier** — $400 refund estimate triggers cap
   walk-down, $19 fee.

For each: run the four Lambdas, manually inspect the bundled PDF,
visually verify against the blank ADA form, run a Lambda-local
smoke test that asserts the bundled fax PDF is non-empty,
syntactically valid, and contains all four sub-documents.

---

## Resolved questions (previously open)

1. **Do we sign on the dentist's behalf?**
   No. Box 53 (treating dentist signature) gets the literal text
   "See attached factura". The Mexican dentist's signature on the
   factura itself is the attestation; we don't fabricate or extract
   it. Carriers accept this for out-of-network international claims.

2. **Do we get our own NPI Type 2?**
   No. NPI Type 2 was being considered to put Credimed in the
   billing/rendering provider lines (boxes 48-56). That would
   contradict Service Agreement v1.9's explicit disclaimer of
   billing-company status. The Mexican dentist is the billing AND
   rendering provider — both because that's true (they actually
   billed the patient) and because it's the only positioning
   consistent with the agreement. The "Foreign Provider"
   designation is used in NPI fields. Some carriers may reject;
   resubmissions handle the recoverable cases.

3. **Where does the provider signature image come from?**
   It doesn't. We attach the factura PDF as an enclosure. Box 53
   says "See attached factura". Box 39 (number of enclosures)
   tracks attachment count.

4. **CDT codes — who is responsible for accuracy?**
   **The patient confirms each CDT code on the claim review page
   before paying.** The OCR Lambda's mapper provides the initial
   pick (with confidence score), and the patient sees a dropdown of
   plausible alternatives sorted by likelihood. If they're unsure,
   they can leave the OCR pick. The Service Agreement is updated
   to make explicit that the patient is the final authority on
   submitted codes — this both shifts the legal responsibility
   correctly and operationalizes it cheaply (no in-house specialist
   reviewer needed at MVP scale).

5. **Provider NPI for foreign dentists — accepted by Availity?**
   Moot. The architecture pivoted away from EDI/Availity for the
   Mexico use case. See "Architecture decision" at the top.

---

## Operational tasks (out of code scope, for the founder)

These are prerequisites for the fax-first architecture to actually
work in production. None of them are blocked on engineering, and
none of them affect the build plan above.

1. **Sign up with WestFax** (or chosen HIPAA-BAA fax provider).
   Confirm BAA is in place. Buy a fax number. Store API
   credentials in AWS Secrets Manager under
   `credimed/fax-provider/credentials`.

2. **Confirm carrier fax numbers** by phone for the carriers in
   the table where the entry is unverified (Delta Dental, Cigna,
   BCBS, Guardian, United Concordia, Humana, Anthem). Update
   `carrier-fax-numbers.json`.

3. **POA template** — get counsel to produce a signed-off Power
   of Attorney template authorizing Credimed to file dental claims
   on the patient's behalf. The PDF generator fills patient name,
   DOB, address, signature image, and date.

4. **Service Agreement v2.0** — minor revision to:
   - Make explicit that patient confirms CDT codes on the review
     page and is the final authority on submitted codes.
   - Reference the POA as a separate authorization the patient
     signs once per claim.
   - Reaffirm Credimed's role as preparer + transmitter, not
     billing entity.
