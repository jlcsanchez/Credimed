# Credimed launch checklist

Master doc tracking everything that needs to be done before accepting
the first paying patient. Group by responsibility area. Tick items
inline as they complete (`- [x]` instead of `- [ ]`).

Last updated: April 26, 2026.

---

## 🔴 Blockers — cannot launch without these

### AWS infrastructure

- [x] Cognito user pool (`us-west-2_8GgqReC58`) live
- [x] Cognito `Admin` group provisioned
- [x] Admin user added to `Admin` group
- [x] DynamoDB `credimed-claims` table with KMS encryption
- [x] API Gateway HTTP API with 5 claim routes + JWT authorizer
- [x] Lambda `credimed-claims` deployed (read + admin)
- [x] Lambda `credimed-payment` deployed (Stripe PaymentIntent)
- [x] Lambda `credimed-stripe-webhook` deployed (Function URL:
      `https://ghb6a2atbkzwxyzktxk5da5w7y0llegr.lambda-url.us-west-2.on.aws/`)
      with HMAC-SHA256 signature verification and IAM perms for
      DynamoDB GetItem/UpdateItem, KMS Decrypt, and SES SendEmail
- [ ] Re-deploy `credimed-claims` with the audit-logging + email
      changes + the new `POST /claims` route (without it the patient
      flow looks like it succeeds but the claim never reaches
      DynamoDB and disappears the moment localStorage clears — see
      `backend/claims/DEPLOY.md`)
- [ ] Add `KMS_KEY_ID` env var + `kms:Encrypt` IAM permission to the
      `credimed-claims` Lambda role (required by the POST handler;
      same KMS key the webhook already decrypts with)
- [ ] Register `POST /claims` in the API Gateway HTTP API,
      JWT-authorized, integrated with `credimed-claims`
- [ ] Deploy new `credimed-users` Lambda (patient profile persistence —
      address, banking, phone with country code, notifications). See
      `backend/users/DEPLOY.md`. Without this, address/banking are
      localStorage-only and disappear on storage clear / device switch
- [ ] Register `GET /profile` + `PATCH /profile` in the API Gateway
      HTTP API, JWT-authorized, integrated with `credimed-users`
- [x] Verify `metadata.claimId` is set in the payment Lambda when
      creating PaymentIntents — confirmed via code audit. Lambda
      includes `metadata: { userId, claimId, plan, source }` plus
      an `idempotencyKey` of `userId-claimId-plan-amount` for
      double-click safety. HIPAA-safe metadata (no PHI).
- [ ] Delete duplicate API Gateway in us-east-1 (`bn55k0jyt0`)
- [ ] Delete unused `credimed-agents` Lambda (replaced by FAQ widget)

### Email (AWS SES)

- [ ] Domain `credimed.us` verified in SES (CNAME records added)
- [ ] SES out of sandbox (production access request approved by AWS)
- [ ] DMARC + SPF DNS records added (see `backend/email/DEPLOY.md`)
- [ ] IAM `ses:SendEmail` permission attached to claims + webhook
      Lambda roles
- [ ] `email/` subfolder added to both Lambdas (templates.js +
      sendEmail.js)
- [ ] `FROM_EMAIL` env var set on both Lambdas

### Stripe

- [x] Frontend integrated (Stripe Elements, JWT auth on intent)
- [x] TEST MODE badge added when `pk_test_*` detected
- [ ] **Switch from `pk_test_*` to `pk_live_*`** in `app/backend.js`
      line 39 — the moment we accept real payments
- [ ] Stripe live secret key in payment Lambda env
- [x] Stripe webhook registered in dashboard (test mode) pointing to
      `credimed-stripe-webhook` Function URL — listening to
      `payment_intent.succeeded` + `payment_intent.payment_failed`
- [ ] Stripe webhook registered in **live mode** (separate signing secret)
- [x] `STRIPE_WEBHOOK_SECRET` in webhook Lambda env (test secret)
- [ ] `STRIPE_WEBHOOK_SECRET` swapped to live secret when going live
- [ ] Test end-to-end with `4242 4242 4242 4242` (test) and a real
      live card under $10 to confirm full happy path

### Google Workspace

- [x] BAA signed with Google Workspace
- [x] Email aliases created on `ceo@credimed.us`:
      `support`, `privacy`, `legal`, `hello`, `billing`,
      `dmarc-reports`, `disputes` (added per AGREEMENT_v1.2 §13).
      All forward to the single `ceo@` inbox — no extra Workspace
      seats needed.
- [ ] Verify replies to transactional emails route to a real inbox
      (send a test from a personal Gmail to `support@credimed.us`
      and confirm it lands in `ceo@`)

### Legal — counsel review BEFORE first paying patient

