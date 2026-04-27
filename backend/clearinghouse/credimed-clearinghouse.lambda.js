/**
 * credimed-clearinghouse (Lambda) — Availity submission orchestrator
 *
 * Routes:
 *   POST  /clearinghouse/submit/{claimId}   — generate 837D + send to Availity
 *   POST  /clearinghouse/poll/{claimId}     — fetch latest 277 status from Availity
 *   POST  /clearinghouse/remittance/{claimId} — fetch 835 once payer has paid
 *   POST  /clearinghouse/webhook            — Availity webhook (when ack arrives)
 *   GET   /admin/clearinghouse/{claimId}    — admin view of all clearinghouse activity
 *
 * Each route is admin-only via JWT cognito:groups. Patient-side claim
 * submission goes through a different code path (the existing claims
 * Lambda enqueues to a SQS, this Lambda consumes that queue too — see
 * the SQS handler below).
 *
 * Side effects per claim:
 *   - DynamoDB credimed-claims item gets these fields written:
 *       clearinghouseStatus  : "generated" | "submitted" | "accepted" |
 *                              "forwarded_to_payer" | "payer_paid" |
 *                              "payer_denied" | "rejected" | "pending_info"
 *       availitySubmissionId : Availity's tracking ID
 *       payerClaimId         : payer's assigned claim number (from 277)
 *       lastEdiSegment       : pointer to the most recent EDI file in S3
 *       statusHistory        : append-only log of (status, timestamp, source)
 *
 *   - S3 bucket `credimed-edi-archive` gets one object per EDI file
 *     for HIPAA's 6-year audit-log retention.
 *
 *   - SES email is sent to the patient on certain transitions
 *     ('accepted', 'payer_paid', 'payer_denied') via the existing email
 *     templates module.
 *
 * IAM (must be attached to this Lambda's role):
 *   dynamodb:GetItem / UpdateItem on credimed-claims
 *   kms:Decrypt                   on the PHI key
 *   s3:PutObject / GetObject      on credimed-edi-archive
 *   ses:SendEmail                 on the verified domain
 *
 * Env vars (set in Lambda console after Availity TPA is signed):
 *   AVAILITY_CLIENT_ID
 *   AVAILITY_CLIENT_SECRET
 *   AVAILITY_API_BASE          (default https://api.availity.com)
 *   AVAILITY_SUBMITTER_ID      (assigned by Availity at enrollment)
 *   CREDIMED_NPI               (Type 2 organizational NPI)
 *   CREDIMED_EIN               (Federal tax ID)
 *   FROM_EMAIL                 (Credimed <support@credimed.us>)
 *   EDI_ARCHIVE_BUCKET         (default credimed-edi-archive)
 *
 * See backend/clearinghouse/AVAILITY_INTEGRATION.md for the full setup.
 */

"use strict";

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { generate837D } from "./edi/generator.js";
import { parse999 } from "./edi/parser-999.js";
import { parse277, mapToInternalStatus } from "./edi/parser-277.js";
import { parse835, isOutrightDenial } from "./edi/parser-835.js";
import * as availity from "./availity/client.js";

const REGION = "us-west-2";
const db  = new DynamoDBClient({ region: REGION });
const kms = new KMSClient({ region: REGION });
const s3  = new S3Client({ region: REGION });

const TABLE        = "credimed-claims";
const ARCHIVE_BUCKET = process.env.EDI_ARCHIVE_BUCKET || "credimed-edi-archive";
const ADMIN_GROUP  = "admin";

const ALLOWED_ORIGINS = new Set([
  "https://credimed.us",
  "https://www.credimed.us",
  "http://localhost:8000",
]);

const ENCRYPTED_FIELDS = [
  "email", "firstName", "lastName",
  "memberId", "insurer", "procedure", "amount",
];

