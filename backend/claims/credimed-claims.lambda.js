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

const db  = new DynamoDBClient({ region: "us-west-2" });
const kms = new KMSClient({ region: "us-west-2" });

const ALLOWED_ORIGIN = "https://credimed.us";
const ADMIN_GROUP    = "admin";
const TABLE          = "credimed-claims";
const USER_INDEX     = "userId-createdAt-index";

const ENCRYPTED_FIELDS = [
  "email", "firstName", "lastName",
  "memberId", "insurer", "procedure", "amount"
];

const ALLOWED_STATUSES = new Set([
  "submitted", "in-review", "approved", "paid", "denied"
]);

// ---------- helpers ----------

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Content-Type": "application/json"
    },
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
  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: "SET #s = :s, updatedAt = :u",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: {
      ":s": { S: newStatus },
      ":u": { S: now }
    }
  }));
  return { ok: true, claimId, status: newStatus, updatedAt: now };
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
        newStatus: body.status
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
