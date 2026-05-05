/**
 * credimed-claims (Lambda) — read + admin + create
 *
 * Single Lambda that handles ALL claim endpoints. Routes:
 *
 *   POST  /claims              — create a claim (authenticated patient)
 *   GET   /claims              — list user's own claims
 *   GET   /claims/{id}         — get one claim (verifies ownership; admin can read any)
 *   GET   /admin/claims        — list ALL claims (admin only)
 *   PATCH /admin/claims/{id}   — update claim status (admin only)
 *
 * Schema:
 *   Table: credimed-claims
 *     PK: claimId  (S)
 *   GSI:  userId-createdAt-index
 *     PK: userId   (S, Cognito sub)
 *     SK: createdAt (S, ISO)
 *
 * PHI encryption: email, firstName, lastName, memberId, insurer, procedure,
 * amount are KMS-encrypted at rest on POST and decrypted on GET. The
 * Lambda's IAM role must have kms:Encrypt + kms:Decrypt on the key
 * referenced by the KMS_KEY_ID env var.
 *
 * Admin gate: the JWT's cognito:groups claim must include "admin".
 */

import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  ScanCommand,
  UpdateItemCommand,
  PutItemCommand
} from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand, EncryptCommand } from "@aws-sdk/client-kms";
import { sendEmailSafely } from "../email/sendEmail.js";
import { templateForStatus } from "../email/templates.js";

const db  = new DynamoDBClient({ region: "us-west-2" });
const kms = new KMSClient({ region: "us-west-2" });

const ALLOWED_ORIGINS = new Set([
  "https://credimed.us",
  "https://www.credimed.us",
  // Local dev — strip these from a hardened production build.
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const ADMIN_GROUP    = "admin";
const TABLE          = "credimed-claims";
const USER_INDEX     = "userId-createdAt-index";
// Training-data capture: every admin review decision is logged here
// so that future model training (Stage 2 AI-assisted, Stage 3 auto-
// approve) can replay the diff between aiExtraction and humanCorrection
// alongside the structured decisionReason.
const REVIEW_TABLE   = "credimed-review-decisions";

// Stripe — used when admin marks a claim 'refunded' and the money-back
// guarantee fee should be returned to the patient's card. Feature-flagged
// off by default so the function ships safely; flip STRIPE_REFUND_ENABLED
// to "true" in Lambda env once STRIPE_SECRET_KEY is wired and you've
// tested with a single sandbox refund.
const STRIPE_API_BASE       = "https://api.stripe.com/v1";
const STRIPE_API_VERSION    = "2024-04-10";
const STRIPE_REFUND_ENABLED = process.env.STRIPE_REFUND_ENABLED === "true";
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY || "";

const ENCRYPTED_FIELDS = [
  "email", "firstName", "lastName",
  "memberId", "insurer", "procedure", "amount"
];

const ALLOWED_STATUSES = new Set([
  "submitted", "in-review", "needs-docs", "submitted_to_carrier",
  "approved", "paid", "denied", "refunded", "needs_attention"
]);

// Structured decisionReason values. Free-text "Other" requires a
// non-empty `decisionNote`. Adding new values is fine — keep the
// keys snake_case so the data is queryable by category in CloudWatch
// / Athena later.
const ALLOWED_REVIEW_DECISIONS = new Set([
  "approved",                  // green-lit, ready to file
  "needs_more_docs",           // missing receipt detail / x-ray / narrative
  "rejected_ineligible",       // plan doesn't cover this
  "rejected_fraud_suspicion"   // looks suspicious, escalate
]);
const ALLOWED_DECISION_REASONS = new Set([
  "ok_as_is",
  "missing_rfc",
  "missing_narrative",
  "missing_xray",
  "missing_receipt_detail",
  "low_quality_image",
  "wrong_cdt_codes",
  "amount_mismatch",
  "fraud_suspicion",
  "plan_inactive",
  "oon_not_covered",
  "other"
]);

// ---------- helpers ----------

/**
 * Origin-aware CORS. Echo back the request Origin only if it's in the
 * allowlist; otherwise default to the canonical apex domain so the
 * browser blocks the response. Including Vary: Origin so caches keep
 * one entry per origin.
 */
function corsHeaders(event) {
  const reqOrigin =
    event?.headers?.origin || event?.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(reqOrigin)
    ? reqOrigin
    : "https://credimed.us";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
}

const KMS_KEY_ID = process.env.KMS_KEY_ID || "";

/**
 * KMS-encrypt a plaintext PHI field. Returns base64 ciphertext suitable
 * for DynamoDB S storage. Returns null for empty/missing input so we
 * don't waste a KMS call (and don't write a meaningless attribute).
 */
async function encryptField(plaintext) {
  if (plaintext == null || plaintext === "") return null;
  if (!KMS_KEY_ID) {
    throw new Error("KMS_KEY_ID env var not set — cannot encrypt PHI");
  }
  const result = await kms.send(new EncryptCommand({
    KeyId: KMS_KEY_ID,
    Plaintext: Buffer.from(String(plaintext), "utf8")
  }));
  return Buffer.from(result.CiphertextBlob).toString("base64");
}

function buildResponse(statusCode, body, event) {
  return {
    statusCode,
    headers: corsHeaders(event),
    body: JSON.stringify(body)
  };
}

async function decryptField(encryptedValue) {
  if (!encryptedValue) return "";
  try {
    const result = await kms.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedValue, "base64")
    }));
    return new TextDecoder().decode(result.Plaintext);
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return "[DECRYPTION_ERROR]";
  }
}

