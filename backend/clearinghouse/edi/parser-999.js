/**
 * EDI 999 — Implementation Acknowledgment parser (X12 005010X231A1)
 *
 * The 999 is the first response Availity sends back. It says "your 837D
 * was syntactically valid" or "rejected because of these specific errors."
 * It does NOT say anything about whether the payer accepted the claim —
 * that's the 277CA / 277. The 999 is a syntax-level ack only.
 *
 * Structure:
 *   ISA / GS / ST*999*N
 *   AK1 — functional group response
 *   AK2 — transaction set response
 *   IK3 — segment-level error (zero or more)
 *   IK4 — element-level error (zero or more, attached to most recent IK3)
 *   IK5 — transaction set acknowledgment (A=accepted, R=rejected, E=accepted-with-errors)
 *   AK9 — functional group acknowledgment (A/R/P/E/M)
 *   SE / GE / IEA
 *
 * This parser returns a normalized JS object with one entry per transaction
 * set (i.e., per claim batch we submitted). The Lambda handler maps the
 * BHT-claimId / ST-control-number back to our internal claimId.
 *
 * Reference: ASC X12N 999 Implementation Acknowledgment, version 005010X231A1.
 */

"use strict";

/**
 * Parse a 999 EDI string and return a structured summary.
 *
 * @param {string} ediText  raw 999 file content (segments may be ~ or \n separated)
 * @returns {object} { interchangeControlNumber, functionalGroup, transactions: [...] }
 */
function parse999(ediText) {
  if (!ediText || typeof ediText !== "string") {
    throw new Error("parse999: input must be a non-empty EDI string");
  }

  // Normalize segment terminators: ~ ends a segment in production, but
  // sandbox sometimes emits \n. Split on ~ first; if we got one giant
  // line back, fall through to splitting on newlines.
  const segments = ediText
    .split(/[~\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result = {
    interchangeControlNumber: null,
    functionalGroup: { responseCode: null, accepted: 0, received: 0, errors: [] },
    transactions: [],
  };

  let currentTxn = null;
  let currentSegmentError = null;

  for (const seg of segments) {
    const fields = seg.split("*");
    const tag = fields[0];

    switch (tag) {
      case "ISA":
        // ISA13 = interchange control number (9 digits)
        result.interchangeControlNumber = fields[13] || null;
        break;

      case "AK1":
        // AK1*HC*<groupControlNum>*<versionId>
        result.functionalGroup.functionalIdCode = fields[1] || null;
        result.functionalGroup.groupControlNumber = fields[2] || null;
        break;

      case "AK2":
        // AK2*<txnSetCode>*<txnSetControlNum>*<implConventionRef>
        // Open a new transaction record.
        currentTxn = {
          transactionSetCode: fields[1] || null,
          transactionSetControlNumber: fields[2] || null,
          implementationConventionRef: fields[3] || null,
          accepted: null,                    // set by IK5
          syntaxErrorCodes: [],              // from IK5
          segmentErrors: [],
        };
        result.transactions.push(currentTxn);
        currentSegmentError = null;
        break;

      case "IK3":
        // IK3*<segIdCode>*<segPosition>*<loopId>*<errorCode>*<segContext>
        // Segment-level error — opens a context for any IK4 elements that follow.
        if (currentTxn) {
          currentSegmentError = {
            segmentId: fields[1] || null,
            segmentPosition: fields[2] || null,
            loopId: fields[3] || null,
            errorCode: fields[4] || null,
            errorMessage: friendlyIK3Error(fields[4]),
            elementErrors: [],
          };
          currentTxn.segmentErrors.push(currentSegmentError);
        }
        break;

      case "IK4":
        // IK4*<elementPosition>*<elementRefId>*<errorCode>*<errorContent>*<copyOfElement>
        if (currentSegmentError) {
          currentSegmentError.elementErrors.push({
            elementPosition: fields[1] || null,
            elementRefId: fields[2] || null,
            errorCode: fields[3] || null,
            errorMessage: friendlyIK4Error(fields[3]),
            copyOfBadElement: fields[5] || null,
          });
        }
        break;

      case "IK5":
        // IK5*<acknowledgmentCode>*<errorCode1>...<errorCode5>
        if (currentTxn) {
          const ack = fields[1] || "";
          currentTxn.acknowledgmentCode = ack;
          currentTxn.accepted = ack === "A" || ack === "E";
          // Collect up to 5 syntax-error codes
          for (let i = 2; i <= 6; i++) {
            if (fields[i]) {
              currentTxn.syntaxErrorCodes.push({
                code: fields[i],
                message: friendlyIK5Error(fields[i]),
              });
            }
          }
        }
        break;

      case "AK9":
        // AK9*<acknowledgmentCode>*<numTxnSetsIncluded>*<numTxnSetsReceived>*<numTxnSetsAccepted>
        result.functionalGroup.responseCode = fields[1] || null;
        result.functionalGroup.included = parseInt(fields[2], 10) || 0;
        result.functionalGroup.received = parseInt(fields[3], 10) || 0;
        result.functionalGroup.accepted = parseInt(fields[4], 10) || 0;
        break;

      // SE / GE / IEA — trailers, nothing to capture
      default:
        break;
    }
  }

  // Top-level boolean: did Availity accept everything we sent?
  result.allAccepted =
    result.functionalGroup.responseCode === "A" &&
    result.transactions.every((t) => t.accepted === true);

  return result;
}

// ---------------------------------------------------------------
// Human-readable error message lookups. The full X12 spec has
// hundreds of codes — these are the ones Availity actually returns
// in practice for dental 837D submissions.
// ---------------------------------------------------------------

const IK3_MESSAGES = {
  "1":  "Unrecognized segment ID",
  "2":  "Unexpected segment",
  "3":  "Required segment missing",
  "4":  "Loop occurs over maximum times",
  "5":  "Segment exceeds maximum use",
  "6":  "Segment not in defined transaction set",
  "7":  "Segment not in proper sequence",
  "8":  "Segment has data element errors",
  "I6": "Implementation segment below minimum use",
  "I7": "Implementation segment dependency error",
  "I8": "Implementation segment count exceeded",
};
function friendlyIK3Error(code) {
  return IK3_MESSAGES[code] || `Segment error code ${code}`;
}

const IK4_MESSAGES = {
  "1":  "Required data element missing",
  "2":  "Conditional required data element missing",
  "3":  "Too many data elements",
  "4":  "Data element too short",
  "5":  "Data element too long",
  "6":  "Invalid character in data element",
  "7":  "Invalid code value",
  "8":  "Invalid date",
  "9":  "Invalid time",
  "10": "Exclusion condition violated",
  "12": "Too many repetitions",
  "13": "Too many components",
  "I6": "Code value not valid for this implementation",
  "I9": "Implementation 'must use' element not present",
  "I10": "Implementation conditional dependency violated",
  "I12": "Implementation pattern error",
};
function friendlyIK4Error(code) {
  return IK4_MESSAGES[code] || `Element error code ${code}`;
}

const IK5_MESSAGES = {
  "1": "Transaction set not supported",
  "2": "Transaction set trailer missing",
  "3": "Transaction set control number mismatch (header vs trailer)",
  "4": "Number of included segments incorrect",
  "5": "One or more segments in error",
  "6": "Missing or invalid transaction set identifier",
  "7": "Missing or invalid transaction set control number",
  "8": "Authentication key not valid",
  "9": "Encryption key not valid",
  "10": "Requested service not available",
};
function friendlyIK5Error(code) {
  return IK5_MESSAGES[code] || `Transaction set error code ${code}`;
}

export { parse999 };
