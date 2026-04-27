# Credimed Legal Positioning Principles

**Last updated:** April 27, 2026
**Owner:** Juan Luis Sanchez
**Purpose:** A single source of truth for how Credimed describes itself
across all legal documents (Privacy Policy, Terms of Service, NPP,
Service Agreement, Cookie Policy, Disclosures, marketing copy).

---

## What Credimed IS

Credimed is a **claim preparation and submission service**. We help US PPO
dental insurance members file out-of-network reimbursement claims for dental
work performed by licensed providers in Mexico.

We act **on behalf of the patient**, under **written authorization** captured
in our Service Agreement (currently v1.2). The patient is the policyholder;
the insurer pays the patient directly. We never receive, hold, or take a
percentage of the patient's reimbursement.

We use a clearinghouse (currently **Availity**) as our submission vendor.
The clearinghouse routes our prepared claims to the appropriate payer.

---

## What Credimed IS NOT

- **Not a healthcare clearinghouse** under 45 C.F.R. § 160.103. We do not
  process or facilitate processing of health information from another entity
  into a standard transaction. We prepare claims FROM the patient's source
  documents and AS the patient's authorized representative — we are the
  origin of the standard transaction, not a translator between two other
  parties. Availity is the clearinghouse; we are Availity's customer.

- **Not a healthcare provider.** We do not provide, recommend, or evaluate
  dental treatment. We do not diagnose, prescribe, or render medical
  services.

- **Not a health plan.** We do not underwrite, sell, or administer
  insurance policies.

- **Not an insurer's agent.** We are not employed by, endorsed by,
  contracted with, or paid commission by any US insurance carrier.

- **Not a third-party administrator (TPA).** We do not adjudicate claims
  or make benefit determinations.

- **Not a legal advisor or claims adjuster.** We do not give legal advice
  about coverage rights or appeal strategies beyond resubmission.

---

## HIPAA classification

Based on the above: **Credimed is not a HIPAA Covered Entity.**

Credimed handles Protected Health Information (PHI) in two distinct
capacities, depending on the engagement:

1. **As a service provider acting under the patient's direct written
   authorization** — for the patient-facing service (you upload your
   factura, we prepare your claim). The patient is the data subject and
   has authorized us to act on their behalf. HIPAA Privacy Rule applies
   only insofar as we choose to honor it as best practice; the patient
   could equivalently submit the same data themselves.

2. **As a HIPAA Business Associate** — when a covered-entity insurer
   requires a Business Associate Agreement (BAA) before accepting our
   submitted claims. In that engagement we are bound by 45 C.F.R. Parts
   160, 162, and 164 (Privacy, Security, Breach Notification rules) for
   the duration of the BAA.

We commit to HIPAA Privacy Rule and Security Rule compliance in either
capacity, even where it exceeds the strict legal floor.

---

## What changes because we are NOT a Covered Entity

| HIPAA obligation | Required if CE | Required for Credimed |
|---|---|---|
| Publish a Notice of Privacy Practices | Yes (45 CFR § 164.520) | No — we publish one as best practice |
| Designate a Privacy Officer by name | Yes | No — best practice; we list a `privacy@` alias |
| Conduct formal HIPAA Risk Analysis | Yes (45 CFR § 164.308) | No directly; required indirectly via BAAs |
| Workforce HIPAA training, documented | Yes | No directly; we will do it as best practice |
| Direct OCR enforcement exposure | Yes | No — only via the BAA channel |
| Sign BAAs with our subcontractors | Yes | Yes (we sign BAA with AWS regardless) |
| Comply with Breach Notification Rule | Yes | Yes through BAA flow + as best practice |

The practical effect: we operate as if we were a CE, because that's
defensible and patient-friendly, but we don't carry the direct OCR
liability that a CE has.

---

## How to phrase this in legal documents

**Always say:**
- "Credimed provides administrative claim preparation and submission services."
- "Credimed acts as your authorized representative for the limited purpose of preparing and submitting your reimbursement claim."
- "Credimed acts as a HIPAA Business Associate where a covered-entity insurer requires a Business Associate Agreement."

**Never say:**
- "Credimed is a healthcare clearinghouse." (We are not — we use one.)
- "Credimed is a Covered Entity." (We are not.)
- "Credimed makes coverage determinations." (Insurer does.)
- "Credimed guarantees reimbursement." (We don't.)
- "Credimed is endorsed by [insurer name]." (We are not.)

**Avoid hedging language like:**
- "Where applicable, we may be a Covered Entity..." (We are not. Be definitive.)
- "Depending on classification, we may publish a Notice of Privacy Practices..." (We do publish one, voluntarily, as best practice.)

---

## How this maps to the 6 legal documents

| # | Document | Treatment of role |
|---|---|---|
| 1 | Privacy Policy | "Service provider to you, and where applicable Business Associate to covered entities." Already aligned. |
| 2 | Terms of Service | "Not a healthcare provider, insurance company, or legal advisor." Already aligned. Could explicitly add "not a healthcare clearinghouse" for completeness. |
| 3 | Notice of Privacy Practices | Most affected. Frame voluntarily-published NPP as "as a Business Associate and as a courtesy to patients." |
| 4 | Service Agreement v1.2 | "Limited claims representative" — already correct phrasing. The patient signs this to authorize us. |
| 5 | Cookie Policy | Not affected — purely about cookies. |
| 6 | Disclosures | Strengthen "Not insurance / Not a provider / Not affiliated with insurers" to also include "Not a clearinghouse." |

---

## Open questions for counsel

1. Are we correctly positioned as a non-CE under 45 CFR § 160.103?
   The clearinghouse definition is broad; we believe it doesn't apply
   because we are the originator of the standard transaction (acting as
   the patient's representative), not a transformer between two third
   parties. Counsel should confirm.

2. Do any state laws impose CE-equivalent obligations on a "billing
   service" or "claim preparation service" that wouldn't otherwise be a
   federal CE? Massachusetts, California, New York, Texas are highest
   priority to check given expected patient distribution.

3. The Service Agreement authorizes us to act as the patient's "limited
   claims representative." Is that phrase enforceable across all 50
   states, or do some states require a more specific power-of-attorney
   form for healthcare claim agency?

4. If we begin offering eligibility verification or pre-authorization
   functions in the future, would that change our HIPAA classification?