- [ ] Healthcare/HIPAA lawyer engaged (1-2 hrs minimum)
- [ ] Privacy Policy reviewed (`legal/privacy.html`)
- [ ] Terms of Service reviewed (`legal/terms.html`)
- [ ] Notice of Privacy Practices reviewed (`legal/notice-of-privacy-practices.html`)
- [ ] Service Agreement v1.9 reviewed (`legal/AGREEMENT_v1.9.html`)
- [ ] Determine: is Credimed a Covered Entity, Business Associate,
      or both, under HIPAA? (Affects what compliance regime applies.)
- [ ] HIPAA Risk Analysis document (formal, written)
- [ ] HIPAA Policies & Procedures (sanction policy, breach response,
      access management, contingency plan, etc.)

---

## 🟡 Important — should be in place but not strict blockers

### Frontend / patient flow

- [x] Patient flow pages all functional (no blank screens)
- [x] Auto-logoff after 15 min idle (HIPAA technical safeguard)
- [x] `require-auth.js` proactive session check before render
- [x] Return URL preservation through login redirect
- [x] State versioning in `app/state.js`
- [x] Service Agreement signature capture with non-empty validation
- [x] Cookie banner on public pages — links to both Cookie Policy
      and Privacy Policy
- [x] `legal/cookies.html` — Cookie Policy (CCPA-aligned, lists every
      cookie/storage key)
- [x] `legal/disclosures.html` — what Credimed is / isn't, refund
      estimate caveats, money-back scope, processing-time clarification
- [x] `contact.html` — single page with all support / privacy /
      legal / security email aliases
- [x] All legal pages cross-linked (privacy ↔ terms ↔ cookies ↔
      disclosures ↔ HIPAA notice ↔ contact) via the related-links footer
- [x] Sitemap updated with the 3 new pages
- [ ] Footer in landing React component still hardcodes Press / Careers
      / broken hrefs — needs to be edited in the bundled JS directly
      (the previous DOM-patch approach was reverted as too fragile)
- [ ] End-to-end walkthrough: landing → login → documents →
      processing → estimate → plan → before-sign → agreement →
      payment → submission-confirmed (with the test card)
- [x] PC-adapted layouts on the 12 authenticated app pages
      (dashboard, claim, claims, documents, admin, profile,
      support, estimate, plan, payment, agreement, before-sign)
      — all wrapped with the shared shell at
      `styles/app-shell.css` (sidebar 768+, side panel 1280+,
      mobile bottom nav < 768). Mobile layout preserved
      untouched. Skipped: `login.html` (pre-auth),
      `processing.html` (loading screen), `submission-confirmed.html`
      (terminal success screen) — adding chrome to those would
      hurt the focused experience.

### Chat / support

- [x] Ana FAQ widget on every page with FAQ matching
- [x] Email escalation when FAQ has no match
- [x] Per-page topic-aware quick replies
- [x] Bilingual catalog (English default, Spanish fallback)

### Audit & monitoring

- [x] HIPAA-grade audit logging in claims Lambda (claim IDs,
      sourceIp, userAgent, requestId)
- [x] Plausible analytics on public pages (cookieless,
      no PHI risk)
- [ ] Plausible site registered at `plausible.io` for `credimed.us`
- [ ] CloudWatch log retention set on Lambda log groups (default
      is forever — set to 12 months for HIPAA, longer if needed)
- [ ] DynamoDB point-in-time recovery enabled (1-click in console)

### Cognito hardening

- [ ] Password policy: min 12 chars, mixed case + symbol
- [ ] MFA required for users in `Admin` group
- [ ] Email verification required for sign-up

### Service / brand

- [x] Privacy / Terms / NPP draft pages live
- [x] FAQ page (this commit)
- [x] 404 / 500 error pages
- [x] SEO: meta description, canonical, Open Graph, Twitter card,
      schema.org Service JSON-LD
- [x] Sitemap.xml + robots.txt with correct allow/disallow
- [x] `og-image.png` at repo root (1200×630, designed in Claude Design)
- [x] Email templates polished — new branded shell wired through
      all 7 templates in `backend/email/templates.js`
- [x] About page (`about.html`) live with full SEO + cookie banner
      + Plausible
- [x] How-it-works page (`how-it-works.html`) live with HowTo
      schema, full SEO + cookie banner + Plausible
- [x] Pricing comparison table — embedded in `how-it-works.html`
      (the in-app `app/plan.html` keeps the engine-picks-one model)

---

## 🟢 Nice-to-have — after launch is fine

### Performance

- [ ] Lighthouse audit (target ≥ 90 on all four scores)
- [ ] Lazy-load the 1.6 MB landing bundle
- [ ] WebP + responsive images
- [ ] Service worker / PWA for offline-first

### Marketing / growth

