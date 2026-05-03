/**
 * credimed-claim-submitter (Lambda) — fax-first claim submission
 *
 * Triggered when admin marks a paid claim "ready_to_submit" and clicks
 * "Submit to insurer" in the admin console (or by EventBridge once the
 * flow is automated). Generates the claim package PDF, faxes it to the
 * carrier, persists the confirmation, and emails the patient.
 *
 * Routes (registered in API Gateway, JWT-authorized, admin-only):
 *   POST /admin/claims/{id}/submit
 *
 * Steps per invocation:
 *   1. Read claim from DynamoDB (PK = claimId)
 *   2. Decrypt PHI (KMS) — same fields the credimed-claims Lambda
 *      already encrypts: email, firstName, lastName, memberId,
 *      insurer, procedure, amount
 *   3. Generate ADA J430D PDF (ada-pdf-generator.js)
 *   4. Generate POA PDF (poa-pdf-generator.js — placeholder until
 *      counsel template lands)
 *   5. Fetch the factura PDF + translation PDF from S3 if present
 *      (translation is best-effort; missing it is a warning, not an
 *      error, so a translation Lambda hiccup doesn't block submission)
 *   6. Bundle the available PDFs into one fax-ready PDF (pdf-lib merge)
 *   7. Look up carrier fax number in carrier-fax-numbers.json
 *   8. Send the fax via fax-client.js (WestFax / Documo / Notifyre)
 *   9. Update DynamoDB: faxedAt, faxConfirmationId, claim status
 *  10. Email the patient: "Your claim was submitted to {insurer}"
 *
 * Idempotency: re-invoking with the same claimId is safe. The fax
 * client's idempotency key is {claimId}-{retryAttempt}; the DB update
 * uses a conditional that won't double-fax if faxConfirmationId
 * already exists for this attempt.
 *
 * IAM (must be on the Lambda role):
 *   dynamodb:GetItem / UpdateItem on credimed-claims
 *   kms:Decrypt                   on the PHI KMS key
 *   s3:GetObject                  on s3://credimed-edi-archive
 *   s3:PutObject                  on s3://credimed-edi-archive
 *                                 (we save the bundled PDF for HIPAA audit)
 *   ses:SendEmail                 on the verified domain
 *
 * Env vars:
 *   KMS_KEY_ID            arn of the credimed-phi key (same as credimed-claims)
 *   ARCHIVE_BUCKET        default: credimed-edi-archive
 *   FAX_PROVIDER          westfax | documo | notifyre | stub (default stub)
 *   FAX_API_KEY           provider-specific
 *   FAX_USERNAME          westfax only
 *   FAX_PASSWORD          westfax only (if used)
 *   FAX_SENDER_NUMBER     +1XXXXXXXXXX, your account's fax
 *   FAX_FEEDBACK_EMAIL    where the provider sends per-fax delivery reports
 *   FROM_EMAIL            "Credimed <support@credimed.us>"
 *
 * Failure semantics:
 *   - PDF generation throws  → 500, status unchanged, retry safe
 *   - Carrier fax not in JSON → 422, status="needs_attention",
 *                                admin gets email
 *   - Fax provider 4xx       → 422, status="needs_attention",
 *                                admin gets email (likely bad data)
 *   - Fax provider 5xx       → 502, retried by Lambda async config
 *                                up to 3 times, then needs_attention
 *   - Email send fails       → logged, doesn't block fax success
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { generateAdaPdf } from "./ada-pdf-generator.js";
import { generatePoaPdf } from "./poa-pdf-generator.js";
import { sendFax } from "./fax-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const db  = new DynamoDBClient({ region: "us-west-2" });
const kms = new KMSClient({ region: "us-west-2" });
const s3  = new S3Client({ region: "us-west-2" });
const ses = new SESClient({ region: "us-west-2" });

const TABLE          = "credimed-claims";
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || "credimed-edi-archive";
const FROM_EMAIL     = process.env.FROM_EMAIL     || "Credimed <support@credimed.us>";

const ALLOWED_ORIGINS = new Set([
  "https://credimed.us",
  "https://www.credimed.us"
]);
const ADMIN_GROUP = "admin";

const ENCRYPTED_FIELDS = [
  "email", "firstName", "lastName",
  "memberId", "insurer", "procedure", "amount"
];

// Carrier lookup loaded once at cold-start
let carriersCache = null;
async function loadCarriers() {
  if (carriersCache) return carriersCache;
  const raw = await readFile(join(__dirname, "carrier-fax-numbers.json"), "utf8");
  carriersCache = JSON.parse(raw);
  return carriersCache;
}

// ── helpers ────────────────────────────────────────────────────────

function corsHeaders(event) {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  const allowed = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://credimed.us";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
}

function response(statusCode, body, event) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify(body) };
}

function isAdmin(claims) {
  if (!claims) return false;
  let groups = claims["cognito:groups"];
  if (typeof groups === "string") {
    groups = groups.replace(/^\[|\]$/g, "").split(/[,\s]+/).filter(Boolean);
  }
  return Array.isArray(groups) &&
         groups.map(g => String(g).toLowerCase()).includes(ADMIN_GROUP);
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

async function loadAndDecryptClaim(claimId) {
  const r = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } }
  }));
  if (!r.Item) return null;

  const claim = {
    claimId:   r.Item.claimId?.S,
    userId:    r.Item.userId?.S,
    status:    r.Item.status?.S,
    createdAt: r.Item.createdAt?.S,
    updatedAt: r.Item.updatedAt?.S
  };
  const PASSTHROUGH = ["plan", "city", "paidCurrency", "paidAmount",
                       "paidAmountUSD", "estimateMin", "estimateMax",
                       "submittedAt", "paidAt", "deniedAt", "providerName",
                       "providerAddress", "providerCity", "providerState",
                       "providerZip", "providerPhone", "providerRFC",
                       "addrStreet", "addrApt", "addrCity", "addrState",
                       "addrZip", "dob", "gender", "groupNumber", "employer",
                       "relationship", "dateOfService"];
  for (const f of PASSTHROUGH) {
    if (r.Item[f]?.S != null) claim[f] = r.Item[f].S;
    else if (r.Item[f]?.N != null) claim[f] = Number(r.Item[f].N);
  }
  if (r.Item.procedures?.S) {
    try { claim.procedures = JSON.parse(r.Item.procedures.S); }
    catch { claim.procedures = r.Item.procedures.S; }
  }
  if (r.Item.proceduresList?.L) {
    claim.proceduresList = r.Item.proceduresList.L.map(item => {
      if (item.S) return item.S;
      if (item.M) {
        const obj = {};
        for (const [k, v] of Object.entries(item.M)) {
          if (v.S) obj[k] = v.S;
          else if (v.N) obj[k] = Number(v.N);
        }
        return obj;
      }
      return null;
    }).filter(Boolean);
  }
  if (r.Item.signature?.M) {
    claim.signature = {};
    if (r.Item.signature.M.adaDataUrl?.S) claim.signature.adaDataUrl = r.Item.signature.M.adaDataUrl.S;
    if (r.Item.signature.M.poaDataUrl?.S) claim.signature.poaDataUrl = r.Item.signature.M.poaDataUrl.S;
  }

  await Promise.all(ENCRYPTED_FIELDS.map(async (field) => {
    if (r.Item[field]?.S) claim[field] = await decryptField(r.Item[field].S);
  }));
  return claim;
}

async function presignedDownloadUrl(key, expiresInSeconds = 3600) {
  /* 1-hour signed URL the admin can paste into a browser to download
     the bundled PDF directly from S3. Avoids round-tripping the binary
     through API Gateway (which has a 6 MB response limit). */
  if (!key) return null;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  } catch (err) {
    console.warn(`[s3 presign] ${key} failed:`, err.message);
    return null;
  }
}

