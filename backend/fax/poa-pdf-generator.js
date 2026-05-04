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
 * Wording authored by counsel (May 2026 revision 3). Section structure:
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
 *       UETA — generic state reference, not pinned to Wyoming)
 *
 * Paragraphs are wrapped at draw time using actual Helvetica metrics
 * (not character count) so the body uses the full content width
 * regardless of glyph mix.
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
const CONTENT_W = M.right - M.left;        // 504px usable width
const BODY_SIZE = 9.5;
const BODY_LH   = 14;     // was 13 — extra 1px gives prose room to breathe
const PARA_GAP  = 8;      // additional gap between paragraphs (on top of BODY_LH)
const SEC_GAP   = 16;     // gap between sections (after the last paragraph)
const TITLE_GAP = 22;     // gap below a section title before the first paragraph

/* US-style human-readable date. Falls back to the input string if
   it doesn't parse as a date (e.g. "06/15/2024" stays unchanged). */
function fmtDate(input) {
  if (!input) return '—';
  const s = String(input);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

/* Word-wrap a paragraph to fit within `maxWidth` pixels, using the
   actual glyph widths of `font` at `size`. Never breaks mid-word.
   Returns an array of lines. */
function wrapPara(text, maxWidth, font, size) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    const trial = current ? current + ' ' + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
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

  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = M.top;
    drawHeader();
    drawFooter();
    /* Start content 76px below the very top — that's 48px below the
       header divider line at M.top - 28. The "LIMITED POWER OF
       ATTORNEY" title needs to sit visually distinct from the
       Credimed brand block above it; flush against the divider felt
       cramped, and even at 24px the brand and title still read as
       one cluster. 48px lets the title breathe as its own beat. */
    y = M.top - 76;
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
    page.drawText('Authorized representative contact for claim inquiries (Credimed LLC)', {
      x: M.left, y: fY - 4, size: 7.5, font: fontItalic, color: SLATE_500
    });
    page.drawText(`${ENTITY_ADDR_1}  ·  ${ENTITY_ADDR_2}`, {
      x: M.left, y: fY - 16, size: 8, font, color: SLATE_500
    });
    page.drawText(`${ENTITY_CONTACT}  ·  HIPAA-compliant`, {
      x: M.left, y: fY - 28, size: 8, font, color: SLATE_500
    });
    /* Claim ID stamp — bottom-right of every page so the carrier can
       cross-reference if the document gets separated from the bundle. */
    const stamp = `Claim ${claimId}`;
    const stampW = fontBold.widthOfTextAtSize(stamp, 8);
    page.drawText(stamp, {
      x: M.right - stampW, y: fY + 8, size: 8, font: fontBold, color: SLATE_900
    });
    const generatedHuman = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const subStamp = `Generated ${generatedHuman}`;
    page.drawText(subStamp, {
      x: M.right - font.widthOfTextAtSize(subStamp, 7),
      y: fY - 4, size: 7, font, color: SLATE_500
    });
  };

  /* Draw a paragraph (auto-wraps to CONTENT_W) and advance y by the
     total line height.
       opts.indent  — inset continuation lines (for (a)(b)(c)(d)
                      sub-items so wrapped lines align under the
                      first character of the item, not under "(a) ")
       opts.justify — distribute extra space between words so each
                      non-last line reaches the right margin (full
                      justification, like a printed legal doc).
                      Defaults to true for body prose. The LAST line
                      of any paragraph stays left-aligned because
                      justifying a half-empty last line creates ugly
                      word-spacing gaps. */
  const drawPara = (text, opts = {}) => {
    const size = opts.size || BODY_SIZE;
    const f    = opts.bold ? fontBold : (opts.italic ? fontItalic : font);
    const lh   = opts.lineHeight || BODY_LH;
    const color = opts.color || SLATE_900;
    const x = opts.x != null ? opts.x : M.left;
    const indent = opts.indent || 0;
    const maxWidth = opts.maxWidth != null ? opts.maxWidth : (CONTENT_W - (x - M.left));
    const justify = opts.justify !== false;
    if (text === '') { y -= PARA_GAP; return; }
    const lines = wrapPara(text, maxWidth, f, size);
    lines.forEach((line, idx) => {
      const lx = idx === 0 ? x : x + indent;
      const isLastLine = idx === lines.length - 1;
      const lineMaxWidth = idx === 0 ? maxWidth : (maxWidth - indent);
      if (justify && !isLastLine) {
        drawJustifiedLine(line, lx, y, lineMaxWidth, f, size, color);
      } else {
        page.drawText(line, { x: lx, y, size, font: f, color });
      }
      y -= lh;
    });
  };

  /* Draw a single line so its words are spaced out to fill maxWidth
     exactly (full justification). If the line has only one word, no
     justification is possible — draw it left-aligned. */
  const drawJustifiedLine = (line, startX, lineY, maxWidth, f, size, color) => {
    const words = line.split(' ').filter(Boolean);
    if (words.length <= 1) {
      page.drawText(line, { x: startX, y: lineY, size, font: f, color });
      return;
    }
    const wordWidths = words.map(w => f.widthOfTextAtSize(w, size));
    const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);
    const totalGap = maxWidth - totalWordWidth;
    const gapPerSpace = totalGap / (words.length - 1);
    /* Cap the gap at 3x the natural space width so a short line near
       the end of a paragraph doesn't blow out into huge inter-word
       gaps. If we hit the cap, fall back to left-aligned for that line. */
    const naturalSpace = f.widthOfTextAtSize(' ', size);
    if (gapPerSpace > naturalSpace * 3) {
      page.drawText(line, { x: startX, y: lineY, size, font: f, color });
      return;
    }
    let cursor = startX;
    words.forEach((w, i) => {
      page.drawText(w, { x: cursor, y: lineY, size, font: f, color });
      cursor += wordWidths[i] + gapPerSpace;
    });
  };

  const drawSectionTitle = (text) => {
    page.drawText(text, {
      x: M.left, y, size: 10, font: fontBold, color: TEAL
    });
    y -= TITLE_GAP;
  };

  const ensureSpace = (px) => {
    if (y - px < M.bottom) {
      /* Drop a "Signature required on following page" notice at the
         bottom of the current page so the patient (and carrier
         reviewer) understands the signature wasn't omitted, just
         placed past the page break. Only fires once per page.
         Sits ~22px above the footer divider for clear breathing
         room — fax/print rendering can crowd otherwise. */
      if (!page._sigNoticeDrawn) {
        page.drawText('Signature required on following page  >>', {
          x: M.left, y: M.bottom + 22, size: 10, font: fontItalic, color: TEAL
        });
        page._sigNoticeDrawn = true;
      }
      newPage();
    }
  };

  // ── Page 1 ─────────────────────────────────────────────────────
  newPage();

  // Title
  page.drawText('LIMITED POWER OF ATTORNEY', {
    x: M.left, y, size: 16, font: fontBold, color: SLATE_900
  });
  /* 22px gap (was 16): subtitle reads as a separate beat instead of
     sitting flush against the title baseline. */
  y -= 22;
  page.drawText('and HIPAA Authorization for Disclosure of Protected Health Information', {
    x: M.left, y, size: 10, font: fontItalic, color: SLATE_500
  });
  y -= 24;
  /* Header context lines — at-a-glance plain-language summary. */
  drawPara(
    "This document authorizes Credimed LLC to act as the patient's limited representative for the submission, processing, and follow-up of a dental insurance claim.",
    { size: 9, color: SLATE_500, lineHeight: 13 }
  );
  /* 8px between the two context lines (was 4) so the italic
     "Submission via fax authorized" reads as its own beat, not as a
     wrapped continuation of the previous sentence. */
  y -= 8;
  drawPara(
    'Submission via fax authorized.',
    { size: 9, italic: true, color: SLATE_500, lineHeight: 13 }
  );
  /* 22px gap (was 10) before the patient header block so the patient
     data feels visually distinct from the document title cluster. */
  y -= 22;

  // Patient + claim block (2 columns, 4 rows). Right column starts at
  // x=320 (was 280) so the second column extends further into the
  // available width and the page no longer feels left-heavy.
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
  y -= 42;
  drawKV('Patient ZIP Code',      patientZip, colLeft,  y);
  drawKV('Member ID',             memberId,   colRight, y);
  y -= 42;
  drawKV('Insurer / Payer Name',  insurer,    colLeft,  y);
  drawKV('Payer ID (if known)',   payerId,    colRight, y);
  y -= 42;
  drawKV('Date(s) of Service',    dateOfSvc,  colLeft,  y);
  y -= 42;

  // §1 — Limited grant of authority
  drawSectionTitle('1.  GRANT OF LIMITED AUTHORITY');

  drawPara(
    'I, the patient identified above, hereby appoint Credimed LLC, including its employees, contractors, and designated agents, as my limited representative for the sole purpose of preparing, submitting, and following up on a dental insurance claim associated with the treatment described in the documentation I provide to Credimed LLC.'
  );
  drawPara('');
  drawPara('In furtherance of this authorization, Credimed LLC may:');

  // (a)(b)(c)(d) sub-items — indented continuation lines
  const subItems = [
    '(a) prepare and submit the ADA Dental Claim Form on my behalf;',
    '(b) transmit the claim package by facsimile, mail, or electronic data interchange (EDI);',
    '(c) communicate with the insurer regarding the status, processing, or adjudication of this claim, including telephone inquiries; and',
    '(d) receive copies of correspondence (including Explanation of Benefits (EOBs) and remittance details), and request such documents on my behalf, related to this claim.'
  ];
  subItems.forEach(item => {
    drawPara(item, { x: M.left + 18, indent: 22, maxWidth: CONTENT_W - 18 });
  });
  drawPara('');
  drawPara(
    'Credimed LLC is not authorized, under any circumstance, to receive payment from the insurer on my behalf. All reimbursements shall be paid directly to me by the insurer.'
  );
  y -= SEC_GAP;

  // §2 — HIPAA Authorization (with initials placeholder on the right)
  ensureSpace(330);
  drawSectionTitle('2.  HIPAA AUTHORIZATION FOR DISCLOSURE OF PHI');
  /* Right-aligned initials placeholder on the same line as the title */
  const initialsLabel = 'Initials: ____';
  page.drawText(initialsLabel, {
    x: M.right - font.widthOfTextAtSize(initialsLabel, 9),
    y: y + 18, size: 9, font, color: SLATE_500
  });

  drawPara(
    'In accordance with 45 CFR §164.508, I authorize the insurer named above to disclose Protected Health Information (PHI) related to this claim to Credimed LLC, including its employees, contractors, and designated agents assisting in claim processing.'
  );
  drawPara('');
  drawPara(
    'The information disclosed may include claim status, EOBs, remittance details, and any communications related to the adjudication of this claim.'
  );
  drawPara('');
  drawPara(
    'Purpose of disclosure: The purpose of this authorization is to facilitate the processing, submission, and follow-up of the dental insurance claim described above.'
  );
  drawPara('');
  drawPara('This authorization is voluntary. I understand that:');

  // HIPAA bullet list
  const bullets = [
    'My treatment, payment, enrollment, or eligibility for benefits is not conditioned on signing this authorization.',
    'I may revoke this authorization in writing at any time by notifying the insurer and Credimed LLC, except to the extent that action has already been taken in reliance on it.',
    'I am entitled to receive a copy of this authorization upon request.',
    'Information disclosed pursuant to this authorization may be subject to redisclosure by the recipient and may no longer be protected under HIPAA.'
  ];
  bullets.forEach(b => {
    ensureSpace(40);
    drawPara('•  ' + b, { x: M.left + 16, indent: 14, maxWidth: CONTENT_W - 16 });
  });
  drawPara('');
  drawPara(
    'Disclosure is limited to the minimum necessary information required to process this claim. Credimed LLC agrees to maintain the confidentiality of PHI consistent with HIPAA safeguards and to use it solely for purposes of representing me in connection with this claim.'
  );
  y -= SEC_GAP;

  // §3 — Term, revocation, acknowledgement
  ensureSpace(120);
  drawSectionTitle('3.  TERM, REVOCATION, AND ACKNOWLEDGEMENT');

  drawPara(
    'This authorization is limited to a single dental insurance claim associated with the treatment described in my submitted documentation and shall automatically expire on the earlier of:'
  );
  drawPara('(a) final adjudication of the claim by the insurer; or', { x: M.left + 18, indent: 22, maxWidth: CONTENT_W - 18 });
  drawPara('(b) twelve (12) months from the date signed below.', { x: M.left + 18, indent: 22, maxWidth: CONTENT_W - 18 });
  drawPara('');
  drawPara(
    'I may revoke this authorization at any time by written notice to the insurer and to Credimed LLC. Revocation does not affect any actions taken prior to receipt of such notice.'
  );
  y -= SEC_GAP;

  // §4 — Electronic Communications Consent
  ensureSpace(70);
  drawSectionTitle('4.  ELECTRONIC COMMUNICATIONS CONSENT');

  drawPara(
    'I authorize communications related to this claim to occur via electronic means, including email, secure digital platforms, and other electronic communication methods used by Credimed LLC.'
  );
  y -= SEC_GAP;

  // §5 — Electronic Signature Acknowledgement
  ensureSpace(80);
  drawSectionTitle('5.  ELECTRONIC SIGNATURE ACKNOWLEDGEMENT');

  drawPara(
    'My electronic signature below constitutes my legal signature in accordance with 15 USC §7001 (Electronic Signatures in Global and National Commerce Act, "E-SIGN Act") and applicable state electronic transaction laws. My electronic signature has the same legal force and effect as a handwritten signature, and I intend to be bound by it.'
  );
  y -= 18;

  // ── Signature block ─────────────────────────────────────────────
  ensureSpace(150);
  const sigY = y;

  // Row 1: Patient signature (wider) + Date signed
  page.drawLine({
    start: { x: M.left, y: sigY },
    end:   { x: M.left + 290, y: sigY },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Patient signature', {
    x: M.left, y: sigY - 12, size: 8, font, color: SLATE_500
  });

  page.drawLine({
    start: { x: M.left + 320, y: sigY },
    end:   { x: M.right,      y: sigY },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Date signed', {
    x: M.left + 320, y: sigY - 12, size: 8, font, color: SLATE_500
  });
  page.drawText(today, {
    x: M.left + 320, y: sigY + 4, size: 11, font, color: SLATE_900
  });

  // Embed signature image if the patient signed on the canvas
  const dataUrl = claim.signature?.poaDataUrl || claim.signature?.adaDataUrl;
  if (dataUrl) {
    try {
      const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const dims = png.scaleToFit(240, 50);
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
    end:   { x: M.left + 290, y: sigY - 36 },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Printed name', {
    x: M.left, y: sigY - 48, size: 8, font, color: SLATE_500
  });
  page.drawText(fullName, {
    x: M.left, y: sigY - 32, size: 11, font, color: SLATE_900
  });

  page.drawLine({
    start: { x: M.left + 320, y: sigY - 36 },
    end:   { x: M.right,      y: sigY - 36 },
    thickness: 0.5, color: SLATE_900
  });
  page.drawText('Phone or Email', {
    x: M.left + 320, y: sigY - 48, size: 8, font, color: SLATE_500
  });
  if (phoneOrEmail) {
    page.drawText(phoneOrEmail, {
      x: M.left + 320, y: sigY - 32, size: 11, font, color: SLATE_900
    });
  }

  // Row 3: ZIP Code (auto-filled from patient profile)
  page.drawLine({
    start: { x: M.left, y: sigY - 72 },
    end:   { x: M.left + 290, y: sigY - 72 },
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
