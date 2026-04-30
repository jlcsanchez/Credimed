# Future Ideas — parked architecture decisions

This file captures ideas we discussed and **deliberately did not build
yet**. Each entry has the trigger conditions for revisiting and the
key risks/notes from the original conversation. The goal is to avoid
re-litigating the same decisions in 6 months.

---

## Hybrid portal-submission + fax fallback

**Status:** Parked. Revisit at 100+ claims/month.

**Idea:** Instead of submitting all claims via fax, submit through the
patient's member portal at the carrier when possible (Delta, MetLife,
Cigna, Guardian, etc. all support out-of-network claim submission via
the member portal). Fall back to fax for carriers that don't support it
or when the portal flow fails. The same portal credentials would later
power automatic claim status retrieval — solving the "approved/paid"
notification problem we currently can't automate (Mexican dentists have
no NPI, so EDI 276/277 status inquiry is closed to us).

**How it would work:**
1. Patient pays → estimate locked
2. Lookup carrier in DynamoDB `credimed-carriers` table → tier=portal or tier=fax
3. If portal-tier and we have credentials: invoke `credimed-portal-submitter`
   Lambda (Playwright headless Chromium). Logs in, fills "Submit OON
   Claim" form, uploads receipt, captures confirmation number,
   screenshots every step into S3 for HIPAA audit trail.
4. If MFA appears: pause the Lambda, push notification to patient,
   patient pastes the code into `/app/mfa-relay.html`, Lambda picks it
   up via SNS or DynamoDB poll, completes MFA.
5. Daily `credimed-status-checker` Lambda re-uses the same login to
   detect status transitions (Pending → In Review → Approved → Paid)
   and triggers the corresponding email.
6. If any portal step fails → automatic fallback to existing fax path.

**Why we said no for now (April 2026):**
- 0 claims when the idea was raised; premature optimization.
- Single founder; can't realistically maintain scrapers across 5+
  carriers each with quarterly portal redesigns.
- Carrier ToS prohibits credential sharing — gray zone Plaid took 10
  years to get past for banking. Dental insurance has no equivalent
  open-API mandate (CFPB 1033 doesn't apply).
- MFA is increasingly universal; even with relay flow, the magic of
  "automatic" breaks every login.
- IP fingerprinting from datacenter IPs gets accounts flagged →
  patient's account gets locked → angry patient → bad PR. Residential
  proxy ($100-300/mo) reduces but doesn't eliminate this.
- Cost per claim balloons from $0.30 (fax) to $3-5 (portal + status
  checks + proxy + storage).
- Reputational risk: even ONE patient locked out of their carrier
  account because of us could tank early trust. Fax has no such risk.

**Trigger conditions to revisit:**
- 100+ claims per month, sustained for ≥3 months
- ONE carrier represents ≥40% of claim volume (justifies single-carrier
  pilot — start with Delta if it's that carrier)
- That carrier's portal has been stable for 6+ months (no major
  redesign)
- Patients are actively complaining about lack of status visibility
  (measure with surveys; do not assume)
- Either: a) hired a part-time engineer who can own the scraper, or
  b) clearinghouse status APIs (pVerify, Eligible) have added support
  that does NOT require billing-provider NPI — keep tabs annually.

**If we do build it later, sequence:**
1. Update Service Agreement with explicit Portal Access Authorization
   §X (template language already drafted in the conversation).
2. Build `credimed-carriers` DynamoDB table with `tier` flag.
3. Pilot with ONE carrier (the dominant one) and 5-10 voluntary
   patients. Measure: time to submit, fail rate, MFA frequency,
   support tickets.
4. Only expand to second carrier if pilot success rate >85%.
5. Always keep fax fallback wired — never make portal the hard path.

