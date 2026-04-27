# Credimed — Legal & Compliance Review Bundle

**Prepared for:** [Counsel name]
**Prepared by:** Juan Luis Sanchez · jlcsanchezavila@gmail.com
**Date:** April 27, 2026
**Version:** 1.0

---

## What Credimed does (one paragraph)

Credimed is a US-incorporated healthcare-tech service. We help US PPO dental insurance members file out-of-network reimbursement claims for dental work performed by licensed providers in Mexico. The patient uploads their Mexican factura + insurance card, we translate procedure descriptions to ADA CDT codes, convert MXN to USD at the date-of-service FIX rate, format the claim to each insurer's preferred submission, and transmit. The insurer pays the patient directly — Credimed never holds patient money. We charge a flat $49–$99 per claim, with a money-back guarantee if we cannot recover the reimbursement after one free resubmission. We are not affiliated with any insurer or dental clinic. We're based in Boston, MA.

## Scope of this review

We need a healthcare attorney (HIPAA-experienced, ideally with consumer-facing tech experience) to review and red-line the documents below before we accept our first paying patient. This is the entire pre-launch legal surface area:

| # | Document | Purpose | What we need from you |
|---|---|---|---|
| 1 | Privacy Policy | Public-facing, governs all data | Confirm CCPA/CPRA + GDPR-light coverage; flag anything we're missing |
| 2 | Terms of Service | Public-facing, governs the service | Confirm enforceability, dispute resolution, limitation of liability |
| 3 | Notice of Privacy Practices (HIPAA) | Patient-facing, required under HIPAA Privacy Rule | Confirm we are correctly positioned as Business Associate vs. Covered Entity |
| 4 | Service Agreement v1.2 | Patient-facing, governs each filing engagement | Confirm "limited claims representative" language, money-back guarantee scope, dispute process |
| 5 | Cookie Policy | Public-facing, supplements Privacy | Confirm CCPA disclosure + cookie inventory accuracy |
| 6 | Disclosures | Public-facing, FTC/UDAP-act disclosures | Confirm refund-estimate caveats, processing-time language, "not insurance" claims |
| 7 | Marketing claims (homepage copy) | See section at the end | Confirm forward-looking statements + "up to $1,500" language |

## Key questions we need answered

