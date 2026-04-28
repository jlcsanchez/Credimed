# Session notes — Apr 27-28, 2026

End-to-end claim flow now works on PC. Everything pushed to `main`.

## ✅ What's done

### Auth + state hygiene
- `app/state.js` schema version bumped 1 → 2 — drops Claude Design demo data (CMX-2026-DEMO9 / Alex Rivera) on first read
- `app/login.html` signup / signin / signout now `CredimedState.clear()` + `localStorage.removeItem('credimed.demo')` unconditionally — new accounts can never inherit old session data
- `app/login.html` signup attempts `cognitoSignIn` immediately after `cognitoSignUp` — auto-confirms when the Pre-Sign-Up Lambda is wired (see `emails/AWS-SETUP.md`); falls back to the verify-code screen otherwise
- `app/login.html` verify screen now hints at spam / junk folder while users wait on the generic Cognito sender (until SES is up)

### PC layout parity (12 pages)
Every page in the customer-facing flow now reads real session data on PC instead of Claude Design's hardcoded mockups. Pattern in most cases: hide the decorative `.{page}-pc` block, stretch the working mobile mockup to the PC viewport, OR replace mockup HTML with state-driven elements + a hydrator IIFE.

| Page | Fix shipped in |
|---|---|
| `app/documents.html` | native label+input upload, querySelectorAll across mobile+PC roots, OCR id sanitize |
| `app/processing.html` | hide `.stage` iPhone wrapper, full-viewport teal gradient |
| `app/estimate.html` | hide hardcoded `.est-pc` mockup |
| `app/plan.html` | hide hardcoded D2740/D3330 mockup |
| `app/before-sign.html` | "Read full agreement" link wired to `/legal/AGREEMENT_v1.9.html` |
| `app/agreement.html` | hide broken `.agr-pc`, stretch mobile (v1.9 TERMS_HTML + signature pad) |
| `app/payment.html` | hydrate order summary + retry mount on stale prefetch + already-paid redirect |
| `app/submission-confirmed.html` | hide duplicated mobile mockup on PC, hydrate `#confClaimId` |
| `app/dashboard.html` | hydrator reads claim from CredimedState + backend `/claims`, progress bar aligns to milestones, pending stat with multi-field fallback |
| `app/claim.html` | hide decorative `.claim-pc`, stretch mobile with backend `/claims/:id` fetch |
| `app/claims.html` | hydrate PC table from same `ALL` array as mobile cards |
| `app/profile.html` | hydrate name / email / avatar / inputs from `cognitoGetCurrentUser` |

### Stripe payment loop fixes
Multiple iterations chasing a `400 on /v1/elements/sessions` that turned out to be Lambda's idempotency cache returning an already-succeeded PaymentIntent. Final defense:
- `payment.html` redirects to `submission-confirmed` if `payment.status === 'paid'` is set in CredimedState
- `documents.html` clears stale `claim.id` / `pendingPaymentIntent` when starting a fresh flow
- `payment.html` retries mount with a fresh Lambda call if the prefetched clientSecret is rejected once
- ReferenceError fixes (`cs is not defined`, `scope is not defined`) that were cascading into Stripe element loaderror

### Transactional email templates (7)
`/emails/` folder with branded HTML templates ready for SES wiring. Same color palette as press kit (`#0D9488` / `#134E4A` / `#FAF6EF`). Mustache-style placeholders, table-based for email-client compatibility, system-font stack.

| File | Trigger |
|---|---|
| `01-welcome.html` | Post-signup |
| `02-payment-receipt.html` | `payment_intent.succeeded` |
| `03-claim-filed.html` | EDI 837D submitted |
| `04-claim-approved.html` | EDI 835 carrier approved |
| `05-claim-denied.html` | EDI 835 carrier denied |
| `06-refund-paid.html` | Carrier paid the patient |
| `07-need-more-docs.html` | Carrier requested additional documentation |

`emails/README.md` documents brand specs / placeholders / testing.
`emails/AWS-SETUP.md` is a 25-minute checklist for SES domain identity, DKIM/SPF/DMARC DNS, SES production access request, bounce/complaint webhooks.

### OCR robustness
- `app/documents.html` `handleFile()` strips `\s+` from extracted `memberId` and `groupId` before storing — receipts / cards visually pad numbers (`'0023550 33'`) and carriers reject claims when the spaced version is submitted

### Quick UX fixes
- Estimate page bottom row now shows full procedure list when receipt has multiple line items, not just legacy singular field
- Dashboard PC progress bar percentages aligned to label positions (0/33/67/100, not 25/55/80/100)

## ⏳ Waiting on you (offline tasks)

In recommended order:

1. **Northwest** — Delaware C-corp filing. Output: Certificate of Incorporation. Cost ~$89-$214 year 1. **Start here.**
2. **IRS SS-4** — EIN. Free, instant if you have SSN. Needs paso 1 first.
3. **Mercury Bank** — business account. Needs EIN + Cert of Inc.
4. **MA Foreign Qualification** — ~$275, register Delaware corp in MA.
5. **NPI Type 2** — organizational NPI. Free, needs EIN.
6. **Business insurance** — Hiscox/Coalition/Vouch. ~$2,500/year.
7. **Stripe production** — flip from test mode. Needs EIN + bank.
8. **Availity registration** — needs EIN + NPI + bank.
9. **SES domain identity + DNS** — 25 min checklist in `emails/AWS-SETUP.md`.
10. **Cognito → SES email provider** — change FROM to `verification@credimed.us`.

## 🔄 In my backlog (not done, waiting for your green light)

- **Pricing engine 25% cap + Lite tier $29** — fix in `pricingEngine.js` (~10 lines) + cascading updates to plan.html, payment.html, press-kit. ~30 min when you say go.
- **Procedure translation EN / CDT codes** — `app/procedures.js` dictionary + Claude API fallback for unknown items. ~1 hour.
- **Fase 1 funnel refactor** — move login gate from `documents.html` to `plan.html`. Anonymous upload → estimate → signup gate. Cloudflare Turnstile + IP rate limit on OCR Lambda. ~3-4 hours, will need you online so we can test together.
- **Playwright E2E tests** — automated smoke test for the full claim flow. Currently next on my autonomous queue.

## 🚫 What I cannot do from here

- AWS console (Lambda deploy, Cognito triggers, SES identities, DynamoDB)
- Cloudflare DNS / Turnstile widget setup
- Stripe production keys / webhook URLs
- Availity credentials
- Northwest / IRS / Mercury filings
- Test on a real phone or different devices

Everything else is fair game. When you're back, point me at the next thing.

## File index — what got touched today

```
app/agreement.html
app/before-sign.html
app/claim.html
app/claims.html
app/dashboard.html
app/documents.html
app/estimate.html
app/login.html
app/payment.html
app/plan.html
app/processing.html
app/profile.html
app/state.js
app/submission-confirmed.html

emails/01-welcome.html              (new)
emails/02-payment-receipt.html      (new)
emails/03-claim-filed.html          (new)
emails/04-claim-approved.html       (new)
emails/05-claim-denied.html         (new)
emails/06-refund-paid.html          (new)
emails/07-need-more-docs.html       (new)
emails/README.md                    (new)
emails/AWS-SETUP.md                 (new)

SESSION-NOTES.md                    (this file, replacing prior session's)
```
