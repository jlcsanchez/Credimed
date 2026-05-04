/**
 * POA (Power of Attorney) PDF generator.
 *
 * Generates a one-page Limited Power of Attorney + HIPAA Authorization
 * that the patient signs digitally on credimed.us before their claim
 * is submitted. The signed POA travels in the fax bundle alongside the
 * ADA J430D so the carrier has the patient's express authorization for
 * Credimed to act on their behalf.
 *
 * Authority granted (Limited POA):
 *   - Prepare and submit ONE specific dental insurance claim
 *   - Transmit the claim package by fax / mail / EDI
 *   - Receive status updates from the carrier on the patient's behalf
 *   - Receive copies of carrier correspondence about this claim
 *   - NO authority to receive funds (carrier pays the patient directly)
 *
 * HIPAA Authorization (separate but on the same page):
 *   - Allows the carrier to disclose PHI about THIS claim to Credimed
 *   - Required because Credimed is acting as the patient's authorized
 *     representative and needs to receive EOBs / status updates
 *   - Limited to the specific claim referenced; expires on adjudication
 *
 * The generator is intentionally text-based (drawn programmatically
 * rather than from a PDF template) so the same code handles all
 * patients without needing a separate template file. If counsel later
 * provides a branded PDF template, swap to the same draw-on-template
 * pattern used in ada-pdf-generator.js.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TEAL = rgb(0.051, 0.580, 0.533);   // #0D9488
const SLATE_900 = rgb(0.059, 0.090, 0.165); // #0F172A
const SLATE_500 = rgb(0.392, 0.451, 0.545); // #64748B
const SLATE_300 = rgb(0.796, 0.835, 0.882); // #CBD5E1

const ENTITY_NAME = 'Credimed LLC';
const ENTITY_ADDR_1 = '30 N Gould St Ste N';
const ENTITY_ADDR_2 = 'Sheridan, WY 82801, United States';
const ENTITY_CONTACT = 'support@credimed.us  ·  Fax: (617) 749-4550';

export async function generatePoaPdf(claim) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const M = { left: 54, right: 558, top: 752 };
  let y = M.top;

  // ── Header — H mark + entity ────────────────────────────────────
  page.drawCircle({ x: M.left + 14, y: y - 4, size: 14, color: TEAL });
  page.drawText('H', {
    x: M.left + 9, y: y - 9, size: 16, font: fontBold, color: rgb(1, 1, 1)
  });
  page.drawText(ENTITY_NAME, {
    x: M.left + 36, y: y - 2, size: 13, font: fontBold, color: SLATE_900
  });
  page.drawText('Cross-border dental insurance claim assistance', {
    x: M.left + 36, y: y - 16, size: 9, font: fontItalic, color: SLATE_500
  });
  y -= 38;

  // Divider
  page.drawLine({
    start: { x: M.left, y },
    end:   { x: M.right, y },
    thickness: 0.5, color: SLATE_300
  });
  y -= 24;

  // ── Title ───────────────────────────────────────────────────────
  page.drawText('LIMITED POWER OF ATTORNEY', {
    x: M.left, y, size: 16, font: fontBold, color: SLATE_900
  });
  y -= 16;
  page.drawText('and HIPAA Authorization for Disclosure of Protected Health Information', {
    x: M.left, y, size: 10, font: fontItalic, color: SLATE_500
  });
  y -= 24;

  // ── Patient + claim block (2 columns) ───────────────────────────
  const fullName = [claim.firstName, claim.lastName].filter(Boolean).join(' ').trim() || '—';
  const memberId = claim.memberId || '—';
  const insurer  = claim.insurer  || '—';
  const claimId  = claim.claimId || claim.id || '—';
  const today    = new Date().toISOString().slice(0, 10);

  const drawKV = (label, value, x, yy) => {
    page.drawText(label.toUpperCase(), {
      x, y: yy, size: 7, font: fontBold, color: SLATE_500
    });
    page.drawText(String(value), {
      x, y: yy - 12, size: 11, font, color: SLATE_900
    });
  };

  const colLeft  = M.left;
  const colRight = M.left + 280;
  drawKV('Patient / Subscriber', fullName, colLeft,  y);
  drawKV('Date',                 today,    colRight, y);
  y -= 32;
  drawKV('Member ID',            memberId, colLeft,  y);
  drawKV('Insurer',              insurer,  colRight, y);
  y -= 32;
  drawKV('Claim reference',      claimId,  colLeft,  y);
  y -= 32;

  // Section 1 — Power of Attorney body
  page.drawText('1.  GRANT OF LIMITED AUTHORITY', {
    x: M.left, y, size: 10, font: fontBold, color: TEAL
  });
  y -= 18;

  const poaBody = [
    `I, the patient identified above, appoint ${ENTITY_NAME} as my limited`,
    'representative for the sole purpose of preparing, submitting, and following up on',
    'the single dental insurance claim referenced above with the insurer named above.',
    '',
    `In furtherance of this authorization, ${ENTITY_NAME} may: (a) prepare and submit`,
    'the ADA Dental Claim Form (J430D) on my behalf; (b) transmit the claim package',
    'by facsimile, mail, or electronic data interchange (EDI); (c) communicate with',
    'the insurer regarding the status, processing, or adjudication of this claim;',
    'and (d) receive copies of correspondence, Explanation of Benefits (EOBs), and',
    'other claim-related documents from the insurer on my behalf.',
    '',
    `${ENTITY_NAME} is NOT authorized to receive payment from the insurer on my`,
    'behalf. All reimbursement shall be paid directly to me by the insurer.'
  ];
  poaBody.forEach(line => {
    page.drawText(line, { x: M.left, y, size: 9.5, font, color: SLATE_900 });
    y -= 13;
  });
  y -= 6;

  // Section 2 — HIPAA authorization
  page.drawText('2.  HIPAA AUTHORIZATION FOR DISCLOSURE OF PHI', {
    x: M.left, y, size: 10, font: fontBold, color: TEAL
  });
  y -= 18;

  const hipaaBody = [
    'In accordance with 45 CFR §164.508, I authorize the insurer named above to',
    `disclose Protected Health Information (PHI) related to this specific claim to`,
    `${ENTITY_NAME}. The information disclosed may include claim status, EOBs,`,
    'remittance details, and any communications related to the adjudication of',
    'this claim.',
    '',
    'This authorization is voluntary and limited in scope. I understand that I may',
    'revoke it in writing at any time by notifying the insurer, except to the extent',
    `the insurer has already acted in reliance on it. ${ENTITY_NAME} agrees to`,
    'maintain the disclosed PHI consistent with HIPAA safeguards and to use it only',
    'for purposes of representing me in connection with this claim.'
  ];
  hipaaBody.forEach(line => {
    page.drawText(line, { x: M.left, y, size: 9.5, font, color: SLATE_900 });
    y -= 13;
  });
  y -= 6;

  // Section 3 — Term + revocation
  page.drawText('3.  TERM, REVOCATION, AND ACKNOWLEDGEMENT', {
    x: M.left, y, size: 10, font: fontBold, color: TEAL
  });
  y -= 18;

  const termBody = [
    'This authorization is limited to the single claim referenced above and',
    'automatically expires on the earlier of (a) final adjudication of the claim by',
    'the insurer, or (b) twelve (12) months from the date signed below. I may',
    'revoke this authorization at any time by written notice to the insurer and',
    `to ${ENTITY_NAME} at the contact information shown in the footer of this`,
    'document. Revocation does not invalidate any disclosures or actions already',
    'taken in reliance on this authorization.'
  ];
  termBody.forEach(line => {
    page.drawText(line, { x: M.left, y, size: 9.5, font, color: SLATE_900 });
    y -= 13;
  });
  y -= 16;

  // ── Signature block ─────────────────────────────────────────────
  const sigY = y;
  page.drawLine({
    start: { x: M.left, y: sigY },
    end:   { x: M.left + 240, y: sigY },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Patient signature', {
    x: M.left, y: sigY - 12, size: 8, font, color: SLATE_500
  });

  page.drawLine({
    start: { x: M.left + 280, y: sigY },
    end:   { x: M.left + 420, y: sigY },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Date signed', {
    x: M.left + 280, y: sigY - 12, size: 8, font, color: SLATE_500
  });
  page.drawText(today, {
    x: M.left + 280, y: sigY + 4, size: 11, font, color: SLATE_900
  });

  // Embed signature image if the patient signed on the canvas
  const dataUrl = claim.signature?.poaDataUrl || claim.signature?.adaDataUrl;
  if (dataUrl) {
    try {
      const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const dims = png.scaleToFit(200, 50);
        page.drawImage(png, {
          x: M.left + 12,
          y: sigY + 2,
          width: dims.width,
          height: dims.height
        });
      }
    } catch (err) {
      console.warn('[poa-pdf-generator] signature embed failed:', err.message);
    }
  }

  // Patient typed name (printed) below signature
  page.drawText(`Printed: ${fullName}`, {
    x: M.left, y: sigY - 26, size: 9, font, color: SLATE_900
  });

  // ── Footer ──────────────────────────────────────────────────────
  const footerY = 56;
  page.drawLine({
    start: { x: M.left, y: footerY + 22 },
    end:   { x: M.right, y: footerY + 22 },
    thickness: 0.5, color: SLATE_300
  });
  page.drawText(ENTITY_NAME, {
    x: M.left, y: footerY + 8, size: 8, font: fontBold, color: SLATE_900
  });
  page.drawText(`${ENTITY_ADDR_1}  ·  ${ENTITY_ADDR_2}`, {
    x: M.left, y: footerY - 4, size: 8, font, color: SLATE_500
  });
  page.drawText(ENTITY_CONTACT, {
    x: M.left, y: footerY - 16, size: 8, font, color: SLATE_500
  });

  // Page reference (claim ID + generated timestamp) for audit
  const stamp = `Claim ${claimId}  ·  Generated ${new Date().toISOString().slice(0, 19)}Z`;
  page.drawText(stamp, {
    x: M.right - font.widthOfTextAtSize(stamp, 7),
    y: footerY - 16, size: 7, font, color: SLATE_500
  });

  return pdf.save();
}
