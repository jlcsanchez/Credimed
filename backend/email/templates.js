/**
 * Email templates — HIPAA-safe, no PHI.
 *
 * Each template returns { subject, html, text }. Recipient name and
 * claimId are safe to include (claimId is a synthetic identifier
 * with no clinical meaning). Status updates link the user back to
 * the authenticated app where the full detail lives behind login.
 *
 * Why no PHI in email bodies:
 *   - SMTP doesn't enforce TLS — receiving servers may downgrade
 *     to plaintext. Putting procedure names, diagnoses, or insurer
 *     details in an email is a HIPAA breach risk.
 *   - The patient's inbox is also accessible from any device they
 *     forget to sign out of. Don't leak PHI there.
 *
 * The HTML shell is the table-based, client-tested layout from the
 * brand design pass — supports the full Outlook / Gmail / iOS Mail
 * matrix without modern CSS. Each template fills the slot variables
 * (statusLabel, headline, subhead, body, cta, helper) and optionally
 * an amount block (only used on refund events).
 */

const APP_BASE = 'https://www.credimed.us/app';
const SITE_BASE = 'https://www.credimed.us';
const SUPPORT_EMAIL = 'support@credimed.us';

/**
 * Render the brand email shell.
 *
 * slots:
 *   subject        — used for the <title> tag (clients display when
 *                    forwarded as attachment)
 *   preheader      — hidden preview text (Gmail / iOS inbox preview)
 *   statusLabel    — top-right pill ("In review", "Approved", etc)
 *   headline       — serif H1
 *   subhead        — sans-serif lead paragraph
 *   amount         — optional. when present shows the highlight block
 *   amountLabel    — optional. label for the amount block
 *   bodyText       — body copy (HTML allowed — used for greeting + para)
 *   claimId        — pill displayed before CTA
 *   ctaLabel       — button text
 *   ctaUrl         — button href
 *   helperText     — small grey line below the CTA
 *   unsubToken     — appended to the unsubscribe link. claimId works
 *                    as a placeholder until per-recipient tokens exist.
 */
