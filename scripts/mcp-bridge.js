#!/usr/bin/env node
// Local stdio bridge for coding agents. Uses a RevampAI visitor token, never a provider key.
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const { registerTools } = require("../protocols");
const base = process.env.REVAMPAI_URL || "https://revampai-3ms5.onrender.com";
const token = process.env.REVAMPAI_ACCESS_TOKEN;
if (!token) {
  console.error(
    "Set REVAMPAI_ACCESS_TOKEN using the dashboard connection panel.",
  );
  process.exit(1);
}
async function request(path, body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(40000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
      status: response.status,
    });
  return data;
}
const server = new McpServer({ name: "revampai", version: "0.2.0" });
registerTools(server, {
  start: (input) => request("/api/run-audit", input),
  read: (id) => request(`/api/audits/${encodeURIComponent(id)}`),
  search: (keyword) => request("/api/market-search", { keyword }),
});
server.connect(new StdioServerTransport()).catch(() => {
  console.error("RevampAI MCP bridge failed");
  process.exitCode = 1;
});