/**
 * Decode a DynamoDB item into a plain JS claim object. Decrypts PHI fields
 * in parallel, copies through non-PHI scalars (status, plan, dates, etc.).
 */
async function decryptItem(item) {
  const claim = {
    claimId:   item.claimId?.S   || "",
    userId:    item.userId?.S    || "",
    status:    item.status?.S    || "submitted",
    createdAt: item.createdAt?.S || "",
    updatedAt: item.updatedAt?.S || ""
  };

  // Pass-through for common non-PHI scalar fields if they exist.
  // Add more here as the data model grows.
  const PASSTHROUGH = ["plan", "city", "paidCurrency", "paidAmount",
                       "paidAmountUSD", "estimateMin", "estimateMax",
                       "submittedAt", "paidAt", "deniedAt", "paymentMode"];
  for (const f of PASSTHROUGH) {
    if (item[f]?.S != null) claim[f] = item[f].S;
    else if (item[f]?.N != null) claim[f] = Number(item[f].N);
  }

  // procedures is an array of strings, stored as JSON-encoded S so the
  // existing scalar decoder works for everything else. Try to parse;
  // fall back to the raw string if it isn't JSON (legacy rows).
  if (item.procedures?.S != null) {
    try { claim.procedures = JSON.parse(item.procedures.S); }
    catch { claim.procedures = item.procedures.S; }
  }

  await Promise.all(ENCRYPTED_FIELDS.map(async (field) => {
    claim[field] = item[field]?.S ? await decryptField(item[field].S) : "";
  }));

  return claim;
}

/**
 * Cognito serializes the cognito:groups claim differently across token
 * types — sometimes a JSON-encoded string array, sometimes comma-separated,
 * sometimes an actual array. Handle all three.
 */
function isAdmin(claims) {
  if (!claims) return false;
  let groups = claims["cognito:groups"];
  if (groups == null) return false;
  if (typeof groups === "string") {
    let trimmed = groups.trim();
    // API Gateway HTTP API serializes JWT array claims as "[Admin Editor]"
    // — bracket-wrapped, space-separated, no quotes. JSON.parse fails on
    // this. Strip outer brackets first, then split.
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

// ---------- route handlers ----------

async function listUserClaims(userId) {
  const r = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: USER_INDEX,
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": { S: userId } },
    ScanIndexForward: false,  // newest first
    Limit: 100
  }));
  if (!r.Items || r.Items.length === 0) return { claims: [], count: 0 };
  const claims = await Promise.all(r.Items.map(decryptItem));
  return { claims, count: claims.length };
}