// ---------------------------------------------------------------
// CORS / response helpers — match the existing claims Lambda
// ---------------------------------------------------------------
function corsHeaders(event) {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://credimed.us";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
}
function respond(statusCode, body, event) {
  return {
    statusCode,
    headers: corsHeaders(event),
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------
function getJwtClaims(event) {
  return event?.requestContext?.authorizer?.jwt?.claims ||
         event?.requestContext?.authorizer?.claims || null;
}
function isAdmin(claims) {
  if (!claims) return false;
  let groups = claims["cognito:groups"];
  if (groups == null) return false;
  if (typeof groups === "string") {
    let trimmed = groups.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      try { groups = JSON.parse("[" + inner + "]"); }
      catch { groups = inner.split(/[,\s]+/).filter(Boolean); }
    } else {
      groups = trimmed.split(/[,\s]+/).filter(Boolean);
    }
  }
  if (!Array.isArray(groups)) return false;
  return groups
    .map((g) => String(g).replace(/["\[\]]/g, "").trim().toLowerCase())
    .includes(ADMIN_GROUP);
}

// ---------------------------------------------------------------
// DynamoDB helpers — load claim with PHI decrypted
// ---------------------------------------------------------------
async function decryptField(b64) {
  if (!b64) return "";
  try {
    const result = await kms.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(b64, "base64"),
    }));
    return new TextDecoder().decode(result.Plaintext);
  } catch (err) {
    console.error("KMS decrypt failed:", err.message);
    return "[DECRYPTION_ERROR]";
  }
}

async function loadDecryptedClaim(claimId) {
  const r = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
  }));
  if (!r.Item) return null;

  const item = r.Item;
  const out = {
    claimId: item.claimId?.S || "",
    userId: item.userId?.S || "",
    status: item.status?.S || "submitted",
    plan: item.plan?.S || "",
  };

  for (const f of ENCRYPTED_FIELDS) {
    out[f] = item[f]?.S ? await decryptField(item[f].S) : "";
  }

  // Pass-through scalars relevant to EDI generation
  const passthrough = [
    "dob", "address1", "address2", "city", "state", "zip", "gender",
    "groupNumber", "payerId", "providerName", "providerNPI",
    "providerRFC", "providerAddress", "providerCity",
    "providerState", "providerZip", "dateOfService",
    "diagnosisCode", "providerTaxonomy",
    "clearinghouseStatus", "availitySubmissionId", "payerClaimId",
  ];
  for (const f of passthrough) {
    if (item[f]?.S != null) out[f] = item[f].S;
    else if (item[f]?.N != null) out[f] = Number(item[f].N);
  }

  // Procedures may be stored as a list of maps in DDB, or as a single
  // procedure string + amount on the legacy schema.
  if (item.procedures?.L) {
    out.procedures = item.procedures.L.map((p) => ({
      cdtCode: p.M?.cdtCode?.S || "",
      amount: Number(p.M?.amount?.N || 0),
      toothNumber: p.M?.toothNumber?.S || null,
      dateOfService: p.M?.dateOfService?.S || null,
    }));
  } else if (out.procedure && out.amount) {
    // Legacy single-procedure claim — wrap it for the generator
    out.procedures = [{
      cdtCode: parseCdtFromProcedure(out.procedure),
      amount: Number(out.amount) || 0,
      dateOfService: out.dateOfService || null,
    }];
  } else {
    out.procedures = [];
  }

  return out;
}

/**
 * Crude fallback for legacy claims that stored "Crown D2740" as a single
 * string instead of a structured procedures list. Tries to extract the
 * CDT code via regex; falls back to D9999 (unspecified) so the EDI is
 * still well-formed and the payer can reject it cleanly with a fixable
 * error code.
 */
function parseCdtFromProcedure(text) {
  const m = String(text || "").match(/\bD\d{4}\b/i);
  return m ? m[0].toUpperCase() : "D9999";
}

