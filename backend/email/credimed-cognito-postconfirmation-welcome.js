/**
 * credimed-cognito-postconfirmation-welcome (Lambda)
 *
 * Cognito User Pool — Post Confirmation trigger. Fires once per user,
 * immediately after the user is confirmed (auto-confirmed by the
 * Pre-Sign-Up Lambda OR confirmed via emailed code). Sends the
 * `welcome` email through whichever provider EMAIL_PROVIDER selects
 * (Resend / SMTP / SES) — see ./sendEmail.js.
 *
 * Why a separate Lambda instead of inlining into the Pre-Sign-Up
 * Lambda:
 *   - Pre-Sign-Up runs BEFORE the account is confirmed; sending early
 *     could race and double-send if the user is rejected later.
 *   - Post-Confirmation only fires on a successfully created user,
 *     making it the natural point for a "welcome" message.
 *   - Per AWS best practice — Pre-Sign-Up is for validation +
 *     auto-confirm, Post-Confirmation is for downstream side effects.
 *
 * Required env vars (same set as every other email-sending Lambda):
 *   EMAIL_PROVIDER   — 'resend' (preferred) | 'smtp' | 'ses'
 *   FROM_EMAIL       — verified sender, e.g. "Credimed <ceo@credimed.us>"
 *   RESEND_API_KEY   — when EMAIL_PROVIDER=resend
 *   SMTP_USER/PASS   — when EMAIL_PROVIDER=smtp
 *   AWS_REGION       — when EMAIL_PROVIDER=ses (set automatically by Lambda)
 *
 * Cognito wiring (one-time, in Cognito console):
 *   User pool > User pool properties > Lambda triggers > Post confirmation
 *   > select this Lambda > Save.
 *
 * HIPAA note: this email contains zero PHI — only the user's first
 * name (which they typed at signup) and a generic welcome. No claim
 * data, no insurer name, no health information.
 */

/* Import path matches the deployed file structure (see DEPLOY-EMAIL-LAMBDAS.md):
     index.mjs                 ← this handler at zip root
     email/sendEmail.js        ← shared module copied into a subfolder
   so the runtime resolves './email/sendEmail.js' from index.mjs. */
import { sendEmailSafely } from './email/sendEmail.js';

export const handler = async (event) => {
  const { triggerSource } = event;

  /* Cognito fires Post-Confirmation for both signup-confirmation and
     forgot-password-confirmation. We only want to welcome NEW users —
     skip on password resets so existing users don't get a "welcome"
     email after a reset. */
  if (triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    console.log(JSON.stringify({
      event: 'postconfirmation_skipped',
      triggerSource,
      reason: 'Not a signup confirmation',
      userSub: event.request?.userAttributes?.sub
    }));
    return event;
  }

  const attrs     = event.request?.userAttributes || {};
  const email     = attrs.email;
  const firstName = attrs.given_name || '';

  if (!email) {
    console.error(JSON.stringify({
      event: 'postconfirmation_no_email',
      userSub: attrs.sub,
      attrs: Object.keys(attrs)
    }));
    /* Don't throw — Cognito would block the signup confirmation if
       we returned an error. Welcome email failure is non-blocking. */
    return event;
  }

  /* sendEmailSafely never throws — it logs failures and returns null
     so a provider outage doesn't block Cognito's signup flow. */
  await sendEmailSafely({
    to: email,
    eventType: 'welcome',
    data: { firstName }
  });

  return event;
};
