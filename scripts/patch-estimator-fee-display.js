#!/usr/bin/env node
/**
 * Patches the landing-page Estimator bundle to add transparent fee
 * disclosure with "you keep" framing (TurboTax-style):
 *
 *   We help you recover  $X – $Y
 *   You keep            ~$X' – $Y'      ← BIG, green, dominant
 *   We take             $XX once your claim is ready
 *
 * Adds tier mapping per procedure (Micro $19 / Lite $29 / Standard $49 /
 * Plus $79 / Premium $99) and applies the 20% cap.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const ESTIMATOR_UUID = '0d74c08f-8fac-469b-875f-f89634e271d9';

const html = fs.readFileSync(HTML_PATH, 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
if (!manifestMatch) throw new Error('manifest not found');
const manifest = JSON.parse(manifestMatch[1]);
const entry = manifest[ESTIMATOR_UUID];
if (!entry) throw new Error('estimator entry not found');

const buf = Buffer.from(entry.data, 'base64');
let code = entry.compressed ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');

// 1) Add `tier` to PROCEDURES table.
const oldProcedures = `const PROCEDURES = [
  { id: 'crown',     label: 'Crown',          typical: 450, ucrUS: 1200, rate: 0.50 },
  { id: 'rootcanal', label: 'Root canal',     typical: 350, ucrUS:  900, rate: 0.55 },
  { id: 'implant',   label: 'Implant',        typical: 1300, ucrUS: 2800, rate: 0.50 },
  { id: 'extract',   label: 'Extraction',     typical: 90,  ucrUS:  220, rate: 0.70 },
  { id: 'cleaning',  label: 'Cleaning',       typical: 60,  ucrUS:  130, rate: 0.80 },
  { id: 'veneer',    label: 'Veneers (each)', typical: 380, ucrUS: 1100, rate: 0.45 },
  { id: 'bridge',    label: 'Dental bridge',  typical: 950, ucrUS: 2400, rate: 0.50 },
];`;

const newProcedures = `const PROCEDURES = [
  { id: 'crown',     label: 'Crown',          typical: 450, ucrUS: 1200, rate: 0.50, tier: 49 },
  { id: 'rootcanal', label: 'Root canal',     typical: 350, ucrUS:  900, rate: 0.55, tier: 49 },
  { id: 'implant',   label: 'Implant',        typical: 1300, ucrUS: 2800, rate: 0.50, tier: 99 },
  { id: 'extract',   label: 'Extraction',     typical: 90,  ucrUS:  220, rate: 0.70, tier: 19 },
  { id: 'cleaning',  label: 'Cleaning',       typical: 60,  ucrUS:  130, rate: 0.80, tier: 19 },
  { id: 'veneer',    label: 'Veneers (each)', typical: 380, ucrUS: 1100, rate: 0.45, tier: 49 },
  { id: 'bridge',    label: 'Dental bridge',  typical: 950, ucrUS: 2400, rate: 0.50, tier: 79 },
];

// Tier label lookup — used in the "We take" line.
const TIER_LABEL = { 19: 'Micro', 29: 'Lite', 49: 'Standard', 79: 'Plus', 99: 'Premium' };`;

if (!code.includes(oldProcedures)) {
  throw new Error('PROCEDURES block not found — bundle may have been modified upstream');
}
code = code.replace(oldProcedures, newProcedures);

// 2) Add fee + you-keep computation right after lowEnd/highEnd.
const oldMath = `  const lowEnd  = Math.max(50, Math.round(effectivePaid * 0.60));
  const highEnd = Math.round(effectivePaid * 0.75);`;

const newMath = `  const lowEnd  = Math.max(50, Math.round(effectivePaid * 0.60));
  const highEnd = Math.round(effectivePaid * 0.75);

  // Pick the highest-tier procedure across all selected items. Bridge
  // + cleaning shouldn't fall to the cleaning's $19 — go with the most
  // complex thing on the receipt.
  const tierFee = useMemo(() => {
    let max = 19;
    for (const it of items) {
      const p = PROCEDURES.find(x => x.id === it.proc);
      if (p && p.tier > max) max = p.tier;
    }
    return max;
  }, [items]);
  const tierName = TIER_LABEL[tierFee] || 'Standard';

  // Apply the 20% cap to each end of the refund range. When refunds are
  // small, the cap kicks in (fee drops below tier). When refunds are
  // big, the cap is moot (fee stays at tier).
  const feeOnLow  = Math.min(tierFee, Math.round(lowEnd  * 0.20));
  const feeOnHigh = Math.min(tierFee, Math.round(highEnd * 0.20));
  const feeDisplay = feeOnLow === feeOnHigh
    ? \`\\\$\${feeOnLow}\`
    : \`\\\$\${feeOnLow}–\\\$\${feeOnHigh}\`;
  const youKeepLow  = Math.max(0, lowEnd  - feeOnHigh);
  const youKeepHigh = Math.max(0, highEnd - feeOnLow);`;

if (!code.includes(oldMath)) {
  throw new Error('math block not found');
}
code = code.replace(oldMath, newMath);

// 3) Replace the result block with the TurboTax-style 3-line layout.
const oldResult = `        {/* Result */}
        <div style={{
          padding: '24px', borderTop: '1px solid var(--slate-100)',
          background: 'linear-gradient(180deg, #fff 0%, #F0FDFA 100%)',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Estimated recovery
            </div>
            <div className="tnum" style={{ fontSize: 36, fontWeight: 600, color: 'var(--accent, #0D9488)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              \${lowEnd.toLocaleString()} – \${highEnd.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 8 }}>
              From your <span className="tnum">\${Math.round(effectivePaid).toLocaleString()}</span> visit in {city || 'Mexico'} · paid as a check by your insurer
            </div>
          </div>
          <button className="cta-primary" style={{ whiteSpace: 'nowrap' }}>
            Start my claim <span className="arrow">→</span>
          </button>
        </div>`;

const newResult = `        {/* Result — TurboTax-style: value first, what-you-keep dominant,
            fee minimized cognitively. The \"You keep\" line is the
            largest number on the page; the fee sits below in muted
            grey so it reads as a small footnote, not a price tag. */}
        <div style={{
          padding: '24px', borderTop: '1px solid var(--slate-100)',
          background: 'linear-gradient(180deg, #fff 0%, #F0FDFA 100%)',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 4 }}>
              We help you recover{' '}
              <span className="tnum" style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                \${lowEnd.toLocaleString()} – \${highEnd.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #0D9488)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                You keep
              </span>
            </div>
            <div className="tnum" style={{ fontSize: 36, fontWeight: 600, color: 'var(--accent, #0D9488)', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 2 }}>
              ~\${youKeepLow.toLocaleString()} – \${youKeepHigh.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 10 }}>
              We take <span className="tnum" style={{ fontWeight: 500, color: 'var(--slate-700)' }}>{feeDisplay}</span> ({tierName} tier) once your claim is ready · capped at 20%
            </div>
          </div>
          <button className="cta-primary" style={{ whiteSpace: 'nowrap' }}>
            Start my claim <span className="arrow">→</span>
          </button>
        </div>`;

if (!code.includes(oldResult)) {
  throw new Error('result block not found');
}
code = code.replace(oldResult, newResult);

// 4) Update the disclaimer text — old says "$49–$99" which is wrong
//    now that we have 5 tiers starting at $19.
const oldDisclaim = `Estimate based on typical PPO out-of-network reimbursement rates. Actual amount depends on your plan's annual maximum, deductible, and remaining benefits. We'll confirm before you pay the fee ($49–$99).`;
const newDisclaim = `Estimate based on typical PPO out-of-network reimbursement rates. Actual amount depends on your plan's annual maximum, deductible, and remaining benefits. Our fee ($19–$99 by complexity) is always capped at 20% of what you recover.`;

if (!code.includes(oldDisclaim)) {
  console.warn('warn: disclaimer text changed upstream — leaving as-is');
} else {
  code = code.replace(oldDisclaim, newDisclaim);
}

// 5) Re-gzip + base64 + replace in manifest.
const newBuf = zlib.gzipSync(code, { level: 9 });
manifest[ESTIMATOR_UUID].data = newBuf.toString('base64');
manifest[ESTIMATOR_UUID].compressed = true;

const newManifest = JSON.stringify(manifest);
const newHtml = html.replace(
  /<script type="__bundler\/manifest">[\s\S]*?<\/script>/,
  `<script type="__bundler/manifest">${newManifest}</script>`
);

fs.writeFileSync(HTML_PATH, newHtml);
fs.writeFileSync('/tmp/estimator-patched.js', code);
console.log('OK — landing estimator patched');
console.log('  bytes (gzipped, base64):', manifest[ESTIMATOR_UUID].data.length);
