// Credimed backend — mock skeleton
// Stack: Node.js + Express. No AWS / Stripe yet — every endpoint returns
// a realistic mock so the frontend can integrate immediately.
//
// The pricing engine is the FROZEN module at app/pricingEngine.js. We
// require it directly (no copy) so there is one source of truth.

const express = require('express');
const cors = require('cors');
const { calculatePricing } = require('./pricingEngine');

const app = express();

/* ---------- middleware ---------- */

// image_base64 payloads can be large — bump the JSON body limit.
app.use(express.json({ limit: '20mb' }));

app.use(cors({
  origin: [
    'https://credimed.us',
    'https://www.credimed.us',
    'http://localhost:3000'
  ]
}));

// Stamp every response with the API version.
app.use((_req, res, next) => {
  res.set('X-Credimed-Version', '1.0');
  next();
});

/* ---------- in-memory mock store ----------
   Lets GET /claims/:id reflect the data accumulated by prior POSTs in
   the same process. Resets on restart — that's fine for the mock phase. */
const claims = new Map();

function nowIso() {
  return new Date().toISOString();
}

function newClaimId() {
  return 'CLM-' + Date.now();
}

function isValidClaimIdFormat(id) {
  return typeof id === 'string' && /^CLM-/.test(id);
}

function require400(res, body, fields) {
  for (const f of fields) {
    if (body == null || body[f] === undefined || body[f] === null || body[f] === '') {
      res.status(400).json({ error: 'missing_field', field: f });
      return true;
    }
  }
  return false;
}

/* The pricing engine returns { tier, price, explanation, debug }.
   debug must NEVER cross the wire — strip it at the boundary. */
function publicPricing(p) {
  return { tier: p.tier, price: p.price, explanation: p.explanation };
}

/* ---------- POST /claims/create ---------- */
app.post('/claims/create', (req, res) => {
  if (require400(res, req.body, ['user_id'])) return;
  const claim = {
    claim_id: newClaimId(),
    user_id: req.body.user_id,
    status: 'created',
    created_at: nowIso()
  };
  claims.set(claim.claim_id, claim);
  res.json(claim);
});

/* ---------- POST /claims/scan-insurance ---------- */
app.post('/claims/scan-insurance', (req, res) => {
  if (require400(res, req.body, ['claim_id', 'image_base64'])) return;
  const { claim_id } = req.body;
  if (!isValidClaimIdFormat(claim_id)) {
    return res.status(404).json({ error: 'claim_not_found', claim_id });
  }
  const mock = {
    claim_id,
    insurer: 'Delta Dental',
    plan_type: 'PPO',
    member_id: 'MOCK-12345',
    status: 'insurance_scanned'
  };
  const existing = claims.get(claim_id) || { claim_id, created_at: nowIso() };
  claims.set(claim_id, Object.assign(existing, mock));
  res.json(mock);
});

/* ---------- POST /claims/scan-receipt ---------- */
app.post('/claims/scan-receipt', (req, res) => {
  if (require400(res, req.body, ['claim_id', 'image_base64'])) return;
  const { claim_id } = req.body;
  if (!isValidClaimIdFormat(claim_id)) {
    return res.status(404).json({ error: 'claim_not_found', claim_id });
  }

  // Mock OCR: 2 procedures, $920 USD, clean confidence, no missing fields.
  // Driving the engine with realistic signals so PLUS comes out — proves
  // the engine is wired in (not a hard-coded tier).
  const mockOcrSignals = {
    num_procedures: 2,
    num_documents: 2,
    ocr_confidence: 0.92,
    has_missing_fields: false,
    has_code_ambiguity: false
  };
  const fullPricing = calculatePricing(mockOcrSignals);

  // SERVER LOG ONLY — debug stays here, never goes out.
  console.log('[scan-receipt]', claim_id, 'pricing.debug:', fullPricing.debug);

  const receipt = {
    total_paid: 920,
    currency: 'USD',
    clinic: 'Dental Clinic Cancún',
    date: '2026-03-15'
  };

  const existing = claims.get(claim_id) || { claim_id, created_at: nowIso() };
  claims.set(claim_id, Object.assign(existing, {
    receipt,
    pricing: publicPricing(fullPricing),
    status: 'receipt_scanned'
  }));

  res.json({
    claim_id,
    receipt,
    pricing: publicPricing(fullPricing),
    status: 'receipt_scanned'
  });
});

/* ---------- GET /claims/:id ---------- */
app.get('/claims/:id', (req, res) => {
  const id = req.params.id;
  if (!isValidClaimIdFormat(id)) {
    return res.status(404).json({ error: 'claim_not_found', claim_id: id });
  }
  const stored = claims.get(id);
  if (stored) {
    return res.json({
      claim_id: stored.claim_id,
      status: stored.status || 'created',
      insurer: stored.insurer || null,
      pricing: stored.pricing || null,
      created_at: stored.created_at
    });
  }
  // Valid format but not in our in-memory store — return a sensible mock
  // so the frontend can develop against any well-formed CLM-* id.
  res.json({
    claim_id: id,
    status: 'receipt_scanned',
    insurer: 'Delta Dental',
    pricing: publicPricing(calculatePricing({
      num_procedures: 2, num_documents: 2, ocr_confidence: 0.92,
      has_missing_fields: false, has_code_ambiguity: false
    })),
    created_at: nowIso()
  });
});

/* ---------- POST /payments/create-intent ---------- */
app.post('/payments/create-intent', (req, res) => {
  if (require400(res, req.body, ['claim_id', 'plan'])) return;
  const { claim_id, plan } = req.body;
  if (!isValidClaimIdFormat(claim_id)) {
    return res.status(404).json({ error: 'claim_not_found', claim_id });
  }
  const PLAN_PRICES = { standard: 49, plus: 79, premium: 99 };
  const amount = PLAN_PRICES[String(plan).toLowerCase()];
  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'invalid_plan', plan });
  }
  res.json({
    client_secret: 'mock_secret_' + Date.now(),
    amount,
    currency: 'usd',
    status: 'mock_intent_created'
  });
});

/* ---------- POST /payments/webhook ---------- */
app.post('/payments/webhook', (_req, res) => {
  // No signature verification yet — that comes when we wire the real
  // Stripe webhook secret. For now this just acknowledges any payload.
  res.json({
    received: true,
    status: 'mock_payment_confirmed'
  });
});

/* ---------- 500 catch-all ---------- */
app.use((err, _req, res, _next) => {
  console.error('[500]', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('credimed backend listening on :' + PORT);
});
