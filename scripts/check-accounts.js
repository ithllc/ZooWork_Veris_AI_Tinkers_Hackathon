// Uses a dedicated app database and deletes only the two users this check creates.
require("dotenv").config();
const assert = require("node:assert/strict");
const { randomBytes } = require("crypto");
const { Pool } = require("pg");
const { createApp } = require("../server");
(async () => {
  if (!process.env.DATABASE_URL)
    throw Error("Set a dedicated RevampAI DATABASE_URL");
  const ids = [];
  const app = await createApp({
    run: async () => ({
      auditLog: {
        provider: "fixture",
        reply: "Certificate missing",
        operations: [],
      },
      markdownReport: "fixture report",
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const password = randomBytes(20).toString("hex");
  async function call(path, body, cookie, method) {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      r,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    const first = await call("/api/auth/signup", {
      username: "test_" + randomBytes(6).toString("hex"),
      password,
    });
    assert.equal(first.r.status, 201);
    assert.match(first.r.headers.get("set-cookie"), /HttpOnly/i);
    ids.push(first.data.user.id);
    const second = await call("/api/auth/signup", {
      username: "test_" + randomBytes(6).toString("hex"),
      password,
    });
    ids.push(second.data.user.id);
    assert.equal(second.r.status, 201);
    const duplicate = await call("/api/auth/signup", {
      username: first.data.user.username,
      password,
    });
    assert.equal(duplicate.r.status, 409);
    const bad = await call("/api/auth/login", {
      username: first.data.user.username,
      password: password + "wrong",
    });
    assert.equal(bad.r.status, 401);
    const login = await call("/api/auth/login", {
      username: first.data.user.username,
      password,
    });
    assert.equal(login.r.status, 200);
    const guest = await call("/api/messages");
    assert.equal(guest.r.status, 401);
    const job = await call(
      "/api/run-audit",
      {
        items: [
          {
            sku: "TEST",
            fabricType: "Cotton",
            supplierId: "SUP",
            carbonFootprintScore: 20,
            restockQty: 2,
          },
        ],
      },
      login.cookie,
    );
    assert.equal(job.r.status, 202);
    let inbox;
    for (let i = 0; i < 20; i++) {
      inbox = await call("/api/messages", null, login.cookie);
      if (inbox.data.messages.length) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(inbox.data.messages.length, 1);
    assert.equal(inbox.data.messages[0].result.reply, "Certificate missing");
    const other = await call("/api/messages", null, second.cookie);
    assert.equal(other.data.messages.length, 0);
    const privateJob = await call(
      "/api/audits/" + job.data.id,
      null,
      second.cookie,
    );
    assert.equal(privateJob.r.status, 404);
    const ssrf = await call(
      "/api/notifications/subscribe",
      {
        endpoint: "https://127.0.0.1/private",
        keys: { p256dh: "a".repeat(80), auth: "a".repeat(22) },
      },
      login.cookie,
    );
    assert.equal(ssrf.r.status, 400);
    await call("/api/auth/logout", {}, login.cookie);
    const me = await call("/api/auth/me", null, login.cookie);
    assert.equal(me.data.user, null);
    console.log(
      "PASS: signup/login, duplicate and wrong-password rejection, HttpOnly session, durable inbox, account isolation, push endpoint validation, logout",
    );
  } finally {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    for (const id of ids)
      await pool.query("DELETE FROM revamp_users WHERE id=$1", [id]);
    await pool.end();
    await new Promise((r) => server.close(r));
    await app.locals.accounts.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
