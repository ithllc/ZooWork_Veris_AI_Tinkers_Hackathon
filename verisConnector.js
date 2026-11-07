const axios = require("axios");
const { randomUUID } = require("crypto");
const config = require("./config");

const sandboxState = new Map();

function buildClient() {
  return axios.create({
    baseURL: config.veris.apiBase,
    timeout: 10_000,
    headers: {
      Authorization: `Bearer ${config.veris.sandboxKey}`,
      "Content-Type": "application/json"
    }
  });
}

async function initializeFashionSandbox() {
  const fallbackSandboxId = `fashion-sbx-${randomUUID()}`;
  const hasRemoteConfig = Boolean(config.veris.apiBase && config.veris.sandboxKey);

  let sandboxId = fallbackSandboxId;
  let mode = "local-simulated-twin";

  if (hasRemoteConfig) {
    const client = buildClient();
    try {
      const response = await client.post("/sandboxes", {
        type: "fashion-dependency-twin",
        services: ["inventory-tracking-api", "sustainable-material-certification-api"],
        stateful: true
      });

      sandboxId = response?.data?.sandboxId || fallbackSandboxId;
      mode = "remote-veris-sandbox";
    } catch (error) {
      if (error.response && error.response.status < 500) {
        throw new Error(
          `Veris sandbox initialization failed: ${error.response.status} ${error.response.statusText}`
        );
      }
      // For transient/network errors, continue with a local twin to keep test flows stateful.
    }
  }

  sandboxState.set(sandboxId, {
    inventory: new Map(),
    errorInjection: {
      supplierTimeout: false,
      invalidMaterialClaim: false
    }
  });

  return {
    sandboxId,
    mode,
    twinType: "fashion-dependency-twin",
    services: ["inventory-tracking-api", "sustainable-material-certification-api"],
    stateful: true
  };
}

function getSandbox(sandboxId) {
  const sandbox = sandboxState.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}. Initialize a sandbox first.`);
  }
  return sandbox;
}

function writeInventoryRow(sandboxId, row) {
  if (!row || typeof row !== "object") {
    throw new Error("writeInventoryRow requires a row object.");
  }

  if (!row.sku || typeof row.sku !== "string") {
    throw new Error("writeInventoryRow requires row.sku as a non-empty string.");
  }

  const sandbox = getSandbox(sandboxId);
  const normalizedRow = {
    ...row,
    updatedAt: new Date().toISOString()
  };

  sandbox.inventory.set(row.sku, normalizedRow);
  return normalizedRow;
}

function readInventoryRow(sandboxId, sku) {
  if (!sku || typeof sku !== "string") {
    throw new Error("readInventoryRow requires sku as a non-empty string.");
  }

  const sandbox = getSandbox(sandboxId);
  return sandbox.inventory.get(sku) || null;
}

function setErrorInjection(sandboxId, options = {}) {
  const sandbox = getSandbox(sandboxId);

  if (typeof options.supplierTimeout === "boolean") {
    sandbox.errorInjection.supplierTimeout = options.supplierTimeout;
  }

  if (typeof options.invalidMaterialClaim === "boolean") {
    sandbox.errorInjection.invalidMaterialClaim = options.invalidMaterialClaim;
  }

  return { ...sandbox.errorInjection };
}

async function simulateSupplierVerification(sandboxId, supplierPayload = {}) {
  const sandbox = getSandbox(sandboxId);

  if (sandbox.errorInjection.supplierTimeout) {
    const timeoutError = new Error("Supplier API timeout injected for resilience testing.");
    timeoutError.code = "ETIMEDOUT";
    throw timeoutError;
  }

  return {
    supplierId: supplierPayload.supplierId || null,
    verified: true,
    checkedAt: new Date().toISOString()
  };
}

async function simulateMaterialCertificationCheck(sandboxId, materialPayload = {}) {
  const sandbox = getSandbox(sandboxId);

  if (sandbox.errorInjection.invalidMaterialClaim) {
    const invalidClaimError = new Error(
      "Invalid material composition claim injected for compliance testing."
    );
    invalidClaimError.code = "INVALID_MATERIAL_CLAIM";
    invalidClaimError.details = {
      reportedComposition: materialPayload.reportedComposition || null
    };
    throw invalidClaimError;
  }

  return {
    sku: materialPayload.sku || null,
    certified: true,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  initializeFashionSandbox,
  writeInventoryRow,
  readInventoryRow,
  setErrorInjection,
  simulateSupplierVerification,
  simulateMaterialCertificationCheck
};
