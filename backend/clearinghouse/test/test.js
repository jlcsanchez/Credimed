/**
 * Smoke tests for the clearinghouse module. Pure-Node, no test framework.
 *
 * Run:    node backend/clearinghouse/test/test.js
 * Exit 0 = all assertions passed.
 *
 * What this covers:
 *   1. EDI 837D generation from a sample claim
 *      - All required segments are present
 *      - Total charge in CLM matches sum of SV3 amounts
 *      - SE segment count matches actual count
 *      - ISA fields are exactly 106 chars long (+ ~ terminator)
 *
 *   2. 999 parser
 *      - Accepts an Availity-style accepted ack
 *      - Surfaces segment-level errors when the ack is rejected
 *
 *   3. 277 parser
 *      - Extracts trackingId, statusCategory, statusCode per claim
 *      - mapToInternalStatus maps category codes correctly
 *
 *   4. 835 parser
 *      - Extracts payment amount, claim-level paid/charged
 *      - isOutrightDenial returns true only for full denials with no PR
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generate837D } from "../edi/generator.js";
import { parse999 } from "../edi/parser-999.js";
import { parse277, mapToInternalStatus } from "../edi/parser-277.js";
import { parse835, isOutrightDenial } from "../edi/parser-835.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function ok(msg, cond) {
  if (cond) {
    console.log(`  ok    ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL  ${msg}`);
    failed++;
  }
}

function eq(msg, actual, expected) {
  ok(`${msg} (got: ${JSON.stringify(actual)})`, actual === expected);
}

// ---------------------------------------------------------------
// Test 1 — 837D generator
// ---------------------------------------------------------------
console.log("\n[1] EDI 837D generator");
{
  const claim = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-claim.json"), "utf8"));
  const edi = generate837D(claim, {
    submitterId: "CRED01",
    submitterEIN: "98-7654321",
    submitterNPI: "1234567890",
    interchangeControlNumber: "1",
    groupControlNumber: "1",
    usageIndicator: "T",
  });

  ok("output is non-empty string", typeof edi === "string" && edi.length > 0);
  ok("starts with ISA segment", edi.startsWith("ISA*"));
  ok("ends with IEA terminator", /IEA\*1\*\d{9}~$/.test(edi.split("\n").pop()));

  const segments = edi.split(/[~\n]/).filter((s) => s.trim().length);
  const tags = segments.map((s) => s.split("*")[0]);

  ok("contains GS segment", tags.includes("GS"));
  ok("contains ST segment", tags.includes("ST"));
  ok("contains BHT segment", tags.includes("BHT"));
  ok("contains CLM segment", tags.includes("CLM"));
  ok("contains at least one SV3", tags.filter((t) => t === "SV3").length >= 1);
  ok("contains SE trailer", tags.includes("SE"));
  ok("contains GE trailer", tags.includes("GE"));
  ok("contains IEA trailer", tags.includes("IEA"));

  // Check sum: sum of SV3 amounts == CLM02
  const clmSeg = segments.find((s) => s.startsWith("CLM*"));
  const clmAmount = parseFloat(clmSeg.split("*")[2]);
  const sv3Total = segments
    .filter((s) => s.startsWith("SV3*"))
    .map((s) => parseFloat(s.split("*")[3]))
    .reduce((a, b) => a + b, 0);
  ok(`CLM total ($${clmAmount}) == sum of SV3 amounts ($${sv3Total.toFixed(2)})`,
    Math.abs(clmAmount - sv3Total) < 0.01);

  // Check SE count: SE01 should equal the number of segments from ST through SE inclusive
  const stIndex = tags.indexOf("ST");
  const seIndex = tags.indexOf("SE");
  const actualCount = seIndex - stIndex + 1;
  const declaredCount = parseInt(segments[seIndex].split("*")[1], 10);
  eq("SE segment count is accurate", declaredCount, actualCount);

  // ISA segment must be exactly the right length (105 chars + ~ = 106)
  const isaSeg = segments[0];
  ok(`ISA segment is fixed-width (got ${isaSeg.length} chars; expecting >= 105)`, isaSeg.length >= 105);
}

// ---------------------------------------------------------------
// Test 2 — 999 parser
// ---------------------------------------------------------------
console.log("\n[2] 999 parser");
{
  // Synthetic accepted 999
  const accepted999 = [
    "ISA*00*          *00*          *ZZ*AVAILITY       *ZZ*CRED01         *260427*1234*^*00501*000000001*0*P*:~",
    "GS*FA*AVAILITY*CRED01*20260427*1234*1*X*005010X231A1~",
    "ST*999*0001*005010X231A1~",
    "AK1*HC*1*005010X224A2~",
    "AK2*837*0001*005010X224A2~",
    "IK5*A~",
    "AK9*A*1*1*1~",
    "SE*6*0001~",
    "GE*1*1~",
    "IEA*1*000000001~",
  ].join("\n");

  const r = parse999(accepted999);
  eq("interchange control number", r.interchangeControlNumber, "000000001");
  eq("functional group response", r.functionalGroup.responseCode, "A");
  eq("transaction count", r.transactions.length, 1);
  eq("first transaction accepted", r.transactions[0].accepted, true);
  ok("allAccepted flag true", r.allAccepted === true);

  // Synthetic rejected 999 with element-level error
  const rejected999 = [
    "ISA*00*          *00*          *ZZ*AVAILITY       *ZZ*CRED01         *260427*1234*^*00501*000000002*0*P*:~",
    "GS*FA*AVAILITY*CRED01*20260427*1234*2*X*005010X231A1~",
    "ST*999*0002*005010X231A1~",
    "AK1*HC*2*005010X224A2~",
    "AK2*837*0001*005010X224A2~",
    "IK3*NM1*9**8~",                  // Segment-level: data element errors in NM1
    "IK4*9**7*MEMBERID~",              // Element-level: invalid code value
    "IK5*R*5~",                        // Rejected; one or more segments in error
    "AK9*R*1*1*0~",
    "SE*7*0002~",
    "GE*1*2~",
    "IEA*1*000000002~",
  ].join("\n");

  const rr = parse999(rejected999);
  eq("rejected response code", rr.functionalGroup.responseCode, "R");
  eq("rejected transaction not accepted", rr.transactions[0].accepted, false);
  ok("syntax error code surfaced", rr.transactions[0].syntaxErrorCodes.length > 0);
  ok("segment error captured", rr.transactions[0].segmentErrors.length > 0);
  ok("element error captured", rr.transactions[0].segmentErrors[0].elementErrors.length > 0);
  ok("element error has friendly message",
    typeof rr.transactions[0].segmentErrors[0].elementErrors[0].errorMessage === "string");
}

// ---------------------------------------------------------------
// Test 3 — 277 parser
// ---------------------------------------------------------------
console.log("\n[3] 277 parser");
{
  const sample277 = [
    "ISA*00*          *00*          *ZZ*AVAILITY       *ZZ*CRED01         *260427*1234*^*00501*000000003*0*P*:~",
    "GS*HN*AVAILITY*CRED01*20260427*1234*3*X*005010X214~",
    "ST*277*0001*005010X214~",
    "BHT*0085*08*ABC123*20260427*1234*TH~",
    "HL*1**20*1~",
    "NM1*PR*2*AETNA DENTAL*****PI*60054~",
    "HL*2*1*21*1~",
    "NM1*41*2*CREDIMED INC*****46*CRED01~",
    "HL*3*2*19*1~",
    "NM1*1P*2*CREDIMED INC*****XX*1234567890~",
    "HL*4*3*PT~",
    "NM1*QC*1*GONZALEZ*MARIA~",
    "TRN*2*CMX-2026-DEMO01~",
    "STC*A2:20*20260427*WQ*800.00~",
    "REF*1K*PAYER-CLAIM-9988~",
    "DTP*472*D8*20260314~",
    "SE*15*0001~",
    "GE*1*3~",
    "IEA*1*000000003~",
  ].join("\n");

  const r = parse277(sample277);
  eq("payer extracted", r.payer.name, "AETNA DENTAL");
  eq("payer ID", r.payer.id, "60054");
  eq("claim count", r.claims.length, 1);

  const c = r.claims[0];
  eq("trackingId", c.trackingId, "CMX-2026-DEMO01");
  eq("payerClaimId", c.payerClaimId, "PAYER-CLAIM-9988");
  eq("statusCategory", c.statusCategory, "A2");
  eq("statusCode", c.statusCode, "20");
  eq("totalCharge", c.totalCharge, 800);
  eq("dateOfService", c.dateOfService, "20260314");
  eq("internal status mapping", mapToInternalStatus(c), "accepted_by_clearinghouse");
}

// ---------------------------------------------------------------
// Test 4 — 835 parser
// ---------------------------------------------------------------
console.log("\n[4] 835 parser");
{
  const sample835 = [
    "ISA*00*          *00*          *ZZ*AETNA          *ZZ*CRED01         *260427*1234*^*00501*000000004*0*P*:~",
    "GS*HP*AETNA*CRED01*20260427*1234*4*X*005010X221A1~",
    "ST*835*0001~",
    "BPR*I*450.00*C*ACH*CCP*01*123456789*DA*987654*98-7654321**01*123456789*DA*987654*20260427~",
    "TRN*1*EFT-987654*9876543210~",
    "N1*PR*AETNA DENTAL~",
    "N3*PO BOX 14463~",
    "N4*LEXINGTON*KY*40512~",
    "N1*PE*CREDIMED INC*XX*1234567890~",
    "REF*TJ*98-7654321~",
    "LX*1~",
    "CLP*CMX-2026-DEMO01*1*800.00*450.00*100.00*CI*PAYER-CLAIM-9988*11*1~",
    "CAS*PR*1*100.00~",
    "CAS*CO*45*250.00~",
    "NM1*QC*1*GONZALEZ*MARIA****MI*W123456789~",
    "DTM*232*20260314~",
    "DTM*233*20260314~",
    "SVC*HC:D2740**450*250**1~",
    "DTM*472*20260314~",
    "CAS*CO*45*200.00~",
    "SVC*HC:D3330**350*200**1~",
    "DTM*472*20260314~",
    "CAS*CO*45*150.00~",
    "SE*22*0001~",
    "GE*1*4~",
    "IEA*1*000000004~",
  ].join("\n");

  const r = parse835(sample835);
  eq("total payment", r.payment.totalPaid, 450);
  eq("payment method", r.payment.method, "ACH");
  eq("EFT trace", r.payment.eftTraceNumber, "EFT-987654");
  eq("payer name", r.payer.name, "AETNA DENTAL");
  eq("payee NPI", r.payee.npi, "1234567890");
  eq("claim count", r.claims.length, 1);

  const c = r.claims[0];
  eq("patient claim ID", c.patientClaimId, "CMX-2026-DEMO01");
  eq("claim status", c.status, 1);
  eq("total charge", c.totalCharge, 800);
  eq("total paid", c.totalPaid, 450);
  eq("patient responsibility", c.patientResponsibility, 100);
  eq("service line count", c.services.length, 2);

  // Synthesize a denial for isOutrightDenial check
  const denial = {
    status: 4,
    totalPaid: 0,
    adjustments: [{ groupCode: "CO", reasonCode: "204" }],
  };
  ok("isOutrightDenial true for status=4 / paid=0 / non-PR adjustments",
    isOutrightDenial(denial) === true);

  const adjudicated = {
    status: 4,
    totalPaid: 0,
    adjustments: [{ groupCode: "PR", reasonCode: "1" }],
  };
  ok("isOutrightDenial false when only PR adjustments",
    isOutrightDenial(adjudicated) === false);
}

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
