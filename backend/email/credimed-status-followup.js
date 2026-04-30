/**
 * credimed-status-followup (Lambda)
 *
 * Invoked by EventBridge Scheduler 24h after a claim is paid + filed.
 * Sends the "in review" email to the patient — the cue that the human
 * Credimed team has picked up the claim and is preparing it for the
 * insurer (or has already sent it via fax).
 *
 * Why decouple from the Stripe webhook:
 *   The webhook needs to ack 200 to Stripe within 30s. Scheduling a
 *   delayed email side-task there is fine, but executing the delayed
 *   send must live in its own Lambda so the trigger surface is just
 *   "scheduled call from EventBridge → 1 invocation".
 *
 * Trigger payload (set by the webhook when the schedule was created):
 *   { claimId: "abc123" }
 *
 * Idempotency:
 *   This Lambda re-checks the claim row before sending. If the claim
 *   has already moved past 'paid' (e.g., admin manually flipped it to
 *   'in-review' or 'denied' inside the 24h window), we skip — the
 *   "in review" message would be misleading. Ditto if the claim has
 *   been refunded.
 *
 * Env vars:
 *   AWS_REGION   — us-west-2
 *   FROM_EMAIL   — verified SES sender (inherited by sendEmail.js)
 *
 * IAM:
 *   dynamodb:GetItem on credimed-claims
 *   kms:Decrypt on the customer-managed key used to encrypt PII
 *   ses:SendEmail, ses:SendRawEmail
 *   logs:CreateLogStream, logs:PutLogEvents
 */

import {
  DynamoDBClient,
  GetItemCommand
} from '@aws-sdk/client-dynamodb';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { sendEmailSafely } from './sendEmail.js';

const REGION = process.env.AWS_REGION || 'us-west-2';
const TABLE  = 'credimed-claims';

const db  = new DynamoDBClient({ region: REGION });
const kms = new KMSClient({ region: REGION });

async function decryptField(encryptedValue) {
  if (!encryptedValue) return '';
  try {
    const result = await kms.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedValue, 'base64')
    }));
    return new TextDecoder().decode(result.Plaintext);
  } catch (err) {
    console.error('decrypt failed:', err.message);
    return '';
  }
}

function audit(fields) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...fields
  }));
}

export const handler = async (event) => {
  const claimId = event?.claimId;
  if (!claimId) {
    audit({ event: 'followup_missing_claimid', received: event });
    return { ok: false, reason: 'missing claimId' };
  }

  let claim;
  try {
    const row = await db.send(new GetItemCommand({
      TableName: TABLE,
      Key: { claimId: { S: claimId } }
    }));
    claim = row.Item;
  } catch (err) {
    audit({ event: 'followup_db_error', claimId, error: err.message });
    throw err;
  }

  if (!claim) {
    audit({ event: 'followup_claim_not_found', claimId });
    return { ok: false, reason: 'claim not found' };
  }

  // Skip if the claim has already advanced past 'paid' or been
  // refunded. The "in review" email would be stale or contradict a
  // later admin update.
  const status = claim.status?.S || claim.paymentStatus?.S || null;
  const skipStatuses = new Set([
    'in-review', 'approved', 'paid', 'denied', 'refunded', 'needs-docs'
  ]);
  if (status && skipStatuses.has(status)) {
    audit({ event: 'followup_skipped_status', claimId, status });
    return { ok: true, skipped: true, status };
  }

  const email = await decryptField(claim.email?.S);
  const firstName = await decryptField(claim.firstName?.S);

  if (!email) {
    audit({ event: 'followup_no_email', claimId });
    return { ok: false, reason: 'no email on claim' };
  }

  await sendEmailSafely({
    to: email,
    eventType: 'statusInReview',
    data: { firstName: firstName || '', claimId }
  });

  audit({ event: 'followup_sent', claimId });
  return { ok: true, claimId };
};
