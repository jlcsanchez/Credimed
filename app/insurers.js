/* =========================================================================
   Credimed insurer database
   Public-data typical out-of-network dental coverage ranges per major US PPO
   carrier. Used for personalized estimates ("Typically 50–80% for Delta
   Dental PPO"). Built to also serve as the seed table for the future
   advance / credit product:
     - riskScore (A/B/C/D) → manual underwriting hint
     - avgPayoutDays      → cash-flow estimation
     - confirmedClaimsCount → real-world payout sample once we have history

   When the EDI 271 benefit lookup ships through the clearinghouse, the
   benefit fields here will be replaced per claim by the user's actual
   plan rates. The riskScore + avgPayoutDays fields stay aggregated.

   Match strategy (see lookupInsurer below):
     1. Exact key match (case-insensitive)
     2. Token startsWith for OCR'd names that include extra words
        (e.g. 'Delta Dental of California' → 'Delta Dental')
     3. Fall back to DEFAULT (the generic 40–70% range)

   Source for ranges: public 2024-2025 plan brochures, NADP claims data,
   our own claim history (when populated). Verify before quoting in
   marketing materials.

   ─────────────────────────────────────────────────────────────────────
   HOW TO ADD A NEW INSURER
   ─────────────────────────────────────────────────────────────────────
   When you process a claim with a carrier not yet in the table:

   1. Open this file. Add a new entry inside `INSURERS`. The KEY is the
      lower-case carrier name with NO 'PPO/HMO/Inc/of [State]' suffix.
      'Delta Dental of California' → key 'delta dental'.
      'Aetna Dental PPO Plus'      → key 'aetna'.

   2. Fill the fields. For unknown values, use the DEFAULT_INSURER's:
        oonLow:  40    (conservative — under-promise)
        oonHigh: 70
        annualMaxLow:  1000
        annualMaxHigh: 2000
        riskScore: null              (do NOT guess — leave null until ≥10 claims)
        avgPayoutDays: null          (same)
        confirmedClaimsCount: 0
        notes: 'New carrier — using public defaults until we have claim history.'

   3. Once you process 5–10 claims with this carrier, replace the public
      defaults with REAL data from your claim history:
        oonLow / oonHigh   → actual lowest/highest payout %
        avgPayoutDays      → median days from filing to check
        confirmedClaimsCount → bump on every confirmed payout
        riskScore          → A (fast + reliable), B (slow but pays),
                              C (frequent denials), D (avoid)

   4. Update the `notes` field with a one-liner. Future you will thank you.

   5. Commit with message: "data(insurers): add {carrier name}".

   ─────────────────────────────────────────────────────────────────────
   WHEN TO MOVE THIS TO A BACKEND TABLE
   ─────────────────────────────────────────────────────────────────────
   Stay in this JS file while the dataset is small (<50 carriers) and
   updates are infrequent. Migrate to DynamoDB + admin UI when:

     - You need per-state plan variants (Delta Dental varies by state)
     - You need historical rate tracking (last year vs this year)
     - You start advance/credit underwriting and need queries like
       'all claims with carrier X in last 90 days'
     - Multiple admins need to update without git access
   ========================================================================= */

