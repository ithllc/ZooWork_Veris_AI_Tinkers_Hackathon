const {
  createHmac,
  randomUUID,
  randomBytes,
  timingSafeEqual,
} = require("crypto");
const secret =
  process.env.ACCESS_TOKEN_SECRET || randomBytes(32).toString("hex");
function sign(value) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function issueToken(owner = randomUUID()) {
  const payload = Buffer.from(
    JSON.stringify({ sub: owner, exp: Date.now() + 86400000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function verifyToken(token) {
  if (typeof token !== "string" || token.length > 1000) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload)),
    actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url"));
    return data.exp > Date.now() && /^[a-f0-9-]{36}$/.test(data.sub)
      ? data.sub
      : null;
  } catch {
    return null;
  }
}
function authorize(req, res, next) {
  const owner = verifyToken(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  if (!owner)
    return res
      .status(401)
      .json({
        error:
          "Get a visitor access token from POST /api/access-token and send Authorization: Bearer <token>.",
      });
  req.owner = owner;
  next();
}
module.exports = { issueToken, verifyToken, authorize };
