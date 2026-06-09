const { realtimeSync } = require("../../backend/jd-realtime");
const storeData = require("../../backend/store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const store = await storeData.readStoreAsync();
    const skus = Array.isArray(store.skus) && store.skus.length ? store.skus : storeData.defaultSkus;
    const result = await realtimeSync({
      skus,
      pagesPerRating: Number(body.pagesPerRating || 1),
      pageSize: Number(body.pageSize || 10),
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Realtime sync failed" });
  }
};
