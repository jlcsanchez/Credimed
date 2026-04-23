const { calculatePricing } = require('./pricingEngine');

const tests = [
  {
    name: "A — input perfecto → STANDARD $49",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "STANDARD", price: 49 }
  },
  {
    name: "B — 2 procedimientos → PLUS $79",
    input: { num_procedures: 2, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PLUS", price: 79 }
  },
  {
    name: "C — 3 procedimientos → PLUS $79",
    input: { num_procedures: 3, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PLUS", price: 79 }
  },
  {
    name: "D — 4 procedimientos → PREMIUM $99",
    input: { num_procedures: 4, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "E — code_ambiguity true → PREMIUM $99",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: true },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "F — ocr 0.45 → PREMIUM $99",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.45, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "G — missing_fields true + ocr limpio → PLUS $79",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.91, has_missing_fields: true,
             has_code_ambiguity: false },
    expect: { tier: "PLUS", price: 79 }
  },
  {
    name: "H — input vacío → PREMIUM $99 (safe default)",
    input: {},
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "I — 3 procedimientos + code_ambiguity → PREMIUM gana",
    input: { num_procedures: 3, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: true },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "M — ocr 0.55 sin otros factores → STANDARD $49",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.55, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "STANDARD", price: 49 }
  },
  {
    name: "N — ocr 0.65 → PLUS $79",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.65, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PLUS", price: 79 }
  },
  {
    name: "O — hard guard: code_ambiguity en PLUS → PREMIUM",
    input: { num_procedures: 2, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: true },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "P — outlier: 15 procedures normalizado → PREMIUM $99",
    input: { num_procedures: 15, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "PREMIUM", price: 99 }
  },
  {
    name: "Q — STANDARD perfecto devuelve exactamente 3 bullets",
    input: { num_procedures: 1, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false },
    expect: { tier: "STANDARD", price: 49, exact_bullets: 3 }
  },
  {
    name: "R — refund bajo $300 + PLUS → downgrade STANDARD",
    input: { num_procedures: 2, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false,
             estimated_refund_min: 167 },
    expect: { tier: "STANDARD", price: 49 }
  },
  {
    name: "S — refund bajo $300 + PREMIUM → downgrade PLUS",
    input: { num_procedures: 4, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false,
             estimated_refund_min: 210 },
    expect: { tier: "PLUS", price: 79 }
  },
  {
    name: "T — refund $300+ no hace downgrade",
    input: { num_procedures: 2, num_documents: 1,
             ocr_confidence: 0.90, has_missing_fields: false,
             has_code_ambiguity: false,
             estimated_refund_min: 350 },
    expect: { tier: "PLUS", price: 79 }
  }
];

// Runner
let passed = 0;
let failed = 0;

tests.forEach(test => {
  const result = calculatePricing(test.input);
  const tierOk = result.tier === test.expect.tier;
  const priceOk = result.price === test.expect.price;
  const bulletsOk = test.expect.exact_bullets
    ? result.explanation.length === test.expect.exact_bullets
    : true;

  if (tierOk && priceOk && bulletsOk) {
    console.log(`✅ PASS — ${test.name}`);
    passed++;
  } else {
    console.log(`❌ FAIL — ${test.name}`);
    console.log(`   Expected: tier=${test.expect.tier} price=${test.expect.price}`);
    console.log(`   Got:      tier=${result.tier} price=${result.price}`);
    if (test.expect.exact_bullets) {
      console.log(`   Bullets expected: ${test.expect.exact_bullets} got: ${result.explanation.length}`);
    }
    failed++;
  }
});

console.log(`\n${passed}/${tests.length} passed · ${failed} failed`);