(function (global) {
  'use strict';

  // Conservative ranges — when in doubt, lean low. Better to under-promise.
  const DEFAULT_INSURER = {
    name: 'your PPO plan',
    oonLow: 40,
    oonHigh: 70,
    annualMaxLow: 1000,
    annualMaxHigh: 2000,
    riskScore: null,
    avgPayoutDays: null,
    confirmedClaimsCount: 0,
    notes: 'Generic typical PPO out-of-network range.',
  };

  const INSURERS = {
    'delta dental': {
      name: 'Delta Dental PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2500,
      riskScore: 'A', avgPayoutDays: 14, confirmedClaimsCount: 0,
      notes: 'Largest US dental insurer. Generous OON benefit, fast paper claims.',
    },
    'cigna': {
      name: 'Cigna PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 18, confirmedClaimsCount: 0,
      notes: 'Common employer plan, accepts standard OON CDT submissions.',
    },
    'aetna': {
      name: 'Aetna PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2500,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Mid-tier turnaround, occasionally requests EOB.',
    },
    'metlife': {
      name: 'MetLife PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 3000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Higher annual max ceilings, slow but reliable.',
    },
    'guardian': {
      name: 'Guardian PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1500, annualMaxHigh: 2500,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Strong OON benefit, common employer plan.',
    },
    'unitedhealthcare': {
      name: 'UnitedHealthcare PPO',
      oonLow: 50, oonHigh: 70,
      annualMaxLow: 1000, annualMaxHigh: 1500,
      riskScore: 'B', avgPayoutDays: 28, confirmedClaimsCount: 0,
      notes: 'Lower annual max than competitors, slower turnaround.',
    },
    'humana': {
      name: 'Humana PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 1500,
      riskScore: 'B', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Common Medicare Advantage rider for retirees.',
    },
    'blue cross blue shield': {
      name: 'BCBS PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Regional plans vary widely — verify by state.',
    },
    'principal': {
      name: 'Principal Financial PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1500, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Solid mid-market employer plan.',
    },
    'ameritas': {
      name: 'Ameritas PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 18, confirmedClaimsCount: 0,
      notes: 'Fast paper claim processing.',
    },
    'sun life': {
      name: 'Sun Life PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Good employer plan, standard OON benefit.',
    },
    'lincoln financial': {
      name: 'Lincoln Financial PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Mid-market employer plan.',
    },
    'mutual of omaha': {
      name: 'Mutual of Omaha PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1500, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Higher floor on annual max.',
    },
    'tricare': {
      name: 'TRICARE Dental',
      oonLow: 50, oonHigh: 100,
      annualMaxLow: 1500, annualMaxHigh: 1500,
      riskScore: 'B', avgPayoutDays: 30, confirmedClaimsCount: 0,
      notes: 'Military / dependents plan. Different rules, slow claims.',
    },
    'renaissance dental': {
      name: 'Renaissance Dental PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Employer plan, standard OON treatment.',
    },
    // Massachusetts-specific carriers we've seen on receipts — extend
    // as we get more.
    'massachusetts medical': {
      name: 'Massachusetts Medical PPO',
      oonLow: 50, oonHigh: 80,
      annualMaxLow: 1000, annualMaxHigh: 2000,
      riskScore: 'A', avgPayoutDays: 21, confirmedClaimsCount: 0,
      notes: 'Regional carrier; treat as standard PPO until we have more samples.',
    },
  };

  /* Resolve a free-text insurer name (typed in the InsuranceSearch box or
     OCR'd from the insurance card) to a known entry. Forgiving by design:
     normalizes whitespace, lowercases, ignores 'PPO'/'HMO' suffixes, and
     falls back to a startsWith match so 'Delta Dental of California Inc.'
     still resolves to the Delta Dental row. */
  function lookupInsurer(input) {
    if (!input || typeof input !== 'string') return DEFAULT_INSURER;
    const q = input.toLowerCase()
                   .replace(/\b(ppo|hmo|epo|dental|inc|llc|corp|group|of [a-z]+)\b/gi, '')
                   .replace(/\s+/g, ' ')
                   .trim();
    if (!q) return DEFAULT_INSURER;
    if (INSURERS[q]) return INSURERS[q];
    // Token-prefix match — useful when the OCR'd name has extra words.
    const keys = Object.keys(INSURERS);
    const hit = keys.find((k) => q.startsWith(k) || k.startsWith(q));
    if (hit) return INSURERS[hit];
    return DEFAULT_INSURER;
  }

  global.CredimedInsurers = {
    INSURERS: INSURERS,
    DEFAULT_INSURER: DEFAULT_INSURER,
    lookup: lookupInsurer,
  };
})(window);