// ---------------------------------------------------------------
// DynamoDB writes
// ---------------------------------------------------------------
async function recordSubmission(claimId, { submissionId, ediKey, accepted, ackEdi }) {
  const updates = {
    "#chs": "clearinghouseStatus",
    "#asid": "availitySubmissionId",
    "#leds": "lastEdiSubmittedKey",
    "#ua": "updatedAt",
  };
  const values = {
    ":chs": { S: accepted ? "accepted" : "submitted" },
    ":asid": { S: submissionId || "" },
    ":leds": { S: ediKey || "" },
    ":ua": { S: new Date().toISOString() },
  };

  // Append a status history entry
  if (ackEdi) {
    updates["#leak"] = "lastAckEdiKey";
    values[":leak"] = { S: ackEdi };
  }

  const setExpr = Object.keys(updates).map((k) => `${k} = ${k.replace("#", ":")}`).join(", ");

  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: `SET ${setExpr}`,
    ExpressionAttributeNames: updates,
    ExpressionAttributeValues: values,
  }));
}

async function recordStatusUpdate(claimId, internalStatus, payerClaimId, statusEdiKey) {
  const updates = {
    "#chs": "clearinghouseStatus",
    "#ua": "updatedAt",
  };
  const values = {
    ":chs": { S: internalStatus },
    ":ua": { S: new Date().toISOString() },
  };
  if (payerClaimId) {
    updates["#pcid"] = "payerClaimId";
    values[":pcid"] = { S: payerClaimId };
  }
  if (statusEdiKey) {
    updates["#les"] = "lastStatusEdiKey";
    values[":les"] = { S: statusEdiKey };
  }
  const setExpr = Object.keys(updates).map((k) => `${k} = ${k.replace("#", ":")}`).join(", ");
  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: `SET ${setExpr}`,
    ExpressionAttributeNames: updates,
    ExpressionAttributeValues: values,
  }));
}

// ---------------------------------------------------------------
// S3 archive — store every EDI we generate or receive (HIPAA audit log)
// ---------------------------------------------------------------
async function archiveEdi(claimId, kind, ediText) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `${claimId}/${ts}-${kind}.edi`;
  await s3.send(new PutObjectCommand({
    Bucket: ARCHIVE_BUCKET,
    Key: key,
    Body: ediText,
    ContentType: "application/edi-x12",
    ServerSideEncryption: "aws:kms",
    Metadata: {
      claimId,
      ediKind: kind,           // "837D" | "999" | "277" | "835"
      generatedAt: new Date().toISOString(),
    },
  }));
  return key;
}

// ---------------------------------------------------------------
// Control number generator — Availity needs unique 9-digit numbers
// per ISA / GS / ST. We derive them from the claimId + a per-second
// counter so they're deterministic for retries.
// ---------------------------------------------------------------
function controlNumbersFor(claimId) {
  // Hash the claimId to a stable 9-digit-ish number, then OR-in current
  // seconds-of-day to avoid collisions on retry within the same second.
  let h = 0;
  for (let i = 0; i < claimId.length; i++) h = (h * 31 + claimId.charCodeAt(i)) | 0;
  const base = Math.abs(h) % 900000000 + 100000000;
  const sec  = Math.floor(Date.now() / 1000) % 1000;
  const n = base + sec;
  return {
    interchangeControlNumber: String(n).padStart(9, "0").slice(-9),
    groupControlNumber: String(n + 1).padStart(9, "0").slice(-9),
  };
}

