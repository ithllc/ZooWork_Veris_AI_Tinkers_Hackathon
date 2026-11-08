jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
const webpush = require("web-push");
const { createNotifications } = require("./notifications");
let saved;
beforeEach(() => {
  saved = { ...process.env };
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  jest.clearAllMocks();
});
afterEach(() => {
  process.env = saved;
});
test("completion persists to owner inbox and sends no supplier data in push", async () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/example" };
  const accounts = { notifyRecord: jest.fn().mockResolvedValue(subscription) };
  const n = createNotifications(accounts);
  const job = {
    id: "job-1",
    status: "completed",
    result: { evidence: "PRIVATE SUPPLIER DATA" },
  };
  await n.complete("owner-a", job);
  expect(accounts.notifyRecord).toHaveBeenCalledWith("owner-a", job);
  expect(webpush.sendNotification).toHaveBeenCalledWith(
    subscription,
    expect.any(String),
    expect.objectContaining({ TTL: 3600 }),
  );
  expect(webpush.sendNotification.mock.calls[0][1]).not.toContain("PRIVATE");
});
test("expired push subscriptions are removed without deleting inbox message", async () => {
  const accounts = {
    notifyRecord: jest
      .fn()
      .mockResolvedValue({ endpoint: "https://fcm.googleapis.com/example" }),
    unsubscribe: jest.fn(),
  };
  webpush.sendNotification.mockRejectedValue({ statusCode: 410 });
  await createNotifications(accounts).complete("owner-a", {
    status: "completed",
  });
  expect(accounts.unsubscribe).toHaveBeenCalledWith("owner-a");
});
test("inbox works when push is disabled and guest jobs do not send alerts", async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  const accounts = { notifyRecord: jest.fn().mockResolvedValue(null) };
  await createNotifications(accounts).complete("guest", {
    status: "completed",
  });
  expect(accounts.notifyRecord).toHaveBeenCalled();
  expect(webpush.sendNotification).not.toHaveBeenCalled();
});