**Required infrastructure:**
- AWS Secrets Manager + KMS CMK for encrypted credential storage
- Per-patient IAM-isolated secret paths
- Playwright on Lambda (custom container image — Node base + Chromium)
- Step Functions if Playwright runtime exceeds 15-min Lambda max
- Residential proxy provider (Bright Data, Oxylabs, or similar)
- SNS topic for MFA push to patient
- `mfa-relay.html` page with short-lived token redemption

---

## pVerify eligibility check before payment

**Status:** Parked. Revisit at month 2-3 of operations (after first 20
claims).

**Idea:** Before charging the patient our fee, call pVerify's
eligibility API (270/271 transaction wrapper) with member ID + DOB +
carrier. Returns: plan active? deductible remaining? annual max used?
out-of-network covered? frequency limits? pre-auth required?

**Why valuable:** Today we're cobring patients $19-99 without knowing
whether their plan is even active or covers OON care. If a plan is
inactive or doesn't cover OON, the claim is dead-on-arrival and we
have to issue the money-back refund — burning the cost of fax,
Lambda, and translation work we already did. pVerify costs ~$0.10-0.30
per check; protecting margin on even ONE rejected claim pays for
~100 checks.

**Why we didn't build it yet:** No claims yet. Get real data on which
carriers and which plan failure modes are most common before adding a
$30-100/mo recurring cost.

**Eligibility check works WITHOUT NPI** because the question is about
the member's coverage, not about the provider asking. This is the one
clearinghouse capability we CAN use as out-of-country.

**Trigger to revisit:** First claim that gets denied for "plan
inactive" or "OON not covered" — that's the moment to wire pVerify.
Until then, every claim teaches us which carriers/plans are reliable.

---

## Admin dashboard with structured training-data capture

**Status:** Active priority — to build alongside email pipeline.

**Idea:** Every manual review decision the founder makes today should
be logged as labeled training data so that in 6-12 months a fine-tuned
or few-shot AI can take over with high confidence.

**Schema (DynamoDB `credimed-review-decisions`):**
```json
{
  claimId: "abc123",
  documentType: "receipt|insurance|eob|xray",
  s3Key: "documents/abc123/receipt.pdf",
  aiExtraction:    { ...what Textract/Claude proposed },
  humanCorrection: { ...what the reviewer actually saved },
  decision: "approved|needs_more_docs|rejected",
  decisionReason: "missing_rfc|low_quality|missing_narrative|...",
  reviewerId: "ceo@credimed.us",
  reviewedAt: "2026-04-30T...",
  timeSpentSeconds: 45
}
```

**Why each field matters:**
- `aiExtraction` vs `humanCorrection` → diff teaches WHERE the AI
  systematically fails (e.g., "always misreads tooth number")
- `decisionReason` → structured dropdown (NOT free text) so we can
  train a classifier on patterns
- `timeSpentSeconds` → identifies fast vs slow reviews; fast ones are
  candidates for auto-approval at high AI confidence
- `reviewerId` → enables inter-reviewer agreement once the team grows

**Maturity stages:**
- **Stage 1 (0-50 claims):** 100% manual review by founder. Capture
  every decision in DynamoDB. Goal: 50 high-quality labeled examples.
- **Stage 2 (50-200 claims):** AI extracts first, shows confidence
  score and findings, reviewer one-clicks "approve as-is" or edits
  before saving. Reviewer time per claim drops from 5 min to 30 sec.
- **Stage 3 (200+ claims):** Auto-process when AI confidence >95%
  AND no red flags (large amount, new patient, unusual carrier).
  Reviewer queue shrinks to ambiguous cases only. Track
  `% auto-approved` as the KPI.

**Required UI affordances:**
- Side-by-side document viewer (original PDF/image + AI-extracted
  fields, editable)
- "Approve as-is" vs "Edit and save" action buttons (separate so
  we know if the AI's extraction was correct)
- Structured dropdown for `decisionReason` (no free-text)
- Auto-timer measuring time-to-decision

This is the next thing to build after the email consolidation.
