require("dotenv").config();
module.exports = {
  zooWork: {
    model: process.env.ZOOWORK_MODEL || "litellm/claude-haiku-5-5",
    timeoutMs: 180000,
  },
  veris: {
    apiBase: process.env.VERIS_API_BASE || "",
    sandboxKey: process.env.VERIS_SANDBOX_KEY || "",
  },
};
