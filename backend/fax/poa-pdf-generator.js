/**
 * POA (Power of Attorney) PDF generator.
 *
 * Generates a 2-page Limited Power of Attorney + HIPAA Authorization
 * + Electronic Communications Consent + Electronic Signature
 * Acknowledgement that the patient signs digitally on credimed.us
 * before their claim is submitted. The signed document travels in
 * the fax bundle alongside the ADA J430D so the carrier has the
 * patient's express authorization for Credimed to act on their
 * behalf.
 *
 * Wording authored by counsel (May 2026 revision 2). Section structure:
 *   §1  Limited grant of authority — file, transmit, follow up
 *       (incl. telephone), receive AND request correspondence;
 *       explicit "no funds, under any circumstance" exclusion
 *   §2  HIPAA authorization §164.508 with the required statutory
 *       elements: voluntariness, no conditioning, right to revoke,
 *       copy on request, redisclosure notice, minimum necessary,
 *       AND explicit purpose-of-disclosure statement
 *   §3  Term, revocation, acknowledgement (auto-expires on
 *       adjudication or 12 months, whichever first)
 *   §4  Electronic communications consent
 *   §5  Electronic signature acknowledgement (15 USC §7001 + state
 *       UETA — generic state reference, not pinned to Wyoming, so
 *       the same template works for cross-state members)
 *
 * If counsel ships their own PDF template, swap to the same draw-on-
 * template pattern used in ada-pdf-generator.js.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TEAL       = rgb(0.051, 0.580, 0.533); // #0D9488
const SLATE_900  = rgb(0.059, 0.090, 0.165); // #0F172A
const SLATE_500  = rgb(0.392, 0.451, 0.545); // #64748B
const SLATE_300  = rgb(0.796, 0.835, 0.882); // #CBD5E1

const ENTITY_NAME    = 'Credimed LLC';
const ENTITY_ADDR_1  = '30 N Gould St Ste N';
const ENTITY_ADDR_2  = 'Sheridan, WY 82801, United States';
const ENTITY_CONTACT = 'support@credimed.us  ·  Fax: (617) 749-4550';

const PAGE_W = 612;
const PAGE_H = 792;
const M = { left: 54, right: 558, top: 752, bottom: 80 };

/* US-style human-readable date. Falls back to the input string if
   it doesn't parse as a date (e.g. "06/15/2024" stays unchanged). */
