# Credimed — Non-converted lead email drip (5 emails)

**Goal:** convert visitors who hit the Refund Estimator (got a number) but didn't pay — i.e., they raised their hand but bounced before checkout. Sent only to users who explicitly opted in via email field.

**Sender:** `Juan Luis Sanchez <support@credimed.us>` — keep it personal, not marketing-blast feel
**Reply-to:** `support@credimed.us`
**Unsub:** every email has a one-click unsubscribe. Required by CAN-SPAM.
**Suppression:** stop the sequence the moment they (a) submit a claim, (b) reply to any email, (c) unsubscribe.

Cadence:
- E1: T + 0 hours (immediate, after they leave the estimator)
- E2: T + 24 hours
- E3: T + 3 days
- E4: T + 7 days
- E5: T + 21 days (last touch)

---

## E1 — "You left this on the table" (immediate)

**Subject:** Your $[ESTIMATE] estimate is saved
**Preview:** No login required to come back

Hey [FIRST_NAME],

Quick note — your refund estimate of **$[ESTIMATE_LOW]–$[ESTIMATE_HIGH]** is saved. You can pick up where you left off without losing your progress:

→ [Continue my claim](https://credimed.us/app/dashboard.html?utm_source=email&utm_campaign=drip&utm_content=e1)

A few things people ask me right after the estimator:

- **Is the estimate accurate?** It's an average across thousands of similar PPO claims for the same procedures. Your actual refund depends on your specific plan's allowed amounts and remaining annual maximum — your insurer makes the final call.
- **What if my insurer says no?** If your claim is eligible and our team can't recover it after one free resubmission, we refund the $49. No paperwork, no fight.
- **How long does it take?** We file within 24 hours of payment. Insurers typically respond in 14–45 days.

Hit reply if anything's blocking you. I read every email.

— Juan Luis
Founder, Credimed

[Unsubscribe](%unsubscribe_url%) · 2 minutes to file · Boston, MA

---

## E2 — "Most people get back more than they expect" (T+24h)

**Subject:** The PPO numbers most people miss
**Preview:** Small detail that changes the refund

Hey [FIRST_NAME],

When you ran our estimator yesterday it told you somewhere between **$[ESTIMATE_LOW] and $[ESTIMATE_HIGH]**. Real outcomes for the same procedure mix usually land in the **upper half** of that range — here's why.

Most PPO members don't know their plan has an "out-of-network allowed amount" — a separate number from the in-network UCR. It's the maximum dollar value the insurer will reimburse against an out-of-network procedure, regardless of what you actually paid.

For most US carriers (Aetna, Cigna, Delta, MetLife, Guardian, Humana) the out-of-network allowed amount for a crown is **$1,100–$1,400**. If you paid $400 cash for the same crown in Mexico, the math is:

> $400 paid · 50% coinsurance = **$200 refund**

Not $80, not "they'll just deny it." $200, every time, as long as we file it correctly.

→ [See what the math looks like for your specific procedures](https://credimed.us/app/dashboard.html?utm_source=email&utm_campaign=drip&utm_content=e2)

— Juan Luis

[Unsubscribe](%unsubscribe_url%)

---

## E3 — Founder story (T+3 days)

**Subject:** Why I built Credimed
**Preview:** A friend of mine lost $1,400 doing this himself

Hey [FIRST_NAME],

I'll keep it short — this is the origin story of Credimed.

In 2023 a close friend of mine had three crowns and a root canal done in Tijuana. Excellent dentist, fraction of the Boston price. His PPO covered out-of-network procedures, so he figured the reimbursement was a formality.

It wasn't. He spent **six months and four resubmissions** to get $1,200 of $2,600 back. One of the rejections was because the form used CDT code D2750 instead of D2740 — a porcelain-fused-to-metal crown vs. a porcelain crown. One letter difference; complete denial.

When I asked around, I found that almost everyone who tries this on their own gives up the same way. **The system makes you walk away** from money your plan owes you. That's why I built Credimed.

That's why Credimed exists. We file the claim correctly the first time. If we can't recover it, you don't pay.

→ [Pick up your claim where you left off](https://credimed.us/app/dashboard.html?utm_source=email&utm_campaign=drip&utm_content=e3)

— Juan Luis

[Unsubscribe](%unsubscribe_url%)

---

## E4 — Social proof + objection handling (T+7 days)

**Subject:** "My insurer already denied it"
**Preview:** Eligible claims get denied for solvable reasons 60% of the time

Hey [FIRST_NAME],

A pattern I see a lot: someone tries to file a Mexico dental claim themselves, gets denied, assumes they were never eligible, and gives up.

Six in ten of those denials are **fixable**. The most common reasons:

- Procedure code didn't match the receipt description (Spanish → English mistranslation)
- Provider tax ID (RFC) wasn't formatted as a US-recognized provider code
- Receipt was in pesos and the FX conversion didn't match the date of service
- Claim form was missing the out-of-network attestation page

Every one of these is something we look for before submitting. **If you've already been denied, your claim is still eligible** — you can re-file.

→ [Upload your denial letter and we'll resubmit](https://credimed.us/app/dashboard.html?utm_source=email&utm_campaign=drip&utm_content=e4)

— Juan Luis

[Unsubscribe](%unsubscribe_url%)

---

## E5 — Last touch (T+21 days)

**Subject:** Should I close your file?
**Preview:** This is the last email I'll send

Hey [FIRST_NAME],

This is my last email — I don't believe in staying in your inbox if the timing's not right.

If you decided not to file, no worries. Your claim estimate is still saved, and there's no expiration on PPO out-of-network claims as long as you submit within your plan's filing window (usually 12 months from date of service).

If something blocked you, hit reply and tell me what — I'd love to fix it.

If the timing was just off and you'd like to circle back later, your claim is here whenever:

→ [https://credimed.us/app/dashboard.html](https://credimed.us/app/dashboard.html?utm_source=email&utm_campaign=drip&utm_content=e5)

Either way, I appreciate you giving us a look.

— Juan Luis
Founder, Credimed
Boston, MA

[Unsubscribe](%unsubscribe_url%)

---

## Operational notes

- **List source:** only emails captured via the estimator's optional "email me my estimate" field. Never scrape, never buy a list.
- **HIPAA:** estimates are NOT PHI on their own. Names + procedure codes together would be. Keep emails to first name + dollar range only — no procedure list.
- **From-domain:** must be on a verified SES domain (`credimed.us`) with SPF, DKIM, DMARC aligned.
- **Track:** open rate, CTR per CTA, unsubscribe rate per email. Drop any email whose unsub rate exceeds 1.5%.
- **A/B test:** subject lines first (lowest cost). Don't A/B-test message body until volume > 500 sends/email.
- **Compliance gate:** run by HIPAA counsel before launching. Patient marketing has additional restrictions for any audience that overlaps with patients you've already served.