async function getOneClaim(claimId, userId, isAdminUser) {
  const r = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } }
  }));
  if (!r.Item) return null;
  if (!isAdminUser && r.Item.userId?.S !== userId) return "forbidden";
  return await decryptItem(r.Item);
}

/**
 * Create a new claim row. PHI fields are encrypted with KMS before
 * write. The PK is the claimId minted by the frontend (CMX-YYYY-XXXXXX),
 * which lets the same submitClaim() retry safely after a network blip:
 *   - First attempt: ConditionExpression succeeds, row is created.
 *   - Retry with same id by same user: returns the existing row (200).
 *   - Collision (different user reusing an id): 409.
 *
 * Required body fields: claimId. Everything else is optional and stamped
 * only when present so the row stays narrow if the frontend ships
 * partial data. status defaults to 'in-review' since the patient just
 * paid and submitted — admins move it forward from there.
 */
async function createClaim(userId, body, isAdminUser) {
  if (!body || typeof body !== "object") {
    return { error: "Missing JSON body", code: 400 };
  }
  const claimId = body.claimId;
  if (!claimId || typeof claimId !== "string") {
    return { error: "claimId required", code: 400 };
  }
  // Format check — match the frontend's CMX-YYYY-XXXXXX pattern. Reject
  // anything else so a hostile client can't pollute the table with
  // arbitrary keys (e.g., admin/* or other users' ids).
  if (!/^CMX-\d{4}-[A-Z0-9]{4,12}$/i.test(claimId)) {
    return { error: "Invalid claimId format", code: 400 };
  }

  const now = new Date().toISOString();
  // Admin-only Test Mode bypass: the patient-flow frontend only sets
  // paymentMode='test' from payment.html's admin shortcut, which routes
  // straight to submission-confirmed without going through Stripe.
  // Honor it only when the caller is in the 'admin' Cognito group;
  // anything else is silently coerced to 'live' so a hostile client
  // can't avoid being charged by appending the flag manually.
  const paymentMode = isAdminUser && body.paymentMode === "test" ? "test" : "live";
  const item = {
    claimId:    { S: claimId },
    userId:     { S: userId },
    status:     { S: body.status && ALLOWED_STATUSES.has(body.status) ? body.status : "in-review" },
    createdAt:  { S: now },
    updatedAt:  { S: now },
    paymentMode: { S: paymentMode }
  };

  // Non-PHI scalars — copy through with the same S/N typing the reader
  // already understands. Must stay in sync with the credimed-claim-
  // submitter Lambda's PASSTHROUGH list — anything the submitter
  // reads at fax-generation time must be persisted here at claim-
  // creation time, otherwise the row reads back blank and the ADA
  // form ships with empty fields (provider info, patient address,
  // DOB, etc.).
  const STRING_FIELDS = [
    // Core claim metadata
    "plan", "city", "paidCurrency", "submittedAt", "paidAt", "deniedAt",
    // Patient subscriber-side fields (also stored in user profile, but
    // needed on the claim row so the submitter can render the ADA form
    // without round-tripping to the users table)
    "dob", "gender", "groupNumber", "employer", "relationship",
    "subscriberFirstName", "subscriberLastName", "subscriberDob",
    // Patient mailing address
    "addrStreet", "addrApt", "addrCity", "addrState", "addrZip",
    // Mexican dental clinic — ADA J430D Box 48 (Billing Dentist) +
    // Boxes 53-58 (Treating Dentist)
    "providerName", "providerAddress", "providerCity", "providerState",
    "providerZip", "providerPhone", "providerRFC", "providerNPI",
    "providerLicense", "providerSpecialty", "treatingDentistName",
    // Date of service — top of ADA Record of Services
    "dateOfService", "payerId"
  ];
  for (const f of STRING_FIELDS) {
    if (body[f] != null && body[f] !== "") item[f] = { S: String(body[f]) };
  }
  const NUMBER_FIELDS = ["paidAmount", "paidAmountUSD", "estimateMin", "estimateMax"];
  for (const f of NUMBER_FIELDS) {
    if (body[f] != null && !Number.isNaN(Number(body[f]))) {
      item[f] = { N: String(Number(body[f])) };
    }
  }
  if (Array.isArray(body.procedures) && body.procedures.length > 0) {
    item.procedures = { S: JSON.stringify(body.procedures) };
  }
  // Patient signature — captured on the agreement.html canvas before
  // payment. Stored as a Map so we can keep the ADA data URL and the
  // POA data URL separately if they ever diverge (today they're the
  // same image embedded in both PDFs). The submitter reads
  // r.Item.signature.M.adaDataUrl.S and embeds it in the patient-
  // signature box on field 36 of the ADA form and on the POA's
  // signature line.
  if (body.signature && typeof body.signature === "object") {
    const sigMap = {};
    if (body.signature.adaDataUrl) sigMap.adaDataUrl = { S: String(body.signature.adaDataUrl) };
    if (body.signature.poaDataUrl) sigMap.poaDataUrl = { S: String(body.signature.poaDataUrl) };
    if (Object.keys(sigMap).length > 0) {
      item.signature = { M: sigMap };
    }
  }

  // PHI — encrypt in parallel. Empty/missing fields return null and are
  // simply not written, keeping the row minimal.
  const phi = await Promise.all(ENCRYPTED_FIELDS.map(async (field) => {
    const val = body[field];
    const enc = await encryptField(val);
    return [field, enc];
  }));
  for (const [field, enc] of phi) {
    if (enc) item[field] = { S: enc };
  }

  try {
    await db.send(new PutItemCommand({
      TableName: TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(claimId)"
    }));
    return { ok: true, claimId, createdAt: now, status: item.status.S, paymentMode };
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    // A row already exists for this claimId. Treat same-user re-submits
    // as idempotent success (returns the existing row); cross-user
    // collisions as 409.
    const existing = await db.send(new GetItemCommand({
      TableName: TABLE,
      Key: { claimId: { S: claimId } }
    }));
    if (existing.Item?.userId?.S === userId) {
      return {
        ok: true,
        claimId,
        createdAt: existing.Item.createdAt?.S || now,
        status: existing.Item.status?.S || "in-review",
        paymentMode: existing.Item.paymentMode?.S || "live",
        idempotent: true
      };
    }
    return { error: "claimId already in use", code: 409 };
  }
}

