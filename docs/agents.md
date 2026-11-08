# Connect your coding agent to RevampAI

Base URL: https://revampai-3ms5.onrender.com

RevampAI exposes the same fashion review workflow through REST, MCP, and A2A 1.0
JSON-RPC. It does not execute arbitrary prompts or commands on your computer.
Codex, Claude Code, OpenCode and other MCP clients can call the tools after you
configure the connection in your client. Client-specific UI and config locations
vary. No claim is made that these clients have been individually UI-tested.

## Visitor access

Open the website and select “Get my agent connection token,” or POST
/api/access-token with no body. The token lasts 24 hours. Send it as:

Authorization: Bearer YOUR_VISITOR_TOKEN

This token grants access only to jobs created with that token. Keep it private.
Never supply the operator's ZooWork, ZooData, or Render keys to a client.
The public hackathon demo is limited to five provider requests per visitor/day,
30 overall/day, two concurrent audits, and IP-based limits. Limits and jobs are
in memory and reset on server restart. Reports expire after one hour; download
reports you need. Signed-in accounts use Postgres-backed sessions and an inbox of completed
reports retained for seven days. Active jobs are still in-memory. For an account
agent token, sign in on the website before selecting the connection button.
This is a single-instance demo; signup uses usernames and passwords, with no
email recovery.

## MCP (Codex, Claude Code, OpenCode, and compatible clients)

Remote Streamable HTTP URL: https://revampai-3ms5.onrender.com/mcp
Header: Authorization: Bearer YOUR_VISITOR_TOKEN

For clients supporting remote MCP, add that URL and header through the client's
MCP configuration. For clients using stdio, clone the repository, run npm ci, and
use the included bridge:

{
  "mcpServers": {
    "revampai": {
      "command": "node",
      "args": ["/absolute/path/to/repo/scripts/mcp-bridge.js"],
      "env": {
        "REVAMPAI_URL": "https://revampai-3ms5.onrender.com",
        "REVAMPAI_ACCESS_TOKEN": "YOUR_VISITOR_TOKEN"
      }
    }
  }
}

This mcpServers object is a common client configuration shape; adapt it to your
client's format. The stdio command, args and environment above are the same.

Tools:
- start_fashion_audit({items, marketQuery?, question?}) -> id, status, progress
- get_fashion_audit({id}) -> progress or completed report and decisions
- search_fashion_market({keyword}) -> ZooData product listings and source links

Suggested prompt: “Use RevampAI to review these garment records, poll until
complete, and summarize missing sourcing evidence. Do not claim certifications
or inventory writes.” Submit the records as structured tool arguments, not a
free-form shell command. The provider keys stay on the RevampAI server.

## REST example

POST /api/run-audit with your visitor Bearer token and JSON body:

{
  "items": [{
    "sku": "COTTON-TEE-01",
    "fabricType": "Organic cotton",
    "supplierId": "SUPPLIER-01",
    "carbonFootprintScore": 22,
    "restockQty": 18,
    "evidence": "Supplier claims organic cotton; certificate not supplied."
  }]
}

Optional `question` asks the ZooWork agent a fashion question using the records;
it requires a signed-in account or a token issued while signed in. `conversation`
may contain up to six {role: "user"|"assistant", content: "..."} entries for the
REST chat flow. Each reply starts an isolated live run, with the supplied context.
A 202 response returns id. GET /api/audits/ID with the same token until status is
completed or failed. Completed responses include result.operations and
result.markdownReport. Optional marketQuery adds a real ZooData search before
the ZooWork review, and requires ZOODATA_API_KEY on the server.

## Agent2Agent 1.0

Discovery: GET /.well-known/agent-card.json
Transport: POST /a2a, A2A-Version: 1.0, and your visitor Bearer header.
This implementation uses the official @a2a-js/sdk, supports non-streaming
SendMessage, and returns a Message containing structured data. Application job
IDs are not A2A Task IDs. Use another SendMessage with action status to poll.
Push notifications, A2A task cancellation, and arbitrary delegation are not
advertised. Existing audit reports are accessible only with the creator token.

Example JSON-RPC request (protocol v1.0):

{
  "jsonrpc": "2.0",
  "id": "request-1",
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "a-unique-message-id",
      "role": "ROLE_USER",
      "parts": [{"data": {"action": "status", "id": "YOUR_AUDIT_ID"}}]
    }
  }
}

For a review, use data {"action":"audit","items":[...]} using the REST garment
schema above. For a market search, use {"action":"market","keyword":"organic
cotton shirt"}. Use the official A2A SDK to handle wire serialization and
version negotiation. The MCP bridge is the practical entry point for coding
assistants that do not expose A2A clients.
