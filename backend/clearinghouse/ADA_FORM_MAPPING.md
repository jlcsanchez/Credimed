# ADA Dental Claim Form — Field Mapping

**Form version:** ADA J430D (2019/2024 revision)
**Purpose:** Generate a filled PDF for clearinghouse submission as an
alternative or supplement to the 837D EDI feed already produced by
`backend/clearinghouse/credimed-clearinghouse.lambda.js`.

**Status:** Mapping only. PDF generation Lambda not yet built. This
document is the source of truth for what data each form field needs,
where it comes from in the Credimed flow, and what's missing today.

---

## Why a PDF when we already have 837D EDI?

The 837D feed (X12) is the modern, electronic format that Availity
and most major US dental carriers accept. But three real cases still
require the paper ADA form:

1. **Insurers without EDI access** — small or regional carriers that
   only process paper claim forms. Less common but still real.
2. **Carrier requests a paper claim during appeal/resubmission** —
   sometimes after a denial, carriers ask for the ADA form even if
   the original was EDI.
3. **Patient-facing audit trail** — patients sometimes want to see
   exactly what was submitted on their behalf. A filled PDF is the
   clearest, most universal artifact for this.

Until we hit one of those cases, EDI is enough. But once we do, the
absence of a PDF generator is a hard blocker — the carrier won't
process the claim and we owe the patient a money-back refund under
the guarantee.

**Recommendation:** build it before we have 50+ active claims/month.
Until then, EDI-only is acceptable.

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
provider who actually performed the work. Not Credimed Inc.

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

## Implementation plan (Phase 1 MVP)

**Backend Lambda:** new function `credimed-ada-pdf-generator`
- Runtime: Node.js 20.x
- Dependencies: `pdf-lib` (Apache 2.0, ~600KB) for filling forms;
  no native deps so deploys clean to Lambda
- Trigger: invoked from `credimed-clearinghouse.lambda.js` after a
  successful claim package is built
- Input: claim object from DynamoDB (same shape used to build the EDI)
- Output:
  - Filled PDF written to `s3://credimed-edi-archive/{claimId}/{claimId}-ada.pdf`
  - Returns the S3 key for the clearinghouse to attach as the paper-form fallback
- IAM: needs `s3:PutObject` on the archive bucket, plus
  `dynamodb:GetItem` on `credimed-claims`

**Form template:**
- Download official ADA J430D fillable PDF (free, public domain)
- Inspect with `pdftk dump_data_fields` or pdf-lib to enumerate field names
- Build a `FIELD_MAP` constant in the Lambda mapping ADA field names
  to claim-data paths

**Frontend changes (Phase 1 — minimum new fields):**
- `documents.html` upload step: add gender select (M/F/X)
- `claim.html` post-OCR review: tooth number + surface entry per
  service line (a small grid: tooth selector + surface checkboxes)
- `profile.html`: optional employer + group number fields
- `mailingAddress` already covers the patient address requirement

**Frontend changes (Phase 2 — better OCR):**
- Extend the OCR Lambda's parser to detect "diente N",
  "Pieza dental #NN", "tooth N" patterns and prefill tooth numbers
- Best-effort surface detection from procedure description (a crown
  on tooth 14 implies all surfaces, an MOD filling implies M+O+D)

**Carrier address lookup:**
- Static JSON file `backend/clearinghouse/carrier-claim-addresses.json`
  with the top 20 US dental PPOs and their claim mailing addresses
- Updated annually or when a carrier changes addresses
- Loaded into the PDF Lambda on cold start

**Testing:**
- One golden test fixture per major carrier scenario:
  - Aetna primary, no secondary, single-procedure (filling, tooth 14)
  - Delta Dental primary, multi-procedure (crown + endo, multi-line)
  - BCBS with secondary coverage, dependent patient (child)
- Render PDF, manually inspect against blank ADA form

---

## Open questions

1. **Do we sign on the dentist's behalf?**
   - Legal: probably no (CMS guidance is the rendering provider must
     sign their own claim). Practically: most carriers accept the
     receipt as the provider's attestation in lieu of box 53 signature
     for OON claims. Decision needed.

2. **Do we get our own NPI Type 2?**
   - LAUNCH.md mentions "NPI Type 2 (CMS) — for clearinghouse Availity"
     as a pending operational task. This would let us be the
     "Billing dentist or dental entity" (boxes 48-52) and sidestep
     the foreign-provider NPI issue. Strongly recommended.

3. **Where does the provider signature image come from for OON Mexico?**
   - The Mexican dentist's wet signature is on the original factura
     (PDF/image). We could OCR-detect the signature region and crop
     it for box 53, but that's fragile. Cleaner: include the original
     factura as an enclosure (box 39) and write "see attached factura"
     in box 53.

4. **CDT codes — who is responsible for accuracy?**
   - The OCR Lambda maps Spanish procedure descriptions to US CDT
     codes via a dictionary. If the mapping is wrong, the claim is
     denied AND we technically committed insurance fraud (filing
     incorrect codes). Need a final human-review step before any
     PDF leaves Credimed for a clearinghouse.
