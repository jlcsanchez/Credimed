/**
 * Shared email sender — supports three providers via the EMAIL_PROVIDER
 * env var so the same Lambda binary can ship to any of them with no
 * code change, just a config flip:
 *
 *   EMAIL_PROVIDER=resend  → Resend.com (preferred — no sandbox, modern API)
 *   EMAIL_PROVIDER=smtp    → Generic SMTP (e.g. Google Workspace via app
 *                            password). Backup if Resend has an outage.
 *   EMAIL_PROVIDER=ses     → Amazon SES (legacy — sandbox-locked until
 *                            AWS approves production access).
 *
 * Why three providers:
 *   - AWS rejected SES production access twice → can't ship with SES alone.
 *   - Resend has no sandbox + 3K emails/month free, then $20/mo for 50K.
 *     Designed exactly for transactional sends with branded HTML.
 *   - Workspace SMTP is a fallback if Resend ever goes down: we already
 *     pay for Workspace and can use a Gmail app password to relay.
 *
 * Each provider is loaded LAZILY (dynamic import inside the branch that
 * needs it) so a Lambda configured to use Resend doesn't pay the cost
 * of pulling the SES client into memory at cold start.
 *
 * Env vars per provider:
 *
 *   common
 *     FROM_EMAIL        e.g. 'Credimed <ceo@credimed.us>'
 *
 *   provider=resend
 *     RESEND_API_KEY    starts with "re_..."
 *
 *   provider=smtp
 *     SMTP_HOST         default 'smtp.gmail.com'
 *     SMTP_PORT         default 465 (TLS)
 *     SMTP_USER         e.g. 'ceo@credimed.us'
 *     SMTP_PASS         16-char Gmail app password (not the account password)
 *
 *   provider=ses
 *     AWS_REGION        default 'us-west-2'
 *     (uses the Lambda's IAM role for ses:SendEmail/ses:SendRawEmail)
 *
 * Switching providers in production is a 2-step change with zero downtime:
 *   1. Set EMAIL_PROVIDER=<new> + the matching API key/SMTP creds in the
 *      Lambda env vars (AWS console → Lambda → Configuration → Environment).
 *   2. Save. The next invocation uses the new provider; the previous in-
 *      flight invocations finish on the old one.
 */

import { buildEmail } from './templates.js';

const PROVIDER = (process.env.EMAIL_PROVIDER || 'ses').toLowerCase();
/**
 * The verified sender. With Resend we have to verify the domain
 * (credimed.us) up front via DNS records — once verified, any address
 * @credimed.us is allowed. With Workspace SMTP it has to match the
 * account whose app password we're using (typically ceo@credimed.us).
 */
const FROM_EMAIL = process.env.FROM_EMAIL || 'Credimed <ceo@credimed.us>';

let _ses    = null;
let _resend = null;
let _smtp   = null;

async function getSES() {
  if (_ses) return _ses;
  const { SESClient } = await import('@aws-sdk/client-ses');
  _ses = new SESClient({ region: process.env.AWS_REGION || 'us-west-2' });
  return _ses;
}

async function getResend() {
  if (_resend) return _resend;
  const { Resend } = await import('resend');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');
  _resend = new Resend(apiKey);
  return _resend;
}

async function getSMTP() {
  if (_smtp) return _smtp;
  const nodemailer = await import('nodemailer');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP_USER + SMTP_PASS env vars required');
  _smtp = (nodemailer.default || nodemailer).createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass }
  });
  return _smtp;
}

/**
 * Send a templated email. Returns { messageId, provider } on success,
 * throws on failure. Caller decides whether to swallow the error
 * (sendEmailSafely below does) or surface it. Most callers should
 * swallow — a failed email shouldn't roll back a successful claim
 * status update.
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

  if (PROVIDER === 'resend') {
    const resend = await getResend();
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      text
    });
    if (result.error) {
      const msg = result.error.message || JSON.stringify(result.error);
      throw new Error(`Resend: ${msg}`);
    }
    return { messageId: result.data?.id || 'resend-no-id', provider: 'resend' };
  }

  if (PROVIDER === 'smtp') {
    const smtp = await getSMTP();
    const info = await smtp.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text
    });
    return { messageId: info.messageId, provider: 'smtp' };
  }

  // SES (default — kept as legacy path until/if AWS approves production)
  const ses = await getSES();
  const { SendEmailCommand } = await import('@aws-sdk/client-ses');
  const result = await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' }
      }
    }
  }));
  return { messageId: result.MessageId, provider: 'ses' };
}

/**
 * Fire-and-forget variant. Logs failures but never throws. Use when
 * the email is a notification side-effect and you don't want a provider
 * outage to roll back the primary action.
 *
 * Logs include the provider name so CloudWatch Insights queries can
 * distinguish between Resend / SMTP / SES failures during a migration
 * window.
 */
export async function sendEmailSafely(args) {
  try {
    const r = await sendEmail(args);
    console.log(JSON.stringify({
      event: 'email_sent',
      provider: r.provider,
      to: args.to,
      eventType: args.eventType,
      messageId: r.messageId,
      timestamp: new Date().toISOString()
    }));
    return r;
  } catch (err) {
    console.error(JSON.stringify({
      event: 'email_failed',
      provider: PROVIDER,
      to: args.to,
      eventType: args.eventType,
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    return null;
  }
}