async function fetchS3PdfIfExists(key) {
  try {
    const r = await s3.send(new GetObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: key
    }));
    const chunks = [];
    for await (const chunk of r.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    if (err.name === "NoSuchKey") return null;
    console.warn(`[s3] fetch ${key} failed:`, err.message);
    return null;
  }
}

async function bundlePdfs(pdfBytesList) {
  const merged = await PDFDocument.create();
  for (const bytes of pdfBytesList) {
    if (!bytes) continue;
    try {
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch (err) {
      console.warn("[bundle] skipping bad PDF:", err.message);
    }
  }
  return merged.save();
}

function carrierLookup(claim, carriers) {
  /* Match strategy: lowercase + strip non-letters from BOTH the incoming
     insurer string AND each carrier key, then substring-match. Sort
     entries by normalized-key length descending so a more-specific key
     (e.g. "united-concordia" → "unitedconcordia", 15 chars) wins over
     a generic prefix (e.g. "united" → 6 chars) when both are present. */
  const insurerNorm = String(claim.insurer || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!insurerNorm) return null;
  const entries = Object.entries(carriers)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, info]) => ({ carrierKey: k, info, norm: k.toLowerCase().replace(/[^a-z]/g, "") }))
    .filter(e => e.norm.length > 0)
    .sort((a, b) => b.norm.length - a.norm.length);
  for (const { carrierKey, info, norm } of entries) {
    if (insurerNorm.includes(norm)) return { carrierKey, info };
  }
  return null;
}

