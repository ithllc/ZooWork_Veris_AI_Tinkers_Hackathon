const express = require('express');
const path = require('path');
const { runFashionOperations } = require('./agent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const status = {
      ok: true,
      service: 'RevampAI ZooWork Agent',
      sandboxMode: 'local-simulated-twin',
      timestamp: new Date().toISOString(),
      version: '0.1.0'
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/run-audit', async (req, res) => {
  try {
    const payload = Array.isArray(req.body) && req.body.length
      ? req.body
      : [
          {
            sku: 'GARMENT-101',
            fabricType: 'Organic Cotton',
            carbonFootprintScore: 22,
            supplierId: 'SUP-ETH-901',
            restockQty: 18
          },
          {
            sku: 'GARMENT-102',
            fabricType: 'Recycled Polyester',
            carbonFootprintScore: 41,
            supplierId: 'SUP-ETH-902',
            restockQty: 15
          },
          {
            sku: 'GARMENT-103',
            fabricType: 'Tencel',
            carbonFootprintScore: 28,
            supplierId: 'SUP-ETH-903',
            restockQty: 25
          }
        ];

    const { auditLog, markdownReport } = await runFashionOperations(payload);

    res.json({
      ok: true,
      runId: auditLog.runId,
      sandboxId: auditLog.sandboxId,
      sandboxMode: auditLog.sandboxMode,
      metrics: auditLog.metrics,
      markdownReport,
      operations: auditLog.operations
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Audit batch failed',
      error: error.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RevampAI server running at http://localhost:${PORT}`);
});
