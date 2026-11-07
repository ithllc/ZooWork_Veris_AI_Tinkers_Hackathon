const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  initializeFashionSandbox,
  writeInventoryRow,
  readInventoryRow,
  simulateSupplierVerification,
  setErrorInjection
} = require("./verisConnector");

function normalizeMetadata(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Each metadata record must be an object.");
  }

  const fabricType = String(item.fabricType || "").trim();
  const supplierId = String(item.supplierId || "").trim();
  const sku = String(item.sku || "").trim() || `SKU-${randomUUID().slice(0, 8).toUpperCase()}`;

  if (!fabricType) {
    throw new Error("fabricType is required.");
  }
  if (!supplierId) {
    throw new Error("supplierId is required.");
  }
  if (item.carbonFootprintScore === undefined || item.carbonFootprintScore === null) {
    throw new Error("carbonFootprintScore is required.");
  }

  const carbonFootprintScore = Number(item.carbonFootprintScore);
  if (Number.isNaN(carbonFootprintScore)) {
    throw new Error("carbonFootprintScore must be numeric.");
  }

  const restockQty = Number(item.restockQty ?? 0);
  if (Number.isNaN(restockQty) || restockQty <= 0) {
    throw new Error("restockQty must be a positive number.");
  }

  return {
    sku,
    fabricType,
    carbonFootprintScore,
    supplierId,
    restockQty
  };
}

function toManagerSummaryMarkdown(auditLog) {
  const rows = auditLog.operations.map((op) => {
    const verification = op.supplierVerification.verified ? "✅ Verified" : "❌ Not verified";
    const restockStatus = op.restock.executed ? `✅ +${op.restock.quantity}` : "—";
    const notes = op.error ? op.error.code || op.error.message : "Operational checks passed";

    return `| ${op.sku} | ${op.fabricType} | ${op.carbonFootprintScore} | ${op.supplierId} | ${verification} | ${restockStatus} | ${notes} |`;
  });

  return [
    "# RevampAI Compliance Summary",
    "",
    `**Run ID:** \`${auditLog.runId}\``,
    `**Sandbox ID:** \`${auditLog.sandboxId}\``,
    `**Sandbox Mode:** ${auditLog.sandboxMode}`,
    `**Timestamp:** ${auditLog.completedAt}`,
    "",
    "## Executive Snapshot",
    "",
    `- Records processed: **${auditLog.metrics.totalProcessed}**`,
    `- Supplier verified: **${auditLog.metrics.suppliersVerified}**`,
    `- Restocks executed: **${auditLog.metrics.restocksExecuted}**`,
    `- Errors observed: **${auditLog.metrics.errors}**`,
    "",
    "## Item-Level Compliance Results",
    "",
    "| SKU | Fabric | Carbon Score | Supplier ID | Supplier Check | Restock | Notes |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...rows
  ].join("\n");
}

async function runFashionOperations(rawMetadataBatch, options = {}) {
  if (!Array.isArray(rawMetadataBatch) || rawMetadataBatch.length === 0) {
    throw new Error("runFashionOperations requires a non-empty metadata array.");
  }

  const runId = `run-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const sandbox = await initializeFashionSandbox();

  if (options.errorInjection) {
    setErrorInjection(sandbox.sandboxId, options.errorInjection);
  }

  const operations = [];
  const metrics = {
    totalProcessed: 0,
    suppliersVerified: 0,
    restocksExecuted: 0,
    errors: 0
  };

  for (const rawItem of rawMetadataBatch) {
    metrics.totalProcessed += 1;

    const op = {
      stepId: randomUUID(),
      processedAt: new Date().toISOString(),
      sku: null,
      fabricType: null,
      carbonFootprintScore: null,
      supplierId: null,
      supplierVerification: { verified: false },
      restock: { executed: false, quantity: 0 },
      error: null
    };

    try {
      const item = normalizeMetadata(rawItem);
      op.sku = item.sku;
      op.fabricType = item.fabricType;
      op.carbonFootprintScore = item.carbonFootprintScore;
      op.supplierId = item.supplierId;

      const verification = await simulateSupplierVerification(sandbox.sandboxId, {
        supplierId: item.supplierId,
        certType: "ethical-compliance"
      });

      op.supplierVerification = verification;
      if (verification.verified) {
        metrics.suppliersVerified += 1;

        writeInventoryRow(sandbox.sandboxId, {
          sku: item.sku,
          fabricType: item.fabricType,
          carbonFootprintScore: item.carbonFootprintScore,
          supplierId: item.supplierId,
          quantity: item.restockQty,
          transactionType: "restock"
        });

        const persisted = readInventoryRow(sandbox.sandboxId, item.sku);
        op.restock = {
          executed: true,
          quantity: item.restockQty,
          persistedRow: persisted
        };
        metrics.restocksExecuted += 1;
      }
    } catch (error) {
      metrics.errors += 1;
      op.error = {
        message: error.message,
        code: error.code || null
      };
    }

    operations.push(op);
  }

  const completedAt = new Date().toISOString();
  const auditLog = {
    runId,
    startedAt,
    completedAt,
    sandboxId: sandbox.sandboxId,
    sandboxMode: sandbox.mode,
    sandboxType: sandbox.twinType,
    metrics,
    operations
  };

  const markdownReport = toManagerSummaryMarkdown(auditLog);
  return { auditLog, markdownReport };
}

function persistOutputs({ auditLog, markdownReport }, outputDir = ".") {
  const baseName = `fashion-audit-${auditLog.runId}`;
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const mdPath = path.join(outputDir, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(auditLog, null, 2), "utf8");
  fs.writeFileSync(mdPath, markdownReport, "utf8");

  return { jsonPath, mdPath };
}

async function runFromCli() {
  const sampleBatch = [
    {
      sku: "GARMENT-001",
      fabricType: "Organic Cotton",
      carbonFootprintScore: 32,
      supplierId: "SUP-ETH-901",
      restockQty: 24
    },
    {
      sku: "GARMENT-002",
      fabricType: "Recycled Polyester",
      carbonFootprintScore: 47,
      supplierId: "SUP-ETH-902",
      restockQty: 12
    }
  ];

  const outputs = await runFashionOperations(sampleBatch);
  const paths = persistOutputs(outputs);

  console.log(JSON.stringify(outputs.auditLog, null, 2));
  console.log("\n--- MARKDOWN REPORT ---\n");
  console.log(outputs.markdownReport);
  console.log("\n--- FILE OUTPUTS ---\n");
  console.log(JSON.stringify(paths, null, 2));
}

if (require.main === module) {
  runFromCli().catch((error) => {
    console.error("Agent run failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  runFashionOperations,
  toManagerSummaryMarkdown,
  persistOutputs
};
