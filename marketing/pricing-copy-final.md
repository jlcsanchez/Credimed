# Credimed pricing copy — for review

This is the locked customer-facing pricing copy for Credimed, ready for review by counsel, advisors, or test users. Every line on this page renders on the patient's plan-selection screen, the payment summary, and the corresponding emails.

---

## Context (one paragraph)

Credimed helps US PPO dental insurance members recover the money their plan owes them for dental work performed in Mexico. We file the out-of-network reimbursement claim on the patient's behalf — the insurer pays the patient directly. Our service fee is one-time, non-commissioned, capped at 20% of the expected refund, and 100% money-back guaranteed if we cannot recover the claim.

---

## The four pricing tiers

The patient does NOT choose the tier. Our system assigns it automatically based on claim complexity (number of procedures, document count, OCR confidence) and the size of the expected refund. The fee is then capped at 20% of the expected refund — so smaller refunds always get smaller fees. The Lite tier ($29) is the floor and covers the cost of submission.

The patient sees only the tier they were assigned. The other tiers and the engine logic are not visible. Each tier card on the patient's screen reads exactly as below.

---

### LITE — $29

Best for simple claims with one procedure.

We review your receipt, assign the correct procedure code, and submit your claim properly to your insurer.

Fast and straightforward — handled for you.

**If we don't recover your refund, you don't pay.**

---

### STANDARD — $49

Best for typical claims with 1–2 procedures.

We review your claim in detail, select the correct codes, and make sure everything is submitted exactly as your insurer expects.

Handled start to finish — no paperwork for you.

**If we don't recover your refund, you don't pay.**

---

### PLUS — $79

Best for multi-procedure claims.

We review each procedure individually, structure your claim correctly, and make sure nothing gets missed.

We also follow up when needed to keep your claim moving.

**If we don't recover your refund, you don't pay.**

---

### PREMIUM — $99

Best for larger or more complex claims.

A senior specialist reviews your case, handles all documentation, and works directly with your insurer when needed.

Everything is managed for you — end to end.

**If we don't recover your refund, you don't pay.**

---

## What's included (every tier)

- Receipt review and validation
- Correct procedure code assignment
- Insurance format compliance
- Currency conversion (date-accurate)
- Claim form preparation
- Electronic submission
- Claim tracking and updates

We make sure everything is complete and submitted correctly — so nothing delays your refund.

---

## Cap promise (footer line, every pricing surface)

> For larger refunds, we limit our fee so you always keep most of what you recover.

---

## Edge case — refund too small for the 20% cap

When a patient's expected refund is small enough that even our $29 floor exceeds 20% of the recovery (refund_avg < $145), the engine flags `fee_exceeds_cap = true` and `fee_pct_of_refund = N`. The `plan.html` overlay renders a "Heads up" banner ABOVE the tier card so the patient sees the situation honestly before committing. They can still proceed (the money-back guarantee still applies), but they make the decision with full information.

**The banner copy (renders in amber, only when triggered):**

```
Heads up — your refund is small

Our $29 fee is about [N]% of your estimated refund.
Most patients pay closer to 15–20%.

You can still file — your insurer still owes this to
you, and our money-back guarantee covers you if we
can't recover it. We just want to be upfront: on a
small refund like yours, the math is tighter than usual.
```

Why this exists: keeps the marketing claim *"we limit our fee so you always keep most of what you recover"* honest in 100% of cases — when the math doesn't allow it, we tell the patient explicitly.

---

## Where this copy renders

| Surface | Which tier shows | Notes |
|---|---|---|
| `app/plan.html` | Only the tier the engine assigned the user | Card with hero numbers + "What we do" body |
| `app/payment.html` order summary | Same tier name + price | Reuses the assigned-tier name |
| `app/dashboard.html` post-pay | Plan name appears in claim row | Single line: "Plan: Plus · $79" |
| `emails/02-payment-receipt.html` | Same tier name + price | "{{planName}}: ${{feeAmount}}" |
| `legal/AGREEMENT_v1.9.html` §2.1 | All four tiers listed | Legal needs to see the full ladder |
| `marketing/press-kit.md` | All four tiers listed | Press needs the full ladder |
| `faq.html` (FAQ entry on cost) | All four tiers listed | Public-facing transparency |

The "What's included" list and cap-promise footer render on `plan.html` (next to the assigned tier) and on the `faq.html` cost question.

---

## What we deliberately did NOT do

These were considered and rejected during copy development. Listed so reviewers don't suggest them.

- ❌ **Per-tier feature comparison table.** The patient doesn't choose; showing them what they "could have had" with a higher tier is upsell theatre.
- ❌ **Justifications referencing CDT codes, FX rates, RFC numbers.** Patient-irrelevant. Operational detail.
- ❌ **"Service fee" or "processing fee" framing.** "If we don't recover your refund, you don't pay" is the active framing.
- ❌ **Time estimates ("we'll take 30 minutes").** Patient cares about outcome, not our minutes.
- ❌ **"% of refund" callouts visible in the tier card.** The 20% cap is mentioned once in the footer line. Splashing percentages in each card pulls attention to fee math instead of recovery math.

---

## Open items for the reviewer

If reviewing this for production, please confirm or push back on:

1. **"If we don't recover your refund, you don't pay."** Is this enforceable as a marketing claim under the existing money-back guarantee in `legal/AGREEMENT_v1.9.html` §2.3? The Agreement uses "100% conditional refund" with specific exclusions (deductibles, plan exclusions, fraud). The marketing claim simplifies. If counsel wants stricter language, suggested alternative: *"If we file your claim and your insurer rejects it on grounds we cannot remedy, your fee is refunded."*

2. **"Senior specialist" (Premium tier).** This must remain accurate. We need a defined role internally to back this claim — a junior reviewer wearing a senior title would be a misrepresentation.

3. **"Insurance format compliance" (What's included).** Generic enough to be defensible, but if counsel wants tighter language: *"Submission in the format your insurer's system requires."*

4. **"Currency conversion (date-accurate)."** Accurate — we use the FX rate of the date of service, not the date of submission. Counsel may want to specify *"using the published exchange rate on the date of service."*

5. **The cap promise.** *"We limit our fee so you always keep most of what you recover."* Defensible because of the 20% cap math — the patient always keeps ≥80% of any refund. If counsel prefers explicit math: *"We never charge more than 20% of your expected refund."*

---

## Document version

- **v1.0** — Initial review release. Locked customer-facing copy across four tiers + universal sections.
- Source of truth: `marketing/pricing-copy-final.md` (this file)
- Working notes / decision history: `marketing/pricing-narrative.md`
- Engine reference: `app/pricingEngine.js` (line 67 sets the 20% cap)
- Legal reference: `legal/AGREEMENT_v1.9.html` §2 (full pricing terms)

For questions about copy decisions, see the working doc. For changes after review, edit this file and bump version.