- [ ] Google Ads landing variant (separate from main landing)
- [ ] Spanish-language landing
- [ ] Blog post #1 ("How to file dental insurance from Mexico")
- [ ] Email drip campaign for non-converted leads (5 emails)
- [ ] Press kit / one-pager PDF
- [ ] Referral page

### Backend

- [ ] PDF receipt generator per claim (branded share-back artifact)
- [ ] A/B testing framework (simple flag-based)
- [x] Stripe Refund API integration coded in claims Lambda —
      feature-flagged via `STRIPE_REFUND_ENABLED` (default `false`).
      Idempotent on claim id. When flipped on, money actually
      returns to the card. Pre-flip checklist in
      `backend/claims/DEPLOY.md` Step 5.
- [ ] Re-deploy claims Lambda with the refund code + add
      `STRIPE_SECRET_KEY` env var
- [ ] Sandbox test: $1 test payment → admin marks `refunded` →
      confirm Stripe Dashboard shows the refund and the claim
      gets `stripeRefundId`
- [ ] Flip `STRIPE_REFUND_ENABLED=true` in production once the
      sandbox test passes
- [ ] Status-indexed GSI for admin claim queries (currently scans
      whole table; fine until ~500 claims)

### Operations

- [ ] Vanta / Drata / Aptible signup for compliance automation
      (~$300-1000/mo, generates HIPAA policies + monitoring)
- [ ] Spruce Health (or equivalent) for patient messaging when
      volume justifies (~$24/mo)

### Cleanup

- [x] Delete `app/widgets/agent-chat.js` (deprecated, replaced by
      `app/ana.js`)
- [x] Remove `LEGACY_EMAILS` allowlist code from `admin.html`
      (Cognito group is the only path now)
- [x] Audit `connector.js` for stale routes — clean (FLOW map
      matches existing pages, brand-tap-home selector already covers
      the new `<header class="app-topbar">` via the `header` selector)

---

## File index — where things live

```
/                              # repo root
├── index.html                 # landing
├── faq.html                   # FAQ page (SEO)
├── 404.html / 500.html        # error pages
├── cookie-banner.js           # CCPA notice
├── og-image.png               # social share (TODO: drop here)
├── sitemap.xml / robots.txt   # crawler hygiene
├── LAUNCH.md                  # this file
│
├── app/                       # patient + admin authenticated app
│   ├── login.html
│   ├── dashboard.html
│   ├── documents.html
│   ├── estimate.html
│   ├── plan.html
│   ├── before-sign.html
│   ├── agreement.html         # signs AGREEMENT_v1.2
│   ├── payment.html
│   ├── submission-confirmed.html
│   ├── claim.html / claims.html
│   ├── profile.html
│   ├── admin.html
│   ├── ana.js                 # FAQ chat widget
│   ├── auto-logoff.js         # HIPAA technical safeguard
│   ├── require-auth.js        # session gate
│   ├── backend.js             # Cognito + Stripe + authFetch
│   ├── pricingEngine.js       # plan-tier calculator
│   ├── state.js               # localStorage with schema versioning
│   └── widgets/
│       ├── faq-data.js        # 19-entry catalog (bilingual)
│       └── status-timeline.js # available, not yet wired
│
├── legal/
│   ├── AGREEMENT_v1.9.html      # signed by patient at /app/agreement.html
│   ├── privacy.html
│   ├── terms.html
│   └── notice-of-privacy-practices.html
│
└── backend/
    ├── claims/
    │   └── credimed-claims.lambda.js   # GET/PATCH /claims + admin
    ├── email/
    │   ├── templates.js                # 7 transactional templates
    │   ├── sendEmail.js                # SES wrapper
    │   └── DEPLOY.md                   # SES setup walk-through
    ├── webhooks/
    │   ├── credimed-stripe-webhook.lambda.js
    │   └── DEPLOY.md                   # webhook setup walk-through
    └── pricingEngine.js                # source-of-truth for plan tiers
```

---

## When something blocks launch

1. **AWS Lambda re-deploy fails** → CloudWatch logs of the deploy
   step. Likely a missing env var or IAM permission.
2. **SES emails not arriving** → SES sandbox / verified sender / IAM.
3. **Stripe webhook fires but DB doesn't update** → check
   `metadata.claimId` is set on the PaymentIntent; check IAM
   `dynamodb:UpdateItem` on the webhook role.
4. **Patient sees 401 on signed-in page** → JWT auth missing on
   that route, or the page lacks `<script src="require-auth.js">`.
5. **Patient sees 403 on `/admin/claims`** → user not in Cognito
   `Admin` group, OR the Lambda code wasn't redeployed after the
   group-name change (lowercase comparison in `isAdmin`).

For anything else, search this repo's commits — most failure modes
have already been hit and documented in commit messages.
