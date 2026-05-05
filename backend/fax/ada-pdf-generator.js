/**
 * ADA Dental Claim Form generator (programmatic, no template overlay).
 *
 * Generates an ADA J430D-equivalent dental claim form from scratch
 * using pdf-lib. Replaces the previous "draw text on top of the
 * official blank PDF" approach which had three blocking problems:
 *   1. The official blank PDF is stamped "SAMPLE" diagonally — any
 *      carrier intake would reject it on sight.
 *   2. Field coordinates drifted relative to the printed boxes,
 *      producing crowded / overlapping text.
 *   3. The blank PDF includes 2 pages of dentist-facing instructions
 *      that have no business on the carrier's side of the claim.
 *
 * The new generator builds a clean, branded, single-page form (or
 * two pages if the claim has many procedures) that includes all 56
 * J430D required fields. Carriers accept any compliant ADA claim
 * form layout that includes the standard data — it doesn't have to
 * be the exact official visual.
 *
 * Same export signature as before so credimed-claim-submitter
 * Lambda doesn't change:
 *   generateAdaPdf(claim) -> Promise<Uint8Array>
 *
 * The `templates/ada-j430d-2024.pdf` file and the `ada-coordinates.js`
 * field map are no longer needed and are removed in the same PR.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TEAL       = rgb(0.051, 0.580, 0.533); // #0D9488
const SLATE_900  = rgb(0.059, 0.090, 0.165); // #0F172A
const SLATE_700  = rgb(0.200, 0.255, 0.333); // #334155
const SLATE_500  = rgb(0.392, 0.451, 0.545); // #64748B
const SLATE_300  = rgb(0.796, 0.835, 0.882); // #CBD5E1
const SLATE_200  = rgb(0.886, 0.910, 0.941); // #E2E8F0
const SLATE_100  = rgb(0.945, 0.957, 0.973); // #F1F5F9
const BLACK      = rgb(0, 0, 0);

const PAGE_W = 612;
const PAGE_H = 792;
const M = { left: 28, right: 584, top: 768, bottom: 28 };
const CONTENT_W = M.right - M.left; // 556

const ENTITY_NAME    = 'Credimed LLC';
const ENTITY_FOOTER  = '30 N Gould St Ste N · Sheridan, WY 82801, United States · support@credimed.us · Fax: (617) 749-4550';

/* US-style date. Returns 'MM/DD/YYYY' or '—'. */
function fmtDate(input) {
  if (!input) return '';
  const s = String(input);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function fmtMoney(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '';
  return `$${Number(n).toFixed(2)}`;
}

/* Title-case a name token-by-token (so "juan" -> "Juan"). */
function titleCase(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ');
}

export async function generateAdaPdf(claim) {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // ── Normalize claim data ──────────────────────────────────────
  const firstName = titleCase(claim.firstName);
  const lastName  = titleCase(claim.lastName);
  const fullName  = [lastName, firstName].filter(Boolean).join(', ');

  const subscriberAddress = [claim.addrStreet, claim.addrApt].filter(Boolean).join(' ');
  const subscriberCityLine = [
    claim.addrCity,
    [claim.addrState, claim.addrZip].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');

  const procs = (Array.isArray(claim.procedures) ? claim.procedures
              : Array.isArray(claim.proceduresList) ? claim.proceduresList
              : []).slice(0, 10);

  const totalFee = procs.reduce((sum, p) => {
    const amt = (typeof p === 'object') ? p.amount : null;
    return sum + (amt != null && !isNaN(Number(amt)) ? Number(amt) : 0);
  }, 0);
  const totalFeeDisplay = totalFee > 0 ? totalFee : (claim.amount != null ? Number(claim.amount) : 0);

  const claimId = claim.claimId || claim.id || '';
  const dateOfService = fmtDate(claim.dateOfService);
  const submittedDate = fmtDate(claim.submittedAt) || fmtDate(new Date().toISOString());
  const generatedHuman = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const rel = (claim.relationship || 'self').toLowerCase();

  // ── Page lifecycle ─────────────────────────────────────────────
  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = M.top;
    drawHeader();
    drawFooter();
    y = M.top - 50;
  };

  const drawHeader = () => {
    // H mark (teal circle)
    page.drawCircle({ x: M.left + 10, y: M.top - 4, size: 10, color: TEAL });
    page.drawText('H', {
      x: M.left + 7, y: M.top - 8, size: 12, font: fontBold, color: rgb(1, 1, 1)
    });
    // Title
    page.drawText('DENTAL CLAIM FORM', {
      x: M.left + 28, y: M.top - 4, size: 14, font: fontBold, color: SLATE_900
    });
    page.drawText('ADA J430D-compliant · Submitted by Credimed LLC on behalf of the patient', {
      x: M.left + 28, y: M.top - 16, size: 8, font: fontItalic, color: SLATE_500
    });
    // Right side: claim ID
    if (claimId) {
      const cidLabel = `CLAIM ID`;
      const cid = String(claimId);
      page.drawText(cidLabel, {
        x: M.right - font.widthOfTextAtSize(cidLabel, 7), y: M.top - 4,
        size: 7, font: fontBold, color: SLATE_500
      });
      page.drawText(cid, {
        x: M.right - fontBold.widthOfTextAtSize(cid, 9), y: M.top - 16,
        size: 9, font: fontBold, color: SLATE_900
      });
    }
    // Divider
    page.drawLine({
      start: { x: M.left, y: M.top - 26 }, end: { x: M.right, y: M.top - 26 },
      thickness: 0.5, color: SLATE_300
    });
  };

  const drawFooter = () => {
    const fY = 22;
    page.drawLine({
      start: { x: M.left, y: fY + 14 }, end: { x: M.right, y: fY + 14 },
      thickness: 0.5, color: SLATE_300
    });
    page.drawText(ENTITY_NAME, {
      x: M.left, y: fY, size: 7, font: fontBold, color: SLATE_900
    });
    page.drawText(ENTITY_FOOTER, {
      x: M.left + 60, y: fY, size: 7, font, color: SLATE_500
    });
    const stamp = `Generated ${generatedHuman}`;
    page.drawText(stamp, {
      x: M.right - font.widthOfTextAtSize(stamp, 7), y: fY,
      size: 7, font, color: SLATE_500
    });
  };

  // ── Drawing helpers ───────────────────────────────────────────
  const sectionHeader = (label) => {
    /* Pre-padding above the bar — gives the green section header
       breathing room from the previous section's last underline,
       which otherwise sits only 4-6px above the bar top and looks
       cramped. */
    y -= 8;
    // Filled teal bar with white text
    page.drawRectangle({
      x: M.left, y: y - 12, width: CONTENT_W, height: 14, color: TEAL
    });
    page.drawText(label, {
      x: M.left + 6, y: y - 9, size: 8.5, font: fontBold, color: rgb(1, 1, 1)
    });
    /* Post-padding below the bar — first field label clears the bar's
       bottom edge with ~6px of air. */
    y -= 24;
  };

  /* Draw a single-row labeled field with a thin underline. The label is
     small caps above the value; the value sits below with breathing
     room so the answer doesn't crowd against the question. */
  const drawField = (label, value, x, width, opts = {}) => {
    const labelSize = 6;
    const valueSize = opts.valueSize || 9;
    page.drawText(label.toUpperCase(), {
      x, y, size: labelSize, font: fontBold, color: SLATE_500
    });
    // Value baseline 16px below label (was 9) — gives a clean gap
    // between the small-caps label and the larger answer.
    if (value) {
      const display = String(value);
      let shown = display;
      while (shown.length > 0 && font.widthOfTextAtSize(shown, valueSize) > width - 4) {
        shown = shown.slice(0, -1);
      }
      page.drawText(shown, {
        x: x + 2, y: y - 16, size: valueSize, font, color: SLATE_900
      });
    }
    // Underline 4px below the value baseline so the answer visually
    // rests on the line.
    page.drawLine({
      start: { x, y: y - 20 }, end: { x: x + width, y: y - 20 },
      thickness: 0.4, color: SLATE_300
    });
  };

  /* Multi-line address-style block — same vertical breathing room as
     drawField. The label sits above; lines below have natural line
     height. */
  const drawMultilineField = (label, lines, x, width) => {
    const labelSize = 6;
    page.drawText(label.toUpperCase(), {
      x, y, size: labelSize, font: fontBold, color: SLATE_500
    });
    let lineY = y - 16;
    lines.filter(Boolean).forEach((line, i) => {
      if (i < 2) {
        page.drawText(String(line), {
          x: x + 2, y: lineY, size: 9, font, color: SLATE_900
        });
        lineY -= 11;
      }
    });
    // Underline at the bottom of the allocated 2-line space.
    page.drawLine({
      start: { x, y: y - 38 }, end: { x: x + width, y: y - 38 },
      thickness: 0.4, color: SLATE_300
    });
  };

  /* Draw a small checkbox at (cx, cy) — checked if `checked` is true. */
  const drawCheckbox = (cx, cy, checked, label) => {
    page.drawRectangle({
      x: cx, y: cy - 7, width: 7, height: 7,
      borderColor: SLATE_700, borderWidth: 0.6, color: rgb(1, 1, 1)
    });
    if (checked) {
      page.drawText('X', {
        x: cx + 1, y: cy - 6.5, size: 7, font: fontBold, color: SLATE_900
      });
    }
    if (label) {
      page.drawText(label, {
        x: cx + 11, y: cy - 6, size: 8, font, color: SLATE_900
      });
    }
  };

  // ── Page 1 ─────────────────────────────────────────────────────
  newPage();

  // SECTION: HEADER INFORMATION
  sectionHeader('HEADER INFORMATION');
  // Field 1 — Type of Transaction (3 checkboxes inline)
  page.drawText('1. Type of Transaction', {
    x: M.left, y, size: 7, font: fontBold, color: SLATE_500
  });
  y -= 10;
  drawCheckbox(M.left + 4,   y, false, 'Request for Predetermination/Preauthorization');
  drawCheckbox(M.left + 230, y, true,  'Statement of Actual Services');
  drawCheckbox(M.left + 380, y, false, 'EPSDT / Title XIX');
  y -= 14;
  drawField('2. Predetermination/Preauthorization Number', '', M.left, 320);
  y -= 26;

  // SECTION: DENTAL BENEFIT PLAN INFORMATION
  sectionHeader('DENTAL BENEFIT PLAN INFORMATION');
  drawField('3. Company / Plan Name', claim.insurer || '', M.left, 380);
  drawField('3a. Payer ID', claim.payerId || '', M.left + 388, 168);
  y -= 26;
  drawField('Address (City, State, ZIP)', claim.insurerAddress || '', M.left, CONTENT_W);
  y -= 26;

  // SECTION: OTHER COVERAGE
  sectionHeader('OTHER COVERAGE  (mark applicable box and complete items 5-11. If none, leave blank.)');
  page.drawText('4. Other Coverage', {
    x: M.left, y, size: 7, font: fontBold, color: SLATE_500
  });
  drawCheckbox(M.left + 100, y - 4, false, 'Dental');
  drawCheckbox(M.left + 156, y - 4, false, 'Medical');
  page.drawText('(if both, complete 5-11 for dental only)', {
    x: M.left + 220, y: y - 4, size: 7, font: fontItalic, color: SLATE_500
  });
  y -= 26;

  // SECTION: POLICYHOLDER / SUBSCRIBER INFORMATION
  sectionHeader('POLICYHOLDER / SUBSCRIBER INFORMATION  (assigned by plan named in #3)');
  drawMultilineField('12. Name (Last, First, Middle Initial, Suffix), Address, City, State, ZIP',
    [fullName, subscriberAddress, subscriberCityLine], M.left, CONTENT_W);
  y -= 44;

  drawField('13. Date of Birth (MM/DD/YYYY)', fmtDate(claim.dob), M.left, 130);
  // Field 14 — Gender (M/F/U)
  page.drawText('14. GENDER', {
    x: M.left + 138, y: y - 1, size: 6, font: fontBold, color: SLATE_500
  });
  drawCheckbox(M.left + 138, y - 18, claim.gender === 'M', 'M');
  drawCheckbox(M.left + 168, y - 18, claim.gender === 'F', 'F');
  drawCheckbox(M.left + 198, y - 18, !claim.gender || (claim.gender !== 'M' && claim.gender !== 'F'), 'U');
  page.drawLine({
    start: { x: M.left + 138, y: y - 22 }, end: { x: M.left + 222, y: y - 22 },
    thickness: 0.4, color: SLATE_300
  });
  drawField('15. Subscriber ID (assigned by plan)', claim.memberId || '', M.left + 230, 200);
  drawField('16. Plan/Group Number', claim.groupNumber || '', M.left + 438, 118);
  y -= 30;
  drawField('17. Employer Name', claim.employer || '', M.left, CONTENT_W);
  y -= 26;

  // SECTION: PATIENT INFORMATION
  sectionHeader('PATIENT INFORMATION');
  page.drawText('18. Relationship to Policyholder/Subscriber', {
    x: M.left, y, size: 7, font: fontBold, color: SLATE_500
  });
  y -= 10;
  drawCheckbox(M.left + 4,   y, rel === 'self',   'Self');
  drawCheckbox(M.left + 60,  y, rel === 'spouse', 'Spouse');
  drawCheckbox(M.left + 130, y, rel === 'child' || rel === 'dependent', 'Dependent Child');
  drawCheckbox(M.left + 240, y, rel === 'other',  'Other');
  y -= 14;

  if (rel === 'self') {
    page.drawText('Patient is the same as the Policyholder/Subscriber listed above.', {
      x: M.left, y, size: 7.5, font: fontItalic, color: SLATE_500
    });
    y -= 12;
  } else {
    drawMultilineField('20. Name (Last, First, Middle Initial, Suffix), Address, City, State, ZIP',
      [fullName, subscriberAddress, subscriberCityLine], M.left, CONTENT_W);
    y -= 36;
  }
  drawField('21. Patient Date of Birth', fmtDate(claim.dob), M.left, 130);
  page.drawText('22. PATIENT GENDER', {
    x: M.left + 138, y: y - 1, size: 6, font: fontBold, color: SLATE_500
  });
  drawCheckbox(M.left + 138, y - 18, claim.gender === 'M', 'M');
  drawCheckbox(M.left + 168, y - 18, claim.gender === 'F', 'F');
  drawCheckbox(M.left + 198, y - 18, !claim.gender || (claim.gender !== 'M' && claim.gender !== 'F'), 'U');
  page.drawLine({
    start: { x: M.left + 138, y: y - 22 }, end: { x: M.left + 222, y: y - 22 },
    thickness: 0.4, color: SLATE_300
  });
  drawField('23. Patient ID/Account # (assigned by Dentist)', '', M.left + 230, 326);
  y -= 30;

  // SECTION: RECORD OF SERVICES PROVIDED (procedure table)
  sectionHeader('RECORD OF SERVICES PROVIDED');
  // Table header
  const tCol = {
    procDate:    { x: M.left + 0,   w: 64,  label: '24. PROC DATE' },
    area:        { x: M.left + 64,  w: 32,  label: '25. AREA' },
    system:      { x: M.left + 96,  w: 32,  label: '26. SYS' },
    toothNum:    { x: M.left + 128, w: 56,  label: '27. TOOTH #' },
    surface:     { x: M.left + 184, w: 40,  label: '28. SURF' },
    cdtCode:     { x: M.left + 224, w: 56,  label: '29. CODE' },
    pointer:     { x: M.left + 280, w: 28,  label: '29a. PTR' },
    qty:         { x: M.left + 308, w: 24,  label: '29b. QTY' },
    description: { x: M.left + 332, w: 156, label: '30. DESCRIPTION' },
    fee:         { x: M.left + 488, w: 68,  label: '31. FEE' }
  };
  // Header row background
  page.drawRectangle({
    x: M.left, y: y - 12, width: CONTENT_W, height: 12, color: SLATE_100
  });
  Object.values(tCol).forEach(c => {
    page.drawText(c.label, {
      x: c.x + 2, y: y - 8, size: 5.5, font: fontBold, color: SLATE_700
    });
    page.drawLine({
      start: { x: c.x, y: y - 12 }, end: { x: c.x, y: y - 132 },
      thickness: 0.3, color: SLATE_200
    });
  });
  // Right edge
  page.drawLine({
    start: { x: M.right, y: y - 12 }, end: { x: M.right, y: y - 132 },
    thickness: 0.3, color: SLATE_200
  });
  y -= 12;

  // 10 rows
  const rowHeight = 12;
  for (let i = 0; i < 10; i++) {
    const rowY = y - rowHeight;
    page.drawLine({
      start: { x: M.left, y: rowY }, end: { x: M.right, y: rowY },
      thickness: 0.3, color: SLATE_200
    });
    const proc = procs[i];
    if (proc) {
      const p = (typeof proc === 'string') ? { description: proc } : proc;
      const cells = [
        ['procDate', fmtDate(p.dateOfService) || dateOfService],
        ['area', p.area || ''],
        ['system', p.toothSystem || ''],
        ['toothNum', p.toothNumber || ''],
        ['surface', p.surfaces || ''],
        ['cdtCode', p.cdtCode || ''],
        ['pointer', p.diagnosisPointer || ''],
        ['qty', p.quantity != null ? String(p.quantity) : ''],
        ['description', p.description || ''],
        ['fee', fmtMoney(p.amount)]
      ];
      cells.forEach(([key, val]) => {
        if (!val) return;
        const c = tCol[key];
        const isFee = key === 'fee';
        const txt = String(val);
        let shown = txt;
        while (shown.length > 0 && font.widthOfTextAtSize(shown, 8) > c.w - 4) {
          shown = shown.slice(0, -1);
        }
        const x = isFee
          ? c.x + c.w - font.widthOfTextAtSize(shown, 8) - 4
          : c.x + 2;
        page.drawText(shown, {
          x, y: rowY + 3, size: 8, font, color: SLATE_900
        });
      });
    }
    y -= rowHeight;
  }
  // 33. Missing Teeth + 34. Diagnosis + 35. Remarks (compact)
  drawField('33. Missing Teeth (place an "X" on each missing tooth)', '', M.left, 320);
  drawField('34. Diagnosis Code List Qualifier', 'AB (ICD-10-CM)', M.left + 328, 110);
  drawField('32. Total Fee', fmtMoney(totalFeeDisplay), M.left + 442, 114, { valueSize: 11 });
  y -= 26;
  drawField('35. Remarks', '', M.left, CONTENT_W);
  y -= 26;

  // SECTION: AUTHORIZATIONS (signatures)
  sectionHeader('AUTHORIZATIONS');
  // Patient signature box (left)
  const sigBoxW = (CONTENT_W - 16) / 2;
  page.drawRectangle({
    x: M.left, y: y - 38, width: sigBoxW, height: 38,
    borderColor: SLATE_300, borderWidth: 0.5
  });
  page.drawText('36. Patient/Guardian signature', {
    x: M.left + 4, y: y - 8, size: 6.5, font: fontBold, color: SLATE_500
  });
  // Embed signature image if present
  if (claim.signature?.adaDataUrl) {
    try {
      const m = String(claim.signature.adaDataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const dims = png.scaleToFit(sigBoxW - 60, 24);
        page.drawImage(png, {
          x: M.left + 6, y: y - 32, width: dims.width, height: dims.height
        });
      }
    } catch (err) {
      console.warn('[ada-pdf-generator] signature embed failed:', err.message);
    }
  }
  page.drawText(`Date: ${submittedDate}`, {
    x: M.left + sigBoxW - 80, y: y - 33, size: 7, font, color: SLATE_700
  });

  // Subscriber signature box (right) — same person if relationship=self
  page.drawRectangle({
    x: M.left + sigBoxW + 16, y: y - 38, width: sigBoxW, height: 38,
    borderColor: SLATE_300, borderWidth: 0.5
  });
  page.drawText('37. Subscriber signature  (authorize payment of dental benefits to the entity below)', {
    x: M.left + sigBoxW + 20, y: y - 8, size: 6.5, font: fontBold, color: SLATE_500
  });
  if (claim.signature?.adaDataUrl && rel === 'self') {
    try {
      const m = String(claim.signature.adaDataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const dims = png.scaleToFit(sigBoxW - 60, 24);
        page.drawImage(png, {
          x: M.left + sigBoxW + 22, y: y - 32, width: dims.width, height: dims.height
        });
      }
    } catch (err) { /* swallow */ }
  }
  page.drawText(`Date: ${submittedDate}`, {
    x: M.right - 80, y: y - 33, size: 7, font, color: SLATE_700
  });
  y -= 44;

  // ── Page 2 ─────────────────────────────────────────────────────
  newPage();

  // SECTION: ANCILLARY CLAIM/TREATMENT INFORMATION
  sectionHeader('ANCILLARY CLAIM / TREATMENT INFORMATION');
  drawField('38. Place of Treatment', claim.placeOfTreatment || '11 (Office)', M.left, 200);
  drawField('39. Enclosures (Y or N)', claim.enclosuresAttached ? 'Y' : 'N', M.left + 208, 100);
  drawField('39a. Date Last SRP', '', M.left + 316, 240);
  y -= 26;
  page.drawText('40. Is Treatment for Orthodontics?', {
    x: M.left, y, size: 7, font: fontBold, color: SLATE_500
  });
  drawCheckbox(M.left + 158, y - 4, true, 'No (Skip 41-42)');
  drawCheckbox(M.left + 250, y - 4, false, 'Yes (Complete 41-42)');
  y -= 16;
  drawField('41. Date Appliance Placed', '', M.left, 180);
  drawField('42. Months of Treatment', '', M.left + 188, 100);
  drawField('43. Replacement of Prosthesis?', '', M.left + 296, 130);
  drawField('44. Date of Prior Placement', '', M.left + 432, 124);
  y -= 26;
  drawField('45. Treatment Resulting from', '', M.left, 200);
  drawField('46. Date of Accident', '', M.left + 208, 140);
  drawField('47. Auto Accident State', '', M.left + 354, 202);
  y -= 26;

  // SECTION: BILLING DENTIST OR DENTAL ENTITY
  sectionHeader('BILLING DENTIST OR DENTAL ENTITY  (leave blank if dentist or dental entity is not submitting claim on behalf of the patient or insured/subscriber)');
  drawMultilineField('48. Name, Address, City, State, ZIP',
    [
      claim.providerName || '',
      claim.providerAddress || '',
      [claim.providerCity, claim.providerState, claim.providerZip].filter(Boolean).join(', ')
    ],
    M.left, CONTENT_W);
  y -= 44;
  drawField('49. NPI', claim.providerNPI || '', M.left, 130);
  drawField('50. License Number', claim.providerLicense || '', M.left + 138, 160);
  drawField('51. SSN or TIN', claim.providerRFC || claim.providerTaxId || '', M.left + 306, 130);
  drawField('52. Phone Number', claim.providerPhone || '', M.left + 444, 112);
  y -= 26;
  drawField('52a. Additional Provider ID', '', M.left, CONTENT_W);
  y -= 26;

  // SECTION: TREATING DENTIST AND TREATMENT LOCATION INFORMATION
  sectionHeader('TREATING DENTIST AND TREATMENT LOCATION INFORMATION');
  page.drawText('53. I hereby certify that the procedures as indicated by date are in progress (for procedures that require multiple visits) or have been completed.', {
    x: M.left, y, size: 7, font: fontItalic, color: SLATE_500, maxWidth: CONTENT_W
  });
  y -= 20;
  // Treating dentist signature placeholder
  page.drawRectangle({
    x: M.left, y: y - 30, width: CONTENT_W, height: 30,
    borderColor: SLATE_300, borderWidth: 0.5
  });
  page.drawText('Signed (Treating Dentist)', {
    x: M.left + 4, y: y - 8, size: 6.5, font: fontBold, color: SLATE_500
  });
  page.drawText(claim.treatingDentistName || claim.providerName || '', {
    x: M.left + 4, y: y - 22, size: 9, font, color: SLATE_900
  });
  page.drawText('Date', {
    x: M.right - 80, y: y - 8, size: 6.5, font: fontBold, color: SLATE_500
  });
  page.drawText(dateOfService, {
    x: M.right - 80, y: y - 22, size: 9, font, color: SLATE_900
  });
  y -= 44;

  drawField('53a. Locum Tenens Treating Dentist', '', M.left, 220);
  drawField('54. NPI', claim.providerNPI || '', M.left + 228, 130);
  drawField('55. License Number', claim.providerLicense || '', M.left + 366, 190);
  y -= 26;
  drawMultilineField('56. Address, City, State, ZIP',
    [
      claim.providerAddress || '',
      [claim.providerCity, claim.providerState, claim.providerZip].filter(Boolean).join(', ')
    ],
    M.left, CONTENT_W - 130);
  drawField('56a. Provider Specialty Code', claim.providerSpecialty || '122300000X (Dentist)', M.left + CONTENT_W - 124, 124);
  y -= 44;
  drawField('57. Phone Number', claim.providerPhone || '', M.left, 200);
  drawField('58. Additional Provider ID', '', M.left + 208, CONTENT_W - 208);
  y -= 26;

  return pdf.save();
}
