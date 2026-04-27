# Clearinghouse integration (Availity)

**Status:** WIP scaffolding · in active development
**Target clearinghouse:** Availity Essentials
**Format:** EDI 837D (X12 005010X224A2) — dental claims
**Submission methods:** API or SFTP (decided per-deployment via env var)

## What's done

- [x] `edi/generator.js` — EDI 837D builder. Takes a Credimed claim object and
      emits a valid X12 837D interchange (ISA → IEA). Handles ISA fixed-width,
      submitter/receiver IDs, billing-provider HL, subscriber-as-patient HL,
      claim-level CLM segment with all required indicators, rendering-provider
      HL with Mexico-friendly NPI/RFC fallback, per-procedure SV3 service
      lines with CDT codes and tooth-number reporting (TOO), and ST/SE +
      GE/IEA control trailers.

## What's coming next (in order)

- [ ] `edi/parser-999.js` — Functional Acknowledgment parser (was the file
      well-formed, did Availity accept it).
- [ ] `edi/parser-277.js` — Claim Status parser (where is each claim in the
      payer's pipeline).
- [ ] `edi/parser-835.js` — Remittance Advice parser (what was paid, denied,
      adjusted).
- [ ] `availity/client.js` — REST API + SFTP submission wrapper. Auth via
      Availity OAuth2 client-credentials grant. Reads `AVAILITY_*` env vars.
- [ ] `credimed-clearinghouse.lambda.js` — Lambda handler. Orchestrates:
      DynamoDB read → 837D generate → Availity submit → write submission
      record back to DynamoDB → emit CloudWatch event for status poller.
- [ ] `test/sample-claim.json` + `test/golden-output.edi` — known-good
      input/output pair for snapshot tests.
- [ ] Frontend updates — new claim status pill values: `submitted_to_clearinghouse`,
      `accepted_by_clearinghouse`, `forwarded_to_payer`, `payer_in_review`,
      `payer_paid`, `payer_denied`. Dashboard timeline shows the full
      pipeline.
- [ ] `AVAILITY_INTEGRATION.md` — playbook for the user with the steps that
      can't be code: Trading Partner Agreement signing, Type 2 NPI
      registration in NPPES, payer enrollment per insurer, sandbox
      credential setup.

## What you (the user) need to do in parallel

These are external steps that have their own calendar and don't depend on
code:

1. **Register Credimed for a Type 2 organizational NPI** at
   [nppes.cms.hhs.gov](https://nppes.cms.hhs.gov). Free. Takes 1-2 weeks for
   approval.
2. **Sign up for Availity Essentials** at [availity.com](https://availity.com)
   and request the Trading Partner Agreement (TPA). Free for most use cases.
   Takes 1-3 weeks for activation.
3. **Enroll Credimed as a billing service with each payer** through Availity
   (Aetna, Cigna, Delta, MetLife, Guardian, Humana, etc.). Each payer
   approves separately. Takes 2-6 weeks per payer; can run in parallel.

When you have NPI + Availity TPA + at least one payer enrollment, the env
vars below get filled and we go live in sandbox.

## Required env vars (placeholders today)

```
AVAILITY_CLIENT_ID         # OAuth client ID from Availity dashboard
AVAILITY_CLIENT_SECRET     # OAuth client secret from Availity dashboard
AVAILITY_SUBMITTER_ID      # 4-15 char ID assigned by Availity (e.g., CRED01)
AVAILITY_SUBMITTER_EIN     # Credimed federal Tax ID
AVAILITY_SUBMITTER_NPI     # Credimed Type 2 organizational NPI (10 digits)
AVAILITY_USAGE_INDICATOR   # "T" for sandbox, "P" for production
AVAILITY_API_BASE          # default: https://api.availity.com
```

Each payer will also have its own `AVAILITY_PAYER_ID_<INSURER>` mapped in
the Lambda config (Aetna = `60054`, Cigna = `62308`, Delta varies by state,
etc. — full list in `AVAILITY_INTEGRATION.md` once written).
