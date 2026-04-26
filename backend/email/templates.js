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
 * Style: plain, no marketing fluff, no fancy HTML. Email clients
 * butcher modern CSS — keep it simple.
 */

const APP_BASE = 'https://www.credimed.us/app';
const SUPPORT_EMAIL = 'support@credimed.us';

function shellHtml(headline, bodyHtml, ctaLabel, ctaHref) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF6EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.05);">
        <tr><td style="padding-bottom:20px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;color:#0d9488;">CREDIMED</div>
        </td></tr>
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">${headline}</h1>
          ${bodyHtml}
          ${ctaHref ? `<p style="margin:24px 0 0;"><a href="${ctaHref}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${ctaLabel}</a></p>` : ''}
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #e2e8f0;margin-top:24px;">
          <p style="margin:24px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
            Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#0d9488;">${SUPPORT_EMAIL}</a>.<br>
            Credimed, Inc. &middot; <a href="${APP_BASE.replace('/app','')}/legal/privacy.html" style="color:#64748b;">Privacy</a> &middot; <a href="${APP_BASE.replace('/app','')}/legal/terms.html" style="color:#64748b;">Terms</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const templates = {
  claimSubmitted({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `We received your claim · ${claimId}`,
      html: shellHtml(
        'Your claim is in.',
        `<p>${greeting}</p>
         <p>We've received your claim and our team will start preparing it for submission to your insurer. You'll get an email each time the status changes.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nWe've received your claim and our team will start preparing it for submission to your insurer. You'll get an email each time the status changes.\n\nReference: ${claimId}\nView in app: ${APP_BASE}/dashboard.html\n\nQuestions? ${SUPPORT_EMAIL}`
    };
  },

  paymentReceived({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `Payment received · ${claimId}`,
      html: shellHtml(
        'Payment confirmed.',
        `<p>${greeting}</p>
         <p>We received your payment and your claim is locked in. We'll prepare it and submit it to your insurer within 24 hours.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nWe received your payment and your claim is locked in. We'll prepare it and submit it to your insurer within 24 hours.\n\nReference: ${claimId}\nView: ${APP_BASE}/dashboard.html`
    };
  },

  statusInReview({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `Your claim is in review · ${claimId}`,
      html: shellHtml(
        'Your claim is in review.',
        `<p>${greeting}</p>
         <p>Your insurer has acknowledged the claim and is reviewing it. Most reviews take 3–6 weeks. We'll email you the moment the status changes.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nYour insurer has acknowledged the claim and is reviewing it. Most reviews take 3–6 weeks. We'll email you the moment the status changes.\n\nReference: ${claimId}`
    };
  },

  statusApproved({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `Claim approved · ${claimId}`,
      html: shellHtml(
        'Your claim was approved.',
        `<p>${greeting}</p>
         <p>Your insurer approved your claim. They will issue payment to you directly. We'll let you know once the payment is on its way.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nYour insurer approved your claim. They will issue payment to you directly. We'll let you know once the payment is on its way.\n\nReference: ${claimId}`
    };
  },

  statusPaid({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `Refund issued · ${claimId}`,
      html: shellHtml(
        'Your refund is on the way.',
        `<p>${greeting}</p>
         <p>Your insurer has issued the reimbursement. Funds typically arrive in your account within 3–7 business days.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nYour insurer has issued the reimbursement. Funds typically arrive in your account within 3–7 business days.\n\nReference: ${claimId}`
    };
  },

  statusDenied({ firstName, claimId }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    return {
      subject: `Update on your claim · ${claimId}`,
      html: shellHtml(
        'Update on your claim.',
        `<p>${greeting}</p>
         <p>Your insurer has issued a decision on your claim. Please sign in to see the detail and your options — including a free resubmission if eligible, and our 100% money-back guarantee for plan-eligible claims.</p>
         <p>Marco, our case manager, is available in the app if you'd like to talk through next steps.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nYour insurer has issued a decision on your claim. Please sign in to see the detail and your options — including a free resubmission if eligible, and our 100% money-back guarantee for plan-eligible claims.\n\nMarco, our case manager, is available in the app if you'd like to talk through next steps.\n\nReference: ${claimId}\nView: ${APP_BASE}/dashboard.html`
    };
  },

  refundIssued({ firstName, claimId, amountUsd }) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const amt = amountUsd ? `$${amountUsd}` : 'your fee';
    return {
      subject: `Money-back refund processed · ${claimId}`,
      html: shellHtml(
        'Your money-back refund is on the way.',
        `<p>${greeting}</p>
         <p>Per our 100% money-back guarantee, we've issued a refund of ${amt}. It will appear in the original payment method within 5–10 business days.</p>
         <p style="font-size:13px;color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${claimId}</code></p>`,
        'View claim', `${APP_BASE}/dashboard.html`
      ),
      text:
        `${greeting}\n\nPer our 100% money-back guarantee, we've issued a refund of ${amt}. It will appear in the original payment method within 5–10 business days.\n\nReference: ${claimId}`
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
// 'refunded' is the Credimed-side fee refund (money-back guarantee
// processed). It's a terminal state: the claim journey is over and
// we've returned the patient's fee. Insurer-side 'paid' is different
// — that's when the insurer reimbursed the patient, which is the
// happy-path success state.
export function templateForStatus(status) {
  return {
    'submitted':  'claimSubmitted',
    'in-review':  'statusInReview',
    'approved':   'statusApproved',
    'paid':       'statusPaid',
    'denied':     'statusDenied',
    'refunded':   'refundIssued'
  }[status] || null;
}
