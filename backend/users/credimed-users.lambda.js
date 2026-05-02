/**
 * credimed-users (Lambda) — patient profile persistence
 *
 * Routes:
 *   GET   /profile  — read the signed-in user's profile (address, banking, prefs)
 *   PATCH /profile  — partial update (only fields present in body change)
 *
 * Why this exists:
 *   - Cognito stores given_name, family_name, email, phone_number, birthdate
 *     as standard user attributes. Those follow the user across devices.
 *   - But Cognito phone_number rejects non-US numbers, and there's no
 *     standard attribute for mailing address, banking, or notification
 *     preferences. Storing those in localStorage means they vanish on
 *     storage clear / device switch / iOS Safari ITP purge.
 *   - This Lambda + the credimed-users DynamoDB table fill that gap.
 *
 * Schema:
 *   Table: credimed-users
 *     PK: email (S)            ← Cognito JWT.email claim, source of truth
 *     userId (S)               ← Cognito sub; verified on read to defeat
 *                                email-rebind attacks (user A claims an
 *                                email that user B previously bound)
 *     updatedAt (S, ISO)
 *
 *   Address (plaintext — low-sensitivity, customer convenience):
 *     addrStreet, addrApt, addrCity, addrState, addrZip
 *
 *   Banking (KMS-encrypted — financial PII):
 *     bankHolder, bankRouting, bankAccount
 *   Banking (plaintext — non-sensitive):
 *     bankName, bankType
 *
 *   Phone (free-text, plaintext — Cognito rejects non-US, this doesn't):
 *     phoneRaw    e.g., "+52 55 1234 5678" or "(617) 803-3831"
 *
 *   Notifications (booleans, plaintext):
 *     notifClaimUpdates, notifPaymentUpdates, notifTipsAndGuides
 *
 * IAM: kms:Encrypt + kms:Decrypt on KMS_KEY_ID,
 *      dynamodb:GetItem + dynamodb:UpdateItem on credimed-users.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

const db  = new DynamoDBClient({ region: "us-west-2" });
const kms = new KMSClient({ region: "us-west-2" });

const TABLE       = "credimed-users";
const KMS_KEY_ID  = process.env.KMS_KEY_ID || "";

const ALLOWED_ORIGINS = new Set([
  "https://credimed.us",
  "https://www.credimed.us",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

// Field categories. Add new fields here once and the read/write paths
// pick them up automatically.
const ADDRESS_FIELDS = [
  "addrStreet", "addrApt", "addrCity", "addrState", "addrZip"
];
const BANK_PLAIN_FIELDS = ["bankName", "bankType"];
const BANK_ENCRYPTED_FIELDS = ["bankHolder", "bankRouting", "bankAccount"];
const PHONE_FIELDS = ["phoneRaw"];
/* Subscriber + claim-review fields captured by claim-review.html
   right before the patient signs. Plain-text — these aren't PHI in the
   strict sense (gender / DOB / employer / group# get printed on the
   ADA form anyway, and the row's PK + userId is already access-gated).
   Matches the field names the frontend sends in PATCH /profile. */
const CLAIM_REVIEW_FIELDS = [
  "dob", "gender", "relationship",
  "groupNumber", "employer",
  "subscriberFirstName", "subscriberLastName", "subscriberDob"
];
// Notification toggle keys — match the frontend's data-notif-key
// attributes verbatim so save/hydrate share one vocabulary.
const NOTIF_FIELDS = [
  "claimStatus", "insurerCorrespondence", "tipsAndGuides"
];

// ---------- helpers ----------

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

async function encryptField(plaintext) {
  if (plaintext == null || plaintext === "") return null;
  if (!KMS_KEY_ID) {
    throw new Error("KMS_KEY_ID env var not set — cannot encrypt sensitive fields");
  }
  const result = await kms.send(new EncryptCommand({
    KeyId: KMS_KEY_ID,
    Plaintext: Buffer.from(String(plaintext), "utf8")
  }));
  return Buffer.from(result.CiphertextBlob).toString("base64");
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
    return "";
  }
}

// ---------- handlers ----------

