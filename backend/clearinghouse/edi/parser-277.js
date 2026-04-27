/**
 * EDI 277 / 277CA — Claim Status / Claim Acknowledgment parser (X12 005010X214)
 *
 * The 277CA is what we get from Availity after the payer has reviewed our
 * 837D. It tells us where each individual claim sits in the payer's pipeline:
 * accepted, rejected, pending review, paid, etc. This is distinct from the
 * 999 (which only acks the EDI envelope itself).
 *
 * 277CA structure:
 *   ISA / GS / ST*277*N
 *   BHT*0085*08*<refId>
 *   2000A loop — Information Source (Availity)
 *     HL*1**20*1
 *     NM1*PR*2*<payer name>...
 *   2000B loop — Information Receiver (Credimed)
 *     HL*2*1*21*1
 *     NM1*41*2*CREDIMED INC*...
 *   2000C loop — Service Provider Tracking (per-provider HL group)
 *     HL*3*2*19*1
 *     NM1*1P*2*<provider>...
 *   2000D loop — Claim Status Tracking (per-claim HL group)
 *     HL*4*3*PT*0
 *     NM1*QC*1*<patient last>*<patient first>...
 *     2200D — Claim Status Information
 *       TRN*2*<our internal claim ID>
 *       STC*<category code>:<status code>:<entity code>*<status date>*<action>*<total charge>*<paid amount>
 *       REF*1K*<payer claim control number>  (the "claim ID" the payer assigned)
 *       DTP*472*D8*<date of service>
 *
 * Key fields to extract:
 *   - Per claim: status category code (A0-A8 acknowledgments, A1-A7 etc.)
 *   - Status code (specific reason)
 *   - Status date
 *   - Charge / paid amount
 *   - Payer claim ID (REF*1K)
 *
 * Reference: ASC X12N 277 Claim Status Notification, version 005010X214.
 */

"use strict";

/**
 * Parse a 277CA EDI string and return one object per claim with its current
 * status, payer claim ID, charge/paid amounts, and human-readable status.
 *
 * @param {string} ediText  raw 277 file content
 * @returns {object} { interchangeControlNumber, claims: [{ trackingId, payerClaimId, statusCategory, statusCode, statusDate, totalCharge, paidAmount, ...}] }
 */