// ---------------------------------------------------------------
// Route: POST /clearinghouse/submit/{claimId}
// Generate 837D, archive it, send to Availity, archive the 999, update DDB.
// ---------------------------------------------------------------
async function handleSubmit(claimId) {
  const claim = await loadDecryptedClaim(claimId);
  if (!claim) return { ok: false, error: "claim not found", status: 404 };

  // Fill in derived fields the EDI generator needs
  if (!claim.payerId) {
    claim.payerId = availity.getPayerId(claim.insurer);
    if (!claim.payerId) {
      return {
        ok: false,
        status: 400,
        error: `No Availity payer ID known for insurer "${claim.insurer}". ` +
               "Add to PAYER_IDS in availity/client.js or set claim.payerId manually.",
      };
    }
  }

  // Generate the EDI
  const ctrl = controlNumbersFor(claimId);
  const ediText = generate837D(claim, {
    submitterId: process.env.AVAILITY_SUBMITTER_ID || "CRED01",
    submitterEIN: process.env.CREDIMED_EIN || "00-0000000",
    submitterNPI: process.env.CREDIMED_NPI   || "0000000000",
    submitterPhone: process.env.SUBMITTER_PHONE || "8005551212",
    submitterAddress1: process.env.SUBMITTER_ADDRESS1 || "[Boston street TBD]",
    submitterCity: process.env.SUBMITTER_CITY || "BOSTON",
    submitterState: process.env.SUBMITTER_STATE || "MA",
    submitterZip: process.env.SUBMITTER_ZIP   || "02101",
    interchangeControlNumber: ctrl.interchangeControlNumber,
    groupControlNumber: ctrl.groupControlNumber,
    usageIndicator: process.env.AVAILITY_PROD === "true" ? "P" : "T",
  });

  // Archive the outbound EDI for audit
  const ediKey = await archiveEdi(claimId, "837D", ediText);

  // Submit to Availity
  let submissionResult;
  try {
    submissionResult = await availity.submitClaim(ediText, {
      batchId: claimId,
      payerName: claim.insurer,
    });
  } catch (err) {
    console.error(`[submit:${claimId}] Availity rejected:`, err.message);
    await recordSubmission(claimId, { submissionId: "", ediKey, accepted: false });
    return { ok: false, status: 502, error: `Availity submission failed: ${err.message}` };
  }

  // Archive the 999 ack if Availity returned it inline
  let ackKey = null;
  let ackParsed = null;
  if (submissionResult.ackEdi) {
    ackKey = await archiveEdi(claimId, "999", submissionResult.ackEdi);
    try { ackParsed = parse999(submissionResult.ackEdi); } catch (e) {
      console.warn(`[submit:${claimId}] 999 parse failed:`, e.message);
    }
  }

  // Persist submission state
  await recordSubmission(claimId, {
    submissionId: submissionResult.submissionId,
    ediKey,
    accepted: submissionResult.accepted,
    ackEdi: ackKey,
  });

  return {
    ok: true,
    status: 200,
    body: {
      claimId,
      submissionId: submissionResult.submissionId,
      accepted: submissionResult.accepted,
      submittedAt: submissionResult.submittedAt,
      ackSummary: ackParsed,
      archiveKeys: { ediKey, ackKey },
    },
  };
}

// ---------------------------------------------------------------
// Route: POST /clearinghouse/poll/{claimId}
// Pull the latest 277 from Availity and update DDB status.
// ---------------------------------------------------------------
async function handlePoll(claimId) {
  const claim = await loadDecryptedClaim(claimId);
  if (!claim || !claim.availitySubmissionId) {
    return { ok: false, status: 404, error: "claim has not been submitted to Availity yet" };
  }

  let statusResp;
  try {
    statusResp = await availity.getStatus(claim.availitySubmissionId);
  } catch (err) {
    console.error(`[poll:${claimId}] Availity status fetch failed:`, err.message);
    return { ok: false, status: 502, error: err.message };
  }

  if (statusResp.pending) {
    return { ok: true, status: 200, body: { claimId, pending: true } };
  }
  if (!statusResp.statusEdi) {
    return { ok: true, status: 200, body: { claimId, statusJson: statusResp.statusJson } };
  }

  const statusKey = await archiveEdi(claimId, "277", statusResp.statusEdi);
  const parsed = parse277(statusResp.statusEdi);

  // Find the claim record matching our trackingId
  const ourClaim = parsed.claims.find((c) => c.trackingId === claimId) || parsed.claims[0];
  const internalStatus = ourClaim ? mapToInternalStatus(ourClaim) : "submitted";
  const payerClaimId = ourClaim?.payerClaimId || claim.payerClaimId || null;

  await recordStatusUpdate(claimId, internalStatus, payerClaimId, statusKey);

  return {
    ok: true,
    status: 200,
    body: {
      claimId,
      internalStatus,
      payerClaimId,
      payerStatusDescription: ourClaim?.statusDescription || null,
      lastUpdated: statusResp.lastUpdated,
      archiveKey: statusKey,
    },
  };
}