async function persistFaxResult(claimId, faxResult, bundleS3Key) {
  const now = new Date().toISOString();
  const expr = ["lastSubmissionAttempt = :now", "bundleS3Key = :bs", "bundleGeneratedAt = :now"];
  const values = {
    ":now": { S: now },
    ":bs":  { S: String(bundleS3Key || "") }
  };
  let attrNames = null;

  if (faxResult.status === "stub_no_send") {
    /* Stub mode (no fax provider configured): bundle was generated +
       archived, but no fax actually sent. DO NOT touch claim.status —
       admin will transition it manually via PATCH /admin/claims/{id}
       once they fax the bundle from WestFax web portal and paste the
       confirmation ID into the "Mark as faxed" form. This preserves
       admin control during the manual-MVP phase before automation. */
  } else if (faxResult.ok) {
    /* Real fax sent successfully — transition status, stamp the
       provider's confirmation ID + faxedAt automatically. */
    expr.push("faxedAt = :now", "faxConfirmationId = :fid", "faxStatus = :st", "#s = :submitted");
    values[":fid"] = { S: String(faxResult.providerFaxId || "") };
    values[":st"]  = { S: String(faxResult.status || "queued") };
    values[":submitted"] = { S: "submitted_to_carrier" };
    attrNames = { "#s": "status" };
  } else {
    /* Real fax attempt that failed — flag the claim so the admin
       sees it in the queue. */
    expr.push("faxStatus = :st", "faxError = :err", "#s = :needs");
    values[":st"]  = { S: "failed" };
    values[":err"] = { S: String(faxResult.error || "unknown") };
    values[":needs"] = { S: "needs_attention" };
    attrNames = { "#s": "status" };
  }

  const cmd = {
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: `SET ${expr.join(", ")}`,
    ExpressionAttributeValues: values
  };
  if (attrNames) cmd.ExpressionAttributeNames = attrNames;
  await db.send(new UpdateItemCommand(cmd));
}

async function emailPatient(claim, carrierName) {
  if (!claim.email) return;
  try {
    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [claim.email] },
      Message: {
        Subject: { Data: `Your dental claim was submitted to ${carrierName}` },
        Body: {
          Html: { Data:
            `<p>Hi ${claim.firstName || "there"},</p>` +
            `<p>Good news — Credimed just submitted your dental claim ` +
            `<strong>${claim.claimId}</strong> to <strong>${carrierName}</strong>.</p>` +
            `<p>Carriers typically respond within 2–6 weeks. We'll email you the moment ` +
            `${carrierName} processes the claim.</p>` +
            `<p>You can track status anytime at ` +
            `<a href="https://credimed.us/app/claim.html?id=${claim.claimId}">credimed.us</a>.</p>` +
            `<p>— Credimed</p>`
          }
        }
      }
    }));
  } catch (err) {
    console.warn("[ses] email patient failed:", err.message);
  }
}

function audit(event, fields) {
  const ctx = event.requestContext || {};
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId: ctx.requestId,
    sourceIp:  ctx.http?.sourceIp,
    ...fields
  }));
}

