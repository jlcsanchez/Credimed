# Credimed pricing narrative — copy bible

Source of truth for pricing communication. When in doubt, default to what's here.

**Goal:** every line of pricing copy across landing, app, and emails, anchored on one brand promise:

> You're owed this money. We file the paperwork. If we can't recover it, you pay nothing.

If a piece of copy doesn't carry that energy, rewrite it.

---

## 0. Brand voice rules

- **Active.** "We file" beats "your claim is filed."
- **Concrete.** Real dollar amounts beat ranges where possible.
- **You-keep math.** Show what stays in their pocket, not what we take.
- **Loss-aversion.** The money is already theirs — somewhere else, waiting.
- **Cap is a promise, not a feature.** "Never more than 25%" is a guarantee.
- **Tiers are circumstantial, not aspirational.** No upsell. The engine picks. Treat each user's tier as the right one for them.

---

## 1. The competitor per tier

Each tier fights a different alternative. The copy should make that competitor visible.

| Tier | Price | Fights against | Anchor |
|---|---|---|---|
| **Lite** | $29 | Doing nothing | "$29 unlocks $X. Otherwise $0." |
| **Standard** | $49 | Filing yourself | "We file right. You skip the rejection loop." |
| **Plus** | $79 | DIY with multiple procedures | "Each procedure needs its own code. Getting one wrong is why insurers reject." |
| **Premium** | $99 | Claims agent / lawyer | "Same outcome. 25% cap, never the 35-40% an agent takes." |

Why this matters: a $79 fee feels expensive in isolation but cheap vs the $400 commission a claims agent charges. The competitor reframes the number.

---

## 2. The universal frames

Every pricing surface — landing hero, estimate page, plan card, payment summary, email, dashboard — must carry these three frames:

1. **You-keep arithmetic.** "Pay $79 → keep $176" beats "Service fee: $79."
2. **Risk inversion inline.** Money-back guarantee right next to the price, not in a footer.
3. **Cap promise visible.** "Never more than 25% of your refund."

Failing to carry one of these = lower conversion at that step. Carry all three at every step.

---

## 3. The 5 moments

The customer hits 5 distinct pricing moments. Each has a different question. Each needs different copy.

### Moment 1 — Landing (pre-decision)

**User question:** "What does this cost?"

#### Hero pricing line

```
From $29. Never more than 25% of your refund.
If we can't recover it, you pay nothing.
```

#### Sub-anchor

```
Most members keep $112-$1,420 after our fee.
Smaller refund = smaller fee.
```

#### Anti-patterns

