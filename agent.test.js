const {
  runFashionOperations,
  auditInputSchema,
  parseReview,
} = require("./agent");
jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
const { createAuditService } = require("./service");
const { issueToken, verifyToken } = require("./access");
const { searchFashionMarket } = require("./zooData");
const item = {
  sku: "TEE-1",
  fabricType: "Cotton",
  supplierId: "SUP-1",
  carbonFootprintScore: 22,
  restockQty: 10,
};
function mockClient(outcome = "succeeded", text) {
  const review =
    text ||
    JSON.stringify({
      summary: "Evidence is missing.",
      items: [
        {
          sku: "TEE-1",
          decision: "hold",
          rationale: "No certificate.",
          missingEvidence: ["Certificate"],
        },
      ],
    });
  return {
    createAgent: jest.fn().mockResolvedValue({ agent_id: "agt_test" }),
    startAgent: jest.fn(),
    waitUntilRunning: jest.fn(),
    createSession: jest.fn().mockResolvedValue({ session_id: "session_test" }),
    postEvents: jest.fn().mockResolvedValue({ events: [{ accepted: true }] }),
    streamEvents: async function* () {
      yield { text: review };
      yield { done: true, outcome };
    },
    stopAgent: jest.fn(),
    deleteAgent: jest.fn(),
  };
}
const sdk = {
  assistantText: (e) => e.text || "",
  isRunFinished: (e) => e.done,
  runOutcome: (e) => e.outcome,
};
test("live path consumes agent response and never invents verification or restock", async () => {
  const client = mockClient();
  const r = await runFashionOperations({ items: [item] }, { client, sdk });
  expect(r.auditLog.provider).toBe("ZooWork");
  expect(r.auditLog.operations[0].decision).toBe("hold");
  expect(r.auditLog.metrics.restocksExecuted).toBe(0);
  expect(client.postEvents).toHaveBeenCalledWith(
    "agt_test",
    "session_test",
    expect.arrayContaining([
      expect.objectContaining({
        type: "user.message",
        idempotency_key: expect.any(String),
      }),
    ]),
  );
  expect(client.stopAgent).toHaveBeenCalled();
  expect(client.deleteAgent).toHaveBeenCalled();
});
test("failed run interrupts, cleans up and fails without simulated output", async () => {
  const client = mockClient("failed");
  await expect(
    runFashionOperations({ items: [item] }, { client, sdk }),
  ).rejects.toThrow("did not succeed");
  expect(client.postEvents.mock.calls[1][2][0].type).toBe("user.interrupt");
  expect(client.stopAgent).toHaveBeenCalled();
});
test("unaccepted message fails and cleans up", async () => {
  const client = mockClient();
  client.postEvents.mockResolvedValue({ events: [{ accepted: false }] });
  await expect(
    runFashionOperations({ items: [item] }, { client, sdk }),
  ).rejects.toThrow("did not accept");
  expect(client.deleteAgent).toHaveBeenCalled();
});
test("invalid output and missing SKU cannot become approvals", () => {
  expect(() => parseReview('{"summary":"ok","items":[]}', [item])).toThrow();
  expect(() =>
    parseReview(
      JSON.stringify({
        summary: "ok",
        items: [
          {
            sku: "TEE-1",
            decision: "approved",
            rationale: "ok",
            missingEvidence: [],
          },
        ],
      }),
      [item],
    ),
  ).toThrow();
});
test("invalid and duplicate records rejected", () => {
  expect(() =>
    auditInputSchema.parse({ items: [{ ...item, restockQty: -1 }] }),
  ).toThrow();
  expect(() => auditInputSchema.parse({ items: [item, item] })).toThrow();
  expect(() => auditInputSchema.parse({ items: [] })).toThrow();
});
test("visitor tokens reject tampering", () => {
  const token = issueToken();
  expect(verifyToken(token)).toBeTruthy();
  expect(verifyToken(token + "x")).toBeNull();
  expect(verifyToken("bad")).toBeNull();
});
test("audit reports are isolated by visitor", async () => {
  const service = createAuditService({
    run: async () => ({
      auditLog: { provider: "ZooWork" },
      markdownReport: "report",
    }),
  });
  const job = service.start("owner-a", { items: [item] });
  expect(() => service.read("owner-b", job.id)).toThrow("not found");
  await new Promise(setImmediate);
  expect(service.read("owner-a", job.id).status).toBe("completed");
});
test("ZooData uses authenticated documented search and preserves source provenance", async () => {
  const fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ asin: "B0D1XD1ZV3", title: "Cotton shirt", price: 25 }],
      }),
    });
  const r = await searchFashionMarket("cotton shirt", {
    apiKey: "test",
    fetch,
  });
  expect(fetch.mock.calls[0][0]).toBe(
    "https://api.zoodata.ai/openapi/v2/products/search",
  );
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test");
  expect(r.products[0].sourceUrl).toContain("B0D1XD1ZV3");
});
test("ZooData errors never return fake products", async () => {
  await expect(
    searchFashionMarket("cotton shirt", {
      apiKey: "test",
      fetch: async () => ({ ok: false, status: 401 }),
    }),
  ).rejects.toThrow("401");
});
test("messaging credentials require strong passwords and safe usernames", () => {
  const { credentials } = require("./accounts");
  expect(() =>
    credentials.parse({ username: "user", password: "short" }),
  ).toThrow();
  expect(() =>
    credentials.parse({
      username: "<script>",
      password: "long-enough-password",
    }),
  ).toThrow();
});
test("push subscriptions cannot target arbitrary network endpoints", () => {
  const { validPushEndpoint } = require("./notifications");
  expect(validPushEndpoint("https://fcm.googleapis.com/fcm/send/test")).toBe(
    true,
  );
  expect(validPushEndpoint("https://127.0.0.1/metadata")).toBe(false);
  expect(validPushEndpoint("https://evil.test/")).toBe(false);
  expect(validPushEndpoint("http://fcm.googleapis.com/a")).toBe(false);
});