function parse277(ediText) {
  if (!ediText || typeof ediText !== "string") {
    throw new Error("parse277: input must be a non-empty EDI string");
  }

  const segments = ediText
    .split(/[~\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result = {
    interchangeControlNumber: null,
    payer: null,
    receiver: null,
    claims: [],
  };

  // Track context as we descend the HL hierarchy
  let currentHL = null;       // "info_source" | "info_receiver" | "provider" | "patient_claim"
  let currentClaim = null;
  let currentLevel = 0;

  for (const seg of segments) {
    const fields = seg.split("*");
    const tag = fields[0];

    switch (tag) {
      case "ISA":
        result.interchangeControlNumber = fields[13] || null;
        break;

      case "HL": {
        // HL*<id>*<parentId>*<levelCode>*<childCode>
        const levelCode = fields[3] || "";
        switch (levelCode) {
          case "20": currentHL = "info_source"; break;     // payer / clearinghouse
          case "21": currentHL = "info_receiver"; break;    // submitter (us)
          case "19": currentHL = "provider"; break;         // billing provider
          case "PT": currentHL = "patient_claim"; break;    // patient + claim group
          default:   currentHL = "unknown_" + levelCode;
        }
        currentLevel++;

        if (currentHL === "patient_claim") {
          currentClaim = {
            patientLastName: null,
            patientFirstName: null,
            trackingId: null,           // our internal claim ID (TRN*2)
            payerClaimId: null,         // REF*1K — payer's assigned claim number
            statusCategory: null,       // STC component 1 (e.g., "A1")
            statusCode: null,           // STC component 2 (e.g., "20")
            entityCode: null,           // STC component 3 (e.g., "PR")
            statusDate: null,           // STC field 2
            actionCode: null,           // STC field 3
            totalCharge: null,
            paidAmount: null,
            statusDescription: null,    // human-readable
            dateOfService: null,
            rawStcSegments: [],
          };
          result.claims.push(currentClaim);
        }
        break;
      }

      case "NM1":
        // NM1*<entityIdCode>*<entityType>*<lastName>*<firstName>...
        if (currentHL === "info_source" && fields[1] === "PR") {
          result.payer = {
            name: fields[3] || null,
            id: fields[9] || null,
          };
        } else if (currentHL === "info_receiver" && fields[1] === "41") {
          result.receiver = {
            name: fields[3] || null,
            id: fields[9] || null,
          };
        } else if (currentHL === "patient_claim" && fields[1] === "QC" && currentClaim) {
          currentClaim.patientLastName = fields[3] || null;
          currentClaim.patientFirstName = fields[4] || null;
        }
        break;

      case "TRN":
        // TRN*2*<our claim ID>
        // Type 2 = referenced transaction trace number, which is what we sent
        // in BHT-03 of our original 837D.
        if (currentClaim && fields[1] === "2") {
          currentClaim.trackingId = fields[2] || null;
        }
        break;

      case "STC": {
        // STC*<categoryCode>:<statusCode>:<entityCode>*<statusDate>*<actionCode>*<totalCharge>*<paidAmount>
        // The first composite element has up to 3 sub-elements separated by ':'
        if (!currentClaim) break;
        const composite = (fields[1] || "").split(":");
        const stcRecord = {
          categoryCode: composite[0] || null,
          statusCode: composite[1] || null,
          entityCode: composite[2] || null,
          statusDate: fields[2] || null,
          actionCode: fields[3] || null,
          totalCharge: parseFloat(fields[4]) || null,
          paidAmount: parseFloat(fields[5]) || null,
        };
        currentClaim.rawStcSegments.push(stcRecord);

        // The first STC sets the canonical status. Subsequent STC segments
        // are typically additional reason codes.
        if (currentClaim.statusCategory == null) {
          currentClaim.statusCategory = stcRecord.categoryCode;
          currentClaim.statusCode = stcRecord.statusCode;
          currentClaim.entityCode = stcRecord.entityCode;
          currentClaim.statusDate = stcRecord.statusDate;
          currentClaim.actionCode = stcRecord.actionCode;
          currentClaim.totalCharge = stcRecord.totalCharge;
          currentClaim.paidAmount = stcRecord.paidAmount;
          currentClaim.statusDescription = describeStatus(
            stcRecord.categoryCode,
            stcRecord.statusCode
          );
        }
        break;
      }

      case "REF":
        // REF*1K*<payer claim control number>
        if (currentClaim && fields[1] === "1K") {
          currentClaim.payerClaimId = fields[2] || null;
        }
        break;

      case "DTP":
        // DTP*472*D8*<YYYYMMDD>  — date of service
        if (currentClaim && fields[1] === "472") {
          currentClaim.dateOfService = fields[3] || null;
        }
        break;

      default:
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------
// Status code lookups — the most common combinations Availity
// surfaces for dental claims. Full lists are at wpc-edi.com.
// ---------------------------------------------------------------

const CATEGORY_CODES = {
  "A0": "Acknowledgment / Forwarded",
  "A1": "Acknowledgment / Receipt — claim received but not yet processed",
  "A2": "Acknowledgment / Acceptance into adjudication system",
  "A3": "Acknowledgment / Returned as unprocessable claim",
  "A4": "Acknowledgment / Not found",
  "A5": "Acknowledgment / Split claim",
  "A6": "Acknowledgment / Rejected for missing information",
  "A7": "Acknowledgment / Rejected for invalid information",
  "A8": "Acknowledgment / Rejected for relational field error",
  "F0": "Finalized / Awaiting completion of services",
  "F1": "Finalized / Payment — the claim/line has been paid",
  "F2": "Finalized / Denial — services denied",
  "F3": "Finalized / Revised",
  "F3F": "Finalized / Forwarded to additional payer",
  "P0": "Pending / In process",
  "P1": "Pending / In review",
  "P2": "Pending / Provider requested information",
  "P3": "Pending / Payer review",
  "P4": "Pending / Awaiting additional information",
  "P5": "Pending / Payer administrative review",
  "R0": "Request / Reconsideration of claim",
};

// A small subset of status codes — there are hundreds. The handler can
// fall back to "code XX" if not in this table.
const STATUS_CODES = {
  "1":   "For more detailed information, see remittance advice",
  "20":  "Accepted for processing",
  "21":  "Missing or invalid information",
  "22":  "Reversal of previous payment",
  "65":  "Claim/line has been paid",
  "85":  "Claim has been rejected",
  "101": "Claim was processed as primary",
  "104": "Processed according to plan provisions",
  "116": "Claim submitted to wrong payer; resubmit to correct payer",
  "162": "Entity's contract/member number",
  "163": "Entity's National Provider Identifier (NPI)",
  "187": "Date(s) of service",
  "246": "Patient's date of birth",
  "510": "Future date — date of service in the future",
  "562": "Entity's tax id",
  "563": "Entity's payment terms",
};

function describeStatus(categoryCode, statusCode) {
  const cat = CATEGORY_CODES[categoryCode] || `Category ${categoryCode}`;
  const stat = STATUS_CODES[statusCode] || `Status ${statusCode}`;
  return `${cat} — ${stat}`;
}

/**
 * Map the (category, status) pair to one of our internal claim status
 * pill values used in the dashboard. Returns one of:
 *   'submitted' | 'accepted_by_clearinghouse' | 'forwarded_to_payer' |
 *   'payer_in_review' | 'pending_info' | 'payer_paid' | 'payer_denied' |
 *   'rejected'
 */
function mapToInternalStatus(claim) {
  const cat = claim.statusCategory || "";

  if (cat.startsWith("F1")) return "payer_paid";
  if (cat.startsWith("F2")) return "payer_denied";
  if (cat.startsWith("F3")) return "payer_in_review";

  if (cat === "A0") return "forwarded_to_payer";
  if (cat === "A1" || cat === "A2") return "accepted_by_clearinghouse";

  if (cat.startsWith("A3") || cat.startsWith("A6") || cat.startsWith("A7") || cat.startsWith("A8")) {
    return "rejected";
  }

  if (cat.startsWith("P2") || cat.startsWith("P4")) return "pending_info";
  if (cat.startsWith("P")) return "payer_in_review";

  return "submitted";
}

module.exports = { parse277, mapToInternalStatus, describeStatus };