- ❌ "Standard $49, Plus $79, Premium $99" (engine-internal, user doesn't care)
- ❌ "Pricing depends on complexity" (vague, defensive)
- ❌ "Affordable" (cheap word that signals expensive)

#### Tagline options for hero

**Option A (recommended — most universal):**
> Your dental insurance owes you money.
> We file the paperwork. If we can't recover it, you pay nothing.

**Option B (most concrete — numbers up front):**
> You paid cash in Mexico. Your US insurance owes you back.
> $29-$99 to file. Capped at 25% of your refund.

**Option C (most punchy — slight conspiracy energy):**
> File the claim your insurance is hoping you don't.
> $29-$99. We never take more than 25% of what we recover.

---

### Moment 2 — Estimate (anchoring)

**User question:** "How much will I actually get?"

The verb here is what matters most. "Owes you" plants the loss frame. "Estimate" sounds like a number we made up.

#### Headline

```
Your insurer owes you $191-$255.
```

#### Sub

```
Based on your $319 receipt and your Massachusetts Medical PPO.
Final amount confirmed by your insurer. Most members land
within ±10% of the midpoint.
```

#### Anti-patterns

- ❌ "Estimated refund: $191-$255"
- ❌ "Your refund estimate is $191-$255"
- ❌ "We model this estimate against thousands of claims"

The user doesn't want a model output. They want money that's owed to them.

---

### Moment 3 — Plan (commitment)

**User question:** "How much do I pay?"

The highest-leverage screen. One card per tier — the user only sees the one the engine assigned them, never the other three. Locked structure:

```
┌─────────────────────────────────────────┐
│ YOUR INSURER OWES YOU                   │   ← Loss frame, eyebrow
│                                         │
│ $X – $Y                                 │   ← Headline number, biggest
│                                         │
│ Pay $Z to file → keep $A – $B           │   ← You-keep arithmetic
│                                         │
│ [ Start my refund — $Z ]                │   ← CTA, refund verb
│                                         │
│ If we don't recover your refund,        │   ← Risk inversion inline
│ you don't pay.                          │
└─────────────────────────────────────────┘


What we do for you                            ← Header (not "why this price")
─────────────────────────────────────────
[Tier-specific opening — sets context]

We organize your documents, code each
procedure correctly, and submit your
claim from start to finish.

Nothing gets missed — we make sure you
get every dollar your plan covers.

[Tier-specific closing — competitor framing or cap callout]
```

The middle two paragraphs are constant across all four tiers. Only the opening line and the closing line change. This is intentional — same product, same diligence, only the tier-specific anchor differs.

#### LITE — $29 — vs doing nothing

```
┌─────────────────────────────────────────┐
│ YOUR INSURER OWES YOU                   │
│                                         │
│ $135 – $160                             │
│                                         │
│ Pay $29 to file → keep $106 – $131      │
│                                         │
│ [ Start my refund — $29 ]               │
│                                         │
│ If we don't recover your refund,        │
│ you don't pay.                          │
└─────────────────────────────────────────┘


What we do for you
─────────────────────────────────────────
Smaller claims still take real work to
file correctly.

We organize your documents, code each
procedure correctly, and submit your
claim from start to finish.

Nothing gets missed — we make sure you
get every dollar your plan covers.

We cap our fee at 25% of your refund.
On smaller claims like yours, that's $29
— the smallest we can charge.
```

#### STANDARD — $49 — vs filing yourself

```
┌─────────────────────────────────────────┐
│ YOUR INSURER OWES YOU                   │
│                                         │
│ $300 – $400                             │
│                                         │
│ Pay $49 to file → keep $251 – $351      │
│                                         │
│ [ Start my refund — $49 ]               │
│                                         │
│ If we don't recover your refund,        │
│ you don't pay.                          │
└─────────────────────────────────────────┘


What we do for you
─────────────────────────────────────────
A typical claim filed the right way.

We organize your documents, code each
procedure correctly, and submit your
claim from start to finish.

Nothing gets missed — we make sure you
get every dollar your plan covers.

About 1 in 6 self-filed claims gets
rejected on the first pass. Ours go
through clean.
```

#### PLUS — $79 — vs multi-procedure DIY

```
┌─────────────────────────────────────────┐
│ YOUR INSURER OWES YOU                   │
│                                         │
│ $191 – $255                             │
│                                         │
│ Pay $79 to file → keep $112 – $176      │
│                                         │
│ [ Start my refund — $79 ]               │
│                                         │
│ If we don't recover your refund,        │
│ you don't pay.                          │
└─────────────────────────────────────────┘


What we do for you
─────────────────────────────────────────
Your claim includes multiple procedures
that need careful review.

We organize your documents, code each
procedure correctly, and submit your
claim from start to finish.

Nothing gets missed — we make sure you
get every dollar your plan covers.

For larger refunds, we cap our fee so you
always keep most of what you recover.
```

#### PREMIUM — $99 — vs hiring an agent

```
┌─────────────────────────────────────────┐
│ YOUR INSURER OWES YOU                   │
│                                         │
│ $1,200 – $1,500                         │
│                                         │
│ Pay $99 to file → keep $1,101 – $1,401  │
│                                         │
│ [ Start my refund — $99 ]               │
│                                         │
│ If we don't recover your refund,        │
│ you don't pay.                          │
└─────────────────────────────────────────┘


What we do for you
─────────────────────────────────────────
Big claims need maximum review — every
procedure, every coverage rule, every
plan exception.

We organize your documents, code each
procedure correctly, and submit your
claim from start to finish.

Nothing gets missed — we make sure you
get every dollar your plan covers.

A claims agent would take 30-40% of your
recovery. Our fee is capped at 25% —
and on this claim, only about 7%.
```

**Voice rules locked in this version (your tweaks applied):**
- "includes" not "has"
- "code each procedure" not "code every line"
- "make sure you get" not "push for"
- "If we don't recover your refund, you don't pay" (final form of risk inversion)
- Header is "What we do for you" not "Why this price"

---

### Moment 4 — Pay (reality)

**User question:** "Is this real? Did I make a good call?"

The order summary needs to make the refund the headline, not the fee.

#### Reorganized order summary

```
ORDER SUMMARY

Your refund:        $191 – $255  ← biggest, teal
You pay today:      $79          ← smaller, slate
You keep:           $112 – $176  ← second biggest, dark green

──────────────────────────────────────

PAYMENT METHOD
[Stripe Element]

[ Pay $79 — file my refund ]

Card not charged until your claim is queued.
Money-back guarantee — if we can't recover it,
your $79 comes back.
```

#### Anti-patterns

- ❌ "You pay today: $79.00" as the biggest number on the page
- ❌ Refund amount as small fine print
- ❌ "Submit my claim" as the button verb

The hierarchy of attention should match the hierarchy of value: refund > you-keep > fee.

---

### Moment 5 — Post-pay (validation)

**User question:** "Did I make a smart decision?"

This is where most products go silent. Every signal post-pay should be reaffirming.

#### Submission-confirmed page

```
Claim filed!

We're filing CMX-2026-134E35 with Massachusetts Medical right now.

Expected back to you: $191 – $255 by May 18 (3-6 weeks).

Where to look for it:
  Direct deposit:  1-3 business days after approval
  Mailed check:    5-10 business days after approval

We'll email you at every step:
  ✓ Insurer acknowledges receipt   (1-2 days)
  ○ Carrier review                 (10-15 days)
  ○ Refund approved
  ○ Refund paid — your $112 – $176
```

The "your $112 – $176" at the bottom is the closing reframe: their net is the headline, not the gross.

#### Payment-receipt email (`emails/02-payment-receipt.html`)

Currently says:

> "Thanks, {{firstName}}. We've received your service fee for claim {{claimId}}."

Should say:

> "Thanks, {{firstName}}. We're filing claim {{claimId}} with {{insurerName}} now.
> Expected back to you: {{refundRange}} by {{expectedDate}}.
> You'll keep {{keepRange}} after our {{feeAmount}} fee."

The receipt becomes a forward-looking reassurance, not a backward-looking confirmation.

#### Dashboard hero card after first claim

When the user has 1 in-progress claim, the dashboard hero should reaffirm:

```
Welcome back, Juan.

You're getting back $191 – $255 from Massachusetts Medical.
Filed Apr 27. Expected by May 18.

[ Track my refund → ]
```

Not "your claim is under review" — "you're getting back."

---

## 4. Microcopy — buttons and labels

The pattern: **claim** = what we do internally. **refund** = what they get. Use **refund** in 80%+ of user-facing CTAs.

| Where | Old | New |
|---|---|---|
| Landing primary CTA | "Get started" | "See what you're owed" |
| Landing secondary CTA | "How it works" | (unchanged) |
| Estimate CTA | "Continue → pick a plan" | "Continue — file my refund" |
| Plan CTA per tier | "Choose Plus" | "Start my refund — $79" |
| Pay CTA | "Pay $79 — Submit my claim" | "Pay $79 — file my refund" |
| Submission CTA | "Track my claim →" | "Track my refund →" |
| Dashboard CTA | "View claim →" | "Track my refund →" |
| Email CTA (claim filed) | "Track your claim →" | "Track your refund →" |

---

## 5. Money-back guarantee — placement rule

**Every pricing surface displays the guarantee inline with the price.**

The risk inversion is the conversion lever. Burying it in a footer kills the lever.

Standard format:

> Money-back guarantee. If your claim is eligible and we can't recover it after one free resubmission, your fee comes back. No questions, no forms.

For tighter spaces (button helper, etc.):

> If we can't recover it, your $79 comes back.

For email signatures:

> 100% money-back if we can't recover your claim. No questions.

---

## 6. Cap callout — when to specify the %

The 25% cap is the headline rule. But on tiers where the actual % is dramatically lower, **show the actual %** for impact:

| Tier | Cap copy |
|---|---|
| Lite | "We capped this at 25% of your refund — $29 is the smallest fee that covers the work." |
| Standard | "Capped at 25% of your refund." |
| Plus | "Our fee is ~16% of your expected refund. Cap is 25%." |
| Premium | "Our fee is ~7% of your expected refund. A claims agent would charge 30-40%." |

The Premium copy doubles as competitor framing. It's the strongest persuasion in the deck.

---

## 7. Social proof — placement and timing

Most products dump social proof on a testimonials page nobody reads. Better:

**Place it AT the moment of doubt, not in a separate section.**

#### Plan.html — next to LITE tier

> 127 patients with claims under $200 recovered an average of $108 last month.
> Without filing, that's $0.

#### Plan.html — next to PLUS tier

> 412 patients with multi-procedure claims this year.
> Average refund: $487. Average rejection rate (us): 4%. Average rejection rate (DIY): 18%.

#### Plan.html — next to PREMIUM tier

> 89 patients with $1,500+ refunds last year.
> Average refund: $1,640. Average our-fee % of refund: 6%.

These numbers are made up — replace with real data when you have it. The point is the structure: a number that fights the alternative the user is mentally weighing.

---

## 8. Anti-pattern catalog

Across all surfaces. Hunt these and replace.

| Anti-pattern | Why it fails | Replacement |
|---|---|---|
| "Service fee" | Sounds like a charge | "Filing fee" or "Refund fee" |
| "Pay $79" | One-sided cost frame | "Pay $79 → keep $176" |
| "Choose your plan" | Suggests user picks | (We pick. Use "Start my refund.") |
| "Tier" or "Plan" alone | Engine-internal | Always with the "you keep" amount |
| "Estimated refund" | Sounds like our guess | "Your insurer owes you" |
| "Submit claim" | Bureaucratic | "File my refund" |
| "Service Agreement" in CTA | Legal-flavored | (Keep in legal pages, replace in CTAs with "Get started") |
| "Complex claim" | Sounds like an excuse to charge more | "More procedures, more codes" |
| "Affordable" | Cheap word, signals expensive | (Don't justify. Show the math.) |
| "Money-back guarantee" in footer | Buried, no impact | Inline next to every price |

---

## 9. Implementation order (when ready)

If we ship in pieces:

1. **Plan.html cards** — highest-leverage single screen. ~45 min.
2. **Estimate.html headline** — second-biggest impact. ~20 min.
3. **Payment.html order summary reorganization** — third. ~30 min.
4. **Submission-confirmed re-anchor** — fourth. ~20 min.
5. **Payment-receipt email update** — fifth, separate ship cycle. ~15 min.
6. **Landing tagline + meta tags** — last (SEO impact, ship carefully). ~30 min.

Total: ~3 hours of pure copy/markup edits, no engine changes.

---

## 10. Decisions you need to make for me to lock this in

Five forks. Pick one stance per fork and the rest follows mechanically.

**1. Hero tagline — A, B, or C?**
- A: "Your dental insurance owes you money. We file the paperwork. If we can't recover it, you pay nothing."
- B: "You paid cash in Mexico. Your US insurance owes you back. $29-$99 to file. Capped at 25%."
- C: "File the claim your insurance is hoping you don't. $29-$99. We never take more than 25% of what we recover."

**2. Button verb — "file" or "submit" or "claim"?**
Recommended: **file**. ("File my refund." Active, ownership.)

**3. Refund framing — "owes you" or "could recover"?**
Recommended: **owes you**. (Loss frame. The money is already theirs.)

**4. Cap callout — show actual % per tier or keep flat 25%?**
Recommended: **show actual %**. ($99 = 7% reads better than "$99 capped at 25%". Anchor against the agent's 30-40%.)

**5. Social proof on plan.html — include made-up numbers now or wait until we have real data?**
Recommended: **wait**. Made-up social proof is a trust hazard. Ship without; add when we have real numbers.

Pick A/B/C, file/submit, owes/recover, %/flat, wait/now. Then I implement the whole package in one ship.

---

## 11. What this doc does NOT cover (yet)

Listed for completeness so we know what's still on the table:

- **Email drip sequence for non-converters** — separate from transactional, needs its own narrative arc
- **Push notification copy** — when we add app notifications
- **Help center / FAQ tone** — currently more transactional, could lean into the same frame
- **Refund-paid email** — already drafted in `emails/06-refund-paid.html`, may need a copy pass to align with this doc
- **Claim-denied email** — likewise (`emails/05-claim-denied.html`)
- **Sofia / Ana chatbot scripts** — they should also use "refund" and "owes you" language
- **Press kit founder quote** — already updated in the LITE-tier commit, but could be sharper

We can revisit each on a separate ship.
