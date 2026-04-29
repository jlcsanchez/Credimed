/**
 * credimed-cognito-postconfirmation-welcome (Lambda)
 *
 * Cognito User Pool — Post Confirmation trigger. Fires once per user,
 * immediately after the user is confirmed (auto-confirmed by the
 * Pre-Sign-Up Lambda OR confirmed via emailed code). Sends the
 * `welcome` email through SES.
 *
 * Why a separate Lambda instead of inlining into the Pre-Sign-Up
 * Lambda:
 *   - Pre-Sign-Up runs BEFORE the account is confirmed; SES.send
 *     could race and double-send if the user is rejected later.
 *   - Post-Confirmation only fires on a successfully created user,
 *     making it the natural point for a "welcome" message.
 *   - Per AWS best practice — Pre-Sign-Up is for validation +
 *     auto-confirm, Post-Confirmation is for downstream side effects.
 *
 * Required env vars:
 *   AWS_REGION    — us-west-2 (set automatically by Lambda)
 *   FROM_EMAIL    — verified SES sender, e.g. "Credimed <support@credimed.us>"
 *
 * Required IAM permissions on the Lambda execution role:
 *   ses:SendEmail
 *   ses:SendRawEmail
 *
 * Cognito wiring (one-time, in Cognito console):
 *   User pool > User pool properties > Lambda triggers > Post confirmation
 *   > select this Lambda > Save.
 *
 * HIPAA note: this email contains zero PHI — only the user's first
 * name (which they typed at signup) and a generic welcome. No claim
 * data, no insurer name, no health information. SMTP transit
 * downgrade risk is therefore moot.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { buildEmail } from './email/templates.js';

const REGION     = process.env.AWS_REGION || 'us-west-2';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Credimed <support@credimed.us>';
const ses        = new SESClient({ region: REGION });

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

  try {
    const { subject, html, text } = buildEmail('welcome', { firstName });

    const result = await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' }
        }
      }
    }));

    console.log(JSON.stringify({
      event: 'welcome_email_sent',
      to: email,
      userSub: attrs.sub,
      messageId: result.MessageId,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    /* Welcome email failure is non-blocking. Log and continue —
       the user is already confirmed, blocking their sign-in over
       a missed email is bad UX. */
    console.error(JSON.stringify({
      event: 'welcome_email_failed',
      to: email,
      userSub: attrs.sub,
      error: err.message,
      timestamp: new Date().toISOString()
    }));
  }

  return event;
};