async function listAllClaims() {
  const items = [];
  let lastKey;
  do {
    const r = await db.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: lastKey,
      Limit: 100
    }));
    if (r.Items) items.push(...r.Items);
    lastKey = r.LastEvaluatedKey;
    // Safety cap until we add a status-indexed GSI for admin queries.
    if (items.length >= 500) break;
  } while (lastKey);
  const claims = await Promise.all(items.map(decryptItem));
  claims.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return { claims, count: claims.length };
}

// Plan-fee mapping for the money-back refund amount. Mirror with the
// PLANS const in the payment Lambda — these must stay in sync.
const PLAN_FEE_USD = { micro: 19, lite: 29, standard: 49, plus: 79, premium: 99 };

/**
 * Issue a Stripe refund for the patient's submission fee.
 *
 * Money-back guarantee path: when admin marks a claim 'refunded',
 * the patient gets their plan fee back on the original card.
 *
 * Idempotency: the Idempotency-Key header is set per claim id so a
 * double-click on the admin "Refund" button never charges twice —
 * Stripe returns the same refund object on retry.
 *
 * Returns:
 *   { ok: true, refundId, status }   — Stripe accepted the refund
 *   { skipped: true }                 — flag off, no API call made
 *   { error: 'reason', detail? }     — failed; caller decides whether
 *                                       to roll back the status update
 */
