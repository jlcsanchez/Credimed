# Legal samples — for counsel review

Rendered samples of the legal documents Credimed sends to insurance carriers.
**Counsel can edit the wording in the corresponding generator file**, and the
rendered output will pick up the change on the next deploy.

| Sample PDF | Source generator | What it is |
|---|---|---|
| `poa-sample.pdf` | `backend/fax/poa-pdf-generator.js` | Limited Power of Attorney + HIPAA Authorization §164.508. Goes in the fax bundle alongside the ADA J430D so the carrier has the patient's express authorization for Credimed to file the claim, follow up on it, and receive EOBs. |

## How to regenerate

```bash
npm install pdf-lib --no-save
node --input-type=module -e "
import { generatePoaPdf } from './backend/fax/poa-pdf-generator.js';
import fs from 'fs';
const pdf = await generatePoaPdf({
  firstName: 'Maria',
  lastName: 'Hernández García',
  memberId: 'W123-456-789',
  insurer: 'Aetna Dental PPO',
  claimId: 'CMX-2026-SAMPLE'
});
fs.writeFileSync('docs/legal-samples/poa-sample.pdf', Buffer.from(pdf));
"
```

## Counsel review workflow

1. Counsel reads `poa-sample.pdf` (or any other sample)
2. Counsel marks up changes in plain text or PDF redline
3. Founder applies the wording changes to the generator (`*-pdf-generator.js`)
4. Re-run the regenerate command above to refresh the sample
5. Commit both the generator change and the refreshed sample in one PR

This keeps the on-disk sample in sync with what the Lambda actually emits, so
counsel always sees the current version when they're asked to re-review.
