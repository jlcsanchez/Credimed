# Email infrastructure — AWS setup checklist

Two outcomes after this is done:

1. Signup **doesn't** send a verification code email (less friction). Users are auto-confirmed.
2. Transactional emails send from `verification@credimed.us` (or whichever sender) using Amazon SES, branded with the templates in this folder.

Total active work: **~25 minutes.** Total elapsed time including DNS / SES propagation: **1–3 days.**

---

## Part 1 — Skip Cognito's verification email (no SES needed)

Cognito by default sends a 6-digit verification code from a generic AWS sender (the ugly `no-reply@verificationemail.com` address). Two ways to skip it:

### Option A — Auto-confirm via Pre-Sign-Up Lambda trigger (recommended)

Most flexible. The Lambda runs synchronously during signup and tells Cognito "this user is good, skip the code, mark them confirmed."

1. AWS Console → Lambda → Create function
   - Name: `credimed-cognito-presignup-autoconfirm`
   - Runtime: Node.js 20.x
   - Architecture: arm64
2. Paste the code:

   ```javascript
   exports.handler = async (event) => {
     // Auto-confirm any new user; their email is what they typed and we
     // don't enforce verification at signup. Email correctness is verified
     // implicitly when transactional emails get delivered (or bounce).
     event.response.autoConfirmUser = true;
     event.response.autoVerifyEmail = true;
     return event;
   };
   ```

3. Deploy.
4. Cognito Console → User Pools → `<your pool>` → User pool properties → Lambda triggers → Pre sign-up → select `credimed-cognito-presignup-autoconfirm` → Save.

After this is live, new signups skip the verification code screen entirely. The `app/login.html` change (separate commit) makes the frontend honor this — it auto-signs-in immediately after signup instead of routing to the verify screen.

### Option B — Disable email verification on the User Pool

Less flexible, but no Lambda needed.

1. Cognito Console → User pool → Sign-up experience → "Cognito-assisted verification and confirmation" → uncheck "Allow Cognito to automatically send messages to verify and confirm" → Save.

> **Caveat:** this option may not be available on existing user pools (Cognito locks some attributes after creation). If the toggle is greyed out, use Option A.

---

## Part 2 — Send transactional emails from `*@credimed.us` via SES

### 2.1. Verify the `credimed.us` domain in SES

1. AWS Console → SES → Verified identities → Create identity → Domain → `credimed.us`
2. Check **"Use a custom MAIL FROM domain"** → enter `mail.credimed.us` (subdomain — keeps DKIM clean)
3. **DKIM signing:** Easy DKIM, RSA_2048_BIT
4. SES generates 3 CNAME records and 2 MX/TXT records. Copy them.

### 2.2. Add DNS records in Cloudflare (or whoever owns the `credimed.us` zone)

You'll get something like:

```
Type    Name                                              Value
CNAME   abc123._domainkey.credimed.us                     abc123.dkim.amazonses.com
CNAME   def456._domainkey.credimed.us                     def456.dkim.amazonses.com
CNAME   ghi789._domainkey.credimed.us                     ghi789.dkim.amazonses.com
MX      mail.credimed.us                                  10 feedback-smtp.us-west-2.amazonses.com
TXT     mail.credimed.us                                  "v=spf1 include:amazonses.com ~all"
```

**Also add DMARC** (separate, not given by SES but required for inbox placement):

```
TXT     _dmarc.credimed.us                                "v=DMARC1; p=none; rua=mailto:dmarc@credimed.us; pct=100; sp=none; aspf=r"
```

`p=none` for the first 30 days while you watch reports. Move to `p=quarantine` then `p=reject` once DMARC is clean.

### 2.3. Verify each sender address

In SES → Verified identities → Create identity → Email address. Add each:

- `verification@credimed.us` (Cognito sender, also good for transactional)
- `support@credimed.us`
- `ceo@credimed.us`
- `press@credimed.us`
- `disputes@credimed.us`
- `dmarc@credimed.us` (for DMARC report ingestion)
- `no-reply@credimed.us` (optional — fallback)

SES sends a verification email to each one. **You need a working mailbox** at each address to click through. Northwest Registered Agent or your email host (Google Workspace, Zoho Mail, etc.) handles the inbox.

### 2.4. Request SES production access

By default SES is in "sandbox" mode — you can only send to verified addresses. To send to real customers:

1. SES → Account dashboard → Request production access
2. Form questions:
   - **Mail type:** Transactional
   - **Website URL:** https://credimed.us
   - **Use case:** "Transactional emails to customers of Credimed, a US PPO dental claim filing service. Categories: account creation, payment receipts, claim status updates (filed, approved, denied, refunded). Frequency: 1-7 emails per customer over the lifecycle of one claim. Estimated volume: <500 per month at launch, scaling to ~5,000 per month within 12 months. We honor unsubscribes (transactional emails per CAN-SPAM are exempt from unsubscribe requirements but we include the option in the footer for goodwill). HIPAA-aligned: we do NOT include PHI (Protected Health Information) like procedures, codes, or amounts in email subject lines or pre-headers; only in the bounce-monitored body."
   - **How will you handle bounces / complaints:** "Bounces routed to a bounce-handling Lambda that suppresses the address after 1 hard bounce or 3 soft bounces in 30 days. Complaints (mailbox 'mark as spam') trigger immediate suppression and a Slack alert."
3. Submit. Approval typically takes **24–48 hours**.

### 2.5. Wire Cognito to use SES (for the welcome email)

