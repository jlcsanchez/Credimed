/**
 * Availity API client — OAuth2 + claim submission + response polling.
 *
 * Wraps the Availity Essentials REST API (v1) so the Lambda handler doesn't
 * have to know about auth refresh, retries, or the slightly-quirky multipart
 * encoding Availity uses for EDI uploads.
 *
 * All requests assume:
 *   AVAILITY_CLIENT_ID         — OAuth2 client ID from the Availity dashboard
 *   AVAILITY_CLIENT_SECRET     — OAuth2 client secret
 *   AVAILITY_API_BASE          — defaults to https://api.availity.com
 *   AVAILITY_TOKEN_URL         — defaults to https://api.availity.com/v2/token
 *
 * Until the Trading Partner Agreement is signed and the credentials are
 * provisioned, every method below will throw a clear error with a pointer
 * to AVAILITY_INTEGRATION.md.
 *
 * Native fetch is used (Node 18+ runtime).
 */

"use strict";

const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min — Availity tokens last 1h, refresh early
let cachedToken = null;
let cachedTokenExpiresAt = 0;

function env(name, fallback) {
  const v = process.env[name];
  return v != null && v !== "" ? v : fallback;
}

function requireCreds() {
  const cid = env("AVAILITY_CLIENT_ID");
  const cs  = env("AVAILITY_CLIENT_SECRET");
  if (!cid || !cs) {
    throw new Error(
      "Availity credentials missing. Set AVAILITY_CLIENT_ID and " +
      "AVAILITY_CLIENT_SECRET env vars on the credimed-clearinghouse " +
      "Lambda. See backend/clearinghouse/AVAILITY_INTEGRATION.md for the " +
      "full setup walkthrough."
    );
  }
  return { cid, cs };
}

/**
 * Fetch an OAuth2 access token via the client_credentials grant. Cached
 * in process memory between Lambda invocations (warm starts) for up to
 * 10 minutes — well below Availity's 1h token TTL.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }
  const { cid, cs } = requireCreds();
  const tokenUrl = env("AVAILITY_TOKEN_URL", "https://api.availity.com/v2/token");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cid,
    client_secret: cs,
    scope: "hipaa",   // Availity's HIPAA-eligible scope for EDI submission
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Availity token request failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS;
  return cachedToken;
}

/**
 * Submit an 837D EDI string to Availity for forwarding to a payer.
 *
 * @param {string} ediText      — full 837D interchange (ISA…IEA)
 * @param {object} options
 *   options.batchId           — our batch identifier (echoed back in the 999)
 *   options.payerName         — for log readability ("Aetna Dental")
 *   options.timeoutMs         — request timeout (default 30s)
 *
 * @returns {Promise<object>} {
 *   submissionId,             — Availity's tracking ID
 *   accepted,                 — boolean: did Availity accept the file
 *   ackEdi,                   — 999 EDI text (or null if pending)
 *   submittedAt,              — ISO timestamp from Availity
 *   raw,                      — full response body for debugging
 * }
 */
