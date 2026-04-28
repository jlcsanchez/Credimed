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

  /* ------ Step 1: pick tier by complexity ------
     Same logic as before — work-required signals (procedures, docs,
     OCR confidence, code ambiguity, missing fields) decide which tier
     fits the claim's effort. The refund-amount cap below trims down
     when fees would be an unreasonable share of the refund. */
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

  /* ------ Step 2: 20% cap by expected refund average ------
     The fee should never exceed 20% of the refund the patient
     actually expects to recover. The cap is a TRUST mechanism, not
     a monetization mechanism — the flat tier prices ($19/$29/$49/
     $79/$99) already do the monetization work. The cap exists to
     make the fee feel fair instantly to the patient, and to give
     us a clean defensible promise ("we never take more than 1/5 of
     your refund") vs claims agents who charge 30-40%.

     Computed against the AVERAGE of the refund range (min + max / 2)
     so we don't penalize the patient for our own conservative low
     end. Falls back gracefully when only `_min` is provided
     (older callers).

     Tier ladder for the cap, fee-ascending:
       MICRO     $19  → refund_avg >= $95   (fee = 20% of refund)
       LITE      $29  → refund_avg >= $145
       STANDARD  $49  → refund_avg >= $245
       PLUS      $79  → refund_avg >= $395
       PREMIUM   $99  → refund_avg >= $495

     MICRO is the new floor — claims with refund_avg < $95 still get
     MICRO $19 (we never go below). $19 comfortably covers our
     marginal cost per claim (Stripe ~$0.87, Lambda + infra
     negligible, money-back guarantee provision ~$1.90 at a 10%
     fail rate) — leaving healthy margin even on the smallest
     refund. Adding MICRO lets us honor the 20% cap as a marketing
     claim in 99.9% of cases (vs ~99% with LITE alone) — and
     unlocks 'from $19' as a stronger landing-page anchor than
     'from $29'. */
  const refundMin = sanitizeNumber(input.estimated_refund_min, null);
  const refundMax = sanitizeNumber(input.estimated_refund_max, null);
  let refundAvg = null;
  if (refundMin != null && refundMax != null) {
    refundAvg = (refundMin + refundMax) / 2;
  } else if (refundMin != null) {
    /* Caller didn't pass max — assume max ≈ min × 1.33 (matches the
       55-80% of paidUSD range used by documents.html). */
    refundAvg = refundMin * 1.165;
  }

  if (refundAvg != null && refundAvg > 0) {
    const maxFeeFromCap = refundAvg * 0.20;
    /* Walk the tier ladder DOWN until the price fits under the cap.
       Floor at MICRO $19 — never drop below, even if the cap would
       require it (otherwise we'd lose money on the claim). */
    if (price > maxFeeFromCap) {
      if (maxFeeFromCap >= 99)      { tier = "PREMIUM";  price = 99; }
      else if (maxFeeFromCap >= 79) { tier = "PLUS";     price = 79; }
      else if (maxFeeFromCap >= 49) { tier = "STANDARD"; price = 49; }
      else if (maxFeeFromCap >= 29) { tier = "LITE";     price = 29; }
      else                          { tier = "MICRO";    price = 19; }
    }
  }

  /* ------ Step 3: bullets (same as before, plus a Lite-aware copy) ------ */
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

  /* ------ Step 4: edge-case flag for refund-too-small-for-cap ------
     When refund_avg × 20% is less than our $29 floor, the LITE fee
     ends up at a higher % of the patient's refund than our usual cap.
     Founder's call: don't decline the claim, but TELL the patient
     transparently and let them choose. The plan.html overlay reads
     `fee_exceeds_cap` and renders a "heads up" banner. The patient
     can still proceed (and is covered by the money-back guarantee
     either way) — they just make the decision with full information. */
  let fee_exceeds_cap = false;
  let fee_pct_of_refund = null;
  if (refundAvg != null && refundAvg > 0) {
    fee_pct_of_refund = Math.round((price / refundAvg) * 100);
    fee_exceeds_cap = price > refundAvg * 0.20;
  }

  return {
    tier,
    price,
    explanation: bullets.slice(0, 4),
    fee_exceeds_cap,
    fee_pct_of_refund
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