async function processStripeRefund({ paymentIntentId, amountUsd, claimId }) {
  if (!STRIPE_REFUND_ENABLED) {
    console.log(`[refund:${claimId}] STRIPE_REFUND_ENABLED=false, skipping Stripe API call`);
    return { skipped: true };
  }
  if (!STRIPE_SECRET_KEY) {
    console.warn(`[refund:${claimId}] STRIPE_SECRET_KEY env var not set`);
    return { error: "no-stripe-key" };
  }
  if (!paymentIntentId) {
    console.warn(`[refund:${claimId}] no stripePaymentIntentId on claim — payment may have never landed`);
    return { error: "no-payment-intent" };
  }

  const body = new URLSearchParams({
    payment_intent: paymentIntentId,
    amount: String(Math.round(amountUsd * 100)),
    reason: "requested_by_customer",
    "metadata[claimId]": claimId,
    "metadata[source]": "credimed-money-back-guarantee"
  });

  try {
    const res = await fetch(`${STRIPE_API_BASE}/refunds`, {
      method: "POST",
      headers: {
        "Authorization":   `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type":    "application/x-www-form-urlencoded",
        "Stripe-Version":  STRIPE_API_VERSION,
        "Idempotency-Key": `refund_${claimId}`
      },
      body
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[refund:${claimId}] Stripe ${res.status}:`, data);
      return { error: "stripe-error", detail: data.error?.message || `HTTP ${res.status}` };
    }
    console.log(`[refund:${claimId}] Stripe refund issued: ${data.id} (${data.status})`);
    return { ok: true, refundId: data.id, status: data.status };
  } catch (e) {
    console.error(`[refund:${claimId}] Stripe fetch failed:`, e.message);
    return { error: "fetch-failed", detail: e.message };
  }
}

async function updateStatus(claimId, newStatus, extras = {}) {
  /* If the admin is recording a manual fax confirmation but didn't
     pass a status explicitly, default to "submitted_to_carrier" so the
     UI doesn't have to send both fields every time. The "Mark as
     faxed" admin button uses this. */
  if (!newStatus && extras.faxConfirmationId) {
    newStatus = "submitted_to_carrier";
  }

  if (!ALLOWED_STATUSES.has(newStatus)) {
    return {
      error: "Invalid status. Allowed: " + [...ALLOWED_STATUSES].join(", "),
      code: 400
    };
  }
  const existing = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } }
  }));
  if (!existing.Item) return { error: "Claim not found", code: 404 };

  const now = new Date().toISOString();
  const isRefund = newStatus === "refunded";
  const plan = existing.Item.plan?.S || "standard";
  const refundAmount = PLAN_FEE_USD[plan] || PLAN_FEE_USD.standard;

  // Money-back path: try Stripe FIRST. If the Stripe call errors with
  // the flag on, bail before the DB update + email so the patient
  // doesn't get notified of a refund that didn't happen. Skipped
  // (flag off) and Ok both proceed normally — Skipped is the safe
  // pre-launch default that preserves today's behavior.
  let stripeRefund = null;
  if (isRefund) {
    stripeRefund = await processStripeRefund({
      paymentIntentId: existing.Item.stripePaymentIntentId?.S,
      amountUsd: refundAmount,
      claimId
    });
    if (stripeRefund.error) {
      return {
        error: `Stripe refund failed: ${stripeRefund.detail || stripeRefund.error}`,
        code: 502
      };
    }
  }

  // The refund path stamps refundedAt + refundAmount + refundStatus
  // alongside the status so the admin Refunds tab and the patient
  // dashboard can render the money-back without re-deriving from
  // status alone. When Stripe successfully issued a refund (flag on),
  // the refund id and Stripe status are also persisted for audit.
  let updateExpr = "SET #s = :s, updatedAt = :u";
  const exprValues = {
    ":s": { S: newStatus },
    ":u": { S: now }
  };
  if (isRefund) {
    updateExpr += ", refundedAt = :ra, refundAmount = :ramt, refundStatus = :rs";
    exprValues[":ra"]   = { S: now };
    exprValues[":ramt"] = { N: String(refundAmount) };
    exprValues[":rs"]   = { S: "refunded" };
    if (stripeRefund?.ok) {
      updateExpr += ", stripeRefundId = :sri, stripeRefundStatus = :srs";
      exprValues[":sri"] = { S: stripeRefund.refundId };
      exprValues[":srs"] = { S: stripeRefund.status };
    }
  }

  /* Manual-fax admin path: when the operator has faxed the bundle
     from the WestFax web portal and pastes the confirmation back
     into the admin console, persist faxConfirmationId + faxedAt +
     submissionNotes alongside the status transition. */
  if (extras.faxConfirmationId) {
    updateExpr += ", faxConfirmationId = :fcid, faxedAt = :fat, faxSource = :fsrc";
    exprValues[":fcid"] = { S: String(extras.faxConfirmationId) };
    exprValues[":fat"]  = { S: extras.faxedAt || now };
    exprValues[":fsrc"] = { S: "manual_admin" };
  }
  if (extras.submissionNotes) {
    updateExpr += ", submissionNotes = :snotes";
    exprValues[":snotes"] = { S: String(extras.submissionNotes).slice(0, 500) };
  }

  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: exprValues
  }));

  // Notify the patient that their status changed. PHI never leaves the
  // database — the email contains only a generic claim ID and a link
  // to the authenticated app where the detail lives. Email failure is
  // logged but does not roll back the status update.
  try {
    const tplName = templateForStatus(newStatus);
    if (tplName) {
      const email = await decryptField(existing.Item.email?.S);
      const firstName = await decryptField(existing.Item.firstName?.S);
      if (email && email !== "[DECRYPTION_ERROR]") {
        const data = { firstName: firstName || "", claimId };
        if (isRefund) data.amountUsd = refundAmount;
        if (newStatus === "needs-docs") {
          if (extras.docTypeNeeded)  data.docTypeNeeded  = extras.docTypeNeeded;
          if (extras.docDescription) data.docDescription = extras.docDescription;
        }
        await sendEmailSafely({
          to: email,
          eventType: tplName,
          data
        });
      }
    }
  } catch (err) {
    console.error("[updateStatus] email side-effect failed:", err.message);
  }

  const result = { ok: true, claimId, status: newStatus, updatedAt: now };
  if (isRefund) {
    result.refundAmount = refundAmount;
    result.refundedAt = now;
    if (stripeRefund?.ok) {
      result.stripeRefundId = stripeRefund.refundId;
      result.stripeRefundStatus = stripeRefund.status;
    } else if (stripeRefund?.skipped) {
      result.stripeRefundSkipped = true;
    }
  }
  return result;
}