// ---------------------------------------------------------------
// Route: POST /clearinghouse/remittance/{claimId}
// Pull the 835 once payer has paid, archive it, mark claim paid/denied.
// ---------------------------------------------------------------
async function handleRemittance(claimId) {
  const claim = await loadDecryptedClaim(claimId);
  if (!claim || !claim.availitySubmissionId) {
    return { ok: false, status: 404, error: "claim has not been submitted to Availity yet" };
  }

  let remit;
  try {
    remit = await availity.getRemittance(claim.availitySubmissionId);
  } catch (err) {
    console.error(`[remit:${claimId}] Availity remittance fetch failed:`, err.message);
    return { ok: false, status: 502, error: err.message };
  }

  if (remit.pending || !remit.remittanceEdi) {
    return { ok: true, status: 200, body: { claimId, pending: true } };
  }

  const remitKey = await archiveEdi(claimId, "835", remit.remittanceEdi);
  const parsed = parse835(remit.remittanceEdi);
  const ourClaim = parsed.claims.find((c) => c.patientClaimId === claimId) || parsed.claims[0];

  let internalStatus = "payer_in_review";
  if (ourClaim) {
    if ((ourClaim.totalPaid || 0) > 0) internalStatus = "payer_paid";
    else if (isOutrightDenial(ourClaim)) internalStatus = "payer_denied_outright";
    else internalStatus = "payer_denied";
  }

  await recordStatusUpdate(claimId, internalStatus, ourClaim?.payerClaimId, remitKey);

  return {
    ok: true,
    status: 200,
    body: {
      claimId,
      internalStatus,
      paid: ourClaim?.totalPaid || 0,
      patientResponsibility: ourClaim?.patientResponsibility || 0,
      adjustments: ourClaim?.adjustments || [],
      paymentMethod: parsed.payment.method,
      paymentDate: parsed.payment.paymentDate,
      archiveKey: remitKey,
    },
  };
}

// ---------------------------------------------------------------
// Lambda entrypoint — HTTP API v2 event shape
// ---------------------------------------------------------------
export const handler = async (event) => {
  // CORS preflight
  if (event?.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }

  // Auth gate — every route here is admin-only
  const claims = getJwtClaims(event);
  if (!isAdmin(claims)) {
    return respond(403, { error: "admin only" }, event);
  }

  const method = event.requestContext?.http?.method || "GET";
  const path   = event.requestContext?.http?.path   || event.rawPath || "";

  // Route extraction — supports "/clearinghouse/submit/CMX-..." and the
  // /admin/* mirrors used by the admin dashboard.
  const m = path.match(/\/clearinghouse\/(submit|poll|remittance)\/([^/?]+)/);
  if (m) {
    const [, action, claimId] = m;
    try {
      let result;
      if (action === "submit")      result = await handleSubmit(claimId);
      else if (action === "poll")   result = await handlePoll(claimId);
      else if (action === "remittance") result = await handleRemittance(claimId);
      else return respond(400, { error: "unknown action" }, event);

      if (!result.ok) return respond(result.status || 500, { error: result.error }, event);
      return respond(result.status || 200, result.body, event);
    } catch (err) {
      console.error(`[${action}:${claimId}] unhandled:`, err);
      return respond(500, { error: err.message }, event);
    }
  }

  // Fallback
  return respond(404, { error: "no matching route", method, path }, event);
};
