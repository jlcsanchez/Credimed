/**
 * ADA J430D PDF generator.
 *
 * Loads the blank ADA form (templates/ada-j430d-2024.pdf) and draws
 * claim data on top using pdf-lib. Returns a Uint8Array suitable
 * for S3 PutObject or attaching to a fax bundle.
 *
 * The blank PDF has no AcroForm fields (it's a flat sample), so we
 * use page.drawText() at coordinates from ada-coordinates.js. The
 * field map is the only place that needs fine-tuning if the layout
 * shifts in a future ADA form revision.
 *
 * No PHI leaves this module — input is the already-decrypted claim
 * object; output is the binary PDF.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FIELDS, formatAdaDate } from './ada-coordinates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const BLANK_FORM_PATH = join(__dirname, 'templates', 'ada-j430d-2024.pdf');

let cachedTemplate = null;
async function loadBlankForm() {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await readFile(BLANK_FORM_PATH);
  return cachedTemplate;
}

/**
 * Generate a filled ADA J430D PDF for a single claim.
 *
 * @param {object} claim - decrypted claim object with the schema
 *   produced by credimed-claims.lambda decryptItem(). Required:
 *     firstName, lastName, dob, gender, memberId, insurer
 *   Used if present:
 *     groupNumber, employer, addrStreet, addrCity, addrState, addrZip,
 *     procedures (array), provider* fields, signature
 * @returns {Promise<Uint8Array>} the filled PDF bytes
 */
