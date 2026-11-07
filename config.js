require("dotenv").config();

const config = {
  veris: {
    apiBase: process.env.VERIS_API_BASE || "",
    sandboxKey: process.env.VERIS_SANDBOX_KEY || ""
  },
  zooWork: {
    agentTemplates: {
      inventoryMutationAgent: {
        name: "inventory-mutation-agent",
        role:
          "Simulate and validate inventory mutations in a Veris stateful sandbox before production impact.",
        goals: [
          "Detect compliance drift when quantity, SKU status, or sourcing metadata changes.",
          "Evaluate potential impact of mutations on policy checks and traceability."
        ],
        requiredInputs: ["productId", "mutationPayload", "sandboxId"]
      },
      supplierVerificationAgent: {
        name: "supplier-verification-agent",
        role:
          "Verify supplier records and compliance assertions against trusted evidence in sandboxed test flows.",
        goals: [
          "Validate supplier certification and risk indicators before approving sourcing changes.",
          "Flag non-compliant or incomplete supplier profiles for manual review."
        ],
        requiredInputs: ["supplierId", "verificationCriteria", "sandboxId"]
      }
    }
  }
};

module.exports = config;
