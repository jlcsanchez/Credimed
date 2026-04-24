# Credimed agents — AWS deploy guide

This Lambda powers the four chat agents (Sofia, Ana, Elena, Marco) that
appear on the landing and the logged-in app screens. It proxies requests
to Anthropic's Claude API with the right system prompt per agent.

## What you need before starting

- AWS Console access to the `us-west-2` region (same region as the other Credimed services).
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
- About 15–20 minutes.

## Files in this folder

```
backend/agents/
├── credimed-agents.lambda.js   ← the Lambda handler (entry: handler())
├── package.json                 ← dependency: @anthropic-ai/sdk
├── prompts/
│   ├── sofia.md    ← landing sales agent
│   ├── ana.md      ← documents + estimate onboarding agent
│   ├── elena.md    ← plan-screen pricing advisor
│   └── marco.md    ← dashboard case manager (with denial-mode emotional support)
└── DEPLOY.md       ← this file
```

## Step 1 — Bundle the Lambda

From `backend/agents/`:

```bash
cd backend/agents
npm install
rename credimed-agents.lambda.js index.mjs    # or keep name, Lambda handler is "credimed-agents.handler"
zip -r credimed-agents.zip index.mjs prompts/ node_modules/ package.json
```

(If you prefer, use the AWS SAM or Serverless framework — same file structure works.)

## Step 2 — Create the Lambda function

1. AWS Console → **Lambda** → "Create function" → "Author from scratch"
2. Function name: `credimed-agents`
3. Runtime: **Node.js 20.x**
4. Architecture: x86_64 or arm64 (arm64 is cheaper)
5. Permissions: default execution role is fine (no DynamoDB writes needed)
6. Click "Create function"
7. Under **Code source**, click "Upload from" → ".zip file" → upload `credimed-agents.zip`
8. Under **Runtime settings**, set the Handler to:
   - `index.handler` (if you renamed to `index.mjs`)
   - OR `credimed-agents.lambda.handler` (if you kept the original name)

## Step 3 — Environment variables

Configuration → Environment variables → Edit → Add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` from console.anthropic.com |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` (default, good balance for chat) |

Save. (If you ever want to swap to a different Claude model later, just
change `ANTHROPIC_MODEL` — no code redeploy.)

## Step 4 — Increase timeout

Configuration → General configuration → Edit:
- Timeout: `30 sec` (default 3s is too low — Anthropic can take 5–15s)
- Memory: `512 MB` (more than enough)

Save.

## Step 5 — Add to API Gateway

Use your existing API Gateway (the one hosting `/claims`) so the frontend
keeps using the same `CREDIMED_API` base URL.

1. API Gateway → your API → Routes
2. Create new route: `POST /agents`
3. Integration: Lambda → select `credimed-agents`
4. **Authorization**:
   - For now, leave **no authorizer** (Sofia on the landing needs to work for anonymous visitors).
   - The Lambda itself does NOT trust the JWT for authz — it just forwards any bearer token for logging. All four agents are safe to call anonymously because their system prompts don't let them reveal private data.
   - If you later want per-user rate limiting, add usage plans in API Gateway.
5. Create another route for CORS preflight: `OPTIONS /agents` → same Lambda. (Or enable CORS at the gateway level — easier.)
6. Deploy the API (Actions → Deploy → pick your stage).

## Step 6 — CORS

In the Lambda code, `CORS_HEADERS` currently allows `*`. Before going to
production, restrict it to your real domains:

```js
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://credimed.us',  // or a regex check against event.headers.origin
  ...
};
```

(Or better: handle CORS at API Gateway so the Lambda stays CORS-agnostic.)

## Step 7 — Test

From your laptop:

```bash
curl -X POST https://<your-api>.execute-api.us-west-2.amazonaws.com/agents \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "sofia",
    "messages": [{"role":"user","content":"Hola, cuánto cobran?"}]
  }'
```

Expected response:
```json
{ "reply": "Hola 👋 soy Sofia. Nuestro fee es una sola vez...", "agent": "sofia", "usage": {...} }
```

## Step 8 — Wire the frontend

Once the endpoint is live, tell Claude Code (me) the API Gateway URL and I'll
inject the widget into the relevant pages:

| Agent | Page | Script tag to add |
|---|---|---|
| Sofia | `index.html` (landing) | `<script src="/app/widgets/agent-chat.js" data-agent="sofia"></script>` |
| Ana   | `app/documents.html`   | `<script src="widgets/agent-chat.js" data-agent="ana" data-context='{"step":"documents"}'></script>` |
| Ana   | `app/estimate.html`    | `<script src="widgets/agent-chat.js" data-agent="ana" data-context='{"step":"estimate"}'></script>` |
| Elena | `app/plan.html`        | `<script src="widgets/agent-chat.js" data-agent="elena" data-context='{"planTier":"..."}'></script>` |
| Marco | `app/dashboard.html`   | `<script src="widgets/agent-chat.js" data-agent="marco" data-context='{...claim data...}'></script>` |

The widget auto-detects the `data-agent` attribute and initializes on page load.

## Cost estimate

Using `claude-sonnet-4-6` at the configured max_tokens:

- Sofia: ~400 tokens out, ~500 in per turn → ~\$0.003/turn
- Ana / Elena: ~500 tokens out, ~600 in per turn → ~\$0.004/turn
- Marco (denial mode): ~700 tokens out, ~1000 in per turn → ~\$0.007/turn

Average user chat: 3–5 turns. So ~\$0.015–0.04 per conversation.
1,000 conversations/month ≈ \$15–40/month in Anthropic API costs.

Set an Anthropic budget alert at \$100/mo to start, adjust later based on volume.

## Troubleshooting

- **502 from API Gateway**: Lambda is crashing. Check CloudWatch logs for the `credimed-agents` function.
- **"ANTHROPIC_API_KEY is not set"**: env var didn't save — re-add it in Configuration.
- **Timeouts**: bump timeout to 60s. If it still times out, Anthropic is having an incident — check status.anthropic.com.
- **CORS errors in browser**: the preflight `OPTIONS /agents` route is missing. Add it or enable CORS at the gateway.
- **Agent returns English when user wrote Spanish**: the system prompt explicitly handles this, but if it fails, check that the first user message wasn't mistranslated by auto-correct. Add more examples to the prompt's "bilingual" section.

## Security notes

- The `ANTHROPIC_API_KEY` lives only in Lambda env vars. The frontend never sees it.
- Message history is capped at 30 turns in the Lambda to limit token cost per request.
- Conversations are logged to CloudWatch by default (standard Lambda behavior). If that's a HIPAA concern, add a middleware that strips PII from logs, or disable request body logging entirely.
- The prompts explicitly forbid giving legal or medical advice — agents are instructed to escalate to human support.