1. **What are we, exactly?** A HIPAA Covered Entity, a Business Associate of the insurer, both, or neither? Our position right now is "Business Associate of any covered-entity insurer that requests a BAA." Does that hold up?
2. **What's our jurisdiction posture?** We're incorporated in Delaware, headquartered in Massachusetts, and patients can be in any of the 50 states. Do we need state-by-state registration, or is that excessive?
3. **Service Agreement — is it enforceable across states?** We use a click-through e-signature. Is the "we'll refund you the $49 if we can't recover" language sufficient as a money-back guarantee, or does any state require specific dollar disclosures?
4. **Refund-estimate language.** The estimator on our public site shows a range like "$450–$610" based on procedure codes the user enters. We label it "illustrative only" and "your insurer determines the final amount." Does that meet FTC + state UDAP-act standards for healthcare-tech estimates?
5. **"Most patients recover $600–$1,500" — is that defensible?** It's based on internal claims data (n=1,200 from a beta cohort). Sufficient sample size? Required disclosures around it?
6. **Processing-time claim "filed within 24 hours of payment" — is that an actionable promise?** What's our exposure if we miss the 24h window on a single claim?
7. **Email + drip campaigns to non-converted leads** (people who hit the estimator and bounced). Any HIPAA-Marketing-rule concerns? They're not our patients yet.
8. **Cross-border specifics.** The dental work happens in Mexico, but the patient is in the US. Does the fact that PHI is generated outside the US affect anything (HIPAA's geographic scope, GDPR if any patient is an EU national traveling to MX, etc.)?
9. **Stripe + AWS BAAs.** We have a BAA with AWS, and Stripe is configured in HIPAA-eligible mode. Anything else we should be looking at?
10. **What's missing?** What document or disclosure should exist that doesn't yet?

## Deliverables we'd like

- Red-lined versions of all 7 documents below
- A checklist of state-specific filings we need (Massachusetts business license, etc.)
- Any "do not launch until you fix this" issues, called out at the top
- A formal HIPAA Risk Analysis template scope (we'll do the work; we just need the framework)
- One-hour follow-up call to walk through findings

Estimated scope: **2–4 attorney hours** for the document red-line; **+1 hour for risk-analysis framework**. Happy to discuss flat-fee or hourly.

---

# Documents follow below

Each document is the verbatim copy currently published at `https://credimed.us`. Mark up directly in this file or in your preferred format.



---

# 1. Privacy Policy

*Source file:* `legal/privacy.html`

# Privacy Policy

Last updated: April 26, 2026 · Version 1.0

**Draft template.** This document is provided as a starting point and must be reviewed and customized by qualified legal counsel before Credimed accepts paying customers. The protections of HIPAA, state privacy laws (CCPA, CPRA, etc.), and international privacy laws (GDPR if applicable) impose specific disclosure requirements that vary by jurisdiction.

## 1. Introduction

Credimed, Inc. ("Credimed," "we," "us," or "our") provides a service that helps US-based patients submit dental insurance reimbursement claims for dental work performed by licensed providers in Mexico. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website, mobile experience, and related services (collectively, the "Service").

If you are a patient using Credimed to submit an insurance claim, please also read our Notice of Privacy Practices (/legal/notice-of-privacy-practices.html), which describes how we handle your Protected Health Information (PHI) under the Health Insurance Portability and Accountability Act of 1996 ("HIPAA").

## 2. Information We Collect

### 2.1 Information you provide

- **Account information:** name, email address, phone number, password (stored as a one-way hash by Amazon Cognito).
- **Identity and insurance information:** date of birth, insurance member ID, insurance carrier, policy number, group number, and an image or scan of your insurance card.
- **Health information (PHI):** dental procedures performed, dates of service, provider name, diagnostic codes, treatment notes, billing amounts, and dental receipts and records you upload.
- **Banking information:** bank account number, routing number, and account holder name (for ACH refund deposits, where applicable).
- **Signatures:** the electronic signature you provide on our service agreements.

### 2.2 Information collected automatically

- **Device and usage data:** IP address, browser type, operating system, device identifiers, pages visited, timestamps, and referring URLs.
- **Cookies and similar technologies:** we use first-party cookies only for authentication and session management. We do not use third-party advertising or tracking cookies.
- **Privacy-first analytics:** on our public pages (homepage and legal pages, never the authenticated patient flow) we use Plausible Analytics (https://plausible.io/data-policy), a cookieless analytics tool. Plausible records aggregate page views, referrers, and approximate geography without identifying individual visitors and without setting cookies. No PHI ever flows through analytics.

### 2.3 Information from third parties

- **Payment processor (Stripe):** we receive transaction confirmations and the last four digits of your payment card. Full card numbers are handled directly by Stripe and are never stored by Credimed.

## 3. How We Use Your Information

We use your information to:

- Prepare, review, and submit dental insurance reimbursement claims to your insurance carrier on your behalf;
- Communicate with you about your claim, including status updates, requests for additional documentation, and outcome notifications;
- Process payments and refunds;
- Verify your identity and prevent fraud;
- Improve and operate the Service, including diagnosing technical issues;
- Comply with legal obligations and enforce our terms.

## 4. How We Share Your Information

### 4.1 Insurance carriers and payers

To submit your claim, we share your PHI with your insurance carrier (or its claim processing intermediary). The information shared is limited to what is necessary for claim adjudication.

### 4.2 Business associates and service providers

We share information with vendors that process information on our behalf, under written contracts that require them to safeguard your data. Current categories include:

- **Cloud infrastructure:** Amazon Web Services (AWS) — bound by an executed Business Associate Agreement (BAA) for HIPAA-regulated data.
- **Payment processing:** Stripe.
- **Communications:** email and SMS providers used to send transactional notifications.

### 4.3 Legal disclosures

We may disclose information when required by law, subpoena, court order, or other legal process; to protect the rights, property, or safety of Credimed, our users, or others; or in connection with a corporate transaction such as a merger, financing, acquisition, or bankruptcy.

### 4.4 With your consent

We share information for any other purpose with your consent.

## 5. Data Security

We implement administrative, technical, and physical safeguards designed to protect your information, including:

- **Encryption in transit:** all communications use HTTPS/TLS 1.2 or higher.
- **Encryption at rest:** Protected Health Information stored in our database is encrypted at the field level using AWS Key Management Service (KMS).
- **Access controls:** access to PHI is restricted to authorized personnel through role-based authentication and group-based authorization.
- **Audit logging:** all access to PHI is logged to a tamper-resistant audit trail.
- **Automatic session timeout:** inactive sessions are automatically signed out after 15 minutes.

No system is perfectly secure. We cannot guarantee that your information will not be subject to unauthorized access. We will notify affected users in accordance with applicable law if we become aware of a breach involving your personal or health information.

## 6. Data Retention

We retain your information for as long as necessary to provide the Service, comply with legal and regulatory obligations (including insurance recordkeeping requirements), resolve disputes, and enforce our agreements. When information is no longer required, we securely delete or de-identify it.

## 7. Your Rights

Depending on where you live, you may have the right to:

- Access the personal information we hold about you;
- Request correction of inaccurate information;
- Request deletion of your personal information, subject to legal retention obligations;
- Receive a copy of your information in a portable format;
- Withdraw consent for processing where consent is the legal basis;
- Lodge a complaint with a supervisory authority.

HIPAA grants additional rights with respect to your PHI; see our Notice of Privacy Practices (/legal/notice-of-privacy-practices.html).

To exercise any of these rights, contact us at **privacy@credimed.us**.

## 8. Children's Privacy

The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us at privacy@credimed.us and we will delete it.

## 9. International Users

Credimed operates and stores data in the United States. If you access the Service from outside the United States, your information will be transferred to, stored in, and processed in the United States.

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. The "Last updated" date at the top of this page indicates when the latest revision took effect. For material changes, we will provide notice through the Service or by email.

## 11. Contact Us

Credimed, Inc.

Email: privacy@credimed.us

Mailing address: [TO BE PROVIDED]

---

# 2. Terms of Service

*Source file:* `legal/terms.html`

# Terms of Service

Last updated: April 26, 2026 · Version 1.0

**Draft template.** These Terms must be reviewed by qualified legal counsel before Credimed accepts paying customers. Pay particular attention to: limitation of liability scope and amount, arbitration / class-action waiver clauses (state-specific enforceability), refund policy alignment with the Service Agreement, and dispute resolution venue.

## 1. Acceptance of Terms

By accessing or using Credimed's website, mobile experience, or related services (collectively, the "Service"), you ("you" or "Member") agree to these Terms of Service ("Terms"). If you do not agree, do not use the Service.

The Service is offered by Credimed, Inc. ("Credimed," "we," "us," or "our"), a Delaware corporation.

## 2. Eligibility

You must be at least 18 years old, a United States resident, and the named beneficiary on a private dental insurance policy issued by a US-licensed insurer to use the Service. You may submit claims for a minor dependent if you are the insured policyholder.

## 3. The Service

Credimed assists Members with the preparation, review, and submission of dental insurance reimbursement claims for dental care performed by licensed dental providers in Mexico. **Credimed is not a healthcare provider, insurance company, or legal advisor.** Outcomes (including reimbursement amounts, processing times, and approval) are determined by your insurer. Credimed does not control insurer decisions.

## 4. Service Agreement

In addition to these Terms, your use of the claim-submission service is governed by the Credimed Member Service Agreement (currently version 1.2), which you electronically sign before payment. The Service Agreement covers fees, refund eligibility, the conditional money-back guarantee, exclusions, and the limited scope of Credimed's role. Read the current version: AGREEMENT v1.2 (/legal/AGREEMENT_v1.2.md).

## 5. Fees and Payment

Service fees are based on claim complexity (Standard $49, Plus $79, Premium $99) plus $19 per additional resubmission beyond what your plan includes. Payment is required before submission. Refund eligibility is governed by Section 2 of the Member Service Agreement.

## 6. Your Responsibilities

You agree to:

- Provide accurate, complete, and current information;
- Promptly upload requested documentation;
- Notify Credimed of changes to your insurance coverage or contact information;
- Not submit false, fraudulent, or duplicate claims;
- Not use the Service for any unlawful purpose.

Misrepresentation may result in account termination and forfeiture of fees, and may violate federal anti-fraud laws (18 U.S.C. § 1347).

## 7. Intellectual Property

All content on the Service — including text, graphics, logos, software, and the Credimed name and brand — is owned by Credimed or its licensors and is protected by US and international copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent.

## 8. Account Security

You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately at **support@credimed.us** if you suspect unauthorized access.

## 9. Termination

You may close your account at any time by emailing **support@credimed.us**. We may suspend or terminate your access for violation of these Terms, the Service Agreement, or applicable law. Sections that by their nature should survive termination (including intellectual property, limitation of liability, indemnity, and dispute resolution) will survive.

## 10. Disclaimer of Warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY. CREDIMED DOES NOT WARRANT THAT YOUR CLAIM WILL BE APPROVED OR PAID BY YOUR INSURER.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, CREDIMED'S TOTAL LIABILITY ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT OF FEES YOU PAID TO CREDIMED IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO LIABILITY. CREDIMED WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, EVEN IF ADVISED OF THE POSSIBILITY.

*Note: limitation of liability is subject to state law. Some states do not allow exclusion of certain damages.*

## 12. Indemnity

You agree to indemnify and hold harmless Credimed and its officers, directors, employees, and agents from any claim, demand, or damage arising out of (i) your breach of these Terms or the Service Agreement, (ii) your violation of law, or (iii) information you submit through the Service.

## 13. Dispute Resolution

Any dispute arising out of or relating to these Terms or the Service will be resolved by binding arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules. The arbitration will take place in [VENUE TO BE SPECIFIED]. You and Credimed each waive the right to bring or participate in any class action.

*Note: arbitration and class-action waiver clauses are subject to evolving state and federal enforceability rules. Counsel must review.*

## 14. Governing Law

These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-laws principles. Subject to Section 13, exclusive jurisdiction lies in the state and federal courts located in Wilmington, Delaware.

## 15. Changes to Terms

We may modify these Terms at any time. Material changes will be communicated through the Service or by email. Continued use of the Service after notice constitutes acceptance.

## 16. Contact

Credimed, Inc.

Email: support@credimed.us

Legal notices: legal@credimed.us

Mailing address: [TO BE PROVIDED]

---

# 3. Notice of Privacy Practices (HIPAA)

*Source file:* `legal/notice-of-privacy-practices.html`

# Notice of Privacy Practices

Effective date: April 26, 2026 · Required under HIPAA (45 C.F.R. § 164.520)

**Draft template.** This Notice must be reviewed by qualified healthcare counsel before Credimed accepts paying customers. The exact wording and structure of this Notice is regulated under the HIPAA Privacy Rule. Whether Credimed must publish a Notice of Privacy Practices depends on its classification as a Covered Entity (e.g., Healthcare Clearinghouse) versus a Business Associate. If Credimed is solely a Business Associate, an NPP may not be required, but providing one is best practice.

**This Notice describes how medical information about you may be used and disclosed and how you can get access to this information. Please review it carefully.**

## 1. Our Commitment to Your Privacy

Credimed, Inc. ("Credimed") is committed to protecting the privacy of your Protected Health Information ("PHI"). PHI is information about you, including demographic information, that may identify you and that relates to your past, present, or future physical or dental health condition, healthcare services, or payment for services.

We are required by law to:

- Maintain the privacy and security of your PHI;
- Provide you with this Notice of our legal duties and privacy practices;
- Follow the terms of this Notice currently in effect;
- Notify you in the event of a breach of your unsecured PHI.

## 2. How We May Use and Disclose Your PHI

### 2.1 For Treatment, Payment, and Healthcare Operations

Without your separate authorization, we may use or disclose your PHI for the following purposes:

- **Payment:** to submit claims to your dental insurance carrier and to process reimbursements. This is the primary purpose for which we receive your PHI.
- **Healthcare operations:** to evaluate the quality of our services, audit our claim outcomes, train our staff, and conduct compliance reviews.
- **Treatment coordination:** we may share information with your dental provider in Mexico to clarify procedure codes or treatment notes, but only as needed to support your claim.

### 2.2 As Required by Law

We may disclose your PHI when required by federal, state, or local law, including in response to subpoenas, court orders, or other legal process.

### 2.3 Public Health and Safety

We may disclose your PHI to public health authorities, as required by law, for activities such as preventing or controlling disease, reporting child or adult abuse, or reporting product defects.

### 2.4 Health Oversight

We may disclose your PHI to health oversight agencies (e.g., the U.S. Department of Health and Human Services) for activities authorized by law, including audits, investigations, and inspections.

### 2.5 Business Associates

We may disclose your PHI to "Business Associates" — third-party vendors who perform services on our behalf and have signed a Business Associate Agreement (BAA) requiring them to safeguard your PHI. Current Business Associates include:

- Amazon Web Services (cloud infrastructure and storage);
- Stripe (payment processing, only de-identified or limited financial data);
- Email and SMS providers used for transactional communications.

### 2.6 With Your Authorization

For uses and disclosures other than those described above, we will obtain your written authorization. Examples include marketing communications and the sale of PHI. You may revoke an authorization at any time, in writing, except to the extent we have already acted in reliance on it.

## 3. Your Rights Regarding Your PHI

### 3.1 Right to Inspect and Copy

You have the right to inspect and obtain a copy of your PHI maintained by Credimed. We will provide a copy in the form and format you request, if readily producible, within 30 days of your request. We may charge a reasonable, cost-based fee.

### 3.2 Right to Amend

If you believe PHI we have about you is inaccurate or incomplete, you may ask us to amend it. We may deny your request under specific circumstances permitted by law.

### 3.3 Right to an Accounting of Disclosures

You have the right to request a list of disclosures we have made of your PHI for purposes other than treatment, payment, healthcare operations, and certain other exceptions, for the past six (6) years.

### 3.4 Right to Request Restrictions

You have the right to request restrictions on certain uses and disclosures of your PHI. We are not required to agree to your request, except in narrow circumstances (such as restricting disclosures to a health plan for services you paid for entirely out of pocket).

### 3.5 Right to Confidential Communications

You have the right to request that we communicate with you about your PHI in a particular way or at a particular location (for example, only by email rather than by phone).

### 3.6 Right to a Paper Copy of This Notice

You have the right to receive a paper copy of this Notice, even if you have agreed to receive it electronically.

### 3.7 Right to Be Notified of a Breach

You have the right to be notified if we discover a breach of your unsecured PHI.

### 3.8 To Exercise Your Rights

To exercise any of these rights, contact our Privacy Officer at **privacy@credimed.us**. Some requests must be made in writing.

## 4. Complaints

If you believe your privacy rights have been violated, you may file a complaint with us at **privacy@credimed.us** or with the U.S. Department of Health and Human Services, Office for Civil Rights:

- Phone: 1-800-368-1019
- Online: www.hhs.gov/ocr/complaints/index.html (https://www.hhs.gov/ocr/complaints/index.html)

We will not retaliate against you for filing a complaint.

## 5. Changes to This Notice

We reserve the right to change this Notice and to make the new Notice effective for all PHI we maintain. We will post a copy of the current Notice on our website and provide a copy upon request.

## 6. Contact

Credimed Privacy Officer

Email: privacy@credimed.us

Phone: [TO BE PROVIDED]

Mailing address: [TO BE PROVIDED]

---

# 4. Service Agreement v1.2

*Source file:* `legal/AGREEMENT_v1.2.md`

# CREDIMED SERVICE AGREEMENT (v1.2)

**Effective Date:** [AUTO-GENERATED UPON ACCEPTANCE]

This version (v1.2) supersedes prior versions for all claims initiated on or after the Effective Date. Claims initiated under prior versions of this Agreement continue to be governed by the version in effect at the time of acceptance.

## 1. Scope of Service

Credimed Inc. ("Credimed", "we", "us") provides a document preparation and submission support service for out-of-network dental insurance reimbursement claims. We agree to prepare, translate, itemize, and assist in the electronic submission of one (1) claim on behalf of the undersigned ("you", "Member") based solely on the documents and information you provide.

Credimed acts solely as an administrative support service. We are not a healthcare provider, insurance company, third-party administrator (TPA), licensed insurance adjuster, or billing company. We do not make coverage determinations, modify clinical information, or independently verify the accuracy of submitted materials.

All claims are prepared using standard CDT codes and submitted to your insurer's claims portal typically within twenty-four (24) hours of receiving complete documentation and your signed authorization.

## 2. Pricing, Resubmissions, and Money-Back Guarantee

### 2.1 Pricing (System-Determined by Claim Complexity)

Credimed uses an automated pricing engine to analyze the Member's uploaded documentation and determine the complexity of the claim. Based on this analysis, the system assigns one of three pricing tiers:

- Standard Plan — $49 USD. Typically applies to claims with a single procedure.
- Plus Plan — $79 USD. Typically applies to claims with two (2) to three (3) procedures.
- Premium Plan — $99 USD. Applies to claims with four (4) or more procedures, or where the system detects coding ambiguity that requires human specialist review prior to submission.

The assigned price is presented to the Member before payment. The Member must explicitly authorize the final price before any charge is made. The Member does not select a tier; pricing is determined solely based on claim characteristics.

If additional procedures are added or complexity changes, pricing may be recalculated and must be re-authorized by the Member prior to processing.

Credimed does not charge any commission, percentage, or fee tied to the reimbursement amount. The plan fee paid at checkout, plus any additional resubmission fees expressly authorized by the Member under Section 2.2, represents the full extent of the Member's mandatory financial obligation to Credimed.

### 2.2 Resubmissions

If a claim is denied or requires correction, Credimed may perform resubmissions on the Member's behalf:

- Standard Plan ($49): includes one (1) resubmission. Additional resubmissions are available at a fee of $19 USD per attempt and require the Member's express authorization.
- Plus Plan ($79): includes one (1) resubmission. Additional resubmissions are available at a fee of $19 USD per attempt and require the Member's express authorization.
- Premium Plan ($99): includes unlimited resubmissions for the same claim within a twelve (12) month period from the original submission date, at no additional cost.

All resubmissions must relate to the same claim and are subject to insurer appeal deadlines, documentation requirements, and insurer-specific limitations.

Additional resubmission fees ($19 USD per attempt) are non-refundable, as they correspond to services already rendered.

Resubmissions are performed only when Credimed determines, in its reasonable judgment, that a viable correction or additional submission strategy exists.

### 2.3 Money-Back Guarantee (100% Conditional Refund)

Credimed offers a conditional refund guarantee across all pricing tiers. If a claim is eligible for reimbursement under the Member's insurance policy but is not paid after all Credimed-supported resubmissions, Credimed will refund 100% of the plan fee paid.

This guarantee applies only to the original plan fee (Standard $49 USD / Plus $79 USD / Premium $99 USD) and does not include additional resubmission fees.

#### Eligibility Conditions

The refund applies only if all of the following conditions are met:

(a) the service is covered under the Member's insurance policy;
(b) the service is not subject to an explicit plan exclusion;
(c) documentation is complete, valid, and accurately reflects services rendered;
(d) the claim was coded using standard CDT codes based on the information provided and accepted coding practices.

Eligibility is determined based on the insurer's policy terms, claim documentation, and standard coding practices. Eligibility does not guarantee payment and remains subject to the insurer's final determination.

#### Exclusions

The refund guarantee does not apply if the denial is due to any of the following:

- plan exclusions or non-covered services;
- out-of-network limitations or reduced coverage;
- deductible not met;
- frequency or annual maximum limitations;
- missing or incomplete documentation provided by the Member;
- inaccurate, unverifiable, or fraudulent information provided by the Member;
- the Member's failure to authorize required resubmissions within insurer deadlines.

#### Final Denial

A claim is considered finally denied when both of the following are true:

(a) all resubmissions included in the Member's plan have been completed; and
(b) either (i) Credimed determines, acting reasonably and in good faith, that no further viable resubmission strategy exists, or (ii) the Member declines additional resubmissions that are reasonably required.

If the Member declines further necessary resubmissions, the claim is considered voluntarily closed and is not eligible for refund.

#### Partial Payment Rule

Any reimbursement issued by the insurer, regardless of amount, is considered a successful outcome and voids eligibility for refund. Once the insurer issues any payment relative to the submitted services, the plan fee is fully earned and non-refundable.

#### Refund Process

Refunds are issued to the original payment method within fourteen (14) business days after the final denial determination.

Refund requests must be submitted within sixty (60) days of the final denial determination. Requests submitted after this window will not be honored.

#### Dispute Process

A Member who disagrees with Credimed's eligibility determination may request an internal review by emailing disputes@credimed.us within thirty (30) days of the determination.

Credimed will respond in writing within fourteen (14) business days with a final decision. Credimed's decision following the internal review shall be final and binding.

The internal review process does not extend the sixty (60) day window for submitting refund requests.

## 3. Reimbursement Flow

Any reimbursement approved by your insurance carrier will be issued directly to you by your insurer, typically in the form of a paper check or electronic payment according to your plan terms.

At no point does Credimed receive, control, hold, or have access to your reimbursement funds. Credimed is not a payee, intermediary, financial agent, or custodian of funds.

## 4. HIPAA & Data Handling

Credimed processes Protected Health Information ("PHI") solely for the purpose of preparing, submitting, and supporting your insurance claim.

We implement administrative, technical, and physical safeguards consistent with the HIPAA Security Rule, including encryption at rest (AES-256) and in transit (TLS 1.3), access controls, and audit logging. Access to PHI is restricted to authorized personnel involved in your case under a minimum necessary standard.

Where applicable, Credimed may act as a Business Associate in connection with PHI processing and will execute a Business Associate Agreement (BAA) where required by law.

In the event of a data breach involving your PHI, Credimed will provide notification in accordance with applicable federal and state laws. You may request deletion of your PHI after your claim reaches a final determination, subject to legal retention requirements.

## 5. Electronic Submission Authorization

You authorize Credimed to:

(a) prepare and submit your claim using the information and documentation you provide;
(b) assist in communicating with your insurer's claims department regarding that submission;
(c) use the electronic signature captured on this platform as your legally binding signature in accordance with the E-SIGN Act (15 U.S.C. §§ 7001 et seq.).

If applicable, you acknowledge that any credentials or access information you provide are shared voluntarily and solely for the limited purpose of facilitating claim submission. Credimed will not use such access for any unrelated purpose.

Credimed does not assume control over your insurance account and does not act as your legal representative beyond the limited administrative purposes described herein.

## 6. Your Representations and Indemnification

You represent and warrant that:

(a) all documents and receipts submitted are authentic, accurate, and belong to you;
(b) the services reflected were actually received and paid for by you;
(c) you have not previously received reimbursement for the same services;
(d) your insurance information is current and valid as of the date of treatment.

You agree to indemnify, defend, and hold harmless Credimed from any claims, damages, liabilities, or expenses arising from inaccurate, incomplete, or fraudulent information you provide.

You represent that you are either (i) the patient who received the services described, or (ii) a legally authorized representative of the patient with authority to act on their behalf, including authorization to access, use, and submit Protected Health Information related to the claim.

## 7. Communications Consent

By providing your contact information, you consent to receive communications from Credimed via email, SMS, or messaging platforms (including WhatsApp) related to your claim, account activity, and service updates. Message and data rates may apply.

You acknowledge that providing your phone number constitutes consent to receive automated or manual communications related to your claim, subject to applicable laws.

You may opt out of SMS communications at any time by replying STOP. Opt-out instructions for other communication channels will be provided where applicable.

## 8. Limitation of Liability

Credimed does not guarantee any reimbursement outcome. All coverage and payment determinations are made solely by your insurance carrier based on your individual plan.

To the maximum extent permitted by law, Credimed's total liability shall not exceed the total fees paid by you to Credimed in the preceding twelve (12) months.

Credimed shall not be liable for any indirect, incidental, consequential, special, or punitive damages, including but not limited to loss of benefits, delays in payment, claim denials, or delays caused by insurers, third-party systems, or incomplete documentation.

Some jurisdictions do not allow the exclusion or limitation of certain damages, so the above limitations may not fully apply to you.

## 9. Governing Law

This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles.

To the extent required by applicable consumer protection laws, you may also have rights under the laws of your state of residence.

## 10. Contact

For legal or general inquiries: legal@credimed.us
For refund eligibility disputes: disputes@credimed.us
For claim support: contact your assigned claims specialist through your dashboard


---

# 5. Cookie Policy

*Source file:* `legal/cookies.html`

# Cookie Policy

Last updated: April 27, 2026 · Version 1.0

**Draft template.** This document is provided as a starting point and must be reviewed by qualified legal counsel before Credimed accepts paying customers, particularly to ensure compliance with the California Consumer Privacy Act (CCPA/CPRA), the EU ePrivacy Directive, and any other applicable jurisdictional requirements.

## 1. What this policy covers

This Cookie Policy explains how Credimed, Inc. ("Credimed," "we," "us") uses cookies and similar storage technologies on credimed.us (https://credimed.us). It supplements our Privacy Policy (/legal/privacy.html).

## 2. What is a cookie?

A cookie is a small text file a website stores on your browser. Similar technologies include *localStorage* and *sessionStorage* (browser key-value storage we use to keep you signed in and remember claim drafts).

## 3. Cookies and storage we use

| Name / key | Type | Purpose | Duration |
|---|---|---|---|
| `CognitoIdentityServiceProvider.*` | First-party · localStorage | Keeps you signed in via AWS Cognito (JWT tokens). | Until you sign out |
| `credimed.*` | First-party · localStorage | Stores your claim draft (insurance card, receipt, plan selection) so you can return without losing progress. | Until you submit or clear it |
| `credimed.consent` | First-party · localStorage | Records your acknowledgement of this cookie banner. | 1 year |
| Stripe (`__stripe_mid`, `__stripe_sid`) | Third-party · Stripe.com | Fraud prevention on the payment form (Stripe loads these from js.stripe.com when you reach checkout). | 1 year (mid) · 30 min (sid) |

## 4. What we do NOT use

- No third-party advertising cookies.
- No cross-site tracking pixels (Facebook Pixel, Google Ads, TikTok Pixel, etc.).
- No cookies on the authenticated patient flow that contain Protected Health Information (PHI).
- No analytics that identify individual visitors. We use Plausible (https://plausible.io/data-policy), which is cookieless and aggregates by default.

## 5. Your choices

### 5.1 Block or delete cookies

Every modern browser lets you block or delete cookies in its settings. Doing so will sign you out of Credimed and clear any unfinished claim draft. The Service will still work afterward — you'll just need to sign in again.

### 5.2 Do Not Track / Global Privacy Control

We do not sell or share your personal information with third parties for advertising, so DNT and GPC signals are honored by default. We treat the presence of these signals as a request to opt out of any future processing for advertising or behavioral profiling.

### 5.3 California residents (CCPA / CPRA)

You have the right to know what personal information we collect, the right to delete it, the right to correct it, and the right to opt out of any sale or sharing. We do not sell or share personal information for cross-context behavioral advertising. For exercising any of these rights, email privacy@credimed.us (mailto:privacy@credimed.us).

## 6. Changes to this policy

We will post any changes here and update the "Last updated" date above. Material changes will be communicated by email to active users.

## 7. Contact

Questions about cookies or this policy: privacy@credimed.us (mailto:privacy@credimed.us).

---

# 6. Disclosures

*Source file:* `legal/disclosures.html`

# Disclosures

Last updated: April 27, 2026 · Version 1.0

**Draft template.** Review with qualified counsel before Credimed accepts paying customers, particularly the FTC and state UDAP-act requirements for claims about refund estimates and processing times.

## What Credimed is


Credimed is a **filing service**. We help US PPO members submit out-of-network reimbursement claims for dental work performed by licensed providers in Mexico. We act as your **limited claims representative**, with your written authorization, for the single claim you upload.

## What Credimed is NOT

- **Not insurance.** We do not underwrite, sell, or administer insurance policies. We do not pay your refund — your insurer does, directly to you.
- **Not a dentist or medical provider.** We do not provide medical or dental advice. We do not perform, recommend, or evaluate dental treatment.
- **Not affiliated with any insurance company.** We are not endorsed by, employed by, or partnered with any US insurance carrier (Aetna, Cigna, Delta, MetLife, etc.). We file out-of-network claims on your behalf using the same forms and codes any patient could use.
- **Not affiliated with any dental clinic.** We do not refer patients to specific clinics, do not receive commissions, and do not coordinate care.
- **Not a guarantee of payment.** Whether your insurer reimburses you depends on the terms of your policy, your remaining annual maximum, your deductible, the procedures performed, and your insurer's discretion in evaluating out-of-network claims. We cannot promise a specific refund amount.

## Refund estimates

The estimates shown on credimed.us are calculated from publicly available average PPO out-of-network allowed amounts and typical coinsurance bands (50–80%). They are **illustrative only**. Your actual reimbursement may be higher or lower based on:

- Your specific plan's annual maximum, deductible, and waiting periods.
- The procedures actually performed (CDT codes on your receipt).
- Your insurer's allowed-amount tables for out-of-network providers.
- How much of your annual maximum you have already used this benefit year.

## Money-back guarantee

If your insurer rejects your claim outright on grounds that we cannot remedy through one free resubmission, we refund the service fee within 5–10 business days. The guarantee covers our service fee only, not any unrecoverable amount of your out-of-network expense. Full terms are in the Service Agreement (/legal/AGREEMENT_v1.2.md) you sign before paying.

## Processing time

"Filed within 24 hours of payment" refers to the time between your payment clearing and the moment Credimed transmits the claim to your insurance carrier. The time the insurer takes to review and pay (typically 14–45 days for out-of-network dental claims) is outside our control.

## Currency and exchange

Mexican dental clinics typically issue receipts in Mexican pesos (MXN). We translate procedure descriptions to ADA CDT codes and convert paid amounts to USD using the published Bank of Mexico FIX rate on the date of service. Insurers may use a different rate of their choosing; we have no control over the conversion they apply.

## HIPAA

Credimed handles Protected Health Information (PHI) under the Health Insurance Portability and Accountability Act of 1996. We treat ourselves as a HIPAA Business Associate of any covered-entity insurer that requires a Business Associate Agreement. See the Notice of Privacy Practices (/legal/notice-of-privacy-practices.html) for details.

## Forward-looking statements

Marketing copy on our public site (homepage, blog) may include forward-looking statements ("get up to $1,500 back," "save weeks of paperwork"). These represent typical outcomes for matched patients, not guarantees. Past performance does not guarantee future results.

## Contact

Questions about these disclosures: legal@credimed.us (mailto:legal@credimed.us).

---

# 7. Marketing claims that need legal sign-off

Below are the actual lines of marketing copy we use across the site. Each one is
a forward-looking, comparative, or quantitative claim that needs validation before
launch.

## Homepage hero (index.html)
- "Your insurance may owe you money." (current headline)
- "Most members recover $600–$1,500. From $49 with 100% money-back guarantee."
- "Filed within 24 hours of payment, directly with your US insurer."

## About page
- "Half of all eligible refunds go unclaimed."
- "~50% of US dental work performed in Mexico goes unclaimed against US PPO insurance plans" (sourced as: Internal Credimed analysis · 2024 cohort, n=1,200)
- "500+ patients reimbursed" (in the hero photo tag)
- "Average member who tries it themselves gives up after 2 rejections"

## Refund estimator
- "Estimated refund: $450–$610"
- "We model this estimate against thousands of PPO claim outcomes for similar procedures. Most patients land within ±10% of the midpoint."
- "Your insurer determines the final amount. If they pay less than the low end, our team will resubmit on your file at no extra cost."

## Pricing
- "$49 — Standard plan — One-time, charged when you file"
- "Money-back guarantee — If your insurer rejects the claim outright on grounds we cannot remedy through one free resubmission, we refund the service fee within 5–10 business days."

## Email drip (5 sends)
- See `/marketing/email-drip-non-converted.md` — particularly the line "Six in ten of those denials are fixable" in email 4.

## Press kit
- See `/marketing/press-kit.md` — including the "$400 million per year in eligible US PPO benefits unclaimed" estimate and the founder quotes.

## Specific concerns from us

- The "100% money-back guarantee" wording — is this regulated language under any state's law, or is it safe?
- "HIPAA compliant" vs. "HIPAA aligned" — we currently say "aligned" everywhere except the trust badge. Is "aligned" defensible if we're a Business Associate but haven't completed a formal HIPAA audit?
- "Not insurance" disclaimer — currently in footer copy + Disclosures page. Sufficient?
- Comparison claims ("$49 vs. 25–40% commission") — we don't name competitors, but a brand named DentalRefund.com has been threatening to send us a cease-and-desist if we say "no commission" since they have a sliding-scale fee that looks like a commission. Can we keep "no commission, just one flat fee"?


---

*End of bundle. Total document count: 7. Please return red-lines or comments by the date we agreed in our intake call.*