/**
 * Persist an admin review decision for later training data analysis.
 * Schema:
 *   { reviewId (PK), claimId, reviewerId, reviewedAt,
 *     decision, decisionReason, decisionNote (optional),
 *     aiExtraction, humanCorrection, fieldDiff,
 *     timeSpentSeconds, documentsViewed }
 *
 * fieldDiff is computed server-side as a quick {field: [aiValue, humanValue]}
 * map so analytics queries don't have to re-derive it. We accept the raw
 * blobs from the client because the AI extraction lives in the claim row
 * (or wherever the OCR Lambda eventually writes it) and the corrections
 * come from the reviewer's edits in the dashboard.
 */
async function saveReviewDecision(claimId, reviewerId, body) {
  const decision = String(body.decision || "");
  const decisionReason = String(body.decisionReason || "");

  if (!ALLOWED_REVIEW_DECISIONS.has(decision)) {
    return {
      error: "Invalid decision. Allowed: " + [...ALLOWED_REVIEW_DECISIONS].join(", "),
      code: 400
    };
  }
  if (!ALLOWED_DECISION_REASONS.has(decisionReason)) {
    return {
      error: "Invalid decisionReason. Allowed: " + [...ALLOWED_DECISION_REASONS].join(", "),
      code: 400
    };
  }
  if (decisionReason === "other" && !String(body.decisionNote || "").trim()) {
    return { error: "decisionNote is required when decisionReason='other'", code: 400 };
  }

  // Diff what the AI proposed vs what the reviewer saved. Only fields
  // that actually differ end up in the diff — keeps the row compact.
  const ai = body.aiExtraction    || {};
  const hu = body.humanCorrection || {};
  const fieldDiff = {};
  const allFields = new Set([...Object.keys(ai), ...Object.keys(hu)]);
  for (const f of allFields) {
    const a = ai[f]; const h = hu[f];
    if (String(a ?? "") !== String(h ?? "")) {
      fieldDiff[f] = [a == null ? null : String(a), h == null ? null : String(h)];
    }
  }

  const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const timeSpent = Number(body.timeSpentSeconds) || 0;
  const docsViewed = Array.isArray(body.documentsViewed) ? body.documentsViewed : [];

  await db.send(new PutItemCommand({
    TableName: REVIEW_TABLE,
    Item: {
      reviewId:        { S: reviewId },
      claimId:         { S: claimId },
      reviewerId:      { S: reviewerId },
      reviewedAt:      { S: now },
      decision:        { S: decision },
      decisionReason:  { S: decisionReason },
      decisionNote:    { S: String(body.decisionNote || "") },
      aiExtraction:    { S: JSON.stringify(ai) },
      humanCorrection: { S: JSON.stringify(hu) },
      fieldDiff:       { S: JSON.stringify(fieldDiff) },
      timeSpentSeconds:{ N: String(Math.max(0, Math.round(timeSpent))) },
      documentsViewed: { S: JSON.stringify(docsViewed) }
    }
  }));

  return {
    ok: true,
    reviewId,
    claimId,
    decision,
    decisionReason,
    diffFieldCount: Object.keys(fieldDiff).length,
    reviewedAt: now
  };
}

