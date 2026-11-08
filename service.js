const { randomUUID } = require("crypto");
const { runFashionOperations, auditInputSchema } = require("./agent");
const { searchFashionMarket } = require("./zooData");

function createAuditService(options = {}) {
  const jobs = new Map(),
    users = new Map();
  let active = 0,
    day = "",
    count = 0;
  function spend(owner) {
    const today = new Date().toISOString().slice(0, 10);
    if (day !== today) {
      day = today;
      count = 0;
      users.clear();
    }
    if (
      count >= Number(process.env.DEMO_DAILY_LIMIT || 30) ||
      (users.get(owner) || 0) >= 5
    ) {
      throw Object.assign(
        new Error(
          "Demo daily request limit reached. Try again tomorrow or run your own copy.",
        ),
        { status: 429 },
      );
    }
    count++;
    users.set(owner, (users.get(owner) || 0) + 1);
  }
  function read(owner, id) {
    const job = jobs.get(id);
    if (!job || job.owner !== owner || Date.now() - job.created > 3600000) {
      throw Object.assign(new Error("Audit not found or expired."), {
        status: 404,
      });
    }
    const { owner: _owner, created: _created, ...result } = job;
    return result;
  }
  function start(owner, input) {
    const batch = auditInputSchema.parse(
      Array.isArray(input) ? { items: input } : input,
    );
    if (!process.env.ZOOWORK_API_KEY && !options.run)
      throw Object.assign(new Error("ZooWork is not configured."), {
        status: 503,
      });
    if (active >= 2)
      throw Object.assign(
        new Error("Two audits are running. Please try again shortly."),
        { status: 429 },
      );
    for (const [id, job] of jobs)
      if (Date.now() - job.created > 3600000) jobs.delete(id);
    spend(owner);
    active++;
    const job = {
      id: randomUUID(),
      owner,
      created: Date.now(),
      status: "running",
      progress: "Starting ZooWork audit",
    };
    jobs.set(job.id, job);
    Promise.resolve()
      .then(() =>
        (options.run || runFashionOperations)(batch, {
          onProgress: (text) => {
            job.progress = text;
          },
        }),
      )
      .then(({ auditLog, markdownReport }) => {
        Object.assign(job, {
          status: "completed",
          progress: "Review complete",
          result: { ...auditLog, markdownReport },
        });
      })
      .catch((error) => {
        job.status = "failed";
        job.progress = "Review failed";
        job.error = error.status
          ? `Provider request failed (HTTP ${error.status}${error.type ? `, ${error.type}` : ""}). No simulated result was substituted.`
          : "The live review failed or returned invalid output. No simulated result was substituted.";
        console.error(
          JSON.stringify({
            jobId: job.id,
            message: "Audit failed",
            status: error.status,
            type: error.type,
          }),
        );
      })
      .finally(() => {
        active--;
        if (options.onComplete)
          Promise.resolve(options.onComplete(owner, job)).catch(() => {
            console.error(
              JSON.stringify({
                message: "Inbox persistence failed",
                jobId: job.id,
              }),
            );
          });
      });
    return read(owner, job.id);
  }
  async function search(owner, keyword) {
    spend(owner);
    return (options.search || searchFashionMarket)(keyword);
  }
  return { start, read, search };
}
module.exports = { createAuditService };
