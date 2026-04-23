// Credimed Pricing Engine v1.0
// Pricing based on claim complexity, not refund amount.
// PREMIUM evaluated first — highest tier always wins.
// Safe default: missing data → assume worst case.

function calculatePricing(input = {}) {

  const sanitizeNumber = (value, fallback) =>
    typeof value === "number" && !isNaN(value) ? value : fallback;

  const sanitizeBoolean = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;

  let num_procedures = sanitizeNumber(input.num_procedures, 4);
  let num_documents = sanitizeNumber(input.num_documents, 3);
  let ocr_confidence = sanitizeNumber(input.ocr_confidence, 0.4);
  let has_missing_fields = sanitizeBoolean(input.has_missing_fields, true);
  let has_code_ambiguity = sanitizeBoolean(input.has_code_ambiguity, true);

  const ocr = Math.max(0, Math.min(1, ocr_confidence));
  num_procedures = Math.min(num_procedures, 10);
  num_documents = Math.min(num_documents, 10);

  const triggered_rules = [];
  if (num_procedures >= 4) triggered_rules.push("num_procedures>=4");
  if (ocr < 0.5) triggered_rules.push("ocr<0.50");
  if (has_code_ambiguity) triggered_rules.push("has_code_ambiguity=true");
  if (num_documents >= 3) triggered_rules.push("num_documents>=3");
  if (num_procedures >= 2 && num_procedures <= 3)
    triggered_rules.push(`num_procedures=${num_procedures}`);
  if (ocr >= 0.65 && ocr < 0.85)
    triggered_rules.push(`ocr=${ocr.toFixed(2)}`);
  if (has_missing_fields)
    triggered_rules.push("has_missing_fields=true");

  const isPremium =
    num_procedures >= 4 ||
    ocr < 0.5 ||
    has_code_ambiguity === true ||
    num_documents >= 3;

  const isPlus =
    (num_procedures >= 2 && num_procedures <= 3) ||
    (ocr >= 0.65 && ocr < 0.85) ||
    has_missing_fields === true;

  let tier, price;

  if (isPremium) { tier = "PREMIUM"; price = 99; }
  else if (isPlus) { tier = "PLUS"; price = 79; }
  else { tier = "STANDARD"; price = 49; }

  if (tier !== "PREMIUM" && has_code_ambiguity === true) {
    tier = "PREMIUM";
    price = 99;
  }

  const bullets = [];

  if (has_code_ambiguity)
    bullets.push("Detailed coding review to match your insurer's requirements");
  if (num_procedures > 1)
    bullets.push("Multiple procedures carefully prepared for your claim");
  if (has_missing_fields)
    bullets.push("We'll help organize all required information for submission");
  if (num_documents > 1)
    bullets.push("Multiple documents combined into a complete claim package");
  if (ocr < 0.85)
    bullets.push("Extra review to ensure all details are accurately captured");

  const FALLBACK_BULLETS = [
    "Your claim will be reviewed by our team before submission",
    "We verify all details before submitting to your insurer",
    "Our team ensures your claim meets your insurer's requirements"
  ];

  let i = 0;
  while (bullets.length < 3 && i < FALLBACK_BULLETS.length) {
    if (!bullets.includes(FALLBACK_BULLETS[i])) bullets.push(FALLBACK_BULLETS[i]);
    i++;
  }

  const explanation = bullets.slice(0, 4);

  let ocr_bucket;
  if (ocr >= 0.85) ocr_bucket = ">=0.85";
  else if (ocr >= 0.65) ocr_bucket = "0.65-0.84";
  else if (ocr >= 0.5) ocr_bucket = "0.50-0.64";
  else ocr_bucket = "<0.50";

  const confidence_level =
    tier === "STANDARD" ? "HIGH" :
    tier === "PLUS" ? "MEDIUM" : "LOW";

  return {
    tier,
    price,
    explanation,
    debug: { triggered_rules, ocr_bucket, confidence_level }
  };
}

module.exports = { calculatePricing };
