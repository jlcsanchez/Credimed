/* =========================================================================
   Credimed claims Lambda
   AWS Lambda handler for the user-facing /claims/:id endpoint and the
   admin-facing /admin/claims (list) and /admin/claims/:id (PATCH status).

   Deploy:
     1. Create a Node.js 20.x Lambda in us-west-2.
     2. Permissions: attach a role with DynamoDB read/write to the
        'credimed-claims' table (PK = userSub, SK = claimId).
     3. Environment variables:
          DYNAMO_TABLE=credimed-claims        (required)
          AWS_REGION=us-west-2                (auto-set by Lambda)
          ADMIN_GROUP=admin                   (Cognito group for admin auth)
     4. Bundle this file as index.mjs, install AWS SDK v3:
          npm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
     5. Routes in API Gateway (HTTP API, JWT authorizer using your User Pool):
          POST   /claims                     ← already exists, stays the same
          GET    /claims/:id                 ← user fetches their own claim
          GET    /admin/claims               ← admin lists all
          PATCH  /admin/claims/:id           ← admin updates status

   Authorization:
     - All routes require a valid Cognito JWT (HTTP API JWT authorizer).
     - User routes (GET /claims/:id): the path param's claim must belong
       to the JWT's `sub`.
     - Admin routes: the JWT's `cognito:groups` claim must include the
       value of ADMIN_GROUP (default 'admin'). Configure the group in
       Cognito → User pools → Groups, then add admin users to it.

   DynamoDB schema (suggestion — adjust to whatever you've already set up):
     PK:  userSub        (S, Cognito user sub)
     SK:  claimId        (S, e.g. CMX-2026-0A4B29)
     GSI: claimId        (S, for cross-user lookups by id, optional)
     attributes: status, plan, paidAmount, paidAmountUSD, paidCurrency,
                 estimateMin, estimateMax, city, procedures, procedure,
                 firstName, lastName, email, insurer, memberId,
                 submittedAt, updatedAt
   ========================================================================= */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMO_TABLE || 'credimed-claims';
const ADMIN_GROUP = process.env.ADMIN_GROUP || 'admin';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-west-2' }));

const CORS = {
  'Access-Control-Allow-Origin': '*',  // TODO: tighten to https://credimed.us in prod
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

const ok    = (body)        => ({ statusCode: 200, headers: CORS, body: JSON.stringify(body) });
const err   = (code, msg)   => ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) });
const noContent             = ()         => ({ statusCode: 204, headers: CORS, body: '' });

/* Pull the JWT claims that API Gateway already validated for us. With
   an HTTP API + JWT authorizer, the decoded claims arrive on
   event.requestContext.authorizer.jwt.claims. */
function readClaims(event) {
  const j = event?.requestContext?.authorizer?.jwt?.claims;
  if (!j) return null;
  // groups arrive either as an array or a stringified JSON array
  let groups = j['cognito:groups'] || [];
  if (typeof groups === 'string') {
    try { groups = JSON.parse(groups); } catch { groups = groups.split(/[,\s]+/).filter(Boolean); }
  }
  return {
    sub: j.sub,
    email: j.email || null,
    groups: Array.isArray(groups) ? groups : [],
  };
}

function isAdmin(claims) {
  return claims && claims.groups && claims.groups.includes(ADMIN_GROUP);
}

/* Public-facing claim shape — same fields the dashboard / admin UI
   already consume. Keep this canonical so the frontend doesn't have to
   know whether the claim came from /claims/:id (user) or
   /admin/claims (admin scan). */
function shapeClaim(item) {
  if (!item) return null;
  return {
    id: item.claimId || item.id,
    userSub: item.userSub,
    status: item.status || 'submitted',
    plan: item.plan || null,
    paidAmount:    item.paidAmount    ?? null,
    paidAmountUSD: item.paidAmountUSD ?? null,
    paidCurrency:  item.paidCurrency  ?? null,
    estimateMin:   item.estimateMin   ?? null,
    estimateMax:   item.estimateMax   ?? null,
    city:          item.city          || null,
    procedures:    item.procedures    || null,
    procedure:     item.procedure     || null,
    firstName:     item.firstName     || null,
    lastName:      item.lastName      || null,
    email:         item.email         || null,
    insurer:       item.insurer       || null,
    memberId:      item.memberId      || null,
    submittedAt:   item.submittedAt   || null,
    updatedAt:     item.updatedAt     || null,
  };
}

