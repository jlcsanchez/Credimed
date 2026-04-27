# Cognito hardening — step-by-step (AWS Console)

**User pool:** `us-west-2_8GgqReC58`
**Region:** us-west-2 (Oregon)
**Time required:** ~15 minutes total
**When to do this:** before the first paying patient. None of this is technically required for development, but all of it is required for HIPAA-compliant production use.

---

## 1. Password policy — minimum 12 characters with complexity (3 min)

Current default is 8 characters. HIPAA's NIST 800-63B reference standard is 8 minimum, but for healthcare data 12+ is the established floor.

1. AWS Console → **Cognito** → **User pools** → click `us-west-2_8GgqReC58`.
2. Top tabs → **Authentication** → **Sign-in & sign-up** → scroll to **Password policy** → click **Edit**.
3. Set:
   - Minimum length: **12**
   - Require numbers: **Yes**
   - Require uppercase letter: **Yes**
   - Require lowercase letter: **Yes**
   - Require special character: **Yes**
   - Temporary password validity: **3 days** (down from default 7)
4. Click **Save changes**.

⚠️ Existing users: this only applies to NEW passwords. Existing passwords keep working until next password change. Consider forcing a password reset on the next sign-in for any account created before today (Cognito → Users → select user → Actions → "Reset password").

---

## 2. MFA required for the Admin group (5 min)

Patient accounts: MFA optional (friction would hurt conversion). Admin accounts: MFA mandatory because they can read PHI across all claims.

### 2a. Enable MFA at the user-pool level (if not already)

1. **Authentication** → **Multi-factor authentication** → **Edit**.
2. Set MFA enforcement to: **Optional MFA** (not "Required" — that would force every patient to enroll).
3. MFA methods: enable **Authenticator apps** (TOTP) and **SMS** (TOTP-only is preferred for security; SMS is a fallback).
4. Save.

### 2b. Force MFA for users in the `Admin` group via a Pre-Token Generation Lambda trigger

Cognito doesn't support per-group MFA enforcement natively. Two options:

**Option A — Backend gate (simpler, recommended for MVP):** in `backend/claims/credimed-claims.lambda.js`, in any `/admin/*` route, after JWT validation check if `cognito:groups` includes `"Admin"` AND the JWT was issued without MFA. If so, return 403 with `WWW-Authenticate: mfa_required`. Force admin users to enroll TOTP via a one-time setup screen the first time they hit a 403 from this code path.

**Option B — Pre-Token Generation Lambda trigger (cleaner):** write a Lambda that runs on token generation. If the user is in the Admin group and hasn't completed MFA, deny token issuance. Wire it under **Cognito → User pool → Extensions → Triggers → Pre token generation**. Code template lives at `backend/cognito/pre-token-mfa-gate.js` (TODO: scaffold this when ready).

Until either is in place, **manually enroll TOTP for every admin user**:

1. Sign in as the admin user once.
2. Go to your account (in-app, top-right) → "Set up authenticator app" — scan QR code with Authy / Google Authenticator / 1Password.
3. Enter the 6-digit code to confirm.

---

## 3. Email verification required for sign-up (2 min)

Currently anyone can sign up with any email and start a claim. For PHI handling we must verify the patient owns the email address before storing identifying data.

1. **Authentication** → **Sign-in & sign-up** → **Sign-up experience** → **Edit**.
2. Under **Self-service sign-up**, ensure **Allow self-registration** is on.
3. Under **Attribute verification**, set **Cognito-assisted verification** to **Yes**, with **Email message** as the delivery method.
4. Required attributes: keep **email** required (already is).
5. Save.

After this, new sign-ups will receive a 6-digit code by email and can't sign in until they verify it. Existing accounts are unaffected.

---

## 4. Account-recovery hardening (1 min)

Default account recovery uses email or SMS. SMS recovery is vulnerable to SIM swap. Disable it for HIPAA accounts.

1. **Authentication** → **Sign-in & sign-up** → **Account recovery** → **Edit**.
2. Set **Account recovery method** to: **Email only** (uncheck SMS).
3. Save.

---

## 5. App-client setting tightening (3 min)

Three settings on the app client (`6m...` — your one app client) that are usually too loose by default.

1. **Applications** → **App clients** → click your app client.
2. Scroll to **Auth flows** → click **Edit**:
   - **ALLOW_USER_SRP_AUTH**: keep on (this is the secure SRP flow)
   - **ALLOW_USER_PASSWORD_AUTH**: turn **off** (this is the legacy non-SRP flow — frontend SDK doesn't need it)
   - **ALLOW_REFRESH_TOKEN_AUTH**: keep on
   - **ALLOW_ADMIN_USER_PASSWORD_AUTH**: turn **off** (admin-side password auth — backend doesn't use it)
   - Save.
3. Scroll to **Token expiration**:
   - **Refresh token**: 30 days (down from default 30 days — already correct)
   - **Access token**: 60 minutes (down from default 60 minutes — already correct)
   - **ID token**: 60 minutes
4. Scroll to **Prevent user existence errors** → set to **Enabled** (avoids username-enumeration attacks).
5. Save.

---

## 6. Audit logging (1 min)

Cognito events should flow to CloudWatch for HIPAA's audit-log requirement.

1. **Authentication** → **Advanced security features** → **Edit**.
2. Set **Advanced security features** to **Audit and respond** (free tier is fine for low volume).
3. Save. This logs sign-in attempts, sign-ups, password resets, MFA enrollments, etc., into CloudWatch Logs.

(Separately, set CloudWatch log retention to **12 months** on the Cognito log group: CloudWatch → Log groups → `/aws/cognito/userpools/us-west-2_8GgqReC58/...` → Actions → Edit retention setting → 12 months. HIPAA's audit-log retention floor is 6 years for the audit RECORD, but log-group retention can roll forward into S3 archive after 12 months — set up an S3 export lifecycle for that separately.)

---

## 7. (Optional, after launch) Risk-based authentication

Once you have actual production traffic, enable **Adaptive authentication** in the Advanced security features panel. It scores each sign-in attempt (new device, new location, impossible travel, leaked credentials) and can challenge or block automatically. Keep it on **Audit-only** mode for the first 30 days to see what trips before flipping to **Audit and block**.

---

## Verification checklist (do all of these after step 6)

- [ ] Try to sign up with a new email — confirm the verification code email arrives within 30 seconds
- [ ] Try to set a password with 11 characters — confirm rejection
- [ ] Try to set a password with no special character — confirm rejection
- [ ] Enroll an authenticator app on your admin account — confirm login now requires the 6-digit code
- [ ] Try to sign in with an email that doesn't exist — confirm the error message is generic (e.g. "Incorrect username or password" not "User does not exist")
- [ ] Verify CloudWatch logs are receiving Cognito sign-in events at `/aws/cognito/userpools/...`

---

## What we deliberately did NOT enable

- **SAML / OIDC federation**: not needed for direct-to-consumer signups
- **Custom challenge Lambda**: overkill for current scale
- **Hosted UI**: we render our own forms in `/app/login.html` and use `amazon-cognito-identity-js` directly
- **User migration trigger**: no legacy user pool to migrate from
