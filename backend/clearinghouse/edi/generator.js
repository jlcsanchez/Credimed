/**
 * EDI 837D (Dental Claim) generator — X12 005010X224A2
 *
 * Takes a Credimed claim object and returns a valid X12 837D string ready
 * to submit to a clearinghouse (Availity in our case).
 *
 * Spec reference: ASC X12N 837 Health Care Claim: Dental, version 005010X224A2.
 * Free PDF on x12.org for the full spec; we implement only the segments
 * that Availity requires for an out-of-network dental claim filed by a
 * billing service on behalf of a subscriber/patient.
 *
 * IMPORTANT — this is a code-only generator. Before going to production:
 *   1. Run output through Availity's EDI validator (free in sandbox)
 *   2. Send 1-2 real test claims and compare against Availity's parsed view
 *   3. Sign Availity's Trading Partner Agreement (TPA)
 *   4. Enroll Credimed as a billing service with each payer (Aetna, Cigna, etc.)
 *
 * Field naming inside a segment:
 *   - Each field is delimited by * (asterisk)
 *   - Each segment ends with ~ (tilde)
 *   - Sub-fields delimited by : (colon)
 *   - Repeat values delimited by ^ (caret)
 *
 * We don't need to escape these inside data — we strip them at sanitize time.
 */

"use strict";

// ---------------------------------------------------------------
// Sanitizer — strip EDI control characters from any user-supplied
// string so they can't break our segment delimiters. Per X12 spec
// this is the submitter's responsibility.
// ---------------------------------------------------------------
function clean(s) {
  if (s == null) return "";
  return String(s)
    .replace(/[*~:^|]/g, " ")     // strip control chars
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim()
    .toUpperCase();                // X12 convention is upper-case
}

// Pad/truncate a numeric string to a fixed width with leading zeros.
function padNum(n, width) {
  return String(n).padStart(width, "0").slice(-width);
}

// EDI date helpers — X12 wants YYYYMMDD (D8) and HHMM.
function ediDate(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  return dt.getUTCFullYear().toString() +
         String(dt.getUTCMonth() + 1).padStart(2, "0") +
         String(dt.getUTCDate()).padStart(2, "0");
}
function ediTime(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  return String(dt.getUTCHours()).padStart(2, "0") +
         String(dt.getUTCMinutes()).padStart(2, "0");
}
function ediDateShort(d) {
  // ISA-09 wants YYMMDD (D6)
  return ediDate(d).slice(2);
}

// ---------------------------------------------------------------
// Segment builders — each returns one segment string.
// We compose them in one function to keep state (counters) local.
// ---------------------------------------------------------------

/**
 * Build a complete X12 837D interchange.
 *
 * @param {object} claim    — Credimed claim record (decrypted)
 * @param {object} options  — submitter/receiver IDs, control numbers
 * @returns {string} full EDI 837D interchange ending in IEA segment
 */
