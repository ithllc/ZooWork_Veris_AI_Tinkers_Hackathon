const { randomUUID } = require("crypto");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { garmentSchema } = require("./agent");

function registerTools(server, api) {
  const reply = async (operation) => {
    try {
      return {
        content: [{ type: "text", text: JSON.stringify(await operation()) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error.status
              ? error.message
              : "Invalid request or provider unavailable.",
          },
        ],
      };
    }
  };
  server.registerTool(
    "start_fashion_audit",
    {
      description:
        "Start a real ZooWork fashion evidence review. Returns an audit ID; poll get_fashion_audit. No inventory is changed.",
      inputSchema: {
        items: z.array(garmentSchema).min(1).max(10),
        marketQuery: z.string().min(3).max(160).optional(),
        question: z.string().min(1).max(2000).optional(),
      },
    },
    (input) => reply(() => api.start(input)),
  );
  server.registerTool(
    "get_fashion_audit",
    {
      description:
        "Get your audit progress, decisions, missing evidence, and manager report.",
      inputSchema: { id: z.string().uuid() },
    },
    ({ id }) => reply(() => api.read(id)),
  );
  server.registerTool(
    "search_fashion_market",
    {
      description:
        "Search real fashion market listings through ZooData. Listings do not prove certification.",
      inputSchema: { keyword: z.string().min(3).max(160) },
    },
    ({ keyword }) => reply(() => api.search(keyword)),
  );
}

function agentCard(base) {
  return {
    name: "RevampAI",
    description:
      "Fashion supplier evidence reviews with real ZooWork agents and optional ZooData market context.",
    version: "0.2.0",
    supportedInterfaces: [
      {
        url: `${base}/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    securitySchemes: {
      visitor: { httpAuthSecurityScheme: { scheme: "bearer" } },
    },
    securityRequirements: [{ schemes: { visitor: { list: [] } } }],
    skills: [
      {
        id: "fashion-review",
        name: "Fashion sourcing review",
        description:
          "Send JSON action audit, status, or market. See /docs/agents.",
        tags: ["fashion", "compliance", "sourcing"],
      },
    ],
    documentationUrl: `${base}/docs/agents`,
  };
}
async function mountProtocols(app, service, authorize) {
  const { DefaultRequestHandler, InMemoryTaskStore } =
    await import("@a2a-js/sdk/server");
  const { AgentCard } = await import("@a2a-js/sdk");
  const { jsonRpcHandler, UserBuilder } =
    await import("@a2a-js/sdk/server/express");
  const base =
    process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
  app.get("/.well-known/agent-card.json", (_req, res) =>
    res.json(agentCard(base)),
  );
  app.post("/mcp", authorize, async (req, res, next) => {
    const server = new McpServer({ name: "revampai", version: "0.2.0" });
    registerTools(server, {
      start: (input) => {
        if (input.question && !req.account)
          throw Object.assign(new Error("Sign in to use agent messaging."), {
            status: 401,
          });
        return service.start(req.owner, input);
      },
      read: (id) => service.read(req.owner, id),
      search: (q) => service.search(req.owner, q),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      await server.close();
      next(error);
    }
  });
  app.all("/mcp", (_req, res) => res.sendStatus(405));
  app.use("/a2a", authorize, (req, res, next) => {
    const executor = {
      async execute(context, bus) {
        let result;
        try {
          const parts = context.userMessage.parts;
          const part =
            parts.find((p) => p.content?.$case === "data") ||
            parts.find((p) => p.content?.$case === "text");
          const input =
            part?.content?.$case === "data"
              ? part.content.value
              : JSON.parse(part?.content?.value || "{}");
          if (input.action === "audit") {
            if (input.question && !req.account)
              throw Object.assign(
                new Error("Sign in to use agent messaging."),
                { status: 401 },
              );
            result = service.start(req.owner, input);
          } else if (input.action === "status")
            result = service.read(req.owner, z.string().uuid().parse(input.id));
          else if (input.action === "market")
            result = await service.search(req.owner, input.keyword);
          else
            result = {
              error:
                "Use action audit with items, status with id, or market with keyword.",
            };
        } catch (error) {
          result = {
            error: error.status
              ? error.message
              : "Invalid request or provider unavailable.",
          };
        }
        bus.publish({
          kind: "message",
          data: {
            messageId: randomUUID(),
            contextId: context.contextId,
            role: 2,
            parts: [
              {
                content: { $case: "data", value: result },
                mediaType: "application/json",
              },
            ],
          },
        });
        bus.finished();
      },
      async cancelTask() {
        throw new Error(
          "This endpoint returns messages; use status to poll the application audit ID.",
        );
      },
    };
    const handler = new DefaultRequestHandler(
      AgentCard.fromJSON(agentCard(base)),
      new InMemoryTaskStore(),
      executor,
    );
    jsonRpcHandler({
      requestHandler: handler,
      userBuilder: UserBuilder.noAuthentication,
    })(req, res, next);
  });
}
module.exports = { registerTools, mountProtocols, agentCard };
