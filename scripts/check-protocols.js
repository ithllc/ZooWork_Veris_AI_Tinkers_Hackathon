// Deterministic protocol integration check: provider calls are replaced at the service boundary.
const assert = require("node:assert/strict");
const { createApp } = require("../server");
const { createAuditService } = require("../service");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
(async () => {
  const result = {
    auditLog: { provider: "test-fixture", operations: [] },
    markdownReport: "fixture report",
  };
  const service = createAuditService({
    run: async () => result,
    search: async () => ({ provider: "test-fixture", products: [] }),
  });
  const app = await createApp({ service });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let mcp;
  try {
    const unauthorized = await fetch(base + "/api/run-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(unauthorized.status, 401);
    const { token } = await (
      await fetch(base + "/api/access-token", { method: "POST" })
    ).json();
    const { token: other } = await (
      await fetch(base + "/api/access-token", { method: "POST" })
    ).json();
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const invalid = await fetch(base + "/api/run-audit", {
      method: "POST",
      headers,
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(invalid.status, 400);
    mcp = new Client({ name: "revampai-check", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers },
      }),
    );
    const list = await mcp.listTools();
    assert.equal(list.tools.length, 3);
    const started = await mcp.callTool({
      name: "start_fashion_audit",
      arguments: {
        items: [
          {
            sku: "TEST-1",
            fabricType: "Cotton",
            supplierId: "SUP-1",
            carbonFootprintScore: 20,
            restockQty: 2,
          },
        ],
      },
    });
    assert.ok(!started.isError);
    const job = JSON.parse(started.content[0].text);
    assert.ok(job.id);
    const read = await mcp.callTool({
      name: "get_fashion_audit",
      arguments: { id: job.id },
    });
    assert.equal(JSON.parse(read.content[0].text).status, "completed");
    const forbidden = await fetch(base + "/api/audits/" + job.id, {
      headers: { Authorization: `Bearer ${other}` },
    });
    assert.equal(forbidden.status, 404);
    const a2a = await fetch(base + "/a2a", {
      method: "POST",
      headers: { ...headers, "A2A-Version": "1.0" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "check",
        method: "SendMessage",
        params: {
          message: {
            messageId: "check-1",
            role: "ROLE_USER",
            parts: [{ data: { action: "status", id: job.id } }],
          },
        },
      }),
    });
    const rpc = await a2a.json();
    assert.equal(a2a.status, 200);
    assert.ok(!rpc.error, JSON.stringify(rpc));
    assert.equal(rpc.result.message.parts[0].data.status, "completed");
    const card = await (
      await fetch(base + "/.well-known/agent-card.json")
    ).json();
    assert.equal(card.supportedInterfaces[0].protocolVersion, "1.0");
    const { AgentCard } = await import("@a2a-js/sdk");
    assert.equal(
      AgentCard.fromJSON(card).securitySchemes.visitor.scheme.value.scheme,
      "bearer",
    );
    console.log(
      "PASS: REST authorization/validation/isolation, MCP tools and audit, A2A SendMessage/report retrieval, agent card",
    );
  } finally {
    if (mcp) await mcp.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
