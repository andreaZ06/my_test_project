const storeData = require("../backend/store");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const storageMode = storeData.getStorageMode();
    const supabaseConfigured = storeData.isSupabaseConfigured();
    const store = await storeData.readStoreAsync();
    res.status(200).json({
      ok: true,
      storageMode,
      supabaseConfigured,
      updatedAt: store.updatedAt,
      skuCount: Array.isArray(store.skus) ? store.skus.length : 0,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      storageMode: storeData.getStorageMode(),
      supabaseConfigured: storeData.isSupabaseConfigured(),
      error: error.message || "Failed to load health status",
    });
  }
};
