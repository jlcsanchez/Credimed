/**
 * credimed-cognito-custom-message (Lambda)
 *
 * Cognito User Pool — Custom Message trigger. Fires for every email
 * Cognito sends:
 *   - Signup verification code
 *   - Password reset code
 *   - Resent verification code
 *   - Email-attribute verification code
 *   - Admin-create-user temporary password
 *   - MFA / authentication code
 *
 * Replaces Cognito's default plain-text "Your verification code is
 * NNNNNN" with the same branded HTML used by the rest of the Credimed
 * transactional emails (welcome, status updates, refund issued).
 *
 * How Cognito wires this:
 *   1. Cognito generates the code internally
 *   2. Cognito invokes this Lambda with `event.request.codeParameter`
 *      set to the placeholder string `{####}` (NOT the real code)
 *   3. We return event.response.emailSubject + emailMessage
 *   4. Cognito substitutes {####} with the real code, then sends the
 *      message via its sender of record (default Cognito infra OR your
 *      verified SES identity if configured).
 *
 * IMPORTANT: never put a real-looking 6-digit number in code — Cognito
 * sends the body verbatim after substitution. Always pass the
 * `event.request.codeParameter` placeholder through.
 *
 * Required env vars:
 *   AWS_REGION    — us-west-2 (set automatically by Lambda)
 *
 * Required IAM permissions on the Lambda execution role: NONE.
 *   This Lambda is a pure transform — it doesn't call SES or DynamoDB.
 *   Cognito does the actual send. The default AWSLambdaBasicExecutionRole
 *   (CloudWatch Logs only) is sufficient.
 *
 * Cognito wiring (one-time, in Cognito console):
 *   User pool > User pool properties > Lambda triggers > Custom message
 *   > select this Lambda > Save.
 *
 * Optional but recommended: configure Cognito to send emails via your
 * verified SES identity (User pool > Messaging > Email). Otherwise
 * Cognito sends from no-reply@verificationemail.com — branded HTML
 * arrives, but the FROM address is generic.
 */

import { buildVerificationEmail } from './email/templates.js';

export const handler = async (event) => {
  const { triggerSource } = event;
  const code        = event.request?.codeParameter;
  const firstName   = event.request?.userAttributes?.given_name || '';

  if (!code) {
    /* No code in the event payload — Cognito occasionally fires the
       Custom Message trigger without one (e.g. during certain
       admin actions). Returning the event unchanged tells Cognito to
       fall back to its default message for that trigger. */
    console.log(JSON.stringify({
      event: 'custom_message_no_code',
      triggerSource,
      userSub: event.request?.userAttributes?.sub
    }));
    return event;
  }

  const built = buildVerificationEmail(triggerSource, code, firstName);
  if (!built) {
    /* Trigger source we don't have a branded template for — let
       Cognito use its default. Logged so we can spot new sources
       Cognito introduces and add coverage. */
    console.log(JSON.stringify({
      event: 'custom_message_unhandled_trigger',
      triggerSource,
      userSub: event.request?.userAttributes?.sub
    }));
    return event;
  }

  event.response = event.response || {};
  event.response.emailSubject = built.subject;
  event.response.emailMessage = built.html;

  console.log(JSON.stringify({
    event: 'custom_message_rendered',
    triggerSource,
    userSub: event.request?.userAttributes?.sub,
    subject: built.subject,
    htmlLength: built.html.length,
    timestamp: new Date().toISOString()
  }));

  return event;
};
