# Email Lambdas — Deploy Guide

This guide deploys two Cognito-trigger Lambdas plus verifies the SES
domain so welcome emails land from `support@credimed.us` instead of
the generic AWS verification sender.

**Total time at PC:** ~30 minutes of clicking + a DNS propagation
wait (typically 30 minutes, max 72 hours).

**Prerequisites you already have:**
- AWS account with IAM user
- Cognito User Pool `us-west-2_8GgqReC58`
- Google Workspace mail set up at credimed.us (so `support@credimed.us` exists)
- Access to DNS management at the registrar where credimed.us is hosted

---

## Order of operations

```
1. Verify SES domain credimed.us (10 min + DNS wait)
2. Deploy Pre-Sign-Up Lambda (5 min)
3. Deploy Post-Confirmation Lambda (10 min — has dependencies)
4. Wire both Lambdas to the Cognito User Pool (5 min)
5. End-to-end test (5 min)
```

Doing them out of order is fine — they're independent — but starting
with SES verification first lets the DNS propagate while you do the
rest.

---

## Step 1 — Verify SES domain `credimed.us`

### 1.1 In AWS SES console

1. AWS Console → **SES** → make sure region is **us-west-2 (Oregon)**
2. Sidebar → **Verified identities** → **Create identity**
3. Identity type: **Domain**
4. Domain: `credimed.us`
5. **Use a custom MAIL FROM domain:** ✅ checked → enter `mail.credimed.us`
6. **DKIM signing:** Easy DKIM, RSA_2048_BIT
7. **DKIM signatures:** Enabled
8. Click **Create identity**
9. SES shows a screen with **DNS records to add** — keep this tab open

### 1.2 In your DNS registrar (where `credimed.us` lives)

The DNS records SES gives you are roughly:
- **3 × CNAME** records for DKIM (each name like `xxxxxxxxx._domainkey.credimed.us`, value pointing at `*.dkim.amazonses.com`)
- **1 × MX** record on `mail.credimed.us` pointing at `feedback-smtp.us-west-2.amazonses.com` priority 10
- **1 × TXT** record on `mail.credimed.us` for SPF (`v=spf1 include:amazonses.com ~all`)
- Optionally: a DMARC TXT update on `_dmarc.credimed.us`

Add ALL of these without removing the records Google Workspace already
created (the @ MX records pointing at `aspmx.l.google.com` etc.). They
coexist — Google handles incoming, SES handles outgoing transactional.

### 1.3 Wait for verification

DNS propagation is usually ~30 minutes but can be up to 72 hours. SES
shows "Verification status: Pending" until propagation finishes, then
flips to "Verified."

You can move on with the rest of the steps while you wait.

---

## Step 2 — Deploy the Pre-Sign-Up Lambda

This is the one that auto-confirms users + auto-verifies their email
on signup, so they skip the "Enter verification code" screen and can
later use "Forgot password?" successfully.

### 2.1 Create the Lambda

1. AWS Console → **Lambda** → region **us-west-2** → **Create function**
2. **Author from scratch**
3. **Function name:** `credimed-cognito-presignup-autoconfirm`
4. **Runtime:** Node.js 20.x
5. **Architecture:** arm64
6. **Permissions:** "Create a new role with basic Lambda permissions" (default is fine — this Lambda only reads/writes its own event object, no AWS resources)
7. Click **Create function**

### 2.2 Paste the code

Open `backend/email/credimed-cognito-presignup-autoconfirm.js` from
this repo and copy the ENTIRE file contents. In the Lambda code editor:

1. Click `index.mjs` (or whatever the default entry file is named)
2. Replace its contents with the file you copied
3. **IMPORTANT:** the file in this repo uses `export const handler` (ES modules). Make sure the Lambda runtime is Node.js 20.x (which supports ESM by default for `.mjs` files). If the file is named `.js`, rename it to `index.mjs` OR change the package.json to `"type": "module"`.
4. Click **Deploy** (the orange button)

### 2.3 Quick sanity test

Tab **Test** → create a test event with this template:

```json
{
  "request": { "userAttributes": { "email": "test@example.com" } },
  "response": {}
}
```

Click **Test** — should succeed and the response object should show
`autoConfirmUser: true` and `autoVerifyEmail: true`.

---

## Step 3 — Deploy the Post-Confirmation Lambda

This is the one that sends the `welcome` email after a user is
confirmed. It depends on `templates.js` and `sendEmail.js` — those
need to be bundled into the Lambda deployment.

### 3.1 Build a deploy package locally

On your PC, in a fresh folder:

```bash
mkdir credimed-postconfirm-deploy
cd credimed-postconfirm-deploy
mkdir email
cp /path/to/Credimed/backend/email/credimed-cognito-postconfirmation-welcome.js index.mjs
cp /path/to/Credimed/backend/email/sendEmail.js email/sendEmail.js
cp /path/to/Credimed/backend/email/templates.js email/templates.js

# Create a minimal package.json so Node treats files as ESM
cat > package.json <<EOF
{
  "name": "credimed-postconfirm",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-ses": "^3.600.0"
  }
}
EOF

npm install --omit=dev
zip -r ../credimed-postconfirm.zip . -x "node_modules/.bin/*" "*.DS_Store"
```

You now have `credimed-postconfirm.zip` ready to upload.