function shell(slots) {
  const {
    subject, preheader, statusLabel, headline, subhead,
    amount, amountLabel, bodyText, claimId,
    ctaLabel, ctaUrl, helperText, unsubToken
  } = slots;

  const amountBlock = amount ? `
          <tr>
            <td class="px" style="padding:0 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0FDFA;border:1px solid #CCFBF1;border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td class="stack" align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#0F766E;letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">
                          ${amountLabel || 'Amount'}
                        </td>
                        <td class="stack" align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;color:#134E4A;font-weight:700;letter-spacing:-0.01em;">
                          ${amount}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${subject}</title>
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #FAF6EF; }
  a { color: #0D9488; text-decoration: none; }
  @media screen and (max-width: 640px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .py-hero { padding-top: 32px !important; padding-bottom: 28px !important; }
    .h1 { font-size: 24px !important; line-height: 1.25 !important; }
    .btn a { display: block !important; }
    .stack { display: block !important; width: 100% !important; }
    .footer-cell { text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#FAF6EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#FAF6EF;">
    ${preheader || ''}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAF6EF;">
    <tr>
      <td align="center" style="padding:32px 16px 48px 16px;">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;background-color:#ffffff;border-radius:14px;border:1px solid #E8E2D5;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
          <tr>
            <td class="px" style="padding:24px 32px 20px 32px;border-bottom:1px solid #F1ECE0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:10px;line-height:0;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background-color:#0D9488;border-radius:50%;text-align:center;vertical-align:middle;">
                                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;letter-spacing:0;line-height:28px;">H</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.14em;color:#134E4A;text-transform:uppercase;">
                          CREDIMED
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#64748B;letter-spacing:0.04em;text-transform:uppercase;">
                    ${statusLabel}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px py-hero" style="padding:40px 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:'Iowan Old Style','Apple Garamond',Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#0F172A;font-weight:600;letter-spacing:-0.01em;" class="h1">
                    ${headline}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#475569;">
                    ${subhead}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${amountBlock}
          <tr>
            <td class="px" style="padding:24px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0F172A;">
              ${bodyText}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:8px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#64748B;padding-right:8px;">
                    Claim ID
                  </td>
                  <td style="background-color:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;padding:5px 10px;font-family:'SF Mono','Menlo','Monaco','Consolas',monospace;font-size:12px;color:#0F172A;letter-spacing:0.02em;">
                    ${claimId}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" align="left" style="padding:28px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#0D9488;">
                    <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.005em;">
                      ${ctaLabel} &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:14px 32px 36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#64748B;">
              ${helperText}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="border-top:1px solid #F1ECE0;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:22px 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="footer-cell" align="left" valign="top" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94A3B8;">
                    Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#0F766E;text-decoration:none;font-weight:500;">${SUPPORT_EMAIL}</a>
                    <br />
                    <a href="${SITE_BASE}/legal/privacy.html" style="color:#94A3B8;text-decoration:underline;">Privacy</a>
                    &nbsp;&middot;&nbsp;
                    <a href="${SITE_BASE}/legal/terms.html" style="color:#94A3B8;text-decoration:underline;">Terms</a>
                    &nbsp;&middot;&nbsp;
                    <a href="${SITE_BASE}/unsubscribe?u=${encodeURIComponent(unsubToken || claimId || '')}" style="color:#94A3B8;text-decoration:underline;">Unsubscribe</a>
                    <br />
                    <span style="color:#CBD5E1;">Credimed LLC &middot; 2261 Market St #5432, San Francisco, CA 94114</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="container" style="width:640px;max-width:640px;">
          <tr>
            <td align="center" style="padding:18px 16px 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#CBD5E1;letter-spacing:0.12em;text-transform:uppercase;">
              Sent by Credimed &middot; credimed.us
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const dashboardUrl = `${APP_BASE}/dashboard.html`;
const greet = (firstName) => firstName ? `Hi ${firstName},` : 'Hi,';

const templates = {
  /* Sent immediately after Cognito Post-Confirmation fires (the user
     just signed up and was auto-confirmed by the Pre-Sign-Up Lambda).
     No claimId yet — they haven't started a claim. CTA points to the
     upload page so they can get going. */
  welcome({ firstName }) {
    return {
      subject: 'Welcome to Credimed — your account is ready',
      html: shell({
        subject: 'Welcome to Credimed — your account is ready',
        preheader: "Upload your dental receipt and we'll file your PPO claim within 24 hours.",
        statusLabel: 'Account created',
        headline: 'Welcome to Credimed.',
        subhead: "Your account is ready. Upload your dental receipt and we'll file your out-of-network reimbursement claim with your insurer within 24 hours.",
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0 0 12px;">Here's what happens next:</p><ol style="margin:0 0 12px;padding-left:18px;line-height:1.6;"><li>Upload your dental receipt + insurance card (~2 minutes)</li><li>We translate it, code it correctly, and prepare the ADA claim form</li><li>You confirm and pay our one-time fee (\$19–\$99 based on complexity, capped at 20% of your refund)</li><li>We file with your insurer the same day</li><li>Your insurer mails the refund check directly to you in 3–6 weeks</li></ol><p style="margin:0;"><b>You only pay if we recover your refund.</b> If your claim is eligible and we can't get it paid after one free resubmission, we refund your fee — full money-back guarantee.</p>`,
        claimId: 'New member',
        ctaLabel: 'Upload my receipt',
        ctaUrl: `${APP_BASE}/documents.html`,
        helperText: 'Reply to this email if you have any questions — we read every message.',
        unsubToken: 'welcome'
      }),
      text:
        `${greet(firstName)}\n\nWelcome to Credimed. Your account is ready.\n\nNext step: upload your dental receipt + insurance card. We'll translate it, prepare the claim form, and file it with your insurer within 24 hours.\n\nFee: \$19–\$99 one-time (depends on claim complexity, capped at 20% of your refund). Money-back guarantee — if we can't recover your refund, we refund your fee.\n\nGet started: ${APP_BASE}/documents.html\n\nQuestions? Reply to this email.`
    };
  },

  /* Combined receipt + filed confirmation — fires once from the Stripe
     webhook the moment payment succeeds. Replaces the old paymentReceived
     and claimSubmitted pair (they fired back-to-back from the same event,
     which felt like noise to the patient). The 24h-later "in review"
     email is scheduled separately via EventBridge.
     amountPaid is the fee charged (string, formatted); optional. */
  paymentReceivedAndFiled({ firstName, claimId, amountPaid }) {
    const amt = amountPaid || null;
    return {
      subject: `Payment received and claim filed · ${claimId}`,
      html: shell({
        subject: `Payment received and claim filed · ${claimId}`,
        preheader: 'Your fee is locked in and your claim is on its way to your insurer.',
        statusLabel: 'Filed',
        headline: 'Payment received. Claim filed.',
        subhead: "Your fee is locked in and your claim has been filed with your insurer. You don't need to do anything else right now.",
        amount: amt,
        amountLabel: amt ? 'Fee paid' : undefined,
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0 0 12px;">What happens next:</p><ol style="margin:0 0 12px;padding-left:18px;line-height:1.6;"><li>Your insurer reviews your claim (usually 3–6 weeks)</li><li>If they approve it, the refund check is mailed directly to you</li><li>We email you at every status change so you're never wondering</li></ol><p style="margin:0;">No action needed. We'll be in touch within 24 hours when your insurer acknowledges receipt.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: 'Track status anytime from your dashboard. Reply to this email if anything looks off.',
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nPayment received and your claim is filed with your insurer.${amt ? `\n\nFee paid: ${amt}` : ''}\n\nWhat happens next:\n1. Your insurer reviews the claim (3–6 weeks typical)\n2. If approved, the refund is mailed directly to you\n3. We email you at every status change\n\nReference: ${claimId}\nView: ${dashboardUrl}\n\nQuestions? ${SUPPORT_EMAIL}`
    };
  },

  statusInReview({ firstName, claimId }) {
    return {
      subject: `Your claim is in review · ${claimId}`,
      html: shell({
        subject: `Your claim is in review · ${claimId}`,
        preheader: 'Your insurer has the claim and is reviewing it.',
        statusLabel: 'In review',
        headline: 'Your claim is in review.',
        subhead: 'Your insurer has acknowledged the claim and is reviewing it. Most reviews take 3–6 weeks.',
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0;">We'll email you the moment the status changes — you don't need to do anything in the meantime.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: 'Insurer review windows vary. We track your claim daily and follow up if it stalls.',
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nYour insurer has acknowledged the claim and is reviewing it. Most reviews take 3–6 weeks. We'll email you the moment the status changes.\n\nReference: ${claimId}`
    };
  },

  statusApproved({ firstName, claimId }) {
    return {
      subject: `Claim approved · ${claimId}`,
      html: shell({
        subject: `Claim approved · ${claimId}`,
        preheader: 'Good news — your claim was approved.',
        statusLabel: 'Approved',
        headline: 'Your claim was approved.',
        subhead: 'Your insurer approved your claim. They will issue payment to you directly.',
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0;">We'll let you know once the payment is on its way. The reimbursement comes straight from your insurer to your account — we never touch your refund.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: "Most refunds land within 3–7 business days of approval.",
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nYour insurer approved your claim. They will issue payment to you directly. We'll let you know once the payment is on its way.\n\nReference: ${claimId}`
    };
  },

  statusPaid({ firstName, claimId }) {
    return {
      subject: `Refund issued · ${claimId}`,
      html: shell({
        subject: `Refund issued · ${claimId}`,
        preheader: 'Reimbursement issued by your insurer.',
        statusLabel: 'Paid',
        headline: 'Your refund is on the way.',
        subhead: 'Your insurer has issued the reimbursement.',
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0;">Funds typically arrive in your account within 3–7 business days. The exact amount and ETA are in your dashboard.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: "If anything looks off when the funds land, reply to this email and we'll dig in.",
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nYour insurer has issued the reimbursement. Funds typically arrive in your account within 3–7 business days.\n\nReference: ${claimId}`
    };
  },

  statusDenied({ firstName, claimId }) {
    return {
      subject: `Update on your claim · ${claimId}`,
      html: shell({
        subject: `Update on your claim · ${claimId}`,
        preheader: 'Decision from your insurer — sign in for details and next steps.',
        statusLabel: 'Update',
        headline: 'Update on your claim.',
        subhead: 'Your insurer has issued a decision on your claim. Sign in to see the detail and your options.',
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0 0 12px;">Eligible claims qualify for our 100% money-back guarantee, and we'll resubmit at no extra cost if a fix is possible.</p><p style="margin:0;">Marco, our case manager, is available in the app if you'd like to talk through next steps.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: "Most denied-then-resubmitted claims succeed on the second attempt.",
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nYour insurer has issued a decision on your claim. Please sign in to see the detail and your options — including a free resubmission if eligible, and our 100% money-back guarantee for plan-eligible claims.\n\nMarco, our case manager, is available in the app if you'd like to talk through next steps.\n\nReference: ${claimId}\nView: ${dashboardUrl}`
    };
  },

  /* Sent when admin (or AI) flags a claim as needing one more document
     before it can be submitted (or after the carrier requests more info).
     docTypeNeeded is a short label shown in the body; safe values are
     vetted in the admin dashboard dropdown. The CTA deep-links to
     claim.html with action=upload so the patient lands on the right
     upload affordance.

     This is the ONLY template (besides welcome and the combined Stripe
     one) that fires automatically. Approved/paid/denied/refunded all
     stay manual triggers from the admin dashboard while we operate
     with fax-only submission and lack real-time carrier callbacks. */
  needMoreDocs({ firstName, claimId, docTypeNeeded, docDescription }) {
    const what = docTypeNeeded || 'an additional document';
    const why  = docDescription
      ? `<p style="margin:0 0 12px;">Why we need it: ${docDescription}</p>`
      : '';
    return {
      subject: `Action needed — please upload ${what} · ${claimId}`,
      html: shell({
        subject: `Action needed — please upload ${what} · ${claimId}`,
        preheader: `We need ${what} to keep your claim moving.`,
        statusLabel: 'Action needed',
        headline: 'One more thing.',
        subhead: `To keep your claim on track, we need ${what} from you. It only takes a minute to upload.`,
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p>${why}<p style="margin:0;">Click the button below to upload directly. Your claim stays paused until we receive it — once it's in, we resume immediately and you don't have to do anything else.</p>`,
        claimId,
        ctaLabel: `Upload ${what}`,
        ctaUrl: `${APP_BASE}/claim.html?id=${encodeURIComponent(claimId)}&action=upload`,
        helperText: "Reply to this email if you're not sure what we need or why — we'll walk you through it.",
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nTo keep your claim on track, we need ${what} from you.${docDescription ? `\n\nWhy: ${docDescription}` : ''}\n\nUpload here: ${APP_BASE}/claim.html?id=${encodeURIComponent(claimId)}&action=upload\n\nReference: ${claimId}\n\nReply to this email if you're not sure what we need.`
    };
  },

  refundIssued({ firstName, claimId, amountUsd }) {
    const amt = amountUsd ? `$${amountUsd}` : 'your fee';
    return {
      subject: `Money-back refund processed · ${claimId}`,
      html: shell({
        subject: `Money-back refund processed · ${claimId}`,
        preheader: 'Your money-back refund has been processed.',
        statusLabel: 'Money-back',
        headline: 'Your money-back refund is on the way.',
        subhead: "Per our 100% money-back guarantee, we've processed your refund.",
        amount: amt,
        amountLabel: 'Refund amount',
        bodyText: `<p style="margin:0 0 12px;">${greet(firstName)}</p><p style="margin:0;">It will appear in the original payment method within 5–10 business days. No further action is needed on your end.</p>`,
        claimId,
        ctaLabel: 'View claim',
        ctaUrl: dashboardUrl,
        helperText: "Thank you for trusting us. We hope to help with your next claim — and get it through.",
        unsubToken: claimId
      }),
      text:
        `${greet(firstName)}\n\nPer our 100% money-back guarantee, we've issued a refund of ${amt}. It will appear in the original payment method within 5–10 business days.\n\nReference: ${claimId}`
    };
  }
};

export function buildEmail(eventType, data) {
  const t = templates[eventType];
  if (!t) throw new Error(`Unknown email template: ${eventType}`);
  return t(data || {});
}

// Map claim status to template name. Used by the claims Lambda when
// admin updates a claim status. Returns null if no email should be
// sent for that transition.
//
// 'submitted' intentionally returns null: the patient already received
// the combined "payment received + filed" email from the Stripe webhook
// at the moment of payment. Re-emailing them when the claim is
// internally marked "submitted" would be duplicate noise.
//
// 'in-review' is auto-fired 24h after payment by the EventBridge
// Scheduler set up in the Stripe webhook — but is also still valid as
// an admin-triggered transition (e.g., "carrier acknowledged early").
//
// 'needs-docs' is the new active touchpoint for back-and-forth with
// the patient when admin (or AI) flags missing documentation.
//
// 'refunded' is the Credimed-side fee refund (money-back guarantee
// processed). It's a terminal state: the claim journey is over and
// we've returned the patient's fee. Insurer-side 'paid' is different
// — that's when the insurer reimbursed the patient, which is the
// happy-path success state.
export function templateForStatus(status) {
  return {
    'submitted':   null,
    'in-review':   'statusInReview',
    'needs-docs':  'needMoreDocs',
    'approved':    'statusApproved',
    'paid':        'statusPaid',
    'denied':      'statusDenied',
    'refunded':    'refundIssued'
  }[status] || null;
}
