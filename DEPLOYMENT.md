# Render deployment

Project and service: `revampai`, in the dedicated `RevampAI` workspace.
Live URL: https://revampai-3ms5.onrender.com

The deployment follows the reviewed VC Startup Finder methodology: dedicated
workspace, explicit service settings through Render's REST API, manual deploys,
exact source commit verification, deployment status polling, and hosted checks.
No VC Startup Finder credentials or services are reused.

## Service configuration

- Native Node.js 22 runtime; free plan in Virginia; single instance.
- Build `npm ci --omit=dev`; start `npm start`; liveness `/api/health`.
- GitHub repo `ithllc/ZooWork_Veris_AI_Tinkers_Hackathon`, branch `main`.
- Auto-deploy off; manually trigger the exact pushed commit.
- `NODE_ENV=production`, `PUBLIC_URL=https://revampai-3ms5.onrender.com`.
- Server-only secrets: `ZOOWORK_API_KEY`, `ZOODATA_API_KEY`,
  `ACCESS_TOKEN_SECRET`. The Render administrative key stays local.
- `ZOOWORK_MODEL` must identify a selectable ZooWork model.
- `DEMO_DAILY_LIMIT=30`; in-memory limits/jobs require a single instance.

## Accounts and messaging

A dedicated free Render Postgres instance, `revampai-accounts`, stores usernames,
scrypt password hashes, hashed sessions, browser subscriptions and completed
messages. It expires **2026-12-08** unless upgraded or migrated. Its connection
string is supplied as the server-only `DATABASE_URL`. Startup creates the
app-specific `revamp_*` tables idempotently. No existing app database is touched.
External database access is restricted to the implementation host during
verification and is removed after hosted checks; Render uses the internal URL.

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optional `VAPID_SUBJECT` configure
Web Push. Keys are generated locally and stored in `.env` and Render secrets.
Only signed-in accounts can subscribe. Push endpoints are restricted to known
browser push services. Failed 404/410 subscriptions are removed. Notifications
contain no supplier evidence. Push delivery is browser/OS-dependent; the inbox
is the persistent record. No email/SMS provider is configured.

Account checks cover signup, password rejection, sessions, isolated persistent
inboxes, notification endpoint validation, and logout. Browser checks cover live
chat, inbox survival across reload, service-worker registration, typed controls,
market-enriched review, desktop/mobile layout, and absence of JavaScript errors.
Microphone and OS-level notification delivery require a supported user device;
headless tests cannot establish real microphone capture or OS delivery.

The local `.env` is ignored and owner-readable only. Render secrets are supplied
through the API, never committed or exposed by the health endpoint.

## Verification

Local unit and protocol tests cover live SDK orchestration with mocked providers,
failures, schema validation, cleanup, authentication, token isolation, MCP and
A2A message exchange. A separate live ZooWork review completed and held an
unsupported organic-cotton claim. ZooData product search returned five real
catalog listings using `https://api.zoodata.ai/openapi/v2/products/search`.
The older ZooData blog's `api.apiclaw.io/v2` URL returned 404; the integration
uses the current documented endpoint.

After every deploy, wait for Render status `live`, verify the exact commit,
check homepage and health configuration, run one synthetic audit to completion,
check market search, and retrieve the same audit through MCP and A2A. Record
non-secret identifiers and check outcomes in `render-deployment.json`.

No simulated supplier verification or inventory mutation is called by the app.
The report is advisory: no live Veris connection, certified supplier validation,
or production inventory writes are claimed. Provider errors fail visibly.

Rollback by deploying the previous application commit and repeating the hosted
checks. The earlier version used simulations; rolling back would reintroduce
that behavior. Application rollback does not undo account schema or stored messages. Back up the dedicated database before any future destructive schema change. Render free instances can
sleep, and job/limit memory resets on restart. Save downloaded reports.