function generate837D(claim, options) {
  const {
    submitterId,           // Availity-issued (e.g., 'CRED01' once enrolled)
    submitterName  = "CREDIMED INC",
    submitterEIN,          // Credimed's federal EIN (Tax ID)
    submitterNPI,          // Credimed's Type 2 organizational NPI
    receiverId     = "030240928",   // Availity payer ID for clearinghouse
    receiverName   = "AVAILITY",
    interchangeControlNumber,        // unique 9-digit per ISA
    groupControlNumber,              // unique 9-digit per GS
    transactionSetControlNumber = "0001",
    usageIndicator = "P",            // P=production, T=test
  } = options || {};

  if (!submitterId)  throw new Error("submitterId required (Availity-issued)");
  if (!submitterEIN) throw new Error("submitterEIN required");
  if (!submitterNPI) throw new Error("submitterNPI required (Credimed Type 2 NPI)");

  // Validate claim has the fields we need
  const required = ["claimId", "firstName", "lastName", "dob", "memberId",
                    "insurer", "payerId", "procedures", "providerName"];
  for (const f of required) {
    if (claim[f] == null || claim[f] === "") {
      throw new Error(`claim.${f} required for EDI 837D`);
    }
  }
  if (!Array.isArray(claim.procedures) || claim.procedures.length === 0) {
    throw new Error("claim.procedures must be a non-empty array");
  }

  const now = new Date();
  const segments = [];
  let segCount = 0;
  const seg = (s) => { segments.push(s); segCount++; };

  // ---------------------------------------------------------------
  // ISA — Interchange Control Header
  // ---------------------------------------------------------------
  // ISA segment is FIXED-WIDTH — every field has a specific length.
  // This is the only segment in EDI where the spec mandates exact widths.
  const isa = [
    "ISA",
    "00",                                    // ISA01: Authorization Info Qualifier
    " ".repeat(10),                          // ISA02: 10 spaces
    "00",                                    // ISA03: Security Info Qualifier
    " ".repeat(10),                          // ISA04: 10 spaces
    "ZZ",                                    // ISA05: Sender ID Qualifier (mutually defined)
    submitterId.padEnd(15).slice(0, 15),     // ISA06: Sender ID (15 char)
    "ZZ",                                    // ISA07: Receiver ID Qualifier
    receiverId.padEnd(15).slice(0, 15),      // ISA08: Receiver ID (15 char)
    ediDateShort(now),                       // ISA09: YYMMDD
    ediTime(now),                            // ISA10: HHMM
    "^",                                     // ISA11: Repetition Separator
    "00501",                                 // ISA12: Version (005010)
    padNum(interchangeControlNumber, 9),     // ISA13: Interchange Control #
    "0",                                     // ISA14: Acknowledgment Requested (0=no)
    usageIndicator,                          // ISA15: P or T
    ":",                                     // ISA16: Component Element Separator
  ].join("*") + "~";
  segments.push(isa);

  // ---------------------------------------------------------------
  // GS — Functional Group Header
  // ---------------------------------------------------------------
  seg(`GS*HC*${submitterId}*${receiverId}*${ediDate(now)}*${ediTime(now)}*${groupControlNumber}*X*005010X224A2~`);

  // ---------------------------------------------------------------
  // ST — Transaction Set Header
  // ---------------------------------------------------------------
  // Reset segment count for the transaction (ST..SE pair). Set to 0 so
  // the seg() call below increments to 1 and ST is correctly counted as
  // segment #1 of the transaction. SE01 includes both ST and SE itself,
  // so when we emit SE we read segCount and add 1 (for SE).
  segCount = 0;
  seg(`ST*837*${transactionSetControlNumber}*005010X224A2~`);

  // ---------------------------------------------------------------
  // BHT — Beginning of Hierarchical Transaction
  // ---------------------------------------------------------------
  seg(`BHT*0019*00*${clean(claim.claimId).slice(0, 50)}*${ediDate(now)}*${ediTime(now)}*CH~`);

  // ---------------------------------------------------------------
  // 1000A loop — Submitter (Credimed)
  // ---------------------------------------------------------------
  seg(`NM1*41*2*${clean(submitterName)}*****46*${clean(submitterId)}~`);
  seg(`PER*IC*${clean(submitterName)}*TE*${clean(options.submitterPhone || "8005551212")}~`);

  // ---------------------------------------------------------------
  // 1000B loop — Receiver (Availity)
  // ---------------------------------------------------------------
  seg(`NM1*40*2*${clean(receiverName)}*****46*${clean(receiverId)}~`);

  // ---------------------------------------------------------------
  // 2000A loop — Billing Provider (Credimed as billing service)
  // HL*1 = top-level hierarchical level
  // ---------------------------------------------------------------
  seg(`HL*1**20*1~`);
  seg(`PRV*BI*PXC*${clean(options.taxonomyCode || "302F00000X")}~`);   // Dental billing taxonomy
  seg(`NM1*85*2*${clean(submitterName)}*****XX*${clean(submitterNPI)}~`);
  seg(`N3*${clean(options.submitterAddress1 || "123 MAIN ST")}~`);
  seg(`N4*${clean(options.submitterCity || "BOSTON")}*${clean(options.submitterState || "MA")}*${clean(options.submitterZip || "02101")}~`);
  seg(`REF*EI*${clean(submitterEIN)}~`);

  // ---------------------------------------------------------------
  // 2000B loop — Subscriber (the patient, since they're the policyholder)
  // HL*2*1 = under HL*1 (billing provider)
  // ---------------------------------------------------------------
  seg(`HL*2*1*22*0~`);
  // SBR*P=primary, 18=self (patient is the subscriber), CI=commercial
  const groupNum = clean(claim.groupNumber || "");
  seg(`SBR*P*18*${groupNum}****CI~`);

  // 2010BA — Subscriber demographics
  seg(`NM1*IL*1*${clean(claim.lastName)}*${clean(claim.firstName)}***MI*${clean(claim.memberId)}~`);
  if (claim.address1) {
    seg(`N3*${clean(claim.address1)}${claim.address2 ? "*" + clean(claim.address2) : ""}~`);
    seg(`N4*${clean(claim.city || "")}*${clean(claim.state || "")}*${clean(claim.zip || "")}~`);
  }
  seg(`DMG*D8*${ediDate(claim.dob)}*${clean(claim.gender || "U")}~`);

  // 2010BB — Payer (insurance company)
  seg(`NM1*PR*2*${clean(claim.insurer)}*****PI*${clean(claim.payerId)}~`);

  // ---------------------------------------------------------------
  // 2300 loop — Claim Information
  // ---------------------------------------------------------------
  // CLM01 = patient claim ID (our claimId)
  // CLM02 = total claim charge amount
  // CLM05 = "11:B:1" → place of service 11 (office), claim frequency 1 (original)
  //   For Mexico-foreign-provider claims, place of service can vary; 11 (office) is safe default.
  // CLM06 = Y/N provider signature on file
  // CLM07 = A (assignment of benefits)
  // CLM08 = Y release of information signed
  // CLM09 = Y patient signature source
  // CLM10 = N (special program code, blank)
  const totalCharge = (claim.procedures || []).reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2);
  seg(`CLM*${clean(claim.claimId)}*${totalCharge}***11:B:1*Y*A*Y*Y~`);

  // DTP*472 = date of service for the whole claim (if all procedures same date)
  if (claim.dateOfService) {
    seg(`DTP*472*D8*${ediDate(claim.dateOfService)}~`);
  }

  // REF*D9 = patient's claim reference (our internal claim ID)
  seg(`REF*D9*${clean(claim.claimId)}~`);

  // HI = diagnosis codes (optional for dental but Availity may want at least one)
  if (claim.diagnosisCode) {
    seg(`HI*ABK:${clean(claim.diagnosisCode)}~`);
  }

  // 2310B — Rendering Provider (the Mexican dentist)
  // NM1*82 = rendering provider; XX = NPI qualifier (Mexican dentists usually
  // don't have a US NPI — Availity accepts ZZ qualifier for non-NPI providers)
  const dentistNpiQual = claim.providerNPI ? "XX" : "ZZ";
  const dentistNpi = clean(claim.providerNPI || claim.providerRFC || "MX-PROVIDER");
  seg(`NM1*82*2*${clean(claim.providerName)}*****${dentistNpiQual}*${dentistNpi}~`);

  // PRV*PE = performing/rendering provider taxonomy
  seg(`PRV*PE*PXC*${clean(claim.providerTaxonomy || "1223G0001X")}~`);   // General dental practice

  // 2310B address
  if (claim.providerAddress) {
    seg(`N3*${clean(claim.providerAddress)}~`);
    seg(`N4*${clean(claim.providerCity || "TIJUANA")}*${clean(claim.providerState || "BC")}*${clean(claim.providerZip || "22000")}*MX~`);
  }

  // ---------------------------------------------------------------
  // 2400 loop — Service Lines (one LX/SV3 per procedure)
  // ---------------------------------------------------------------
  (claim.procedures || []).forEach((proc, i) => {
    seg(`LX*${i + 1}~`);
    // SV3*AD:CDT-CODE**AMOUNT
    // AD is the qualifier for ADA dental codes
    const cdt = clean(proc.cdtCode);
    const amt = Number(proc.amount || 0).toFixed(2);
    const toothCode = proc.toothCode ? `*${clean(proc.toothCode)}` : "";
    seg(`SV3*AD:${cdt}**${amt}${toothCode}~`);
    if (proc.dateOfService) {
      seg(`DTP*472*D8*${ediDate(proc.dateOfService)}~`);
    }
    if (proc.toothNumber) {
      seg(`TOO*JP*${clean(proc.toothNumber)}~`);
    }
  });

  // ---------------------------------------------------------------
  // SE — Transaction Set Trailer
  // ---------------------------------------------------------------
  // Total segments INCLUDING ST and SE itself
  const seSegmentCount = segCount + 1;
  seg(`SE*${seSegmentCount}*${transactionSetControlNumber}~`);

  // ---------------------------------------------------------------
  // GE — Functional Group Trailer (1 transaction set in this group)
  // ---------------------------------------------------------------
  seg(`GE*1*${groupControlNumber}~`);

  // ---------------------------------------------------------------
  // IEA — Interchange Control Trailer (1 functional group)
  // ---------------------------------------------------------------
  seg(`IEA*1*${padNum(interchangeControlNumber, 9)}~`);

  return segments.join("\n");
}

export { generate837D, clean, ediDate, ediTime };