Once SES is verified AND production access is granted:

1. Cognito Console → User Pool → Messaging → Email configuration → Edit
2. Email provider: **Amazon SES**
3. SES Region: same as your User Pool (`us-west-2`)
4. FROM email address: `verification@credimed.us` (must be a verified SES identity)
5. FROM sender name: `Credimed`
6. Reply-to: `support@credimed.us`
7. Save.

For the welcome email content:

- Sign-up experience → Email message tab → Customize
- Paste the contents of `emails/01-welcome.html` (substitute `{{firstName}}` with `{####}` and `{{username}}` with whatever Cognito provides — see Cognito docs for the supported template tokens)

> **Note:** Cognito's template system is more limited than what `emails/01-welcome.html` uses. For a richer welcome email, send it from your `PostConfirmation` Lambda trigger via SES directly, with full Mustache substitution. The Cognito-rendered welcome can be a plain "your account is ready" stub.

### 2.6. Wire transactional emails (claim updates) via SES + Lambda

The claim-update emails (#03–#07) are NOT sent by Cognito — they're sent by your backend Lambdas at the moment the relevant clearinghouse event arrives.

Recommended pattern:

- One Lambda per email type, OR a single dispatcher Lambda
- Reads the template from S3 (`s3://credimed-email-templates/01-welcome.html` etc.) on cold start, caches in memory
- Substitutes placeholders with Mustache or hand-rolled `String.replace`
- Sends via `SES.SendEmail` or `SES.SendRawEmail` (latter required when including the plain-text fallback)
- Logs `MessageId` to DynamoDB row keyed by `claimId + eventType` for audit

Example Node.js Lambda invocation:

```javascript
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const ses = new SESv2Client({ region: 'us-west-2' });

await ses.send(new SendEmailCommand({
  FromEmailAddress: 'Credimed <verification@credimed.us>',
  Destination: { ToAddresses: [user.email] },
  ReplyToAddresses: ['support@credimed.us'],
  Content: {
    Simple: {
      Subject: { Charset: 'UTF-8', Data: subject },
      Body: {
        Html: { Charset: 'UTF-8', Data: htmlBody },
        // Text: { Charset: 'UTF-8', Data: textBody },  // when .txt fallbacks exist
      }
    }
  },
  ConfigurationSetName: 'credimed-default'  // for bounce/complaint webhooks
}));
```

### 2.7. Set up bounce + complaint webhooks

1. SES → Configuration sets → Create → Name: `credimed-default`
2. Event destinations → SNS topic
3. SNS topic → Subscription: HTTPS endpoint at `https://api.credimed.us/email-events` (or a Lambda triggered by SNS)
4. Lambda: on `Bounce`, mark `user.emailDeliverable=false` in DynamoDB; on `Complaint`, immediately suppress + Slack alert

This is required to maintain a healthy SES sender reputation. Letting bounces accumulate without suppression triggers SES to throttle or pause your account.

---

## Quick reference: AWS resources to create

| Resource | Where | Purpose |
|---|---|---|
| Lambda `credimed-cognito-presignup-autoconfirm` | Lambda | Skip verification at signup |
| SES domain identity `credimed.us` | SES | DKIM-signed sending |
| SES email identities (verification@, support@, etc.) | SES | Verified senders |
| Cloudflare DNS records (3 DKIM CNAME, MX, SPF TXT, DMARC TXT) | Cloudflare | Domain verification + deliverability |
| SES production access | SES support form | Send to non-verified addresses |
| SES configuration set `credimed-default` | SES | Bounce/complaint webhooks |
| SNS topic `credimed-email-events` | SNS | Bounce/complaint fan-out |
| Lambda `credimed-email-events-handler` | Lambda | Suppress bounced addresses |
| S3 bucket `credimed-email-templates` | S3 | Source of truth for templates (sync from this repo on deploy) |
| Lambda `credimed-email-dispatcher` | Lambda | Render template + send via SES |

## Deliverability checklist (do this BEFORE sending to real customers)

- [ ] DKIM `Verified` in SES dashboard
- [ ] SPF includes `amazonses.com` in TXT
- [ ] DMARC published with `p=none`, monitor for 30 days
- [ ] mail-tester.com score 9/10 or above on a real send from each template
- [ ] Bounce + complaint webhooks live and tested via SES Mailbox Simulator
- [ ] Suppression list initialized (start empty, populated as bounces happen)
- [ ] Production access granted (out of sandbox)
- [ ] Cognito wired to send from `verification@credimed.us`
- [ ] Test email sent to a Gmail account, an Outlook account, an iCloud account, and a Yahoo account — all land in **inbox**, not spam
- [ ] Test bounce: send to `bounce@simulator.amazonses.com` — webhook fires, suppression list updated
- [ ] Test complaint: send to `complaint@simulator.amazonses.com` — webhook fires, Slack notified

## What if SES production access is rejected first time?

Common rejection reasons + fixes:

| Reason | Fix |
|---|---|
| "Don't have a privacy policy" | Make sure https://credimed.us/legal/privacy.html is reachable; resubmit citing the URL |
| "Volume estimate too high" | Lower estimate to 500/month for first 90 days |
| "No bounce handling" | Set up the bounce webhook FIRST, then resubmit citing the SNS topic ARN |
| "Generic use case" | Re-write the use case section with more detail per audience (transactional only, list category names, never marketing) |

Most rejections clear on a follow-up reply with the missing detail.
