/**
 * Shared SES sender — used by the claims Lambda (admin status changes)
 * and the Stripe webhook Lambda (payment success). Each Lambda imports
 * { sendEmail } and calls it after its own DynamoDB write succeeds.
 *
 * Why a shared module instead of a separate "email Lambda":
 *   - One Lambda → one SES.send call. No additional cold start, no
 *     IAM Lambda-invoke permission needed, no extra logging hop.
 *   - Templates live in templates.js so both Lambdas render identical
 *     copy.
 *   - If we later need rate limiting, retries, or a queue, we promote
 *     this to a real Lambda then. Premature today.
 *
 * IAM: each Lambda that imports this needs:
 *   ses:SendEmail
 *   ses:SendRawEmail
 * scoped to the verified FROM address (FROM_EMAIL below).
 *
 * Env vars expected on the calling Lambda:
 *   FROM_EMAIL    — verified SES sender (e.g. "Credimed <hello@credimed.us>")
 *   AWS_REGION    — us-west-2
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { buildEmail } from './templates.js';

const REGION = process.env.AWS_REGION || 'us-west-2';
/**
 * The verified domain in SES is credimed.us, so any @credimed.us
 * address works as a sender — but replies route to wherever the
 * address actually exists in Google Workspace. As of launch only
 * ceo@credimed.us is live; switch this to hello@credimed.us once
 * that alias is created.
 */
const FROM_EMAIL = process.env.FROM_EMAIL || 'Credimed <ceo@credimed.us>';

const ses = new SESClient({ region: REGION });

/**
 * Send a templated email. Returns { messageId } on success, throws on
 * SES failure. Caller decides whether to swallow the error or
 * surface it. Most callers should swallow — a failed email shouldn't
 * roll back a successful claim status update.
 *
 * @param {object} args
 * @param {string} args.to            — recipient address
 * @param {string} args.eventType     — key into templates.js (e.g. 'statusPaid')
 * @param {object} args.data          — { firstName, claimId, ... }
 */
export async function sendEmail({ to, eventType, data }) {
  if (!to || !eventType) {
    throw new Error('sendEmail: `to` and `eventType` are required');
  }
  const { subject, html, text } = buildEmail(eventType, data);

  const cmd = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' }
      }
    }
  });

  const result = await ses.send(cmd);
  return { messageId: result.MessageId };
}

/**
 * Fire-and-forget variant. Logs failures but never throws. Use when
 * the email is a notification side-effect and you don't want a SES
 * outage to roll back the primary action.
 */
export async function sendEmailSafely(args) {
  try {
    const r = await sendEmail(args);
    console.log(JSON.stringify({
      event: 'email_sent',
      to: args.to,
      eventType: args.eventType,
      messageId: r.messageId,
      timestamp: new Date().toISOString()
    }));
    return r;
  } catch (err) {
    console.error(JSON.stringify({
      event: 'email_failed',
      to: args.to,
      eventType: args.eventType,
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    return null;
  }
}