export async function generateAdaPdf(claim) {
  const blank = await loadBlankForm();
  const pdf = await PDFDocument.load(blank);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  // Helper: draw text at a coordinate spec (from ada-coordinates.js).
  const drawAt = (spec, text, opts = {}) => {
    if (text == null || text === '') return;
    const page = pages[spec.page];
    if (!page) return;
    const f = opts.bold ? fontBold : font;
    const align = opts.align || spec.align || 'left';
    const size = spec.size || 9;
    let x = spec.x;
    if (align === 'right') {
      const w = f.widthOfTextAtSize(String(text), size);
      x = spec.x - w;
    }
    page.drawText(String(text), {
      x, y: spec.y, size, font: f, color: rgb(0, 0, 0)
    });
  };

  // Helper: draw a checkmark at a coordinate spec.
  const checkAt = (spec) => {
    if (!spec) return;
    const page = pages[spec.page];
    if (!page) return;
    page.drawText('X', {
      x: spec.x, y: spec.y, size: spec.size || 10,
      font: fontBold, color: rgb(0, 0, 0)
    });
  };

  // ── Header
  checkAt(FIELDS.txnTypeStatement);

  // ── Insurer block (box 3)
  drawAt(FIELDS.insurerName, claim.insurer);
  // Address comes from carrier-fax-numbers.json (has displayName + address);
  // skipped here — bundle Lambda handles carrier metadata.

  // ── Subscriber block (boxes 12-17)
  const fullName = [claim.lastName, claim.firstName].filter(Boolean).join(', ');
  drawAt(FIELDS.subscriberName, fullName);

  const addr = [claim.addrStreet, claim.addrApt].filter(Boolean).join(' ');
  if (addr) drawAt(FIELDS.subscriberAddress, addr);

  const cityStateZip = [
    claim.addrCity,
    [claim.addrState, claim.addrZip].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');
  if (cityStateZip) drawAt(FIELDS.subscriberCityStateZip, cityStateZip);

  drawAt(FIELDS.subscriberDob, formatAdaDate(claim.dob));
  if (claim.gender === 'M') checkAt(FIELDS.subscriberGenderM);
  else if (claim.gender === 'F') checkAt(FIELDS.subscriberGenderF);
  drawAt(FIELDS.subscriberId, claim.memberId);
  drawAt(FIELDS.subscriberGroup, claim.groupNumber);
  drawAt(FIELDS.subscriberEmployer, claim.employer);

  // ── Relationship (box 18)
  // Default to "Self" since most patients are the subscriber.
  // claim.relationship can override: 'self' | 'spouse' | 'child' | 'other'
  const rel = (claim.relationship || 'self').toLowerCase();
  if (rel === 'self')   checkAt(FIELDS.relationshipSelf);
  if (rel === 'spouse') checkAt(FIELDS.relationshipSpouse);
  if (rel === 'child')  checkAt(FIELDS.relationshipChild);
  if (rel === 'other')  checkAt(FIELDS.relationshipOther);

  // ── Procedure rows (box 24+, repeated)
  const procs = Array.isArray(claim.procedures) ? claim.procedures
              : Array.isArray(claim.proceduresList) ? claim.proceduresList
              : [];
  let totalFee = 0;
  procs.slice(0, 10).forEach((p, i) => {
    const y = FIELDS.procedureRowYStart - (i * FIELDS.procedureRowHeight);
    const cols = FIELDS.procedureColumns;
    const page0 = pages[0];

    // procedures may be [{cdtCode, amount, toothNumber, ...}] OR plain strings
    const proc = (typeof p === 'string') ? { description: p } : p;

    if (proc.dateOfService || claim.dateOfService) {
      page0.drawText(formatAdaDate(proc.dateOfService || claim.dateOfService), {
        x: cols.procDate.x, y, size: cols.procDate.size, font, color: rgb(0,0,0)
      });
    }
    if (proc.toothNumber) {
      page0.drawText(String(proc.toothNumber), {
        x: cols.toothNumber.x, y, size: cols.toothNumber.size, font, color: rgb(0,0,0)
      });
    }
    if (proc.surfaces) {
      page0.drawText(String(proc.surfaces), {
        x: cols.toothSurface.x, y, size: cols.toothSurface.size, font, color: rgb(0,0,0)
      });
    }
    if (proc.cdtCode) {
      page0.drawText(String(proc.cdtCode), {
        x: cols.cdtCode.x, y, size: cols.cdtCode.size, font, color: rgb(0,0,0)
      });
    }
    if (proc.description) {
      page0.drawText(String(proc.description), {
        x: cols.description.x, y, size: cols.description.size, font, color: rgb(0,0,0)
      });
    }
    if (proc.amount != null) {
      const feeStr = `$${Number(proc.amount).toFixed(2)}`;
      const w = font.widthOfTextAtSize(feeStr, cols.fee.size);
      page0.drawText(feeStr, {
        x: cols.fee.x - w, y, size: cols.fee.size, font, color: rgb(0,0,0)
      });
      totalFee += Number(proc.amount);
    }
  });

  // ── Total fee (box 33)
  if (totalFee > 0) {
    drawAt(FIELDS.totalFee, `$${totalFee.toFixed(2)}`, { align: 'right', bold: true });
  } else if (claim.amount) {
    drawAt(FIELDS.totalFee, `$${Number(claim.amount).toFixed(2)}`, { align: 'right', bold: true });
  }

  // ── Patient signature (box 38)
  // claim.signature.adaDataUrl is a base64 PNG data URL captured by
  // agreement.html. Embed it as a small image inside the signature box.
  if (claim.signature?.adaDataUrl) {
    try {
      const m = String(claim.signature.adaDataUrl).match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        const png = await pdf.embedPng(Buffer.from(m[1], 'base64'));
        const box = FIELDS.patientSignatureBox;
        const dims = png.scaleToFit(box.width, box.height);
        pages[box.page].drawImage(png, {
          x: box.x,
          y: box.y,
          width: dims.width,
          height: dims.height
        });
      }
    } catch (err) {
      console.warn('[ada-pdf-generator] signature embed failed:', err.message);
    }
  }
  drawAt(FIELDS.patientSignatureDate, formatAdaDate(claim.submittedAt || new Date().toISOString()));

  // ── Page 2: billing dentist (Mexican clinic)
  drawAt(FIELDS.billingDentistName,           claim.providerName);
  drawAt(FIELDS.billingDentistAddress,        claim.providerAddress);
  drawAt(FIELDS.billingDentistCityStateZip,
    [claim.providerCity, claim.providerState, claim.providerZip].filter(Boolean).join(', '));
  drawAt(FIELDS.billingDentistPhone,          claim.providerPhone);
  drawAt(FIELDS.billingDentistTaxId,          claim.providerRFC || claim.providerTaxId);

  // Treating dentist defaults to same as billing for single-clinic claims.
  drawAt(FIELDS.treatingDentistName,           claim.treatingDentistName || claim.providerName);
  drawAt(FIELDS.treatingDentistAddress,        claim.providerAddress);
  drawAt(FIELDS.treatingDentistCityStateZip,
    [claim.providerCity, claim.providerState, claim.providerZip].filter(Boolean).join(', '));
  drawAt(FIELDS.treatingDentistTaxId,          claim.providerRFC || claim.providerTaxId);

  return pdf.save();
}