export async function handler(event) {
  // Preflight
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const claims = readClaims(event);
  if (!claims || !claims.sub) return err(401, 'Unauthorized');

  const path = event.requestContext?.http?.path || event.path || '';
  const params = event.pathParameters || {};

  /* ─── GET /claims/:id ─── User fetches their own claim. */
  if (method === 'GET' && /\/claims\/[^/]+$/.test(path) && !path.includes('/admin/')) {
    const claimId = params.id || path.split('/').pop();
    if (!claimId) return err(400, 'Missing claim id');
    try {
      const r = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { userSub: claims.sub, claimId },
      }));
      if (!r.Item) return err(404, 'Claim not found');
      // Belt-and-suspenders: even if the caller knows another user's
      // claim id, the GetCommand above keyed on their own sub means
      // they only see their own. This explicit check guards against
      // any future schema where claimId is the sole PK.
      if (r.Item.userSub && r.Item.userSub !== claims.sub) return err(403, 'Forbidden');
      return ok({ claim: shapeClaim(r.Item) });
    } catch (e) {
      console.error('[GET /claims/:id]', e);
      return err(500, 'Lookup failed');
    }
  }

  /* ─── GET /claims ─── User lists all of THEIR claims. */
  if (method === 'GET' && /\/claims\/?$/.test(path) && !path.includes('/admin/')) {
    try {
      const r = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'userSub = :s',
        ExpressionAttributeValues: { ':s': claims.sub },
      }));
      return ok({ claims: (r.Items || []).map(shapeClaim) });
    } catch (e) {
      console.error('[GET /claims]', e);
      return err(500, 'List failed');
    }
  }

  /* ─── GET /admin/claims ─── Admin lists ALL claims (paginated). */
  if (method === 'GET' && /\/admin\/claims\/?$/.test(path)) {
    if (!isAdmin(claims)) return err(403, 'Admin access required');
    try {
      // Scan is fine for early-stage volumes (<10k claims). Switch to a
      // GSI on submittedAt or status when the table outgrows it.
      const r = await ddb.send(new ScanCommand({ TableName: TABLE, Limit: 500 }));
      const items = (r.Items || []).map(shapeClaim).sort((a, b) => {
        return (b.submittedAt || '').localeCompare(a.submittedAt || '');
      });
      return ok({ claims: items, count: items.length });
    } catch (e) {
      console.error('[GET /admin/claims]', e);
      return err(500, 'Admin list failed');
    }
  }

  /* ─── PATCH /admin/claims/:id ─── Admin updates a claim's status. */
  if (method === 'PATCH' && /\/admin\/claims\/[^/]+$/.test(path)) {
    if (!isAdmin(claims)) return err(403, 'Admin access required');
    const claimId = params.id || path.split('/').pop();
    if (!claimId) return err(400, 'Missing claim id');
    let body;
    try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body; }
    catch { return err(400, 'Invalid JSON'); }
    const newStatus = body && body.status;
    const allowed = ['submitted', 'in-review', 'approved', 'paid', 'denied'];
    if (!allowed.includes(newStatus)) return err(400, 'Invalid status');

    try {
      // Find the userSub for this claimId. With the recommended GSI on
      // claimId, we can do a Query. Without it, scan-and-filter (slow
      // but works for early-stage). Comment out whichever path you set up.
      const ix = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'claimId = :id',
        ExpressionAttributeValues: { ':id': claimId },
        Limit: 2,
      }));
      const item = ix.Items && ix.Items[0];
      if (!item) return err(404, 'Claim not found');

      const r = await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { userSub: item.userSub, claimId },
        UpdateExpression: 'SET #s = :s, updatedAt = :u, lastTouchedBy = :a',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': newStatus,
          ':u': new Date().toISOString(),
          ':a': claims.email || claims.sub,
        },
        ReturnValues: 'ALL_NEW',
      }));
      // TODO: trigger an email/SMS notification to the patient when
      // status crosses 'in-review' → 'approved' or 'denied'. Hand off
      // to SES + SNS or directly post to a /notifications Lambda.
      return ok({ claim: shapeClaim(r.Attributes) });
    } catch (e) {
      console.error('[PATCH /admin/claims/:id]', e);
      return err(500, 'Update failed');
    }
  }

  return err(404, `Route not found: ${method} ${path}`);
}
