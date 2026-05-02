/**
 * POA (Power of Attorney) PDF generator.
 *
 * Status: STUB — counsel-authored POA template not yet committed to
 * the repo. Once `templates/poa-template.pdf` lands, replace
 * generatePoaPdf() with the same draw-text-on-template pattern as
 * ada-pdf-generator.js.
 *
 * Until then, this module returns a placeholder one-page PDF that
 * states the patient's intent in plain text. Carriers that strictly
 * require POA may reject; that's a known gap until counsel approves
 * the template.
 *
 * Authority granted (per the architecture doc):
 *   - Prepare and submit the dental insurance claim on the patient's
 *     behalf
 *   - Transmit by fax to the carrier
 *   - Receive status updates from the carrier on the patient's behalf
 *   - NO authority to receive funds (carrier pays patient directly)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generatePoaPdf(claim) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const drawLine = (text, opts = {}) => {
    page.drawText(text, {
      x: opts.x || 72,
      y,
      size: opts.size || 11,
      font: opts.bold ? fontBold : font,
      color: rgb(0, 0, 0)
    });
    y -= (opts.lineHeight || 18);
  };

  drawLine('LIMITED POWER OF ATTORNEY — PLACEHOLDER', { bold: true, size: 14, lineHeight: 28 });
  drawLine('THIS DOCUMENT IS A PLACEHOLDER PENDING COUNSEL REVIEW.', { bold: true, lineHeight: 24 });

  const fullName = [claim.firstName, claim.lastName].filter(Boolean).join(' ');
  drawLine(`Patient / Subscriber: ${fullName || '(unknown)'}`);
  drawLine(`Member ID: ${claim.memberId || '(unknown)'}`);
  drawLine(`Insurer: ${claim.insurer || '(unknown)'}`);
  drawLine(`Claim ID: ${claim.claimId || claim.id || '(unknown)'}`);
  drawLine(`Date: ${new Date().toISOString().slice(0, 10)}`);
  y -= 12;

  const body = [
    'I, the patient identified above, authorize Credimed LLC to act on my',
    'behalf for the limited purpose of preparing and submitting one (1)',
    'dental insurance claim to the carrier identified above, transmitting',
    'the claim package by fax, and receiving status updates from the',
    'carrier on my behalf.',
    '',
    'Credimed LLC is NOT authorized to receive insurance funds on my',
    'behalf. Reimbursement is to be paid directly to me by the carrier.',
    '',
    'This authorization is limited to the single claim referenced above',
    'and expires upon final adjudication of that claim.',
    '',
    '— SIGNATURE —'
  ];
  body.forEach(line => drawLine(line));

  // Embed signature image if available
  if (claim.signature?.poaDataUrl || claim.signature?.adaDataUrl) {
    const dataUrl = claim.signature.poaDataUrl || claim.signature.adaDataUrl;
    try {
      const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const dims = png.scaleToFit(240, 60);
        page.drawImage(png, { x: 72, y: y - 60, width: dims.width, height: dims.height });
      }
    } catch (err) {
      console.warn('[poa-pdf-generator] signature embed failed:', err.message);
    }
  }

  return pdf.save();
}
