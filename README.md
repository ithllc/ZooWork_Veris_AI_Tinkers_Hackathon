# RevampAI

**RevampAI** is a Fashion Track hackathon project for **AI Tinkerers** that combines ZooWork agent orchestration with Veris stateful dependency sandboxes for safe compliance testing.

The core idea: run fashion inventory and supplier checks in an isolated, stateful Veris sandbox before touching live systems, so agent-driven decisions can be validated under realistic conditions without production risk.

## Why this project exists

Fashion compliance workflows can be fragile when:
- inventory records are mutated (quantity corrections, SKU status updates, sourcing changes), and
- supplier attestations are incomplete or inconsistent.

RevampAI uses ZooWork-powered agents to model those operations and Veris sandboxes to execute and inspect them in a secure test boundary.

## Architecture at a glance

1. **ZooWork agent layer**
   - `inventory-mutation-agent`: simulates inventory updates and evaluates policy/compliance impact.
   - `supplier-verification-agent`: verifies supplier assertions and flags missing/invalid compliance evidence.

2. **Veris stateful sandbox layer**
   - receives agent-driven test requests,
   - persists state across multi-step mutation flows,
   - enables repeatable verification with no direct production-side mutations.

3. **Configuration layer (`config.js`)**
   - centralizes Veris environment variables:
     - `VERIS_API_BASE`
     - `VERIS_SANDBOX_KEY`
   - exposes ZooWork agent templates used to initialize and standardize task payloads.

## Security and reliability model

- **Isolated execution**: all mutation and verification experiments occur in Veris sandbox instances.
- **Stateful testing**: scenario state is preserved across sequential checks (e.g., mutate inventory then re-verify supplier compliance impact).
- **No secret hardcoding**: API endpoints and credentials are loaded from environment variables via `dotenv`.
- **Deterministic review loops**: standard agent templates reduce ad-hoc behavior and improve auditability.

## Project structure

```bash
.
├── agent.js
├── README.md
├── config.js
├── verisConnector.js
└── package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
VERIS_API_BASE=https://your-veris-sandbox-api.example.com
VERIS_SANDBOX_KEY=your_sandbox_api_key
```

### 3. Start your local process

```bash
npm start
```

> `package.json` is preconfigured with `express`, `axios`, and `dotenv` to support API integration, sandbox calls, and environment-driven setup.

## How RevampAI runs compliance experiments

1. A ZooWork agent receives a task (inventory mutation or supplier verification).
2. The agent assembles request payloads using the corresponding template in `config.js`.
3. The request is sent to the Veris sandbox endpoint (`VERIS_API_BASE`) with sandbox credentials (`VERIS_SANDBOX_KEY`).
4. The sandbox applies stateful changes and returns compliance outcomes.
5. Results are reviewed and only validated patterns are promoted to production workflows.

## Hackathon focus

RevampAI is intentionally lightweight for rapid iteration during the AI Tinkerers Fashion Track:
- easy environment bootstrap,
- explicit agent templates,
- secure-by-default sandbox-first testing approach.

## Veris connector module

`verisConnector.js` provides the core sandbox simulation primitives:
- `initializeFashionSandbox()` initializes a stateful fashion twin for inventory and material certification APIs.
  - Uses remote Veris sandbox mode when `VERIS_API_BASE` and `VERIS_SANDBOX_KEY` are configured.
  - Falls back to a local stateful twin mode for offline/test-only runs.
- `writeInventoryRow(sandboxId, row)` and `readInventoryRow(sandboxId, sku)` simulate stateful inventory mutation/readback.
- `setErrorInjection(sandboxId, { supplierTimeout, invalidMaterialClaim })` toggles controlled failures.
- `simulateSupplierVerification(...)` and `simulateMaterialCertificationCheck(...)` execute checks with injected timeout/invalid-claim scenarios for resilience testing.

## Agent workflow script

`agent.js` is the core recurring operations workflow:
- intake raw apparel metadata (`fabricType`, `carbonFootprintScore`, `supplierId`, `restockQty`, optional `sku`),
- verify supplier ethical compliance through the Veris sandbox connector,
- execute mock restock writes to the stateful inventory twin only when verification passes,
- output both a structured JSON audit log and a Markdown manager summary.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See `LICENSE`.
