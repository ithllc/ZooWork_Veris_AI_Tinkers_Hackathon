const { Pool } = require("pg");
const {
  scrypt: scryptCallback,
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} = require("crypto");
const { promisify } = require("util");
const { z } = require("zod");
const scrypt = promisify(scryptCallback);
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{3,40}$/),
  password: z.string().min(12).max(128),
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
function createAccounts(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
  });
  pool.on("error", () => console.error("Account database connection error"));
  async function init() {
    await pool.query(`
 CREATE TABLE IF NOT EXISTS revamp_users(id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS revamp_sessions(hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES revamp_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS revamp_push(user_id uuid PRIMARY KEY REFERENCES revamp_users(id) ON DELETE CASCADE, subscription jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS revamp_messages(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES revamp_users(id) ON DELETE CASCADE, job_id uuid NOT NULL, status text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now());
 `);
  }
  async function passwordHash(
    password,
    salt = randomBytes(16).toString("hex"),
  ) {
    return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
  }
  async function signup(input) {
    const { username, password } = credentials.parse(input);
    const id = randomUUID();
    try {
      await pool.query(
        "INSERT INTO revamp_users(id,username,password_hash) VALUES($1,$2,$3)",
        [id, username, await passwordHash(password)],
      );
    } catch (e) {
      if (e.code === "23505")
        throw Object.assign(new Error("Username unavailable."), {
          status: 409,
        });
      throw e;
    }
    return { id, username };
  }
  async function login(input) {
    const { username, password } = credentials.parse(input);
    const { rows } = await pool.query(
      "SELECT * FROM revamp_users WHERE username=$1",
      [username],
    );
    const user = rows[0];
    const stored =
      user?.password_hash || "0".repeat(32) + ":" + "0".repeat(128);
    const check = await passwordHash(password, stored.split(":")[0]);
    if (!user || !timingSafeEqual(Buffer.from(check), Buffer.from(stored)))
      throw Object.assign(new Error("Invalid username or password."), {
        status: 401,
      });
    return { id: user.id, username: user.username };
  }
  async function session(user) {
    const token = randomBytes(32).toString("base64url");
    await pool.query("DELETE FROM revamp_sessions WHERE expires_at < now()");
    await pool.query(
      "INSERT INTO revamp_sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [digest(token), user.id],
    );
    return token;
  }
  async function resolve(token) {
    if (!token || token.length > 200) return null;
    const { rows } = await pool.query(
      "SELECT u.id,u.username FROM revamp_sessions s JOIN revamp_users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now()",
      [digest(token)],
    );
    return rows[0] || null;
  }
  async function byId(id) {
    const { rows } = await pool.query(
      "SELECT id,username FROM revamp_users WHERE id=$1",
      [id],
    );
    return rows[0] || null;
  }
  async function unsubscribe(user) {
    await pool.query("DELETE FROM revamp_push WHERE user_id=$1", [user]);
  }
  async function notifyRecord(owner, job) {
    const user = await byId(owner);
    if (!user) return;
    await pool.query(
      "INSERT INTO revamp_messages(id,user_id,job_id,status,result) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        owner,
        job.id,
        job.status,
        job.result ? JSON.stringify(job.result) : null,
      ],
    );
    await pool.query(
      "DELETE FROM revamp_messages WHERE created_at<now()-interval '7 days'",
    );
    const { rows } = await pool.query(
      "SELECT subscription FROM revamp_push WHERE user_id=$1",
      [owner],
    );
    return rows[0]?.subscription;
  }
  return {
    init,
    signup,
    login,
    session,
    resolve,
    byId,
    notifyRecord,
    unsubscribe,
    async logout(token) {
      if (token)
        await pool.query("DELETE FROM revamp_sessions WHERE hash=$1", [
          digest(token),
        ]);
    },
    async subscribe(user, subscription) {
      await pool.query(
        "INSERT INTO revamp_push(user_id,subscription) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET subscription=$2",
        [user, JSON.stringify(subscription)],
      );
    },
    async messages(user) {
      return (
        await pool.query(
          "SELECT id,job_id,status,result,created_at FROM revamp_messages WHERE user_id=$1 AND created_at>now()-interval '7 days' ORDER BY created_at DESC LIMIT 30",
          [user],
        )
      ).rows;
    },
    async close() {
      await pool.end();
    },
  };
}
module.exports = { createAccounts, credentials };