async function getProfile(email, userId) {
  const r = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key: { email: { S: email } }
  }));
  if (!r.Item) return { profile: null };

  // Email-rebind defense: if the row's userId doesn't match the JWT's
  // sub, the row belonged to a previous owner of this email. Don't
  // expose it. (Cognito allows email change, so the new-email-owner
  // shouldn't see the old-owner's profile.)
  const rowUserId = r.Item.userId?.S;
  if (rowUserId && rowUserId !== userId) {
    console.warn(JSON.stringify({
      event: "profile_orphan_blocked",
      email, requestUserId: userId, rowUserId
    }));
    return { profile: null };
  }

  const profile = { email, userId };
  for (const f of [...ADDRESS_FIELDS, ...BANK_PLAIN_FIELDS, ...PHONE_FIELDS, ...CLAIM_REVIEW_FIELDS]) {
    if (r.Item[f]?.S != null) profile[f] = r.Item[f].S;
  }
  for (const f of NOTIF_FIELDS) {
    if (r.Item[f]?.BOOL != null) profile[f] = r.Item[f].BOOL;
  }
  // Decrypt sensitive fields in parallel.
  await Promise.all(BANK_ENCRYPTED_FIELDS.map(async (f) => {
    if (r.Item[f]?.S) profile[f] = await decryptField(r.Item[f].S);
  }));

  if (r.Item.updatedAt?.S) profile.updatedAt = r.Item.updatedAt.S;
  return { profile };
}

async function patchProfile(email, userId, body) {
  if (!body || typeof body !== "object") {
    return { error: "Missing JSON body", code: 400 };
  }

  // Build UpdateExpression dynamically — only touch fields present in
  // the body so callers can do partial updates without clearing other
  // fields. userId + updatedAt are always stamped.
  const setParts = ["userId = :uid", "updatedAt = :now"];
  const exprValues = {
    ":uid": { S: userId },
    ":now": { S: new Date().toISOString() }
  };
  let i = 0;

  // Plaintext string fields
  for (const f of [...ADDRESS_FIELDS, ...BANK_PLAIN_FIELDS, ...PHONE_FIELDS, ...CLAIM_REVIEW_FIELDS]) {
    if (body[f] != null) {
      const ph = `:v${i++}`;
      setParts.push(`${f} = ${ph}`);
      exprValues[ph] = { S: String(body[f]) };
    }
  }
  // Booleans
  for (const f of NOTIF_FIELDS) {
    if (body[f] != null) {
      const ph = `:v${i++}`;
      setParts.push(`${f} = ${ph}`);
      exprValues[ph] = { BOOL: !!body[f] };
    }
  }
  // KMS-encrypted strings — encrypt in parallel before writing.
  const encPairs = await Promise.all(BANK_ENCRYPTED_FIELDS.map(async (f) => {
    if (body[f] == null) return null;
    const enc = await encryptField(body[f]);
    return enc ? [f, enc] : null;
  }));
  for (const pair of encPairs) {
    if (!pair) continue;
    const [f, enc] = pair;
    const ph = `:v${i++}`;
    setParts.push(`${f} = ${ph}`);
    exprValues[ph] = { S: enc };
  }

  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { email: { S: email } },
    UpdateExpression: `SET ${setParts.join(", ")}`,
    // Same rebind defense on writes: refuse to clobber a row whose
    // userId doesn't match the caller's sub. Allows the no-existing-row
    // case (attribute_not_exists) so first-time saves succeed.
    ConditionExpression: "attribute_not_exists(userId) OR userId = :uid",
    ExpressionAttributeValues: exprValues
  }));

  return { ok: true, email, updatedAt: exprValues[":now"].S };
}

// ---------- main handler ----------

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
  const response = (statusCode, body) => buildResponse(statusCode, body, event);
  try {
    const method = event.requestContext?.http?.method || "GET";
    if (method === "OPTIONS") return response(204, {});

    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub || !claims.email) {
      return response(401, { error: "Authentication required" });
    }
    const userId = claims.sub;
    const email  = String(claims.email).toLowerCase();

    const routeKey = event.routeKey || "";
    const path     = event.requestContext?.http?.path || event.rawPath || "";

    if (routeKey === "GET /profile"
        || (method === "GET" && /^\/profile\/?$/.test(path))) {
      const out = await getProfile(email, userId);
      audit(event, {
        event: "get_profile",
        userId, email,
        hasProfile: !!out.profile
      });
      return response(200, out);
    }

    if (routeKey === "PATCH /profile"
        || (method === "PATCH" && /^\/profile\/?$/.test(path))) {
      let body;
      try { body = event.body ? JSON.parse(event.body) : null; }
      catch { return response(400, { error: "Invalid JSON body" }); }
      try {
        const result = await patchProfile(email, userId, body);
        if (result.error) return response(result.code || 400, { error: result.error });
        audit(event, {
          event: "patch_profile",
          userId, email,
          fields: Object.keys(body || {})
        });
        return response(200, result);
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          audit(event, { event: "profile_rebind_blocked", userId, email });
          return response(409, { error: "Profile belongs to a different account" });
        }
        throw err;
      }
    }

    return response(404, { error: "Route not found", routeKey, path });

  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { error: "Internal server error" });
  }
};