⚠️ **Note about imports:** `credimed-cognito-postconfirmation-welcome.js`
imports `from './email/templates.js'`. If you copy the file as
`index.mjs` to the root of the deploy package, that import path
already works because we created the `email/` subdirectory above.

### 3.2 Create the Lambda

1. AWS Console → **Lambda** → **Create function**
2. **Function name:** `credimed-cognito-postconfirmation-welcome`
3. **Runtime:** Node.js 20.x
4. **Architecture:** arm64
5. **Permissions:** "Create a new role with basic Lambda permissions"
6. Click **Create function**

### 3.3 Upload the zip

1. In the Code tab → **Upload from** → **.zip file** → upload `credimed-postconfirm.zip`
2. Wait for upload + deploy

### 3.4 Configure environment variables

Configuration tab → **Environment variables** → Edit:

| Key | Value |
|---|---|
| `FROM_EMAIL` | `Credimed <support@credimed.us>` |

(`AWS_REGION` is set automatically.)

### 3.5 Add SES permissions to the Lambda's IAM role

Configuration → **Permissions** → click the role name (opens IAM in a
new tab) → **Add permissions** → **Attach policies** → search and
attach `AmazonSESFullAccess`.

(For tighter security later, swap to a custom policy that allows only
`ses:SendEmail` and `ses:SendRawEmail` on the verified `credimed.us`
ARN. `AmazonSESFullAccess` is fine for launch.)

### 3.6 Sanity test

Tab **Test** → create a test event:

```json
{
  "triggerSource": "PostConfirmation_ConfirmSignUp",
  "request": {
    "userAttributes": {
      "sub": "test-uuid-12345",
      "email": "your-real-email+credimed-test@gmail.com",
      "given_name": "Test"
    }
  },
  "response": {}
}
```

Replace the email with one you can actually check. Click **Test**.

If SES is verified and the policy is right, you should receive the
welcome email at the test address within seconds.

If you get an SES error like `MessageRejected: Email address is not
verified`, the SES domain isn't fully verified yet — wait for DNS
propagation and retry.

---

## Step 4 — Wire both Lambdas to the Cognito User Pool

1. AWS Console → **Cognito** → User pools → `us-west-2_8GgqReC58` (yours)
2. **User pool properties** tab
3. Section **Lambda triggers** → **Add Lambda trigger**
4. **Trigger type:** Sign-up
5. **Sign-up trigger:** Pre sign-up
6. **Lambda function:** select `credimed-cognito-presignup-autoconfirm`
7. **Save changes**

Repeat for the second trigger:

1. **Add Lambda trigger** again
2. **Trigger type:** Sign-up
3. **Sign-up trigger:** Post confirmation
4. **Lambda function:** select `credimed-cognito-postconfirmation-welcome`
5. **Save changes**

---

## Step 5 — End-to-end test

1. Open `https://credimed.us` in a private/incognito window
2. Click "Get started" → Create account
3. Enter `your.email+credimedlaunch@gmail.com` (a fresh address you control)
4. Use any first/last name and a strong password
5. Submit

Expected behavior:

- **No verification code email arrives** — the Pre-Sign-Up Lambda
  auto-confirms the user.
- The signup form transitions you straight to the dashboard (no
  "Enter verification code" screen).
- Within ~30 seconds, your inbox receives the **welcome email** from
  `Credimed <support@credimed.us>` with subject "Welcome to Credimed
  — your account is ready" and a teal-branded layout matching
  `emails/01-welcome.html`.

Then test password reset with that same account:

1. Sign out
2. Sign in screen → "Forgot password?"
3. Enter the same email → "Send reset code"
4. **A reset code email arrives** — proof that `autoVerifyEmail` is
   working (Cognito couldn't send this if the email weren't verified)

If both emails arrive correctly, you're done. The full email pipeline
is operational.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Welcome email never arrives, but verification code email does | Pre-Sign-Up Lambda not connected | Step 4: wire `credimed-cognito-presignup-autoconfirm` to Pre sign-up trigger |
| User gets a verification code email instead of being auto-confirmed | Pre-Sign-Up Lambda has only `autoConfirmUser`, missing `autoVerifyEmail` | Re-paste the file contents and Deploy |
| Lambda errors "MessageRejected: Email address is not verified" | SES domain credimed.us not yet verified | Wait for DNS propagation (up to 72h, usually 30 min); confirm CNAME records are correct in registrar |
| Welcome email arrives but from a weird sender like `no-reply@verificationemail.com` | Lambda is using SES default; FROM_EMAIL env var missing or domain not verified | Step 3.4: set FROM_EMAIL; Step 1: verify SES domain |
| User signs up successfully but can't reset password ("no verified email") | `autoVerifyEmail` was missing on the Pre-Sign-Up Lambda when this user was created | Existing legacy users must be marked verified manually in Cognito console: User pools > Users > select user > Actions > Mark email as verified |
| Welcome email arrives but image/branding is broken | Email client stripping CSS or images | Test in multiple clients (Gmail web, iOS Mail, Outlook); the template uses table-based layout that should survive most clients, but log the failing one |

---

## What this fixes (one-line)

Patient signs up → auto-confirmed (no code screen) → receives a
branded welcome email from `support@credimed.us` → can later reset
their password without hitting the "no verified email" dead end.