async function submitClaim(ediText, options) {
  options = options || {};
  if (!ediText || typeof ediText !== "string") {
    throw new Error("submitClaim: ediText must be a non-empty string");
  }

  const token = await getAccessToken();
  const apiBase = env("AVAILITY_API_BASE", "https://api.availity.com");
  const url = `${apiBase}/v1/claims/dental`;
  const timeoutMs = options.timeoutMs || 30000;

  // Availity expects multipart/form-data with the EDI as a file part.
  // We construct it manually to avoid pulling in form-data as a dep.
  const boundary = "----CredimedAvailityBoundary" + Date.now().toString(16);
  const filename = (options.batchId || "claim") + ".edi";

  const parts = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="payerSpaceId"`,
    ``,
    options.payerSpaceId || "default",
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: application/edi-x12`,
    ``,
    ediText,
    `--${boundary}--`,
    ``,
  ];
  const body = parts.join("\r\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Accept: "application/json",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Availity submitClaim failed: HTTP ${res.status} — ${text.slice(0, 500)}`
      );
    }

    const data = await res.json();
    return {
      submissionId: data.id || data.submissionId || null,
      accepted: data.status === "accepted" || data.accepted === true,
      ackEdi: data.functionalAck || null,         // sometimes called 'ack999'
      submittedAt: data.submittedAt || new Date().toISOString(),
      raw: data,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll Availity for the latest claim status. Returns the most recent
 * 277 EDI text for the given submission, if available.
 *
 * @param {string} submissionId   — from submitClaim()
 * @returns {Promise<{statusEdi: string|null, statusJson: object, lastUpdated: string}>}
 */
async function getStatus(submissionId) {
  if (!submissionId) throw new Error("getStatus: submissionId required");
  const token = await getAccessToken();
  const apiBase = env("AVAILITY_API_BASE", "https://api.availity.com");

  const res = await fetch(`${apiBase}/v1/claims/dental/${encodeURIComponent(submissionId)}/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    // Submission not yet propagated — Availity sometimes takes 30-60s after
    // accepting a file before status endpoints know about it.
    return { statusEdi: null, statusJson: null, lastUpdated: null, pending: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Availity getStatus failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    statusEdi: data.statusEdi || data.x12_277 || null,
    statusJson: data,
    lastUpdated: data.lastUpdated || data.updatedAt || null,
    pending: false,
  };
}

/**
 * Fetch the most recent 835 (remittance advice) for a given submission.
 * Available only after the payer has finalized payment — usually 14-45 days
 * after submission for OON dental claims.
 *
 * @param {string} submissionId
 * @returns {Promise<{remittanceEdi: string|null, lastUpdated: string|null}>}
 */
async function getRemittance(submissionId) {
  if (!submissionId) throw new Error("getRemittance: submissionId required");
  const token = await getAccessToken();
  const apiBase = env("AVAILITY_API_BASE", "https://api.availity.com");

  const res = await fetch(`${apiBase}/v1/claims/dental/${encodeURIComponent(submissionId)}/remittance`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    return { remittanceEdi: null, lastUpdated: null, pending: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Availity getRemittance failed: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    remittanceEdi: data.remittanceEdi || data.x12_835 || null,
    lastUpdated: data.lastUpdated || data.updatedAt || null,
    pending: false,
  };
}

/**
 * Sanity check — ping Availity's health endpoint to confirm credentials work.
 * Used by deploy smoke tests.
 */
async function ping() {
  const token = await getAccessToken();
  const apiBase = env("AVAILITY_API_BASE", "https://api.availity.com");
  const res = await fetch(`${apiBase}/v1/health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

/**
 * Map a Credimed insurer name to the Availity payer ID. The full list lives
 * in AVAILITY_INTEGRATION.md and is updated as we onboard each payer.
 */
const PAYER_IDS = {
  // The list below is illustrative. Real IDs are confirmed during enrollment.
  AETNA:     "60054",
  CIGNA:     "62308",
  DELTA_NJ:  "23166",
  DELTA_CA:  "94276",
  DELTA_NY:  "23166",
  METLIFE:   "65978",
  GUARDIAN:  "64246",
  HUMANA:    "73288",
  UNITED_CONCORDIA: "CX014",
  PRINCIPAL: "61271",
  AMERITAS:  "47009",
};

function getPayerId(insurerName) {
  if (!insurerName) return null;
  const key = String(insurerName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // Try direct match first, then a few common variants
  if (PAYER_IDS[key]) return PAYER_IDS[key];
  if (key.startsWith("AETNA")) return PAYER_IDS.AETNA;
  if (key.startsWith("CIGNA")) return PAYER_IDS.CIGNA;
  if (key.startsWith("DELTA")) return PAYER_IDS.DELTA_CA;   // safest default
  if (key.startsWith("METLIFE") || key.startsWith("MET_LIFE")) return PAYER_IDS.METLIFE;
  if (key.startsWith("GUARDIAN")) return PAYER_IDS.GUARDIAN;
  if (key.startsWith("HUMANA")) return PAYER_IDS.HUMANA;
  if (key.includes("UNITED_CONCORDIA")) return PAYER_IDS.UNITED_CONCORDIA;
  if (key.startsWith("PRINCIPAL")) return PAYER_IDS.PRINCIPAL;
  if (key.startsWith("AMERITAS")) return PAYER_IDS.AMERITAS;
  return null;
}

module.exports = {
  getAccessToken,
  submitClaim,
  getStatus,
  getRemittance,
  ping,
  getPayerId,
  PAYER_IDS,
};
