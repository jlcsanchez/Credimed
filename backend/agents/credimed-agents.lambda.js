/* =========================================================================
   Credimed agents Lambda
   Proxy frontend chat requests to Anthropic's API. Selects one of four
   system prompts (Sofia / Ana / Elena / Marco) based on an `agent` field
   in the request body.

   Deploy:
     1. Create a Node.js 20.x Lambda in AWS, same region as your other
        Credimed services (us-west-2).
     2. Environment variables:
          ANTHROPIC_API_KEY   = sk-ant-... (from console.anthropic.com)
          ANTHROPIC_MODEL     = claude-sonnet-4-6 (default, good for chat)
     3. Add this file as index.mjs (or index.js + "type":"module" in package.json).
        Include the four prompt files from ../prompts/ in the deployment zip.
     4. Dependencies: "@anthropic-ai/sdk": "^0.40.0"
     5. Route in API Gateway:
          POST /agents
          body: { agent: "sofia|ana|elena|marco", messages: [...], context?: {...} }
     6. Enable CORS for credimed.us + localhost (or your dev domains).
     7. Auth: for sofia on the landing, leave open (no signup yet).
        For ana/elena/marco, require Cognito authorizer (the user is
        logged in on the app screens). Keep the same authorizer the
        /claims endpoint uses.

   Request body shape:
     {
       "agent": "sofia" | "ana" | "elena" | "marco",
       "messages": [
         { "role": "user", "content": "Hola, cuánto cobran?" },
         { "role": "assistant", "content": "Hola, soy Sofia…" },
         { "role": "user", "content": "Tengo Delta Dental, me cubre?" }
       ],
       "context": {                         // optional, for logged-in agents
         "claimId": "CMX-2026-0A4B29",
         "claimStatus": "denied",           // so Marco knows to use denial mode
         "paidAmount": 1500,
         "estimatedRefund": { "low": 900, "high": 1125 },
         "planTier": "Standard",
         "procedures": ["Crown (zirconia)"]
       }
     }

   Response body:
     {
       "reply": "Hola Juan, aquí Marco…",
       "agent": "marco",
       "usage": { "input_tokens": 421, "output_tokens": 83 }
     }

   Errors: 4xx with { "error": "…" } for bad input; 5xx for Anthropic/network
   issues. Frontend shows a friendly "Ana se está reiniciando…" fallback.
   ========================================================================= */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROMPTS = {
  sofia: readFileSync(join(__dirname, 'prompts', 'sofia.md'), 'utf8'),
  ana:   readFileSync(join(__dirname, 'prompts', 'ana.md'),   'utf8'),
  elena: readFileSync(join(__dirname, 'prompts', 'elena.md'), 'utf8'),
  marco: readFileSync(join(__dirname, 'prompts', 'marco.md'), 'utf8'),
};

const AGENT_CONFIG = {
  sofia: { max_tokens: 400,  temperature: 0.7 },  // sales, needs variety
  ana:   { max_tokens: 500,  temperature: 0.6 },  // onboarding, accurate
  elena: { max_tokens: 500,  temperature: 0.5 },  // pricing, precise
  marco: { max_tokens: 700,  temperature: 0.6 },  // case mgr, denial needs longer empathetic replies
};

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',  // TODO: restrict to credimed.us in prod
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function buildContextBlock(context) {
  if (!context) return null;
  const lines = ['<user_context>'];
  if (context.claimId)          lines.push(`claim_id: ${context.claimId}`);
  if (context.claimStatus)      lines.push(`claim_status: ${context.claimStatus}`);
  if (context.paidAmount)       lines.push(`paid_at_clinic_usd: ${context.paidAmount}`);
  if (context.estimatedRefund)  lines.push(`estimated_refund: $${context.estimatedRefund.low}–$${context.estimatedRefund.high}`);
  if (context.planTier)         lines.push(`plan_tier: ${context.planTier}`);
  if (context.procedures?.length) lines.push(`procedures: ${context.procedures.join(', ')}`);
  if (context.firstName)        lines.push(`user_first_name: ${context.firstName}`);
  lines.push('</user_context>');
  lines.push('');
  lines.push('Use this context to personalize your reply. Reference specific numbers/status when relevant. Do NOT paste this block back to the user — internalize it.');
  return lines.join('\n');
}

export async function handler(event) {
  // CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { agent, messages, context } = body || {};

  if (!agent || !PROMPTS[agent]) {
    return errorResponse(400, `Unknown agent: ${agent}. Valid: sofia, ana, elena, marco.`);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, 'messages[] required and non-empty');
  }
  // Defensive: cap message history at 30 turns to control token cost
  const trimmed = messages.slice(-30);

  // Build system prompt = base prompt + optional context block
  let systemPrompt = PROMPTS[agent];
  const ctxBlock = buildContextBlock(context);
  if (ctxBlock) systemPrompt += '\n\n' + ctxBlock;

  const cfg = AGENT_CONFIG[agent];

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      system: systemPrompt,
      messages: trimmed,
    });

    const reply = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        reply,
        agent,
        usage: resp.usage,
      }),
    };
  } catch (err) {
    console.error('[credimed-agents]', agent, err);
    const status = err.status || 500;
    return errorResponse(status, err.message || 'Agent unavailable');
  }
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}
