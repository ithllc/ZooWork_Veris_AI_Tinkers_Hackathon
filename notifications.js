const webpush = require("web-push");
const { z } = require("zod");
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(20)
      .max(200),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(10)
      .max(100),
  }),
});
function validPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
function createNotifications(accounts) {
  const configured = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && accounts,
  );
  if (configured)
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "https://revampai-3ms5.onrender.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  return {
    configured,
    publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null,
    async complete(owner, job) {
      if (!accounts) return;
      const subscription = await accounts.notifyRecord(owner, job);
      if (!subscription || !configured) return;
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title: "RevampAI has an update",
            body:
              job.status === "completed"
                ? "Your agent reply is ready. Sign in to read it."
                : "Your review could not complete. Sign in for details.",
            url: "/?inbox=1",
          }),
          { TTL: 3600, timeout: 10000 },
        );
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410)
          await accounts.unsubscribe(owner);
        else console.error("Browser notification delivery failed");
      }
    },
    async subscribe(owner, input) {
      const subscription = subscriptionSchema.parse(input);
      if (!validPushEndpoint(subscription.endpoint))
        throw Object.assign(new Error("Unsupported browser push service."), {
          status: 400,
        });
      await accounts.subscribe(owner, subscription);
    },
  };
}
module.exports = { createNotifications, validPushEndpoint };
