# RevampAI

Fashion sourcing decisions need evidence. RevampAI is an **AI Tinkerers Fashion
Track hackathon project** that uses real ZooWork managed agents to review
supplier claims, garment materials, user-supplied carbon scores, and proposed
restocks. Optional ZooData commerce data adds market context to the review.

**Try it:** https://revampai-3ms5.onrender.com

**Source:** https://github.com/ithllc/ZooWork_Veris_AI_Tinkers_Hackathon

## What the app does

1. Accepts 1–10 garment records and supplier evidence in the browser or agent API.
2. Optionally searches ZooData's product database for fashion market context.
3. Creates an isolated ZooWork Agent, starts it, opens a Session, and submits the
   records. Each audit uses a separate Agent/workspace to avoid mixing users.
4. Consumes real ZooWork events until `run.finished`; validates the returned JSON
   against the expected schema and every submitted SKU.
5. Shows hold/review decisions, missing evidence, and a downloadable manager
   report. Progress is available through polling while the AI works.
6. Stops and soft-deletes the temporary Agent. Failures are reported as failures;
   there is no simulated ZooWork fallback or invented successful result.

Signed-in users can **chat with the agent**, dictate questions in supported
browsers, and optionally hear replies read aloud. Questions use garment records
and the last six conversation messages; each reply is a real ZooWork run.
Typed input is always available. Speech recognition may use a browser provider's
remote service and requires microphone permission.

**Messaging requires sign-up.** Create a username/password account to save
completed reviews and chat replies to your inbox. Browser push alerts are
optional and require permission. Notifications contain a generic completion
message without garment evidence. Turn them off in the app. Email/SMS and
password recovery are not provided in this demo.

ZooData results include product links and retrieval time. They are catalog
snapshot data, not a live Amazon search ranking or proof of certification.

## What a review means

`hold` means evidence is insufficient or contradictory. `review` means ready
for human evidence review, **not approval**. The app does not certify suppliers,
verify legal compliance, establish a carbon measurement methodology, or write
to production inventory. Carbon scores are user-supplied context, not measured
emissions. Supplied evidence and market titles are untrusted inputs.

The original hackathon concept included Veris stateful dependency twins. The
legacy `verisConnector.js` is retained as an experimental utility and is **not
called by the web app**. Its local simulation is not an authoritative supplier
or inventory system. Live ZooWork reviews replace the previous simulated
supplier verification and restock workflow. Remote Veris is not claimed to be
connected.

## Connect coding agents

RevampAI supports **MCP Streamable HTTP**, a **stdio MCP bridge**, REST, and
**Agent2Agent 1.0 JSON-RPC**. Codex, Claude Code, OpenCode and other MCP clients
can submit records and retrieve the same reports through standard tools. Each
client must be configured; individual client UIs have not all been tested.

See [agent connection instructions](docs/agents.md) or the website's connection
panel. Tools are `start_fashion_audit`, `get_fashion_audit`, and
`search_fashion_market`. A2A discovery is `/.well-known/agent-card.json` and the
endpoint is `/a2a`. These are actual protocol endpoints using the official SDKs.
The service does not run coding assistants on your behalf or expose arbitrary
shell execution.

## Run locally

Requires Node.js 22 or later.

```bash
npm ci
cp .env.example .env
# Set ZOOWORK_API_KEY, and optionally ZOODATA_API_KEY, in .env.
npm start
```

Open http://localhost:3000. `.env` is ignored by Git. Keep keys server-side.
ZooWork and ZooData use **separate API keys**. Missing ZooWork configuration
prevents live audits; missing ZooData configuration disables market enrichment.
Set `ZOOWORK_MODEL` to a selectable model from your ZooWork models catalog if
the default model is retired. A successful models request tests authentication,
not funded task execution; the live audit check tests actual execution.

## Demo boundaries

Visitors receive signed 24-hour access tokens and can read only their own jobs.
Only share public/synthetic examples in the public demo. Tokens are bearer
credentials. Guest reports expire after one hour and are held in process memory;
restart loses active jobs. Signed-in users' completed replies and reports are
saved in Postgres for seven days. Accounts use scrypt password hashes, hashed
session tokens, and HttpOnly SameSite cookies. Evidence is included in the saved
report and conversation is sent to ZooWork. Download reports you need. ZooWork
may retain provider-side
transcripts after soft deletion according to its service policies.

The demo limits five provider requests per token/day, 30 total/day, two
concurrent audits, 10 garments/request, and IP-based requests. Provider usage is
billable or consumes credits. Limits reset on restart and are not an exact
monetary spending cap. Use a single Render instance. A production deployment
needs durable active jobs/quotas and account recovery. Browser push delivery
depends on browser/OS support and permissions. Inbox and subscription records
survive web-service restarts; active tasks do not. The current free Render
database expires **December 8, 2026**, unless upgraded or migrated.

## Verify and deploy

```bash
npm test
node scripts/check-protocols.js
# Against this app's dedicated database only; creates/deletes two test users:
node scripts/check-accounts.js
node --check public/app.js
git diff --check
```

Unit tests mock providers; protocol checks use an injected fixture service and
make no paid calls. Live checks were also performed with the provided keys:
ZooWork completed an evidence-based review; ZooData returned real products.
See [deployment notes](DEPLOYMENT.md) for current hosted verification.

Render uses `npm ci --omit=dev`, `npm start`, `/api/health`, and manual deploys
from `main`. `/api/health` reports configuration presence, not continuous
provider reachability. See [render.yaml](render.yaml).

Account/notification settings are `DATABASE_URL`, `ACCESS_TOKEN_SECRET`,
`VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`. Generate a VAPID pair with
`npx web-push generate-vapid-keys`; keep the private key server-side. A stable
access-token secret keeps agent tokens valid across deploys. Accounts and
messaging are disabled when no database is configured. Login sessions last
seven days; agent connection tokens expire after 24 hours.

## API sources

- [ZooWork documentation](https://zoowork.ai/docs/en/)
- [ZooWork quickstart](https://zoowork.ai/docs/en/get-started/quickstart)
- [ZooWork authentication](https://zoowork.ai/docs/en/get-started/authentication)
- [ZooData current docs](https://zoodata.ai/en/docs)
- [ZooData API reference source](https://github.com/SerendipityOneInc/ZooData-Skills/blob/main/zoodata/references/openapi-reference.md)
- [Official A2A JavaScript SDK](https://github.com/a2aproject/a2a-js)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

Open source under **GNU AGPL-3.0**. See [LICENSE](LICENSE). Fork it, use your own
provider keys, and follow the license's source-sharing requirements.
