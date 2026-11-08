self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "RevampAI update", {
      body: data.body || "Sign in to read your agent message.",
      tag: "revampai-update",
      data: { url: "/?inbox=1" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: "refresh-inbox" });
          return;
        }
      }
      await clients.openWindow("/?inbox=1");
    })(),
  );
});
