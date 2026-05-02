/**
 * ADA J430D field coordinate map
 *
 * The blank ADA J430D 2024 PDF (templates/ada-j430d-2024.pdf) is a flat
 * document — no AcroForm fields. We render text on top using pdf-lib's
 * `page.drawText()` at calculated (x, y) positions in PDF user units
 * (1 unit = 1/72 inch). PDF coordinate origin is BOTTOM-LEFT.
 *
 * ## How to update a coordinate
 *
 * 1. Generate a sample PDF (`npm test` in this folder).
 * 2. Open the PDF, look at where the text landed vs where the field is.
 * 3. Adjust x or y by ~5-10 units at a time.
 * 4. Re-run.
 *
 * Page 1 is 612×792 (US Letter). All these are page 1.
 *
 * ## Initial values
 *
 * These positions are best-guess approximations from the 2024 form
 * layout. Several will need fine-tuning the first time you generate
 * a real claim and visually inspect — that's expected. The coordinates
 * file is the only place to edit; the generator stays unchanged.
 */

export const PAGE_HEIGHT = 792;

// Helper: y from top (more intuitive than y from bottom)
const top = (yFromTop) => PAGE_HEIGHT - yFromTop;

export const FIELDS = {
  // ─── Header / transaction type ─────────────────────────────────
  // Box "Statement of Actual Services" checkbox
  txnTypeStatement: { page: 0, x: 71, y: top(94), size: 12, type: 'checkmark' },

  // ─── Box 3: Insurance company name & address ───────────────────
  insurerName:     { page: 0, x: 50, y: top(150), size: 9 },
  insurerAddress1: { page: 0, x: 50, y: top(162), size: 9 },
  insurerCityStateZip: { page: 0, x: 50, y: top(174), size: 9 },

  // ─── Box 12-15: Subscriber / policyholder ──────────────────────
  subscriberName:    { page: 0, x: 50, y: top(290), size: 9 },
  subscriberAddress: { page: 0, x: 50, y: top(305), size: 9 },
  subscriberCityStateZip: { page: 0, x: 50, y: top(320), size: 9 },
  subscriberDob:     { page: 0, x: 50, y: top(345), size: 9 },     // box 13: MM/DD/YYYY
  subscriberGenderM: { page: 0, x: 200, y: top(345), size: 9, type: 'checkmark' }, // box 14
  subscriberGenderF: { page: 0, x: 235, y: top(345), size: 9, type: 'checkmark' },
  subscriberId:      { page: 0, x: 270, y: top(345), size: 9 },    // box 15: member ID
  subscriberGroup:   { page: 0, x: 410, y: top(345), size: 9 },    // box 16
  subscriberEmployer: { page: 0, x: 50, y: top(360), size: 9 },    // box 17

  // ─── Box 18: Relationship of patient to subscriber ─────────────
  relationshipSelf:    { page: 0, x: 50, y: top(385), size: 9, type: 'checkmark' },
  relationshipSpouse:  { page: 0, x: 100, y: top(385), size: 9, type: 'checkmark' },
  relationshipChild:   { page: 0, x: 150, y: top(385), size: 9, type: 'checkmark' },
  relationshipOther:   { page: 0, x: 200, y: top(385), size: 9, type: 'checkmark' },

  // ─── Box 24-32: Procedure lines (1-10, repeated row) ───────────
  // Each procedure row is ~16 units tall, starting around y=top(530).
  // The generator iterates and offsets by `procedureRowHeight`.
  procedureRowYStart: top(530),
  procedureRowHeight: 16,
  procedureColumns: {
    procDate:    { x: 50,  size: 8 },   // box 24
    areaOfMouth: { x: 105, size: 8 },   // box 25
    toothSystem: { x: 130, size: 8 },   // box 26
    toothNumber: { x: 155, size: 8 },   // box 27
    toothSurface:{ x: 195, size: 8 },   // box 28
    cdtCode:     { x: 235, size: 8 },   // box 29 (procedure code)
    diagnosis:   { x: 290, size: 8 },   // box 29a
    description: { x: 335, size: 8 },   // box 30
    fee:         { x: 530, size: 8, align: 'right' }   // box 31
  },

  // ─── Box 33: Total fee ─────────────────────────────────────────
  totalFee: { page: 0, x: 530, y: top(700), size: 10, align: 'right' },

  // ─── Box 38-41: Signatures ─────────────────────────────────────
  // Patient signature image goes here (drawn from base64 data URL)
  patientSignatureBox: { page: 0, x: 50, y: top(745), width: 240, height: 30 },
  patientSignatureDate: { page: 0, x: 300, y: top(755), size: 9 },

  // ─── Page 2 — billing dentist (Mexican clinic) ─────────────────
  // Per the architecture doc: the foreign dentist goes here, not Credimed.
  billingDentistName:    { page: 1, x: 50, y: top(120), size: 9 },
  billingDentistAddress: { page: 1, x: 50, y: top(135), size: 9 },
  billingDentistCityStateZip: { page: 1, x: 50, y: top(150), size: 9 },
  billingDentistPhone:   { page: 1, x: 350, y: top(150), size: 9 },
  // NPI is intentionally blank for Mexican clinics; Tax ID = RFC.
  billingDentistTaxId:   { page: 1, x: 50, y: top(180), size: 9 },

  // ─── Treating dentist (same clinic typically) ──────────────────
  treatingDentistName:    { page: 1, x: 50, y: top(220), size: 9 },
  treatingDentistAddress: { page: 1, x: 50, y: top(235), size: 9 },
  treatingDentistCityStateZip: { page: 1, x: 50, y: top(250), size: 9 },
  treatingDentistTaxId:   { page: 1, x: 50, y: top(280), size: 9 }
};

// Common date formatting for ADA fields (MM/DD/YYYY).
export function formatAdaDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}
