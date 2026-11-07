const axios = require('axios');
const {
  initializeFashionSandbox,
  writeInventoryRow,
  readInventoryRow,
  setErrorInjection,
  simulateSupplierVerification,
  simulateMaterialCertificationCheck
} = require('./verisConnector');
const { runFashionOperations } = require('./agent');

jest.mock('axios');

describe('Veris connector and ZooWork agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VERIS_API_BASE = 'https://mock-veris.example.com';
    process.env.VERIS_SANDBOX_KEY = 'mock-key-123';
  });

  test('initializeFashionSandbox() successfully connects to the Veris stateful twin endpoint', async () => {
    axios.create.mockReturnValue({
      post: jest.fn().mockResolvedValue({
        data: { sandboxId: 'mock-sandbox-42' }
      })
    });

    const result = await initializeFashionSandbox();

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://mock-veris.example.com',
        timeout: 10000,
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-key-123',
          'Content-Type': 'application/json'
        })
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        sandboxId: 'mock-sandbox-42',
        twinType: 'fashion-dependency-twin',
        stateful: true
      })
    );
  });

  test('a valid garment SKU and sustainable material certification pass the compliance check and execute a database write', async () => {
    const sandbox = await initializeFashionSandbox();

    const writeResult = writeInventoryRow(sandbox.sandboxId, {
      sku: 'GARMENT-VALID-001',
      fabricType: 'Organic Cotton',
      carbonFootprintScore: 24,
      supplierId: 'SUP-ETH-901',
      quantity: 18,
      transactionType: 'restock'
    });

    const verification = await simulateSupplierVerification(sandbox.sandboxId, {
      supplierId: 'SUP-ETH-901',
      certType: 'ethical-compliance'
    });

    const certification = await simulateMaterialCertificationCheck(sandbox.sandboxId, {
      sku: 'GARMENT-VALID-001',
      reportedComposition: 'organic-cotton-100%'
    });

    const persistedRow = readInventoryRow(sandbox.sandboxId, 'GARMENT-VALID-001');

    expect(writeResult.sku).toBe('GARMENT-VALID-001');
    expect(verification.verified).toBe(true);
    expect(certification.certified).toBe(true);
    expect(persistedRow.quantity).toBe(18);
    expect(persistedRow.transactionType).toBe('restock');
  });

  test('an invalid supplier certificate or timeout triggers the Veris error injection fallback routine safely', async () => {
    const sandbox = await initializeFashionSandbox();

    setErrorInjection(sandbox.sandboxId, {
      supplierTimeout: true,
      invalidMaterialClaim: true
    });

    await expect(
      simulateSupplierVerification(sandbox.sandboxId, { supplierId: 'SUP-ETH-999' })
    ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

    await expect(
      simulateMaterialCertificationCheck(sandbox.sandboxId, {
        sku: 'GARMENT-BAD-001',
        reportedComposition: 'synthetic-mix-unknown'
      })
    ).rejects.toMatchObject({ code: 'INVALID_MATERIAL_CLAIM' });

    const state = setErrorInjection(sandbox.sandboxId, {
      supplierTimeout: false,
      invalidMaterialClaim: false
    });

    expect(state).toEqual({
      supplierTimeout: false,
      invalidMaterialClaim: false
    });
  });

  test('runFashionOperations() performs a complete supplier verification and restock cycle', async () => {
    const { auditLog, markdownReport } = await runFashionOperations([
      {
        sku: 'GARMENT-AUDIT-001',
        fabricType: 'Organic Cotton',
        carbonFootprintScore: 24,
        supplierId: 'SUP-ETH-901',
        restockQty: 18
      },
      {
        sku: 'GARMENT-AUDIT-002',
        fabricType: 'Recycled Polyester',
        carbonFootprintScore: 42,
        supplierId: 'SUP-ETH-902',
        restockQty: 12
      }
    ]);

    expect(auditLog.metrics.totalProcessed).toBe(2);
    expect(auditLog.metrics.suppliersVerified).toBe(2);
    expect(auditLog.metrics.restocksExecuted).toBe(2);
    expect(markdownReport).toContain('RevampAI Compliance Summary');
    expect(markdownReport).toContain('GARMENT-AUDIT-001');
  });
});
