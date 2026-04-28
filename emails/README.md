# Credimed transactional emails

Seven HTML email templates, brand-consistent (teal `#0D9488`, navy `#134E4A`, cream `#FAF6EF`). Designed to render correctly in Gmail, Outlook, Apple Mail, iOS Mail, and Android Gmail.

## Files

| # | File | Trigger | Sender service |
|---|---|---|---|
| 01 | `01-welcome.html` | Cognito `PostConfirmation` Lambda or app-side after signup | Cognito or SES |
| 02 | `02-payment-receipt.html` | Stripe webhook `payment_intent.succeeded` | SES (transactional Lambda) |
| 03 | `03-claim-filed.html` | Backend submit-claim Lambda success | SES |
| 04 | `04-claim-approved.html` | EDI 835 ERA parse → carrier approved | SES |
| 05 | `05-claim-denied.html` | EDI 835 ERA parse → carrier denied | SES |
| 06 | `06-refund-paid.html` | EDI 835 ERA payment line OR carrier portal scrape | SES |
| 07 | `07-need-more-docs.html` | EDI 277 status request OR carrier letter | SES |

## Brand specs

- **Primary:** teal `#0D9488` (buttons, badges)
- **Dark:** navy `#134E4A` (rare accents)
- **Background:** cream `#FAF6EF`
- **Cards:** white `#FFFFFF`
- **Body text:** slate `#334155`
- **Headings:** slate `#0F172A`
- **Secondary text:** slate `#64748B`
- **Approved/paid green:** `#10B981` (used in approved + refund-paid hero)
- **Warning amber:** `#FEF3C7` bg / `#92400E` text (used in denied + need-more-docs badges)

## Typography

System font stack only — no web fonts (unreliable across email clients):

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
'Helvetica Neue', Arial, sans-serif
```

`'DM Sans'` (the brand font) is intentionally NOT loaded — it would fail in Outlook and most desktop clients, breaking the layout. System sans is fine for email.

## Layout pattern

All emails follow:

1. Pre-header (hidden, shows in inbox preview)
2. White card 600px max-width, rounded 16px
3. Header: 32px logo + "CREDIMED" wordmark, separated by 1px border
4. Body: status badge → headline → paragraph → details card → CTA
5. Trust bar: HIPAA · 256-bit · US-incorporated
6. Footer: legal links, sender note

Mobile responsive: card collapses to viewport width below 600px, single-column layout, no media queries needed (table-based).

## Placeholders

Templates use Mustache-style `{{placeholder}}` syntax. Render-time substitution required before sending. Common placeholders:

| Placeholder | Type | Example |
|---|---|---|
| `{{firstName}}` | string | `Alex` |
| `{{claimId}}` | string | `CMX-2026-134E35` |
| `{{insurerName}}` | string | `Aetna PPO` |
| `{{procedureCount}}` | int | `4` |
| `{{procedureList}}` | string (joined) | `Crown · Root canal · X-rays` |
| `{{filedAt}}` / `{{approvedAt}}` / `{{paidAt}}` | string (formatted date) | `April 28, 2026` |
| `{{estimatedRefundLow}}` / `{{estimatedRefundHigh}}` | string with currency | `$450` |
| `{{approvedAmount}}` / `{{paidAmount}}` | string with currency | `$523.40` |
| `{{feeAmount}}` | string with currency | `$79` |
| `{{denialReason}}` | string (1-3 sentences) | `Plan requires pre-authorization for this procedure.` |
| `{{nextStepLabel}}` / `{{nextStepBody}}` | string | `Resubmitting with pre-auth narrative` |
| `{{requestedItem}}` | string | `Pre-treatment X-rays` |
| `{{deadline}}` | string (formatted date) | `May 15, 2026` |
| `{{uploadUrl}}` | URL | `https://credimed.us/app/documents.html?claim=...` |
| `{{paymentMethod}}` | string | `direct deposit` or `mailed check` |
| `{{cardLast4}}` | string | `4242` |
| `{{stripeReceiptUrl}}` | URL | Stripe-provided URL |
| `{{checkNumber}}` | string with prefix | ` (check #4729)` — note leading space, only set when method is mailed |

Always HTML-escape user-supplied values before substitution.

## Subject lines

Each template has a recommended subject + pre-header documented in the comment at the top of the file. Subjects are intentionally short (under 60 characters) to avoid truncation in mobile inboxes.

## Plain-text fallback

This first version ships HTML only. SES will auto-generate a plain-text version when sent, but it's a poor experience. **TODO:** add `.txt` siblings for each template once we observe how Gmail / Outlook render the auto-text.

## Testing

Three options before sending to real users:

1. **mail-tester.com** — paste any of these into a new email, send to the temp address, get a deliverability + spam score (target: 9/10+).
2. **Litmus / Email on Acid** (paid) — render across 70+ email clients to catch Outlook quirks.
3. **AWS SES Mailbox Simulator** — predefined `success@simulator.amazonses.com`, `bounce@`, `complaint@` addresses to test webhook handlers.

## Sending infrastructure

See `AWS-SETUP.md` for the AWS configuration steps (SES domain verification, Cognito User Pool config to skip verification email, transactional Lambda wiring).
