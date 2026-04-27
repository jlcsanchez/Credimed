/**
 * EDI 835 — Health Care Claim Payment / Advice parser (X12 005010X221A1)
 *
 * The 835 is the electronic remittance advice (ERA). The payer sends it
 * after they've adjudicated and paid (or denied) a batch of claims. It
 * tells us, per claim:
 *   - How much was charged
 *   - How much was allowed
 *   - How much was paid
 *   - Patient responsibility (deductible, coinsurance, copay)
 *   - Adjustment reasons for any differences
 *
 * For Credimed, this is the source of truth for "did the patient get
 * reimbursed" — which drives our money-back guarantee determination.
 *
 * Structure:
 *   ISA / GS / ST*835*N
 *   BPR — Beginning Payment (total payment amount, payment method ACH/CHK)
 *   TRN*1*<EFT trace number>
 *   CUR*PR*USD            (currency)
 *   REF*EV*<receiver ID>
 *   DTM*405*<production date>
 *   1000A — Payer
 *     N1*PR*<payer name>
 *     N3 / N4 / REF / PER
 *   1000B — Payee (us, the billing service)
 *     N1*PE*CREDIMED INC*XX*<NPI>
 *     N3 / N4 / REF
 *   2000 loop — Header (per claim batch)
 *     LX*1
 *   2100 loop — Claim Payment (one per claim)
 *     CLP*<patient claim ID>*<status>*<charge>*<paid>*<patientResp>*<filingCode>*<payerClaimId>
 *     CAS*<groupCode>*<reasonCode>*<amount>...   (adjustments, repeating)
 *     NM1*QC*1*<patient last>*<patient first>
 *     NM1*82*2*<rendering provider>
 *     DTM*232 / 233 — service from / to dates
 *     2110 — Service Payment (per procedure)
 *       SVC*HC|<cdt>**<billed>*<paid>*<rev>*<units>
 *       DTM*472*<service date>
 *       CAS*<groupCode>*<reasonCode>*<amount>...
 *       AMT — supplemental amount
 *       REF — supplemental reference
 *     PLB — provider-level adjustments (offsets, refunds)
 *
 * Reference: ASC X12N 835 Health Care Claim Payment/Advice, version 005010X221A1.
 */

"use strict";

/**
 * Parse an 835 EDI string and return a structured remittance summary.
 *
 * @param {string} ediText  raw 835 file content
 * @returns {object} {
 *   interchangeControlNumber, payment: { method, totalPaid, paymentDate, eftTraceNumber },
 *   payer: { name, id, address }, payee: { name, npi, taxId },
 *   claims: [{ patientClaimId, status, totalCharge, totalPaid, patientResponsibility,
 *              payerClaimId, patient: {...}, adjustments: [...], services: [...] }]
 * }
 */
