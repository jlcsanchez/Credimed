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

  return {
    tier,
    price,
    explanation: bullets.slice(0, 4)
  };
}

/* Dual-environment shim: same file works in Node (require) and in the
   browser (<script src> → window.calculatePricing). An un-guarded
   `module.exports = ...` would throw ReferenceError in the browser
   because `module` is not a global, so both sides are guarded. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculatePricing };
}
if (typeof window !== 'undefined') {
  window.calculatePricing = calculatePricing;
}
