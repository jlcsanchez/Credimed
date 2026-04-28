/**
 * credimed-get-claims (Lambda) — extended for admin
 *
 * Single Lambda that handles ALL claim-read + admin endpoints. Routes:
 *
 *   GET   /claims              — list user's own claims (preserves existing behavior)
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
 * amount are KMS-encrypted at rest by credimed-save-claim. They are
 * decrypted on read using the same key. The Lambda's IAM role must have
 * kms:Decrypt on that key.
 *
 * Admin gate: the JWT's cognito:groups claim must include "admin".
 */

import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  ScanCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
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
  "submitted", "in-review", "approved", "paid", "denied", "refunded"
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
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
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
                       "submittedAt", "paidAt", "deniedAt"];
  for (const f of PASSTHROUGH) {
    if (item[f]?.S != null) claim[f] = item[f].S;
    else if (item[f]?.N != null) claim[f] = Number(item[f].N);
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

async function updateStatus(claimId, newStatus) {
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
      const result = await updateStatus(id, body.status);
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

    return response(404, { error: "Route not found", routeKey, path });

  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { error: "Internal server error" });
  }
};