function parse835(ediText) {
  if (!ediText || typeof ediText !== "string") {
    throw new Error("parse835: input must be a non-empty EDI string");
  }

  const segments = ediText
    .split(/[~\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result = {
    interchangeControlNumber: null,
    payment: {
      method: null,            // BPR04: ACH / CHK / NON / etc.
      totalPaid: null,         // BPR02
      paymentDate: null,       // BPR16
      eftTraceNumber: null,    // TRN02
    },
    payer: { name: null, id: null, address: null, contact: null },
    payee: { name: null, npi: null, taxId: null, address: null },
    claims: [],
    providerAdjustments: [],   // PLB segments — clawbacks, refunds, etc.
  };

  let currentN1 = null;        // "PR" (payer) or "PE" (payee)
  let currentClaim = null;     // current 2100 loop claim
  let currentService = null;   // current 2110 loop service line

  for (const seg of segments) {
    const fields = seg.split("*");
    const tag = fields[0];

    switch (tag) {
      case "ISA":
        result.interchangeControlNumber = fields[13] || null;
        break;

      case "BPR":
        // BPR*<creditDebit>*<paymentAmount>*<creditDebitFlag>*<paymentMethod>*...*<paymentDate>
        result.payment.totalPaid = parseFloat(fields[2]) || 0;
        result.payment.method = fields[4] || null;
        result.payment.paymentDate = fields[16] || null;   // BPR16: YYYYMMDD
        break;

      case "TRN":
        // TRN*1*<EFT trace number>*<originating company ID>
        if (fields[1] === "1") {
          result.payment.eftTraceNumber = fields[2] || null;
        }
        break;

      case "N1":
        // N1*<entityIdCode>*<name>*<idQualifier>*<idCode>
        currentN1 = fields[1] || null;
        if (currentN1 === "PR") {
          result.payer.name = fields[2] || null;
          result.payer.id = fields[4] || null;
        } else if (currentN1 === "PE") {
          result.payee.name = fields[2] || null;
          // Payee may be identified by NPI (XX) or other qualifier
          if (fields[3] === "XX") result.payee.npi = fields[4] || null;
        }
        break;

      case "REF":
        // REF*<qualifier>*<ref id>
        if (currentN1 === "PE" && fields[1] === "TJ") {
          result.payee.taxId = fields[2] || null;   // EIN
        }
        if (currentClaim && fields[1] === "F8") {
          // F8 = original reference number — payer's claim ID
          currentClaim.payerClaimId = currentClaim.payerClaimId || fields[2];
        }
        break;

      case "CLP": {
        // Open a new claim record.
        // CLP*<patientClaimId>*<status>*<totalCharge>*<totalPaid>*<patientResp>*<filingCode>*<payerClaimId>*<facilityType>*<freqCode>
        currentClaim = {
          patientClaimId: fields[1] || null,
          status: parseInt(fields[2], 10) || null,
          statusDescription: describeClaimStatus(parseInt(fields[2], 10)),
          totalCharge: parseFloat(fields[3]) || 0,
          totalPaid: parseFloat(fields[4]) || 0,
          patientResponsibility: parseFloat(fields[5]) || 0,
          claimFilingIndicator: fields[6] || null,
          payerClaimId: fields[7] || null,
          patient: { lastName: null, firstName: null, memberId: null },
          renderingProvider: { name: null, npi: null },
          serviceDateFrom: null,
          serviceDateTo: null,
          adjustments: [],
          services: [],
        };
        result.claims.push(currentClaim);
        currentService = null;
        break;
      }

      case "NM1":
        if (!currentClaim) break;
        if (fields[1] === "QC") {
          currentClaim.patient.lastName = fields[3] || null;
          currentClaim.patient.firstName = fields[4] || null;
          currentClaim.patient.memberId = fields[9] || null;
        } else if (fields[1] === "82" || fields[1] === "1P") {
          currentClaim.renderingProvider.name = fields[3] || null;
          currentClaim.renderingProvider.npi = fields[9] || null;
        }
        break;

      case "DTM":
        // DTM*<qualifier>*<YYYYMMDD>
        if (currentClaim && (fields[1] === "232" || fields[1] === "233")) {
          if (fields[1] === "232") currentClaim.serviceDateFrom = fields[2] || null;
          if (fields[1] === "233") currentClaim.serviceDateTo = fields[2] || null;
        }
        if (currentService && fields[1] === "472") {
          currentService.serviceDate = fields[2] || null;
        }
        break;

      case "CAS": {
        // Claim or Service Adjustment.
        // CAS*<groupCode>*<reasonCode1>*<amount1>*<units1>*<reasonCode2>*<amount2>*<units2>...
        // groupCode: CO (contractual), PR (patient responsibility), OA (other), PI (payer initiated), CR (correction)
        const groupCode = fields[1] || null;
        const adjustments = [];
        // Each adjustment is a triplet starting at field 2 (reason, amount, units)
        for (let i = 2; i < fields.length; i += 3) {
          if (!fields[i]) break;
          adjustments.push({
            groupCode,
            groupDescription: describeAdjustmentGroup(groupCode),
            reasonCode: fields[i] || null,
            reasonDescription: describeAdjustmentReason(fields[i]),
            amount: parseFloat(fields[i + 1]) || 0,
            quantity: fields[i + 2] ? parseFloat(fields[i + 2]) : null,
          });
        }
        if (currentService) {
          currentService.adjustments.push(...adjustments);
        } else if (currentClaim) {
          currentClaim.adjustments.push(...adjustments);
        }
        break;
      }

      case "SVC": {
        // SVC*<procedureIdComposite>**<chargeAmount>*<paidAmount>*<revCode>*<units>
        // The procedure ID composite is HC:CDT-CODE for dental
        const procComposite = (fields[1] || "").split(":");
        currentService = {
          procedureIdQualifier: procComposite[0] || null,
          procedureCode: procComposite[1] || null,
          chargeAmount: parseFloat(fields[2]) || 0,
          paidAmount: parseFloat(fields[3]) || 0,
          revenueCode: fields[5] || null,
          units: parseFloat(fields[5]) || 1,
          serviceDate: null,
          adjustments: [],
        };
        if (currentClaim) currentClaim.services.push(currentService);
        break;
      }

      case "PLB": {
        // PLB*<providerId>*<fiscalPeriodDate>*<adjustmentReasonComposite>*<adjustmentAmount>...
        // Provider-level adjustment (clawback, refund, etc.). These are NOT
        // tied to a specific claim — they affect the overall payment.
        const composite = (fields[3] || "").split(":");
        result.providerAdjustments.push({
          providerId: fields[1] || null,
          fiscalPeriodDate: fields[2] || null,
          reasonCode: composite[0] || null,
          referenceId: composite[1] || null,
          amount: parseFloat(fields[4]) || 0,
        });
        break;
      }

      default:
        break;
    }
  }

  // Sanity check / convenience field
  result.totalClaims = result.claims.length;
  result.totalApprovedAmount = result.claims.reduce((sum, c) => sum + (c.totalPaid || 0), 0);

  return result;
}

// ---------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------

const CLAIM_STATUS_CODES = {
  1:  "Processed as primary",
  2:  "Processed as secondary",
  3:  "Processed as tertiary",
  4:  "Denied",
  5:  "Pended",
  10: "Received, not yet adjudicated",
  19: "Processed as primary, forwarded to additional payer",
  20: "Processed as secondary, forwarded to additional payer",
  22: "Reversal of previous payment",
  23: "Not our claim, forwarded to another payer",
  25: "Predetermination pricing only — no payment",
};
function describeClaimStatus(code) {
  return CLAIM_STATUS_CODES[code] || `Status code ${code}`;
}

const ADJUSTMENT_GROUPS = {
  CO: "Contractual obligation",
  CR: "Correction or reversal",
  OA: "Other adjustments",
  PI: "Payer-initiated reduction",
  PR: "Patient responsibility (deductible, coinsurance, etc.)",
};
function describeAdjustmentGroup(code) {
  return ADJUSTMENT_GROUPS[code] || `Group ${code}`;
}

// CARC — Claim Adjustment Reason Codes. Most common dental reasons.
const ADJUSTMENT_REASONS = {
  "1":   "Deductible amount",
  "2":   "Coinsurance amount",
  "3":   "Co-payment amount",
  "29":  "Time limit for filing has expired",
  "45":  "Charge exceeds fee schedule / maximum allowable",
  "50":  "These are non-covered services",
  "96":  "Non-covered charge(s)",
  "97":  "Payment is included in the allowance for another service",
  "109": "Claim/service not covered by this payer/contractor",
  "119": "Benefit maximum has been reached",
  "125": "Submission/billing error",
  "131": "Claim specific negotiated discount",
  "151": "Payment adjusted because the payer deems the information submitted does not support this many/frequency of services",
  "204": "This service is not covered under the patient's current benefit plan",
  "227": "Information requested from the billing/rendering provider was not provided or was insufficient/incomplete",
  "B7":  "This provider was not certified/eligible to be paid for this procedure/service on this date of service",
  "P22": "Payment adjusted based on Voluntary Provider network",
};
function describeAdjustmentReason(code) {
  return ADJUSTMENT_REASONS[code] || `Reason ${code}`;
}

/**
 * Helper for the money-back guarantee determination. Returns true if the
 * payer denied the claim outright (status 4) AND none of the adjustments
 * are "patient responsibility" adjustments (which would mean it WAS
 * adjudicated, just to a $0 patient-paid amount).
 *
 * Used by the claims Lambda's status-update flow:
 *   if (was-paid-anything) { plan fee earned, no refund }
 *   else if (denied-but-fixable) { resubmit }
 *   else if (denied-outright) { refund per Service Agreement §2.3 }
 */
function isOutrightDenial(claim) {
  if (!claim) return false;
  if (claim.status !== 4) return false;
  if ((claim.totalPaid || 0) > 0) return false;
  // If the only adjustments are PR (patient responsibility), it WAS adjudicated
  const onlyPR = claim.adjustments.length > 0 &&
    claim.adjustments.every((a) => a.groupCode === "PR");
  return !onlyPR;
}

module.exports = { parse835, isOutrightDenial, describeClaimStatus, describeAdjustmentReason };
