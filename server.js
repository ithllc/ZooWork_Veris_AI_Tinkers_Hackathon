require("dotenv").config();
const express = require("express");
const path = require("path");
const { rateLimit } = require("express-rate-limit");
const { issueToken, verifyToken } = require("./access");
const { createAuditService } = require("./service");
const { mountProtocols } = require("./protocols");
const { createAccounts } = require("./accounts");
const { createNotifications } = require("./notifications");

async function createApp(options = {}) {
  const app = express(),
    accounts =
      options.accounts === null ? null : options.accounts || createAccounts();
  if (accounts) await accounts.init();
  const notifications = createNotifications(accounts);
  const service =
    options.service ||
    createAuditService({
      onComplete: notifications.complete,
      run: options.run,
    });
  const cookie = (req) =>
    /(?:^|;\s*)revamp_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400000,
  };
  async function authorize(req, res, next) {
    try {
      const sessionUser = accounts ? await accounts.resolve(cookie(req)) : null;
      const owner =
        sessionUser?.id ||
        verifyToken((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (!owner)
        return res
          .status(401)
          .json({ error: "Sign in or supply a visitor access token." });
      req.owner = owner;
      req.account =
        sessionUser || (accounts ? await accounts.byId(owner) : null);
      next();
    } catch (e) {
      next(e);
    }
  }
  async function requireAccount(req, res, next) {
    try {
      if (!accounts)
        return res
          .status(503)
          .json({ error: "Account storage is not configured." });
      const user = req.account || (await accounts.byId(req.owner));
      if (!user)
        return res
          .status(401)
          .json({ error: "Sign up or sign in to use messaging." });
      req.account = user;
      next();
    } catch (e) {
      next(e);
    }
  }
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api") || ["/a2a", "/mcp"].includes(req.path))
      res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.use(
    ["/api", "/mcp", "/a2a"],
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      service: "RevampAI",
      version: "0.2.0",
      zooWork: {
        configured: Boolean(process.env.ZOOWORK_API_KEY),
        mode: "live-managed-agents",
      },
      zooData: {
        configured: Boolean(process.env.ZOODATA_API_KEY),
        mode: "live-product-search",
      },
      accounts: { configured: Boolean(accounts) },
      notifications: { configured: notifications.configured },
      inventory: "advisory-only",
      timestamp: new Date().toISOString(),
    }),
  );
  app.post(
    "/api/access-token",
    rateLimit({ windowMs: 3600000, limit: 5, legacyHeaders: false }),
    async (req, res, next) => {
      try {
        const user = accounts ? await accounts.resolve(cookie(req)) : null;
        res.json({
          token: issueToken(user?.id),
          expiresIn: 86400,
          scope: "Own audits and fashion market searches",
        });
      } catch (e) {
        next(e);
      }
    },
  );
  const authLimit = rateLimit({
    windowMs: 3600000,
    limit: 15,
    legacyHeaders: false,
  });
  for (const action of ["signup", "login"])
    app.post(`/api/auth/${action}`, authLimit, async (req, res, next) => {
      try {
        if (!accounts)
          return res
            .status(503)
            .json({ error: "Account storage is not configured." });
        const user = await accounts[action](req.body),
          session = await accounts.session(user);
        res
          .cookie("revamp_session", session, cookieOptions)
          .status(action === "signup" ? 201 : 200)
          .json({ user });
      } catch (e) {
        next(e);
      }
    });
  app.get("/api/auth/me", async (req, res, next) => {
    try {
      res.json({ user: accounts ? await accounts.resolve(cookie(req)) : null });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/auth/logout", async (req, res, next) => {
    try {
      if (accounts) await accounts.logout(cookie(req));
      const { maxAge: _maxAge, ...clearOptions } = cookieOptions;
      res.clearCookie("revamp_session", clearOptions).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/messages",
    authorize,
    requireAccount,
    async (req, res, next) => {
      try {
        res.json({ messages: await accounts.messages(req.owner) });
      } catch (e) {
        next(e);
      }
    },
  );
  app.get("/api/notifications/key", authorize, requireAccount, (_req, res) =>
    res.json({ publicKey: notifications.publicKey }),
  );
  app.post(
    "/api/notifications/subscribe",
    authorize,
    requireAccount,
    async (req, res, next) => {
      try {
        if (!notifications.configured)
          return res
            .status(503)
            .json({ error: "Push notifications are not configured." });
        await notifications.subscribe(req.owner, req.body);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );
  app.delete(
    "/api/notifications/subscribe",
    authorize,
    requireAccount,
    async (req, res, next) => {
      try {
        await accounts.unsubscribe(req.owner);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );
  const workLimit = rateLimit({
    windowMs: 3600000,
    limit: 12,
    legacyHeaders: false,
  });
  app.post("/api/run-audit", authorize, workLimit, (req, res, next) => {
    try {
      if (req.body?.question && !req.account)
        return res
          .status(401)
          .json({ error: "Sign up or sign in to chat with the agent." });
      res.status(202).json({ ok: true, ...service.start(req.owner, req.body) });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/audits/:id", authorize, (req, res, next) => {
    try {
      res.json({ ok: true, ...service.read(req.owner, req.params.id) });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/market-search",
    authorize,
    workLimit,
    async (req, res, next) => {
      try {
        res.json(await service.search(req.owner, req.body.keyword));
      } catch (e) {
        next(e);
      }
    },
  );
  await mountProtocols(app, service, authorize);
  app.locals.accounts = accounts;
  app.get("/docs/agents", (_req, res) =>
    res.type("text/plain").sendFile(path.join(__dirname, "docs", "agents.md")),
  );
  app.use(express.static(path.join(__dirname, "public")));
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.name === "ZodError")
      return res.status(400).json({
        error: "Invalid input",
        details: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    const status =
      error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({
      error:
        status < 500 || status === 503
          ? error.message
          : "Provider unavailable or request failed. No simulated result was substituted.",
    });
  });
  return app;
}
if (require.main === module)
  createApp()
    .then((app) =>
      app.listen(process.env.PORT || 3000, "0.0.0.0", () =>
        console.log("RevampAI listening"),
      ),
    )
    .catch(() => {
      console.error("RevampAI startup failed");
      process.exitCode = 1;
    });
module.exports = { createApp };