// ---------- main handler ----------

/**
 * HIPAA audit logging — every PHI access logs WHO, WHAT (claim IDs),
 * WHEN, FROM WHERE (IP), and ACTION TYPE. Logs persist in CloudWatch
 * indefinitely (or per the log group's retention setting). For breach
 * analysis these logs must be queryable; CloudWatch Logs Insights uses
 * the JSON structure below.
 */
function audit(event, fields) {
  const ctx = event.requestContext || {};
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId: ctx.requestId,
    sourceIp:  ctx.http?.sourceIp,
    userAgent: ctx.http?.userAgent,
    ...fields
  }));
}

export const handler = async (event) => {
  // Local response() binds the per-request event so corsHeaders can
  // echo the right Origin without threading event through every call.
  const response = (statusCode, body) => buildResponse(statusCode, body, event);
  try {
    const method = event.requestContext?.http?.method || "GET";
    if (method === "OPTIONS") return response(204, {});

    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) {
      return response(401, { error: "Authentication required" });
    }
    const userId    = claims.sub;
    const adminUser = isAdmin(claims);

    const routeKey = event.routeKey || "";
    const path     = event.requestContext?.http?.path || event.rawPath || "";
    const id       = event.pathParameters?.id;

    // ---- ADMIN ROUTES (gated) ----

    if (routeKey === "GET /admin/claims"
        || (method === "GET" && /^\/admin\/claims\/?$/.test(path))) {
      if (!adminUser) {
        audit(event, { event: "admin_forbidden", userId, path });
        return response(403, { error: "Admin group required" });
      }
      const out = await listAllClaims();
      audit(event, {
        event: "admin_list_claims",
        adminUserId: userId,
        count: out.count,
        claimIds: out.claims.map((c) => c.claimId)
      });
      return response(200, out);
    }

    if (routeKey === "PATCH /admin/claims/{id}"
        || (method === "PATCH" && /^\/admin\/claims\/[^\/]+\/?$/.test(path))) {
      if (!adminUser) {
        audit(event, { event: "admin_forbidden", userId, path });
        return response(403, { error: "Admin group required" });
      }
      if (!id) return response(400, { error: "Missing claim id" });
      let body;
      try { body = event.body ? JSON.parse(event.body) : {}; }
      catch { return response(400, { error: "Invalid JSON body" }); }
      const result = await updateStatus(id, body.status, {
        docTypeNeeded:     body.docTypeNeeded,
        docDescription:    body.docDescription,
        faxConfirmationId: body.faxConfirmationId,
        faxedAt:           body.faxedAt,
        submissionNotes:   body.submissionNotes
      });
      if (result.error) return response(result.code || 400, { error: result.error });
      audit(event, {
        event: "admin_update_claim",
        adminUserId: userId,
        claimId: id,
        newStatus: body.status,
        stripeRefundId: result.stripeRefundId,
        stripeRefundStatus: result.stripeRefundStatus,
        stripeRefundSkipped: result.stripeRefundSkipped
      });
      return response(200, result);
    }

    if (routeKey === "POST /admin/claims/{id}/review"
        || (method === "POST" && /^\/admin\/claims\/[^\/]+\/review\/?$/.test(path))) {
      if (!adminUser) {
        audit(event, { event: "admin_forbidden", userId, path });
        return response(403, { error: "Admin group required" });
      }
      // The id comes from pathParameters when route is matched directly, but
      // when matched by regex (legacy proxy) we pull it from the path.
      const reviewClaimId = id || (path.match(/^\/admin\/claims\/([^\/]+)\/review/) || [])[1];
      if (!reviewClaimId) return response(400, { error: "Missing claim id" });
      let body;
      try { body = event.body ? JSON.parse(event.body) : {}; }
      catch { return response(400, { error: "Invalid JSON body" }); }
      const result = await saveReviewDecision(reviewClaimId, userId, body);
      if (result.error) return response(result.code || 400, { error: result.error });
      audit(event, {
        event: "admin_review_decision",
        adminUserId: userId,
        claimId: reviewClaimId,
        reviewId: result.reviewId,
        decision: result.decision,
        decisionReason: result.decisionReason,
        diffFieldCount: result.diffFieldCount
      });
      return response(200, result);
    }

    // ---- USER ROUTES ----

    if (routeKey === "GET /claims/{id}"
        || (method === "GET" && /^\/claims\/[^\/]+\/?$/.test(path))) {
      if (!id) return response(400, { error: "Missing claim id" });
      const claim = await getOneClaim(id, userId, adminUser);
      if (claim === null)        return response(404, { error: "Claim not found" });
      if (claim === "forbidden") {
        audit(event, { event: "claim_forbidden", userId, claimId: id });
        return response(403, { error: "Forbidden" });
      }
      audit(event, {
        event: "get_claim",
        userId,
        claimId: id,
        viewedAsAdmin: adminUser && claim.userId !== userId
      });
      return response(200, { claim });
    }

    if (routeKey === "GET /claims"
        || (method === "GET" && /^\/claims\/?$/.test(path))) {
      const out = await listUserClaims(userId);
      audit(event, {
        event: "list_claims",
        userId,
        count: out.count,
        claimIds: out.claims.map((c) => c.claimId)
      });
      return response(200, out);
    }

    if (routeKey === "POST /claims"
        || (method === "POST" && /^\/claims\/?$/.test(path))) {
      let body;
      try { body = event.body ? JSON.parse(event.body) : null; }
      catch { return response(400, { error: "Invalid JSON body" }); }
      const result = await createClaim(userId, body, adminUser);
      if (result.error) return response(result.code || 400, { error: result.error });
      audit(event, {
        event: "create_claim",
        userId,
        claimId: result.claimId,
        idempotent: !!result.idempotent,
        paymentMode: result.paymentMode
      });
      return response(result.idempotent ? 200 : 201, result);
    }

    return response(404, { error: "Route not found", routeKey, path });

  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { error: "Internal server error" });
  }
};
