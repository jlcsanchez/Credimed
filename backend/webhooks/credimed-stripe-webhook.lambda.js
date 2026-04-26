/**
 * credimed-stripe-webhook (Lambda)
 *
 * Receives Stripe webhook events (specifically `payment_intent.succeeded`
 * and `payment_intent.payment_failed`), verifies the signature, and
 * updates the corresponding claim in DynamoDB so downstream systems
 * (email notifications, insurer submission) can react.
 *
 * URL shape (Lambda Function URL — direct, no API Gateway):
 *   https://<id>.lambda-url.us-west-2.on.aws/
 *
 * The Stripe webhook console points to this URL.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY      — same key the payment Lambda uses (sk_live_* or sk_test_*)
 *   STRIPE_WEBHOOK_SECRET  — given by Stripe when you create the webhook endpoint
 *                            (starts with whsec_*). DIFFERENT per environment.
 *   AWS_REGION             — set to us-west-2
 *
 * IAM role permissions:
 *   dynamodb:UpdateItem on arn:aws:dynamodb:us-west-2:*:table/credimed-claims
 *   logs:CreateLogStream, logs:PutLogEvents on the Lambda's log group
 *
 * Critical contract with the payment Lambda:
 *   When the payment Lambda creates a PaymentIntent, it MUST set
 *   metadata.claimId so this webhook can match the payment back to a
 *   claim. If metadata.claimId is missing, the webhook logs the event
 *   for manual reconciliation and returns 200 (so Stripe doesn't retry).
 */

import Stripe from 'stripe';
import {
  DynamoDBClient,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-west-2';
const TABLE  = 'credimed-claims';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia'
});
const db = new DynamoDBClient({ region: REGION });

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * HIPAA audit log — records every webhook event we receive. PHI never
 * comes through Stripe webhooks (Credimed relies on the payment-
 * processing carve-out), so the body is safe to log in full. Still
 * we redact the raw signature header.
 */
function audit(fields) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...fields
  }));
}

/**
 * Stripe Function URLs deliver the request body as a base64 string by
 * default. constructEvent() needs the raw bytes/string exactly as
 * received, otherwise signature verification fails.
 */
function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
}

/**
 * Mark a claim as paid. Conditional update so we never overwrite a
 * later state (e.g., admin manually flipped to in-review while the
 * webhook was retrying). Returns true if updated, false if no-op.
 */
async function markClaimPaid(claimId, paymentIntentId, amount, currency) {
  if (!claimId) return false;

  const now = new Date().toISOString();
  try {
    await db.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { claimId: { S: claimId } },
      UpdateExpression:
        'SET paymentStatus = :paid, paidAt = :now, ' +
        'stripePaymentIntentId = :pi, paidAmountCents = :amt, paidCurrency = :cur',
      // Don't downgrade paid → submitted on a stale retry.
      ConditionExpression:
        'attribute_not_exists(paymentStatus) OR paymentStatus <> :paid',
      ExpressionAttributeValues: {
        ':paid': { S: 'paid' },
        ':now':  { S: now },
        ':pi':   { S: paymentIntentId },
        ':amt':  { N: String(amount) },
        ':cur':  { S: currency }
      }
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Already marked paid by an earlier delivery — fine.
      audit({ event: 'webhook_idempotent_skip', claimId, paymentIntentId });
      return false;
    }
    throw err;
  }
}

async function markClaimPaymentFailed(claimId, paymentIntentId, reason) {
  if (!claimId) return false;
  const now = new Date().toISOString();
  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression:
      'SET paymentStatus = :failed, paymentFailedAt = :now, ' +
      'stripePaymentIntentId = :pi, paymentFailureReason = :rsn',
    ExpressionAttributeValues: {
      ':failed': { S: 'failed' },
      ':now':    { S: now },
      ':pi':     { S: paymentIntentId },
      ':rsn':    { S: reason || 'unknown' }
    }
  }));
  return true;
}

export const handler = async (event) => {
  // Stripe always POSTs. Anything else → 405.
  const method = event.requestContext?.http?.method || 'POST';
  if (method !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sigHeader =
    event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  const rawBody = getRawBody(event);

  if (!sigHeader || !rawBody) {
    audit({ event: 'webhook_bad_request', hasSig: !!sigHeader, hasBody: !!rawBody });
    return { statusCode: 400, body: 'Missing signature or body' };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sigHeader, WEBHOOK_SECRET);
  } catch (err) {
    // Signature mismatch — log and reject. NEVER trust unverified bodies.
    audit({ event: 'webhook_signature_invalid', error: err.message });
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  audit({
    event: 'webhook_received',
    type: stripeEvent.type,
    stripeEventId: stripeEvent.id,
    livemode: stripeEvent.livemode
  });

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded': {
        const pi = stripeEvent.data.object;
        const claimId = pi.metadata?.claimId || pi.metadata?.claim_id;
        if (!claimId) {
          // No way to associate — log for manual reconciliation. Return
          // 200 so Stripe doesn't retry; this is a config issue, not
          // a transient error.
          audit({
            event: 'webhook_unmatched_payment',
            stripeEventId: stripeEvent.id,
            paymentIntentId: pi.id,
            amount: pi.amount,
            currency: pi.currency,
            note: 'metadata.claimId missing — verify payment Lambda sets it'
          });
        } else {
          const updated = await markClaimPaid(claimId, pi.id, pi.amount, pi.currency);
          audit({
            event: 'webhook_payment_succeeded',
            stripeEventId: stripeEvent.id,
            claimId,
            paymentIntentId: pi.id,
            amount: pi.amount,
            currency: pi.currency,
            dbUpdated: updated
          });
          // TODO: enqueue email "Your payment was received" + insurer submission.
          // Will be added once SES is wired up. For now the audit log is the
          // single source of truth.
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = stripeEvent.data.object;
        const claimId = pi.metadata?.claimId || pi.metadata?.claim_id;
        const reason = pi.last_payment_error?.message;
        if (claimId) {
          await markClaimPaymentFailed(claimId, pi.id, reason);
        }
        audit({
          event: 'webhook_payment_failed',
          stripeEventId: stripeEvent.id,
          claimId: claimId || null,
          paymentIntentId: pi.id,
          reason: reason || null
        });
        break;
      }

      default:
        // Other event types (charge.refunded, customer.created, etc.)
        // We log them so we can later add handlers without redeploying
        // the webhook URL config in Stripe.
        audit({
          event: 'webhook_unhandled_type',
          type: stripeEvent.type,
          stripeEventId: stripeEvent.id
        });
    }
  } catch (err) {
    console.error('[webhook handler error]', err);
    // Return 5xx so Stripe retries with backoff.
    return { statusCode: 500, body: `Handler failed: ${err.message}` };
  }

  // Always 200 on verified events we processed (or chose not to handle).
  return { statusCode: 200, body: 'ok' };
};
