require("dotenv").config();
async function searchFashionMarket(keyword, options = {}) {
  if (
    typeof keyword !== "string" ||
    keyword.trim().length < 3 ||
    keyword.length > 160
  ) {
    throw Object.assign(
      new Error("Use a fashion product search between 3 and 160 characters."),
      { status: 400 },
    );
  }
  const apiKey = options.apiKey || process.env.ZOODATA_API_KEY;
  if (!apiKey)
    throw Object.assign(
      new Error(
        "ZooData requires a separate ZOODATA_API_KEY. Market enrichment is not configured.",
      ),
      { status: 503 },
    );
  const response = await (options.fetch || fetch)(
    "https://api.zoodata.ai/openapi/v2/products/search",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keyword: keyword.trim(), pageSize: 5 }),
    },
  );
  if (!response.ok)
    throw Object.assign(
      new Error(`ZooData search failed (HTTP ${response.status}).`),
      { status: 502 },
    );
  const result = await response.json();
  if (result.success !== true || !Array.isArray(result.data))
    throw new Error("ZooData returned an unexpected product-search response.");
  return {
    provider: "ZooData",
    keyword: keyword.trim(),
    retrievedAt: new Date().toISOString(),
    disclaimer: "Market listings are not supplier certification evidence.",
    products: result.data.slice(0, 5).map((p) => ({
      asin: p.asin,
      title: String(p.title || "").slice(0, 500),
      price: p.price,
      rating: p.rating,
      monthlySalesFloor: p.monthlySalesFloor,
      sourceUrl: /^[A-Z0-9]{10}$/.test(p.asin || "")
        ? `https://www.amazon.com/dp/${p.asin}`
        : null,
    })),
  };
}
module.exports = { searchFashionMarket };