function fmtDate(input) {
  if (!input) return '—';
  const s = String(input);
  // Already MM/DD/YYYY → return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // ISO YYYY-MM-DD → reformat
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

export async function generatePoaPdf(claim) {
  const pdf = await PDFDocument.create();
  const font       = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold   = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const fullName     = [claim.firstName, claim.lastName].filter(Boolean).join(' ').trim() || '—';
  const memberId     = claim.memberId || '—';
  const insurer      = claim.insurer  || '—';
  const claimId      = claim.claimId || claim.id || '—';
  const dob          = fmtDate(claim.dob);
  const dateOfSvc    = fmtDate(claim.dateOfService);
  const today        = fmtDate(new Date().toISOString().slice(0, 10));
  const patientZip   = claim.addrZip || '—';
  const payerId      = claim.payerId || '(not provided)';
  const phoneOrEmail = claim.phone || claim.email || '';

  // ── Page lifecycle helpers ──────────────────────────────────────
  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = M.top;
    drawHeader();
    drawFooter();
    y = M.top - 38;
  };

  const drawHeader = () => {
    page.drawCircle({ x: M.left + 14, y: M.top - 4, size: 14, color: TEAL });
    page.drawText('H', {
      x: M.left + 9, y: M.top - 9, size: 16, font: fontBold, color: rgb(1, 1, 1)
    });
    page.drawText(ENTITY_NAME, {
      x: M.left + 36, y: M.top - 2, size: 13, font: fontBold, color: SLATE_900
    });
    page.drawText('Cross-border dental insurance claim assistance', {
      x: M.left + 36, y: M.top - 16, size: 9, font: fontItalic, color: SLATE_500
    });
    page.drawLine({
      start: { x: M.left, y: M.top - 28 },
      end:   { x: M.right, y: M.top - 28 },
      thickness: 0.5, color: SLATE_300
    });
  };

  const drawFooter = () => {
    const fY = 56;
    page.drawLine({
      start: { x: M.left, y: fY + 22 },
      end:   { x: M.right, y: fY + 22 },
      thickness: 0.5, color: SLATE_300
    });
    page.drawText(ENTITY_NAME, {
      x: M.left, y: fY + 8, size: 8, font: fontBold, color: SLATE_900
    });
    page.drawText(`${ENTITY_ADDR_1}  ·  ${ENTITY_ADDR_2}`, {
      x: M.left, y: fY - 4, size: 8, font, color: SLATE_500
    });
    page.drawText(`${ENTITY_CONTACT}  ·  HIPAA-compliant`, {
      x: M.left, y: fY - 16, size: 8, font, color: SLATE_500
    });
    const stamp = `Claim ${claimId}  ·  Generated ${new Date().toISOString().slice(0, 19)}Z`;
    page.drawText(stamp, {
      x: M.right - font.widthOfTextAtSize(stamp, 7),
      y: fY - 28, size: 7, font, color: SLATE_500
    });
  };

  const drawText = (text, opts = {}) => {
    const size = opts.size || 9.5;
    const f    = opts.bold ? fontBold : (opts.italic ? fontItalic : font);
    const lh   = opts.lineHeight || 13;
    const color = opts.color || SLATE_900;
    page.drawText(text, { x: opts.x || M.left, y, size, font: f, color });
    y -= lh;
  };

  const ensureSpace = (px) => {
    if (y - px < M.bottom) newPage();
  };

  // ── Page 1 ─────────────────────────────────────────────────────
  newPage();

  // Title
  page.drawText('LIMITED POWER OF ATTORNEY', {
    x: M.left, y, size: 16, font: fontBold, color: SLATE_900
  });
  y -= 16;
  page.drawText('and HIPAA Authorization for Disclosure of Protected Health Information', {
    x: M.left, y, size: 10, font: fontItalic, color: SLATE_500
  });
  y -= 24;

  // Patient + claim block (2 columns, 4 rows)
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
  drawKV('Patient / Subscriber', fullName,    colLeft,  y);
  drawKV('Date of Birth',        dob,         colRight, y);
  y -= 30;
  drawKV('Patient Address (ZIP)', patientZip, colLeft,  y);
  drawKV('Member ID',             memberId,   colRight, y);
  y -= 30;
  drawKV('Insurer / Payer Name',  insurer,    colLeft,  y);
  drawKV('Payer ID (if known)',   payerId,    colRight, y);
  y -= 30;
  drawKV('Date(s) of Service',    dateOfSvc,  colLeft,  y);
  y -= 36;

  // §1 — Limited grant of authority
  drawText('1.  GRANT OF LIMITED AUTHORITY', { size: 10, bold: true, color: TEAL, lineHeight: 18 });

  [
    'I, the patient identified above, hereby appoint Credimed LLC, including its employees,',
    'contractors, and designated agents, as my limited representative for the sole purpose of',
    'preparing, submitting, and following up on a dental insurance claim associated with the',
    'treatment described in the documentation I provide to Credimed LLC.',
    '',
    'In furtherance of this authorization, Credimed LLC may:',
    '   (a) prepare and submit the ADA Dental Claim Form (J430D) on my behalf;',
    '   (b) transmit the claim package by facsimile, mail, or electronic data interchange (EDI);',
    '   (c) communicate with the insurer, including telephone inquiries, regarding the status,',
    '       processing, or adjudication of this claim; and',
    '   (d) receive copies of correspondence (including Explanation of Benefits (EOBs) and',
    '       remittance details), and request such documents on my behalf, related to this claim.',
    '',
    'Credimed LLC is not authorized, under any circumstance, to receive payment from the insurer',
    'on my behalf. All reimbursements shall be paid directly to me by the insurer.'
  ].forEach(line => drawText(line));
  y -= 6;

  // §2 — HIPAA Authorization (with initials placeholder on the right)
  ensureSpace(330);
  drawText('2.  HIPAA AUTHORIZATION FOR DISCLOSURE OF PHI', { size: 10, bold: true, color: TEAL, lineHeight: 18, x: M.left });
  // Initials placeholder, right-aligned on the same line
  const initialsLabel = 'Initials: ____';
  const initialsX = M.right - font.widthOfTextAtSize(initialsLabel, 9);
  page.drawText(initialsLabel, {
    x: initialsX, y: y + 18, size: 9, font, color: SLATE_500
  });

  [
    'In accordance with 45 CFR §164.508, I authorize the insurer named above to disclose',
    'Protected Health Information (PHI) related to this claim to Credimed LLC, including its',
    'employees, contractors, and designated agents assisting in claim processing.',
    '',
    'The information disclosed may include claim status, EOBs, remittance details, and any',
    'communications related to the adjudication of this claim.',
    '',
    'Purpose of disclosure: The purpose of this authorization is to facilitate the processing,',
    'submission, and follow-up of the dental insurance claim described above.',
    '',
    'This authorization is voluntary. I understand that:'
  ].forEach(line => drawText(line));

  // HIPAA bullet list — wrapped to fit
  const bullets = [
    'My treatment, payment, enrollment, or eligibility for benefits is not conditioned on signing this authorization.',
    'I may revoke this authorization in writing at any time by notifying the insurer and Credimed LLC, except to the extent that action has already been taken in reliance on it.',
    'I am entitled to receive a copy of this authorization upon request.',
    'Information disclosed pursuant to this authorization may be subject to redisclosure by the recipient and may no longer be protected under HIPAA.'
  ];
  bullets.forEach(b => {
    ensureSpace(40);
    const wrapped = wrapText(b, 92);
    wrapped.forEach((line, idx) => {
      const prefix = idx === 0 ? '   •  ' : '       ';
      drawText(prefix + line);
    });
  });
  y -= 6;

  ensureSpace(40);
  [
    'Disclosure is limited to the minimum necessary information required to process this',
    'claim. Credimed LLC agrees to maintain the confidentiality of PHI consistent with HIPAA',
    'safeguards and to use it solely for purposes of representing me in connection with this claim.'
  ].forEach(line => drawText(line));
  y -= 6;

  // §3 — Term, revocation, acknowledgement
  ensureSpace(120);
  drawText('3.  TERM, REVOCATION, AND ACKNOWLEDGEMENT', { size: 10, bold: true, color: TEAL, lineHeight: 18 });

  [
    'This authorization is limited to a single dental insurance claim associated with the treatment',
    'described in my submitted documentation and shall automatically expire on the earlier of:',
    '   (a) final adjudication of the claim by the insurer; or',
    '   (b) twelve (12) months from the date signed below.',
    '',
    'I may revoke this authorization at any time by written notice to the insurer and to Credimed',
    'LLC. Revocation does not affect any actions taken prior to receipt of such notice.'
  ].forEach(line => drawText(line));
  y -= 6;

  // §4 — Electronic Communications Consent
  ensureSpace(70);
  drawText('4.  ELECTRONIC COMMUNICATIONS CONSENT', { size: 10, bold: true, color: TEAL, lineHeight: 18 });

  [
    'I authorize communications related to this claim to occur via electronic means, including',
    'email, secure digital platforms, and other electronic communication methods used by',
    'Credimed LLC.'
  ].forEach(line => drawText(line));
  y -= 6;

  // §5 — Electronic Signature Acknowledgement
  ensureSpace(70);
  drawText('5.  ELECTRONIC SIGNATURE ACKNOWLEDGEMENT', { size: 10, bold: true, color: TEAL, lineHeight: 18 });

  [
    'My electronic signature below constitutes my legal signature in accordance with',
    '15 USC §7001 (Electronic Signatures in Global and National Commerce Act, "E-SIGN Act") and',
    'applicable state electronic transaction laws. My electronic signature has the same legal',
    'force and effect as a handwritten signature, and I intend to be bound by it.'
  ].forEach(line => drawText(line));
  y -= 18;

  // ── Signature block ─────────────────────────────────────────────
  ensureSpace(150);
  const sigY = y;

  // Row 1: Patient signature + Date signed
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
          x: M.left + 12, y: sigY + 2,
          width: dims.width, height: dims.height
        });
      }
    } catch (err) {
      console.warn('[poa-pdf-generator] signature embed failed:', err.message);
    }
  }

  // Row 2: Printed name + Phone or Email
  page.drawLine({
    start: { x: M.left, y: sigY - 36 },
    end:   { x: M.left + 240, y: sigY - 36 },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Printed name', {
    x: M.left, y: sigY - 48, size: 8, font, color: SLATE_500
  });
  page.drawText(fullName, {
    x: M.left, y: sigY - 32, size: 11, font, color: SLATE_900
  });

  page.drawLine({
    start: { x: M.left + 280, y: sigY - 36 },
    end:   { x: M.left + 480, y: sigY - 36 },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Phone or Email', {
    x: M.left + 280, y: sigY - 48, size: 8, font, color: SLATE_500
  });
  if (phoneOrEmail) {
    page.drawText(phoneOrEmail, {
      x: M.left + 280, y: sigY - 32, size: 11, font, color: SLATE_900
    });
  }

  // Row 3: ZIP Code (auto-filled from patient profile, also confirms identity)
  page.drawLine({
    start: { x: M.left, y: sigY - 72 },
    end:   { x: M.left + 240, y: sigY - 72 },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('ZIP Code', {
    x: M.left, y: sigY - 84, size: 8, font, color: SLATE_500
  });
  if (claim.addrZip) {
    page.drawText(String(claim.addrZip), {
      x: M.left, y: sigY - 68, size: 11, font, color: SLATE_900
    });
  }

  return pdf.save();
}

/* Hand-rolled word-wrap. Splits `text` into lines of at most `maxChars`
   characters, breaking on spaces, never mid-word. Returns the array of
   lines so the caller can drawText each one. */
function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) { current = w; continue; }
    if ((current + ' ' + w).length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}