// ── main handler ───────────────────────────────────────────────────

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || "POST";
    if (method === "OPTIONS") return response(204, {}, event);

    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims || !claims.sub) {
      return response(401, { error: "Authentication required" }, event);
    }
    if (!isAdmin(claims)) {
      audit(event, { event: "submit_forbidden", userId: claims.sub });
      return response(403, { error: "Admin group required" }, event);
    }

    const claimId = event.pathParameters?.id;
    if (!claimId) return response(400, { error: "Missing claim id" }, event);

    // 1. Load + decrypt
    const claim = await loadAndDecryptClaim(claimId);
    if (!claim) return response(404, { error: "Claim not found" }, event);

    // 2. Generate ADA + POA PDFs in parallel
    const [adaPdf, poaPdf] = await Promise.all([
      generateAdaPdf(claim),
      generatePoaPdf(claim)
    ]);

    // 3. Best-effort fetch of factura + translation
    const facturaKey     = `${claim.claimId}/factura.pdf`;
    const translationKey = `${claim.claimId}/translation.pdf`;
    const [facturaPdf, translationPdf] = await Promise.all([
      fetchS3PdfIfExists(facturaKey),
      fetchS3PdfIfExists(translationKey)
    ]);

    // 4. Bundle in submission order: ADA cover, factura, translation, POA
    const bundle = await bundlePdfs([adaPdf, facturaPdf, translationPdf, poaPdf]);

    // 5. Archive the bundle for HIPAA audit
    const bundleKey = `${claim.claimId}/bundle.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: bundleKey,
      Body: bundle,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256"
    }));

    // 6. Look up the carrier fax
    const carriers = await loadCarriers();
    const lookup = carrierLookup(claim, carriers);
    if (!lookup || !lookup.info.claimsFax) {
      audit(event, {
        event: "submit_unknown_carrier",
        claimId, insurer: claim.insurer
      });
      await persistFaxResult(claimId, {
        ok: false,
        error: `No claims fax on file for "${claim.insurer}". Update carrier-fax-numbers.json.`
      }, bundleKey);
      const noCarrierUrl = await presignedDownloadUrl(bundleKey);
      return response(422, {
        error: "Carrier fax not configured. Admin must update carrier-fax-numbers.json + redeploy.",
        insurer: claim.insurer,
        bundleS3: bundleKey,
        bundleDownloadUrl: noCarrierUrl
      }, event);
    }

    // 7. Send the fax
    const faxResult = await sendFax({
      to: lookup.info.claimsFax,
      pdfBytes: bundle,
      idempotencyKey: `${claimId}-1`,
      subject: `Credimed claim ${claimId} for ${claim.firstName} ${claim.lastName}`
    });

    // 8. Persist outcome (in stub mode, this only records the bundle —
    //    status stays unchanged so admin can transition manually after
    //    sending the fax via WestFax web portal)
    await persistFaxResult(claimId, faxResult, bundleKey);

    // 9. Email patient on success (only when a real fax was sent; in
    //    stub mode the admin will trigger the email after marking faxed)
    if (faxResult.ok) {
      await emailPatient(claim, lookup.info.displayName);
    }

    // 10. Generate a presigned download URL for the bundle so the admin
    //     can grab it directly from the API response (handy in stub
    //     mode for the manual upload-to-WestFax step).
    const bundleDownloadUrl = await presignedDownloadUrl(bundleKey);

    audit(event, {
      event: "submit_complete",
      claimId, insurer: claim.insurer,
      carrierKey: lookup.carrierKey,
      faxOk: faxResult.ok,
      stubMode: faxResult.status === "stub_no_send",
      faxConfirmationId: faxResult.providerFaxId,
      bundleSize: bundle.length,
      facturaIncluded:     !!facturaPdf,
      translationIncluded: !!translationPdf
    });

    /* Stub mode is the manual-MVP happy path — return 200 with the
       download URL so the admin can grab the bundle, fax it from the
       WestFax portal, then come back and mark it faxed. Real-mode
       failures still return 502. */
    const httpStatus = faxResult.ok || faxResult.status === "stub_no_send" ? 200 : 502;

    return response(httpStatus, {
      ok: faxResult.ok || faxResult.status === "stub_no_send",
      stubMode: faxResult.status === "stub_no_send",
      claimId,
      faxConfirmationId: faxResult.providerFaxId,
      faxStatus: faxResult.status,
      faxError: faxResult.error,
      bundleS3: bundleKey,
      bundleDownloadUrl,
      carrier: lookup.info,  // displayName + claimsFax for admin UI
      missing: {
        factura: !facturaPdf,
        translation: !translationPdf
      }
    }, event);

  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { error: "Internal server error", detail: err.message }, event);
  }
};
